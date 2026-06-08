# Melee PR Review QA Standards

Use this as the review checklist for decomp PRs and worker output. Code should
look like maintainable original C, and matching-only tactics should be backed by
local build, objdiff, or regression evidence.

## Source Rules

- Recover natural loops with ordinary `for`, `while`, or `do while` forms when
  repeated blocks vary only by an index, pointer, or counter.
- Prefer typed fields over pointer math: real struct fields first, then correct
  `GroundVars`, `FighterVars`, or `ItemVars` union arms, then temporary internal
  structs with explicit padding, then `M2C_FIELD`, with raw pointer arithmetic
  only as a last resort.
- Map expanded header asserts back to existing inline helpers when possible.
  For `jobj.h`, use the assert line number to choose the matching `HSD_JObj*`
  helper. Use `GET_JOBJ` only when surrounding source shape or objdiff evidence
  supports it.
- Use project assert/report macros such as `HSD_ASSERT`, `HSD_ASSERTMSG`,
  `HSD_ASSERTREPORT`, `OSReport`, or `OSPanic` when they represent the source
  behavior.
- Keep constants, strings, and float literals inline unless symbol metadata,
  section placement, or surrounding source proves named data ownership.
- Prefer canonical control flow and project macros such as `ABS`, `MIN`, `MAX`,
  and `CLAMP` when the assembly shape suggests them.

## Matching Tactic Rules

- Require targeted evidence before keeping tactics such as `PAD_STACK`,
  declaration-order steering, branch-local lifetime tweaks, dummy stack locals,
  volatile locals, manual inline expansion, direct global access instead of a
  struct path, or padded temporary structs.
- Avoid new pragmas, `register`, and inline assembly. If one is unavoidable,
  scope it tightly and prove it does not disturb adjacent functions.
- Treat `M2C_FIELD`, raw offsets, and fake-looking control flow as temporary
  bridge code unless the project has no cleaner evidenced representation.

## Data, Naming, And File Rules

- Respect `.sdata`, `.sdata2`, `.sbss`, `.rodata`, and `.data` placement as
  part of the match. Fix bad symbol size/type metadata rather than adding dummy
  C storage.
- Use semantic names only when the role is evidenced. Keep address-style names
  such as `fn_<addr>` or `lbl_<addr>` when semantics are not proven.
- Update prototypes and headers when a function body proves the signature.
  Avoid fake source-local declarations when an owning header should carry the
  declaration.
- Keep broad formatting, renames, and labeling changes separate from semantic
  matching changes when possible.

## Verification Rules

- Run narrow touched-object builds when possible and full `ninja` before
  handoff when the blast radius is nontrivial.
- Run objdiff or checkdiff for every claimed matched symbol or unit.
- Inspect adjacent functions when changing pragmas, includes, data, literals, or
  TU ownership.
- Report broken matches, fuzzy regressions, and metric regressions explicitly.
- Keep tool or regression-gate changes separate from decomp source changes.
