from pathlib import Path
import json
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import search_index
import toolpack_runtime


def test_game_paths_use_descriptor_and_local_override(tmp_path, monkeypatch):
    game = tmp_path / "games" / "other"
    (game / "config").mkdir(parents=True)
    (game / "game.json").write_text(json.dumps({"id": "other", "repoRoot": "workspace/custom", "tools": {"sharedDataRoot": "runtime/custom"}}))
    monkeypatch.setenv("ORCH_GAME_DIR", str(game))
    monkeypatch.delenv("ORCH_GAME_REPO_ROOT", raising=False)
    monkeypatch.chdir(tmp_path)
    assert toolpack_runtime.resolve_repo_root() == game / "workspace/custom"
    assert search_index.default_project_shared_data_root(tmp_path / "callgraph") == game / "runtime/custom/callgraph"
    (game / "config/local.json").write_text(json.dumps({"repoRoot": "workspace/local"}))
    assert toolpack_runtime.resolve_repo_root() == game / "workspace/local"


def test_fresh_and_legacy_game_paths_are_unambiguous(tmp_path, monkeypatch):
    monkeypatch.setenv("ORCH_GAME_DIR", str(tmp_path))
    monkeypatch.delenv("ORCH_GAME_REPO_ROOT", raising=False)
    monkeypatch.chdir(tmp_path)
    assert toolpack_runtime.resolve_repo_root() == tmp_path / "workspace/checkout"
    assert search_index.default_project_shared_data_root(tmp_path / "opseq") == tmp_path / "runtime/tool-data/opseq"
    (tmp_path / "checkout").mkdir()
    assert toolpack_runtime.resolve_repo_root() == tmp_path / "checkout"
    (tmp_path / "workspace/checkout").mkdir(parents=True)
    with pytest.raises(RuntimeError, match="Both canonical and legacy"):
        toolpack_runtime.resolve_repo_root()


def test_game_id_resolves_under_games(tmp_path, monkeypatch):
    monkeypatch.delenv("ORCH_GAME_DIR", raising=False)
    monkeypatch.setenv("ORCH_GAME_ID", "other")
    monkeypatch.setattr(search_index, "package_root_for_tool", lambda _: tmp_path)
    assert search_index.project_dir_for_tool(tmp_path) == tmp_path / "games/other"
