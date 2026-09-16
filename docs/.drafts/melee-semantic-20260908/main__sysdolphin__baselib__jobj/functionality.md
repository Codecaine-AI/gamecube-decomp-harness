# JObj semantic review

## Scope and outcome
Reviewed all 1,579 canonical and rendered lines of jobj.c, all 758 canonical and rendered lines of jobj.h, all 158 frozen subjects, all 277 baseline facts, and all 27 baseline links. The checkpoint ledger contains 243 retained facts, 17 superseded facts, 17 unresolved facts, 26 retained links, and one unresolved link. The proposal contains 17 factual corrections and no links, entities, merges, or follow-ups.

The rendered views performed zero substitutions and reported eight C-file and three header parse errors. Shadowed, parse-uncertain, and foreign-owned inline bindings were not treated as proof. Existing names were retained rather than cosmetically rewritten; misleading names such as AddNext and DeleteRObj already have useful behavioral explanations.

## Construction and ownership
The class bootstrap installs lifecycle, loading, matrix, and display methods. Allocation uses the selected default class or the built-in JObj class; explicit descriptor class lookup bypasses that fallback. Initialization propagates parent failure and otherwise sets unit scale and raw matrix dirtiness. Loading constructs applicable child and sibling nodes, copies descriptor rotation xyz, scale and position, initializes the matrix, optionally allocates an envelope matrix, and registers the descriptor address as an ID. Spline and particle data are borrowed; particle-list words receive bit 31. Reference resolution is a separate paired traversal after construction. Instance children are resolved through the ID table and retained without rewriting the referenced child's parent.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L602-L714 and #L1466-L1571.

Ordinary and individual references have distinct terminal representations. Ordinary zero decrements to 0xFFFF, which ref_CNT exposes as -1; an already-terminal ordinary count or already-zero individual count also satisfies its decrement helper. Ordinary unref can temporarily pin the individual domain while releasing relationships. RObj references use the individual domain; AObj scene references and instance children use ordinary references. Relationship cleanup precedes ID removal and local matrix/vector freeing. Retained descendants need not be destroyed immediately. Current-JObj replacement retains before releasing, whereas class amnesia directly clears the slot without unref.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/object.h#L74-L119; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L716-L736, #L1053-L1063 and #L1480-L1539; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L570-L585; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L220-L240.

## Hierarchy and attachment operations
Walkers visit the supplied root and descendants in preorder, not the root's following siblings. Descendant tags distinguish first child from later sibling; the callback's third parameter is s32 despite the helper's local u32. NULL callbacks suppress calls, not traversal. Instance nodes stop child descent. Descriptor reset follows corresponding children and leaves unmatched runtime subtrees unchanged; quaternion w is not copied.

Single-node removal promotes a sole child and clears links before unref. RemoveAll detaches a sibling suffix. Reparent returns the old successor and appends the detached node to a nullable new parent. AddNext wraps the selected old sibling level beneath the supplied node rather than merely adding a sibling. DObj/RObj insertion prepends; DeleteRObj only unlinks and clears next, without destruction.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L57-L127 and #L740-L983; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L154-L156.

## Animation and channel semantics
Attachment, request, evaluation, and removal distinguish one-node operations from instance-bounded subtree wrappers. Descriptor trees advance independently when absent or exhausted. Requests forward the frame and selection mask; AObj request records the frame and FIRST_PLAY, whose first interpretation uses zero advancement. Evaluation processes dependencies, AObj, RObjs, and eligible DObjs. The public subtree evaluator brackets traversal with animation-end callback phases.

JObjSortAnim promotes only the first TYPE_JOBJ FObj. Canonical TYPE_JOBJ is 12, and FObj evaluation forwards obj_type as the update channel. JObj channel 12 is branch visibility, not a generic joint-transform channel. This corrects the existing priority explanation without changing the supported list-rewiring facts.

