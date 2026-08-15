# vi — Video Scenes (Cutscenes)

In-engine cinematics, keyed by scene number: each `viNNNN.c` loads models,
plays an `HSD_CObj` camera animation via `vi_RunCamera`, and hands back to
`gm`. These are the little story moments — 1-P mode intros/interludes (the
Mushroom Kingdom flyover, F-Zero race start, Metal Mario reveal) and ending
scenes — as opposed to pre-rendered THP movies (`lb/lbmthp.c` plays those).

| File | What it is |
|------|------------|
| `vi.c` / `vi.h` | Shared cutscene machinery: `vi_RunCamera`, camera-callback priorities, character file-name tables. |
| `vi0102.c`, `vi0401.c`, `vi0402.c`, `vi0501.c`, `vi0502.c`, `vi0601.c`, `vi0801.c`, `vi1101.c`, `vi1201v1.c`, `vi1201v2.c`, `vi1202.c` | Individual scenes; numbering tracks 1-P mode stage order (exact scene↔number mapping not yet documented `(?)` — the two `1201` variants suggest branch-dependent versions). |

Neighbors: `cm/` supplies camera modes, `gm/` schedules the scenes,
`lb/lb_80013B14`-style helpers own camera descriptors.
