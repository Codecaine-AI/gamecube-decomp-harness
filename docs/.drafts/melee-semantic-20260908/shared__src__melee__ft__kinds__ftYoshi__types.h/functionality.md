## Yoshi shared type declarations

`src/melee/ft/kinds/ftYoshi/types.h` is a declaration-only header defining fighter variables, attribute structures, auxiliary unknown structures, and motion-specific variable alternatives.

- `ftYoshi_FighterVars` contains a `Vec3` and an `Item_GObj*`. Their offset comments do not establish runtime purpose or item ownership/lifetime. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/types.h#L10-L13)
- `ftYoshiAttributes` contains predominantly offset-named scalar fields and padding, with explicitly named `specials_start_gravity` and `specials_start_terminal_vel`. The source includes a size assertion of `0x138`; this review does not independently verify compiled layout. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/types.h#L15-L83)
- `ftYs_DatAttrs` is a separate declaration containing padding, unknown fields, `specialhi_base_angle`, and `speciallw_star_offset`, with a source size assertion of `0x120`. Neither equivalence with the other attribute structure nor precise runtime semantics follows from these declarations alone. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/types.h#L85-L106)
- `S_UNK_YOSHI2` contains three signed integers and a byte pointer; `S_UNK_YOSHI1` contains a signed integer and a pointer to that structure. The index-like names do not establish bounds conventions or allocation lifetimes. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/types.h#L108-L118)
- `ftYoshi_MotionVars` is a union with neutral-special, side-special, up-special, and guard alternatives. Neutral special declares four one-bit fields; the other alternatives contain integers, floats, padding, a Boolean, and an unknown-typed field. This establishes overlapping alternatives, not transition rules, initialization requirements, or numeric state meanings. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/types.h#L120-L157)

## Semantic review

The inherited research reviewed all 160 canonical and rendered lines. The rendered view reports six parse errors and zero substitutions, and marks `ASSERT_SIZE` parse-uncertain; it supplies no independent naming evidence. There are no frozen subjects, facts, or links to retain or correct. No supported semantic rename or factual correction was identified, so the proposal is empty.

The lead reconciled the handoff with both artifacts and independently checked canonical lines 108–160. The auxiliary-structure evidence link above corrects a malformed revision hash in the inherited document; its substantive explanation is retained. Deferrals concerning opaque fields, numeric states, pointer lifetimes, runtime transitions, and attribute interchangeability are accepted because the declarations alone do not establish those behaviors.

Status: synthesized; independent review and live promotion pending.
