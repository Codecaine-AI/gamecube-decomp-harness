# Matching Process Brainstorming

Status: Draft notes for improving function matching and translation-unit linking.

## Purpose

The current local toolchain can compile and compare a candidate quickly, but an
agent still has to infer why a source change altered the generated code. This
document records how that feedback loop works today and how it could become more
informative without building a large new system.

The central idea is to retain more than a single similarity score. Every source
experiment should produce an **effect signature** that describes what moved in
the generated code. Those signatures can show which source properties influence
instruction selection, variable lifetimes, register allocation, stack layout,
and final TU layout.

## Matching and Linking Are Different Gates

### Function matching

Function matching compares the compiler output for one function with the target
object. An exact result requires the same instructions, operands, registers,
stack offsets, and control-flow layout.

### Translation-unit linking

Linking promotes the complete TU from `NonMatching` to `Matching` and includes
its object in the final binary. This adds several requirements beyond an exact
function:

- Every function selected from the TU must be exact.
- Constants, strings, tables, and other data must have the correct contents.
- Sections must have the correct sizes and alignment.
- Symbols and relocations must resolve to the expected locations.
- The final linked binary must retain its expected checksum.

The linker is deterministic. The difficult work usually happens before the
linker: finding source that makes the historical compiler reproduce the exact
code and object layout.

## Current Local Feedback Loop

1. Compile only the target function or object with the correct compiler and
   flags.
2. Compare it with the target object using a structured instruction diff.
3. Classify the remaining differences instead of relying only on the score.
4. Change one bounded source property and compile again.
5. Keep useful effects, discard irrelevant families, and run the full link gate
   only after the focused comparison is exact.

decomp.me is useful for sharing a scratch and inspecting an existing attempt,
but it is not required for this loop. Local compilation is faster for systematic
search, preserves artifacts, and can use repository history and diagnostics.

## What a Change Can Teach Us

| Observed effect | Likely inference | Next targeted experiment |
| --- | --- | --- |
| One value moves to a different register | Its priority or live range changed | Move its declaration or initialization, or shorten its scope |
| Several registers rotate together | The interference graph was recolored | Isolate one overlapping lifetime or reorder a small declaration group |
| A stack slot appears or moves | A value was spilled, made addressable, or kept live longer | Remove address-taking, split scope, or change temporary lifetime |
| Opcodes change before operands improve | Expression lowering changed before allocation | Restore the instruction shape and vary only lifetime-related properties |
| Many variants produce identical output | The compiler normalized that source family | Stop searching the family and record it as eliminated |
| The score drops but a target stack/register issue disappears | One desired compiler decision was reached while another regressed | Retain the useful shape as a new baseline and target the new differences |

Register allocation is deterministic but discontinuous. A small source change
can add one temporary, change several overlapping live ranges, and recolor many
registers at once. This makes the output look random when viewed only as a
percentage. It becomes more useful when viewed as a set of specific effects.

## Effect Signature

Each candidate comparison could record the following fields:

- Opcode insertions, deletions, and replacements.
- Operand-only differences.
- Register mappings and register groups that rotated together.
- Stack-slot additions, removals, and offset changes.
- Branch-target and control-flow changes.
- Symbol, relocation, literal, and data differences when comparing an object.
- The first divergent instruction and the live values at that point.

The effect signature answers a more useful question than “did the score go up?”:

> Which compiler decision changed, and which source transformation caused it?

## Experiment Ledger

A lightweight ledger would make the feedback reusable across agents and
sessions. One record per attempted transformation is enough to begin:

```text
target
baseline revision and compiler flags
source hash
transformation family
transformation parameters
before effect signature
after effect signature
before and after scores
exact-match and link-gate results
artifact or patch location
conclusion: improved, regressed, unchanged, or invalid
```

The important unit is the transformation family, not the complete candidate
source. Examples include declaration ordering, initialization timing, cached
versus direct field access, lifetime splitting, expression reassociation, and
branch-local aliasing.

This ledger would let an agent determine that all legal declaration orders were
already exhausted, that a particular lifetime split consistently removes a
spill, or that a family always compiles identically under the current flags.

## Candidate Selection

Candidate generation should be guided by the current effect signature:

1. Preserve regions that are already instruction-exact.
2. Select one source dimension associated with the remaining effect class.
3. Enumerate a bounded legal family of changes.
4. Rank candidates by structured improvements, not scalar score alone.
5. Stop a family when repeated candidates have identical signatures or when its
   relevant effect has saturated.

A useful ranking order is:

1. Exact focused match.
2. Fewer opcode or control-flow differences.
3. Fewer stack-layout differences.
4. Fewer register-allocation groups that differ.
5. Fewer isolated operand differences.

The ordering can vary by target. For a register-only tail, preserving opcodes
and stack layout is more important than a small percentage increase produced by
new instructions.

## Available Sources of Evidence

- Structured local object and instruction diffs.
- Compiler debug output for def-use, liveness, and register-flow analysis.
- Bounded source permutations compiled with the project compiler.
- Git history and prior local attempts for the same symbol or source pattern.
- Similar matched functions compiled with the same flags.
- decomp.me scratches as optional shared examples rather than an execution
  dependency.

No single source identifies the original C. Together they constrain which
source properties remain worth testing.

## Minimal Improvement Before a Full Build-Out

The smallest useful addition is a wrapper around the existing local compile and
compare commands. It would:

1. Accept a transformation-family name and candidate identifier.
2. Save the structured before/after diff as JSON Lines.
3. Print a concise effect summary for the agent.
4. Produce a family summary showing improvements, regressions, and duplicates.
5. Feed the best and eliminated effects into the next agent prompt.

This version does not require a service, database migration, dashboard, or new
compiler integration. Flat artifacts in the target worktree are sufficient to
test whether effect-aware search improves decisions.

## Possible Later Optimizations

- Cache compilation results by source hash, compiler version, and flags.
- Build register-equivalence and live-range visualizations from compiler output.
- Learn which transformation families historically affect each difference
  class.
- Share eliminated-family summaries between agents working on similar code.
- Schedule independent candidate families in parallel while preserving one
  authoritative baseline.

These are later-stage options. They should be justified by evidence from the
lightweight ledger before becoming persistent infrastructure.

## Current Campaign Examples

The six TUs tracked by
[doldecomp/melee issue #2933](https://github.com/doldecomp/melee/issues/2933)
provide useful test cases:

- `lbmthp` demonstrates family elimination: thousands of legal declaration,
  statement-order, caching, and alignment variants can compile identically or
  fail to improve the remaining register operands.
- `lbshadow` demonstrates a semantic-equivalence tail: loading literal zero and
  copying a register containing zero behave identically, but only one encoding
  matches the target.
- `ftCo_DownBound` demonstrates why structured effects matter: a candidate can
  eliminate stack-layout differences while leaving register coloring unresolved,
  making it a useful baseline even without a large score increase.

These campaign observations are provisional. Stable conclusions should move
into the normal knowledge or runbook documentation after they are reproduced.

## Success Criteria for an Effect-Aware Loop

The approach is useful if it produces measurable improvements over score-only
search:

- Fewer duplicate or compiler-equivalent candidates.
- Fewer repeated families across agents and sessions.
- More retained partial improvements such as exact stack layout.
- Clear explanations for why a family was selected or stopped.
- Less focused-compile time per exact match, without weakening final link gates.

Exact local comparison and the final binary checksum remain the acceptance
criteria. The experiment ledger improves search decisions; it does not replace
the exactness gates.
