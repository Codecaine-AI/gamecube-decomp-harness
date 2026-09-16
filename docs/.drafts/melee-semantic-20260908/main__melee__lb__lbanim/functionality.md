# Figa Animation Adapter

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files are reviewed through EOF in canonical and rendered views: 146 C lines and 32 header lines. All 20 writable subjects and 31 inherited facts are accounted for.

The two loaders replace one JObj animation controller with Figa-derived AObj/FObj state. `lbAnim_8001E6D8` constructs the full descriptor list; `lbAnim_8001E7E8` constructs the accepted prefix before the first type5/6/7 descriptor. Both configure masked flags, rewind 0 and end-frame metadata, move the first TYPE_JOBJ channel to the head, and set or clear classical scaling from tree type bit 0. The accessor returns tree->frames or zero for null.

| Canonical Function | Lines | Behavior |
|---|---:|---|
| `lbAnim_InitFrames` | 9-36 | Allocates one HSD_FObj per FigaTrack for a positive signed count, copies timing/channel/stream metadata, sets flags to zero, links nodes in input order and null-terminates the final node. A nonpositive count skips allocation and reaches fobj->next with an uninitialized local; the helper does not provide an empty-list result. |
| `fn_8001E60C` | 38-67 | Builds an HSD_FObj list from the initial accepted prefix of a FigaTrack sequence. Types 5, 6 and 7 are rejected, but track advances only after acceptance, so the first rejection prevents later descriptors from being reached. A nonpositive count or first-track rejection leaves fobj uninitialized at the final next-pointer write. |
| `lbAnim_8001E6D8` | 89-112 | For a non-null JObj and nonzero signed count, removes any existing AObj, allocates a replacement, sets tree end frame, sets rewind to zero, attaches the full constructed FObj list and moves the first TYPE_JOBJ channel to the head. It sets or clears JOBJ_CLASSICAL_SCALE from tree->type bit 0. Safe construction requires a positive count despite the weaker outer guard. |
| `lbAnim_8001E7E8` | 114-137 | For a non-null JObj and nonzero signed count, replaces its AObj using tree end frame, zero rewind and fn_8001E60C channel construction, then promotes the first TYPE_JOBJ channel and synchronizes JOBJ_CLASSICAL_SCALE. The filtered constructor retains only the prefix before the first type5/6/7 descriptor, and requires a positive count with an accepted first descriptor. |
| `lbAnim_8001E8F8` | 139-145 | Returns tree->frames unchanged when tree is non-null, otherwise 0.0F. Performs no writes, allocation or callbacks. The same metadata field configures end-frame values in the two local JObj loaders. |

The inline `lbAnim_JObjSortAnim` helper, lines 69-87, moves the first TYPE_JOBJ node to the head and leaves other nodes in order. It handles null and empty lists. The header owns FigaTrack and FigaTree declarations, the public interfaces and forward includes; no type entity exists in this manifest for promotion.

## Inputs and State

FigaTrack supplies start frame, object type, fractional encoding, animation-stream pointer and length. FigaTree supplies AObj flags, end frame and classical-scale selection. FObj allocation is independently confirmed to clear memory. Each constructor explicitly clears node flags, copies the descriptor fields, links nodes and terminates the last node. Neither loader requests or evaluates animation frames here; installation is its local operation.

Both constructors use uninitialized final-node locals when the signed count is nonpositive. The alternate constructor also does so when its first descriptor is rejected. The outer loaders check nonzero rather than positive counts. A rejected track does not advance the pointer, so this is prefix construction, not arbitrary filtering through the rest of the array. Existing facts that implied broader safe inputs are superseded.

## Naming and Remaining Review

Canonical `lbAnim_InitFrames` stays authoritative. Existing `lbAnim_InitFramesFiltered` and `lbAnim_GetFrameCount` aliases remain hypotheses with their original fact IDs and versions. No name is promoted. The header renderer reports shadowed_binding for fn_8001E60C, whereas the C renderer substitutes its alias; both views were read.

Fact decisions: {'unresolved': 5, 'retain': 14, 'supersede': 12}. Proposed writes: 12. Thirteen parameter entities have explicit reviewed_empty records. Three physical .sdata2 claims and two character-specific accessor caller claims remain unresolved. Exact evidence, source/render hashes and IDs are in findings.json.

No source edits, shared KB writes, matching, publication or UI startup occurred. Independent review remains pending.

Dry-run passed: 12 accepted operations, zero rejected. Proposal SHA-256 `591d9d0aa4fad88895dbc350fcb6ebdd72e8d32c51a869f42b58061582124a4a`. Review UTC interval 2026-09-08T14:35:08.246000+00:00 to 2026-09-08T14:38:08.099242+00:00, 180 seconds.

Independent flag review correction: The new AObj starts with AOBJ_NO_ANIM; HSD_AObjSetFlags masks tree->flags to AOBJ_LOOP | AOBJ_NO_UPDATE and ORs those bits into the existing flags. Three data-flow facts were superseded to remove direct-copy wording.

## Live application status

Live promotion confirmed: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbanim/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbanim/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/591d9d0aa4fad88895dbc350fcb6ebdd72e8d32c51a869f42b58061582124a4a/2026-09-08T14-44-40.558Z-d219bc77-b275-40ce-8530-63400a8468eb.receipt.json). Unresolved inherited claims remain unresolved. Proposal and review hashes preserved.

Verified completion: live promoted. [final-render.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbanim/final-render.json>) and [staged-completion.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbanim/staged-completion.json>).
