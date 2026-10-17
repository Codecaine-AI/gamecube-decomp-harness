#!/usr/bin/env python3
"""
Byte-identity gate for traced (natively rebuilt) MWCC compilers.

A traced `mwcceppc.exe` rebuilt from the rayanht/mwcc decompilation may only
be used if every object it writes is byte-identical to the stock compiler's.
For each MWCC compile unit in `<checkout>/build.ninja` this compiles the
unit's source three times, each into a fresh output directory, with
cwd = checkout and the unit's exact build.ninja flags:

  a. stock   `build/compilers/GC/<ver>/mwcceppc.exe`
  b. traced  `<traced-root>/<ver>/mwcceppc.exe`, no trace environment
  c. traced  with MWCC_TRACE_OUT / MWCC_TRACE_FUNC / MWCC_CACHE_DISABLE=1,
             tracing the first function the stock object (a) defines

and compares the SHA-1 of (b) and (c) against (a). The raw compiler output is
compared: `dtk extab clean` is not run, so extab rules compare like-for-like.
SJIS rules run through `build/tools/sjiswrap.exe` exactly as ninja_compile.py
does (without its ASCII bypass), all under wibo.

The checkout is only read; every output goes under --out (a /tmp directory).
Exit status: 0 when every compared unit is identical, 1 on any mismatch or
traced-only compile failure, 2 on a setup error (including a requested
version whose stock compiles all failed, so nothing was validated).
"""

from __future__ import annotations

import argparse
import concurrent.futures
import fnmatch
import hashlib
import json
import os
import re
import shlex
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

SCHEMA = "mwcc-native-byte-identity-v1"
MWCC_RULES = {"mwcc", "mwcc_sjis", "mwcc_extab", "mwcc_sjis_extab"}
# Precompiled headers (SMS: include/SMS.pch -> build/<ver>/include/SMS.mch, read by
# TUs through `-prefix SMS.mch`). Each is rebuilt here, once per compiler, so units
# never read a stale build-tree PCH (see prepare_pchs).
PCH_RULES = {"mwcc_pch", "mwcc_pch_sjis"}
DEFAULT_VERSIONS = ("1.2.5", "1.2.5n", "1.1p1")
FALLBACK_WIBO = Path("/tmp/rmwcc/mwcc/build/tools/wibo")
COMPILE_DEADLINE_S = 120.0
TRACE_ENV = ("MWCC_TRACE_OUT", "MWCC_TRACE_FUNC", "MWCC_CACHE_DISABLE")
# Traced run on an object that defines no function: tracing stays enabled but
# matches nothing, so the trace-on code path is still exercised.
NO_FUNCTION_SENTINEL = "__byte_identity_no_function__"


# ---------------------------------------------------------------------------
# build.ninja parsing


class NinjaError(ValueError):
    pass


# An unevaluated ninja string: literal text and variable references, in order.
EvalString = List[Tuple[bool, str]]  # (is_variable, literal text or name)

_VAR_NAME = re.compile(r"[A-Za-z0-9_-]+")
_SIMPLE_VAR_NAME = re.compile(r"[A-Za-z0-9_-]+")
_BINDING = re.compile(r"([A-Za-z0-9_.-]+)[ \t]*=[ \t]*(.*)\Z", re.S)


def _parse_eval(text: str, *, path: bool = False) -> Tuple[EvalString, int]:
    """Lex one ninja value (or one path when `path`) from the start of text.

    Returns the parts and the number of characters consumed. Values run to the
    end of text; a path stops at an unescaped space, ':' or '|'.
    """
    parts: EvalString = []
    literal: List[str] = []
    index = 0

    def flush() -> None:
        if literal:
            parts.append((False, "".join(literal)))
            literal.clear()

    while index < len(text):
        char = text[index]
        if path and char in " :|":
            break
        if char != "$":
            literal.append(char)
            index += 1
            continue
        if index + 1 >= len(text):
            raise NinjaError("bad '$' escape at end of line")
        following = text[index + 1]
        if following in "$ :":
            literal.append(following)
            index += 2
        elif following == "{":
            end = text.find("}", index + 2)
            name = text[index + 2 : end] if end >= 0 else ""
            if end < 0 or not _VAR_NAME.fullmatch(name):
                raise NinjaError(f"bad ${{...}} reference in {text!r}")
            flush()
            parts.append((True, name))
            index = end + 1
        else:
            match = _SIMPLE_VAR_NAME.match(text, index + 1)
            if match is None:
                raise NinjaError(f"bad '$' escape in {text!r}")
            flush()
            parts.append((True, match.group(0)))
            index = match.end()
    flush()
    return parts, index


