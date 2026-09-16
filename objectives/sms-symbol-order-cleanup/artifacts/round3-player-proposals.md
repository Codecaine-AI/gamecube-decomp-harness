# Round 3 Player Proposals

All patches are uncompiled proposals; no shared source or build state was changed by this agent.
Existing round-1/2 edits are preserved.

## MarioDraw Default-Argument Constructor Wrapper

Patch: `round3-player-draw-default-ctor.patch`.
Remove the standalone no-argument constructor declaration in the game header `include/M3DUtil/M3UJoint.hpp` and give the already-implemented bool constructor its default argument `false`.
No function body is added or changed.

Original map lines 12368 and 62929 call `__ct__24M3UMtxCalcSIAnmBlendQuatFv` weak and give 0x24 bytes.
The exact original wrapper disassembly is saved in `round3-player-draw-constructor.diff.txt`.
It loads r5 with zero and calls the bool constructor, forwarding r3/r4 unchanged, then returns.
This is consistent with an MWCC-generated default-argument constructor wrapper required by `new M3UMtxCalcSIAnmBlendQuat[2]` in MarioDraw.cpp.
Current header instead declares an undefined independent no-argument overload, and the object leaves that symbol undefined.
The bool implementation exists in src/M3DUtil/M3UJoint.cpp:95 and uses the argument for mBehaveAsBasic.
The class hierarchy contains a virtual base, explaining the hidden r4 constructor parameter and bool in r5.

Acceptance requires the compiler to emit the exact 36-byte wrapper and preserve every constructor/caller consumer's matching results.
Reject if the compiler emits a different body, fails to define the wrapper, or regresses consumers.
This is a high-confidence source declaration hypothesis supported by all nine original instructions.
Coordinate with the M3DUtil audit owner because this patch changes its game header.

## MarioRun Existing Braking Body

Patch: `round3-player-run-braking.patch`.
Remove explicit inline and its stale TODO from the existing braking definition.
No body change.
Map line 63197 lists the UNUSED body with size 0x158.
The only call is in moveMain's MARIO_STATUS_BRAKE case.
Current moveMain matches 99.3 percent and is 2588 bytes.
The source already asks to remove this inline mark, but that comment is not evidence the compiler trial will succeed.

Accept only if braking emits 0x158 bytes, strict passes, and moveMain plus all other scores do not regress.
UNUSED does not establish binding; retain this as a plausible emission correction only after compiler verification.
No pragmas or fake references are proposed.

## ModelWaterManager Destructor Thunk

Patch: `round3-player-water-destructor.patch`.
Declare the already-implicit TWaterHitActor destructor explicitly in class with an empty body.
The original destructor is weak, 0x84 bytes, and the current implicit destructor matches every instruction; saved as `round3-player-water-destructor.diff.txt`.
Original map lines 17136 and 63656 also require its weak 8-byte `@32@` adjustment thunk.
Original assembly contains only `addi r3,r3,-32` followed by branch to the destructor.
Current object has the matching destructor but lacks the adjustment thunk.
The base THitActor already has a virtual destructor, so this does not introduce a new virtual slot.

This is a bounded compiler-emission hypothesis, not a proven fix.
The original vtable/receiveMessage owner is BossHanachanSub, per map lines 17133 and 17143.
Current ModelWaterManager references that external vtable.
An explicit in-class destructor may affect the key virtual function and vtable emission, so all header consumers must rebuild and retain matching.
Accept only if the exact missing thunk appears, no symbols regress, and all matching results remain or improve.
Do not manufacture a thunk or change inheritance to satisfy this check.

## MarioJump Repeated Attack-Area Helper

Patch: `round3-player-jump-attack-area.patch`.
Extract the identical existing eight-line velocity/attack-size branch from doJumping and boardJumping into the already-declared setJumpingAttackArea helper.
Replace both copies with an ordinary helper call.
Place the definition before doJumping, matching map line 63014 and reverse emission.
Original UNUSED helper size is 0x7c.

This proposal recovers a helper from two existing instruction-supported copies; it does not invent an algorithm from a name.
Original doJumping offsets 0x3c00 through 0x3c50 exactly match the current velocity check, four parameter loads and calls through the attack-radius/height setters.
boardJumping currently matches 100 percent with the identical source block; doJumping is 99.9 percent with stack-only differences.
The THitActor setters update the field then call calcEntryRadius, matching original instructions in both branches.
The recovered name and signature agree with that operation.

Located and ran existing m2c at `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/m2c/m2c.py` on original doJumping, with `-t ppc --globals=used`.
Its output is preserved in round3-player-doJumping-m2c.txt and independently confirms the condition, field loads/stores, and radius recalculations.
The original UNUSED standalone body is absent, so matching 0x7c is an acceptance constraint rather than independently available instruction proof.

Accept only if emitted helper size is 0x7c, strict missing count drops with no new ordering/linkage error, and both callers plus every other matching symbol do not regress.
Particularly preserve boardJumping's complete match.
No body changes, dummy calls, or compiler pragmas are proposed.
If the ordinary helper fails to inline correctly, reject this bounded trial rather than steering the compiler with artificial source.

## WaterGun Existing Model Getter

Patch: `round3-player-watergun-getmodel.patch`.
Move the existing one-line getModel body from its class to the cpp between getNozzleMtx and changeNozzle, matching reverse map order at line 63422.
The missing UNUSED getter is 0xc bytes in the map.
Its body already exists and returns the MActor model; no new logic is proposed.
The directly identified call is in WaterGun perform, currently 96.6 percent, 332 bytes.
This is a lower-confidence emission experiment because the existing header definition is also plausible and UNUSED binding is unknowable.
Accept only if the emitted size is 0xc, missing count drops without any strict regression, and the whole rebuilt-consumer report does not regress.
Do not equate successful emission with proof of original out-of-line placement.
