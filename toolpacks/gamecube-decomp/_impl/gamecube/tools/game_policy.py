"""Per-game matching policy shared by the gamecube-decomp tools.

`match_frame` (Melee) lets tools suggest fixes for stack frame size.
`stop_at_frame` (SMS) treats a function whose only difference from the target
is frame size or r1 stack offsets as done, and bans edits whose only effect is
the stack frame (padding, operand swaps, inline picks, alignment tricks).

The harness sets ORCH_STACK_FRAME_POLICY from games/<id>/game.json
(`matching.stackFramePolicy`). Without it, the game directory's game.json is
read; without either, the policy is `match_frame`.

`steeringGate` (`off` | `shadow` | `enforce`) says whether the steering gate
(steering_check.py) runs: it reverts behaviour-identical source edits and
only credits what survives. ORCH_STEERING_GATE overrides game.json; the
default is `off`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

MATCH_FRAME = "match_frame"
STOP_AT_FRAME = "stop_at_frame"
STACK_FRAME_POLICIES = (MATCH_FRAME, STOP_AT_FRAME)


STEERING_OFF = "off"
STEERING_SHADOW = "shadow"
STEERING_ENFORCE = "enforce"
STEERING_GATE_MODES = (STEERING_OFF, STEERING_SHADOW, STEERING_ENFORCE)


def _game_matching(env: dict[str, str]) -> dict:
    game_dir = env.get("ORCH_GAME_DIR", "").strip()
    if not game_dir:
        return {}
    try:
        data = json.loads((Path(game_dir) / "game.json").read_text())
    except (OSError, ValueError):
        return {}
    matching = data.get("matching") if isinstance(data, dict) else None
    return matching if isinstance(matching, dict) else {}


def stack_frame_policy(env: dict[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    explicit = env.get("ORCH_STACK_FRAME_POLICY", "").strip()
    if explicit in STACK_FRAME_POLICIES:
        return explicit
    policy = _game_matching(env).get("stackFramePolicy")
    if policy in STACK_FRAME_POLICIES:
        return policy
    return MATCH_FRAME


def stops_at_frame(env: dict[str, str] | None = None) -> bool:
    return stack_frame_policy(env) == STOP_AT_FRAME


def steering_gate(env: dict[str, str] | None = None) -> str:
    """`off` | `shadow` | `enforce`: ORCH_STEERING_GATE, then game.json."""
    env = os.environ if env is None else env
    explicit = env.get("ORCH_STEERING_GATE", "").strip()
    if explicit in STEERING_GATE_MODES:
        return explicit
    mode = _game_matching(env).get("steeringGate")
    if mode in STEERING_GATE_MODES:
        return mode
    return STEERING_OFF


def steering_gate_active(env: dict[str, str] | None = None) -> bool:
    return steering_gate(env) != STEERING_OFF


def _game_json(env: dict[str, str]) -> dict:
    game_dir = env.get("ORCH_GAME_DIR", "").strip()
    if not game_dir:
        return {}
    try:
        data = json.loads((Path(game_dir) / "game.json").read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def link_map_required(env: dict[str, str] | None = None) -> bool:
    """Is the original link map (`orig/<ver>/files/*.MAP`) required for the
    steering gate's UNUSED rule? ORCH_LINK_MAP_REQUIRED (1/0) wins; else
    game.json `matching.linkMap` (`required` | `optional`); else games of kind
    `doldecomp-sms` (SMS ships mario.MAP) require it. When required and the
    gate is active, a unit without map coverage leaves the analysis incomplete."""
    env = os.environ if env is None else env
    explicit = env.get("ORCH_LINK_MAP_REQUIRED", "").strip().lower()
    if explicit in ("1", "true", "yes", "required"):
        return True
    if explicit in ("0", "false", "no", "optional"):
        return False
    data = _game_json(env)
    mode = (data.get("matching") or {}).get("linkMap") if isinstance(data.get("matching"), dict) else None
    if mode in ("required", "optional"):
        return mode == "required"
    return str(data.get("kind") or "").startswith("doldecomp-sms") and steering_gate(env) != STEERING_OFF
