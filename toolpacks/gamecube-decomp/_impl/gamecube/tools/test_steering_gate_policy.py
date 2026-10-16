"""Steering gate mode in game_policy: ORCH_STEERING_GATE, then game.json, default off."""

from __future__ import annotations

import json
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import game_policy  # noqa: E402


def game_dir(tmp_path: Path, matching: dict) -> str:
    (tmp_path / "game.json").write_text(json.dumps({"id": "x", "matching": matching}))
    return str(tmp_path)


def test_default_is_off() -> None:
    assert game_policy.steering_gate({}) == "off"
    assert not game_policy.steering_gate_active({})


def test_game_json_mode(tmp_path: Path) -> None:
    env = {"ORCH_GAME_DIR": game_dir(tmp_path, {"stackFramePolicy": "stop_at_frame", "steeringGate": "shadow"})}
    assert game_policy.steering_gate(env) == "shadow"
    assert game_policy.steering_gate_active(env)
    assert game_policy.stack_frame_policy(env) == "stop_at_frame"


def test_env_overrides_game_json(tmp_path: Path) -> None:
    env = {"ORCH_GAME_DIR": game_dir(tmp_path, {"steeringGate": "shadow"}), "ORCH_STEERING_GATE": "enforce"}
    assert game_policy.steering_gate(env) == "enforce"
    env["ORCH_STEERING_GATE"] = "off"
    assert game_policy.steering_gate(env) == "off"
    assert not game_policy.steering_gate_active(env)


def test_invalid_values_fall_back(tmp_path: Path) -> None:
    env = {"ORCH_GAME_DIR": game_dir(tmp_path, {"steeringGate": "on"}), "ORCH_STEERING_GATE": "bogus"}
    assert game_policy.steering_gate(env) == "off"
    (tmp_path / "game.json").write_text("not json")
    assert game_policy.steering_gate({"ORCH_GAME_DIR": str(tmp_path)}) == "off"


def test_melee_like_game_without_key_is_off(tmp_path: Path) -> None:
    env = {"ORCH_GAME_DIR": game_dir(tmp_path, {"stackFramePolicy": "match_frame"})}
    assert game_policy.steering_gate(env) == "off"
    assert game_policy.stack_frame_policy(env) == "match_frame"


def test_sms_game_json_is_valid() -> None:
    sms = TOOLS.parents[4] / "games" / "sms"
    if not (sms / "game.json").is_file():
        return
    assert game_policy.steering_gate({"ORCH_GAME_DIR": str(sms)}) in game_policy.STEERING_GATE_MODES
