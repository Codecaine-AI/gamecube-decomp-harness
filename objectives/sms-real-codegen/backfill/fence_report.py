#!/usr/bin/env python3
"""Fence backfill report: every change in the SMS integration checkout that the
order-and-scope fence (`edit_scope.py pr`) rejects, its rollback edits, the
header cascade and the UNUSED stub-test outcomes. Read-only: nothing is applied.

Inputs:
  fence-work/pr.json            `edit_scope.py pr` over base...head (readiness at base)
  fence-work/unused_jobs.tsv    one row per UNUSED hunk: id, file, signature, line
  fence-work/unused/<id>.json   `steering_check.py unused-test` output per row
  --repo                        git repo holding base and head (only `git cat-file`, `ls-tree`, `diff` run)

Outputs: fence-report.json, fence-report.md (next to this script).

Rollback edits ("splices") are after-side line ranges replaced by base-side line
ranges, so every reverted region is the base text:
  function  a whole definition goes back to its base definition (same qualified
            name + parameters), or is deleted when base has none (with the added
            comment lines right above it);
  class     a whole class definition goes back to its base definition in the same
            file, or is deleted when the class is new (with its added comments);
            a new header whose classes are all reverted is deleted;
  lines     diff opcodes (difflib over lines, the diff edit_scope uses) that overlap
            an order-gated reference line, a header out-of-class region, or added
            top-level lines of the cascade.
Cascade: changed functions (and added top-level lines) that, after the rejected
edits are applied, still use a name those edits remove (a new class, a member
whose declaration is new, or a name absent from the whole base tree) go back to
base too; repeated until nothing new is removed.

Actions: `revert` (fence rejects; confirmed), `review` (fence rejects but the
hunk is a suspected fence false positive, or the UNUSED stub test is not
conclusive), `keep` (UNUSED with inlined evidence). fence_revert.py applies
`revert` (+ its cascade) by default and `review` only with --include-review.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TOOLS = ROOT / "toolpacks/gamecube-decomp/_impl/gamecube/tools"
sys.path.insert(0, str(TOOLS))

import edit_scope  # noqa: E402
import evidence_search as es  # noqa: E402
import steering_check as sc  # noqa: E402

CHECKOUT = "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/checkout"
BASE = "81248bdac58da1ff74128ba8c3a3798372fa5371"
HEAD = "3b83dd4611ff59dcfdb521c11d780716aa25a124"
POLICY = {"gatedPaths": ["src/System/MarNameRefGen*.cpp"], "scope": {"maxForeignHeaders": 3, "maxForeignHeaderLines": 25}}
REJECT = edit_scope.REJECT
WORD = re.compile(r"[A-Za-z_]\w*")
KEYWORDS = set("""alignas alignof and asm auto bool break case catch char class const constexpr const_cast continue
default delete do double dynamic_cast else enum explicit export extern false float for friend goto if inline int long
mutable namespace new noexcept not nullptr operator or private protected public register reinterpret_cast return
short signed sizeof static static_cast struct switch template this throw true try typedef typeid typename union
unsigned using virtual void volatile wchar_t while""".split())
GIT_ENV = {**os.environ, "GIT_OPTIONAL_LOCKS": "0"}


# ------------------------------------------------------------------ git (read-only)


class Git:
    """`git cat-file --batch` reader; never touches an index or work tree."""

    def __init__(self, repo: str):
        self.repo = repo
        self.p = subprocess.Popen(["git", "-C", repo, "cat-file", "--batch"], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, env=GIT_ENV)

    def show(self, rev: str, path: str) -> str | None:
        self.p.stdin.write(f"{rev}:{path}\n".encode())
        self.p.stdin.flush()
        head = self.p.stdout.readline().decode()
        if head.endswith("missing\n"):
            return None
        data = self.p.stdout.read(int(head.split()[2]))
        self.p.stdout.read(1)
        return data.decode("utf-8", errors="surrogateescape")

    def run(self, *args: str) -> str:
        return subprocess.run(["git", "-C", self.repo, *args], capture_output=True, text=True, check=True,
                              env=GIT_ENV).stdout


def sha(text: str | None) -> str | None:
    return None if text is None else hashlib.sha256(text.encode("utf-8", "surrogateescape")).hexdigest()


# ------------------------------------------------------------------ text helpers


def lines_of(text: str | None) -> list[str]:
    return text.split("\n") if text else []


def opcodes(before: str | None, after: str | None) -> list[tuple]:
    sm = difflib.SequenceMatcher(None, lines_of(before), lines_of(after), autojunk=False)
    return [op for op in sm.get_opcodes() if op[0] != "equal"]


def op_overlaps(op: tuple, start: int, end: int) -> bool:
    """`start`/`end`: 1-based inclusive after-lines; a pure deletion sits at after index j1."""
    _t, _i1, _i2, j1, j2 = op
    if j2 > j1:
        return j1 + 1 <= end and j2 >= start
    return start <= j1 < end


def code_tokens(text: str) -> set[str]:
    return set(WORD.findall(es.strip_code(text))) - KEYWORDS


def norm_body(s: str) -> str:
    return re.sub(r"\s+", "", es.strip_code(s))


def defs_with_lines(text: str | None) -> list[dict]:
    out = []
    for d in sc.function_defs(text):
        line_start = text.rfind("\n", 0, d.start) + 1
        out.append({"qualified": d.qualified, "params": d.params, "start": d.line,
                    "end": text.count("\n", 0, d.close) + 1, "body": text[d.start:d.close + 1],
                    "clean_start": not text[line_start:d.start].strip(),
                    "clean_end": not text[d.close + 1:(text.find("\n", d.close) if text.find("\n", d.close) >= 0 else len(text))].strip(" \t;")})
    return out


def def_key(d: dict) -> tuple:
    return (d["qualified"], tuple(d["params"]) if d["params"] is not None else None)


def base_def(before_defs: list[dict], d: dict) -> dict | None:
    exact = [b for b in before_defs if def_key(b) == def_key(d)]
    if len(exact) == 1:
        return exact[0]
    if exact:
        return exact[0]
    # an overload with other parameters is a different function; only unparsable parameters fall back to the name
    same = [b for b in before_defs if b["qualified"] == d["qualified"] and (b["params"] is None or d["params"] is None)]
    return same[0] if len(same) == 1 else None


def changed_defs(before: str | None, after: str | None) -> list[dict]:
    bdefs = defs_with_lines(before)
    out = []
    for d in defs_with_lines(after):
        b = base_def(bdefs, d)
        if b is None or norm_body(b["body"]) != norm_body(d["body"]):
            out.append(dict(d, status="added" if b is None else "changed"))
    return out


def member_head(stmt: str) -> str:
    """Declaration part of a member statement: no inline body, no ctor initializer list, no default init."""
    s = stmt.split("{", 1)[0]
    if "(" in s:
        depth, close = 0, None
        for i, ch in enumerate(s):
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0 and close is None:
                    close = i
        if close is not None:
            tail = s[close + 1:]
            s = s[:close + 1] + re.split(r"(?<!:):(?!:)", tail, 1)[0]
    return s.strip().rstrip(";")


def member_ident(stmt: str) -> str | None:
    s = re.sub(r"<[^<>]*>", "", member_head(stmt))
    if re.fullmatch(r"(public|private|protected):?", s):
        return None
    if "(" in s:
        m = re.search(r"(~?[A-Za-z_]\w*)\s*$", s[:s.index("(")])
        return m.group(1) if m else None
    m = re.search(r"([A-Za-z_]\w*)\s*(?:\[[^\]]*\])*\s*(?:=.*)?$", s)
    return m.group(1) if m else None


def extend_up_added(al: list[str], ops: list[tuple], start: int) -> int:
    """Move a deletion's start up over blank/comment lines the patch added right above it."""
    added = set()
    for _t, _i1, _i2, j1, j2 in ops:
        added.update(range(j1 + 1, j2 + 1))
    s = start
    while s - 1 >= 1 and (s - 1) in added and re.fullmatch(r"\s*(//.*|/\*.*|\*.*)?", al[s - 2]):
        s -= 1
    return s


