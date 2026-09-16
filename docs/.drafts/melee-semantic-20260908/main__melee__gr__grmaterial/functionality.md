# grmaterial semantic review

## Scope and result
Reviewed all 608 lines of `grmaterial.c` and all 48 lines of `grmaterial.h` in both canonical and rendered form, enumerated all 81 subjects and 34 links, and assessed all 166 baseline facts. The saved ledger explicitly retains 150 facts and 32 links, supersedes five facts, and leaves eleven facts and two links unresolved. Existing role-based names are retained; no naming churn is proposed.

## Material and hierarchy utilities
The paired flag helpers operate on each attached MObj's `rendermode`, not on JObj flags. Their recursive variants process the supplied root and its descendants, without traversing the root's own next sibling. Null joints and absent materials are tolerated. The root accessor only follows parents. ID registration inserts qualifying joint addresses into the default ID table when its second argument is zero and flag `0x4000` is present; flag `0x1000` prevents descent but does not prevent registration of the node itself. This differs from material-class conversion, where mask `0x4020` suppresses only local material processing and does not prune descendants.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grmaterial.c#L76-L204 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grmaterial.c#L442-L563.

## Ground-aware rendering
The source defines an extended material-class descriptor containing reusable TEV templates. Runtime initialization registers `gr_mobj` beneath `hsdMObj` and installs the specialized setup callback. Class conversion changes compatible existing objects in place; callers ignore conversion failures. Source declarations and address comments do not establish compiled section membership, extent, or conversion-bias bytes.

Setup uses `mobj->rendermode`, not its second parameter. It configures ordinary material, texture, TEV-expression and pixel-engine state, then conditionally adds Ground-controlled color and/or alpha processing. Ground state comes from the currently rendered GObj. Register-allocation failures report and assert; the material TEV descriptor is also asserted. Appended shadow textures are detached at the end, but the global toon texture's `next` assignment is not restored. The shared TEV templates are copied before per-draw modification.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grmaterial.c#L274-L440 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/class.c#L329-L370.

## Overlay lifecycle and exceptional command behavior
Start replaces the stream, resets timer, loop and interpolation flags, clears completion, and immediately updates. Although named `x4_pri`, the assigned field is decremented as a lifetime by the shared interpreter. Update only sets the Ground completion flag on a true result; it does not clear an already-set flag on false. Stop clears stream/lifetime/reference and both ColorOverlay interpolation flags, but does not clear the separate Ground alpha override.

The sole owner-command table entry is valid for opcode 21. Dispatch performs unchecked subtraction and indexing, while the shared interpreter can forward unhandled opcodes greater than or equal to 21. The alpha handler extracts bits 2–9 and stores the resulting 0–255 value directly as a float, without normalization. It sets `Ground.x10_flags.b6` but does not advance the command cursor. Consequently, forward progress for an owner command is not established by this handler; repeated dispatch is possible if surrounding command processing leaves the cursor and timer unchanged. This is preserved as a source-level concern, not asserted to be a demonstrated runtime failure.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grmaterial.c#L503-L514, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grmaterial.c#L565-L607 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_013B.c#L159-L222.

## Stage-owned item adapters and lifetimes
The constructor pair delegates to the yaku implementation. Joint placement retains a source JObj; explicit placement copies a Vec3. Both retain Ground and optional interaction callback pointers. Missing placement and allocation failure return NULL. Successful construction selects numeric collision state 2, enters the requested item state, and then installs the touch dispatcher. Mode 1 follows joint transforms; mode 2 does not. Unexpected placement modes report and loop indefinitely.

The reset-and-state-entry wrapper has an important cross-file consequence: common state entry clears `Item.touched`. Unlike construction, the wrapper does not reinstall the yaku dispatcher. Retained callback fields therefore do not guarantee continued touch-event delivery after a state change. Stage code must also manage retained handles and source/owner lifetimes; Castle demonstrates destruction followed by explicit handle clearing and later Ground cleanup.

The hurt-capsule setter overwrites only the first capsule's endpoints and scale, with no validation or cache invalidation. The state-zero helper separately invalidates every configured hurtbox position cache. The state-two helper suppresses the reviewed non-inert item-attack path but leaves inert contact eligible; neither helper directly assigns `HurtCapsule.state`. The command-finished predicate means only that the item's command pointer is NULL, which Green Greens uses for deferred removal.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/ityaku.c#L90-L214, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1229-L1242, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itcoll.c#L634-L661 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grcastle.c#L1032-L1059.

## Rendered-view assessment
Both files rendered without parse errors. The header reports shadowed bindings for `grMaterial_801C8D44`, `grMaterial_801C8B28`, and `grMaterial_801C8CFC`, leaving those declarations unchanged despite substitutions in the C file. These are renderer limitations, not evidence against the inferred names. Parameter, field and section-label hypotheses are not rendered. All semantic conclusions above were checked against canonical behavior rather than inferred names.

Status: researched; no-change lead bypass; independent review and live promotion pending.
