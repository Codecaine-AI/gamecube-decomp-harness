#!/usr/bin/env python3
"""Run a compiler command with a deadline, output caps and process-group cleanup.

Shared by ninja_compile.direct_compile and stack_check.compile_in. Kept free of
repo binding so either can import it at any time.
"""

from __future__ import annotations

import os
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


# Captured stdout/stderr per stream; MWCC error spam beyond this is dropped.
DEFAULT_OUTPUT_CAP = 4 * 1024 * 1024


@dataclass
class BoundedRun:
    returncode: Optional[int]
    stdout: str
    stderr: str
    timed_out: bool = False
    output_truncated: bool = False
    # Set when a watched output file outgrew its cap and the run was killed.
    limit_exceeded: Optional[str] = None


def _kill_group(process: subprocess.Popen) -> None:
    """SIGTERM, then SIGKILL, the process group; always reap the leader."""
    for sig, grace in ((15, 1.0), (9, 0.0)):
        try:
            os.killpg(process.pid, sig)
        except (ProcessLookupError, PermissionError, OSError):
            break
        if grace:
            try:
                process.wait(timeout=grace)
            except subprocess.TimeoutExpired:
                pass
    if process.poll() is None:
        process.wait()


def _oversized(file_caps: Optional[List[Tuple[Path, int]]]) -> Optional[str]:
    for path, cap in file_caps or ():
        try:
            size = Path(path).stat().st_size
        except OSError:
            continue
        if size > cap:
            return f"{path} exceeded {cap} bytes"
    return None


def run_bounded(
    cmd: List[str],
    *,
    cwd: Path | str,
    env: Optional[Dict[str, str]] = None,
    timeout: Optional[float] = None,
    output_cap: Optional[int] = DEFAULT_OUTPUT_CAP,
    file_caps: Optional[List[Tuple[Path, int]]] = None,
) -> BoundedRun:
    """Run `cmd` in its own process group with a deadline and size caps.

    `env` is merged over os.environ. Each captured stream keeps at most
    `output_cap` bytes. A file in `file_caps` that grows past its byte cap
    (e.g. a compiler trace) kills the run. On timeout or a cap, the whole
    group is killed and reaped, so sjiswrap/wibo children never outlive us.
    """
    full_env = None if env is None else {**os.environ, **env}
    process = subprocess.Popen(
        list(cmd), cwd=str(cwd), env=full_env, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
    )
    buffers = {"stdout": bytearray(), "stderr": bytearray()}
    truncated = [False]

    def drain(stream: Any, key: str) -> None:
        buffer = buffers[key]
        while True:
            chunk = stream.read(65536)
            if not chunk:
                break
            room = len(chunk) if output_cap is None else max(0, output_cap - len(buffer))
            buffer += chunk[:room]
            if room < len(chunk):
                truncated[0] = True
        stream.close()

    readers = [threading.Thread(target=drain, args=(process.stdout, "stdout"), daemon=True),
               threading.Thread(target=drain, args=(process.stderr, "stderr"), daemon=True)]
    for reader in readers:
        reader.start()
    deadline = None if timeout is None else time.monotonic() + timeout
    timed_out = False
    exceeded: Optional[str] = None
    try:
        while True:
            wait = 0.05 if deadline is None else min(0.05, max(0.0, deadline - time.monotonic()))
            try:
                process.wait(timeout=wait)
                break
            except subprocess.TimeoutExpired:
                pass
            if deadline is not None and time.monotonic() >= deadline:
                timed_out = True
                break
            exceeded = _oversized(file_caps)
            if exceeded:
                break
    finally:
        # Also reaps children left behind by a leader that exited normally.
        _kill_group(process)
        for reader in readers:
            reader.join(timeout=5)
    if not exceeded and not timed_out:
        # A run that exits between polls can still have outgrown a cap.
        exceeded = _oversized(file_caps)
    return BoundedRun(
        returncode=None if (timed_out or exceeded) else process.returncode,
        stdout=bytes(buffers["stdout"]).decode("utf-8", "replace"),
        stderr=bytes(buffers["stderr"]).decode("utf-8", "replace"),
        timed_out=timed_out,
        output_truncated=truncated[0],
        limit_exceeded=exceeded,
    )
