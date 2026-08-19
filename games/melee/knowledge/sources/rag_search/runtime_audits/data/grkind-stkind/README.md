# `grkind` / `stkind` — which stage-id space is which

Follow-up to [doldecomp/melee PR #2939](https://github.com/doldecomp/melee/pull/2939)
review feedback:

> I'm pretty sure what we call "external stage id" is grkind and "internal
> stage id" is stkind, and StructPairWithStageID::list_idx is also stkind

Two of the three clauses hold; the grkind/stkind assignment is inverted:

| decomp name | the game's name | selects |
|---|---|---|
| `InternalStageId` — `stage_info.internal_stage_id`, the `Ground_803DFEDC` index | **`grkind`** | which `Gr??.dat` ground archive is loaded |
| `ExternalStageId` — `StageIdPair::external_id` (the old `list_idx`), `StartMeleeRules::xE` | **`stkind`** | which stage-param row *inside* that archive |

So `list_idx` really is `stkind` (that clause is right), but `stkind` is the
external space, not the internal one.

## Evidence 1 — the DOL binds the names to the values

`ground.c` holds the only `grkind`/`stkind` string in the whole DOL:

    "%s:%d: not found stage param in DAT(grkind=%d stkind=%d,num=%d)\n"

and the failure path of `Ground_801C28CC` in retail GALE01 rev2 fills the
varargs like this (straight from `main.dol`, no decomp source involved):

```
801c2a48  lis   r3, 0x804A
801c2a50  addi  r3, r3, -0x1938   ; r3 = 0x8049E6C8 = stage_info
801c2a54  lwz   r6, 0x88(r3)      ; stage_info.internal_stage_id  -> grkind=%d
801c2a58  addi  r7, r4, 0         ; the s32 parameter (pair->external_id) -> stkind=%d
801c2a5c  addi  r8, r27, 0        ; entry count -> num=%d
801c2a60  addi  r3, r28, 700      ; the format string above
801c2a64  addi  r4, r28, 536      ; __FILE__ ("ground.c")
801c2a68  li    r5, 2310          ; 0x906
801c2a6c  bl    OSReport
```

`stage_info + 0x88` is the word that indexes `Ground_803DFEDC` and picks
`StageData::data1` (`"GrNBa.dat"` &c.), and the PR #2939 audit already
confirmed at runtime that it carries the internal ID (external `0x1F` → `36`).
It lands in the **grkind** slot.

## Evidence 2 — the searched list is keyed by the external ID (offline)

The list `Ground_801C28CC` searches is `stage_info.param->xB0`, and
`stage_info.param` is the archive's own public symbol `grGroundParam`:

```c
stage_info.param = HSD_ArchiveGetPublicAddress(sp14, "grGroundParam");
```

So the keys are on the disc, and the question needs no emulator at all:

    python3 crosscheck_dat.py --iso /path/to/ssbm_rev2.iso --jsonl crosscheck.jsonl

For all 286 `stage_id_map` entries it takes the mapped internal ID, resolves
`Ground_803DFEDC[internal]->data1`, pulls that file out of the ISO, and reads
its `grGroundParam` entry list:

```
stage_id_map entries          : 286
  with a stage file + params  : 284
  external id in its DAT list : 282

Entries where external != internal (only these can tell the two spaces apart): 279
  external id in the list, internal absent : 271
  internal id in the list, external absent : 0
  both present (the internal number is also some other stage's external id in the same file) : 6
  neither                                  : 2   0x1A->int 22 (GrIm.dat), 0x4D->int 22 (GrIm.dat)

  file         internal  external  grGroundParam keys
  GrCs.dat            2  0x04      0x4 0x3C 0x56 0x6C 0x6E 0x9B 0xBE 0xCC ...
  GrSt.dat           10  0x08      0x8 0x5E 0x86 0x9E 0xB5 0xCD 0xF9 0xFE
  GrIm.dat           22  0x19      0x19 0x4C 0x74 0x75 0x8B 0xAB 0xBD 0xD4 ...
  GrNBa.dat          36  0x1F      0x1F 0x4E 0x4F 0x6D 0x7D 0x94 0x95 0x96 ...
```

Keys run up to `0x146` (326) — past the 111-entry internal table, inside the
286-entry external map.

This is also *why* the lookup exists: one grkind (one ground archive) carries
many stkind rows — Battlefield's file holds 18, one per 1P/event variant that
reuses that ground. Were stkind the internal ID, every DAT would hold exactly
one row equal to its own ID and the search would be pointless.

## Evidence 3 — same thing in RAM

    python3 live_param_keys.py

boots the PR #2939 autosweep kiosk (the game walks the VS stages itself) and
reads `stage_info.param->xB0/xB4` out of RAM per stage over Dolphin's GDB stub.
`live_param_keys.jsonl` holds the run: 28 stages sampled, every one's DAT list
containing that stage's **external** ID and matching the disc byte for byte.
(The 29th, `0x20`, was still pending when the run was stopped.)

## Evidence 4 — the game says it itself

The PR #2939 audit found that external `0x1A` (the second Icicle Mountain
entry) hard-freezes the game, and excluded it from the sweep. `0x1A` and `0x4D`
are exactly the two externals missing from their own archive's list: both map
to internal 22, and `GrIm.dat` is keyed
`[0x19, 0x4C, 0x74, 0x75, 0x8B, 0xAB, 0xBD, 0xD4, 0x107]`. So loading `0x1A`
drops `Ground_801C28CC` out of its search loop into the "not found stage param"
report and the `while (1) {}` behind it — which means the game will compute the
grkind and stkind varargs *for a case we can force*:

    python3 make_icetop_ini.py     # kiosk cycle 0x02 -> 0x1A + a C2 hook on the failure path
    python3 icetop_marker.py       # boot it, read the recorded varargs back

