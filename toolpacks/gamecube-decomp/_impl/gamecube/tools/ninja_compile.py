#!/usr/bin/env python3
"""
Compile a single melee translation unit using the exact MWCC command that
`build.ninja` would, without going through Ninja itself.

Extracted from checkdiff.py so the permuter (permute.py) and checkdiff.py
share one faithful, ninja-coupled compile path. Parsed build edges and report
symbols are cached under `build/.ninja_compile_cache`. Compilation invokes
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
import contextlib
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
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Iterator, List, Optional, Tuple

# Project checkout root: explicit override, then Claude Code's project dir,
# then assume this script lives at <melee>/tools/.
from project_root import resolve_root

ROOT = resolve_root()
REPORT_PATH = ROOT / "build/GALE01/report.json"
SRC_ROOT = ROOT / "src"

MWCC_RULES = {"mwcc", "mwcc_sjis", "mwcc_extab", "mwcc_sjis_extab"}
WORKER_COMPILE_SLOT_STALE_SECONDS = 60 * 60
WORKER_COMPILE_SLOT_MISSING_OWNER_STALE_SECONDS = 30
_CACHE_DIR = ROOT / "build/.ninja_compile_cache"
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
    obj: Path, dtk: Path, padding: str, *, quiet: bool
) -> bool:
    """Clean obj via DTK, reusing a content-addressed, atomically-written result."""

    def run(input_path: Path, output_path: Path) -> subprocess.CompletedProcess:
        return subprocess.run(
            [
                str(dtk),
                "extab",
                "clean",
                "--padding",
                padding,
                str(input_path),
                str(output_path),
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )

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


def _parse_report_symbol_index(path: Path) -> Dict[str, str]:
    with path.open("r", encoding="utf-8") as stream:
        report = json.load(stream)
    symbols: Dict[str, str] = {}
    for unit in report.get("units", []):
        unit_name = unit.get("name", "").removeprefix("main/")
        if not isinstance(unit_name, str):
            continue
        for function in unit.get("functions", []):
            name = function.get("name")
            if isinstance(name, str) and name not in symbols:
                symbols[name] = unit_name
    return symbols


def _valid_report_symbol_index(value: Any) -> bool:
    return isinstance(value, dict) and all(
        isinstance(name, str) and isinstance(unit, str)
        for name, unit in value.items()
    )


def find_unit_for_function(func_name: str) -> Optional[str]:
    """Return the unit path (e.g. 'melee/it/itdrop') containing func_name."""
    symbols = _load_metadata(
        "report-symbol-index-v1.json",
        REPORT_PATH,
        _parse_report_symbol_index,
        _valid_report_symbol_index,
    )
    return symbols.get(func_name)


def _parse_build_index(path: Path) -> Dict[str, Any]:
    text = path.read_text(encoding="utf-8").replace("$\n", " ")
    cflags: List[str] = []
    cflag_indexes: Dict[str, int] = {}
    edges: Dict[str, List[Any]] = {}
    errors: Dict[str, str] = {}

    for block in re.split(r"^build ", text, flags=re.M):
        build_line = block.splitlines()[0]
        match = re.match(
            r"build/GALE01/src/(.+)\.o\s*:\s*(\S+)\s+(.+)", build_line
        )
        if match is None:
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

    return {"cflags": cflags, "edges": edges, "errors": errors}


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
    target = f"build/GALE01/src/{obj_path}.o"
    index = _load_metadata(
        "build-edge-index-v1.json",
        ROOT / "build.ninja",
        _parse_build_index,
        _valid_build_index,
    )
    error = index["errors"].get(obj_path)
    if error is not None:
        raise RuntimeError(f"build edge for {target} {error}")
    edge = index["edges"].get(obj_path)
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


def _worker_compile_concurrency() -> int:
    value = os.environ.get("ORCH_WORKER_COMPILE_CONCURRENCY") or os.environ.get("ORCH_WORKER_NINJA_CONCURRENCY")
    try:
        parsed = int(value) if value else 12
    except ValueError:
        parsed = 12
    return max(1, min(64, parsed))


def _worker_compile_queue_dir() -> Path:
    worktree_dir = ROOT.parent
    workers_dir = worktree_dir.parent
    if workers_dir.name == "workers":
        return workers_dir.parent / ".worker-ninja-slots"
    return worktree_dir / ".worker-ninja-slots"


def _slot_is_stale(slot_dir: Path) -> bool:
    try:
        age = time.time() - slot_dir.stat().st_mtime
    except OSError:
        return True
    try:
        owner = json.loads((slot_dir / "owner.json").read_text())
        pid = int(owner.get("pid") or 0)
        if pid > 0:
            try:
                os.kill(pid, 0)
                return age > WORKER_COMPILE_SLOT_STALE_SECONDS
            except OSError:
                return True
    except Exception:
        return age > WORKER_COMPILE_SLOT_MISSING_OWNER_STALE_SECONDS
    return age > WORKER_COMPILE_SLOT_STALE_SECONDS


@contextlib.contextmanager
def worker_compile_slot() -> Iterator[None]:
    queue_dir = _worker_compile_queue_dir()
    queue_dir.mkdir(parents=True, exist_ok=True)
    limit = _worker_compile_concurrency()
    while True:
        for index in range(limit):
            slot_dir = queue_dir / f"slot-{index}"
            try:
                slot_dir.mkdir()
                (slot_dir / "owner.json").write_text(json.dumps({
                    "pid": os.getpid(),
                    "repoRoot": str(ROOT),
                    "acquiredAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "kind": "toolpack_mwcc",
                }, indent=2))
            except FileExistsError:
                if _slot_is_stale(slot_dir):
                    shutil.rmtree(slot_dir, ignore_errors=True)
                continue
            try:
                yield
            finally:
                shutil.rmtree(slot_dir, ignore_errors=True)
            return
        time.sleep(0.25 + (os.getpid() % 10) * 0.03)


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
    state_dir = os.environ.get("ORCH_PROJECT_STATE_DIR")
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
    depfile_path = ROOT / f"build/GALE01/src/{obj_path}.d"
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
    block: BuildBlock, *, obj_path: str, sources: List[str], quiet: bool
) -> Optional[list]:
    """[runner, (sjiswrap,) mwcceppc.exe] for this TU's rule, or None if a
    prerequisite is missing."""
    sjiswrap = ROOT / "build/tools/sjiswrap.exe"
    compiler = ROOT / "build" / "compilers" / block.mw_version / "mwcceppc.exe"
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
) -> Optional[CompiledObject]:
    """Compile one TU directly from its build.ninja MWCC settings.

    The output goes to a unique temporary object, avoiding Ninja state and the
    normal build-tree object path. When `src_override` is given, that file is
    compiled instead of the TU's real source (used by the permuter to score a
    candidate). It must sit in the same directory as the real source so that
    `-cwd source` and quote-includes resolve identically.

    `quiet=True` suppresses all diagnostic prints (the permuter expects many
    candidates to fail to compile; that is normal, not noteworthy).
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
        block, obj_path=obj_path, sources=[src], quiet=quiet
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
    tmpdir = tempfile.TemporaryDirectory(prefix="ninja-compile-", dir=build_tmp)
    tmp_obj = Path(tmpdir.name) / f"{Path(obj_path).name}.o"

    cmd = list(cmd_prefix) + shlex.split(block.cflags)
    if prefix is not None:
        # Inject a precompiled header onto the source (mwcc -prefix). The arg is
        # resolved like an #include (relative to the source dir, due to
        # -cwd source), so callers pass the PCH's basename and keep it colocated.
        cmd += ["-prefix", prefix]
    cmd += ["-c", src, "-o", str(tmp_obj)]

    with worker_compile_slot():
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
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
        if not _run_extab_clean(tmp_obj, dtk, padding, quiet=quiet):
            tmpdir.cleanup()
            return None

    return CompiledObject(obj=tmp_obj, tmpdir=tmpdir)


