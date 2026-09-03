#!/usr/bin/env python3
"""Capture MWCC register-allocator state with qemu and GDB."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time
from typing import Dict, List, Optional, Sequence, Tuple


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from allocator_snapshot import (  # noqa: E402
    validate_coloring_snapshot,
    validate_snapshot,
)
from compare_coloring_snapshots import compare_snapshots  # noqa: E402


COMPILER_HASHES = {
    "0443b5c02b1aa7b575b61e0e24c4d5ad6bed8fd54cc42de5a2204a5216001914": "GC/1.2.5",
    "ccf4b465cec73b5aae9c5c5543dcf8cda8a62aba246f89e2e0b200d742f2e55c": "GC/1.2.5n",
}
FUNCTION_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")
ALLOCATOR_FILE_PATTERN = re.compile(r"^allocator-(\d+)\.json$")
COLORING_FILE_PATTERN = re.compile(
    r"^coloring-(\d+)-gpr-(\d+)-(before|after)\.json$"
)
PROVISIONING_GUIDANCE = (
    "This sandbox snapshot predates the MWCC allocator tooling. Do not retry; "
    "continue with checkdiff/mwcc_debug_lookup evidence."
)


class ArgumentError(ValueError):
    """Raised for a user-supplied argument that cannot be accepted."""


class JsonArgumentParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise ArgumentError(message)


def emit(payload: dict) -> None:
    print(json.dumps(payload, sort_keys=True))


def tail(value: str, limit: int = 4000) -> str:
    return (value or "")[-limit:]


def normalize_unit(value: str) -> str:
    if not value:
        raise ArgumentError("--unit must not be empty")
    if "\x00" in value:
        raise ArgumentError("--unit must not contain NUL bytes")
    if "\\" in value:
        raise ArgumentError("--unit must use forward slashes")
    path = PurePosixPath(value)
    if path.is_absolute():
        raise ArgumentError("--unit must be relative to the workspace root")
    if ".." in path.parts:
        raise ArgumentError("--unit must not contain '..'")
    parts = [part for part in path.parts if part not in ("", ".")]
    if parts and parts[0] == "src":
        parts = parts[1:]
    if not parts:
        raise ArgumentError("--unit must name a source file")
    relative = PurePosixPath(*parts)
    if relative.suffix not in (".c", ".cpp"):
        raise ArgumentError("--unit must end in .c or .cpp")
    return str(PurePosixPath("src") / relative)


def normalize_out_dir(value: Optional[str], function: str) -> str:
    if value is None:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        return str(PurePosixPath("build") / "mwcc-alloc" / f"{function}-{stamp}")
    if not value or "\x00" in value or "\\" in value:
        raise ArgumentError("--out-dir must be a non-empty workspace-relative path")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts:
        raise ArgumentError("--out-dir must stay within the workspace root")
    parts = [part for part in path.parts if part not in ("", ".")]
    if not parts:
        raise ArgumentError("--out-dir must name a directory")
    return str(PurePosixPath(*parts))


def build_parser() -> argparse.ArgumentParser:
    parser = JsonArgumentParser(description=__doc__)
    parser.add_argument("--unit", required=True)
    parser.add_argument("--function", required=True)
    parser.add_argument(
        "--capture", choices=("pcode", "coloring", "pair"), default="pair"
    )
    parser.add_argument("--out-dir")
    parser.add_argument("--timeout-seconds", type=int, default=900)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--repo-root", default=os.getcwd())
    return parser


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    args = build_parser().parse_args(argv)
    args.unit = normalize_unit(args.unit)
    if not FUNCTION_PATTERN.fullmatch(args.function):
        raise ArgumentError(
            "--function must be a C identifier containing only letters, digits, _, or $"
        )
    args.timeout_seconds = max(60, min(1800, args.timeout_seconds))
    args.out_dir = normalize_out_dir(args.out_dir, args.function)
    args.repo_root = Path(args.repo_root).resolve()
    return args


def provisioning_probe() -> Optional[dict]:
    missing = []
    gdb = shutil.which("gdb-multiarch")
    qemu = shutil.which("qemu-i386")
    if not gdb:
        missing.append("gdb-multiarch")
    if not qemu:
        missing.append("qemu-i386")
    if gdb:
        try:
            check = subprocess.run(
                [gdb, "--batch", "-ex", "python print(1)"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=10,
                check=False,
            )
            if check.returncode != 0 or "1" not in check.stdout.split():
                missing.append("gdb-python")
        except (OSError, subprocess.TimeoutExpired):
            missing.append("gdb-python")
    if missing:
        return {
            "status": "debug_tools_not_provisioned",
            "missing": missing,
            "guidance": PROVISIONING_GUIDANCE,
        }
    return None


def run_command(
    command: Sequence[str], cwd: Path, timeout_seconds: int
) -> subprocess.CompletedProcess:
    return subprocess.run(
        list(command),
        cwd=str(cwd),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        errors="replace",
        timeout=timeout_seconds,
        check=False,
    )


def object_path_for_unit(unit: str) -> str:
    source = PurePosixPath(unit)
    build_id = os.environ.get("ORCH_GAME_BUILD_ID") or "GALE01"
    # The compiled object is build/<build_id>/src/<unit>.o; build/<build_id>/obj/ is the dtk-split baseline and not a ninja target.
    return str(PurePosixPath(f"build/{build_id}") / source.with_suffix(".o"))


def extract_compile_command(
    commands_output: str, repo_root: Path, capture_object: Path
) -> Tuple[Path, List[str], bool]:
    lines = [
        line
        for line in commands_output.splitlines()
        if "mwcceppc.exe" in line.lower()
    ]
    if not lines:
        raise ValueError("ninja command output did not contain mwcceppc.exe")
    tokens = shlex.split(lines[-1], posix=True)
    compiler_index = None
    for index, token in enumerate(tokens):
        if Path(token).name.lower() == "mwcceppc.exe":
            compiler_index = index
            break
    if compiler_index is None:
        raise ValueError("could not identify the mwcceppc.exe path token")

    prefix = tokens[:compiler_index]
    sjiswrap_stripped = any("sjiswrap" in Path(token).name.lower() for token in prefix)
    compiler_token = tokens[compiler_index]
    compiler_path = Path(compiler_token)
    if not compiler_path.is_absolute():
        compiler_path = repo_root / compiler_path
    compiler_path = compiler_path.resolve()

    raw_args = tokens[compiler_index + 1 :]
    if "&&" in raw_args:
        raw_args = raw_args[: raw_args.index("&&")]
    compile_args = []
    index = 0
    output_rewritten = False
    while index < len(raw_args):
        token = raw_args[index]
        if token == "-MMD":
            index += 1
            continue
        if token == "-o":
            if index + 1 >= len(raw_args):
                raise ValueError("compiler command has -o without an output path")
            compile_args.extend(("-o", str(capture_object)))
            output_rewritten = True
            index += 2
            continue
        if token.startswith("-o") and len(token) > 2:
            compile_args.append("-o" + str(capture_object))
            output_rewritten = True
            index += 1
            continue
        compile_args.append(token)
        index += 1
    if not output_rewritten:
        compile_args.extend(("-o", str(capture_object)))
    return compiler_path, compile_args, sjiswrap_stripped


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            block = stream.read(1024 * 1024)
            if not block:
                break
            digest.update(block)
    return digest.hexdigest()


def select_wibo(repo_root: Path) -> Optional[Path]:
    # Prefer the stock wibo for qemu: the optimized wibo-real crashes under
    # qemu-user (helper-thread SIGSEGV from segment-base mishandling).
    for relative in (
        "build/tools/wibo-qemu",
        "build/tools/wibo-real",
        "build/tools/wibo",
    ):
        candidate = repo_root / relative
        try:
            with candidate.open("rb") as stream:
                if stream.read(4) == b"\x7fELF":
                    return candidate.resolve()
        except OSError:
            continue
    return None


def _slice(data: bytes, offset: int, size: int, label: str) -> bytes:
    if offset < 0 or size < 0 or offset + size > len(data):
        raise ValueError(f"ELF {label} lies outside the file")
    return data[offset : offset + size]


def _string_at(table: bytes, offset: int) -> str:
    if offset < 0 or offset >= len(table):
        raise ValueError("ELF symbol name offset lies outside its string table")
    end = table.find(b"\x00", offset)
    if end < 0:
        raise ValueError("ELF symbol name is not NUL terminated")
    return table[offset:end].decode("utf-8", errors="replace")


def read_elf_functions(path: Path) -> List[str]:
    """Return defined function names in section and address order."""

    data = path.read_bytes()
    if len(data) < 52 or data[:4] != b"\x7fELF":
        raise ValueError("object is not an ELF file")
    if data[4] != 1 or data[5] != 2:
        raise ValueError("object must be 32-bit big-endian ELF")
    header = struct.unpack_from(">HHIIIIIHHHHHH", data, 16)
    if header[1] != 20:  # EM_PPC
        raise ValueError("object must target 32-bit PowerPC")
    section_offset = header[5]
    section_entry_size = header[10]
    section_count = header[11]
    if section_entry_size < 40:
        raise ValueError("ELF section-header entry is too small")

    sections = []
    for section_index in range(section_count):
        offset = section_offset + section_index * section_entry_size
        raw = _slice(data, offset, 40, "section header")
        sections.append(struct.unpack(">IIIIIIIIII", raw))

    functions = []
    ordinal = 0
    for section in sections:
        section_type = section[1]
        if section_type != 2:  # SHT_SYMTAB
            continue
        sym_offset, sym_size, string_index, sym_entry_size = (
            section[4],
            section[5],
            section[6],
            section[9],
        )
        if sym_entry_size < 16 or sym_size % sym_entry_size != 0:
            raise ValueError("ELF symbol table has an invalid entry size")
        if string_index >= len(sections):
            raise ValueError("ELF symbol table has an invalid string-table link")
        string_section = sections[string_index]
        string_table = _slice(
            data, string_section[4], string_section[5], "string table"
        )
        for entry_offset in range(sym_offset, sym_offset + sym_size, sym_entry_size):
            raw = _slice(data, entry_offset, 16, "symbol entry")
            name_offset, value, _size, info, _other, section_index = struct.unpack(
                ">IIIBBH", raw
            )
            if info & 0x0F != 2 or section_index == 0:
                ordinal += 1
                continue
            name = _string_at(string_table, name_offset)
            if name:
                functions.append((section_index, value, ordinal, name))
            ordinal += 1
    functions.sort(key=lambda item: item[:3])
    return [item[3] for item in functions]


def free_tcp_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def terminate_process(process: Optional[subprocess.Popen]) -> None:
    if process is None:
        return
    process_group = process.pid
    try:
        os.killpg(process_group, signal.SIGTERM)
    except (OSError, ProcessLookupError):
        pass

    if process.poll() is None:
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            pass

    group_deadline = time.monotonic() + 2
    while time.monotonic() < group_deadline:
        try:
            os.killpg(process_group, 0)
        except ProcessLookupError:
            break
        except PermissionError:
            pass
        time.sleep(0.05)
    try:
        os.killpg(process_group, signal.SIGKILL)
    except (OSError, ProcessLookupError):
        pass
    if process.poll() is None:
        process.wait()


def process_output(process: Optional[subprocess.Popen]) -> Tuple[str, str]:
    if process is None:
        return "", ""
    try:
        stdout, stderr = process.communicate(timeout=0.1)
    except subprocess.TimeoutExpired:
        terminate_process(process)
        stdout, stderr = process.communicate()
    return stdout or "", stderr or ""


def looks_like_port_collision(stderr: str) -> bool:
    lowered = stderr.lower()
    return any(
        phrase in lowered
        for phrase in (
            "address already in use",
            "failed to bind",
            "could not open gdbserver",
            "bind failed",
        )
    )


def capture_with_debugger(
    repo_root: Path,
    wibo: Path,
    compiler_path: Path,
    compile_args: Sequence[str],
    capture_dir: Path,
    compiler_sha256: str,
    compiler_label: str,
    capture_index: int,
    timeout_seconds: int,
) -> dict:
    deadline = time.monotonic() + timeout_seconds
    qemu_stdout = ""
    qemu_stderr = ""
    gdb_stdout = ""
    gdb_stderr = ""

    for launch_attempt in range(3):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            return {"timed_out": True}
        port = free_tcp_port()
        qemu = None
        gdb = None
        try:
            qemu = subprocess.Popen(
                [
                    "qemu-i386",
                    "-g",
                    str(port),
                    str(wibo),
                    str(compiler_path),
                    *compile_args,
                ],
                cwd=str(repo_root),
                env=os.environ.copy(),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                errors="replace",
                start_new_session=True,
            )
            time.sleep(0.15)
            if qemu.poll() is not None:
                qemu_stdout, qemu_stderr = process_output(qemu)
                if looks_like_port_collision(qemu_stderr) and launch_attempt < 2:
                    continue
                return {
                    "timed_out": False,
                    "qemu_returncode": qemu.returncode,
                    "gdb_returncode": None,
                    "qemu_stdout": qemu_stdout,
                    "qemu_stderr": qemu_stderr,
                    "gdb_stdout": "",
                    "gdb_stderr": "",
                }

            gdb_env = os.environ.copy()
            gdb_env.update(
                {
                    "MWCC_ALLOC_TARGET_SHA256": compiler_sha256,
                    "MWCC_ALLOC_COMPILER_LABEL": compiler_label,
                    "MWCC_ALLOC_ONLY_INDEX": str(capture_index),
                }
            )
            gdb_command = [
                "gdb-multiarch",
                "-nx",
                "-batch",
                "-ex",
                "set pagination off",
                "-ex",
                "set architecture i386",
                "-ex",
                f"source {SCRIPT_DIR / 'gdb_allocator_snapshot.py'}",
                "-ex",
                f"mwcc-auto-capture {capture_dir}",
                "-ex",
                f"target remote 127.0.0.1:{port}",
                "-ex",
                "continue",
            ]
            gdb = subprocess.Popen(
                gdb_command,
                cwd=str(repo_root),
                env=gdb_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                errors="replace",
                start_new_session=True,
            )
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                terminate_process(gdb)
                terminate_process(qemu)
                gdb_stdout, gdb_stderr = process_output(gdb)
                qemu_stdout, qemu_stderr = process_output(qemu)
                return {
                    "timed_out": True,
                    "gdb_stdout": gdb_stdout,
                    "gdb_stderr": gdb_stderr,
                    "qemu_stdout": qemu_stdout,
                    "qemu_stderr": qemu_stderr,
                }
            try:
                gdb_stdout, gdb_stderr = gdb.communicate(timeout=remaining)
            except subprocess.TimeoutExpired:
                terminate_process(gdb)
                terminate_process(qemu)
                gdb_stdout, gdb_stderr = process_output(gdb)
                qemu_stdout, qemu_stderr = process_output(qemu)
                return {
                    "timed_out": True,
                    "gdb_stdout": gdb_stdout,
                    "gdb_stderr": gdb_stderr,
                    "qemu_stdout": qemu_stdout,
                    "qemu_stderr": qemu_stderr,
                }

            if gdb.returncode != 0:
                terminate_process(qemu)
                qemu_stdout, qemu_stderr = process_output(qemu)
                if looks_like_port_collision(qemu_stderr) and launch_attempt < 2:
                    continue
                return {
                    "timed_out": False,
                    "gdb_returncode": gdb.returncode,
                    "qemu_returncode": qemu.returncode,
                    "gdb_stdout": gdb_stdout,
                    "gdb_stderr": gdb_stderr,
                    "qemu_stdout": qemu_stdout,
                    "qemu_stderr": qemu_stderr,
                }

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                terminate_process(qemu)
                qemu_stdout, qemu_stderr = process_output(qemu)
                return {
                    "timed_out": True,
                    "gdb_stdout": gdb_stdout,
                    "gdb_stderr": gdb_stderr,
                    "qemu_stdout": qemu_stdout,
                    "qemu_stderr": qemu_stderr,
                }
            if qemu.poll() is None and remaining > 0:
                try:
                    qemu_stdout, qemu_stderr = qemu.communicate(timeout=remaining)
                except subprocess.TimeoutExpired:
                    terminate_process(qemu)
                    qemu_stdout, qemu_stderr = process_output(qemu)
                    return {
                        "timed_out": True,
                        "gdb_stdout": gdb_stdout,
                        "gdb_stderr": gdb_stderr,
                        "qemu_stdout": qemu_stdout,
                        "qemu_stderr": qemu_stderr,
                    }
            else:
                qemu_stdout, qemu_stderr = process_output(qemu)
            if looks_like_port_collision(qemu_stderr) and launch_attempt < 2:
                continue
            return {
                "timed_out": False,
                "gdb_returncode": gdb.returncode,
                "qemu_returncode": qemu.returncode,
                "gdb_stdout": gdb_stdout,
                "gdb_stderr": gdb_stderr,
                "qemu_stdout": qemu_stdout,
                "qemu_stderr": qemu_stderr,
            }
        finally:
            terminate_process(gdb)
            terminate_process(qemu)
            if gdb is not None and gdb.poll() is not None:
                try:
                    gdb.communicate(timeout=0)
                except (ValueError, subprocess.TimeoutExpired):
                    pass
            if qemu is not None and qemu.poll() is not None:
                try:
                    qemu.communicate(timeout=0)
                except (ValueError, subprocess.TimeoutExpired):
                    pass
    return {
        "timed_out": False,
        "gdb_returncode": None,
        "qemu_returncode": 1,
        "gdb_stdout": gdb_stdout,
        "gdb_stderr": gdb_stderr,
        "qemu_stdout": qemu_stdout,
        "qemu_stderr": qemu_stderr,
    }


def captured_indices(paths: Sequence[Path]) -> List[int]:
    indices = set()
    for path in paths:
        match = ALLOCATOR_FILE_PATTERN.fullmatch(path.name)
        if match:
            indices.add(int(match.group(1)))
            continue
        match = COLORING_FILE_PATTERN.fullmatch(path.name)
        if match:
            indices.add(int(match.group(1)))
    return sorted(indices)


def files_for_capture(
    paths: Sequence[Path], capture_index: int, capture_kind: str
) -> List[Tuple[Path, str, Optional[int]]]:
    allocator = []
    coloring = []
    for path in paths:
        allocator_match = ALLOCATOR_FILE_PATTERN.fullmatch(path.name)
        if allocator_match and int(allocator_match.group(1)) == capture_index:
            allocator.append((path, "allocator", None))
            continue
        coloring_match = COLORING_FILE_PATTERN.fullmatch(path.name)
        if coloring_match and int(coloring_match.group(1)) == capture_index:
            attempt = int(coloring_match.group(2))
            kind = "coloring_" + coloring_match.group(3)
            coloring.append((path, kind, attempt))
    allocator.sort(key=lambda item: item[0].name)
    coloring.sort(
        key=lambda item: (
            item[2] or 0,
            0 if item[1] == "coloring_before" else 1,
        )
    )
    if capture_kind == "pcode":
        return allocator[:1]
    if capture_kind == "coloring":
        return [item for item in coloring if item[1] == "coloring_before"][:1]
    return allocator[:1] + coloring


def load_and_summarize(
    path: Path, kind: str, attempt: Optional[int]
) -> Tuple[dict, dict]:
    with path.open(encoding="utf-8") as stream:
        snapshot = json.load(stream)
    summary = {
        "path": None,
        "kind": kind,
        "attempt": attempt,
        "blocks": None,
        "instructions": None,
        "nodes": None,
        "register_count": None,
        "simplify_order_len": None,
        "uncolored_nodes": None,
    }
    if kind == "allocator":
        validate_snapshot(snapshot)
        summary["blocks"] = len(snapshot["blocks"])
        summary["instructions"] = sum(
            len(block.get("instructions", ())) for block in snapshot["blocks"]
        )
    else:
        validate_coloring_snapshot(snapshot)
        summary["nodes"] = len(snapshot["nodes"])
        summary["register_count"] = snapshot.get("register_count")
        summary["simplify_order_len"] = len(snapshot.get("simplify_order", ()))
        summary["uncolored_nodes"] = sum(
            1
            for node in snapshot["nodes"]
            if node.get("physical_register") is None
            or node.get("physical_register", -1) < 0
        )
    return snapshot, summary


def pair_diffs(
    snapshots: Sequence[Tuple[str, Optional[int], dict]]
) -> List[dict]:
    by_attempt: Dict[int, Dict[str, dict]] = {}
    for kind, attempt, snapshot in snapshots:
        if attempt is not None and kind.startswith("coloring_"):
            by_attempt.setdefault(attempt, {})[kind] = snapshot
    results = []
    for attempt in sorted(by_attempt):
        pair = by_attempt[attempt]
        if "coloring_before" not in pair or "coloring_after" not in pair:
            continue
        changes = compare_snapshots(
            pair["coloring_before"], pair["coloring_after"]
        )
        results.append(
            {
                "attempt": attempt,
                "change_count": len(changes),
                "changes": changes[:200],
                "truncated": len(changes) > 200,
            }
        )
    return results


def execute(args: argparse.Namespace) -> dict:
    started = time.monotonic()
    probe = provisioning_probe()
    if probe is not None:
        return probe

    repo_root = args.repo_root
    object_relative = object_path_for_unit(args.unit)
    object_path = repo_root / object_relative
    try:
        build = run_command(
            ["ninja", object_relative],
            repo_root,
            min(300, args.timeout_seconds),
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"status": "unit_build_failed", "stderr_tail": tail(str(error))}
    if build.returncode != 0:
        return {
            "status": "unit_build_failed",
            "stderr_tail": tail(build.stderr or build.stdout),
        }

    try:
        commands = run_command(
            ["ninja", "-t", "commands", object_relative],
            repo_root,
            min(60, args.timeout_seconds),
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return {"status": "unit_build_failed", "stderr_tail": tail(str(error))}
    if commands.returncode != 0:
        return {
            "status": "unit_build_failed",
            "stderr_tail": tail(commands.stderr or commands.stdout),
        }

    with tempfile.TemporaryDirectory(prefix="mwcc-alloc-") as temporary:
        temporary_path = Path(temporary)
        capture_object = temporary_path / "capture.o"
        capture_dir = temporary_path / "snapshots"
        capture_dir.mkdir()
        try:
            compiler_path, compile_args, sjiswrap_stripped = extract_compile_command(
                commands.stdout, repo_root, capture_object
            )
        except (ValueError, OSError) as error:
            return {
                "status": "unit_build_failed",
                "stderr_tail": tail(str(error)),
            }

        try:
            compiler_hash = sha256_file(compiler_path)
        except OSError as error:
            return {
                "status": "compiler_hash_mismatch",
                "compiler_path": str(compiler_path),
                "sha256": None,
                "accepted": list(COMPILER_HASHES),
                "error": str(error),
            }
        compiler_label = COMPILER_HASHES.get(compiler_hash)
        if compiler_label is None:
            return {
                "status": "compiler_hash_mismatch",
                "compiler_path": str(compiler_path),
                "sha256": compiler_hash,
                "accepted": list(COMPILER_HASHES),
            }
        compiler = {
            "path": str(compiler_path.relative_to(repo_root))
            if compiler_path.is_relative_to(repo_root)
            else str(compiler_path),
            "sha256": compiler_hash,
            "label": compiler_label,
        }

        wibo = select_wibo(repo_root)
        if wibo is None:
            return {
                "status": "debug_tools_not_provisioned",
                "missing": ["wibo-elf"],
            }

        try:
            unit_functions = read_elf_functions(object_path)
        except (OSError, ValueError) as error:
            return {
                "status": "function_not_found",
                "unit_functions": [],
                "error": str(error),
            }
        try:
            capture_index = unit_functions.index(args.function) + 1
        except ValueError:
            return {
                "status": "function_not_found",
                "unit_functions": unit_functions[:50],
            }
        selection = {
            "method": "symtab_order",
            "capture_index": capture_index,
            "total_functions": len(unit_functions),
            "caveat": (
                "index mapping assumes MWCC emits one allocator pass per emitted function in "
                "object symbol order; verify against neighboring captures if results look off"
            ),
        }

        capture_result = capture_with_debugger(
            repo_root,
            wibo,
            compiler_path,
            compile_args,
            capture_dir,
            compiler_hash,
            compiler_label,
            capture_index,
            args.timeout_seconds,
        )
        if capture_result.get("timed_out"):
            return {
                "status": "timeout",
                "selection": selection,
                "gdb_stderr_tail": tail(capture_result.get("gdb_stderr", "")),
                "qemu_stderr_tail": tail(capture_result.get("qemu_stderr", "")),
            }

        all_paths = sorted(capture_dir.glob("*.json"))
        indices = captured_indices(all_paths)
        selected = files_for_capture(all_paths, capture_index, args.capture)
        if not selected:
            if indices and capture_index not in indices:
                return {
                    "status": "capture_index_missing",
                    "captured_indices": indices,
                    "selection": selection,
                }
            return {
                "status": "capture_failed",
                "gdb_stderr_tail": tail(capture_result.get("gdb_stderr", "")),
                "qemu_stderr_tail": tail(capture_result.get("qemu_stderr", "")),
            }
        if (
            capture_result.get("gdb_returncode") not in (0, None)
            or capture_result.get("qemu_returncode") not in (0, None)
        ) and not all_paths:
            return {
                "status": "capture_failed",
                "gdb_stderr_tail": tail(capture_result.get("gdb_stderr", "")),
                "qemu_stderr_tail": tail(capture_result.get("qemu_stderr", "")),
            }

        if args.capture == "pair":
            kinds = {(kind, attempt) for _path, kind, attempt in selected}
            before_attempts = {
                attempt for kind, attempt in kinds if kind == "coloring_before"
            }
            after_attempts = {
                attempt for kind, attempt in kinds if kind == "coloring_after"
            }
            if (
                not any(kind == "allocator" for _path, kind, _attempt in selected)
                or not before_attempts
                or before_attempts != after_attempts
            ):
                return {
                    "status": "capture_failed",
                    "gdb_stderr_tail": tail(capture_result.get("gdb_stderr", "")),
                    "qemu_stderr_tail": tail(capture_result.get("qemu_stderr", "")),
                }

        loaded = []
        summaries = []
        try:
            for source, kind, attempt in selected:
                snapshot, summary = load_and_summarize(source, kind, attempt)
                loaded.append((kind, attempt, snapshot))
                summaries.append((source, summary))
        except (
            OSError,
            ValueError,
            KeyError,
            TypeError,
            AttributeError,
            json.JSONDecodeError,
        ) as error:
            return {
                "status": "capture_failed",
                "gdb_stderr_tail": tail(str(error)),
                "qemu_stderr_tail": tail(capture_result.get("qemu_stderr", "")),
            }

        output_dir = repo_root / args.out_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        files = []
        for source, summary in summaries:
            destination = output_dir / source.name
            shutil.move(str(source), str(destination))
            summary["path"] = str(destination.relative_to(repo_root))
            files.append(summary)

        return {
            "status": "ok",
            "format": "mwcc-alloc-capture-v1",
            "unit": args.unit,
            "function": args.function,
            "capture": args.capture,
            "compiler": compiler,
            "selection": selection,
            "out_dir": str(output_dir.relative_to(repo_root)),
            "files": files,
            "pair_diffs": pair_diffs(loaded) if args.capture == "pair" else [],
            "sjiswrap_stripped": sjiswrap_stripped,
            "duration_seconds": round(time.monotonic() - started, 3),
        }


def main(argv: Optional[Sequence[str]] = None) -> int:
    try:
        args = parse_args(argv)
        emit(execute(args))
        return 0
    except ArgumentError as error:
        emit({"status": "invalid_arguments", "error": str(error)})
        return 0
    except Exception as error:  # Unexpected failures are programmer errors.
        emit({"status": "internal_error", "error": str(error)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
