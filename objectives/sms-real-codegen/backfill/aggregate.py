#!/usr/bin/env python3
"""Merge the shard runs of the dry steering backfill into one report.

Reads runs/shard*/batch*.json (retry shards included; a function seen in
several batches keeps the result from the batch that analysed its own unit's
source file). Writes backfill-report.json and backfill-report.md here.
"""
from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
RUNS = os.environ.get("BACKFILL_RUNS", "runs")


def main() -> None:
    rows: dict[tuple[str, str], dict] = {}
    failed: list[str] = []
    batches = 0
    for path in sorted(HERE.glob(f"{RUNS}/shard*/batch*.json")):
        if path.name.endswith(".pathbug.json"):
            continue  # superseded by a rerun with a short MWCC temp path
        if path.name.endswith(".failed.json"):
            failed.append(str(path.relative_to(HERE)))
            continue
        batches += 1
        files = (path.with_suffix(".files").read_text().split() if path.with_suffix(".files").exists() else [])
        data = json.loads(path.read_text())
        decision = data.get("decision") or {}
        for fn in decision.get("functions", []):
            key = (fn.get("unit", ""), fn.get("name", ""))
            row = {
                "unit": key[0], "name": key[1], "decision": fn.get("decision"), "match": fn.get("match"),
                "batch": str(path.relative_to(HERE)), "files": files,
            }
            rows.setdefault(key, row)
        for violation in decision.get("violations", []) or []:
            key = (violation.get("unit", ""), f"violation:{violation.get('kind')}:{violation.get('function') or violation.get('class')}")
            rows.setdefault(key, {"unit": key[0], "name": key[1], "decision": "rule_violation", "violation": violation,
                                  "batch": str(path.relative_to(HERE)), "files": files})
    for path in sorted(HERE.glob(f"{RUNS}/shard*/batch*.failed.json")):
        if str(path.relative_to(HERE)) not in failed:
            failed.append(str(path.relative_to(HERE)))

    counts = Counter(row["decision"] for row in rows.values())
    by_unit: dict[str, Counter] = defaultdict(Counter)
    for row in rows.values():
        by_unit[row["unit"]][row["decision"]] += 1
    steering = sorted((r for r in rows.values() if r["decision"] == "steering_located"),
                      key=lambda r: (r["unit"], r["name"]))
    report = {"batches": batches, "failed_batches": failed, "functions": len(rows), "decisions": dict(counts),
              "units_with_steering": sorted(u for u, c in by_unit.items() if c.get("steering_located")),
              "rows": sorted(rows.values(), key=lambda r: (r["unit"], r["name"]))}
    (HERE / f"backfill-report-{RUNS}.json").write_text(json.dumps(report, indent=1) + "\n")

    lines = ["# Dry steering backfill: SMS integration checkout vs upstream 81248bda", "",
             f"- Batches analysed: {batches}; failed: {len(failed)}",
             f"- Functions with a decision: {len(rows)}"]
    lines += [f"  - {k}: {v}" for k, v in counts.most_common()]
    lines += [f"- Units with steering: {len(report['units_with_steering'])}", "",
              "## Steering-located functions (real-only match = what survives cleanup)", "",
              "| Unit | Function | Base | Candidate | Real only |", "|---|---|---|---|---|"]
    for r in steering:
        m = r.get("match") or {}
        lines.append(f"| {r['unit']} | `{r['name']}` | {m.get('base')} | {m.get('candidate')} | {m.get('real_only')} |")
    if failed:
        lines += ["", "## Failed batches", ""] + [f"- {f}" for f in failed]
    (HERE / f"backfill-report-{RUNS}.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines[:12]))


if __name__ == "__main__":
    main()
