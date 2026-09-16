## Internal AX interface header

`extern/dolphin/src/dolphin/ax/__ax.h` is an include-guarded declaration header importing `<dolphin/ax.h>`. It contains declarations rather than implementations, grouped by source-module comments:

- **AXAlloc:** voice-stack access, free/callback-stack operations, priority-stack operations, and allocation initialization/shutdown (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/__ax.h#L6-L18).
- **AXAux:** initialization/shutdown, auxiliary A/B input/output access declarations, and processing (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/__ax.h#L20-L27).
- **AXCL:** the external `u32 __AXClMode`, command-list cycle/address getters, a `u16` command-list writer, frame handling, and initialization/shutdown (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/__ax.h#L29-L37).
- **AXOut and AXProf:** output frame/callback/DSP initialization interfaces and a getter returning `AXPROFILE*` (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/__ax.h#L39-L47).
- **AXSPB and AXVPB:** studio/depop interfaces and voice/parameter-block servicing, synchronization, defaults, and initialization/shutdown declarations (code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/ax/__ax.h#L49-L65).

The canonical and rendered file were reviewed in full. The rendered view makes no name substitutions; no supported naming correction was identified. Signatures and module grouping are supported, but this header alone does not establish execution order, pointer ownership or lifetimes, numeric mode meanings, exceptional branches, or compiled layout. In particular, `u32` return types must not be silently reinterpreted as pointer types.

Subject and link enumeration both returned empty baselines. There are no existing facts or links to retain or correct, and no proposals are warranted.

Status: synthesized; independent review and live promotion pending.
