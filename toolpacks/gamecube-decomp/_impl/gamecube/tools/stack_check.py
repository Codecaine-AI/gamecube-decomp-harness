#!/usr/bin/env python3
"""Is an edit only a stack-frame perturbation? Build with and without it and diff.

The programmatic form of the SMS maintainer test: compile the code with and
without an edit; if the only differences are `stwu r1`/`addi r1,r1` frame
immediates and `N(r1)` / `addi rX,r1,N` stack offsets, the edit only moves the
stack frame and is banned for `stop_at_frame` games (see game_policy.py).

Subcommands (all take --json for machine output):

  objects A.o B.o
      Per function: identical | stack_only | code | only_a | only_b, with
      frame_a/frame_b and first_diff; plus `data: identical|differs` for the
      allocated non-code sections (bytes and relocations).

  target --repo R --unit U [--version GMSJ01] [--object PATH]
      build/<ver>/src/U.o (or --object) against build/<ver>/obj/U.o: per
      target function exact | stack_only | mismatch | missing, match_percent
      (objdiff), frame_compiled, frame_target.

  hunks --repo R --base REF [--files F ...] [--jobs N]
        [--header-scope changed|all] --out audit.json
      Leave-one-out audit of every `git diff -U0 REF` hunk (working tree vs
      REF) under src/ and include/: compile the tree with only that hunk
      reverted and classify its effect (none | stack_only | code |
      build_break) and decision (keep | drop_no_effect | drop_stack_only |
      drop_no_gain | review).

  apply --repo R --audit audit.json --drop drop_no_effect,drop_stack_only,...
        [--strip-comments] [--rounds 3] [--dry-run]
      Revert the chosen hunks, optionally strip agent comments, re-audit what
      is left until nothing new drops, then verify exact/stack_only/mismatch
      counts at base, HEAD and final. After every round a joint-effect guard
      recompiles each touched TU: hunks that were harmless alone but change
      code for the worse together are re-applied one at a time and kept
      only if the TU still does not regress. With --out, the last re-audit
      goes there and each round's re-audit to <out>.round<N>.json.

  strip-comments --repo R --base REF [--files F ...] [--dry-run]
      On lines added since REF, remove comments matching
      agent_comments.AGENT_COMMENT_RE; every touched TU must stay byte-identical
      (falls back to blank lines when `__LINE__` would shift).

Variants never touch the repo: each worker owns a shadow root (APFS clones of
src/, include/ and libs/, symlinks for everything else) and compiles there
with the TU's exact build.ninja command, so `__FILE__`, quote-includes and the
object bytes match the real build.
"""

from __future__ import annotations

import argparse
import bisect
import hashlib
import json
import os
import queue
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Optional

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import agent_comments  # noqa: E402
import game_policy  # noqa: E402
import stack_compare as sc  # noqa: E402

DEFAULT_PATHS = ("src", "include")
CLONE_DIRS = ("src", "include", "libs")
DROP_DECISIONS = ("drop_no_effect", "drop_stack_only", "drop_no_gain")
DECISIONS = ("keep", *DROP_DECISIONS, "review")
EFFECTS = ("none", "stack_only", "code", "build_break", "unaudited")
HEADER_SUFFIXES = (".h", ".hpp", ".hh", ".inc", ".inl")
ERROR_LIMIT = 1500
TEXT_LIMIT = 20000


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def sha256(data: Optional[bytes]) -> Optional[str]:
    return None if data is None else hashlib.sha256(data).hexdigest()


def run(cmd: list[str], cwd: Path | str, check: bool = True, **kw) -> subprocess.CompletedProcess:
    result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, **kw)
    if check and result.returncode != 0:
        err = result.stderr if isinstance(result.stderr, str) else result.stderr.decode("utf-8", "replace")
        raise RuntimeError(f"{' '.join(cmd)} failed: {err.strip()[:500]}")
    return result


def split_lines(data: Optional[bytes]) -> list[bytes]:
    return [] if not data else data.splitlines(keepends=True)


def text_of(lines: Iterable[bytes], limit: int = TEXT_LIMIT) -> str:
    text = b"".join(lines).decode("utf-8", "replace")
    return text if len(text) <= limit else text[:limit] + f"\n... [{len(text) - limit} chars truncated]"


def truncate(text: str, limit: int = ERROR_LIMIT) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit] + " ..."


# --------------------------------------------------------------------------
# Tool discovery
# --------------------------------------------------------------------------


def find_objdump(hint: Optional[Path] = None, explicit: Optional[str] = None) -> Optional[str]:
    if explicit:
        return explicit
    env = os.environ.get("STACK_CHECK_OBJDUMP")
    if env:
        return env
    if hint is not None:
        for base in (hint, *hint.parents):
            cand = base / "build" / "binutils" / "powerpc-eabi-objdump"
            if cand.is_file():
                return str(cand)
    return shutil.which("powerpc-eabi-objdump")


_DISASM_CACHE: dict[str, dict[tuple[str, int], str]] = {}
_DISASM_LOCK = threading.Lock()
_DISASM_LINE = re.compile(r"^\s*([0-9a-f]+):\s+(.*\S)\s*$")


def disassembly(objdump: Optional[str], path: str, cache: bool = False) -> dict[tuple[str, int], str]:
    """(section, offset) -> instruction text, via `objdump -d`."""
    if objdump is None:
        return {}
    if cache:
        with _DISASM_LOCK:
            hit = _DISASM_CACHE.get(path)
        if hit is not None:
            return hit
    result = subprocess.run(
        [objdump, "-d", "--no-show-raw-insn", path], capture_output=True, text=True
    )
    out: dict[tuple[str, int], str] = {}
    section = ""
    for line in result.stdout.splitlines():
        if line.startswith("Disassembly of section "):
            section = line[len("Disassembly of section ") :].rstrip(":")
            continue
        match = _DISASM_LINE.match(line)
        if match and not match.group(2).startswith("R_"):
            out[(section, int(match.group(1), 16))] = re.sub(r"\s+", " ", match.group(2))
    if cache:
        with _DISASM_LOCK:
            _DISASM_CACHE[path] = out
    return out


def annotate_first_diffs(
    diff: sc.ObjectsDiff,
    a: sc.ElfObject,
    b: sc.ElfObject,
    objdump: Optional[str],
    labels: tuple[str, str] = ("a", "b"),
    cache_a: bool = False,
) -> None:
    """Fill first_diff a/b text (disassembly, else hex words)."""
    wanted = [fn for fn in diff.functions if fn.first_diff is not None]
    if not wanted:
        return
    dis_a = disassembly(objdump, a.path, cache=cache_a)
    dis_b = disassembly(objdump, b.path)
    fa, fb = a.keyed_functions(), b.keyed_functions()
    for fn in wanted:
        off = fn.first_diff["offset"]
        for label, obj, funcs, dis in ((labels[0], a, fa, dis_a), (labels[1], b, fb, dis_b)):
            f = funcs.get(fn.name)
            if f is None or f.start + off + 4 > len(f.section.data):
                fn.first_diff[label] = None
                continue
            text = dis.get((f.section.name, f.start + off))
            fn.first_diff[label] = text or f"{obj.word(f.section, f.start + off):08x}"


# --------------------------------------------------------------------------
# Repo model: units, build edges, deps
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Unit:
    name: str  # e.g. M3DUtil/MActor
    obj: str  # build/GMSJ01/src/M3DUtil/MActor.o
    target: str  # build/GMSJ01/obj/M3DUtil/MActor.o
    source: str  # src/M3DUtil/MActor.cpp


@dataclass
class Edge:
    rule: str
    src: str
    mw_version: str
    cflags: str
    extab_padding: Optional[str]


