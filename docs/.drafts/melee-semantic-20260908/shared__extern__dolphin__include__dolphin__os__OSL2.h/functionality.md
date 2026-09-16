### OSL2.h
This guarded header includes `<dolphin/types.h>` and provides C linkage when included from C++. It declares five void-returning L2 interfaces: `L2Enable(void)`, `L2Disable(void)`, `L2GlobalInvalidate(void)`, `L2SetDataOnly(BOOL dataOnly)`, and `L2SetWriteThrough(BOOL writeThrough)` ([canonical source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/os/OSL2.h#L1-L20)).

The existing names accurately describe the declared interface; no supported naming correction is needed. This file contains no implementations, so it does not establish register operations, invalidation sequencing, exceptional branches, or runtime state lifetimes.

All 21 canonical and rendered lines were reviewed. The rendered view reports zero parse errors and zero substitutions. Its unchanged `L2GlobalInvalidate` shadowed-binding annotation is rendering metadata, not independent evidence of implementation behavior. The frozen subject and link enumerations are empty; there are no baseline facts or links to disposition and no supported proposals.

Status: researched; no-change lead bypass; independent review and live promotion pending.
