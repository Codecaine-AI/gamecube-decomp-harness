#!/usr/bin/env python3
"""
Compile a single melee translation unit using the exact MWCC command that
`build.ninja` would, without going through Ninja itself.

Extracted from checkdiff.py so the permuter (permute.py) and checkdiff.py
share one faithful, ninja-coupled compile path. Parsed build edges and report
symbols are cached under `build/.ninja_compile_cache` (or $NINJA_COMPILE_CACHE_DIR). Compilation invokes
`<runner> [sjiswrap] mwcceppc.exe <cflags> -c <src> -o <tmp.o>` (plus `dtk
extab clean` for extab rules), writing the object to a throwaway temp dir.
For SJIS rules, sjiswrap is omitted only when a retained depfile proves the TU
source and every dependency are ASCII; `MWCC_NO_SJIS_BYPASS=1` disables that
optimization. The runner is wibo when available, with Wine as the macOS fallback.

`compile_source_text()` additionally lets a caller compile an in-memory
*candidate* source (the permuter's mutated text): it writes the text to a
hidden temp `.c` **in the original source file's directory**, so that
`-cwd source` and quote-includes (`#include "foo.h"`) resolve byte-identically
to the real build, then compiles that file with the TU's real flags.
"""

from __future__ import annotations

import atexit
import hashlib
import json
import os
import platform
import re
import shutil
import shlex
import stat
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

# Project checkout root: explicit override, then Claude Code's project dir,
# then assume this script lives at <melee>/tools/.
from bounded_run import DEFAULT_OUTPUT_CAP, BoundedRun, run_bounded  # noqa: F401
from project_root import resolve_root
from project_layout import get_project_layout

ROOT = resolve_root()
LAYOUT = get_project_layout(ROOT)
REPORT_PATH = LAYOUT.report_path
BUILD_SUBDIR = LAYOUT.path_label(REPORT_PATH.parent).as_posix()
BUILD_INDEX_CACHE_NAME = f"build-edge-index-v3-{hashlib.sha256(BUILD_SUBDIR.encode()).hexdigest()[:12]}.json"
SRC_ROOT = ROOT / "src"

MWCC_RULES = {"mwcc", "mwcc_sjis", "mwcc_extab", "mwcc_sjis_extab"}
# Precompiled-header edges (SMS: `include/SMS.pch` -> `build/<ver>/include/SMS.mch`,
# used by TUs through `-prefix SMS.mch`). See fresh_pch_flags().
PCH_RULES = {"mwcc_pch", "mwcc_pch_sjis"}
# NINJA_COMPILE_CACHE_DIR moves every cache (parsed metadata, SJIS verdicts,
# extab-clean objects) out of the checkout, e.g. for tools that must not write it.
_CACHE_DIR = (
    Path(os.environ["NINJA_COMPILE_CACHE_DIR"]).expanduser()
    if os.environ.get("NINJA_COMPILE_CACHE_DIR")
    else ROOT / "build/.ninja_compile_cache"
)
_METADATA_CACHE_VERSION = 1
_SJIS_VERDICT_CACHE_VERSION = 1
_CLEAN_OBJECT_CACHE_VERSION = 1
_METADATA_MEMORY: Dict[str, Tuple[Dict[str, Any], Any]] = {}
_SJIS_BASE_MEMORY: Dict[str, Dict[str, Any]] = {}
_SJIS_VERDICT_MEMORY: Dict[Tuple[str, str], bool] = {}
_DTK_HASH_MEMORY: Dict[str, Tuple[Tuple[int, int, int, int, int], str]] = {}


@dataclass
class BuildBlock:
    rule: str
    src: str
    mw_version: str
    cflags: str
    extab_padding: Optional[str] = None


@dataclass
class CompiledObject:
    obj: Path
    tmpdir: tempfile.TemporaryDirectory


def _absolute_path(path: Path) -> Path:
    return Path(os.path.abspath(path))


def _metadata_fingerprint(path: Path) -> Dict[str, Any]:
    """Cache key: path, size, mtime, and SHA-1 of the first 4 KiB."""
    absolute = _absolute_path(path)
    before = absolute.stat()
    with absolute.open("rb") as stream:
        head_sha1 = hashlib.sha1(stream.read(4096)).hexdigest()
    after = absolute.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise OSError(f"file changed while fingerprinting: {absolute}")
    return {
        "path": str(absolute),
        "size": after.st_size,
        "mtime_ns": after.st_mtime_ns,
        "head_sha1": head_sha1,
    }


def _read_json_cache(path: Path) -> Optional[Dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, ValueError, TypeError):
        return None
    return value if isinstance(value, dict) else None


def _atomic_write_json(path: Path, value: Dict[str, Any]) -> None:
    """Best-effort cache write; readers see the old or complete new file."""
    tmp_path: Optional[Path] = None
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent)
        )
        tmp_path = Path(tmp_name)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=True, separators=(",", ":"))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp_path, path)
        tmp_path = None
    except (OSError, TypeError, ValueError):
        pass
    finally:
        if tmp_path is not None:
            try:
                tmp_path.unlink()
            except OSError:
                pass


def _file_identity(value: os.stat_result) -> Tuple[int, int, int, int, int]:
    return (
        value.st_dev,
        value.st_ino,
        value.st_size,
        value.st_mtime_ns,
        value.st_ctime_ns,
    )


