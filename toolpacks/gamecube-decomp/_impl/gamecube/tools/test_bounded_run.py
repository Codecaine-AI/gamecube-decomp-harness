"""Deadline, output caps, file caps and the compile_in overrides (no MWCC needed)."""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import bounded_run  # noqa: E402
import stack_check  # noqa: E402


def script(path: Path, body: str) -> Path:
    path.write_text("#!/bin/sh\n" + body)
    path.chmod(0o755)
    return path


def alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def test_deadline_kills_the_whole_process_group(tmp_path: Path) -> None:
    pidfile = tmp_path / "child.pid"
    # The leader forks a grandchild that would outlive a plain kill of the leader.
    leader = script(tmp_path / "leader.sh", f"sleep 60 & echo $! > {pidfile}\nwait\n")
    started = time.monotonic()
    result = bounded_run.run_bounded([str(leader)], cwd=tmp_path, timeout=0.5)
    assert result.timed_out and result.returncode is None
    assert time.monotonic() - started < 5
    child = int(pidfile.read_text())
    deadline = time.monotonic() + 3
    while alive(child) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not alive(child)


def test_children_left_by_a_finished_leader_are_reaped(tmp_path: Path) -> None:
    pidfile = tmp_path / "child.pid"
    leader = script(tmp_path / "leader.sh", f"sleep 60 & echo $! > {pidfile}\nexit 0\n")
    result = bounded_run.run_bounded([str(leader)], cwd=tmp_path, timeout=10)
    assert result.returncode == 0 and not result.timed_out
    child = int(pidfile.read_text())
    deadline = time.monotonic() + 3
    while alive(child) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not alive(child)


def test_output_cap_truncates_each_stream(tmp_path: Path) -> None:
    noisy = script(tmp_path / "noisy.sh", "yes x | head -c 100000\nyes e | head -c 100000 >&2\n")
    result = bounded_run.run_bounded([str(noisy)], cwd=tmp_path, output_cap=1000)
    assert result.returncode == 0
    assert len(result.stdout) == 1000 and len(result.stderr) == 1000
    assert result.output_truncated


def test_file_cap_kills_a_runaway_trace(tmp_path: Path) -> None:
    trace = tmp_path / "trace.jsonl"
    writer = script(tmp_path / "writer.sh", f"while true; do echo '{{\"v\":1}}' >> {trace}; done\n")
    result = bounded_run.run_bounded([str(writer)], cwd=tmp_path, timeout=20, file_caps=[(trace, 4096)])
    assert result.limit_exceeded and "trace.jsonl" in result.limit_exceeded
    assert result.returncode is None and not result.timed_out


def test_a_fast_exit_still_honours_the_file_cap(tmp_path: Path) -> None:
    # Review D r2: a process writing past the cap and exiting before the first poll passed.
    trace = tmp_path / "trace.jsonl"
    writer = script(tmp_path / "writer.sh", f"head -c 10000 /dev/zero > {trace}\n")
    result = bounded_run.run_bounded([str(writer)], cwd=tmp_path, timeout=20, file_caps=[(trace, 4096)])
    assert result.limit_exceeded and "trace.jsonl" in result.limit_exceeded
    assert result.returncode is None


def test_env_is_merged_over_the_environment(tmp_path: Path) -> None:
    echo = script(tmp_path / "env.sh", 'echo "$MWCC_TRACE_OUT|$PATH"\n')
    result = bounded_run.run_bounded([str(echo)], cwd=tmp_path, env={"MWCC_TRACE_OUT": "/x/t.jsonl"})
    out, path = result.stdout.strip().split("|")
    assert out == "/x/t.jsonl" and path == os.environ["PATH"]


class FakeRepo:
    def __init__(self, root: Path, runner: Path, rule: str = "mwcc") -> None:
        self.root = root
        self.runner = str(runner)
        self.edges = {"o.o": type("E", (), {"rule": rule, "src": "a.c", "mw_version": "GC/1.2.5",
                                            "cflags": "-O4", "extab_padding": None})()}


def test_compile_in_compiler_override_env_and_trace_cap(tmp_path: Path) -> None:
    # The fake runner records its argv and env, then writes the object.
    runner = script(tmp_path / "runner.sh",
                    'echo "$@" > argv.txt\necho "$MWCC_CACHE_DISABLE" > env.txt\n'
                    'while [ "$1" != "-o" ]; do shift; done\necho obj > "$2"\n')
    unit = stack_check.Unit("u", "o.o", "t.o", "a.c")
    traced = tmp_path / "traced" / "mwcceppc.exe"
    res = stack_check.compile_in(FakeRepo(tmp_path, runner), tmp_path, unit, tmp_path / "out.o",
                                 compiler=traced, env={"MWCC_CACHE_DISABLE": "1"})
    assert res.ok, res.error
    argv = (tmp_path / "argv.txt").read_text().split()
    assert argv[0] == str(traced) and argv[-3:] == ["a.c", "-o", str(tmp_path / "out.o")]
    assert (tmp_path / "env.txt").read_text().strip() == "1"

    stock = stack_check.compile_in(FakeRepo(tmp_path, runner), tmp_path, unit, tmp_path / "out2.o")
    assert stock.ok
    assert (tmp_path / "argv.txt").read_text().split()[0] == str(tmp_path / "build/compilers/GC/1.2.5/mwcceppc.exe")