def source_dir_for(obj_path: str) -> Path:
    """Directory holding the real .c for obj_path (where candidates must live)."""
    return (ROOT / f"src/{obj_path}.c").parent


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
    fd, tmp_c = tempfile.mkstemp(suffix=".c", prefix=".permute-", dir=str(src_dir))
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
        fd, p = tempfile.mkstemp(suffix=".c", prefix=".permute-", dir=str(src_dir))
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

    build_tmp = ROOT / "build"
    build_tmp.mkdir(exist_ok=True)
    outdir = tempfile.TemporaryDirectory(prefix="ninja-batch-", dir=build_tmp)
    cleanups: List = [outdir]

    cmd = list(cmd_prefix) + shlex.split(block.cflags)
    if prefix_pch is not None:
        cmd += ["-prefix", prefix_pch.name]
    # -o <dir> writes each input's object as <dir>/<source-stem>.o
    cmd += ["-o", _root_rel(Path(outdir.name)), "-c"]
    objs: List[Optional[Path]] = [None] * len(active_cfiles)

    def expected(index: int) -> Path:
        return Path(outdir.name) / (active_cfiles[index].stem + ".o")

    def compile_indexes(indexes: List[int]) -> subprocess.CompletedProcess:
        batch_cmd = cmd + [_root_rel(active_cfiles[index]) for index in indexes]
        with worker_compile_slot():
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
    fd, pch_c = tempfile.mkstemp(suffix=".c", prefix=".permute-pch-", dir=str(src_dir))
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
        cmd = (
            list(cmd_prefix)
            + shlex.split(block.cflags)
            + ["-precompile", _root_rel(mch_path), "-c", _root_rel(pch_c_path)]
        )
        with worker_compile_slot():
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
