# Review Standards

Use this reference before opening a PR, reviewing generated code, or deciding whether a match is too fake for `doldecomp/melee`.

## Contents

- Quality bar
- Preferred source forms
- Anti-patterns
- Assertions and reports
- Pragmas
- Includes and names
- Fake matches
- PR checklist

## Quality Bar

A contribution should improve the project, not only the match count.

Acceptable source should:

- match or clearly improve objdiff/checkdiff
- preserve or improve type information
- follow local subsystem style
- avoid unsafe behavior introduced by fake C
- leave future contributors with less cleanup, not more

If the source is byte-perfect but obviously fake, keep iterating or document the tradeoff.

## Preferred Source Forms

Use this order when translating unknown memory access:

1. named field on the actual struct
2. correct domain union arm
3. temporary struct that documents the current hypothesis
4. `M2C_FIELD`
5. raw offset cast only when the type is genuinely unknown

Prefer:

- `GET_GROUND`, `GET_ITEM`, `GET_FIGHTER`, `GET_JOBJ`
- typed `Ground_GObj`, `Item_GObj`, `Fighter_GObj` style aliases when they carry useful domain information
- per-item/per-stage union arms instead of one overloaded generic union arm
- real struct padding when byte offsets prove it
- names that describe purpose or source role

## Anti-Patterns

Reject or clean up:

- `NOT_IMPLEMENTED` in submitted source
- raw `u8*` pointer arithmetic where project types exist
- C99 loop-variable declarations if the repo/compiler mode rejects them
- template text or generated comments
- unverified semantic comments from AI
- fake statics to force data order
- fake helper functions only for `.sdata2` order
- redefining project macros for one function
- unscoped pragmas
- inline assembly outside SDK-like code
- PR titles that claim a match not supported by the diff
- zero-progress source bodies
- code that writes out of bounds or uses wrong pointer scaling
- format strings with missing varargs

Examples:

- [#2217](https://github.com/doldecomp/melee/pull/2217): reviewer pushed back on raw pointer arithmetic.
- [#2510](https://github.com/doldecomp/melee/pull/2510): reviewer rejected macro redefinition to influence data placement.
- [#2231](https://github.com/doldecomp/melee/pull/2231): reviewer rejected inline assembly for normal game code.
- [#2373](https://github.com/doldecomp/melee/pull/2373): reviewer preferred struct/`M2C_FIELD` cleanup over pointer math.

## Assertions and Reports

Use existing project macros:

- `HSD_ASSERT`
- `HSD_ASSERTMSG`
- `HSD_ASSERTREPORT`
- `OSReport`
- `__FILE__` where the macro path supplies a filename

Do not:

- manually declare assert strings that macros should create
- replace proper `OSReport`/assert usage with raw string addresses
- redefine `HSD_ASSERT`
- invent assert helpers already available in headers
- pass a format string without the required varargs

Examples:

- [#2433](https://github.com/doldecomp/melee/pull/2433): use `HSD_ASSERT` with implicit strings.
- [#2349](https://github.com/doldecomp/melee/pull/2349): do not undo proper `OSReport`/`HSD_ASSERT`.
- [#2241](https://github.com/doldecomp/melee/pull/2241): existing `jobj.h` assertion behavior mattered.

## Pragmas

Pragmas are allowed only when scoped and verified.

Rules:

- wrap local pragma changes with `#pragma push` and `#pragma pop`
- remove empty pragma ranges
- ensure every push has a matching pop
- verify adjacent functions after changing pragma state
- remove copied pragmas that were only needed by an unrelated partial match

Examples:

- [#2344](https://github.com/doldecomp/melee/pull/2344): `dont_inline` needed push/pop scoping.
- [#2231](https://github.com/doldecomp/melee/pull/2231): missing pops and empty ranges were flagged.
- [#2404](https://github.com/doldecomp/melee/pull/2404): stray `dont_inline` regressed an adjacent match.

## Includes and Names

Follow local include conventions:

- use angle includes for established baselib/MSL include style when nearby code does
- remove unused includes, especially if they introduce literals or section shifts
- use canonical constants and macros instead of raw magic values where local style exists

Prefer canonical names such as:

- `F32_MAX`
- `ITEM_ANIM_UPDATE`
- `ABS`, `MIN`, `MAX`, `CLAMP`
- meaningful local names instead of `new_var`

Example:

- [#2409](https://github.com/doldecomp/melee/pull/2409): review flagged generated cleanup and include style issues.

## Fake Matches

Treat "fake" as a spectrum. Common fake-match signals:

- raw offset casts
- `M2C_FIELD` everywhere
- comma-expression contortions
- unlikely gotos
- fake data-order anchors
- unexplained `PAD_STACK`

Policy:

- Prefer the least fake source that matches.
- If the cleaner source is very close but not matching, decide whether fuzzy progress is more valuable than a fake 100%.
- If accepting a fake match, explain why and leave a path for cleanup.
- Do not add comments that merely say "fake" when the code itself makes the issue obvious; document actionable blockers instead.

Example:

- [#2349](https://github.com/doldecomp/melee/pull/2349): discussion distinguished tolerated matching aids from source that likely did not exist originally.

## PR Checklist

Before opening or finalizing a PR:

- run `python configure.py --require-protos`
- build the touched object or full project
- run `tools/checkdiff.py` or objdiff for every claimed symbol
- check adjacent functions when source layout may shift
- remove generated leftovers and speculative comments
- verify no `NOT_IMPLEMENTED` remains
- scope every pragma
- include exact commands and match/fuzzy numbers
- describe remaining mismatches, fake-match tradeoffs, or expected data-order regressions
