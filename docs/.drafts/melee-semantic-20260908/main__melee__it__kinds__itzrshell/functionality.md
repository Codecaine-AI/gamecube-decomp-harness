## Red Koopa shell implementation

`itzrshell.c` implements the enemy-derived Red Koopa shell (`It_Kind_ZRShell`), with a thirteen-slot state table, lifecycle adapters and a nullable constructor. Its header declares the callback surface, constructor and table. This is not sufficient evidence to import the ordinary Red Shell item's homing or special reflection mechanics.

### Dispatch and event handling

The table's selector sequence is `0,0,0,1,1,1,0,1,0,0,2,3,4`. State 2 lacks a collision callback. States 5/6 share the motion-6 callback trio, and states 7/8 share the motion-8 trio, with different selectors within each pair. State 12 has no callbacks; the constructor uses it transiently, so its position at the end of the table does not establish a terminal lifetime state. Shared implementations reside in `itzgshell.c`.

The local lifecycle functions forward their object unchanged. Boolean adapters return their callee's result without transformation. Pickup resets the shared counter and interaction flag and selects state 2. Its physics checks the old counter against attribute `x2C`, then either begins restoration or increments it. Damage reception replaces horizontal velocity in states 0,1,3,4,9,10 and adds to it in states 5–8; state 11 instead takes the camera-response/state-10 branch. HitShield invokes victim rebound in states 3/4 and clank handling in states 5–8. ShieldBounced invokes shield rebound only in states 3/4. Both shared shield callbacks return false.

The canonical EnteredAir callback selects state 9 unless already in state 10 or 11. It does not itself assign `ground_or_air = GA_Air`; state 9 also has grounded collision processing. Event names, numeric motion states and ground/air classification must remain separate.

### Construction and cross-file lifetime

`it_802E0488` passes a local zero vector as initial **velocity**, not a position offset, to `it_8027B5B0`. The callee copies that vector into its spawn descriptor. A failed allocation returns NULL without the constructor's subsequent initialization. A NULL position is not an ordinary allocation-failure case: because this call supplies no joint fallback, the common spawner reports an initialization error and loops.

On success, the constructor sets facing, applies rotation setup, preserves the supplied Nokonoko variant in `zrshell.xE10`, selects state 12 and evaluates the joint hierarchy once. `it_802DDA84` updates collision positions, performs a vertical collision query and writes the resulting position back. Its successful branch initializes grounded handling, then chooses state 0 when `it_80277040` returns false or state 9 when it returns true. Its unsuccessful branch initializes airborne handling and state 1. `it_80277040` is a mutating normal/slope-response operation, not merely a pure support predicate.

The Nokonoko caller selects this constructor for variants >=2 after its conversion animation finishes while grounded. It transfers the bookkeeping field and invalidates the old object's field only when replacement creation succeeds; it nevertheless returns true from the conversion branch if creation fails. Shared shell restoration similarly passes `xE10` back to the Nokonoko constructor and transfers bookkeeping only on success, while returning true from that replacement branch even on failure.

Destruction delegates to the generator subsystem. The non-coin path uses the item's stored generator index, not an object-identity search. After an unconditional `it_8027CE18` call, an index other than -1 causes the generator entry pointer to be cleared, its respawn field to become `0x708` or -1 according to the descriptor, and the item's index to become -1. The separate coin branch performs pointer scanning.

### Semantic and rendered-name assessment

The existing inferred names `itZRShell_Logic12_Spawned`, `itZRShell_Logic12_EvtUnk` and `itZRShell_Create` remain useful hypotheses; no historical spelling is claimed. The rendered C view substitutes the constructor name, but the header reports `shadowed_binding` and leaves it unchanged. Shared motion-6 and motion-9 animation names collide on `itZGShell_Roll_Anim`, so those substitutions are withheld. These renderer issues are not evidence that the canonical functions are identical or incorrectly declared.

All owned canonical and rendered pages, all 35 subjects and all 34 links were reviewed through restored evidence. The ledger explicitly retains 74 facts, supersedes nine and leaves seven compiled-data claims unresolved. No compiled artifact was supplied, so section contents, emitted loads, padding and exact compiled layout are not asserted.

Status: synthesized; independent review and live promotion pending.
