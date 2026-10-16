#!/usr/bin/env python3
"""Plan 8.1: does the SMS steering gate reproduce the temp-hack audit verdicts?

For every audited PR (objectives/sms-pr189-split/audit/temp-audit/NN.json):

1. Candidate = overlay dir under /tmp holding `git show <head>:<path>` for every
   file the PR changed (`git diff --name-only 7fed828b <head>`, headers too).
   The sb-up7f checkout is used read-only (it sits at upstream 7fed828b).
2. Audit names are mapped to MWCC symbols through the unit's target object
   (demangled qualified name, f32/s32 spellings normalised); unmatched or
   ambiguous names are recorded, never dropped.
3. `steering_check.py check --base-ref 7fed828b --overlay-dir D --functions ...
   --jobs 3` runs once per PR, sequentially. Its JSON is cached in
   runs/<pr>.json together with the gate-source hash it ran against.
4. gate-vs-audit.{json,md}: confusion matrix (audit verdict x gate audit_label),
   decision counts, every incomplete/unresolved case with its reasons, the plan
   8.3 flip criteria, S* vs the audit's revert_test match_pct, runtime.

Nothing here is tuned to the audit: the gate runs with its defaults.

  python3 validate_audit.py              # run missing PRs, then report
  python3 validate_audit.py --pr 05      # rerun one PR (implies --force for it)
  python3 validate_audit.py --force      # rerun every PR
  python3 validate_audit.py --report-only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TOOLS = ROOT / "toolpacks/gamecube-decomp/_impl/gamecube/tools"
sys.path.insert(0, str(TOOLS))

HARNESS = Path("/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness")
AUDIT = HARNESS / "objectives/sms-pr189-split/audit/temp-audit"
REPO = HARNESS / "games/sms/workspace/sb-up7f"
BASE = "7fed828b"
RUNS = HERE / "runs"
OVERLAY_ROOT = Path("/tmp/sms-gate-vs-audit/overlay")
TMP_ROOT = Path("/tmp/sms-gate-vs-audit/tmp")
JOBS = 3
GATE_SOURCES = ["steering_check.py", "steering_edits.py", "steering_shapes.py", "steering_diagnose.py",
                "ir_oracle.py", "evidence_search.py", "stack_check.py", "stack_compare.py", "game_policy.py"]
LABELS = ["real", "mixed", "steering", "unresolved"]
DECISIONS = ["pass", "steering_located", "unresolved"]
VERDICTS = ["steering", "mixed", "real"]
SSTAR_TOL = 0.05  # percentage points

# Dolphin/SMS typedef spellings used in audit names -> demangler spellings.
TYPEDEFS = {"f32": "float", "f64": "double", "s8": "signed char", "u8": "unsigned char", "s16": "short",
            "u16": "unsigned short", "s32": "long", "u32": "unsigned long", "BOOL": "int"}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.decode(errors='replace')[:300]}")
    return r


def gate_hash() -> str:
    h = hashlib.sha256()
    for name in GATE_SOURCES:
        p = TOOLS / name
        h.update(name.encode())
        h.update(p.read_bytes() if p.is_file() else b"<absent>")
    return h.hexdigest()[:16]


def load_audit() -> list[dict]:
    out = []
    for p in sorted(AUDIT.glob("[0-9][0-9].json")):
        d = json.loads(p.read_text())
        d["pr"] = str(d.get("pr") or p.stem).zfill(2)
        out.append(d)
    return out


def norm_types(text: str) -> str:
    text = re.sub(r"\b(" + "|".join(TYPEDEFS) + r")\b", lambda m: TYPEDEFS[m.group(1)], text)
    return re.sub(r"\s+", "", text.replace("(void)", "()"))


def norm_params(text: str) -> str:
    """`(const Vec&) const` and `(Vec const &) const` compare equal: `const`
    inside the parameter list is dropped (east/west placement), the trailing
    method qualifier is kept."""
    close = text.rfind(")")
    inner, tail = text[:close + 1], text[close + 1:]
    inner = re.sub(r"\bconst\b", "", inner)
    return norm_types(inner) + norm_types(tail)


def split_name(name: str) -> tuple[str, str | None]:
    """`T::f(int) const` -> (`T::f`, `(int)const`); templates kept."""
    depth = 0
    for i, ch in enumerate(name):
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth -= 1
        elif ch == "(" and depth == 0:
            return name[:i].strip(), name[i:].strip()
    return name.strip(), None


# --------------------------------------------------------------------------
# candidate overlay + name mapping
# --------------------------------------------------------------------------


def build_overlay(pr: str, head: str) -> tuple[Path, list[str], list[str]]:
    paths = [p for p in git("diff", "--name-only", "--no-renames", BASE, head).stdout.decode().splitlines() if p]
    dest = OVERLAY_ROOT / pr
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    deleted = []
    for rel in paths:
        r = git("show", f"{head}:{rel}", check=False)
        if r.returncode != 0:
            deleted.append(rel)  # an overlay cannot express a deletion
            continue
        out = dest / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(r.stdout)
    return dest, paths, deleted


_repo_cache = None


def target_symbols(file: str) -> list[tuple[str, str, str, str]]:
    """(unit, mangled key, readable, qualified) for every function in the
    target objects of the units built from `file`."""
    global _repo_cache
    import evidence_search as es
    import stack_check
    import stack_compare as sc

    if _repo_cache is None:
        _repo_cache = stack_check.Repo(REPO)
    rp = _repo_cache
    out = []
    for u in rp.units_by_source.get(file, []):
        p = rp.root / u.target
        if not p.is_file():
            continue
        for key in sc.ElfObject.from_path(str(p)).keyed_functions():
            readable, qual = es.demangle(key)
            out.append((u.name, key, readable, qual))
    return out


def map_name(audit_name: str, file: str) -> dict:
    syms = target_symbols(file)
    if not syms:
        return {"status": "no_target_object", "symbols": []}
    qual, params = split_name(audit_name)
    want_q = norm_types(qual)
    hits = []
    for unit, key, readable, q in syms:
        if key == audit_name or key.replace("\\", "") == audit_name:
            hits.append((unit, key, readable))
            continue
        # `__sinit_X_cpp` demangles to `X_cpp::__sinit`
        alt = None
        m = re.fullmatch(r"(\w+_cpp)::(__sinit)", q)
        if m:
            alt = f"{m.group(2)}_{m.group(1)}"
        if norm_types(q) == want_q or (alt and alt == audit_name):
            if params is not None:
                _, rparams = split_name(readable.replace(q, "", 1).strip())
                if rparams is not None and norm_params(rparams) != norm_params(params):
                    continue
            hits.append((unit, key, readable))
    if not hits:
        return {"status": "unmatched", "symbols": []}
    return {"status": "ok" if len(hits) == 1 else "ambiguous",
            "symbols": [{"unit": u, "name": k, "readable": r} for u, k, r in hits]}


# --------------------------------------------------------------------------
# gate run
# --------------------------------------------------------------------------


def run_pr(entry: dict, ghash: str) -> dict:
    pr, head = entry["pr"], entry["head"]
    overlay, changed, deleted = build_overlay(pr, head)
    mapping = {f["name"]: map_name(f["name"], f["file"]) for f in entry["functions"]}
    wanted: list[str] = []
    for m in mapping.values():
        for s in m["symbols"]:
            # steering_check splits --functions on commas; mangled names have none here.
            name = s["name"] if "," not in s["name"] else s["readable"].split(" (")[0]
            if name not in wanted:
                wanted.append(name)
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    out_json = TMP_ROOT / f"check-{pr}.json"
    out_json.unlink(missing_ok=True)
    cmd = [sys.executable, str(TOOLS / "steering_check.py"), "check", "--repo", str(REPO), "--base-ref", BASE,
           "--overlay-dir", str(overlay), "--jobs", str(JOBS), "--json", "--out", str(out_json),
           "--tmp", str(TMP_ROOT)]
    if wanted:
        cmd += ["--functions", *wanted]
    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    elapsed = round(time.time() - t0, 1)
    check = json.loads(out_json.read_text()) if proc.returncode == 0 and out_json.is_file() else None
    result = {
        "meta": {
            "pr": pr, "head": head, "base": BASE, "gate_hash": ghash, "changed_files": changed,
            "deleted_files": deleted, "name_mapping": mapping, "functions_arg": wanted, "cmd": cmd,
            "exit_code": proc.returncode, "elapsed_s": elapsed, "stderr_tail": proc.stderr[-4000:],
            "ran_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        },
        "check": check,
    }
    RUNS.mkdir(parents=True, exist_ok=True)
    (RUNS / f"{pr}.json").write_text(json.dumps(result, indent=1) + "\n")
    return result


# --------------------------------------------------------------------------
# aggregation
# --------------------------------------------------------------------------


def group_summary(g: dict) -> dict:
    return {"id": g.get("id"), "status": g.get("status"), "shapes": g.get("shapes"),
            "real_shapes": g.get("real_shapes"), "reason": g.get("reason"), "file": g.get("path") or g.get("file")}


def function_rows(entry: dict, run: dict | None, ghash: str) -> list[dict]:
    rows = []
    meta = (run or {}).get("meta") or {}
    check = (run or {}).get("check")
    dec_fns = (check or {}).get("decision", {}).get("functions", []) if check else []
    groups = {g["id"]: g for g in ((check or {}).get("reduce") or {}).get("groups", [])} if check else {}
    for f in entry["functions"]:
        row = {"pr": entry["pr"], "head": entry["head"], "audit_name": f["name"], "file": f["file"],
               "verdict": f["verdict"], "audit_changes": [c.get("kind") for c in f.get("changes") or []],
               "revert_test": f.get("revert_test")}
        mapping = (meta.get("name_mapping") or {}).get(f["name"])
        row["mapping"] = mapping
        problems = []
        if run is None:
            problems.append("PR not run")
        elif meta.get("gate_hash") != ghash:
            problems.append(f"stale run (gate {meta.get('gate_hash')} vs current {ghash})")
        if run is not None and check is None:
            problems.append(f"gate tool failure (exit {meta.get('exit_code')}): "
                            + (meta.get("stderr_tail") or "").strip().splitlines()[-1:][0][:300]
                            if (meta.get("stderr_tail") or "").strip() else f"gate tool failure (exit {meta.get('exit_code')})")
        if mapping and mapping["status"] != "ok":
            problems.append(f"name mapping {mapping['status']}")
        names = {s["name"] for s in (mapping or {}).get("symbols", [])}
        hits = [d for d in dec_fns if d["name"] in names]
        if check is not None and not hits:
            problems.append("function not in gate output")
        row["gate_entries"] = len(hits)
        if len(hits) > 1:
            problems.append(f"{len(hits)} gate entries (units {', '.join(h['unit'] for h in hits)}); first used")
        if hits:
            d = hits[0]
            row.update({
                "gate_name": d["name"], "gate_demangled": d.get("demangled"), "unit": d["unit"],
                "decision": d["decision"], "audit_label": d["audit_label"], "analysis": d["analysis"],
                "semantic": d["semantic"], "match": d["match"], "status": d.get("status"),
                "sstar_vs_candidate": d.get("sstar_vs_candidate"),
                "stack_only_perturbation": d.get("stack_only_perturbation"),
                "reasons": d.get("reasons") or [],
                "groups": [group_summary(groups[g]) for g in d.get("groups") or [] if g in groups],
            })
        else:
            row.update({"decision": "unresolved", "audit_label": "unresolved", "analysis": "missing",
                        "semantic": None, "match": None, "reasons": []})
            row["missing"] = True
        row["problems"] = problems
        # S* vs the audit's revert test (steering/mixed revert tests revert the non-real edits).
        rt = f.get("revert_test") or {}
        sstar = (row.get("match") or {}).get("real_only")
        if rt.get("match_pct") is not None and sstar is not None:
            row["sstar_minus_revert"] = round(sstar - float(rt["match_pct"]), 4)
            row["sstar_agrees"] = abs(row["sstar_minus_revert"]) <= SSTAR_TOL
        rows.append(row)
    return rows


def evaluate(rows: list[dict]) -> dict:
    by_v = defaultdict(list)
    for r in rows:
        by_v[r["verdict"]].append(r)
    matrix = {v: {lab: sum(1 for r in by_v[v] if r["audit_label"] == lab) for lab in LABELS} for v in VERDICTS}
    decisions = {v: {d: sum(1 for r in by_v[v] if r["decision"] == d) for d in DECISIONS} for v in VERDICTS}
    st, mx, rl = by_v["steering"], by_v["mixed"], by_v["real"]
    st_pass = sum(r["decision"] == "pass" for r in st)
    st_loc = sum(r["decision"] == "steering_located" and r["analysis"] == "complete" for r in st)
    mx_pass = sum(r["decision"] == "pass" for r in mx)
    mx_ms = sum(r["audit_label"] in ("mixed", "steering") for r in mx)
    rl_pass = sum(r["decision"] == "pass" for r in rl)
    criteria = [
        {"id": "steering_no_pass", "rule": f"0/{len(st)} steering get pass", "value": st_pass, "ok": st_pass == 0},
        {"id": "steering_located", "rule": f">= 50/{len(st)} steering get steering_located with complete analysis",
         "value": st_loc, "ok": st_loc >= 50},
        {"id": "mixed_no_pass", "rule": f"0/{len(mx)} mixed get pass", "value": mx_pass, "ok": mx_pass == 0},
        {"id": "mixed_labelled", "rule": f">= 4/{len(mx)} mixed labelled mixed or steering", "value": mx_ms,
         "ok": mx_ms >= 4},
        {"id": "real_pass", "rule": f">= 5/{len(rl)} real pass", "value": rl_pass, "ok": rl_pass >= 5},
    ]
    sstar_rows = [r for r in st if "sstar_agrees" in r]
    sstar = {
        "tolerance_pp": SSTAR_TOL,
        "steering_with_both": len(sstar_rows),
        "steering_without_sstar": [r["audit_name"] for r in st if "sstar_agrees" not in r],
        "agree": sum(r["sstar_agrees"] for r in sstar_rows),
        "disagree": [{"pr": r["pr"], "function": r["audit_name"], "gate_sstar": r["match"]["real_only"],
                      "audit_revert": r["revert_test"]["match_pct"], "diff": r["sstar_minus_revert"],
                      "decision": r["decision"]} for r in sstar_rows if not r["sstar_agrees"]],
    }
    return {"matrix": matrix, "decisions": decisions, "criteria": criteria,
            "flip_criteria_ok": all(c["ok"] for c in criteria), "sstar_vs_revert": sstar}


def fmt_pct(x) -> str:
    return "-" if x is None else f"{x:.2f}"


def write_report(rows: list[dict], ev: dict, runs: dict[str, dict], ghash: str) -> None:
    runtime = {pr: (r.get("meta") or {}).get("elapsed_s") for pr, r in sorted(runs.items())}
    total = round(sum(v for v in runtime.values() if v), 1)
    attempts = {pr: ((r.get("check") or {}).get("decision") or {}).get("attempt") for pr, r in sorted(runs.items())}
    flagged = [r for r in rows if r["decision"] != "pass" and (r["analysis"] != "complete" or r["decision"] == "unresolved")]
    payload = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "base": BASE, "repo": str(REPO),
               "gate_hash": ghash, "jobs": JOBS, "functions": len(rows), **ev,
               "incomplete_or_unresolved": [{k: r.get(k) for k in ("pr", "audit_name", "verdict", "decision",
                                                                    "analysis", "semantic", "reasons", "problems")}
                                            for r in flagged],
               "runtime_s": {"per_pr": runtime, "total": total}, "attempt_per_pr": attempts, "rows": rows}
    (HERE / "gate-vs-audit.json").write_text(json.dumps(payload, indent=1) + "\n")

    L = []
    L.append("# Gate vs temp-hack audit (plan 8.1)\n")
    L.append(f"Generated {payload['generated_at']} by `validate_audit.py`. Base `{BASE}`, gate sources hash "
             f"`{ghash}`, `--jobs {JOBS}`, gate defaults otherwise. {len(rows)} audited functions in "
             f"{len(runs)} PRs. Runtime {total} s total.\n")
    L.append("## Confusion matrix: audit verdict x gate audit_label\n")
    L.append("| audit \\ gate | " + " | ".join(LABELS) + " | total |")
    L.append("| - | " + " | ".join("-" for _ in LABELS) + " | - |")
    for v in VERDICTS:
        L.append(f"| {v} | " + " | ".join(str(ev["matrix"][v][lab]) for lab in LABELS)
                 + f" | {sum(ev['matrix'][v].values())} |")
    L.append("\n## Gate decision per audit verdict\n")
    L.append("| audit \\ decision | " + " | ".join(DECISIONS) + " |")
    L.append("| - | " + " | ".join("-" for _ in DECISIONS) + " |")
    for v in VERDICTS:
        L.append(f"| {v} | " + " | ".join(str(ev["decisions"][v][d]) for d in DECISIONS) + " |")
    L.append("\n## Plan 8.3 flip criteria (audit part)\n")
    L.append("| criterion | value | result |")
    L.append("| - | - | - |")
    for c in ev["criteria"]:
        L.append(f"| {c['rule']} | {c['value']} | {'PASS' if c['ok'] else 'FAIL'} |")
    L.append(f"\nAll audit criteria hold: **{'yes' if ev['flip_criteria_ok'] else 'no'}** "
             "(adversarial suite and smoke test are separate).\n")
    s = ev["sstar_vs_revert"]
    L.append(f"## S* match vs audit revert_test (steering, tolerance {s['tolerance_pp']} pp)\n")
    L.append(f"{s['agree']}/{s['steering_with_both']} agree. Without a gate S* value: "
             f"{', '.join(s['steering_without_sstar']) or 'none'}.\n")
    if s["disagree"]:
        L.append("| PR | function | gate S* | audit revert | diff | decision |")
        L.append("| - | - | - | - | - | - |")
        for d in s["disagree"]:
            L.append(f"| {d['pr']} | `{d['function']}` | {fmt_pct(d['gate_sstar'])} | {fmt_pct(d['audit_revert'])} "
                     f"| {d['diff']:+.2f} | {d['decision']} |")
    L.append("\n## Every incomplete or unresolved case\n")
    if not flagged:
        L.append("None.\n")
    for r in flagged:
        reasons = "; ".join((r.get("problems") or []) + (r.get("reasons") or [])) or "(gate gave no reason)"
        L.append(f"- PR {r['pr']} `{r['audit_name']}` (audit {r['verdict']}): {r['decision']}, analysis "
                 f"{r['analysis']}, semantic {r.get('semantic')}. {reasons[:700]}")
    L.append("\n## All functions\n")
    L.append("| PR | function | audit | decision | label | analysis | base | cand | S* | revert | S* vs cand |")
    L.append("| - | - | - | - | - | - | - | - | - | - | - |")
    for r in rows:
        m = r.get("match") or {}
        rt = (r.get("revert_test") or {}).get("match_pct")
        L.append(f"| {r['pr']} | `{r['audit_name']}` | {r['verdict']} | {r['decision']} | {r['audit_label']} | "
                 f"{r['analysis']} | {fmt_pct(m.get('base'))} | {fmt_pct(m.get('candidate'))} | "
                 f"{fmt_pct(m.get('real_only'))} | {fmt_pct(rt)} | {r.get('sstar_vs_candidate') or '-'} |")
    L.append("\n## Runtime and attempt decision per PR\n")
    L.append("| PR | seconds | attempt |")
    L.append("| - | - | - |")
    for pr in sorted(runs):
        L.append(f"| {pr} | {runtime.get(pr)} | {attempts.get(pr)} |")
    (HERE / "gate-vs-audit.md").write_text("\n".join(L) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pr", action="append", help="rerun only these PRs (e.g. 05); implies --force for them")
    ap.add_argument("--force", action="store_true", help="rerun even with a cached run")
    ap.add_argument("--report-only", action="store_true")
    args = ap.parse_args()
    if git("rev-parse", "HEAD").stdout.decode().strip()[:8] != BASE[:8]:
        print(f"warning: {REPO} HEAD is not {BASE}", file=sys.stderr)
    audit = load_audit()
    ghash = gate_hash()
    selected = {p.zfill(2) for p in args.pr or []}
    runs: dict[str, dict] = {}
    for entry in audit:
        pr = entry["pr"]
        cache = RUNS / f"{pr}.json"
        rerun = not args.report_only and (
            pr in selected or (not selected and (args.force or not cache.is_file())))
        if rerun:
            print(f"[{time.strftime('%H:%M:%S')}] PR {pr}: running gate ({len(entry['functions'])} functions)",
                  file=sys.stderr, flush=True)
            runs[pr] = run_pr(entry, ghash)
            m = runs[pr]["meta"]
            att = ((runs[pr]["check"] or {}).get("decision") or {}).get("attempt")
            print(f"[{time.strftime('%H:%M:%S')}] PR {pr}: exit {m['exit_code']}, {m['elapsed_s']}s, attempt {att}",
                  file=sys.stderr, flush=True)
        elif cache.is_file():
            runs[pr] = json.loads(cache.read_text())
    rows = []
    for entry in audit:
        rows += function_rows(entry, runs.get(entry["pr"]), ghash)
    ev = evaluate(rows)
    write_report(rows, ev, runs, ghash)
    print(json.dumps({"matrix": ev["matrix"], "decisions": ev["decisions"],
                      "criteria": [(c["id"], c["value"], c["ok"]) for c in ev["criteria"]]}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
