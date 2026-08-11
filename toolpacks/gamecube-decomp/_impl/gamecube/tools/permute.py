#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["tree-sitter", "tree-sitter-c", "libclang"]
# ///
"""
Source-level permuter for melee. Unlike the vendored decomp-permuter (which
mutates a macro-expanded, pretty-printed copy of the source), this mutates the
**real** translation unit text via tree-sitter byte-span edits (src_mutate.py),
compiles the real TU with the exact mwcc command from build.ninja
(ninja_compile.py), and scores each candidate with objdiff itself. When an
extended `objdiff-cli score` server is available, the permuter uses its
reloc/data-aware penalty. The stock objdiff-cli 3.6.x build only exposes JSON
diff output, so the permuter falls back to ranking by the function's
`match_percent`. A win is printed as a unified diff that applies straight to
src/.../*.c with `git apply`.

Usage:
  permute.py <func_name> [permute_fn ...] [options]
  permute.py --replay replay.json [--apply MODE]

  <func_name>     function whose object code is scored against the target
  [permute_fn]    function(s) to mutate each iteration (default: func_name).
                  If given, ONLY these are mutated (one chosen per iteration);
                  func_name is mutated only if listed. They must live in the
                  same translation unit as func_name.

Options:
  -j N            worker threads (default 8)
  --timeout S     stop after S seconds
  --seed N        base RNG seed (default 0)
  --keep-prob P   probability of stacking another mutation vs. restarting from
                  the original source each step (default 0.25)
  --apply MODE    write the best candidate back to the real source:
                    match   (default) only on a 100% match
                    always  even for a partial improvement
                    never   leave the source untouched
  --max-iters N   stop after N compiled candidates
  --no-narrow     skip the post-search narrowing pass that reverts
                  nonessential diff chunks while preserving the best score
  --narrow-passes N
                  max fixed-point passes per narrowing granularity (default 3)
  --save-replay PATH
                  write a JSON recipe that can reproduce the final best
                  candidate from the current source
  --replay PATH   replay a saved JSON recipe instead of searching

Narrowing is additionally bounded by PERMUTER_NARROW_MAX_COMPILES (default:
min(--max-iters, 64), or 64 without --max-iters) and
PERMUTER_NARROW_TIMEOUT_SECONDS (default: 30).

The search always stops as soon as a 100% match (score 0) is found. On Ctrl+C /
timeout / max-iters, prints the best diff found so far.
"""

from __future__ import annotations

import argparse
import base64
import difflib
import hashlib
import json
import math
import os
import random
import shlex
import signal
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

_IMPL_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_IMPL_ROOT / "tools"))          # for sibling modules

import src_mutate  # noqa: E402
import type_oracle  # noqa: E402
import ninja_compile  # noqa: E402
from ninja_compile import (  # noqa: E402
    ROOT,
    build_pch,
    compile_source_text,
    find_unit_for_function,
    source_dir_for,
)
from objdiff_path import objdiff_cli  # noqa: E402


@dataclass(frozen=True, order=True)
class ScoreKey:
    """Category-aware candidate rank.

    Ordering intentionally puts stack/frame last: a candidate with no regswaps
    and many stack/frame rows beats one with even a single register swap.
    """

    hard: int
    regswap: int
    stack: int
    raw: int
    breakdown: bool = field(default=True, compare=False)

    @classmethod
    def from_raw(cls, raw: int) -> "ScoreKey":
        # Backward-compatible fallback for an older objdiff-cli score server.
        return cls(raw, 0, 0, raw, breakdown=False)

    def describe(self) -> str:
        if not self.breakdown:
            return f"{self.raw}"
        return f"{self.raw} [hard={self.hard}, reg={self.regswap}, stack={self.stack}]"

    def describe_mismatches(self) -> str:
        if not self.breakdown:
            return f"{self.raw}"
        total = self.hard + self.regswap + self.stack
        return f"{total} [hard={self.hard}, reg={self.regswap}, stack={self.stack}]"


class ScoreError(Exception):
    """The score server couldn't score a candidate (bad object / missing symbol).
    Recoverable: the server keeps running; the permuter just skips the candidate."""