class Repo:
    def __init__(self, root: str | Path, version: Optional[str] = None):
        self.root = Path(root).resolve()
        if not (self.root / "build.ninja").is_file():
            raise SystemExit(f"{self.root}: no build.ninja (run configure.py first)")
        os.environ["ORCH_GAME_REPO_ROOT"] = str(self.root)
        import ninja_compile  # bound to ORCH_GAME_REPO_ROOT at import

        if Path(ninja_compile.ROOT).resolve() != self.root:
            raise SystemExit("stack_check: ninja_compile already bound to another repo")
        self.nc = ninja_compile
        index = ninja_compile._load_metadata(
            ninja_compile.BUILD_INDEX_CACHE_NAME,
            self.root / "build.ninja",
            ninja_compile._parse_build_index,
            ninja_compile._valid_build_index,
        )
        self.edges: dict[str, Edge] = {}
        for obj, (rule, src, mw, flags, extab) in index["edges"].items():
            if rule in ninja_compile.MWCC_RULES:
                self.edges[obj] = Edge(rule, src, mw, index["cflags"][flags], extab)
        self.version = version or self._detect_version()
        self.units: dict[str, Unit] = {}
        self.units_by_source: dict[str, list[Unit]] = {}
        prefix = f"build/{self.version}/src/"
        for obj, edge in self.edges.items():
            if not obj.startswith(prefix):
                continue
            name = obj[len(prefix) : -2]
            unit = Unit(name, obj, f"build/{self.version}/obj/{name}.o", edge.src)
            self.units[name] = unit
            self.units_by_source.setdefault(edge.src, []).append(unit)
        self._deps: Optional[dict[str, set[str]]] = None
        self._lock = threading.Lock()
        runner = ninja_compile._runner_command()
        if runner is None:
            raise SystemExit("no MWCC runner (wibo/wine) found")
        self.runner = str(runner[1])
        self.objdump = find_objdump(self.root)

    def _detect_version(self) -> str:
        counts: dict[str, int] = {}
        for obj in self.edges:
            parts = obj.split("/")
            if len(parts) > 3 and parts[0] == "build" and parts[2] == "src":
                counts[parts[1]] = counts.get(parts[1], 0) + 1
        if not counts:
            raise SystemExit("could not detect build version from build.ninja")
        return max(counts, key=counts.get)

    def unit(self, name: str) -> Unit:
        name = name.removeprefix("mario/").removeprefix("main/")
        if name.endswith(".o"):
            name = name[:-2]
        for prefix in (f"build/{self.version}/src/", f"build/{self.version}/obj/"):
            name = name.removeprefix(prefix)
        if name in self.units:
            return self.units[name]
        if name in self.units_by_source:
            return self.units_by_source[name][0]
        for src, units in self.units_by_source.items():
            stem = src.rsplit(".", 1)[0]
            if stem == name or stem.endswith("/" + name):
                return units[0]
        raise SystemExit(f"unknown unit: {name}")

    def rel(self, path: str) -> Optional[str]:
        """Repo-relative POSIX path, or None when outside the repo."""
        p = Path(path)
        if not p.is_absolute():
            return p.as_posix()
        try:
            return Path(os.path.realpath(p)).relative_to(self.root).as_posix()
        except ValueError:
            try:
                return p.relative_to(self.root).as_posix()
            except ValueError:
                return None

    def deps(self) -> dict[str, set[str]]:
        """obj path -> repo-relative dependency paths, from `ninja -t deps`."""
        with self._lock:
            if self._deps is not None:
                return self._deps
            out = run(["ninja", "-t", "deps"], self.root, text=True).stdout
            deps: dict[str, set[str]] = {}
            current: Optional[set[str]] = None
            for line in out.splitlines():
                if not line.strip():
                    current = None
                    continue
                if not line.startswith(" "):
                    target = line.split(":", 1)[0]
                    rel = self.rel(target)
                    current = deps.setdefault(rel or target, set())
                    continue
                if current is not None:
                    rel = self.rel(line.strip())
                    if rel:
                        current.add(rel)
            self._deps = deps
            return deps

    def pch_headers(self) -> set[str]:
        out: set[str] = set()
        for target, deps in self.deps().items():
            if target.endswith(".mch"):
                out |= deps
        return out

    def units_including(self, path: str) -> list[Unit]:
        deps = self.deps()
        hits = [u for u in self.units.values() if path in deps.get(u.obj, ()) or u.source == path]
        return sorted(hits, key=lambda u: u.name)

    def units_without_deps(self) -> list[Unit]:
        deps = self.deps()
        return [u for u in self.units.values() if u.obj not in deps]

    def read(self, rel: str) -> Optional[bytes]:
        p = self.root / rel
        return p.read_bytes() if p.is_file() else None

    def git(self, *args: str, check: bool = True) -> subprocess.CompletedProcess:
        return run(["git", *args], self.root, check=check)

    def show(self, ref: str, rel: str) -> Optional[bytes]:
        result = self.git("show", f"{ref}:{rel}", check=False)
        return result.stdout if result.returncode == 0 else None

    def rev(self, ref: str) -> str:
        return self.git("rev-parse", ref).stdout.decode().strip()


# --------------------------------------------------------------------------
# Shadow roots and compiling
# --------------------------------------------------------------------------


@dataclass
class CompileResult:
    ok: bool
    obj: Optional[Path]
    error: str = ""


def write_file(root: Path, rel: str, content: Optional[bytes]) -> None:
    """Write (or with None delete) `rel` under `root`, replacing a symlink."""
    p = root / rel
    if content is None:
        if p.exists() or p.is_symlink():
            p.unlink()
        return
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.is_symlink():
        p.unlink()
    p.write_bytes(content)


def make_shadow_root(repo_root: Path, root: Path) -> None:
    """APFS clones (or copies) of the source dirs, symlinks for the rest."""
    root.mkdir()
    for entry in repo_root.iterdir():
        if entry.name == ".git":
            continue
        if entry.name in CLONE_DIRS and entry.is_dir():
            if subprocess.run(["cp", "-c", "-R", str(entry), str(root / entry.name)],
                              capture_output=True).returncode != 0:
                shutil.rmtree(root / entry.name, ignore_errors=True)
                shutil.copytree(entry, root / entry.name, symlinks=True)
        else:
            os.symlink(entry, root / entry.name)


def compile_in(repo: Repo, root: Path, unit: Unit, out: Path) -> CompileResult:
    """The TU's exact build.ninja MWCC command, run with cwd = `root`."""
    edge = repo.edges[unit.obj]
    cmd = [repo.runner]
    if "sjis" in edge.rule:
        cmd.append(str(repo.root / "build/tools/sjiswrap.exe"))
    cmd.append(str(repo.root / "build/compilers" / edge.mw_version / "mwcceppc.exe"))
    cmd += shlex.split(edge.cflags) + ["-c", edge.src, "-o", str(out)]
    result = subprocess.run(cmd, cwd=str(root), capture_output=True, text=True, errors="replace")
    if result.returncode != 0 or not out.is_file():
        out.unlink(missing_ok=True)
        return CompileResult(False, None, truncate((result.stdout or "") + "\n" + (result.stderr or "")))
    if "extab" in edge.rule:
        dtk = repo.root / "build/tools/dtk"
        if not repo.nc._run_extab_clean(out, dtk, edge.extab_padding or "", quiet=True):
            out.unlink(missing_ok=True)
            return CompileResult(False, None, "dtk extab clean failed")
    return CompileResult(True, out)


