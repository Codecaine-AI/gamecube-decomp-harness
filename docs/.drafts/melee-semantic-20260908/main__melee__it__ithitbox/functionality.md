## Item hitbox utilities

The complete canonical and rendered views of `ithitbox.c` and `ithitbox.h` were reviewed independently. All 56 subjects and 28 links were enumerated. The ledger accounts for all 115 baseline facts: 112 retained, two compiled-section claims unresolved, and one game mapping superseded. All 28 links are retained.

The unit initializes neutral Item combat bookkeeping and provides paired single-bit and grouped xDCD/xDCE configuration commands. These commands do not themselves activate capsules or select motion states. Scale operations distinguish absolute assignment from multiplication and operate only on non-disabled capsules; indexed operations do not validate their indices. Damage multiplication forwards each enabled capsule's current effective damage through an unsigned-input assignment helper, which reapplies valid-fighter-owner processing and has a separate Y-scale branch.

The xD0C setters select numeric modes 2 and 0. Mode 2 suppresses the non-inert item-attack-versus-item-hurtbox branch, not inert contact or every collision path. Mode-zero restoration also invalidates configured hurtbox position caches rather than immediately recomputing their endpoints. Shell callers independently control cooldown timing, x40_b0 restoration, and optional mode restoration; the Adventure shell has an exceptional state-0xB response path.

The bounds wrapper refreshes two displacement fields and three translated bound components in xB54 through ordered delegates. The Unk4 helper marks every non-disabled attack capsule and sets xDAA.b2 only when such a capsule exists; an all-disabled invocation leaves that flag unchanged. Endpoint replacement is separate, copies the second vector to x58 before the first to x4C, retains neither input pointer, and does not set a dirty flag.

The queries are read-only. One reports any non-disabled capsule; the other performs an enabled-presence scan followed by a zero-seeded maximum-damage reduction. Disabled slots are ignored, and negative or NaN damage values cannot raise the accumulator. The queried field is effective damage, not necessarily unmodified configured base damage.

Existing rendered names fit these demonstrated roles and are retained without cosmetic rewriting. Rendered callee names were not used as independent proof. No renderer parse or substitution issues were observed, and no compiled section-size or literal-layout claim is made.

Status: synthesized; independent review and live promotion pending.