class ObjdiffScorer:
    """Client for a persistent `objdiff-cli score` server. The server parses the
    target object once, then returns `(ScoreKey, code_hash)` per candidate over a
    pipe. `ScoreKey.raw` is objdiff's own penalty (0 = true match), while the
    leading fields rank mismatch classes in decompilation-useful order. One
    server per worker thread, so no cross-thread locking on the hot path.

    The local objdiff-cli shipped by current project builds has no `score`
    subcommand. In that case this class falls back to one-shot JSON diffs and a
    match-percent-derived raw score, preserving correctness over speed.
    """

    def __init__(self, unit: str, fn: str) -> None:
        self.unit = unit
        self.fn = fn
        self.target = str(ROOT / f"build/GALE01/obj/{unit}.o")
        self.proc = None
        self.proc = subprocess.Popen(
            [str(objdiff_cli()), "score", self.target, fn],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, bufsize=1,
        )
        ready = self.proc.stdout.readline()
        if ready.strip() != "READY":
            stderr = self.proc.stderr.read() if self.proc.stderr else ""
            try:
                self.proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.proc.kill()
            self.proc = None
            self.fallback_reason = (stderr or ready or "objdiff score server did not start").strip()
        else:
            self.fallback_reason = None

    def score(self, obj_path: str):
        """Return (ScoreKey, code_hash). Raises ScoreError if this candidate is
        unscoreable (server stays up), OSError if the server pipe is gone."""
        if self.proc is None:
            return self._score_with_diff_json(Path(obj_path))
        try:
            self.proc.stdin.write(obj_path + "\n")
            self.proc.stdin.flush()
            line = self.proc.stdout.readline()
        except (BrokenPipeError, ValueError) as e:
            raise OSError("objdiff score server pipe closed") from e
        if not line:
            raise OSError("objdiff score server closed")
        parts = line.split()
        if not parts or parts[0] == "ERR":
            raise ScoreError(line.strip())
        raw = int(parts[0])
        if len(parts) >= 5:
            key = ScoreKey(
                hard=int(parts[2]),
                regswap=int(parts[3]),
                stack=int(parts[4]),
                raw=raw,
            )
        else:
            key = ScoreKey.from_raw(raw)
        return key, parts[1]

    def _score_with_diff_json(self, obj_path: Path):
        result = run_objdiff_json(self.unit, self.fn, obj_path, timeout=30)
        if result.returncode != 0:
            raise ScoreError((result.stderr or result.stdout).strip())
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise ScoreError(f"objdiff JSON parse failed: {error}") from error
        percent = symbol_match_percent_from_payload(payload, self.fn)
        if percent is None:
            raise ScoreError("objdiff JSON did not include match_percent")
        raw = max(0, int(round((100.0 - percent) * 1_000_000)))
        code_hash = hashlib.sha256(
            json.dumps(symbol_payload(payload, self.fn) or payload, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        return ScoreKey.from_raw(raw), code_hash

    def close(self) -> None:
        if self.proc is None:
            return
        try:
            if self.proc.stdin and not self.proc.stdin.closed:
                self.proc.stdin.close()
        except OSError:
            pass
        try:
            self.proc.wait(timeout=2)
        except Exception:
            self.proc.kill()


def make_scorer(unit: str, fn: str) -> ObjdiffScorer:
    return ObjdiffScorer(unit, fn)


@dataclass
class BatchCompileResult:
    objects: List[Optional[Path]]
    timed_out: bool = False
    invocations: int = 0


class FixedBatchCompiler:
    """MWCC batch runner with source/object paths reused for one worker.

    MWCC stops a multi-input invocation at the first compile error. The failed
    input is named in its diagnostic; keep already-produced objects, discard
    that input, and submit all still-uncompiled inputs as another batch. This
    preserves candidate order without degrading the entire suffix to serial
    compiles.
    """

    def __init__(self, unit: str, slots: int) -> None:
        self.unit = unit
        self.slots = max(1, slots)
        self.block = ninja_compile.find_build_block(unit)
        if self.block.rule not in ninja_compile.MWCC_RULES:
            raise RuntimeError(f"unsupported MWCC rule: {self.block.rule}")

        build_tmp = ROOT / "build"
        build_tmp.mkdir(exist_ok=True)
        self.outdir = tempfile.TemporaryDirectory(
            prefix="permute-worker-", dir=build_tmp
        )
        self.output_dir = Path(self.outdir.name)
        self.sources: List[Path] = []
        self.objects: List[Path] = []
        self.closed = False
        try:
            src_dir = source_dir_for(unit)
            for _ in range(self.slots):
                fd, name = tempfile.mkstemp(
                    suffix=".c", prefix=".permute-slot-", dir=str(src_dir)
                )
                os.close(fd)
                source = Path(name)
                ninja_compile._TEMP_CANDIDATES.add(source)
                self.sources.append(source)
                self.objects.append(self.output_dir / f"{source.stem}.o")
        except Exception:
            self.close()
            raise

    @staticmethod
    def _remaining(deadline: Optional[float]) -> Optional[float]:
        if deadline is None:
            return None
        return max(0.0, deadline - time.monotonic())

    def _failed_input(
        self,
        missing: List[int],
        stdout: str,
        stderr: str,
    ) -> int:
        diagnostics = stdout + "\n" + stderr
        named: List[tuple[int, int]] = []
        for index in missing:
            source = self.sources[index]
            positions = [
                diagnostics.find(source.name),
                diagnostics.find(ninja_compile._root_rel(source)),
                diagnostics.find(str(source)),
            ]
            positions = [position for position in positions if position >= 0]
            if positions:
                named.append((min(positions), index))
        if named:
            return min(named)[1]
        # MWCC writes objects in input order and aborts at its first error, so
        # the first missing object is the diagnostic-free fallback.
        return missing[0]

    def _postprocess_extab(
        self,
        objects: List[Optional[Path]],
        deadline: Optional[float],
    ) -> bool:
        if "extab" not in self.block.rule:
            return False
        dtk = ROOT / "build/tools/dtk"
        padding = self.block.extab_padding or ""
        for obj in objects:
            if obj is None:
                continue
            remaining = self._remaining(deadline)
            if remaining is not None and remaining <= 0:
                return True
            try:
                subprocess.run(
                    [str(dtk), "extab", "clean", "--padding", padding,
                     str(obj), str(obj)],
                    cwd=ROOT,
                    capture_output=True,
                    text=True,
                    timeout=remaining,
                )
            except subprocess.TimeoutExpired:
                return True
        return False

    def compile(
        self,
        source_texts: List[str],
        *,
        prefix_pch: Optional[Path] = None,
        deadline: Optional[float] = None,
    ) -> BatchCompileResult:
        if self.closed:
            raise RuntimeError("batch compiler is closed")
        if len(source_texts) > self.slots:
            raise ValueError(
                f"batch has {len(source_texts)} sources for {self.slots} slots"
            )
        if not source_texts:
            return BatchCompileResult([])

        count = len(source_texts)
        for index, text in enumerate(source_texts):
            self.sources[index].write_text(
                text, encoding="utf-8", errors="surrogateescape"
            )
            self.objects[index].unlink(missing_ok=True)

        objects: List[Optional[Path]] = [None] * count
        pending = list(range(count))
        invocations = 0
        while pending:
            remaining = self._remaining(deadline)
            if remaining is not None and remaining <= 0:
                return BatchCompileResult(objects, timed_out=True,
                                          invocations=invocations)

            source_args = [ninja_compile._root_rel(self.sources[i]) for i in pending]
            cmd_prefix = ninja_compile._compiler_prefix(
                self.block,
                obj_path=self.unit,
                sources=source_args,
                quiet=True,
            )
            if cmd_prefix is None:
                break
            cmd = list(cmd_prefix) + shlex.split(self.block.cflags)
            if prefix_pch is not None:
                cmd += ["-prefix", prefix_pch.name]
            cmd += ["-o", ninja_compile._root_rel(self.output_dir), "-c", *source_args]

            try:
                with ninja_compile.worker_compile_slot():
                    result = subprocess.run(
                        cmd,
                        cwd=ROOT,
                        capture_output=True,
                        text=True,
                        timeout=remaining,
                    )
            except subprocess.TimeoutExpired:
                return BatchCompileResult(objects, timed_out=True,
                                          invocations=invocations + 1)
            invocations += 1

            missing: List[int] = []
            for index in pending:
                obj = self.objects[index]
                if obj.exists():
                    objects[index] = obj
                else:
                    missing.append(index)
            if not missing:
                break

            failed = self._failed_input(missing, result.stdout, result.stderr)
            # The failed candidate is intentionally dropped. Everything MWCC
            # skipped after it remains a batch on the next invocation.
            pending = [index for index in missing if index != failed]

        timed_out = self._postprocess_extab(objects, deadline)
        return BatchCompileResult(objects, timed_out=timed_out,
                                  invocations=invocations)

    def close(self) -> None:
        if self.closed:
            return
        self.closed = True
        for source in self.sources:
            source.unlink(missing_ok=True)
            ninja_compile._TEMP_CANDIDATES.discard(source)
        self.outdir.cleanup()


def run_objdiff_json(unit: str, fn: str, cand_o: Path, *, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [objdiff_cli(), "diff", "--format", "json", "--output", "-",
         "-c", "functionRelocDiffs=data_value",
         "-1", str(ROOT / f"build/GALE01/obj/{unit}.o"),
         "-2", str(cand_o), fn],
        capture_output=True, text=True, timeout=timeout,
    )


def symbol_payload(payload: dict[str, Any], fn: str) -> Optional[dict[str, Any]]:
    for side_name in ("left", "right"):
        side = payload.get(side_name)
        if not isinstance(side, dict):
            continue
        symbols = side.get("symbols")
        if not isinstance(symbols, list):
            continue
        for symbol in symbols:
            if isinstance(symbol, dict) and symbol.get("name") == fn:
                return symbol
    return None


def symbol_match_percent_from_payload(payload: dict[str, Any], fn: str) -> Optional[float]:
    symbol = symbol_payload(payload, fn)
    if symbol is None:
        return None
    percent = symbol.get("match_percent")
    return float(percent) if isinstance(percent, (int, float)) else None


def objdiff_percent(unit: str, fn: str, cand_o: Path) -> Optional[float]:
    try:
        r = run_objdiff_json(unit, fn, cand_o, timeout=30)
    except (subprocess.SubprocessError, OSError):
        return None
    if r.returncode != 0:
        return None
    try:
        payload = json.loads(r.stdout)
    except json.JSONDecodeError:
        return None
    return symbol_match_percent_from_payload(payload, fn)


def unified_diff(unit: str, base: bytes, cand: bytes) -> str:
    rel = f"src/{unit}.c"
    a = base.decode("utf-8", "replace").splitlines(keepends=True)
    b = cand.decode("utf-8", "replace").splitlines(keepends=True)
    return "".join(
        difflib.unified_diff(a, b, fromfile=f"a/{rel}", tofile=f"b/{rel}")
    )


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@dataclass(frozen=True)
class ReplayStep:
    kind: str
    mutate_fn: Optional[str]
    pass_name: str
    input_sha256: str
    output_sha256: str
    edits: Tuple[src_mutate.Edit, ...]
    note: Optional[str] = None


ReplayTrace = Tuple[ReplayStep, ...]


def make_replay_step(
    *,
    kind: str,
    mutate_fn: Optional[str],
    pass_name: str,
    before: bytes,
    edits: List[src_mutate.Edit],
    after: bytes,
    note: Optional[str] = None,
) -> ReplayStep:
    return ReplayStep(
        kind=kind,
        mutate_fn=mutate_fn,
        pass_name=pass_name,
        input_sha256=_sha256(before),
        output_sha256=_sha256(after),
        edits=tuple(edits),
        note=note,
    )


def _score_key_json(key: ScoreKey) -> Dict[str, Any]:
    return {
        "hard": key.hard,
        "regswap": key.regswap,
        "stack": key.stack,
        "raw": key.raw,
        "breakdown": key.breakdown,
    }


def _edit_json(edit: src_mutate.Edit) -> Dict[str, Any]:
    start, end, replacement = edit
    return {
        "start": start,
        "end": end,
        "replacement_b64": base64.b64encode(replacement).decode("ascii"),
    }


def _step_json(step: ReplayStep) -> Dict[str, Any]:
    return {
        "kind": step.kind,
        "mutate_fn": step.mutate_fn,
        "pass_name": step.pass_name,
        "input_sha256": step.input_sha256,
        "output_sha256": step.output_sha256,
        "note": step.note,
        "edits": [_edit_json(edit) for edit in step.edits],
    }


def _step_from_json(data: Dict[str, Any]) -> ReplayStep:
    edits: List[src_mutate.Edit] = []
    for edit in data.get("edits", []):
        edits.append((
            int(edit["start"]),
            int(edit["end"]),
            base64.b64decode(edit["replacement_b64"]),
        ))
    return ReplayStep(
        kind=str(data["kind"]),
        mutate_fn=data.get("mutate_fn"),
        pass_name=str(data["pass_name"]),
        input_sha256=str(data["input_sha256"]),
        output_sha256=str(data["output_sha256"]),
        edits=tuple(edits),
        note=data.get("note"),
    )


def write_replay_recipe(
    path: Path,
    *,
    unit: str,
    fn: str,
    base_source: bytes,
    final_source: bytes,
    base_key: ScoreKey,
    final_key: ScoreKey,
    trace: ReplayTrace,
) -> None:
    data = {
        "version": 1,
        "unit": unit,
        "function": fn,
        "base_sha256": _sha256(base_source),
        "final_sha256": _sha256(final_source),
        "base_score": _score_key_json(base_key),
        "final_score": _score_key_json(final_key),
        "steps": [_step_json(step) for step in trace],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


class ReplayError(Exception):
    pass


def apply_replay_trace(base_source: bytes, trace: ReplayTrace) -> bytes:
    cur = base_source
    for i, step in enumerate(trace, start=1):
        got = _sha256(cur)
        if got != step.input_sha256:
            raise ReplayError(
                f"step {i} input hash mismatch: got {got}, expected {step.input_sha256}"
            )
        try:
            cur = src_mutate.apply_edits(cur, list(step.edits))
        except ValueError as e:
            raise ReplayError(f"step {i} has invalid overlapping edits") from e
        got = _sha256(cur)
        if got != step.output_sha256:
            raise ReplayError(
                f"step {i} output hash mismatch: got {got}, expected {step.output_sha256}"
            )
    return cur


def read_replay_recipe(path: Path) -> Dict[str, Any]:
    data = json.loads(path.read_text())
    if data.get("version") != 1:
        raise ReplayError(f"unsupported replay recipe version: {data.get('version')!r}")
    data["steps"] = tuple(_step_from_json(step) for step in data.get("steps", []))
    return data


@dataclass(frozen=True)
class NarrowEdit:
    tag: str
    base_start: int
    base_end: int
    cand_start: int
    cand_end: int
    base_line_start: int
    base_line_end: int
    cand_line_start: int
    cand_line_end: int

    def describe(self) -> str:
        def span(first: int, last: int) -> str:
            if first > last:
                return f"{first}"
            if first == last:
                return f"{first}"
            return f"{first}-{last}"

        if self.tag == "insert":
            return f"candidate lines {span(self.cand_line_start, self.cand_line_end)}"
        if self.tag == "delete":
            return f"base lines {span(self.base_line_start, self.base_line_end)}"
        return (f"base lines {span(self.base_line_start, self.base_line_end)} -> "
                f"candidate lines {span(self.cand_line_start, self.cand_line_end)}")


@dataclass
class NarrowStats:
    passes: int = 0
    compiles: int = 0
    attempts: int = 0
    accepted: int = 0
    compile_failed: int = 0
    score_errors: int = 0
    stop_reason: Optional[str] = None


def _env_nonnegative_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        print(f"warning: ignoring invalid {name}={raw!r}", file=sys.stderr)
        return default


def _env_nonnegative_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError:
        value = -1.0
    if math.isfinite(value) and value >= 0:
        return value
    print(f"warning: ignoring invalid {name}={raw!r}", file=sys.stderr)
    return default


def _line_offsets(lines: List[bytes]) -> List[int]:
    offsets = [0]
    pos = 0
    for line in lines:
        pos += len(line)
        offsets.append(pos)
    return offsets


def _changed_line_edits(base: bytes, cand: bytes, *, granularity: str) -> List[NarrowEdit]:
    """Return byte-span edits that turn `base` into `cand`.

    `chunk` returns SequenceMatcher's changed line groups. `line` returns smaller
    single-line reverts for insert/delete groups and one-to-one replacements.
    """
    base_lines = base.splitlines(keepends=True)
    cand_lines = cand.splitlines(keepends=True)
    base_offsets = _line_offsets(base_lines)
    cand_offsets = _line_offsets(cand_lines)
    matcher = difflib.SequenceMatcher(None, base_lines, cand_lines, autojunk=False)
    edits: List[NarrowEdit] = []

    def add(tag: str, i1: int, i2: int, j1: int, j2: int) -> None:
        edits.append(NarrowEdit(
            tag=tag,
            base_start=base_offsets[i1],
            base_end=base_offsets[i2],
            cand_start=cand_offsets[j1],
            cand_end=cand_offsets[j2],
            base_line_start=i1 + 1,
            base_line_end=i2,
            cand_line_start=j1 + 1,
            cand_line_end=j2,
        ))

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if granularity == "chunk":
            add(tag, i1, i2, j1, j2)
            continue

        if tag == "insert":
            for j in range(j1, j2):
                add(tag, i1, i1, j, j + 1)
        elif tag == "delete":
            for i in range(i1, i2):
                add(tag, i, i + 1, j1, j1)
        elif tag == "replace":
            common = min(i2 - i1, j2 - j1)
            for k in range(common):
                add(tag, i1 + k, i1 + k + 1, j1 + k, j1 + k + 1)
            for i in range(i1 + common, i2):
                add("delete", i, i + 1, j1 + common, j1 + common)
            for j in range(j1 + common, j2):
                add("insert", i1 + common, i1 + common, j, j + 1)

    return edits


def _revert_edit(base: bytes, cand: bytes, edit: NarrowEdit) -> bytes:
    return (
        cand[:edit.cand_start]
        + base[edit.base_start:edit.base_end]
        + cand[edit.cand_end:]
    )


def narrow_best_source(
    unit: str,
    fn: str,
    base_source: bytes,
    best_source: bytes,
    best_key: ScoreKey,
    trace: ReplayTrace,
    *,
    max_passes: int,
    max_compiles: int = 64,
    timeout_seconds: float = 30.0,
    batch_size: int = 16,
) -> tuple[bytes, ScoreKey, NarrowStats, ReplayTrace]:
    """Minimize the best diff while preserving its score.

    This is delta-debugging for permuter output: repeatedly try reverting one
    changed span from the best candidate back to the original source. A revert is
    accepted only if the candidate still scores at least as well as the current
    narrowed best.
    """
    stats = NarrowStats()
    if max_passes <= 0 or base_source == best_source:
        return best_source, best_key, stats, trace
    if max_compiles <= 0:
        stats.stop_reason = "compile budget exhausted"
        return best_source, best_key, stats, trace
    if timeout_seconds <= 0:
        stats.stop_reason = "time budget exhausted"
        return best_source, best_key, stats, trace

    current = best_source
    current_key = best_key
    current_trace = trace
    batch_size = max(1, batch_size)
    scorer = make_scorer(unit, fn)
    compiler = FixedBatchCompiler(unit, batch_size)
    deadline = time.monotonic() + timeout_seconds
    progress_last = 0.0
    progress_len = 0

    def show_progress(granularity: str, pass_idx: int, edit_idx: int,
                      edit_count: int, *, force: bool = False) -> None:
        nonlocal progress_last, progress_len
        now = time.monotonic()
        if not force and now - progress_last < 0.5:
            return
        msg = (
            f"narrow: {granularity} pass {pass_idx}/{max_passes} "
            f"{edit_idx}/{edit_count}  tried={stats.attempts} "
            f"compiled={stats.compiles}/{max_compiles} "
            f"kept={stats.accepted}  compile-fail={stats.compile_failed} "
            f"score-err={stats.score_errors}"
        )
        sys.stderr.write("\r" + msg + (" " * max(0, progress_len - len(msg))))
        sys.stderr.flush()
        progress_last = now
        progress_len = len(msg)

    def clear_progress() -> None:
        nonlocal progress_len
        if progress_len:
            sys.stderr.write("\r" + (" " * progress_len) + "\r")
            sys.stderr.flush()
            progress_len = 0

    try:
        for granularity in ("chunk", "line"):
            for pass_idx in range(1, max_passes + 1):
                edits = _changed_line_edits(base_source, current, granularity=granularity)
                if not edits:
                    return current, current_key, stats, current_trace
                accepted_this_pass = 0
                stats.passes += 1
                edit_count = len(edits)
                show_progress(granularity, pass_idx, 0, edit_count, force=True)
                remaining_edits = list(reversed(edits))
                while remaining_edits:
                    if time.monotonic() >= deadline:
                        stats.stop_reason = "time budget exhausted"
                        break
                    compile_left = max_compiles - stats.compiles
                    if compile_left <= 0:
                        stats.stop_reason = "compile budget exhausted"
                        break

                    batch_count = min(batch_size, compile_left,
                                      len(remaining_edits))
                    batch_edits = remaining_edits[:batch_count]
                    trials = [
                        _revert_edit(base_source, current, edit)
                        for edit in batch_edits
                    ]
                    stats.compiles += len(trials)
                    result = compiler.compile(
                        [trial.decode("utf-8", "surrogateescape")
                         for trial in trials],
                        deadline=deadline,
                    )
                    if result.timed_out:
                        stats.stop_reason = "time budget exhausted"
                        break

                    accepted_at: Optional[int] = None
                    processed_before = edit_count - len(remaining_edits)
                    for batch_index, (edit, trial, obj) in enumerate(
                        zip(batch_edits, trials, result.objects)
                    ):
                        if trial == current:
                            continue
                        if time.monotonic() >= deadline:
                            stats.stop_reason = "time budget exhausted"
                            break
                        stats.attempts += 1
                        edit_idx = processed_before + batch_index + 1
                        show_progress(granularity, pass_idx, edit_idx, edit_count)
                        if obj is None:
                            stats.compile_failed += 1
                            continue
                        try:
                            key, _ = scorer.score(str(obj))
                        except ScoreError:
                            stats.score_errors += 1
                            continue
                        except OSError as e:
                            clear_progress()
                            print(f"narrow: score server stopped ({e}); aborting",
                                  file=sys.stderr)
                            return current, current_key, stats, current_trace
                        if key <= current_key:
                            replay_edit = (
                                edit.cand_start,
                                edit.cand_end,
                                base_source[edit.base_start:edit.base_end],
                            )
                            current_trace = current_trace + (
                                make_replay_step(
                                    kind="narrow",
                                    mutate_fn=None,
                                    pass_name=f"revert_{granularity}",
                                    before=current,
                                    edits=[replay_edit],
                                    after=trial,
                                    note=edit.describe(),
                                ),
                            )
                            current = trial
                            current_key = key
                            stats.accepted += 1
                            accepted_this_pass += 1
                            accepted_at = batch_index
                            break
                    if stats.stop_reason is not None:
                        break
                    if accepted_at is None:
                        remaining_edits = remaining_edits[batch_count:]
                    else:
                        # Results after the accepted revert came from the old
                        # state. Keep the original reverse-order scan, but
                        # compile its remaining trials from the new state.
                        remaining_edits = remaining_edits[accepted_at + 1:]
                if stats.stop_reason is not None:
                    break
                if accepted_this_pass == 0:
                    break
            if stats.stop_reason is not None:
                break
    finally:
        clear_progress()
        compiler.close()
        scorer.close()
    return current, current_key, stats, current_trace


# In 'novel' re-anchor mode the anchor may move to a candidate scoring up to this
# many penalty units worse than the best (a valley step toward a multi-helper
# match), but never further -- so the exploration pointer can't run off to
# garbage. ~one reorder (60) + slack; best_source still only tracks improvements.
REANCHOR_VALLEY_MARGIN = 120

# Minimum scored-candidate gap between two *lateral* (novel-codegen) re-anchors.
# Every eligible lateral move would otherwise re-type (~50ms clang reparse); on a
# dense plateau that could be once per batch per worker (~50% throughput). This
# caps it to ~throughput/COOLDOWN re-types/s regardless of how many qualify, while
# still firing on every eligible when they're sparse (the common case). Real
# improvements bypass this -- they're rare and always worth taking immediately.
REANCHOR_COOLDOWN = 25


@dataclass
class Shared:
    base_score: int
    base_key: ScoreKey
    base_source: bytes
    unit: str
    fn: str
    keep_prob: float
    max_iters: Optional[int]
    use_pch: bool = False
    split: int = 0
    pch_path: Optional[Path] = None
    batch: int = 8
    # Anchor: the source workers currently mutate from (typed). Starts as the
    # base; on a new best, the improving candidate is re-typed and swapped in,
    # so the typed passes (inline/temp) build on improvements (hill-climbing).
    anchor_source: bytes = b""
    anchor_types: Optional[dict] = None
    anchor_split: int = 0
    anchor_score: int = 0
    anchor_key: Optional[ScoreKey] = None
    anchor_trace: ReplayTrace = ()
    anchor_version: int = 0
    last_reanchor_iter: int = -(10 ** 9)
    reanchor_mode: str = "improve"   # off | improve | novel
    clang_flags: Optional[list] = None
    retype_lock: threading.Lock = field(default_factory=threading.Lock)
    lock: threading.Lock = field(default_factory=threading.Lock)
    stop: threading.Event = field(default_factory=threading.Event)
    best_score: int = 0
    best_key: Optional[ScoreKey] = None
    best_source: Optional[bytes] = None
    best_trace: Optional[ReplayTrace] = None
    best_percent: Optional[float] = None
    iters: int = 0
    compiles_failed: int = 0
    score_errs: int = 0
    n_reanchor: int = 0
    n_mutate_none: int = 0
    n_dup: int = 0
    prof_mutate: float = 0.0
    prof_compile: float = 0.0
    prof_score: float = 0.0
    seen_source: Set[bytes] = field(default_factory=set)
    seen_asm: Set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        self.best_score = self.base_score
        self.best_key = self.base_key
        if self.anchor_key is None:
            self.anchor_key = self.base_key


def _retype(sh: Shared, cand: bytes) -> Optional[dict]:
    """Re-run the clang type oracle on a candidate (write a temp .c, parse it).
    ~50ms; only called on a new best, and serialized (one libclang index)."""
    if sh.clang_flags is None:
        return None
    fd, p = tempfile.mkstemp(suffix=".c", prefix=".retype-", dir=str(source_dir_for(sh.unit)))
    pp = Path(p)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(cand)
        with sh.retype_lock:
            return type_oracle.build_oracle(pp, sh.clang_flags)
    except Exception:
        return None
    finally:
        try:
            pp.unlink()
        except OSError:
            pass


def _reanchor(sh: Shared, cand: bytes, key: ScoreKey, improved: bool,
              trace: ReplayTrace) -> None:
    """Make a candidate the new anchor (after re-typing it). A real improvement
    sticks as long as it's still not worse than the live anchor (hill-climb; a
    stale-worse find loses the race) and bypasses the cooldown. A lateral
    novel-codegen move sticks only if it's within REANCHOR_VALLEY_MARGIN of the
    *current best* (valley exploration, re-checked against the live best so an
    improved best bounds the drift) and the lateral cooldown has elapsed.
    best_source is untouched here, so neither path can lose the best."""
    # Cheap pre-check under the lock so a cooldown-blocked or out-of-window
    # lateral skips the ~50ms re-type entirely (the dense-plateau case the
    # cooldown exists for). Re-checked authoritatively after the re-type, since
    # another worker may re-anchor while we're typing.
    score = key.raw
    if not improved:
        with sh.lock:
            if (score > sh.best_score + REANCHOR_VALLEY_MARGIN
                    or sh.iters - sh.last_reanchor_iter < REANCHOR_COOLDOWN):
                return
    new_types = _retype(sh, cand)
    if not new_types:
        return
    new_split = src_mutate.prefix_split(cand)
    with sh.lock:
        assert sh.anchor_key is not None
        if improved:
            ok = key <= sh.anchor_key
        else:
            ok = (score <= sh.best_score + REANCHOR_VALLEY_MARGIN
                  and sh.iters - sh.last_reanchor_iter >= REANCHOR_COOLDOWN)
        if ok:
            sh.anchor_source = cand
            sh.anchor_types = new_types
            sh.anchor_split = new_split
            sh.anchor_score = score
            sh.anchor_key = key
            sh.anchor_trace = trace
            sh.anchor_version += 1
            sh.last_reanchor_iter = sh.iters
            sh.n_reanchor += 1


def report_find(sh: Shared, key: ScoreKey, source: bytes, cand_o: Path) -> None:
    pct = objdiff_percent(sh.unit, sh.fn, cand_o)
    delta = key.raw - sh.base_score
    pstr = f", {pct:.2f}%" if pct is not None else ""
    print(f"\n*** improvement: score {key.describe()} (delta {delta:+d}{pstr}) ***")
    print(unified_diff(sh.unit, sh.base_source, source), end="")
    sys.stdout.flush()


def print_profile(sh: Shared, elapsed: float, jobs: int) -> None:
    worker_wall = jobs * elapsed
    n_mut = sh.iters + sh.compiles_failed + sh.n_dup + sh.n_mutate_none
    n_comp = sh.iters + sh.compiles_failed
    n_score = sh.iters

    def row(name: str, total: float, count: int) -> None:
        mean = (total / count * 1000) if count else 0.0
        pct = (total / worker_wall * 100) if worker_wall else 0.0
        print(f"  {name:8s} {total:8.2f}s  {pct:5.1f}%  {mean:7.2f} ms/call  ({count} calls)")

    print("\n--- profile (summed across workers) ---")
    print(f"  wall {elapsed:.1f}s x {jobs} workers = {worker_wall:.1f}s worker-time; "
          f"{sh.iters} scored ({sh.iters / elapsed:.1f}/s)")
    print(f"  compile-fail {sh.compiles_failed}, score-err {sh.score_errs}, "
          f"dup {sh.n_dup}, no-mutation {sh.n_mutate_none}, re-anchors {sh.n_reanchor}")
    row("mutate", sh.prof_mutate, n_mut)
    row("compile", sh.prof_compile, n_comp)
    row("score", sh.prof_score, n_score)
    acc = sh.prof_mutate + sh.prof_compile + sh.prof_score
    if worker_wall:
        print(f"  accounted {acc:.1f}s ({acc / worker_wall * 100:.0f}% of worker-time; "
              f"rest = lock/dedup/tempfile/idle)")


def worker(sh: Shared, mutators: Dict[str, "src_mutate.Mutator"],
           mutate_fns: List[str], seed: int) -> None:
    rng = random.Random(seed)
    scorer = make_scorer(sh.unit, sh.fn)
    compiler = FixedBatchCompiler(sh.unit, sh.batch)
    names = set(mutate_fns)
    base_prefix = sh.base_source[:sh.split]   # the #include block (invariant)

    # Local cache of the current anchor; refreshed when a worker swaps it in.
    av = -1
    a_src: bytes = b""
    a_tree = None
    a_fns: dict = {}
    a_types = None
    a_trace: ReplayTrace = ()

    def refresh() -> None:
        nonlocal av, a_src, a_tree, a_fns, a_types, a_trace
        with sh.lock:
            a_src = sh.anchor_source
            a_types = sh.anchor_types
            a_trace = sh.anchor_trace
            av = sh.anchor_version
        a_tree = src_mutate.parse(a_src)
        a_fns = {name: src_mutate.find_function(a_tree.root_node, name) for name in names}

    refresh()
    cur = a_src
    cur_trace = a_trace
    tm = tc = ts = 0.0          # per-thread phase timers (merged at exit)
    n_none = 0
    try:
        while not sh.stop.is_set():
            if sh.anchor_version != av:     # another worker improved the anchor
                refresh()
                cur = a_src
                cur_trace = a_trace
            # --- build a batch of distinct, compilable-looking candidates ---
            t0 = time.perf_counter()
            cands: list = []
            attempts = 0
            while len(cands) < sh.batch and attempts < sh.batch * 4:
                attempts += 1
                if cur is not a_src and rng.random() >= sh.keep_prob:
                    cur = a_src
                    cur_trace = a_trace
                mfn = rng.choice(mutate_fns)
                if cur is a_src:
                    result = mutators[mfn].step_result(cur, rng, tree=a_tree,
                                                       fn=a_fns[mfn], types=a_types)
                else:
                    result = mutators[mfn].step_result(cur, rng)
                if result is None:
                    n_none += 1
                    cur = a_src
                    cur_trace = a_trace
                    continue
                cand = result.source
                cand_trace = cur_trace + (
                    make_replay_step(
                        kind="mutation",
                        mutate_fn=mfn,
                        pass_name=result.pass_name,
                        before=cur,
                        edits=result.edits,
                        after=cand,
                    ),
                )
                cur = cand
                cur_trace = cand_trace
                h = hashlib.sha256(cand).digest()
                with sh.lock:
                    dup = h in sh.seen_source
                    if dup:
                        sh.n_dup += 1   # live, for the status line (free: lock held)
                    elif len(sh.seen_source) < 200_000:
                        sh.seen_source.add(h)
                if dup:
                    continue
                cands.append((cand, cand_trace))
            tm += time.perf_counter() - t0
            if not cands:
                continue

            # --- compile the whole batch in one mwcc invocation ---
            t0 = time.perf_counter()
            cand_sources = [cand for cand, _trace in cands]
            if sh.use_pch and all(c[:sh.split] == base_prefix for c in cand_sources):
                sources = [c[sh.split:].decode("utf-8", "surrogateescape") for c in cand_sources]
                compiled = compiler.compile(sources, prefix_pch=sh.pch_path)
            else:
                sources = [c.decode("utf-8", "surrogateescape") for c in cand_sources]
                compiled = compiler.compile(sources)
            objs = compiled.objects
            tc += time.perf_counter() - t0

            # --- score each candidate ---
            reanchor_cand = None    # candidate to re-anchor to after this batch
            for (cand, trace), obj in zip(cands, objs):
                if sh.stop.is_set():
                    break
                if obj is None:
                    with sh.lock:
                        sh.compiles_failed += 1
                    continue
                if not obj.exists():
                    continue  # vanished (e.g. worker cleanup during shutdown)
                t0 = time.perf_counter()
                try:
                    key, asm_hash = scorer.score(str(obj))
                except ScoreError:
                    # Unscoreable candidate (e.g. the symbol vanished): skip it;
                    # tracked separately from compile failures, server stays up.
                    ts += time.perf_counter() - t0
                    with sh.lock:
                        sh.score_errs += 1
                    continue
                except OSError:
                    # Server pipe gone -- Ctrl-C or shutdown. Stop quietly.
                    sh.stop.set()
                    break
                ts += time.perf_counter() - t0
                with sh.lock:
                    sh.iters += 1
                    assert sh.best_key is not None
                    improved = key < sh.best_key
                    is_zero = key.raw == 0
                    novel = asm_hash not in sh.seen_asm  # never-seen codegen
                    if novel and len(sh.seen_asm) < 200_000:
                        sh.seen_asm.add(asm_hash)
                    if improved:
                        sh.best_score = key.raw
                        sh.best_key = key
                        sh.best_source = cand
                        sh.best_trace = trace
                    if (improved or is_zero) and novel:
                        report_find(sh, key, cand, obj)
                    if is_zero:
                        sh.stop.set()  # 100% match: stop the whole search
                    if sh.max_iters is not None and sh.iters >= sh.max_iters:
                        sh.stop.set()
                    b_score = sh.best_score
                # Re-anchor on this candidate? Always on an improvement. In
                # 'novel' mode also occasionally on a never-seen-codegen
                # candidate that isn't far worse than the best -- so the
                # search can cross the valleys where multi-helper extractions
                # each worsen the score but combine to a match. best_source
                # only tracks strict improvements, so this can't lose ground.
                if not is_zero and sh.reanchor_mode != "off":
                    take = improved or (
                        sh.reanchor_mode == "novel" and novel
                        and key.raw <= b_score + REANCHOR_VALLEY_MARGIN)
                    if take and (reanchor_cand is None or key < reanchor_cand[1]):
                        reanchor_cand = (cand, key, improved, trace)

            # Re-anchor (re-type, ~50ms) so subsequent typed mutations build on
            # the chosen candidate.
            if reanchor_cand is not None and not sh.stop.is_set():
                _reanchor(sh, *reanchor_cand)
                refresh()
                cur = a_src
                cur_trace = a_trace
    finally:
        compiler.close()
        scorer.close()
        with sh.lock:
            sh.prof_mutate += tm
            sh.prof_compile += tc
            sh.prof_score += ts
            sh.n_mutate_none += n_none


def _score_source_for_report(
    unit: str, fn: str, source: bytes, *, show_errors: bool = False
) -> tuple[Optional[ScoreKey], Optional[float]]:
    scorer = make_scorer(unit, fn)
    co = compile_source_text(
        unit, source.decode("utf-8", "surrogateescape"), show_errors=show_errors)
    if co is None:
        scorer.close()
        return None, None
    try:
        key, _ = scorer.score(str(co.obj))
        pct = objdiff_percent(unit, fn, co.obj)
        return key, pct
    finally:
        co.tmpdir.cleanup()
        scorer.close()


def replay_candidate(args: argparse.Namespace) -> int:
    try:
        recipe = read_replay_recipe(Path(args.replay))
    except (OSError, json.JSONDecodeError, ReplayError) as e:
        print(f"error: could not read replay recipe: {e}", file=sys.stderr)
        return 1

    unit = str(recipe["unit"])
    fn = str(recipe["function"])
    if args.func_name is not None and args.func_name != fn:
        print(f"error: replay is for {fn}, not {args.func_name}", file=sys.stderr)
        return 1

    c_file = ROOT / f"src/{unit}.c"
    if not c_file.exists():
        print(f"error: source not found: {c_file}", file=sys.stderr)
        return 1

    base_source = c_file.read_bytes()
    base_sha = _sha256(base_source)
    if base_sha != recipe["base_sha256"]:
        print("error: current source does not match replay base hash", file=sys.stderr)
        print(f"  current: {base_sha}", file=sys.stderr)
        print(f"  replay:  {recipe['base_sha256']}", file=sys.stderr)
        return 1

    trace: ReplayTrace = recipe["steps"]
    try:
        final_source = apply_replay_trace(base_source, trace)
    except ReplayError as e:
        print(f"error: replay failed: {e}", file=sys.stderr)
        return 1

    final_sha = _sha256(final_source)
    if final_sha != recipe["final_sha256"]:
        print("error: replayed source does not match recipe final hash", file=sys.stderr)
        print(f"  replayed: {final_sha}", file=sys.stderr)
        print(f"  recipe:   {recipe['final_sha256']}", file=sys.stderr)
        return 1

    key, pct = _score_source_for_report(unit, fn, final_source, show_errors=True)
    if key is None:
        print("error: replayed source failed to compile or score", file=sys.stderr)
        return 1

    pstr = f" ({pct:.2f}%)" if pct is not None else ""
    print(f"replayed {len(trace)} steps for {fn} in {unit}.c")
    print(f"score {key.describe()}{pstr}")
    print(unified_diff(unit, base_source, final_source), end="")

    matched = key.raw == 0
    do_apply = args.apply == "always" or (args.apply == "match" and matched)
    if do_apply:
        c_file.write_bytes(final_source)
        print(f"applied replayed candidate to {c_file}")
    else:
        print(f"(not applied; re-run replay with --apply=always to write to {c_file})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("func_name", nargs="?")
    ap.add_argument("permute_fn_names", nargs="*", metavar="permute_fn")
    ap.add_argument("-j", type=int, default=8, dest="jobs")
    ap.add_argument("--timeout", type=float, default=None)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--keep-prob", type=float, default=0.25)
    ap.add_argument("--apply", choices=["match", "always", "never"], default="match",
                    help="write the best candidate back to the real source: "
                         "'match' (default) only on a 100%% match, 'always' even "
                         "for a partial improvement, 'never' to leave it alone")
    ap.add_argument("--max-iters", type=int, default=None)
    ap.add_argument("--no-narrow", action="store_true",
                    help="skip post-search diff minimization of an improved candidate")
    ap.add_argument("--narrow-passes", type=int, default=3, metavar="N",
                    help="max fixed-point passes per narrowing granularity (default 3)")
    ap.add_argument("--save-replay", type=Path, default=None, metavar="PATH",
                    help="write a JSON recipe for replaying the final best candidate")
    ap.add_argument("--replay", type=Path, default=None, metavar="PATH",
                    help="replay a saved JSON recipe instead of searching")
    ap.add_argument("--profile", action="store_true",
                    help="print a per-phase timing breakdown on exit")
    ap.add_argument("--no-pch", action="store_true",
                    help="disable the precompiled-header fast path (compile full TU each time)")
    ap.add_argument("--reanchor", choices=["off", "improve", "novel"], default="improve",
                    help="re-type + re-anchor the search on: 'improve' (default) a new "
                         "best; 'novel' also occasional not-worse candidates with "
                         "never-seen codegen (plateau exploration, for multi-helper "
                         "extractions that don't each improve the score); 'off' to "
                         "mutate only from the base")
    ap.add_argument("--batch", type=int, default=16, metavar="K",
                    help="candidates compiled per mwcc invocation, per worker "
                         "(amortizes process startup; default 16, 1 to disable)")
    args = ap.parse_args()

    if args.replay is not None:
        return replay_candidate(args)
    if args.func_name is None:
        ap.error("func_name is required unless --replay is used")

    fn = args.func_name
    unit = find_unit_for_function(fn)
    if unit is None:
        print(f"error: function '{fn}' not in report.json", file=sys.stderr)
        return 1

    c_file = ROOT / f"src/{unit}.c"
    if not c_file.exists():
        print(f"error: source not found: {c_file}", file=sys.stderr)
        return 1

    mutate_fns = args.permute_fn_names or [fn]
    base_source = c_file.read_bytes()

    # Validate mutate targets exist in this TU, and build per-function mutators.
    tree = src_mutate.parse(base_source)
    mutators: Dict[str, src_mutate.Mutator] = {}
    for mfn in mutate_fns:
        if src_mutate.find_function(tree.root_node, mfn) is None:
            print(f"error: function '{mfn}' not found in {c_file}", file=sys.stderr)
            return 1
        mutators[mfn] = src_mutate.Mutator(mfn)

    # Baseline: compile the unmodified real source and score it.
    scorer = make_scorer(unit, fn)
    base_co = compile_source_text(unit, base_source.decode("utf-8", "surrogateescape"),
                                  show_errors=True)
    if base_co is None:
        print("error: baseline source failed to compile", file=sys.stderr)
        return 1
    base_key, _ = scorer.score(str(base_co.obj))
    base_score = base_key.raw
    base_pct = objdiff_percent(unit, fn, base_co.obj)
    base_co.tmpdir.cleanup()

    pstr = f" ({base_pct:.2f}%)" if base_pct is not None else ""
    print(f"permuting {fn} in {unit}.c; mutating {', '.join(mutate_fns)}")
    print(f"baseline score {base_key.describe()}{pstr}; {args.jobs} workers; "
          f"apply={args.apply}")
    if base_score == 0:
        print("baseline already matches (score 0).")
        return 0

    # Precompiled-header fast path: precompile the TU's constant header/preproc
    # prefix once, then recompile only the mutated body per candidate (~2x).
    use_pch = False
    split = 0
    pch_path: Optional[Path] = None
    if not args.no_pch:
        split = src_mutate.prefix_split(base_source)
        if 0 < split < len(base_source):
            pch_path = build_pch(
                unit, base_source[:split].decode("utf-8", "surrogateescape"), quiet=False)
    if pch_path is not None:
        # Fidelity gate: the PCH body compile must score identically to the full
        # compile against the real target, or we fall back to full compiles.
        body0 = base_source[split:].decode("utf-8", "surrogateescape")
        pch_co = compile_source_text(unit, body0, prefix_pch=pch_path, show_errors=True)
        pch_key = None
        if pch_co is not None:
            pch_key, _ = scorer.score(str(pch_co.obj))
            pch_co.tmpdir.cleanup()
        if pch_key == base_key:
            use_pch = True
        else:
            pch_desc = pch_key.describe() if pch_key is not None else "None"
            print(f"PCH: disabled (fidelity gate pch={pch_desc} vs full={base_key.describe()}); "
                  "using full compiles")
            pch_path.unlink(missing_ok=True)
            pch_path = None

    scorer.close()  # workers spawn their own; this baseline server is done

    # Type oracle (clang): expression types so temp_for_expr can extract
    # subexpressions into typed temporaries. One clang parse of the base TU at
    # startup; passes then just look up spans. Auto-disables (permuter still
    # runs, minus temp_for_expr) if libclang / compile_commands are unavailable.
    types: dict = {}
    flags = type_oracle.clang_flags_for(c_file, ROOT / "compile_commands.json")
    if type_oracle.available() and flags is not None:
        types = type_oracle.build_oracle(c_file, flags)
    reanchor_mode = args.reanchor if (types and flags is not None) else "off"
    print((f"type oracle: {len(types)} expression types"
           + (f"; re-anchor={reanchor_mode}" if reanchor_mode != "off" else ""))
          if types else "type oracle: unavailable; inline/temp_for_expr disabled")

    batch = max(1, args.batch)
    if args.max_iters is not None:
        batch = min(batch, max(1, args.max_iters))

    sh = Shared(
        base_score=base_score, base_key=base_key, base_source=base_source, unit=unit, fn=fn,
        keep_prob=args.keep_prob, max_iters=args.max_iters,
        use_pch=use_pch, split=split, pch_path=pch_path,
        batch=batch,
        anchor_source=base_source, anchor_types=types, anchor_split=split,
        anchor_score=base_score, anchor_key=base_key, reanchor_mode=reanchor_mode, clang_flags=flags,
    )

    # Ctrl-C just asks the workers to stop. Handling SIGINT here (rather than
    # relying on KeyboardInterrupt) keeps the whole shutdown path -- the join,
    # the cleanup -- free of stray tracebacks. Worker subprocesses still receive
    # the terminal's group SIGINT directly; worker() absorbs that.
    prev_sigint = signal.signal(signal.SIGINT, lambda *_: sh.stop.set())

    threads = [
        threading.Thread(target=worker, args=(sh, mutators, mutate_fns,
                                               args.seed * 1000 + i), daemon=True)
        for i in range(args.jobs)
    ]
    for t in threads:
        t.start()

    start = time.time()
    try:
        while not sh.stop.is_set() and any(t.is_alive() for t in threads):
            time.sleep(0.2)
            with sh.lock:
                it, bk, cf, nd = sh.iters, sh.best_key, sh.compiles_failed, sh.n_dup
            elapsed = time.time() - start
            rate = it / elapsed if elapsed else 0.0
            total = nd + it + cf
            dup_pct = (nd / total * 100) if total else 0.0
            best = bk.describe_mismatches() if bk is not None else "?"
            sys.stderr.write(
                f"\r{int(elapsed)}s  iters={it} ({rate:.1f}/s)  "
                f"best={best}  dup={dup_pct:.0f}%  compile-fail={cf}   ")
            sys.stderr.flush()
            if args.timeout is not None and elapsed >= args.timeout:
                sh.stop.set()
    finally:
        # Keep the stop-setting handler installed through the join: a group
        # SIGINT pending for the main thread must not fire the default handler
        # (KeyboardInterrupt) while we're joining workers. Restore it last.
        sh.stop.set()
        for t in threads:
            t.join(timeout=10)
        signal.signal(signal.SIGINT, prev_sigint)
        sys.stderr.write("\n")
        if pch_path is not None:
            pch_path.unlink(missing_ok=True)

    if args.profile:
        print_profile(sh, time.time() - start, args.jobs)

    with sh.lock:
        best_key, best_source, best_trace = sh.best_key, sh.best_source, sh.best_trace
    if best_source is None or best_key is None or best_key >= base_key:
        best_desc = best_key.describe() if best_key is not None else "?"
        print(f"no improvement (best {best_desc}, baseline {base_key.describe()}).")
        return 0
    if best_trace is None:
        best_trace = ()

    matched = best_key.raw == 0
    print(f"\nbest score {best_key.describe()} (baseline {base_key.describe()})"
          + ("  -- 100% match!" if matched else ""))

    if not args.no_narrow:
        default_narrow_compiles = (
            64 if args.max_iters is None else min(max(0, args.max_iters), 64)
        )
        narrow_max_compiles = _env_nonnegative_int(
            "PERMUTER_NARROW_MAX_COMPILES", default_narrow_compiles
        )
        narrow_timeout = _env_nonnegative_float(
            "PERMUTER_NARROW_TIMEOUT_SECONDS", 30.0
        )
        print(f"narrow: budget {narrow_max_compiles} compiles, "
              f"{narrow_timeout:g}s, batch {batch}")
        narrowed_source, narrowed_key, narrow_stats, narrowed_trace = narrow_best_source(
            unit, fn, base_source, best_source, best_key, best_trace,
            max_passes=max(0, args.narrow_passes),
            max_compiles=narrow_max_compiles,
            timeout_seconds=narrow_timeout,
            batch_size=batch,
        )
        if narrow_stats.compiles:
            print("narrow: "
                  f"{narrow_stats.accepted}/{narrow_stats.attempts} accepted, "
                  f"{narrow_stats.compiles}/{narrow_max_compiles} compiled, "
                  f"compile-fail {narrow_stats.compile_failed}, "
                  f"score-err {narrow_stats.score_errors}")
        if narrow_stats.stop_reason is not None:
            print(f"narrow: stopped ({narrow_stats.stop_reason})")
        if narrowed_source != best_source or narrowed_key != best_key:
            best_source = narrowed_source
            best_key = narrowed_key
            best_trace = narrowed_trace
            matched = best_key.raw == 0
            print(f"\nnarrowed best score {best_key.describe()} "
                  f"(baseline {base_key.describe()})"
                  + ("  -- 100% match!" if matched else ""))
            print(unified_diff(unit, base_source, best_source), end="")

    if args.save_replay is not None:
        write_replay_recipe(
            args.save_replay,
            unit=unit,
            fn=fn,
            base_source=base_source,
            final_source=best_source,
            base_key=base_key,
            final_key=best_key,
            trace=best_trace,
        )
        print(f"saved replay recipe to {args.save_replay}")

    do_apply = args.apply == "always" or (args.apply == "match" and matched)
    if do_apply:
        c_file.write_bytes(best_source)
        print(f"applied best candidate to {c_file}")
    else:
        print(f"(not applied; apply the diff above, or re-run with "
              f"--apply=always to write to {c_file})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
