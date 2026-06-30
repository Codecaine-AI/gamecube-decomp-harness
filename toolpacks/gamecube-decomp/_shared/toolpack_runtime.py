#!/usr/bin/env python3
"""Shared helpers for GameCube decomp toolpack APIs.

The worker-facing API entrypoints live under ``toolpacks/gamecube-decomp``.
Their heavier implementation modules live beside them in
``toolpacks/gamecube-decomp/_impl/gamecube`` so the tool code is versioned with
this repository and can be reviewed, indexed, and patched here.
"""

from __future__ import annotations

import contextlib
import importlib
import io
import json
import os
import platform
import signal
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence


MAX_STREAM_CHARS = 80_000
TOOL_SLOT_STALE_SECONDS = 60 * 60
TOOL_SLOT_MISSING_OWNER_STALE_SECONDS = 30


class ToolQueueBusy(Exception):
    def __init__(self, info: dict[str, Any]) -> None:
        super().__init__("tool queue is busy")
        self.info = info


def package_root() -> Path:
    """Return the decomp-orchestrator repository root."""

    for parent in Path(__file__).resolve().parents:
        if (parent / "package.json").exists() and (parent / "apps").is_dir():
            return parent
    return Path(__file__).resolve().parents[5]


def tools_resource_root() -> Path:
    """Return the active toolpack/tool definition root."""

    override = os.environ.get("ORCH_TOOLPACK_ROOT")
    if override:
        path = Path(override).expanduser()
        return path if path.is_absolute() else package_root() / path
    for parent in Path(__file__).resolve().parents:
        if (parent / "toolpack.json").exists() and (parent / "registry.json").exists():
            return parent
    return package_root() / "toolpacks" / "gamecube-decomp"


def tool_impl_root() -> Path:
    """Return the toolpack implementation root."""

    override = os.environ.get("ORCH_TOOL_IMPL_ROOT")
    if override:
        path = Path(override).expanduser()
        return path if path.is_absolute() else package_root() / path
    return tools_resource_root() / "_impl" / "gamecube"


def tool_impl_tools_root() -> Path:
    """Return the directory containing callable implementation helper scripts."""

    return tool_impl_root() / "tools"


def looks_like_project_repo(path: Path) -> bool:
    """Return true when ``path`` has enough GameCube decomp checkout shape."""

    return (path / "src").is_dir() and (
        (path / "build" / "GALE01").exists()
        or (path / "compile_commands.json").exists()
        or (path / "config" / "GALE01").exists()
    )


def resolve_repo_root(value: str | Path | None = None) -> Path:
    """Resolve the target project checkout root used by helper scripts."""

    if value:
        return Path(value).expanduser().resolve()
    env_value = os.environ.get("ORCH_PROJECT_REPO_ROOT")
    if env_value:
        return Path(env_value).expanduser().resolve()
    cwd = Path.cwd().resolve()
    if looks_like_project_repo(cwd):
        return cwd
    project_id = os.environ.get("ORCH_PROJECT_ID", "melee")
    return (package_root() / "projects" / project_id / "checkout").resolve()


def clip(text: str | bytes | None, max_chars: int = MAX_STREAM_CHARS) -> str:
    """Bound command output while preserving the most useful beginning."""

    if text is None:
        return ""
    if isinstance(text, bytes):
        text = text.decode("utf-8", "replace")
    elif not isinstance(text, str):
        text = str(text)
    if len(text) <= max_chars:
        return text
    omitted = len(text) - max_chars
    return f"{text[:max_chars].rstrip()}\n...<truncated {omitted} characters>...\n"


def clamp_int(value: int | None, *, default: int, minimum: int, maximum: int) -> int:
    """Clamp optional integer API values to predictable safe bounds."""

    if value is None:
        return default
    return max(minimum, min(maximum, int(value)))


def _truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _env_int(names: Sequence[str], *, default: int, minimum: int, maximum: int) -> int:
    for name in names:
        value = os.environ.get(name)
        if value is None or value.strip() == "":
            continue
        try:
            return max(minimum, min(maximum, int(value)))
        except ValueError:
            continue
    return default


