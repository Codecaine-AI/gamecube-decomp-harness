#!/usr/bin/env python3
"""Steering gate: revert behaviour-identical source edits, credit what survives.

A steering edit changes the source form but not the program (a single-use
temp, an accessor swap, if/ternary, operand order, `int`/`s32`). This tool
answers, per edit group, two separate questions (objectives/sms-real-codegen
plan sections 0-2):

1. Is the group behaviour-identical? Reverting it keeps the unit compiling
   under clang and every function/global fingerprint (ir_oracle.py) and the
   data definition order equal to the candidate's -> *removable*.
2. Is a retained group a real fix? Only with positive evidence: a real shape
   (steering_shapes.py) and no steering shape or codegen directive -> *real*;
   anything else -> *unresolved*.

Then MWCC: S* = base + retained groups is rebuilt and compared with the
candidate per function (stack_compare.compare_function). A function passes
only with complete analysis, nothing unresolved, and S* code identical to
the candidate's.

Subcommands (all take --json; exit 0 = analysis produced, 2 = tool failure):

  edits --repo R --base-ref REV [--paths src include libs] [--overlay-dir D]
      Changed files (texts), edits_hash, generated include manifest, unit
      compile flags, header -> including units (ninja deps).
  reduce --oracle-repo H --input EDITS.json [--cache-dir D]
         [--budget-seconds 120] [--max-groups 64] [--jobs 3]
      Host side: materialize base_rev from H (`git archive`) into the cache,
      write the generated includes, verify tree id and hashes, then reduce.
  mwcc --repo R --base-ref REV --edits-hash X --revert-edits e1,e2,...
       [--functions F,...] [--attribute REDUCE.json] [--jobs N<=3]
      Sandbox side: recompute edits (refuse on hash mismatch), build base,
      candidate and S* objects in shadow roots for every touched unit and
      record per-unit coverage. Considered functions: every function whose
      object code differs between base and candidate (added and removed ones
      included) plus --functions. With --attribute (the reduce report) it
      also runs attribution, map-call relocation evidence and data-order
      evidence, exactly as `check` does.
  decide --reduce R.json --mwcc M.json [--evidence-repo H] [--approvals F]
         [--lessons F]
      Plan section 1 decision rules, audit labels and probes. Any touched
      unit without a full build + comparison makes the attempt unresolved.
  check --repo R --base-ref REV [--oracle-repo H] [--functions ...]
      edits + reduce + mwcc + decide in one process.
  apply --report CHECK.json [--dry-run] [--only-paths F ...]
      Write S* (line-preserving) into the repo (backfill only). --only-paths
      limits the writes to those files (the edits_hash check still covers
      the whole report).
  unused-test --repo R [--base-ref REV] [--overlay-dir D] --file F --function QNAME
      The UNUSED stub test for one function: C' = the candidate with the
      body stubbed (signature kept); dead (no target function changes),
      inlined (callers change, listed) or inconclusive (C' does not build).
      `mwcc` runs it for every reconstructed UNUSED function of a touched
      unit; `decide` reports `unused_checks` and `violations`.
  fingerprint --repo R --unit U [--source-file F]
      Debug: one unit's IR fingerprints.

The repo is never written except by `apply`. Variants compile in shadow
roots (stack_check.make_shadow_root) and the IR oracle reads overlays
through a clang VFS overlay on top of a cached base_rev tree.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable, Optional, Sequence

TOOLS = Path(__file__).resolve().parent
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import game_policy  # noqa: E402
import ir_oracle  # noqa: E402
import stack_compare as sc  # noqa: E402
import steering_approvals as sa  # noqa: E402
import steering_edits as se  # noqa: E402

try:  # owned by the lint slice; the gate degrades to 'other' (unresolved) without it
    import steering_shapes  # noqa: E402
except Exception:  # pragma: no cover - only while the module is missing
    steering_shapes = None  # type: ignore[assignment]

TOOL = "steering_check"
VERSION = 1
DEFAULT_PATHS = ("src", "include", "libs")
HEADER_UNIT_CAP = 96  # consumers of one changed header; beyond it -> incomplete. The time budget is the real limit.
ATTRIBUTION_CAP = 12
GENERATED_TEXT_LIMIT = 256 * 1024
REPO_TOKEN = "${REPO}"
MAX_JOBS = 3
DEFAULT_BUDGET = 120.0
DEFAULT_MAX_GROUPS = 256  # the time budget is the real limit
TOUCH_CAP = 48
# A unit's build counts as done: built, no source in that variant, or S* equal to the candidate's inputs.
BUILT_STATES = ("ok", "absent", "same_as_candidate")  # add-back builds per unit for removable-group function attribution
STEERING = tuple(steering_shapes.STEERING_SHAPES) if steering_shapes else (
    "temp_alias", "accessor_swap", "ternary_if", "operand_order", "statement_permutation",
    "decl_reorder", "type_spelling", "float_form", "compound_assign_split", "bool_form")
DIRECTIVES = tuple(steering_shapes.DIRECTIVE_SHAPES) if steering_shapes else ("codegen_directive",)
CALL_SHAPES = ("call_added", "callee_change")
MOVE_SHAPES = ("decl_reorder", "statement_permutation")


class ToolFailure(Exception):
    """Exit 2: the tool could not produce an analysis."""


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def _cpu_quota(quota: str, period: str) -> Optional[int]:
    """ceil(quota/period) CPUs; None when unlimited (v2 "max", v1 -1) or malformed."""
    try:
        q, per = int(quota), int(period)
    except ValueError:
        return None
    return -(-q // per) if q > 0 and per > 0 else None


def _cgroup_dirs(base: Path, rel: str) -> list[Path]:
    """`base/rel` and each ancestor up to `base` (a host path not visible in a container
    namespace simply does not exist, leaving the mount root)."""
    parts = [x for x in rel.strip("/").split("/") if x and x != ".."]
    return [base.joinpath(*parts[:i]) for i in range(len(parts), -1, -1)]


def cgroup_cpu_limit(root: Path = Path("/sys/fs/cgroup"),
                     proc_cgroup: Path = Path("/proc/self/cgroup")) -> Optional[int]:
    """Whole CPUs this process's cgroup may use: the smallest finite quota on its cgroup
    or any ancestor (cgroup v2 `cpu.max`, else v1 `cfs_quota_us`/`cfs_period_us`),
    rounded up; None when unlimited or unreadable."""
    v2_path = v1_path = "/"
    try:
        for line in proc_cgroup.read_text().splitlines():
            hid, controllers, path = line.split(":", 2)
            if hid == "0" and not controllers:
                v2_path = path
            elif "cpu" in controllers.split(","):
                v1_path = path
    except (OSError, ValueError):
        pass
    v2 = False
    limits: list[Optional[int]] = []
    for d in _cgroup_dirs(root, v2_path):
        try:
            parts = (d / "cpu.max").read_text().split()
        except OSError:
            continue
        v2 = True
        if len(parts) == 2:
            limits.append(_cpu_quota(*parts))
    if not v2:
        for mount in ("cpu", "cpu,cpuacct", "cpuacct,cpu", ""):
            for d in _cgroup_dirs(root / mount if mount else root, v1_path):
                try:
                    limits.append(_cpu_quota((d / "cpu.cfs_quota_us").read_text().strip(),
                                             (d / "cpu.cfs_period_us").read_text().strip()))
                except OSError:
                    continue
    finite = [n for n in limits if n is not None]
    return min(finite) if finite else None


def clamp_jobs(jobs: int) -> int:
    """Parallel compiles: at most MAX_JOBS and at most the cgroup's CPU quota, at least 1."""
    return max(1, min(jobs, MAX_JOBS, cgroup_cpu_limit() or MAX_JOBS))


def sha256_bytes(data: Optional[bytes]) -> Optional[str]:
    return None if data is None else hashlib.sha256(data).hexdigest()


def sha256_json(obj: Any) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def harness_root() -> Path:
    return TOOLS.parents[4]


def default_lessons_path() -> Optional[Path]:
    return _data_path("ORCH_STEERING_LESSONS", "lessons.jsonl")


def default_approvals_path() -> Optional[Path]:
    return _data_path("ORCH_STEERING_APPROVALS", "evidence_approvals.jsonl")


def _data_path(env: str, name: str) -> Optional[Path]:
    explicit = os.environ.get(env)
    if explicit:
        return Path(explicit)
    rel = Path("knowledge/sources/injectable/steering_lessons") / name
    game_dir = os.environ.get("ORCH_GAME_DIR")
    for cand in ([Path(game_dir) / rel] if game_dir else []) + [harness_root() / "games/sms" / rel]:
        if cand.is_file():
            return cand
    return None


def read_jsonl(path: Optional[Path]) -> list[dict]:
    if path is None or not Path(path).is_file():
        return []
    out = []
    for line in Path(path).read_text(errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if isinstance(row, dict):
            out.append(row)
    return out


def default_cache_dir() -> Path:
    explicit = os.environ.get("ORCH_STEERING_CACHE")
    if explicit:
        return Path(explicit)
    state = os.environ.get("ORCH_GAME_STATE_DIR")
    if state:
        return Path(state) / "steering-cache"
    return Path(tempfile.gettempdir()) / "steering-check-cache"


# --------------------------------------------------------------------------
# Git helpers
# --------------------------------------------------------------------------


def git(repo: Path | str, *args: str, check: bool = True, input: Optional[bytes] = None) -> subprocess.CompletedProcess:
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, input=input)
    if check and result.returncode != 0:
        raise ToolFailure(f"git {' '.join(args)} failed: {result.stderr.decode('utf-8', 'replace').strip()[:400]}")
    return result


def rev_parse(repo: Path | str, ref: str) -> Optional[str]:
    result = git(repo, "rev-parse", "--verify", "--quiet", ref, check=False)
    return result.stdout.decode().strip() if result.returncode == 0 else None


def git_show(repo: Path | str, rev: str, rel: str) -> Optional[bytes]:
    result = git(repo, "show", f"{rev}:{rel}", check=False)
    return result.stdout if result.returncode == 0 else None


def under(rel: str, paths: Sequence[str]) -> bool:
    return any(rel == p.rstrip("/") or rel.startswith(p.rstrip("/") + "/") for p in paths)


def read_overlay(overlay_dir: Optional[str | Path]) -> dict[str, bytes]:
    if not overlay_dir:
        return {}
    root = Path(overlay_dir)
    out = {}
    for p in sorted(root.rglob("*")):
        if p.is_file():
            out[p.relative_to(root).as_posix()] = p.read_bytes()
    return out


def issue(category: str, *, units: Iterable[str] = (), groups: Iterable[str] = (), files: Iterable[str] = (),
          detail: str = "") -> dict:
    """One structured reason (reduce `incomplete_details`, decide `attempt_issues`)."""
    return {"category": category, "units": sorted(set(units)), "groups": list(groups), "files": sorted(set(files)),
            "detail": detail}


def collect_files(repo: Path, base_rev: str, paths: Sequence[str], overlay_dir: Optional[str | Path] = None) -> list[dict]:
    """Changed files: base text at base_rev vs working tree (+ overlay dir)."""
    overlay = read_overlay(overlay_dir)
    listed = set()
    out = git(repo, "diff", "--name-only", "--no-renames", "--no-color", base_rev, "--", *paths).stdout.decode()
    listed |= {line for line in out.splitlines() if line}
    out = git(repo, "ls-files", "--others", "--exclude-standard", "--", *paths).stdout.decode()
    listed |= {line for line in out.splitlines() if line}
    listed |= {rel for rel in overlay if under(rel, paths)}
    files = []
    for rel in sorted(listed):
        base = git_show(repo, base_rev, rel)
        if rel in overlay:
            cand = overlay[rel]
        else:
            p = repo / rel
            cand = p.read_bytes() if p.is_file() else None
        if base == cand:
            continue
        files.append({
            "path": rel,
            "base_exists": base is not None,
            "cand_exists": cand is not None,
            "base_text": se.decode(base) if base is not None else None,
            "cand_text": se.decode(cand) if cand is not None else None,
        })
    return files


# --------------------------------------------------------------------------
# edits (sandbox side)
# --------------------------------------------------------------------------


def _compile_entries(repo: Path) -> dict[str, dict]:
    try:
        entries = json.loads((repo / "compile_commands.json").read_text())
    except (OSError, ValueError):
        return {}
    out = {}
    for e in entries:
        f = Path(e.get("file", ""))
        if not f.is_absolute():
            f = Path(e.get("directory") or repo) / f
        try:
            rel = Path(os.path.realpath(f)).relative_to(Path(os.path.realpath(repo))).as_posix()
        except ValueError:
            continue
        out[rel] = e
    return out


def _tokenize_flags(entry: dict, repo: Path) -> list[str]:
    import shlex

    raw = entry.get("arguments") or shlex.split(entry.get("command", ""))
    roots = sorted({str(repo), os.path.realpath(repo)}, key=len, reverse=True)
    out = []
    for a in raw:
        for r in roots:
            a = a.replace(r, REPO_TOKEN)
        out.append(a)
    return out


def generated_manifest(repo: Path, version: str) -> dict:
    root = f"build/{version}/include"
    files = []
    base = repo / root
    if base.is_dir():
        for p in sorted(base.rglob("*")):
            if not p.is_file():
                continue
            data = p.read_bytes()
            text = se.decode(data) if len(data) <= GENERATED_TEXT_LIMIT and b"\0" not in data else None
            files.append({"path": p.relative_to(repo).as_posix(), "sha256": sha256_bytes(data), "text": text})
    return {"root": root, "files": files}


def build_edits(repo_path: str | Path, base_ref: str, paths: Sequence[str] = DEFAULT_PATHS,
                overlay_dir: Optional[str | Path] = None, version: Optional[str] = None,
                unit_resolver: Optional[Callable[[list[dict]], tuple[str, list[dict], dict]]] = None) -> dict:
    """The `edits` payload. `unit_resolver(files) -> (version, units, header_units)`
    defaults to the repo's build.ninja / ninja deps (stack_check.Repo)."""
    repo = Path(repo_path).resolve()
    base_rev = rev_parse(repo, f"{base_ref}^{{commit}}")
    if base_rev is None:
        raise ToolFailure(f"{base_ref}: unknown revision in {repo}")
    files = collect_files(repo, base_rev, paths, overlay_dir)
    if unit_resolver is None:
        unit_resolver = lambda fs: resolve_units(repo, fs, version)  # noqa: E731
    game_version, units, header_units = unit_resolver(files)
    return {
        "tool": TOOL,
        "version": VERSION,
        "repo": str(repo),
        "game_version": game_version,
        "base_rev": base_rev,
        "head_rev": rev_parse(repo, "HEAD"),
        "base_tree": rev_parse(repo, f"{base_rev}^{{tree}}"),
        "paths": list(paths),
        "overlay": bool(overlay_dir),
        "edits_hash": se.edits_hash(base_rev, files),
        "no_changes": not files,
        "files": files,
        "generated": generated_manifest(repo, game_version),
        "units": units,
        "header_units": header_units,
    }


def _repo(repo: Path, version: Optional[str] = None):
    import stack_check

    return stack_check.Repo(repo, version)


def units_for_paths(rp, paths: Iterable[str]) -> tuple[dict[str, list], dict[str, list[str]]]:
    """path -> units (Unit objects), header path -> unit names (uncapped)."""
    by_path: dict[str, list] = {}
    header_units: dict[str, list[str]] = {}
    for rel in paths:
        if se.is_source(rel) and rel in rp.units_by_source:
            by_path[rel] = list(rp.units_by_source[rel])
            continue
        units = rp.units_including(rel)
        by_path[rel] = units
        header_units[rel] = [u.name for u in units]
    return by_path, header_units


def resolve_units(repo: Path, files: list[dict], version: Optional[str]) -> tuple[str, list[dict], dict]:
    rp = _repo(repo, version)
    by_path, header_units = units_for_paths(rp, [f["path"] for f in files])
    entries = _compile_entries(repo)
    seen: dict[str, dict] = {}
    for rel, units in by_path.items():
        if rel in header_units and len(units) > HEADER_UNIT_CAP:
            continue  # reduce reports the cap; flags of 25+ units are not needed
        for u in units:
            if u.name in seen:
                continue
            entry = entries.get(u.source) or ir_oracle.template_entry(repo, u.source)
            seen[u.name] = {
                "unit": u.name,
                "source": u.source,
                "object": u.obj,
                "target": u.target,
                "flags": _tokenize_flags(entry, repo) if entry else None,
            }
    return rp.version, sorted(seen.values(), key=lambda u: u["unit"]), header_units


# --------------------------------------------------------------------------
# IR oracle context (host reconstruction of base_rev)
# --------------------------------------------------------------------------


@dataclass
class UnitOracle:
    ok: bool
    fps: dict[str, str] = field(default_factory=dict)
    order: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    unsupported: dict[str, str] = field(default_factory=dict)


class OracleContext:
    """Compiles units of one materialized tree with overlay texts (VFS)."""

    def __init__(self, tree: Path, units: dict[str, dict], gen_root: Optional[str] = None,
                 gen_dir: Optional[Path] = None, clang: Optional[str] = None):
        self.tree = Path(os.path.realpath(tree))
        self.units = units
        self.clang = clang or ir_oracle.find_clang()
        self.gen_root = gen_root
        self.gen_dir = Path(os.path.realpath(gen_dir)) if gen_dir else None
        self._argv: dict[str, Optional[list[str]]] = {}
        self._memo: dict[tuple, UnitOracle] = {}
        self._lock = threading.Lock()
        self.compiles = 0

    def close(self) -> None:
        pass

    def _rebase(self, flags: list[str]) -> list[str]:
        out = []
        tree = str(self.tree)
        for a in flags:
            a = a.replace(REPO_TOKEN, tree)
            if self.gen_root and self.gen_dir:
                gen_abs = str(self.gen_dir / self.gen_root)
                for prefix in (tree + "/" + self.gen_root, self.gen_root):
                    for opt in ("-I", "-iquote", "-isystem", "-include", ""):
                        head = opt + prefix
                        if a == head or a.startswith(head + "/"):
                            a = opt + gen_abs + a[len(head):]
                            break
                    else:
                        continue
                    break
            out.append(a)
        return out

    def argv(self, unit: str) -> Optional[list[str]]:
        if unit not in self._argv:
            u = self.units.get(unit)
            if not u or not u.get("flags") or not self.clang:
                self._argv[unit] = None
            else:
                try:
                    self._argv[unit] = ir_oracle.oracle_argv(self.tree, u["source"], "-", clang=self.clang,
                                                             flags=self._rebase(list(u["flags"])))
                except (LookupError, FileNotFoundError):
                    self._argv[unit] = None
        return self._argv[unit]

    def compile(self, unit: str, overrides: dict[str, Optional[str]], timeout: int = 120) -> UnitOracle:
        """Fingerprints of `unit` with `overrides` (repo-relative path -> text;
        None = file absent, which the tree already reflects for new files)."""
        live = {rel: text for rel, text in overrides.items() if text is not None}
        key = (unit, tuple(sorted((rel, se.sha256_text(t)) for rel, t in live.items())))
        with self._lock:
            hit = self._memo.get(key)
        if hit is not None:
            return hit
        result = self._compile(unit, live, timeout)
        with self._lock:
            self._memo[key] = result
            self.compiles += 1
        return result

    def _compile(self, unit: str, live: dict[str, str], timeout: int) -> UnitOracle:
        argv = self.argv(unit)
        if argv is None:
            why = "clang not found" if not self.clang else f"{unit}: no compile flags"
            return UnitOracle(False, errors=[why])
        # Byte-exact overlay content (surrogate-escaped text back to bytes).
        files = {self.tree / rel: se.encode(text) for rel, text in live.items()}
        res = ir_oracle.run_clang(argv, self.tree, files, timeout)
        if not res.ok:
            return UnitOracle(False, errors=res.errors[:12])
        try:
            module = ir_oracle.parse_ir(res.ir_text)
            fps = ir_oracle.fingerprint(module)
            order = ir_oracle.data_order(module)
        except Exception as e:  # parser gap: report, never crash the gate
            return UnitOracle(False, errors=[f"ir_oracle parse failed: {type(e).__name__}: {e}"])
        return UnitOracle(True, fps, order, [], ir_oracle.unsupported_functions(res.ir_text))


def _archive_tree(oracle_repo: Path, base_rev: str, dest: Path) -> None:
    if (dest / ".complete").is_file():
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    names = git(oracle_repo, "ls-tree", "--name-only", base_rev).stdout.decode().split()
    wanted = [p for p in ("src", "include", "libs") if p in names]
    tmp = Path(tempfile.mkdtemp(prefix="tree-", dir=dest.parent))
    try:
        archive = subprocess.run(["git", "-C", str(oracle_repo), "archive", "--format=tar", base_rev, *wanted],
                                 capture_output=True)
        if archive.returncode != 0:
            raise ToolFailure(f"git archive failed: {archive.stderr.decode('utf-8', 'replace')[:300]}")
        tar = subprocess.run(["tar", "-x", "-f", "-", "-C", str(tmp)], input=archive.stdout, capture_output=True)
        if tar.returncode != 0:
            raise ToolFailure(f"tar failed: {tar.stderr.decode('utf-8', 'replace')[:300]}")
        (tmp / ".complete").write_text(base_rev + "\n")
        try:
            os.rename(tmp, dest)
        except OSError:
            if not (dest / ".complete").is_file():
                raise
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _write_generated(gen: dict, dest: Path) -> tuple[bool, str]:
    """Write the generated include manifest under `dest`; verify the hashes."""
    files = gen.get("files") or []
    bad = []
    if not (dest / ".complete").is_file():
        dest.parent.mkdir(parents=True, exist_ok=True)
        tmp = Path(tempfile.mkdtemp(prefix="gen-", dir=dest.parent))
        try:
            for f in files:
                if f.get("text") is None:
                    continue  # binary (e.g. MWCC .mch): clang never reads it
                p = tmp / f["path"]
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(se.encode(f["text"]))
            (tmp / ".complete").write_text("ok\n")
            try:
                os.rename(tmp, dest)
            except OSError:
                if not (dest / ".complete").is_file():
                    raise
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    for f in files:
        if f.get("text") is None:
            continue
        p = dest / f["path"]
        if not p.is_file() or sha256_bytes(p.read_bytes()) != f["sha256"]:
            bad.append(f["path"])
    return (not bad), ("generated hash mismatch: " + ", ".join(bad[:5])) if bad else ""


def prepare_oracle(manifest: dict, oracle_repo: Optional[Path], cache_dir: Optional[Path],
                   clang: Optional[str] = None) -> tuple[Optional[OracleContext], dict]:
    """(context or None, oracle report). Never raises for context problems."""
    clang = clang or ir_oracle.find_clang()
    info: dict[str, Any] = {
        "available": False,
        "clang": clang,
        "clang_version": _clang_version(clang),
        "flags_hash": sha256_json([[u["unit"], u.get("flags")] for u in manifest.get("units", [])]),
        "prelude_hash": sha256_bytes(ir_oracle.PRELUDE.read_bytes()) if ir_oracle.PRELUDE.is_file() else None,
        "context": {"base_tree_ok": False, "generated_ok": False, "detail": ""},
    }
    if not clang:
        info["context"]["detail"] = "clang not found (set ORCH_IR_ORACLE_CLANG)"
        return None, info
    if oracle_repo is None:
        info["context"]["detail"] = "no oracle repo"
        return None, info
    base_rev = manifest["base_rev"]
    tree_id = rev_parse(oracle_repo, f"{base_rev}^{{tree}}")
    if tree_id is None:
        info["context"]["detail"] = f"base_rev {base_rev[:12]} not in {oracle_repo}"
        return None, info
    if manifest.get("base_tree") and tree_id != manifest["base_tree"]:
        info["context"]["detail"] = f"base tree mismatch: host {tree_id[:12]} vs sandbox {manifest['base_tree'][:12]}"
        return None, info
    info["context"]["base_tree_ok"] = True
    cache = Path(cache_dir or default_cache_dir()) / base_rev
    try:
        _archive_tree(Path(oracle_repo), base_rev, cache / "tree")
    except (ToolFailure, OSError) as e:
        info["context"]["detail"] = f"materialize failed: {e}"
        return None, info
    gen = manifest.get("generated") or {"root": None, "files": []}
    gen_key = sha256_json([[f["path"], f["sha256"]] for f in gen.get("files", [])])[:16]
    gen_dir = cache / f"gen-{gen_key}"
    try:
        ok, detail = _write_generated(gen, gen_dir)
    except OSError as e:
        ok, detail = False, f"generated write failed: {e}"
    info["context"]["generated_ok"] = ok
    if not ok:
        info["context"]["detail"] = detail
        return None, info
    units = {u["unit"]: u for u in manifest.get("units", [])}
    ctx = OracleContext(cache / "tree", units, gen.get("root"), gen_dir, clang)
    info["available"] = True
    info["context"]["detail"] = str(cache)
    return ctx, info


