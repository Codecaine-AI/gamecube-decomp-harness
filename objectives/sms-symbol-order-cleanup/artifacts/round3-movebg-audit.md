# Round 3 MoveBG Follow-Up Audit

## MapObjHide

Candidate `round3-movebg-hide.patch` renames existing `TWoodBox::fabricatedGroundKillCheck` to map-known `killNearWoodBox` and corrects its const qualifier.
It preserves the complete body and all four caller sites.
Map line 65936 gives `killNearWoodBox__8TWoodBoxCFff`, UNUSED size 0xbc.
The complete linked `TWoodBox::kill` assembly contains four repeated ground-check and conditional-neighbor-kill sequences exactly matching the helper behavior.
Current kill accuracy is 99.9 percent, with remaining stack-frame offsets differing.
The constructor, loadAfter, and round-2 getter fixes are untouched.
This is a strong candidate for fixing the sole strict failure, pending parent compilation and emitted-size/matching verification.

## MapObjLib

The actual source of the missing `SMatrix33C<f>::at` is visible in original `getVerticalVecToTargetXZ`: nine explicit at calls fetch matrix entries in rows 2, 1, 0 and columns 1, 0, 2, followed by TVec3 set.
Current compiled code inlines all nine accesses, so this is a real compiler-emission difference rather than an absent middleware implementation.
The current wrapper is 41.8 percent matching; `rotateVecByAxisY` is 99.8 percent and differs chiefly in stack offsets.
Original map lists `getVerticalVecFromOffsetXZ` as UNUSED 0xb0, and it is currently an empty body.
Source uses an explicitly fabricated `rotateVecByAxisY2` solely as an extra wrapper.

Candidate `round3-movebg-lib-helper-trial.patch` replaces that fabricated wrapper with the existing map-known offset helper, using the already-present normalize/rotate logic and routing the const target wrapper through it.
The helper is made static because it consumes only offset coordinates and is reached from the const wrapper; this retains its existing mangled name.
This is a structural hypothesis, not an accepted fix.
Parent must require plausible map-size agreement, increased or unchanged caller matching, and strict improvement before acceptance.
If the inline-depth difference persists, the natural one-argument `rot.mult33(*vec)` overload is another source-level hypothesis: it adds a forwarding layer already present in JGeometry without editing JGeometry.
Do not force at emission or shuffle the set template arbitrarily.

## MapObjCorona

All 39 remaining misses belong to unfinished source context.
The file has only TBathtub definitions, almost all empty or constant-return stubs; TBathtubGrip and TBathtubParams are only forward declarations.
Missing Grip and GripParts class constructors, destructors, message handlers, collision control, transforms, and virtual thunks require real class reconstruction.
The missing parameter constructor and static initializer require the original parameter definitions and globals.
The two anonymous getDir functions, QuatRotate, and CameraDemoCallBack have no existing source bodies to correct.
The absent JGeometry and std helper instances follow from this missing game behavior, and forced template emission would conceal it.
No narrow signature/body relabeling remained after round 2.
No Corona patch proposed; reconstructing grip classes from original assembly would be a separate substantive decompilation task.

No shared source edits or builds were performed by this agent.
