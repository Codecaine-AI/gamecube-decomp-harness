#!/usr/bin/env python3
"""Summarize objdiff JSON into compact text and machine-readable metrics."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as fp:
        return json.load(fp)


def find_symbol(symbols: list[dict[str, Any]], name: str | None) -> dict[str, Any] | None:
    if not symbols:
        return None
    if not name:
        return symbols[0]
    for sym in symbols:
        if sym.get("name") == name:
            return sym
    for sym in symbols:
        if name in str(sym.get("name", "")):
            return sym
    return None


def instruction_text(entry: dict[str, Any] | None) -> str:
    if not entry:
        return "---"
    inst = entry.get("instruction")
    if not inst:
        return "---"
    address = inst.get("address", "")
    formatted = inst.get("formatted", "")
    return f"{address}: {formatted}" if address else formatted


def diff_kind_counts(entries: list[dict[str, Any]]) -> dict[str, int]:
    counts = {
        "instruction_diff_count": 0,
        "arg_mismatch_count": 0,
        "insert_count": 0,
        "delete_count": 0,
        "replace_count": 0,
    }
    for entry in entries:
        kind = entry.get("diff_kind")
        if not kind:
            continue
        counts["instruction_diff_count"] += 1
        if kind == "DIFF_ARG_MISMATCH":
            counts["arg_mismatch_count"] += 1
        elif kind == "DIFF_INSERT":
            counts["insert_count"] += 1
        elif kind == "DIFF_DELETE":
            counts["delete_count"] += 1
        elif kind == "DIFF_REPLACE":
            counts["replace_count"] += 1
    return counts


def count_section_diffs(side: dict[str, Any], key: str) -> int:
    total = 0
    for section in side.get("sections", []) or []:
        total += len(section.get(key, []) or [])
    return total


def paired_diff_text(
    config_id: str,
    symbol_name: str,
    ours: dict[str, Any],
    target: dict[str, Any] | None,
) -> str:
    ours_entries = ours.get("instructions", []) or []
    target_entries = target.get("instructions", []) if target else []
    max_len = max(len(ours_entries), len(target_entries))
    lines = [
        f"# Objdiff Summary: {config_id}",
        "",
        f"- Symbol: `{symbol_name}`",
        f"- Match: {ours.get('match_percent', 'unknown')}%",
        f"- Size: {ours.get('size', 'unknown')} bytes",
        "",
        "```text",
        f"{'OURS':<48} | {'TARGET':<48} | DIFF",
        "-" * 110,
    ]
    diff_rows = 0
    for idx in range(max_len):
        ours_entry = ours_entries[idx] if idx < len(ours_entries) else {}
        target_entry = target_entries[idx] if idx < len(target_entries) else {}
        kind = ours_entry.get("diff_kind") or target_entry.get("diff_kind")
        if not kind:
            continue
        diff_rows += 1
        ours_text = instruction_text(ours_entry)
        target_text = instruction_text(target_entry)
        lines.append(f"{ours_text:<48} | {target_text:<48} | {kind}")
    if diff_rows == 0:
        lines.append("(no instruction differences)")
    lines.append("```")
    lines.append("")
    return "\n".join(lines)


def write_metrics_csv(path: Path, metrics: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    exists = path.exists()
    with path.open("a", encoding="utf-8", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=list(metrics.keys()))
        if not exists:
            writer.writeheader()
        writer.writerow(metrics)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_path", type=Path)
    parser.add_argument("--symbol", help="Symbol to summarize")
    parser.add_argument("--config-id", default="candidate")
    parser.add_argument("--text-output", type=Path)
    parser.add_argument("--metrics-output", type=Path, help="Append one metrics row to this CSV")
    args = parser.parse_args()

    data = load_json(args.json_path)
    left = data.get("left", {}) or {}
    right = data.get("right", {}) or {}

    ours = find_symbol(right.get("symbols", []) or [], args.symbol)
    target = find_symbol(left.get("symbols", []) or [], args.symbol)
    if ours is None and target is not None:
        ours, target = target, ours
    if ours is None:
        raise SystemExit(f"No symbol found for {args.symbol or '<first-symbol>'}")

    symbol_name = str(ours.get("name") or args.symbol or "")
    instructions = ours.get("instructions", []) or []
    counts = diff_kind_counts(instructions)
    metrics = {
        "config_id": args.config_id,
        "symbol": symbol_name,
        "match_percent": ours.get("match_percent", ""),
        "instruction_count": sum(1 for entry in instructions if entry.get("instruction")),
        **counts,
        "reloc_diff_count": len(ours.get("reloc_diff", []) or []) + count_section_diffs(right, "reloc_diff"),
        "data_diff_count": len(ours.get("data_diff", []) or []) + count_section_diffs(right, "data_diff"),
    }

    text = paired_diff_text(args.config_id, symbol_name, ours, target)
    if args.text_output:
        args.text_output.parent.mkdir(parents=True, exist_ok=True)
        args.text_output.write_text(text, encoding="utf-8")
    else:
        print(text)

    if args.metrics_output:
        write_metrics_csv(args.metrics_output, metrics)
    else:
        print(json.dumps(metrics, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
