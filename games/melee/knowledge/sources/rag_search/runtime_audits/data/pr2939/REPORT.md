# Runtime audit: doldecomp/melee PR #2939

PR head: `ce27a5268a7ae25b04593128530f773eaad3e9da` — game: GALE01 rev2 (NTSC 1.02), stock Dolphin, driven by the game itself via the committed Gecko hooks (autosweep.gecko.ini); results read back over Dolphin's built-in GDB stub.

## 1. stage_id_map table vs RAM

- 286 entries compared at `0x803E9960`: **all match** the PR's `stage_id_map` initializer.

## 2. Live stage-load sweep

For each VS external id, the game itself set `StartMeleeRules::xE`, restarted the match through its own scene flow, waited 90 stable frames, and recorded `stage_id_map[ext].internal_id` alongside the engine's `stage_info.internal_stage_id`. The archive filename comes from the loaded stage's own `StageData::data1`. PASS iff map == live == the PR's expected internal id.

| ext | enum | map→int | live int | live enum | archive | overlay snapshot (at host readback, may lag) | result |
|-----|------|---------|----------|-----------|---------|-------------------|--------|
| 0x02 | ExternalStageID_IZUMI | 12 | 12 | IZUMI | /GrIz.dat | ext  0x04 CASTLE / int  0x02 (map 0x02) OK / file /GrCs.dat | PASS |
| 0x03 | ExternalStageID_PSTADIUM | 16 | 16 | PSTADIUM | /GrPs | ext  0x04 CASTLE / int  0x02 (map 0x02) OK / file /GrCs.dat | PASS |
| 0x04 | ExternalStageID_CASTLE | 2 | 2 | CASTLE | /GrCs.dat | ext  0x06 ZEBES / int  0x08 (map 0x08) OK / file /GrZe.dat | PASS |
| 0x05 | ExternalStageID_KONGO | 4 | 4 | KONGO | /GrKg.dat | ext  0x06 ZEBES / int  0x08 (map 0x08) OK / file /GrZe.dat | PASS |
| 0x06 | ExternalStageID_ZEBES | 8 | 8 | ZEBES | /GrZe.dat | ext  0x08 STORY / int  0x0A (map 0x0A) OK / file /GrSt.dat | PASS |
| 0x07 | ExternalStageID_CORNERIA | 14 | 14 | CORNERIA | /GrCn | ext  0x08 STORY / int  0x0A (map 0x0A) OK / file /GrSt.dat | PASS |
| 0x08 | ExternalStageID_STORY | 10 | 10 | STORY | /GrSt.dat | ext  0x08 STORY / int  0x0A (map 0x0A) OK / file /GrSt.dat | PASS |
| 0x09 | ExternalStageID_ONETT | 20 | 20 | ONETT | /GrOt | ext  0x0A MUTECITY / int  0x12 (map 0x12) OK / file /GrMc.dat | PASS |
| 0x0A | ExternalStageID_MUTECITY | 18 | 18 | MUTECITY | /GrMc.dat | ext  0x0A MUTECITY / int  0x12 (map 0x12) OK / file /GrMc.dat | PASS |
| 0x0B | ExternalStageID_RCRUISE | 3 | 3 | RCRUISE | /GrRc.dat | ext  0x0D GREATBAY / int  0x06 (map 0x06) OK / file /GrGb.dat | PASS |
| 0x0C | ExternalStageID_GARDEN | 5 | 5 | GARDEN | /GrGd.dat | ext  0x0D GREATBAY / int  0x06 (map 0x06) OK / file /GrGb.dat | PASS |
| 0x0D | ExternalStageID_GREATBAY | 6 | 6 | GREATBAY | /GrGb.dat | ext  0x0F KRAID / int  0x09 (map 0x09) OK / file /GrKr.dat | PASS |
| 0x0E | ExternalStageID_SHRINE | 7 | 7 | SHRINE | /GrSh.dat | ext  0x0F KRAID / int  0x09 (map 0x09) OK / file /GrKr.dat | PASS |
| 0x0F | ExternalStageID_KRAID | 9 | 9 | KRAID | /GrKr.dat | ext  0x11 GREENS / int  0x0D (map 0x0D) OK / file /GrGr.dat | PASS |
| 0x10 | ExternalStageID_YORSTER | 11 | 11 | YORSTER | /GrYt.dat | ext  0x11 GREENS / int  0x0D (map 0x0D) OK / file /GrGr.dat | PASS |
| 0x11 | ExternalStageID_GREENS | 13 | 13 | GREENS | /GrGr.dat | ext  0x11 GREENS / int  0x0D (map 0x0D) OK / file /GrGr.dat | PASS |
| 0x12 | ExternalStageID_FOURSIDE | 21 | 21 | FOURSIDE | /GrFs.dat | ext  0x14 INISHIE2 / int  0x19 (map 0x19) OK / file /GrI2.dat | PASS |
| 0x13 | ExternalStageID_INISHIE1 | 24 | 24 | INISHIE1 | /GrI1.dat | ext  0x14 INISHIE2 / int  0x19 (map 0x19) OK / file /GrI2.dat | PASS |
| 0x14 | ExternalStageID_INISHIE2 | 25 | 25 | INISHIE2 | /GrI2.dat | ext  0x17 PURA / int  0x11 (map 0x11) OK / file /GrPu.dat | PASS |
| 0x16 | ExternalStageID_VENOM | 15 | 15 | VENOM | /GrVe | ext  0x17 PURA / int  0x11 (map 0x11) OK / file /GrPu.dat | PASS |
| 0x17 | ExternalStageID_PURA | 17 | 17 | PURA | /GrPu.dat | ext  0x19 ICEMTN / int  0x16 (map 0x16) OK / file /GrIm.dat | PASS |
| 0x18 | ExternalStageID_BIGBLUE | 19 | 19 | BIGBLUE | /GrBb.dat | ext  0x19 ICEMTN / int  0x16 (map 0x16) OK / file /GrIm.dat | PASS |
| 0x19 | ExternalStageID_ICEMTN | 22 | 22 | ICEMTN | /GrIm.dat | ext  0x1D OLDYOSHI / int  0x1D (map 0x1D) OK / file /GrOy.dat | PASS |
| 0x1B | ExternalStageID_FLATZONE | 27 | 27 | FLATZONE | /GrFz.dat | ext  0x1D OLDYOSHI / int  0x1D (map 0x1D) OK / file /GrOy.dat | PASS |
| 0x1C | ExternalStageID_OLDPUPUPU | 28 | 28 | OLDPUPUPU | /GrOp.dat | ext  0x1D OLDYOSHI / int  0x1D (map 0x1D) OK / file /GrOy.dat | PASS |
| 0x1D | ExternalStageID_OLDYOSHI | 29 | 29 | OLDYOSHI | /GrOy.dat | ext  0x1F BATTLE / int  0x24 (map 0x24) OK / file /GrNBa.dat | PASS |
| 0x1E | ExternalStageID_OLDKONGO | 30 | 30 | OLDKONGO | /GrOk.dat | ext  0x1F BATTLE / int  0x24 (map 0x24) OK / file /GrNBa.dat | PASS |
| 0x1F | ExternalStageID_BATTLE | 36 | 36 | BATTLE | /GrNBa.dat | ext  0x1F BATTLE / int  0x24 (map 0x24) OK / file /GrNBa.dat | PASS |
| 0x20 | ExternalStageID_LAST | 37 | 37 | LAST | /GrNLa.dat | ext  0x20 LAST / int  0x25 (map 0x25) OK / file /GrNLa.dat | PASS |

**29/29 externals PASS (0 skipped).**

Not load-tested (covered by the table diff only): 0x15 (deleted entry) and 0x1A (second Icicle Mountain entry) — loading either through the VS flow hard-freezes the game, found empirically; externals ≥ 0x21 (1P/event variants) are outside the VS flow.
