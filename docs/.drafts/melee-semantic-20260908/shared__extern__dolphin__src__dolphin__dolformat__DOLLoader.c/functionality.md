## DOL image loading and execution

`DOLLoadImage` treats the supplied buffer as a `DolImage` header. When verbose, it prints nonzero-offset TEXT and DATA descriptors, BSS information, and the entry address. Diagnostic enumeration uses `DOL_MAX_TEXT` for TEXT and `DOL_MAX_DATA` for DATA. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dolformat/DOLLoader.c#L18-L48)

Before copying segments, it calls the local `bzero` for BSS. That implementation is defective: for positive length it repeatedly writes only the first byte, rather than clearing the range; zero length performs no writes. Thus the loader must not be described as successfully clearing all BSS. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dolformat/DOLLoader.c#L8-L16) [Call](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dolformat/DOLLoader.c#L49-L49)

For each selected segment, the loader copies from a buffer-relative offset to the header-specified destination and calls `DCFlushRange`. Both copy loops use `DOL_MAX_TEXT`, including the DATA loop, which the source explicitly identifies as a bug. This differs from the DATA diagnostic loop; numeric limits are not established by this file. Offset-zero entries are skipped. There is no visible image-size, destination, or overlap validation, and the header continues to be read from the original buffer throughout loading. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dolformat/DOLLoader.c#L49-L74)

After copying, it calls `ICFlashInvalidate` and `ICSync`, then returns the header entry address without executing it. `DOLRunApp` separately loads its argument into the link register and branches through it, with `nofralloc`; this is a control transfer, not an ordinary returning call sequence. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/dolformat/DOLLoader.c#L75-L88)

## Semantic assessment

The rendered view contains no proposed-name substitutions. Existing DOL loader and execution names fit their source roles; the conventional `bzero` name must not obscure its implementation defect. The frozen baseline contains no subjects, facts, or links, and there are no writable subjects. No knowledge edits are proposed. This review makes no compiled-layout claims.

Status: synthesized; independent review and live promotion pending.
