# AI-Assisted Workflow

Use this reference when an LLM or agent is producing candidate decompilation source for `doldecomp/melee`.

## Contents

- Operating principle
- Context packet
- Candidate generation
- Verifier gates
- Cleanup pass
- Failure patterns
- PR notes

## Operating Principle

Use AI to generate hypotheses and source-shape variants. Use m2c, Ghidra, objdiff/checkdiff, compiler rules, and repo review standards to decide what survives.

Do not accept source just because the model explains it confidently.

## Context Packet

Give the model:

- target symbol, file, and object/TU
- current match/fuzzy percent
- asm or m2c/Ghidra output
- nearby matched functions
- relevant headers and union definitions
- objdiff/checkdiff mismatch output
- known literals, strings, asserts, and relocations
- local style examples from the same subsystem

For m2c, prefer:

```text
--valid-syntax --no-casts
```

Use `--union-field` when source path strongly implies the active union:

- `/gr/` -> `GroundVars`
- `/ft/` -> `FighterVars`
- `/it/` -> `ItemVars`

This came up explicitly in [#2373](https://github.com/doldecomp/melee/pull/2373).

## Candidate Generation

Ask for variants around one mismatch dimension at a time:

- loop form
- local declaration order
- branch-local temp placement
- helper extraction
- static inline shape
- struct/union access
- data declaration placement
- assert/report macro shape

Do not ask for broad semantic rewrites until the source is already close. Broad rewrites often produce plausible but wrong comments, names, or field meanings.

## Verifier Gates

Reject generated source before review if it has:

- `NOT_IMPLEMENTED`
- raw offset pointer arithmetic where known project types exist
- C99 loop-variable declarations
- template placeholders or generated boilerplate comments
- title-vs-diff symbol mismatch
- zero objdiff progress
- missing prototypes under `--require-protos`
- wrong format-string varargs
- unsafe pointer scaling or out-of-bounds writes

Minimum commands for accepted candidates:

```bash
python configure.py --require-protos
ninja build/GALE01/path/to/file.o
build/tools/objdiff-cli diff -p . -u <unit> <symbol>
```

Use object-level objdiff when pragmas, literals, includes, statics, or splits changed.

## Cleanup Pass

Before presenting AI-generated code:

- replace raw offsets with fields, `M2C_FIELD`, or temporary structs
- rename temps based on role, not model guesses
- remove unverified semantic comments
- remove fake statics and ordering helpers unless explicitly documented
- use existing macros and include style
- verify no neighboring functions regressed

Good AI-assisted PRs in the corpus were explicit about human cleanup and verification.

Examples:

- [#2373](https://github.com/doldecomp/melee/pull/2373): agentic pipeline using m2c, Ghidra, objdiff, and decomp-permuter.
- [#2409](https://github.com/doldecomp/melee/pull/2409): AI produced useful work but required substantial human cleanup.
- [#2495](https://github.com/doldecomp/melee/pull/2495): verifier gates caught title mismatch, template leaks, and zero-progress objdiff.
- [#2294](https://github.com/doldecomp/melee/pull/2294): wrong calls/literals likely came from not starting with m2c or not using relocation-aware diffing.

## Failure Patterns

Common AI failure modes:

- confidently invented struct fields
- offset casts instead of project types
- semantic comments based on guesswork
- source that matches one symbol but shifts data and breaks neighbors
- fake section-order anchors
- overuse of `PAD_STACK`
- wrong pointer arithmetic scale
- missed project macros
- "100%" claim based on the wrong symbol

Mitigation:

- keep candidate batches small
- run verifier gates after every accepted write
- compare against nearby matched code
- require exact command output before claiming a match
- keep human review in the loop for names, structs, comments, and PR framing

## PR Notes

Include:

- target symbols and match/fuzzy numbers
- commands used for verification
- known residual mismatches
- fake-match tradeoffs, if any
- data-order or neighboring-function caveats
- whether AI assisted and what human cleanup was performed