def _clang_version(clang: Optional[str]) -> Optional[str]:
    if not clang:
        return None
    try:
        out = subprocess.run([clang, "--version"], capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    return out.splitlines()[0].strip() if out else None


# --------------------------------------------------------------------------
# Shapes
# --------------------------------------------------------------------------


_TYPEDEF_CACHE: dict[str, Optional[dict]] = {}


def typedefs_for(tree: Optional[Path]) -> Optional[dict]:
    if steering_shapes is None or tree is None:
        return None
    key = str(tree)
    if key not in _TYPEDEF_CACHE:
        try:
            _TYPEDEF_CACHE[key] = steering_shapes.load_typedefs(tree)
        except Exception:
            _TYPEDEF_CACHE[key] = None
    return _TYPEDEF_CACHE[key]


def classify(removed: list[str], added: list[str], context: Optional[str], typedefs: Optional[dict],
             edits: Optional[Sequence[se.Edit]] = None) -> dict:
    """Shapes of one group. `edits` (the group's edits, in order) tells a move
    (same tokens, different places) from a comment/whitespace change."""
    per_edit_cosmetic = edits is None or all(se.is_cosmetic(e.removed, e.added) for e in edits)
    if se.is_cosmetic(removed, added):
        if per_edit_cosmetic:
            return {"shapes": ["cosmetic"], "real_shapes": [], "details": {}}
        kind = "decl_reorder" if se.declared_names(added) else "statement_permutation"
        return {"shapes": [kind], "real_shapes": [], "details": {"note": "code moved without change"}}
    if steering_shapes is None:
        return {"shapes": ["other"], "real_shapes": [], "details": {"note": "steering_shapes unavailable"}}
    try:
        out = steering_shapes.classify_group(removed, added, context=context, typedefs=typedefs)
    except Exception as e:  # classifier gap: positive evidence missing -> other
        return {"shapes": ["other"], "real_shapes": [], "details": {"error": f"{type(e).__name__}: {e}"}}
    return {"shapes": list(out.get("shapes") or []), "real_shapes": list(out.get("real_shapes") or []),
            "details": out.get("details") or {}}


def _post_context(cand_text: Optional[str], g: se.Group, limit: int = 30) -> Optional[str]:
    if not cand_text:
        return None
    lines = cand_text.splitlines()
    last = max((e.cand_start + len(e.added) for e in g.edits), default=0)
    return "\n".join(lines[last:last + limit])


# --------------------------------------------------------------------------
# Reduction
# --------------------------------------------------------------------------


@dataclass
class GroupInfo:
    group: se.Group
    units: list[str]
    shapes: list[str] = field(default_factory=list)
    real_shapes: list[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)
    cosmetic: bool = False
    testable: bool = False
    status: Optional[str] = None
    reason: str = ""
    evidence: Optional[dict] = None
    compile_blocked: bool = False
    data_order: Optional[dict] = None
    incomplete: bool = False
    ir_touch: Optional[list[str]] = None  # qualified names whose IR changes when the group is reverted
    ir_symbols: Optional[list[str]] = None  # IR symbols added/removed by reverting it

    @property
    def id(self) -> str:
        return self.group.id


@dataclass
class TrialResult:
    passed: bool
    reason: str  # equal | fps | order | compile
    units: dict = field(default_factory=dict)  # unit -> UnitOracle


class Reducer:
    def __init__(self, manifest: dict, ctx: Optional[OracleContext], oracle_info: dict, *,
                 budget_seconds: float = DEFAULT_BUDGET, max_groups: int = DEFAULT_MAX_GROUPS, jobs: int = MAX_JOBS,
                 approvals: Optional[list[dict]] = None, evidence_repo: Optional[Path] = None,
                 symbols_text: Optional[str] = None, oracle: Optional[Callable] = None, game: Optional[str] = None):
        self.manifest = manifest
        self.game = game or manifest.get("game")  # binds site-bound approvals; None: no approval certifies
        self.ctx = ctx
        self.oracle_info = oracle_info
        self.budget = budget_seconds
        self.max_groups = max_groups
        self.jobs = clamp_jobs(jobs)
        self.approvals = approvals or []
        self.evidence_repo = evidence_repo
        self.symbols_text = symbols_text
        self._compile = oracle or (ctx.compile if ctx else None)
        self.start = time.time()
        self.reasons: list[str] = []
        self.global_reasons: list[str] = []  # apply to every function; the rest are group/unit local
        # The same facts, structured: {category, units, groups, files, detail}; read by the backfill.
        self.incomplete_details: list[dict] = []
        self.files = {f["path"]: f for f in manifest["files"]}
        self.units = {u["unit"]: u for u in manifest.get("units", [])}
        self.sources = {u["source"] for u in self.units.values()}
        self.edits: dict[str, list[se.Edit]] = {}
        self.groups: list[GroupInfo] = []
        self.unit_ok: dict[str, UnitOracle] = {}
        self.base_unit: dict[str, UnitOracle] = {}
        self.budget_hit = False

    def global_reason(self, why: str) -> None:
        self.reasons.append(why)
        self.global_reasons.append(why)
        self.incomplete_details.append(issue("global", detail=why))

    # -- texts -------------------------------------------------------------

    def texts(self, removed: Iterable[GroupInfo]) -> dict[str, Optional[str]]:
        by_file: dict[str, list[str]] = {}
        for g in removed:
            by_file.setdefault(g.group.file, []).extend(g.group.edit_ids)
        out = {}
        for rel, f in self.files.items():
            ids = by_file.get(rel, [])
            out[rel] = se.apply_reverts(f["base_text"], f["cand_text"], self.edits[rel], ids,
                                        base_exists=f["base_exists"], cand_exists=f["cand_exists"])
        return out

    def overrides_for(self, unit: str, texts: dict[str, Optional[str]]) -> dict[str, Optional[str]]:
        src = self.units[unit]["source"]
        return {rel: t for rel, t in texts.items() if rel == src or rel not in self.sources}

    def over_budget(self) -> bool:
        if time.time() - self.start > self.budget:
            self.budget_hit = True
        return self.budget_hit

    # -- trials ------------------------------------------------------------

    def trial(self, removed: frozenset, full: bool = False) -> TrialResult:
        """Revert `removed` and compare every affected unit with the candidate.
        `full` compiles all affected units instead of stopping at the first
        difference (for function attribution)."""
        groups = [g for g in self.groups if g.id in removed]
        texts = self.texts(groups)
        units = sorted({u for g in groups for u in g.units})
        out = TrialResult(True, "equal")
        for unit in units:
            res = self._compile(unit, self.overrides_for(unit, texts))
            out.units[unit] = res
            cand = self.unit_ok[unit]
            if not res.ok:
                out.passed, out.reason = False, "compile"
                if not full:
                    return out
                continue
            if res.fps != cand.fps:
                if out.reason != "compile":
                    out.passed, out.reason = False, "fps"
                if not full:
                    return out
            elif res.order != cand.order and out.passed:
                out.passed, out.reason = False, "order"
        return out

    def _pmap(self, fn: Callable, items: list) -> list:
        if len(items) <= 1 or self.jobs == 1:
            return [fn(x) for x in items]
        with ThreadPoolExecutor(max_workers=self.jobs) as ex:
            return list(ex.map(fn, items))

    def reduce_order(self, order: list[GroupInfo]) -> tuple[frozenset, set[str], dict[str, str]]:
        """(removed ids, compile-blocked ids, last failure reason per id)."""
        removed: frozenset = frozenset()
        pending = list(order)
        last: dict[str, str] = {}
        tried_merges: set[frozenset] = set()
        by_id = {g.id: g for g in self.groups}
        while pending and not self.over_budget():
            results = self._pmap(lambda g: self.trial(removed | {g.id}), pending)
            for g, r in zip(pending, results):
                last[g.id] = r.reason
            passing = [g for g, r in zip(pending, results) if r.passed]
            if passing:
                batch = frozenset(g.id for g in passing)
                if len(passing) > 1 and self.trial(removed | batch).passed:
                    removed = removed | batch
                else:
                    for g in passing:
                        if self.over_budget():
                            break
                        if len(passing) == 1 or self.trial(removed | {g.id}).passed:
                            removed = removed | {g.id}
                pending = [g for g in pending if g.id not in removed]
                continue
            merges = []
            for g in pending:
                if last.get(g.id) != "compile":
                    continue
                nb = [by_id[h.id] for h in se.neighbours([x.group for x in self.groups], g.group)
                      if h.id in by_id and by_id[h.id].testable and h.id not in removed]
                blocked = [h for h in nb if last.get(h.id) == "compile"]
                for cand in (blocked, nb):
                    key = frozenset(h.id for h in cand)
                    if len(key) > 1 and key not in tried_merges:
                        tried_merges.add(key)
                        merges.append(key)
            if not merges or self.over_budget():
                break
            results = self._pmap(lambda m: self.trial(removed | m), merges)
            accepted = False
            for m, r in zip(merges, results):
                if r.passed and not (m & removed) and (not accepted or self.trial(removed | m).passed):
                    removed = removed | m
                    accepted = True
            if not accepted:
                break
            pending = [g for g in pending if g.id not in removed]
        blocked = {g.id for g in pending if last.get(g.id) == "compile"}
        return removed, blocked, last

    # -- the run -------------------------------------------------------------

    def setup(self) -> None:
        typedefs = typedefs_for(self.ctx.tree if self.ctx else None)
        header_units = self.manifest.get("header_units") or {}
        for rel, f in sorted(self.files.items()):
            edits = se.enumerate_edits(rel, f["base_text"], f["cand_text"])
            self.edits[rel] = edits
            for g in se.group_edits(rel, f["base_text"], f["cand_text"], edits):
                if rel in header_units:
                    units = list(header_units[rel])
                else:
                    units = [u["unit"] for u in self.units.values() if u["source"] == rel]
                info = GroupInfo(g, units)
                removed, added = se.statement_context(f["base_text"], f["cand_text"], g)
                shape = classify(removed, added, _post_context(f["cand_text"], g), typedefs, g.edits)
                info.shapes, info.real_shapes, info.details = shape["shapes"], shape["real_shapes"], shape["details"]
                info.cosmetic = info.shapes == ["cosmetic"] and not info.real_shapes
                self.groups.append(info)

    def run(self) -> dict:
        self.setup()
        oracle_ok = self._compile is not None
        if not oracle_ok:
            self.global_reason("oracle unavailable: " + (self.oracle_info.get("context", {}).get("detail") or "no clang"))
        header_units = self.manifest.get("header_units") or {}
        capped = {rel for rel, us in header_units.items() if len(us) > HEADER_UNIT_CAP}
        for rel in sorted(capped):
            self.reasons.append(f"{rel}: included by {len(header_units[rel])} units (cap {HEADER_UNIT_CAP})")
            self.incomplete_details.append(issue("header_cap", units=header_units[rel], files=[rel],
                                                 detail=f"included by {len(header_units[rel])} units (cap {HEADER_UNIT_CAP})"))
        needed = sorted({u for g in self.groups if not g.cosmetic and g.group.file not in capped for u in g.units})
        if oracle_ok:
            cand_texts = self.texts([])
            base_texts = {rel: (f["base_text"] if f["base_exists"] else None) for rel, f in self.files.items()}
            jobs = [(u, "cand") for u in needed] + [(u, "base") for u in needed]

            def run_unit(job):
                unit, kind = job
                if unit not in self.units:
                    return UnitOracle(False, errors=[f"{unit}: not in the edits manifest"])
                return self._compile(unit, self.overrides_for(unit, cand_texts if kind == "cand" else base_texts))

            for (unit, kind), res in zip(jobs, self._pmap(run_unit, jobs)):
                (self.unit_ok if kind == "cand" else self.base_unit)[unit] = res
        for g in self.groups:
            if g.cosmetic:
                g.status, g.reason = "removable", "comments/whitespace only"
                continue
            why = None
            if not oracle_ok:
                why = "oracle unavailable"
            elif g.group.file in capped:
                why = f"header included by more than {HEADER_UNIT_CAP} units"
            elif not g.units:
                why = "no unit builds or includes this file"
            else:
                bad = [u for u in g.units if not self.unit_ok.get(u, UnitOracle(False)).ok]
                if bad:
                    why = "candidate does not compile under the IR oracle: " + ", ".join(bad[:3])
            if why:
                g.status, g.reason, g.incomplete = "unresolved", why, True
            else:
                g.testable = True
        for unit, res in self.unit_ok.items():
            if not res.ok:
                self.reasons.append(f"{unit}: IR oracle failed: " + "; ".join(res.errors[:2]))
                self.incomplete_details.append(issue("unit_oracle_failed", units=[unit], detail="; ".join(res.errors[:2])[:300]))
        testable = [g for g in self.groups if g.testable]
        removed: frozenset = frozenset()
        blocked: set[str] = set()
        last: dict[str, str] = {}
        if len(testable) > self.max_groups:
            self.global_reason(f"{len(testable)} groups exceed --max-groups {self.max_groups}")
            for g in testable:
                g.status, g.reason, g.incomplete, g.testable = "unresolved", "max groups exceeded", True, False
        elif testable:
            forward = sorted(testable, key=lambda g: (-g.group.size, g.id))
            removed, blocked, last = self.reduce_order(forward)
            if not self.budget_hit:
                rev_removed, _rb, _rl = self.reduce_order(list(reversed(forward)))
                if not self.budget_hit and rev_removed != removed:
                    diff = sorted(removed ^ rev_removed)
                    self.global_reason("order sensitive: forward and reverse reductions differ on " + ", ".join(diff[:6]))
            if self.budget_hit:
                self.global_reason(f"budget of {self.budget:.0f}s exceeded")
        self.classify_after(removed, blocked, last)
        return self.report()

    # -- classification -------------------------------------------------------

    def classify_after(self, removed: frozenset, blocked: set[str], last: dict[str, str]) -> None:
        unsupported = self.unsupported_index()
        for g in self.groups:
            if not g.testable:
                continue
            if self.budget_hit and g.id not in removed:
                g.status, g.reason, g.incomplete = "unresolved", "budget exceeded before the group was decided", True
                continue
            hit = sorted(set(g.group.functions) & set(unsupported.get_for(g.units)))
            if hit:
                g.status, g.reason, g.incomplete = "unresolved", "unsupported construct in " + ", ".join(hit[:3]), True
                continue
            if g.id in removed:
                g.status, g.reason = "removable", "reverting it keeps every IR fingerprint and the data order"
                self.evidence_review(g)
                continue
            g.compile_blocked = g.id in blocked
            if not g.compile_blocked:
                self.ir_evidence(g, removed)
            if last.get(g.id) == "order":
                self.check_data_order(g, removed)
                continue
            self.retained_status(g)

    def ir_evidence(self, g: GroupInfo, removed: frozenset) -> None:
        """Which functions/globals change in IR when the retained group alone is
        reverted (on top of the removable ones): the group's touch set. IR
        symbols that appear or disappear make it a definition change."""
        res = self.trial(removed | {g.id}, full=True)
        changed: list[str] = []
        appear: list[str] = []
        for unit in g.units:
            r = res.units.get(unit)
            if r is None or not r.ok:
                return  # no evidence; callers fall back to the line range
            for name, row in ir_oracle.compare_fps(self.unit_ok[unit].fps, r.fps).items():
                if row != "SAME":
                    changed.append(name)
                if row in ("ONLY_A", "ONLY_B"):
                    appear.append(name)
        dem = ir_oracle.demangle(sorted(set(changed))) if changed else {}
        g.ir_touch = sorted({normalize_name(qualified(dem.get(n, n))) for n in changed})
        g.ir_symbols = sorted({dem.get(n, n) for n in appear})
        if appear:
            g.real_shapes = sorted(set(g.real_shapes) | {"definition_added_removed"})
            if len(set(appear)) == len(set(changed)) and "other" in g.shapes:
                # The IR difference is exactly the added/removed definitions:
                # nothing is left unexplained.
                g.shapes = [x for x in g.shapes if x != "other"]

    def retained_status(self, g: GroupInfo) -> None:
        steering = [s for s in g.shapes if s in STEERING]
        directive = [s for s in g.shapes if s in DIRECTIVES]
        other = "other" in g.shapes
        if g.compile_blocked:
            if se.include_only(g.group.removed, g.group.added):
                g.status, g.reason = "real", "include needed by retained code (revert does not compile)"
                g.real_shapes = sorted(set(g.real_shapes) | {"include_change"})
            elif g.real_shapes and not steering and not directive and not other:
                g.status, g.reason = "real", "revert does not compile; carries only real shapes"
            else:
                g.status, g.reason, g.incomplete = "unresolved", "revert does not compile even with its neighbours", True
            return
        if directive:
            g.status, g.reason = "unresolved", "codegen directive: " + ", ".join(directive)
        elif g.real_shapes and not steering and other:
            g.status, g.reason = "unresolved", "real shapes plus an unexplained change (other); separate them"
        elif g.real_shapes and not steering:
            g.status, g.reason = "real", "behaviour changes with real shapes: " + ", ".join(g.real_shapes)
        elif g.real_shapes:
            g.status, g.reason = "unresolved", "real and steering shapes in one group (" + ", ".join(steering) + "); separate them"
        elif steering:
            g.status, g.reason = "unresolved", "IR changes but only steering shapes found: " + ", ".join(steering)
        else:
            g.status, g.reason = "unresolved", "IR changes but no real shape found (other)"

    def check_data_order(self, g: GroupInfo, removed: frozenset) -> None:
        """Reverting the group only changes the data definition order."""
        g.shapes = g.shapes + (["data_order"] if "data_order" not in g.shapes else [])
        res = self.trial(removed | {g.id})
        flipped = []
        for unit in g.units:
            cand = self.unit_ok[unit].order
            alt = res.units.get(unit).order if res.units.get(unit) and res.units[unit].ok else cand
            pos_c = {n: i for i, n in enumerate(cand)}
            pos_a = {n: i for i, n in enumerate(alt)}
            common = [n for n in cand if n in pos_a]
            for i, x in enumerate(common):
                for y in common[i + 1:]:
                    if (pos_c[x] < pos_c[y]) != (pos_a[x] < pos_a[y]):
                        flipped.append((x, y))
        verdict = _verify_data_order(flipped, self.symbols_text)
        g.data_order = {"flipped": [list(p) for p in flipped[:12]], **verdict}
        others = [s for s in g.shapes if (s in STEERING and s not in MOVE_SHAPES) or s in DIRECTIVES]
        if verdict["verified"] and not others:
            g.status, g.reason = "real", "moves definitions into the original data order"
            g.real_shapes = sorted(set(g.real_shapes) | {"data_order"})
        elif verdict["verified"]:
            g.status, g.reason = "unresolved", "data order fix mixed with steering shapes: " + ", ".join(others)
        else:
            g.status, g.reason = "unresolved", "data order changes: " + verdict["detail"]

    def evidence_review(self, g: GroupInfo) -> None:
        """A removable group adding a call to a weak (header inline) function the
        original emitted in this unit: evidence review, unless approved."""
        calls = se.new_calls(g.group.removed, g.group.added)
        if not calls or self.evidence_repo is None:
            return
        try:
            import evidence_search
        except Exception:
            return
        weak: dict[str, str] = {}
        for unit in g.units:
            try:
                info = evidence_search.map_unit(self.evidence_repo, unit, self.manifest.get("game_version"))
            except Exception:
                continue
            for fn in info.get("functions") or []:
                if fn.get("kind") != "weak":
                    continue
                display = fn.get("name") or ""
                short = display.split("(")[0].split("::")[-1]
                if short in calls:
                    weak[short] = fn.get("mangled") or display
        if not weak:
            return
        callee, symbol = sorted(weak.items())[0]
        # The site a review (and a site-bound approval) is about: plan 3.1.
        site = {"game": self.game, "units": list(g.units), "functions": list(g.group.functions),
                "base_rev": self.manifest.get("base_rev"), "file": g.group.file,
                "lines": sa.site_lines(g.group), "digest": self.group_digest(g)}
        evidence = {"kind": "evidence_review", "callee": callee, "symbol": symbol,
                    "provenance": "weak function emitted in this unit (map)",
                    "site": {**site, "patch": sa.group_patch(g.group)}}
        # Every (unit, function) the group affects needs its own approval (a shared header reaches several units).
        pairs = [(u, None, f) for u in g.units for f in g.group.functions]
        found, missing = _group_approvals(self.approvals, {**site, "callee": callee, "symbol": symbol}, pairs)
        approval = found[0] if found and not missing else None
        if found and missing:
            evidence = {**evidence, "missing": missing}
            g.status = "unresolved"
            g.reason = (f"evidence_review: {callee} is approved for {', '.join(sorted({r['unit'] for r in found}))} "
                        f"but not for {', '.join(sorted({m['unit'] for m in missing}))}")
            g.evidence = evidence
            return
        if approval is not None:
            extra = approval_residue(g.shapes, g.real_shapes)
            if extra:
                g.status = "unresolved"
                g.reason = (f"approved construct {callee} mixed with {', '.join(extra)} in one group; "
                            "split it so only the approved construct remains")
                g.evidence = {**evidence, "kind": "approved_mixed", "approved_by": approval.get("approved_by")}
                return
            g.status, g.reason = "real", "approved evidence: " + str(approval.get("provenance") or "")
            g.evidence = {**evidence, "kind": "approved", "approved_by": approval.get("approved_by")}
            return
        g.status, g.reason = "unresolved", f"evidence_review: {callee} is a weak inline the original emitted"
        g.evidence = evidence

    def group_digest(self, g: GroupInfo) -> str:
        """The group digest, each edit lexed in its file's state at its first line (steering_approvals)."""
        f = self.files.get(g.group.file) or {}
        return sa.group_digest(g.group, f.get("base_text"), f.get("cand_text"))

    def unsupported_index(self) -> "_Unsupported":
        return _Unsupported({u: r.unsupported for u, r in self.unit_ok.items() if r.ok})

    def report(self) -> dict:
        incomplete = [g.id for g in self.groups if g.incomplete]
        if incomplete:
            self.reasons.append("groups with incomplete analysis: " + ", ".join(incomplete)[:300])
            # A group in a changed file no unit compiles (a header-only residual) is its own category.
            no_unit = [g for g in self.groups if g.incomplete and not g.units]
            other = [g for g in self.groups if g.incomplete and g.units]
            if no_unit:
                self.incomplete_details.append(issue("group_no_unit", groups=[g.id for g in no_unit],
                                                     files=sorted({g.group.file for g in no_unit}),
                                                     detail="no unit builds or includes these files"))
            if other:
                self.incomplete_details.append(issue("group_incomplete", groups=[g.id for g in other],
                                                     units=sorted({u for g in other for u in g.units}),
                                                     files=sorted({g.group.file for g in other})))
        complete = not self.reasons
        groups = []
        for g in self.groups:
            row = se.group_to_json(g.group)
            row.update({
                "shapes": g.shapes,
                "real_shapes": g.real_shapes,
                "status": g.status,
                "reason": g.reason,
                "evidence": g.evidence,
                "units": g.units,
                "cosmetic": g.cosmetic,
                "compile_blocked": g.compile_blocked,
                "incomplete": g.incomplete,
                "data_order": g.data_order,
                "ir_functions": g.ir_touch,
                "ir_symbols_changed": g.ir_symbols,
                "site_lines": sa.site_lines(g.group),
                "group_digest": self.group_digest(g),
                "new_calls": se.new_calls(g.group.removed, g.group.added),
                "dropped_calls": se.dropped_calls(g.group.removed, g.group.added),
                "findings": (g.details.get("findings") or [])[:6],
            })
            groups.append(row)
        units = []
        for name in sorted(self.unit_ok):
            res = self.unit_ok[name]
            base = self.base_unit.get(name)
            changed = []
            if res.ok and base is not None and base.ok:
                changed = [n for n, v in ir_oracle.compare_fps(base.fps, res.fps).items() if v != "SAME"]
            dem = ir_oracle.demangle(changed + list(res.unsupported))
            ir_changed = None
            if res.ok and base is not None and base.ok:
                ir_changed = res.fps != base.fps or res.order != base.order
            units.append({
                "unit": name,
                "source": (self.units.get(name) or {}).get("source"),
                "ok": res.ok,
                "base_ok": bool(base is not None and base.ok),
                "ir_changed": ir_changed,  # base vs candidate IR: every fingerprint and the data order (None = unknown)
                "functions": [dem.get(n, n) for n in changed],
                "unsupported": {dem.get(n, n): why for n, why in res.unsupported.items()},
                "errors": res.errors[:8],
            })
        return {
            "tool": TOOL,
            "version": VERSION,
            "edits_hash": self.manifest["edits_hash"],
            "base_rev": self.manifest["base_rev"],
            "game": self.game,
            "oracle": self.oracle_info,
            "analysis": "complete" if complete else "incomplete",
            "changed_files": sorted(self.files),
            "incomplete_reasons": self.reasons,
            "global_incomplete": self.global_reasons,
            "incomplete_details": self.incomplete_details,
            "groups": groups,
            "units": units,
            "compiles": getattr(self.ctx, "compiles", None),
            "elapsed_s": round(time.time() - self.start, 1),
        }


class _Unsupported:
    """Unsupported IR functions per unit, matched by demangled qualified name."""

    def __init__(self, per_unit: dict[str, dict[str, str]]):
        self.names: dict[str, set[str]] = {}
        all_names = sorted({n for d in per_unit.values() for n in d})
        dem = ir_oracle.demangle(all_names) if all_names else {}
        for unit, d in per_unit.items():
            self.names[unit] = {qualified(dem.get(n, n)) for n in d}

    def get_for(self, units: Iterable[str]) -> set[str]:
        out: set[str] = set()
        for u in units:
            out |= self.names.get(u, set())
        return out


def normalize_name(name: str) -> str:
    """Comparable function name: no whitespace (template spelling differs
    between the IR and MWCC demanglers)."""
    return re.sub(r"\s+", "", name)


def qualified(name: str) -> str:
    """`T::f` from `T::f(int) const` (templates in the name kept)."""
    depth = 0
    for i, ch in enumerate(name):
        if ch == "<":
            depth += 1
        elif ch == ">":
            depth -= 1
        elif ch == "(" and depth == 0 and i > 0 and not name[:i].endswith("operator"):
            return name[:i].strip()
    return name.strip()


def _mwcc_qualified(name: str) -> str:
    try:
        import evidence_search

        return evidence_search.demangle(name)[1]
    except Exception:
        m = re.fullmatch(r"(\w+?)__(\d+)(\w+)", name)
        if m and len(m.group(3)) == int(m.group(2)):
            return f"{m.group(3)}::{m.group(1)}"
        return name


def _verify_data_order(flipped: list[tuple[str, str]], symbols_text: Optional[str]) -> dict:
    if not flipped:
        return {"verified": False, "detail": "no reordered definitions found"}
    if not symbols_text:
        return {"verified": False, "detail": "no symbols.txt at base_rev to check the original order"}
    addr: dict[str, tuple[str, int]] = {}
    for line in symbols_text.splitlines():
        m = re.match(r"^\s*(\S+)\s*=\s*([^:\s]+):0x([0-9A-Fa-f]+);", line)
        if m:
            addr.setdefault(_mwcc_qualified(m.group(1)), (m.group(2), int(m.group(3), 16)))
            addr.setdefault(m.group(1), (m.group(2), int(m.group(3), 16)))
    names = sorted({n for p in flipped for n in p})
    dem = ir_oracle.demangle(names)
    checked = 0
    for x, y in flipped:
        ax = addr.get(qualified(dem.get(x, x))) or addr.get(x)
        ay = addr.get(qualified(dem.get(y, y))) or addr.get(y)
        if not ax or not ay or ax[0] != ay[0]:
            continue
        checked += 1
        # flipped pairs are listed in candidate order: x before y
        if not ax[1] < ay[1]:
            return {"verified": False, "detail": f"candidate puts {x} before {y}; the original does not"}
    if not checked:
        return {"verified": False, "detail": "reordered definitions not found in symbols.txt"}
    return {"verified": True, "detail": f"{checked} reordered pairs match the original addresses"}


APPROVABLE_SHAPES = ("accessor_swap",)
APPROVABLE_REAL = ("call_added", "callee_change")


def approval_residue(shapes: list[str], real_shapes: list[str]) -> list[str]:
    """Shapes an approval of one inline/weak construct does not cover."""
    extra = [s for s in shapes if s not in APPROVABLE_SHAPES and s != "cosmetic"]
    extra += [s for s in real_shapes if s not in APPROVABLE_REAL]
    return extra


def _find_approval(approvals: list[dict], site: dict) -> Optional[dict]:
    """The site-bound approval (steering_approvals) for exactly this edit group.

    `site`: {game, units, base_rev, file, lines, digest, callee, symbol,
    functions (qualified names the group edits), targets (optional: mangled
    functions the group touches, from the MWCC report)}. A row certifies only
    when it carries every site-bound field and all of them match: the game,
    a unit the group compiles in, the claim base revision, the file, the line
    range, the group digest (operands included), the callee, and the symbol
    the group introduces (the same mangled name, or the same fully qualified
    demangled name; a bare or differently qualified name never matches). The
    target must be one of `targets` when given, else its demangled qualified
    name must be one of `functions` (a function defined in its class body
    carries only its own name there). Legacy rows (symbol + function) never
    certify.
    """
    callee, symbol = str(site.get("callee") or ""), str(site.get("symbol") or "")
    game, base_rev = site.get("game"), site.get("base_rev")
    if not callee or not symbol or not game or not base_rev or not site.get("digest") or not site.get("file"):
        return None
    exact = {symbol, normalize_name(_mwcc_qualified(symbol))}
    units = set(site.get("units") or [])
    for row in approvals:
        if not sa.site_bound(row):
            continue
        if row["game"] != game or row["unit"] not in units or row["base_rev"] != base_rev:
            continue
        if row["site_file"] != site["file"] or list(row["site_lines"]) != list(site.get("lines") or []):
            continue
        if row["group_digest"] != site["digest"] or row["callee"] != callee:
            continue
        sym = row["symbol"]
        if sym not in exact and normalize_name(sym) not in exact:
            continue
        if not _target_matches(row["target"], site.get("targets") or [], site.get("functions") or []):
            continue
        return row
    return None


def _group_approvals(approvals: list[dict], site: dict,
                     pairs: list[tuple[str, Optional[str], Optional[str]]]) -> tuple[list[dict], list[dict]]:
    """Approvals per affected (unit, mangled target or qualified function): (rows found, pairs
    missing). A group counts as approved only with no pair missing; no pairs = nothing approved."""
    found: list[dict] = []
    missing: list[dict] = []
    for unit, target, function in pairs:
        narrowed = {**site, "units": [unit], "targets": [target] if target else [], "functions": [function] if function else []}
        row = _find_approval(approvals, narrowed) if (target or function) else None
        if row is None:
            missing.append({"unit": unit, "name": target, "function": function})
        else:
            found.append(row)
    if not pairs:
        missing.append({"unit": None, "name": None, "function": None})
    return found, missing


def _target_matches(target: str, targets: list[str], functions: list[str]) -> bool:
    if targets:
        return target in targets
    want = normalize_name(qualified(_mwcc_qualified(target)))
    for fn in functions:
        have = normalize_name(qualified(fn))
        if have == want or ("::" not in have and want.endswith("::" + have)):
            return True
    return False


def _names_match(a: str, b: str) -> bool:
    a, b = qualified(a), qualified(b)
    return a == b or a.endswith("::" + b) or b.endswith("::" + a)


def run_reduce(manifest: dict, oracle_repo: Optional[Path], cache_dir: Optional[Path], *, budget: float,
               max_groups: int, jobs: int, approvals_path: Optional[Path], evidence_repo: Optional[Path],
               oracle: Optional[Callable] = None) -> dict:
    """`oracle(unit, overrides) -> UnitOracle` replaces the clang context (tests)."""
    if oracle is None:
        ctx, info = prepare_oracle(manifest, oracle_repo, cache_dir)
    else:
        ctx, info = None, {"available": True, "injected": True,
                           "context": {"base_tree_ok": True, "generated_ok": True, "detail": "injected oracle"}}
    symbols_text = None
    if oracle_repo is not None and manifest.get("game_version"):
        data = git_show(oracle_repo, manifest["base_rev"], f"config/{manifest['game_version']}/symbols.txt")
        symbols_text = se.decode(data) if data is not None else None
    approvals = read_jsonl(approvals_path if approvals_path else default_approvals_path())
    try:
        reducer = Reducer(manifest, ctx, info, budget_seconds=budget, max_groups=max_groups, jobs=jobs,
                          approvals=approvals, evidence_repo=evidence_repo or oracle_repo, symbols_text=symbols_text,
                          oracle=oracle, game=sa.game_id(approvals_path or default_approvals_path()))
        red = reducer.run()
    finally:
        if ctx is not None:
            ctx.close()
    header = lambda rel: _header_text(manifest, oracle_repo, rel)  # noqa: E731
    red["order_refs"] = order_refs(manifest.get("files") or [], header)
    return red


# --------------------------------------------------------------------------
# MWCC (sandbox side)
# --------------------------------------------------------------------------


_CANNOT_OPEN_RE = re.compile(r"""['"`]([^'"`\n]+)['"`][^\n]*?cannot be opened|cannot be opened[^\n]*?['"`]([^'"`\n]+)['"`]""",
                             re.I)
_NO_SUCH_INCLUDE_RE = re.compile(r"""#include[^\n]*?['"<]([^'">\n]+)['">][^\n]*?(?:not found|no such file)""", re.I)


def shadow_include_failure(error: str) -> Optional[str]:
    """A compile failure that is the shadow root's, not the source's: MWCC
    could not open an include. Under wibo a long shadow-root path truncates
    include names (`fdlibm.h` -> `fdlibm.`), so the unit "fails to build" for
    reasons that have nothing to do with the code. Returns the tool-error
    message, or None for an ordinary compile error. The repo itself builds,
    so any include-open failure inside a shadow root is the tool's."""
    names = [a or b for a, b in _CANNOT_OPEN_RE.findall(error)] + _NO_SUCH_INCLUDE_RE.findall(error)
    if not names and not re.search(r"cannot be opened", error, re.I):
        return None
    name = names[0] if names else "?"
    base = name.rsplit("/", 1)[-1]
    if base.endswith(".") or ("." not in base and name != "?"):
        return (f"shadow-root path too long: MWCC opened a truncated include name '{name}'; "
                f"rerun with a shorter --tmp (default {short_tmp_root()})")
    return (f"shadow-root include failure: MWCC could not open '{name}' inside the shadow root "
            f"(path length or shadow-root setup, not the source); rerun with a shorter --tmp")


def short_tmp_root() -> Path:
    """Default parent of the shadow roots: short on purpose (macOS $TMPDIR is
    ~50 chars, and wibo truncates long include paths)."""
    base = Path("/tmp") if Path("/tmp").is_dir() else Path(tempfile.gettempdir())
    return base / f"stc-{os.getpid()}"


TMP_PATH_WARN = 48


class ShadowCompiler:
    """`jobs` shadow roots; each compile writes every changed file's variant text."""

    def __init__(self, repo, jobs: int, tmp: Optional[str] = None):
        import stack_check

        self.sc = stack_check
        self.repo = repo
        self.jobs = clamp_jobs(jobs)
        parent = Path(tmp) if tmp else short_tmp_root()
        parent.mkdir(parents=True, exist_ok=True)
        self.parent_owned = not tmp
        if len(str(parent)) > TMP_PATH_WARN:
            log(f"steering: --tmp {parent} is {len(str(parent))} chars; MWCC under wibo may truncate include paths "
                f"(failures are reported as shadow-root tool errors)")
        self.tmp = Path(tempfile.mkdtemp(prefix="m-", dir=str(parent)))
        self.objdir = self.tmp / "objs"
        self.objdir.mkdir()
        self.free: "queue.Queue[Path]" = queue.Queue()
        for i in range(self.jobs):
            root = self.tmp / f"w{i}"
            stack_check.make_shadow_root(repo.root, root)
            self.free.put(root)
        self.counter = 0
        self.lock = threading.Lock()

    def close(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)
        if self.parent_owned:
            try:
                self.tmp.parent.rmdir()  # only when no other compiler of this process still uses it
            except OSError:
                pass

    def compile(self, unit_name: str, texts: dict[str, Optional[bytes]], label: str,
                timeout: Optional[float] = None, depfile: bool = False):
        unit = self.repo.units[unit_name]
        with self.lock:
            self.counter += 1
            out = self.objdir / f"{label}-{self.counter}.o"
        root = self.free.get()
        try:
            for rel, content in texts.items():
                self.sc.write_file(root, rel, content)
            # depfile: the inputs are hashed inside compile_in, before this root goes back to the pool.
            return self.sc.compile_in(self.repo, root, unit, out, timeout=timeout, **({"depfile": True} if depfile else {}))
        finally:
            self.free.put(root)


class RepoBackend:
    """MWCC for `run_mwcc`: the repo's build.ninja units, shadow-root compiles,
    objdiff target classification. Tests substitute a fake with the same
    methods (units, compile, classify, target_path, close, jobs; optional
    unused for the UNUSED stub test)."""

    def __init__(self, repo_path: Path, version: Optional[str], jobs: int, tmp: Optional[str]):
        import stack_check

        self.repo = _repo(repo_path, version)
        self.pool = ShadowCompiler(self.repo, jobs, tmp)
        self.oracle = stack_check.TargetOracle(self.repo)
        self.jobs = self.pool.jobs
        self.root = self.repo.root
        self.unused_reasons: dict[str, str] = {}
        self.compiles = 0
        self.compile_seconds = 0.0
        self.deadline: Optional[float] = None
        self._progress_lock = threading.Lock()
        self._objdiff_flags: Optional[dict[str, Optional[str]]] = None
        self.records: dict[str, dict] = {}  # object path -> {deps, depfile_error} of a fidelity build
        self._file_hashes: dict[str, Optional[dict]] = {}

    def units(self, paths: list[str]) -> tuple[dict[str, list], dict[str, list[str]]]:
        return units_for_paths(self.repo, paths)

    def compile_record(self, obj: Path) -> Optional[dict]:
        """What a fidelity build (FIDELITY_LABELS) read: {deps, depfile_error}; None for other builds."""
        return self.records.get(str(obj))

    def _identity(self, path: Path, sha1: bool = False) -> Optional[dict]:
        key = f"{path}:{sha1}"
        if key not in self._file_hashes:
            try:
                data = path.read_bytes()
            except OSError:
                self._file_hashes[key] = None
            else:
                rel = path.relative_to(self.root).as_posix() if path.is_relative_to(self.root) else str(path)
                self._file_hashes[key] = {"path": rel, "sha256": hashlib.sha256(data).hexdigest(),
                                          **({"sha1": hashlib.sha1(data).hexdigest()} if sha1 else {})}
        return self._file_hashes[key]

    def compile_command(self, unit) -> dict:
        """The unit's exact compile (stack_check.compile_in) for the fidelity record: flags, the
        MWCC version, the runner, wrappers and post-processing, with their hashes."""
        import shlex

        import stack_check

        edge = self.repo.edges[unit.obj]
        compiler = f"build/compilers/{edge.mw_version}/mwcceppc.exe"
        wrappers = ["build/tools/sjiswrap.exe"] if "sjis" in edge.rule else []
        post = ["build/tools/dtk"] if "extab" in edge.rule else []
        return {
            "rule": edge.rule,
            "mw_version": edge.mw_version,
            "src": edge.src,
            "cflags": edge.cflags,
            "extab_padding": edge.extab_padding,
            "depfile_flag": stack_check.DEPFILE_FLAG,
            "argv": ["<runner>", *wrappers, compiler, *shlex.split(edge.cflags), stack_check.DEPFILE_FLAG,
                     "-c", edge.src, "-o", "<out>"],
            "runner": self._identity(Path(self.repo.runner)),
            "compiler": self._identity(self.root / compiler, sha1=True),
            "wrappers": [self._identity(self.root / w) for w in wrappers],
            "post": [self._identity(self.root / p) for p in post],
        }

    def set_deadline(self, deadline: float) -> None:
        self.deadline = deadline

    def compile(self, unit, texts: dict[str, Optional[bytes]], label: str) -> tuple[bool, Optional[Path], str]:
        import stack_check

        timeout: Optional[float] = None
        if self.deadline is not None:
            remaining = self.deadline - time.time()
            if remaining < 0:
                return False, None, "mwcc budget exceeded: not built (analysis incomplete)"
            # A compile started near the deadline is killed at it, not left to run past the budget.
            timeout = max(1.0, min(stack_check.compile_timeout(), remaining))
        t0 = time.time()
        fidelity = label in FIDELITY_LABELS
        res = self.pool.compile(unit.name, texts, label, timeout=timeout, **({"depfile": True} if fidelity else {}))
        if fidelity and res.ok and res.obj is not None:
            with self._progress_lock:
                self.records[str(res.obj)] = {"deps": getattr(res, "deps", None),
                                              "depfile_error": getattr(res, "depfile_error", None)}
        took = time.time() - t0
        with self._progress_lock:
            self.compiles += 1
            self.compile_seconds += took
            n = self.compiles
        if took > 60 or n % 25 == 0:  # a long mwcc step is visible as progress, not mistaken for a hang
            log(f"steering: mwcc {n} compiles, {self.compile_seconds:.0f}s compile time"
                f" (last {unit.name} {label} {took:.1f}s{'' if res.ok else ', failed'})")
        return res.ok, res.obj, res.error

    def classify(self, obj: Path, unit) -> Optional[dict]:
        return self.oracle.classify(obj, unit)

    def target_path(self, unit) -> Optional[Path]:
        p = self.repo.root / unit.target
        return p if p.is_file() else None

    def deps(self, unit) -> Optional[set[str]]:
        """Tracked inputs the unit object depends on (ninja deps; the PCH's headers when it uses
        one), limited to src/include/libs; None when the build has no deps for the object."""
        try:
            deps = self.repo.deps()
        except Exception:
            return None
        rows = deps.get(unit.obj)
        if not rows:
            return None
        out = {d for d in rows if under(d, DEFAULT_PATHS)}
        if any(d.endswith(".mch") for d in rows):
            out |= {d for d in self.repo.pch_headers() if under(d, DEFAULT_PATHS)}
        return out

    def include_dirs(self, unit) -> list[str]:
        """`-i`/`-I` include directories of the unit's compile command."""
        try:
            flags = self.repo.edges[unit.obj].cflags
        except Exception:
            return ["include"]
        return re.findall(r"(?:^|\s)-(?:i|I|ir)\s*(\S+)", flags) or ["include"]

    def unit_flags(self, unit) -> Optional[str]:
        """objdiff.json `scratch.c_flags` of the unit (matched by its base object path)."""
        if self._objdiff_flags is None:
            self._objdiff_flags = {}
            try:
                for u in json.loads((self.root / "objdiff.json").read_text()).get("units") or []:
                    if u.get("base_path"):
                        self._objdiff_flags[u["base_path"]] = (u.get("scratch") or {}).get("c_flags")
            except (OSError, ValueError):
                pass
        return self._objdiff_flags.get(unit.obj)

    def unused(self, unit, base_rev: str) -> Optional[list[dict]]:
        """UNUSED map symbols of the unit (None: map or unit unavailable; why in unused_reasons)."""
        why: dict[str, str] = {}
        out = map_unused(self.repo.root, base_rev, self.repo.version, unit.source, why)
        if out is None:
            self.unused_reasons[unit.name] = why.get(unit.source, "link map unavailable")
        return out

    def close(self) -> None:
        self.pool.close()


@dataclass
class Built:
    state: str  # ok | absent (the unit's source does not exist in this variant) | failed | tool_error (shadow root)
    elf: Optional[sc.ElfObject] = None
    target: Optional[dict] = None
    error: str = ""
    fidelity: Optional[dict] = None  # fidelity_build() of a candidate / S* build


# --------------------------------------------------------------------------
# Fidelity record (plan 3.4.1): what the steering-explain job needs to rebuild
# exactly the candidate and the S* a function's verdict used, and to prove it
# did (object hashes, the compile command and compiler, every input's hash).
# --------------------------------------------------------------------------

FIDELITY_SCHEMA = "steering-fidelity-v1"
FUNCTION_FIDELITY_SCHEMA = "steering-function-fidelity-v1"
# backend compile label -> fidelity build name; only these compiles write a depfile
FIDELITY_BUILDS = {"cand": "cand", "sstar": "sstar", "sstar2": "sstar_evidence", "sstar_steer": "sstar_steering"}
FIDELITY_LABELS = frozenset(FIDELITY_BUILDS)
# decide's S* variant -> the build its verdict compared against
VARIANT_BUILDS = {"global": "sstar", "evidence_sstar": "sstar_evidence", "steering_sstar": "sstar_steering"}


def fidelity_build(backend, obj: Optional[Path], variant: str, revert_ids: Iterable[str]) -> dict:
    """One candidate or S* build: its revert set, object hash and the hashes of every input it read."""
    try:
        obj_sha = sha256_bytes(Path(obj).read_bytes()) if obj is not None else None
    except OSError:
        obj_sha = None
    record = backend.compile_record(obj) if obj is not None and hasattr(backend, "compile_record") else None
    deps = (record or {}).get("deps")
    if deps:
        depfile = "ok"
    elif record is not None:
        depfile = record.get("depfile_error") or "depfile lists no inputs"
    else:
        depfile = "the MWCC backend records no compile inputs"
    return {"variant": variant, "revert_ids": sorted(revert_ids), "obj_sha256": obj_sha,
            "deps": dict(sorted((deps or {}).items())), "deps_sha256": sha256_json(deps) if deps else None,
            "depfile": depfile}


def function_fidelity(mwcc: dict, fn: dict, variant: str) -> dict:
    """The fidelity record of one decide row: the S* variant its verdict used, both builds' object
    and input digests and the compiler. `input_hash` (of the rest) keys the steering-explain job."""
    units = ((mwcc.get("fidelity") or {}).get("units") or {})
    unit = units.get(fn.get("unit")) or {}
    builds = unit.get("builds") or {}
    compile_ = unit.get("compile") or {}
    problems: list[str] = []
    if not units:
        problems.append("the mwcc report has no fidelity record")

    def ref(name: str) -> dict:
        b = builds.get(name) or {}
        if not b:
            problems.append(f"no {name} build recorded")
        elif b.get("depfile") != "ok":
            problems.append(f"{name}: {b.get('depfile')}")
        if b and not b.get("obj_sha256"):
            problems.append(f"{name}: no object hash")
        return {"build": name, "obj_sha256": b.get("obj_sha256"), "deps_sha256": b.get("deps_sha256")}

    sstar_name = VARIANT_BUILDS.get(variant, "sstar")
    cand, sstar = ref("cand"), ref(sstar_name)
    sstar_build = builds.get(sstar_name) or {}
    sstar["same_as_candidate"] = bool(sstar_build.get("same_as") == "cand" or (
        cand["obj_sha256"] and cand["obj_sha256"] == sstar["obj_sha256"]))
    compiler = compile_.get("compiler") or {}
    if units and not compile_:
        problems.append("no compile command recorded")
    record = {
        "schema": FUNCTION_FIDELITY_SCHEMA,
        "unit": fn.get("unit"),
        "function": fn.get("name"),
        "base_rev": mwcc.get("base_rev"),
        "edits_hash": mwcc.get("edits_hash"),
        "variant": variant,
        "revert_ids": list(sstar_build.get("revert_ids") or []),
        "candidate": cand,
        "sstar": sstar,
        "compiler": {"mw_version": compile_.get("mw_version"), "sha256": compiler.get("sha256")},
        "complete": not problems,
        "problems": problems[:6],
    }
    record["input_hash"] = sha256_json(record)
    return record


def _function_relocs(obj: sc.ElfObject, fn: sc.Function) -> list[str]:
    out = []
    for word_off, rels in sorted(obj.relocs_by_word(fn.section).items()):
        if not fn.start <= word_off < fn.start + fn.size:
            continue
        for r in rels:
            name = r.sym.name
            if name and not sc._is_anonymous(r.sym):
                out.append(name)
    return out


def _sym_is(sym: str, callee: str) -> bool:
    return sym == callee or sym.startswith(callee + "__") or _mwcc_qualified(sym).split("::")[-1] == callee


def _match_function(entry_names: Iterable[str], wanted: Sequence[str]) -> bool:
    names = [n for n in entry_names if n]
    for w in wanted:
        for n in names:
            if n == w or qualified(n) == qualified(w) or qualified(n).endswith("::" + qualified(w)):
                return True
    return False


def _status(entry: Optional[dict]) -> Optional[dict]:
    if not entry:
        return None
    return {"status": entry["status"], "match_percent": round(float(entry.get("match_percent") or 0.0), 4)}


def _target_index(built: Optional[Built]) -> dict[str, dict]:
    if built is None or not built.target:
        return {}
    return {(e.get("compiled_name") or e["name"]): e for e in built.target.get("functions", [])}


def _pair_classes(a: Built, b: Built) -> dict[str, str]:
    """Function name -> class of `a` vs `b` (absent objects have no functions)."""
    if a.elf is not None and b.elf is not None:
        return {fd.name: fd.cls for fd in sc.compare_objects(a.elf, b.elf).functions}
    fa = list(a.elf.keyed_functions()) if a.elf is not None else []
    fb = list(b.elf.keyed_functions()) if b.elf is not None else []
    return {**{n: "only_a" for n in fa}, **{n: "only_b" for n in fb}}


def run_mwcc(repo_path: Path, base_ref: str, edits_hash: str, revert_ids: list[str], *,
             functions: Optional[list[str]] = None, attribute: Optional[dict] = None, jobs: int = MAX_JOBS,
             paths: Sequence[str] = DEFAULT_PATHS, overlay_dir: Optional[str | Path] = None,
             version: Optional[str] = None, tmp: Optional[str] = None, backend=None,
             budget: Optional[float] = None) -> dict:
    """Build base, candidate and S* for every touched unit and compare them.

    `budget` (seconds, default $ORCH_MWCC_BUDGET_SECONDS or 3600) bounds the whole
    MWCC step: once spent, every further compile fails ("mwcc budget exceeded"),
    so the units it would have built are reported uncompared (fail closed). Each
    compile is also bounded (stack_check.compile_timeout).

    Considered functions: every function whose object code differs between
    base and candidate in a touched unit (added and removed ones included),
    plus the requested `functions`. Every touched unit gets a coverage row;
    a unit that could not be built or compared is reported, never skipped.
    With `attribute` (the reduce report) it also runs attribution, map-call
    relocation evidence and data-order evidence, exactly as `check` does.
    """
    repo_path = Path(repo_path).resolve()
    base_rev = rev_parse(repo_path, f"{base_ref}^{{commit}}")
    if base_rev is None:
        raise ToolFailure(f"{base_ref}: unknown revision")
    files = collect_files(repo_path, base_rev, paths, overlay_dir)
    got = se.edits_hash(base_rev, files)
    if got != edits_hash:
        raise ToolFailure(f"edits_hash mismatch: working tree {got[:16]} vs request {edits_hash[:16]}")
    edits = {f["path"]: se.enumerate_edits(f["path"], f["base_text"], f["cand_text"]) for f in files}
    known = {e.id for es in edits.values() for e in es}
    unknown = [e for e in revert_ids if e not in known]
    if unknown:
        raise ToolFailure("unknown edit ids: " + ", ".join(unknown[:5]))

    def variant(reverted: set[str]) -> dict[str, Optional[bytes]]:
        out = {}
        for f in files:
            ids = [e.id for e in edits[f["path"]] if e.id in reverted]
            out[f["path"]] = se.encode(se.apply_reverts(
                f["base_text"], f["cand_text"], edits[f["path"]], ids,
                base_exists=f["base_exists"], cand_exists=f["cand_exists"], preserve_lines=True))
        return out

    base_texts = {f["path"]: se.encode(f["base_text"]) if f["base_exists"] else None for f in files}
    cand_texts = {f["path"]: se.encode(f["cand_text"]) if f["cand_exists"] else None for f in files}
    revert = set(revert_ids)
    sstar_texts = variant(revert)
    texts_of = {"base": base_texts, "cand": cand_texts, "sstar": sstar_texts}
    backend = backend or RepoBackend(repo_path, version, jobs, tmp)
    if budget is None:
        try:
            budget = float(os.environ.get("ORCH_MWCC_BUDGET_SECONDS", "3600"))
        except ValueError:
            budget = 3600.0
    if hasattr(backend, "set_deadline"):
        backend.set_deadline(time.time() + budget)
    errors: list[dict] = []
    coverage: list[dict] = []
    units: dict[str, Any] = {}
    out_functions: list[dict] = []
    data_evidence: list[dict] = []
    group_touch: dict[str, dict[str, list[str]]] = {}
    unused_checks: list[dict] = []
    unused_map: dict[str, dict] = {}
    fidelity_units: dict[str, dict] = {}
    groups = (attribute or {}).get("groups") or []
    try:
        by_path, header_units = backend.units([f["path"] for f in files])
        for rel, us in by_path.items():
            if rel in header_units and len(us) > HEADER_UNIT_CAP:
                errors.append({"unit": None, "variant": None,
                               "error": f"{rel}: {len(us)} including units (cap {HEADER_UNIT_CAP})"})
                coverage.append({"unit": f"{rel} (>{HEADER_UNIT_CAP} units)", "built": {}, "compared": False,
                                 "reason": "header unit cap"})
                continue
            if not us:
                coverage.append({"unit": f"{rel} (no unit)", "built": {}, "compared": False, "no_unit": rel,
                                 "reason": "no unit builds or includes this file"})
            for u in us:
                units[u.name] = u

        def files_of(unit) -> set[str]:
            return {rel for rel, us in by_path.items() if any(x.name == unit.name for x in us)}


        def source_absent(unit, kind: str) -> bool:
            texts = texts_of[kind]
            return unit.source in texts and texts[unit.source] is None

        built: dict[tuple[str, str], Built] = {}
        jobs_list = []
        for name, u in sorted(units.items()):
            relevant = files_of(u)
            for kind in ("base", "cand", "sstar"):
                if source_absent(u, kind):
                    built[(name, kind)] = Built("absent")
                elif kind == "sstar" and all(sstar_texts[r] == cand_texts[r] for r in relevant):
                    continue  # identical to the candidate: shares its build
                else:
                    jobs_list.append((name, kind))

        def build(job):
            name, kind = job
            ok, obj, err = backend.compile(units[name], texts_of[kind], kind)
            if not ok or obj is None:
                tool = shadow_include_failure(err or "")
                if tool:  # the tool's shadow root, not the source: never a silent build failure
                    return job, Built("tool_error", error=f"{tool}\n{(err or '')[:600]}")
                return job, Built("failed", error=(err or "compile failed")[:800])
            try:
                elf = sc.ElfObject.from_path(str(obj))
            except (OSError, ValueError) as e:
                return job, Built("failed", error=str(e))
            fid = fidelity_build(backend, obj, "candidate" if kind == "cand" else "global",
                                 () if kind == "cand" else revert) if kind in FIDELITY_LABELS else None
            return job, Built("ok", elf, backend.classify(obj, units[name]), fidelity=fid)

        log(f"steering: mwcc {len(jobs_list)} unit builds for {len(units)} units "
            f"(+ attribution, data-order and UNUSED stub builds), jobs {getattr(backend, 'jobs', 1)}")
        with ThreadPoolExecutor(max_workers=max(1, getattr(backend, "jobs", 1))) as ex:
            for job, res in ex.map(build, jobs_list):
                built[job] = res
                if res.state == "failed":
                    errors.append({"unit": job[0], "variant": job[1], "error": res.error})
                elif res.state == "tool_error":
                    errors.append({"unit": job[0], "variant": job[1], "error": res.error, "tool_error": True})
        shared_sstar = set()
        for name in units:
            if (name, "sstar") not in built and (name, "cand") in built:
                # S* source inputs (unit source + changed headers it includes) are
                # byte-identical to the candidate's: S* is the candidate object.
                built[(name, "sstar")] = built[(name, "cand")]
                shared_sstar.add(name)
        for name, u in sorted(units.items()):
            rows = {}
            for kind in ("cand", "sstar"):
                b = built.get((name, kind))
                if b is not None and b.fidelity is not None:
                    rows[kind] = dict(b.fidelity)
            if name in shared_sstar and "cand" in rows:
                rows["sstar"] = {**rows["cand"], "variant": "global", "revert_ids": sorted(revert), "same_as": "cand"}
            fidelity_units[name] = {
                "compile": backend.compile_command(u) if hasattr(backend, "compile_command") else None,
                "builds": rows,
            }

        attribution_jobs = []
        for name, u in sorted(units.items()):
            base, cand, sstar = built[(name, "base")], built[(name, "cand")], built[(name, "sstar")]
            states = {"base": base.state, "candidate": cand.state,
                      "sstar": "same_as_candidate" if name in shared_sstar and sstar.state == "ok" else sstar.state}
            compared = all(s in BUILT_STATES for s in states.values()) and any(s == "ok" for s in states.values())
            tool_errors = [b.error.split("\n", 1)[0] for b in (base, cand, sstar) if b.state == "tool_error"]
            coverage.append({"unit": name, "built": states, "compared": compared,
                             "reason": "" if compared else (tool_errors[0] if tool_errors else "a variant did not build"),
                             **({"tool_error": tool_errors[0]} if tool_errors else {})})
            if not compared:
                continue
            changed = {n: c for n, c in _pair_classes(base, cand).items() if c != "identical"}
            s_cls = _pair_classes(sstar, cand)
            t_idx, base_idx, s_idx = _target_index(cand), _target_index(base), _target_index(sstar)
            target_path = backend.target_path(u)
            target_elf = None
            if target_path is not None:
                try:
                    target_elf = sc.ElfObject.from_path(str(target_path))
                except (OSError, ValueError):
                    target_elf = None
            cand_funcs = cand.elf.keyed_functions() if cand.elf is not None else {}
            sstar_funcs = sstar.elf.keyed_functions() if sstar.elf is not None else {}
            base_funcs = base.elf.keyed_functions() if base.elf is not None else {}
            names = list(cand_funcs) + [n for n in list(base_funcs) + list(sstar_funcs) if n not in cand_funcs]
            seen: set[str] = set()
            for key in names:
                if key in seen:
                    continue
                seen.add(key)
                entry = t_idx.get(key) or base_idx.get(key) or s_idx.get(key)
                demangled = (entry or {}).get("demangled") or _mwcc_display(key)
                requested = bool(functions) and _match_function([key, demangled, (entry or {}).get("name")], functions)
                if key not in changed and not requested:
                    continue
                target_relocs: list[str] = []
                if target_elf is not None and entry is not None:
                    tf = target_elf.keyed_functions().get(entry["name"])
                    if tf is not None:
                        target_relocs = _function_relocs(target_elf, tf)
                out_functions.append({
                    "unit": name,
                    "name": key,
                    "demangled": demangled,
                    "target_name": (entry or {}).get("name"),
                    "requested": requested,
                    "base": _status(base_idx.get(key)),
                    "candidate": _status(t_idx.get(key)),
                    "real_only": _status(s_idx.get(key)),
                    "base_vs_candidate": changed.get(key, "identical"),
                    "sstar_vs_candidate": s_cls.get(key, "identical"),
                    "in_candidate": key in cand_funcs,
                    "frame": {"target": (entry or {}).get("frame_target"), "candidate": (t_idx.get(key) or {}).get("frame_compiled")},
                    "target_relocs": sorted(target_relocs),
                    "candidate_relocs": sorted(_function_relocs(cand.elf, cand_funcs[key])) if key in cand_funcs else [],
                    "sstar_relocs": sorted(_function_relocs(sstar.elf, sstar_funcs[key])) if key in sstar_funcs else [],
                    "attribution": [],
                    "call_evidence": [],
                })
            if sstar.elf is not None and cand.elf is not None:
                for sec in sc.compare_data(sstar.elf, cand.elf):
                    if sec["status"] != "identical":
                        errors.append({"unit": name, "variant": "sstar", "kind": "data",
                                       "error": f"data section {sec['name']} {sec['status']} vs candidate"})
            if groups and sstar.elf is not None and cand.elf is not None:
                wanted = [f for f in out_functions if f["unit"] == name]
                if wanted:
                    attribution_jobs.append((name, u, wanted, cand.elf, sstar.elf))
        if groups:
            group_touch = _attribute(backend, revert, groups, attribution_jobs, files_of_unit=files_of,
                                     variant=variant, errors=errors, fidelity=fidelity_units)
            data_evidence = _data_order_evidence(backend, revert, groups, units, built, variant, errors)
            _steering_only_sstar(backend, revert, groups, attribution_jobs, files_of_unit=files_of,
                                 variant=variant, errors=errors, fidelity=fidelity_units)
        compared_units = {c["unit"] for c in coverage if c.get("compared")}
        unused_checks, unused_map = run_unused_checks(backend, base_rev, units, built, files, cand_texts,
                                                      compared_units, edits_hash, inputs_of=files_of)
    finally:
        backend.close()
    missing = [w for w in functions or [] if not any(
        _match_function([f["name"], f["demangled"], f.get("target_name")], [w]) for f in out_functions)]
    return {
        "tool": TOOL,
        "version": VERSION,
        "edits_hash": edits_hash,
        "base_rev": base_rev,
        "revert_edits": sorted(revert),
        "changed_files": sorted(f["path"] for f in files),
        "missing_functions": missing,
        "stack_frame_policy": game_policy.stack_frame_policy(),
        "coverage": coverage,
        "functions": out_functions,
        "data_evidence": data_evidence,
        "group_touch": group_touch,
        "unused_checks": unused_checks,
        "unused_map": unused_map,
        "errors": errors,
        # per unit: the compile command and every candidate / S* build's revert set, object and input hashes
        "fidelity": {"schema": FIDELITY_SCHEMA, "base_rev": base_rev, "edits_hash": edits_hash,
                     "units": fidelity_units},
    }


def _sections(classified: Optional[dict]) -> dict[str, Optional[float]]:
    return {sec["name"]: sec.get("match_percent") for sec in (classified or {}).get("sections", [])}


def _data_order_evidence(backend, revert: set[str], groups: list[dict], units: dict,
                         built: dict, variant, errors: list) -> list[dict]:
    """For retained groups whose revert only changes the data definition order:
    does keeping the move bring the MWCC data sections closer to the target?"""
    out = []
    for g in groups:
        order = g.get("data_order") or {}
        if not order or order.get("verified") or g.get("status") != "unresolved":
            continue
        for name in g.get("units") or []:
            sstar = built.get((name, "sstar"))
            if name not in units or sstar is None or sstar.elf is None:
                continue
            ok, obj, err = backend.compile(units[name], variant(revert | set(g.get("edit_ids") or [])), "dataorder")
            if not ok or obj is None:
                errors.append({"unit": name, "variant": f"data:{g['id']}", "error": (err or "")[:400]})
                continue
            without_elf = sc.ElfObject.from_path(str(obj))
            without = _sections(backend.classify(obj, units[name]))
            with_ = _sections(sstar.target)
            rows = {k: [with_.get(k), without.get(k)] for k in sorted(set(with_) | set(without))}
            better = [k for k, (a, b) in rows.items() if a is not None and b is not None and a > b + 1e-6]
            worse = [k for k, (a, b) in rows.items() if a is not None and b is not None and a < b - 1e-6]
            target_path = backend.target_path(units[name])
            order_rows = {}
            if target_path is not None:
                target_order = data_symbol_order(sc.ElfObject.from_path(str(target_path)))
                with_order, without_order = data_symbol_order(sstar.elf), data_symbol_order(without_elf)
                for sec, names in target_order.items():
                    a = _order_score(with_order.get(sec, []), names)
                    b = _order_score(without_order.get(sec, []), names)
                    if a is None or b is None:
                        continue
                    order_rows[sec] = [a, b]
                    if a > b + 1e-9:
                        better.append(f"{sec} order")
                    elif b > a + 1e-9:
                        worse.append(f"{sec} order")
            diff = sc.compare_objects(sstar.elf, without_elf)
            effect = diff.effect
            changed_fns = sorted(fd.name for fd in diff.functions if fd.cls != "identical")
            same_order = all(a == b for a, b in order_rows.values())
            if effect == "none" and not (same_order and not better and not worse):
                effect = "data_order"  # same bytes, different symbol layout
            out.append({"group": g["id"], "unit": name, "sections": rows, "symbol_order": order_rows,
                        "effect": effect, "functions": changed_fns, "improves": better, "worsens": worse})
    return out


def data_symbol_order(obj: sc.ElfObject) -> dict[str, list[str]]:
    """Allocated data section -> its symbols in address order. Function-local
    statics keep their name without the compiler's number (`init$2966` ->
    `init$`); purely numbered symbols (`@123`, `...bss.0`) are skipped."""
    out: dict[str, list[tuple[int, str]]] = {}
    for sym in obj.symbols:
        if not (0 < sym.shndx < len(obj.sections)) or sym.type in (sc.STT_SECTION, sc.STT_FILE, sc.STT_FUNC):
            continue
        sec = obj.sections[sym.shndx]
        name = sym.name
        if not sec.is_alloc or sec.is_exec or not name or name[0] in "@.":
            continue
        out.setdefault(sec.name, []).append((sym.value, re.sub(r"\$\d+$", "$", name)))
    return {k: [n for _, n in sorted(v)] for k, v in out.items()}


def _order_score(variant: list[str], target: list[str]) -> Optional[float]:
    """Similarity of the shared names' order to the target's (None if < 2 shared)."""
    import difflib

    common = set(variant) & set(target)
    if len(common) < 2:
        return None
    a = [n for n in variant if n in common]
    b = [n for n in target if n in common]
    return round(difflib.SequenceMatcher(None, a, b, autojunk=False).ratio(), 6)


def _mwcc_display(name: str) -> str:
    try:
        import evidence_search

        return evidence_search.demangle(name)[0]
    except Exception:
        return name


def _attribute(backend, revert: set[str], groups: list[dict], jobs: list,
               *, files_of_unit, variant, errors, fidelity: Optional[dict] = None) -> dict[str, dict[str, list[str]]]:
    """Add back each removable group alone to S* (cap per unit, groups adding
    a call always included). Records the MWCC functions each group changes
    (its touch set, returned as {group: {unit: [functions]}}) and the match
    delta for steering functions; for groups that add a call, counts
    relocations to the callee in target / S* / S*+group, and builds
    S** = S* + every group that brings the count up to the target's."""
    removable = [g for g in groups if g.get("status") == "removable" and not g.get("cosmetic")
                 and set(g.get("edit_ids") or []) <= revert]
    touch: dict[str, dict[str, list[str]]] = {}
    for name, u, fns, cand_elf, sstar_elf in jobs:
        relevant = files_of_unit(u)
        cands = [g for g in removable if g.get("file") in relevant]
        steering_fns = [f for f in fns if f["sstar_vs_candidate"] not in (None, "identical")]

        def touches(g, f):
            return not g.get("functions") or _match_function([f["demangled"], f["name"]], g["functions"])

        callers = [g for g in cands if g.get("new_calls")]
        rest = sorted((g for g in cands if not g.get("new_calls")),
                      key=lambda g: (not any(touches(g, f) for f in steering_fns), g["id"]))
        cands = callers + rest[:max(0, TOUCH_CAP - len(callers))]
        if not steering_fns:
            cands = callers  # S* == candidate everywhere: attribution decides nothing
        results = {}

        def build(g):
            keep = revert - set(g["edit_ids"])
            ok, obj, err = backend.compile(u, variant(keep), "attr")
            if not ok or obj is None:
                return g["id"], None, err or "compile failed"
            elf = sc.ElfObject.from_path(str(obj))
            return g["id"], (elf, backend.classify(obj, u)), ""

        with ThreadPoolExecutor(max_workers=max(1, getattr(backend, "jobs", 1))) as ex:
            for gid, data, err in ex.map(build, cands):
                if data is None:
                    errors.append({"unit": name, "variant": f"attr:{gid}", "kind": "attribution", "error": err[:400]})
                else:
                    results[gid] = data
        evidence_groups = []
        for g in cands:
            data = results.get(g["id"])
            if data is None:
                continue
            elf, target = data
            idx = {(e.get("compiled_name") or e["name"]): e for e in (target or {}).get("functions", [])}
            keyed = elf.keyed_functions()
            touch.setdefault(g["id"], {})[name] = sorted(
                fd.name for fd in sc.compare_objects(sstar_elf, elf).functions if fd.cls != "identical")
            for f in fns:
                with_entry = idx.get(f["name"])
                base_pct = (f["real_only"] or {}).get("match_percent")
                if with_entry is not None and base_pct is not None and f["sstar_vs_candidate"] not in (None, "identical"):
                    f["attribution"].append({"group": g["id"],
                                             "delta": round(float(with_entry["match_percent"]) - base_pct, 4)})
                for callee in g.get("new_calls") or []:
                    if not touches(g, f):
                        continue
                    t = sum(1 for s in f["target_relocs"] if _sym_is(s, callee))
                    s = sum(1 for x in f["sstar_relocs"] if _sym_is(x, callee))
                    w = sum(1 for x in (_function_relocs(elf, keyed[f["name"]]) if f["name"] in keyed else [])
                            if _sym_is(x, callee))
                    row = {"group": g["id"], "callee": callee, "target": t, "sstar": s, "with": w,
                           "relocs_ok": t > 0 and w == t and s < t}
                    f["call_evidence"].append(row)
                    if row["relocs_ok"] and g["id"] not in evidence_groups:
                        evidence_groups.append(g["id"])
        if evidence_groups:
            keep_ids = set()
            for g in groups:
                if g["id"] in evidence_groups:
                    keep_ids |= set(g["edit_ids"])
            ok, obj, err = backend.compile(u, variant(revert - keep_ids), "sstar2")
            if not ok or obj is None:
                errors.append({"unit": name, "variant": "sstar_evidence", "error": (err or "")[:400]})
                continue
            if fidelity is not None and name in fidelity:
                fidelity[name]["builds"]["sstar_evidence"] = fidelity_build(backend, obj, "evidence_sstar", revert - keep_ids)
            elf = sc.ElfObject.from_path(str(obj))
            target = backend.classify(obj, u)
            idx = {(e.get("compiled_name") or e["name"]): e for e in (target or {}).get("functions", [])}
            cls = {fd.name: fd.cls for fd in sc.compare_objects(elf, cand_elf).functions}
            for f in fns:
                f["evidence_sstar"] = {"groups": evidence_groups, "real_only": _status(idx.get(f["name"])),
                                       "sstar_vs_candidate": cls.get(f["name"], "identical")}
    return touch


def steering_only_retained(g: dict) -> bool:
    """Retained because the IR changes, yet only steering shapes explain it
    (e.g. a call hoisted across another call). Never credited; for labels
    and probes the gate also measures S* without it."""
    shapes = [s for s in g.get("shapes") or [] if s != "cosmetic"]
    return (g.get("status") == "unresolved" and not g.get("compile_blocked") and not g.get("incomplete")
            and not g.get("data_order") and not g.get("real_shapes") and bool(shapes)
            and all(s in STEERING for s in shapes))


def _steering_only_sstar(backend, revert: set[str], groups: list[dict], jobs: list,
                         *, files_of_unit, variant, errors, fidelity: Optional[dict] = None) -> None:
    """S** = S* with the steering-only retained groups reverted too, per unit."""
    picked = [g for g in groups if steering_only_retained(g)]
    if not picked:
        return
    for name, u, fns, cand_elf, sstar_elf in jobs:
        relevant = files_of_unit(u)
        mine = [g for g in picked if g.get("file") in relevant and name in (g.get("units") or [])]
        if not mine:
            continue
        ids = set().union(*(set(g.get("edit_ids") or []) for g in mine))
        ok, obj, err = backend.compile(u, variant(revert | ids), "sstar_steer")
        if not ok or obj is None:
            errors.append({"unit": name, "variant": "sstar_steering", "kind": "attribution", "error": (err or "")[:400]})
            continue
        if fidelity is not None and name in fidelity:
            fidelity[name]["builds"]["sstar_steering"] = fidelity_build(backend, obj, "steering_sstar", revert | ids)
        elf = sc.ElfObject.from_path(str(obj))
        idx = {(e.get("compiled_name") or e["name"]): e for e in (backend.classify(obj, u) or {}).get("functions", [])}
        cls = {fd.name: fd.cls for fd in sc.compare_objects(elf, cand_elf).functions}
        for f in fns:
            f["steering_sstar"] = {"groups": [g["id"] for g in mine], "real_only": _status(idx.get(f["name"])),
                                   "sstar_vs_candidate": cls.get(f["name"], "identical")}


# --------------------------------------------------------------------------
# UNUSED functions: the stub test (objectives/sms-real-codegen/unused-rule.md)
#
# A function the original link map marks UNUSED for a unit (dead-stripped)
# may only get a body when the original inlined it into another function of
# the same TU. Test: C' = C with that body stubbed (signature kept); if no
# function present in the target object changes status or match, the body is
# dead (rule violation); if some do, it was inlined (allowed, callers are the
# evidence); if C' does not build, the test is inconclusive.
# --------------------------------------------------------------------------

UNUSED_CHECK_CAP = 32  # stub builds per attempt; beyond it the remaining checks are inconclusive
UNUSED_STUBS = ("{ }", "{ return 0; }")
_PARAM_DROP = {"const", "volatile", "struct", "class", "enum", "union", "register", "typename"}
_BUILTIN_WORDS = {"void", "bool", "char", "short", "int", "long", "float", "double", "signed", "unsigned", "wchar_t"}
_TYPE_FOLD = {  # typedef spellings -> the builtin spelling the demangler prints (int and long folded)
    "s8": "signed char", "u8": "unsigned char", "s16": "short", "u16": "unsigned short", "s32": "long",
    "u32": "unsigned long", "s64": "long long", "u64": "unsigned long long", "f32": "float", "f64": "double",
    "int": "long", "BOOL": "long", "vu8": "unsigned char", "vu16": "unsigned short", "vu32": "unsigned long",
    "vs32": "long", "vf32": "float", "intptr_t": "long", "uintptr_t": "unsigned long", "size_t": "unsigned long",
}
_CONST_WORDS = {"true", "false", "NULL", "nullptr", "TRUE", "FALSE"} | _BUILTIN_WORDS | set(_TYPE_FOLD)
_CONST_PUNCT = set("-+~!()|^%/\"'") | {"<<", ">>"}
_DECL_STORAGE = {"static", "inline", "virtual", "explicit", "extern", "friend", "const", "volatile", "asm"}


@dataclass
class FunctionDef:
    """One function definition in source text (offsets into that text)."""
    qualified: str  # `T::f`, whitespace removed
    start: int  # first character of the declaration
    open: int  # `{` of the body
    close: int  # matching `}`
    params: Optional[list[str]]  # canonical parameter types, None when unparsable
    void: bool  # stub `{ }` (void, constructor, destructor) or `{ return 0; }`
    line: int  # 1-based line of `start`
    trivial: bool  # empty, `return;` or `return <constant>;`
    ret: str = ""  # return type as written (storage words dropped); "" for constructors/destructors


def _split_top_commas(text: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in text:
        if ch in "(<[":
            depth += 1
        elif ch in ")>]":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur)
            cur = ""
            continue
        cur += ch
    parts.append(cur)
    return parts


def canonical_params(text: str) -> Optional[list[str]]:
    """Parameter types of a parameter list (source or demangled): names,
    default arguments and cv-qualifiers dropped, typedef spellings folded."""
    text = text.strip()
    if text in ("", "void"):
        return []
    out = []
    for part in _split_top_commas(text):
        part = part.split("=", 1)[0]
        if "(" in part:  # function pointer parameter: keep its raw shape
            out.append(re.sub(r"\s+", "", part))
            continue
        toks = [t for t in re.findall(r"[A-Za-z_]\w*|::|\.\.\.|[*&\[\]<>]", part) if t not in _PARAM_DROP]
        idents = [i for i, t in enumerate(toks) if re.match(r"[A-Za-z_]", t)]
        if len(idents) >= 2:
            last = idents[-1]
            if (toks[last] not in _BUILTIN_WORDS and (last == len(toks) - 1 or toks[last + 1] == "[")
                    and toks[last - 1] != "::"):
                del toks[last]
        words = " ".join(_TYPE_FOLD.get(t, t) for t in toks).split()
        if words in (["unsigned"], ["signed"]):
            words = words + ["long"]  # bare `unsigned` is `unsigned int` (int and long fold together)
        words = [w for w in words if w != "signed" or "char" in words]
        lead = [w for w in words if w in ("unsigned", "signed")]  # the demangler prints `long unsigned`
        words = lead + [w for w in words if w not in ("unsigned", "signed")] if lead else words
        s = " ".join(words).replace("[ ]", "*").replace(" ::", "::").replace(":: ", "::")
        if not s:
            return None
        out.append(s)
    return out


def _trivial_body(code_body: str) -> bool:
    """Empty, `return;` or `return <constant>;` (comments and literal contents
    already blanked). Constants are literals, true/false/NULL, builtin-type
    casts and ALL-CAPS enum/constant names combined with side-effect-free
    arithmetic; a call, `++`/`--`, `*`, `&`, `->`, `.`, `[` or assignment makes
    the body non-trivial (conservative: a non-trivial base body is never stubbed)."""
    s = re.sub(r"^[\s;]+|[\s;]+$", "", code_body)
    if not s:
        return True
    m = re.fullmatch(r"return\b(.*)", s, re.S)
    if not m:
        return False
    expr = m.group(1).strip()
    if not expr:
        return True
    if re.search(r"\+\+|--|->|=|\[|;", expr):
        return False
    toks = re.findall(r"\d[\w.]*|\.\d[\w.]*|[A-Za-z_]\w*|<<|>>|\S", expr)
    for i, tok in enumerate(toks):
        nxt = toks[i + 1] if i + 1 < len(toks) else ""
        if tok[0].isdigit() or (tok[0] == "." and len(tok) > 1):
            continue
        if re.match(r"[A-Za-z_]", tok):
            if nxt == "(":
                return False  # a call (or functional cast): not a constant
            if tok in _CONST_WORDS or re.fullmatch(r"[A-Z][A-Z0-9_]*", tok):
                continue
            return False
        if tok not in _CONST_PUNCT:
            return False
    return True


def function_defs(text: Optional[str]) -> list[FunctionDef]:
    """Every function definition in `text`: out-of-class `T::f(...)` and
    in-class bodies (comments, literals and preprocessor lines aware)."""
    if not text:
        return []
    import evidence_search as es

    code = es.strip_code(text)
    out = []
    for qual, start, open_, close in es._source_functions(code, 0, len(code)):
        decl = code[start:open_]
        access = es.ACCESS_RE.match(decl)
        if access:
            start += access.end()
            decl = decl[access.end():]
        lead = len(decl) - len(decl.lstrip())
        start += lead
        decl = decl.strip()
        head_m = None
        paren = -1
        for m in re.finditer(r"\(", decl):
            hm = es.QUALIFIED_BEFORE_PAREN_RE.search(decl[:m.start()])
            if hm:
                head_m, paren = hm, m.start()
                break
        if head_m is None:
            continue
        close_p = es._match_paren(decl, paren)
        params = canonical_params(decl[paren + 1:close_p]) if close_p > paren else None
        name = re.sub(r"\s+", "", head_m.group(1))
        parts = name.split("::")
        lead_text = re.sub(r"\btemplate\s*<[^{};]*?>", " ", decl[:head_m.start()])
        prefix = [w for w in re.findall(r"[A-Za-z_]\w*|[*&]", lead_text) if w not in _DECL_STORAGE]
        ctor_dtor = parts[-1].startswith("~") or (len(qual.split("::")) >= 2 and
                                                  qual.split("::")[-1] == qual.split("::")[-2])
        void = ctor_dtor or prefix == ["void"] or not prefix
        ret = "" if ctor_dtor else re.sub(r"\s+", " ", " ".join(
            w for w in re.findall(r"[A-Za-z_]\w*(?:\s*<[^;{}]*>)?|::|[*&]", lead_text)
            if w not in _DECL_STORAGE - {"const", "volatile"} and w not in ("inline", "static", "virtual"))).strip()
        ret = re.sub(r"\s*::\s*", "::", ret)
        out.append(FunctionDef(
            qualified=re.sub(r"\s+", "", qual), start=start, open=open_, close=close, params=params, void=void,
            line=text.count("\n", 0, start) + 1, trivial=_trivial_body(code[open_ + 1:close]), ret=ret))
    return out


def _qual_eq(a: str, b: str) -> bool:
    import evidence_search as es

    a, b = re.sub(r"\s+", "", a), re.sub(r"\s+", "", b)
    if a == b:
        return True
    a, b = es._strip_templates(a), es._strip_templates(b)
    if a == b:
        return True
    short, long_ = sorted((a, b), key=len)
    return "::" in short and long_.endswith("::" + short)


def match_defs(defs: list[FunctionDef], qualified: str, params: Optional[list[str]]) -> list[FunctionDef]:
    """Definitions of `qualified` with `params`: an exact parameter match, else
    every definition with the same parameter count (ambiguous: all of them),
    else every same-name definition whose parameters could not be parsed."""
    named = [d for d in defs if _qual_eq(d.qualified, qualified)]
    if params is None or not named:
        return named
    counted = [d for d in named if d.params is not None and len(d.params) == len(params)]
    exact = [d for d in counted if d.params == params]
    return exact or counted or [d for d in named if d.params is None]


def _base_defs(base_defs: list[FunctionDef], d: FunctionDef) -> list[FunctionDef]:
    """Base definitions of the same function: the same parameter list, else
    same-name definitions whose parameters could not be parsed (identity
    unresolved). Known different signatures are different overloads."""
    named = [b for b in base_defs if _qual_eq(b.qualified, d.qualified)]
    exact = [b for b in named if b.params is not None and b.params == d.params]
    return exact or [b for b in named if b.params is None or d.params is None]


def demangled_symbol(mangled: str) -> dict:
    """{mangled, function (display), qualified, params} for a map symbol."""
    import evidence_search as es

    readable, qualified = es.demangle(mangled)
    params = None
    i = readable.find("(", len(qualified))
    if i >= 0:
        j = es._match_paren(readable, i)
        if j > i:
            params = canonical_params(readable[i + 1:j])
            readable = qualified + readable[i:]
    return {"mangled": mangled, "function": readable, "qualified": qualified, "params": params}


_SCALAR_WORDS = _BUILTIN_WORDS | {"s8", "u8", "s16", "u16", "s32", "u32", "s64", "u64", "f32", "f64", "BOOL",
                                   "size_t", "intptr_t", "uintptr_t", "vu8", "vu16", "vu32", "vs32", "vf32"}


def stub_label(d: FunctionDef) -> str:
    """A stub body that compiles for d's return type (signature kept):
    void/constructor/destructor `{ }`; scalar or pointer `{ return 0; }`;
    reference `{ return *(T*)0; }`; anything else by value (a class, an enum
    or typedef we cannot classify) `{ T* p = 0; return *p; }`."""
    if d.void:
        return UNUSED_STUBS[0]
    ret = d.ret.strip()
    if not ret:
        return UNUSED_STUBS[1]
    if ret.endswith("&"):
        target = ret.rstrip("&").strip()
        return f"{{ return *({target}*)0; }}"
    if ret.endswith("*"):
        return UNUSED_STUBS[1]
    words = [w for w in re.findall(r"[A-Za-z_]\w*", ret) if w not in ("const", "volatile")]
    if words and all(w in _SCALAR_WORDS for w in words):
        return UNUSED_STUBS[1]
    value = re.sub(r"^\s*const\s+", "", ret)
    return f"{{ {value}* p = 0; return *p; }}"


def stub_definition(text: str, d: FunctionDef) -> tuple[str, str]:
    """`text` with d's body replaced by a stub (see stub_label), line count
    preserved (asserts embed __LINE__). Returns (new text, stub label)."""
    label = stub_label(d)
    k = text.count("\n", d.open, d.close)
    body = label if k == 0 else label[:-1].rstrip() + "\n" * k + "}"
    return text[:d.open] + body + text[d.close + 1:], label


_MAP_CACHE: dict[tuple, Any] = {}


def _link_map(repo: Path, base_rev: str, version: str):
    """The link map at `base_rev` (`git show`), else the checkout's map file
    (the map is usually untracked, as in the map-call evidence). Cached."""
    import evidence_search as es

    key = (str(repo), base_rev, version)
    if key in _MAP_CACHE:
        return _MAP_CACHE[key]
    link = None
    listed = git(repo, "ls-tree", "-r", "--name-only", base_rev, "--", f"orig/{version}", check=False)
    names = [n for n in listed.stdout.decode().splitlines() if n.lower().endswith(".map")] if listed.returncode == 0 else []
    if names:
        blob = git(repo, "rev-parse", f"{base_rev}:{names[0]}", check=False).stdout.decode().strip()
        data = git_show(repo, base_rev, names[0])
        if data is not None:
            cache_file = es.cache_dir() / f"map-git-{es.PARSER_VERSION}-{blob}.json"
            parsed = None
            if cache_file.is_file():
                try:
                    parsed = json.loads(cache_file.read_text())
                except (OSError, ValueError):
                    parsed = None
            if parsed is None:
                parsed = es.parse_map_text(se.decode(data) or "")
                try:
                    cache_file.parent.mkdir(parents=True, exist_ok=True)
                    cache_file.write_text(json.dumps(parsed, separators=(",", ":")))
                except OSError:
                    pass
            link = es.LinkMap(parsed, Path(f"{base_rev}:{names[0]}"))
    if link is None:
        link = es.load_map(repo, version)
    _MAP_CACHE[key] = link
    return link


def map_unused(repo: Path, base_rev: str, version: str, source: str,
               reasons: Optional[dict] = None) -> Optional[list[dict]]:
    """UNUSED `.text` symbols the map lists for the unit built from `source`
    (matched by object file name), demangled. None when the map is missing or
    unreadable, or the unit's object is not in it (`reasons[source]` says which)."""
    import evidence_search as es

    def fail(why: str) -> None:
        if reasons is not None:
            reasons[source] = why
        return None

    try:
        link = _link_map(Path(repo), base_rev, version)
    except Exception as e:
        return fail(f"link map unreadable: {type(e).__name__}: {e}")
    if link is None:
        import unit_progress

        return fail(unit_progress.missing_map_message(repo, version))
    _, objects = es._map_objects_for_unit(Path(repo), link, source)
    if not objects:
        return fail(f"{source}: no object in the link map")
    out = []
    for section, name, size, vaddr, obj in link.rows:
        if section == ".text" and vaddr is None and obj in objects and name != ".text":
            out.append(dict(demangled_symbol(name), size=size))
    return out


def signature_index(repo: Optional[Path | str], rev: Optional[str], texts: Optional[dict[str, Optional[str]]] = None):
    """signatures.TypeIndex for exact function identity: the repo's headers and
    sources at `rev` with `texts` (candidate files) overlaid; texts only
    without a repo/rev."""
    import signatures

    overlay = {p: t for p, t in (texts or {}).items() if t is not None}
    if repo is not None and rev:
        try:
            return signatures.TypeIndex.from_git(Path(repo), rev).with_texts(overlay)
        except Exception:
            pass
    return signatures.TypeIndex.from_texts(overlay)


def _signature_identity(sig, sym: dict) -> Optional[bool]:
    """Exact identity of a source definition and a map symbol: True / False / None (undecidable).
    Undecidable only counts for a definition with the symbol's qualified name."""
    import signatures

    m = signatures.matches(sig, sym["mangled"])
    if m is None and not any(_qual_eq(q, sym["qualified"]) for q, *_ in (getattr(sig, "variants", ()) or
                                                                         [(sig.qualified,)])):
        return False
    return m


def unused_candidates(base_text: Optional[str], cand_text: Optional[str], symbols: list[dict], *,
                      index=None, path: str = "") -> list[dict]:
    """(symbol, definition) pairs to stub-test: UNUSED in the map, a non-trivial
    body in the candidate, a trivial stub or no definition in the base.

    Identity is exact (signatures.matches: fully resolved parameter types,
    typedefs and namespaces from `index`): a known different signature is
    another function. A candidate definition whose identity is undecidable,
    or a base body whose identity with it is undecidable, is still tested but
    marked `unresolved` (the check becomes inconclusive)."""
    import signatures
    import preprocess

    index = index if index is not None else signature_index(None, None, {path or "<cand>": cand_text})
    cdefs = {d.open: d for d in function_defs(cand_text)}
    bdefs = {d.open: d for d in function_defs(base_text)}
    csigs = [g for g in signatures.source_signatures(preprocess.active_text(cand_text or "", unknown="active"),
                                                     index, path) if g.open in cdefs]
    # the base side exempts (positive evidence): only certainly active definitions count
    bsigs = [g for g in signatures.source_signatures(preprocess.active_text(base_text or "", unknown="inactive"),
                                                     index, path) if g.open in bdefs] if base_text else []
    def norm_def(text: str, d) -> str:
        return re.sub(r"\s+", " ", text[d.start:d.close + 1]).strip()

    unchanged = {norm_def(base_text, bdefs[g.open]) for g in bsigs} if base_text else set()
    out, seen = [], set()
    for sym in symbols:
        for g in csigs:
            ident = _signature_identity(g, sym)
            if ident is False:
                continue
            d = cdefs[g.open]
            if d.trivial or d.open in seen or norm_def(cand_text, d) in unchanged:
                continue  # trivial, already taken, or the same definition the base already had
            base = [(bdefs[b.open], _signature_identity(b, sym)) for b in bsigs]
            if any(not bd.trivial for bd, bi in base if bi is True):
                continue  # the base already had a body: not a reconstruction
            seen.add(d.open)
            row = {"symbol": sym, "def": d}
            if ident is None:
                row["unresolved"] = f"the definition's signature cannot be resolved exactly against {sym['mangled']}"
            elif any(not bd.trivial for bd, bi in base if bi is None):
                row["unresolved"] = "a base definition of the same name already has a body and its identity is undecidable"
            out.append(row)
    return out


def target_changes(before: Optional[dict], after: Optional[dict]) -> list[dict]:
    """Target-present functions whose status or match differs between two
    classifications of the same unit: {function, name, before, after}."""
    a_idx = {e["name"]: e for e in (after or {}).get("functions", [])}
    out = []
    for e in (before or {}).get("functions", []):
        x = a_idx.get(e["name"])
        sb = _status(e)
        sa = _status(x) if x is not None else {"status": "missing", "match_percent": 0.0}
        if sb != sa:
            out.append({"function": _display_target(e), "name": e["name"], "before": sb, "after": sa})
    return out


def _display_target(entry: dict) -> str:
    dem = entry.get("demangled")
    return re.sub(r"\s+\(", "(", dem) if dem else entry["name"]


def _worse(before: dict, after: dict) -> bool:
    """Lower status tier (exact/stack_only -> mismatch/missing) or a lower match."""
    return sc.status_rank(after) < sc.status_rank(before)


def _refers_to(sym: str, mangled: Optional[str], qualified: str) -> bool:
    if mangled and sym == mangled:
        return True
    return normalize_name(_mwcc_qualified(sym)) == normalize_name(qualified)


def _target_calls(backend, unit, names: list[str], mangled: Optional[str], qualified: str) -> dict[str, bool]:
    """Target function name -> does its target code relocate to F? (None
    target object: every caller unknown -> treated as calling.)"""
    path = backend.target_path(unit) if hasattr(backend, "target_path") else None
    if path is None:
        return {n: True for n in names}
    try:
        elf = sc.ElfObject.from_path(str(path))
    except (OSError, ValueError):
        return {n: True for n in names}
    funcs = elf.keyed_functions()
    out = {}
    for n in names:
        fn = funcs.get(n)
        out[n] = fn is None or any(_refers_to(r, mangled, qualified) for r in _function_relocs(elf, fn))
    return out


def body_sha256(text: str, d: FunctionDef) -> str:
    """sha256 of the candidate definition's body (`{` .. `}`), binding the evidence to the patch."""
    return hashlib.sha256(text[d.open:d.close + 1].encode("utf-8")).hexdigest()


def stub_test(backend, unit, texts: dict[str, Optional[bytes]], source: str, cand_text: str, d: FunctionDef,
              before: Optional[dict], symbol: Optional[dict] = None) -> dict:
    """Build C' (the candidate with d stubbed) and classify it against `before`
    (the candidate's target classification, same unit).

    inlined needs positive evidence: some function of this unit gets worse
    with the body emptied and its target code does not call F out of line
    (an UNUSED F cannot be called). Worse callers that do call F, or changes
    that only improve functions -> inconclusive (needs review). No change -> dead.
    """
    stubbed, label = stub_definition(cand_text, d)
    row = {"stub": label, "changed": [], "callers": [], "line": d.line, "body_sha256": body_sha256(cand_text, d)}
    if before is None:
        return dict(row, status="inconclusive", reason="no target classification for the candidate object")
    ok, obj, err = backend.compile(unit, dict(texts, **{source: se.encode(stubbed)}), "unused")
    if not ok or obj is None:
        return dict(row, status="inconclusive", reason="stub build failed: " + (err or "compile failed")[:300])
    after = backend.classify(obj, unit)
    if after is None:
        return dict(row, status="inconclusive", reason="no target classification for the stub object")
    changed = target_changes(before, after)
    if not changed:
        return dict(row, status="dead",
                    reason="no target-present function changes status or match with the body stubbed")
    mangled = (symbol or {}).get("mangled")
    qualified = (symbol or {}).get("qualified") or d.qualified
    # the stubbed function itself is never its own inline caller
    worse = [c for c in changed if _worse(c["before"], c["after"]) and not _refers_to(c["name"], mangled, qualified)]
    calls = _target_calls(backend, unit, [c["name"] for c in worse], mangled, qualified)
    callers = [{"function": c["function"], "before": c["before"], "after": c["after"],
                "delta": round(c["after"]["match_percent"] - c["before"]["match_percent"], 4)}
               for c in worse if not calls.get(c["name"])]
    outline = [c["function"] for c in worse if calls.get(c["name"])]
    row["changed"] = [{k: v for k, v in c.items() if k != "name"} for c in changed]
    row["callers"] = callers
    if outline:
        return dict(row, status="inconclusive",
                    reason="target code calls the UNUSED function out of line in: " + ", ".join(outline[:4]))
    if callers:
        return dict(row, status="inlined",
                    reason=f"{len(callers)} function(s) of this unit get worse with the body stubbed: "
                    + ", ".join(f"{c['function']} {c['before']['match_percent']}% -> {c['after']['match_percent']}%"
                                for c in callers[:4]))
    return dict(row, status="inconclusive",
                reason="stubbing the body only improves functions (" + ", ".join(
                    c["function"] for c in changed[:4]) + "): no positive inlining evidence, needs review")


def unit_inputs_sha256(paths: Iterable[str], read: Callable[[str], Optional[bytes]]) -> str:
    """sha256 over the unit's inputs, sorted by path: `path NUL len NUL bytes`
    (a missing file: length `-1`, no bytes). Same formula as the TS
    `unitInputsSha256` (cross-language vector in the steering fixtures)."""
    h = hashlib.sha256()
    for path in sorted(set(paths)):
        data = read(path)
        h.update(path.encode("utf-8") + b"\0" + str(-1 if data is None else len(data)).encode() + b"\0")
        if data:
            h.update(data)
    return h.hexdigest()


def _read_bytes(root: Optional[Path], rel: str) -> Optional[bytes]:
    if root is None:
        return None
    p = Path(root) / rel
    return p.read_bytes() if p.is_file() else None


_INCLUDE_ANY = re.compile(r"^\s*#\s*include\b(.*)$", re.M)
_INCLUDE_LITERAL = re.compile(r'^\s*([<"])([^>"]+)[>"]')


def include_closure(source: str, read: Callable[[str], Optional[bytes]],
                    include_dirs: Sequence[str]) -> tuple[set[str], bool]:
    """(files, complete): repo-relative files `source` includes, transitively (every
    branch followed, undecidable ones included), resolved like the compiler (`"x"`
    next to the including file first, then the include directories). `complete` is
    False when any `#include` is not a literal `"x"`/`<x>` (e.g. `#include HEADER`)
    or does not resolve to a readable file: the set may then miss inputs."""
    seen, todo, complete = set(), [source], True
    while todo:
        path = todo.pop()
        if path in seen:
            continue
        data = read(path)
        if data is None:
            complete = False
            continue
        seen.add(path)
        for m in _INCLUDE_ANY.finditer(se.decode(data) or ""):
            lit = _INCLUDE_LITERAL.match(re.sub(r"/\*.*?\*/|//.*$", "", m.group(1)))
            if not lit:
                complete = False  # computed (macro) include: the target is unknown
                continue
            kind, inc = lit.groups()
            here = [str(Path(path).parent / inc)] if kind == '"' else []
            hits = [os.path.normpath(c) for c in here + [f"{d.rstrip('/')}/{inc}" for d in include_dirs]]
            hits = [c for c in hits if read(c) is not None]
            if not hits:
                complete = False
                continue
            todo.append(hits[0])
    return seen, complete


def unit_inputs_of(backend, unit, cand_texts: dict[str, Optional[bytes]]) -> Optional[list[str]]:
    """Every tracked input of the unit at the candidate: its source plus every header the object
    depends on. The build's dependency data (ninja deps) is authoritative when it exists; the
    candidate's resolvable literal includes are added (a newly added include counts). Without
    deps the include closure must be complete (no computed or unresolvable include), else None."""
    root = getattr(backend, "root", None)

    def read(p: str) -> Optional[bytes]:
        return cand_texts[p] if p in cand_texts else _read_bytes(root, p)

    dirs = backend.include_dirs(unit) if hasattr(backend, "include_dirs") else ["include"]
    deps = backend.deps(unit) if hasattr(backend, "deps") else None
    closure, complete = include_closure(unit.source, read, dirs)
    if deps is None and not complete:
        return None
    return sorted({unit.source} | (deps or set()) | closure)


def run_unused_checks(backend, base_rev: str, units: dict, built: dict, files: list[dict],
                      cand_texts: dict[str, Optional[bytes]], compared: set[str],
                      edits_hash: Optional[str] = None,
                      inputs_of: Optional[Callable[[Any], set]] = None) -> tuple[list[dict], dict]:
    """The stub test for every touched unit whose source changed (mwcc step).
    `inputs_of(unit)`: the changed files the unit compiles (its source + the
    changed headers it includes, from the build's dependency data)."""
    by_path = {f["path"]: f for f in files}
    jobs, map_info = [], {}
    for name, u in sorted(units.items()):
        f = by_path.get(u.source)
        if f is None or not f.get("cand_exists") or not hasattr(backend, "unused"):
            continue
        symbols = backend.unused(u, base_rev)
        map_info[name] = {"available": symbols is not None, "unused": len(symbols or []),
                          "reason": (getattr(backend, "unused_reasons", None) or {}).get(name, "")
                          if symbols is None else ""}
        if not symbols:
            continue
        index = signature_index(getattr(backend, "root", None), base_rev,
                                {x["path"]: x.get("cand_text") for x in files})
        for c in unused_candidates(f["base_text"], f["cand_text"], symbols, index=index, path=f["path"]):
            jobs.append((name, u, f, c))
    rows: list[dict] = []

    def one(job):
        name, u, f, c = job
        sym, d = c["symbol"], c["def"]
        head = {"unit": name, "file": u.source, "function": sym["function"], "mangled": sym["mangled"]}
        if c.get("unresolved"):
            return dict(head, status="inconclusive", stub=stub_label(d),
                        changed=[], callers=[], reason="function identity unresolved: " + c["unresolved"],
                        line=d.line, body_sha256=body_sha256(f["cand_text"], d))
        if name not in compared:
            return dict(head, status="inconclusive", stub=stub_label(d),
                        changed=[], callers=[], reason="the unit's candidate was not built and compared",
                        line=d.line, body_sha256=body_sha256(f["cand_text"], d))
        cand = built.get((name, "cand"))
        return dict(head, **stub_test(backend, u, cand_texts, u.source, f["cand_text"], d,
                                      cand.target if cand is not None else None, sym))

    capped = jobs[UNUSED_CHECK_CAP:]
    with ThreadPoolExecutor(max_workers=max(1, getattr(backend, "jobs", 1))) as ex:
        rows += list(ex.map(one, jobs[:UNUSED_CHECK_CAP]))
    for name, u, f, c in capped:
        d = c["def"]
        rows.append({"unit": name, "file": u.source, "function": c["symbol"]["function"],
                     "mangled": c["symbol"]["mangled"], "status": "inconclusive",
                     "stub": stub_label(d), "changed": [], "callers": [],
                     "reason": f"over the stub-test cap ({UNUSED_CHECK_CAP})", "line": d.line,
                     "body_sha256": body_sha256(f["cand_text"], d)})
    root = getattr(backend, "root", None)
    inputs_cache: dict[str, Optional[list[str]]] = {}
    for r in rows:  # bind the evidence to the patch it was measured on, the unit's inputs and its flags
        r["base_rev"], r["edits_hash"] = base_rev, edits_hash
        u = units[r["unit"]]
        if r["unit"] not in inputs_cache:
            inputs_cache[r["unit"]] = unit_inputs_of(backend, u, cand_texts)
        inputs = inputs_cache[r["unit"]]
        if inputs is None:
            r["status"] = "inconclusive"
            r["reason"] = ("the unit's inputs cannot be determined (no build dependencies and an unresolved "
                           "#include): the certificate could not be bound; " + (r.get("reason") or ""))[:400]
            inputs = [u.source]
        r["unit_inputs"] = inputs
        r["unit_inputs_sha256"] = unit_inputs_sha256(inputs, lambda p: cand_texts[p] if p in cand_texts
                                                     else _read_bytes(root, p))
        flags = backend.unit_flags(u) if hasattr(backend, "unit_flags") else None
        r["unit_flags_sha256"] = hashlib.sha256(flags.encode("utf-8")).hexdigest() if flags is not None else None
    order = ("unit", "file", "function", "mangled", "status", "stub", "changed", "callers", "reason", "line",
             "base_rev", "edits_hash", "body_sha256", "unit_inputs", "unit_inputs_sha256", "unit_flags_sha256")
    return [{k: r.get(k) for k in order} for r in rows], map_info


# --------------------------------------------------------------------------
# Decompile in order (objectives/sms-real-codegen/order-rule.md)
#
# Added lines in an order-gated file (MarNameRefGen*.cpp) may only reference
# classes that are construct-ready at the base revision (readiness.py: the
# owner source defines the target's strong constructors). reduce records the
# references (host side, it has the texts); decide resolves them against the
# evidence (host) repo's target objects and link map.
# --------------------------------------------------------------------------

_NEW_RE = re.compile(r"\bnew\s+((?:[A-Za-z_]\w*\s*::\s*)*[A-Za-z_]\w*)")
_SCOPE_RE = re.compile(r"\b(T[A-Z0-9]\w*)\s*::")
_CALL_RE = re.compile(r"\b(T[A-Z0-9]\w*)\s*\(")
_INCLUDE_RE = re.compile(r"^\s*#\s*include\s*[<\"]([^>\"]+)[>\"]")
_CLASS_DECL_RE = re.compile(r"\b(?:class|struct)\s+([A-Za-z_]\w*)\s*(?:final\s*)?[:{]")


def _gated(path: str) -> bool:
    import fnmatch

    return any(fnmatch.fnmatchcase(path, p) for p in order_policy().get("gatedPaths") or [])


def _header_text(manifest: dict, repo: Optional[Path], include: str) -> Optional[str]:
    """Candidate text of an included header (changed files first, then base_rev, then the checkout)."""
    rels = [f"include/{include}", include] + [f"{p}/{include}" for p in ("libs", "src")]
    for f in manifest.get("files") or []:
        if f["path"] in rels or f["path"].endswith("/include/" + include):
            return f.get("cand_text")
    if repo is None:
        return None
    for rel in rels:
        data = git_show(repo, manifest.get("base_rev") or "HEAD", rel)
        if data is not None:
            return se.decode(data)
    return None


_QUAL = r"(?:::\s*)?(?:[A-Za-z_]\w*\s*(?:<[^;{}()]*?>)?\s*::\s*)*"
_REF_NEW_RE = re.compile(r"\bnew\b\s*(?:\((?:[^()]|\([^()]*\))*\)\s*)?(?P<name>" + _QUAL + r"[A-Za-z_]\w*)", re.S)
_REF_NEW_PAREN_RE = re.compile(r"\bnew\s*\(\s*(?P<name>" + _QUAL + r"[A-Za-z_]\w*)\s*\)(?!\s*[\w(:])", re.S)
_REF_SCOPE_RE = re.compile(r"(?<![\w:])(?P<name>" + _QUAL + r"T[A-Z0-9]\w*)\s*::", re.S)
_REF_CALL_RE = re.compile(r"(?<![\w:])(?P<name>" + _QUAL + r"T[A-Z0-9]\w*)\s*\(", re.S)
_REF_KEYWORDS = {"new", "delete", "return", "sizeof", "const", "volatile", "operator"}


def class_references(text: str) -> list[dict]:
    """Class references in code: `new X`, placement `new (arena) X`, `new (X)`,
    `TX::`, `TX(` matched over the whole token stream (an expression may span
    lines). Comments and literals are blanked first (offsets preserved); the
    caller decides which preprocessor branches count. Rows: {class (qualified
    as written, whitespace and a leading `::` removed), via: new|scope|call,
    start (of the whole match, e.g. the `new` keyword), end (of the name)}."""
    import evidence_search as es

    code = es.strip_code(text or "")
    out, spans = [], set()
    for via, rx in (("new", _REF_NEW_RE), ("new", _REF_NEW_PAREN_RE), ("scope", _REF_SCOPE_RE), ("call", _REF_CALL_RE)):
        for m in rx.finditer(code):
            name = re.sub(r"\s+", "", m.group("name")).lstrip(":")
            if name.split("::")[-1] in _REF_KEYWORDS:
                continue
            if ("new", m.start("name")) in spans and via != "new":
                continue  # `new X(` is one construction, not also a call
            spans.add((via, m.start("name")))
            out.append({"class": name, "via": via, "start": m.start(), "end": m.end("name")})
    out.sort(key=lambda r: (r["start"], r["via"]))
    return out


def added_references(path: str, base_text: Optional[str], cand_text: str, refs: list[dict]) -> list[dict]:
    """The references whose span touches a line the patch adds or changes;
    `line` = the first such line, `edit_id` = the edit that adds it."""
    added: dict[int, str] = {}
    for e in se.enumerate_edits(path, base_text, cand_text):
        for k in range(len(e.added)):
            added[e.cand_line + k] = e.id
    out = []
    for r in refs:
        first = cand_text.count("\n", 0, r["start"]) + 1
        last = cand_text.count("\n", 0, r["end"]) + 1
        hit = next((ln for ln in range(first, last + 1) if ln in added), None)
        if hit is not None:
            out.append(dict(r, line=hit, edit_id=added[hit]))
    return out


def order_refs(files: list[dict], header_text: Optional[Callable[[str], Optional[str]]] = None) -> list[dict]:
    """Classes referenced by added code of order-gated files:
    {file, line, class, via: new|scope|call, edit_id, precedent_names}.

    References are matched over whole expressions (a `new` may span lines;
    placement new counts). Added `#include` lines are not references: a header
    that exists at the base declares nothing new, a moved include adds nothing,
    and classes in headers the patch creates or changes are the declaration
    check's job. `precedent_names`: classes with the same final name that the
    base text of the same file already constructs; decide compares canonical
    identities. `header_text` is unused (kept for callers of the earlier signature)."""
    import preprocess
    import readiness

    out, seen = [], set()
    for f in files:
        if not f.get("cand_exists") or not _gated(f["path"]):
            continue
        cand = f.get("cand_text") or ""
        refs = class_references(preprocess.active_text(cand, unknown="active"))
        before = sorted(readiness.constructed_classes(f.get("base_text")))
        for r in added_references(f["path"], f.get("base_text"), cand, refs):
            key = (f["path"], r["line"], r["class"])
            if key in seen:
                continue
            seen.add(key)
            tail = r["class"].split("::")[-1]
            out.append({"file": f["path"], "line": r["line"], "class": r["class"], "via": r["via"],
                        "edit_id": r["edit_id"], "precedent_names": [b for b in before if b.split("::")[-1] == tail]})
    return out


def order_policy() -> dict:
    """The ordering policy: $ORCH_ORDERING_POLICY (JSON) or the SMS default gated paths."""
    raw = os.environ.get("ORCH_ORDERING_POLICY")
    if raw:
        try:
            policy = json.loads(raw)
            if isinstance(policy, dict):
                return policy
        except ValueError:
            pass
    import unit_progress

    return {"gatedPaths": list(unit_progress.ORDER_GATED_PATHS)}


_READINESS_CACHE: dict[tuple, Any] = {}


def _order_readiness(repo: Optional[Path], base_rev: Optional[str], version: Optional[str]):
    """(readiness.Readiness | None, error) for the evidence (host) repo at base_rev."""
    if repo is None or not base_rev:
        return None, "no evidence repo or base revision for the readiness index"
    policy = order_policy()
    key = (str(repo), base_rev, version, json.dumps(policy, sort_keys=True))
    if key not in _READINESS_CACHE:
        import readiness

        try:
            _READINESS_CACHE[key] = (readiness.load(Path(repo), base_rev, version=version, policy=policy), "")
        except readiness.ReadinessError as e:
            _READINESS_CACHE[key] = (None, f"readiness unavailable ({e.kind}: {e.detail})")
    return _READINESS_CACHE[key]


def _owner_progress(repo: Optional[Path], version: Optional[str], unit: Optional[str]) -> Optional[float]:
    """The owner unit's fuzzy % (context only: readiness, not progress, decides)."""
    if repo is None or unit is None:
        return None
    try:
        import unit_progress

        prog = unit_progress.load(Path(repo), version)
        u = prog.unit(unit) if prog else None
        return round(u.progress, 4) if u else None
    except Exception:
        return None


def order_checks(refs: list[dict], ready, error: str = "", *, repo: Optional[Path] = None,
                 version: Optional[str] = None) -> list[dict]:
    """Each reference resolved through readiness.construct: precedent (the file
    already constructs it at the base) or ready/shared -> ok, not_ready ->
    out_of_order, unresolved (ambiguous/absent owner, no source) or no
    readiness -> unknown."""
    out = []
    def ident(name: str) -> str:
        canon = getattr(ready, "canonical", None) if ready is not None else None
        return (canon(name) if canon else None) or name

    for r in refs:
        names = r.get("precedent_names") or []
        if names and ident(r["class"]) in {ident(n) for n in names}:
            out.append(dict(r, owner_unit=None, owner_progress=None, status="ok",
                            reason="precedent: the base text of this file already constructs it"))
            continue
        if ready is None:
            out.append(dict(r, owner_unit=None, owner_progress=None, status="unknown", reason=error))
            continue
        st = ready.class_state(r["class"])
        owner = st["owner_unit"]
        if st["construct"] in ("ready", "shared"):
            out.append(dict(r, owner_unit=owner, owner_progress=_owner_progress(repo, version, owner),
                            status="ok", reason=""))
        elif st["construct"] == "not_ready":
            out.append(dict(r, owner_unit=owner, owner_progress=_owner_progress(repo, version, owner),
                            status="out_of_order",
                            reason=f"{r['class']} belongs to {owner}, whose source does not define its constructor "
                                   "yet: leave it until the class's own unit is decompiled"))
        else:
            out.append(dict(r, owner_unit=owner, owner_progress=None, status="unknown",
                            reason=f"{r['class']}: owner unresolved ({st['provenance']})"))
    return out


# --------------------------------------------------------------------------
# decide
# --------------------------------------------------------------------------


def _group_touches(g: dict, fn: dict, group_touch: Optional[dict] = None, data_touch: Optional[dict] = None) -> bool:
    """Does reverting group `g` change function `fn`? By evidence, best first:
    MWCC add-back (S*+g vs S*), MWCC data-order build, the IR functions that
    change when the group alone is reverted; the group's line range only for
    compile-blocked groups and groups without evidence (a group outside any
    function and without evidence touches the whole unit)."""
    if fn["unit"] not in (g.get("units") or []) or g.get("cosmetic"):
        return False
    names = [fn.get("demangled"), fn.get("name"), fn.get("target_name")]
    line = g.get("functions") or []
    if g.get("compile_blocked"):
        return bool(line) and _match_function(names, line)
    ev = ((group_touch or {}).get(g["id"]) or {}).get(fn["unit"])
    if ev is not None:
        return fn["name"] in ev
    if g.get("data_order"):
        ev = ((data_touch or {}).get(g["id"]) or {}).get(fn["unit"])
        if ev is not None:
            return fn["name"] in ev
    ir = g.get("ir_functions")
    if ir is not None:
        q = normalize_name(qualified(fn.get("demangled") or fn["name"]))
        return any(q == x or q.endswith("::" + x) or x.endswith("::" + q) for x in ir)
    if g.get("status") == "removable":
        return bool(line) and _match_function(names, line)
    return _match_function(names, line) if line else True


def _map_confirms(evidence_repo: Optional[Path], fn: dict, callee: str, version: Optional[str]) -> Optional[bool]:
    if evidence_repo is None:
        return None
    try:
        import evidence_search

        info = evidence_search.map_calls(evidence_repo, fn.get("target_name") or fn["name"], version)
    except Exception:
        return None
    if not info.get("available") or not info.get("found"):
        return None
    return any(_sym_is(c.get("mangled") or c.get("name") or "", callee) or
               (c.get("name") or "").split("(")[0].split("::")[-1] == callee for c in info.get("callees") or [])


def decide(reduce: dict, mwcc: dict, *, evidence_repo: Optional[Path] = None, approvals: Optional[list[dict]] = None,
           lessons_path: Optional[Path] = None, probes: bool = True, version: Optional[str] = None,
           game: Optional[str] = None) -> dict:
    reasons: list[str] = []
    if reduce.get("edits_hash") != mwcc.get("edits_hash"):
        reasons.append("edits_hash differs between reduce and mwcc")
    if mwcc.get("missing_functions"):
        reasons.append("requested functions not built in any touched unit: " + ", ".join(mwcc["missing_functions"][:6]))
    coverage = mwcc.get("coverage")
    if coverage is None:
        reasons.append("mwcc report has no unit coverage")
        coverage = []
    s2_failed = {e.get("unit") for e in mwcc.get("errors") or [] if e.get("variant") in ("sstar_evidence", "sstar_steering")}
    unit_rows = []
    for c in coverage:
        unit_rows.append({
            "unit": c["unit"],
            # every build this unit needs: base, candidate, S* (and S** when used); `absent` = no source in that variant
            "built": bool(c.get("built")) and all(v in BUILT_STATES for v in (c.get("built") or {}).values())
            and c["unit"] not in s2_failed,
            "compared": bool(c.get("compared")),
            "builds": dict(c.get("built") or {}, **({"s_star_star": "failed"} if c["unit"] in s2_failed else {})),
            **({"no_unit": c["no_unit"]} if c.get("no_unit") else {}),
            **({"tool_error": c["tool_error"]} if c.get("tool_error") else {}),
        })
    seen_units: set[str] = set()
    for r in unit_rows:
        if r["unit"] in seen_units:
            reasons.append(f"unit {r['unit']} listed twice in the MWCC coverage")
        seen_units.add(r["unit"])
    uncovered = [r for r in unit_rows if not (r["built"] and r["compared"])]
    attempt_only: list[str] = []  # reject the attempt without touching covered units' functions
    if uncovered:
        attempt_only.append("units without a complete MWCC build/comparison: " + ", ".join(
            f"{r['unit']} ({r['builds']})" for r in uncovered[:6]))
        tool_rows = [r for r in uncovered if r.get("tool_error")]
        if tool_rows:
            attempt_only.append("tool error, not a source failure: " + "; ".join(
                f"{r['unit']}: {r['tool_error']}" for r in tool_rows[:4])[:600])
    covered_units = {c["unit"] for c in coverage if c.get("compared")}
    stop_at_frame = mwcc.get("stack_frame_policy") == game_policy.STOP_AT_FRAME
    group_touch = mwcc.get("group_touch") or {}
    data_touch: dict[str, dict[str, list[str]]] = {}
    for row in mwcc.get("data_evidence") or []:
        if row.get("functions") is not None:
            data_touch.setdefault(row["group"], {})[row["unit"]] = row["functions"]

    def touches(g: dict, fn: dict) -> bool:
        return _group_touches(g, fn, group_touch, data_touch)

    groups = [dict(g) for g in reduce.get("groups") or []]
    by_id = {g["id"]: g for g in groups}
    before = {g["id"]: g.get("status") for g in groups}
    reduce_complete = reduce.get("analysis") == "complete" and not reasons
    unit_ok = {u["unit"]: u.get("ok") for u in reduce.get("units") or []}
    mwcc_errors = mwcc.get("errors") or []
    approvals = approvals or []

    # Map-call evidence keep (construct level), decided per removable group.
    keep: dict[str, dict] = {}
    unconfirmed: set[str] = set()
    for fn in mwcc.get("functions") or []:
        for row in fn.get("call_evidence") or []:
            if not row.get("relocs_ok"):
                continue
            g = by_id.get(row["group"])
            if g is None:
                continue
            ok = _map_confirms(evidence_repo, fn, row["callee"], version)
            if ok:
                keep[g["id"]] = {"kind": "map_call", "callee": row["callee"], "function": fn["name"],
                                 "target_calls": row["target"], "sstar_calls": row["sstar"], "with_calls": row["with"]}
            else:
                unconfirmed.add(g["id"])
    for gid, ev in keep.items():
        g = by_id[gid]
        others = [s for s in g.get("shapes") or [] if (s in STEERING and s != "accessor_swap") or s in DIRECTIVES or s == "other"]
        if others:
            g["status"], g["reason"] = "unresolved", "map-backed call mixed with " + ", ".join(others) + "; split the group"
        else:
            g["status"], g["reason"] = "real", f"map call evidence: original calls {ev['callee']}"
        g["evidence"] = ev
    unconfirmed -= set(keep)

    # Data-order moves: real when keeping them brings MWCC data closer to the target.
    data_rows: dict[str, list[dict]] = {}
    for row in mwcc.get("data_evidence") or []:
        data_rows.setdefault(row["group"], []).append(row)
    for gid, rows in data_rows.items():
        g = by_id.get(gid)
        if g is None or g.get("status") != "unresolved" or not g.get("data_order"):
            continue
        others = [s for s in g.get("shapes") or [] if (s in STEERING and s not in MOVE_SHAPES) or s in DIRECTIVES]
        units_seen = {r["unit"] for r in rows}
        if units_seen < set(g.get("units") or []):
            continue
        if all(r.get("effect") == "none" for r in rows):
            g["status"] = "removable"
            g["reason"] = "the move changes no MWCC code, data or symbol order"
            g["evidence"] = {"kind": "data_order_mwcc", "rows": rows}
        elif not others and any(r["improves"] for r in rows) and not any(r["worsens"] for r in rows):
            g["status"] = "real"
            g["reason"] = "the move brings the data layout closer to the target: " + ", ".join(
                sorted({k for r in rows for k in r["improves"]}))
            g["evidence"] = {"kind": "data_order_mwcc", "rows": rows}
            g["real_shapes"] = sorted(set(g.get("real_shapes") or []) | {"data_order"})

    # Call constructs: a retained call shape is real only if the original
    # function's relocations back it (plan 2.2).
    for g in groups:
        if g.get("status") != "real":
            continue
        problem = call_construct_problem(g, [fn for fn in mwcc.get("functions") or [] if touches(g, fn)])
        if problem:
            g["status"], g["reason"] = "unresolved", problem

    # Evidence-review approvals that the reduce step did not have (site-bound: steering_approvals).
    game = game or reduce.get("game")
    late_approved = []
    review_sites: dict[str, dict] = {}
    for g in groups:
        ev = g.get("evidence") or {}
        if g.get("status") == "unresolved" and ev.get("kind") == "evidence_review":
            touched = sorted({(fn["unit"], fn["name"]) for fn in mwcc.get("functions") or [] if touches(g, fn)})
            site = {"game": game, "units": g.get("units") or [], "functions": g.get("functions") or [],
                    "targets": [name for _, name in touched], "base_rev": reduce.get("base_rev"), "file": g.get("file"),
                    "lines": g.get("site_lines"), "digest": g.get("group_digest"),
                    "callee": ev.get("callee") or "", "symbol": ev.get("symbol") or ""}
            # Every affected (unit, target) needs its own approval; the missing ones are what the runner queues.
            pairs = [(unit, name, None) for unit, name in touched] or [
                (u, None, f) for u in site["units"] for f in site["functions"]]
            _found, site["missing"] = _group_approvals(approvals, site, pairs)
            review_sites[g["id"]] = site
            if not site["missing"]:
                late_approved.append(g["id"])
                residue = approval_residue(g.get("shapes") or [], g.get("real_shapes") or [])
                g["reason"] = ("approved construct mixed with " + ", ".join(residue) + "; split the group") if residue \
                    else "approved evidence found after reduce: re-run the gate so S* keeps it"

    unused_checks = [dict(r) for r in mwcc.get("unused_checks") or []]
    violations = [{"kind": "dead_unused_body", "unit": r.get("unit"), "file": r.get("file"),
                   "function": r.get("function"), "line": r.get("line")}
                  for r in unused_checks if r.get("status") == "dead"]
    inconclusive = [r for r in unused_checks if r.get("status") == "inconclusive"]
    # The UNUSED rule needs the link map for every touched unit whose source changed. Where the game
    # expects one (SMS), a missing/unreadable map or an unmatched unit leaves the analysis incomplete.
    map_gaps = [(u, m.get("reason") or "link map unavailable") for u, m in sorted((mwcc.get("unused_map") or {}).items())
                if not m.get("available")] if game_policy.link_map_required() else []
    refs = reduce.get("order_refs") or []
    if refs:
        ready, why = _order_readiness(evidence_repo, reduce.get("base_rev"), version)
        ordering = order_checks(refs, ready, why, repo=evidence_repo, version=version)
    else:
        ordering = []
    violations += [{"kind": "out_of_order", "file": c["file"], "line": c["line"], "class": c["class"],
                    "owner_unit": c["owner_unit"], "owner_progress": c["owner_progress"], "reason": c["reason"]}
                   for c in ordering if c["status"] == "out_of_order"]
    order_unknown = [c for c in ordering if c["status"] == "unknown"]

    functions_out = []
    probe_list = []
    any_steering = False
    any_unresolved = False
    removable_noncosmetic = [g["id"] for g in groups if g.get("status") == "removable" and not g.get("cosmetic")]
    for fn in mwcc.get("functions") or []:
        fn_reasons: list[str] = []
        touching = [g for g in groups if touches(g, fn)]
        global_incomplete = reduce.get("global_incomplete")
        if global_incomplete is None:  # older reports: every reason is global
            global_incomplete = [] if reduce.get("analysis") == "complete" else (reduce.get("incomplete_reasons") or ["incomplete"])
        global_incomplete = list(global_incomplete) + reasons
        analysis = "incomplete" if global_incomplete else "complete"
        fn_reasons += global_incomplete
        if unit_ok.get(fn["unit"]) is False:
            analysis = "incomplete"
            fn_reasons.append("IR oracle failed for the unit")
        if any(g.get("incomplete") for g in touching):
            analysis = "incomplete"
            fn_reasons.append("incomplete groups: " + ", ".join(g["id"] for g in touching if g.get("incomplete"))[:200])
        if fn["unit"] not in covered_units or any(
                e.get("unit") == fn["unit"] and e.get("kind") not in ("data", "attribution")
                and (e.get("variant") or "").startswith(("base", "cand", "sstar")) for e in mwcc_errors):
            analysis = "incomplete"
            fn_reasons.append("MWCC build or comparison missing for the unit")
        sstar_cls = fn.get("sstar_vs_candidate")
        real_only = fn.get("real_only")
        evidence_used = False
        touching_keep = [gid for gid in keep if by_id[gid]["status"] == "real" and touches(by_id[gid], fn)]
        if touching_keep:
            ev = fn.get("evidence_sstar") or {}
            ev_groups = set(ev.get("groups") or [])
            if ev and ev_groups <= {gid for gid in keep if by_id[gid]["status"] == "real"}:
                sstar_cls, real_only, evidence_used = ev.get("sstar_vs_candidate"), ev.get("real_only"), True
            else:
                analysis = "incomplete"
                missing = sorted(ev_groups - set(keep)) or ["no S* with the kept call"]
                fn_reasons.append("partial evidence keep (" + ", ".join(missing) + "); re-run the gate")
        if sstar_cls is None:
            analysis = "incomplete"
            fn_reasons.append("no S* object for the function")
        unresolved_groups = [g for g in touching if g.get("status") == "unresolved"]
        # False-SAME guard: only a reverted group whose evidence is purely real
        # shapes (no steering shape or directive) suggests the oracle erred.
        reverted_real = [g for g in touching if g.get("status") == "removable" and g.get("real_shapes")
                         and not any(x in STEERING or x in DIRECTIVES for x in g.get("shapes") or [])
                         and g["id"] not in keep]
        if unresolved_groups:
            semantic = "unresolved"
            fn_reasons += [f"{g['id']}: {g.get('reason')}" for g in unresolved_groups[:4]]
        elif sstar_cls not in (None, "identical"):
            semantic = "steering"
        else:
            semantic = "clean"
        cand_pct = (fn.get("candidate") or {}).get("match_percent")
        sstar_pct = (real_only or {}).get("match_percent")
        false_same = (semantic == "steering" and reverted_real and cand_pct is not None and sstar_pct is not None
                      and sstar_pct < cand_pct)
        if false_same:
            semantic = "unresolved"
            fn_reasons.append("oracle reverted a group carrying real shapes: " + ", ".join(g["id"] for g in reverted_real[:3]))
        stack_only = semantic == "steering" and sstar_cls == "stack_only" and stop_at_frame
        if analysis == "complete" and semantic == "clean" and sstar_cls == "identical":
            decision = "pass"
        elif analysis == "complete" and semantic == "steering":
            decision = "steering_located"
        else:
            decision = "unresolved"
        if stack_only:
            fn_reasons.append("S* differs from the candidate only in the stack frame (stack_only_perturbation)")
        # Retained groups with only steering shapes stay uncertified (decision
        # unchanged), but if S* without them loses the match the function is
        # labelled steering and S** is reported as its real-only match.
        steering_sstar_used = False
        if (decision == "unresolved" and semantic == "unresolved" and analysis == "complete" and not false_same
                and unresolved_groups and all(steering_only_retained(g) for g in unresolved_groups)):
            ss = fn.get("steering_sstar") or {}
            if ss.get("sstar_vs_candidate") not in (None, "identical") and set(ss.get("groups") or []) >= {
                    g["id"] for g in unresolved_groups}:
                semantic, real_only, steering_sstar_used = "steering", ss.get("real_only"), True
                sstar_pct = (real_only or {}).get("match_percent")
                fn_reasons.append("S* without the steering-only retained groups loses the match (labelled steering)")
        any_steering |= decision == "steering_located"
        any_unresolved |= decision == "unresolved"
        match = {"base": (fn.get("base") or {}).get("match_percent"), "candidate": cand_pct, "real_only": sstar_pct}
        label = _audit_label(analysis, semantic, touching, match, real_only, stop_at_frame)
        entry = {
            "unit": fn["unit"],
            "name": fn["name"],
            "demangled": fn.get("demangled"),
            "decision": decision,
            "semantic": semantic,
            "analysis": analysis,
            "audit_label": label,
            "match": match,
            "status": {"base": (fn.get("base") or {}).get("status"), "candidate": (fn.get("candidate") or {}).get("status"),
                       "real_only": (real_only or {}).get("status")},
            "sstar_vs_candidate": sstar_cls,
            "stack_only_perturbation": stack_only,
            "evidence_sstar": evidence_used,
            "steering_sstar": steering_sstar_used,
            "groups": [g["id"] for g in touching],
            "reasons": fn_reasons[:8],
        }
        # The S* this verdict compared against, and the record that lets the explain job rebuild it.
        # steering_sstar replaces real_only after the evidence pick, so it wins when both apply.
        sstar_variant = "steering_sstar" if steering_sstar_used else "evidence_sstar" if evidence_used else "global"
        entry["sstar_variant"] = sstar_variant
        entry["fidelity"] = function_fidelity(mwcc, fn, sstar_variant)
        uc = _unused_check_for(fn, unused_checks)
        if uc is not None:
            entry["unused_check"] = uc.get("status")
            entry["reasons"].append(f"UNUSED in the link map: stub test {uc.get('status')} ({uc.get('reason')})"[:300])
        functions_out.append(entry)
        if probes and decision != "pass":
            try:
                import steering_diagnose

                probe_list.append(steering_diagnose.build_probe(entry, touching, fn, evidence_repo=evidence_repo,
                                                                lessons_path=lessons_path, version=version))
            except Exception as e:  # a probe is a hint; never fail the decision for it
                probe_list.append({"function": fn["name"], "unit": fn["unit"], "error": f"{type(e).__name__}: {e}"})

    unresolved_ids = [g["id"] for g in groups if g.get("status") == "unresolved"]
    removable_noncosmetic = [g["id"] for g in groups if g.get("status") == "removable" and not g.get("cosmetic")]
    attempt_reasons = list(reasons) + attempt_only
    # `reasons`/`attempt_reasons` are for people; `attempt_issues` carries the same facts by category.
    issues = [issue("tool", detail=r) for r in reasons]
    for r in uncovered:
        if r.get("no_unit"):
            issues.append(issue("header_no_unit", files=[r["no_unit"]], detail="no unit builds or includes this file"))
        elif r.get("tool_error"):
            issues.append(issue("tool_error", units=[r["unit"]], detail=r["tool_error"]))
        else:
            issues.append(issue("uncovered_unit", units=[r["unit"]], detail=str(r["builds"])))
    if not reduce_complete:
        details = reduce.get("incomplete_details")
        if details is None:  # an older reduce report: its reasons have no category
            issues += [issue("reduce_unstructured", detail=r) for r in (reduce.get("incomplete_reasons") or ["incomplete"])]
        else:
            issues += [dict(d) for d in details]
    if not reduce_complete:
        attempt_reasons += ["analysis incomplete: " + r for r in (reduce.get("incomplete_reasons") or [])[:4]]
    if attempt_only:
        attempt = "unresolved"  # an unbuilt or uncompared unit: nothing about the attempt is certified
    elif any_steering:
        attempt = "steering_located"
        attempt_reasons.append("functions depend on behaviour-identical edits: " + ", ".join(
            f["name"] for f in functions_out if f["decision"] == "steering_located")[:300])
    elif any_unresolved or unresolved_ids or not reduce_complete or reasons or attempt_only:
        attempt = "unresolved"
        if unresolved_ids:
            attempt_reasons.append("unresolved groups: " + ", ".join(unresolved_ids[:8]))
        if any_unresolved:
            attempt_reasons.append("unresolved functions: " + ", ".join(
                f["name"] for f in functions_out if f["decision"] == "unresolved")[:300])
    elif removable_noncosmetic:
        attempt = "steering_located"
        attempt_reasons.append("codegen-neutral rewrites present (remove them): " + ", ".join(removable_noncosmetic[:8]))
    else:
        attempt = "pass"
    if any(f["stack_only_perturbation"] for f in functions_out):
        attempt_reasons.append("stack_only_perturbation")
    # UNUSED rule (sms-unused-functions): an inconclusive stub test leaves the
    # analysis incomplete; a dead body is a violation that fails an otherwise
    # passing attempt (other verdicts keep their kind, violations still listed).
    if inconclusive:
        attempt = "unresolved"
        attempt_reasons.append("analysis incomplete: UNUSED stub test inconclusive for " + ", ".join(
            f"{r.get('function')} ({r.get('reason')})" for r in inconclusive[:4])[:400])
    if map_gaps:
        attempt = "unresolved"
        attempt_reasons.append("analysis incomplete: no link-map coverage for the UNUSED rule: " + ", ".join(
            f"{u} ({why})" for u, why in map_gaps[:4]))
    if order_unknown:
        attempt = "unresolved"
        attempt_reasons.append("analysis incomplete: decompile-in-order check cannot resolve " + ", ".join(
            f"{c['class']} ({c['file']}:{c['line']}: {c['reason']})" for c in order_unknown[:4])[:400])
    dead = [v for v in violations if v["kind"] == "dead_unused_body"]
    if dead:
        attempt_reasons.append("dead UNUSED bodies (UNUSED functions may only be reconstructed when inlined into "
                               "another function of the same TU; restore the stub): " + ", ".join(
                                   f"{v['function']} {v['file']}:{v['line']}" for v in dead[:6]))
    late = [v for v in violations if v["kind"] == "out_of_order"]
    if late:
        attempt_reasons.append("out of order (don't fill in code that needs classes whose units are not decompiled): "
                               + ", ".join(f"{v['class']} ({v['owner_unit']} {v['owner_progress']}%) "
                                           f"{v['file']}:{v['line']}" for v in late[:6]))
    if violations and attempt == "pass":
        attempt = "rule_violation"
    group_units = {g["id"]: g.get("units") or [] for g in groups}
    fn_names = lambda kind: [f for f in functions_out if f["decision"] == kind]  # noqa: E731
    for kind, category in (("steering_located", "steering_functions"), ("unresolved", "unresolved_functions")):
        if fn_names(kind):
            issues.append(issue(category, units=[f["unit"] for f in fn_names(kind)],
                                detail=", ".join(f["name"] for f in fn_names(kind))[:300]))
    if unresolved_ids:
        issues.append(issue("unresolved_groups", groups=unresolved_ids,
                            units=[u for gid in unresolved_ids for u in group_units.get(gid, [])],
                            files=[by_id[gid]["file"] for gid in unresolved_ids if by_id.get(gid, {}).get("file")]))
    if removable_noncosmetic:
        issues.append(issue("removable_noncosmetic", groups=removable_noncosmetic,
                            units=[u for gid in removable_noncosmetic for u in group_units.get(gid, [])],
                            files=[by_id[gid]["file"] for gid in removable_noncosmetic if by_id.get(gid, {}).get("file")]))
    if inconclusive:
        issues.append(issue("unused_inconclusive", units=[r.get("unit") for r in inconclusive if r.get("unit")],
                            files=[r.get("file") for r in inconclusive if r.get("file")]))
    if map_gaps:
        issues.append(issue("unused_map_gap", units=[u for u, _ in map_gaps],
                            detail=", ".join(f"{u} ({why})" for u, why in map_gaps[:4])))
    if order_unknown:
        issues.append(issue("order_unknown", files=[c["file"] for c in order_unknown]))
    for kind in ("dead_unused_body", "out_of_order"):
        rows = [v for v in violations if v["kind"] == kind]
        if rows:
            issues.append(issue(kind, units=[v["unit"] for v in rows if v.get("unit")], files=[v["file"] for v in rows]))
    return {
        "tool": TOOL,
        "version": VERSION,
        "edits_hash": reduce.get("edits_hash"),
        "attempt": attempt,
        "reasons": attempt_reasons,
        "attempt_issues": issues,
        "functions": functions_out,
        "removable_noncosmetic": removable_noncosmetic,
        "unresolved_groups": unresolved_ids,
        "evidence_keeps": sorted(keep),
        "group_updates": [{"id": g["id"], "status": g.get("status"), "was": before[g["id"]], "reason": g.get("reason"),
                           "evidence": g.get("evidence")} for g in groups if g.get("status") != before[g["id"]]],
        "late_approved": late_approved,
        "evidence_reviews": _evidence_reviews(groups, review_sites, late_approved, functions_out),
        "stack_only_perturbation": any(f["stack_only_perturbation"] for f in functions_out),
        "units": unit_rows,
        "no_changes": reduce.get("changed_files") == [] and mwcc.get("changed_files") == [],
        "group_statuses": {g["id"]: g.get("status") for g in groups},  # final, after decide-time promotions
        "unused_checks": unused_checks,
        "order_checks": ordering,
        "violations": violations,
        "probes": probe_list,
    }


def _evidence_reviews(groups: list[dict], sites: dict[str, dict], late_approved: list[str],
                      functions_out: list[dict]) -> list[dict]:
    """Evidence-review groups still unresolved and unapproved: what the runner
    queues for human review (one request per target function the group edits,
    keyed by game, unit, target and group digest)."""
    out = []
    for g in groups:
        site = sites.get(g["id"])
        if site is None or g["id"] in late_approved or g.get("status") != "unresolved":
            continue
        ev = g.get("evidence") or {}
        missing = site.get("missing") or []
        touching = [{"unit": f["unit"], "name": f["name"]} for f in functions_out if g["id"] in (f.get("groups") or [])]
        # Only the (unit, target) pairs without an approval: an approved one is never asked again.
        targets = [{"unit": m["unit"], "name": m["name"]} for m in missing if m.get("name")] or [
            t for t in touching if any(m.get("unit") == t["unit"] for m in missing)]
        out.append({
            "group": g["id"], "game": site["game"], "base_rev": site["base_rev"], "units": site["units"],
            "targets": targets, "functions": site["functions"], "site_file": site["file"],
            "site_lines": site["lines"], "group_digest": site["digest"], "callee": site["callee"],
            "symbol": site["symbol"], "provenance": ev.get("provenance"),
            "patch": (ev.get("site") or {}).get("patch"), "edit_ids": g.get("edit_ids") or [],
            "shapes": g.get("shapes") or [], "real_shapes": g.get("real_shapes") or [], "reason": g.get("reason"),
        })
    return out


def _unused_check_for(fn: dict, checks: list[dict]) -> Optional[dict]:
    for r in checks:
        if r.get("unit") != fn.get("unit"):
            continue
        if r.get("mangled") and (r["mangled"] == fn.get("name") or (
                fn.get("target_name") is None and fn.get("name") and "__" not in fn["name"]
                and _mwcc_qualified(r["mangled"]) == fn["name"])):
            return r  # by symbol; an unmangled compiled name (C-like toy objects) by qualified name
    return None


def call_construct_problem(g: dict, functions: list[dict]) -> Optional[str]:
    """Why a real group's call shapes are not backed by the target object.

    New callee F (call_added / callee_change): if MWCC calls F out of line in
    the candidate, the original function must call it at least as often.
    Removed callee X (call_removed): the original must not call X more often
    than the candidate. Inlined callees (no relocation) are left to the IR rule.
    """
    real = set(g.get("real_shapes") or [])
    if not g.get("functions"):
        return None
    for fn in functions:
        target, cand = fn.get("target_relocs") or [], fn.get("candidate_relocs") or []
        if fn.get("target_name") is None:
            continue  # no original function to compare with
        if real & set(CALL_SHAPES):
            for callee in g.get("new_calls") or []:
                c = sum(1 for x in cand if _sym_is(x, callee))
                t = sum(1 for x in target if _sym_is(x, callee))
                if c and t < c:
                    return f"new callee {callee} is called {c}x but the original calls it {t}x"
        if "call_removed" in real:
            for callee in g.get("dropped_calls") or []:
                c = sum(1 for x in cand if _sym_is(x, callee))
                t = sum(1 for x in target if _sym_is(x, callee))
                if t > c:
                    return f"removed callee {callee}: the original still calls it {t}x (candidate {c}x)"
    return None


def _audit_label(analysis: str, semantic: str, touching: list[dict], match: dict, real_only: Optional[dict],
                 stop_at_frame: bool) -> str:
    if analysis != "complete" or semantic == "unresolved":
        return "unresolved"
    if semantic == "clean":
        return "real"
    real_groups = [g for g in touching if g.get("status") == "real"]
    base, sstar = match.get("base"), match.get("real_only")
    if real_groups and base is not None and sstar is not None and sstar > base:
        return "mixed"
    return "steering"


# --------------------------------------------------------------------------
# check / apply / fingerprint
# --------------------------------------------------------------------------


def revert_edit_ids(reduce: dict) -> list[str]:
    """Edits of removable, non-cosmetic groups (S* keeps comments)."""
    out = []
    for g in reduce.get("groups") or []:
        if g.get("status") == "removable" and not g.get("cosmetic"):
            out += g.get("edit_ids") or []
    return sorted(out)


def _final_group_status(report: dict, g: dict) -> Optional[str]:
    """A group's status after decide's promotions (`group_statuses`), else reduce's."""
    statuses = (report.get("decision") or {}).get("group_statuses") or {}
    return statuses.get(g["id"], g.get("status"))


def held_group_ids(report: dict) -> list[str]:
    """Removable, non-cosmetic groups that belong to an unresolved function:
    listed in its decision row's `groups`, or line-located in it (same unit,
    or a group without units). apply never reverts them."""
    rows = [r for r in (report.get("decision") or {}).get("functions") or [] if r.get("decision") == "unresolved"]
    listed = {gid for r in rows for gid in r.get("groups") or []}
    out = []
    for g in (report.get("reduce") or {}).get("groups") or []:
        if _final_group_status(report, g) != "removable" or g.get("cosmetic"):
            continue
        line = g.get("functions") or []
        units = g.get("units") or []
        if g["id"] in listed or (line and any(
                (not units or r.get("unit") in units)
                and _match_function([r.get("demangled"), r.get("name"), r.get("target_name")], line)
                for r in rows)):
            out.append(g["id"])
    return sorted(out)


def steering_group_ids(report: dict) -> list[str]:
    """The groups apply reverts: removable, non-cosmetic, listed in a
    steering_located function's `groups` (decide's evidence attribution) and
    not held for an unresolved function. A removable group no steering
    function claims (unattributed, or only touching passing functions) is
    left in place for the recheck to report; a group shared by a steering and
    an unresolved function is held whole."""
    rows = [r for r in (report.get("decision") or {}).get("functions") or [] if r.get("decision") == "steering_located"]
    listed = {gid for r in rows for gid in r.get("groups") or []}
    held = set(held_group_ids(report))
    return sorted(g["id"] for g in (report.get("reduce") or {}).get("groups") or []
                  if g["id"] in listed and g["id"] not in held
                  and _final_group_status(report, g) == "removable" and not g.get("cosmetic"))


def run_check(repo: Path, base_ref: str, *, oracle_repo: Optional[Path] = None, cache_dir: Optional[Path] = None,
              functions: Optional[list[str]] = None, paths: Sequence[str] = DEFAULT_PATHS,
              overlay_dir: Optional[str] = None, jobs: int = MAX_JOBS, budget: float = DEFAULT_BUDGET,
              mwcc_budget: Optional[float] = None,
              max_groups: int = DEFAULT_MAX_GROUPS, approvals_path: Optional[Path] = None,
              evidence_repo: Optional[Path] = None, lessons_path: Optional[Path] = None,
              version: Optional[str] = None, tmp: Optional[str] = None, oracle: Optional[Callable] = None,
              backend=None, unit_resolver: Optional[Callable] = None) -> dict:
    """edits + reduce + mwcc + decide in one process. The worker runs the same
    four steps split between sandbox and host (`mwcc --attribute REDUCE.json`);
    both paths call the same functions with the same inputs."""
    start = time.time()
    edits = build_edits(repo, base_ref, paths, overlay_dir, version, unit_resolver=unit_resolver)
    log(f"steering: {len(edits['files'])} changed files, {len(edits['units'])} units")
    red = run_reduce(edits, oracle_repo or Path(repo), cache_dir, budget=budget, max_groups=max_groups, jobs=jobs,
                     approvals_path=approvals_path, evidence_repo=evidence_repo or oracle_repo or Path(repo),
                     oracle=oracle)
    log(f"steering: reduce {red['analysis']} in {red['elapsed_s']}s, {len(red['groups'])} groups")
    mw = run_mwcc(Path(repo), edits["base_rev"], edits["edits_hash"], revert_edit_ids(red), functions=functions,
                  attribute=red, jobs=jobs, paths=paths, overlay_dir=overlay_dir, version=version, tmp=tmp,
                  backend=backend, budget=mwcc_budget)
    approvals = read_jsonl(approvals_path if approvals_path else default_approvals_path())
    dec = decide(red, mw, evidence_repo=evidence_repo or oracle_repo or Path(repo), approvals=approvals,
                 lessons_path=lessons_path, version=edits.get("game_version"),
                 game=sa.game_id(approvals_path or default_approvals_path()))
    return {"tool": TOOL, "version": VERSION, "no_changes": dec["no_changes"], "edits": edits, "reduce": red,
            "mwcc": mw, "decision": dec, "elapsed_s": round(time.time() - start, 1)}


def omit_texts(edits: dict) -> dict:
    out = dict(edits)
    out["files"] = [{k: v for k, v in f.items() if k not in ("base_text", "cand_text")} for f in edits["files"]]
    gen = dict(edits.get("generated") or {})
    gen["files"] = [{k: v for k, v in f.items() if k != "text"} for f in gen.get("files", [])]
    out["generated"] = gen
    return out


def run_apply(report: dict, dry_run: bool, only_paths: Optional[Sequence[str]] = None) -> dict:
    """Write S* into the repo. Decision violations: dead UNUSED bodies get the
    base text of that function back (the stub, or no definition), re-checked
    in the written text; out-of-order hunks are reverted.

    Only steering is reverted (`steering_group_ids`): edits of removable groups
    a steering_located function is attributed to, and that the S* the check
    measured reverted (`mwcc.revert_edits`). A group held by `held_group_ids`
    (it belongs to an unresolved function, kept as unverified) is never
    reverted, even when a steering function shares it, so apply never rewrites
    an unresolved function's code through a group; unattributed removable
    groups are left for the recheck. Rule violations are explicit and always
    applied.

    `only_paths` (sharded backfill) limits the writes to those repo-relative
    files; the edits_hash check still covers every file of the report, so a
    file shared with another report (a changed header) is never written by
    this call and later reports still verify against an unchanged tree."""
    only = None if only_paths is None else set(only_paths)
    edits = report["edits"]
    repo = Path(edits["repo"])
    files = edits["files"]
    if not files or "cand_text" not in files[0]:
        files = collect_files(repo, edits["base_rev"], edits.get("paths") or DEFAULT_PATHS)
        if se.edits_hash(edits["base_rev"], files) != edits["edits_hash"]:
            raise ToolFailure("the working tree changed since the check (edits_hash mismatch)")
    if edits.get("overlay"):
        raise ToolFailure("the check used --overlay-dir; apply needs a check of the working tree")
    held = held_group_ids(report)
    steering = set(steering_group_ids(report))
    group_edits = {g["id"]: set(g.get("edit_ids") or []) for g in (report.get("reduce") or {}).get("groups") or []}
    held_edits = {gid: group_edits.get(gid, set()) for gid in held}
    revert = set().union(*(group_edits[gid] for gid in steering)) - set().union(*held_edits.values())
    measured = (report.get("mwcc") or {}).get("revert_edits")
    if measured is not None:
        revert &= set(measured)
    dead: dict[str, list[dict]] = {}
    late: dict[str, set[int]] = {}
    for v in (report.get("decision") or {}).get("violations") or []:
        if v.get("kind") == "dead_unused_body":
            dead.setdefault(v["file"], []).append(v)
        elif v.get("kind") == "out_of_order":
            late.setdefault(v["file"], set()).add(int(v["line"]))
    written = []
    for f in files:
        if only is not None and f["path"] not in only:
            continue
        es_ = se.enumerate_edits(f["path"], f["base_text"], f["cand_text"])
        lines = late.get(f["path"], set())
        # out-of-order hunks are reverted too (S* excludes them)
        ids = [e.id for e in es_ if e.id in revert or (e.added and any(
            e.cand_line <= ln < e.cand_line + len(e.added) for ln in lines))]
        if not ids and f["path"] not in dead:
            continue
        text = se.apply_reverts(f["base_text"], f["cand_text"], es_, ids, base_exists=f["base_exists"],
                                cand_exists=f["cand_exists"], preserve_lines=True)
        restored = []
        if text is not None and f["path"] in dead:
            text, restored = restore_dead_bodies(f["base_text"], f["cand_text"], text, dead[f["path"]])
        row = {"path": f["path"], "reverted": ids, "deleted": text is None}
        if restored:
            row["unused_restored"] = restored
        file_ids = {e.id for e in es_}
        held_here = [gid for gid in held if held_edits[gid] & file_ids]
        if held_here:
            row["held"] = held_here
        written.append(row)
        if dry_run:
            continue
        p = repo / f["path"]
        if text is None:
            p.unlink(missing_ok=True)
        else:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(se.encode(text))
    out = {"tool": TOOL, "repo": str(repo), "dry_run": dry_run, "files": written, "held_groups": held,
           "steering_groups": sorted(steering)}
    if only is not None:
        out["only_paths"] = sorted(only)
    return out


def restore_dead_bodies(base_text: Optional[str], cand_text: str, text: str,
                        violations: list[dict]) -> tuple[str, list[str]]:
    """`text` (S*) with each dead UNUSED definition replaced by its base text
    (deleted when the base has none), then verified: the function must be
    trivial or absent afterwards."""
    cdefs, bdefs = function_defs(cand_text), function_defs(base_text)
    targets = []
    for v in violations:
        d = next((c for c in cdefs if c.line == v.get("line")), None)
        if d is None:
            raise ToolFailure(f"{v.get('function')}: no definition at {v.get('file')}:{v.get('line')} in the candidate")
        targets.append(d)
    restored = []
    for d in targets:  # one at a time: offsets move after each replacement
        cur = [x for x in function_defs(text) if _qual_eq(x.qualified, d.qualified) and x.params == d.params]
        if not cur:
            raise ToolFailure(f"{d.qualified}: definition not found in S*")
        x = min(cur, key=lambda c: abs(c.line - d.line))
        if x.trivial:
            continue
        base = _base_defs(bdefs, d)
        if base:
            b = base[0]
            text = text[:x.start] + base_text[b.start:b.close + 1] + text[x.close + 1:]
        else:
            end = x.close + 1
            if text[end:end + 1] == "\n":
                end += 1
            text = text[:x.start] + text[end:]
        after = [y for y in function_defs(text) if _qual_eq(y.qualified, d.qualified) and y.params == d.params]
        if any(not y.trivial for y in after):
            raise ToolFailure(f"{d.qualified}: still has a body after restoring the base text")
        restored.append(d.qualified)
    return text, restored


def run_unused_test(repo_path: Path | str, base_ref: str, file: str, function: str, *,
                    overlay_dir: Optional[str | Path] = None, version: Optional[str] = None, jobs: int = MAX_JOBS,
                    tmp: Optional[str] = None, backend=None) -> dict:
    """Standalone stub test of one function: the candidate is the working tree
    (plus --overlay-dir), built with C and C' in shadow roots; the repo is
    never written. Reports the map's UNUSED status for context only."""
    repo = Path(repo_path).resolve()
    base_rev = rev_parse(repo, f"{base_ref}^{{commit}}")
    if base_rev is None:
        raise ToolFailure(f"{base_ref}: unknown revision in {repo}")
    overlay = read_overlay(overlay_dir)
    if file in overlay:
        cand = overlay[file]
    elif (repo / file).is_file():
        cand = (repo / file).read_bytes()
    else:
        raise ToolFailure(f"{file}: not in the working tree or overlay")
    cand_text = se.decode(cand) or ""
    base = git_show(repo, base_rev, file)
    edits_hash = se.edits_hash(base_rev, collect_files(repo, base_rev, DEFAULT_PATHS, overlay_dir))
    qualified, params = function.strip(), None
    if "(" in qualified:
        i = qualified.index("(")
        j = qualified.rfind(")")
        params = canonical_params(qualified[i + 1:j] if j > i else qualified[i + 1:])
        qualified = qualified[:i].strip()
    defs = match_defs(function_defs(cand_text), qualified, params)
    if not defs:
        raise ToolFailure(f"{function}: no definition in {file}")
    backend = backend or RepoBackend(repo, version, jobs, tmp)
    try:
        by_path, _ = backend.units([file])
        units = by_path.get(file) or []
        if not units:
            raise ToolFailure(f"{file}: no unit builds it")
        u = units[0]
        symbols = backend.unused(u, base_rev) if hasattr(backend, "unused") else None
        hits = [sym for sym in symbols or [] if _qual_eq(sym["qualified"], qualified)
                and (params is None or sym["params"] is None or len(sym["params"]) == len(params))]
        texts: dict[str, Optional[bytes]] = dict(overlay)
        texts[file] = cand
        ok, obj, err = backend.compile(u, texts, "cand")
        if not ok or obj is None:
            raise ToolFailure(f"the candidate does not build: {(err or '')[:400]}")
        before = backend.classify(obj, u)
        bdefs = function_defs(se.decode(base) if base is not None else None)
        checks = []
        for d in defs:
            bd = _base_defs(bdefs, d)
            row = {"unit": u.name, "file": file, "function": hits[0]["function"] if len(hits) == 1 else function,
                   "mangled": hits[0]["mangled"] if len(hits) == 1 else None}
            row.update(stub_test(backend, u, texts, file, cand_text, d, before,
                                 hits[0] if len(hits) == 1 else None))
            row["base_rev"], row["edits_hash"] = base_rev, edits_hash
            inputs = unit_inputs_of(backend, u, texts)
            if inputs is None:
                row["status"], row["reason"] = "inconclusive", "the unit's inputs cannot be determined"
                inputs = [file]
            row["unit_inputs"] = inputs
            row["unit_inputs_sha256"] = unit_inputs_sha256(
                inputs, lambda p: texts[p] if p in texts else _read_bytes(getattr(backend, "root", None), p))
            flags = backend.unit_flags(u) if hasattr(backend, "unit_flags") else None
            row["unit_flags_sha256"] = hashlib.sha256(flags.encode()).hexdigest() if flags is not None else None
            row["base"] = "absent" if not bd else ("trivial" if all(b.trivial for b in bd) else "body")
            row["candidate_trivial"] = d.trivial
            checks.append(row)
    finally:
        backend.close()
    statuses = {c["status"] for c in checks}
    status = ("inconclusive" if "inconclusive" in statuses else statuses.pop() if len(statuses) == 1 else "mixed")
    return {"tool": TOOL, "version": VERSION, "repo": str(repo), "base_rev": base_rev, "file": file,
            "function": function, "status": status,
            "map": {"available": symbols is not None, "unused": bool(hits) if symbols is not None else None,
                    "mangled": [h["mangled"] for h in hits],
                    **({"reason": (getattr(backend, "unused_reasons", None) or {}).get(u.name, "link map unavailable")}
                       if symbols is None else {})},
            "checks": checks}


def run_fingerprint(repo: Path, unit: str, source_file: Optional[Path], version: Optional[str]) -> dict:
    rp = _repo(repo, version)
    u = rp.unit(unit)
    text = source_file.read_text() if source_file else None
    ok, fps, errors = ir_oracle.unit_fingerprint(rp.root, u.source, text)
    dem = ir_oracle.demangle(list(fps))
    return {"tool": TOOL, "unit": u.name, "source": u.source, "ok": ok,
            "fingerprints": {dem.get(k, k): v for k, v in sorted(fps.items())}, "errors": errors}


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def _split(values: Optional[Sequence[str]]) -> list[str]:
    out = []
    for v in values or []:
        out += [x.strip() for x in v.split(",") if x.strip()]
    return out


def _load(path: str) -> dict:
    return json.loads(Path(path).read_text())


def _emit(args: argparse.Namespace, payload: dict, human: list[str]) -> None:
    text = json.dumps(payload, indent=1) + "\n"
    if getattr(args, "out", None):
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text)
    if getattr(args, "json", False):
        sys.stdout.write(text)
    else:
        print("\n".join(human))