def _slot_key(operation: str) -> str:
    key = operation.split(":", 1)[0].strip().lower()
    safe = "".join(ch if ch.isalnum() else "_" for ch in key).strip("_")
    return safe or "tool"


def _tool_concurrency_default(operation: str) -> int:
    if operation.startswith("source_permuter:run") or operation.startswith("source_permuter:replay"):
        return 1
    if operation.startswith("checkdiff:"):
        return 12
    if operation.startswith("m2c_decomp:"):
        return 8
    if operation.startswith("mwcc_debug:"):
        return 2
    return 16


def _tool_fails_fast_when_busy(operation: str) -> bool:
    return operation.startswith("source_permuter:run") or operation.startswith("source_permuter:replay")


def _tool_slot_dir(repo_root: Path, operation: str) -> Path:
    repo_root = repo_root.resolve()
    if repo_root.name == "source" and repo_root.parent.parent.name == "workers":
        return repo_root.parent.parent.parent / ".worker-tool-slots" / _slot_key(operation)
    return repo_root.parent / ".worker-tool-slots" / _slot_key(operation)


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
                return age > TOOL_SLOT_STALE_SECONDS
            except OSError:
                return True
    except Exception:
        return age > TOOL_SLOT_MISSING_OWNER_STALE_SECONDS
    return age > TOOL_SLOT_STALE_SECONDS


def _slot_index(slot_dir: Path) -> int | str:
    name = slot_dir.name
    if name.startswith("slot-"):
        try:
            return int(name[5:])
        except ValueError:
            pass
    return name


def _active_tool_slots(queue_dir: Path, limit: int) -> list[dict[str, Any]]:
    candidates: list[Path] = []
    seen: set[Path] = set()
    for index in range(limit):
        slot_dir = queue_dir / f"slot-{index}"
        candidates.append(slot_dir)
        seen.add(slot_dir)
    try:
        candidates.extend(sorted(path for path in queue_dir.glob("slot-*") if path not in seen))
    except OSError:
        pass

    active: list[dict[str, Any]] = []
    for slot_dir in candidates:
        if not slot_dir.exists():
            continue
        if _slot_is_stale(slot_dir):
            shutil.rmtree(slot_dir, ignore_errors=True)
            continue
        owner: dict[str, Any] = {}
        with contextlib.suppress(Exception):
            parsed = json.loads((slot_dir / "owner.json").read_text())
            if isinstance(parsed, dict):
                owner = parsed
        active.append(
            {
                "slot": _slot_index(slot_dir),
                "pid": owner.get("pid"),
                "operation": owner.get("operation"),
                "repoRoot": owner.get("repoRoot"),
                "acquiredAt": owner.get("acquiredAt"),
            }
        )
    return active


