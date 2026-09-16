## GXVert.h

This header defines typed access to the GX FIFO at `0xCC008000`. `PPCWGPipe` exposes unsigned, signed, and floating-point members. `GXWGFifo` is a volatile absolute-address declaration under `__MWERKS__` without `M2CTX`, and otherwise a volatile pointer-dereference macro. These are source-level bindings, not evidence of compiled section placement. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXVert.h#L10-L30)

When `DEBUG` is true, helper macros generate external function declarations only; their implementations are not shown here. Otherwise they generate static inline functions that write each argument, in order, to the corresponding volatile FIFO member. Indexed variants write a single `u8` or `u16`; they do not perform an array lookup within this header. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXVert.h#L32-L65)

Macro invocations supply command and parameter writers, two- and three-component positions, three-component normals, packed or component colors, one- and two-component texture coordinates, indexed attribute forms, and an unsigned-byte matrix-index writer. These names fit the declared families; the inline bodies simply emit values and do not configure or validate the consuming vertex format. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXVert.h#L67-L127)

The helper macros are undefined afterward except under `M2CTX`, where they remain defined. C++ linkage guards surround the declarations. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/gx/GXVert.h#L129-L142)

The complete rendered view contains no name substitutions and reports one parse error. Canonical text supports the functionality assessment independently of rendering. There are no baseline subjects, facts, or links to retain or correct; no proposal is warranted.

Status: synthesized; independent review and live promotion pending.