def _decision_lines(dec: dict) -> list[str]:
    lines = [f"attempt: {dec['attempt']}"]
    for f in dec["functions"]:
        m = f["match"]
        lines.append(f"  {f['decision']:<16} {f['semantic']:<10} {f['analysis']:<10} {f['audit_label']:<10} "
                     f"base {m['base']} cand {m['candidate']} S* {m['real_only']}  {f.get('demangled') or f['name']}")
    for u in dec.get("unused_checks") or []:
        lines.append(f"  unused {u['status']:<12} {u['function']}  {u['file']}:{u['line']}  {u['reason']}")
        lines += [f"      {c['function']}: {c['before']} -> {c['after']}" for c in (u.get("changed") or [])[:6]]
    lines += ["  - " + r for r in dec["reasons"][:6]]
    return lines


def cmd_edits(args) -> int:
    payload = build_edits(args.repo, args.base_ref, args.paths, args.overlay_dir, args.version)
    _emit(args, payload, [f"{len(payload['files'])} files, {len(payload['units'])} units, edits_hash {payload['edits_hash'][:16]}"])
    return 0


def cmd_reduce(args) -> int:
    manifest = _load(args.input)
    red = run_reduce(manifest, Path(args.oracle_repo) if args.oracle_repo else None,
                     Path(args.cache_dir) if args.cache_dir else None, budget=args.budget_seconds,
                     max_groups=args.max_groups, jobs=args.jobs,
                     approvals_path=Path(args.approvals) if args.approvals else None,
                     evidence_repo=Path(args.evidence_repo) if args.evidence_repo else None)
    human = [f"analysis {red['analysis']}: " + "; ".join(red["incomplete_reasons"][:3])]
    human += [f"  {g['status']:<10} {g['id']}  {','.join(g['shapes'] + g['real_shapes'])}  {g['reason']}" for g in red["groups"]]
    _emit(args, red, human)
    return 0


