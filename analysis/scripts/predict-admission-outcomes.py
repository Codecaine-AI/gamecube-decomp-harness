#!/usr/bin/env python3
"""Admission-outcome predictor experiment for the Melee decomp orchestrator.

Builds a per-(epoch, target) dataset from the orchestrator SQLite state for the
clean full-board passes (epochs 26/28/30/32), trains calibrated P(win) and
P(match) heads (L2 logistic regression and HistGradientBoosting), evaluates
with leave-one-epoch-out cross-validation against the existing priority order
and simpler baselines, ablates static vs history features, and finally scores
the active epoch-34 board with a model trained on all four clean passes.

Read-only with respect to the DB (opened via sqlite3 URI mode=ro). Outputs go
to analysis/reports/ only.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "games/melee/state/orchestrator.sqlite"
DEFAULT_RUN = "53d5b342-c066-48fc-aa49-dd78b69dc2ac"
DEFAULT_REPORT_DIR = ROOT / "analysis/reports"
REPORT_STAMP = "2026-07-13"

SEED = 20260713
CLEAN_EPOCHS = [26, 28, 30, 32]
HISTORY_EPOCHS = [25, 26, 27, 28, 30, 32]  # ordered; 25/27 partial, history only
SCORE_EPOCH = 34
EPS = 1e-9

# Sanity counts the dataset must reconcile against before modeling.
SANITY_POOLED_ROWS = 2089
SANITY_PER_EPOCH = {  # ordinal -> (exact, gate_tail, improved)
    26: (43, 42, 283),
    28: (29, 27, 177),
    30: (23, 19, 186),
    32: (47, 12, 218),
}
SANITY_E32_COLD_NOWINS = 164

REASON_PATTERNS = {
    "rank_board": r"board rank (-?[\d.]+)",
    "rank_info_priority": r"information priority (-?[\d.]+)",
    "rank_high_acc_bonus": r"high-accuracy bonus (-?[\d.]+)",
    "rank_acc_readiness_bonus": r"accuracy/readiness bonus (-?[\d.]+)",
    "rank_closeness_fallback": r"closeness fallback (-?[\d.]+)",
    "rank_opseq_rerank": r"opseq rerank (-?[\d.]+)",
    "sig_closeness": r"signals:.*?\bcloseness (-?[\d.]+)",
    "sig_information_gain": r"information gain (-?[\d.]+)",
    "sig_unlock": r"\bunlock (-?[\d.]+)",
    "sig_readiness": r"\breadiness (-?[\d.]+)",
    "sig_context": r"\bcontext (-?[\d.]+)",
    "opseq_analog_count": r"opseq (\d+) analogs",
    "opseq_best_analog": r"analogs best (-?[\d.]+)",
    "opseq_matched_best": r"matched best (-?[\d.]+)",
    "sig_risk": r"\brisk (-?[\d.]+)",
}
REASON_COMPILED = {key: re.compile(pattern) for key, pattern in REASON_PATTERNS.items()}

STATIC_NUMERIC = [
    "baseline_score",
    "gap_to_exact",
    "size",
    "log_size",
    "priority",
    "admission_index",
    *REASON_PATTERNS.keys(),
]
STATIC_CATEGORICAL = ["top_dir"]
HISTORY_NUMERIC = [
    "n_prior_attempts",
    "n_prior_wins",
    "n_prior_improves",
    "n_prior_gate_tails",
    "n_prior_cold_nowins",
    "best_prior_gain",
    "prior_baseline_delta",
    "consecutive_nowin_streak",
    "has_history",
]
HISTORY_CATEGORICAL = ["last_outcome"]

FEATURE_SETS = {
    "full": (STATIC_NUMERIC + HISTORY_NUMERIC, STATIC_CATEGORICAL + HISTORY_CATEGORICAL),
    "static_only": (STATIC_NUMERIC, STATIC_CATEGORICAL),
    "history_only": (HISTORY_NUMERIC, HISTORY_CATEGORICAL),
}

CAPTURE_FRACTIONS = [0.10, 0.20, 0.30, 0.40, 0.50]
CAPTURE_QUANTILES = [0.90, 0.95]


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return None if not np.isfinite(value) else float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    if isinstance(value, float):
        return None if not math.isfinite(value) else value
    return value


def json_dumps(value: Any) -> str:
    return json.dumps(to_jsonable(value), indent=2, sort_keys=True)


def open_db_readonly(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


# ---------------------------------------------------------------------------
# Raw extraction
# ---------------------------------------------------------------------------


@dataclass
class TargetOutcome:
    """Outcome of one (epoch, target_key) attempt, used for labels and history."""

    ordinal: int
    target_key: str
    baseline_score: float
    best_score: float | None = None
    exact: bool = False
    gate_tail: bool = False
    cold_stop: bool = False
    attempted: bool = False

    @property
    def match(self) -> bool:
        return self.exact or self.gate_tail

    @property
    def improved(self) -> bool:
        return (
            not self.match
            and self.best_score is not None
            and self.best_score > self.baseline_score + EPS
        )

    @property
    def win(self) -> bool:
        return self.match or self.improved

    @property
    def outcome_label(self) -> str:
        if self.exact:
            return "exact"
        if self.gate_tail:
            return "gate_tail"
        if self.improved:
            return "improved"
        if self.cold_stop:
            return "cold_nowin"
        return "nowin"

    @property
    def gain(self) -> float | None:
        if self.best_score is None:
            return None
        return self.best_score - self.baseline_score


def load_epoch_ids(conn: sqlite3.Connection, run_id: str) -> dict[int, str]:
    rows = conn.execute(
        "SELECT id, ordinal FROM epochs WHERE run_id = ? ORDER BY ordinal",
        (run_id,),
    ).fetchall()
    return {row["ordinal"]: row["id"] for row in rows}


def load_epoch_targets(conn: sqlite3.Connection, epoch_id: str) -> pd.DataFrame:
    rows = conn.execute(
        """
        SELECT id, target_key, unit, symbol, source_path, size, baseline_score,
               priority, reason, admission_index, status
        FROM epoch_targets WHERE epoch_id = ?
        ORDER BY admission_index
        """,
        (epoch_id,),
    ).fetchall()
    return pd.DataFrame([dict(row) for row in rows])


def load_epoch_outcomes(
    conn: sqlite3.Connection, ordinal: int, epoch_id: str
) -> dict[str, TargetOutcome]:
    """Aggregate worker_state + worker_checkpoints into one outcome per target."""
    targets = load_epoch_targets(conn, epoch_id)
    by_target_id: dict[str, TargetOutcome] = {}
    key_of: dict[str, str] = {}
    for row in targets.itertuples(index=False):
        outcome = TargetOutcome(
            ordinal=ordinal, target_key=row.target_key, baseline_score=row.baseline_score
        )
        by_target_id[row.id] = outcome
        key_of[row.id] = row.target_key

    for row in conn.execute(
        "SELECT epoch_target_id, exact, best_score, summary_json FROM worker_state"
        " WHERE epoch_id = ?",
        (epoch_id,),
    ):
        outcome = by_target_id.get(row["epoch_target_id"])
        if outcome is None:
            continue
        outcome.attempted = True
        if row["exact"]:
            outcome.exact = True
        if row["best_score"] is not None:
            if outcome.best_score is None or row["best_score"] > outcome.best_score:
                outcome.best_score = row["best_score"]
        if row["summary_json"]:
            try:
                summary = json.loads(row["summary_json"])
            except (TypeError, ValueError):
                summary = None
            if isinstance(summary, dict):
                continuation = summary.get("continuation_attempts") or {}
                if continuation.get("stop_reason") == "cold_attempt_budget_exhausted":
                    outcome.cold_stop = True

    for row in conn.execute(
        "SELECT epoch_target_id, exact_match, hard_gates_passed FROM worker_checkpoints"
        " WHERE epoch_id = ?",
        (epoch_id,),
    ):
        if row["exact_match"] == 1 and row["hard_gates_passed"] == 0:
            outcome = by_target_id.get(row["epoch_target_id"])
            if outcome is not None and not outcome.exact:
                outcome.gate_tail = True

    return {key_of[target_id]: outcome for target_id, outcome in by_target_id.items()}


# ---------------------------------------------------------------------------
# Feature construction
# ---------------------------------------------------------------------------


def parse_reason(reason: str | None) -> dict[str, float]:
    parsed: dict[str, float] = {}
    text = reason or ""
    for key, pattern in REASON_COMPILED.items():
        found = pattern.search(text)
        parsed[key] = float(found.group(1)) if found else np.nan
    return parsed


def top_dir_of(source_path: str) -> str:
    parts = Path(source_path).parts
    if parts and parts[0] == "src":
        parts = parts[1:]
    if len(parts) >= 3:
        return "/".join(parts[:2])
    if len(parts) >= 2:
        return parts[0]
    return "unknown"


def history_features(
    target_key: str,
    ordinal: int,
    baseline_score: float,
    outcomes_by_epoch: dict[int, dict[str, TargetOutcome]],
    history_ordinals: list[int] | None = None,
) -> dict[str, Any]:
    pool = HISTORY_EPOCHS if history_ordinals is None else history_ordinals
    prior_ordinals = [o for o in pool if o < ordinal]
    priors = [
        outcomes_by_epoch[o][target_key]
        for o in prior_ordinals
        if target_key in outcomes_by_epoch[o]
    ]
    features: dict[str, Any] = {
        "n_prior_attempts": len(priors),
        "n_prior_wins": sum(1 for p in priors if p.win),
        "n_prior_improves": sum(1 for p in priors if p.improved),
        "n_prior_gate_tails": sum(1 for p in priors if p.gate_tail),
        "n_prior_cold_nowins": sum(1 for p in priors if p.cold_stop and not p.win),
        "best_prior_gain": np.nan,
        "prior_baseline_delta": np.nan,
        "consecutive_nowin_streak": 0,
        "has_history": int(bool(priors)),
        "last_outcome": "none",
    }
    if not priors:
        return features
    gains = [p.gain for p in priors if p.gain is not None]
    if gains:
        features["best_prior_gain"] = max(gains)
    last = priors[-1]
    features["last_outcome"] = last.outcome_label
    features["prior_baseline_delta"] = baseline_score - last.baseline_score
    streak = 0
    for prior in reversed(priors):
        if prior.win:
            break
        streak += 1
    features["consecutive_nowin_streak"] = streak
    return features


def build_rows(
    conn: sqlite3.Connection,
    ordinal: int,
    epoch_id: str,
    outcomes_by_epoch: dict[int, dict[str, TargetOutcome]],
    with_labels: bool,
) -> pd.DataFrame:
    targets = load_epoch_targets(conn, epoch_id)
    outcomes = outcomes_by_epoch.get(ordinal, {})
    rows: list[dict[str, Any]] = []
    for row in targets.itertuples(index=False):
        record: dict[str, Any] = {
            "epoch": ordinal,
            "target_key": row.target_key,
            "unit": row.unit,
            "symbol": row.symbol,
            "source_path": row.source_path,
            "baseline_score": row.baseline_score,
            "gap_to_exact": 100.0 - row.baseline_score,
            "size": row.size,
            "log_size": math.log(max(row.size, 1)),
            "priority": row.priority,
            "admission_index": row.admission_index,
            "top_dir": top_dir_of(row.source_path),
        }
        record.update(parse_reason(row.reason))
        record.update(
            history_features(row.target_key, ordinal, row.baseline_score, outcomes_by_epoch)
        )
        if with_labels:
            outcome = outcomes[row.target_key]
            record["label_exact"] = int(outcome.exact)
            record["label_gate_tail"] = int(outcome.gate_tail)
            record["label_improved"] = int(outcome.improved)
            record["label_match"] = int(outcome.match)
            record["label_win"] = int(outcome.win)
            record["label_cold_nowin"] = int(outcome.cold_stop and not outcome.win)
        rows.append(record)
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Sanity reconciliation
# ---------------------------------------------------------------------------


def reconcile_dataset(
    dataset: pd.DataFrame, outcomes_by_epoch: dict[int, dict[str, TargetOutcome]]
) -> dict[str, Any]:
    problems: list[str] = []
    report: dict[str, Any] = {"pooled_rows": int(len(dataset))}
    if len(dataset) != SANITY_POOLED_ROWS:
        problems.append(f"pooled rows {len(dataset)} != {SANITY_POOLED_ROWS}")
    per_epoch: dict[str, Any] = {}
    for ordinal, expected in SANITY_PER_EPOCH.items():
        sub = dataset[dataset["epoch"] == ordinal]
        got = (
            int(sub["label_exact"].sum()),
            int(sub["label_gate_tail"].sum()),
            int(sub["label_improved"].sum()),
        )
        per_epoch[str(ordinal)] = {
            "exact": got[0],
            "gate_tail": got[1],
            "improved": got[2],
            "rows": int(len(sub)),
            "expected": list(expected),
        }
        if got != expected:
            problems.append(f"epoch {ordinal} labels {got} != expected {expected}")
    report["per_epoch"] = per_epoch
    cold32 = int(dataset[dataset["epoch"] == 32]["label_cold_nowin"].sum())
    report["epoch32_cold_nowins"] = cold32
    if cold32 != SANITY_E32_COLD_NOWINS:
        problems.append(f"epoch 32 cold no-wins {cold32} != {SANITY_E32_COLD_NOWINS}")

    # Behavioral check: transition rates between consecutive clean passes.
    transitions = {"improved": [0, 0], "cold_nowin": [0, 0]}
    for prev_ord, next_ord in zip(CLEAN_EPOCHS[:-1], CLEAN_EPOCHS[1:]):
        prev_outcomes = outcomes_by_epoch[prev_ord]
        next_outcomes = outcomes_by_epoch[next_ord]
        for key, outcome in prev_outcomes.items():
            follow = next_outcomes.get(key)
            if follow is None:
                continue
            if outcome.improved:
                transitions["improved"][0] += int(follow.win)
                transitions["improved"][1] += 1
            elif outcome.cold_stop and not outcome.win:
                transitions["cold_nowin"][0] += int(follow.win)
                transitions["cold_nowin"][1] += 1
    report["p_win_next_given_improved"] = (
        transitions["improved"][0] / transitions["improved"][1]
        if transitions["improved"][1]
        else None
    )
    report["p_win_next_given_cold_nowin"] = (
        transitions["cold_nowin"][0] / transitions["cold_nowin"][1]
        if transitions["cold_nowin"][1]
        else None
    )
    report["problems"] = problems
    return report


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


def make_model(family: str, numeric: list[str], categorical: list[str]) -> Pipeline:
    if family == "logreg":
        transformer = ColumnTransformer(
            [
                (
                    "num",
                    Pipeline(
                        [
                            ("impute", SimpleImputer(strategy="median")),
                            ("scale", StandardScaler()),
                        ]
                    ),
                    numeric,
                ),
                (
                    "cat",
                    OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                    categorical,
                ),
            ]
        )
        estimator = LogisticRegression(
            penalty="l2", C=1.0, max_iter=4000, random_state=SEED
        )
        method = "sigmoid"
    elif family == "hgb":
        transformer = ColumnTransformer(
            [
                ("num", "passthrough", numeric),
                (
                    "cat",
                    OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                    categorical,
                ),
            ]
        )
        estimator = HistGradientBoostingClassifier(
            max_depth=4,
            learning_rate=0.08,
            max_iter=300,
            l2_regularization=1.0,
            min_samples_leaf=25,
            random_state=SEED,
        )
        method = "isotonic"
    else:
        raise ValueError(f"unknown model family: {family}")
    calibrated = CalibratedClassifierCV(
        estimator=estimator,
        method=method,
        cv=StratifiedKFold(n_splits=3, shuffle=True, random_state=SEED),
    )
    return Pipeline([("features", transformer), ("model", calibrated)])


def fit_predict(
    family: str,
    feature_set: str,
    train: pd.DataFrame,
    test: pd.DataFrame,
    label: str,
) -> np.ndarray:
    numeric, categorical = FEATURE_SETS[feature_set]
    pipeline = make_model(family, numeric, categorical)
    pipeline.fit(train[numeric + categorical], train[label].to_numpy())
    return pipeline.predict_proba(test[numeric + categorical])[:, 1]


# ---------------------------------------------------------------------------
# Ranking metrics
# ---------------------------------------------------------------------------


def capture_stats(scores: np.ndarray, labels: np.ndarray) -> dict[str, Any]:
    """Capture curve + N* for one epoch under one ranking score (desc)."""
    order = np.argsort(-scores, kind="stable")
    ranked_labels = labels[order]
    total_wins = int(ranked_labels.sum())
    total = len(ranked_labels)
    cumulative = np.cumsum(ranked_labels)
    stats: dict[str, Any] = {"total": total, "total_wins": total_wins}
    captures = {}
    for fraction in CAPTURE_FRACTIONS:
        n = max(1, math.ceil(fraction * total))
        captures[f"{int(fraction * 100)}pct"] = (
            float(cumulative[n - 1] / total_wins) if total_wins else None
        )
    stats["capture_at_fraction"] = captures
    n_star = {}
    for quantile in CAPTURE_QUANTILES:
        if total_wins == 0:
            n_star[f"{int(quantile * 100)}"] = None
            continue
        needed = quantile * total_wins - EPS
        n_required = int(np.searchsorted(cumulative, needed) + 1)
        n_star[f"{int(quantile * 100)}"] = {
            "count": n_required,
            "fraction": n_required / total,
            "score_threshold": float(scores[order][n_required - 1]),
        }
    stats["n_star"] = n_star
    return stats


def baseline_scores(frame: pd.DataFrame, method: str) -> np.ndarray:
    if method == "priority":
        return frame["priority"].to_numpy(dtype=float)
    if method == "baseline_score":
        return frame["baseline_score"].to_numpy(dtype=float)
    if method == "naive_history":
        # Previously-winning targets first (n_prior_wins desc, best_prior_gain
        # desc), then the rest in existing priority order.
        wins = frame["n_prior_wins"].to_numpy(dtype=float)
        gain = np.nan_to_num(frame["best_prior_gain"].to_numpy(dtype=float), nan=-1e6)
        priority = frame["priority"].to_numpy(dtype=float)
        has_win = (wins > 0).astype(float)
        return has_win * 1e12 + wins * 1e9 + has_win * gain * 1e3 + (1 - has_win) * (
            priority / 1e3
        )
    raise ValueError(f"unknown baseline method: {method}")


def safe_auc(labels: np.ndarray, scores: np.ndarray) -> dict[str, float | None]:
    if len(np.unique(labels)) < 2:
        return {"roc_auc": None, "pr_auc": None}
    return {
        "roc_auc": float(roc_auc_score(labels, scores)),
        "pr_auc": float(average_precision_score(labels, scores)),
    }


# ---------------------------------------------------------------------------
# Experiment stages
# ---------------------------------------------------------------------------


@dataclass
class LoeoResult:
    family: str
    feature_set: str
    label: str
    fold_metrics: dict[int, dict[str, Any]] = field(default_factory=dict)
    oof_scores: dict[int, np.ndarray] = field(default_factory=dict)
    pooled: dict[str, Any] = field(default_factory=dict)


def run_loeo(
    dataset: pd.DataFrame, family: str, feature_set: str, label: str
) -> LoeoResult:
    result = LoeoResult(family=family, feature_set=feature_set, label=label)
    pooled_scores: list[np.ndarray] = []
    pooled_labels: list[np.ndarray] = []
    for held_out in CLEAN_EPOCHS:
        train = dataset[dataset["epoch"] != held_out]
        test = dataset[dataset["epoch"] == held_out]
        scores = fit_predict(family, feature_set, train, test, label)
        labels = test[label].to_numpy()
        result.oof_scores[held_out] = scores
        result.fold_metrics[held_out] = {
            **safe_auc(labels, scores),
            "capture": capture_stats(scores, labels),
        }
        pooled_scores.append(scores)
        pooled_labels.append(labels)
    all_scores = np.concatenate(pooled_scores)
    all_labels = np.concatenate(pooled_labels)
    result.pooled = {
        **safe_auc(all_labels, all_scores),
        "mean_fold_roc_auc": float(
            np.mean([result.fold_metrics[e]["roc_auc"] for e in CLEAN_EPOCHS])
        ),
        "base_rate": float(all_labels.mean()),
    }
    return result


def run_baseline_eval(dataset: pd.DataFrame, label: str) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for method in ("priority", "baseline_score", "naive_history"):
        per_epoch: dict[str, Any] = {}
        pooled_scores: list[np.ndarray] = []
        pooled_labels: list[np.ndarray] = []
        for ordinal in CLEAN_EPOCHS:
            sub = dataset[dataset["epoch"] == ordinal]
            scores = baseline_scores(sub, method)
            labels = sub[label].to_numpy()
            per_epoch[str(ordinal)] = {
                **safe_auc(labels, scores),
                "capture": capture_stats(scores, labels),
            }
            pooled_scores.append(scores)
            pooled_labels.append(labels)
        output[method] = {
            "per_epoch": per_epoch,
            "pooled_mean_roc_auc": float(
                np.mean([per_epoch[str(e)]["roc_auc"] for e in CLEAN_EPOCHS])
            ),
        }
    return output


def score_epoch_34(
    dataset: pd.DataFrame,
    epoch34: pd.DataFrame,
    family: str,
    admit_count: int,
) -> pd.DataFrame:
    numeric, categorical = FEATURE_SETS["full"]
    frame = epoch34.copy()
    for label in ("label_win", "label_match"):
        head = "win" if label == "label_win" else "match"
        pipeline = make_model(family, numeric, categorical)
        pipeline.fit(dataset[numeric + categorical], dataset[label].to_numpy())
        frame[f"p_{head}"] = pipeline.predict_proba(frame[numeric + categorical])[:, 1]
    frame = frame.sort_values("p_win", ascending=False).reset_index(drop=True)
    frame["rank"] = np.arange(1, len(frame) + 1)
    # Admit the top `admit_count` by p_win. A rank/fraction cutoff is used rather
    # than an absolute p_win threshold because epoch 34's board mix (and thus its
    # calibrated-score distribution) differs from the clean training passes, so
    # an absolute probability threshold does not transfer; the LOEO 95%-capture
    # *fraction* of the board is the transferable operating point.
    frame["admit_recommended"] = (frame["rank"] <= admit_count).astype(int)
    return frame


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def fmt(value: Any, digits: int = 3) -> str:
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def capture_row(name: str, capture: dict[str, Any]) -> str:
    cells = [name]
    for fraction in CAPTURE_FRACTIONS:
        cells.append(fmt(capture["capture_at_fraction"][f"{int(fraction * 100)}pct"]))
    return "| " + " | ".join(cells) + " |"


def n_star_cells(capture: dict[str, Any]) -> list[str]:
    cells = []
    for quantile in CAPTURE_QUANTILES:
        entry = capture["n_star"][f"{int(quantile * 100)}"]
        if entry is None:
            cells.append("-")
        else:
            cells.append(f"{entry['count']} ({entry['fraction'] * 100:.0f}%)")
    return cells


def build_report(
    reconciliation: dict[str, Any],
    loeo: dict[tuple[str, str, str], LoeoResult],
    ablation: dict[str, LoeoResult],
    baselines: dict[str, dict[str, Any]],
    best_family: str,
    threshold_info: dict[str, Any],
    epoch34_scores: pd.DataFrame,
    generated_at: str,
) -> str:
    lines: list[str] = []
    add = lines.append
    add("# Admission-Outcome Predictor — LOEO Evaluation (2026-07-13)")
    add("")
    add(f"Generated {generated_at} by `analysis/scripts/predict-admission-outcomes.py`.")
    add("")
    add("## Method")
    add("")
    add(
        "- One row per (epoch, target) for clean full-board passes 26/28/30/32; "
        "epochs 25/27 (partial passes) contribute history features only."
    )
    add(
        "- Labels: `exact` = any worker_state.exact=1; `gate_exact_tail` = checkpoint "
        "with exact_match=1 and hard_gates_passed=0 (and not exact); `match` = exact "
        "or gate tail; `improved` = best_score > baseline + 1e-9 (and not match); "
        "`win` = match or improved."
    )
    add(
        "- Features are admission-time only: baseline/gap/size/priority/"
        "admission_index, rank components parsed from `epoch_targets.reason`, "
        "top-level source dir, and history features from strictly earlier passes "
        "among 25/26/27/28/30/32."
    )
    add(
        "- Two heads, P(win) and P(match); two families: L2 logistic regression "
        "(median-impute + scale + one-hot, Platt-calibrated) and "
        "HistGradientBoosting (native NaN, isotonic-calibrated). Calibration uses "
        "3-fold CV inside each training fold only. Seed fixed at "
        f"{SEED}."
    )
    add(
        "- Evaluation: leave-one-epoch-out over the 4 clean passes. Baselines: "
        "existing priority order, baseline_score (closeness) desc, and a naive "
        "history rule (previously-winning targets first by n_prior_wins then "
        "best_prior_gain, then the rest in priority order)."
    )
    add("")
    add("## Dataset reconciliation")
    add("")
    add(f"- Pooled rows: {reconciliation['pooled_rows']} (expected {SANITY_POOLED_ROWS}).")
    for ordinal, expected in SANITY_PER_EPOCH.items():
        got = reconciliation["per_epoch"][str(ordinal)]
        add(
            f"- Epoch {ordinal}: exact/gate_tail/improved = "
            f"{got['exact']}/{got['gate_tail']}/{got['improved']} "
            f"(expected {expected[0]}/{expected[1]}/{expected[2]}), rows {got['rows']}."
        )
    add(
        f"- Epoch 32 cold-budget no-wins: {reconciliation['epoch32_cold_nowins']} "
        f"(expected {SANITY_E32_COLD_NOWINS})."
    )
    add(
        f"- P(win next pass | improved this pass) = "
        f"{fmt(reconciliation['p_win_next_given_improved'])} (known ~0.65); "
        f"P(win next | cold no-win) = "
        f"{fmt(reconciliation['p_win_next_given_cold_nowin'])} (known ~0.34)."
    )
    add("")
    add("## Model metrics (LOEO)")
    add("")
    add("### ROC AUC / PR AUC per held-out epoch")
    add("")
    add("| Head | Model | e26 ROC | e28 ROC | e30 ROC | e32 ROC | Pooled ROC | Pooled PR | Base rate |")
    add("|---|---|---|---|---|---|---|---|---|")
    for label, head in (("label_win", "win"), ("label_match", "match")):
        for family in ("logreg", "hgb"):
            result = loeo[(family, "full", label)]
            cells = [head, family]
            for ordinal in CLEAN_EPOCHS:
                cells.append(fmt(result.fold_metrics[ordinal]["roc_auc"]))
            cells.append(fmt(result.pooled["roc_auc"]))
            cells.append(fmt(result.pooled["pr_auc"]))
            cells.append(fmt(result.pooled["base_rate"]))
            add("| " + " | ".join(cells) + " |")
    add("")
    add(f"Best family by pooled win-head ROC AUC: **{best_family}**.")
    add("")
    add("## Capture curves (win head)")
    add("")
    add("Fraction of the held-out epoch's actual wins captured at admit fractions,")
    add("ranked by model score or baseline ordering.")
    add("")
    for ordinal in CLEAN_EPOCHS:
        add(f"### Held-out epoch {ordinal}")
        add("")
        add("| Method | 10% | 20% | 30% | 40% | 50% |")
        add("|---|---|---|---|---|---|")
        model_capture = loeo[(best_family, "full", "label_win")].fold_metrics[ordinal][
            "capture"
        ]
        add(capture_row(f"model ({best_family})", model_capture))
        for method in ("priority", "baseline_score", "naive_history"):
            add(
                capture_row(
                    method, baselines["label_win"][method]["per_epoch"][str(ordinal)]["capture"]
                )
            )
        add("")
    add("## N* — minimal admits to capture 90% / 95% of wins")
    add("")
    add("| Method | e26 N*90 | e26 N*95 | e28 N*90 | e28 N*95 | e30 N*90 | e30 N*95 | e32 N*90 | e32 N*95 |")
    add("|---|---|---|---|---|---|---|---|---|")
    method_rows: list[tuple[str, dict[int, dict[str, Any]]]] = [
        (
            f"model ({best_family})",
            {
                ordinal: loeo[(best_family, "full", "label_win")].fold_metrics[ordinal][
                    "capture"
                ]
                for ordinal in CLEAN_EPOCHS
            },
        )
    ]
    for method in ("priority", "baseline_score", "naive_history"):
        method_rows.append(
            (
                method,
                {
                    ordinal: baselines["label_win"][method]["per_epoch"][str(ordinal)][
                        "capture"
                    ]
                    for ordinal in CLEAN_EPOCHS
                },
            )
        )
    for name, per_epoch in method_rows:
        cells = [name]
        for ordinal in CLEAN_EPOCHS:
            cells.extend(n_star_cells(per_epoch[ordinal]))
        add("| " + " | ".join(cells) + " |")
    add("")
    add("## Ablation (win head, " + best_family + ")")
    add("")
    add("| Feature set | Pooled ROC AUC | Mean fold ROC AUC | Pooled PR AUC |")
    add("|---|---|---|---|")
    for name in ("full", "static_only", "history_only"):
        result = ablation[name]
        add(
            f"| {name} | {fmt(result.pooled['roc_auc'])} | "
            f"{fmt(result.pooled['mean_fold_roc_auc'])} | {fmt(result.pooled['pr_auc'])} |"
        )
    add("")
    add("## Epoch 34 recommendation")
    add("")
    n_admit = int(epoch34_scores["admit_recommended"].sum())
    total34 = len(epoch34_scores)
    add(
        f"**Admit {n_admit} of {total34} to expect ~95% of achievable wins.** "
        f"Operating point: admit the top {threshold_info['mean_fraction'] * 100:.0f}% "
        f"of the board by p_win (the mean LOEO 95%-capture admit fraction), which is "
        f"the top {n_admit} targets here, corresponding to p_win >= "
        f"{threshold_info['threshold']:.4f} on epoch 34."
    )
    add("")
    add(
        "A rank/fraction cutoff is used rather than an absolute p_win threshold "
        "because epoch 34's board mix differs from the clean training passes, so a "
        "calibrated-probability threshold does not transfer across epochs while the "
        "95%-capture *fraction* of the board does. Per-fold LOEO 95%-capture "
        "fractions: "
        + ", ".join(
            f"e{ordinal}={value * 100:.0f}%"
            for ordinal, value in threshold_info["per_fold_fractions"].items()
        )
        + ". For reference, per-fold 95%-capture p_win thresholds were "
        + ", ".join(
            f"e{ordinal}={value:.4f}"
            for ordinal, value in threshold_info["per_fold_thresholds"].items()
        )
        + " (not comparable across epochs)."
    )
    add("")
    add(
        "Because the win base rate is high (~0.53 pooled — most admitted targets "
        "make at least a small improvement), capturing 95% of wins inherently "
        "requires admitting most of the board under every method; the model's edge "
        "is admitting fewer targets than priority/closeness for the same capture "
        "(see the N* table)."
    )
    add("")
    add(
        "Scores written to "
        f"`analysis/reports/admission-predictor-epoch34-scores-{REPORT_STAMP}.csv` "
        "(ranked by p_win; columns include p_win, p_match, history summary, and "
        "admit_recommended)."
    )
    add("")
    add("## Caveats")
    add("")
    add(
        "- Survivorship: winners exit the board, so later passes are increasingly "
        "composed of harder residue; per-epoch base rates drift and the model "
        "never sees targets that matched early."
    )
    add(
        "- Epoch 26 rows have thin history (epoch 25 partial pass only), so the "
        "history head is cold-started for that fold."
    )
    add(
        "- The match head has a ~10-12% base rate; PR AUC is the more informative "
        "number there and per-fold thresholds are noisy."
    )
    add(
        "- Labels come from orchestrator-recorded worker outcomes; targets never "
        "claimed by a worker count as no-win."
    )
    add(
        "- The 95%-capture threshold assumes epoch 34's score distribution is "
        "comparable to the clean passes; the active pass has a different board "
        "mix (435 targets)."
    )
    add("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--run", default=DEFAULT_RUN)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    args = parser.parse_args()

    np.random.seed(SEED)
    generated_at = utc_now()
    conn = open_db_readonly(args.db)
    epoch_ids = load_epoch_ids(conn, args.run)

    print("[1/6] loading outcomes for history epochs", HISTORY_EPOCHS)
    outcomes_by_epoch = {
        ordinal: load_epoch_outcomes(conn, ordinal, epoch_ids[ordinal])
        for ordinal in HISTORY_EPOCHS
    }

    print("[2/6] building dataset for clean passes", CLEAN_EPOCHS)
    dataset = pd.concat(
        [
            build_rows(conn, ordinal, epoch_ids[ordinal], outcomes_by_epoch, with_labels=True)
            for ordinal in CLEAN_EPOCHS
        ],
        ignore_index=True,
    )
    epoch34 = build_rows(
        conn, SCORE_EPOCH, epoch_ids[SCORE_EPOCH], outcomes_by_epoch, with_labels=False
    )

    reconciliation = reconcile_dataset(dataset, outcomes_by_epoch)
    print("    reconciliation:", json.dumps(to_jsonable(reconciliation), indent=2))
    if reconciliation["problems"]:
        print("FATAL: dataset does not reconcile with sanity counts:", file=sys.stderr)
        for problem in reconciliation["problems"]:
            print("  -", problem, file=sys.stderr)
        return 1

    print("[3/6] LOEO evaluation (2 families x 2 heads, full features)")
    loeo: dict[tuple[str, str, str], LoeoResult] = {}
    for family in ("logreg", "hgb"):
        for label in ("label_win", "label_match"):
            loeo[(family, "full", label)] = run_loeo(dataset, family, "full", label)
            pooled = loeo[(family, "full", label)].pooled
            print(
                f"    {family:>7} {label:<12} pooled ROC {pooled['roc_auc']:.3f} "
                f"PR {pooled['pr_auc']:.3f}"
            )
    best_family = max(
        ("logreg", "hgb"), key=lambda f: loeo[(f, "full", "label_win")].pooled["roc_auc"]
    )
    print(f"    best family (win head): {best_family}")

    print("[4/6] baselines + ablation")
    baselines = {"label_win": run_baseline_eval(dataset, "label_win")}
    ablation = {
        name: (
            loeo[(best_family, "full", "label_win")]
            if name == "full"
            else run_loeo(dataset, best_family, name, "label_win")
        )
        for name in ("full", "static_only", "history_only")
    }
    for name, result in ablation.items():
        print(f"    ablation {name:<12} pooled ROC {result.pooled['roc_auc']:.3f}")

    print("[5/6] scoring epoch 34")
    win_result = loeo[(best_family, "full", "label_win")]
    per_fold_thresholds = {
        ordinal: win_result.fold_metrics[ordinal]["capture"]["n_star"]["95"][
            "score_threshold"
        ]
        for ordinal in CLEAN_EPOCHS
    }
    per_fold_fractions = {
        ordinal: win_result.fold_metrics[ordinal]["capture"]["n_star"]["95"]["fraction"]
        for ordinal in CLEAN_EPOCHS
    }
    # Operating point: admit the mean LOEO 95%-capture fraction of the board. A
    # fraction (rank) cutoff transfers across epochs; an absolute p_win threshold
    # does not, because epoch 34's board mix shifts the calibrated-score scale.
    mean_fraction = float(np.mean(list(per_fold_fractions.values())))
    total34 = len(epoch34)
    n_admit = max(1, math.ceil(mean_fraction * total34))
    epoch34_scores = score_epoch_34(dataset, epoch34, best_family, n_admit)
    admit_threshold = float(epoch34_scores.loc[n_admit - 1, "p_win"])
    threshold_info = {
        "per_fold_thresholds": per_fold_thresholds,
        "per_fold_fractions": per_fold_fractions,
        "mean_fraction": mean_fraction,
        "admit_count": n_admit,
        "threshold": admit_threshold,
    }
    print(
        f"    epoch 34: admit {n_admit} of {total34} "
        f"(top {mean_fraction * 100:.0f}% by p_win, p_win >= {admit_threshold:.4f})"
    )

    print("[6/6] writing outputs")
    args.report_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.report_dir / f"admission-predictor-epoch34-scores-{REPORT_STAMP}.csv"
    csv_columns = [
        "target_key",
        "symbol",
        "unit",
        "size",
        "baseline_score",
        "n_prior_wins",
        "last_outcome",
        "p_win",
        "p_match",
        "rank",
        "admit_recommended",
    ]
    epoch34_scores[csv_columns].to_csv(csv_path, index=False, float_format="%.6f")

    report_path = args.report_dir / f"admission-predictor-loeo-{REPORT_STAMP}.md"
    report_path.write_text(
        build_report(
            reconciliation,
            loeo,
            ablation,
            baselines,
            best_family,
            threshold_info,
            epoch34_scores,
            generated_at,
        )
    )

    stats = {
        "generated_at": generated_at,
        "seed": SEED,
        "run_id": args.run,
        "clean_epochs": CLEAN_EPOCHS,
        "reconciliation": reconciliation,
        "best_family": best_family,
        "loeo": {
            f"{family}/{label.removeprefix('label_')}": {
                "per_fold": {
                    str(ordinal): {
                        "roc_auc": result.fold_metrics[ordinal]["roc_auc"],
                        "pr_auc": result.fold_metrics[ordinal]["pr_auc"],
                        "capture": result.fold_metrics[ordinal]["capture"],
                    }
                    for ordinal in CLEAN_EPOCHS
                },
                "pooled": result.pooled,
            }
            for (family, _fs, label), result in loeo.items()
        },
        "baselines_win": baselines["label_win"],
        "ablation_win": {
            name: {"pooled": result.pooled} for name, result in ablation.items()
        },
        "epoch34": {
            "total_targets": len(epoch34_scores),
            "admit_recommended": n_admit,
            "admit_fraction": n_admit / len(epoch34_scores),
            "p_win_threshold_at_cutoff": threshold_info["threshold"],
            "mean_loeo_95_capture_fraction": threshold_info["mean_fraction"],
            "per_fold_95_capture_fractions": threshold_info["per_fold_fractions"],
            "per_fold_95_capture_p_win_thresholds": threshold_info[
                "per_fold_thresholds"
            ],
        },
    }
    stats_path = args.report_dir / f"admission-predictor-loeo-{REPORT_STAMP}.stats.json"
    stats_path.write_text(json_dumps(stats) + "\n")

    print("    wrote", csv_path)
    print("    wrote", report_path)
    print("    wrote", stats_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
