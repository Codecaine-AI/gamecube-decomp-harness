# src/melee — Whole-Tree Map

Melee's game code is organized by two-letter module prefixes. Function and
file names inside a module carry the same prefix (`gm_`, `ftKb_`, `grKongo_`).

| Dir | Name | One-liner |
|-----|------|-----------|
| [gm](gm.md) | game mode | Main loop and scene machinery: title, menus, VS/1P modes, Special Melee, results, credits. The spine everything else hangs off. |
| [ft](ft/README.md) | fighter | The character system — action states, physics, and one folder per character. Biggest module by far. |
| [it](it.md) | item | Every spawnable object: carriable items, Poké Ball Pokémon, character projectiles (Fox's laser, Link's bombs), even Break-the-Targets targets. |
| [gr](gr.md) | ground | Stage logic: one file per stage (gimmicks, hazards, animation) plus shared stage infra. `grt*` = Break the Targets stages. |
| [mp](mp.md) | map | Map **collision**: floors/walls/ceilings, ledge-grab lines, the geometry fighters and items test against. (Stage *behavior* is `gr`.) |
| [pl](pl.md) | player | Per-player-slot data above any one fighter: stocks/score, 1-P bonus awards, **stale-move queue**. |
| [if](if.md) | interface | In-match HUD: damage percents, stock icons, timer, name tags, offscreen magnifier bubble, text rendering. |
| [mn](mn.md) | menu | Every menu screen: character/stage select, rules, options, trophy gallery, sound test. |
| [cm](cm.md) | camera | The match camera: subject tracking, bounds, pause camera, fixed-camera mode, snapshot mode. |
| [lb](lb.md) | library | Shared engine services: `.dat` archive loading, DVD/heap/memory, memory cards, THP movie player, shadows, generic collision math. |
| [ef](ef.md) | effect | Particle/visual effects: spawn-by-gfx-id dispatch, sync/async effect queues. |
| [db](db.md) | debug | The developer debug menus and tools left in the game (DBLEVEL, debug camera, CPU control). |
| [gm→sc](sc.md) | scene | Tiny header-only module: `SceneDesc`/model descriptor structs used to describe renderable scenes. |
| [sfx](sfx.md) | sound fx | Almost entirely the **crowd** (cheers, gasps, chants); general audio lives in `lb/lbaudio_ax` and sysdolphin. |
| [ty](ty.md) | toy | Trophies ("figures"): the gallery, collection list, and lottery. |
| [vi](vi.md) | video | In-engine cutscenes: opening/how-to-play playback hooks and 1-P mode story scenes, all camera-driven. |

## Outside src/melee

- `src/sysdolphin` — HAL's engine library ("HSD"/baselib): GObj entity system,
  JObj scene graph, rendering, animation. Melee code calls into this constantly.
- `src/MSL`, `src/Runtime`, `src/MetroTRK` — Metrowerks C runtime, libc, and
  debugger stub. Compiler-vendor code, not game logic.
- `include/` — public headers mirroring the module layout.
- `config/GALE01/` — splits and symbols metadata (which address ranges map to
  which source files).

## Object lifecycle in one paragraph

Nearly every live thing in a match is an `HSD_GObj` (sysdolphin) whose
`user_data` points at a module struct: `Fighter` (ft), `Item` (it), `Ground`
(gr), `Camera` (cm), etc. Scenes (gm) create GObjs; per-frame callbacks run
physics, collision (mp), animation, and draw. When you see
`GET_FIGHTER(gobj)` / `GET_ITEM(gobj)` you're crossing from the generic
entity system into module-specific state.