def test_compile_in_reports_a_trace_over_its_cap(tmp_path: Path) -> None:
    trace = tmp_path / "trace.jsonl"
    runner = script(tmp_path / "runner.sh", f"while true; do echo line >> {trace}; done\n")
    unit = stack_check.Unit("u", "o.o", "t.o", "a.c")
    res = stack_check.compile_in(FakeRepo(tmp_path, runner), tmp_path, unit, tmp_path / "out.o",
                                 timeout=20, file_caps=[(trace, 2048)])
    assert not res.ok and "exceeded 2048 bytes" in res.error
    assert not (tmp_path / "out.o").exists()


def load_ninja_compile(root: Path):
    """ninja_compile binds its repo root at import; load a private copy for `root`."""
    import importlib.util

    previous = os.environ.get("ORCH_GAME_REPO_ROOT")
    os.environ["ORCH_GAME_REPO_ROOT"] = str(root)
    try:
        name = f"ninja_compile_bounded_{time.time_ns()}"
        spec = importlib.util.spec_from_file_location(name, TOOLS / "ninja_compile.py")
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module  # dataclasses resolve annotations through sys.modules
        spec.loader.exec_module(module)
        return module
    finally:
        if previous is None:
            os.environ.pop("ORCH_GAME_REPO_ROOT", None)
        else:
            os.environ["ORCH_GAME_REPO_ROOT"] = previous


def test_a_stalled_extab_cleaner_is_killed_at_the_compile_deadline(tmp_path: Path) -> None:
    runner = script(tmp_path / "runner.sh", 'while [ "$1" != "-o" ]; do shift; done\necho obj > "$2"\n')
    pidfile = tmp_path / "dtk.pid"
    dtk = tmp_path / "build/tools/dtk"
    dtk.parent.mkdir(parents=True)
    script(dtk, f"echo $$ > {pidfile}\nexec sleep 60\n")
    repo = FakeRepo(tmp_path, runner, rule="mwcc_extab")
    repo.nc = load_ninja_compile(tmp_path)
    unit = stack_check.Unit("u", "o.o", "t.o", "a.c")
    started = time.monotonic()
    res = stack_check.compile_in(repo, tmp_path, unit, tmp_path / "out.o", timeout=2)
    assert time.monotonic() - started < 10
    assert not res.ok and "deadline" in res.error and not (tmp_path / "out.o").exists()
    pid = int(pidfile.read_text())
    deadline = time.monotonic() + 3
    while alive(pid) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not alive(pid)


def test_direct_compile_passes_its_deadline_to_the_extab_cleaner(tmp_path: Path) -> None:
    (tmp_path / "src").mkdir()
    (tmp_path / "src/a.c").write_text("int x;\n")
    (tmp_path / "build.ninja").write_text("build build/GALE01/src/a.o: mwcc_extab src/a.c\n"
                                          "  mw_version = GC/1.2.5\n  cflags = -O4\n")
    compiler = tmp_path / "build/compilers/GC/1.2.5/mwcceppc.exe"
    compiler.parent.mkdir(parents=True)
    compiler.write_bytes(b"stub")
    runner = script(tmp_path / "runner.sh", 'shift\nwhile [ "$1" != "-o" ]; do shift; done\necho obj > "$2"\n')
    dtk = tmp_path / "build/tools/dtk"
    dtk.parent.mkdir(parents=True)
    pidfile = tmp_path / "dtk.pid"
    script(dtk, f"echo $$ > {pidfile}\nexec sleep 60\n")
    previous = os.environ.get("MWCC_WIBO")
    os.environ["MWCC_WIBO"] = str(runner)
    try:
        nc = load_ninja_compile(tmp_path)
        started = time.monotonic()
        compiled = nc.direct_compile("a", quiet=False, timeout=2)
    finally:
        if previous is None:
            os.environ.pop("MWCC_WIBO", None)
        else:
            os.environ["MWCC_WIBO"] = previous
    assert compiled is None
    assert time.monotonic() - started < 10
    pid = int(pidfile.read_text())  # the compile succeeded and the cleaner ran
    deadline = time.monotonic() + 3
    while alive(pid) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert not alive(pid)