def _stable_sha256(path: Path) -> Optional[Tuple[Tuple[int, int, int, int, int], str]]:
    """Hash a regular file only when its identity stays stable while reading."""
    absolute = _absolute_path(path)
    try:
        with absolute.open("rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode):
                return None
            digest = hashlib.sha256()
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
            after = os.fstat(stream.fileno())
    except OSError:
        return None
    identity = _file_identity(after)
    if _file_identity(before) != identity:
        return None
    return identity, digest.hexdigest()


def _dtk_binary_hash(dtk: Path) -> Optional[str]:
    """Return a content hash, avoiding another 8 MiB read while DTK is unchanged."""
    absolute = _absolute_path(dtk)
    try:
        identity = _file_identity(absolute.stat())
    except OSError:
        return None
    cached = _DTK_HASH_MEMORY.get(str(absolute))
    if cached is not None and cached[0] == identity:
        return cached[1]
    stable = _stable_sha256(absolute)
    if stable is None:
        return None
    _DTK_HASH_MEMORY[str(absolute)] = stable
    return stable[1]


def _clean_object_cache_path(
    obj: Path, dtk: Path, padding: str
) -> Optional[Path]:
    object_hash = _stable_sha256(obj)
    dtk_hash = _dtk_binary_hash(dtk)
    if object_hash is None or dtk_hash is None:
        return None
    key = json.dumps(
        {
            "version": _CLEAN_OBJECT_CACHE_VERSION,
            "input_sha256": object_hash[1],
            "dtk_sha256": dtk_hash,
            "flags": ["extab", "clean", "--padding", padding],
        },
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("ascii")
    digest = hashlib.sha256(key).hexdigest()
    return _CACHE_DIR / "clean-objects" / digest[:2] / f"{digest}.o"


def _atomic_copy_file(source: Path, destination: Path) -> bool:
    """Copy through a sibling temporary so destination is old or complete."""
    tmp_path: Optional[Path] = None
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(
            prefix=f".{destination.name}.", suffix=".tmp", dir=str(destination.parent)
        )
        os.close(fd)
        tmp_path = Path(tmp_name)
        shutil.copyfile(source, tmp_path)
        os.replace(tmp_path, destination)
        tmp_path = None
        return True
    except OSError:
        return False
    finally:
        if tmp_path is not None:
            try:
                tmp_path.unlink()
            except OSError:
                pass


def _run_extab_clean(
    obj: Path, dtk: Path, padding: str, *, quiet: bool,
    timeout: Optional[float] = None, output_cap: Optional[int] = None,
) -> bool:
    """Clean obj via DTK, reusing a content-addressed, atomically-written result.

    `timeout` (seconds left of the caller's deadline) and `output_cap` bound DTK
    like the compile itself: a stalled cleaner is killed with its process group
    and the clean fails. Without either, DTK runs unbounded as before.
    """
    bounded = timeout is not None or output_cap is not None
    if bounded and timeout is not None and timeout <= 0:
        return False

    def run(input_path: Path, output_path: Path) -> subprocess.CompletedProcess:
        command = [str(dtk), "extab", "clean", "--padding", padding, str(input_path), str(output_path)]
        if bounded:
            result = run_bounded(command, cwd=ROOT, timeout=timeout,
                                 output_cap=output_cap or DEFAULT_OUTPUT_CAP)
            stderr = result.stderr + (f"\ndtk extab clean timed out after {timeout:g}s (killed)" if result.timed_out else "")
            return subprocess.CompletedProcess(command, -1 if result.returncode is None else result.returncode,
                                               result.stdout, stderr)
        return subprocess.run(command, cwd=ROOT, capture_output=True, text=True)

    cache_path = _clean_object_cache_path(obj, dtk, padding)
    if cache_path is not None and cache_path.is_file():
        if _atomic_copy_file(cache_path, obj):
            return True

    if cache_path is None:
        result = run(obj, obj)
        cleaned = result.returncode == 0
    else:
        cache_tmp: Optional[Path] = None
        try:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_name = tempfile.mkstemp(
                prefix=f".{cache_path.name}.",
                suffix=".tmp",
                dir=str(cache_path.parent),
            )
            os.close(fd)
            cache_tmp = Path(tmp_name)
        except OSError:
            cache_tmp = None

        if cache_tmp is None:
            result = run(obj, obj)
            cleaned = result.returncode == 0
        else:
            try:
                result = run(obj, cache_tmp)
                try:
                    output_size = cache_tmp.stat().st_size
                except OSError:
                    output_size = 0
                cleaned = result.returncode == 0 and output_size > 0
                if cleaned:
                    try:
                        with cache_tmp.open("rb") as stream:
                            os.fsync(stream.fileno())
                        os.replace(cache_tmp, cache_path)
                        cache_tmp = None
                        cleaned = _atomic_copy_file(cache_path, obj)
                    except OSError:
                        cleaned = _atomic_copy_file(cache_tmp, obj)
            finally:
                if cache_tmp is not None:
                    try:
                        cache_tmp.unlink()
                    except OSError:
                        pass

    if not cleaned and not quiet:
        print("extab post-processing failed:", file=sys.stderr)
        print(result.stdout)
        print(result.stderr, file=sys.stderr)
    return cleaned


def _load_metadata(
    cache_name: str,
    source_path: Path,
    parse: Callable[[Path], Any],
    valid: Callable[[Any], bool],
) -> Any:
    """Load parsed metadata from memory/disk, falling back on every error."""
    if os.environ.get("NINJA_COMPILE_NO_METADATA_CACHE") == "1":
        return parse(source_path)

    for _attempt in range(2):
        try:
            fingerprint = _metadata_fingerprint(source_path)
        except OSError:
            return parse(source_path)

        memory = _METADATA_MEMORY.get(cache_name)
        if memory is not None and memory[0] == fingerprint and valid(memory[1]):
            return memory[1]

        cache_path = _CACHE_DIR / cache_name
        cached = _read_json_cache(cache_path)
        if (
            cached is not None
            and cached.get("version") == _METADATA_CACHE_VERSION
            and cached.get("source") == fingerprint
            and valid(cached.get("data"))
        ):
            data = cached["data"]
            _METADATA_MEMORY[cache_name] = (fingerprint, data)
            return data

        data = parse(source_path)
        try:
            after = _metadata_fingerprint(source_path)
        except OSError:
            return data
        if after != fingerprint:
            continue
        _atomic_write_json(
            cache_path,
            {
                "version": _METADATA_CACHE_VERSION,
                "source": fingerprint,
                "data": data,
            },
        )
        _METADATA_MEMORY[cache_name] = (fingerprint, data)
        return data

    return parse(source_path)


def find_unit_for_function(func_name: str) -> Optional[str]:
    """Return the build-object unit key containing ``func_name``."""
    return LAYOUT.operational_unit_for_function(func_name)


def _parse_build_index(path: Path) -> Dict[str, Any]:
    text = path.read_text(encoding="utf-8").replace("$\n", " ")
    cflags: List[str] = []
    cflag_indexes: Dict[str, int] = {}
    edges: Dict[str, List[Any]] = {}
    errors: Dict[str, str] = {}
    # .mch basename -> [output as written, rule, source, mw_version, cflags index]
    pch: Dict[str, List[Any]] = {}

    for block in re.split(r"^build ", text, flags=re.M):
        lines = block.splitlines()
        if not lines:
            continue
        build_line = lines[0]
        match = re.match(r"(\S+\.o)\s*:\s*(\S+)\s+(.+)", build_line)
        if match is None:
            _parse_pch_edge(block, build_line, cflags, cflag_indexes, pch)
            continue
        obj_path, rule, raw_inputs = match.groups()
        explicit_inputs = re.split(r"\s+\|\|?\s+", raw_inputs, maxsplit=1)[0]
        try:
            inputs = shlex.split(explicit_inputs)
        except ValueError as error:
            errors[obj_path] = f"could not parse source inputs: {error}"
            continue
        if not inputs:
            errors[obj_path] = "has no source input"
            continue

        variables = {
            variable.group(1): variable.group(2).strip()
            for variable in re.finditer(
                r"^\s+([A-Za-z_][A-Za-z0-9_]*) = (.*)$", block, re.M
            )
        }
        missing = next(
            (name for name in ("mw_version", "cflags") if name not in variables),
            None,
        )
        if missing is not None:
            errors[obj_path] = f"is missing {missing}"
            continue
        flags = variables["cflags"]
        flags_index = cflag_indexes.get(flags)
        if flags_index is None:
            flags_index = len(cflags)
            cflag_indexes[flags] = flags_index
            cflags.append(flags)
        edges[obj_path] = [
            rule,
            inputs[0],
            variables["mw_version"],
            flags_index,
            variables.get("extab_padding"),
        ]

    return {"cflags": cflags, "edges": edges, "errors": errors, "pch": pch}


def _parse_pch_edge(
    block: str,
    build_line: str,
    cflags: List[str],
    cflag_indexes: Dict[str, int],
    pch: Dict[str, List[Any]],
) -> None:
    """Record a `build <out>.mch: mwcc_pch[_sjis] <in>.pch` edge (configure.py
    writes its output as an absolute path on a continuation line)."""
    match = re.match(r"\s*(\S+\.mch)\s*:\s*(\S+)\s+(.+)", build_line)
    if match is None or match.group(2) not in PCH_RULES:
        return
    output, rule, raw_inputs = match.groups()
    try:
        inputs = shlex.split(re.split(r"\s+\|\|?\s+", raw_inputs, maxsplit=1)[0])
    except ValueError:
        return
    variables = {
        variable.group(1): variable.group(2).strip()
        for variable in re.finditer(r"^\s+([A-Za-z_][A-Za-z0-9_]*) = (.*)$", block, re.M)
    }
    if not inputs or "mw_version" not in variables or "cflags" not in variables:
        return
    flags = variables["cflags"]
    flags_index = cflag_indexes.get(flags)
    if flags_index is None:
        flags_index = len(cflags)
        cflag_indexes[flags] = flags_index
        cflags.append(flags)
    pch[Path(output).name] = [output, rule, inputs[0], variables["mw_version"], flags_index]


def _valid_build_index(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    cflags = value.get("cflags")
    edges = value.get("edges")
    errors = value.get("errors")
    if not isinstance(cflags, list) or not all(isinstance(flag, str) for flag in cflags):
        return False
    if not isinstance(edges, dict) or not isinstance(errors, dict):
        return False
    pch = value.get("pch")
    if not isinstance(pch, dict) or not all(
        isinstance(name, str)
        and isinstance(edge, list)
        and len(edge) == 5
        and all(isinstance(item, str) for item in edge[:4])
        and isinstance(edge[4], int)
        and 0 <= edge[4] < len(cflags)
        for name, edge in pch.items()
    ):
        return False
    if not all(isinstance(key, str) and isinstance(error, str) for key, error in errors.items()):
        return False
    for key, edge in edges.items():
        if not isinstance(key, str) or not isinstance(edge, list) or len(edge) != 5:
            return False
        rule, src, mw_version, flags_index, extab_padding = edge
        if not all(isinstance(item, str) for item in (rule, src, mw_version)):
            return False
        if not isinstance(flags_index, int) or not 0 <= flags_index < len(cflags):
            return False
        if extab_padding is not None and not isinstance(extab_padding, str):
            return False
    return True


def find_build_block(obj_path: str) -> BuildBlock:
    """Return the cached MWCC build edge that produces obj_path."""
    target = LAYOUT.object_path_for_unit(obj_path).as_posix()
    index = _load_metadata(
        BUILD_INDEX_CACHE_NAME,
        ROOT / "build.ninja",
        _parse_build_index,
        _valid_build_index,
    )
    error = index["errors"].get(target)
    if error is not None:
        raise RuntimeError(f"build edge for {target} {error}")
    edge = index["edges"].get(target)
    if edge is None:
        raise RuntimeError(f"no build edge for {target}")
    rule, src, mw_version, flags_index, extab_padding = edge
    return BuildBlock(
        rule=rule,
        src=src,
        mw_version=mw_version,
        cflags=index["cflags"][flags_index],
        extab_padding=extab_padding,
    )


def _root_rel(p: Path) -> str:
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)


# --------------------------------------------------------------------------
# Fresh precompiled headers
#
# A TU compiled with `-prefix SMS.mch` reads whatever SMS.mch the include path
# finds first: normally `build/<ver>/include/SMS.mch`, ninja's PCH edge output.
# Ninja rebuilds that PCH before any TU whenever a header it read changed; a
# direct compile does not, so it used a stale PCH after header changes (SMS:
# `macro 'RAD_TO_DEG' redefined` once RAD_TO_DEG moved from math.h to
# macros.h) and ignored shadow-root edits to headers inside the PCH. Instead
# every direct compile builds the PCH from the tree it compiles (the edge's
# exact command, cwd = that tree) into a content-addressed cache entry and
# puts that entry's directory on the include path just before the PCH's
# build directory. An entry is reused while every input its depfile listed
# still has the same content. NINJA_COMPILE_FRESH_PCH=0 restores the old
# behaviour (use the build tree's PCH as is).
# --------------------------------------------------------------------------

_PCH_CACHE_VERSION = 2
_PCH_ENTRY_LIMIT = 16
_PCH_PRUNE_AGE_S = 3600.0
_PCH_HASH_MEMORY: Dict[str, Tuple[Tuple[int, int, int, int, int], str]] = {}
_INCLUDE_FLAGS = ("-i", "-I")


@dataclass
class PchEdge:
    output: str  # as written in build.ninja (configure.py writes it absolute)
    rule: str
    src: str
    mw_version: str
    cflags: str


@dataclass
class FreshPch:
    """`flags` with the fresh PCH's directory on the include path. `mch` is
    None when the TU uses no generated PCH; `deps` maps every input the PCH
    read (root-relative POSIX path, or `external:<abs>`) to its sha256."""

    flags: List[str]
    mch: Optional[Path] = None
    include_dir: Optional[str] = None
    deps: Dict[str, str] = field(default_factory=dict)
    built: bool = False
    error: Optional[str] = None


def pch_edges() -> Dict[str, PchEdge]:
    """PCH build edges of build.ninja, by .mch basename."""
    index = _load_metadata(
        BUILD_INDEX_CACHE_NAME, ROOT / "build.ninja", _parse_build_index, _valid_build_index
    )
    return {
        name: PchEdge(output, rule, src, mw_version, index["cflags"][flags_index])
        for name, (output, rule, src, mw_version, flags_index) in index.get("pch", {}).items()
    }


def prefix_name(flags: List[str]) -> Optional[str]:
    """The `-prefix <file>` argument of an MWCC command line, if any."""
    for index, token in enumerate(flags[:-1]):
        if token == "-prefix":
            return flags[index + 1]
    return None


def _memo_sha256(path: Path) -> Optional[str]:
    absolute = _absolute_path(path)
    try:
        identity = _file_identity(absolute.stat())
    except OSError:
        return None
    cached = _PCH_HASH_MEMORY.get(str(absolute))
    if cached is not None and cached[0] == identity:
        return cached[1]
    stable = _stable_sha256(absolute)
    if stable is None:
        return None
    _PCH_HASH_MEMORY[str(absolute)] = stable
    return stable[1]


def _dep_file(root: Path, key: str) -> Path:
    return Path(key[len("external:"):]) if key.startswith("external:") else root / key


def _depfile_keys(root: Path, text: str) -> Tuple[List[str], List[str]]:
    """MWCC depfile -> (dependency keys, problems). Keys are `root`-relative
    POSIX paths or `external:<abs>`; wine/wibo report host paths on Z:."""
    lines = text.replace("\r", "").split("\n")
    tokens: List[str] = []
    for index, line in enumerate(lines):
        body = line.rstrip()
        if body.endswith("\\"):
            body = body[:-1]
        if index == 0:
            if ": " not in body:  # the target has a drive colon; the separator is ": "
                return [], ["depfile has no target line"]
            body = body.split(": ", 1)[1]
        tokens += [token for token in body.split() if token]
    roots = [str(_absolute_path(root))]
    real = os.path.realpath(root)
    if real not in roots:
        roots.append(real)
    keys: List[str] = []
    problems: List[str] = []
    for token in tokens:
        path = token.replace("\\", "/")
        drive = re.match(r"^([A-Za-z]):/", path)
        if drive:
            if drive.group(1).lower() != "z":
                problems.append(f"unresolvable dependency path {token}")
                continue
            path = os.path.normpath(path[2:])
        elif not path.startswith("/"):
            path = os.path.normpath(path)
        key = path
        if path.startswith("/"):
            rel = next(
                (os.path.relpath(path, r) for r in roots if path == r or path.startswith(r.rstrip("/") + "/")),
                None,
            )
            key = rel if rel is not None else f"external:{path}"
        if key not in keys:
            keys.append(key)
    if not keys:
        problems.append("depfile lists no inputs")
    return keys, problems


def _include_dir_arg(directory: Path, root: Path) -> str:
    """`directory` as the compile (cwd `root`) should name it: ROOT-relative
    when that also resolves from `root` (shadow roots symlink build/), else
    absolute."""
    try:
        rel = _absolute_path(directory).relative_to(_absolute_path(ROOT))
    except ValueError:
        return str(_absolute_path(directory))
    try:
        if (root / rel).resolve() == directory.resolve():
            return rel.as_posix()
    except OSError:
        pass
    return str(_absolute_path(directory))


def _insert_include_dir(flags: List[str], directory: str, before: Optional[str]) -> List[str]:
    """Insert `-i directory` just before the include flag naming `before` (the
    PCH's build directory), else before the first include flag, else last."""
    position = None
    first = None
    for index, token in enumerate(flags[:-1]):
        if token not in _INCLUDE_FLAGS or flags[index + 1].startswith("-"):
            continue
        if first is None:
            first = index
        if before is not None and os.path.normpath(flags[index + 1]) == before:
            position = index
            break
    if position is None:
        position = first if first is not None else len(flags)
    return flags[:position] + ["-i", directory] + flags[position:]


def _pch_output_dir(edge: PchEdge) -> Optional[str]:
    """The PCH edge's output directory as the TU's include flags name it."""
    parent = os.path.normpath(os.path.dirname(edge.output))
    if not os.path.isabs(parent):
        return parent
    for path in (parent, os.path.realpath(parent)):
        for base in (str(_absolute_path(ROOT)), os.path.realpath(ROOT)):
            if path == base or path.startswith(base.rstrip("/") + "/"):
                return os.path.normpath(os.path.relpath(path, base))
    return parent


def _include_search_dirs(cflags: str) -> List[str]:
    """The `-i`/`-I` directories of a command, in search order."""
    tokens = shlex.split(cflags)
    return [
        os.path.normpath(tokens[index + 1])
        for index, token in enumerate(tokens[:-1])
        if token in _INCLUDE_FLAGS and not tokens[index + 1].startswith("-")
    ]


def _shadow_candidates(root: Path, cflags: str, keys: List[str]) -> List[str]:
    """Files that could take over an include the PCH resolved.

    A PCH dependency is reached by a name relative to the search directory it
    sits in (`JSystem/J3DJoint.hpp` under libs/JSystem/include). A file with
    that name in any other search directory, or beside another dependency (for
    quote includes), changes resolution once it exists, although no dependency's
    hash changes. The cache stores which of these exist and rebuilds when that
    set differs."""
    dirs = _include_search_dirs(cflags)
    local = [key for key in keys if not key.startswith("external:")]
    search = list(dict.fromkeys([*dirs, *(os.path.dirname(key) for key in local)]))
    found = set()
    for key in local:
        names = {key[len(d) + 1:] for d in dirs if d not in ("", ".") and key.startswith(d.rstrip("/") + "/")}
        for name in names or {os.path.basename(key)}:
            for directory in search:
                candidate = os.path.normpath(os.path.join(directory, name))
                if candidate != key and (root / candidate).is_file():
                    found.add(candidate)
    return sorted(found)


def _pch_entry_matches(entry: Path, name: str, root: Path, cflags: Optional[str] = None) -> Optional[Dict[str, str]]:
    record = _read_json_cache(entry / "deps.json")
    if (
        record is None
        or record.get("version") != _PCH_CACHE_VERSION
        or not isinstance(record.get("deps"), dict)
        or not record["deps"]
        or not (entry / name).is_file()
    ):
        return None
    deps: Dict[str, str] = record["deps"]
    for key, digest in deps.items():
        if _memo_sha256(_dep_file(root, key)) != digest:
            return None
    if cflags is not None and record.get("shadows") != _shadow_candidates(root, cflags, list(deps)):
        return None  # a header now shadows (or no longer shadows) one the PCH read
    return deps


def _prune_pch_entries(edge_dir: Path, keep: Path) -> None:
    try:
        entries = [p for p in edge_dir.iterdir() if p.is_dir() and not p.name.startswith(".")]
    except OSError:
        return
    if len(entries) <= _PCH_ENTRY_LIMIT:
        return
    now = time.time()

    def mtime(path: Path) -> float:
        try:
            return path.stat().st_mtime
        except OSError:
            return 0.0

    for entry in sorted(entries, key=mtime)[: len(entries) - _PCH_ENTRY_LIMIT]:
        if entry != keep and now - mtime(entry) > _PCH_PRUNE_AGE_S:
            shutil.rmtree(entry, ignore_errors=True)


def fresh_pch_flags(
    flags: List[str],
    *,
    root: Optional[Path] = None,
    compiler_override: Optional[Path] = None,
    timeout: Optional[float] = None,
    output_cap: Optional[int] = DEFAULT_OUTPUT_CAP,
) -> FreshPch:
    """Make a TU's `-prefix <name>.mch` read a PCH built from `root`'s current
    sources (see the section comment). `flags` are the TU's cflags tokens; the
    PCH is built with `compiler_override` when given (the compiler the TU uses),
    else the PCH edge's stock compiler, and shares the caller's `timeout`.
    Flags without a generated PCH come back unchanged."""
    root = Path(root) if root is not None else ROOT
    name = prefix_name(flags)
    if name is None or os.environ.get("NINJA_COMPILE_FRESH_PCH") == "0":
        return FreshPch(list(flags))
    edge = pch_edges().get(Path(name).name)
    if edge is None or Path(name).name != name:
        return FreshPch(list(flags))

    compiler = Path(compiler_override) if compiler_override else ROOT / "build/compilers" / edge.mw_version / "mwcceppc.exe"
    sjiswrap = ROOT / "build/tools/sjiswrap.exe"
    use_sjiswrap = "sjis" in edge.rule
    runner = _runner_command()
    if runner is None:
        return FreshPch(list(flags), error="no MWCC runner (wibo/wine) to build the precompiled header")
    compiler_sha = _memo_sha256(compiler)
    sjiswrap_sha = _memo_sha256(sjiswrap) if use_sjiswrap else ""
    if compiler_sha is None or sjiswrap_sha is None:
        missing = compiler if compiler_sha is None else sjiswrap
        return FreshPch(list(flags), error=f"missing build prerequisite for the precompiled header: {missing}")

    edge_key = hashlib.sha256(
        json.dumps(
            [_PCH_CACHE_VERSION, name, edge.rule, edge.src, edge.cflags, compiler_sha, sjiswrap_sha],
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()[:16]
    edge_dir = _CACHE_DIR / "pch" / edge_key
    before = _pch_output_dir(edge)

    def result(entry: Path, deps: Dict[str, str], built: bool) -> FreshPch:
        include_dir = _include_dir_arg(entry, root)
        return FreshPch(
            _insert_include_dir(list(flags), include_dir, before),
            mch=entry / name,
            include_dir=include_dir,
            deps=dict(deps),
            built=built,
        )

    try:
        candidates = sorted(
            (p for p in edge_dir.iterdir() if p.is_dir() and not p.name.startswith(".")),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
    except OSError:
        candidates = []
    for entry in candidates[:_PCH_ENTRY_LIMIT]:
        deps = _pch_entry_matches(entry, name, root, edge.cflags)
        if deps is not None:
            try:
                os.utime(entry)
            except OSError:
                pass
            return result(entry, deps, False)

    try:
        edge_dir.mkdir(parents=True, exist_ok=True)
        build_dir = Path(tempfile.mkdtemp(prefix=".build-", dir=str(edge_dir)))
    except OSError as error:
        return FreshPch(list(flags), error=f"cannot create the precompiled header cache {edge_dir}: {error}")
    published = False
    try:
        command = [str(runner[1])]
        if use_sjiswrap:
            command.append(str(sjiswrap))
        command += [str(compiler), *shlex.split(edge.cflags), "-MD", "-c", edge.src,
                    "-o", str(build_dir), "-precompile", name]
        # A traced compiler stays silent while building the PCH.
        run = run_bounded(command, cwd=root, env={"MWCC_TRACE_OUT": ""}, timeout=timeout,
                          output_cap=output_cap)
        mch = build_dir / name
        if run.timed_out:
            return FreshPch(list(flags), error=f"precompiled header {name} timed out after {timeout:g}s (killed)")
        if run.returncode != 0 or not mch.is_file():
            detail = ((run.stdout or "") + "\n" + (run.stderr or "")).strip()
            return FreshPch(list(flags), error=f"precompiled header {edge.src} -> {name} failed:\n{detail}")
        depfiles = list(build_dir.glob("*.d"))
        if len(depfiles) != 1:
            return FreshPch(list(flags), error=f"precompiled header {name}: expected one depfile, found {len(depfiles)}")
        keys, problems = _depfile_keys(root, depfiles[0].read_text(errors="replace"))
        depfiles[0].unlink()
        deps: Dict[str, str] = {}
        for key in keys:
            digest = _memo_sha256(_dep_file(root, key))
            if digest is None:
                problems.append(f"dependency {key} unreadable")
            else:
                deps[key] = digest
        if problems:
            return FreshPch(list(flags), error=f"precompiled header {name}: " + "; ".join(problems[:4]))
        shadows = _shadow_candidates(root, edge.cflags, list(deps))
        _atomic_write_json(build_dir / "deps.json", {"version": _PCH_CACHE_VERSION, "edge": edge.output,
                                                     "src": edge.src, "deps": deps, "shadows": shadows})
        if not (build_dir / "deps.json").is_file():
            return FreshPch(list(flags), error=f"precompiled header {name}: cannot write its cache record")
        entry = edge_dir / hashlib.sha256(
            json.dumps([sorted(deps.items()), shadows], separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:16]
        try:
            os.rename(build_dir, entry)
            published = True
        except OSError:
            if _pch_entry_matches(entry, name, root, edge.cflags) is None:
                # Not a concurrent twin: keep this build out of the cache's way.
                shutil.rmtree(entry, ignore_errors=True)
                try:
                    os.rename(build_dir, entry)
                    published = True
                except OSError as error:
                    return FreshPch(list(flags), error=f"precompiled header {name}: cannot publish {entry}: {error}")
        _prune_pch_entries(edge_dir, entry)
        return result(entry, deps, True)
    finally:
        if not published:
            shutil.rmtree(build_dir, ignore_errors=True)


def tu_flags(
    cflags: str,
    *,
    root: Optional[Path] = None,
    compiler_override: Optional[Path] = None,
    timeout: Optional[float] = None,
    output_cap: Optional[int] = DEFAULT_OUTPUT_CAP,
    quiet: bool = True,
) -> Optional[List[str]]:
    """The TU's cflags tokens for a direct compile (fresh PCH applied), or
    None (reported unless `quiet`) when its precompiled header cannot be built."""
    fresh = fresh_pch_flags(
        shlex.split(cflags), root=root, compiler_override=compiler_override,
        timeout=timeout, output_cap=output_cap,
    )
    if fresh.error is not None:
        if not quiet:
            print(fresh.error, file=sys.stderr)
        return None
    return fresh.flags


def _runner_command() -> tuple[str, Path | str] | None:
    """Resolve the MWCC runner.

    Prefer wibo when available because it is faster and closer to the Linux
    project setup, but the macOS checkout's build.ninja uses Wine directly.
    """
    override = os.environ.get("MWCC_WIBO")
    if override:
        return ("wibo", override)
    machine = platform.machine()
    auto_wibo_supported = (
        sys.platform == "linux" and machine in ("i386", "x86_64", "aarch64", "arm64")
    ) or (
        sys.platform == "darwin" and machine in ("x86_64", "aarch64", "arm64")
    )
    state_wibo = _state_wibo_path()
    if auto_wibo_supported and state_wibo is not None:
        return ("wibo", state_wibo)
    project_wibo = ROOT / "build/tools/wibo"
    if auto_wibo_supported and project_wibo.exists():
        return ("wibo", project_wibo)
    path_wibo = shutil.which("wibo")
    if auto_wibo_supported and path_wibo:
        return ("wibo", path_wibo)
    wine_candidates = [
        os.environ.get("WINE"),
        shutil.which("wine"),
        "/usr/local/bin/wine",
        "/opt/homebrew/bin/wine",
    ]
    for wine in wine_candidates:
        if wine and (Path(wine).exists() or shutil.which(wine)):
            return ("wine", wine)
    return None


def _state_wibo_path() -> Path | None:
    state_dir = os.environ.get("ORCH_GAME_STATE_DIR")
    if state_dir:
        candidate = Path(state_dir).expanduser() / "tools" / "wibo"
        if candidate.is_file():
            return candidate
    for parent in (ROOT, *ROOT.parents):
        if parent.name == "worktrees":
            candidate = parent.parent / "state" / "tools" / "wibo"
            if candidate.is_file():
                return candidate
        candidate = parent / "state" / "tools" / "wibo"
        if candidate.is_file():
            return candidate
    return None


def _makefile_tokens(data: bytes) -> List[bytes]:
    """Tokenize transformed MWCC/GCC depfile syntax."""
    tokens: List[bytes] = []
    token = bytearray()
    index = 0
    while index < len(data):
        byte = data[index]
        if byte == 92 and index + 1 < len(data):
            following = data[index + 1]
            if following == 10:
                if token:
                    tokens.append(bytes(token))
                    token.clear()
                index += 2
                continue
            if following == 13 and index + 2 < len(data) and data[index + 2] == 10:
                if token:
                    tokens.append(bytes(token))
                    token.clear()
                index += 3
                continue
            if following in (9, 32, 35):
                token.append(following)
                index += 2
                continue
            token.append(byte)
            index += 1
            continue
        if byte in (9, 10, 13, 32):
            if token:
                tokens.append(bytes(token))
                token.clear()
            index += 1
            continue
        token.append(byte)
        index += 1
    if token:
        tokens.append(bytes(token))
    return tokens


def _dependency_paths(data: bytes) -> Optional[List[Path]]:
    separator = next(
        (
            index
            for index in range(len(data) - 1)
            if data[index] == 58 and data[index + 1] in (9, 32)
        ),
        -1,
    )
    if separator < 0:
        return None
    tokens = _makefile_tokens(data[separator + 1 :])
    if not tokens:
        return None

    dependencies: List[Path] = []
    for token in tokens:
        # A retained depfile should have passed through transform_dep.py. Raw
        # DOS paths are ambiguous on POSIX, so keep sjiswrap for those.
        if (
            len(token) >= 3
            and b"a" <= token[0:1].lower() <= b"z"
            and token[1:2] == b":"
            and token[2:3] in (b"/", b"\\")
        ):
            return None
        text = os.fsdecode(token)
        path = Path(text) if os.path.isabs(text) else ROOT / text.replace("\\", os.sep)
        try:
            dependencies.append(path.resolve())
        except OSError:
            return None
    return dependencies


def _stable_file_record(path: Path) -> Optional[Tuple[Dict[str, Any], bool]]:
    """Return a content-hash identity and whether the entire file is ASCII."""
    absolute = _absolute_path(path)
    try:
        with absolute.open("rb") as stream:
            before = os.fstat(stream.fileno())
            if not stat.S_ISREG(before.st_mode):
                return None
            digest = hashlib.sha1()
            ascii_only = True
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
                if ascii_only and not chunk.isascii():
                    ascii_only = False
            after = os.fstat(stream.fileno())
    except OSError:
        return None
    before_identity = (
        before.st_dev,
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
    )
    after_identity = (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    )
    if before_identity != after_identity:
        return None
    return (
        {
            "path": str(absolute),
            "dev": after.st_dev,
            "ino": after.st_ino,
            "size": after.st_size,
            "mtime_ns": after.st_mtime_ns,
            "ctime_ns": after.st_ctime_ns,
            "sha1": digest.hexdigest(),
        },
        ascii_only,
    )


def _file_record_matches(record: Dict[str, Any]) -> bool:
    try:
        current = Path(record["path"]).stat()
    except (KeyError, OSError, TypeError):
        return False
    return (
        stat.S_ISREG(current.st_mode)
        and current.st_dev == record.get("dev")
        and current.st_ino == record.get("ino")
        and current.st_size == record.get("size")
        and current.st_mtime_ns == record.get("mtime_ns")
        and current.st_ctime_ns == record.get("ctime_ns")
    )


def _valid_sjis_base_payload(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    if not isinstance(value.get("unit"), str):
        return False
    if not isinstance(value.get("depfile"), dict):
        return False
    if not isinstance(value.get("content_key"), str):
        return False
    if not isinstance(value.get("ascii"), bool):
        return False
    files = value.get("files")
    if not isinstance(files, list) or not files:
        return False
    return all(
        isinstance(record, dict)
        and isinstance(record.get("path"), str)
        and isinstance(record.get("sha1"), str)
        for record in files
    )


def _sjis_base_cache_path(obj_path: str) -> Path:
    unit_key = hashlib.sha1(obj_path.encode("utf-8")).hexdigest()
    return _CACHE_DIR / "sjis-ascii" / f"{unit_key}.json"


def _content_key(records: List[Dict[str, Any]]) -> str:
    digest = hashlib.sha1()
    for record in sorted(records, key=lambda item: item["path"]):
        digest.update(record["path"].encode("utf-8", errors="surrogateescape"))
        digest.update(b"\0")
        digest.update(record["sha1"].encode("ascii"))
        digest.update(b"\0")
    return digest.hexdigest()


def _base_ascii_verdict(
    obj_path: str, block: BuildBlock
) -> Optional[Dict[str, Any]]:
    """Content-keyed ASCII verdict for the real TU source and prior deps."""
    depfile_path = ROOT / LAYOUT.object_path_for_unit(obj_path).with_suffix(".d")
    depfile_result = _stable_file_record(depfile_path)
    if depfile_result is None:
        return None
    depfile_record, _depfile_ascii = depfile_result

    cached = _SJIS_BASE_MEMORY.get(obj_path)
    for cache_source in ("memory", "disk"):
        if cache_source == "disk":
            cached = _read_json_cache(_sjis_base_cache_path(obj_path))
        if (
            _valid_sjis_base_payload(cached)
            and cached.get("version") == _SJIS_VERDICT_CACHE_VERSION
            and cached.get("unit") == obj_path
            and cached.get("depfile") == depfile_record
            and all(_file_record_matches(record) for record in cached["files"])
        ):
            _SJIS_BASE_MEMORY[obj_path] = cached
            return cached

    try:
        depfile_data = depfile_path.read_bytes()
    except OSError:
        return None
    # The full depfile digest above must describe the bytes we parse below.
    if hashlib.sha1(depfile_data).hexdigest() != depfile_record["sha1"]:
        return None
    dependencies = _dependency_paths(depfile_data)
    if dependencies is None:
        return None

    source_path = Path(block.src)
    if not source_path.is_absolute():
        source_path = ROOT / source_path
    try:
        source_path = source_path.resolve()
    except OSError:
        return None

    paths: List[Path] = []
    seen = set()
    for path in [source_path, *dependencies]:
        key = str(path)
        if key not in seen:
            seen.add(key)
            paths.append(path)

    records: List[Dict[str, Any]] = []
    ascii_only = True
    for path in paths:
        result = _stable_file_record(path)
        if result is None:
            return None
        record, file_ascii = result
        # A dependency newer than the retained .d may have changed includes;
        # require a new build before trusting that dependency list.
        if record["mtime_ns"] > depfile_record["mtime_ns"]:
            return None
        records.append(record)
        ascii_only = ascii_only and file_ascii

    payload = {
        "version": _SJIS_VERDICT_CACHE_VERSION,
        "unit": obj_path,
        "depfile": depfile_record,
        "content_key": _content_key(records),
        "ascii": ascii_only,
        "files": records,
    }
    _atomic_write_json(_sjis_base_cache_path(obj_path), payload)
    _SJIS_BASE_MEMORY[obj_path] = payload
    return payload


def _can_bypass_sjiswrap(
    obj_path: str, block: BuildBlock, sources: List[str]
) -> bool:
    if os.environ.get("MWCC_NO_SJIS_BYPASS") == "1":
        return False
    base = _base_ascii_verdict(obj_path, block)
    if base is None or not base["ascii"]:
        return False

    original = Path(block.src)
    if not original.is_absolute():
        original = ROOT / original
    try:
        original = original.resolve()
    except OSError:
        return False

    extra_records: List[Dict[str, Any]] = []
    for source in sources:
        source_path = Path(source)
        if not source_path.is_absolute():
            source_path = ROOT / source_path
        try:
            source_path = source_path.resolve()
        except OSError:
            return False
        if source_path == original:
            continue
        result = _stable_file_record(source_path)
        if result is None:
            return False
        record, ascii_only = result
        if not ascii_only:
            return False
        extra_records.append(record)

    digest = hashlib.sha1(base["content_key"].encode("ascii"))
    for record in sorted(extra_records, key=lambda item: item["sha1"]):
        digest.update(record["sha1"].encode("ascii"))
        digest.update(b"\0")
    verdict_key = digest.hexdigest()
    memory_key = (obj_path, verdict_key)
    verdict = _SJIS_VERDICT_MEMORY.get(memory_key)
    if verdict is None:
        verdict = True
        _SJIS_VERDICT_MEMORY[memory_key] = verdict
    return verdict


def _compiler_prefix(
    block: BuildBlock, *, obj_path: str, sources: List[str], quiet: bool,
    compiler_override: Optional[Path] = None,
) -> Optional[list]:
    """[runner, (sjiswrap,) mwcceppc.exe] for this TU's rule, or None if a
    prerequisite is missing. `compiler_override` replaces the stock
    mwcceppc.exe (e.g. the traced build of the same version)."""
    sjiswrap = ROOT / "build/tools/sjiswrap.exe"
    compiler = compiler_override or ROOT / "build" / "compilers" / block.mw_version / "mwcceppc.exe"
    runner = _runner_command()
    use_sjiswrap = "sjis" in block.rule and not _can_bypass_sjiswrap(
        obj_path, block, sources
    )
    required = [compiler]
    if use_sjiswrap:
        required.append(sjiswrap)
    missing = [str(p) for p in required if not p.exists()]
    if runner is None:
        missing.append("MWCC runner: build/tools/wibo, MWCC_WIBO, wibo, WINE, or Wine at /usr/local/bin/wine or /opt/homebrew/bin/wine")
    if missing:
        if not quiet:
            print("missing build prerequisite(s):", file=sys.stderr)
            for p in missing:
                print(f"  {p}", file=sys.stderr)
            print("run `ninja tools` once to fetch/build prerequisites", file=sys.stderr)
        return None
    _, runner_path = runner
    cmd = [str(runner_path)]
    if use_sjiswrap:
        cmd.append(str(sjiswrap))
    cmd.append(str(compiler))
    return cmd


def direct_compile(
    obj_path: str,
    *,
    src_override: Optional[str] = None,
    quiet: bool = False,
    prefix: Optional[str] = None,
    compiler_override: Optional[Path] = None,
    extra_env: Optional[Dict[str, str]] = None,
    timeout: Optional[float] = None,
    output_cap: Optional[int] = DEFAULT_OUTPUT_CAP,
) -> Optional[CompiledObject]:
    """Compile one TU directly from its build.ninja MWCC settings.

    The output goes to a unique temporary object, avoiding Ninja state and the
    normal build-tree object path. When `src_override` is given, that file is
    compiled instead of the TU's real source (used by the permuter to score a
    candidate). It must sit in the same directory as the real source so that
    `-cwd source` and quote-includes resolve identically.

    `quiet=True` suppresses all diagnostic prints (the permuter expects many
    candidates to fail to compile; that is normal, not noteworthy).

    `compiler_override` swaps in another mwcceppc.exe, `extra_env` is merged
    over the environment, `timeout` kills the compile's process group after
    that many seconds (None: no deadline) and `output_cap` bounds captured
    output (see run_bounded).
    """
    try:
        block = find_build_block(obj_path)
    except RuntimeError as e:
        if not quiet:
            print(f"build.ninja lookup failed: {e}", file=sys.stderr)
        return None

    if block.rule not in MWCC_RULES:
        if not quiet:
            print(f"unsupported build rule for direct compile: {block.rule}", file=sys.stderr)
        return None

    src = src_override if src_override is not None else block.src
    cmd_prefix = _compiler_prefix(
        block, obj_path=obj_path, sources=[src], quiet=quiet,
        compiler_override=compiler_override,
    )
    if cmd_prefix is None:
        return None
    dtk = ROOT / "build/tools/dtk"
    if "extab" in block.rule and not dtk.exists():
        if not quiet:
            print(f"missing build prerequisite: {dtk}", file=sys.stderr)
            print("run `ninja tools` once to fetch/build prerequisites", file=sys.stderr)
        return None

    build_tmp = ROOT / "build"
    build_tmp.mkdir(exist_ok=True)
    started = time.monotonic()
    flags = tu_flags(
        block.cflags, compiler_override=compiler_override, timeout=timeout,
        output_cap=output_cap, quiet=quiet,
    )
    if flags is None:
        return None
    if timeout is not None:
        timeout = timeout - (time.monotonic() - started)
        if timeout <= 0:
            if not quiet:
                print("direct compile timed out building its precompiled header", file=sys.stderr)
            return None
    tmpdir = tempfile.TemporaryDirectory(prefix="ninja-compile-", dir=build_tmp)
    tmp_obj = Path(tmpdir.name) / f"{Path(obj_path).name}.o"

    cmd = list(cmd_prefix) + flags
    if prefix is not None:
        # Inject a precompiled header onto the source (mwcc -prefix). The arg is
        # resolved like an #include (relative to the source dir, due to
        # -cwd source), so callers pass the PCH's basename and keep it colocated.
        cmd += ["-prefix", prefix]
    cmd += ["-c", src, "-o", str(tmp_obj)]

    started = time.monotonic()
    result = run_bounded(
        cmd, cwd=ROOT, env=extra_env, timeout=timeout, output_cap=output_cap
    )
    if result.timed_out:
        if not quiet:
            print(f"direct compile timed out after {timeout:g}s (killed)", file=sys.stderr)
        tmpdir.cleanup()
        return None
    if result.returncode != 0:
        if not quiet:
            print("direct compile failed:", file=sys.stderr)
            print(result.stdout)
            print(result.stderr, file=sys.stderr)
        tmpdir.cleanup()
        return None

    if not tmp_obj.exists():
        objs = list(Path(tmpdir.name).glob("*.o"))
        if len(objs) == 1:
            tmp_obj = objs[0]
        else:
            if not quiet:
                print(f"direct compile did not produce {tmp_obj}", file=sys.stderr)
            tmpdir.cleanup()
            return None

    if "extab" in block.rule:
        padding = block.extab_padding or ""
        left = None if timeout is None else timeout - (time.monotonic() - started)
        bounds = {} if timeout is None and output_cap == DEFAULT_OUTPUT_CAP else {"timeout": left, "output_cap": output_cap}
        if not _run_extab_clean(tmp_obj, dtk, padding, quiet=quiet, **bounds):
            tmpdir.cleanup()
            return None

    return CompiledObject(obj=tmp_obj, tmpdir=tmpdir)


def source_dir_for(obj_path: str) -> Path:
    """Directory holding the real source for obj_path."""
    return (ROOT / LAYOUT.source_path_for_unit(obj_path)).parent


def source_suffix_for(obj_path: str) -> str:
    """Source-language suffix used for temporary candidates."""
    return LAYOUT.source_path_for_unit(obj_path).suffix


def compile_source_text(
    obj_path: str,
    source_text: str,
    *,
    show_errors: bool = False,
    prefix_pch: Optional[Path] = None,
) -> Optional[CompiledObject]:
    """Compile candidate `source_text` for `obj_path` with the TU's real flags.

    Writes the text to a hidden temp .c in the real source's directory (so
    include resolution matches the real build), compiles it, removes the temp
    .c, and returns the CompiledObject (whose .o lives in a temp dir the caller
    keeps alive). Returns None on compile failure.

    If `prefix_pch` is given (a .mch built by build_pch, colocated in the same
    source dir), it is injected via mwcc -prefix so the TU's headers are not
    reparsed; `source_text` must then be the TU *body* (everything after the
    precompiled prefix region).
    """
    src_dir = source_dir_for(obj_path)
    fd, tmp_c = tempfile.mkstemp(
        suffix=source_suffix_for(obj_path), prefix=".permute-", dir=str(src_dir)
    )
    tmp_c_path = Path(tmp_c)
    _TEMP_CANDIDATES.add(tmp_c_path)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(source_text)
        return direct_compile(
            obj_path,
            src_override=_root_rel(tmp_c_path),
            quiet=not show_errors,
            prefix=prefix_pch.name if prefix_pch is not None else None,
        )
    finally:
        try:
            tmp_c_path.unlink()
        except OSError:
            pass
        _TEMP_CANDIDATES.discard(tmp_c_path)


def compile_batch(
    obj_path: str,
    sources: List[str],
    *,
    prefix_pch: Optional[Path] = None,
    quiet: bool = True,
) -> Tuple[List[Optional[Path]], List]:
    """Compile several candidate sources in ONE mwcc invocation to amortize the
    fixed process startup. Returns (objs, cleanups):

      objs[i]   -- Path to the .o for sources[i], or None if it failed.
      cleanups  -- handles the caller must release (tmpdir.cleanup()) once it
                   has finished scoring every objs[i].

    mwcc aborts at the first file with an error (-maxerrors 1). Its diagnostic
    identifies that candidate for one isolation compile; the still-missing
    suffix then stays batched. Thus one bad candidate only costs one isolation
    compile and one suffix batch, rather than one compile per remaining source.
    """
    if not sources:
        return [], []
    none = [None] * len(sources)
    try:
        block = find_build_block(obj_path)
    except RuntimeError as e:
        if not quiet:
            print(f"build.ninja lookup failed: {e}", file=sys.stderr)
        return none, []
    if block.rule not in MWCC_RULES:
        return none, []
    dtk = ROOT / "build/tools/dtk"
    if "extab" in block.rule and not dtk.exists():
        if not quiet:
            print(f"missing build prerequisite: {dtk}", file=sys.stderr)
            print("run `ninja tools` once to fetch/build prerequisites", file=sys.stderr)
        return none, []

    src_dir = source_dir_for(obj_path)
    cfiles: List[Path] = []

    def make_cfile(source: str) -> Path:
        fd, p = tempfile.mkstemp(
            suffix=source_suffix_for(obj_path), prefix=".permute-", dir=str(src_dir)
        )
        path = Path(p)
        _TEMP_CANDIDATES.add(path)
        with os.fdopen(fd, "w") as f:
            f.write(source)
        cfiles.append(path)
        return path

    active_cfiles = [make_cfile(source) for source in sources]

    cmd_prefix = _compiler_prefix(
        block,
        obj_path=obj_path,
        sources=[_root_rel(path) for path in active_cfiles],
        quiet=quiet,
    )
    if cmd_prefix is None:
        for path in cfiles:
            try:
                path.unlink()
            except OSError:
                pass
            _TEMP_CANDIDATES.discard(path)
        return none, []

    flags = tu_flags(block.cflags, quiet=quiet)
    if flags is None:
        for path in cfiles:
            try:
                path.unlink()
            except OSError:
                pass
            _TEMP_CANDIDATES.discard(path)
        return none, []

    build_tmp = ROOT / "build"
    build_tmp.mkdir(exist_ok=True)
    outdir = tempfile.TemporaryDirectory(prefix="ninja-batch-", dir=build_tmp)
    cleanups: List = [outdir]

    cmd = list(cmd_prefix) + flags
    if prefix_pch is not None:
        cmd += ["-prefix", prefix_pch.name]
    # -o <dir> writes each input's object as <dir>/<source-stem>.o
    cmd += ["-o", _root_rel(Path(outdir.name)), "-c"]
    objs: List[Optional[Path]] = [None] * len(active_cfiles)

    def expected(index: int) -> Path:
        return Path(outdir.name) / (active_cfiles[index].stem + ".o")

    def compile_indexes(indexes: List[int]) -> subprocess.CompletedProcess:
        batch_cmd = cmd + [_root_rel(active_cfiles[index]) for index in indexes]
        return subprocess.run(
            batch_cmd, cwd=ROOT, capture_output=True, text=True
        )

    def diagnostic_failure_index(
        result: subprocess.CompletedProcess, indexes: List[int]
    ) -> Optional[int]:
        diagnostics = f"{result.stdout or ''}\n{result.stderr or ''}"
        matches = [
            (diagnostics.find(active_cfiles[index].name), index)
            for index in indexes
            if active_cfiles[index].name in diagnostics
        ]
        return min(matches)[1] if matches else None

    remaining = list(range(len(active_cfiles)))
    refreshed_suffix = False
    while remaining:
        result = compile_indexes(remaining)
        for index in remaining:
            output = expected(index)
            if output.is_file():
                objs[index] = output

        missing = [index for index in remaining if objs[index] is None]
        if result.returncode == 0 and not missing:
            break

        failed = diagnostic_failure_index(result, remaining)
        if failed is None:
            if not missing:
                break
            # A runner that suppresses MWCC's filename still leaves a precise
            # boundary: MWCC emits objects in input order before aborting.
            failed = missing[0]
        failed_position = remaining.index(failed)
        failed_output = expected(failed)
        if failed_output.exists():
            try:
                failed_output.unlink()
            except OSError:
                pass
        objs[failed] = None

        if not refreshed_suffix:
            # The former fallback passed every missing source through
            # compile_source_text(), which assigned each one a fresh mkstemp
            # basename. MWCC records that basename in the object, so recreate
            # the same source-file generation before batching to keep raw
            # successful objects byte-identical to the old path.
            for index in remaining[failed_position:]:
                active_cfiles[index] = make_cfile(sources[index])
            refreshed_suffix = True

        # Confirm attribution with exactly one single-source invocation.
        isolated = compile_indexes([failed])
        failed_output = expected(failed)
        if isolated.returncode == 0 and failed_output.is_file():
            objs[failed] = failed_output

        # Everything before the diagnosed failure was handled by the failed
        # batch. Keep the uncompiled suffix together for the next invocation.
        remaining = [
            index
            for index in remaining[failed_position + 1 :]
            if objs[index] is None
        ]

    if "extab" in block.rule:
        padding = block.extab_padding or ""
        for index, obj in enumerate(objs):
            if obj is not None and not _run_extab_clean(
                obj, dtk, padding, quiet=quiet
            ):
                objs[index] = None

    for c in cfiles:
        try:
            c.unlink()
        except OSError:
            pass
        _TEMP_CANDIDATES.discard(c)
    return objs, cleanups


def build_pch(
    obj_path: str, prefix_text: str, *, quiet: bool = True
) -> Optional[Path]:
    """Precompile `prefix_text` (the TU's leading #include/#define block) into a
    .mch in the source dir, with the TU's real flags. Returns the .mch path
    (caller unlinks it when done) or None on failure.

    The .mch is colocated with where candidates are written so that
    `compile_source_text(..., prefix_pch=<this>)` can reference it by basename.
    """
    try:
        block = find_build_block(obj_path)
    except RuntimeError as e:
        if not quiet:
            print(f"build.ninja lookup failed: {e}", file=sys.stderr)
        return None
    if block.rule not in MWCC_RULES:
        return None

    src_dir = source_dir_for(obj_path)
    fd, pch_c = tempfile.mkstemp(
        suffix=source_suffix_for(obj_path), prefix=".permute-pch-", dir=str(src_dir)
    )
    pch_c_path = Path(pch_c)
    mch_path = pch_c_path.with_suffix(".mch")
    _TEMP_CANDIDATES.add(pch_c_path)
    _TEMP_CANDIDATES.add(mch_path)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(prefix_text)
        cmd_prefix = _compiler_prefix(
            block,
            obj_path=obj_path,
            sources=[_root_rel(pch_c_path)],
            quiet=quiet,
        )
        if cmd_prefix is None:
            return None
        flags = tu_flags(block.cflags, quiet=quiet)
        if flags is None:
            return None
        cmd = (
            list(cmd_prefix)
            + flags
            + ["-precompile", _root_rel(mch_path), "-c", _root_rel(pch_c_path)]
        )
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        if not mch_path.exists():
            if not quiet:
                print("PCH precompile failed:", file=sys.stderr)
                print(result.stdout)
                print(result.stderr, file=sys.stderr)
            _TEMP_CANDIDATES.discard(mch_path)
            return None
        return mch_path
    finally:
        try:
            pch_c_path.unlink()
        except OSError:
            pass
        _TEMP_CANDIDATES.discard(pch_c_path)


# Safety net: remove any candidate temp files if the process dies mid-compile.
_TEMP_CANDIDATES: "set[Path]" = set()


@atexit.register
def _cleanup_temp_candidates() -> None:
    for p in list(_TEMP_CANDIDATES):
        try:
            p.unlink()
        except OSError:
            pass
