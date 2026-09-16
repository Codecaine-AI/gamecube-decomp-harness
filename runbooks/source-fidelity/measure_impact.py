#!/usr/bin/env python3
"""Replay the review_lint scan over every indexed integration and tally what the current rules would have rejected.

Usage: measure_impact.py --game sms --index index.json --out raw.json [--limit N] [--ignore rule_id,...]
Requires the qa_tree and qa_patch fields from build_integration_index.py. Runs scan_diff.py with --post-tree so unused-local rules see the post-change file.
"""
import argparse, collections, json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCAN = os.path.join(ROOT, "toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True)
    ap.add_argument("--index", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int)
    ap.add_argument("--ignore", default="sms_symbol_map_validation,sms_name_change_requires_review")
    a = ap.parse_args()
    ignore = set(x for x in a.ignore.split(",") if x)
    rows = json.load(open(a.index))
    rows = [r for r in rows if r.get("qa_tree") and r.get("qa_patch")][: a.limit or None]
    env = dict(os.environ, ORCH_GAME_DIR=os.path.join(ROOT, "games", a.game), ORCH_GAME_ID=a.game)
    results, t0 = [], time.time()
    for i, r in enumerate(rows):
        cmd = ["python3", SCAN, "--repo", r["qa_tree"], "--diff-file", r["qa_patch"], "--post-tree", r["qa_tree"], "--surface", "worker", "--json"]
        p = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=ROOT)
        try:
            d = json.loads(p.stdout[p.stdout.index("{"):])
            findings = [f for f in d.get("findings", []) if f.get("rule_id") not in ignore]
            err = None
        except Exception:
            findings, err = [], f"parse error exit {p.returncode}: {p.stderr[-300:]}"
        results.append({"i": i, "commit": r["commit"], "target": r["target"], "files": r["files"],
                        "errors": [f for f in findings if f.get("severity") == "error"],
                        "warnings": [f for f in findings if f.get("severity") != "error"], "tool_error": err})
        if i % 100 == 0:
            print(f"{i}/{len(rows)} {time.time()-t0:.0f}s", file=sys.stderr)
    json.dump(results, open(a.out, "w"), indent=1)
    tgt = lambda r: r["target"] or {}
    gain = lambda rs: round(sum((tgt(r).get("after") or 0) - (tgt(r).get("before") or 0) for r in rs if tgt(r).get("after") is not None), 1)
    rej = [r for r in results if r["errors"]]
    ex = [r for r in results if tgt(r).get("exact")]
    sec = [r for r in results if str(tgt(r).get("symbol", "")).startswith(".")]
    print(json.dumps({
        "integrations": len(results), "rejected": len(rej),
        "exact_total": len(ex), "exact_rejected": sum(1 for r in ex if r["errors"]),
        "section_total": len(sec), "section_rejected": sum(1 for r in sec if r["errors"]),
        "gain_points_total": gain(results), "gain_points_rejected": gain(rej),
        "by_rule_errors": collections.Counter(f["rule_id"] for r in results for f in r["errors"]),
        "by_rule_warnings": collections.Counter(f["rule_id"] for r in results for f in r["warnings"]),
        "tool_errors": sum(1 for r in results if r["tool_error"]),
    }, indent=1))

if __name__ == "__main__":
    main()
