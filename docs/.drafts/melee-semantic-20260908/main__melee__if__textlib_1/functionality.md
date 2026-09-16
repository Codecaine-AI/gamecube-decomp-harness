## Descriptor-driven developer menus

`textlib_1.c` implements the interactive menu layer over DevText. Caller-owned, type-9-terminated descriptor arrays supply labels, callbacks, option tables, backing-value pointers, bounds and steps. Pooled menu records own separately allocated text buffers and DevText panels. Root creation installs a recurring GObj process; child creation shares the parent's GObj context and positions the panel using parent width, selected-row height and caller offsets.

### Layout and rendering

The width helper reserves space for label-only and label/value rows. Rendering uses aligned columns and tag-specific choice, decimal, hexadecimal or floating-point output. Type 0 receives the heading palette; other selected rows receive the selection palette. Flag `0x10` halves RGB while preserving alpha. These source-level roles support the existing rendered names; no name changes are proposed. Exact compiled section placement and sizes are not established by the supplied evidence.

### Input and numeric behavior

Input priority is Start, up/Y, down/X, right/R, left/L, A, then B. Selection skips type-0 rows without wrapping. Stick directions use strict thresholds outside ±60 and a shared unsigned-byte countdown. Controller-zero R selects a reload of one instead of eight; it does not immediately cancel a previously loaded delay.

Choice, bounded integer and float edits use descriptor bounds. Byte, halfword and word edits use storage-width modular behavior. Type 3 combines integer storage with floating-point step arithmetic; types 4 and 7 mutate through unsigned pointers despite decimal/hexadecimal presentation. A true mutator result denotes an accepted edit, not necessarily a changed bit pattern for every possible step.

Callbacks receive numeric events 0/B, 1/A, 2/left adjustment, 3/right adjustment, 4/initialization, 5/teardown and 6/Start. Entry callbacks run first, with zero permitting fallback through the mutable current-menu global. The selected-entry global is published only when an entry callback exists. Fallback callbacks return an integer-compatible result, although the input handler ignores it.

### Process and lifetime

The process traverses from `un_804D6E40` through `prev`. Visible panels redraw every visit; dirty bit `0x01` additionally causes an erase and is cleared. Bit `0x02` suppresses one visible input visit, `0x10` locks parent input, `0x20` hides the panel and bypasses drawing/input, and `0x80` requests destruction. Close checking still occurs for hidden nodes.

Teardown preserves the `next` parent, detaches its child link and clears its lock, then frees the requested node and its `prev` descendants. Event 5 targets each descriptor array's terminator callback, not every ordinary row. The no-terminator-callback branch uses the node's fallback; the terminator-callback branch rechecks mutable global fallback context. Buffers, panels and pooled nodes are released separately. The current-menu global is restored to the surviving parent, but this routine does not explicitly clear the root global or remove the controller GObj/process.

### Exceptional paths and review result

Root creation checks the shared DevText GObj and new GObj, but not pooled root allocation. The common initializer returns no status: buffer or panel failure can leave partial state, and callers still install a process or link a child. Its panel-creation failure branch contains no explicit release of the allocated buffer. These are not failure-atomic constructors.

The full canonical and rendered file supports the existing naming family. Five factual corrections are proposed. Two exact-layout facts remain unresolved. The stale trophy-collection link is rejected because the current unit ends after menu teardown and contains no trophy predicates. All other baseline facts and links are explicitly retained in the checkpoint ledger.

Status: synthesized; independent review and live promotion pending.
