# Ground animation semantic review

`granime.c` supplies shared stage-scene animation attachment, category-selected playback control, archive-backed animation selection, first-AObj lookup, status predicates, and archived-transform reset. Both owned files were read completely in canonical and rendered form, together with every frozen subject and link page.

## Attachment and resource lifetime

The attachment helpers pair runtime objects with optional animation descriptions. Missing subordinate AObj descriptions preserve existing controllers; qualifying replacements remove the previous AObj before loading its replacement. Texture descriptions are matched by ID, and their image-table pointers are assigned without the palette replacement performed by the generic baselib helper. Archive-backed data therefore remains relevant after attachment. The JObj helper promotes only the first FObj with type `0xC`, not an arbitrary sorted ordering. Hierarchy attachment processes the current node before checking the `0x1000` child-descent barrier. Optional descriptor trees advance independently.

Archive-holder teardown distinguishes ownership modes 0 and 1, the pointer sentinel, and unrecognized modes. Every non-null holder is zeroed, even when no deallocation occurs. Pokémon Stadium explicitly clears its retained holder pointer before starting the replacement resource load.

## Traversal and playback

The decoded-payload helper and public variadic entry traverse selected JObj, DObj, MObj, TObj, shape-PObj, and RObj attachments. The PObj callback branch examines the attached head rather than walking a PObj next-list. Display eligibility and RObj processing are separate; child traversal requires both a nonzero recursion argument and absence of the instance barrier.

Callback masks (`0x220`, `0x7484`, `0x100`) and animation-request masks (`0x81`, `0x416`, `8`) are distinct domains. The paired wrappers preserve recursive versus node-local behavior. Frame requests and rate changes are not immediate pose evaluation. The full animation-set replacement entry separately removes attachments, installs available channels, requests frame zero, optionally enables `0x20000000` (`AOBJ_LOOP`), and evaluates the hierarchy.

The local callback dispatcher must not be described as an exact baselib equivalent. Cases 0, 4, and 8 call through `Event` without explicit arguments; all three floating groups pass AObj, owner, owner tag, and float; the remaining payload groups dereference `int*`. These canonical expressions do not establish standard-C callback compatibility or compiled argument delivery. Existing wrapper roles are retained with this explicit uncertainty rather than treating rendered names as proof.

## Queries and reset

First-AObj lookup uses the actual baselib AV callback convention, captures one result, and abandons traversal through a shared setjmp/longjmp context. No match returns null. The shared jump context and loop-bound globals are not per-call storage suitable for overlapping operations.

The two status predicates are different: `0x40000000` is `AOBJ_NO_ANIM`, whereas `0x04000000` is `AOBJ_REWINDED`. The latter is set by the interpreter's looping end-boundary wrap or clamp branch and cleared by its alternate branch. It is not the neighboring stopped-state predicate. Neither predicate establishes that every animation in a hierarchy has reached the same state. Existing `bool` declarations used as indices remain explicitly distinguished from inferred index domains.

The archived-joint selector overwrites its current pointer with the child recursion result before testing `next`. It must not be silently normalized into ordinary full-tree preorder traversal or assumed equivalent to Ground's live-joint indexing for arbitrary trees. Its reset consumer restores eligible descendants through `HSD_JObjResetRST`.

The light-animation entry performs only a discarded shared-object lookup and an archive assertion. Its rendered name should identify a validation stub, not imply animation mutation.

## Disposition

The checkpoint explicitly retains 225 facts and all 41 links, marks eight compiled-section claims unresolved, and supersedes seven facts. The proposal below changes only the supported dispatcher explanations, four misleading or colliding names, and the descriptor-walk explanation. No source, KB, entity, or link writes were performed. Section sizes, padding, placement, and compiler-emitted dispatch tables are not established by this source review.

Status: researched; no-change lead bypass; independent review and live promotion pending.
