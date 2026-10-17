"""steering_check: cgroup CPU quota clamps the MWCC jobs, the MWCC deadline bounds each compile."""

from __future__ import annotations

import sys
import time
import types
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import stack_check  # noqa: E402
import steering_check as sc  # noqa: E402


def write(root: Path, rel: str, text: str) -> None:
    (root / rel).parent.mkdir(parents=True, exist_ok=True)
    (root / rel).write_text(text)


def limit(root: Path, proc: str | None = None) -> int | None:
    proc_file = root.parent / "proc-cgroup"
    if proc is None:
        proc_file.unlink(missing_ok=True)
    else:
        proc_file.write_text(proc)
    return sc.cgroup_cpu_limit(root, proc_file)


@pytest.mark.parametrize("cpu_max, expected", [
    ("200000 100000\n", 2),
    ("150000 100000\n", 2),  # partial CPUs round up
    ("100000 100000\n", 1),
    ("max 100000\n", None),
    ("garbage\n", None),
    ("abc 100000\n", None),
])
def test_cgroup_v2_cpu_max(tmp_path: Path, cpu_max: str, expected) -> None:
    write(tmp_path, "cpu.max", cpu_max)
    assert limit(tmp_path) == expected


@pytest.mark.parametrize("prefix", ["cpu/", ""])
def test_cgroup_v1_quota(tmp_path: Path, prefix: str) -> None:
    write(tmp_path, prefix + "cpu.cfs_quota_us", "250000\n")
    write(tmp_path, prefix + "cpu.cfs_period_us", "100000\n")
    assert limit(tmp_path) == 3


@pytest.mark.parametrize("quota, period", [("-1", "100000"), ("x", "100000"), ("100000", "0")])
def test_cgroup_v1_unlimited_or_malformed(tmp_path: Path, quota: str, period: str) -> None:
    write(tmp_path, "cpu/cpu.cfs_quota_us", quota + "\n")
    write(tmp_path, "cpu/cpu.cfs_period_us", period + "\n")
    assert limit(tmp_path) is None


def test_cgroup_unreadable_is_unlimited(tmp_path: Path) -> None:
    assert limit(tmp_path) is None
    assert limit(tmp_path / "missing") is None
    write(tmp_path, "cpu/cpu.cfs_quota_us", "100000\n")  # period missing
    assert limit(tmp_path) is None


def test_nested_v2_child_quota_wins(tmp_path: Path) -> None:
    root = tmp_path / "cg"
    write(root, "cpu.max", "max 100000\n")
    write(root, "worker/cpu.max", "max 100000\n")
    write(root, "worker/job/cpu.max", "100000 100000\n")
    assert limit(root, "0::/worker/job\n") == 1


def test_nested_v2_ancestor_quota_applies(tmp_path: Path) -> None:
    root = tmp_path / "cg"
    write(root, "cpu.max", "200000 100000\n")
    write(root, "worker/cpu.max", "max 100000\n")
    assert limit(root, "0::/worker\n") == 2


def test_v2_container_root_and_host_path_outside_the_namespace(tmp_path: Path) -> None:
    root = tmp_path / "cg"
    write(root, "cpu.max", "100000 100000\n")
    assert limit(root, "0::/\n") == 1
    assert limit(root, "0::/docker/abc123\n") == 1  # not visible here -> container root


def test_proc_cgroup_missing_falls_back_to_the_root(tmp_path: Path) -> None:
    root = tmp_path / "cg"
    write(root, "cpu.max", "300000 100000\n")
    write(root, "worker/cpu.max", "100000 100000\n")
    assert limit(root) == 3


@pytest.mark.parametrize("mount", ["cpu,cpuacct", "cpuacct,cpu"])
def test_cgroup_v1_combined_mount(tmp_path: Path, mount: str) -> None:
    root = tmp_path / "cg"
    write(root, f"{mount}/cpu.cfs_quota_us", "-1\n")
    write(root, f"{mount}/cpu.cfs_period_us", "100000\n")
    write(root, f"{mount}/job/cpu.cfs_quota_us", "100000\n")
    write(root, f"{mount}/job/cpu.cfs_period_us", "100000\n")
    assert limit(root, f"4:{mount}:/job\n0::/\n") == 1
    assert limit(root) is None  # without the proc path only the (unlimited) mount root is seen


@pytest.mark.parametrize("requested, cap, expected", [
    (3, None, 3), (8, None, 3), (0, None, 1),
    (3, 1, 1), (3, 2, 2), (8, 16, 3), (1, 4, 1),
])
def test_clamp_jobs(monkeypatch, requested: int, cap, expected: int) -> None:
    monkeypatch.setattr(sc, "cgroup_cpu_limit", lambda *a, **k: cap)
    assert sc.clamp_jobs(requested) == expected


