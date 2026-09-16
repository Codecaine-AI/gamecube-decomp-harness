# EMario Follow-up: Defer Further Extraction

The parent trial was correctly reverted.
`round3-emario-verification.json` records perform falling from 71.90426% to 33.957447% and the text section from 93.668434% to 86.08714%.
The strict log shows that the helper emitted, but its size was 0x1c4 rather than the original UNUSED 0x220.
That is 92 bytes short.
No candidate object or full trial instruction diff is preserved among the emario artifacts, so this audit cannot prove which compiler decision caused the score drop.
A lost inline boundary is a plausible explanation, not a verified result from these files.

A narrower extraction preserving current behavior would leave both early returns in perform and move only its collision loop to checkCollision.
The original perform assembly contradicts those early returns: lack of CUE_MOVE and false canControl both branch to the child perform call, not the function epilogue.
The existing trial helper already includes canControl and is smaller than the map by 92 bytes.
Moving only the loop would remove that guard from its body as well, without any positive evidence that this recovers the original 0x220 structure or retains caller inlining.
Such a variant would therefore preserve a known behavior defect and guess a weaker helper boundary solely to chase emission.
No additional patch is proposed.

The original instruction sequence gives a concrete next direction for separate matching work.
Inside perform, both collision distances copy vectors through integer loads/stores and call TVec3::sub before squaring their components.
Current source uses direct distance calls and emits float subtraction with no such helper call.
The original helper likely included this vector expression structure, and its reconstruction may change the compiler's inline decision as well as its size.
Recover the complete collision expression and helper boundary together, then verify original branch flow, 0x220 helper size, and caller matching.
Do not add artificial temporaries, forced inline pragmas, or duplicate bodies merely to satisfy the checker.

This file supersedes the provisional emario extraction recommendation in round3-enemy-audit.md.
The original proposal remains saved as rejected evidence, not an accepted cleanup.
