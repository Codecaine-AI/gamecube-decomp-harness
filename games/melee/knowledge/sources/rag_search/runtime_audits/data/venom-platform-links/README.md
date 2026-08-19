# Venom platform-field runtime audit

This audit tests the semantic names introduced by the focused
`type-venom-platform-links` branch at
[`079bee437`](https://github.com/MarkMcCaskey/melee/commit/079bee437e70819ac6932cae51cfc1b27dedcb82).
Matching CI proves that the refactor preserves the DOL; this audit asks the
different question that CI cannot answer: do the four field names describe
what the live game actually does?

The result is **PASS**:

- `target_gobj` exactly equals the live stage object in
  `stage_info.map_gobjs[0]`. Its JObj translation also equals the platform
  object's JObj translation after the controller copies it.
- `upper_jobj` and `lower_jobj` are distinct valid JObjs. In the recorded run,
  their world-space Y values were `6.567606` and `-41.574287`.
- `smash_taunt_timer` was observed at its inactive value `-1`, its armed value
  `1`, immediately before and at the trigger (`59`, `60`), and after the
  trigger (`>=61`). The smash-taunt dialogue GObj first appeared at exactly
  `60`.

The committed [`REPORT.md`](REPORT.md) and [`audit.jsonl`](audit.jsonl) contain
the captured run.

## Machine audit

The runner uses only Python's standard library and stock Dolphin's built-in
GDB stub:

```sh
python3 audit_venom_platform.py \
  --dolphin /path/to/dolphin-emu-nogui \
  --iso /path/to/ssbm_rev2.iso \
  --dolphin-arg=--platform \
  --dolphin-arg=headless \
  --dolphin-arg=-v \
  --dolphin-arg=Null
```

The Gecko code boots a two-CPU match through the game's normal scene flow
with external stage ID `0xE4`. The shipped stage table maps that ID to internal
stage ID `15` (Venom), and Venom's own callback uses `0xE4` to arm this timer.
The Python side is read-only: it waits for the in-game logger to finish, reads
the 0x50-byte result block over GDB, validates every claim, and exits nonzero
on failure.

## Human verification without the Python runner

Copy [`audit.gecko.ini`](audit.gecko.ini) to Dolphin's `GameSettings/GALE01.ini`
or paste the code into the Gecko editor, enable cheats, and boot GALE01 rev2.
The code goes directly to the special Venom match. The Star Fox dialogue is
visible in-game when the timer reaches 60.

Open Dolphin's memory viewer at `0x8049FA50` to inspect the same evidence:

| offset | value |
|---:|---|
| `+00` | magic `0x56504C54` (`VPLT`) |
| `+04` | platform GObj |
| `+08` | platform `Ground*` |
| `+0C` | `target_gobj` |
| `+10` | current signed timer |
| `+14` / `+18` | upper / lower JObj |
| `+1C` | controller call count |
| `+20` | maximum positive timer observed |
| `+24` | timer-observation mask; `0x1F` means `-1, 1, 59, 60, >=61` all seen |
| `+28` / `+2C` | first dialogue GObj and timer when first seen |
| `+30` / `+34` | upper / lower world-space Y as `f32` |
| `+38` | live `stage_info.map_gobjs[0]` |
| `+3C` / `+40` | live external / internal stage IDs |
| `+44` / `+48` | target / platform JObjs |
| `+4C` | `1` when their local translations are identical |

Expected decisive values are:

```text
+00 = 56504C54
+0C = +38 != 0
+24 = 0000001F
+2C = 0000003C
+3C = 000000E4
+40 = 0000000F
+4C = 00000001
f32(+30) > f32(+34)
```

The code deliberately hijacks scene flow and is only for auditing.

## Why these observations support the names

The branch defines the four-word payload in
[`gr/types.h`](https://github.com/MarkMcCaskey/melee/blob/079bee437e70819ac6932cae51cfc1b27dedcb82/src/melee/gr/types.h#L503-L508).
The corresponding source shows:

- object 5 receives object 0 as its target
  ([`grvenom.c` lines 470–474](https://github.com/MarkMcCaskey/melee/blob/079bee437e70819ac6932cae51cfc1b27dedcb82/src/melee/gr/grvenom.c#L470-L474));
- joints 2 and 3 are stored and swapped according to world-space Y
  ([lines 675–685](https://github.com/MarkMcCaskey/melee/blob/079bee437e70819ac6932cae51cfc1b27dedcb82/src/melee/gr/grvenom.c#L675-L685));
- external stage `0xE4` arms the field to 1
  ([lines 648–653](https://github.com/MarkMcCaskey/melee/blob/079bee437e70819ac6932cae51cfc1b27dedcb82/src/melee/gr/grvenom.c#L648-L653));
- the controller copies the platform translation to the target, advances the
  field, and creates the dialogue object at 60
  ([lines 694–740](https://github.com/MarkMcCaskey/melee/blob/079bee437e70819ac6932cae51cfc1b27dedcb82/src/melee/gr/grvenom.c#L694-L740));
- the collision query treats the second joint as the lower boundary and
  queries the first joint as the upper boundary
  ([lines 1832–1851](https://github.com/MarkMcCaskey/melee/blob/079bee437e70819ac6932cae51cfc1b27dedcb82/src/melee/gr/grvenom.c#L1832-L1851)).

The runtime audit independently confirms the identities and behavior at those
addresses; it never writes the four fields, the timer, or the dialogue object.

## Gecko provenance

The small reviewable payloads are:

- [`driver.s`](driver.s): enters the match scene until external stage `0xE4`
  is live;
- [`matchhook.s`](matchhook.s): supplies external stage `0xE4` through
  `StartMeleeRules::xE`;
- [`logger.s`](logger.s): observes the platform controller at
  `grVenom_80204284` and writes the result block;
- [`build_gecko.py`](build_gecko.py): assembles those sources and emits
  `audit.gecko.ini`.

Rebuild with:

```sh
python3 build_gecko.py --melee /path/to/doldecomp/melee
```

The logger stores its result in `db_ItemAndPokemonMenuText_buf`
(`0x8049FA50`, size `0x50`), a develop-mode-only text buffer. Game addresses
come from GALE01 rev2 `config/GALE01/symbols.txt`:

| address | symbol / role |
|---:|---|
| `0x8016E730` | `fn_8016E730(StartMeleeData*)`, match-start hook |
| `0x80204284` | `grVenom_80204284`, observed controller |
| `0x8049E6C8` | `stage_info`; `map_gobjs` is `+0x180` |
| `0x804D49E8` | selected external stage ID |
| `0x8049FA50` | develop-mode result buffer |
