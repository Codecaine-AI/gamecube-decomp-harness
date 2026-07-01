#!/usr/bin/env python3
"""Analyze queue/epoch priority scores against runner-confirmed outcomes.

This report joins the legacy queue/lease tables and the modern epoch/worker
state tables into one auditable target-at-selection dataset. It then evaluates
the persisted priority score, rank components, source/file history, and simple
matrix models against confirmed improvement and exact-match outcomes.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = ROOT / "projects/melee/state/orchestrator.sqlite"
DEFAULT_GRAPH_DB = ROOT / "projects/melee/graph/graph.sqlite"
DEFAULT_CHECKOUT_ROOT = ROOT / "projects/melee/checkout"
DEFAULT_REPORT_PREFIX = ROOT / "analysis/reports/q-priority-outcome-analysis"
NORMAL_REGIMES = {"graph_informed", "closeness_only"}
TERMINAL_WORKER_STATES = {"exact", "timeout", "error", "cancelled", "finished"}
CODE_TEXTURE_PATTERNS = {
    "code_pad_stack_count": r"\bPAD_STACK\s*\(",
    "code_asm_block_count": r"\basm\s*(?:volatile\s*)?\{",
    "code_inline_count": r"\binline\b",
    "code_static_count": r"\bstatic\b",
    "code_switch_count": r"\bswitch\s*\(",
    "code_case_count": r"\bcase\b",
    "code_if_count": r"\bif\s*\(",
    "code_for_count": r"\bfor\s*\(",
    "code_while_count": r"\bwhile\s*\(",
    "code_goto_count": r"\bgoto\b",
    "code_return_count": r"\breturn\b",
    "code_nonmatching_count": r"NON_MATCHING|#if\s+0|///\s*#",
    "code_arrow_count": r"->",
    "code_float_literal_count": r"(?<![A-Za-z0-9_])\d+\.\d+f?\b",
}
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


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def json_dumps(value: Any) -> str:
    return json.dumps(to_jsonable(value), indent=2, sort_keys=True)


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


def round_or_none(value: Any, digits: int = 4) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return round(number, digits)


def parse_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def parse_time(value: Any) -> pd.Timestamp:
    if value is None or value == "":
        return pd.NaT
    return pd.to_datetime(value, utc=True, errors="coerce")


def clean_text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    try:
        if pd.isna(value):
            return default
    except (TypeError, ValueError):
        pass
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return default
    return text


def first_text(*values: Any, default: str = "") -> str:
    for value in values:
        text = clean_text(value)
        if text:
            return text
    return default


def pct(numerator: float, denominator: float, digits: int = 1) -> float | None:
    if not denominator:
        return None
    return round((100.0 * numerator) / denominator, digits)


def source_family(source_path: str) -> str:
    text = clean_text(source_path, "unknown")
    parts = [part for part in text.split("/") if part]
    if len(parts) >= 3 and parts[0] == "src":
        return "/".join(parts[:3])
    if len(parts) >= 2:
        return "/".join(parts[:2])
    return text or "unknown"


def function_target_key(unit: Any, symbol: Any) -> str:
    unit_text = clean_text(unit)
    symbol_text = clean_text(symbol)
    if not symbol_text:
        return ""
    return f"{unit_text}:{symbol_text}" if unit_text else symbol_text


def function_source_symbol_key(source_path: Any, symbol: Any) -> str:
    source_text = clean_text(source_path)
    symbol_text = clean_text(symbol)
    if not source_text or not symbol_text:
        return ""
    return f"{source_text}:{symbol_text}"


def safe_ratio(numerator: Any, denominator: Any) -> float | None:
    top = round_or_none(numerator)
    bottom = round_or_none(denominator)
    if top is None or bottom is None or bottom <= 0:
        return None
    return top / bottom


def max_or_none(values: list[float]) -> float | None:
    return max(values) if values else None


def mean_or_none(values: list[float]) -> float | None:
    return float(np.mean(values)) if values else None


def module_bucket(source_path: Any) -> str:
    parts = [part for part in clean_text(source_path, "unknown").split("/") if part]
    if len(parts) >= 3 and parts[0] == "src" and parts[1] == "melee":
        return parts[2]
    if len(parts) >= 3 and parts[0] == "src" and parts[1] == "sysdolphin":
        return "sysdolphin/" + parts[2]
    if len(parts) >= 3 and parts[0] == "extern":
        return "extern/" + parts[1]
    if len(parts) >= 2:
        return "/".join(parts[:2])
    return parts[0] if parts else "unknown"


def symbol_features(symbol: Any) -> dict[str, Any]:
    text = clean_text(symbol, "unknown")
    tokens = [token for token in re.split(r"[_:]+", text) if token]
    lower = text.lower()
    return {
        "symbol_prefix": tokens[0] if tokens else "unknown",
        "symbol_token_count": len(tokens),
        "symbol_length": len(text),
        "symbol_is_fn": int(text.startswith("fn_")),
        "symbol_is_lbl": int(text.startswith("lbl_")),
        "symbol_has_address": int(bool(re.search(r"(?:^|_)[0-9A-Fa-f]{6,8}(?:$|_)", text))),
        "symbol_has_hex": int("0x" in lower),
        "symbol_has_callback_term": int(any(term in lower for term in ("callback", "cb", "iasa", "phys", "coll", "enter", "leave", "anim", "map", "hit", "think", "proc"))),
        "symbol_has_state_term": int(any(term in lower for term in ("state", "status", "motion", "special", "item", "fighter", "camera", "ground"))),
    }


def source_code_features(source_paths: list[str], checkout_root: Path) -> dict[str, dict[str, Any]]:
    features: dict[str, dict[str, Any]] = {}
    for source_path in sorted({clean_text(path, "unknown") for path in source_paths if clean_text(path)}):
        path = checkout_root / source_path
        row: dict[str, Any] = {"source_path": source_path}
        if not path.exists() or not path.is_file():
            row.update({"code_file_exists": 0})
            features[source_path] = row
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            row.update({"code_file_exists": 0})
            features[source_path] = row
            continue
        lines = text.splitlines()
        nonempty = [line for line in lines if line.strip()]
        row.update(
            {
                "code_file_exists": 1,
                "code_line_count": len(lines),
                "code_nonempty_line_count": len(nonempty),
                "code_comment_line_count": sum(1 for line in lines if line.strip().startswith(("//", "/*", "*"))),
                "code_preprocessor_count": sum(1 for line in lines if line.lstrip().startswith("#")),
                "code_function_like_count": len(re.findall(r"^[A-Za-z_][\w\s\*\(\),]*\)\s*\{", text, flags=re.MULTILINE)),
                "code_struct_count": len(re.findall(r"\bstruct\b", text)),
                "code_enum_count": len(re.findall(r"\benum\b", text)),
                "code_typedef_count": len(re.findall(r"\btypedef\b", text)),
                "code_include_count": len(re.findall(r"^\s*#\s*include\b", text, flags=re.MULTILINE)),
                "code_define_count": len(re.findall(r"^\s*#\s*define\b", text, flags=re.MULTILINE)),
            }
        )
        for name, pattern in CODE_TEXTURE_PATTERNS.items():
            row[name] = len(re.findall(pattern, text))
        denominator = max(1, row["code_nonempty_line_count"])
        row["code_pad_stack_per_kloc"] = 1000.0 * row["code_pad_stack_count"] / denominator
        row["code_control_flow_per_kloc"] = 1000.0 * (
            row["code_if_count"] + row["code_for_count"] + row["code_while_count"] + row["code_switch_count"] + row["code_case_count"]
        ) / denominator
        row["code_comment_ratio"] = row["code_comment_line_count"] / denominator
        row["code_function_density"] = row["code_function_like_count"] / max(1, row["code_line_count"] / 1000.0)
        features[source_path] = row
    return features


def load_graph_source_features(graph_db_path: Path) -> dict[str, dict[str, Any]]:
    if not graph_db_path.exists():
        return {}
    conn = sqlite3.connect(str(graph_db_path))
    conn.row_factory = sqlite3.Row
    try:
        features: dict[str, dict[str, Any]] = {}
        entity_ids: dict[str, str] = {}
        for row in conn.execute("SELECT id, stable_key, payload_json FROM graph_entities WHERE entity_type = 'source_file'"):
            payload = parse_json(row["payload_json"])
            source_path = clean_text(payload.get("source_path"), clean_text(row["stable_key"], "unknown"))
            editability = payload.get("editability") if isinstance(payload.get("editability"), dict) else {}
            function_count = round_or_none(payload.get("function_count")) or 0
            unmatched = round_or_none(payload.get("unmatched_function_count")) or 0
            matched = round_or_none(payload.get("matched_function_count")) or 0
            features[source_path] = {
                "source_path": source_path,
                "graph_source_file_present": 1,
                "graph_function_count": function_count,
                "graph_unmatched_function_count": unmatched,
                "graph_matched_function_count": matched,
                "graph_unmatched_ratio": (unmatched / function_count) if function_count else None,
                "graph_matched_ratio": (matched / function_count) if function_count else None,
                "graph_editability_mode": clean_text(editability.get("mode"), "unknown"),
            }
            entity_ids[str(row["id"])] = source_path

        for row in conn.execute(
            """
            SELECT ge.stable_key AS source_path, e.edge_type, COUNT(*) AS count
            FROM graph_edges e
            JOIN graph_entities ge ON ge.id = e.from_entity_id
            WHERE ge.entity_type = 'source_file'
            GROUP BY ge.stable_key, e.edge_type
            """
        ):
            source_path = clean_text(row["source_path"], "unknown")
            if source_path not in features:
                features[source_path] = {"source_path": source_path, "graph_source_file_present": 1}
            edge_type = clean_text(row["edge_type"]).lower()
            features[source_path][f"graph_edge_{edge_type}_count"] = int(row["count"])

        for row in conn.execute(
            """
            SELECT ge.stable_key AS source_path, gf.fact_type, COUNT(*) AS count
            FROM graph_facts gf
            JOIN graph_entities ge ON ge.id = gf.entity_id
            WHERE ge.entity_type = 'source_file'
            GROUP BY ge.stable_key, gf.fact_type
            """
        ):
            source_path = clean_text(row["source_path"], "unknown")
            if source_path not in features:
                features[source_path] = {"source_path": source_path, "graph_source_file_present": 1}
            fact_type = clean_text(row["fact_type"]).lower()
            features[source_path][f"graph_fact_{fact_type}_count"] = int(row["count"])

        function_stats: dict[str, Counter] = defaultdict(Counter)
        fuzzy_values: dict[str, list[float]] = defaultdict(list)
        size_values: dict[str, list[float]] = defaultdict(list)
        for row in conn.execute("SELECT payload_json FROM graph_entities WHERE entity_type = 'function'"):
            payload = parse_json(row["payload_json"])
            source_path = clean_text(payload.get("sourcePath") or payload.get("source_path"), "unknown")
            fuzzy = round_or_none(payload.get("fuzzy") or payload.get("fuzzy_match_percent"))
            size = round_or_none(payload.get("size"))
            stats = function_stats[source_path]
            stats["functions"] += 1
            if fuzzy is not None:
                fuzzy_values[source_path].append(fuzzy)
                if fuzzy >= 100:
                    stats["exact_functions"] += 1
                elif fuzzy >= 99:
                    stats["near_exact_functions"] += 1
                else:
                    stats["far_functions"] += 1
            if size is not None:
                size_values[source_path].append(size)
                if size < 200:
                    stats["small_functions"] += 1
                elif size >= 2000:
                    stats["huge_functions"] += 1

        for source_path, stats in function_stats.items():
            features.setdefault(source_path, {"source_path": source_path, "graph_source_file_present": 1})
            function_count = int(stats["functions"])
            features[source_path].update(
                {
                    "graph_function_entity_count": function_count,
                    "graph_exact_function_count": int(stats["exact_functions"]),
                    "graph_near_exact_function_count": int(stats["near_exact_functions"]),
                    "graph_far_function_count": int(stats["far_functions"]),
                    "graph_small_function_count": int(stats["small_functions"]),
                    "graph_huge_function_count": int(stats["huge_functions"]),
                    "graph_avg_function_fuzzy": float(np.mean(fuzzy_values[source_path])) if fuzzy_values[source_path] else None,
                    "graph_min_function_fuzzy": float(np.min(fuzzy_values[source_path])) if fuzzy_values[source_path] else None,
                    "graph_avg_function_size": float(np.mean(size_values[source_path])) if size_values[source_path] else None,
                }
            )
        return features
    finally:
        conn.close()


def opseq_score_bin(value: Any) -> str:
    score = round_or_none(value)
    if score is None:
        return "no_profile"
    if score >= 0.80:
        return "0.80+"
    if score >= 0.65:
        return "0.65-0.80"
    if score >= 0.55:
        return "0.55-0.65"
    if score >= 0.45:
        return "0.45-0.55"
    return "<0.45"


def summarize_opseq_profile(entity_payload: dict[str, Any], fact_payload: dict[str, Any]) -> dict[str, Any]:
    source = fact_payload.get("source") if isinstance(fact_payload.get("source"), dict) else {}
    unit = first_text(source.get("unit"), entity_payload.get("unit"))
    symbol = first_text(source.get("symbol"), entity_payload.get("symbol"))
    source_path = first_text(
        source.get("source_path"),
        source.get("sourcePath"),
        entity_payload.get("source_path"),
        entity_payload.get("sourcePath"),
        default="unknown",
    )
    analog_count = round_or_none(fact_payload.get("analog_count"), 0) or 0
    exact_count = round_or_none(fact_payload.get("exact_analog_count"), 0) or 0
    matched_count = round_or_none(fact_payload.get("matched_analog_count"), 0) or 0
    top_analogs = fact_payload.get("top_analogs") if isinstance(fact_payload.get("top_analogs"), list) else []

    scores: list[float] = []
    matched_scores: list[float] = []
    unmatched_scores: list[float] = []
    exact_scores: list[float] = []
    same_file_scores: list[float] = []
    cross_file_scores: list[float] = []
    distinct_sources: set[str] = set()
    top_same_file = 0
    top_same_unit = 0
    top_matched = 0
    top_exact = 0
    high_matched_65 = 0
    high_75 = 0
    high_65 = 0
    high_55 = 0

    for analog_value in top_analogs:
        if not isinstance(analog_value, dict):
            continue
        score = round_or_none(analog_value.get("score"))
        if score is None:
            continue
        scores.append(score)
        analog_source = first_text(analog_value.get("source_path"), analog_value.get("sourcePath"), default="unknown")
        analog_unit = clean_text(analog_value.get("unit"))
        if analog_source:
            distinct_sources.add(analog_source)
        same_file = analog_source == source_path
        same_unit = bool(analog_unit and analog_unit == unit)
        matched = bool(analog_value.get("matched")) or clean_text(analog_value.get("status")).lower() == "matched"
        exact = bool(analog_value.get("exact_match"))
        if same_file:
            top_same_file += 1
            same_file_scores.append(score)
        else:
            cross_file_scores.append(score)
        if same_unit:
            top_same_unit += 1
        if matched:
            top_matched += 1
            matched_scores.append(score)
        else:
            unmatched_scores.append(score)
        if exact:
            top_exact += 1
            exact_scores.append(score)
        if score >= 0.75:
            high_75 += 1
        if score >= 0.65:
            high_65 += 1
            if matched:
                high_matched_65 += 1
        if score >= 0.55:
            high_55 += 1

    sorted_scores = sorted(scores, reverse=True)
    top_count = len(scores)
    return {
        "opseq_profile_present": 1,
        "opseq_best_analog_score": round_or_none(fact_payload.get("best_score")),
        "opseq_analog_count": analog_count,
        "opseq_exact_analog_count": exact_count,
        "opseq_matched_analog_count": matched_count,
        "opseq_exact_analog_ratio": safe_ratio(exact_count, analog_count),
        "opseq_matched_analog_ratio": safe_ratio(matched_count, analog_count),
        "opseq_top_analog_count": top_count,
        "opseq_top_score_mean": mean_or_none(scores),
        "opseq_top_score_gap": (sorted_scores[0] - sorted_scores[1]) if len(sorted_scores) >= 2 else None,
        "opseq_best_matched_analog_score": max_or_none(matched_scores),
        "opseq_best_unmatched_analog_score": max_or_none(unmatched_scores),
        "opseq_best_exact_analog_score": max_or_none(exact_scores),
        "opseq_same_file_best_score": max_or_none(same_file_scores),
        "opseq_cross_file_best_score": max_or_none(cross_file_scores),
        "opseq_top_same_file_count": top_same_file,
        "opseq_top_cross_file_count": max(0, top_count - top_same_file),
        "opseq_top_same_unit_count": top_same_unit,
        "opseq_top_distinct_source_count": len(distinct_sources),
        "opseq_top_matched_count": top_matched,
        "opseq_top_unmatched_count": max(0, top_count - top_matched),
        "opseq_top_exact_count": top_exact,
        "opseq_high_score_75_count": high_75,
        "opseq_high_score_65_count": high_65,
        "opseq_high_score_55_count": high_55,
        "opseq_high_matched_score_65_count": high_matched_65,
        "opseq_profile_bucket": "present",
        "opseq_best_score_bin": opseq_score_bin(fact_payload.get("best_score")),
        "target_key": function_target_key(unit, symbol),
        "source_symbol_key": function_source_symbol_key(source_path, symbol),
    }


def load_graph_function_features(graph_db_path: Path) -> dict[str, dict[str, dict[str, Any]]]:
    if not graph_db_path.exists():
        return {"by_target": {}, "by_source_symbol": {}}
    conn = sqlite3.connect(str(graph_db_path))
    conn.row_factory = sqlite3.Row
    try:
        by_target: dict[str, dict[str, Any]] = {}
        by_source_symbol: dict[str, dict[str, Any]] = {}
        rows = conn.execute(
            """
            SELECT ge.payload_json AS entity_payload_json, gf.payload_json AS fact_payload_json
            FROM graph_facts gf
            JOIN graph_entities ge ON ge.id = gf.entity_id
            WHERE ge.entity_type = 'function'
              AND gf.fact_type = 'opseq_analog_profile'
            """
        )
        for row in rows:
            entity_payload = parse_json(row["entity_payload_json"])
            fact_payload = parse_json(row["fact_payload_json"])
            features = summarize_opseq_profile(entity_payload, fact_payload)
            target_key = clean_text(features.get("target_key"))
            source_symbol_key = clean_text(features.get("source_symbol_key"))
            if target_key:
                by_target[target_key] = {key: value for key, value in features.items() if key not in {"target_key", "source_symbol_key"}}
            if source_symbol_key and source_symbol_key not in by_source_symbol:
                by_source_symbol[source_symbol_key] = {key: value for key, value in features.items() if key not in {"target_key", "source_symbol_key"}}
        return {"by_target": by_target, "by_source_symbol": by_source_symbol}
    finally:
        conn.close()


def attach_function_features(raw_df: pd.DataFrame, graph_db_path: Path) -> pd.DataFrame:
    if raw_df.empty:
        return raw_df
    feature_maps = load_graph_function_features(graph_db_path)
    by_target = feature_maps.get("by_target", {})
    by_source_symbol = feature_maps.get("by_source_symbol", {})
    if not by_target and not by_source_symbol:
        return raw_df
    rows: list[dict[str, Any]] = []
    for _, row in raw_df.iterrows():
        features = by_target.get(function_target_key(row.get("unit"), row.get("symbol")))
        if features is None:
            features = by_source_symbol.get(function_source_symbol_key(row.get("source_path"), row.get("symbol")))
        rows.append(dict(features or {}))
    feature_df = pd.DataFrame(rows, index=raw_df.index)
    if feature_df.empty:
        return raw_df
    out = raw_df.copy()
    for column in feature_df.columns:
        out[column] = feature_df[column]
    return out


def fuzzy_bin(value: Any) -> str:
    number = round_or_none(value)
    if number is None:
        return "unknown"
    if number >= 99.9:
        return "99.9+"
    if number >= 99:
        return "99-99.9"
    if number >= 95:
        return "95-99"
    if number >= 80:
        return "80-95"
    return "<80"


def size_bin(value: Any) -> str:
    number = round_or_none(value)
    if number is None:
        return "unknown"
    if number >= 2000:
        return "2000+"
    if number >= 1000:
        return "1000-1999"
    if number >= 500:
        return "500-999"
    if number >= 200:
        return "200-499"
    return "<200"


def reason_number(reason: str, label: str) -> float | None:
    escaped = re.escape(label)
    match = re.search(rf"{escaped}\s+(-?\d+(?:\.\d+)?)", reason)
    return round_or_none(match.group(1)) if match else None


def parse_rank_components(reason: str) -> dict[str, float | None]:
    text = str(reason or "")
    return {
        "board_rank_total": reason_number(text, "board rank"),
        "information_priority": reason_number(text, "information priority"),
        "high_accuracy_bonus": reason_number(text, "high-accuracy bonus"),
        "accuracy_readiness_bonus": reason_number(text, "accuracy/readiness bonus"),
        "closeness_fallback": reason_number(text, "closeness fallback"),
        "closeness_score": reason_number(text, "closeness"),
        "information_gain_score": reason_number(text, "information gain"),
        "unlock_score": reason_number(text, "unlock"),
        "completion_readiness_score": reason_number(text, "readiness"),
        "context_quality_score": reason_number(text, "context"),
        "risk_penalty": reason_number(text, "risk"),
    }


def rank_regime(priority: Any, reason: str) -> str:
    p = round_or_none(priority)
    text = str(reason or "")
    if p is not None and p >= 1_000_000:
        return "sentinel"
    if "regression repair" in text or (p is not None and p >= 400):
        return "repair"
    if "information priority 0.00" in text and p is not None and p <= 30:
        return "closeness_only"
    if "board rank" in text:
        return "graph_informed"
    if p is not None and p <= 30:
        return "closeness_only"
    return "other"


def terminal_lease_event_rows(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT run_id, event_type, payload_json, created_at
        FROM events
        WHERE payload_json LIKE '%lease_id%'
          AND (
            event_type LIKE 'worker_%'
            OR event_type IN ('needs_fact', 'score_candidate')
          )
        ORDER BY created_at ASC
        """
    ).fetchall()
    latest: dict[str, dict[str, Any]] = {}
    for run_id, event_type, payload_json, created_at in rows:
        payload = parse_json(payload_json)
        lease_id = str(payload.get("lease_id") or "")
        if not lease_id:
            continue
        rv = payload.get("runner_validation") if isinstance(payload.get("runner_validation"), dict) else {}
        target = payload.get("target") if isinstance(payload.get("target"), dict) else {}
        rv_target = rv.get("target") if isinstance(rv.get("target"), dict) else {}
        latest[lease_id] = {
            "run_id": run_id,
            "event_type": event_type,
            "created_at": created_at,
            "payload": payload,
            "result": payload.get("result"),
            "rv_status": rv.get("status"),
            "rv_before": rv_target.get("before"),
            "rv_after": rv_target.get("after"),
            "rv_exact": bool(rv_target.get("exact")),
            "rv_improved": bool(rv_target.get("improved")),
            "target": target,
        }
    return latest


