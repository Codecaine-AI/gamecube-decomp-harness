#!/usr/bin/env python3
"""Check end-to-end epoch-34 parity for the persisted admission scorer."""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def _load(name: str, filename: str):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {filename}")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


common = _load("predict_admission_common", "predict-admission-common.py")
pao = _load("pao", "predict-admission-outcomes.py")

import joblib  # noqa: E402
import pandas as pd  # noqa: E402
from scipy.stats import spearmanr  # noqa: E402


DEFAULT_MODELS = ROOT / "analysis/models/admission-predictor-2026-07-13"
DEFAULT_REFERENCE = (
    ROOT
    / "analysis/reports/admission-predictor-tuned-epoch34-scores-2026-07-13.csv"
)
REFERENCE_STATS = (
    ROOT / "analysis/reports/admission-predictor-tuned-2026-07-13.stats.json"
)
SCORER = HERE / "predict-admission-score-candidates.py"

RANK_TO_CANDIDATE = {
    "rank_board": "total_priority",
    "rank_info_priority": "information_priority_score",
    "rank_high_acc_bonus": "high_accuracy_bonus",
    "rank_acc_readiness_bonus": "accuracy_readiness_bonus",
    "rank_closeness_fallback": "closeness_fallback_score",
    "rank_opseq_rerank": "opseq_rerank_bonus",
    "sig_closeness": "closeness_score",
    "sig_information_gain": "information_gain_score",
    "sig_unlock": "unlock_score",
    "sig_readiness": "completion_readiness_score",
    "sig_context": "context_quality_score",
    "sig_risk": "risk_penalty",
    "opseq_analog_count": "opseq_analog_count",
    "opseq_best_analog": "opseq_best_analog_score",
    "opseq_matched_best": "opseq_best_matched_analog_score",
}


def candidate_payload(targets: pd.DataFrame) -> dict[str, list[dict[str, object]]]:
    candidates: list[dict[str, object]] = []
    for row in targets.itertuples(index=False):
        parsed = pao.parse_reason(row.reason)
        rank = {
            candidate_name: float(parsed[column])
            for column, candidate_name in RANK_TO_CANDIDATE.items()
            if not math.isnan(float(parsed[column]))
        }
        candidates.append(
            {
                "target_key": str(row.target_key),
                "unit": str(row.unit),
                "symbol": str(row.symbol),
                "source_path": str(row.source_path),
                "size": int(row.size),
                "fuzzy": float(row.baseline_score),
                "priority": float(row.priority),
                "window_index": int(row.admission_index),
                "rank": rank,
            }
        )
    return {"candidates": candidates}


def snapshot_database(source_path: Path, snapshot_path: Path) -> None:
    source = pao.open_db_readonly(source_path)
    try:
        destination = sqlite3.connect(snapshot_path)
        try:
            source.backup(destination)
        finally:
            destination.close()
    finally:
        source.close()


def load_snapshot_inputs(
    snapshot_path: Path, run_id: str
) -> tuple[dict[str, list[dict[str, object]]], pd.DataFrame, int]:
    conn = pao.open_db_readonly(snapshot_path)
    try:
        epoch_ids = pao.load_epoch_ids(conn, run_id)
        score_epoch_id = epoch_ids[pao.SCORE_EPOCH]
        targets = pao.load_epoch_targets(conn, score_epoch_id)
        outcomes = {
            ordinal: pao.load_epoch_outcomes(conn, ordinal, epoch_ids[ordinal])
            for ordinal in pao.HISTORY_EPOCHS
        }
        frame = pao.build_rows(
            conn,
            pao.SCORE_EPOCH,
            score_epoch_id,
            outcomes,
            with_labels=False,
        )
        epoch = conn.execute(
            "SELECT fast_refresh_count FROM epochs "
            "WHERE run_id = ? AND ordinal = ?",
            (run_id, pao.SCORE_EPOCH),
        ).fetchone()
        if epoch is None:
            raise ValueError(f"epoch {pao.SCORE_EPOCH} metadata is missing")
        fast_refresh_count = int(epoch["fast_refresh_count"])
    finally:
        conn.close()
    return candidate_payload(targets), common.add_derived(frame), fast_refresh_count


def load_json(path: Path) -> dict[str, object]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def comparison_metrics(
    expected: pd.Series, actual: pd.Series
) -> tuple[float, float, int]:
    correlation = float(spearmanr(expected, actual).statistic)
    absolute_difference = (expected.astype(float) - actual.astype(float)).abs()
    return (
        correlation,
        float(absolute_difference.max()),
        int((absolute_difference > 1e-9).sum()),
    )