JObjUpdateFunc applies path, transform, visibility, custom, event, raw-matrix, and decomposition channels. Path progress is clamped to [0,1]; tiny scale magnitudes become positive 0.001; visibility uses a strict >0.5 threshold. SETBYTE reads iv but calls a callback taking f32. ROTX tests the JOINT1 bit rather than exact role equality. Raw matrix-column writes and decomposition bypass transform setters. HSD_ObjData has fv, iv and Vec3 p, with no pointer arm. The callback also serves RObj updates.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L198-L565; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/aobj.c#L91-L174; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.h#L29-L30 and #L64-L68; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/fobj.c#L387-L387.

## Matrix cache and flags
Matrix construction maintains accumulated scale storage, selects Euler or quaternion SRT, concatenates the parent matrix, and optionally overrides translation using an AObj-referenced JObj. Setup calls are dirty-gated and do not guarantee user-defined matrices are rebuilt.

The header dirty predicate is false for every user-defined matrix, even with raw JOBJ_MTX_DIRTY set. Dependency checking uses the parent's predicate in user mode but the parent's raw bit in ordinary mode. Dirty propagation marks a node before testing its instance boundary; instance children can therefore be marked, while descent stops below them. Raw-dirty user-matrix children can be revisited.

SetFlags and ClearFlags test pre-mutation XOR of classical-scale bits, not actual state change. Clearing an already-set classical-scale bit misses invalidation; other combinations can invalidate without changing that mode. ClearFlags can subsequently clear a newly set dirty bit if the supplied mask includes it. SetAll/ClearAll test the updated instance bit, allowing the supplied mask to close or open traversal immediately.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.h#L225-L264; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L30-L55, #L138-L196, #L993-L1043 and #L1385-L1459.

## IK and exceptional paths
IK1 derives the nominal bend solution from hinted lengths, accumulated scale, target position, optional bend reference, and twist. Missing effector nodes assert; an existing effector lacking the required subtype-1 reference instead yields NULL. The near-zero-distance branch does not establish initialization of var_f27, var_f28, sp74 or sp80 before later use, so a safe straight fallback is not proven. Bend reversal uses mask 0x4, bit index 2.

IK2 consumes the effector's stored translation and scales output by scl or unit fallback, not directly by local scale. Missing effector nodes assert before its nullable-result/parent early return. Optional lower-limit processing takes precedence over the upper limit. Epsilon normalization does not guarantee a valid orthogonal basis for degenerate inputs. Generic IK behavior is supported; specific slope-foot-planting mappings remain unresolved.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L1065-L1443.

## Display, summaries, and cross-file consumers
Ordinary display independently tests direct-pass and subtree-pass bits. Visible instances compose current-camera view with instance matrix and inverse referenced-child matrix, rather than simply forwarding the incoming view matrix. Downstream display accepts NULL view matrices via camera fallback and exposes a retained current-JObj scope around DObj dispatch.

Root-mask bits summarize opaque, translucent and texture-edge rendering, not transform dependencies. UpdateParentTrspBits adds contributions through parent links. RecalcParentTrspBits only clears unsupported contributions, advances through next links, and stops at the first unchanged node.

The effect library registers the dynamic-particle callback, whose bank 0x1E branch selects stage effects and otherwise calls the particle spawner. Fighter-parts loading installs ftIntpJObj, loads, then clears the override; its loader temporarily suppresses DObj descriptors. Effect teardown uses the generic walker. These concrete cross-file uses were checked against canonical source.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L567-L600 and #L799-L907; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/displayfunc.c#L278-L338; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ef/eflib.c#L178-L181, #L237-L283 and #L1005-L1014; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftparts.c#L62-L78 and #L500-L507.

## Compiled-data limits
Source establishes declarations and consumers, not section membership or ordering. The archived object dump was inspected but not independently bound to this revision's compilation. Its bytes conflict with baseline rodata assertion-string and sdata unused-array explanations. Those layout claims remain unresolved rather than being replaced with another unvalidated layout.

Status: researched; no-change lead bypass; independent review and live promotion pending.
