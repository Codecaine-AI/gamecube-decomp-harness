# Player Ordering Audit

Status: proposed, not compiled or accepted.
The shared source tree was not edited and Ninja was not run.
Patch applicability was checked with `git apply --check .audit/round2-player.patch`.

## MarioDraw

The only non-weak ordering disagreement is an adjacent pair, `loadAnm` and `loadBas`.
The original map at `orig/GMSJ01/files/mario.MAP:62930-62933` lists:

```text
801267e0 0x64 loadAnmTexPattern
80126844 0x48 loadBas
UNUSED   0x40 loadAnm
8012688c 0xbc setReverseAnimation
```

Current object `nm -nS` emits:

```text
00003a48 00000064 T loadAnmTexPattern__6TMarioFPP16J3DAnmTexPatternPcP12J3DModelData
00003aac 00000040 T loadAnm__6TMarioFPP15J3DAnmTransformPCc
00003aec 00000048 T loadBas__6TMarioFPPvPCc
00003b34 000000bc T setReverseAnimation__6TMarioFif
```

`configure.py:914-927` assigns Player the game flags, including `-inline deferred` at line 263.
Existing source order agrees with reverse object order.
Moving the unchanged `loadAnm` definition before `loadBas` is the ordinary source-order correction.
Both declarations already exist in `include/Player/Mario.hpp:716-717` and no declarations need changing.
`initModel` calls both helpers after both definitions.
The two helper object sizes already equal the original map sizes.

Expected result: the ordering error disappears; 14 missing symbols remain.
The source has no mutual calls or function-local statics in these two definitions.
The remaining risk is MWCC changing inlining or data emission in callers because of the move.
Acceptance requires rebuilding and comparing the entire matching report, particularly `initModel`.

## MarioJump

The only non-weak ordering disagreement is `checkJumpingThrowStart` preceding `doJumping` in current object output.
The original map at `orig/GMSJ01/files/mario.MAP:63012-63018` lists:

```text
UNUSED   0x154 askStrongGroundTouch
8012bf2c 0x358 doJumping
UNUSED   0x07c setJumpingAttackArea
UNUSED   0x148 doSpinJumping
UNUSED   0x180 doSlipJumping
UNUSED   0x05c checkJumpingThrowStart
8012c284 0x0d0 startJumpWall
```

Current object `nm -nS` emits:

```text
00004f44 00000004 T askStrongGroundTouch__6TMarioFv
00004f48 00000004 T checkJumpingThrowStart__6TMarioFv
00004f4c 00000358 T doJumping__6TMarioFv
000052a4 000000cc T startJumpWall__6TMarioFv
```

The three intervening UNUSED functions are absent and explicitly outside this patch.
Among existing definitions the proper reverse source order is `startJumpWall`, `checkJumpingThrowStart`, `doJumping`, `askStrongGroundTouch`.
The patch moves the existing empty `checkJumpingThrowStart` definition intact before `doJumping`.
It does not introduce a stub or claim to repair its behavior or known 0x04 versus 0x5c size difference.
There are no calls to `checkJumpingThrowStart` in `src/Player`; only its existing declaration and definition were found.

Expected result: the ordering error disappears; three missing symbols and existing size warnings remain.
Acceptance still requires compiling and checking matching results.

## Remaining and Uncertain

Both TUs should remain strict failures due to missing symbols, even if both proposed ordering fixes succeed.
No missing bodies, compiler-forcing pragmas, validator changes, or middleware edits are proposed.
The missing-symbol lists are preserved in `.audit/final-strict/mario__Player__MarioDraw.log` and `.audit/final-strict/mario__Player__MarioJump.log`.
No claim is made that those missing functions can be safely reconstructed from their signatures or sizes alone.
