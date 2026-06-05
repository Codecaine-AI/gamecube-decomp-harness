# Matching Tactics

Use this reference when actively trying to improve objdiff/checkdiff output for `doldecomp/melee`.

## Contents

- Target selection
- Control flow
- Locals and register allocation
- Stack layout
- Inlines and helpers
- Structs and unions
- Data and literal ordering
- Translation unit splits
- Verification loop
- Blocked-state checklist

## Target Selection

Prefer targets with a narrow reason for mismatch:

- high fuzzy percentage
- nearby matched functions in the same subsystem
- known wrong call, relocation, literal, stack frame, or branch shape
- repeated code suggesting an inline/helper
- stable neighboring functions and low risk of data-section movement

Good target-finding examples:

- [#2200](https://github.com/doldecomp/melee/pull/2200): permuter on high-percent functions.
- [#2195](https://github.com/doldecomp/melee/pull/2195): `tools/easy_funcs.py` for promising functions.
- [#2546](https://github.com/doldecomp/melee/pull/2546): TU split inference from repeated floats, strings, assert filenames, and object names.

## Control Flow

MWCC codegen is sensitive to loop and branch shape. Try these before accepting awkward code:

- `for` vs `while` vs `do while`
- pulling allocation/setup out of loops
- replacing helper traversal with direct equivalent control flow
- narrowing temporary declarations to branch-local scope
- converting unnatural `goto next` patterns into `continue` when it still matches
- flattening or unflattening branches to match load/store order

Examples:

- [#2571](https://github.com/doldecomp/melee/pull/2571): loop rewrite plus allocation movement.
- [#2570](https://github.com/doldecomp/melee/pull/2570): while-to-for conversion.
- [#2236](https://github.com/doldecomp/melee/pull/2236): direct control-flow traversal instead of a near-match helper.
- [#2491](https://github.com/doldecomp/melee/pull/2491): review suggested cleaner flow for direct string reference.

## Locals and Register Allocation

Register allocation changes with local order, lifetime, and aliasing. Useful knobs:

- introduce a second local pointer to force a register copy
- declare locals in the order the original materializes addresses
- keep temps inside the branch that uses them
- split a calculation into named local steps
- reorder component calculations to match load/multiply/add schedule
- use a volatile local only when needed to preserve an assert path
- cache floating constants if the original keeps them in an FPR

Examples:

- [#2556](https://github.com/doldecomp/melee/pull/2556): extra `HSD_JObj*` local fixed allocation.
- [#2503](https://github.com/doldecomp/melee/pull/2503): branch-local locals, component order, volatile assert preservation.
- [#2507](https://github.com/doldecomp/melee/pull/2507): local declaration order affected address materialization.
- [#2515](https://github.com/doldecomp/melee/pull/2515): cached floating constants and FPR allocation.
- [#2458](https://github.com/doldecomp/melee/pull/2458): local lifetime/order only.

## Stack Layout

`PAD_STACK` is common but should not be the first explanation. It can hide:

- missing inline/helper
- wrong struct size or padding
- wrong temporary lifetime
- wrong array size
- pragma leakage into neighboring functions

Use `PAD_STACK` only when the remaining mismatch is clearly stack-frame shape and the source is otherwise reasonable.

Examples:

- [#2452](https://github.com/doldecomp/melee/pull/2452): scoped temp plus removal of an extra `PAD_STACK`.
- [#2373](https://github.com/doldecomp/melee/pull/2373): repeated stack shape suggested a possible inline.
- [#2349](https://github.com/doldecomp/melee/pull/2349): discussion treated `PAD_STACK` as tolerated technical debt.

## Inlines and Helpers

Inlines are high leverage:

- restore small wrappers when the original likely had one
- extract repeated sequences when multiple functions share the same mismatch
- compare against existing fighter/item/ground helpers
- beware that helper accessors can change codegen and break a match

Examples:

- [#2510](https://github.com/doldecomp/melee/pull/2510): static inline wrapper forced the original register-copy shape.
- [#2509](https://github.com/doldecomp/melee/pull/2509): free-list pop factored as a static inline following an existing pattern.
- [#2380](https://github.com/doldecomp/melee/pull/2380): direct `HSD_GObjGetUserData` matched better than a helper accessor.
- [#2241](https://github.com/doldecomp/melee/pull/2241): existing `jobj.h` assert behavior mattered.

## Structs and Unions

Prefer source that improves type knowledge:

1. actual field or real struct
2. correct `GroundVars`, `FighterVars`, or `ItemVars` union arm
3. temporary internal struct with a TODO
4. `M2C_FIELD`
5. raw pointer arithmetic only when no better type is known

Use `GET_GROUND`, `GET_ITEM`, `GET_FIGHTER`, `GET_JOBJ`, and domain-specific `GObj` typedefs when available.

Examples:

- [#2373](https://github.com/doldecomp/melee/pull/2373): reviewers preferred `GET_GROUND`, temporary structs, and `M2C_FIELD` over offsets.
- [#2281](https://github.com/doldecomp/melee/pull/2281): create per-type `ItemVars` union arms rather than overloading a generic arm.
- [#2237](https://github.com/doldecomp/melee/pull/2237): struct padding fixed a hidden offset mismatch.
- [#2217](https://github.com/doldecomp/melee/pull/2217): raw pointer arithmetic was called cleanup debt.

## Data and Literal Ordering

Data ordering often blocks matches even when source shape looks right.

Check:

- `.sdata`, `.sdata2`, `.rodata`, `.sbss`, `.data`
- local static placement
- assert/report string ownership
- unused includes that add literals
- symbol size and split metadata
- wrong function calls and wrong float literals

Examples:

- [#2568](https://github.com/doldecomp/melee/pull/2568): local double constants and unused include removal affected `.sdata2`.
- [#2469](https://github.com/doldecomp/melee/pull/2469): new source bodies shifted local data and neighboring displacements.
- [#2358](https://github.com/doldecomp/melee/pull/2358): hard `.sdata2` ordering problem.
- [#2247](https://github.com/doldecomp/melee/pull/2247): fix symbol metadata instead of inventing a static.
- [#2294](https://github.com/doldecomp/melee/pull/2294): use relocation-aware diffing for wrong calls/literals.

## Translation Unit Splits

Use these clues for TU boundaries:

- assert filenames
- unique string clusters
- repeated floats
- object/struct names
- extab/extabindex cut points
- section ownership of `.data`, `.sdata`, `.sdata2`
- functions that must share strings or literals

Verify splits at object/TU level and check neighboring files.

Examples:

- [#2546](https://github.com/doldecomp/melee/pull/2546): item TU resplit.
- [#2488](https://github.com/doldecomp/melee/pull/2488): sysdolphin baselib split by extab/extabindex and data sections.
- [#2559](https://github.com/doldecomp/melee/pull/2559): files sharing strings may need to be merged.

## Verification Loop

Typical commands:

```bash
python configure.py --require-protos
ninja
ninja build/GALE01/path/to/file.o
build/tools/objdiff-cli diff -p . -u <unit> <symbol>
ninja progress
```

Check the narrow target first, then adjacent functions and the full object when data, pragma, include, or split changes are involved. Some PR notes mention `tools/checkdiff.py`, but this local checkout uses `build/tools/objdiff-cli` and the objdiff GUI.

## Blocked-State Checklist

When stuck:

- try another loop form
- move locals into/out of branches
- reorder declarations
- split or combine temporaries
- add or remove a small static inline
- inspect relocation differences
- verify struct size and padding against raw bytes
- search for matching helper/assert patterns in headers
- check TU boundary and string/literal ownership
- run permuter only after semantics are close
