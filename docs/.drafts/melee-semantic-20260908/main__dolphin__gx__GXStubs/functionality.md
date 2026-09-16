## GXStubs

The complete translation unit contains two GX header includes and `void __GXSetRange(float nearz, float fgSideX)`. Its body is empty: neither argument is consumed, no state is read or modified, no commands are emitted, and no value is returned. There are no internal branches or resource lifetimes.

Canonical `GXSetViewportJitter` updates viewport shadow fields, then calls this hook with `nearz` and `gx->fgSideX` only when `gx->fgRange != 0`. Both the called and skipped paths continue into XF viewport-register writes 26–31 and set `gx->bpSent = 1`. Thus the hook adds no range-adjustment effect; the surrounding caller still performs normal viewport programming.

Evidence: [complete stub](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXStubs.c#L1-L8) and [viewport caller](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXTransform.c#L401-L446).

The rendered file matches canonical source, with zero substitutions and no parse errors. Keeping `__GXSetRange` unchanged is appropriate. All six existing facts are retained; the two parameter subjects have no baseline facts. No compiled section, layout, or hardware-requirement conclusion is drawn.

Status: researched; no-change lead bypass; independent review and live promotion pending.
