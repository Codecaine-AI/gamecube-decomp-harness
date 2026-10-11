"""Compare a merged report M against max(E, U) per function.

Usage: python3 -I mvsmax.py <M-report> [--json out.json] [--base other-M-report] [--top N]
"""
import json
import sys

args = sys.argv[1:]
m_path = args[0]
out_json = None
base_path = None
top = 60
i = 1
while i < len(args):
    if args[i] == "--json":
        out_json = args[i + 1]; i += 2
    elif args[i] == "--base":
        base_path = args[i + 1]; i += 2
    elif args[i] == "--top":
        top = int(args[i + 1]); i += 2
    else:
        raise SystemExit(f"bad arg {args[i]}")


def load(path):
    r = json.load(open(path))
    out, src, size = {}, {}, {}
    for unit in r["units"]:
        for fn in unit.get("functions", []):
            k = f'{unit["name"]}::{fn["name"]}'
            out[k] = float(fn.get("fuzzy_match_percent", 0.0))
            src[k] = unit.get("metadata", {}).get("source_path")
            size[k] = int(fn.get("size", 0) or 0)
    return r["measures"], out, src, size


Em, E, Esrc, Esize = load("/tmp/sms-sync/O-report.json")
Um, U, _, _ = load("/tmp/sms-sync/U-report.json")
Mm, M, Msrc, Msize = load(m_path)

rows = []
for k in sorted(set(E) | set(U) | set(M)):
    e, u, m = E.get(k), U.get(k), M.get(k)
    best = max(x for x in (e, u) if x is not None) if (e is not None or u is not None) else None
    if best is None or m is None or m < best:
        lost_exact = best == 100.0 and (m is None or m < 100.0)
        rows.append({
            "function": k,
            "source": Msrc.get(k) or Esrc.get(k),
            "size": Msize.get(k) or Esize.get(k),
            "E": e, "U": u, "M": m, "max": best,
            "lostExact": lost_exact,
            "from": "E" if (e is not None and best == e and (u is None or e >= u)) else "U",
            "drop": (best or 0) - (m or 0),
        })
rows.sort(key=lambda r: (not r["lostExact"], -r["drop"]))

def meas(m):
    return f'matched_functions={m.get("matched_functions")} matched_code%={float(m.get("matched_code_percent", 0)):.4f} fuzzy%={float(m.get("fuzzy_match_percent", 0)):.4f}'

print("E:", meas(Em))
print("U:", meas(Um))
print("M:", meas(Mm))
lost = [r for r in rows if r["lostExact"]]
print(f"below max: {len(rows)}; lost exacts vs max(E,U): {len(lost)} (from E: {sum(1 for r in lost if r['from']=='E')}, from U: {sum(1 for r in lost if r['from']=='U')})")
gained_exact = sum(1 for k, m in M.items() if m == 100.0 and E.get(k) != 100.0 and U.get(k) != 100.0)
print(f"M exact where neither E nor U exact: {gained_exact}")
if base_path:
    _, B, _, _ = load(base_path)
    better = [(k, B.get(k), M[k]) for k in M if B.get(k) is not None and M[k] > B[k]]
    worse = [(k, B.get(k), M[k]) for k in M if B.get(k) is not None and M[k] < B[k]]
    print(f"vs base: improved {len(better)}, worsened {len(worse)}; base exact->not {sum(1 for k,b,m in worse if b==100.0)}, not->exact {sum(1 for k,b,m in better if m==100.0)}")
    for k, b, m in sorted(worse, key=lambda t: t[2]-t[1])[:25]:
        print(f"  WORSE {b:7.2f} -> {m:7.2f}  {k}")
    for k, b, m in sorted(better, key=lambda t: t[1]-t[2])[:25]:
        print(f"  BETTER {b:7.2f} -> {m:7.2f}  {k}")
by_file = {}
for r in rows:
    by_file.setdefault(r["source"], []).append(r)
print("\nper-file (lost exacts / below max):")
for f, rs in sorted(by_file.items(), key=lambda kv: (-sum(r["lostExact"] for r in kv[1]), -len(kv[1])))[:top]:
    print(f"  {sum(r['lostExact'] for r in rs):3d} / {len(rs):3d}  {f}")
print("\ntop rows:")
for r in rows[:top]:
    fm = lambda v: "  none " if v is None else f"{v:7.2f}"
    print(f"  {'X' if r['lostExact'] else ' '} E{fm(r['E'])} U{fm(r['U'])} M{fm(r['M'])}  {r['function']}")
if out_json:
    json.dump({"measures": {"E": Em, "U": Um, "M": Mm}, "rows": rows}, open(out_json, "w"), indent=1)