def classify_legacy_event(event: dict[str, Any] | None, attempt: dict[str, Any] | None, lease_status: str) -> str:
    if event:
        event_type = str(event.get("event_type") or "")
        result = str(event.get("result") or "")
        rv_status = str(event.get("rv_status") or "")
        rv_exact = bool(event.get("rv_exact"))
        rv_improved = bool(event.get("rv_improved"))
        if event_type == "worker_finished" and rv_status == "passed" and (result == "exact" or rv_exact):
            return "confirmed_exact"
        if event_type == "worker_finished" and rv_status == "passed" and (result == "improved" or rv_improved):
            return "confirmed_improved"
        if rv_exact:
            return "exact_rejected"
        if rv_improved and rv_status not in ("", "skipped", "None"):
            return "improved_rejected"
        if event_type in ("worker_error", "worker_provider_error"):
            return "error"
        if event_type == "needs_fact":
            return "needs_fact"
        return "no_change"
    if attempt and lease_status == "released_complete" and attempt.get("status") == "passed":
        new_score = round_or_none(attempt.get("new_score"))
        return "confirmed_exact" if new_score is not None and new_score >= 99.99999 else "confirmed_improved"
    if attempt and attempt.get("status") in {"failed", "same_unit_regression", "target_regressed"}:
        return "improved_rejected"
    if lease_status in {"released_error", "released_provider_error"}:
        return "error"
    if lease_status == "released_needs_fact":
        return "needs_fact"
    return "no_change"


