#!/usr/bin/env python3
"""What did MWCC decide differently for one function between two source variants?

    compare_sources.py --unit U --function F --a SPEC --b SPEC [--out DIR] [--json]

A SPEC is one of:

- `@worktree`                 the checkout as it is now;
- `@base` / `@base:<rev>`     the checkout's src/, include/ and libs/ at a git revision
                              (default `--base-rev`, i.e. HEAD);
- `@revert:<file>:<a>-<b>`    the working tree with the diff hunks (vs `--base-rev`) that
                              touch lines a..b of <file> reverted;
- a manifest JSON file        `{"files": {"<repo path>": "<content>" | null}, "base": "<rev>"}`
                              overlaying `base` (default `--base-rev`); null deletes a file.

Each variant is materialized in its own shadow root (stack_check.make_shadow_root),
so logical source paths and quote-includes match the real build, and is compiled
with the stock compiler and with the traced compiler. The traced object must
equal the stock one, else the result is `{"unavailable": "traced-object-mismatch"}`.

Output `mwcc-decision-diff-v1`: per change one line in compiler terms plus raw ids.
Webs are matched by class, pass, declaration site (line numbers mapped across the
two sources) and temp origin, never by raw vreg number. The full diff, both decision
documents and the traces stay in the output directory.
"""

from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import shutil
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Optional

API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import native_backend as nb  # noqa: E402

SOURCE_DIRS = ("src", "include", "libs")
SOURCE_SUFFIXES = (".c", ".cpp", ".cp", ".cxx", ".h", ".hpp", ".hh", ".inc", ".inl")
FUNCTION_PATTERN = re.compile(r"^[A-Za-z_~][A-Za-z0-9_$@<>,.~-]{0,511}$")
STDOUT_CHANGE_LIMIT = 30
MANIFEST_LIMIT = 16 * 1024 * 1024


class SpecError(ValueError):
    pass


@dataclass
class Variant:
    label: str
    spec: str
    tree: str  # "worktree" or a resolved commit
    overlay: dict[str, Optional[bytes]] = field(default_factory=dict)
    root: Optional[Path] = None
    # Repo paths whose content differs from the working tree in this variant.
    changed: set[str] = field(default_factory=set)


def checked_path(rel: str) -> str:
    path = PurePosixPath(rel)
    if path.is_absolute() or ".." in path.parts or "\\" in rel or "\0" in rel or not path.parts:
        raise SpecError(f"manifest path must be repo-relative: {rel!r}")
    if path.parts[0] not in SOURCE_DIRS or path.suffix.lower() not in SOURCE_SUFFIXES:
        raise SpecError(f"manifest path must be a C/C++ source or header under src/, include/ or libs/: {rel}")
    return str(path)


def parse_spec(spec: str, label: str, repo: Any, base_rev: str, tmp: Path, sc: Any) -> Variant:
    if spec == "@worktree":
        return Variant(label, spec, "worktree")
    if spec == "@base" or spec.startswith("@base:"):
        rev = spec.split(":", 1)[1] if ":" in spec else base_rev
        return Variant(label, spec, resolve_rev(repo, rev))
    if spec.startswith("@revert:"):
        match = re.fullmatch(r"@revert:(.+):(\d+)(?:-(\d+))?", spec)
        if not match:
            raise SpecError("@revert takes <file>:<line> or <file>:<first>-<last>")
        rel = checked_path(match.group(1))
        first, last = int(match.group(2)), int(match.group(3) or match.group(2))
        if last < first:
            raise SpecError("@revert line range is reversed")
        head = repo.read(rel)
        base = repo.show(resolve_rev(repo, base_rev), rel)
        hunks = [h for h in sc.file_hunks(rel, base, head, tmp, cwd=repo.root)
                 if h.head_lines[0] <= last and h.head_lines[1] >= first]
        if not hunks:
            raise SpecError(f"no change against {base_rev} touches {rel}:{first}-{last}")
        return Variant(label, spec, "worktree", {rel: sc.revert_hunks(head, hunks)})
    path = Path(spec)
    if not path.is_absolute():
        path = repo.root / spec
    if not path.is_file():
        raise SpecError(f"variant {label}: {spec} is not @worktree, @base[:rev], @revert:... or a manifest file")
    if path.stat().st_size > MANIFEST_LIMIT:
        raise SpecError(f"manifest {spec} is over {MANIFEST_LIMIT} bytes")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SpecError(f"manifest {spec} is not JSON: {error}") from error
    files = manifest.get("files") if isinstance(manifest, dict) else None
    if not isinstance(files, dict):
        raise SpecError('manifest must be {"files": {"<repo path>": "<content>" | null}}')
    overlay = {}
    for rel, content in files.items():
        if content is not None and not isinstance(content, str):
            raise SpecError(f"manifest content for {rel} must be a string or null")
        overlay[checked_path(rel)] = None if content is None else content.encode("utf-8")
    base = manifest.get("base") or base_rev
    tree = "worktree" if base == "@worktree" else resolve_rev(repo, base)
    return Variant(label, spec, tree, overlay)