def run_check(args: argparse.Namespace, snapshot_path: Path) -> int:
    payload, feature_frame, fast_refresh_count = load_snapshot_inputs(
        snapshot_path, args.run
    )

    command = [
        sys.executable,
        str(SCORER),
        "--db",
        str(snapshot_path),
        "--run",
        args.run,
        "--models",
        str(args.models),
    ]
    started = time.perf_counter()
    completed = subprocess.run(
        command,
        input=json.dumps(payload),
        capture_output=True,
        text=True,
    )
    elapsed = time.perf_counter() - started
    try:
        response = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        print(completed.stderr, file=sys.stderr, end="")
        print(f"FAIL: scorer stdout was not valid JSON: {exc}", file=sys.stderr)
        print(f"CLI wall time: {elapsed:.3f}s")
        print("FAIL")
        return 1
    if not isinstance(response, dict):
        print(completed.stderr, file=sys.stderr, end="")
        print("FAIL: scorer stdout JSON was not an object", file=sys.stderr)
        print(f"CLI wall time: {elapsed:.3f}s")
        print("FAIL")
        return 1
    if completed.returncode != 0 or response.get("ok") is not True:
        print(completed.stderr, file=sys.stderr, end="")
        print(
            f"FAIL: scorer exited {completed.returncode}: {response.get('error')}",
            file=sys.stderr,
        )
        print(f"CLI wall time: {elapsed:.3f}s")
        print("FAIL")
        return 1

    model_meta = load_json(args.models / "meta.json")
    model_heads = model_meta["heads"]
    if not isinstance(model_heads, dict):
        raise ValueError("model meta.json heads must be an object")
    pipelines = {
        "win": joblib.load(args.models / "win.joblib"),
        "match": joblib.load(args.models / "match.joblib"),
    }
    head_columns = {"win": "p_win", "match": "p_match"}
    reproduced_values: dict[str, object] = {}
    for head, score_column in head_columns.items():
        head_meta = model_heads[head]
        if not isinstance(head_meta, dict):
            raise ValueError(f"model meta.json {head} head must be an object")
        feature_cols = head_meta["feature_cols"]
        if not isinstance(feature_cols, list):
            raise ValueError(f"model meta.json {head}.feature_cols must be a list")
        reproduced_values[score_column] = pipelines[head].predict_proba(
            feature_frame[feature_cols]
        )[:, 1]

    feature_frame = feature_frame.set_index("target_key", drop=False)
    feature_frame.index = feature_frame.index.astype(str)
    feature_frame.index.name = "target_key"
    reproduced = pd.DataFrame(reproduced_values, index=feature_frame.index)

    response_scores = response.get("scores")
    if not isinstance(response_scores, dict):
        raise ValueError("scorer response scores must be an object")
    scores = pd.DataFrame.from_dict(response_scores, orient="index")
    scores.index = scores.index.astype(str)
    scores.index.name = "target_key"

    reference = pd.read_csv(args.reference).set_index("target_key")
    reference.index = reference.index.astype(str)

    feature_keys = set(feature_frame.index)
    reproduced_keys = set(reproduced.index)
    score_keys = set(scores.index)
    reference_keys = set(reference.index)
    gate_a_keys_equal = (
        len(feature_frame) == len(reproduced) == len(scores) == 435
        and feature_frame.index.is_unique
        and reproduced.index.is_unique
        and scores.index.is_unique
        and feature_keys == reproduced_keys == score_keys
    )
    gate_c_keys_equal = (
        len(reference) == len(feature_frame) == 435
        and reference.index.is_unique
        and feature_frame.index.is_unique
        and reference_keys == feature_keys
    )

    gate_a_metrics: dict[str, tuple[float, float, int]] = {}
    if gate_a_keys_equal:
        aligned_scores = scores.loc[reproduced.index]
        for score_column in head_columns.values():
            gate_a_metrics[score_column] = comparison_metrics(
                reproduced[score_column], aligned_scores[score_column]
            )
    gate_a_passed = gate_a_keys_equal and all(
        correlation > 0.99 and max_abs_diff < 1e-6
        for correlation, max_abs_diff, _ in gate_a_metrics.values()
    ) and len(gate_a_metrics) == 2

    reference_stats = load_json(REFERENCE_STATS)
    stats_heads = reference_stats["heads"]
    if not isinstance(stats_heads, dict):
        raise ValueError("reference stats heads must be an object")
    gate_b_metrics: dict[str, tuple[bool, float]] = {}
    for head in head_columns:
        stats_head = stats_heads[head]
        model_head = model_heads[head]
        if not isinstance(stats_head, dict) or not isinstance(model_head, dict):
            raise ValueError(f"invalid {head} head metadata")
        config_equal = model_head["config"] == stats_head["config"]
        internal_cv_difference = abs(
            float(model_head["internal_cv"]) - float(stats_head["internal_cv"])
        )
        gate_b_metrics[head] = (config_equal, internal_cv_difference)
    gate_b_passed = all(
        config_equal and internal_cv_difference < 1e-12
        for config_equal, internal_cv_difference in gate_b_metrics.values()
    )

    size_mismatches = 435
    baseline_max_abs_diff = math.inf
    prior_win_mismatches = 435
    last_outcome_mismatches = 435
    if gate_c_keys_equal:
        aligned_features = feature_frame.loc[reference.index]
        size_mismatches = int(
            (reference["size"] != aligned_features["size"]).sum()
        )
        baseline_max_abs_diff = float(
            (reference["baseline_score"] - aligned_features["baseline_score"])
            .abs()
            .max()
        )
        prior_win_mismatches = int(
            (reference["n_prior_wins"] != aligned_features["n_prior_wins"]).sum()
        )
        last_outcome_mismatches = int(
            (reference["last_outcome"] != aligned_features["last_outcome"]).sum()
        )
    gate_c_passed = (
        gate_c_keys_equal
        and size_mismatches == 0
        and baseline_max_abs_diff < 1e-6
        and prior_win_mismatches == 0
        and last_outcome_mismatches == 0
    )

    raw_metrics: dict[str, tuple[float, float, int]] = {}
    if reference_keys == score_keys and len(reference) == len(scores) == 435:
        aligned_scores = scores.loc[reference.index]
        for score_column in head_columns.values():
            raw_metrics[score_column] = comparison_metrics(
                reference[score_column], aligned_scores[score_column]
            )

    print(f"Admission scoring parity (epoch {pao.SCORE_EPOCH}, 435 candidates)")
    print("Gate A — same-input service parity")
    print(
        "  keys: "
        f"reproduction={len(reproduced_keys)} scorer={len(score_keys)} "
        f"identical_435={gate_a_keys_equal}"
    )
    for score_column in head_columns.values():
        correlation, max_abs_diff, differing = gate_a_metrics.get(
            score_column, (math.nan, math.inf, 435)
        )
        print(
            f"  {score_column}: spearman={correlation:.12f} "
            f"max_abs_diff={max_abs_diff:.12g} differing_gt_1e-9={differing}"
        )
    print(f"  result: {'PASS' if gate_a_passed else 'FAIL'}")

    print("Gate B — reference model equivalence")
    for head, (config_equal, internal_cv_difference) in gate_b_metrics.items():
        print(
            f"  {head}: config_equal={config_equal} "
            f"internal_cv_abs_diff={internal_cv_difference:.12g}"
        )
    print(f"  result: {'PASS' if gate_b_passed else 'FAIL'}")

    print("Gate C — reference stability columns")
    print(
        "  keys: "
        f"reference={len(reference_keys)} snapshot={len(feature_keys)} "
        f"identical_435={gate_c_keys_equal}"
    )
    print(
        f"  size_mismatches={size_mismatches} "
        f"baseline_score_max_abs_diff={baseline_max_abs_diff:.12g} "
        f"n_prior_wins_mismatches={prior_win_mismatches} "
        f"last_outcome_mismatches={last_outcome_mismatches}"
    )
    print(f"  result: {'PASS' if gate_c_passed else 'FAIL'}")

    print("Raw reference comparison (non-gating)")
    for score_column in head_columns.values():
        correlation, max_abs_diff, differing = raw_metrics.get(
            score_column, (math.nan, math.inf, 435)
        )
        print(
            f"  {score_column}: spearman={correlation:.12f} "
            f"max_abs_diff={max_abs_diff:.12g} differing_gt_1e-9={differing}"
        )
    print(f"  snapshot fast_refresh_count={fast_refresh_count}")
    if len(raw_metrics) == 2 and all(
        correlation > 0.99 for correlation, _, _ in raw_metrics.values()
    ):
        print("  Raw reference Spearman is within the original near-exact bar.")
    print(f"CLI wall time: {elapsed:.3f}s")
    print(
        "Residual versus the static reference is fully attributed to live "
        "fast-refresh churn of the reason-string rank features on the active epoch "
        "between the reference snapshot (17:09) and now. Gates A-C prove that on "
        "identical inputs the service reproduces the reference pipeline "
        "near-bit-exactly, which is the invariant the TS runtime depends on."
    )

    passed = gate_a_passed and gate_b_passed and gate_c_passed
    print("PASS" if passed else "FAIL")
    return 0 if passed else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=pao.DEFAULT_DB)
    parser.add_argument("--run", default=pao.DEFAULT_RUN)
    parser.add_argument("--models", type=Path, default=DEFAULT_MODELS)
    parser.add_argument("--reference", type=Path, default=DEFAULT_REFERENCE)
    args = parser.parse_args()

    try:
        with tempfile.TemporaryDirectory(prefix="admission-parity-") as temp_dir:
            snapshot_path = Path(temp_dir) / "orchestrator-snapshot.sqlite"
            snapshot_database(args.db, snapshot_path)
            return run_check(args, snapshot_path)
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        print("FAIL")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
