# PR #2939 runtime audit — external vs internal stage IDs

Audits [doldecomp/melee PR #2939](https://github.com/doldecomp/melee/pull/2939)
against the live game (GALE01 rev2 / SSBM NTSC 1.02).

The PR claims, beyond what byte-matching CI can check:

1. `unk_arr_803E9960` (renamed `stage_id_map`) maps **external** stage IDs to
   **internal** stage IDs, and the new `ExternalStageId` enum names its
   indices correctly (`0x07` = Corneria, `0x16` = Venom, ...).
2. `Stage_802251E8` / `Stage_8022519C` / `StartMeleeRules::xE` /
   `lbAudioAx_80026EBC` take external IDs, not internal ones.
3. `stage_info.internal_stage_id` and the `Ground_803DFEDC` table index are
   the internal side of that mapping.

## Interactive audit (any Dolphin, no tooling)

Add `kiosk.gecko.ini` to GALE01's Gecko codes (right-click the game →
Properties → Gecko Codes → Edit config, or copy into
`GameSettings/GALE01.ini` in your Dolphin user folder), enable cheats, and
boot the game. It goes straight into a CPU-vs-CPU match; then:

- **D-pad Right / Left (P1)** steps to the next / previous external stage ID
  (0x02..0x20, skipping 0x15 and 0x1A — see Caveats). Each press reloads the
  match through the game's own scene flow.
- **A (P1)** arms autoplay: the game then walks the whole cycle by itself,
  recording results like the headless audit does.