def _evaluate(parts: EvalString, *scopes: Dict[str, str]) -> str:
    out: List[str] = []
    for is_variable, text in parts:
        if not is_variable:
            out.append(text)
            continue
        for scope in scopes:
            if text in scope:
                out.append(scope[text])
                break
    return "".join(out)


def _logical_lines(text: str) -> Iterable[str]:
    """Join `$`-continued physical lines (ninja skips the next line's indent)."""
    pending: Optional[str] = None
    for raw in text.splitlines():
        if pending is not None:
            raw = pending + raw.lstrip(" ")
            pending = None
        stripped = raw.rstrip("\r")
        dollars = len(stripped) - len(stripped.rstrip("$"))
        if dollars % 2 == 1:
            pending = stripped[:-1]
            continue
        yield stripped
    if pending is not None:
        yield pending


@dataclass
class NinjaBuild:
    outputs: List[str]
    rule: str
    inputs: List[str]  # explicit inputs only
    implicit: List[str]
    order_only: List[str]
    variables: Dict[str, str] = field(default_factory=dict)


@dataclass
class NinjaFile:
    variables: Dict[str, str]
    builds: List[NinjaBuild]


def _split_paths(text: str) -> Tuple[List[EvalString], str]:
    """Lex paths until ':' or '|' / '||'; return them and the remainder."""
    paths: List[EvalString] = []
    index = 0
    while index < len(text):
        if text[index] == " ":
            index += 1
            continue
        if text[index] in ":|":
            break
        parts, used = _parse_eval(text[index:], path=True)
        paths.append(parts)
        index += used
    return paths, text[index:]


def parse_ninja(text: str) -> NinjaFile:
    """Parse build.ninja text: top-level variables and build statements.

    Handles `$`-continuations, `$$` / `$ ` / `$:` escapes and `$var` /
    `${var}` references. Top-level variables are evaluated in declaration
    order (ninja semantics); build bindings see earlier bindings of the same
    statement, then top-level variables. Rule/pool bodies are skipped;
    include/subninja are not followed.
    """
    variables: Dict[str, str] = {}
    builds: List[NinjaBuild] = []
    current: Optional[Tuple[NinjaBuild, List[EvalString], List[EvalString], List[EvalString], List[EvalString]]] = None
    in_skipped_block = False

    def finish() -> None:
        nonlocal current
        if current is None:
            return
        build, outs, ins, implicit, order_only = current
        scopes = (build.variables, variables)
        build.outputs = [_evaluate(p, *scopes) for p in outs]
        build.inputs = [_evaluate(p, *scopes) for p in ins]
        build.implicit = [_evaluate(p, *scopes) for p in implicit]
        build.order_only = [_evaluate(p, *scopes) for p in order_only]
        builds.append(build)
        current = None

    for line in _logical_lines(text):
        body = line.lstrip(" \t")
        if not body or body.startswith("#"):
            continue
        indented = len(body) != len(line)
        if indented:
            match = _BINDING.match(body)
            if match is None:
                raise NinjaError(f"bad indented line: {line[:200]!r}")
            if current is not None:
                name, raw = match.groups()
                parts, _ = _parse_eval(raw)
                current[0].variables[name] = _evaluate(
                    parts, current[0].variables, variables
                )
            elif not in_skipped_block:
                raise NinjaError(f"binding outside a block: {line[:200]!r}")
            continue

        finish()
        in_skipped_block = False
        keyword, _, rest = body.partition(" ")
        if keyword == "build":
            outs, remainder = _split_paths(rest)
            if remainder.startswith("|") and not remainder.startswith("||"):
                implicit_outs, remainder = _split_paths(remainder[1:])
                outs.extend(implicit_outs)
            if not remainder.startswith(":"):
                raise NinjaError(f"build line without ':': {line[:200]!r}")
            rule_match = re.match(r":\s*([A-Za-z0-9_.-]+)", remainder)
            if rule_match is None:
                raise NinjaError(f"build line without a rule: {line[:200]!r}")
            remainder = remainder[rule_match.end() :]
            ins, remainder = _split_paths(remainder)
            implicit: List[EvalString] = []
            order_only: List[EvalString] = []
            while remainder:
                if remainder.startswith("||"):
                    order_only_paths, remainder = _split_paths(remainder[2:])
                    order_only.extend(order_only_paths)
                elif remainder.startswith("|@"):
                    _validations, remainder = _split_paths(remainder[2:])
                elif remainder.startswith("|"):
                    implicit_paths, remainder = _split_paths(remainder[1:])
                    implicit.extend(implicit_paths)
                else:
                    raise NinjaError(f"unexpected {remainder!r} in {line[:200]!r}")
            build = NinjaBuild([], rule_match.group(1), [], [], [])
            current = (build, outs, ins, implicit, order_only)
        elif keyword in ("rule", "pool"):
            in_skipped_block = True
        elif keyword in ("default", "include", "subninja"):
            continue
        else:
            match = _BINDING.match(body)
            if match is None:
                raise NinjaError(f"unrecognised line: {line[:200]!r}")
            name, raw = match.groups()
            parts, _ = _parse_eval(raw)
            variables[name] = _evaluate(parts, variables)
    finish()
    return NinjaFile(variables=variables, builds=builds)


