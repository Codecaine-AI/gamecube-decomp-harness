"""Per-game matching policy shared by the gamecube-decomp tools.

`match_frame` (Melee) lets tools suggest fixes for stack frame size.
`stop_at_frame` (SMS) treats a function whose only difference from the target
is frame size or r1 stack offsets as done, and bans edits whose only effect is
the stack frame (padding, operand swaps, inline picks, alignment tricks).

The harness sets ORCH_STACK_FRAME_POLICY from games/<id>/game.json
(`matching.stackFramePolicy`). Without it, the game directory's game.json is
read; without either, the policy is `match_frame`.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

MATCH_FRAME = "match_frame"
STOP_AT_FRAME = "stop_at_frame"
STACK_FRAME_POLICIES = (MATCH_FRAME, STOP_AT_FRAME)


def stack_frame_policy(env: dict[str, str] | None = None) -> str:
    env = os.environ if env is None else env
    explicit = env.get("ORCH_STACK_FRAME_POLICY", "").strip()
    if explicit in STACK_FRAME_POLICIES:
        return explicit
    game_dir = env.get("ORCH_GAME_DIR", "").strip()
    if game_dir:
        try:
            data = json.loads((Path(game_dir) / "game.json").read_text())
        except (OSError, ValueError):
            data = {}
        policy = (data.get("matching") or {}).get("stackFramePolicy")
        if policy in STACK_FRAME_POLICIES:
            return policy
    return MATCH_FRAME


def stops_at_frame(env: dict[str, str] | None = None) -> bool:
    return stack_frame_policy(env) == STOP_AT_FRAME