def test_cli_jobs_follow_the_cgroup_quota(monkeypatch) -> None:
    monkeypatch.setattr(sc, "cgroup_cpu_limit", lambda *a, **k: 1)
    seen = []
    monkeypatch.setattr(sc, "cmd_mwcc", lambda args: seen.append(args.jobs) or 0)
    argv = ["mwcc", "--repo", "/nonexistent", "--base-ref", "HEAD", "--edits-hash", "x", "--jobs", "3"]
    assert sc.main(argv) == 0 and seen == [1]


def test_worker_gate_mwcc_argv_contract(monkeypatch) -> None:
    """The exact argv the worker steering gate (apps/server steering-check.ts) sends; a flag
    rename here would break every enforced gate."""
    monkeypatch.setattr(sc, "cgroup_cpu_limit", lambda *a, **k: None)  # host without a quota
    seen = []
    monkeypatch.setattr(sc, "cmd_mwcc", lambda args: seen.append(args) or 0)
    argv = ["mwcc", "--repo", ".", "--base-ref", "0123abc", "--edits-hash", "h1",
            "--revert-edits", "a,b", "--attribute", "build/steering/attempt-1.reduce.json",
            "--functions", "f1,f2", "--jobs", "1", "--mwcc-budget-seconds", "42", "--json"]
    assert sc.main(argv) == 0
    [args] = seen
    assert args.jobs == 1 and args.mwcc_budget_seconds == 42 and args.json
    assert (args.repo, args.base_ref, args.edits_hash) == (".", "0123abc", "h1")
    assert args.revert_edits == ["a,b"] and args.functions == ["f1,f2"]
    assert args.attribute == "build/steering/attempt-1.reduce.json"


class RecordingPool:
    def __init__(self):
        self.timeouts: list = []

    def compile(self, unit_name, texts, label, timeout=None):
        self.timeouts.append(timeout)
        return types.SimpleNamespace(ok=True, obj=None, error="")


def backend(deadline) -> sc.RepoBackend:
    b = object.__new__(sc.RepoBackend)
    b.pool = RecordingPool()
    b.deadline = deadline
    b.compiles = 0
    b.compile_seconds = 0.0
    b._progress_lock = sc.threading.Lock()
    return b


UNIT = types.SimpleNamespace(name="u1")


def test_compile_timeout_is_bounded_by_the_deadline(monkeypatch) -> None:
    monkeypatch.setenv("ORCH_MWCC_COMPILE_TIMEOUT", "300")
    b = backend(time.time() + 20)
    assert b.compile(UNIT, {}, "c")[0]
    [t] = b.pool.timeouts
    assert 18 <= t <= 20


def test_compile_timeout_floor_is_one_second() -> None:
    b = backend(time.time() + 0.2)
    b.compile(UNIT, {}, "c")
    assert b.pool.timeouts == [1.0]


def test_compile_timeout_keeps_the_compile_ceiling_when_the_deadline_is_far(monkeypatch) -> None:
    monkeypatch.setenv("ORCH_MWCC_COMPILE_TIMEOUT", "30")
    b = backend(time.time() + 3600)
    b.compile(UNIT, {}, "c")
    assert b.pool.timeouts == [30.0]


def test_no_deadline_leaves_the_compile_default() -> None:
    b = backend(None)
    b.compile(UNIT, {}, "c")
    assert b.pool.timeouts == [None]


def test_past_deadline_does_not_compile() -> None:
    b = backend(time.time() - 1)
    ok, obj, err = b.compile(UNIT, {}, "c")
    assert not ok and "budget exceeded" in err and b.pool.timeouts == []


def test_shadow_compiler_threads_the_timeout_into_compile_in(monkeypatch, tmp_path: Path) -> None:
    (tmp_path / "r" / "src").mkdir(parents=True)
    repo = types.SimpleNamespace(root=tmp_path / "r", units={"u1": "UNIT"})
    seen = []
    monkeypatch.setattr(stack_check, "compile_in",
                        lambda repo, root, unit, out, timeout=None: seen.append((unit, timeout)) or "res")
    pool = sc.ShadowCompiler(repo, 1, str(tmp_path / "t"))
    try:
        assert pool.compile("u1", {}, "c", timeout=7.5) == "res"
        assert pool.compile("u1", {}, "c") == "res"
    finally:
        pool.close()
    assert seen == [("UNIT", 7.5), ("UNIT", None)]