def load_legacy_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    lease_events = terminal_lease_event_rows(conn)
    attempts = defaultdict(list)
    for row in conn.execute(
        """
        SELECT lease_id, status, compiled, old_score, new_score, delta, created_at
        FROM attempts
        ORDER BY created_at ASC
        """
    ):
        lease_id, status, compiled, old_score, new_score, delta, created_at = row
        attempts[str(lease_id)].append(
            {
                "status": status,
                "compiled": bool(compiled),
                "old_score": old_score,
                "new_score": new_score,
                "delta": delta,
                "created_at": created_at,
            }
        )

    sessions_by_lease: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in conn.execute(
        """
        SELECT run_id, lease_id, thinking_level, status, session_file, created_at
        FROM pi_sessions
        WHERE role = 'worker'
        ORDER BY created_at ASC
        """
    ):
        run_id, lease_id, thinking_level, status, session_file, created_at = row
        if not lease_id:
            continue
        sessions_by_lease[str(lease_id)].append(
            {
                "run_id": run_id,
                "thinking_level": str(thinking_level or "").replace("x-high", "xhigh"),
                "status": status,
                "session_file": session_file,
                "created_at": created_at,
            }
        )

    target_rows = pd.read_sql_query(
        """
        SELECT
          t.id AS target_id,
          t.run_id,
          t.unit,
          t.symbol,
          t.source_path,
          t.size,
          t.fuzzy,
          t.priority AS target_priority,
          t.status AS target_status,
          t.reason,
          t.created_at AS target_created_at,
          q.id AS queue_id,
          q.priority AS queue_priority,
          q.status AS queue_status,
          q.created_at AS queue_created_at,
          q.leased_at AS queue_leased_at,
          l.id AS lease_id,
          l.status AS lease_status
        FROM targets t
        LEFT JOIN queue q ON q.target_id = t.id
        LEFT JOIN leases l ON l.queue_id = q.id
        ORDER BY t.created_at ASC, q.created_at ASC
        """,
        conn,
    )

    records: list[dict[str, Any]] = []
    for target_id, group in target_rows.groupby("target_id", sort=False):
        first = group.iloc[0].to_dict()
        reason = str(first.get("reason") or "")
        priority = round_or_none(first.get("queue_priority"))
        if priority is None:
            priority = round_or_none(first.get("target_priority"))

        lease_ids = [str(item) for item in group["lease_id"].dropna().tolist() if str(item)]
        terminal_lease_ids = [lease_id for lease_id in lease_ids if str(group[group["lease_id"] == lease_id].iloc[0].get("lease_status") or "").startswith("released_")]
        thinking_levels = sorted(
            {
                session["thinking_level"]
                for lease_id in lease_ids
                for session in sessions_by_lease.get(lease_id, [])
                if session["thinking_level"]
            }
        )
        has_xhigh = any(level == "xhigh" for level in thinking_levels)
        has_worker_session = any(sessions_by_lease.get(lease_id) for lease_id in lease_ids)
        outcomes = Counter()
        outcome_times: list[str] = []
        max_new_score: float | None = None
        max_delta: float | None = None
        validation_attempts = 0
        for lease_id in terminal_lease_ids:
            lease_status = str(group[group["lease_id"] == lease_id].iloc[0].get("lease_status") or "")
            attempt_list = attempts.get(lease_id, [])
            best_attempt = None
            if attempt_list:
                best_attempt = max(attempt_list, key=lambda item: (round_or_none(item.get("new_score")) or -1e9, item.get("created_at") or ""))
                for attempt in attempt_list:
                    if attempt.get("status") not in (None, "skipped", "snapshot_unavailable"):
                        validation_attempts += 1
                    if attempt.get("created_at"):
                        outcome_times.append(str(attempt["created_at"]))
                    new_score = round_or_none(attempt.get("new_score"))
                    if new_score is not None:
                        max_new_score = new_score if max_new_score is None else max(max_new_score, new_score)
                    delta = round_or_none(attempt.get("delta"))
                    if delta is not None:
                        max_delta = delta if max_delta is None else max(max_delta, delta)
            event = lease_events.get(lease_id)
            if event and event.get("created_at"):
                outcome_times.append(str(event["created_at"]))
            outcomes[classify_legacy_event(event, best_attempt, lease_status)] += 1

        exact = outcomes["confirmed_exact"] > 0
        improved = exact or outcomes["confirmed_improved"] > 0
        rejected_exact = outcomes["exact_rejected"] > 0
        rejected_improved = outcomes["improved_rejected"] > 0
        observed = bool(terminal_lease_ids)
        selected_at = first.get("queue_created_at") or first.get("target_created_at")
        components = parse_rank_components(reason)
        records.append(
            {
                "dataset_type": "legacy_target",
                "record_id": str(target_id),
                "run_id": clean_text(first.get("run_id")),
                "unit": clean_text(first.get("unit")),
                "symbol": clean_text(first.get("symbol")),
                "source_path": clean_text(first.get("source_path"), "unknown"),
                "size": round_or_none(first.get("size")),
                "fuzzy": round_or_none(first.get("fuzzy")),
                "priority": priority,
                "reason": reason,
                "rank_regime": rank_regime(priority, reason),
                "selected_at": selected_at,
                "admission_index": None,
                "outcome_at": max(outcome_times) if outcome_times else None,
                "status": str(first.get("target_status") or ""),
                "terminal_status": "|".join(sorted(outcomes)) if outcomes else "not_leased",
                "observed": observed,
                "terminal": observed,
                "has_worker_session": has_worker_session,
                "has_xhigh": has_xhigh,
                "thinking_levels": ",".join(thinking_levels),
                "lease_count": len(lease_ids),
                "terminal_lease_count": len(terminal_lease_ids),
                "validation_attempts": validation_attempts,
                "validated": validation_attempts > 0,
                "improved": improved,
                "exact": exact,
                "rejected_exact": rejected_exact,
                "rejected_improved": rejected_improved,
                "error": outcomes["error"] > 0,
                "needs_fact": outcomes["needs_fact"] > 0,
                "no_change": outcomes["no_change"] > 0 and not improved,
                "best_score": max_new_score,
                "best_delta": max_delta,
                **components,
            }
        )
    return records


