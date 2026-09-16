#!/usr/bin/env python3
"""Cross-check standards records against rule slices: every qa_rule_id must be bound by a slice, every slice standard_id must name a live record, every example must point at a live record.

Usage: check_standard_bindings.py [--game sms ...]
Exits 1 on any mismatch.
"""
import argparse, collections, glob, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GLOBAL = os.path.join(ROOT, "knowledge/global/sources/injectable/decomp_standards/standards")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", action="append", default=[])
    a = ap.parse_args()
    roots = [("global", GLOBAL)] + [(g, os.path.join(ROOT, "games", g, "knowledge/sources/injectable/decomp_standards/standards")) for g in a.game]
    recs, bound, examples = [], {}, []
    for scope, root in roots:
        for f in glob.glob(f"{root}/*/standards.jsonl"):
            for line in open(f):
                d = json.loads(line); d["_scope"] = scope; recs.append(d)
        for f in glob.glob(f"{root}/*/slice.json"):
            for r in json.load(open(f)).get("rules", []):
                bound.setdefault(r["standard_id"], set()).add(r["rule_id"])
        for f in glob.glob(f"{root}/*/examples.jsonl"):
            for line in open(f):
                examples.append(json.loads(line))
    ids = {r["id"] for r in recs}
    bad = 0
    for r in recs:
        want, have = set(r.get("qa_rule_ids") or []), bound.get(r["id"], set())
        overrides = set(r.get("finding_override_rule_ids") or [])  # rules.py re-points these findings to this record
        if want != have | overrides:
            bad += 1; print(f"MISMATCH {r['id']}: record {sorted(want)} slices {sorted(have)} overrides {sorted(overrides)}")
    for sid, rules in bound.items():
        if sid not in ids:
            bad += 1; print(f"RULES BOUND TO MISSING RECORD {sid}: {sorted(rules)}")
    for e in examples:
        if e.get("standard_id") not in ids:
            bad += 1; print(f"EXAMPLE -> MISSING RECORD {e.get('id')} -> {e.get('standard_id')}")
    print("records:", dict(collections.Counter((r["_scope"], r["status"]) for r in recs)))
    print("mismatches:", bad)
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