- The overlay (game's own develop-mode text console) shows live:

      ext  0x07 CORNERIA        <- selected external id + PR enum name
      int  0x0E (map 0x0E) OK   <- engine's internal id, stage_id_map claim, verdict
      file GrCn.dat             <- loaded archive per the stage's own StageData
      next 0x16                 <- pending target while a reload is in flight

  `OK` means `stage_id_map[ext].internal_id` equals the internal ID the
  engine actually loaded; the archive name (`GrCn.dat` = Corneria, ...) is
  read from the loaded stage's own `StageData`, so you can eyeball that the
  enum name, the stage on screen, and the file agree.

`overlay.gecko.ini` is a passive variant: just the overlay, no stage cycling
or scene pinning — safe to leave on while playing normally.

## Machine audit (headless, stock Dolphin)

    python3 audit_pr2939.py --dolphin /path/to/dolphin-emu-nogui \
        --iso /path/to/ssbm_rev2.iso \
        --dolphin-arg=--platform --dolphin-arg=headless \
        --dolphin-arg=-v --dolphin-arg=Null

Uses `autosweep.gecko.ini` (the kiosk plus an autopilot: the game itself
walks all VS external IDs, waits 90 stable frames each, and records
`{ext, map, live}` into develop-mode-only debug memory). The script launches
Dolphin with cheats enabled, then only *reads* memory over Dolphin's
built-in GDB stub (`Dolphin.General.GDBPort`) — no breakpoints — and:

- diffs all 286 `stage_id_map` entries in RAM against the PR's initializer,
- collects each sweep row, the loaded archive filename, and a snapshot of
  the on-screen overlay text,
- checks every row against `expected.json`.

Results stream to `audit.jsonl`; `REPORT.md` is the human-readable summary
(regenerate anytime with `--report`).

## Provenance / rebuilding

- `extract_expected.py` fetches `gr/forward.h` + `gr/stage.c` at the PR head
  SHA and parses the enums and table into `expected.json` — the audit checks
  the PR's actual content, never a hand-copied table.
- `build_overlay.py` generates `overlay.s` / `matchhook.s`, assembles them
  (powerpc-eabi binutils), and emits the three `.gecko.ini` files plus
  `overlay_meta.json`. Every game address is annotated in `addresses.py`
  and traceable to `config/GALE01/symbols.txt`.
- All payload code/data lives in `db_CpuHandicapInfo` / `db_AnimationInfo` /
  `db_CameraInfoDisplay_buf` / `db_SoundInfoText_buf` — develop-mode debug
  buffers retail play never touches. The overlay hooks `DevText_DrawAll`;
  the kiosk additionally pins the three scene-flow setters to VS/match,
  writes the pending ID in `fn_8016E730`, and disables the memory-card
  prompt.

## Memory addresses used (GALE01 rev2)

Everything read, written, or hooked, with the decomp symbol it comes from
(`config/GALE01/symbols.txt` unless noted). "read" addresses are the audit's
evidence; "hook"/"write" addresses are the machinery.

### Audited state (read only)

| address | symbol | role |
|---|---|---|
| `0x804D49E8` | `selected_stage.external_id` (PR name; was `unk_struct_804D49E8`) | external stage ID last passed to `Stage_802251E8` |
| `0x803E9960` | `stage_id_map` (was `unk_arr_803E9960`), 286 × 12-byte entries | the external→internal table under audit; entry word 0 = internal ID |
| `0x8049E750` | `stage_info.internal_stage_id` (`stage_info` `0x8049E6C8` + `0x88`, gr/types.h) | internal stage ID the engine actually loaded |
| `0x803DFEDC` | `Ground_803DFEDC`, 111 × `StageData*` | internal-ID-indexed stage table; `->data1` (+0x8) is the archive name (`"GrCn.dat"`) |

#### Deriving the read addresses from the DOL

`0x804D49E8` (`selected_stage`) is obvious from the PR/symbols. The others
can be re-derived from a single function in the shipped `main.dol`:
`Ground_801C0754` (symbols.txt) compiles the PR's

```c
stage_info.internal_stage_id = pair->internal_id;
stage = Ground_803DFEDC[pair->internal_id];
arg3 = (pair->external_id == ExternalStageID_HEAL) ? 0 : 1;
```

and disassembles (from `main.dol`, no tooling assumptions) to:

```
801c0758  lis   r4, 0x804A
801c0768  addi  r31, r4, -0x1938   ; r31 = 0x8049E6C8       = stage_info
801c077c  lwz   r0, 0(r29)         ; pair->internal_id      (offset 0 = internal)
801c0780  lis   r3, 0x803E
801c0784  addi  r3, r3, -0x124     ; r3 = 0x803DFEDC        = Ground_803DFEDC
801c0788  stw   r0, 0x88(r31)      ; 0x8049E6C8+0x88 = 0x8049E750 = internal_stage_id
801c0794  slwi  r4, r4, 2          ; table indexed by internal id
801c0798  add   r3, r3, r4
801c079c  cmpwi r0, 0x55           ; pair->external_id == ExternalStageID_HEAL
```

So `0x8049E750` is the word this store writes, `0x803DFEDC` is the table it
indexes with that same value, and the `0x55` compare on the *second* struct
field confirms the internal/external field order the PR claims.

### Game functions called by the overlay payload

| address | symbol |
|---|---|
| `0x80301FB4` | `DevText_GetGObj` |
| `0x80302834` | `DevText_Create` |
| `0x80302810` | `DevText_Show` |
| `0x80302AB0` | `DevText_HideCursor` |
| `0x80302B90` / `0x80302B64` | `DevText_SetBGColor` / `DevText_SetTextColor` (GXColor passed by pointer) |
| `0x80302B10` | `DevText_SetScale` |
| `0x80302BB0` / `0x80302A3C` | `DevText_Erase` / `DevText_SetCursorXY` |
| `0x80302D4C` | `DevText_Printf` (64-char internal buffer; one call per line) |
| `0x804D6E18` | `devtext_drawlist` — walked to detect scene resets (`DevText::next` at +0x30) |

### Hooks and writes (kiosk/autosweep only, except the first)

| address | symbol | what |
|---|---|---|
| `0x80302608` | `DevText_DrawAll` | overlay hook (first insn `mflr r0` displaced); gated on draw pass 2 |
| `0x8001CE78` | `lb_8001CE78` | memory-card prompt, patched to `li r3, 45; blr` |
| `0x801A42E8` | `gm_SetPendingGameMode` | pinned to `GM_VS` (2) |
| `0x801A42F8` | `gm_ChangeGameModeAfterCurrentScene` | pinned to `GM_VS` (2) |
| `0x801A42A0` | `gm_SetPendingSceneIndex` | pinned to the match scene (2) |
| `0x8016E730` | `fn_8016E730(StartMeleeData*)` | writes the pending external ID to `rules.xE` (+0xE) |
| `0x80479D35` / `0x80479D64` | scene-routing state (`gm_80479D30` block) | pending-scene-exit byte / advance-now word, poked to reload the match |
| `0x8045AC58` / `0x80480530` | VS-mode / game-state `StartMeleeData` | stage + 2-CPU-player defaults |
| `0x804C20BC` | `HSD_PadCopyStatus[0]`; `::trigger` at +0x8 | P1 D-pad press detection |

### Payload home (develop-mode-only debug memory)

| address | symbol | use |
|---|---|---|
| `0x8049FAC8` | `db_CpuHandicapInfo` (0x350) | autosweep results: count, done flag, stability counter, 40 × `{ext, map, live}` rows; DevText glyph buffer |
| `0x8049FE18` | `db_AnimationInfo` (0x5A8) | mutable state (+0), constants/strings blob (+0x8), payload code (+0x210) |
| `0x804A03C0` / `0x804A0480` | `db_CameraInfoDisplay_buf` / `db_SoundInfoText_buf` | tail of the code region |

These five buffers are written only by develop-mode debug menus
(`fn_SetupAnimationInfo` etc.), unreachable in retail play, and are
contiguous: `0x8049FAC8..0x804A04F0`.

## Caveats

- The kiosk/autosweep hooks deliberately hijack the scene flow — those code
  sets are for auditing, not normal play.
- The sweep covers the VS-loadable externals 0x02..0x20 **except** 0x15 (the
  deleted entry) and 0x1A (the second Icicle Mountain entry): loading either
  through the VS flow hard-freezes the game — found empirically (0x1A froze
  both from 0x19, a same-internal reload, and from 0x1B/Flat Zone). Those
  two and entries 0x21+ (1P/event variants, `BIGBLUEROUTE`, `HEAL`) are
  covered by the table diff only.
