# Background Flash Functionality

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Read started 2026-09-08T14:42:03.210Z; completed 2026-09-08T14:47:21.597000+00:00.

The unit owns one0x48-byte background-flash controller. Callers install fixed RGBA or source/target transitions; Proc advances float channels and publishes byte color; Draw emits full-screen GX quads. Presets cover white-to-black, transparent-to-black and transparent-to-white. The latter changes RGB and alpha together.

Modes0-2 update floating RGBA and publish bytes; modes3-4 with wipe submode0 advance a shared frontier; mode5 does not update. Drawing is independently suppressed by active=1. Mode3 covers the traversed region; mode4 covers the remaining region. Completion produces full black in mode3 and no geometry in mode4.

The transition count divides each channel difference and is not stored as a countdown. No automatic shutdown occurs at the destination. Directional clamps converge for coherent initial state, but zero-step arbitrary state may remain above target. Proc continues while drawing is suppressed.

Wipe submode0 advances X across640, then Y across480, using per-update iteration and byte step fields. Coordinates can overshoot; completion is detected on a later iteration. Zero steps can stall updates and zero strip height can make Draw loop forever. No owned entry point establishes wipe parameters, so external invariants remain unverified.

Setup creates a camera and effect object at caller low-byte priority or default10. Camera GX mask is0x10000, effect GX link0x10, process priority0. Setup sets active1/mode0 without resetting colors, deltas or wipe state. Repeated setup overwrites handles without local destruction, and local allocation failure handling is absent.

InitState selects mode5 and publishes a supplied GXColor; relocated lb_0219.c ColorOverlay code supplies scaled RGB/alpha each process invocation. This consumer evidence does not transfer foreign ownership.

Existing object data confirms96-byte descriptors,72-byte BSS and16-byte color presets. Scalar pool bytes identify0,1,640,-480 and conversion doubles, not camera projection parameters. Objects were not rebuilt.

## Entry Points

- `.bss`: Persistent 0x48-byte singleton holds colors, floating steps, wipe frontier, suppression/mode and two object handles. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L16-L40.
- `.data`: Two world-object descriptors and perspective camera; existing object .data is96 bytes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L55-L79.
- `.sdata`: Four GXColor presets occupy16 bytes in existing objects. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L50-L53.
- `.sdata2`: Existing object scalar pool contains zero, one,640,-480 and conversion doubles; camera descriptor parameters belong to .data. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L81-L171.
- `fn_8001FC08`: Per-channel signed step and directional target clamp; no publication to byte colors. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L81-L162.
- `fn_8001FEC4`: Draws current color or complementary black wipe masks; active1 suppresses only drawing. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L173-L321.
- `fn_800204C8`: Updates color or wipe frontier without consulting active; publishes bytes or completion. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L323-L368.
- `lbBgFlash_800205F0`: Configure opaque white to opaque black; duration min1; mode0. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L372-L379.
- `lbBgFlash_8002063C`: Configure transparent black to opaque black; duration min1; mode0. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L383-L390.
- `lbBgFlash_80020688`: Configure transparent black to opaque white; RGBA all rise; mode0. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L392-L399.
- `lbBgFlash_800206D4`: Install colors and duration-normalized floating steps; enable drawing and mode2, no countdown. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L401-L423.
- `lbBgFlash_InitState`: Publish caller color in mode5, active0; interpolation and object fields unchanged. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L425-L430.
- `fn_800208B0`: Publish black with caller alpha in mode5, active0. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L431-L442.
- `lbBgFlash_800208EC`: Allocate camera and effect objects and register draw/proc at low-byte argument priority. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L443-L474.
- `lbBgFlash_800209F4`: Allocate camera and effect objects at render priority10; suppress drawing, mode0. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L476-L504.
- `file`: Singleton full-screen RGBA overlay and complementary black wipe renderer, updater and setup. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbbgflash.c#L1-L504.

## TU Lead Verification

Lead reviewed complete C505/H27 canonical and rendered views plus all 19 proposed updates. Confirmed draw suppression is independent of Proc, no duration countdown, retained state on setup, complementary wipe geometry, zero-step hazards and source-absent historical parameter entities. Shared type and historical parameter identities remain unresolved; compiled section claims require independent gate. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

## Inherited Name Collision

Unresolved inherited alias collision: lbBgFlash_Init is also assigned to main/melee/lb/lb_0219:lbBgFlash_80021A18 in the frozen baseline. No unique alias is promoted here; defer to cross-TU naming reconciliation. Fact `fact:58048cc4-0480-445b-98c6-2dab83958544` retains its exact baseline version in coverage, with disposition changed to unresolved.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/a12b8d7ef1d88fbdd84ec5a4abfeb9191a04c71abb3459f75511c3f6b7906d57/2026-09-08T14-57-39.866Z-cbbf3f5b-ec9d-4217-8614-02fb929679da.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbbgflash/final-render.json).