def cmd_mwcc(args) -> int:
    payload = run_mwcc(Path(args.repo), args.base_ref, args.edits_hash, _split(args.revert_edits),
                       functions=_split(args.functions) or None,
                       attribute=_load(args.attribute) if args.attribute else None,
                       jobs=args.jobs, paths=args.paths, overlay_dir=args.overlay_dir, version=args.version, tmp=args.tmp,
                       budget=args.mwcc_budget_seconds)
    human = [f"{f['sstar_vs_candidate']!s:<10} {f['candidate']} S* {f['real_only']}  {f['demangled']}" for f in payload["functions"]]
    _emit(args, payload, human)
    return 0


def cmd_decide(args) -> int:
    dec = decide(_load(args.reduce), _load(args.mwcc),
                 evidence_repo=Path(args.evidence_repo) if args.evidence_repo else _env_path("ORCH_GAME_HOST_REPO_ROOT"),
                 approvals=read_jsonl(Path(args.approvals) if args.approvals else default_approvals_path()),
                 lessons_path=Path(args.lessons) if args.lessons else default_lessons_path(), version=args.version,
                 game=sa.game_id(Path(args.approvals) if args.approvals else default_approvals_path()))
    _emit(args, dec, _decision_lines(dec))
    return 0


def _env_path(name: str) -> Optional[Path]:
    v = os.environ.get(name)
    return Path(v) if v else None


