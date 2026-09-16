# lbheap Functionality

lbheap keeps six logical heap records and two arena-bound pairs. Initialization captures bounds and configures metadata. Reconstruction excludes non-transient subordinate ranges, replaces the base HSD/ARAM heaps, and creates the retained subordinate heaps. Allocation/free select a backend by record type.

## Entry Points

| Canonical | Behavior |
|---|---|
| lbHeap_800158D0 | Writes arg1 unchanged to the indexed heap transient field. No bounds check, normalization or immediate backend action. |
| lbHeap_800158E8 | Returns the indexed transient integer unchanged, without bounds checking or state mutation. |
| lbHeap_80015900 | Rebuilds registry backend state around subordinate slots 2 through 5. Destroys created slots whose transient value equals one; reserves ranges whose transient value equals zero; creates main/HSD slot 0 and ARAM slot 1 over the recomputed ranges; creates destroyed non-transient subordinate slots. |
| lbHeap_80015BB8 | Returns the indexed LbHeapStatus enum unchanged. Create is zero and Destroy is one; no Boolean conversion, validation or synchronization occurs. |
| lbHeap_80015BD0 | Allocates size bytes from a created indexed heap with interrupts disabled. Type zero temporarily selects/restores HSD heap; other types call lbMemory_80014FC8. Type three returns result->x4_lo, other custom types return the handle. Non-created status returns NULL. |
| lbHeap_80015CA8 | Disables interrupts, asserts created status, and frees the supplied value through HSD for type zero or lbMemFreeToHeap otherwise. Restores prior HSD selection on the type-zero path and restores interrupt state on normal completion. |
| lbHeap_80015D6C | Disables interrupts and returns zero for indices zero and one. Larger indices forward the record handle, callback and argument to lbMemory_8001529C and return its result after restoring interrupts. No local created-status check occurs. |
| lbHeap_80015DF8 | Reports six labelled heap records through OSReport. Created type-zero entries use OSCheckHeap; other created entries use lbMemory_80014F7C. Prints the returned count and size minus that count, configured size, then main and ARAM arena differences. Non-created entries print destroy. |
| lbHeap_80015F3C | Captures main and ARAM bounds, resets all six records to destroyed/transient defaults, then applies the descriptor rows until index six. Types one/four grow from a lower bound or predecessor end; type two grows backward from upper bound or predecessor start. No backing heap is created here. |

## Layout and Invariants

The descriptor rows configure slot 2 as type 1/0x800 at the lower main boundary; slot 3 as type 1/0x4F8800 after slot 2; slot 4 as type 2/0x64B400 below the upper main boundary; and slot 5 as type 4/0x96C800 at the ARAM lower boundary. Row index 6 terminates setup. Labels are Hsd, ARAM, Seq, Stay, AllM and AllA.

transient is an integer, not normalized by its setter. Reconstruction tests exact zero or one. Other values satisfy neither policy branch. All indexed APIs assume a valid index; only allocation/free/custom-operation wrappers disable interrupts. No whole-module synchronization guarantee follows.

The status getter returns LbHeapStatus unchanged. lbHeap_GetStatus replaces the inferred Boolean-style lbHeap_IsDestroyed name in the draft; canonical source stays unchanged. Other inferred names remain hypotheses.

## Uncertainty

The rendered C pages report one shared parse error and mark reconstruction parse_uncertain. The static header reports six parse errors. The public allocation declaration is marked shadowed_binding. Canonical and rendered text are fully read despite these renderer limits.

Source declarations support the registry and configuration semantics; exact section membership remains pending object evidence. lbMemory completion semantics and DVD/archive callers remain family-owned.

## Live application status

Live promotion confirmed: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbheap/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbheap/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/96b05a77c329fad2dd184041671e5249bb7ab0ba0137287e92279887535daf98/2026-09-08T14-42-25.414Z-7ca1947b-077e-4582-b636-2ff628ce6616.receipt.json). Unresolved inherited claims remain unresolved.