class _Worker:
    """One pool process: its own shadow root, the overlay state, caches."""

    def __init__(self, repo_root: str, version: str, roots: list[str], state: dict, objdir: str):
        self.repo = Repo(repo_root, version)
        self.state = state
        self.objdir = Path(objdir)
        self.root = self._claim([Path(r) for r in roots])
        self._oracle: Optional[TargetOracle] = None
        self.heads: dict[str, sc.ElfObject] = {}
        self.counter = 0

    @staticmethod
    def _claim(roots: list[Path]) -> Path:
        for root in roots:
            try:
                os.close(os.open(root / ".claim", os.O_CREAT | os.O_EXCL | os.O_WRONLY))
                return root
            except FileExistsError:
                continue
        raise RuntimeError("no free shadow root")

    @property
    def oracle(self) -> "TargetOracle":
        if self._oracle is None:
            self._oracle = TargetOracle(self.repo)
        return self._oracle

    def current(self, rel: str) -> Optional[bytes]:
        return self.state[rel] if rel in self.state else self.repo.read(rel)

    def compile(self, unit_name: str, overrides: dict, out: Optional[Path] = None) -> CompileResult:
        unit = self.repo.units[unit_name]
        if out is None:
            self.counter += 1
            out = self.objdir / f"p{os.getpid()}-{self.counter}.o"
        try:
            for rel, content in overrides.items():
                write_file(self.root, rel, content)
            return compile_in(self.repo, self.root, unit, out)
        finally:
            for rel in overrides:
                write_file(self.root, rel, self.current(rel))

    def head(self, path: str) -> sc.ElfObject:
        elf = self.heads.get(path)
        if elf is None:
            if len(self.heads) > 64:
                self.heads.clear()
            elf = self.heads[path] = sc.ElfObject.from_path(path)
        return elf

    # -- tasks (results must pickle) ---------------------------------------

    def t_head(self, unit_name: str, out_path: str) -> dict[str, Any]:
        out = Path(out_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        res = self.compile(unit_name, {}, out)
        if not res.ok:
            return {"ok": False, "error": res.error}
        return {"ok": True, "target": self.oracle.classify(out, self.repo.units[unit_name])}

    def t_hash(self, unit_name: str, overrides: dict) -> dict[str, Any]:
        res = self.compile(unit_name, overrides)
        if not res.ok:
            return {"ok": False, "error": res.error}
        digest = sha256(res.obj.read_bytes())
        res.obj.unlink(missing_ok=True)
        return {"ok": True, "sha": digest}

    def t_target(self, unit_name: str, overrides: dict) -> Optional[dict]:
        res = self.compile(unit_name, overrides)
        if not res.ok:
            return None
        try:
            return self.oracle.classify(res.obj, self.repo.units[unit_name])
        finally:
            res.obj.unlink(missing_ok=True)

    def t_variant(self, unit_name: str, overrides: dict, head_path: str) -> dict[str, Any]:
        """Compile one TU with overrides and classify it against HEAD.

        `target_with` (HEAD's target status) is filled in by the caller.
        """
        unit = self.repo.units[unit_name]
        res = self.compile(unit_name, overrides)
        if not res.ok:
            return {"unit": unit_name, "effect": "build_break", "error": res.error}
        try:
            head = self.head(head_path)
            variant = sc.ElfObject.from_path(str(res.obj))
            diff = sc.compare_objects(head, variant)
            out: dict[str, Any] = {"unit": unit_name, "effect": diff.effect, "functions": [], "data": []}
            if diff.effect == "none":
                return out
            annotate_first_diffs(diff, head, variant, self.repo.objdump, ("head", "variant"), cache_a=True)
            without_funcs, without_secs = target_index(self.oracle.classify(res.obj, unit))
            for fn in diff.functions:
                if fn.cls == "identical":
                    continue
                out["functions"].append(
                    {
                        "unit": unit_name,
                        "name": fn.name,
                        "class": fn.cls,
                        "frame_head": fn.frame_a,
                        "frame_variant": fn.frame_b,
                        "first_diff": fn.first_diff,
                        "target_with": None,
                        "target_without": brief_status(without_funcs.get(fn.name)),
                    }
                )
            for sec in diff.data_sections:
                if sec["status"] != "identical":
                    out["data"].append(
                        {
                            "unit": unit_name,
                            "section": sec["name"],
                            "status": sec["status"],
                            "target_with": None,
                            "target_without": without_secs.get(sec["name"]),
                        }
                    )
            return out
        finally:
            res.obj.unlink(missing_ok=True)


_WORKER: Optional[_Worker] = None


def _worker_init(*args: Any) -> None:
    global _WORKER
    _WORKER = _Worker(*args)


def _run_task(name: str, args: tuple) -> Any:
    return getattr(_WORKER, "t_" + name)(*args)


class ShadowPool:
    """`jobs` worker processes, each compiling in a private shadow root.

    `state` is an overlay (path -> bytes, None = deleted) applied to every
    root; a task's overrides are written on top and restored afterwards. The
    repo itself is never written.
    """

    def __init__(self, repo: Repo, jobs: int, tmp: Optional[str] = None):
        self.repo = repo
        self.jobs = max(1, jobs)
        self.tmp = Path(tempfile.mkdtemp(prefix="stack-check-", dir=tmp))
        self.objdir = self.tmp / "objs"
        self.objdir.mkdir()
        self.headdir = self.tmp / "head"
        self.state: dict[str, Optional[bytes]] = {}
        self._repo_cache: dict[str, Optional[bytes]] = {}
        self.roots = [self.tmp / f"w{i}" for i in range(self.jobs)]
        for root in self.roots:
            make_shadow_root(repo.root, root)
        self._executor: Optional[ProcessPoolExecutor] = None
        self.compiles = 0

    def close(self) -> None:
        self._stop()
        shutil.rmtree(self.tmp, ignore_errors=True)

    def repo_file(self, rel: str) -> Optional[bytes]:
        if rel not in self._repo_cache:
            self._repo_cache[rel] = self.repo.read(rel)
        return self._repo_cache[rel]

    def current(self, rel: str) -> Optional[bytes]:
        """Content of `rel` in the overlay state (falls back to the repo)."""
        return self.state[rel] if rel in self.state else self.repo_file(rel)

    def _stop(self) -> None:
        if self._executor is not None:
            self._executor.shutdown(wait=True)
            self._executor = None

    def _start(self) -> None:
        import multiprocessing

        for root in self.roots:
            (root / ".claim").unlink(missing_ok=True)
        self._executor = ProcessPoolExecutor(
            max_workers=self.jobs,
            mp_context=multiprocessing.get_context("spawn"),
            initializer=_worker_init,
            initargs=(str(self.repo.root), self.repo.version, [str(r) for r in self.roots],
                      self.state, str(self.objdir)),
        )

    def set_state(self, overlay: dict[str, Optional[bytes]]) -> None:
        """Make every root equal to repo + overlay (restarts the workers)."""
        self._stop()
        old = self.state
        self.state = dict(overlay)
        for root in self.roots:
            for rel in set(old) | set(overlay):
                write_file(root, rel, self.current(rel))

    def map(self, task: str, items: list[tuple], label: str = "") -> list[Any]:
        """Run worker task `t_<task>(*item)` for every item, in order."""
        if not items:
            return []
        if self._executor is None:
            self._start()
        results: list[Any] = [None] * len(items)
        start = last = time.time()
        futures = {self._executor.submit(_run_task, task, item): i for i, item in enumerate(items)}
        for done, fut in enumerate(as_completed(futures), 1):
            results[futures[fut]] = fut.result()
            now = time.time()
            if label and (now - last > 15 or done == len(items)):
                last = now
                log(f"  {label}: {done}/{len(items)} ({now - start:.0f}s)")
        self.compiles += len(items)
        return results


# --------------------------------------------------------------------------
# Target status (objdiff)
# --------------------------------------------------------------------------


class TargetOracle:
    def __init__(self, repo: Repo):
        self.repo = repo
        import objdiff_path

        self.cli = objdiff_path.objdiff_cli()

    def classify(self, compiled: Path | str, unit: Unit) -> Optional[dict[str, Any]]:
        target = self.repo.root / unit.target
        if not target.is_file():
            return None
        result = subprocess.run(
            [self.cli, "diff", "--format", "json", "--output", "-", "-1", str(target), "-2", str(compiled)],
            cwd=str(self.repo.root),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return None
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError:
            return None
        return sc.classify_objdiff(payload)


def target_index(classified: Optional[dict[str, Any]]) -> tuple[dict[str, dict], dict[str, Optional[float]]]:
    """compiled function name -> target entry, section -> match %."""
    if not classified:
        return {}, {}
    funcs = {}
    for entry in classified["functions"]:
        funcs[entry.get("compiled_name") or entry["name"]] = entry
    sections = {s["name"]: s.get("match_percent") for s in classified["sections"]}
    return funcs, sections


def brief_status(entry: Optional[dict]) -> Optional[dict]:
    if entry is None:
        return None
    return {"status": entry["status"], "match_percent": round(entry["match_percent"], 4)}


def count_statuses(classified: Optional[dict[str, Any]]) -> dict[str, int]:
    counts = {"exact": 0, "stack_only": 0, "mismatch": 0, "missing": 0}
    if classified:
        for entry in classified["functions"]:
            counts[entry["status"]] += 1
    return counts


# --------------------------------------------------------------------------
# Diff hunks and source regions
# --------------------------------------------------------------------------

_HUNK_RE = re.compile(rb"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


@dataclass
class Hunk:
    file: str
    index: int
    base_start: int
    base_count: int
    head_start: int
    head_count: int
    removed: list[bytes]
    added: list[bytes]

    @property
    def id(self) -> str:
        return f"{self.file}#{self.index}"

    @property
    def head_lines(self) -> tuple[int, int]:
        """1-based inclusive head line span touched (a deletion touches one line)."""
        if self.head_count:
            return self.head_start, self.head_start + self.head_count - 1
        line = max(self.head_start, 1)
        return line, line


def parse_hunk_headers(diff: bytes) -> list[tuple[int, int, int, int]]:
    out = []
    for line in diff.splitlines():
        m = _HUNK_RE.match(line)
        if m:
            a, b, c, d = m.groups()
            out.append((int(a), 1 if b is None else int(b), int(c), 1 if d is None else int(d)))
    return out


def file_hunks(rel: str, base: Optional[bytes], head: Optional[bytes], tmp: Path, cwd: Optional[Path] = None) -> list[Hunk]:
    """`git diff -U0` hunks between two versions of one file."""
    if base == head:
        return []
    paths = []
    for tag, content in (("a", base), ("b", head)):
        if content is None:
            paths.append("/dev/null")
            continue
        fd, p = tempfile.mkstemp(prefix=f"hunk-{tag}-", dir=str(tmp))
        with os.fdopen(fd, "wb") as stream:
            stream.write(content)
        paths.append(p)
    try:
        result = subprocess.run(
            ["git", "diff", "--no-index", "--no-color", "--no-ext-diff", "-U0", paths[0], paths[1]],
            capture_output=True,
            cwd=str(cwd) if cwd else None,
        )
    finally:
        for p in paths:
            if p != "/dev/null":
                os.unlink(p)
    if result.returncode not in (0, 1):
        raise RuntimeError(f"git diff --no-index failed for {rel}: {result.stderr[:300]!r}")
    base_lines, head_lines = split_lines(base), split_lines(head)
    hunks = []
    for i, (a, b, c, d) in enumerate(parse_hunk_headers(result.stdout)):
        a0 = a - 1 if b else a
        c0 = c - 1 if d else c
        hunks.append(Hunk(rel, i, a, b, c, d, base_lines[a0 : a0 + b], head_lines[c0 : c0 + d]))
    return hunks


def revert_hunks(head: Optional[bytes], hunks: list[Hunk]) -> Optional[bytes]:
    """Head content with the given hunks (of one file) reverted to base.

    Reverting the hunk of a file the diff added (`@@ -0,0 +1,N @@`) deletes the
    file (None); reverting a deleted file's hunk restores it.
    """
    lines = split_lines(head)
    for h in sorted(hunks, key=lambda h: h.head_start, reverse=True):
        c0 = h.head_start - 1 if h.head_count else h.head_start
        lines[c0 : c0 + h.head_count] = h.removed
    if not lines and any(h.base_start == 0 and h.base_count == 0 for h in hunks):
        return None
    return b"".join(lines)


_TRANSPARENT_BLOCK = re.compile(r'(\bnamespace\b[^{;]*|\bextern\s+"C(?:\+\+)?"\s*)$')


def top_level_blocks(text: str) -> list[tuple[int, int]]:
    """1-based inclusive line spans of top-level `{...}` blocks with headers.

    A span starts at the first code line of the block's header (a function
    signature, `class X : Y`, `template <...>`) and ends at its closing brace.
    `namespace` and `extern "C"` blocks are transparent. Comments,
    string/char literals and preprocessor lines are skipped.
    """
    blocks: list[tuple[int, int]] = []
    stack: list[bool] = []  # True = counts as a block level
    depth = 0
    line = 1
    i = 0
    n = len(text)
    header_start = 0
    header_line: Optional[int] = None
    open_line = 0
    at_line_start = True
    while i < n:
        ch = text[i]
        if ch == "\n":
            line += 1
            at_line_start = True
            i += 1
            continue
        if ch in " \t\r":
            i += 1
            continue
        if at_line_start and ch == "#":
            # Preprocessor line, with backslash continuations.
            while i < n:
                if text[i] == "\n":
                    if i > 0 and text[i - 1] == "\\":
                        line += 1
                        i += 1
                        continue
                    break
                i += 1
            continue
        at_line_start = False
        if text.startswith("//", i):
            while i < n and text[i] != "\n":
                i += 1
            continue
        if text.startswith("/*", i):
            end = text.find("*/", i + 2)
            end = n if end < 0 else end + 2
            line += text.count("\n", i, end)
            i = end
            continue
        if header_line is None and ch not in "{};":
            header_line = line
        if ch in "\"'":
            j = i + 1
            while j < n and text[j] != ch and text[j] != "\n":
                j += 2 if text[j] == "\\" else 1
            i = j + 1
            continue
        if ch == "{":
            head = re.sub(r"\s+", " ", text[header_start:i]).strip()
            transparent = depth == 0 and bool(_TRANSPARENT_BLOCK.search(head))
            stack.append(not transparent)
            if not transparent:
                if depth == 0:
                    open_line = header_line or line
                depth += 1
            header_start, header_line = i + 1, None
        elif ch == "}":
            if stack and stack.pop():
                depth -= 1
                if depth == 0:
                    blocks.append((open_line, line))
            header_start, header_line = i + 1, None
        elif ch == ";":
            header_start, header_line = i + 1, None
        i += 1
    return blocks


def hunk_group(hunks: list[Hunk], target: Hunk, text: str, gap: int = 3) -> list[Hunk]:
    """Hunks reverted together when `target` alone does not compile.

    Inside a top-level block (function, class, initializer): every hunk of the
    same block(s). Outside any block: the run of neighbouring out-of-block
    hunks separated by at most `gap` unchanged lines.
    """
    blocks = top_level_blocks(text)

    def block_ids(h: Hunk) -> frozenset[int]:
        lo, hi = h.head_lines
        return frozenset(k for k, (a, b) in enumerate(blocks) if a <= hi and b >= lo)

    ids = {h.id: block_ids(h) for h in hunks}
    if ids[target.id]:
        group = set(ids[target.id])
        while True:
            members = [h for h in hunks if ids[h.id] & group]
            grown = set().union(*(ids[h.id] for h in members))
            if grown == group:
                return members
            group = grown
    loose = sorted((h for h in hunks if not ids[h.id]), key=lambda h: h.head_lines[0])
    runs: list[list[Hunk]] = []
    for h in loose:
        if runs and h.head_lines[0] - runs[-1][-1].head_lines[1] <= gap + 1:
            runs[-1].append(h)
        else:
            runs.append([h])
    return next(run for run in runs if target in run)


# --------------------------------------------------------------------------
# Audit (hunks)
# --------------------------------------------------------------------------


def is_header(rel: str) -> bool:
    return rel.endswith(HEADER_SUFFIXES)


@dataclass
class FileInfo:
    path: str
    status: str  # M | A | D
    base: Optional[bytes]
    head: Optional[bytes]
    hunks: list[Hunk] = field(default_factory=list)
    units: list[Unit] = field(default_factory=list)
    note: str = ""
    pch: bool = False


@dataclass
class VariantOutcome:
    effect: str
    functions: list[dict[str, Any]]
    data: list[dict[str, Any]]
    errors: str
    units: list[str]


class Auditor:
    def __init__(
        self,
        repo: Repo,
        pool: ShadowPool,
        base_ref: str,
        paths: tuple[str, ...] = DEFAULT_PATHS,
        header_scope: str = "all",
    ):
        self.repo = repo
        self.pool = pool
        self.base_ref = base_ref
        self.paths = paths
        self.header_scope = header_scope
        self.generation = 0
        self.head_ok: dict[str, bool] = {}
        self.head_error: dict[str, str] = {}
        self.head_target: dict[str, Optional[dict]] = {}
        self.base_cache: dict[str, Optional[bytes]] = {}

    # -- files ------------------------------------------------------------

    def base_content(self, rel: str) -> Optional[bytes]:
        if rel not in self.base_cache:
            self.base_cache[rel] = self.repo.show(self.base_ref, rel)
        return self.base_cache[rel]

    def changed_paths(self) -> list[tuple[str, str]]:
        """(status, path) of files differing between REF and repo + overlay."""
        out = self.repo.git(
            "diff", "--name-status", "--no-renames", "--no-color", self.base_ref, "--", *self.paths
        ).stdout.decode()
        found: dict[str, str] = {}
        for line in out.splitlines():
            status, _, rel = line.partition("\t")
            found[rel] = status[:1]
        for rel in self.pool.state:
            if any(rel == p or rel.startswith(p.rstrip("/") + "/") for p in self.paths):
                found.setdefault(rel, "M")
        return [(status, rel) for rel, status in sorted(found.items())]

    def collect(self, files: Optional[list[str]] = None) -> list[FileInfo]:
        wanted = {self.repo.rel(f) or f for f in files} if files is not None else None
        infos = []
        changed_sources = set()
        listed = self.changed_paths()
        for status, rel in listed:
            if not is_header(rel):
                changed_sources.add(rel)
        for status, rel in listed:
            if wanted is not None and rel not in wanted:
                continue
            base = self.base_content(rel)
            head = self.pool.current(rel)
            if base == head:
                continue
            status = "A" if base is None else ("D" if head is None else "M")
            info = FileInfo(rel, status, base, head)
            info.hunks = file_hunks(rel, base, head, self.pool.tmp, self.repo.root)
            info.units = self.units_for(rel, changed_sources, info)
            infos.append(info)
        return infos

    def units_for(self, rel: str, changed_sources: set[str], info: FileInfo) -> list[Unit]:
        if rel in self.repo.pch_headers():
            info.note = "header is part of the precompiled header; not audited"
            info.pch = True
            return []
        units = {u.name: u for u in self.repo.units_including(rel)}
        for u in self.repo.units_by_source.get(rel, []):
            units[u.name] = u
        if is_header(rel):
            for u in self.repo.units_without_deps():
                units.setdefault(u.name, u)  # unknown deps: include conservatively
            if self.header_scope == "changed":
                units = {k: u for k, u in units.items() if u.source in changed_sources}
        if not units:
            info.note = "no translation unit builds or includes this file"
        return sorted(units.values(), key=lambda u: u.name)

    # -- compiling --------------------------------------------------------

    def head_path(self, unit: Unit) -> Path:
        return self.pool.headdir / f"g{self.generation}" / (unit.name.replace("/", "__") + ".o")

    def reset_head(self) -> None:
        """Forget HEAD objects (the overlay changed)."""
        self.generation += 1
        self.head_ok.clear()
        self.head_error.clear()
        self.head_target.clear()

    def ensure_head(self, units: Iterable[Unit]) -> None:
        todo = [u for u in {u.name: u for u in units}.values() if u.name not in self.head_ok]
        items = [(u.name, str(self.head_path(u))) for u in todo]
        for unit, res in zip(todo, self.pool.map("head", items, "HEAD objects")):
            self.head_ok[unit.name] = res["ok"]
            self.head_error[unit.name] = res.get("error", "")
            self.head_target[unit.name] = res.get("target")

    def overrides_for(self, unit: Unit, mapping: dict[str, Optional[bytes]]) -> dict[str, Optional[bytes]]:
        """The part of `mapping` that can reach `unit`: its own source and
        every file that is not some other TU's source (headers, includes)."""
        return {
            rel: content
            for rel, content in mapping.items()
            if rel == unit.source or rel not in self.repo.units_by_source
        }

    def fill_with(self, res: dict[str, Any]) -> dict[str, Any]:
        """Add HEAD's target status (`target_with`) to a variant result."""
        funcs, secs = target_index(self.head_target.get(res["unit"]))
        for fn in res.get("functions", []):
            fn["target_with"] = brief_status(funcs.get(fn["name"]))
        for sec in res.get("data", []):
            sec["target_with"] = secs.get(sec["section"])
        return res

    @staticmethod
    def combine(results: list[dict[str, Any]]) -> VariantOutcome:
        effects = {r["effect"] for r in results}
        errors = "\n".join(f"[{r['unit']}] {r['error']}" for r in results if r.get("error"))
        if "build_break" in effects or "head_break" in effects:
            effect = "build_break"
        elif "code" in effects:
            effect = "code"
        elif "stack_only" in effects:
            effect = "stack_only"
        else:
            effect = "none"
        funcs = [f for r in results for f in r.get("functions", [])]
        data = [d for r in results for d in r.get("data", [])]
        return VariantOutcome(effect, funcs, data, truncate(errors), [r["unit"] for r in results])

    @staticmethod
    def decide(outcome: VariantOutcome) -> tuple[str, str]:
        if outcome.effect == "none":
            return "drop_no_effect", "objects identical without the hunk"
        if outcome.effect == "stack_only":
            return "drop_stack_only", "only the stack frame differs without the hunk"
        if outcome.effect == "build_break":
            return "review", "does not compile without the hunk"
        gains, losses = [], []
        for fn in outcome.functions:
            with_, without = fn["target_with"], fn["target_without"]
            if with_ is None and without is None:
                continue
            rw, ro = sc.status_rank(with_), sc.status_rank(without)
            if rw > ro and fn["class"] in ("code", "only_a", "only_b"):
                gains.append(fn["name"])
            elif rw < ro:
                losses.append(fn["name"])
        for sec in outcome.data:
            w, o = sec["target_with"], sec["target_without"]
            if w is None or o is None:
                continue
            if w > o + 1e-6:
                gains.append(f"[{sec['section']}]")
            elif w < o - 1e-6:
                losses.append(f"[{sec['section']}]")
        if gains and not losses:
            return "keep", "improves " + ", ".join(sorted(set(gains))[:6])
        if not gains:
            reason = "code changes but no function or data section gets closer to the target"
            if losses:
                reason += "; worsens " + ", ".join(sorted(set(losses))[:6])
            return "drop_no_gain", reason
        return "review", (
            "improves " + ", ".join(sorted(set(gains))[:4]) + "; worsens " + ", ".join(sorted(set(losses))[:4])
        )

    # -- the audit --------------------------------------------------------

    def evaluate(self, jobs: list[tuple[str, dict[str, Optional[bytes]], list[Unit]]], label: str) -> dict[str, VariantOutcome]:
        """jobs: (key, overrides, units) -> outcome per key."""
        grouped: dict[str, list[dict]] = {key: [] for key, _, _ in jobs}
        tasks, owners = [], []
        for key, overrides, units in jobs:
            for unit in units:
                if not self.head_ok.get(unit.name):
                    grouped[key].append({"unit": unit.name, "effect": "head_break",
                                         "error": "HEAD does not compile: " + self.head_error.get(unit.name, "")})
                    continue
                tasks.append((unit.name, self.overrides_for(unit, overrides), str(self.head_path(unit))))
                owners.append(key)
        for key, res in zip(owners, self.pool.map("variant", tasks, label)):
            grouped[key].append(self.fill_with(res))
        return {key: self.combine(rs) for key, rs in grouped.items()}

    def audit(self, files: Optional[list[str]] = None) -> dict[str, Any]:
        start = time.time()
        infos = self.collect(files)
        all_units = {u.name: u for info in infos for u in info.units}
        log(f"audit: {sum(len(i.hunks) for i in infos)} hunks in {len(infos)} files, {len(all_units)} TUs")
        self.ensure_head(all_units.values())
        by_file = {info.path: info for info in infos}

        records: dict[str, dict[str, Any]] = {}
        jobs_src, jobs_hdr = [], []
        for info in infos:
            for h in info.hunks:
                rec = self.hunk_record(info, h)
                records[h.id] = rec
                if not info.units:
                    if info.pch:
                        rec.update(effect="unaudited", decision="review", reason=info.note)
                    else:
                        rec.update(effect="none", decision="drop_no_effect", reason=info.note)
                    continue
                variant = revert_hunks(info.head, [h])
                job = (h.id, {info.path: variant}, info.units)
                (jobs_hdr if is_header(info.path) else jobs_src).append(job)
        outcomes = self.evaluate(jobs_src, "source hunks")
        outcomes.update(self.evaluate(jobs_hdr, "header hunks"))
        for key, outcome in outcomes.items():
            decision, reason = self.decide(outcome)
            records[key].update(
                effect=outcome.effect,
                decision=decision,
                reason=reason,
                units=outcome.units,
                functions=outcome.functions,
                data=outcome.data,
                errors=outcome.errors or None,
            )

        self.resolve_build_breaks(infos, records)

        hunks = [records[h.id] for info in infos for h in info.hunks]
        file_rows = []
        for info in infos:
            counts = {d: 0 for d in DECISIONS}
            for h in info.hunks:
                counts[records[h.id]["decision"]] += 1
            file_rows.append(
                {
                    "path": info.path,
                    "kind": "header" if is_header(info.path) else "source",
                    "status": info.status,
                    "sha256": sha256(info.head),
                    "units": [u.name for u in info.units],
                    "note": info.note or None,
                    "hunks": len(info.hunks),
                    "decisions": {k: v for k, v in counts.items() if v},
                }
            )
        by_decision = {d: 0 for d in DECISIONS}
        by_effect = {e: 0 for e in EFFECTS}
        for rec in hunks:
            by_decision[rec["decision"]] += 1
            by_effect[rec["effect"]] = by_effect.get(rec["effect"], 0) + 1
        files_all_drop = sum(
            1 for row in file_rows if row["hunks"] and set(row["decisions"]) <= set(DROP_DECISIONS)
        )
        files_with_keep = sum(1 for row in file_rows if row["decisions"].get("keep"))
        head_status = {}
        for name, unit in sorted(all_units.items()):
            head_status[name] = count_statuses(self.head_target.get(name)) if self.head_ok.get(name) else None
        return {
            "version": 1,
            "tool": "stack_check.py hunks",
            "repo": str(self.repo.root),
            "base": self.base_ref,
            "base_sha": self.repo.rev(self.base_ref),
            "head_sha": self.repo.rev("HEAD"),
            "overlay_files": sorted(self.pool.state),
            "paths": list(self.paths),
            "header_scope": self.header_scope,
            "jobs": self.pool.jobs,
            "stack_frame_policy": game_policy.stack_frame_policy(),
            "files": file_rows,
            "head_units": head_status,
            "hunks": hunks,
            "summary": {
                "hunks": len(hunks),
                "files": len(file_rows),
                "units": len(all_units),
                "by_decision": by_decision,
                "by_effect": by_effect,
                "files_all_drop": files_all_drop,
                "files_with_keep": files_with_keep,
                "compiles": self.pool.compiles,
                "elapsed_s": round(time.time() - start, 1),
            },
        }

    def resolve_build_breaks(self, infos: list[FileInfo], records: dict[str, dict[str, Any]]) -> None:
        """Retry hunks that do not compile alone with neighbours reverted too.

        Per block (function/class/initializer, or a run of out-of-block
        hunks) up to three candidate sets are tried, smallest first: the
        breaking hunks together; the block without hunks that keep on their
        own; the whole block. The first set that compiles decides for every
        breaking member, and `apply` reverts that whole set when it drops.
        """
        pending: list[tuple[FileInfo, list[Hunk], list[list[Hunk]]]] = []
        seen: set[str] = set()
        for info in infos:
            text = (info.head or b"").decode("utf-8", "replace")
            for h in info.hunks:
                if records[h.id]["effect"] != "build_break" or h.id in seen:
                    continue
                block = hunk_group(info.hunks, h, text)
                breaking = [x for x in block if records[x.id]["effect"] == "build_break"]
                seen.update(x.id for x in breaking)
                no_keep = [x for x in block if x in breaking or records[x.id]["decision"] != "keep"]
                candidates: list[list[Hunk]] = []
                for cand in (breaking, no_keep, block):
                    if len(cand) > 1 and all(set(map(id, cand)) != set(map(id, c)) for c in candidates):
                        candidates.append(cand)
                pending.append((info, breaking, candidates))

        def key_of(info: FileInfo, members: list[Hunk]) -> str:
            return f"{info.path}@" + ",".join(str(x.index) for x in members)

        resolved: dict[int, tuple[str, list[Hunk], VariantOutcome]] = {}
        tried: dict[int, list[str]] = {k: [] for k in range(len(pending))}
        stage = 0
        while True:
            jobs, owners = [], []
            for k, (info, _breaking, candidates) in enumerate(pending):
                if k in resolved or stage >= len(candidates):
                    continue
                members = candidates[stage]
                key = key_of(info, members)
                tried[k].append(key)
                jobs.append((key, {info.path: revert_hunks(info.head, members)}, info.units))
                owners.append((k, key, members))
            if not jobs:
                break
            outcomes = self.evaluate(jobs, f"build-break groups (pass {stage + 1})")
            for k, key, members in owners:
                outcome = outcomes[key]
                if outcome.effect != "build_break" or stage == len(pending[k][2]) - 1:
                    resolved[k] = (key, members, outcome)
            stage += 1

        for k, (info, breaking, _candidates) in enumerate(pending):
            if k not in resolved:
                group = {"id": None, "members": [], "effect": "build_break", "decision": "review",
                         "reason": "no larger region to revert", "tried": tried[k]}
            else:
                key, members, outcome = resolved[k]
                decision, reason = self.decide(outcome)
                if outcome.effect == "build_break":
                    reason = "does not compile without its whole block either"
                group = {
                    "id": key,
                    "members": [m.id for m in members],
                    "effect": outcome.effect,
                    "decision": decision,
                    "reason": reason,
                    "tried": tried[k],
                    "functions": outcome.functions,
                    "data": outcome.data,
                    "errors": outcome.errors or None,
                }
            for h in breaking:
                records[h.id]["group"] = group
                records[h.id]["decision"] = group["decision"]
                records[h.id]["reason"] = "group: " + group["reason"]
            if group["decision"] in DROP_DECISIONS:
                for mid in group["members"]:
                    if records[mid]["effect"] != "build_break":
                        records[mid]["dropped_with_group"] = group["id"]

    def hunk_record(self, info: FileInfo, h: Hunk) -> dict[str, Any]:
        return {
            "id": h.id,
            "file": h.file,
            "index": h.index,
            "base": {"start": h.base_start, "count": h.base_count},
            "head": {"start": h.head_start, "count": h.head_count},
            "removed": text_of(h.removed),
            "added": text_of(h.added),
            "effect": None,
            "decision": None,
            "reason": None,
            "units": [u.name for u in info.units],
            "functions": [],
            "data": [],
            "group": None,
            "errors": None,
        }


def audit_summary_lines(audit: dict[str, Any]) -> list[str]:
    s = audit["summary"]
    lines = [
        f"{s['hunks']} hunks in {s['files']} files ({s['units']} TUs, {s['compiles']} compiles, {s['elapsed_s']}s)",
        "decisions: " + ", ".join(f"{k}={v}" for k, v in s["by_decision"].items() if v),
        "effects:   " + ", ".join(f"{k}={v}" for k, v in s["by_effect"].items() if v),
        f"files: {s['files_with_keep']} with keep hunks, {s['files_all_drop']} where every hunk drops",
    ]
    return lines


# --------------------------------------------------------------------------
# Agent comment stripping
# --------------------------------------------------------------------------


def comment_spans(text: str) -> list[tuple[int, int]]:
    """(start, end) offsets of every // and /* */ comment, skipping literals."""
    spans = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            spans.append((i, j))
            i = j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            spans.append((i, j))
            i = j
        elif ch in "\"'":
            j = i + 1
            while j < n and text[j] != ch and text[j] != "\n":
                j += 2 if text[j] == "\\" else 1
            i = j + 1
        else:
            i += 1
    return spans


def strip_agent_comments(content: bytes, added: set[int], keep_blank: bool) -> tuple[bytes, list[dict[str, Any]]]:
    """Remove agent comments that lie entirely on `added` lines (1-based).

    A line left blank by the removal is deleted, or kept empty when
    `keep_blank` (so `__LINE__` never moves). Returns (new content, changes).
    """
    text = content.decode("utf-8", "surrogateescape")
    line_starts = [0] + [m.end() for m in re.finditer("\n", text)]

    def line_of(offset: int) -> int:
        return bisect.bisect_right(line_starts, offset)

    def body_of(start: int, end: int) -> str:
        if text.startswith("/*", start):
            return text[start + 2 : end - 2 if text.endswith("*/", 0, end) else end]
        return text[start + 2 : end]

    # Items: one comment, or a wrapped sentence of whole-line `//` comments
    # (continuation lines start lowercase or are indented further).
    items: list[list[tuple[int, int]]] = []
    prev_line_comment: Optional[tuple[int, int]] = None  # (line, span end)
    for start, end in comment_spans(text):
        line = line_of(start)
        whole_line = text.startswith("//", start) and not text[line_starts[line - 1] : start].strip()
        body = body_of(start, end)
        lead = body[1:] if body.startswith(" ") else body
        continuation = (
            whole_line
            and prev_line_comment is not None
            and prev_line_comment[0] == line - 1
            and (lead[:1].islower() or lead[:1] in (" ", "\t"))
        )
        if continuation:
            items[-1].append((start, end))
        else:
            items.append([(start, end)])
        prev_line_comment = (line, end) if whole_line else None

    removals = []
    for spans in items:
        first, last = line_of(spans[0][0]), line_of(max(spans[-1][0], spans[-1][1] - 1))
        if not all(k in added for k in range(first, last + 1)):
            continue
        if agent_comments.is_agent_comment_text(" ".join(body_of(a, z) for a, z in spans)):
            removals += [(a, z, line_of(a), line_of(max(a, z - 1))) for a, z in spans]
    if not removals:
        return content, []
    pieces, pos = [], 0
    for start, end, _, _ in removals:
        pieces.append(text[pos:start])
        newlines = text.count("\n", start, end)
        pieces.append("\n" * newlines)
        pos = end
    pieces.append(text[pos:])
    new_text = "".join(pieces)
    old_lines = text.split("\n")
    new_lines = new_text.split("\n")
    touched = sorted({k for _, _, a, b in removals for k in range(a, b + 1)})
    changes = []
    drop = set()
    for k in touched:
        old, new = old_lines[k - 1], new_lines[k - 1].rstrip()
        if new.strip():
            new_lines[k - 1] = new
            changes.append({"line": k, "action": "cut", "old": old.strip(), "new": new.strip()})
        elif keep_blank:
            new_lines[k - 1] = ""
            changes.append({"line": k, "action": "blank", "old": old.strip()})
        else:
            drop.add(k - 1)
            changes.append({"line": k, "action": "delete", "old": old.strip()})
    final = "\n".join(line for idx, line in enumerate(new_lines) if idx not in drop)
    return final.encode("utf-8", "surrogateescape"), changes


def added_lines(hunks: list[Hunk]) -> set[int]:
    return {h.head_start + k for h in hunks for k in range(h.head_count)}


class Stripper:
    """Strip agent comments from added lines; verify objects stay identical."""

    def __init__(self, auditor: Auditor):
        self.auditor = auditor
        self.pool = auditor.pool

    def objects_bytes(self, units: list[Unit], overlay_extra: dict[str, Optional[bytes]], label: str) -> dict[str, Optional[str]]:
        """unit -> sha256 of its object (None when it does not compile)."""
        items = [(u.name, self.auditor.overrides_for(u, overlay_extra)) for u in units]
        results = self.pool.map("hash", items, label)
        return {u.name: (r["sha"] if r["ok"] else None) for u, r in zip(units, results)}

    def run(self, files: Optional[list[str]] = None) -> tuple[dict[str, Optional[bytes]], dict[str, Any]]:
        """Returns (new contents by path, report). Does not write the repo."""
        infos = self.auditor.collect(files)
        candidates: dict[str, tuple[FileInfo, set[int]]] = {}
        for info in infos:
            if info.head is None:
                continue
            candidates[info.path] = (info, added_lines(info.hunks))
        stripped: dict[str, bytes] = {}
        changes: dict[str, list] = {}
        for rel, (info, added) in candidates.items():
            new, ch = strip_agent_comments(info.head, added, keep_blank=False)
            if ch:
                stripped[rel] = new
                changes[rel] = ch
        report: dict[str, Any] = {"files": [], "summary": {}}
        if not stripped:
            report["summary"] = {"files": 0, "lines": 0}
            return {}, report
        units = {u.name: u for rel in stripped for u in candidates[rel][0].units}
        before = self.objects_bytes(list(units.values()), {}, "strip: before")
        mode = {rel: "delete" for rel in stripped}

        def verify(current: dict[str, bytes]) -> set[str]:
            after = self.objects_bytes(list(units.values()), dict(current), "strip: after")
            bad_units = {name for name in units if before.get(name) != after.get(name)}
            return {rel for rel in current if any(u.name in bad_units for u in candidates[rel][0].units)}

        suspects = verify(stripped)
        if suspects:
            for rel in suspects:
                info, added = candidates[rel]
                new, ch = strip_agent_comments(info.head, added, keep_blank=True)
                stripped[rel], changes[rel], mode[rel] = new, ch, "blank"
            still = verify(stripped)
            for rel in still:
                del stripped[rel]
                mode[rel] = "skipped"
        for rel in sorted(changes):
            report["files"].append(
                {
                    "path": rel,
                    "mode": mode[rel],
                    "units": [u.name for u in candidates[rel][0].units],
                    "changes": changes[rel],
                }
            )
        report["summary"] = {
            "files": sum(1 for r in report["files"] if r["mode"] != "skipped"),
            "lines": sum(len(r["changes"]) for r in report["files"] if r["mode"] != "skipped"),
            "blank_mode": sorted(r for r, m in mode.items() if m == "blank"),
            "skipped": sorted(r for r, m in mode.items() if m == "skipped"),
            "units_verified": len(units),
        }
        return dict(stripped), report


# --------------------------------------------------------------------------
# Apply
# --------------------------------------------------------------------------


def write_overlay(repo: Repo, overlay: dict[str, Optional[bytes]]) -> None:
    for rel, content in overlay.items():
        p = repo.root / rel
        if content is None:
            p.unlink(missing_ok=True)
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(content)


def select_drops(audit: dict[str, Any], drop: set[str]) -> dict[str, list[int]]:
    """file -> hunk indices to revert."""
    out: dict[str, set[int]] = {}
    index = {rec["id"]: rec for rec in audit["hunks"]}
    for rec in audit["hunks"]:
        if rec["decision"] not in drop:
            continue
        group = rec.get("group")
        members = group["members"] if group else [rec["id"]]
        for mid in members:
            m = index[mid]
            out.setdefault(m["file"], set()).add(m["index"])
    return {k: sorted(v) for k, v in out.items()}


class Applier:
    def __init__(self, auditor: Auditor, drop: set[str], rounds: int, strip: bool, round_out: Optional[str] = None):
        self.auditor = auditor
        self.pool = auditor.pool
        self.repo = auditor.repo
        self.drop = drop
        self.rounds = rounds
        self.strip = strip
        self.round_out = round_out

    def apply_drops(self, audit: dict[str, Any], overlay: dict[str, Optional[bytes]]) -> tuple[dict[str, Optional[bytes]], list[str]]:
        chosen = select_drops(audit, self.drop)
        new = dict(overlay)
        dropped = []
        sha = {row["path"]: row["sha256"] for row in audit["files"]}
        for rel, indices in chosen.items():
            head = self.pool.current(rel)
            if sha.get(rel) and sha256(head) != sha[rel]:
                raise SystemExit(f"{rel}: content changed since the audit (sha mismatch); re-run hunks")
            hunks = file_hunks(rel, self.auditor.base_content(rel), head, self.pool.tmp, self.repo.root)
            picked = [h for h in hunks if h.index in indices]
            new[rel] = revert_hunks(head, picked)
            dropped += [h.id for h in picked]
        return new, dropped

    def units_of(self, rel: str) -> list[Unit]:
        return self.repo.units_including(rel) + self.repo.units_by_source.get(rel, [])

    @staticmethod
    def regressed(outcome: VariantOutcome) -> bool:
        """Did code (not just the stack) get further from the target?

        `target_with` is the pre-round status, `target_without` the new one.
        """
        if outcome.effect == "build_break":
            return True
        for fn in outcome.functions:
            if fn["class"] in ("code", "only_a", "only_b") and sc.status_rank(fn["target_without"]) < sc.status_rank(
                fn["target_with"]
            ):
                return True
        for sec in outcome.data:
            w, o = sec["target_with"], sec["target_without"]
            if w is not None and o is not None and o < w - 1e-6:
                return True
        return False

    def joint_guard(
        self, old: dict[str, Optional[bytes]], new: dict[str, Optional[bytes]], dropped: list[str]
    ) -> tuple[dict[str, Optional[bytes]], list[str], dict[str, Any]]:
        """Catch joint effects of drops that were each harmless alone.

        Every TU fed by a file with drops is compiled before and after the
        round. Where code regresses (a function's non-stack status or a data
        section gets further from the target, or the TU stops compiling), the
        feeding files are restored and their drops re-applied one at a time,
        keeping each only if the TU still does not regress. Headers are only
        restored, not retried.
        """
        files = sorted({d.rsplit("#", 1)[0] for d in dropped})
        unit_map = {u.name: u for rel in files for u in self.units_of(rel)}
        units = list(unit_map.values())
        self.pool.set_state(old)
        self.auditor.reset_head()
        self.auditor.ensure_head(units)
        self.pool.set_state(new)
        outcomes = self.auditor.evaluate([(u.name, {}, [u]) for u in units], "joint check")
        bad_units = sorted(name for name, o in outcomes.items() if self.regressed(o))
        info: dict[str, Any] = {"checked_units": len(units), "regressed_units": bad_units}
        if not bad_units:
            return new, dropped, info
        deps = self.repo.deps()

        def feeds(rel: str, unit: Unit) -> bool:
            return rel == unit.source or rel in deps.get(unit.obj, ())

        bad_files = sorted({rel for rel in files for n in bad_units if feeds(rel, unit_map[n])})
        base = dict(new)
        old_content: dict[str, Optional[bytes]] = {}
        for rel in bad_files:
            old_content[rel] = old[rel] if rel in old else self.pool.repo_file(rel)
            if rel in old:
                base[rel] = old[rel]
            else:
                base.pop(rel, None)
        by_file = {rel: [int(d.rsplit("#", 1)[1]) for d in dropped if d.rsplit("#", 1)[0] == rel] for rel in bad_files}
        hunks_of = {
            rel: {h.index: h for h in file_hunks(rel, self.auditor.base_content(rel), old_content[rel], self.pool.tmp, self.repo.root)}
            for rel in bad_files
        }
        retry = [rel for rel in bad_files if not is_header(rel)]
        accepted: dict[str, list[int]] = {rel: [] for rel in retry}
        self.pool.set_state(base)
        step = 0
        while True:
            jobs = []
            for rel in retry:
                if step < len(by_file[rel]):
                    idx = by_file[rel][step]
                    content = revert_hunks(old_content[rel], [hunks_of[rel][i] for i in accepted[rel] + [idx]])
                    jobs.append((f"{rel}#{idx}", {rel: content}, [u for u in units if feeds(rel, u)]))
            if not jobs:
                break
            for key, outcome in self.auditor.evaluate(jobs, f"joint retry {step + 1}").items():
                rel, idx = key.rsplit("#", 1)
                if not self.regressed(outcome):
                    accepted[rel].append(int(idx))
            step += 1
        final = dict(base)
        for rel in retry:
            if accepted[rel]:
                final[rel] = revert_hunks(old_content[rel], [hunks_of[rel][i] for i in accepted[rel]])
        keep = {d for d in dropped if d.rsplit("#", 1)[0] not in bad_files}
        keep |= {f"{rel}#{i}" for rel in retry for i in accepted[rel]}
        info.update(retried_files=bad_files, restored=[d for d in dropped if d not in keep])
        return final, [d for d in dropped if d in keep], info

    def counts_for(self, units: list[Unit], state: dict[str, Optional[bytes]], label: str) -> dict[str, Optional[dict]]:
        self.pool.set_state(state)
        results = self.pool.map("target", [(u.name, {}) for u in units], label)
        return {u.name: r for u, r in zip(units, results)}

    def run(self, audit: dict[str, Any], dry_run: bool) -> tuple[dict[str, Any], dict[str, Optional[bytes]]]:
        overlay: dict[str, Optional[bytes]] = {}
        report: dict[str, Any] = {"rounds": [], "strip": None}
        current_audit = audit
        all_dropped: list[str] = []
        for rnd in range(1, self.rounds + 1):
            new_overlay, dropped = self.apply_drops(current_audit, overlay)
            changed = {h.rsplit("#", 1)[0] for h in dropped}
            entry: dict[str, Any] = {"round": rnd, "dropped": dropped}
            if dropped:
                new_overlay, dropped, entry["guard"] = self.joint_guard(overlay, new_overlay, dropped)
                entry["dropped"] = dropped
                changed = {h.rsplit("#", 1)[0] for h in dropped}
            overlay = new_overlay
            all_dropped += dropped
            if rnd == 1 and self.strip:
                self.pool.set_state(overlay)
                stripped, strip_report = Stripper(self.auditor).run([row["path"] for row in audit["files"]])
                overlay.update(stripped)
                report["strip"] = strip_report
                changed |= set(stripped)
            report["rounds"].append(entry)
            if not changed:
                break
            # Re-audit the files whose TUs this round touched.
            self.pool.set_state(overlay)
            self.auditor.reset_head()
            touched_units = {u.name for rel in changed for u in self.units_of(rel)}
            files = [
                row["path"] for row in audit["files"]
                if row["path"] in changed or set(row["units"]) & touched_units
            ]
            if not files:
                break
            log(f"apply: round {rnd} dropped {len(dropped)} hunks; re-auditing {len(files)} files")
            current_audit = self.auditor.audit(files)
            entry["reaudit"] = current_audit["summary"]
            if self.round_out:
                path = Path(f"{self.round_out}.round{rnd}.json")
                path.write_text(json.dumps(current_audit, indent=1) + "\n")
                entry["reaudit_file"] = str(path)
            if not select_drops(current_audit, self.drop):
                break
        report["dropped"] = all_dropped
        report["final_audit"] = current_audit
        report["verify"] = self.verify(audit, overlay)
        if not dry_run:
            write_overlay(self.repo, overlay)
        report["written"] = not dry_run
        report["files_changed"] = sorted(overlay)
        return report, overlay

    def verify(self, audit: dict[str, Any], overlay: dict[str, Optional[bytes]]) -> dict[str, Any]:
        units: dict[str, Unit] = {}
        file_units: dict[str, list[str]] = {}
        for row in audit["files"]:
            file_units[row["path"]] = row["units"]
            for name in row["units"]:
                units[name] = self.repo.units[name]
        base_paths = self.repo.git(
            "diff", "--name-only", "--no-renames", self.auditor.base_ref, "--", *CLONE_DIRS
        ).stdout.decode().split()
        base_state = {rel: self.auditor.base_content(rel) for rel in base_paths}
        for rel in overlay:
            base_state.setdefault(rel, self.auditor.base_content(rel))
        unit_list = sorted(units.values(), key=lambda u: u.name)
        state = {
            "base": self.counts_for(unit_list, base_state, "verify base"),
            "head": self.counts_for(unit_list, {}, "verify HEAD"),
            "final": self.counts_for(unit_list, dict(overlay), "verify final"),
        }
        totals = {k: {"exact": 0, "stack_only": 0, "mismatch": 0, "missing": 0, "unbuilt": 0} for k in state}
        per_unit = {}
        for name in units:
            row = {}
            for key in state:
                cls = state[key].get(name)
                counts = count_statuses(cls) if cls else None
                row[key] = counts
                if counts is None:
                    totals[key]["unbuilt"] += 1
                else:
                    for k, v in counts.items():
                        totals[key][k] += v
            per_unit[name] = row
        per_file = []
        for row in audit["files"]:
            if row["kind"] != "source":
                continue
            entry = {"file": row["path"]}
            for key in state:
                agg = {"exact": 0, "stack_only": 0, "mismatch": 0, "missing": 0}
                for name in row["units"]:
                    for k, v in (per_unit[name][key] or {}).items():
                        agg[k] += v
                entry[key] = agg
            per_file.append(entry)
        regressions, worse_than_head = [], []
        for name in units:
            base_f, _ = target_index(state["base"].get(name))
            head_f, _ = target_index(state["head"].get(name))
            final_f, _ = target_index(state["final"].get(name))
            for fname, entry in final_f.items():
                b, h = base_f.get(fname), head_f.get(fname)
                if b and b["status"] == "exact" and entry["status"] != "exact":
                    regressions.append({"unit": name, "name": fname, "base": brief_status(b), "final": brief_status(entry)})
                if h and sc.status_rank(entry) < sc.status_rank(h):
                    worse_than_head.append({"unit": name, "name": fname, "head": brief_status(h), "final": brief_status(entry)})
            for fname, b in base_f.items():
                if b["status"] == "exact" and fname not in final_f:
                    regressions.append({"unit": name, "name": fname, "base": brief_status(b), "final": None})
        return {
            "totals": totals,
            "files": per_file,
            "regressions_vs_base": regressions,
            "worse_than_head": worse_than_head,
            "ok": not regressions,
        }


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def emit(args: argparse.Namespace, payload: dict[str, Any], human: list[str]) -> None:
    if getattr(args, "json", False):
        json.dump(payload, sys.stdout, indent=1)
        sys.stdout.write("\n")
    else:
        print("\n".join(human))


def cmd_objects(args: argparse.Namespace) -> int:
    a = sc.ElfObject.from_path(args.a)
    b = sc.ElfObject.from_path(args.b)
    diff = sc.compare_objects(a, b)
    annotate_first_diffs(diff, a, b, find_objdump(Path(args.a).resolve().parent, args.objdump))
    payload = diff.to_json()
    human = []
    for fn in diff.functions:
        if fn.cls == "identical":
            continue
        line = f"{fn.cls:<10} {fn.name}"
        if fn.frame_a != fn.frame_b:
            line += f"  frame {fn.frame_a} vs {fn.frame_b}"
        if fn.first_diff:
            line += f"  @+{fn.first_diff['offset']:#x}: {fn.first_diff.get('a')} | {fn.first_diff.get('b')}"
        human.append(line)
    s = diff.summary()
    human.append(
        f"effect={diff.effect} data={diff.data} "
        + " ".join(f"{k}={v}" for k, v in s.items() if v)
    )
    emit(args, payload, human)
    return 0


def cmd_target(args: argparse.Namespace) -> int:
    repo = Repo(args.repo, args.version)
    unit = repo.unit(args.unit)
    compiled = Path(args.object) if args.object else repo.root / unit.obj
    if not compiled.is_file():
        raise SystemExit(f"{compiled}: missing (build it first)")
    classified = TargetOracle(repo).classify(compiled, unit)
    if classified is None:
        raise SystemExit(f"objdiff failed or no target object for {unit.name}")
    funcs = []
    for entry in classified["functions"]:
        funcs.append(
            {
                "name": entry["name"],
                "status": entry["status"],
                "match_percent": entry["match_percent"],
                "frame_compiled": entry["frame_compiled"],
                "frame_target": entry["frame_target"],
                "first_diff": entry["first_diff"],
            }
        )
    payload = {
        "unit": unit.name,
        "compiled": str(compiled),
        "target": unit.target,
        "functions": funcs,
        "sections": classified["sections"],
        "summary": count_statuses(classified),
    }
    human = [
        f"{f['status']:<10} {f['match_percent']:7.2f}%  frame {f['frame_compiled']} vs {f['frame_target']}  {f['name']}"
        for f in funcs
        if f["status"] != "exact"
    ]
    human.append(f"{unit.name}: " + " ".join(f"{k}={v}" for k, v in payload["summary"].items()))
    emit(args, payload, human)
    return 0


def make_auditor(args: argparse.Namespace, repo: Repo, header_scope: str, paths: tuple[str, ...], base: str) -> Auditor:
    pool = ShadowPool(repo, args.jobs, args.tmp)
    return Auditor(repo, pool, base, paths, header_scope)


def cmd_hunks(args: argparse.Namespace) -> int:
    repo = Repo(args.repo, args.version)
    auditor = make_auditor(args, repo, args.header_scope, tuple(args.paths), args.base)
    try:
        audit = auditor.audit(args.files)
    finally:
        auditor.pool.close()
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(audit, indent=1) + "\n")
    human = audit_summary_lines(audit)
    if args.out:
        human.append(f"wrote {args.out}")
    if args.json:
        json.dump(audit, sys.stdout, indent=1)
        sys.stdout.write("\n")
    else:
        print("\n".join(human))
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    audit = json.loads(Path(args.audit).read_text())
    repo = Repo(args.repo, args.version)
    if Path(audit["repo"]).resolve() != repo.root and not args.force:
        log(f"note: audit was made in {audit['repo']}; applying to {repo.root}")
    drop = {d.strip() for d in args.drop.split(",") if d.strip()}
    unknown = drop - set(DECISIONS)
    if unknown:
        raise SystemExit(f"unknown decision(s): {', '.join(sorted(unknown))}")
    auditor = make_auditor(args, repo, audit.get("header_scope", "all"), tuple(audit.get("paths", DEFAULT_PATHS)), audit["base"])
    try:
        round_out = str(Path(args.out).with_suffix("")) if args.out else None
        report, _overlay = Applier(auditor, drop, args.rounds, args.strip_comments, round_out).run(audit, args.dry_run)
    finally:
        auditor.pool.close()
    if args.out:
        Path(args.out).write_text(json.dumps(report["final_audit"], indent=1) + "\n")
    verify = report["verify"]
    human = []
    for rnd in report["rounds"]:
        line = f"round {rnd['round']}: dropped {len(rnd['dropped'])} hunks"
        guard = rnd.get("guard") or {}
        if guard.get("restored"):
            line += (f"; joint-effect guard kept {len(guard['restored'])} hunks in "
                     f"{len(guard['retried_files'])} files ({len(guard['regressed_units'])} TUs regressed together)")
        human.append(line)
    if report.get("strip"):
        s = report["strip"]["summary"]
        human.append(f"strip-comments: {s.get('lines', 0)} lines in {s.get('files', 0)} files")
    human.append(f"{'file':<48} {'base':>14} {'head':>14} {'final':>14}   (exact/stack_only/mismatch)")
    for row in verify["files"]:
        cells = [f"{row[k]['exact']}/{row[k]['stack_only']}/{row[k]['mismatch']}" for k in ("base", "head", "final")]
        human.append(f"{row['file'][:48]:<48} {cells[0]:>14} {cells[1]:>14} {cells[2]:>14}")
    t = verify["totals"]
    human.append(
        "total: "
        + "  ".join(f"{k} {t[k]['exact']}/{t[k]['stack_only']}/{t[k]['mismatch']}" for k in ("base", "head", "final"))
    )
    human.append(f"regressions vs base: {len(verify['regressions_vs_base'])}; worse than HEAD: {len(verify['worse_than_head'])}")
    human.append("written to repo" if report["written"] else "dry run: repo untouched")
    payload = {k: v for k, v in report.items() if k != "final_audit"}
    payload["final_summary"] = report["final_audit"]["summary"]
    emit(args, payload, human)
    return 0 if verify["ok"] else 1


def cmd_strip(args: argparse.Namespace) -> int:
    repo = Repo(args.repo, args.version)
    auditor = make_auditor(args, repo, args.header_scope, tuple(args.paths), args.base)
    try:
        stripped, report = Stripper(auditor).run(args.files)
    finally:
        auditor.pool.close()
    if not args.dry_run:
        write_overlay(repo, stripped)
    report["written"] = not args.dry_run
    human = []
    for row in report["files"]:
        human.append(f"{row['mode']:<8} {len(row['changes']):3} lines  {row['path']}")
    s = report["summary"]
    human.append(
        f"stripped {s.get('lines', 0)} lines in {s.get('files', 0)} files; "
        f"{len(s.get('blank_mode', []))} kept as blank lines, {len(s.get('skipped', []))} skipped; "
        + ("written" if not args.dry_run else "dry run")
    )
    emit(args, report, human)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("objects", help="classify every function of two objects")
    p.add_argument("a")
    p.add_argument("b")
    p.add_argument("--objdump")
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_objects)

    def repo_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--repo", required=True)
        p.add_argument("--version")
        p.add_argument("--json", action="store_true")

    def pool_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
        p.add_argument("--tmp", help="directory for shadow roots (same volume as repo for clones)")

    p = sub.add_parser("target", help="compiled object vs target object")
    repo_args(p)
    p.add_argument("--unit", required=True)
    p.add_argument("--object", help="compiled object to use instead of build/<ver>/src/<unit>.o")
    p.set_defaults(func=cmd_target)

    p = sub.add_parser("hunks", help="leave-one-out audit of diff hunks")
    repo_args(p)
    pool_args(p)
    p.add_argument("--base", required=True)
    p.add_argument("--files", nargs="*")
    p.add_argument("--paths", nargs="*", default=list(DEFAULT_PATHS))
    p.add_argument("--header-scope", choices=("changed", "all"), default="all")
    p.add_argument("--out")
    p.set_defaults(func=cmd_hunks)

    p = sub.add_parser("apply", help="revert chosen hunks, re-audit, verify")
    repo_args(p)
    pool_args(p)
    p.add_argument("--audit", required=True)
    p.add_argument("--drop", default=",".join(DROP_DECISIONS))
    p.add_argument("--strip-comments", action="store_true")
    p.add_argument("--rounds", type=int, default=3)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--force", action="store_true")
    p.add_argument("--out", help="write the last round's audit here")
    p.set_defaults(func=cmd_apply)

    p = sub.add_parser("strip-comments", help="remove agent comments from added lines")
    repo_args(p)
    pool_args(p)
    p.add_argument("--base", required=True)
    p.add_argument("--files", nargs="*")
    p.add_argument("--paths", nargs="*", default=list(DEFAULT_PATHS))
    p.add_argument("--header-scope", choices=("changed", "all"), default="all")
    p.add_argument("--dry-run", action="store_true")
    p.set_defaults(func=cmd_strip)
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
