#!/usr/bin/env python3
"""Validate the SMS order-and-scope rules against the frozen adjudication (order-scope-plan.md section 8).

For every PR head (#338-#348, plus the #342/#344 pre-fix heads) over its own base:
- `edit_scope.py pr` (readiness at the base, SMS `ordering` policy from games/sms/game.json), once without
  UNUSED evidence and once with the stub-test results below as `--unused-checks`;
- the review lints `sms_out_of_order_fill`, `sms_undecompiled_class_decl`, `sms_unused_reconstruction`
  through `scan_diff.py --base <base> --surface pr_gate` in ref mode (HEAD = the PR head in a scratch
  clone that borrows the shared repo's objects), ORCH_GAME_DIR=games/sms, ORCH_GAME_REPO_ROOT=<base sandbox>.
  `production` uses the pr_gate's own pathspec (scan_diff default: src); `with_include` adds `--path include`;
- `steering_check.py unused-test` for every UNUSED reconstruction candidate (edit_scope or the lint), with
  overlay = the head's changed file texts over the base sandbox;
- `readiness.py index` at each base.
Tool findings are mapped onto adjudicated hunks (same file; line inside the hunk, or the finding's class
listed on the hunk) and compared with the frozen verdicts. Outputs order-vs-adjudication.{json,md}.

The adjudication is never edited: its sha256 is checked against adjudication.sha256 before and after.
The shared repo and the sandboxes are read-only here; all scratch state lives under order-runs/ (gitignored).
Rerunnable: tool outputs are cached under order-runs/; pass --force to recompute, --no-stub to skip builds.
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
RUNS = HERE / "order-runs"
TOOLS = ROOT / "toolpacks/gamecube-decomp/_impl/gamecube/tools"
SCAN = ROOT / "toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py"
WS = Path("/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace")
SHARED = WS / "checkout"
ADJ = HERE / "adjudication.jsonl"
ADJ_SHA = HERE / "adjudication.sha256"
LINTS = ("sms_out_of_order_fill", "sms_undecompiled_class_decl", "sms_unused_reconstruction")
REJECT = {"not_ready", "unresolved", "order_gated", "dead_unused", "unused_unverified"}
ORDER_REJECT = {"not_ready", "unresolved", "order_gated"}
WARN = {"local_helper"}
BASES = {"efbba0f1": ("efbba0f18fd5185884a4b06c7cdc9f4e4f39e8be", "sb-upefb"),
         "84bca82f": ("84bca82fd92a3f77035079d1c86a4d58becd903d", "sb-up84")}
# (label, pr, head, base, merged head?)
HEADS = [
    ("338", 338, "10120f33", "efbba0f1", True), ("339", 339, "3ef55380", "efbba0f1", True),
    ("340", 340, "b499fd42", "efbba0f1", True), ("341", 341, "5c95ffdd", "efbba0f1", True),
    ("342", 342, "11e326b7", "84bca82f", True), ("342-prefix", 342, "360931f3", "84bca82f", False),
    ("343", 343, "fd01d81b", "84bca82f", True),
    ("344", 344, "4992225c", "84bca82f", True), ("344-prefix", 344, "62c30063", "84bca82f", False),
    ("345", 345, "1b2f9f72", "84bca82f", True), ("346", 346, "e02e1279", "84bca82f", True),
    ("347", 347, "866973a4", "84bca82f", False), ("348", 348, "e64b5a8d", "84bca82f", False),
]
SPOTLIGHT = [("342-prefix", "TChuuHana::margeVelocity"), ("342-prefix", "TChuuHana::rolling"),
             ("344-prefix", "TMareEventDepressWall::emitEffect")]


def log(msg: str) -> None:
    print(f"[validate_order] {msg}", file=sys.stderr, flush=True)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def check_adjudication(stage: str) -> str:
    want = ADJ_SHA.read_text().split()[0]
    got = sha256(ADJ)
    if got != want:
        raise SystemExit(f"adjudication.jsonl sha256 {got} != frozen {want} ({stage}); refusing to continue")
    log(f"adjudication sha256 ok ({stage}): {got}")
    return got


def git(repo: Path, *args: str, check: bool = True) -> str:
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.strip()}")
    return r.stdout


def full(rev: str) -> str:
    return git(SHARED, "rev-parse", f"{rev}^{{commit}}").strip()


def policy() -> dict:
    return json.loads((ROOT / "games/sms/game.json").read_text())["ordering"]


def env(sandbox: Path) -> dict:
    return {**os.environ, "ORCH_GAME_ID": "sms", "ORCH_GAME_DIR": str(ROOT / "games/sms"),
            "ORCH_GAME_KNOWLEDGE_ROOT": str(ROOT / "games/sms/knowledge"), "ORCH_GAME_REPO_ROOT": str(sandbox),
            "ORCH_READINESS_CACHE": str(RUNS / "readiness-cache")}


def cached_run(path: Path, cmd: list[str], run_env: dict, force: bool, cwd: Path | None = None) -> dict:
    """Run a JSON-emitting tool once; cache {cmd, exit, stdout json, stderr tail, seconds}."""
    if path.is_file() and not force:
        return json.loads(path.read_text())
    t0 = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True, env=run_env, cwd=str(cwd) if cwd else None)
    try:
        out = json.loads(r.stdout) if r.stdout.strip() else None
    except ValueError:
        out = None
    rec = {"cmd": cmd, "exit": r.returncode, "seconds": round(time.time() - t0, 1), "result": out,
           "stderr_tail": r.stderr[-4000:]}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(rec, indent=1))
    return rec


# ---------------------------------------------------------------------- tool runs

def scratch_checkout(head: str) -> Path:
    """A private clone whose objects come from the shared repo (alternates); only this clone is written."""
    s = RUNS / "scratch"
    if not (s / ".git").is_dir():
        s.mkdir(parents=True, exist_ok=True)
        git(s, "init", "-q")
        (s / ".git/objects/info/alternates").write_text(str(SHARED / ".git/objects") + "\n")
    git(s, "checkout", "-q", "-f", "--detach", full(head))
    git(s, "clean", "-fdq")
    return s


def run_edit_scope(label: str, head: str, base: str, sandbox: Path, force: bool, checks: Path | None) -> dict:
    name = "edit_scope.evidence.json" if checks else "edit_scope.json"
    cmd = [sys.executable, str(TOOLS / "edit_scope.py"), "pr", "--repo", str(sandbox), "--base", base,
           "--head", full(head), "--policy-json", json.dumps(policy()), "--json"]
    if checks:
        cmd += ["--unused-checks", str(checks)]
    return cached_run(RUNS / label / name, cmd, env(sandbox), force)


def run_lints(label: str, head: str, base: str, sandbox: Path, force: bool) -> dict:
    out = {}
    for variant, extra in (("production", []), ("with_include", ["--path", "src", "--path", "include"])):
        path = RUNS / label / f"lint.{variant}.json"
        if path.is_file() and not force:
            out[variant] = json.loads(path.read_text())
            continue
        s = scratch_checkout(head)
        cmd = [sys.executable, str(SCAN), "--repo", str(s), "--base", base, "--surface", "pr_gate", "--json", *extra]
        out[variant] = cached_run(path, cmd, env(sandbox), True)
    return out


def changed_files(base: str, head: str) -> list[str]:
    names = git(SHARED, "diff", "--name-only", "--no-renames", base, full(head), "--", "src", "include", "libs")
    return [n for n in names.splitlines() if n]


def overlay_for(label: str, head: str, base: str) -> Path:
    d = RUNS / label / "overlay"
    if d.is_dir():
        return d
    tmp = RUNS / label / "overlay.tmp"
    shutil.rmtree(tmp, ignore_errors=True)
    for rel in changed_files(base, head):
        r = subprocess.run(["git", "-C", str(SHARED), "show", f"{full(head)}:{rel}"], capture_output=True)
        if r.returncode != 0:
            continue  # deleted at head
        (tmp / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp / rel).write_bytes(r.stdout)
    tmp.mkdir(parents=True, exist_ok=True)
    tmp.rename(d)
    return d


def run_stub(label: str, head: str, base: str, sandbox: Path, file: str, function: str, force: bool) -> dict:
    key = re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{file}__{function}")
    tmpdir = RUNS / "tmp"
    tmpdir.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, str(TOOLS / "steering_check.py"), "unused-test", "--repo", str(sandbox), "--base-ref", base,
           "--overlay-dir", str(overlay_for(label, head, base)), "--file", file, "--function", function,
           "--jobs", "3", "--tmp", str(tmpdir), "--json"]
    return cached_run(RUNS / label / "stub" / f"{key}.json", cmd, env(sandbox), force)


def run_readiness(base: str, sandbox: Path, force: bool) -> dict:
    cmd = [sys.executable, str(TOOLS / "readiness.py"), "index", "--repo", str(sandbox), "--rev", base,
           "--policy-json", json.dumps(policy()), "--json"]
    return cached_run(RUNS / f"readiness-{base}.json", cmd, env(sandbox), force)


# ---------------------------------------------------------------------- mapping

def unused_candidates(es: dict, lint: dict) -> list[dict]:
    """UNUSED reconstruction candidates named by edit_scope (dead_unused/unused_unverified) or the lint."""
    found: dict[tuple, dict] = {}
    for h in (es.get("result") or {}).get("hunks") or []:
        if h["verdict"] in ("dead_unused", "unused_unverified") or "UNUSED" in (h.get("reason") or ""):
            m = re.match(r"UNUSED (.+?) (?:reconstructed|is dead)", h.get("reason") or "")
            if m:
                fn = m.group(1).split("(", 1)[0].strip()
                found.setdefault((h["file"], fn), {"file": h["file"], "function": fn, "line": h["line"],
                                                   "sources": set()})["sources"].add("edit_scope")
    for f in ((lint.get("result") or {}).get("findings") or []):
        if f["rule_id"] == "sms_unused_reconstruction" and (f.get("detail") or {}).get("function"):
            fn = f["detail"]["function"].split("(", 1)[0].strip()
            found.setdefault((f["file"], fn), {"file": f["file"], "function": fn, "line": f["line"],
                                               "sources": set()})["sources"].add("lint")
    return [dict(v, sources=sorted(v["sources"])) for _, v in sorted(found.items())]


def map_finding(adj: list[dict], file: str, line: int | None, cls: str | None) -> tuple[list[int], str]:
    """Indexes of adjudicated hunks a finding belongs to: line inside the hunk, plus (class-level findings)
    every hunk in the same file that lists the class. Returns (indexes, method)."""
    same = [i for i, a in enumerate(adj) if a["file"] == file]
    by_line = [i for i in same if line is not None and adj[i]["hunk_start"] <= line <= adj[i]["hunk_end"]]
    by_class = [i for i in same if cls and cls in (adj[i].get("classes") or [])]
    idx = sorted(set(by_line) | set(by_class))
    method = "+".join(m for m, v in (("line", by_line), ("class", by_class)) if v) or "unmapped"
    return idx, method


def lint_rows(rec: dict) -> list[dict]:
    return [f for f in ((rec.get("result") or {}).get("findings") or []) if f["rule_id"] in LINTS]


def stub_summary(rec: dict) -> dict:
    r = rec.get("result")
    if not r:
        return {"status": "tool_error", "exit": rec.get("exit"), "error": rec.get("stderr_tail", "")[-600:]}
    checks = []
    for c in r.get("checks") or []:
        checks.append({"line": c.get("line"), "status": c.get("status"), "reason": c.get("reason"),
                       "base": c.get("base"), "body_sha256": c.get("body_sha256"),
                       "callers": [{"function": x["function"], "before": x["before"].get("match_percent"),
                                    "after": x["after"].get("match_percent"), "delta": x.get("delta")}
                                   for x in c.get("callers") or []],
                       "changed": [{"function": x.get("function"), "before": (x.get("before") or {}).get("match_percent"),
                                    "after": (x.get("after") or {}).get("match_percent"),
                                    "before_status": (x.get("before") or {}).get("status"),
                                    "after_status": (x.get("after") or {}).get("status")}
                                   for x in c.get("changed") or []]})
    return {"status": r.get("status"), "map_unused": (r.get("map") or {}).get("unused"), "checks": checks,
            "seconds": rec.get("seconds")}


def es_hunk_verdict(rows: list[dict]) -> str:
    vs = {r["verdict"] for r in rows}
    return "reject" if vs & REJECT else "warn" if vs & WARN else "pass"


def lint_hunk_verdict(rows: list[dict]) -> str:
    sev = {r["severity"] for r in rows}
    return "reject" if "error" in sev else "warn" if sev & {"warning", "info"} else "pass"


def todo_classes(base: str) -> dict[str, list[str]]:
    out = {}
    for f in ("src/System/MarNameRefGen_Enemy.cpp", "src/System/MarNameRefGen_BossEnemy.cpp"):
        text = git(SHARED, "show", f"{BASES[base][0]}:{f}")
        classes = []
        # `new` split across lines: "//     return new" / "//     TKoopaJrSubmarineManager(...)"
        for m in re.finditer(r"//\s*TODO:?\s*\n((?:\s*//.*\n)+)", text):
            block = " ".join(l.strip().lstrip("/").strip() for l in m.group(1).splitlines())
            for c in re.findall(r"\bnew\s+(T\w+)", block):
                if c not in classes:
                    classes.append(c)
        out[f] = list(dict.fromkeys(classes))
    return out


# ---------------------------------------------------------------------- main

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--force", action="store_true", help="recompute every cached tool output")
    ap.add_argument("--no-stub", action="store_true", help="skip steering unused-test builds (use cache only)")
    args = ap.parse_args()
    RUNS.mkdir(exist_ok=True)
    adj_sha_before = check_adjudication("before")
    adjud = [json.loads(l) for l in ADJ.read_text().splitlines() if l.strip()]

    readiness = {b: run_readiness(b, WS / sb, args.force) for b, (_, sb) in BASES.items()}
    heads_out = []
    for label, pr, head, base, merged in HEADS:
        sandbox = WS / BASES[base][1]
        fh = full(head)
        adj = [a for a in adjud if a["pr"] == pr and a["head"] == fh]
        log(f"{label} {head}: {len(adj)} adjudicated hunks")
        es0 = run_edit_scope(label, head, base, sandbox, args.force, None)
        lints = run_lints(label, head, base, sandbox, args.force)
        cands = unused_candidates(es0, lints["production"])
        stubs, checks = [], []
        for c in cands:
            path = RUNS / label / "stub" / (re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{c['file']}__{c['function']}") + ".json")
            if args.no_stub and not path.is_file():
                rec = {"result": None, "exit": None, "stderr_tail": "skipped (--no-stub)"}
            else:
                log(f"  unused-test {c['file']} {c['function']}")
                rec = run_stub(label, head, base, sandbox, c["file"], c["function"], args.force)
                for row in ((rec.get("result") or {}).get("checks") or []):
                    checks.append(row)
            stubs.append(dict(c, **stub_summary(rec)))
        ev_path = RUNS / label / "unused_checks.json"
        ev_path.write_text(json.dumps(checks, indent=1))
        es1 = run_edit_scope(label, head, base, sandbox, True, ev_path) if checks else es0

        # map tool rows onto adjudicated hunks
        per = [{"es": [], "es_ev": [], "lint": [], "lint_incl": [], "stub": []} for _ in adj]
        unmapped = []
        for key, rec in (("es", es0), ("es_ev", es1)):
            for h in (rec.get("result") or {}).get("hunks") or []:
                # UNUSED rows are function-level (line = the definition): map by line only;
                # class rows (declarations, order-gated references) also map to hunks listing the class
                unused_row = h["verdict"] in ("dead_unused", "unused_unverified") or (h.get("reason") or "").startswith("UNUSED ")
                idx, method = map_finding(adj, h["file"], h["line"], None if unused_row else h.get("class"))
                for i in idx:
                    per[i][key].append(dict(h, map=method))
                if not idx and key == "es":
                    unmapped.append({"tool": "edit_scope", **h})
        for key, variant in (("lint", "production"), ("lint_incl", "with_include")):
            for f in lint_rows(lints[variant]):
                cls = (f.get("detail") or {}).get("class")
                idx, method = map_finding(adj, f["file"], f["line"], cls)
                row = {"rule_id": f["rule_id"], "severity": f["severity"], "file": f["file"], "line": f["line"],
                       "class": cls, "state": (f.get("detail") or {}).get("state"),
                       "function": (f.get("detail") or {}).get("function"), "message": f.get("message", "")[:300], "map": method}
                for i in idx:
                    per[i][key].append(row)
                if not idx:
                    unmapped.append({"tool": f"lint:{variant}", **row})
        for s in stubs:
            lines = sorted({c["line"] for c in s.get("checks") or [] if c.get("line")} | {s["line"]})
            cls = s["function"].rsplit("::", 1)[0] if "::" in s["function"] else None
            hit = set()
            for ln in lines:
                hit |= set(map_finding(adj, s["file"], ln, None)[0])
            # call-site hunks: adjudicated uncertain hunks naming the function in the same file
            short = s["function"].rsplit("::", 1)[-1]
            hit |= {i for i, a in enumerate(adj) if a["file"] == s["file"] and short in (a["reason"] + a["summary"])}
            for i in sorted(hit):
                per[i]["stub"].append({"function": s["function"], "status": s["status"]})
        hunks = []
        for a, p in zip(adj, per):
            hunks.append({"file": a["file"], "start": a["hunk_start"], "end": a["hunk_end"], "classes": a["classes"],
                          "summary": a["summary"], "adjudicated": a["verdict"], "adj_reason": a["reason"],
                          "edit_scope": es_hunk_verdict(p["es"]), "edit_scope_rows": p["es"],
                          "edit_scope_evidence": es_hunk_verdict(p["es_ev"]), "edit_scope_evidence_rows": p["es_ev"],
                          "lint": lint_hunk_verdict(p["lint"]), "lint_rows": p["lint"],
                          "lint_with_include": lint_hunk_verdict(p["lint_incl"]), "lint_with_include_rows": p["lint_incl"],
                          "stub": p["stub"]})
        r0 = es0.get("result") or {}
        heads_out.append({"label": label, "pr": pr, "head": fh, "base": BASES[base][0], "merged": merged,
                          "edit_scope_verdict": r0.get("verdict"), "edit_scope_error": None if es0.get("result") else es0.get("stderr_tail"),
                          "edit_scope_evidence_verdict": (es1.get("result") or {}).get("verdict"),
                          "edit_scope_warnings": r0.get("warnings"), "pr_size": r0.get("pr_size"),
                          "lint_exit": {v: lints[v].get("exit") for v in lints},
                          "lint_counts": {v: dict(Counter(f["rule_id"] for f in lint_rows(lints[v]))) for v in lints},
                          "hunks": hunks, "unmapped": unmapped, "stubs": stubs})

    report = summarize(heads_out, readiness)
    report["adjudication_sha256"] = {"before": adj_sha_before, "after": check_adjudication("after")}
    (HERE / "order-vs-adjudication.json").write_text(json.dumps(report, indent=1, default=list))
    (HERE / "order-vs-adjudication.md").write_text(render_md(report))
    log("wrote order-vs-adjudication.{json,md}")
    return 0


def confusion(heads: list[dict], key: str) -> dict:
    c = Counter()
    for h in heads:
        for x in h["hunks"]:
            c[(x["adjudicated"], x[key])] += 1
    viol = [k for k in c if k[0].startswith("violates")]
    return {"by_adjudication": {f"{a}->{t}": n for (a, t), n in sorted(c.items())},
            "violations": sum(c[k] for k in viol),
            "violations_rejected": sum(c[k] for k in viol if k[1] == "reject"),
            "violations_warned_only": sum(c[k] for k in viol if k[1] == "warn"),
            "violations_missed": sum(c[k] for k in viol if k[1] == "pass"),
            "ok_hunks": sum(n for (a, _), n in c.items() if a == "ok"),
            "ok_rejected_false_positive": c[("ok", "reject")], "ok_warned": c[("ok", "warn")],
            "uncertain": sum(n for (a, _), n in c.items() if a == "uncertain"),
            "uncertain_rejected": c[("uncertain", "reject")], "uncertain_warned": c[("uncertain", "warn")]}


def summarize(heads: list[dict], readiness: dict) -> dict:
    tools = ("edit_scope", "edit_scope_evidence", "lint", "lint_with_include")
    conf = {t: confusion(heads, t) for t in tools}
    merged_flags = []
    for h in heads:
        if not h["merged"]:
            continue
        for x in h["hunks"]:
            reasons = []
            for r in x["edit_scope_rows"]:
                if r["verdict"] in REJECT | WARN:
                    reasons.append(f"edit_scope {r['verdict']} {r.get('class') or ''} @{r['line']}: {r['reason']}")
            for r in x["lint_rows"]:
                reasons.append(f"lint {r['rule_id']} [{r['severity']}] @{r['line']}: {r['message']}")
            for r in x["lint_with_include_rows"]:
                if r not in x["lint_rows"]:
                    reasons.append(f"lint(with include) {r['rule_id']} [{r['severity']}] @{r['line']}")
            if reasons:
                merged_flags.append({"pr": h["pr"], "file": x["file"], "lines": f"{x['start']}-{x['end']}",
                                     "adjudicated": x["adjudicated"], "edit_scope": x["edit_scope"],
                                     "edit_scope_evidence": x["edit_scope_evidence"], "lint": x["lint"],
                                     "stub": x["stub"], "reasons": reasons})
        for u in h["unmapped"]:
            if u.get("verdict") not in REJECT | WARN and u.get("tool") == "edit_scope":
                continue  # own_class / ready rows outside adjudicated hunks are not flags
            merged_flags.append({"pr": h["pr"], "file": u.get("file"), "lines": str(u.get("line")),
                                 "adjudicated": "(no adjudicated hunk)", "edit_scope": u.get("verdict"),
                                 "reasons": [json.dumps(u)[:400]]})
    # enforce criteria (edit_scope is the enforce mechanism; lints are the review backstop)
    crit = {}
    for t in ("edit_scope", "edit_scope_evidence"):
        v = [x for h in heads if h["pr"] in (347, 348) for x in h["hunks"] if x["adjudicated"].startswith("violates")]
        caught = [x for x in v if x[t] == "reject"]
        merged_rej = [dict(pr=h["pr"], file=x["file"], lines=f"{x['start']}-{x['end']}", adjudicated=x["adjudicated"],
                           verdicts=sorted({r["verdict"] for r in x[t + "_rows"] if r["verdict"] in REJECT}))
                      for h in heads if h["merged"] for x in h["hunks"]
                      if x[t] == "reject" and not x["adjudicated"].startswith("violates")]
        false_ready = [m for m in merged_rej if set(m["verdicts"]) & ORDER_REJECT]
        crit[t] = {"c1_347_348_violations_rejected": f"{len(caught)}/{len(v)}", "c1_pass": len(caught) == len(v),
                   "c2_merged_non_violation_hunks_rejected": merged_rej, "c2_pass": not merged_rej,
                   "c3_false_order_blocks_on_merged_hunks": false_ready, "c3_pass": not false_ready,
                   "enforce_ok": len(caught) == len(v) and not merged_rej and not false_ready}
    spot = []
    for label, fn in SPOTLIGHT:
        h = next(h for h in heads if h["label"] == label)
        s = [s for s in h["stubs"] if s["function"] == fn]
        spot.append({"head": label, "function": fn, "result": s[0] if s else "not a candidate of any tool"})
    # readiness at 84bca82f vs upstream TODO classes
    idx = (readiness["84bca82f"].get("result") or {})
    fns = idx.get("functions") or {}
    blocked = {k: v for k, v in fns.items() if v.get("state") == "blocked"}
    deferred = {k: v for k, v in fns.items() if v.get("state") == "deferred"}
    todo = todo_classes("84bca82f")
    cmp = {}
    for f, classes in todo.items():
        unit = "mario/" + f[len("src/"):-len(".cpp")]
        unmet = sorted({u["class"] for k, v in blocked.items() if k.startswith(unit + "::") for u in v["unmet"]})
        cmp[f] = {"todo_classes": sorted(set(classes)), "blocked_unmet_classes": unmet,
                  "todo_not_blocked": sorted(set(classes) - set(unmet)), "blocked_not_todo": sorted(set(unmet) - set(classes))}
    return {"heads": heads, "confusion": conf, "merged_flags": merged_flags, "enforce_criteria": crit,
            "stub_spotlight": spot,
            "readiness_84bca82f": {"identity": idx.get("identity"), "summary": idx.get("summary"),
                                   "blocked": blocked, "deferred": deferred, "todo_comparison": cmp},
            "readiness_efbba0f1_summary": (readiness["efbba0f1"].get("result") or {}).get("summary")}


def _cell(rows: list[dict], key: str) -> str:
    return ", ".join(sorted({str(r.get(key)) for r in rows})) or "-"


def render_md(rep: dict) -> str:
    L = ["# Order-and-scope rules vs frozen adjudication", "",
         f"Adjudication sha256 before {rep['adjudication_sha256']['before'][:16]}..., after {rep['adjudication_sha256']['after'][:16]}... (unchanged).",
         "Generated by `validate_order.py`; raw tool outputs under `order-runs/` (gitignored).", "",
         "Columns: adjudicated verdict; `edit_scope pr` hunk verdict without / with stub-test evidence (row verdicts);"
         " lint (production pr_gate pathspec `src`) and lint with `--path include`; stub-test status.", "",
         "## Enforce criteria (plan section 8)", ""]
    for t, c in rep["enforce_criteria"].items():
        L.append(f"- **{t}**: C1 #347/#348 violations rejected {c['c1_347_348_violations_rejected']} ({'pass' if c['c1_pass'] else 'FAIL'});"
                 f" C2 merged non-violation hunks rejected: {len(c['c2_merged_non_violation_hunks_rejected'])} ({'pass' if c['c2_pass'] else 'FAIL'});"
                 f" C3 false order blocks on merged hunks: {len(c['c3_false_order_blocks_on_merged_hunks'])} ({'pass' if c['c3_pass'] else 'FAIL'})."
                 f" Enforce OK: **{c['enforce_ok']}**")
        for m in c["c2_merged_non_violation_hunks_rejected"]:
            L.append(f"  - #{m['pr']} {m['file']}:{m['lines']} adjudicated {m['adjudicated']}, rejected as {', '.join(m['verdicts'])}")
    L += ["", "## Confusion summary", "", "| tool | violations | rejected | warned only | missed | ok hunks | ok rejected (FP) | ok warned | uncertain | uncertain rejected | uncertain warned |",
          "|---|---|---|---|---|---|---|---|---|---|---|"]
    for t, c in rep["confusion"].items():
        L.append(f"| {t} | {c['violations']} | {c['violations_rejected']} | {c['violations_warned_only']} | {c['violations_missed']} | {c['ok_hunks']} | "
                 f"{c['ok_rejected_false_positive']} | {c['ok_warned']} | {c['uncertain']} | {c['uncertain_rejected']} | {c['uncertain_warned']} |")
    L += ["", "## UNUSED stub tests (spotlight)", ""]
    for s in rep["stub_spotlight"]:
        r = s["result"]
        if isinstance(r, str):
            L.append(f"- {s['head']} `{s['function']}`: {r}")
            continue
        L.append(f"- {s['head']} `{s['function']}`: **{r.get('status')}** (map UNUSED: {r.get('map_unused')}; sources {', '.join(r.get('sources', []))})")
        for c in r.get("checks") or []:
            L.append(f"  - line {c['line']}: {c['status']} — {c['reason']}")
            for x in c["changed"]:
                L.append(f"    - {x['function']}: {x['before']}% -> {x['after']}% ({x['before_status']} -> {x['after_status']})")
        if r.get("status") == "tool_error":
            L.append(f"  - error: {r.get('error', '')[-300:]}")
    L += ["", "## Readiness at 84bca82f vs upstream `// TODO` classes", ""]
    rd = rep["readiness_84bca82f"]
    L.append(f"Summary: {rd['summary']}")
    for f, c in rd["todo_comparison"].items():
        L.append(f"- `{f}`: TODO classes {len(c['todo_classes'])}, blocked unmet classes {len(c['blocked_unmet_classes'])};"
                 f" TODO not blocked: {c['todo_not_blocked'] or 'none'}; blocked not TODO: {c['blocked_not_todo'] or 'none'}")
    L.append(f"- blocked functions: {sorted(rd['blocked'])}")
    L.append("- deferred functions: " + "; ".join(f"`{k}` (unmet {', '.join(u['class'] for u in v['unmet'])})" for k, v in sorted(rd["deferred"].items())))
    L += ["", "## Merged-PR (#338-#346) hunks the rules reject or warn on", ""]
    for m in rep["merged_flags"]:
        L.append(f"- #{m['pr']} `{m['file']}`:{m['lines']} (adjudicated {m['adjudicated']}; edit_scope {m.get('edit_scope')}"
                 f" / with evidence {m.get('edit_scope_evidence', '-')}; lint {m.get('lint', '-')}; stub {', '.join(s['function'] + '=' + str(s['status']) for s in m.get('stub') or []) or '-'})")
        for r in m["reasons"]:
            L.append(f"  - {r[:400]}")
    L += ["", "## Per head", ""]
    for h in rep["heads"]:
        L.append(f"### {h['label']} ({h['head'][:8]} over {h['base'][:8]}; {'merged' if h['merged'] else 'not merged'})")
        L.append(f"edit_scope: {h['edit_scope_verdict']} (with evidence: {h['edit_scope_evidence_verdict']}); warnings: {h['edit_scope_warnings']};"
                 f" size: {(h['pr_size'] or {}).get('warnings')}; lint counts: {h['lint_counts']}")
        if h["edit_scope_error"]:
            L.append(f"edit_scope error: {h['edit_scope_error'][-300:]}")
        L += ["", "| file:lines | adjudicated | edit_scope | +evidence | lint | lint+include | stub |", "|---|---|---|---|---|---|---|"]
        for x in h["hunks"]:
            es = f"{x['edit_scope']} ({_cell(x['edit_scope_rows'], 'verdict')})"
            ev = f"{x['edit_scope_evidence']} ({_cell(x['edit_scope_evidence_rows'], 'verdict')})"
            li = f"{x['lint']} ({_cell(x['lint_rows'], 'rule_id')})"
            lii = f"{x['lint_with_include']} ({_cell(x['lint_with_include_rows'], 'rule_id')})"
            st = ", ".join(f"{s['function']}={s['status']}" for s in x["stub"]) or "-"
            L.append(f"| `{x['file']}`:{x['start']}-{x['end']} | {x['adjudicated']} | {es} | {ev} | {li} | {lii} | {st} |")
        if h["unmapped"]:
            L.append("")
            L.append("Unmapped tool rows (no adjudicated hunk in that file/line/class):")
            for u in h["unmapped"]:
                L.append(f"- {u['tool']} {u.get('file')}:{u.get('line')} {u.get('verdict') or u.get('rule_id')} {u.get('class') or ''}")
        L.append("")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    sys.exit(main())
