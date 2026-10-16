#!/usr/bin/env python3
"""Produce the reverted file texts planned in fence-report.json; never touches the checkout.

Reads base and head texts from git (`git cat-file`, read-only), checks they still
match the report's sha256s, and applies the planned splices: each one replaces an
after-side line range with the base-side line range, so every reverted region is
the base text. `revert` splices (rejected hunks + cascade) are applied by default;
`--include-review` adds the `review` splices (suspected fence false positives and
inconclusive UNUSED tests).

  python3 fence_revert.py                        # dry run: summary + self-checks, writes nothing
  python3 fence_revert.py --out-dir /tmp/ovl     # overlay: <out>/<repo path> per changed file,
                                                 # <out>/DELETED.txt, <out>/fence-revert.json
  python3 fence_revert.py --out-dir D --verify-fence   # also re-run the fence over base -> overlay

Self-checks per file: base/head sha256 match the report; every splice lands the
exact base lines; reverted functions/classes re-parse to their base definition (or
are gone when base has none); a file whose every diff opcode is reverted equals
base; a deleted file has no code left. Exit 1 on any failed check.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
TOOLS = ROOT / "toolpacks/gamecube-decomp/_impl/gamecube/tools"
sys.path.insert(0, str(TOOLS))

HARNESS = Path("/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness").resolve()
CHECKOUT = HARNESS / "games/sms/workspace/checkout"
GIT_ENV = {**os.environ, "GIT_OPTIONAL_LOCKS": "0"}


def sha(text):
    return None if text is None else hashlib.sha256(text.encode("utf-8", "surrogateescape")).hexdigest()


class Git:
    def __init__(self, repo: str):
        self.p = subprocess.Popen(["git", "-C", repo, "cat-file", "--batch"], stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, env=GIT_ENV)

    def show(self, rev: str, path: str):
        self.p.stdin.write(f"{rev}:{path}\n".encode())
        self.p.stdin.flush()
        head = self.p.stdout.readline().decode()
        if head.endswith("missing\n"):
            return None
        data = self.p.stdout.read(int(head.split()[2]))
        self.p.stdout.read(1)
        return data.decode("utf-8", errors="surrogateescape")


def lines_of(text):
    return text.split("\n") if text else []


def merge(edits: list[dict]) -> list[dict]:
    """Sort by after range; drop edits contained in another; refuse partial overlaps."""
    out = []
    for e in sorted(edits, key=lambda e: (e["a"][0], -e["a"][1])):
        if out and (e["a"][0] < out[-1]["a"][1] or e["a"] == out[-1]["a"]):
            if e["a"][1] <= out[-1]["a"][1]:
                if e["a"] == out[-1]["a"] and e["b"] != out[-1]["b"] and e["a"][0] == e["a"][1]:
                    raise SystemExit(f"two insertions at the same point with different base text: {e} / {out[-1]}")
                out[-1] = dict(out[-1], by=sorted(set(out[-1]["by"]) | set(e["by"])))
                continue
            raise SystemExit(f"partial overlap between splices {out[-1]['a']} and {e['a']}")
        out.append(e)
    return out


def apply(before: str | None, after: str, edits: list[dict]) -> tuple[str, list[dict]]:
    bl, al = lines_of(before), lines_of(after)
    out, pos, placed = [], 0, []
    for e in edits:
        a0, a1 = e["a"]
        b0, b1 = e["b"]
        out += al[pos:a0]
        placed.append(dict(e, out=[len(out), len(out) + (b1 - b0)]))
        out += bl[b0:b1]
        pos = a1
    out += al[pos:]
    return "\n".join(out), placed


def code_left(text: str) -> bool:
    import evidence_search as es

    code = es.strip_code(text)
    code = re.sub(r"^\s*#\s*(ifndef|define|endif|include|pragma)\b.*$", "", code, flags=re.M)
    return bool(code.strip())


def self_check(path: str, before: str | None, after: str, result: str, placed: list[dict], diff_ops: int,
               deletes: bool) -> list[str]:
    import difflib

    import edit_scope
    import steering_check as sc

    errors = []
    bl, rl = lines_of(before), lines_of(result)
    for e in placed:
        o0, o1 = e["out"]
        if rl[o0:o1] != bl[e["b"][0]:e["b"][1]]:
            errors.append(f"{path}: splice {e['a']} does not land base lines {e['b']}")
    norm = lambda s: re.sub(r"\s+", "", s)  # noqa: E731
    rdefs = sc.function_defs(result)
    bdefs = sc.function_defs(before)
    for e in placed:
        what = e.get("what")
        if e["kind"] == "function_base":
            bd = [d for d in bdefs if d.qualified == what]
            rd = [d for d in rdefs if d.qualified == what]
            btexts = {norm(before[d.start:d.close + 1]) for d in bd}
            if not any(norm(result[d.start:d.close + 1]) in btexts for d in rd):
                errors.append(f"{path}: {what} is not its base definition after the revert")
        elif e["kind"] == "function_delete":
            if sum(1 for d in rdefs if d.qualified == what) > sum(1 for d in bdefs if d.qualified == what):
                errors.append(f"{path}: {what} (new) still defined after the revert")
        elif e["kind"] in ("class_base", "class_delete"):
            rc = [c for c in edit_scope.parse_source(path, result).classes if c.name.split("::")[-1] == what.split("::")[-1]]
            bc = [c for c in edit_scope.parse_source(path, before).classes if c.name.split("::")[-1] == what.split("::")[-1]]
            if sorted(c.key for c in rc) != sorted(c.key for c in bc):
                errors.append(f"{path}: class {what} differs from base after the revert")
    remaining = [op for op in difflib.SequenceMatcher(None, bl, rl, autojunk=False).get_opcodes() if op[0] != "equal"]
    if len(placed) and not remaining and result != (before or ""):
        errors.append(f"{path}: no diff lines left but text differs from base")
    if deletes and code_left(result):
        errors.append(f"{path}: planned deletion but code remains")
    if before is not None and diff_ops and not remaining and result != before:
        errors.append(f"{path}: fully reverted but not equal to base")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--report", default=str(HERE / "fence-report.json"))
    ap.add_argument("--repo", default=str(CHECKOUT), help="git repo for base/head objects (read with git cat-file only)")
    ap.add_argument("--out-dir", help="overlay directory to write (default: dry run)")
    ap.add_argument("--include-review", action="store_true", help="also apply review splices")
    ap.add_argument("--verify-fence", action="store_true", help="re-run edit_scope over base -> head+overlay")
    ap.add_argument("--fence-repo", default="/tmp/sms-fence-repo", help="repo with objdiff/objects/map for readiness")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    report = json.loads(Path(args.report).read_text())
    base, head = report["identity"]["base"], report["identity"]["head"]
    out_dir = Path(args.out_dir).resolve() if args.out_dir else None
    if out_dir is not None:
        if out_dir == HARNESS or HARNESS in out_dir.parents:
            raise SystemExit(f"refusing to write under the live harness: {out_dir}")
        if out_dir.exists() and any(out_dir.iterdir()):
            raise SystemExit(f"{out_dir}: exists and is not empty")
    git = Git(args.repo)

    results, errors, deleted, written = [], [], [], {}
    for p in report["plan"]:
        path = p["file"]
        before, after = git.show(base, path), git.show(head, path)
        if sha(before) != p["before_sha256"] or sha(after) != p["after_sha256"]:
            errors.append(f"{path}: base/head text no longer matches the report (sha256); re-run fence_report.py")
            continue
        chosen = list(p["revert"]) + (list(p["review"]) if args.include_review else [])
        if not chosen:
            continue
        edits = merge(chosen)
        result, placed = apply(before, after, edits)
        deletes = p["deletes_file"]
        errs = self_check(path, before, after, result, placed, p["diff_opcodes"], deletes)
        errors += errs
        row = {"file": path, "unit": p["unit"], "splices": len(edits), "deleted": deletes,
               "lines_before_revert": len(lines_of(after)), "lines_after_revert": 0 if deletes else len(lines_of(result)),
               "equals_base": (not deletes and result == before) or (deletes and before is None),
               "kinds": sorted({e["kind"] for e in edits}), "checks": "ok" if not errs else errs}
        results.append(row)
        if deletes:
            deleted.append(path)
        else:
            written[path] = result

    summary = {"report": args.report, "base": base, "head": head, "include_review": args.include_review,
               "files": len(results), "written": len(written), "deleted": deleted,
               "equal_to_base": sum(1 for r in results if r["equals_base"]),
               "splices": sum(r["splices"] for r in results), "errors": errors,
               "out_dir": str(out_dir) if out_dir else None, "files_detail": results}

    if out_dir is not None and not errors:
        out_dir.mkdir(parents=True, exist_ok=True)
        for path, text in written.items():
            dest = out_dir / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(text.encode("utf-8", "surrogateescape"))
        (out_dir / "DELETED.txt").write_text("".join(f"{d}\n" for d in deleted))

    if args.verify_fence:
        summary["fence_after_revert"] = verify_fence(report, git, written, set(deleted), args.fence_repo)

    if out_dir is not None and not errors:
        (out_dir / "fence-revert.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False) + "\n")
    if args.json:
        print(json.dumps(summary, indent=1, ensure_ascii=False))
    else:
        print(f"{'dry run' if out_dir is None else 'overlay ' + str(out_dir)}: {len(results)} files, "
              f"{summary['splices']} splices, {len(written)} rewritten ({summary['equal_to_base']} equal to base), "
              f"{len(deleted)} deleted; errors {len(errors)}")
        for e in errors:
            print("  ERROR", e)
        if "fence_after_revert" in summary:
            f = summary["fence_after_revert"]
            print(f"  fence after revert: {f['verdict']}; rejected {f['rejected']}; expected (keep/review) "
                  f"{f['expected_remaining']}; unexpected {len(f['unexpected'])}")
            for u in f["unexpected"][:20]:
                print("   UNEXPECTED", u)
    return 1 if errors or (args.verify_fence and summary["fence_after_revert"]["unexpected"]) else 0


def verify_fence(report: dict, git: Git, written: dict, deleted: set, fence_repo: str) -> dict:
    """edit_scope.pr_check over every changed file: base -> (reverted text | head text)."""
    import edit_scope
    import readiness

    base, head = report["identity"]["base"], report["identity"]["head"]
    policy = report["identity"]["policy"]
    changed = subprocess.run(["git", "-C", fence_repo, "diff", "--name-only", "--no-renames", base, head, "--",
                              "src", "include", "libs"], capture_output=True, text=True, check=True,
                             env=GIT_ENV).stdout.split()
    files = []
    for p in changed:
        if not edit_scope.in_scope(p):
            continue
        b = git.show(base, p)
        a = None if p in deleted else written.get(p, git.show(head, p))
        if a != b:
            files.append({"path": p, "before": b, "after": a})
    r = readiness.load(Path(fence_repo), base, policy=policy)
    res = edit_scope.pr_check(Path(fence_repo), base, files, readiness=r, policy=policy)
    rejected = [h for h in res["hunks"] if h["verdict"] in edit_scope.REJECT]
    keep = {(it["file"], it["line"], it["verdict"]) for it in report["items"] if it["action"] in ("keep", "review")}
    keep_fn = {(it["file"], it.get("function")) for it in report["items"] if it["action"] in ("keep", "review")}

    def expected(h):
        if (h["file"], h["line"], h["verdict"]) in keep:
            return True
        m = re.match(r"UNUSED (.+?) (?:reconstructed|is dead)", h["reason"])
        return bool(m and (h["file"], m.group(1)) in keep_fn)

    unexpected = [f"{h['file']}:{h['line']} {h['verdict']} {h.get('class')}: {h['reason'][:140]}"
                  for h in rejected if not expected(h)]
    from collections import Counter

    return {"verdict": res["verdict"], "rejected": dict(Counter(h["verdict"] for h in rejected)),
            "expected_remaining": sum(1 for h in rejected if expected(h)), "unexpected": unexpected,
            "files_checked": len(files)}


if __name__ == "__main__":
    sys.exit(main())
