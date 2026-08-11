#!/usr/bin/env python3
"""Score scheduler candidates with the persisted admission-predictor heads.

History is built from closed, full-board epochs before the current active
epoch, rather than from the training-time ordinal constants.  The training
history epochs [25, 26, 27, 28, 30, 32] are exactly the session's closed
full-board passes.  Fixed-size epochs (19-24, 29, 31, and 33) are repair or
boundary boards with different admission semantics, so excluding them
preserves training feature parity while allowing future full passes to become
history.  The currently active epoch is always excluded.

The process protocol is deliberately strict: stdin and stdout contain one JSON
request and one JSON response, respectively.  Diagnostics and timing are sent
only to stderr.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import numbers
import sys
import time
import traceback
from pathlib import Path
from typing import Any


PROCESS_STARTED = time.perf_counter()
HERE = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODELS = ROOT / "analysis/models/admission-predictor-2026-07-13"


def _load(name: str, filename: str):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    if spec is None or spec.loader is None:
        raise ImportError(f"could not load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# Loading common first applies its thread limits and registers pao before any
# sklearn import.  Both modules still go through the guarded local loader.  The
# bootstrap is guarded too because the JSON error envelope covers import-time
# failures as well as failures in main().
try:
    common = _load("predict_admission_common", "predict-admission-common.py")
    pao = _load("pao", "predict-admission-outcomes.py")

    import joblib  # noqa: E402
    import numpy as np  # noqa: E402
    import pandas as pd  # noqa: E402
    import sklearn  # noqa: E402
except BaseException as exc:
    if __name__ != "__main__":
        raise
    error = str(exc) or type(exc).__name__
    traceback.print_exc(file=sys.stderr)
    print(
        json.dumps({"ok": False, "error": error}, separators=(",", ":")),
        flush=True,
    )
    print(
        f"scorer wall time: {time.perf_counter() - PROCESS_STARTED:.3f}s",
        file=sys.stderr,
        flush=True,
    )
    raise SystemExit(1)


RANK_COLUMNS = {
    "total_priority": "rank_board",
    "information_priority_score": "rank_info_priority",
    "high_accuracy_bonus": "rank_high_acc_bonus",
    "accuracy_readiness_bonus": "rank_acc_readiness_bonus",
    "closeness_fallback_score": "rank_closeness_fallback",
    "opseq_rerank_bonus": "rank_opseq_rerank",
    "closeness_score": "sig_closeness",
    "information_gain_score": "sig_information_gain",
    "unlock_score": "sig_unlock",
    "completion_readiness_score": "sig_readiness",
    "context_quality_score": "sig_context",
    "risk_penalty": "sig_risk",
    "opseq_analog_count": "opseq_analog_count",
    "opseq_best_analog_score": "opseq_best_analog",
    "opseq_best_matched_analog_score": "opseq_matched_best",
}

CANDIDATE_NUMERIC_FIELDS = ("size", "fuzzy", "priority", "window_index")
MODEL_FILES = ("win.joblib", "match.joblib", "meta.json")


class JsonArgumentParser(argparse.ArgumentParser):
    """Turn argparse failures into errors handled by the JSON envelope."""

    def error(self, message: str) -> None:
        raise ValueError(f"argument error: {message}")


def _numeric(value: Any) -> float:
    """Return a finite JSON number as float, otherwise the model's NaN sentinel."""
    if isinstance(value, bool) or not isinstance(value, numbers.Real):
        return np.nan
    number = float(value)
    return number if math.isfinite(number) else np.nan


def _read_request() -> list[Any]:
    payload = json.load(sys.stdin)
    if not isinstance(payload, dict):
        raise ValueError("stdin JSON must be an object")
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        raise ValueError("stdin JSON must contain a candidates array")
    return candidates