```
the game reached ground.c's failure path and would print:
  "not found stage param in DAT(grkind=22 stkind=26,num=9)"

  selected external id (0x804D49E8) = 26 (0x1A)
  live internal id (0x8049E750)     = 22
  -> grkind 22 == internal id : True
  -> stkind 26 == external id : True
```

`num=9` is `GrIm.dat`'s nine `grGroundParam` rows, matching the offline read.
The freeze is that infinite loop: a missing data row for a cut stage, not an
emulator or scene-flow artifact.

## Files

| file | what |
|---|---|
| `crosscheck_dat.py` | offline: ISO + DOL → every `stage_id_map` entry checked against its archive's `grGroundParam` keys |
| `crosscheck.jsonl` | one row per external ID from that run |
| `live_param_keys.py` | live: reads each loaded stage's param list over the GDB stub (needs `../pr2939` for the kiosk) |
| `live_param_keys.jsonl` | the recorded run |
| `make_icetop_ini.py` | builds `icetop.gecko.ini` (kiosk cycle `0x02 -> 0x1A` + the failure-path C2 hook) from `../pr2939`'s generator |
| `icetop.gecko.ini` | that code set, ready to drop into Dolphin |
| `icetop_marker.py` | boots it and reads back the recorded grkind/stkind/num |
| `icetop_marker.json` | the recorded run |

## Where the enum member names come from (PR #2969 review follow-up)

`stage_names.py` pulls every stage name the shipped DOL contains
(`stage_names.txt` is a recorded run):

- **The decomp's ALL-CAPS spellings are invented.** Of 41 member names probed,
  only two occur anywhere in `main.dol`: `TEST`, which is verbatim the stage
  list's entry 1, and `BATTLE`, only inside the assert `i<BATTLE_BG_MAX` in
  `grbattle.c`. None appear as enum members in asserts.
- **The stkind space has a complete original name list.** 12-byte strings at
  `0x803FAB04` with a pointer array at `0x803FAF0C`, 86 entries indexed
  `0x00..0x55`, aligning index-for-index with stkind (`0x02` Izumi, `0x49`
  `8-1bbroute`, `0x55` `heal`). It names the three holes the decomp calls Unk:
  `0x00` dummy, `0x15` Akaneia, `0x1A` Icetop. Note `0x1A` Icetop and `0x4D`
  `10-2` (blank label) are exactly the two stkinds with no `grGroundParam` row
  -- the pair that hangs the game.
- **The grkind space has a different original source**: the per-stage `gr*.c`
  module names embedded as `__FILE__` in asserts, 79 of them. 70 of the 71
  `GrKind` members match one exactly; the lone mismatch is `ICEMTN`, whose
  module is `gricemt.c` (the tree already names the file `gricemt.c`).
- **The two sources disagree**, so the stage list cannot simply be applied to
  `GrKind`: it spells Yoshi's Island `Yoster` while the module is
  `gryorster.c`, and it shortens to display labels (`old ppp`, `old yosh`,
  `old kong`, lowercase `battle`/`last`) where the modules spell them out.
- **Original identifier style** in this code, from assert text: `Gr_CObj_Max`,
  `Gr_Fzero_Car_Max`, `Gr_Greens_Block_Max`, `Gr_Greens_Block_Status_None`,
  `Gr_Homerun_Parts_Max`, `St_Player_InitPos_None` -- prefix plus capitalised
  words, with `BATTLE_BG_MAX` the one all-caps exception.
