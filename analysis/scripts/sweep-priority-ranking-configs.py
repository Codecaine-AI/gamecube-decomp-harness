#!/usr/bin/env python3
"""Sweep matrix-backed ranking configurations against observed match outcomes.

This is analysis-only. It consumes the priority outcome dataset, trains
out-of-fold ranking models across feature-family configurations, and evaluates
small-batch top-k yield. The goal is to find whether a better pre-queue scoring
shape can move exact matches earlier without grading rows with models that saw
those same rows during training.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sqlite3
import warnings
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pandas as pd
from pandas.errors import PerformanceWarning
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import GroupKFold, LeaveOneGroupOut
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "projects/melee/state/orchestrator.sqlite"
DEFAULT_OUT = ROOT / "analysis/reports/priority-ranking-config-sweep"
XHIGH_RUN_ID = "53d5b342-c066-48fc-aa49-dd78b69dc2ac"
BATCH_SIZES = [16, 32, 64]
WINDOW_SIZES: list[int | None] = [None, 64, 128]
SOURCE_CAPS: list[int | None] = [None, 2, 4]
VALUE_WEIGHTS = [1, 2, 3, 5, 8]
RECENT_XHIGH_EPOCHS = {20, 21, 22}

warnings.simplefilter("ignore", PerformanceWarning)

OPSEQ_NUMERIC_FEATURES = [
    "opseq_profile_present",
    "opseq_best_analog_score",
    "opseq_analog_count",
    "opseq_exact_analog_count",
    "opseq_matched_analog_count",
    "opseq_exact_analog_ratio",
    "opseq_matched_analog_ratio",
    "opseq_top_analog_count",
    "opseq_top_score_mean",
    "opseq_top_score_gap",
    "opseq_best_matched_analog_score",
    "opseq_best_unmatched_analog_score",
    "opseq_best_exact_analog_score",
    "opseq_same_file_best_score",
    "opseq_cross_file_best_score",
    "opseq_top_same_file_count",
    "opseq_top_cross_file_count",
    "opseq_top_same_unit_count",
    "opseq_top_distinct_source_count",
    "opseq_top_matched_count",
    "opseq_top_unmatched_count",
    "opseq_top_exact_count",
    "opseq_high_score_75_count",
    "opseq_high_score_65_count",
    "opseq_high_score_55_count",
    "opseq_high_matched_score_65_count",
]

RANK_NUMERIC_FEATURES = [
    "priority",
    "priority_log",
    "fuzzy",
    "gap_to_exact",
    "log_size",
    "board_rank_total",
    "information_priority",
    "high_accuracy_bonus",
    "accuracy_readiness_bonus",
    "closeness_score",
    "information_gain_score",
    "unlock_score",
    "completion_readiness_score",
    "context_quality_score",
    "risk_penalty",
]

DIFFICULTY_NUMERIC_FEATURES = [
    "fuzzy",
    "gap_to_exact",
    "log_size",
    "symbol_token_count",
    "symbol_length",
    "symbol_is_fn",
    "symbol_is_lbl",
    "symbol_has_address",
    "symbol_has_hex",
    "symbol_has_callback_term",
    "symbol_has_state_term",
    "code_file_exists",
    "code_line_count",
    "code_nonempty_line_count",
    "code_comment_line_count",
    "code_preprocessor_count",
    "code_function_like_count",
    "code_struct_count",
    "code_enum_count",
    "code_typedef_count",
    "code_include_count",
    "code_define_count",
    "code_pad_stack_count",
    "code_asm_block_count",
    "code_inline_count",
    "code_static_count",
    "code_switch_count",
    "code_case_count",
    "code_if_count",
    "code_for_count",
    "code_while_count",
    "code_goto_count",
    "code_return_count",
    "code_nonmatching_count",
    "code_arrow_count",
    "code_float_literal_count",
    "code_pad_stack_per_kloc",
    "code_control_flow_per_kloc",
    "code_comment_ratio",
    "code_function_density",
]

SOURCE_HISTORY_NUMERIC_FEATURES = [
    "prior_source_trials_log",
    "prior_source_improve_rate",
    "prior_source_exact_rate",
    "prior_source_error_rate",
    "prior_source_no_win_rate",
    "prior_family_trials_log",
    "prior_family_improve_rate",
    "prior_family_exact_rate",
    "prior_family_error_rate",
    "prior_family_no_win_rate",
]

TARGET_HISTORY_NUMERIC_FEATURES = [
    "prior_target_trials_log",
    "prior_target_improve_rate",
    "prior_target_exact_rate",
    "prior_target_error_rate",
    "prior_target_no_win_rate",
]

CATEGORICAL_FEATURES = [
    "dataset_type",
    "rank_regime",
    "source_family",
    "module_bucket",
    "symbol_prefix",
    "graph_editability_mode",
    "fuzzy_bin",
    "size_bin",
    "opseq_profile_bucket",
    "opseq_best_score_bin",
]


@dataclass(frozen=True)
class FeatureConfig:
    name: str
    numeric: list[str]
    categorical: list[str]
    leakage_note: str


@dataclass(frozen=True)
class ScoreSpec:
    name: str
    column: str
    source: str
    validation_scheme: str
    feature_config: str
    model_kind: str
    score_shape: str


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [to_jsonable(item) for item in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return None if not np.isfinite(value) else float(value)
    if isinstance(value, float):
        return None if not math.isfinite(value) else value
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def json_dumps(value: Any) -> str:
    return json.dumps(to_jsonable(value), indent=2, sort_keys=True)


def round_or_none(value: Any, digits: int = 4) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return round(number, digits)


def pct(numerator: float, denominator: float, digits: int = 1) -> float | None:
    if denominator <= 0:
        return None
    return round((100.0 * numerator) / denominator, digits)


def latest_priority_dataset() -> Path:
    candidates = sorted((ROOT / "analysis/reports").glob("q-priority-outcome-analysis-*.dataset.csv"))
    if not candidates:
        raise FileNotFoundError("No q-priority outcome dataset found under analysis/reports.")
    return candidates[-1]


def bool_series(series: pd.Series) -> pd.Series:
    if series.dtype == bool:
        return series
    return series.astype(str).str.lower().isin(["true", "1", "yes"])


def load_epoch_map(db_path: Path) -> pd.DataFrame:
    if not db_path.exists():
        return pd.DataFrame(columns=["record_id", "epoch_ordinal", "epoch_size", "epoch_candidate_window"])
    conn = sqlite3.connect(str(db_path))
    try:
        return pd.read_sql_query(
            """
            SELECT
              ws.id AS record_id,
              e.ordinal AS epoch_ordinal,
              e.size_value AS epoch_size,
              e.candidate_window AS epoch_candidate_window
            FROM worker_state ws
            JOIN epochs e ON e.id = ws.epoch_id
            """,
            conn,
        )
    finally:
        conn.close()


def load_dataset(path: Path, db_path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    for column in ["exact", "improved", "observed", "validated", "end_to_end_model_row", "validated_model_row"]:
        if column in df:
            df[column] = bool_series(df[column])
    if "record_id" in df:
        df["record_id"] = df["record_id"].astype(str)
        epoch_map = load_epoch_map(db_path)
        if not epoch_map.empty:
            epoch_map["record_id"] = epoch_map["record_id"].astype(str)
            df = df.merge(epoch_map, on="record_id", how="left")

    for column in set(all_numeric_features() + existing_score_columns() + ["epoch_ordinal", "epoch_size", "epoch_candidate_window"]):
        if column in df:
            df[column] = pd.to_numeric(df[column], errors="coerce")
    for column in CATEGORICAL_FEATURES + ["run_id", "source_path"]:
        if column not in df:
            df[column] = "unknown"
        df[column] = df[column].fillna("unknown").astype(str)
    return df


def unique(items: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def all_numeric_features() -> list[str]:
    graph_features = [
        "graph_source_file_present",
        "graph_function_count",
        "graph_unmatched_function_count",
        "graph_matched_function_count",
        "graph_unmatched_ratio",
        "graph_matched_ratio",
        "graph_edge_touched_by_pr_count",
        "graph_edge_has_curated_pr_lesson_count",
        "graph_edge_has_mismatch_pattern_count",
        "graph_edge_has_mismatch_pattern_evidence_count",
        "graph_edge_has_source_update_proposal_count",
        "graph_edge_has_curated_worker_lesson_count",
        "graph_edge_has_path_fact_count",
        "graph_fact_past_pr_file_rollup_count",
        "graph_fact_past_pr_key_file_count",
        "graph_fact_curated_pr_lesson_count",
        "graph_fact_mismatch_pattern_evidence_count",
        "graph_fact_file_match_status_count",
        "graph_fact_editability_count",
        "graph_function_entity_count",
        "graph_exact_function_count",
        "graph_near_exact_function_count",
        "graph_far_function_count",
        "graph_small_function_count",
        "graph_huge_function_count",
        "graph_avg_function_fuzzy",
        "graph_min_function_fuzzy",
        "graph_avg_function_size",
    ]
    return unique(
        [
            *RANK_NUMERIC_FEATURES,
            *DIFFICULTY_NUMERIC_FEATURES,
            *SOURCE_HISTORY_NUMERIC_FEATURES,
            *TARGET_HISTORY_NUMERIC_FEATURES,
            *graph_features,
            *OPSEQ_NUMERIC_FEATURES,
        ]
    )


def existing_score_columns() -> list[str]:
    return [
        "priority",
        "pred_logistic_improved",
        "pred_hist_gradient_boost_improved",
        "pred_logistic_exact",
        "pred_hist_gradient_boost_exact",
        "pred_logistic_value",
        "pred_hist_gradient_boost_value",
        "opseq_best_matched_analog_score",
        "opseq_high_matched_score_65_count",
        "opseq_matched_analog_ratio",
        "fuzzy",
        "gap_to_exact",
    ]


def feature_configs(df: pd.DataFrame) -> list[FeatureConfig]:
    graph_numeric = [column for column in all_numeric_features() if column.startswith("graph_")]
    safe_cats = ["dataset_type", "rank_regime", "source_family", "module_bucket", "symbol_prefix", "fuzzy_bin", "size_bin"]
    opseq_cats = ["dataset_type", "rank_regime", "opseq_profile_bucket", "opseq_best_score_bin"]
    configs = [
        FeatureConfig("rank_only", RANK_NUMERIC_FEATURES, ["dataset_type", "rank_regime"], "Uses current rank inputs only."),
        FeatureConfig("opseq_only", OPSEQ_NUMERIC_FEATURES, opseq_cats, "Uses OPSEC/opseq analog profile snapshot."),
        FeatureConfig("rank_plus_opseq", RANK_NUMERIC_FEATURES + OPSEQ_NUMERIC_FEATURES, opseq_cats, "Rank plus OPSEC/opseq analog profile snapshot."),
        FeatureConfig(
            "difficulty_code_symbol",
            DIFFICULTY_NUMERIC_FEATURES,
            ["dataset_type", "module_bucket", "symbol_prefix", "fuzzy_bin", "size_bin"],
            "Uses target difficulty/code texture/symbol shape.",
        ),
        FeatureConfig(
            "source_history_opseq",
            SOURCE_HISTORY_NUMERIC_FEATURES + OPSEQ_NUMERIC_FEATURES,
            ["dataset_type", "source_family", "module_bucket", "opseq_profile_bucket", "opseq_best_score_bin"],
            "No prior target retry history; source/family history plus OPSEC/opseq.",
        ),
        FeatureConfig(
            "candidate_safe_no_target_retry",
            RANK_NUMERIC_FEATURES + DIFFICULTY_NUMERIC_FEATURES + SOURCE_HISTORY_NUMERIC_FEATURES + OPSEQ_NUMERIC_FEATURES,
            safe_cats + ["opseq_profile_bucket", "opseq_best_score_bin"],
            "Candidate-usable blend excluding prior target retry history and current graph snapshot features.",
        ),
        FeatureConfig(
            "candidate_with_target_history",
            RANK_NUMERIC_FEATURES
            + DIFFICULTY_NUMERIC_FEATURES
            + SOURCE_HISTORY_NUMERIC_FEATURES
            + TARGET_HISTORY_NUMERIC_FEATURES
            + OPSEQ_NUMERIC_FEATURES,
            safe_cats + ["opseq_profile_bucket", "opseq_best_score_bin"],
            "Includes prior target retry history; useful for retries but less useful for fresh discovery.",
        ),
        FeatureConfig(
            "all_candidate_snapshot",
            all_numeric_features(),
            CATEGORICAL_FEATURES,
            "Includes current graph snapshot features; strongest retrospective model but highest leakage risk.",
        ),
    ]
    available = set(df.columns)
    return [
        FeatureConfig(
            config.name,
            [column for column in unique(config.numeric) if column in available],
            [column for column in unique(config.categorical) if column in available],
            config.leakage_note,
        )
        for config in configs
    ]


def one_hot_kwargs() -> dict[str, Any]:
    try:
        OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        return {"handle_unknown": "ignore", "sparse_output": False}
    except TypeError:
        return {"handle_unknown": "ignore", "sparse": False}


def model_pipeline(kind: str, numeric_features: list[str], categorical_features: list[str]) -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
                        ("scaler", StandardScaler()),
                    ]
                ),
                numeric_features,
            ),
            (
                "cat",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("onehot", OneHotEncoder(**one_hot_kwargs())),
                    ]
                ),
                categorical_features,
            ),
        ],
        remainder="drop",
        verbose_feature_names_out=False,
    )
    if kind == "logistic":
        classifier = LogisticRegression(max_iter=5000, C=0.75)
    elif kind == "logistic_balanced":
        classifier = LogisticRegression(max_iter=5000, C=0.75, class_weight="balanced")
    elif kind == "hist_gradient_boost":
        classifier = HistGradientBoostingClassifier(max_iter=100, learning_rate=0.04, l2_regularization=0.08, random_state=7)
    else:
        raise ValueError(kind)
    return Pipeline(steps=[("features", preprocessor), ("model", classifier)])


def cv_splits(df: pd.DataFrame, scheme: str) -> list[tuple[np.ndarray, np.ndarray, str]]:
    if scheme == "run_logo":
        splitter = LeaveOneGroupOut()
        groups = df["run_id"].astype(str)
        return [(train_idx, test_idx, str(groups.iloc[test_idx].iloc[0])) for train_idx, test_idx in splitter.split(df, groups=groups)]
    if scheme == "source_family_gkf":
        groups = df["source_family"].astype(str)
        n_groups = int(groups.nunique())
        n_splits = min(5, n_groups)
        splitter = GroupKFold(n_splits=n_splits)
        splits = []
        for fold, (train_idx, test_idx) in enumerate(splitter.split(df, groups=groups), start=1):
            splits.append((train_idx, test_idx, f"source_fold_{fold}"))
        return splits
    raise ValueError(scheme)


def metric_block(y: pd.Series, score: pd.Series) -> dict[str, Any]:
    mask = y.notna() & score.notna()
    yv = y[mask].astype(int).to_numpy()
    sv = score[mask].astype(float).to_numpy()
    result: dict[str, Any] = {
        "n": int(len(yv)),
        "positives": int(yv.sum()) if len(yv) else 0,
        "base_rate_pct": pct(float(yv.sum()), len(yv)) if len(yv) else None,
    }
    if len(yv) == 0 or len(set(yv.tolist())) < 2:
        result.update({"roc_auc": None, "average_precision": None})
    else:
        result["roc_auc"] = round_or_none(roc_auc_score(yv, sv), 4)
        result["average_precision"] = round_or_none(average_precision_score(yv, sv), 4)
    order = np.argsort(-sv)
    for frac in [0.05, 0.10, 0.20, 0.35]:
        k = max(1, int(math.ceil(len(order) * frac))) if len(order) else 0
        selected = yv[order[:k]] if k else np.array([])
        result[f"precision_at_{int(frac * 100)}pct"] = round_or_none(float(selected.mean()), 4) if k else None
        result[f"lift_at_{int(frac * 100)}pct"] = (
            round_or_none(float(selected.mean()) / float(yv.mean()), 4) if k and float(yv.mean()) > 0 else None
        )
    for k in BATCH_SIZES:
        if len(order) < k:
            continue
        selected = yv[order[:k]]
        result[f"exact_or_outcome_at_{k}"] = int(selected.sum())
        result[f"precision_at_{k}"] = round_or_none(float(selected.mean()), 4)
    return result


def cross_val_predict(
    df: pd.DataFrame,
    outcome: str,
    kind: str,
    config: FeatureConfig,
    scheme: str,
) -> tuple[pd.Series, dict[str, Any]]:
    y = df[outcome].astype(int)
    predictions = pd.Series(np.nan, index=df.index, dtype=float)
    fold_rows: list[dict[str, Any]] = []
    for fold, (train_idx, test_idx, fold_label) in enumerate(cv_splits(df, scheme), start=1):
        train_y = y.iloc[train_idx]
        test_y = y.iloc[test_idx]
        if len(set(train_y.tolist())) < 2:
            continue
        pipeline = model_pipeline(kind, config.numeric, config.categorical)
        pipeline.fit(df.iloc[train_idx], train_y)
        proba = pipeline.predict_proba(df.iloc[test_idx])[:, 1]
        predictions.iloc[test_idx] = proba
        row = metric_block(test_y.reset_index(drop=True), pd.Series(proba))
        row.update({"fold": fold, "heldout": fold_label, "positives": int(test_y.sum())})
        fold_rows.append(row)
    metrics = metric_block(y, predictions)
    metrics.update(
        {
            "outcome": outcome,
            "model_kind": kind,
            "feature_config": config.name,
            "validation_scheme": scheme,
            "folds": fold_rows,
            "leakage_note": config.leakage_note,
        }
    )
    return predictions, metrics


def safe_column_name(text: str) -> str:
    cleaned = "".join(ch if ch.isalnum() else "_" for ch in text.lower())
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned.strip("_")


def add_baseline_scores(df: pd.DataFrame) -> list[ScoreSpec]:
    specs: list[ScoreSpec] = []

    def add(name: str, column: str, shape: str = "baseline") -> None:
        if column in df and pd.to_numeric(df[column], errors="coerce").notna().sum() > 0:
            specs.append(ScoreSpec(name, column, "baseline", "observed", "baseline", "none", shape))

    add("priority", "priority")
    add("existing_hgb_exact", "pred_hist_gradient_boost_exact", "exact_probability")
    add("existing_hgb_value", "pred_hist_gradient_boost_value", "value")
    add("existing_logistic_exact", "pred_logistic_exact", "exact_probability")
    add("existing_logistic_value", "pred_logistic_value", "value")
    add("opseq_best_matched", "opseq_best_matched_analog_score", "single_feature")
    add("opseq_high_matched_count", "opseq_high_matched_score_65_count", "single_feature")
    add("opseq_matched_ratio", "opseq_matched_analog_ratio", "single_feature")

    if {"opseq_best_matched_analog_score", "fuzzy"}.issubset(df.columns):
        column = "score_opseq_best_matched_fuzzy"
        best = pd.to_numeric(df["opseq_best_matched_analog_score"], errors="coerce").fillna(0)
        fuzzy = pd.to_numeric(df["fuzzy"], errors="coerce").fillna(0) / 100.0
        gate = ((best >= 0.8) & (pd.to_numeric(df["fuzzy"], errors="coerce").fillna(0) >= 99)).astype(float)
        df[column] = 10.0 * gate + best + 0.25 * fuzzy
        specs.append(ScoreSpec("opseq_080_fuzzy99_composite", column, "baseline", "observed", "baseline", "none", "gate_composite"))
    return specs


def train_sweep_scores(df: pd.DataFrame, schemes: list[str], model_kinds: list[str]) -> tuple[pd.DataFrame, list[dict[str, Any]], list[ScoreSpec]]:
    model_df = df.copy()
    metrics: list[dict[str, Any]] = []
    score_specs = add_baseline_scores(model_df)
    configs = feature_configs(model_df)
    for scheme in schemes:
        for config in configs:
            for kind in model_kinds:
                prediction_columns: dict[str, str] = {}
                for outcome in ["exact", "improved"]:
                    if len(model_df) < 40 or model_df[outcome].nunique() < 2:
                        continue
                    preds, metric = cross_val_predict(model_df, outcome, kind, config, scheme)
                    metrics.append(metric)
                    column = safe_column_name(f"score_{scheme}_{config.name}_{kind}_{outcome}")
                    model_df[column] = preds
                    prediction_columns[outcome] = column
                    score_specs.append(ScoreSpec(f"{scheme}:{config.name}:{kind}:{outcome}", column, "model", scheme, config.name, kind, outcome))
                if {"exact", "improved"}.issubset(prediction_columns):
                    exact = model_df[prediction_columns["exact"]].fillna(0)
                    improved = model_df[prediction_columns["improved"]].fillna(0)
                    for weight in VALUE_WEIGHTS:
                        column = safe_column_name(f"score_{scheme}_{config.name}_{kind}_value_w{weight}")
                        model_df[column] = weight * exact + improved
                        score_specs.append(
                            ScoreSpec(
                                f"{scheme}:{config.name}:{kind}:value_w{weight}",
                                column,
                                "model",
                                scheme,
                                config.name,
                                kind,
                                f"value_w{weight}",
                            )
                        )
                    column = safe_column_name(f"score_{scheme}_{config.name}_{kind}_exact_tiebreak")
                    model_df[column] = exact + 0.05 * improved
                    score_specs.append(
                        ScoreSpec(
                            f"{scheme}:{config.name}:{kind}:exact_tiebreak",
                            column,
                            "model",
                            scheme,
                            config.name,
                            kind,
                            "exact_tiebreak",
                        )
                    )
    return model_df, metrics, score_specs


def select_with_source_cap(df: pd.DataFrame, score_column: str, k: int, cap: int | None) -> pd.DataFrame:
    ordered = df.sort_values(score_column, ascending=False)
    if cap is None:
        return ordered.head(k)
    selected: list[int] = []
    counts: Counter[str] = Counter()
    for idx, row in ordered.iterrows():
        source = str(row.get("source_path") or "unknown")
        if counts[source] >= cap:
            continue
        selected.append(idx)
        counts[source] += 1
        if len(selected) >= k:
            break
    return df.loc[selected]


def batch_rows_for_group(
    group: pd.DataFrame,
    score: ScoreSpec,
    group_scope: str,
    group_key: str,
    windows: list[int | None],
    source_caps: list[int | None],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if score.column not in group:
        return rows
    scoped_base = group[pd.to_numeric(group[score.column], errors="coerce").notna()].copy()
    if scoped_base.empty:
        return rows
    scoped_base[score.column] = pd.to_numeric(scoped_base[score.column], errors="coerce")
    for window in windows:
        if window is None:
            windowed = scoped_base
            window_label = "full"
        else:
            if "priority" not in scoped_base or len(scoped_base) < min(window, len(scoped_base)):
                continue
            windowed = scoped_base.sort_values("priority", ascending=False).head(window)
            window_label = str(window)
        for k in BATCH_SIZES:
            if len(windowed) < k:
                continue
            for cap in source_caps:
                selected = select_with_source_cap(windowed, score.column, k, cap)
                if len(selected) < k:
                    continue
                rows.append(
                    {
                        "score": score.name,
                        "score_column": score.column,
                        "score_source": score.source,
                        "validation_scheme": score.validation_scheme,
                        "feature_config": score.feature_config,
                        "model_kind": score.model_kind,
                        "score_shape": score.score_shape,
                        "group_scope": group_scope,
                        "group_key": group_key,
                        "window": window_label,
                        "k": k,
                        "source_cap": "plain" if cap is None else f"cap_{cap}",
                        "selected": int(len(selected)),
                        "exact": int(selected["exact"].sum()),
                        "exact_rate_pct": pct(float(selected["exact"].sum()), len(selected)),
                        "improved": int(selected["improved"].sum()),
                        "improved_rate_pct": pct(float(selected["improved"].sum()), len(selected)),
                        "distinct_sources": int(selected["source_path"].nunique()),
                        "avg_score": round_or_none(selected[score.column].mean(), 5),
                        "min_score": round_or_none(selected[score.column].min(), 5),
                    }
                )
    return rows


def batch_evaluation(df: pd.DataFrame, score_specs: list[ScoreSpec]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    scopes: list[tuple[str, pd.core.groupby.generic.DataFrameGroupBy]] = []
    scopes.append(("run", df.groupby("run_id", dropna=False)))
    xhigh_epoch = df.get("epoch_ordinal", pd.Series(np.nan, index=df.index))
    xhigh = df[
        (df["run_id"].astype(str) == XHIGH_RUN_ID)
        & xhigh_epoch.notna()
        & xhigh_epoch.astype(float).isin(RECENT_XHIGH_EPOCHS)
    ].copy()
    if not xhigh.empty:
        scopes.append(("xhigh_epoch", xhigh.groupby("epoch_ordinal", dropna=False)))
    for score in score_specs:
        for scope_name, grouped in scopes:
            for group_key, group in grouped:
                if len(group) < min(BATCH_SIZES):
                    continue
                key = str(int(group_key)) if isinstance(group_key, (int, float, np.integer, np.floating)) and math.isfinite(float(group_key)) else str(group_key)
                rows.extend(batch_rows_for_group(group, score, scope_name, key, WINDOW_SIZES, SOURCE_CAPS))
    return rows


def aggregate_batch_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    df = pd.DataFrame(rows)
    keys = ["score", "score_source", "validation_scheme", "feature_config", "model_kind", "score_shape", "group_scope", "window", "k", "source_cap"]
    aggregated: list[dict[str, Any]] = []
    for group_key, group in df.groupby(keys, dropna=False):
        row = {key: value for key, value in zip(keys, group_key)}
        selected = int(group["selected"].sum())
        exact = int(group["exact"].sum())
        improved = int(group["improved"].sum())
        row.update(
            {
                "groups": int(group["group_key"].nunique()),
                "selected": selected,
                "exact": exact,
                "exact_rate_pct": pct(float(exact), selected),
                "avg_exact_per_group": round_or_none(group["exact"].mean(), 3),
                "median_exact_per_group": round_or_none(group["exact"].median(), 3),
                "max_exact_group": int(group["exact"].max()),
                "improved": improved,
                "improved_rate_pct": pct(float(improved), selected),
                "avg_improved_per_group": round_or_none(group["improved"].mean(), 3),
                "avg_distinct_sources": round_or_none(group["distinct_sources"].mean(), 2),
            }
        )
        aggregated.append(row)
    return sorted(aggregated, key=lambda item: (item["group_scope"] == "xhigh_epoch", item["k"], item["exact"], item["exact_rate_pct"] or 0), reverse=True)


def score_metrics(df: pd.DataFrame, score_specs: list[ScoreSpec]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for score in score_specs:
        if score.column not in df:
            continue
        score_series = pd.to_numeric(df[score.column], errors="coerce")
        for outcome in ["exact", "improved"]:
            metric = metric_block(df[outcome], score_series)
            metric.update(
                {
                    "score": score.name,
                    "score_source": score.source,
                    "validation_scheme": score.validation_scheme,
                    "feature_config": score.feature_config,
                    "model_kind": score.model_kind,
                    "score_shape": score.score_shape,
                    "outcome": outcome,
                }
            )
            rows.append(metric)
    return sorted(rows, key=lambda row: (row["outcome"] == "exact", row.get("average_precision") or 0, row.get("roc_auc") or 0), reverse=True)


def best_rows(rows: list[dict[str, Any]], *, group_scope: str, k: int | None = None, window: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    filtered = [row for row in rows if row.get("group_scope") == group_scope]
    if k is not None:
        filtered = [row for row in filtered if int(row.get("k") or 0) == k]
    if window is not None:
        filtered = [row for row in filtered if str(row.get("window")) == window]
    return sorted(
        filtered,
        key=lambda row: (
            int(row.get("exact") or 0),
            float(row.get("exact_rate_pct") or 0),
            int(row.get("improved") or 0),
            float(row.get("improved_rate_pct") or 0),
        ),
        reverse=True,
    )[:limit]


def comparison_vs_priority(batch_summary: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keyed = {
        (row["group_scope"], row["window"], int(row["k"]), row["source_cap"]): row
        for row in batch_summary
        if row["score"] == "priority"
    }
    rows: list[dict[str, Any]] = []
    for row in batch_summary:
        key = (row["group_scope"], row["window"], int(row["k"]), row["source_cap"])
        base = keyed.get(key)
        if not base or row["score"] == "priority":
            continue
        rows.append(
            {
                **row,
                "priority_exact": base["exact"],
                "delta_exact_vs_priority": int(row["exact"]) - int(base["exact"]),
                "priority_improved": base["improved"],
                "delta_improved_vs_priority": int(row["improved"]) - int(base["improved"]),
            }
        )
    return sorted(rows, key=lambda item: (item["delta_exact_vs_priority"], item["exact"], item["delta_improved_vs_priority"]), reverse=True)


def markdown_table(rows: list[dict[str, Any]], columns: list[str], limit: int | None = None) -> str:
    scoped = rows[:limit] if limit else rows
    if not scoped:
        return "_No rows._"

    def fmt(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, float):
            return f"{value:.4g}"
        return str(value)

    header = "| " + " | ".join(columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    body = ["| " + " | ".join(fmt(row.get(column)) for column in columns) + " |" for row in scoped]
    return "\n".join([header, sep, *body])


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    columns = list(dict.fromkeys(column for row in rows for column in row.keys()))
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def analysis_notes(stats: dict[str, Any]) -> list[str]:
    notes: list[str] = []
    xhigh64 = best_rows(stats["batch_summary"], group_scope="xhigh_epoch", k=64, window="full", limit=5)
    xhigh32 = best_rows(stats["batch_summary"], group_scope="xhigh_epoch", k=32, window="full", limit=5)
    run64 = best_rows(stats["batch_summary"], group_scope="run", k=64, window="full", limit=5)
    priority_xhigh64 = next(
        (
            row
            for row in stats["batch_summary"]
            if row["score"] == "priority" and row["group_scope"] == "xhigh_epoch" and row["window"] == "full" and int(row["k"]) == 64 and row["source_cap"] == "plain"
        ),
        None,
    )
    if xhigh64:
        best = xhigh64[0]
        notes.append(
            f"Best retrospective x-high epoch top-64 score was `{best['score']}` with {best['exact']} exacts "
            f"over {best['selected']} selected rows ({best['exact_rate_pct']}% exact)."
        )
    if priority_xhigh64:
        notes.append(
            f"Plain priority at x-high epoch top-64 found {priority_xhigh64['exact']} exacts "
            f"over {priority_xhigh64['selected']} rows ({priority_xhigh64['exact_rate_pct']}% exact)."
        )
    if xhigh32:
        best = xhigh32[0]
        notes.append(
            f"Best retrospective x-high epoch top-32 score was `{best['score']}` with {best['exact']} exacts "
            f"over {best['selected']} selected rows ({best['exact_rate_pct']}% exact)."
        )
    if run64:
        best = run64[0]
        notes.append(
            f"Across run-level top-64 batches, `{best['score']}` led with {best['exact']} exacts "
            f"over {best['selected']} rows ({best['exact_rate_pct']}% exact)."
        )
    robust_80 = [
        row
        for row in stats["batch_summary"]
        if int(row.get("selected") or 0) >= 40 and float(row.get("exact_rate_pct") or 0) >= 80.0
    ]
    if robust_80:
        best = sorted(robust_80, key=lambda row: (row["selected"], row["exact"]), reverse=True)[0]
        notes.append(f"At least one batch aggregate reached 80% exact with support: `{best['score']}` selected {best['selected']} rows.")
    else:
        notes.append("No swept score reached an 80% exact rate with at least 40 selected rows; 80% remains unsupported as a robust gate.")
    notes.append("All model scores in this sweep are out-of-fold for their validation scheme, but the dataset still contains only historically admitted rows.")
    notes.append("Configurations using current graph or OPSEC/opseq matched-neighbor snapshots can be optimistic because historical candidate availability is not replayed.")
    return notes


def render_markdown(stats: dict[str, Any]) -> str:
    metric_cols = ["score", "outcome", "n", "positives", "roc_auc", "average_precision", "precision_at_10pct", "precision_at_20pct"]
    batch_cols = [
        "score",
        "validation_scheme",
        "feature_config",
        "model_kind",
        "score_shape",
        "window",
        "k",
        "source_cap",
        "groups",
        "selected",
        "exact",
        "exact_rate_pct",
        "improved",
        "improved_rate_pct",
        "avg_distinct_sources",
    ]
    delta_cols = [
        "score",
        "validation_scheme",
        "feature_config",
        "model_kind",
        "score_shape",
        "group_scope",
        "window",
        "k",
        "source_cap",
        "exact",
        "priority_exact",
        "delta_exact_vs_priority",
        "improved",
        "priority_improved",
        "delta_improved_vs_priority",
    ]
    exact_metrics = [row for row in stats["score_metrics"] if row["outcome"] == "exact"]
    improved_metrics = [row for row in stats["score_metrics"] if row["outcome"] == "improved"]
    validation_note = (
        "Leave-one-run-out and source-family grouped folds are included; they answer different generalization questions."
        if "source_family_gkf" in stats.get("validation_schemes", [])
        else "Leave-one-run-out is the primary anti-overfit view used in this run."
    )
    lines = [
        "# Priority Ranking Config Sweep",
        "",
        f"Generated: `{stats['generated_at']}`",
        f"Dataset: `{stats['dataset_path']}`",
        "",
        "## Findings",
        "",
        *[f"- {note}" for note in stats["notes"]],
        "",
        "## Best Exact Score Metrics",
        "",
        markdown_table(exact_metrics, metric_cols, limit=30),
        "",
        "## Best Improved Score Metrics",
        "",
        markdown_table(improved_metrics, metric_cols, limit=20),
        "",
        "## Best Xhigh Epoch Batches",
        "",
        "### Top 64",
        "",
        markdown_table(best_rows(stats["batch_summary"], group_scope="xhigh_epoch", k=64, window="full", limit=25), batch_cols),
        "",
        "### Top 32",
        "",
        markdown_table(best_rows(stats["batch_summary"], group_scope="xhigh_epoch", k=32, window="full", limit=25), batch_cols),
        "",
        "### Top 16",
        "",
        markdown_table(best_rows(stats["batch_summary"], group_scope="xhigh_epoch", k=16, window="full", limit=25), batch_cols),
        "",
        "## Best Run-Level Batches",
        "",
        markdown_table(best_rows(stats["batch_summary"], group_scope="run", k=64, window="full", limit=30), batch_cols),
        "",
        "## Biggest Gains Over Priority",
        "",
        markdown_table(stats["priority_comparison"], delta_cols, limit=40),
        "",
        "## Model Families",
        "",
        markdown_table(
            stats["model_metrics"],
            ["validation_scheme", "feature_config", "model_kind", "outcome", "n", "positives", "roc_auc", "average_precision", "precision_at_10pct", "leakage_note"],
            limit=60,
        ),
        "",
        "## Limits",
        "",
        "- The sweep reranks observed admitted rows; it does not replay every candidate available at historical rebuild time.",
        f"- {validation_note}",
        "- Current graph and OPSEC/opseq matched-neighbor features may contain information that was not available at older historical selection times.",
        "- Batch/window simulations use persisted priority as the candidate-window prefilter when a window is specified.",
        "",
    ]
    return "\n".join(lines)


def run(args: argparse.Namespace) -> dict[str, Any]:
    dataset_path = args.dataset or latest_priority_dataset()
    raw_df = load_dataset(dataset_path, args.db)
    df = raw_df[raw_df.get("end_to_end_model_row", pd.Series(False, index=raw_df.index))].copy()
    df = df[df["run_id"].astype(str).str.len() > 0].reset_index(drop=True)
    for column in all_numeric_features():
        if column not in df:
            df[column] = np.nan
    for column in CATEGORICAL_FEATURES:
        if column not in df:
            df[column] = "unknown"
    schemes = [item.strip() for item in args.validation_schemes.split(",") if item.strip()]
    model_kinds = [item.strip() for item in args.model_kinds.split(",") if item.strip()]
    scored_df, model_metrics, score_specs = train_sweep_scores(df, schemes, model_kinds)
    batch_detail = batch_evaluation(scored_df, score_specs)
    batch_summary = aggregate_batch_rows(batch_detail)
    score_metric_rows = score_metrics(scored_df, score_specs)
    priority_comparison = comparison_vs_priority(batch_summary)

    generated_at = utc_now()
    out_prefix = args.out
    if out_prefix.name == "priority-ranking-config-sweep":
        out_prefix = out_prefix.with_name(f"{out_prefix.name}-{generated_at[:10]}")
    stats = {
        "generated_at": generated_at,
        "dataset_path": str(dataset_path),
        "db_path": str(args.db),
        "rows": int(len(scored_df)),
        "exact": int(scored_df["exact"].sum()),
        "improved": int(scored_df["improved"].sum()),
        "validation_schemes": schemes,
        "model_kinds": model_kinds,
        "batch_sizes": BATCH_SIZES,
        "window_sizes": ["full" if value is None else value for value in WINDOW_SIZES],
        "source_caps": ["plain" if value is None else value for value in SOURCE_CAPS],
        "model_metrics": sorted(model_metrics, key=lambda row: (row["outcome"] == "exact", row.get("average_precision") or 0), reverse=True),
        "score_metrics": score_metric_rows,
        "batch_summary": batch_summary,
        "priority_comparison": priority_comparison,
        "outputs": {
            "markdown": str(out_prefix.with_suffix(".md")),
            "stats_json": str(out_prefix.with_suffix(".stats.json")),
            "score_metrics_csv": str(out_prefix.with_suffix(".score-metrics.csv")),
            "batch_summary_csv": str(out_prefix.with_suffix(".batch-summary.csv")),
            "batch_detail_csv": str(out_prefix.with_suffix(".batch-detail.csv")),
        },
    }
    stats["notes"] = analysis_notes(stats)
    out_prefix.parent.mkdir(parents=True, exist_ok=True)
    write_csv(out_prefix.with_suffix(".score-metrics.csv"), score_metric_rows)
    write_csv(out_prefix.with_suffix(".batch-summary.csv"), batch_summary)
    write_csv(out_prefix.with_suffix(".batch-detail.csv"), batch_detail)
    out_prefix.with_suffix(".stats.json").write_text(json_dumps(stats) + "\n", encoding="utf-8")
    out_prefix.with_suffix(".md").write_text(render_markdown(stats), encoding="utf-8")
    return stats


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=None, help="q-priority outcome dataset CSV. Defaults to latest generated dataset.")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--validation-schemes", default="run_logo")
    parser.add_argument("--model-kinds", default="logistic_balanced")
    return parser


def main() -> None:
    stats = run(build_parser().parse_args())
    print(json_dumps({"outputs": stats["outputs"], "notes": stats["notes"]}))


if __name__ == "__main__":
    main()