# ------------------------------------------------------------------ main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--repo", default="/tmp/sms-fence-repo", help="git repo with base and head objects (read-only)")
    ap.add_argument("--head", default=HEAD)
    ap.add_argument("--base", default=BASE)
    ap.add_argument("--pr", default=str(HERE / "fence-work/pr.json"))
    ap.add_argument("--unused-dir", default=str(HERE / "fence-work/unused"))
    args = ap.parse_args()

    git = Git(args.repo)
    pr = json.loads(Path(args.pr).read_text())
    changed = [l for l in git.run("diff", "--name-only", "--no-renames", args.base, args.head, "--",
                                  "src", "include", "libs").splitlines() if edit_scope.in_scope(l)]
    texts = {p: (git.show(args.base, p), git.show(args.head, p)) for p in changed}
    ops = {p: opcodes(*texts[p]) for p in changed}
    adefs = {p: defs_with_lines(texts[p][1]) for p in changed}
    bdefs = {p: defs_with_lines(texts[p][0]) for p in changed}
    cdefs = {p: changed_defs(*texts[p]) for p in changed}

    objdiff = json.loads(Path(args.repo, "objdiff.json").read_text())
    unit_of = {(u.get("metadata") or {}).get("source_path"): u["name"] for u in objdiff.get("units", [])
               if (u.get("metadata") or {}).get("source_path")}

    base_files = [l for l in git.run("ls-tree", "-r", "--name-only", args.base, "--", "src", "include", "libs").splitlines()
                  if l.endswith((".c", ".cpp", ".cp", ".h", ".hpp", ".inc", ".inl"))]
    base_vocab: set[str] = set()
    for p in base_files:
        t = git.show(args.base, p)
        if t:
            base_vocab |= set(WORD.findall(t))  # comments count: a word mentioned at base is not new

    # ---------------------------------------------------------------- UNUSED stub tests
    unused_rows = {}
    for line in (Path(args.unused_dir).parent / "unused_jobs.tsv").read_text().splitlines():
        idx, f, _fn, ln = line.split("\t")
        p = Path(args.unused_dir) / f"{idx}.json"
        if p.is_file():
            unused_rows[(f, int(ln))] = dict(json.loads(p.read_text()), job=idx)
        elif Path(f"{p}.failed").is_file():
            log = (Path(args.unused_dir) / f"{idx}.log").read_text()
            err = log.strip().splitlines()[-1] if log.strip() else ""
            try:
                err = json.loads(err).get("error", err)
            except ValueError:
                pass
            unused_rows[(f, int(ln))] = {"status": "failed", "checks": [], "error": err[:500], "job": idx}

    # ---------------------------------------------------------------- items + edits
    edits: dict[str, list[dict]] = defaultdict(list)  # file -> {"a":[j1,j2),"b":[i1,i2),"kind","by"}

    def add_func_edit(p: str, d: dict, by: str) -> dict:
        before, after = texts[p]
        al = lines_of(after)
        b = base_def(bdefs[p], d)
        if not (d["clean_start"] and d["clean_end"]) or (b and not (b["clean_start"] and b["clean_end"])):
            return add_line_edits(p, [(d["start"], d["end"])], by, "function_lines")
        if b is None:
            s = extend_up_added(al, ops[p], d["start"])
            e = {"a": [s - 1, d["end"]], "b": [0, 0], "kind": "function_delete", "by": [by], "what": d["qualified"]}
        else:
            e = {"a": [d["start"] - 1, d["end"]], "b": [b["start"] - 1, b["end"]], "kind": "function_base",
                 "by": [by], "what": d["qualified"]}
        edits[p].append(e)
        return e

    def add_line_edits(p: str, regions: list[tuple[int, int]], by: str, kind: str = "lines") -> dict:
        sel = [op for op in ops[p] if any(op_overlaps(op, a, b) for a, b in regions)]
        for _t, i1, i2, j1, j2 in sel:
            edits[p].append({"a": [j1, j2], "b": [i1, i2], "kind": kind, "by": [by], "what": None})
        return {"ops": len(sel)}

    items = []
    for n, h in enumerate(h for h in pr["hunks"] if h["verdict"] in REJECT):
        p = h["file"]
        before, after = texts[p]
        al = lines_of(after)
        it = {"id": f"H{n:03d}", "file": p, "line": h["line"], "class_line": h.get("class_line"),
              "class": h.get("class"), "verdict": h["verdict"], "reason": h["reason"], "unit": unit_of.get(p),
              "kind": None, "region": None, "action": "revert", "note": None}
        if h["verdict"] == "order_gated":
            it["kind"], it["region"] = "reference", [h["line"], h["line"]]
        elif h["verdict"] in ("unused_unverified", "dead_unused"):
            d = next((d for d in adefs[p] if d["start"] == h["line"]), None)
            it["kind"] = "unused_function"
            it["function"] = re.match(r"UNUSED (.+?) (?:reconstructed|is dead)", h["reason"]).group(1)
            it["qualified"] = d["qualified"] if d else None
            it["region"] = [d["start"], d["end"]] if d else [h["line"], h["line"]]
            row = unused_rows.get((p, h["line"])) or {}
            status = row.get("status", "not_run") if h["verdict"] == "unused_unverified" else "dead"
            it["unused_test"] = {
                "job": row.get("job"), "status": status, "map_unused": (row.get("map") or {}).get("unused"),
                "error": row.get("error"),
                "checks": [{k: c.get(k) for k in ("status", "reason", "base", "candidate_trivial", "callers",
                                                     "unit_inputs_sha256", "unit_flags_sha256", "body_sha256")}
                           for c in row.get("checks", [])],
            }
            if status == "dead":
                it["action"], it["note"] = "revert", "stub test: dead (no target function changes); back to base"
            elif status == "inlined":
                it["action"], it["note"] = "keep", "stub test: inlined (a same-unit caller gets worse); keep with evidence"
            else:
                it["action"], it["note"] = "review", f"stub test: {status}; not decided"
        else:
            cls = h["class"]
            short = cls.split("::")[-1]
            parsed = edit_scope.parse_source(p, after)
            cdef = next((c for c in parsed.classes if c.line == h.get("class_line")
                         and (c.name == cls or c.name.split("::")[-1] == short)), None)
            end = None
            if cdef is not None:
                end = cdef.end_line
                if end < len(al) and al[end - 1].strip() == "}" and al[end].strip() == ";":
                    end += 1
            if cdef is not None and any(op_overlaps(op, cdef.line, end) for op in ops[p]):
                it["kind"], it["region"] = "class_definition", [cdef.line, end]
                bdef = next((c for c in edit_scope.parse_source(p, before).classes if c.name == cdef.name), None)
                it["introduced"] = bdef is None
                old_heads = {member_head(m) for m in (bdef.members if bdef else ())}
                it["added_members"] = [m for m in cdef.members if bdef is None or m not in set(bdef.members)]
                it["new_declarations"] = [member_head(m) for m in it["added_members"]
                                          if member_head(m) not in old_heads and not re.fullmatch(
                                              r"(public|private|protected):?", member_head(m))]
                it["_bdef"] = bdef
            else:
                regs = [d for d in cdefs[p] if "::" in d["qualified"]
                        and edit_scope.strip_name(d["qualified"].rsplit("::", 1)[0]).split("::")[-1] == short]
                it["kind"] = "out_of_class_definitions"
                it["functions"] = [{"qualified": d["qualified"], "start": d["start"], "end": d["end"],
                                    "status": d["status"]} for d in regs]
                it["region"] = [min(d["start"] for d in regs), max(d["end"] for d in regs)] if regs \
                    else [h["line"], h["line"]]
                it["_defs"] = regs
                if not edit_scope.is_header(p):
                    it["action"] = "review"
                    it["note"] = ("suspected fence false positive: the edited out-of-class definitions are functions "
                                  f"of {it['unit']} itself (decompiling its own unit); the fence judges them by the "
                                  "class's owner unit")
        items.append(it)

    def realize(it: dict) -> None:
        """Turn an item into splices (only for items whose action will be applied)."""
        p = it["file"]
        before, after = texts[p]
        al = lines_of(after)
        if it["kind"] == "reference":
            own = next((d for d in cdefs[p] if d["start"] == it["region"][0]), None)
            if own is not None:  # the reference is the definition's own name (`inline TX::TX(...)`)
                add_func_edit(p, own, it["id"])
            else:
                add_line_edits(p, [tuple(it["region"])], it["id"])
        elif it["kind"] == "unused_function":
            d = next((d for d in adefs[p] if d["start"] == it["region"][0]), None)
            if d:
                add_func_edit(p, d, it["id"])
        elif it["kind"] == "class_definition":
            a0, a1 = it["region"]
            bdef = it["_bdef"]
            if bdef is None:
                s = extend_up_added(al, ops[p], a0)
                edits[p].append({"a": [s - 1, a1], "b": [0, 0], "kind": "class_delete", "by": [it["id"]],
                                 "what": it["class"]})
            else:
                bl = lines_of(before)
                bend = bdef.end_line
                if bend < len(bl) and bl[bend - 1].strip() == "}" and bl[bend].strip() == ";":
                    bend += 1
                edits[p].append({"a": [a0 - 1, a1], "b": [bdef.line - 1, bend], "kind": "class_base",
                                 "by": [it["id"]], "what": it["class"]})
        elif it["kind"] == "out_of_class_definitions":
            if edit_scope.is_header(p):  # header region: everything the patch changed in the span
                add_line_edits(p, [tuple(it["region"])], it["id"], "header_region")
            else:
                for d in it["_defs"]:
                    add_func_edit(p, d, it["id"])

    for it in items:
        if it["action"] == "revert":
            realize(it)

    # ---------------------------------------------------------------- cascade
    def covered_lines(p: str) -> set[int]:
        out = set()
        for e in edits.get(p, []):
            out.update(range(e["a"][0] + 1, e["a"][1] + 1))
        return out

    roots = []
    for it in items:
        if it["action"] != "revert" or it["kind"] in ("reference", "unused_function"):
            continue
        strong, weak = set(), set()
        short = (it["class"] or "").split("::")[-1]
        if it["kind"] == "class_definition":
            if it["introduced"]:
                strong.add(short)
            for head in it["new_declarations"]:
                strong |= {t for t in code_tokens(head) if t not in base_vocab}
                ident = member_ident(head)
                if ident and ident not in strong and ident.lstrip("~") != short and not it["introduced"]:
                    weak.add(ident)
        else:
            p = it["file"]
            al = lines_of(texts[p][1])
            seg = "\n".join("\n".join(al[e["a"][0]:e["a"][1]]) for e in edits[p] if it["id"] in e["by"])
            strong |= {t for t in code_tokens(seg) if t not in base_vocab}
            for d in it.get("_defs", []):
                nm = d["qualified"].split("::")[-1]
                if d["status"] == "added" and nm.lstrip("~") != short:  # constructors: their new parameter types are the names
                    (strong if nm not in base_vocab else weak).add(nm)
        if strong or weak:
            roots.append({"item": it["id"], "class": it["class"], "file": it["file"], "strong": sorted(strong),
                          "weak": sorted(weak)})

    strong_all = {t for r in roots for t in r["strong"]}
    weak_by_class: dict[str, set] = defaultdict(set)
    for r in roots:
        weak_by_class[(r["class"] or "").split("::")[-1]] |= set(r["weak"])

    def deleted_files() -> set[str]:
        """New files (absent at base) whose every class is deleted and nothing else of substance remains."""
        out = set()
        for p, es_ in edits.items():
            before, after = texts[p]
            if before is not None or after is None:
                continue
            al = lines_of(after)
            cov = covered_lines(p)
            rest = "\n".join(l for i, l in enumerate(al, 1) if i not in cov)
            rest_code = es.strip_code(rest)
            rest_code = re.sub(r"^\s*#\s*(ifndef|define|endif|include|pragma)\b.*$", "", rest_code, flags=re.M)
            if not rest_code.strip():
                out.add(p)
        return out

    cascade = []
    seen = set()
    rounds = 0
    while True:
        rounds += 1
        gone = deleted_files()
        new_names = set()
        for p in changed:
            before, after = texts[p]
            if after is None or p in gone:
                continue
            al = lines_of(after)
            cov = covered_lines(p)
            for d in cdefs[p]:
                key = (p, d["qualified"], d["start"])
                if key in seen or all(l in cov for l in range(d["start"], d["end"] + 1)):
                    continue
                remaining = "\n".join(al[i - 1] for i in range(d["start"], d["end"] + 1) if i not in cov)
                toks = code_tokens(remaining)
                via = toks & strong_all
                owner = edit_scope.strip_name(d["qualified"].rsplit("::", 1)[0]).split("::")[-1] \
                    if "::" in d["qualified"] else ""
                for cls, ws in weak_by_class.items():
                    hit = toks & ws
                    if hit and (cls in toks or owner == cls):
                        via |= hit
                if not via:
                    continue
                seen.add(key)
                # drop finer edits inside the function: the whole definition goes back to base
                inside = [e for e in edits[p] if d["start"] - 1 <= e["a"][0] and e["a"][1] <= d["end"]]
                edits[p] = [e for e in edits[p] if e not in inside]
                e = add_func_edit(p, d, f"C:{d['qualified']}")
                if "by" in e:
                    e["by"] = sorted(set(e["by"]) | {b for x in inside for b in x["by"]})
                else:  # line fallback: put the finer edits back (the opcodes cover them anyway)
                    edits[p].extend(inside)
                cascade.append({"file": p, "unit": unit_of.get(p), "qualified": d["qualified"], "start": d["start"],
                                "end": d["end"], "status": d["status"], "via": sorted(via), "round": rounds,
                                "edit": e.get("kind") if isinstance(e, dict) and "kind" in e else "function_lines"})
                if d["status"] == "added":
                    nm = d["qualified"].split("::")[-1]
                    if nm not in base_vocab:
                        new_names.add(nm)
                cov = covered_lines(p)
            # added top-level lines outside every definition (globals, tables, includes)
            spans = [(d["start"], d["end"]) for d in adefs[p]]
            for op in ops[p]:
                _t, i1, i2, j1, j2 = op
                free = [l for l in range(j1 + 1, j2 + 1) if l not in cov and al[l - 1].strip()
                        and not any(a <= l <= b for a, b in spans)]
                if j2 <= j1 or not free:
                    continue
                seg = "\n".join(al[l - 1] for l in free)
                hit = sorted(code_tokens(seg) & strong_all)
                inc = sorted(h for h in gone if re.search(
                    r'#\s*include\s*[<"]' + re.escape(h.split("include/", 1)[-1]) + r'[>"]', seg))
                if not hit and not inc:
                    continue
                key = (p, "<top-level>", j1)
                if key in seen:
                    continue
                seen.add(key)
                edits[p].append({"a": [j1, j2], "b": [i1, i2], "kind": "lines", "by": ["C:<top-level>"], "what": None})
                cascade.append({"file": p, "unit": unit_of.get(p), "qualified": "<top-level>", "start": j1 + 1,
                                "end": j2, "status": "added_lines", "via": hit + [f"#include {h}" for h in inc],
                                "round": rounds, "edit": "lines"})
                cov = covered_lines(p)
        fresh = new_names - strong_all
        if not fresh and deleted_files() == gone:
            break
        strong_all |= fresh
        if rounds > 8:
            break

    # ---------------------------------------------------------------- review splices (kept apart)
    review_edits: dict[str, list[dict]] = defaultdict(list)
    saved = {p: list(v) for p, v in edits.items()}
    edits.clear()
    for it in items:
        if it["action"] == "review":
            realize(it)
    for p, v in edits.items():
        review_edits[p] = v
    edits.clear()
    edits.update(saved)

    # ---------------------------------------------------------------- normalize per file
    def normalize(p: str, es_: list[dict]) -> tuple[list[dict], list[str]]:
        """Drop exact duplicates and edits contained in a larger edit; flag partial overlaps."""
        out, problems = [], []
        for e in sorted(es_, key=lambda e: (e["a"][0], -e["a"][1])):
            if out and e["a"][0] < out[-1]["a"][1] or (out and e["a"] == out[-1]["a"] and e["a"][0] == e["a"][1]
                                                         and e["b"] == out[-1]["b"]):
                last = out[-1]
                if e["a"][1] <= last["a"][1]:
                    last["by"] = sorted(set(last["by"]) | set(e["by"]))
                    continue
                problems.append(f"partial overlap {last['a']} / {e['a']}")
                # fall back: widen to opcodes covering both
                lo, hi = last["a"][0], e["a"][1]
                out.pop()
                for _t, i1, i2, j1, j2 in ops[p]:
                    if op_overlaps((_t, i1, i2, j1, j2), lo + 1, hi):
                        out.append({"a": [j1, j2], "b": [i1, i2], "kind": "lines",
                                    "by": sorted(set(last["by"]) | set(e["by"])), "what": None})
                continue
            out.append(e)
        return out, problems

    plan = []
    gone = deleted_files()
    for p in changed:
        r_e, probs = normalize(p, edits.get(p, []))
        v_e, probs2 = normalize(p, review_edits.get(p, []))
        if not r_e and not v_e:
            continue
        b, a = texts[p]
        plan.append({"file": p, "unit": unit_of.get(p), "base_exists": b is not None,
                     "before_sha256": sha(b), "after_sha256": sha(a), "diff_opcodes": len(ops[p]),
                     "deletes_file": p in gone, "revert": r_e, "review": v_e, "problems": probs + probs2})

    # spill: lines a rejected item's splice reverts beyond its own region
    for it in items:
        it.pop("_bdef", None)
        it.pop("_defs", None)
        regs = [it["region"]] if it["region"] else []
        spill = 0
        for p_ in plan:
            if p_["file"] != it["file"]:
                continue
            for e in p_["revert"] + p_["review"]:
                if it["id"] in e["by"]:
                    spill += sum(1 for ln in range(e["a"][0] + 1, e["a"][1] + 1)
                                 if not any(x <= ln <= y for x, y in regs))
        it["spill_lines"] = spill

    counts = Counter(h["verdict"] for h in pr["hunks"])
    cascade_fns = [c for c in cascade if c["qualified"] != "<top-level>"]
    report = {
        "identity": {"checkout": CHECKOUT, "analysis_repo": args.repo, "base": args.base, "head": args.head,
                     "fence": pr["identity"], "policy": POLICY},
        "command": ("python3 edit_scope.py pr --repo <read-only clone of the checkout at HEAD + orig/GMSJ01/files/"
                    f"mario.MAP> --base {args.base} --head HEAD --policy-json '{json.dumps(POLICY)}' --json"),
        "fence_verdict": pr["verdict"], "limits": pr["limits"],
        "pr_size": {k: v for k, v in pr["pr_size"].items() if k != "warnings"}, "warnings": pr["warnings"],
        "counts": {"all_hunks": dict(counts), "rejected": {v: counts[v] for v in sorted(REJECT) if counts[v]},
                   "rejected_total": sum(counts[v] for v in REJECT),
                   "actions": dict(Counter(it["action"] for it in items)),
                   "actions_by_verdict": {v: dict(Counter(it["action"] for it in items if it["verdict"] == v))
                                          for v in sorted({it["verdict"] for it in items})}},
        "items": items,
        "cascade_roots": roots,
        "cascade": cascade,
        "cascade_summary": {"functions": len(cascade_fns),
                            "top_level_blocks": len(cascade) - len(cascade_fns),
                            "units": sorted({c["unit"] or c["file"] for c in cascade}),
                            "function_units": sorted({c["unit"] or c["file"] for c in cascade_fns}),
                            "rounds": rounds},
        "unused": {"tested": len(unused_rows),
                   "status": dict(Counter(it["unused_test"]["status"] for it in items if it["kind"] == "unused_function"))},
        "plan": plan,
        "plan_summary": {"files": len(plan), "files_with_revert": sum(1 for p in plan if p["revert"]),
                         "deleted_files": sorted(p["file"] for p in plan if p["deletes_file"]),
                         "splices": sum(len(p["revert"]) for p in plan),
                         "review_splices": sum(len(p["review"]) for p in plan)},
    }
    val = {}
    for name, f in (("compile_changed_units", "compile-check.json"), ("compile_all_units", "compile-check-all.json")):
        fp = HERE / "fence-work" / f
        if fp.is_file():
            d = json.loads(fp.read_text())
            val[name] = {k: v for k, v in d.items() if k != "rows"}
    ov = Path("/tmp/sms-fence-overlay/fence-revert.json")
    if ov.is_file():
        d = json.loads(ov.read_text())
        val["overlay"] = {k: d.get(k) for k in ("out_dir", "files", "written", "deleted", "equal_to_base", "splices",
                                                  "errors", "fence_after_revert")}
    val["note"] = ("Validation of this plan: fence_revert.py --out-dir "
                   "/tmp/sms-fence-overlay --verify-fence, then fence-work/compile_check.py (shadow roots of the clone, "
                   "3 MWCC jobs, SMS.mch rebuilt per phase from that phase's headers; the checkout's SMS.mch is stale "
                   "and fails 29 HEAD units with `macro 'RAD_TO_DEG' redefined`). Units that hit the 300 s MWCC timeout under host load "
                   "are rebuilt once (`retried_after_timeout`).")
    report["validation"] = val
    (HERE / "fence-report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    (HERE / "fence-report.md").write_text(render_md(report) + "\n")
    print(json.dumps({"counts": report["counts"], "cascade_summary": report["cascade_summary"],
                      "unused": report["unused"], "plan_summary": report["plan_summary"]}, indent=1))
    return 0


def render_md(r: dict) -> str:
    c = r["counts"]
    L = ["# Fence backfill: SMS integration checkout vs upstream 81248bda", "",
         f"Checkout `{r['identity']['checkout']}` at `{r['identity']['head'][:8]}`, base `{r['identity']['base'][:8]}` "
         "(merge base with upstream), readiness at base, policy gatedPaths `src/System/MarNameRefGen*.cpp`. "
         "The checkout has no `orig/GMSJ01/files/mario.MAP` (readiness fails `missing_map` there), so the fence ran "
         "in a read-only clone at the same HEAD with the original map copied from `sb-up84`.", "",
         f"- Fence verdict: **{r['fence_verdict']}**; rejected hunks **{c['rejected_total']}**: "
         + ", ".join(f"{k} {v}" for k, v in c["rejected"].items()),
         "- Actions: " + ", ".join(f"{k} {v}" for k, v in c["actions"].items())
         + " (" + "; ".join(f"{v}: " + ", ".join(f"{a} {n}" for a, n in d.items())
                             for v, d in c["actions_by_verdict"].items()) + ")",
         f"- Cascade: {r['cascade_summary']['functions']} functions in {len(r['cascade_summary']['function_units'])} "
         f"units + {r['cascade_summary']['top_level_blocks']} top-level blocks",
         "- UNUSED stub tests: " + ", ".join(f"{k} {v}" for k, v in r["unused"]["status"].items()),
         f"- Plan: {r['plan_summary']['files_with_revert']} files, {r['plan_summary']['splices']} splices, "
         f"{len(r['plan_summary']['deleted_files'])} new headers deleted; {r['plan_summary']['review_splices']} "
         "review-only splices",
         "- All hunk verdicts: " + ", ".join(f"{k} {v}" for k, v in sorted(c["all_hunks"].items())),
         f"- Scope: {r['limits']['foreign_headers']} foreign headers / {r['limits']['foreign_header_lines']} lines "
         f"(soft limits 3 / 25); PR size {r['pr_size']['units']} units, {r['pr_size']['files']} files, "
         f"{r['pr_size']['changed_lines']} lines", ""]
    by = defaultdict(list)
    for it in r["items"]:
        by[it["verdict"]].append(it)
    for verdict in ("not_ready", "unresolved", "order_gated", "dead_unused", "unused_unverified"):
        rows = by.get(verdict)
        if not rows:
            continue
        L += [f"## {verdict} ({len(rows)})", "", "| Id | File | Lines | Class / function | Action | Reason |",
              "|---|---|---|---|---|---|"]
        for it in rows:
            what = it.get("function") or it.get("class") or ""
            reason = it["reason"].replace("|", "\\|")
            reason = reason if len(reason) < 170 else reason[:167] + "..."
            note = f" ({it['note']})" if it.get("note") else ""
            L.append(f"| {it['id']} | `{it['file']}` | {it['region'][0]}-{it['region'][1]} | `{what}` | "
                     f"{it['action']}{note} | {reason} |")
        L.append("")
    L += ["## Cascade", "",
          "Names that disappear with the rejected edits (strong: new classes and names absent from the whole base "
          "tree; weak: members with a new declaration, counted only next to their class):", ""]
    for x in r["cascade_roots"]:
        L.append(f"- {x['item']} `{x['class']}` ({x['file']}): strong {', '.join(x['strong']) or '-'}; "
                 f"weak {', '.join(x['weak']) or '-'}")
    L += ["", "Changed functions and added top-level lines that still use them after the rejected edits "
          "(each goes back to its base text, or is deleted when new):", "",
          "| Unit | File | Function | Lines | Status | Via |", "|---|---|---|---|---|---|"]
    for x in sorted(r["cascade"], key=lambda x: (x["unit"] or "", x["file"], x["start"])):
        L.append(f"| {x['unit']} | `{x['file']}` | `{x['qualified']}` | {x['start']}-{x['end']} | {x['status']} | "
                 f"{', '.join(x['via'])} |")
    L += ["", "## UNUSED stub tests (`steering_check.py unused-test`, shadow roots, 1 job each, max 3 at once)", "",
          "| Job | File | Function | Status | Action | Evidence |", "|---|---|---|---|---|---|"]
    for it in r["items"]:
        if it["kind"] != "unused_function":
            continue
        ut = it["unused_test"]
        ev = []
        for ch in ut["checks"]:
            callers = ch.get("callers") or []
            s = (ch.get("reason") or "").split("\n")[0][:110]
            if callers:
                s += "; " + ", ".join(
                    f"{x.get('function')} {x.get('before', {}).get('match_percent')}%->"
                    f"{x.get('after', {}).get('match_percent')}%" for x in callers[:2])
            ev.append(s)
        if ut.get("error"):
            ev.append(str(ut["error"]).split("\n")[0][:110] + " ... " + " ".join(str(ut["error"]).split("\n")[4:7])[:120])
        L.append(f"| {ut.get('job')} | `{it['file']}` | `{it['function']}` | {ut['status']} | {it['action']} | "
                 f"{' / '.join(ev).replace('|', '/')} |")
    L += ["", "## Rollback plan", "",
          "| File | Unit | Revert splices | Review splices | Deletes file | Kinds |", "|---|---|---|---|---|---|"]
    for p in r["plan"]:
        kinds = Counter(e["kind"] for e in p["revert"])
        L.append(f"| `{p['file']}` | {p['unit']} | {len(p['revert'])} | {len(p['review'])} | {p['deletes_file']} | "
                 + ", ".join(f"{k} {v}" for k, v in kinds.items()) + " |")
    v = r.get("validation") or {}
    if v:
        L += ["", "## Validation", "", v.get("note", "")]
        o = v.get("overlay")
        if o:
            f = o.get("fence_after_revert") or {}
            L.append(f"- Overlay: {o['files']} files, {o['splices']} splices, {o['written']} rewritten "
                     f"({o['equal_to_base']} equal to base), {len(o['deleted'])} deleted, self-check errors "
                     f"{len(o['errors'])}. Fence over base -> HEAD+overlay: rejected {f.get('rejected')}; all "
                     f"{f.get('expected_remaining')} are the kept/review items; unexpected {len(f.get('unexpected') or [])}.")
        for k in ("compile_changed_units", "compile_all_units"):
            c = v.get(k)
            if c:
                L.append(f"- MWCC {k.replace('_', ' ')}: {c['overlay_ok']}/{c['units']} build with the overlay; "
                         f"failures {c['overlay_fail'] or 'none'}"
                     + (f"; retried after timeout: {', '.join(c['retried_after_timeout'])}" if c.get('retried_after_timeout') else ""))
    L += ["", "Nothing is applied. `python3 fence_revert.py` (dry run) or `--out-dir DIR` (overlay of reverted "
          "files + `DELETED.txt`); `--include-review` adds the review splices. It reads base/head from git and "
          "refuses when a head file no longer matches `after_sha256`."]
    return "\n".join(L)


if __name__ == "__main__":
    sys.exit(main())
