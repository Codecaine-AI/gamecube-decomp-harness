# DamageFall behavior

Draft at `c302741689bd67c361cd7faadb221df3193992c3`. All owned C1-144 and H1-21 read canonically and rendered.

The unit combines damage-model shift setup/retrieval, pending audio, a collision-refresh adapter, and DamageFall entry/callbacks. The adapter discards the shared boolean collision result. Its surface-reaction callers already corrected position; the ordinary collision path changes ledge-snap height only for ECBSource_JObj.

Model shifting excludes Cape, Disable, Nap, Sleep and current DamageIce. calcShift converts common x168 times calculated hitlag plus x16C to u16. Index resets to zero. Electric chooses mode 2 before ground/air; air uses 0; ground uses 1 and captures the floor normal. x18FD comes from the pointer-slot encoded count cast through u32 to u8, not a pointer dereference. With frames active, the reader mirrors table X by facing; ground returns (normal.y*x, -normal.x*x + table.y). It returns the buffer without advancing; zero frames returns NULL without writing. Fighter frame processing decrements duration, increments the index, and wraps at x18FD.

Audio independently tests x1908 != -1 and x190C != NULL, plays and clears each slot. Direct playback uses 127/64. Array playback chooses HSD_Randi(num). Immediate caller execution is bool1==0; bool1 nonzero requires positive hitlag and bool2 to flag deferred dispatch. Computed zero hitlag is not an automatic immediate fallback in that branch.

Entry converts ground bookkeeping before checking Parasol. Verified Parasol results are 0..6 or -1, so the existing nonnegative description is valid here. Active Parasol delegates to specialized damaged descent. Otherwise motion 0x26 uses flags 0x18001, frame zero, speed one, zero blend, clamps drift and calls the feedback hook with 8/0. CliffWait expiration is a verified caller. Lift collision callbacks reach ftCo_80096E68 through ft_8008403C; its held-item branch drops the item and invokes DamageFall. The enum-to-Boolean trigger is unresolved, so this route does not establish loss of ground.

Anim is inert. IASA checks no held Hammer before its seven ordered handlers and horizontal-stick tumble cancel. ftCo_800D7100 can pick up an item. ftCo_800D705C can set x209C without changing motion; true means handled input, not necessarily transition. JumpAerial dispatch distinguishes multijump. Trailing Hammer release/drop and HammerFall entry checks run only after no previous early return. Phys uses shared fast-fall/gravity/aerial movement. Coll supplies a landing callback that prioritizes directional tech, neutral tech, then DownBound; shared collision also has wall-jump/ledge-grab fallbacks.

Both existing ELF objects contain eight bytes 000000003f800000. Source flags WRITE|ALLOC differ from split ALLOC. Assembly also uses zero for IASA ABS; no additional conversion constants exist in this pool. No build ran; frozen report hash agrees.

Evidence is enumerated with exact ranges in coverage.json and fact-dispositions.json. All 12 original outgoing link records are retained individually, with endpoints, role, rationale and locators preserved.