def _tool_queue_info(
    *,
    operation: str,
    queue_dir: Path,
    limit: int,
    started: float,
    policy: str,
    active_slots: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    active = active_slots if active_slots is not None else _active_tool_slots(queue_dir, limit)
    return {
        "enabled": True,
        "operation": operation,
        "queue_dir": str(queue_dir),
        "limit": limit,
        "active_slots": len(active),
        "active_slot_owners": active,
        "wait_seconds": round(time.monotonic() - started, 3),
        "policy": policy,
    }


@contextlib.contextmanager
def worker_tool_slot(repo_root: Path, operation: str, *, default_concurrency: int) -> Iterator[dict[str, Any]]:
    """Acquire an epoch-shared slot for expensive worker-local tools."""

    if _truthy_env("ORCH_TOOL_QUEUE_DISABLED") or _truthy_env("ORCH_WORKER_TOOL_QUEUE_DISABLED"):
        yield {"enabled": False, "operation": operation}
        return

    key = _slot_key(operation)
    env_key = key.upper()
    limit = _env_int(
        (
            f"ORCH_TOOL_CONCURRENCY_{env_key}",
            f"ORCH_WORKER_TOOL_CONCURRENCY_{env_key}",
            "ORCH_WORKER_TOOL_CONCURRENCY",
        ),
        default=default_concurrency,
        minimum=1,
        maximum=64,
    )
    queue_dir = _tool_slot_dir(repo_root, operation)
    queue_dir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    fail_fast = _tool_fails_fast_when_busy(operation)

    while True:
        if fail_fast:
            active_slots = _active_tool_slots(queue_dir, limit)
            if len(active_slots) >= limit:
                raise ToolQueueBusy(
                    _tool_queue_info(
                        operation=operation,
                        queue_dir=queue_dir,
                        limit=limit,
                        started=started,
                        policy="fail_fast_when_full",
                        active_slots=active_slots,
                    )
                )
        for index in range(limit):
            slot_dir = queue_dir / f"slot-{index}"
            try:
                slot_dir.mkdir()
                acquired_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
                (slot_dir / "owner.json").write_text(
                    json.dumps(
                        {
                            "pid": os.getpid(),
                            "operation": operation,
                            "repoRoot": str(repo_root),
                            "acquiredAt": acquired_at,
                        },
                        indent=2,
                    )
                )
            except FileExistsError:
                if _slot_is_stale(slot_dir):
                    shutil.rmtree(slot_dir, ignore_errors=True)
                    continue
                continue
            info = {
                "enabled": True,
                "operation": operation,
                "queue_dir": str(queue_dir),
                "slot": index,
                "limit": limit,
                "active_slots": 1,
                "policy": "fail_fast_when_full" if fail_fast else "wait_for_slot",
                "wait_seconds": round(time.monotonic() - started, 3),
                "acquired_at": acquired_at,
            }
            try:
                yield info
            finally:
                shutil.rmtree(slot_dir, ignore_errors=True)
            return
        if fail_fast:
            raise ToolQueueBusy(
                _tool_queue_info(
                    operation=operation,
                    queue_dir=queue_dir,
                    limit=limit,
                    started=started,
                    policy="fail_fast_when_full",
                    active_slots=_active_tool_slots(queue_dir, limit),
                )
            )
        time.sleep(0.25 + (os.getpid() % 10) * 0.03)


def command_payload(
    *,
    operation: str,
    command: Sequence[str],
    cwd: Path,
    repo_root: Path,
    exit_code: int | None,
    stdout: str,
    stderr: str,
    status: str | None = None,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build the common JSON payload returned by command-style APIs."""

    payload: dict[str, Any] = {
        "status": status or ("ok" if exit_code == 0 else "failed"),
        "operation": operation,
        "repo_root": str(repo_root),
        "tool_impl_root": str(tool_impl_root()),
        "toolpack_root": str(tools_resource_root()),
        "shared_data_root": os.environ.get("ORCH_TOOL_SHARED_DATA_ROOT"),
        "worktree_cache_root": os.environ.get("ORCH_TOOL_WORKTREE_CACHE_ROOT"),
        "cwd": str(cwd),
        "command": list(command),
        "exit_code": exit_code,
        "stdout": clip(stdout),
        "stderr": clip(stderr),
    }
    if extra:
        payload.update(extra)
    return payload


def tool_env(repo_root: Path) -> dict[str, str]:
    """Create an environment that points helper scripts at the target repo."""

    env = dict(os.environ)
    env["ORCH_PROJECT_REPO_ROOT"] = str(repo_root)
    env.setdefault("WINEDEBUG", "-all")
    wibo = state_wibo_path(repo_root)
    if wibo is not None:
        env["MWCC_WIBO"] = str(wibo)
    paths = [str(tool_impl_tools_root()), str(tool_impl_root() / "m2c")]
    existing = env.get("PYTHONPATH")
    env["PYTHONPATH"] = os.pathsep.join(paths + ([existing] if existing else []))
    return env


def state_wibo_path(repo_root: Path) -> Path | None:
    state_dir = os.environ.get("ORCH_PROJECT_STATE_DIR")
    if state_dir:
        candidate = Path(state_dir).expanduser() / "tools" / "wibo"
        if candidate.is_file():
            return candidate
    repo_root = repo_root.resolve()
    for parent in (repo_root, *repo_root.parents):
        if parent.name == "worktrees":
            candidate = parent.parent / "state" / "tools" / "wibo"
            if candidate.is_file():
                return candidate
        candidate = parent / "state" / "tools" / "wibo"
        if candidate.is_file():
            return candidate
    return None


def _auto_wibo_supported() -> bool:
    machine = platform.machine()
    if sys.platform == "linux":
        return machine in ("i386", "x86_64", "aarch64", "arm64")
    return sys.platform == "darwin" and machine in ("x86_64", "aarch64", "arm64")


def compiler_runner_status(repo_root: Path) -> dict[str, Any]:
    """Report whether a usable MWCC process runner is available.

    Linux setups often provide ``build/tools/wibo``. This macOS checkout can
    also run MWCC through Wine, so status checks must not treat wibo as the only
    valid runner.
    """

    project_wibo = repo_root / "build/tools/wibo"
    env_wibo = os.environ.get("MWCC_WIBO", "")
    state_wibo = state_wibo_path(repo_root)
    path_wibo = shutil.which("wibo")
    auto_wibo_supported = _auto_wibo_supported()
    project_wibo_auto = auto_wibo_supported and project_wibo.exists()
    state_wibo_auto = auto_wibo_supported and state_wibo is not None
    path_wibo_auto = auto_wibo_supported and bool(path_wibo)
    wine = next(
        (
            candidate
            for candidate in (
                os.environ.get("WINE"),
                shutil.which("wine"),
                "/usr/local/bin/wine",
                "/opt/homebrew/bin/wine",
            )
            if candidate and (Path(candidate).exists() or shutil.which(candidate))
        ),
        None,
    )
    runner_available = project_wibo_auto or bool(env_wibo) or state_wibo_auto or path_wibo_auto or bool(wine)
    return {
        "status": "ok" if runner_available else "missing",
        "project_wibo": str(project_wibo) if project_wibo.exists() else None,
        "env_mwcc_wibo": env_wibo or None,
        "state_wibo": str(state_wibo) if state_wibo is not None else None,
        "path_wibo": path_wibo,
        "auto_wibo_supported": auto_wibo_supported,
        "project_wibo_auto": project_wibo_auto,
        "state_wibo_auto": state_wibo_auto,
        "path_wibo_auto": path_wibo_auto,
        "wine": wine,
        "missing_label": "MWCC runner: build/tools/wibo, MWCC_WIBO, wibo, or wine",
    }


def script_declares_dependencies(script: Path) -> bool:
    """Return true when a helper script has a PEP 723 dependency block."""

    try:
        head = script.read_text(errors="ignore")[:2048]
    except OSError:
        return False
    return "# /// script" in head and "dependencies" in head


def run_tool_script(
    script_name: str,
    args: Sequence[str],
    *,
    repo_root: Path,
    operation: str,
    timeout_seconds: int = 60,
) -> dict[str, Any]:
    """Run a tool-local helper script and return a bounded command result."""

    script = tool_impl_tools_root() / script_name
    if not script.exists():
        return {
            "status": "missing_tool_impl_script",
            "operation": operation,
            "script": str(script),
            "repo_root": str(repo_root),
            "tool_impl_root": str(tool_impl_root()),
        }
    uv = shutil.which("uv")
    command = [uv, "run", "--no-project", "--script", str(script), *args] if uv and script_declares_dependencies(script) else [sys.executable, str(script), *args]
    cwd = repo_root if repo_root.exists() else package_root()
    slot_info: dict[str, Any] | None = None
    try:
        with worker_tool_slot(repo_root, operation, default_concurrency=_tool_concurrency_default(operation)) as acquired_slot:
            slot_info = acquired_slot
            proc = subprocess.Popen(
                command,
                cwd=cwd,
                env=tool_env(repo_root),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=os.name != "nt",
            )
            try:
                stdout, stderr = proc.communicate(timeout=timeout_seconds)
            except subprocess.TimeoutExpired:
                if os.name == "nt":
                    proc.terminate()
                else:
                    with contextlib.suppress(ProcessLookupError):
                        os.killpg(proc.pid, signal.SIGTERM)
                try:
                    stdout, stderr = proc.communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    if os.name == "nt":
                        proc.kill()
                    else:
                        with contextlib.suppress(ProcessLookupError):
                            os.killpg(proc.pid, signal.SIGKILL)
                    stdout, stderr = proc.communicate()
                return command_payload(
                    operation=operation,
                    command=command,
                    cwd=cwd,
                    repo_root=repo_root,
                    exit_code=None,
                    stdout=stdout or "",
                    stderr=stderr or "",
                    status="timed_out",
                    extra={"timeout_seconds": timeout_seconds, "tool_queue": slot_info},
                )
    except ToolQueueBusy as error:
        slot_info = error.info
        return command_payload(
            operation=operation,
            command=command,
            cwd=cwd,
            repo_root=repo_root,
            exit_code=None,
            stdout="",
            stderr="source_permuter slots are full; skipped instead of waiting in the queue",
            status="queue_busy",
            extra={
                "retryable": True,
                "message": "source_permuter slots are full; continue with cheaper analysis or validation instead of waiting",
                "tool_queue": slot_info,
            },
        )
    except OSError as error:
        return command_payload(
            operation=operation,
            command=command,
            cwd=cwd,
            repo_root=repo_root,
            exit_code=None,
            stdout="",
            stderr=str(error),
            status="spawn_failed",
            extra={"tool_queue": slot_info} if slot_info is not None else None,
        )
    return command_payload(
        operation=operation,
        command=command,
        cwd=cwd,
        repo_root=repo_root,
        exit_code=proc.returncode,
        stdout=stdout,
        stderr=stderr,
        extra={"tool_queue": slot_info} if slot_info is not None else None,
    )


def import_tool_module(module_name: str, repo_root: Path) -> Any:
    """Import one tool-local helper module after binding the project root."""

    os.environ["ORCH_PROJECT_REPO_ROOT"] = str(repo_root)
    tools_root = str(tool_impl_tools_root())
    m2c_root = str(tool_impl_root() / "m2c")
    for path in (tools_root, m2c_root):
        if path not in sys.path:
            sys.path.insert(0, path)
    return importlib.import_module(module_name)


@contextlib.contextmanager
def captured_stdio() -> Iterable[tuple[io.StringIO, io.StringIO]]:
    """Capture stdout/stderr from imported helper calls."""

    stdout = io.StringIO()
    stderr = io.StringIO()
    with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
        yield stdout, stderr


def tool_impl_status(
    *,
    tool: str,
    scripts: Sequence[str],
    repo_root: Path,
    required_paths: Sequence[str] = (),
    optional_paths: Sequence[str] = (),
    message: str,
) -> dict[str, Any]:
    """Report tool-local implementation availability without heavy work."""

    script_status = [
        {
            "script": script,
            "path": str(tool_impl_tools_root() / script),
            "exists": (tool_impl_tools_root() / script).exists(),
        }
        for script in scripts
    ]
    required = [
        {"path": path, "absolute_path": str(repo_root / path), "exists": (repo_root / path).exists()}
        for path in required_paths
    ]
    optional = [
        {"path": path, "absolute_path": str(repo_root / path), "exists": (repo_root / path).exists()}
        for path in optional_paths
    ]
    missing_required = [item["path"] for item in required if not item["exists"]]
    missing_scripts = [item["script"] for item in script_status if not item["exists"]]
    return {
        "tool": tool,
        "status": "ok" if not missing_scripts and not missing_required else "missing_prerequisite",
        "operation_mode": "tool_local_impl",
        "repo_root": str(repo_root),
        "repo_root_exists": repo_root.exists(),
        "looks_like_project_repo": looks_like_project_repo(repo_root),
        "toolpack_root": str(tools_resource_root()),
        "tool_impl_root": str(tool_impl_root()),
        "tool_impl_root_exists": tool_impl_root().exists(),
        "shared_data_root": os.environ.get("ORCH_TOOL_SHARED_DATA_ROOT"),
        "worktree_cache_root": os.environ.get("ORCH_TOOL_WORKTREE_CACHE_ROOT"),
        "scripts": script_status,
        "required_paths": required,
        "optional_paths": optional,
        "missing_scripts": missing_scripts,
        "missing_required_paths": missing_required,
        "message": message,
    }


def print_json(payload: dict[str, Any]) -> None:
    """Emit a deterministic JSON payload for Pi tool consumption."""

    print(json.dumps(payload, indent=2, sort_keys=True))