def _load_models(model_dir: Path) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    missing = [name for name in MODEL_FILES if not (model_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(
            f"model directory {model_dir} is missing: {', '.join(missing)}"
        )

    with (model_dir / "meta.json").open(encoding="utf-8") as handle:
        meta = json.load(handle)
    if not isinstance(meta, dict):
        raise ValueError("meta.json must contain a JSON object")

    heads_meta = meta.get("heads")
    if not isinstance(heads_meta, dict):
        # Accept the equivalent top-level representation defensively; fitted
        # artifacts produced by the companion fit script use ``heads``.
        heads_meta = {head: meta.get(head) for head in ("win", "match")}
    for head in ("win", "match"):
        head_meta = heads_meta.get(head)
        if not isinstance(head_meta, dict):
            raise ValueError(f"meta.json is missing metadata for {head} head")
        cols = head_meta.get("feature_cols")
        if not isinstance(cols, list) or not all(isinstance(col, str) for col in cols):
            raise ValueError(f"meta.json has invalid {head}.feature_cols")

    versions = meta.get("versions")
    fitted_sklearn = versions.get("sklearn") if isinstance(versions, dict) else None
    warnings_out: list[str] = []
    if fitted_sklearn != sklearn.__version__:
        warnings_out.append(
            "model sklearn version "
            f"{fitted_sklearn!r} differs from runtime {sklearn.__version__!r}"
        )

    pipes = {
        "win": joblib.load(model_dir / "win.joblib"),
        "match": joblib.load(model_dir / "match.joblib"),
    }
    return pipes, heads_meta, warnings_out


def _load_history(
    db_path: Path, session_id: str, warnings_out: list[str]
) -> tuple[dict[int, dict[str, Any]], list[int], int]:
    conn = pao.open_db_readonly(db_path)
    try:
        epoch_rows = conn.execute(
            "SELECT id, ordinal, status, size_mode, closed_at "
            "FROM epochs WHERE session_id = ? ORDER BY ordinal",
            (session_id,),
        ).fetchall()
        if not epoch_rows:
            raise ValueError(f"session {session_id!r} has no epochs")

        active_ordinals = [
            int(row["ordinal"]) for row in epoch_rows if row["status"] == "active"
        ]
        active_ordinal = min(active_ordinals) if active_ordinals else math.inf
        epoch_ids_with_targets = {
            row["epoch_id"]
            for row in conn.execute(
                "SELECT DISTINCT et.epoch_id FROM epoch_targets AS et "
                "JOIN epochs AS e ON e.id = et.epoch_id WHERE e.session_id = ?",
                (session_id,),
            ).fetchall()
        }

        id_of: dict[int, str] = {}
        for row in epoch_rows:
            ordinal = int(row["ordinal"])
            if (
                row["size_mode"] == "full"
                and row["closed_at"] is not None
                and row["status"] != "active"
                and ordinal < active_ordinal
                and row["id"] in epoch_ids_with_targets
            ):
                id_of[ordinal] = row["id"]

        history_ordinals = sorted(id_of)
        if not history_ordinals:
            warnings_out.append(
                "session has no eligible closed full-board history epochs; "
                "using cold-start history features"
            )
        outcomes = {
            ordinal: pao.load_epoch_outcomes(conn, ordinal, id_of[ordinal])
            for ordinal in history_ordinals
        }
    finally:
        conn.close()

    candidate_ordinal = (
        int(active_ordinal)
        if math.isfinite(active_ordinal)
        else (max(history_ordinals) + 1 if history_ordinals else 0)
    )
    return outcomes, history_ordinals, candidate_ordinal


def _build_candidate_frame(
    candidates: list[Any],
    outcomes: dict[int, dict[str, Any]],
    history_ordinals: list[int],
    candidate_ordinal: int,
    warnings_out: list[str],
) -> tuple[pd.DataFrame, list[str]]:
    rows_by_key: dict[str, dict[str, Any]] = {}
    skipped = 0
    duplicates = 0
    missing_rank_blocks = 0
    partial_rank_candidates = 0
    partial_rank_values = 0
    incomplete_numeric_candidates = 0
    incomplete_numeric_values = 0

    for candidate in candidates:
        if not isinstance(candidate, dict):
            skipped += 1
            continue
        target_key = candidate.get("target_key")
        if not isinstance(target_key, str) or not target_key.strip():
            skipped += 1
            continue

        numeric: dict[str, float] = {}
        candidate_missing_numeric = 0
        for field in CANDIDATE_NUMERIC_FIELDS:
            value = _numeric(candidate.get(field))
            numeric[field] = value
            if not math.isfinite(value):
                candidate_missing_numeric += 1
        if candidate_missing_numeric:
            incomplete_numeric_candidates += 1
            incomplete_numeric_values += candidate_missing_numeric

        source_path = candidate.get("source_path")
        if not isinstance(source_path, str) or not source_path:
            source_path = "unknown"

        rank = candidate.get("rank")
        if not isinstance(rank, dict):
            missing_rank_blocks += 1
            rank = {}
            count_partial_rank = False
        else:
            count_partial_rank = True

        record: dict[str, Any] = {
            "target_key": target_key,
            "unit": candidate.get("unit"),
            "symbol": candidate.get("symbol"),
            "source_path": source_path,
            "baseline_score": numeric["fuzzy"],
            "gap_to_exact": 100.0 - numeric["fuzzy"],
            "size": numeric["size"],
            "log_size": (
                math.log(max(numeric["size"], 1.0))
                if math.isfinite(numeric["size"])
                else np.nan
            ),
            "priority": numeric["priority"],
            "admission_index": numeric["window_index"],
            "top_dir": pao.top_dir_of(source_path),
        }

        missing_in_rank = 0
        for source_name, training_name in RANK_COLUMNS.items():
            value = _numeric(rank.get(source_name))
            record[training_name] = value
            if not math.isfinite(value):
                missing_in_rank += 1
        if count_partial_rank and missing_in_rank:
            partial_rank_candidates += 1
            partial_rank_values += missing_in_rank

        record.update(
            pao.history_features(
                target_key,
                candidate_ordinal,
                numeric["fuzzy"],
                outcomes,
                history_ordinals=history_ordinals,
            )
        )
        if target_key in rows_by_key:
            duplicates += 1
        rows_by_key[target_key] = record

    if skipped:
        warnings_out.append(f"skipped {skipped} candidates without a usable target_key")
    if duplicates:
        warnings_out.append(
            f"encountered {duplicates} duplicate target_key entries; last candidate wins"
        )
    if missing_rank_blocks:
        warnings_out.append(f"{missing_rank_blocks} candidates missing rank block")
    if partial_rank_candidates:
        warnings_out.append(
            f"{partial_rank_candidates} candidates had partial/invalid rank data "
            f"({partial_rank_values} values imputed)"
        )
    if incomplete_numeric_candidates:
        warnings_out.append(
            f"{incomplete_numeric_candidates} candidates had missing/non-numeric "
            f"numeric fields ({incomplete_numeric_values} values imputed)"
        )

    target_keys = list(rows_by_key)
    if not target_keys:
        return pd.DataFrame(), target_keys
    return common.add_derived(pd.DataFrame(list(rows_by_key.values()))), target_keys


def _score(args: argparse.Namespace, candidates: list[Any]) -> dict[str, Any]:
    model_dir = Path(args.models).expanduser().resolve()
    db_path = Path(args.db).expanduser().resolve()
    pipes, heads_meta, warnings_out = _load_models(model_dir)
    outcomes, history_ordinals, candidate_ordinal = _load_history(
        db_path, args.session, warnings_out
    )

    frame, target_keys = _build_candidate_frame(
        candidates,
        outcomes,
        history_ordinals,
        candidate_ordinal,
        warnings_out,
    )
    if not target_keys:
        return {
            "ok": True,
            "model_dir": str(model_dir),
            "scored": 0,
            "scores": {},
            "warnings": warnings_out,
        }

    predictions: dict[str, np.ndarray] = {}
    for head in ("win", "match"):
        cols = heads_meta[head]["feature_cols"]
        missing_cols = [col for col in cols if col not in frame.columns]
        for col in missing_cols:
            frame[col] = np.nan
        if missing_cols:
            warnings_out.append(
                f"added {len(missing_cols)} missing feature columns for {head} head: "
                + ", ".join(missing_cols)
            )
        predictions[head] = pipes[head].predict_proba(frame[cols])[:, 1]

    scores = {
        target_key: {
            "p_win": float(predictions["win"][index]),
            "p_match": float(predictions["match"][index]),
        }
        for index, target_key in enumerate(target_keys)
    }
    return {
        "ok": True,
        "model_dir": str(model_dir),
        "scored": len(scores),
        "scores": scores,
        "warnings": warnings_out,
    }


def main() -> int:
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=pao.DEFAULT_DB)
    parser.add_argument("--session", default=pao.DEFAULT_SESSION)
    parser.add_argument("--models", type=Path, default=DEFAULT_MODELS)
    args = parser.parse_args()
    candidates = _read_request()
    response = _score(args, candidates)
    print(json.dumps(response, allow_nan=False, separators=(",", ":")), flush=True)
    return 0


if __name__ == "__main__":
    try:
        exit_code = main()
    except BaseException as exc:  # The process contract includes every fatal path.
        error = str(exc) or type(exc).__name__
        traceback.print_exc(file=sys.stderr)
        print(
            json.dumps(
                {"ok": False, "error": error},
                allow_nan=False,
                separators=(",", ":"),
            ),
            flush=True,
        )
        exit_code = 1
    finally:
        print(
            f"scorer wall time: {time.perf_counter() - PROCESS_STARTED:.3f}s",
            file=sys.stderr,
            flush=True,
        )
    raise SystemExit(exit_code)
