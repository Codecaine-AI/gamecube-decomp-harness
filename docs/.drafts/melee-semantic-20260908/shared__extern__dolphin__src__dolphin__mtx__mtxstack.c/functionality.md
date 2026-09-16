## Matrix-stack functionality

This file manages a matrix stack using pre-existing `stackBase` storage; it does not allocate or free that storage. `MTXInitStack` asserts a non-null stack and backing pointer and a nonzero capacity, records `numMtx`, and represents an empty stack with a null `stackPtr`. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/mtxstack.c#L7-L16)

All four push variants return the new top pointer. On an empty stack they use the base slot; otherwise they assert capacity before writing the next slot and advancing the pointer. `MTXPush` copies the supplied matrix. `MTXPushFwd` copies it on an empty stack and otherwise calls `MTXConcat(currentTop, m, nextSlot)`. [Copy and forward pushes](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/mtxstack.c#L18-L59)

`MTXPushInv` computes a local inverse, copies it for the first entry, and otherwise calls `MTXConcat(inverse, currentTop, nextSlot)`. `MTXPushInvXpose` computes an inverse followed by an in-place transpose, copies that result for the first entry, and otherwise calls `MTXConcat(currentTop, inverseTranspose, nextSlot)`. The differing operand order is significant. Neither function checks the result of `MTXInverse`; this file supplies no singular-matrix recovery branch. The local temporary is consumed by copy or concatenation rather than returned. [Inverse variants](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/mtxstack.c#L61-L110)

`MTXPop` returns null when already empty or when removing the sole entry; otherwise it decrements the top pointer and returns the newly exposed entry, not the removed entry. `MTXGetStackPtr` returns the current top, including null for an empty stack. Neither operation clears backing matrix contents. [Pop and accessor](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/mtxstack.c#L112-L135)

## Semantic assessment

The full canonical and rendered file was reviewed. The rendered view has no substitutions or parse errors; the original function names fit the observed operations. Assertion statements establish source-level checks, not a claim that every build enforces them. External matrix-helper failure behavior and backing-storage lifetime beyond this file are not established here. No compiled layout claims are made.

Subject and link enumeration returned no records, so there are no existing facts or links to retain or correct and no writable subjects for new knowledge. An empty proposal is appropriate.

Status: researched; no-change lead bypass; independent review and live promotion pending.
