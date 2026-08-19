# Venom platform-field runtime audit report

Game: GALE01 rev2 (SSBM NTSC 1.02)  
Refactor commit:
[`079bee437`](https://github.com/MarkMcCaskey/melee/commit/079bee437e70819ac6932cae51cfc1b27dedcb82)  
Runner: local `dolphin-dap` headless build using Dolphin's stock GDB stub

## Result: PASS

| claim | runtime evidence | result |
|---|---|---|
| Special Venom path loaded | external `0xE4`, internal `15` | PASS |
| `target_gobj` | field `0x80E4D360` equaled `stage_info.map_gobjs[0]` `0x80E4D360` | PASS |
| Target follows platform | target JObj `0x80E4E760` and platform JObj `0x80E5AE40` had identical local translations | PASS |
| `upper_jobj` / `lower_jobj` | `0x80E4E940`, y `6.567606` > `0x80E4E9E0`, y `-41.574287` | PASS |
| Signed timer lifecycle | mask `0x1F`: observed `-1`, `1`, `59`, `60`, and `>=61`; maximum `61` | PASS |
| Smash-taunt trigger | dialogue GObj `0x80F99EC0` first appeared at timer `60` | PASS |

The controller hook ran 145 times in the captured run. The logger only read
the platform payload and related live engine state; it did not write the
target, timer, joints, or dialogue object.
