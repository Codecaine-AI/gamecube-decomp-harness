# ARQ Request Lifecycle

The module wraps ARQ requests in a pooled FREE, PENDING and DONE lifecycle. A client may supply a completion callback or block while polling the request state. Both paths recycle the request after completion.

The singleton reserves ten node records, but initialization links only nodes 0 through 8. The loop ends with node pointing at nodes[8], and the following write terminates that record's next link. Node 9 is untouched by this routine. Usable initial capacity is nine requests.

Submission invalidates the destination cache range, removes a FREE node and appends it to PENDING while interrupts are excluded. It posts the embedded ARQRequest with literal type 1 and priority 0. Their exact Dolphin meanings and completion-handle ABI remain foreign-family questions.

Completion moves a node to DONE under exclusion, restores the prior interrupt state, and calls the optional client callback. Callback-bearing nodes then return to FREE. Without a callback, the submitter polls until DONE and performs recycling itself. Restoring the prior interrupt state does not guarantee interrupts become enabled, so blocking progress depends on caller context. The source's noninline workaround comment does not prove scheduling or portable memory-order behavior.

| Canonical Target | Behavior | Evidence |
| --- | --- | --- |
| `.bss` | Named singleton lbArq_804316C0 contains storage for ten lbArqNode records and three lists indexed FREE, PENDING and DONE. The initializer makes only nodes[0..8] reachable. Association with .bss follows the frozen inventory; compiled placement was not independently verified. | [L9-L33](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarq.c#L9-L33) |
| `.sdata` | Canonical submission contains HSD_ASSERT(0x67,rp) for free-pool exhaustion. Exact compiler-emitted metadata and its .sdata placement require object evidence. | [L120-L126](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarq.c#L120-L126) |
| `lbArq_80014ABC` | Returns the supplied node state unchanged. The blocking submission loop repeatedly calls this accessor until DONE; no scheduler-yield or memory-ordering guarantee follows from this C function alone. | [L41-L44](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarq.c#L41-L44) |
| `lbArq_80014AC4` | Reads handle->node, removes the node from its state-selected list under interrupt exclusion and appends it as DONE. Restores the saved interrupt state, calls the optional client callback, then under another exclusion removes the node from its current list and appends it as FREE. Without a callback it remains DONE for the blocking submitter. | [L49-L105](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarq.c#L49-L105) |
| `lbArq_80014BD0` | Invalidates the destination cache range, requires a free node, stores callback metadata and moves the node to PENDING under interrupt exclusion. Calls ARQPostRequest with embedded request, node owner, literal type 1 and priority 0, source/destination/length and internal completion callback. With no client callback, restores saved interrupts, polls until DONE, then recycles to FREE under exclusion before returning; otherwise completion handles recycling. | [L107-L161](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarq.c#L107-L161) |
| `lbArq_80014D2C` | Clears three list heads and roots FREE at nodes[0]. The loop assigns nodes[0] through nodes[8], then overwrites nodes[8].next with NULL. Thus nine nodes are reachable despite ten-record storage; node 9 is not initialized or linked by this routine. No active-transfer guard or interrupt masking appears. | [L163-L184](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarq.c#L163-L184) |

Full canonical and rendered C lines 1-185 and header lines 1-12 were reviewed. Both renders returned ok, zero parse errors and no next page. Named singleton source semantics are attested; compiled .bss placement and .sdata diagnostic contents were not independently verified.

## Live application status

Live promotion confirmed: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbarq/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbarq/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/9da666ecd74bd28d77bf7eb5f3399a4cd4b63e537666049092d43a041ff97956/2026-09-08T14-51-20.810Z-421d6c67-0684-4672-9c3c-af2eb43bb47d.receipt.json). Unresolved inherited claims remain unresolved. Proposal and review hashes preserved.

Verified completion: live promoted. [final-render.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbarq/final-render.json>) and [staged-completion.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbarq/staged-completion.json>).
