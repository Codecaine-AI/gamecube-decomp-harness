# gmmain functionality

## Startup orchestration
`main` is the application startup entry point (`int main(void)`). It initializes OS, VI, DVD, PAD, CARD and alarms, captures launch buttons, and applies the debug-level helper before configuring HSD. When simulated memory size divided by 1 MiB equals 48, it reserves `0x01800000` bytes from the high arena with alignment 4; this is an integer-division test, not a literal byte-size equality. It records the remaining arena span, requests two XFBs, `GXNtsc480IntDf`, a `0x40000`-byte FIFO and four heaps, installs crash handling, initializes graphics, and seeds randomness from `OSGetTick`.

It then calls the audio and support-library initialization paths and supplies controller and video callbacks. These are canonical call-site observations, not proof of the rendered proposed names of external functions. The optional USB setup requires non-master `DbLevel`, held R, and a nonzero result from `hsd_803931A4(-1)`. It selects mode 1 and loops, reporting and servicing events, until `hsd_80393A04()` succeeds; there is no local timeout. Screenshot initialization and startup diagnostics follow. The local item-spawn selector is unconditionally set false, selecting `db_EnableItemSpawns`; the true/disable branch remains in source. Finally it invokes SPR setup, clears FPU exceptions and calls `gm_801A4510`. The call site alone does not prove that the callee never returns.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L130-L220.

## Debug selection
`gmMain_8015FDA4` tests `/develop.ini` by comparing the DVD entry lookup against `-1`. Presence first sets `db_804D6B20` true. X takes priority over Y: X swaps NoDebugRom with DebugRom and DebugDevelop with Develop, with an unmatched input becoming DebugDevelop. Y, only when X is absent, maps NoDebugRom to DebugRom and DebugDevelop to Develop, preserves other inputs, and clears the flag. Neither button leaves the level unchanged and the flag true. Without the marker, the helper asserts incoming NoDebugRom and then assigns Master; it does not explicitly update the flag on this branch. No successful continuation through a failing assertion is assumed. Numeric enum encodings and a compiler-generated transition table are not established by this source switch.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L60-L104.

## Controller storage and callback
`gmMain_8015FD24` selects PAD specification 5, passes a five-entry `HSD_PadData` array and twelve-entry rumble-node array to HSD, then sets stick type 0, shift 1, min 0 and max/scale 80; analog L/R shift is 1, min 0 and max/scale 140. Five denotes sample-queue capacity, not controller-port count. Both arrays have static lifetime. HSD retains their pointers; the controller code buffers four-port samples using circular indices, and rumble initialization links the supplied nodes into a null-terminated pool used by later vibration interpretation. The callback has no local guard, but PADSetSpec itself asserts that PAD is not initialized, so unconditional local code is not a guarantee of safe arbitrary reinvocation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L37-L56; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L42-L105; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/controller.c#L579-L595; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/rumble.c#L217-L275; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/pad/pad.c#L789-L808.

## Video callback and build-dependent helpers
`gmMain_8015FDA0` is an empty static `void(u32)` callback registered in HSD's user post-retrace slot. HSD retains that pointer and supplies `retraceCount` after its internal framebuffer processing; the game callback ignores the argument and changes no state. The proposed names `gmMain_InitPad` and `gmMain_PostRetraceCallback` are supported descriptive hypotheses, not recovered original spellings.

`init_spr_unk` emits code only under MWERKS_GEKKO. Its macro builds values with both `li` and `oris` before writing SPRs `0x392` through `0x395`; these are not merely writes of the small constants 4 through 7. Under GNU compilation, the source also defines an empty `__eabi` stub. The owned header contains only an include guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L58-L58; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L106-L128; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.c#L158-L160; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/video.c#L37-L140; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain.h#L1-L5.

## Evidence limits
Source declarations establish types, static lifetime and declaration order, but not compiled section membership, packing, extent or object order. The anonymous `.sdata` table interpretation and `.data` string-pool layout remain unresolved. Rendered substitutions were reviewed as hypotheses only.

Status: synthesized; independent review and live promotion pending.
