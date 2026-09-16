## GXVerify.c

All definitions are guarded by `#if DEBUG`. The file provides static verification-state storage, an externally visible pointer initialized to that storage, 113 warning strings, and a 256-byte character buffer. These are source-level declarations, not compiled-layout findings. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXVerify.c#L1-L126)

`__GXVerifyGlobal` is empty. `__GXVerifyCP` obtains `nrmCnt` using `GET_REG_FIELD(gx->vatA[fmt], 1, 9)`. At verification levels at least `GX_WARN_SEVERE`, it calls the callback with `(1, 0, __gxvWarnings[0])` when `hasNrms && nrmCnt != 0`, or, through an `else if`, when `hasBiNrms && nrmCnt != 1 && nrmCnt != 2`. The literal comparison against 2 is preserved rather than interpreted as proof that the extracted field can represent 2. Neither the vertex-format index nor the callback is validated here. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXVerify.c#L128-L144)

`__GXVerifyState` does nothing when verification is `GX_WARN_NONE`; otherwise it invokes Global, CP, XF, SU, BUMP, TEX, TEV, and PE verification in that order. Only CP receives the vertex-format argument. The downstream verifier implementations are outside this owned file. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXVerify.c#L146-L158)

`GXSetVerifyLevel` directly assigns the level. `GXSetVerifyCallback` replaces the callback and returns its previous value, without rejecting null or managing callback lifetime. Safe callback installation before a warning is emitted is not established by this file. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/gx/GXVerify.c#L160-L173)

The complete rendered view has zero substitutions and zero parse errors. Existing canonical names fit the visible behavior. There are no frozen subjects, facts, or links to retain or correct, and no supported proposal is necessary.

Status: synthesized; independent review and live promotion pending.
