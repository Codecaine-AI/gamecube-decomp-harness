"""fnscore.py <source-substring> [report ...]: per-function fuzzy scores for units whose source_path contains the substring.
Default reports: O (ours fede613d) and U (upstream f8542190). Extra reports (e.g. /tmp/sms-sync/M0-report.json) add columns."""
import json, sys
sub = sys.argv[1]
paths = sys.argv[2:] or []
reps = [("O", "/tmp/sms-sync/O-report.json"), ("U", "/tmp/sms-sync/U-report.json")] + [(p.split("/")[-1].replace("-report.json", ""), p) for p in paths]
tabs = []
for name, p in reps:
    d = json.load(open(p)); t = {}
    for u in d["units"]:
        sp = u.get("metadata", {}).get("source_path") or ""
        if sub in sp:
            for f in u.get("functions", []) or []:
                t[f["name"]] = (f.get("fuzzy_match_percent", 0.0), f.get("metadata", {}).get("demangled_name", ""), f.get("size"))
    tabs.append((name, t))
keys = sorted(set().union(*[set(t) for _, t in tabs]))
print("  ".join(f"{n:>7}" for n, _ in tabs), " size  function")
for k in keys:
    vals = [t.get(k) for _, t in tabs]
    dem = next((v[1] for v in vals if v), "") or k
    size = next((v[2] for v in vals if v), "")
    flag = "*" if len({round(v[0], 3) if v else None for v in vals}) > 1 else " "
    print("  ".join(f"{v[0]:7.2f}" if v else "   none" for v in vals), f"{size!s:>5}", flag, dem)
