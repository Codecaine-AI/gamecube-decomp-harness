## __GXVerifyTEV semantic review

The assembly validates cached TEV configuration through `__gxVerif`, reports diagnostics through its callback, and updates cached register validity state. The filename fits this behavior. There are no frozen subjects, facts, links, or proposed-name substitutions to correct.

### Stage validation
- Derives a stage count of 1–16 from a four-bit field plus one and initializes four four-word local tracking arrays. Stage configuration uses paired words indexed from 0xc0/0xc1; order information is selected by stage parity. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/__GXVerifyTEV.s#L1-L149)
- At verification level >=1, checks stage-word high-byte sentinel 0xff and disabled texture inputs separately for all four color and alpha operands. A separate level >=2 channel-availability check emits callback severity 1, so the gating level and reported severity are not interchangeable. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/__GXVerifyTEV.s#L37-L437)
- Register-source checks combine cached sentinel state with absence of a preceding local write. Color selectors 0–7 choose color or alpha tracking by parity; alpha selectors 0–3 use alpha tracking. Diagnostics 0x24/0x25 include operand and stage context. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/__GXVerifyTEV.s#L438-L1083)
- Level >=3 checks separate hazard flags for the first three color and alpha operands, not the fourth. Outputs then mark destination components as written and replace their hazard flags. Both hazard computations test the alpha word's low two bits, followed by the respective color/alpha word's bit 19 (LSB numbering); this must not be rewritten as symmetric bias tests. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/__GXVerifyTEV.s#L1084-L1543)

### Persistent effects and final checks
After stage traversal, each locally written color/alpha register component has its cached high byte changed to 0xff, preserving its low 24 bits. This mutation is not gated by warning level; the routine is not a read-only validator. Local tracking ends with the call, while these cached mutations persist for external consumers. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/__GXVerifyTEV.s#L1544-L1590)

Tail checks use configuration at offsets 0x1098/0x109c and the last stage's texture-enable value, check nonzero final destination selectors at level >=2, and check final hazard conditions at level >=3. Warning 0x2e requires level >=2 and bit 6 at offset 0xdd4; it is suppressed when the tested two-bit field at 0x1094 is zero and both tested three-bit fields equal 7. Diagnostics continue rather than returning at the first failure. Formatted messages reuse `__gxvDummyStr`; callback ownership or retention of that buffer is not established here. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/nonmatchings/__GXVerifyTEV.s#L1591-L1767)

### Assessment
All canonical and rendered pages were reviewed. Rendered text contains zero substitutions and reports 2356 parse errors; it supplies no independent semantic proof. No knowledge changes are proposed. Warning wording, external sentinel initialization/reset behavior, and compiled section/layout properties are not established by this file.

Status: synthesized; independent review and live promotion pending.