def resolve_rev(repo: Any, rev: str) -> str:
    result = repo.git("rev-parse", "--verify", f"{rev}^{{commit}}", check=False)
    if result.returncode != 0:
        raise SpecError(f"unknown revision {rev!r}")
    return result.stdout.decode().strip()


def git_paths(repo: Any, *args: str) -> list[str]:
    out = repo.git(*args, "-z", "--", *SOURCE_DIRS).stdout
    return [p for p in out.decode("utf-8", "replace").split("\0") if p]


def materialize(variant: Variant, repo: Any, sc: Any, tmp: Path) -> Path:
    """A shadow root holding exactly this variant's sources."""
    if variant.tree == "worktree" and not variant.overlay:
        return repo.root
    root = tmp / f"root-{variant.label}"
    sc.make_shadow_root(repo.root, root)
    if variant.tree != "worktree":
        for rel in git_paths(repo, "diff", "--name-only", "--no-renames", variant.tree):
            sc.write_file(root, rel, repo.show(variant.tree, rel))
            variant.changed.add(rel)
        for rel in git_paths(repo, "ls-files", "--others", "--exclude-standard"):
            sc.write_file(root, rel, None)
            variant.changed.add(rel)
    for rel, content in variant.overlay.items():
        sc.write_file(root, rel, content)
        variant.changed.add(rel)
    return root


class LineMaps:
    """b line -> a line for each source file, from the two materialized trees.

    MWCC records declaration files by basename ("bosseel.cpp", "JSUList.hpp").
    A basename resolves to the one changed file with that name; a file that
    differs in neither variant keeps its numbering. Two changed files sharing
    a basename make every line of that name unmappable (reported unmatched).
    """

    AMBIGUOUS: dict[int, int] = {}

    def __init__(self, root_a: Path, root_b: Path, changed: set[str] = frozenset()) -> None:
        self.roots = (root_a, root_b)
        self.changed = set(changed)
        self.cache: dict[str, Optional[dict[int, int]]] = {}

    def resolve(self, rel: str) -> Optional[str]:
        if rel in self.changed or "/" in rel:
            return rel
        hits = [path for path in self.changed if path.rsplit("/", 1)[-1] == rel]
        if len(hits) > 1:
            return None
        return hits[0] if hits else rel

    def table(self, rel: str) -> Optional[dict[int, int]]:
        if rel not in self.cache:
            resolved = self.resolve(rel)
            if resolved is None:
                self.cache[rel] = self.AMBIGUOUS
                return self.cache[rel]
            rel_path = resolved
            a, b = (root / rel_path for root in self.roots)
            if not (a.is_file() and b.is_file()):
                self.cache[rel] = None
            else:
                da, db = a.read_bytes(), b.read_bytes()
                if da == db:
                    self.cache[rel] = None
                else:
                    la, lb = da.splitlines(), db.splitlines()
                    mapping: dict[int, int] = {}
                    matcher = difflib.SequenceMatcher(None, la, lb, autojunk=False)
                    for block in matcher.get_matching_blocks():
                        for k in range(block.size):
                            mapping[block.b + k + 1] = block.a + k + 1
                    self.cache[rel] = mapping
        return self.cache[rel]

    def __call__(self, rel: str, line: int) -> Optional[int]:
        table = self.table(rel)
        if table is None:  # unchanged file or unknown path: same numbering
            return line
        return table.get(line)


