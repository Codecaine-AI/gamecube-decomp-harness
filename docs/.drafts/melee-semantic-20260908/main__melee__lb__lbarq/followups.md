# Family Followups

1. Dolphin ARQ ABI and type semantics. Confirm type 1 direction, priority 0 semantics and completion handle layout mapping through the embedded ARQRequest; canonical TU supplies casts and handle->node access but not foreign ABI proof.

2. Compiled diagnostic section. The four .sdata facts require compiled metadata and placement evidence.

3. Blocking interrupt context. The blocking path restores the caller saved interrupt state before polling. Caller context and lower-layer completion delivery establish whether progress is possible.