# ---------------------------------------------------------------------------
# ELF symbol lookup (32-bit big-endian PowerPC relocatable objects)


def first_function_symbol(data: bytes) -> Optional[str]:
    """Return the first STT_FUNC symbol with nonzero size in a .text-like
    section, in symbol-table order (local or global). Compiler-generated
    names starting with '@' and static initializers (__sinit_*) are used
    only when nothing else qualifies."""
    if data[:4] != b"\x7fELF" or data[4] != 1 or data[5] != 2:
        return None
    e_shoff, = struct.unpack_from(">I", data, 0x20)
    e_shentsize, e_shnum, e_shstrndx = struct.unpack_from(">HHH", data, 0x2E)
    sections = [
        struct.unpack_from(">IIIIIIIIII", data, e_shoff + i * e_shentsize)
        for i in range(e_shnum)
    ]

    def cstr(offset: int) -> str:
        end = data.index(b"\0", offset)
        return data[offset:end].decode("latin-1")

    shstr_offset = sections[e_shstrndx][4]
    names = [cstr(shstr_offset + section[0]) for section in sections]
    fallback: Optional[str] = None
    for section in sections:
        sh_type, sh_offset, sh_size, sh_link, sh_entsize = (
            section[1], section[4], section[5], section[6], section[9]
        )
        if sh_type != 2:  # SHT_SYMTAB
            continue
        str_offset = sections[sh_link][4]
        entsize = sh_entsize or 16
        for index in range(1, sh_size // entsize):
            st_name, _value, st_size, st_info, _other, st_shndx = struct.unpack_from(
                ">IIIBBH", data, sh_offset + index * entsize
            )
            if st_info & 0xF != 2 or st_size == 0 or st_info >> 4 > 2:
                continue
            if not 0 < st_shndx < len(names):
                continue
            section_name = names[st_shndx]
            if not (section_name.startswith(".text") or section_name == ".init"):
                continue
            name = cstr(str_offset + st_name)
            if not name:
                continue
            # (static initializers are generated without passing the inliner, which selects traced functions)
            if not name.startswith(("@", "__sinit_")):
                return name
            fallback = fallback or name
    return fallback


# ---------------------------------------------------------------------------
# Units and compiles


@dataclass
class Unit:
    out: str
    rule: str
    src: str
    mw_version: str  # e.g. GC/1.2.5
    cflags: str

    @property
    def version(self) -> str:
        return self.mw_version.split("/", 1)[-1]

    @property
    def slug(self) -> str:
        return re.sub(r"[^A-Za-z0-9_.-]+", "__", self.out).strip("_")


def collect_units(
    ninja: NinjaFile,
) -> Tuple[List[Unit], Dict[str, int], List[str]]:
    """MWCC units, counts of skipped edges per rule, and malformed edges."""
    units: List[Unit] = []
    skipped: Dict[str, int] = {}
    malformed: List[str] = []
    for build in ninja.builds:
        if build.rule not in MWCC_RULES:
            skipped[build.rule] = skipped.get(build.rule, 0) + 1
            continue
        scopes = (build.variables, ninja.variables)
        mw_version = next((s["mw_version"] for s in scopes if "mw_version" in s), "")
        cflags = build.variables.get("cflags")
        out = build.outputs[0] if build.outputs else "?"
        if not build.inputs or cflags is None or not mw_version:
            malformed.append(out)
            continue
        units.append(Unit(out, build.rule, build.inputs[0], mw_version, cflags))
    units.sort(key=lambda unit: unit.out)
    return units, skipped, malformed


def even_sample(items: List[Any], count: int) -> List[Any]:
    """Deterministic, evenly spaced subset of an already sorted list."""
    if count <= 0 or count >= len(items):
        return list(items)
    return [items[(index * len(items)) // count] for index in range(count)]


def _sha1(path: Path) -> str:
    digest = hashlib.sha1()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _first_diff(left: bytes, right: bytes) -> int:
    for index, (a, b) in enumerate(zip(left, right)):
        if a != b:
            return index
    return min(len(left), len(right))


@dataclass
class CompileResult:
    ok: bool
    obj: Optional[Path]
    sha1: Optional[str]
    seconds: float
    error: Optional[str]


def _run_compile(
    cmd: List[str], cwd: Path, outdir: Path, env: Dict[str, str], deadline: float
) -> CompileResult:
    outdir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    process = subprocess.Popen(
        cmd,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )
    try:
        output, _ = process.communicate(timeout=deadline)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except OSError:
            pass
        process.communicate()
        return CompileResult(
            False, None, None, time.monotonic() - started,
            f"timed out after {deadline:.0f}s",
        )
    seconds = time.monotonic() - started
    text = output.decode("utf-8", errors="replace").strip()
    objs = sorted(outdir.glob("*.o"))
    if process.returncode != 0 or len(objs) != 1:
        detail = text[-2000:] if text else "(no output)"
        reason = (
            f"exit {process.returncode}" if process.returncode != 0
            else f"{len(objs)} objects written"
        )
        return CompileResult(False, None, None, seconds, f"{reason}: {detail}")
    return CompileResult(True, objs[0], _sha1(objs[0]), seconds, None)


@dataclass
class Context:
    checkout: Path
    traced_root: Path
    wibo: Path
    work: Path
    out: Path
    keep: bool
    deadline: float
    base_env: Dict[str, str]
    trace_all: bool = False
    # (compiler kind "stock"|"traced", .mch name) -> directory holding the fresh PCH;
    # .mch name -> the PCH edge's output directory as the units' -i flags name it.
    pch_dirs: Dict[Tuple[str, str], str] = field(default_factory=dict)
    pch_out_dirs: Dict[str, str] = field(default_factory=dict)


def _prefix_name(flags: List[str]) -> Optional[str]:
    for index, token in enumerate(flags[:-1]):
        if token == "-prefix":
            return flags[index + 1]
    return None


def _with_pch(ctx: Context, flags: List[str], kind: str) -> List[str]:
    """`flags` with the fresh PCH's directory searched just before the PCH edge's
    output directory (else before the first -i), so `-prefix` finds it first."""
    name = _prefix_name(flags)
    directory = ctx.pch_dirs.get((kind, name or ""))
    if directory is None:
        return flags
    before = ctx.pch_out_dirs.get(name or "")
    includes = [i for i, t in enumerate(flags[:-1]) if t in ("-i", "-I") and not flags[i + 1].startswith("-")]
    position = next((i for i in includes if os.path.normpath(flags[i + 1]) == before), None)
    if position is None:
        position = includes[0] if includes else len(flags)
    return flags[:position] + ["-i", directory] + flags[position:]


def _pch_out_dir(checkout: Path, output: str) -> str:
    parent = os.path.normpath(os.path.dirname(output))
    if not os.path.isabs(parent):
        return parent
    for path in (parent, os.path.realpath(parent)):
        for base in (str(checkout), os.path.realpath(checkout)):
            if path == base or path.startswith(base.rstrip("/") + "/"):
                return os.path.normpath(os.path.relpath(path, base))
    return parent


def prepare_pchs(ctx: Context, ninja: NinjaFile, units: List[Unit]) -> Dict[str, Any]:
    """Build every PCH the selected units read, with the stock and the traced
    compiler of its version, into <work>/pch/<kind>/<name>/ (cwd = checkout, the
    edge's exact flags). Fills ctx.pch_dirs; returns the report's `pch` record.
    A PCH that fails to build leaves its units on the build-tree PCH."""
    edges: Dict[str, Tuple[NinjaBuild, str]] = {}
    for build in ninja.builds:
        if build.rule in PCH_RULES and build.outputs and build.inputs:
            mw_version = build.variables.get("mw_version") or ninja.variables.get("mw_version", "")
            edges[Path(build.outputs[0]).name] = (build, mw_version)
    wanted = {_prefix_name(shlex.split(unit.cflags)) for unit in units} - {None}
    record: Dict[str, Any] = {}
    for name in sorted(n for n in wanted if n in edges):
        build, mw_version = edges[name]
        cflags = build.variables.get("cflags", "")
        version = mw_version.split("/", 1)[-1]
        ctx.pch_out_dirs[name] = _pch_out_dir(ctx.checkout, build.outputs[0])
        entry: Dict[str, Any] = {"source": build.inputs[0], "version": version}
        for kind, compiler in (
            ("stock", ctx.checkout / "build/compilers" / mw_version / "mwcceppc.exe"),
            ("traced", ctx.traced_root / version / "mwcceppc.exe"),
        ):
            outdir = ctx.work / "pch" / kind / Path(name).stem
            shutil.rmtree(outdir, ignore_errors=True)
            outdir.mkdir(parents=True)
            cmd = [str(ctx.wibo)]
            if "sjis" in build.rule:
                cmd.append(str(ctx.checkout / "build/tools/sjiswrap.exe"))
            cmd += [str(compiler), *shlex.split(cflags), "-MMD", "-c", build.inputs[0],
                    "-o", str(outdir), "-precompile", name]
            started = time.monotonic()
            try:
                run = subprocess.run(cmd, cwd=ctx.checkout, env=ctx.base_env, capture_output=True,
                                     stdin=subprocess.DEVNULL, timeout=ctx.deadline)
                ok = run.returncode == 0 and (outdir / name).is_file()
                error = None if ok else f"exit {run.returncode}: " + run.stdout.decode("utf-8", "replace")[-1500:]
            except subprocess.TimeoutExpired:
                ok, error = False, f"timed out after {ctx.deadline:.0f}s"
            entry[kind] = {
                "ok": ok,
                "sha1": _sha1(outdir / name) if ok else None,
                "seconds": round(time.monotonic() - started, 3),
                "error": error,
            }
            if ok:
                ctx.pch_dirs[(kind, name)] = str(outdir)
        record[name] = entry
    return record


def _prefix(ctx: Context, unit: Unit, compiler: Path) -> List[str]:
    cmd = [str(ctx.wibo)]
    if "sjis" in unit.rule:
        cmd.append(str(ctx.checkout / "build/tools/sjiswrap.exe"))
    cmd.append(str(compiler))
    return cmd


def check_unit(ctx: Context, unit: Unit) -> Dict[str, Any]:
    started = time.monotonic()
    unit_dir = Path(tempfile.mkdtemp(prefix=f"{unit.slug[-80:]}.", dir=ctx.work))
    trace_path = ctx.out / "traces" / f"{unit.slug}.trace.jsonl"
    trace_path.unlink(missing_ok=True)
    stock = ctx.checkout / "build/compilers" / unit.mw_version / "mwcceppc.exe"
    traced = ctx.traced_root / unit.version / "mwcceppc.exe"
    tail = shlex.split(unit.cflags) + ["-MMD", "-c", unit.src, "-o"]

    def compile_with(compiler: Path, name: str, env: Dict[str, str]) -> CompileResult:
        outdir = unit_dir / name
        flags = _with_pch(ctx, tail, "stock" if compiler == stock else "traced")
        cmd = _prefix(ctx, unit, compiler) + flags + [str(outdir)]
        return _run_compile(cmd, ctx.checkout, outdir, env, ctx.deadline)

    record: Dict[str, Any] = {
        "unit": unit.out,
        "source": unit.src,
        "version": unit.version,
        "rule": unit.rule,
        "fn": None,
        "status": None,
        "ok_off": None,
        "ok_on": None,
        "sha1": {},
        "trace_lines": 0,
        "seconds": 0.0,
        "error": None,
    }
    a = compile_with(stock, "stock", ctx.base_env)
    record["sha1"]["stock"] = a.sha1
    b = compile_with(traced, "off", ctx.base_env)
    record["sha1"]["off"] = b.sha1
    if not a.ok:
        record["status"] = "stock_failed"
        record["error"] = f"stock: {a.error}"
        if not b.ok:
            record["error"] += f"\ntraced(off): {b.error}"
    else:
        data_a = a.obj.read_bytes()
        try:
            record["fn"] = first_function_symbol(data_a)
        except (struct.error, ValueError, IndexError) as error:
            record["fn_error"] = f"ELF parse failed: {error}"
        trace_path.parent.mkdir(parents=True, exist_ok=True)
        env_on = dict(ctx.base_env)
        env_on["MWCC_TRACE_OUT"] = str(trace_path)
        # (--trace-all traces every function of the unit, the hardest test of the hooks)
        env_on["MWCC_TRACE_FUNC"] = "*" if ctx.trace_all else (record["fn"] or NO_FUNCTION_SENTINEL)
        env_on["MWCC_CACHE_DISABLE"] = "1"
        c = compile_with(traced, "on", env_on)
        record["sha1"]["on"] = c.sha1
        record["ok_off"] = b.ok and b.sha1 == a.sha1
        record["ok_on"] = c.ok and c.sha1 == a.sha1
        if trace_path.is_file():
            with trace_path.open("rb") as stream:
                record["trace_lines"] = sum(1 for _ in stream)
        errors = [
            f"traced({name}): {result.error}"
            for name, result in (("off", b), ("on", c))
            if not result.ok
        ]
        if errors:
            record["status"] = "traced_failed"
            record["error"] = "\n".join(errors)
        elif record["ok_off"] and record["ok_on"]:
            record["status"] = "identical"
        else:
            record["status"] = "mismatch"
        diffs = {}
        for name, result in (("off", b), ("on", c)):
            if result.ok and result.sha1 != a.sha1:
                data = result.obj.read_bytes()
                diffs[name] = {
                    "first_diff_offset": _first_diff(data_a, data),
                    "size": len(data),
                    "stock_size": len(data_a),
                }
        if diffs:
            record["diff"] = diffs
    record["seconds"] = round(time.monotonic() - started, 3)

    keep = ctx.keep or record["status"] in ("mismatch", "traced_failed")
    if keep:
        record["kept_dir"] = str(unit_dir)
        if trace_path.is_file():
            record["trace_path"] = str(trace_path)
    else:
        shutil.rmtree(unit_dir, ignore_errors=True)
        trace_path.unlink(missing_ok=True)
    return record


# ---------------------------------------------------------------------------
# CLI


def _tmp_root() -> Path:
    return Path(os.path.realpath("/tmp"))


def _under_tmp(path: Path) -> bool:
    resolved = Path(os.path.realpath(path))
    root = _tmp_root()
    return resolved == root or root in resolved.parents


def _select_wibo(checkout: Path, explicit: Optional[str]) -> Optional[Path]:
    if explicit:
        return Path(explicit).expanduser().resolve()
    candidates = [checkout / "build/tools/wibo"]
    if os.environ.get("MWCC_WIBO"):
        candidates.append(Path(os.environ["MWCC_WIBO"]).expanduser())
    candidates.append(FALLBACK_WIBO)
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def _normalise_versions(raw: str) -> List[str]:
    versions = []
    for item in raw.split(","):
        item = item.strip()
        if item:
            versions.append(item.split("/", 1)[1] if item.startswith("GC/") else item)
    return versions


def _matches(unit: Unit, patterns: List[str]) -> bool:
    return any(
        fnmatch.fnmatchcase(unit.out, pattern) or fnmatch.fnmatchcase(unit.src, pattern)
        for pattern in patterns
    )


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Check a traced mwcceppc.exe for byte-identical objects."
    )
    parser.add_argument("--checkout", required=True, help="game checkout (read-only)")
    parser.add_argument(
        "--traced-root", required=True,
        help="directory holding <ver>/mwcceppc.exe (e.g. /tmp/wcl-native/bin)",
    )
    parser.add_argument(
        "--versions", default=",".join(DEFAULT_VERSIONS),
        help="comma list of MWCC versions (default: %(default)s)",
    )
    selection = parser.add_mutually_exclusive_group()
    selection.add_argument(
        "--sample", type=int, help="evenly spaced N units per version (sorted)"
    )
    selection.add_argument(
        "--units", help="comma list of globs matched against object or source path"
    )
    parser.add_argument("--jobs", type=int, default=os.cpu_count() or 1)
    parser.add_argument("--wibo", help="wibo binary (default: checkout's, then $MWCC_WIBO, then /tmp/rmwcc)")
    parser.add_argument("--out", help="work directory under /tmp")
    parser.add_argument("--json", help="report path (default: <out>/byte_identity.json)")
    parser.add_argument(
        "--deadline", type=float, default=COMPILE_DEADLINE_S,
        help="seconds per compile before it is killed (default: %(default)s)",
    )
    parser.add_argument(
        "--keep", action="store_true", help="keep every unit's temp dir and trace"
    )
    parser.add_argument(
        "--trace-all", action="store_true",
        help="trace every function (MWCC_TRACE_FUNC=*) instead of one per unit",
    )
    args = parser.parse_args(argv)

    def fail(message: str) -> int:
        print(f"byte_identity: {message}", file=sys.stderr)
        return 2

    checkout = Path(args.checkout).expanduser().resolve()
    traced_root = Path(args.traced_root).expanduser().resolve()
    ninja_path = checkout / "build.ninja"
    if not ninja_path.is_file():
        return fail(f"no build.ninja in {checkout}")
    wibo = _select_wibo(checkout, args.wibo)
    if wibo is None or not wibo.is_file():
        return fail(f"wibo not found (checked {checkout / 'build/tools/wibo'}, {FALLBACK_WIBO})")
    out = Path(args.out) if args.out else Path(
        tempfile.mkdtemp(prefix="mwcc-byte-identity-", dir=_tmp_root())
    )
    if not _under_tmp(out):
        return fail(f"--out must be under /tmp: {out}")
    out = Path(os.path.realpath(out))
    out.mkdir(parents=True, exist_ok=True)
    report_path = Path(args.json) if args.json else out / "byte_identity.json"

    versions = _normalise_versions(args.versions)
    warnings: List[str] = []
    stock_sha1: Dict[str, str] = {}
    traced_sha1: Dict[str, str] = {}
    for version in versions:
        stock = checkout / "build/compilers/GC" / version / "mwcceppc.exe"
        traced = traced_root / version / "mwcceppc.exe"
        if not stock.is_file():
            return fail(f"missing stock compiler {stock}")
        if not traced.is_file():
            return fail(f"missing traced compiler {traced}")
        if not (traced.parent / "lmgr326b.dll").is_file():
            warnings.append(f"{traced.parent} has no lmgr326b.dll")
        stock_sha1[version] = _sha1(stock)
        traced_sha1[version] = _sha1(traced)
        if stock_sha1[version] == traced_sha1[version]:
            warnings.append(f"GC/{version}: traced compiler is the stock binary")
    for warning in warnings:
        print(f"warning: {warning}", file=sys.stderr)

    try:
        ninja = parse_ninja(ninja_path.read_text(encoding="utf-8"))
    except (NinjaError, UnicodeError) as error:
        return fail(f"cannot parse {ninja_path}: {error}")
    all_units, skipped_rules, malformed = collect_units(ninja)
    skipped_versions: Dict[str, int] = {}
    by_version: Dict[str, List[Unit]] = {version: [] for version in versions}
    for unit in all_units:
        if unit.mw_version.startswith("GC/") and unit.version in by_version:
            by_version[unit.version].append(unit)
        else:
            skipped_versions[unit.mw_version] = skipped_versions.get(unit.mw_version, 0) + 1
    patterns = [p.strip() for p in args.units.split(",") if p.strip()] if args.units else None
    selected: List[Unit] = []
    not_selected = 0
    for version in versions:
        candidates = by_version[version]
        if patterns is not None:
            chosen = [unit for unit in candidates if _matches(unit, patterns)]
        elif args.sample is not None:
            chosen = even_sample(candidates, args.sample)
        else:
            chosen = candidates
        not_selected += len(candidates) - len(chosen)
        selected.extend(chosen)
    if not selected:
        return fail("no units selected")

    work = out / "work"
    work.mkdir(parents=True, exist_ok=True)
    base_env = {k: v for k, v in os.environ.items() if k not in TRACE_ENV}
    ctx = Context(
        checkout, traced_root, wibo, work, out, args.keep, args.deadline, base_env,
        trace_all=args.trace_all,
    )
    started = time.monotonic()
    pch_record = prepare_pchs(ctx, ninja, selected)
    for name, entry in pch_record.items():
        for kind in ("stock", "traced"):
            if not entry[kind]["ok"]:
                warnings.append(f"{kind} PCH {name} failed; its units use the build-tree PCH: "
                                f"{(entry[kind]['error'] or '').splitlines()[:1]}")
                print(f"warning: {warnings[-1]}", file=sys.stderr)
    records: List[Dict[str, Any]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.jobs)) as pool:
        futures = [pool.submit(check_unit, ctx, unit) for unit in selected]
        for future in concurrent.futures.as_completed(futures):
            records.append(future.result())
    records.sort(key=lambda record: (record["version"], record["unit"]))
    elapsed = time.monotonic() - started
    if not args.keep:
        shutil.rmtree(work / "pch", ignore_errors=True)
    try:
        work.rmdir()
    except OSError:
        pass

    totals: Dict[str, Dict[str, int]] = {}
    for version in versions:
        rows = [r for r in records if r["version"] == version]
        totals[version] = {
            "units": len(rows),
            "identical_off": sum(1 for r in rows if r["ok_off"]),
            "identical_on": sum(1 for r in rows if r["ok_on"]),
            "mismatched": sum(1 for r in rows if r["status"] == "mismatch"),
            "stock_failed": sum(1 for r in rows if r["status"] == "stock_failed"),
            "traced_failed": sum(1 for r in rows if r["status"] == "traced_failed"),
            "zero_trace": sum(
                1 for r in rows if r["status"] != "stock_failed" and r["trace_lines"] == 0
            ),
        }
    mismatches = [r for r in records if r["status"] in ("mismatch", "traced_failed")]
    report = {
        "schema": SCHEMA,
        "checkout": str(checkout),
        "traced_root": str(traced_root),
        "trace_all": args.trace_all,
        "wibo": str(wibo),
        "versions": versions,
        "selection": (
            {"units": patterns} if patterns is not None
            else {"sample": args.sample} if args.sample is not None
            else {"all": True}
        ),
        "traced_sha1": traced_sha1,
        "stock_sha1": stock_sha1,
        "warnings": warnings,
        "skipped": {
            "rules": dict(sorted(skipped_rules.items())),
            "versions": dict(sorted(skipped_versions.items())),
            "not_selected": not_selected,
            "malformed": malformed,
        },
        "seconds": round(elapsed, 3),
        "pch": pch_record,
        "totals": totals,
        "mismatches": mismatches,
        "units": records,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(f"checkout     {checkout}")
    print(f"traced root  {traced_root}")
    mwcc_skipped = {k: v for k, v in skipped_rules.items() if k.startswith("mwcc")}
    if mwcc_skipped or skipped_versions:
        print(f"skipped      rules {mwcc_skipped or {}}  versions {skipped_versions or {}}")
    broken_versions: List[str] = []
    for version, row in totals.items():
        print(
            f"GC/{version:<7} units {row['units']:>4}  identical off/on "
            f"{row['identical_off']}/{row['identical_on']}  mismatched {row['mismatched']}  "
            f"traced_failed {row['traced_failed']}  stock_failed {row['stock_failed']}  "
            f"zero_trace {row['zero_trace']}"
        )
        if row["units"] and row["stock_failed"] == row["units"]:
            broken_versions.append(version)
            sample = next(r["error"] for r in records if r["version"] == version)
            print(f"  every stock compile failed for GC/{version} (check --wibo):")
            print(f"    {(sample or '').splitlines()[0][:300]}")
    for record in mismatches[:10]:
        first_error = (record["error"] or "").splitlines()[:1]
        print(f"  {record['status']}: GC/{record['version']} {record['unit']} {' '.join(first_error)}")
    if len(mismatches) > 10:
        print(f"  ... {len(mismatches) - 10} more in the report")
    print(f"{len(records)} units in {elapsed:.1f}s with {args.jobs} jobs; report {report_path}")
    if mismatches:
        return 1
    if broken_versions:
        # Nothing was validated for these versions: a setup error, not a pass.
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