def resolve_symbol(functions: list[str], name: str) -> str:
    """The object symbol `name` means: itself, or the one mangled symbol with that plain name."""
    if name in functions:
        return name
    hits = [symbol for symbol in functions if symbol.startswith(name + "__")]
    return hits[0] if len(hits) == 1 else name


def code_class(stock_a: Path, stock_b: Path, function: str) -> str:
    import stack_compare as scmp

    try:
        diff = scmp.compare_objects(scmp.ElfObject.from_path(str(stock_a)), scmp.ElfObject.from_path(str(stock_b)))
    except Exception:  # noqa: BLE001 - classification is a convenience
        return "unavailable"
    for fn in diff.functions:
        if fn.name == function:
            return fn.cls
    return "absent"


def out_directory(repo_root: Path, raw: Optional[str], function: str) -> Path:
    if raw is None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        raw = str(PurePosixPath("build") / "mwcc-alloc" / "compare-sources" / f"{function}-{stamp}")
    path = PurePosixPath(raw)
    if path.is_absolute() or ".." in path.parts or "\\" in raw:
        raise SpecError("--out must stay within the workspace root")
    out = (repo_root / raw).resolve()
    if not out.is_relative_to(repo_root) or (out.exists() and any(out.iterdir())):
        raise SpecError("--out must be a new or empty directory inside the workspace")
    return out


