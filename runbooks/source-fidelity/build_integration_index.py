#!/usr/bin/env python3
"""Index every worker integration in a commit range to its retained patch, validation summary, and post-change tree.

Usage: build_integration_index.py --game sms --base <rev> [--head HEAD] --out index.json
Reads games/<game>/runtime/state/runs/*/worker_integrations/*/summary.json and matches integratedRev to the commits in base..head.
"""
import argparse, glob, json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True)
    ap.add_argument("--base", required=True)
    ap.add_argument("--head", default="HEAD")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    game_dir = os.path.join(ROOT, "games", a.game)
    checkout = os.path.join(game_dir, "workspace", "checkout")
    runs = os.path.join(game_dir, "runtime", "state", "runs")
    by_rev = {}
    for s in glob.glob(f"{runs}/*/worker_integrations/*/summary.json"):
        try:
            d = json.load(open(s))
        except Exception:
            continue
        if d.get("integratedRev"):
            by_rev[d["integratedRev"]] = d
    log = subprocess.run(["git", "-C", checkout, "log", "--format=%H %s", f"{a.base}..{a.head}"], capture_output=True, text=True, check=True).stdout.splitlines()
    rows, missing = [], 0
    for line in log:
        h, _, msg = line.partition(" ")
        d = by_rev.get(h)
        if not d:
            missing += 1
            continue
        patch = d.get("patchPath", "")
        vdir, att = os.path.dirname(patch), os.path.basename(patch).split(".")[0]
        validation = os.path.join(vdir, f"{att}.runner_validation.summary.json")
        qa_tree = os.path.join(vdir, f"{att}.qa_current")
        qa_patch = os.path.join(vdir, f"{att}.qa_diff.patch")
        target = None
        if os.path.exists(validation):
            v = json.load(open(validation))
            t = v.get("target") or {}
            target = {"symbol": t.get("symbol"), "before": t.get("before"), "after": t.get("after"), "exact": t.get("exact"), "status": v.get("status")}
        rows.append({"commit": h, "msg": msg, "files": d.get("queue_record", {}).get("write_set"), "patchPath": patch,
                     "validation": validation if os.path.exists(validation) else None,
                     "qa_tree": qa_tree if os.path.isdir(qa_tree) else None,
                     "qa_patch": qa_patch if os.path.exists(qa_patch) else None, "target": target})
    json.dump(rows, open(a.out, "w"), indent=1)
    exact = sum(1 for r in rows if (r["target"] or {}).get("exact"))
    sections = sum(1 for r in rows if str((r["target"] or {}).get("symbol", "")).startswith("."))
    print(f"rows {len(rows)} missing {missing} exact {exact} section_targets {sections}")

if __name__ == "__main__":
    main()
