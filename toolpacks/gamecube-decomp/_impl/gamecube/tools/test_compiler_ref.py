"""Tests for the pinned MWCC compiler source: fetch_mwcc_ref.sh, compiler_ref.py
and `evidence_search.py compiler`. Network-free: the fetch tests clone a local
fixture repo through --source."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import compiler_ref  # noqa: E402

PIN = "92f893fbcbb23d9833be5fc24ac9e069090f8729"
NATIVE_PIN = TOOLS.parents[2] / "compiler" / "mwcc_alloc" / "native" / "PIN"


def _git(cwd: Path, *args: str) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["git", *args], cwd=cwd, env=env, check=True, capture_output=True, text=True).stdout.strip()


def _write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


COLORING = "\n".join([
    "static void simplify(void) {",
    "    if (node->degree < MaxDegree) {",
    "        push(node);",
    "    }",
    "}",
]) + "\n"


def _source_tree(root: Path) -> None:
    _write(root, "src/backend/Coloring.c", COLORING)
    _write(root, "src/backend/Scheduler.c", "int MaxDegree_unused;\n")
    _write(root, "include/compiler/Coloring.h", "extern int MaxDegree;\n")
    _write(root, "config/GC_1_2_5/symbols.txt", "MaxDegree = .data:0x0;\n")


@pytest.fixture
def upstream(tmp_path: Path) -> tuple[Path, str]:
    repo = tmp_path / "upstream"
    repo.mkdir()
    _git(repo, "init", "-q")
    _source_tree(repo)
    _git(repo, "add", ".")
    _git(repo, "commit", "-q", "-m", "fixture")
    return repo, _git(repo, "rev-parse", "HEAD")


def _lock(tmp_path: Path, commit: str) -> Path:
    path = tmp_path / "lock.json"
    path.write_text(json.dumps({"mwcc": {"repo": "https://github.com/rayanht/mwcc", "commit": commit, "paths": ["src", "include"]}}))
    return path


def _fetch(lock: Path, *args: str, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["bash", str(TOOLS / "fetch_mwcc_ref.sh"), *args],
        env={**os.environ, **(env or {}), "MWCC_REF_LOCK": str(lock)}, capture_output=True, text=True, check=False,
    )


def test_lock_pins_rayanht_mwcc() -> None:
    entry = json.loads((TOOLS / "mwcc_ref.lock.json").read_text())["mwcc"]
    assert entry == {"repo": "https://github.com/rayanht/mwcc", "commit": PIN, "paths": ["src", "include"]}
    # The traced compilers (compiler/mwcc_alloc/native) build from the same commit.
    if NATIVE_PIN.is_file():
        assert PIN in NATIVE_PIN.read_text()


def test_fetch_places_sparse_pinned_checkout_and_is_idempotent(upstream, tmp_path: Path) -> None:
    repo, commit = upstream
    lock = _lock(tmp_path, commit)
    state = tmp_path / "state"
    first = _fetch(lock, "--source", str(repo), env={"ORCH_GAME_STATE_DIR": str(state)})
    assert first.returncode == 0, first.stderr
    dest = state / "refs" / "mwcc"
    assert (dest / "src" / "backend" / "Coloring.c").read_text() == COLORING
    assert (dest / "include" / "compiler" / "Coloring.h").is_file()
    assert not (dest / "config").exists()
    assert json.loads((dest / ".mwcc-ref").read_text())["commit"] == commit
    assert compiler_ref.ref_commit(dest) == commit
    again = _fetch(lock, "--source", str(repo), str(dest))
    assert again.returncode == 0 and "already at" in again.stdout


def test_fetch_strip_git_for_images_keeps_stamp(upstream, tmp_path: Path) -> None:
    repo, commit = upstream
    dest = tmp_path / "opt" / "mwcc"
    proc = _fetch(_lock(tmp_path, commit), "--strip-git", "--source", str(repo), str(dest))
    assert proc.returncode == 0, proc.stderr
    assert not (dest / ".git").exists()
    assert compiler_ref.ref_commit(dest) == commit
    assert oct(dest.stat().st_mode & 0o777) == "0o755"


def test_fetch_replaces_a_checkout_at_another_commit(upstream, tmp_path: Path) -> None:
    repo, commit = upstream
    dest = tmp_path / "mwcc"
    dest.mkdir()
    (dest / ".mwcc-ref").write_text(json.dumps({"commit": "0" * 40}))
    proc = _fetch(_lock(tmp_path, commit), "--source", str(repo), str(dest))
    assert proc.returncode == 0, proc.stderr
    assert compiler_ref.ref_commit(dest) == commit


def test_fetch_fails_on_unknown_commit(upstream, tmp_path: Path) -> None:
    repo, _ = upstream
    dest = tmp_path / "mwcc"
    proc = _fetch(_lock(tmp_path, "1" * 40), "--source", str(repo), str(dest))
    assert proc.returncode != 0
    assert not dest.exists()
    assert not list(tmp_path.glob(".mwcc.*"))


def test_fetch_needs_a_destination(tmp_path: Path) -> None:
    env = {k: v for k, v in os.environ.items() if k != "ORCH_GAME_STATE_DIR"}
    proc = subprocess.run(["bash", str(TOOLS / "fetch_mwcc_ref.sh")], env=env, capture_output=True, text=True, check=False)
    assert proc.returncode == 2 and "usage" in proc.stderr


@pytest.fixture
def source_root(tmp_path: Path) -> Path:
    root = tmp_path / "mwcc"
    _source_tree(root)
    (root / ".mwcc-ref").write_text(json.dumps({"commit": PIN}))
    return root


def test_search_reports_file_line_hits_src_first(source_root: Path) -> None:
    result = compiler_ref.search("MaxDegree", root=source_root)
    assert result["available"] and result["pinned"] and result["commit"] == PIN
    assert [(hit["file"], hit["line"]) for hit in result["hits"]] == [
        ("src/backend/Coloring.c", 2), ("src/backend/Scheduler.c", 1), ("include/compiler/Coloring.h", 1),
    ]
    assert result["hits"][0]["text"] == "if (node->degree < MaxDegree) {"
    assert result["total"] == 3 and "truncated" not in result
    # config/ is not source.
    assert all(not hit["file"].startswith("config/") for hit in result["hits"])


def test_search_path_filter_context_and_case_fold(source_root: Path) -> None:
    by_name = compiler_ref.search("maxdegree", root=source_root, path="Coloring.c", context=1)
    assert by_name["case_sensitive"] is False
    assert [hit["file"] for hit in by_name["hits"]] == ["src/backend/Coloring.c"]
    assert by_name["hits"][0]["context"].splitlines() == [
        "static void simplify(void) {", "    if (node->degree < MaxDegree) {", "        push(node);",
    ]
    assert [h["file"] for h in compiler_ref.search("MaxDegree", root=source_root, path="src/backend")["hits"]] == [
        "src/backend/Coloring.c", "src/backend/Scheduler.c",
    ]
    globbed = compiler_ref.search("MaxDegree", root=source_root, path="src/*/Sched*.c")
    assert [h["file"] for h in globbed["hits"]] == ["src/backend/Scheduler.c"]


def test_search_is_bounded(source_root: Path) -> None:
    _write(source_root, "src/backend/Big.c", "node\n" * 500)
    _write(source_root, "src/frontend/CInline.c", "node\n" * 3)
    result = compiler_ref.search("node", root=source_root, limit=10)
    assert result["total"] == 505 and result["truncated"] is True
    # At most 5 per file without a path filter, so other files still show.
    files = [hit["file"] for hit in result["hits"]]
    assert files.count("src/backend/Big.c") == 5 and "src/frontend/CInline.c" in files
    assert result["files"][0] == {"file": "src/backend/Big.c", "hits": 500}
    narrowed = compiler_ref.search("node", root=source_root, path="Big.c", limit=50, context=8)
    assert narrowed["shown"] <= 50
    assert sum(len(h["text"]) + len(h.get("context", "")) for h in narrowed["hits"]) <= compiler_ref.OUTPUT_BUDGET + 300


def test_root_resolution_prefers_a_pinned_root(source_root: Path, tmp_path: Path, monkeypatch) -> None:
    stale = tmp_path / "games" / "sms" / "workspace" / "mwcc"
    _source_tree(stale)
    (stale / ".mwcc-ref").write_text(json.dumps({"commit": "2" * 40}))
    state = tmp_path / "state"
    shutil.copytree(source_root, state / "refs" / "mwcc")
    monkeypatch.setattr(compiler_ref, "SANDBOX_ROOT", tmp_path / "no-opt")
    monkeypatch.setenv("ORCH_GAME_STATE_DIR", str(state))
    monkeypatch.delenv("ORCH_MWCC_SOURCE_ROOT", raising=False)
    checkout = stale.parent / "checkout"
    found = compiler_ref.resolve_root(repo=checkout)
    assert found["origin"] == "host_ref" and found["pinned"] is True
    # Only an unpinned root: searched, with a warning.
    monkeypatch.delenv("ORCH_GAME_STATE_DIR")
    result = compiler_ref.search("MaxDegree", repo=checkout)
    assert result["origin"] == "checkout_sibling" and result["pinned"] is False and "pin_warning" in result
    # The sandbox copy wins over the host ref.
    monkeypatch.setattr(compiler_ref, "SANDBOX_ROOT", source_root)
    monkeypatch.setenv("ORCH_GAME_STATE_DIR", str(state))
    assert compiler_ref.resolve_root(repo=checkout)["origin"] == "sandbox"


def test_cli_compiler_command(source_root: Path, tmp_path: Path) -> None:
    env = {**os.environ, "ORCH_MWCC_SOURCE_ROOT": str(source_root), "ORCH_GAME_HOST_REPO_ROOT": str(tmp_path / "none")}
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "evidence_search.py"), "compiler", "--query", "MaxDegree", "--path", "Coloring.c", "--json"],
        env=env, capture_output=True, text=True, check=False,
    )
    assert proc.returncode == 0, proc.stderr
    payload = json.loads(proc.stdout)
    assert payload["status"] == "ok" and payload["command"] == "compiler" and payload["origin"] == "env"
    assert payload["hits"][0]["file"] == "src/backend/Coloring.c" and payload["hits"][0]["line"] == 2

    env = {k: v for k, v in env.items() if k not in ("ORCH_MWCC_SOURCE_ROOT", "ORCH_GAME_STATE_DIR")}
    env["ORCH_GAME_HOST_REPO_ROOT"] = str(tmp_path / "elsewhere" / "checkout")
    proc = subprocess.run(
        [sys.executable, str(TOOLS / "evidence_search.py"), "compiler", "--query", "x", "--compiler-root", str(tmp_path / "none"), "--json"],
        env=env, capture_output=True, text=True, check=False,
    )
    payload = json.loads(proc.stdout)
    if not (Path("/opt/mwcc") / "src").is_dir():
        assert proc.returncode == 0 and payload["status"] == "unavailable"
        assert "fetch_mwcc_ref.sh" in payload["fetch_hint"] and payload["pin"] == PIN