def run(args: argparse.Namespace) -> dict:
    started = time.monotonic()
    deadline = started + max(30, min(1800, args.timeout_seconds))
    repo_root = Path(args.repo_root or os.getcwd()).resolve()
    os.environ["ORCH_GAME_REPO_ROOT"] = str(repo_root)
    nb.tools_dir()
    import stack_check as sc

    from decisions import build_decisions, decision_diff
    from native_trace import NotTraced, TraceError, load_trace, object_has_function
    from snapshot import relative_source

    base = {"schema": "mwcc-decision-diff-v1", "backend": "native", "unit": args.unit,
            "requested_function": args.function, "a": args.a, "b": args.b}
    if not FUNCTION_PATTERN.fullmatch(args.function):
        return {**base, "status": "invalid_arguments", "error": "--function must be a symbol name"}
    try:
        repo = sc.Repo(repo_root)
        unit = repo.unit(args.unit)
        out = out_directory(repo_root, args.out, args.function)
    except (SpecError, SystemExit) as error:
        return {**base, "status": "invalid_arguments", "error": str(error)}
    try:
        setup = nb.native_setup(repo, unit, ("coloring",))
    except nb.NativeUnavailable as error:
        return {**base, "status": "unavailable", "unavailable": error.reason, **error.details}
    base.update({"version": setup.version, "provenance": setup.provenance()})

    with tempfile.TemporaryDirectory(prefix="mwcc-compare-sources-") as temporary:
        tmp = Path(temporary)
        try:
            variants = [parse_spec(args.a, "a", repo, args.base_rev, tmp, sc),
                        parse_spec(args.b, "b", repo, args.base_rev, tmp, sc)]
        except (SpecError, RuntimeError) as error:
            return {**base, "status": "invalid_arguments", "error": str(error)}
        docs, compiles, untraced = {}, {}, []
        for variant in variants:
            variant.root = materialize(variant, repo, sc, tmp)
            compiled = nb.compile_variant(sc, repo, variant.root, unit, setup, args.function,
                                          tmp / f"out-{variant.label}", deadline)
            compiles[variant.label] = compiled
            if not compiled.ok:
                status = "unit_build_failed" if compiled.unavailable == "build-failed" else "unavailable"
                return {**base, "status": status, "unavailable": compiled.unavailable, "variant": variant.label,
                        "error": compiled.error[-4000:],
                        "compile_seconds": {k: v.seconds for k, v in compiles.items()}}
            try:
                trace = load_trace(compiled.trace)
                if trace.overflow_reason():
                    return {**base, "status": "unavailable", "unavailable": trace.overflow_reason(),
                            "variant": variant.label, "compile_seconds": {k: v.seconds for k, v in compiles.items()}}
                fn = trace.select(args.function)
            except TraceError as error:
                return {**base, "status": "trace_invalid", "variant": variant.label, "error": str(error)}
            except LookupError as error:
                functions = nb.object_functions(compiled.stock_obj)
                if isinstance(error, NotTraced) and object_has_function(functions, args.function):
                    untraced.append(variant.label)
                    continue
                return {**base, "status": "function_not_found", "variant": variant.label, "error": str(error),
                        "unit_functions": functions[:50]}
            root = variant.root

            def normalize(path: str, root: Path = root) -> str:
                return relative_source(path, root, repo.root)

            docs[variant.label], _ = build_decisions(fn, unit=unit.source, version=setup.version, stock=setup.stock,
                                                     available_points=setup.points, normalize=normalize)
        if untraced:
            # Not an empty diff: there is nothing to compare on that side.
            symbol = resolve_symbol(nb.object_functions(compiles["a"].stock_obj), args.function)
            return {**base, "status": "no_decisions_traced", "variants_without_decisions": untraced,
                    "summary": nb.NO_DECISIONS, "traced_object_matches_stock": True,
                    "stock": {"a_obj_sha": compiles["a"].stock_sha256, "b_obj_sha": compiles["b"].stock_sha256,
                              "code_class": code_class(compiles["a"].stock_obj, compiles["b"].stock_obj, symbol)},
                    "compile_seconds": {k: v.seconds for k, v in compiles.items()}}
        changed = variants[0].changed | variants[1].changed
        diff = decision_diff(docs["a"], docs["b"], map_line=LineMaps(variants[0].root, variants[1].root, changed))
        diff["stock"] = {
            "a_obj_sha": compiles["a"].stock_sha256,
            "b_obj_sha": compiles["b"].stock_sha256,
            "code_class": code_class(compiles["a"].stock_obj, compiles["b"].stock_obj, docs["a"]["function"]),
        }
        diff["variants"] = {v.label: {"spec": v.spec, "tree": v.tree, "overlay_files": sorted(v.overlay)} for v in variants}
        out.mkdir(parents=True, exist_ok=True)
        for label in ("a", "b"):
            (out / f"decisions-{label}.json").write_text(json.dumps(docs[label], indent=1) + "\n", encoding="utf-8")
            shutil.copy2(compiles[label].trace, out / f"trace-{label}.jsonl")
        full = {**base, **diff, "status": "ok", "traced_object_matches_stock": True}
        (out / "decision-diff.json").write_text(json.dumps(full, indent=1) + "\n", encoding="utf-8")

    result = {**full, "full_report": str((out / "decision-diff.json").relative_to(repo_root)),
              "compile_seconds": {k: v.seconds for k, v in compiles.items()},
              "duration_seconds": round(time.monotonic() - started, 3)}
    omitted = len(result["changes"]) - STDOUT_CHANGE_LIMIT
    result["changes_truncated"] = omitted > 0
    if omitted > 0:
        result["changes"] = result["changes"][:STDOUT_CHANGE_LIMIT]
        result["changes_omitted"] = omitted
        result["note"] = f"{omitted} more changes are in {result['full_report']} (every change is saved there)"
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--repo-root")
    parser.add_argument("--unit", required=True)
    parser.add_argument("--function", required=True)
    parser.add_argument("--a", required=True, help="Variant A spec.")
    parser.add_argument("--b", required=True, help="Variant B spec.")
    parser.add_argument("--base-rev", default="HEAD", help="Base for @base, @revert and manifests (default HEAD).")
    parser.add_argument("--out", help="Workspace-relative output directory for the full report.")
    parser.add_argument("--timeout-seconds", type=int, default=600)
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        payload = run(args)
    except Exception as error:  # noqa: BLE001 - one JSON object, always
        print(json.dumps({"status": "internal_error", "backend": "native", "error": f"{type(error).__name__}: {error}"}))
        return 1
    print(json.dumps(payload, indent=1 if not args.json else None, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
