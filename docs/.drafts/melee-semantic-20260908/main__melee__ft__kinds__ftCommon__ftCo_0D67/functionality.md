# Neutral-special input predicate

ftCo_800D67C4 receives a Fighter pointer, not a Fighter_GObj. It returns true only for a B bit in pressed_buttons with both absolute lstick[0] axes strictly below the configured x218/x21C bounds. It makes no writes and does not enter a move. Equality at either boundary returns false; this is a rectangular neutral region, not a radial-distance check.

The fighter input-age caller sets x689=0 for true and increments it only below 255 for false. ftCo_800D6824 requires a nonnull ftData_SpecialN callback and zero age before dispatch. This independently supports the retained inferred name ftCo_SpecialN_HasInput.

## Storage and coverage

The existing object contains one four-byte zero literal @100 in source-built .sdata2 with WRITE|ALLOC flags3. The split reference has flags2 (ALLOC), eight bytes comprising the zero plus a four-byte gap. Report contribution is 8 bytes; object and frozen report hashes are recorded. The raw instruction/relocation bytes reference the constant pool from the predicate; no build or report regeneration ran. Exact shared ABS macro ownership remains external.

All 15 owned C lines and 41 dependency lines were read canonical and rendered; all parse without error. No paired header is assigned. Two targets, source entity and empty parameter entity are accounted. Six baseline facts: four retained, two superseded for obsolete field spelling and precise callback guard. Add a section type and source purpose, for four total writes.

## Evidence

- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_0D67.c#L4-L14 — Pressed B plus two strict absolute-axis comparisons, no mutation.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1741-L1745 — True resets x689; false saturates age at 255.
- code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Attack100.c#L44-L55 — Zero input age dispatches nonnull kind-specific SpecialN callback.

Independent metadata repair distinguishes writable source ELF flags3 from nonwritable split-reference flags2; proposal type fact now states both variants explicitly.