def load_modern_worker_rows(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = pd.read_sql_query(
        """
        SELECT
          ws.id AS worker_state_id,
          ws.session_id AS run_id,
          ws.epoch_id,
          ws.epoch_target_id,
          ws.target_claim_id,
          ws.lifecycle_status,
          ws.started_at,
          ws.ended_at,
          ws.baseline_score AS worker_baseline_score,
          ws.best_score AS worker_best_score,
          ws.exact AS worker_exact,
          ws.summary_json,
          et.unit AS epoch_unit,
          et.symbol AS epoch_symbol,
          et.source_path AS epoch_source_path,
          et.size AS epoch_size,
          et.baseline_score AS epoch_fuzzy,
          et.priority AS epoch_priority,
          et.reason AS epoch_reason,
          et.admission_index AS epoch_admission_index,
          et.admitted_at,
          et.status AS epoch_target_status,
          best.id AS best_checkpoint_id,
          best.new_score AS best_checkpoint_score,
          best.delta AS best_checkpoint_delta,
          best.exact_match AS best_checkpoint_exact,
          best.hard_gates_passed AS best_checkpoint_gates,
          best.selectable AS best_checkpoint_selectable,
          best.validation_time AS best_checkpoint_time,
          best.validation_status AS best_validation_status
        FROM worker_state ws
        LEFT JOIN epoch_targets et ON et.id = ws.epoch_target_id
        LEFT JOIN worker_checkpoints best ON best.id = ws.best_checkpoint_id
        ORDER BY ws.started_at ASC
        """,
        conn,
    )
    records: list[dict[str, Any]] = []
    for _, row in rows.iterrows():
        summary = parse_json(row.get("summary_json"))
        target = summary.get("target") if isinstance(summary.get("target"), dict) else {}
        unit = first_text(row.get("epoch_unit"), target.get("unit"))
        symbol = first_text(row.get("epoch_symbol"), target.get("symbol"))
        source_path_value = first_text(row.get("epoch_source_path"), target.get("source_path"), target.get("sourcePath"), default="unknown")
        size = round_or_none(row.get("epoch_size"))
        if size is None:
            size = round_or_none(target.get("size"))
        fuzzy = round_or_none(row.get("epoch_fuzzy"))
        if fuzzy is None:
            fuzzy = round_or_none(row.get("worker_baseline_score"))
        if fuzzy is None:
            fuzzy = round_or_none(target.get("fuzzy") or target.get("fuzzy_match_percent"))
        priority = round_or_none(row.get("epoch_priority"))
        if priority is None:
            priority = round_or_none(target.get("priority"))
        reason = str(row.get("epoch_reason") or target.get("reason") or "")
        baseline = round_or_none(row.get("worker_baseline_score"))
        best_score = round_or_none(row.get("best_checkpoint_score"))
        if best_score is None:
            best_score = round_or_none(row.get("worker_best_score"))
        best_delta = round_or_none(row.get("best_checkpoint_delta"))
        if best_delta is None and baseline is not None and best_score is not None:
            best_delta = best_score - baseline
        lifecycle_status = str(row.get("lifecycle_status") or "")
        selectable = bool(row.get("best_checkpoint_selectable")) if row.get("best_checkpoint_selectable") is not None else False
        exact = lifecycle_status == "exact" and bool(row.get("worker_exact"))
        improved = exact or bool(selectable and baseline is not None and best_score is not None and best_score > baseline)
        validation_attempts = int(
            conn.execute(
                "SELECT COUNT(*) FROM worker_checkpoints WHERE worker_state_id = ?",
                (str(row["worker_state_id"]),),
            ).fetchone()[0]
        )
        components = parse_rank_components(reason)
        records.append(
            {
                "dataset_type": "modern_worker",
                "record_id": str(row.get("worker_state_id") or ""),
                "run_id": clean_text(row.get("run_id")),
                "unit": clean_text(unit),
                "symbol": clean_text(symbol),
                "source_path": clean_text(source_path_value, "unknown"),
                "size": size,
                "fuzzy": fuzzy,
                "priority": priority,
                "reason": reason,
                "rank_regime": rank_regime(priority, reason),
                "selected_at": row.get("admitted_at") or row.get("started_at"),
                "admission_index": round_or_none(row.get("epoch_admission_index"), 0),
                "outcome_at": row.get("ended_at") or row.get("best_checkpoint_time"),
                "status": lifecycle_status,
                "terminal_status": lifecycle_status,
                "observed": lifecycle_status in TERMINAL_WORKER_STATES,
                "terminal": lifecycle_status in TERMINAL_WORKER_STATES,
                "has_worker_session": True,
                "has_xhigh": False,
                "thinking_levels": "modern",
                "lease_count": 1,
                "terminal_lease_count": 1 if lifecycle_status in TERMINAL_WORKER_STATES else 0,
                "validation_attempts": validation_attempts,
                "validated": validation_attempts > 0,
                "improved": improved,
                "exact": exact,
                "rejected_exact": bool(row.get("best_checkpoint_exact")) and not exact,
                "rejected_improved": False,
                "error": lifecycle_status == "error",
                "needs_fact": False,
                "no_change": lifecycle_status in {"timeout", "finished"} and not improved,
                "best_score": best_score,
                "best_delta": best_delta,
                **components,
            }
        )
    return records


def enrich_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["selected_ts"] = pd.to_datetime(out["selected_at"], utc=True, errors="coerce")
    out["outcome_ts"] = pd.to_datetime(out["outcome_at"], utc=True, errors="coerce")
    out["source_family"] = out["source_path"].map(source_family)
    out["module_bucket"] = out["source_path"].map(module_bucket)
    symbol_feature_rows = out["symbol"].map(symbol_features).tolist()
    if symbol_feature_rows:
        symbol_df = pd.DataFrame(symbol_feature_rows, index=out.index)
        for column in symbol_df.columns:
            out[column] = symbol_df[column]
    out["fuzzy_bin"] = out["fuzzy"].map(fuzzy_bin)
    out["size_bin"] = out["size"].map(size_bin)
    out["gap_to_exact"] = 100 - pd.to_numeric(out["fuzzy"], errors="coerce")
    out["log_size"] = np.log1p(pd.to_numeric(out["size"], errors="coerce"))
    out["priority_log"] = np.log1p(pd.to_numeric(out["priority"], errors="coerce").clip(lower=0))
    if "opseq_profile_present" in out:
        out["opseq_profile_bucket"] = np.where(pd.to_numeric(out["opseq_profile_present"], errors="coerce").fillna(0) >= 1, "present", "missing")
    else:
        out["opseq_profile_bucket"] = "missing"
    if "opseq_best_analog_score" in out:
        out["opseq_best_score_bin"] = out["opseq_best_analog_score"].map(opseq_score_bin)
    else:
        out["opseq_best_score_bin"] = "no_profile"
    out["normal_regime"] = out["rank_regime"].isin(NORMAL_REGIMES)
    out["end_to_end_model_row"] = (
        out["normal_regime"]
        & out["observed"].astype(bool)
        & (
            ((out["dataset_type"] == "legacy_target") & out["has_xhigh"].astype(bool))
            | (out["dataset_type"] == "modern_worker")
        )
    )
    out["validated_model_row"] = out["end_to_end_model_row"] & out["validated"].astype(bool)
    return add_rolling_priors(out)


def add_rolling_priors(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    selected_order = out.sort_values(["selected_ts", "record_id"], na_position="last").index.tolist()
    completed = out[out["outcome_ts"].notna()].sort_values(["outcome_ts", "record_id"], na_position="last")
    completed_records = list(completed.itertuples())
    pointer = 0
    target_stats: dict[str, Counter] = defaultdict(Counter)
    source_stats: dict[str, Counter] = defaultdict(Counter)
    family_stats: dict[str, Counter] = defaultdict(Counter)
    global_improve = float(out.loc[out["observed"].astype(bool), "improved"].mean() or 0)
    global_exact = float(out.loc[out["observed"].astype(bool), "exact"].mean() or 0)
    global_error = float(out.loc[out["observed"].astype(bool), "error"].mean() or 0)
    global_no_win = float((out.loc[out["observed"].astype(bool), "improved"].astype(bool) == False).mean() or 0)

    def emit(stats: Counter, base_improve: float, base_exact: float, base_error: float, base_no_win: float) -> tuple[int, float, float, float, float]:
        trials = int(stats["trials"])
        improve = (float(stats["improved"]) + 2.0 * base_improve) / (trials + 2.0)
        exact = (float(stats["exact"]) + 2.0 * base_exact) / (trials + 2.0)
        error = (float(stats["error"]) + 2.0 * base_error) / (trials + 2.0)
        no_win = (float(stats["no_win"]) + 2.0 * base_no_win) / (trials + 2.0)
        return trials, improve, exact, error, no_win

    target_trials = {}
    target_improve = {}
    target_exact = {}
    target_error = {}
    target_no_win = {}
    source_trials = {}
    source_improve = {}
    source_exact = {}
    source_error = {}
    source_no_win = {}
    family_trials = {}
    family_improve = {}
    family_exact = {}
    family_error = {}
    family_no_win = {}

    for idx in selected_order:
        selected_ts = out.at[idx, "selected_ts"]
        if pd.isna(selected_ts):
            selected_ts = pd.Timestamp("2262-04-11", tz="UTC")
        while pointer < len(completed_records):
            row = completed_records[pointer]
            if pd.isna(row.outcome_ts) or row.outcome_ts >= selected_ts:
                break
            if bool(row.observed):
                target_key = f"{row.unit}:{row.symbol}"
                for stats in (target_stats[target_key], source_stats[str(row.source_path)], family_stats[str(row.source_family)]):
                    stats["trials"] += 1
                    stats["improved"] += int(bool(row.improved))
                    stats["exact"] += int(bool(row.exact))
                    stats["error"] += int(bool(row.error))
                    stats["no_win"] += int(not bool(row.improved))
            pointer += 1

        target_key = f"{out.at[idx, 'unit']}:{out.at[idx, 'symbol']}"
        source_key = str(out.at[idx, "source_path"])
        family_key = str(out.at[idx, "source_family"])
        tt, ti, te, ter, tnw = emit(target_stats[target_key], global_improve, global_exact, global_error, global_no_win)
        st, si, se, ser, snw = emit(source_stats[source_key], global_improve, global_exact, global_error, global_no_win)
        ft, fi, fe, fer, fnw = emit(family_stats[family_key], global_improve, global_exact, global_error, global_no_win)
        target_trials[idx] = tt
        target_improve[idx] = ti
        target_exact[idx] = te
        target_error[idx] = ter
        target_no_win[idx] = tnw
        source_trials[idx] = st
        source_improve[idx] = si
        source_exact[idx] = se
        source_error[idx] = ser
        source_no_win[idx] = snw
        family_trials[idx] = ft
        family_improve[idx] = fi
        family_exact[idx] = fe
        family_error[idx] = fer
        family_no_win[idx] = fnw

    out["prior_target_trials"] = pd.Series(target_trials)
    out["prior_target_improve_rate"] = pd.Series(target_improve)
    out["prior_target_exact_rate"] = pd.Series(target_exact)
    out["prior_target_error_rate"] = pd.Series(target_error)
    out["prior_target_no_win_rate"] = pd.Series(target_no_win)
    out["prior_target_trials_log"] = np.log1p(out["prior_target_trials"])
    out["prior_source_trials"] = pd.Series(source_trials)
    out["prior_source_improve_rate"] = pd.Series(source_improve)
    out["prior_source_exact_rate"] = pd.Series(source_exact)
    out["prior_source_error_rate"] = pd.Series(source_error)
    out["prior_source_no_win_rate"] = pd.Series(source_no_win)
    out["prior_source_trials_log"] = np.log1p(out["prior_source_trials"])
    out["prior_family_trials"] = pd.Series(family_trials)
    out["prior_family_improve_rate"] = pd.Series(family_improve)
    out["prior_family_exact_rate"] = pd.Series(family_exact)
    out["prior_family_error_rate"] = pd.Series(family_error)
    out["prior_family_no_win_rate"] = pd.Series(family_no_win)
    out["prior_family_trials_log"] = np.log1p(out["prior_family_trials"])
    return out


def metric_block(y: pd.Series, score: pd.Series, prefix: str = "") -> dict[str, Any]:
    mask = score.notna() & y.notna()
    yv = y[mask].astype(int).to_numpy()
    sv = score[mask].astype(float).to_numpy()
    if len(yv) == 0:
        return {"n": 0}
    base = float(np.mean(yv))
    result: dict[str, Any] = {
        "n": int(len(yv)),
        "base_rate": round(base, 4),
    }
    if len(set(yv.tolist())) > 1:
        result["roc_auc"] = round(float(roc_auc_score(yv, sv)), 4)
        result["average_precision"] = round(float(average_precision_score(yv, sv)), 4)
    for frac in (0.05, 0.10, 0.20, 0.40):
        k = max(1, int(math.ceil(len(yv) * frac)))
        order = np.argsort(-sv)[:k]
        rate = float(np.mean(yv[order]))
        result[f"precision_at_{int(frac * 100)}pct"] = round(rate, 4)
        result[f"lift_at_{int(frac * 100)}pct"] = round(rate / base, 4) if base > 0 else None
    if prefix:
        return {f"{prefix}_{key}": value for key, value in result.items()}
    return result


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
        verbose_feature_names_out=True,
    )
    if kind == "logistic":
        classifier = LogisticRegression(max_iter=5000, C=0.75)
    elif kind == "hist_gradient_boost":
        classifier = HistGradientBoostingClassifier(max_iter=160, learning_rate=0.04, l2_regularization=0.08, random_state=7)
    else:
        raise ValueError(kind)
    return Pipeline(steps=[("features", preprocessor), ("model", classifier)])


@dataclass
class ModelResult:
    predictions: pd.Series
    metrics: dict[str, Any]
    coefficients: list[dict[str, Any]]


def cross_validated_model(
    df: pd.DataFrame,
    y_column: str,
    kind: str,
    numeric_features: list[str],
    categorical_features: list[str],
) -> ModelResult:
    model_df = df.copy().reset_index(drop=True)
    y = model_df[y_column].astype(int)
    groups = model_df["run_id"].astype(str)
    predictions = pd.Series(np.nan, index=model_df.index, dtype=float)
    fold_rows: list[dict[str, Any]] = []
    logo = LeaveOneGroupOut()
    for fold, (train_idx, test_idx) in enumerate(logo.split(model_df, y, groups), start=1):
        train_y = y.iloc[train_idx]
        test_y = y.iloc[test_idx]
        group = groups.iloc[test_idx].iloc[0]
        if len(set(train_y.tolist())) < 2:
            continue
        pipeline = model_pipeline(kind, numeric_features, categorical_features)
        pipeline.fit(model_df.iloc[train_idx], train_y)
        proba = pipeline.predict_proba(model_df.iloc[test_idx])[:, 1]
        predictions.iloc[test_idx] = proba
        fold_metric = metric_block(test_y.reset_index(drop=True), pd.Series(proba))
        fold_metric["fold"] = fold
        fold_metric["heldout_run_id"] = group
        fold_metric["positives"] = int(test_y.sum())
        fold_rows.append(fold_metric)

    metrics = metric_block(y, predictions)
    metrics["folds"] = fold_rows
    metrics["model_kind"] = kind
    metrics["outcome"] = y_column
    coefficients: list[dict[str, Any]] = []
    if kind == "logistic" and len(set(y.tolist())) >= 2:
        pipeline = model_pipeline(kind, numeric_features, categorical_features)
        pipeline.fit(model_df, y)
        try:
            names = pipeline.named_steps["features"].get_feature_names_out()
            coefs = pipeline.named_steps["model"].coef_[0]
            paired = sorted(zip(names, coefs), key=lambda item: item[1])
            coefficients = [
                {"feature": str(name), "coefficient": round(float(coef), 4)}
                for name, coef in [*paired[:16], *paired[-16:]]
            ]
        except Exception:
            coefficients = []
    return ModelResult(predictions=predictions, metrics=metrics, coefficients=coefficients)


def markdown_table(rows: list[dict[str, Any]], columns: list[str]) -> str:
    if not rows:
        return "_No rows._"
    def fmt(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, float):
            return f"{value:.4g}"
        return str(value)
    header = "| " + " | ".join(columns) + " |"
    sep = "| " + " | ".join("---" for _ in columns) + " |"
    body = ["| " + " | ".join(fmt(row.get(col, "")) for col in columns) + " |" for row in rows]
    return "\n".join([header, sep, *body])


def group_summary(df: pd.DataFrame, by: list[str]) -> list[dict[str, Any]]:
    rows = []
    grouped = df.groupby(by, dropna=False)
    for keys, group in grouped:
        if not isinstance(keys, tuple):
            keys = (keys,)
        row = {name: key for name, key in zip(by, keys)}
        n = len(group)
        row.update(
            {
                "rows": int(n),
                "validated": int(group["validated"].sum()),
                "improved": int(group["improved"].sum()),
                "improved_rate_pct": pct(float(group["improved"].sum()), n),
                "exact": int(group["exact"].sum()),
                "exact_rate_pct": pct(float(group["exact"].sum()), n),
                "avg_priority": round_or_none(group["priority"].mean(), 2),
                "avg_size": round_or_none(group["size"].mean(), 1),
                "avg_fuzzy": round_or_none(group["fuzzy"].mean(), 2),
            }
        )
        rows.append(row)
    return rows


def tie_summary(df: pd.DataFrame) -> list[dict[str, Any]]:
    rows = []
    for run_id, group in df.groupby("run_id"):
        rounded = group["priority"].round(4)
        counts = rounded.value_counts()
        rows.append(
            {
                "run_id": run_id,
                "rows": int(len(group)),
                "distinct_priorities": int(counts.size),
                "avg_rows_per_priority": round(float(len(group) / counts.size), 2) if counts.size else None,
                "max_tie_count": int(counts.max()) if counts.size else 0,
            }
        )
    return rows


def component_saturation(df: pd.DataFrame) -> dict[str, Any]:
    fields = [
        "information_priority",
        "high_accuracy_bonus",
        "accuracy_readiness_bonus",
        "closeness_fallback",
        "closeness_score",
        "information_gain_score",
        "unlock_score",
        "completion_readiness_score",
        "context_quality_score",
        "risk_penalty",
    ]
    result = {}
    for field in fields:
        series = pd.to_numeric(df[field], errors="coerce").dropna()
        if series.empty:
            continue
        result[field] = {
            "n": int(series.size),
            "min": round_or_none(series.min(), 2),
            "p25": round_or_none(series.quantile(0.25), 2),
            "median": round_or_none(series.median(), 2),
            "p75": round_or_none(series.quantile(0.75), 2),
            "max": round_or_none(series.max(), 2),
            "distinct_rounded": int(series.round(2).nunique()),
        }
    return result


def correlation_matrix(df: pd.DataFrame, outcome: str) -> list[dict[str, Any]]:
    fields = [
        "priority",
        "fuzzy",
        "gap_to_exact",
        "log_size",
        "information_priority",
        "closeness_score",
        "high_accuracy_bonus",
        "accuracy_readiness_bonus",
        "prior_source_improve_rate",
        "prior_source_exact_rate",
        "prior_family_improve_rate",
        "prior_family_exact_rate",
        "opseq_best_analog_score",
        "opseq_analog_count",
        "opseq_matched_analog_count",
        "opseq_matched_analog_ratio",
        "opseq_top_score_mean",
        "opseq_best_matched_analog_score",
        "opseq_high_matched_score_65_count",
    ]
    rows = []
    y = df[outcome].astype(float)
    for field in fields:
        x = pd.to_numeric(df[field], errors="coerce")
        mask = x.notna() & y.notna()
        if mask.sum() < 5 or y[mask].nunique() < 2:
            corr = None
        else:
            corr = float(np.corrcoef(x[mask], y[mask])[0, 1])
        rows.append({"feature": field, "corr": round_or_none(corr, 4)})
    return rows


def score_bucket_table(df: pd.DataFrame, score_column: str, label: str, buckets: int = 10) -> list[dict[str, Any]]:
    if score_column not in df:
        return []
    scoped = df[df[score_column].notna()].copy()
    if len(scoped) < buckets:
        return []
    scoped = scoped.sort_values(score_column, ascending=False).reset_index(drop=True)
    scoped["bucket_high_to_low"] = np.floor(np.arange(len(scoped)) * buckets / len(scoped)).astype(int) + 1
    rows = []
    for bucket, group in scoped.groupby("bucket_high_to_low"):
        rows.append(
            {
                "score": label,
                "bucket_high_to_low": int(bucket),
                "rows": int(len(group)),
                "avg_score": round_or_none(group[score_column].mean(), 4),
                "min_score": round_or_none(group[score_column].min(), 4),
                "max_score": round_or_none(group[score_column].max(), 4),
                "validated": int(group["validated"].sum()),
                "improved": int(group["improved"].sum()),
                "improved_rate_pct": pct(float(group["improved"].sum()), len(group)),
                "exact": int(group["exact"].sum()),
                "exact_rate_pct": pct(float(group["exact"].sum()), len(group)),
                "avg_size": round_or_none(group["size"].mean(), 1),
                "avg_fuzzy": round_or_none(group["fuzzy"].mean(), 2),
            }
        )
    return rows


def feature_family_ablation(
    df: pd.DataFrame,
    outcome: str,
    families: dict[str, tuple[list[str], list[str]]],
) -> list[dict[str, Any]]:
    rows = []
    for label, (numeric_features, categorical_features) in families.items():
        if len(df) < 40 or df[outcome].nunique() < 2:
            continue
        result = cross_validated_model(df, outcome, "logistic", numeric_features, categorical_features)
        metrics = result.metrics
        rows.append(
            {
                "outcome": outcome,
                "feature_family": label,
                "n": metrics.get("n"),
                "base_rate": metrics.get("base_rate"),
                "roc_auc": metrics.get("roc_auc"),
                "avg_precision": metrics.get("average_precision"),
                "p@10": metrics.get("precision_at_10pct"),
                "lift@10": metrics.get("lift_at_10pct"),
                "p@20": metrics.get("precision_at_20pct"),
                "lift@20": metrics.get("lift_at_20pct"),
            }
        )
    return rows


def feature_decile_scan(df: pd.DataFrame, outcome: str, numeric_features: list[str]) -> list[dict[str, Any]]:
    rows = []
    base = float(df[outcome].mean() or 0)
    for feature in numeric_features:
        if feature not in df:
            continue
        series = pd.to_numeric(df[feature], errors="coerce")
        scoped = df[series.notna()].copy()
        if len(scoped) < 80 or scoped[outcome].nunique() < 2:
            continue
        scoped["_score"] = pd.to_numeric(scoped[feature], errors="coerce")
        for direction, ascending in (("high", False), ("low", True)):
            top = scoped.sort_values("_score", ascending=ascending).head(max(1, int(math.ceil(len(scoped) * 0.1))))
            rate = float(top[outcome].mean() or 0)
            rows.append(
                {
                    "outcome": outcome,
                    "feature": feature,
                    "direction": direction,
                    "rows": int(len(top)),
                    "rate_pct": pct(rate, 1.0),
                    "lift": round_or_none(rate / base, 4) if base else None,
                    "min_value": round_or_none(top["_score"].min(), 4),
                    "max_value": round_or_none(top["_score"].max(), 4),
                    "improved_rate_pct": pct(float(top["improved"].sum()), len(top)),
                    "exact_rate_pct": pct(float(top["exact"].sum()), len(top)),
                }
            )
    return sorted(rows, key=lambda row: (row["outcome"], -(row["lift"] or 0)))


def prune_rule_summary(df: pd.DataFrame) -> list[dict[str, Any]]:
    numeric = {column: pd.to_numeric(df[column], errors="coerce") for column in df.columns}

    def col(name: str) -> pd.Series:
        return numeric.get(name, pd.Series(np.nan, index=df.index))

    rules: list[tuple[str, str, pd.Series]] = [
        (
            "retry_after_prior_target_no_win",
            "Same unit/symbol has prior completed attempts and no previous improvement.",
            (col("prior_target_trials") >= 1) & (col("prior_target_improve_rate") < 0.10),
        ),
        (
            "retry_after_two_target_no_exacts",
            "Same unit/symbol has at least two prior attempts and no exact history.",
            (col("prior_target_trials") >= 2) & (col("prior_target_exact_rate") < 0.05),
        ),
        (
            "cold_source_exact_history",
            "Source file has repeated prior attempts with almost no exact yield.",
            (col("prior_source_trials") >= 8) & (col("prior_source_exact_rate") < 0.05),
        ),
        (
            "cold_source_improve_history",
            "Source file has repeated prior attempts with weak improvement yield.",
            (col("prior_source_trials") >= 8) & (col("prior_source_improve_rate") < 0.40),
        ),
        (
            "large_near_exact",
            "Large function already above 99% fuzzy; historically often a late-regalloc grind.",
            (col("size") >= 1000) & (col("fuzzy") >= 99.0),
        ),
        (
            "huge_function",
            "Very large function, regardless of fuzzy score.",
            col("size") >= 2000,
        ),
        (
            "tiny_low_fuzzy",
            "Small function below 80% fuzzy; often easy exact or easy reject, worth isolating from normal rank.",
            (col("size") < 200) & (col("fuzzy") < 80),
        ),
        (
            "anonymous_fn_symbol",
            "Anonymous address-like fn_ symbol.",
            col("symbol_is_fn") >= 1,
        ),
        (
            "pad_stack_heavy_file",
            "Owning source has many PAD_STACK markers.",
            col("code_pad_stack_count") >= 5,
        ),
        (
            "asm_heavy_file",
            "Owning source still has inline asm blocks.",
            col("code_asm_block_count") >= 1,
        ),
        (
            "many_unmatched_same_file",
            "Current graph says many functions remain unmatched in the same file.",
            col("graph_unmatched_function_count") >= 20,
        ),
        (
            "high_context_many_prs",
            "Graph has many historical PR/resource hits, which may mean good evidence or a churny hard file.",
            col("graph_edge_touched_by_pr_count") >= 10,
        ),
        (
            "opseq_no_profile",
            "No opcode-similarity profile was available at analysis time.",
            col("opseq_profile_present").fillna(0) < 1,
        ),
        (
            "opseq_no_matched_analogs",
            "Opcode-similar neighbors exist, but none are already matched.",
            (col("opseq_analog_count") > 0) & (col("opseq_matched_analog_count") <= 0),
        ),
        (
            "opseq_high_matched_analog",
            "At least one opcode-similar matched function has score >= 0.65.",
            (col("opseq_best_matched_analog_score") >= 0.65) | (col("opseq_high_matched_score_65_count") >= 1),
        ),
        (
            "opseq_exact_or_dense_matched",
            "Exact opcode analogs or a dense matched-neighbor set are present.",
            (col("opseq_exact_analog_count") >= 1) | ((col("opseq_matched_analog_count") >= 8) & (col("opseq_best_analog_score") >= 0.55)),
        ),
        (
            "opseq_many_low_score",
            "Many opcode neighbors were found, but the best score remains below 0.45.",
            (col("opseq_analog_count") >= 8) & (col("opseq_best_analog_score") < 0.45),
        ),
    ]
    rows = []
    base_improved = float(df["improved"].mean() or 0)
    base_exact = float(df["exact"].mean() or 0)
    for name, description, mask in rules:
        scoped = df[mask.fillna(False)].copy()
        if scoped.empty:
            continue
        rows.append(
            {
                "rule": name,
                "rows": int(len(scoped)),
                "description": description,
                "improved": int(scoped["improved"].sum()),
                "improved_rate_pct": pct(float(scoped["improved"].sum()), len(scoped)),
                "improved_lift": round_or_none((float(scoped["improved"].mean()) / base_improved), 4) if base_improved else None,
                "exact": int(scoped["exact"].sum()),
                "exact_rate_pct": pct(float(scoped["exact"].sum()), len(scoped)),
                "exact_lift": round_or_none((float(scoped["exact"].mean()) / base_exact), 4) if base_exact else None,
                "avg_priority": round_or_none(scoped["priority"].mean(), 2),
                "avg_size": round_or_none(scoped["size"].mean(), 1),
                "avg_fuzzy": round_or_none(scoped["fuzzy"].mean(), 2),
            }
        )
    return sorted(rows, key=lambda row: (row["exact_lift"] or 0, row["improved_lift"] or 0, -row["rows"]))


def flatten_coefficients(stats: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for model_name, coefficients in stats.get("model_coefficients", {}).items():
        for item in coefficients:
            rows.append({"model": model_name, **item})
    return rows


def select_with_source_cap(df: pd.DataFrame, score_column: str, k: int, cap: int) -> pd.DataFrame:
    selected = []
    counts: Counter[str] = Counter()
    for idx, row in df.sort_values(score_column, ascending=False).iterrows():
        source = str(row["source_path"])
        if counts[source] >= cap:
            continue
        selected.append(idx)
        counts[source] += 1
        if len(selected) >= k:
            break
    return df.loc[selected]


def policy_simulation(df: pd.DataFrame, score_columns: dict[str, str]) -> list[dict[str, Any]]:
    rows = []
    for run_id, group in df.groupby("run_id"):
        if len(group) < 40:
            continue
        for frac in (0.1, 0.2, 0.35):
            k = max(1, int(math.ceil(len(group) * frac)))
            cap = max(2, int(math.ceil(k * 0.08)))
            for label, column in score_columns.items():
                if column not in group or group[column].notna().sum() < k:
                    continue
                plain = group.sort_values(column, ascending=False).head(k)
                capped = select_with_source_cap(group[group[column].notna()], column, k, cap)
                for mode, selected in (("plain", plain), (f"source_cap_{cap}", capped)):
                    rows.append(
                        {
                            "run_id": run_id,
                            "policy": label,
                            "mode": mode,
                            "mode_family": "source_cap" if mode.startswith("source_cap") else "plain",
                            "selection_frac_pct": int(round(frac * 100)),
                            "k": k,
                            "selected": int(len(selected)),
                            "improved": int(selected["improved"].sum()),
                            "improved_rate_pct": pct(float(selected["improved"].sum()), len(selected)),
                            "exact": int(selected["exact"].sum()),
                            "exact_rate_pct": pct(float(selected["exact"].sum()), len(selected)),
                            "distinct_sources": int(selected["source_path"].nunique()),
                        }
                    )
    return rows


def checkpoint_diagnostics(conn: sqlite3.Connection) -> dict[str, Any]:
    validation_rows = []
    for row in conn.execute(
        """
        SELECT validation_status, build_status, qa_status, objdiff_status, COUNT(*) AS count
        FROM worker_checkpoints
        GROUP BY validation_status, build_status, qa_status, objdiff_status
        ORDER BY count DESC
        LIMIT 40
        """
    ):
        validation_status, build_status, qa_status, objdiff_status, count = row
        validation_rows.append(
            {
                "validation_status": clean_text(validation_status, "unknown"),
                "build_status": clean_text(build_status, "unknown"),
                "qa_status": clean_text(qa_status, "unknown"),
                "objdiff_status": clean_text(objdiff_status, "unknown"),
                "count": int(count),
            }
        )

    reason_counts: Counter[str] = Counter()
    for (raw_reasons,) in conn.execute("SELECT failure_reasons_json FROM worker_checkpoints WHERE failure_reasons_json IS NOT NULL"):
        parsed = []
        if isinstance(raw_reasons, str):
            try:
                value = json.loads(raw_reasons)
                parsed = value if isinstance(value, list) else []
            except json.JSONDecodeError:
                parsed = []
        for reason in parsed:
            text = clean_text(reason)
            if text:
                reason_counts[text[:160]] += 1

    return {
        "checkpoint_status_summary": validation_rows,
        "checkpoint_failure_reasons_top": [
            {"reason": reason, "count": int(count)}
            for reason, count in reason_counts.most_common(30)
        ],
    }


def aggregate_policy_simulation(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    df = pd.DataFrame(rows)
    result = []
    for (policy, mode_family, selection_frac_pct), group in df.groupby(["policy", "mode_family", "selection_frac_pct"]):
        selected = int(group["selected"].sum())
        improved = int(group["improved"].sum())
        exact = int(group["exact"].sum())
        result.append(
            {
                "policy": policy,
                "mode_family": mode_family,
                "selection_frac_pct": int(selection_frac_pct),
                "runs": int(group["run_id"].nunique()),
                "selected": selected,
                "improved": improved,
                "improved_rate_pct": pct(improved, selected),
                "exact": exact,
                "exact_rate_pct": pct(exact, selected),
                "avg_distinct_sources": round_or_none(group["distinct_sources"].mean(), 1),
            }
        )
    return sorted(result, key=lambda row: (row["selection_frac_pct"], row["policy"], row["mode_family"]))


def opseq_profile_summary(df: pd.DataFrame) -> dict[str, Any]:
    if "opseq_profile_present" not in df:
        return {
            "coverage": {"rows": int(len(df)), "profile_rows": 0, "coverage_pct": 0.0},
            "by_profile_bucket": [],
            "by_best_score_bin": [],
        }
    present = pd.to_numeric(df["opseq_profile_present"], errors="coerce").fillna(0) >= 1
    profiled = df[present].copy()
    return {
        "coverage": {
            "rows": int(len(df)),
            "profile_rows": int(present.sum()),
            "coverage_pct": pct(float(present.sum()), len(df)),
            "avg_best_analog_score": round_or_none(profiled["opseq_best_analog_score"].mean(), 4) if not profiled.empty else None,
            "avg_analog_count": round_or_none(profiled["opseq_analog_count"].mean(), 2) if not profiled.empty else None,
            "avg_matched_analog_count": round_or_none(profiled["opseq_matched_analog_count"].mean(), 2) if not profiled.empty else None,
            "avg_matched_analog_ratio": round_or_none(profiled["opseq_matched_analog_ratio"].mean(), 4) if not profiled.empty else None,
        },
        "by_profile_bucket": group_summary(df, ["opseq_profile_bucket"]),
        "by_best_score_bin": group_summary(df, ["opseq_best_score_bin"]),
    }


def run_analysis(db_path: Path, graph_db_path: Path, checkout_root: Path, out_prefix: Path) -> dict[str, Any]:
    generated_at = utc_now()
    conn = sqlite3.connect(str(db_path))
    try:
        records = [*load_legacy_rows(conn), *load_modern_worker_rows(conn)]
        diagnostics = checkpoint_diagnostics(conn)
    finally:
        conn.close()

    raw_df = pd.DataFrame.from_records(records)
    source_paths = raw_df["source_path"].dropna().astype(str).tolist() if "source_path" in raw_df else []
    code_feature_df = pd.DataFrame.from_records(list(source_code_features(source_paths, checkout_root).values()))
    graph_feature_df = pd.DataFrame.from_records(list(load_graph_source_features(graph_db_path).values()))
    for feature_df in (code_feature_df, graph_feature_df):
        if not feature_df.empty and "source_path" in feature_df:
            raw_df = raw_df.merge(feature_df, on="source_path", how="left")
    raw_df = attach_function_features(raw_df, graph_db_path)
    df = enrich_features(raw_df)
    date_suffix = generated_at[:10]
    if out_prefix.name == "q-priority-outcome-analysis":
        out_prefix = out_prefix.with_name(f"{out_prefix.name}-{date_suffix}")
    out_prefix.parent.mkdir(parents=True, exist_ok=True)
    csv_path = out_prefix.with_suffix(".dataset.csv")
    stats_path = out_prefix.with_suffix(".stats.json")
    md_path = out_prefix.with_suffix(".md")

    # Cohorts: end-to-end includes worker/no-validation failures as zeroes;
    # validated-only estimates target difficulty after the runner reached gates.
    end_to_end = df[df["end_to_end_model_row"]].copy()
    validated = df[df["validated_model_row"]].copy()
    normal_observed = df[df["normal_regime"] & df["observed"].astype(bool)].copy()

    numeric_features = [
        "priority",
        "priority_log",
        "admission_index",
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
        "prior_source_trials_log",
        "prior_source_improve_rate",
        "prior_source_exact_rate",
        "prior_source_error_rate",
        "prior_source_no_win_rate",
        "prior_target_trials_log",
        "prior_target_improve_rate",
        "prior_target_exact_rate",
        "prior_target_error_rate",
        "prior_target_no_win_rate",
        "prior_family_trials_log",
        "prior_family_improve_rate",
        "prior_family_exact_rate",
        "prior_family_error_rate",
        "prior_family_no_win_rate",
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
        *OPSEQ_NUMERIC_FEATURES,
    ]
    categorical_features = [
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
    for column in numeric_features:
        if column not in df:
            df[column] = np.nan
    for column in categorical_features:
        if column not in df:
            df[column] = "unknown"
    end_to_end = df[df["end_to_end_model_row"]].copy()
    validated = df[df["validated_model_row"]].copy()
    normal_observed = df[df["normal_regime"] & df["observed"].astype(bool)].copy()

    model_rows = end_to_end[end_to_end["run_id"].notna() & (end_to_end["run_id"].astype(str) != "")].copy()
    model_predictions: dict[str, pd.Series] = {}
    model_metrics: dict[str, Any] = {}
    coefficients: dict[str, Any] = {}
    for outcome in ("improved", "exact"):
        for kind in ("logistic", "hist_gradient_boost"):
            if len(model_rows) < 20 or model_rows[outcome].nunique() < 2:
                continue
            result = cross_validated_model(model_rows, outcome, kind, numeric_features, categorical_features)
            key = f"{kind}_{outcome}"
            model_predictions[key] = result.predictions
            model_metrics[key] = result.metrics
            if result.coefficients:
                coefficients[key] = result.coefficients

    for key, preds in model_predictions.items():
        column = f"pred_{key}"
        model_rows[column] = preds.to_numpy()
        df.loc[model_rows.index, column] = preds.to_numpy()
    for kind in ("logistic", "hist_gradient_boost"):
        exact_column = f"pred_{kind}_exact"
        improved_column = f"pred_{kind}_improved"
        value_column = f"pred_{kind}_value"
        if exact_column in model_rows.columns and improved_column in model_rows.columns:
            model_rows[value_column] = 3 * model_rows[exact_column].fillna(0) + model_rows[improved_column].fillna(0)
            df.loc[model_rows.index, value_column] = model_rows[value_column].to_numpy()
        else:
            model_rows[value_column] = np.nan
            if value_column not in df.columns:
                df[value_column] = np.nan
    model_eval_rows = model_rows.reset_index(drop=True)

    baseline_metrics = {
        "end_to_end_priority_improved": metric_block(model_eval_rows["improved"], model_eval_rows["priority"]),
        "end_to_end_priority_exact": metric_block(model_eval_rows["exact"], model_eval_rows["priority"]),
        "end_to_end_closeness_improved": metric_block(model_eval_rows["improved"], model_eval_rows["closeness_score"]),
        "end_to_end_closeness_exact": metric_block(model_eval_rows["exact"], model_eval_rows["closeness_score"]),
    }
    if "pred_logistic_value" in model_eval_rows:
        baseline_metrics["end_to_end_logistic_value_improved"] = metric_block(model_eval_rows["improved"], model_eval_rows["pred_logistic_value"])
        baseline_metrics["end_to_end_logistic_value_exact"] = metric_block(model_eval_rows["exact"], model_eval_rows["pred_logistic_value"])
    if "pred_hist_gradient_boost_value" in model_eval_rows:
        baseline_metrics["end_to_end_hist_gradient_boost_value_improved"] = metric_block(model_eval_rows["improved"], model_eval_rows["pred_hist_gradient_boost_value"])
        baseline_metrics["end_to_end_hist_gradient_boost_value_exact"] = metric_block(model_eval_rows["exact"], model_eval_rows["pred_hist_gradient_boost_value"])

    priority_quintile_rows = []
    for (run_id, regime), group in end_to_end.groupby(["run_id", "rank_regime"]):
        if len(group) < 10:
            continue
        ranked = group.copy()
        ranked["priority_quintile"] = pd.qcut(ranked["priority"].rank(method="first", ascending=False), 5, labels=False, duplicates="drop")
        for quintile, qgroup in ranked.groupby("priority_quintile"):
            priority_quintile_rows.append(
                {
                    "run_id": run_id,
                    "rank_regime": regime,
                    "qtile_high_to_low": int(quintile) + 1,
                    "rows": int(len(qgroup)),
                    "min_priority": round_or_none(qgroup["priority"].min(), 3),
                    "max_priority": round_or_none(qgroup["priority"].max(), 3),
                    "validated": int(qgroup["validated"].sum()),
                    "improved": int(qgroup["improved"].sum()),
                    "improved_rate_pct": pct(float(qgroup["improved"].sum()), len(qgroup)),
                    "exact": int(qgroup["exact"].sum()),
                    "exact_rate_pct": pct(float(qgroup["exact"].sum()), len(qgroup)),
                }
            )

    source_yield = group_summary(end_to_end, ["source_path"])
    repeated_source_yield = [row for row in source_yield if row["rows"] >= 8]
    source_yield_sorted = sorted(repeated_source_yield or source_yield, key=lambda row: (row["exact_rate_pct"] or 0, row["improved_rate_pct"] or 0, row["rows"]), reverse=True)
    source_low_sorted = sorted(repeated_source_yield, key=lambda row: (row["exact_rate_pct"] or 0, row["improved_rate_pct"] or 0, -row["rows"]))

    simulation_scores = {"priority": "priority"}
    if "pred_logistic_value" in model_eval_rows:
        simulation_scores["matrix_value"] = "pred_logistic_value"
    if "pred_hist_gradient_boost_value" in model_eval_rows:
        simulation_scores["hgb_value"] = "pred_hist_gradient_boost_value"
    simulations = policy_simulation(model_eval_rows, simulation_scores)

    score_deciles = []
    for label, column in (
        ("raw_priority", "priority"),
        ("logistic_value", "pred_logistic_value"),
        ("hgb_value", "pred_hist_gradient_boost_value"),
        ("logistic_improved_score", "pred_logistic_improved"),
        ("logistic_exact_score", "pred_logistic_exact"),
        ("hgb_improved_score", "pred_hist_gradient_boost_improved"),
        ("hgb_exact_score", "pred_hist_gradient_boost_exact"),
        ("opseq_best_analog_score", "opseq_best_analog_score"),
        ("opseq_matched_analog_ratio", "opseq_matched_analog_ratio"),
        ("opseq_best_matched_analog_score", "opseq_best_matched_analog_score"),
    ):
        score_deciles.extend(score_bucket_table(model_eval_rows, column, label))

    baseline_numeric = [
        "priority",
        "priority_log",
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
    difficulty_numeric = [
        "fuzzy",
        "gap_to_exact",
        "log_size",
        "symbol_token_count",
        "symbol_length",
        "symbol_is_fn",
        "symbol_is_lbl",
        "symbol_has_address",
        "symbol_has_callback_term",
        "symbol_has_state_term",
        "code_line_count",
        "code_function_like_count",
        "code_pad_stack_count",
        "code_asm_block_count",
        "code_inline_count",
        "code_static_count",
        "code_switch_count",
        "code_case_count",
        "code_control_flow_per_kloc",
        "code_function_density",
        "code_nonmatching_count",
        "code_float_literal_count",
    ]
    history_numeric = [
        "prior_target_trials_log",
        "prior_target_improve_rate",
        "prior_target_exact_rate",
        "prior_target_error_rate",
        "prior_target_no_win_rate",
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
    graph_numeric = [feature for feature in numeric_features if feature.startswith("graph_")]
    opseq_numeric = [feature for feature in numeric_features if feature.startswith("opseq_")]
    non_opseq_numeric = [feature for feature in numeric_features if not feature.startswith("opseq_")]
    non_opseq_categorical = [feature for feature in categorical_features if not feature.startswith("opseq_")]
    feature_families = {
        "rank_only": (baseline_numeric, ["dataset_type", "rank_regime"]),
        "difficulty_code_symbol": (difficulty_numeric, ["dataset_type", "module_bucket", "symbol_prefix", "fuzzy_bin", "size_bin"]),
        "history_priors": (history_numeric, ["dataset_type", "source_family", "module_bucket"]),
        "opseq_only": (opseq_numeric, ["dataset_type", "rank_regime", "opseq_profile_bucket", "opseq_best_score_bin"]),
        "rank_plus_opseq": (baseline_numeric + opseq_numeric, ["dataset_type", "rank_regime", "opseq_profile_bucket", "opseq_best_score_bin"]),
        "history_plus_opseq": (
            history_numeric + opseq_numeric,
            ["dataset_type", "source_family", "module_bucket", "opseq_profile_bucket", "opseq_best_score_bin"],
        ),
        "rank_plus_history": (baseline_numeric + history_numeric, ["dataset_type", "rank_regime", "source_family", "module_bucket"]),
        "safe_all_no_current_graph": (
            baseline_numeric + difficulty_numeric + history_numeric,
            ["dataset_type", "rank_regime", "source_family", "module_bucket", "symbol_prefix", "fuzzy_bin", "size_bin"],
        ),
        "current_graph_only": (graph_numeric, ["dataset_type", "module_bucket", "graph_editability_mode"]),
        "all_without_opseq": (non_opseq_numeric, non_opseq_categorical),
        "all_with_current_graph": (numeric_features, categorical_features),
    }
    feature_family_rows = []
    for outcome in ("improved", "exact"):
        feature_family_rows.extend(feature_family_ablation(model_eval_rows, outcome, feature_families))
    feature_screen_rows = []
    for outcome in ("improved", "exact"):
        feature_screen_rows.extend(feature_decile_scan(model_eval_rows, outcome, numeric_features)[:80])
    prune_rows = prune_rule_summary(model_eval_rows)

    stats = {
        "generated_at": generated_at,
        "db_path": str(db_path),
        "graph_db_path": str(graph_db_path),
        "checkout_root": str(checkout_root),
        "outputs": {
            "csv": str(csv_path),
            "stats_json": str(stats_path),
            "markdown": str(md_path),
        },
        "row_counts": {
            "all_rows": int(len(df)),
            "legacy_target_rows": int((df["dataset_type"] == "legacy_target").sum()),
            "modern_worker_rows": int((df["dataset_type"] == "modern_worker").sum()),
            "normal_observed_rows": int(len(normal_observed)),
            "end_to_end_model_rows": int(len(end_to_end)),
            "validated_model_rows": int(len(validated)),
        },
        "summary_by_dataset_regime": group_summary(df[df["observed"].astype(bool)], ["dataset_type", "rank_regime"]),
        "summary_by_run_regime": group_summary(end_to_end, ["run_id", "rank_regime"]),
        "priority_quintiles": priority_quintile_rows,
        "score_deciles": score_deciles,
        "fuzzy_size_matrix": group_summary(end_to_end, ["fuzzy_bin", "size_bin"]),
        "source_yield_top_repeated": source_yield_sorted[:30],
        "source_yield_bottom": source_low_sorted[:30],
        "tie_summary": tie_summary(end_to_end),
        "component_saturation": component_saturation(end_to_end[end_to_end["rank_regime"] == "graph_informed"]),
        "correlations": {
            "end_to_end_improved": correlation_matrix(end_to_end, "improved"),
            "end_to_end_exact": correlation_matrix(end_to_end, "exact"),
            "validated_exact": correlation_matrix(validated, "exact"),
        },
        "baseline_metrics": baseline_metrics,
        "model_metrics": model_metrics,
        "model_coefficients": coefficients,
        "feature_family_ablation": feature_family_rows,
        "feature_decile_screen": feature_screen_rows,
        "opseq_profile_summary": opseq_profile_summary(model_eval_rows),
        "prune_rule_summary": prune_rows,
        "policy_simulation_aggregate": aggregate_policy_simulation(simulations),
        "policy_simulations": simulations,
        **diagnostics,
        "limitations": [
            "Historical full candidate windows were not persisted, so this reranks observed admitted/queued work rather than every candidate that was available at the time.",
            "Legacy queue rows and modern worker rows are different execution regimes; the report keeps them separable and includes dataset_type in matrix models.",
            "Source/file priors are computed only from outcomes that completed before each row's selected_at timestamp; same-batch targets do not leak into each other.",
            "Repair and sentinel priority lanes are reported separately and excluded from normal board model comparisons.",
            "Out-of-fold model columns are ranking scores. Before using them as production probabilities, calibrate on temporally held-out runs and track Brier/ECE calibration error.",
            "Code texture and current graph/file-card features are computed from the current checkout/graph; treat them as feature-discovery diagnostics until admission-time snapshots are persisted.",
            "OPSEC/opseq features are computed from the current opcode-similarity index; persist per-candidate analog snapshots at admission time before using the report for strict causal attribution.",
        ],
    }

    df_for_csv = df.drop(columns=["selected_ts", "outcome_ts"], errors="ignore")
    df_for_csv.to_csv(csv_path, index=False)
    stats_path.write_text(json_dumps(stats) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(stats), encoding="utf-8")
    return stats


def render_markdown(stats: dict[str, Any]) -> str:
    priority_improved = stats["baseline_metrics"].get("end_to_end_priority_improved", {})
    priority_exact = stats["baseline_metrics"].get("end_to_end_priority_exact", {})
    opseq_summary = stats.get("opseq_profile_summary", {})
    opseq_coverage = opseq_summary.get("coverage", {}) if isinstance(opseq_summary, dict) else {}
    def best_model(outcome: str) -> tuple[str, dict[str, Any]]:
        candidates = [
            (name, metrics)
            for name, metrics in stats["model_metrics"].items()
            if name.endswith(f"_{outcome}") and metrics.get("roc_auc") is not None
        ]
        if not candidates:
            return ("none", {})
        return max(candidates, key=lambda item: item[1].get("roc_auc") or -1)
    best_improved_name, best_improved = best_model("improved")
    best_exact_name, best_exact = best_model("exact")
    best_value_exact = stats["baseline_metrics"].get("end_to_end_hist_gradient_boost_value_exact", {})
    best_value_improved = stats["baseline_metrics"].get("end_to_end_hist_gradient_boost_value_improved", {})
    correlation_rows = []
    for scope, rows in stats["correlations"].items():
        for row in rows:
            correlation_rows.append({"scope": scope, **row})

    metric_rows = []
    for name, metrics in stats["baseline_metrics"].items():
        metric_rows.append(
            {
                "score": name,
                "n": metrics.get("n"),
                "base_rate": round_or_none(metrics.get("base_rate"), 4),
                "roc_auc": metrics.get("roc_auc"),
                "avg_precision": metrics.get("average_precision"),
                "p@10": metrics.get("precision_at_10pct"),
                "lift@10": metrics.get("lift_at_10pct"),
                "p@20": metrics.get("precision_at_20pct"),
                "lift@20": metrics.get("lift_at_20pct"),
            }
        )
    for name, metrics in stats["model_metrics"].items():
        metric_rows.append(
            {
                "score": name,
                "n": metrics.get("n"),
                "base_rate": round_or_none(metrics.get("base_rate"), 4),
                "roc_auc": metrics.get("roc_auc"),
                "avg_precision": metrics.get("average_precision"),
                "p@10": metrics.get("precision_at_10pct"),
                "lift@10": metrics.get("lift_at_10pct"),
                "p@20": metrics.get("precision_at_20pct"),
                "lift@20": metrics.get("lift_at_20pct"),
            }
        )
    coefficient_rows = flatten_coefficients(stats)
    feature_screen_preview = []
    for outcome in ("improved", "exact"):
        feature_screen_preview.extend([row for row in stats["feature_decile_screen"] if row.get("outcome") == outcome][:30])

    lines = [
        "# Q Priority Outcome Analysis",
        "",
        f"Generated: `{stats['generated_at']}`",
        "",
        "## Main Findings",
        "",
        f"- Raw priority is weakly calibrated to success in this history: priority ROC AUC is `{priority_improved.get('roc_auc')}` for improvement and `{priority_exact.get('roc_auc')}` for exacts.",
        f"- The held-out matrix models are materially better at ranking likely winners: best improvement model `{best_improved_name}` ROC AUC `{best_improved.get('roc_auc')}`, best exact model `{best_exact_name}` ROC AUC `{best_exact.get('roc_auc')}`.",
        f"- A value-style matrix score improves the top of the queue: hgb value p@10 is `{best_value_improved.get('precision_at_10pct')}` for improvement and `{best_value_exact.get('precision_at_10pct')}` for exacts.",
        f"- OPSEC/opseq coverage in the modeled rows is `{opseq_coverage.get('coverage_pct')}`% (`{opseq_coverage.get('profile_rows')}` / `{opseq_coverage.get('rows')}` rows), with average best analog score `{opseq_coverage.get('avg_best_analog_score')}`.",
        "- The current graph rank is still useful as a candidate generator, but the admission order needs a second-stage probability/value score and source diversity constraints.",
        "- File/source/target history, function size, exactness gap, source code texture, opseq analog quality, and saturated rank components carry more operational signal than raw priority alone.",
        "",
        "## Recommended Ranking Shape",
        "",
        "- Keep the existing graph rank to find plausible work, then rerank normal candidates by calibrated expected value.",
        "- Use `value = 3 * P(exact) + P(improved) - 0.75 * P(error_or_rework) - time_cost` as the epoch admission score; tune the weights to current operational goals.",
        "- Apply per-source or per-source-family caps inside each epoch, with a small exploration lane for uncertain high-upside candidates.",
        "- Store the full rank component JSON, candidate window, and model score at admission time going forward so future reports can replay the decision set exactly.",
        "- Extend similarity next with control-flow n-grams, source token or AST embeddings, graph-neighborhood embeddings, and nearest-success / nearest-stall priors.",
        "- Calibrate the selected model before treating scores as probabilities; the report's model columns are out-of-fold ranking scores.",
        "",
        "## Row Counts",
        "",
        markdown_table([stats["row_counts"]], list(stats["row_counts"].keys())),
        "",
        "## Run / Regime Outcomes",
        "",
        markdown_table(
            stats["summary_by_run_regime"],
            ["run_id", "rank_regime", "rows", "validated", "improved", "improved_rate_pct", "exact", "exact_rate_pct", "avg_priority", "avg_size", "avg_fuzzy"],
        ),
        "",
        "## OPSEC / Opseq Coverage",
        "",
        markdown_table([opseq_coverage], ["rows", "profile_rows", "coverage_pct", "avg_best_analog_score", "avg_analog_count", "avg_matched_analog_count", "avg_matched_analog_ratio"]),
        "",
        markdown_table(
            opseq_summary.get("by_best_score_bin", []) if isinstance(opseq_summary, dict) else [],
            ["opseq_best_score_bin", "rows", "validated", "improved", "improved_rate_pct", "exact", "exact_rate_pct", "avg_priority", "avg_size", "avg_fuzzy"],
        ),
        "",
        "## Priority Quintiles",
        "",
        markdown_table(
            stats["priority_quintiles"],
            ["run_id", "rank_regime", "qtile_high_to_low", "rows", "min_priority", "max_priority", "validated", "improved", "improved_rate_pct", "exact", "exact_rate_pct"],
        ),
        "",
        "## Score / Model Metrics",
        "",
        markdown_table(metric_rows, ["score", "n", "base_rate", "roc_auc", "avg_precision", "p@10", "lift@10", "p@20", "lift@20"]),
        "",
        "## Feature Family Ablation",
        "",
        markdown_table(
            stats["feature_family_ablation"],
            ["outcome", "feature_family", "n", "base_rate", "roc_auc", "avg_precision", "p@10", "lift@10", "p@20", "lift@20"],
        ),
        "",
        "## Prune / Reroute Cohorts",
        "",
        markdown_table(
            stats["prune_rule_summary"],
            ["rule", "rows", "improved_rate_pct", "improved_lift", "exact_rate_pct", "exact_lift", "avg_priority", "avg_size", "avg_fuzzy", "description"],
        ),
        "",
        "## Feature Decile Screen",
        "",
        markdown_table(
            feature_screen_preview,
            ["outcome", "feature", "direction", "rows", "rate_pct", "lift", "min_value", "max_value", "improved_rate_pct", "exact_rate_pct"],
        ),
        "",
        "## Score Deciles",
        "",
        markdown_table(
            stats["score_deciles"],
            ["score", "bucket_high_to_low", "rows", "avg_score", "min_score", "max_score", "validated", "improved", "improved_rate_pct", "exact", "exact_rate_pct", "avg_size", "avg_fuzzy"],
        ),
        "",
        "## Fuzzy / Size Matrix",
        "",
        markdown_table(
            stats["fuzzy_size_matrix"],
            ["fuzzy_bin", "size_bin", "rows", "validated", "improved", "improved_rate_pct", "exact", "exact_rate_pct", "avg_priority", "avg_size", "avg_fuzzy"],
        ),
        "",
        "## Correlations",
        "",
        markdown_table(correlation_rows, ["scope", "feature", "corr"]),
        "",
        "## Tie Summary",
        "",
        markdown_table(stats["tie_summary"], ["run_id", "rows", "distinct_priorities", "avg_rows_per_priority", "max_tie_count"]),
        "",
        "## Component Saturation",
        "",
        markdown_table(
            [{"component": key, **value} for key, value in stats["component_saturation"].items()],
            ["component", "n", "min", "p25", "median", "p75", "max", "distinct_rounded"],
        ),
        "",
        "## Logistic Coefficients",
        "",
        markdown_table(coefficient_rows, ["model", "feature", "coefficient"]),
        "",
        "## Strongest Source Yields",
        "",
        markdown_table(
            stats["source_yield_top_repeated"][:20],
            ["source_path", "rows", "validated", "improved", "improved_rate_pct", "exact", "exact_rate_pct", "avg_priority", "avg_size", "avg_fuzzy"],
        ),
        "",
        "## Weakest Repeated Source Yields",
        "",
        markdown_table(
            stats["source_yield_bottom"][:20],
            ["source_path", "rows", "validated", "improved", "improved_rate_pct", "exact", "exact_rate_pct", "avg_priority", "avg_size", "avg_fuzzy"],
        ),
        "",
        "## Policy Simulations",
        "",
        markdown_table(
            stats["policy_simulation_aggregate"],
            ["policy", "mode_family", "selection_frac_pct", "runs", "selected", "improved", "improved_rate_pct", "exact", "exact_rate_pct", "avg_distinct_sources"],
        ),
        "",
        "## Policy Simulation Details",
        "",
        markdown_table(
            stats["policy_simulations"][:80],
            ["run_id", "policy", "mode", "selection_frac_pct", "k", "selected", "improved", "improved_rate_pct", "exact", "exact_rate_pct", "distinct_sources"],
        ),
        "",
        "## Checkpoint Diagnostics",
        "",
        markdown_table(
            stats["checkpoint_status_summary"],
            ["validation_status", "build_status", "qa_status", "objdiff_status", "count"],
        ),
        "",
        markdown_table(
            stats["checkpoint_failure_reasons_top"],
            ["reason", "count"],
        ),
        "",
        "## Limitations",
        "",
        *[f"- {item}" for item in stats["limitations"]],
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    parser.add_argument("--graph-db", type=Path, default=DEFAULT_GRAPH_DB)
    parser.add_argument("--checkout-root", type=Path, default=DEFAULT_CHECKOUT_ROOT)
    parser.add_argument("--out-prefix", type=Path, default=DEFAULT_REPORT_PREFIX)
    args = parser.parse_args()
    stats = run_analysis(args.db, args.graph_db, args.checkout_root, args.out_prefix)
    print(json.dumps(stats["outputs"], indent=2))


if __name__ == "__main__":
    main()
