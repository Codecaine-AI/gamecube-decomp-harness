#!/usr/bin/env python3
"""Replay the review_lint scan over every retained SMS integration and tally what the new rules would have rejected."""
import json, os, subprocess, sys, collections, time
ROOT = "/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness"
SCAN = f"{ROOT}/toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py"
rows = json.load(open("/tmp/sms-wt-audit/all-integrations.json"))
limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(rows)
out_path = sys.argv[2] if len(sys.argv) > 2 else "/tmp/sms-wt-audit/impact-raw.json"
env = dict(os.environ, ORCH_GAME_DIR=f"{ROOT}/games/sms", ORCH_GAME_ID="sms")
results = []
t0 = time.time()
for i, r in enumerate(rows[:limit]):
    cmd = ["python3", SCAN, "--repo", r["qa_tree"], "--diff-file", r["qa_patch"], "--surface", "worker", "--json"]
    if "--post-tree" in open(SCAN).read():
        cmd += ["--post-tree", r["qa_tree"]]
    p = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=ROOT)
    raw = p.stdout
    try:
        d = json.loads(raw[raw.index("{"):])
        findings = [f for f in d.get("findings", []) if f.get("rule_id") != "sms_symbol_map_validation"]
        err = None
    except Exception as e:
        findings, err = [], f"parse error exit {p.returncode}: {p.stderr[-300:]}"
    results.append({"i": i, "era": r["era"], "commit": r["commit"], "target": r["target"], "files": r["files"],
                    "errors": [f for f in findings if f.get("severity") == "error"],
                    "warnings": [f for f in findings if f.get("severity") != "error"], "tool_error": err})
    if i % 100 == 0:
        print(f"{i}/{limit} {time.time()-t0:.0f}s", file=sys.stderr)
json.dump(results, open(out_path, "w"), indent=1)
# summary
def tgt(r): return r["target"] or {}
tot = len(results); rej = [r for r in results if r["errors"]]
ex = [r for r in results if tgt(r).get("exact")]; ex_rej = [r for r in ex if r["errors"]]
sec = [r for r in results if str(tgt(r).get("symbol", "")).startswith(".")]; sec_rej = [r for r in sec if r["errors"]]
gain = lambda rs: sum((tgt(r).get("after") or 0) - (tgt(r).get("before") or 0) for r in rs if tgt(r).get("after") is not None)
print(json.dumps({"integrations": tot, "rejected": len(rej), "exact_total": len(ex), "exact_rejected": len(ex_rej),
                  "section_total": len(sec), "section_rejected": len(sec_rej),
                  "gain_points_total": round(gain(results), 1), "gain_points_rejected": round(gain(rej), 1),
                  "by_rule_errors": collections.Counter(f["rule_id"] for r in results for f in r["errors"]),
                  "by_rule_warnings": collections.Counter(f["rule_id"] for r in results for f in r["warnings"]),
                  "tool_errors": sum(1 for r in results if r["tool_error"])}, indent=1))