def cmd_check(args) -> int:
    payload = run_check(Path(args.repo), args.base_ref, oracle_repo=Path(args.oracle_repo) if args.oracle_repo else None,
                        cache_dir=Path(args.cache_dir) if args.cache_dir else None,
                        functions=_split(args.functions) or None, paths=args.paths, overlay_dir=args.overlay_dir,
                        jobs=args.jobs, budget=args.budget_seconds, max_groups=args.max_groups,
                        approvals_path=Path(args.approvals) if args.approvals else None,
                        evidence_repo=Path(args.evidence_repo) if args.evidence_repo else None,
                        lessons_path=Path(args.lessons) if args.lessons else None, version=args.version, tmp=args.tmp,
                        mwcc_budget=args.mwcc_budget_seconds)
    if not args.full:
        payload["edits"] = omit_texts(payload["edits"])
    _emit(args, payload, _decision_lines(payload["decision"]))
    return 0


def cmd_apply(args) -> int:
    payload = run_apply(_load(args.report), args.dry_run, only_paths=args.only_paths)
    _emit(args, payload, [f"{'would write' if args.dry_run else 'wrote'} {f['path']} ({len(f['reverted'])} edits reverted)"
                          for f in payload["files"]])
    return 0


def cmd_unused_test(args) -> int:
    payload = run_unused_test(Path(args.repo), args.base_ref, args.file, args.function, overlay_dir=args.overlay_dir,
                              version=args.version, jobs=args.jobs, tmp=args.tmp)
    m = payload["map"]
    human = [f"{payload['function']}: {payload['status'].upper()}"
             f"  (map: {'UNUSED' if m['unused'] else 'not UNUSED' if m['available'] else m.get('reason') or 'no link map'})"]
    for c in payload["checks"]:
        human.append(f"  {c['status']:<12} {c['file']}:{c['line']} stub {c['stub']}  base {c['base']}  {c['reason']}")
        human += [f"      {x['function']}: {x['before']['status']} {x['before']['match_percent']}%"
                  f" -> {x['after']['status']} {x['after']['match_percent']}%"
                  + (f"  (worse {x['delta']})" if "delta" in x else "") for x in (c["callers"] or c["changed"])]
    _emit(args, payload, human)
    return 0


def cmd_fingerprint(args) -> int:
    payload = run_fingerprint(Path(args.repo), args.unit, Path(args.source_file) if args.source_file else None, args.version)
    _emit(args, payload, [f"{v}  {k}" for k, v in payload["fingerprints"].items()] + payload["errors"])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)

    def common(p, out=True):
        p.add_argument("--json", action="store_true")
        p.add_argument("--version", help="build version (default: detected)")
        if out:
            p.add_argument("--out")

    def jobs(p):
        p.add_argument("--jobs", type=int, default=MAX_JOBS, help=f"parallel compiles (max {MAX_JOBS})")

    p = sub.add_parser("edits", help="changed files, edits_hash, units, generated includes")
    common(p)
    p.add_argument("--repo", required=True)
    p.add_argument("--base-ref", required=True)
    p.add_argument("--paths", nargs="*", default=list(DEFAULT_PATHS))
    p.add_argument("--overlay-dir", help="files here (repo-relative) replace the working tree as candidate")
    p.set_defaults(func=cmd_edits)

    p = sub.add_parser("reduce", help="IR-oracle reduction of edit groups")
    common(p)
    jobs(p)
    p.add_argument("--oracle-repo", help="host checkout whose git objects hold base_rev")
    p.add_argument("--input", required=True)
    p.add_argument("--cache-dir")
    p.add_argument("--budget-seconds", type=float, default=DEFAULT_BUDGET, help="IR-oracle reduce budget (not the MWCC step)")
    p.add_argument("--max-groups", type=int, default=DEFAULT_MAX_GROUPS)
    p.add_argument("--approvals")
    p.add_argument("--evidence-repo")
    p.set_defaults(func=cmd_reduce)

    p = sub.add_parser("mwcc", help="MWCC base / candidate / S* per function")
    common(p)
    jobs(p)
    p.add_argument("--repo", required=True)
    p.add_argument("--base-ref", required=True)
    p.add_argument("--edits-hash", required=True)
    p.add_argument("--revert-edits", nargs="*", default=[])
    p.add_argument("--functions", nargs="*")
    p.add_argument("--attribute", help="reduce output (groups) for attribution and call evidence")
    p.add_argument("--mwcc-budget-seconds", type=float, help="MWCC step budget (default $ORCH_MWCC_BUDGET_SECONDS or 3600)")
    p.add_argument("--paths", nargs="*", default=list(DEFAULT_PATHS))
    p.add_argument("--overlay-dir")
    p.add_argument("--tmp")
    p.set_defaults(func=cmd_mwcc)

    p = sub.add_parser("decide", help="gate decision from reduce + mwcc")
    common(p)
    p.add_argument("--reduce", required=True)
    p.add_argument("--mwcc", required=True)
    p.add_argument("--evidence-repo")
    p.add_argument("--approvals")
    p.add_argument("--lessons")
    p.set_defaults(func=cmd_decide)

    p = sub.add_parser("check", help="edits + reduce + mwcc + decide")
    common(p)
    jobs(p)
    p.add_argument("--repo", required=True)
    p.add_argument("--base-ref", required=True)
    p.add_argument("--oracle-repo")
    p.add_argument("--cache-dir")
    p.add_argument("--functions", nargs="*")
    p.add_argument("--paths", nargs="*", default=list(DEFAULT_PATHS))
    p.add_argument("--overlay-dir")
    p.add_argument("--budget-seconds", type=float, default=DEFAULT_BUDGET, help="IR-oracle reduce budget (not the MWCC step)")
    p.add_argument("--max-groups", type=int, default=DEFAULT_MAX_GROUPS)
    p.add_argument("--approvals")
    p.add_argument("--evidence-repo")
    p.add_argument("--lessons")
    p.add_argument("--full", action="store_true", help="keep file texts in the edits section")
    p.add_argument("--mwcc-budget-seconds", type=float, help="MWCC step budget (default $ORCH_MWCC_BUDGET_SECONDS or 3600)")
    p.add_argument("--tmp")
    p.set_defaults(func=cmd_check)

    p = sub.add_parser("apply", help="write S* (backfill)")
    common(p)
    p.add_argument("--report", required=True)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--only-paths", nargs="*", help="write only these repo-relative files (sharded backfill)")
    p.set_defaults(func=cmd_apply)

    p = sub.add_parser("unused-test", help="stub test: does a function's body change any target function?")
    common(p)
    jobs(p)
    p.add_argument("--repo", required=True)
    p.add_argument("--base-ref", default="HEAD")
    p.add_argument("--overlay-dir", help="files here (repo-relative) replace the working tree as candidate")
    p.add_argument("--file", required=True, help="repo-relative source file defining the function")
    p.add_argument("--function", required=True, help="qualified name, optionally with parameters: T::f(int)")
    p.add_argument("--tmp")
    p.set_defaults(func=cmd_unused_test)

    p = sub.add_parser("fingerprint", help="debug: IR fingerprints of one unit")
    common(p)
    p.add_argument("--repo", required=True)
    p.add_argument("--unit", required=True)
    p.add_argument("--source-file")
    p.set_defaults(func=cmd_fingerprint)
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    if hasattr(args, "jobs"):
        args.jobs = clamp_jobs(args.jobs)
    try:
        return args.func(args)
    except ToolFailure as e:
        log(f"steering_check: {e}")
        if getattr(args, "json", False):
            sys.stdout.write(json.dumps({"tool": TOOL, "version": VERSION, "error": str(e)}) + "\n")
        return 2
    except SystemExit as e:  # stack_check.Repo raises SystemExit for setup problems
        if isinstance(e.code, str):
            log(f"steering_check: {e.code}")
            if getattr(args, "json", False):
                sys.stdout.write(json.dumps({"tool": TOOL, "version": VERSION, "error": e.code}) + "\n")
            return 2
        raise


if __name__ == "__main__":
    sys.exit(main())
