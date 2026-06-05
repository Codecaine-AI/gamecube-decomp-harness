# Single-Function Iteration Workflow

Use this reference when trying to decompile or finish one function in this local `doldecomp/melee` checkout.

## Contents

- Goal
- Local environment assumptions
- Phase 0: choose a target
- Phase 1: build the context packet
- Phase 2: create or safely adjust the C candidate
- Phase 3: hand-iterate with objdiff
- Phase 4: use the PR dump intelligently
- Phase 5: use the permuter
- Phase 6: land the source cleanly
- Phase 7: final verification
- Concrete local example
- Failure decision tree

## Goal

Produce C that compiles with this repo's MWCC settings to the same PowerPC instructions as the target function, while also preserving the repo's review standards: real types where possible, local style, scoped pragmas, no generated leftovers, and no fake data-order hacks unless explicitly justified.

The inner loop is not "write C once." It is:

```text
pick target -> gather context -> create candidate -> objdiff -> adjust one shape variable -> objdiff -> permuter if close -> clean -> verify object/TU
```

## Local Environment Assumptions

This checkout already has:

- a byte-perfect `ninja` build
- `orig/GALE01/sys/main.dol`
- `build/tools/objdiff-cli`
- objdiff GUI installed outside the repo
- `.venv` with m2c/asm-differ tooling
- `decomp-permuter/`
- `permuter_settings.toml`
- `tools/permuter/import_func.sh`
- PR corpus under `decomp-orchestrator/knowledge/past_prs/current`
- searchable per-PR JSON library under `decomp-orchestrator/knowledge/past_prs/prs`

Useful setup source:

- `SETUP_NOTES.md`
- `docs/getting_started.md`
- `docs/glossary.md`
- `docs/symbols.md`
- `docs/splits.md`
- `.github/CONTRIBUTING.md`

Always start long-running local build/permuter work with:

```bash
export WINEDEBUG=-all
```

Current caveat: `tools/easy_funcs.py` uses Python 3.12 syntax, while `.venv/bin/python` and default `python3` are Python 3.11 here. Use Python 3.12 with the needed packages installed, or read `build/GALE01/report.json` directly with `jq`.

## Phase 0: Choose A Target

Prefer a function where the mismatch looks bounded:

- high fuzzy percentage
- small or moderate size
- one unmatched function in an otherwise matched TU
- known wrong literal/call/relocation
- local neighboring functions are already matched
- there are sibling functions with similar structure

Ways to find candidates:

```bash
jq '.units[] | select(.name=="main/melee/it/items/itlinkbomb") | .functions[] | select(.fuzzy_match_percent != 100)' build/GALE01/report.json
```

In an orchestrated live worker run, read the already-generated
`build/GALE01/report.json`; do not regenerate it. Global progress refreshes
such as `ninja build/GALE01/report.json`,
`ninja all_source build/GALE01/report.json`, and
`build/tools/objdiff-cli report generate` are operator/orchestrator-only and
must wait until live workers and their build/objdiff children are idle.

If `tools/easy_funcs.py` is usable in the current Python environment:

```bash
python3.12 tools/easy_funcs.py src/melee/it/items/itlinkbomb.c -S 100000 -M 99.999
python3.12 tools/easy_funcs.py src/melee/it/items -s 32 -S 512 -m 90 -M 99.999
```

Confirm the target is not already solved or being actively worked:

```bash
rg -n "FunctionName" src config/GALE01/symbols.txt decomp-orchestrator/knowledge/past_prs/current/analysis decomp-orchestrator/knowledge/past_prs/prs
```

For external coordination, search decomp.me or relevant project channels if you are preparing a real PR.

## Phase 1: Build The Context Packet

Collect the facts an agent or human needs before changing source.

For a first pass across target metadata, local naming, PR history, and resource
CSVs, run:

```bash
python3 decomp-orchestrator/knowledge/packs/melee-decomp/scripts/decomp_context_lookup.py \
  --target src/melee/it/items/itlinkbomb.c \
  --symbol itLinkbomb_UnkMotion3_Anim
```

For naming, struct/data layout, architecture-reference, historical-PR, or
large-sweep decisions, read
[resource-guided-research.md](resource-guided-research.md) before editing.

### Source And Neighbor Context

```bash
rg -n "FunctionName|neighbor_function|related_callback" src/melee/path config/GALE01/symbols.txt config/GALE01/splits.txt
sed -n 'start,endp' src/melee/path/file.c
sed -n 'start,endp' src/melee/path/file.h
```

Look for:

- sibling motion states or callbacks
- nearby matched helper functions
- local `static inline` patterns
- `GET_ITEM`, `GET_FIGHTER`, `GET_GROUND`, and other accessors
- active item/fighter/ground union fields
- local include style
- magic literals already named elsewhere

Use `docs/glossary.md` to name locals conservatively. It is better to use `pos`, `vel`, `rot`, `idx`, `cb`, `dst`, `src`, or `cur` according to established glossary terms than to let AI invent semantic names.

### Symbol Metadata

Use `docs/symbols.md` and `config/GALE01/symbols.txt` to confirm:

- function address
- function size
- symbol scope
- nearby labels or data objects
- data type annotations for strings/floats/tables

Example:

```bash
rg -n "itLinkbomb_UnkMotion3_Anim" config/GALE01/symbols.txt
```

### Split Metadata

Use `docs/splits.md` and `config/GALE01/splits.txt` to understand the TU's section ownership:

```bash
rg -n "melee/it/items/itlinkbomb.c" config/GALE01/splits.txt
```

Check `.rodata`, `.data`, `.sdata`, and `.sdata2` ranges before adding statics, includes, asserts, or source bodies that may move literals.

### Object Diff Metadata

`objdiff.json` maps each unit to source, target object, base object, scratch config, and context file:

```bash
jq '.units[] | select(.name=="main/melee/it/items/itlinkbomb")' objdiff.json
```

This is also the unit name to pass to `objdiff-cli`.

## Phase 2: Create Or Safely Adjust The C Candidate

In orchestrated worker runs, never reset a whole source file with commands such
as `git checkout --`, `git restore`, `git reset`, or `git clean`. The checkout
may contain retained progress from other workers. If an experiment fails, remove
only the hunks introduced by that experiment, or stop and report a blocker when
safe hunk-level cleanup is unclear.

If there is no useful source body yet, generate a starting point with m2c:

```bash
.venv/bin/python tools/decomp.py FunctionName --no-copy --valid-syntax --no-casts
```

For item/fighter/ground paths, add m2c union-field arguments when useful:

```bash
.venv/bin/python tools/decomp.py FunctionName --no-copy --valid-syntax --no-casts --union-field ItemVars:linkbomb
```

If `--write` is used, inspect the inserted body before committing to it:

```bash
.venv/bin/python tools/decomp.py FunctionName --write --format --valid-syntax --no-casts
```

Treat generated source as a draft:

- replace raw offsets with fields or `M2C_FIELD`
- use local accessors like `GET_ITEM`
- remove guessed comments
- use glossary-backed names
- compare against sibling functions before changing global structs

## Phase 3: Hand-Iterate With Objdiff

Use the objdiff GUI for the fast loop:

1. Launch `~/bin/objdiff`.
2. Set project directory to the repo root.
3. Enable relaxed relocation diffs if needed.
4. Open the unit and target function.
5. Save `.c`/`.h` changes and let objdiff rebuild/refresh.

Use CLI for snapshots or final evidence, preferably redirected:

```bash
build/tools/objdiff-cli diff -p . -u main/melee/it/items/itlinkbomb itLinkbomb_UnkMotion3_Anim --format json-pretty -o /tmp/itlinkbomb.diff.json
```

Hand-iteration knobs:

- change loop form
- move locals into/out of branches
- reorder local declarations
- split or combine temporaries
- add a small static inline if sibling functions repeat the same sequence
- remove an inline/helper if it worsens codegen
- adjust `PAD_STACK` only after checking likely root causes
- verify struct padding and field offsets before adding casts
- check whether mismatch is a relocation or literal, not instruction shape

After each useful change, record:

```text
what changed -> objdiff effect -> next hypothesis
```

This prevents random walking and gives the permuter a better starting point.

## Phase 4: Use The PR Dump Intelligently

Use the PR dump to answer "has this kind of mismatch happened before?"

For broader evidence gathering that includes PR history and the local resource
CSV store, use [resource-guided-research.md](resource-guided-research.md).

Search by tactic:

```bash
rg -n "FunctionName|file_name|subsystem" decomp-orchestrator/knowledge/past_prs/current/analysis/human_pr_text.md decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md decomp-orchestrator/knowledge/past_prs/prs/index.jsonl
rg -n "PAD_STACK|inline|register|regalloc|FPR|local" decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md decomp-orchestrator/knowledge/past_prs/prs/known_fixes.md
rg -n "sdata2|literal|ordering|fakeFunc|symbols.txt" decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md decomp-orchestrator/knowledge/past_prs/prs/known_fixes.md
rg -n "M2C_FIELD|pointer math|GET_ITEM|union-field" decomp-orchestrator/knowledge/past_prs/current/analysis/review_comments.md decomp-orchestrator/knowledge/past_prs/prs/known_fixes.md
```

Search by changed file:

```bash
jq 'select(.file=="src/melee/it/items/itlinkbomb.c")' decomp-orchestrator/knowledge/past_prs/current/analysis/changed_files.jsonl
```

Search by PR when an example is relevant:

```bash
jq 'select(.pr == 2510)' decomp-orchestrator/knowledge/past_prs/current/analysis/text_corpus.jsonl
jq 'select(.pr == 2510 and .change == "add")' decomp-orchestrator/knowledge/past_prs/current/analysis/diff_lines.jsonl
```

Use the dump for heuristics, not blind copying. If a prior PR used a fake match, prefer the cleaner lesson behind it.

## Phase 5: Use The Permuter

Use the permuter after the function is semantically close and the mismatch appears to be syntax/code-shape, register allocation, or scheduling.

Import:

```bash
export WINEDEBUG=-all
tools/permuter/import_func.sh src/melee/it/items/itlinkbomb.c itLinkbomb_UnkMotion3_Anim
```

Run:

```bash
cd decomp-permuter
../.venv/bin/python permuter.py nonmatchings/itLinkbomb_UnkMotion3_Anim-*
```

Score `0` is a perfect match.

Important:

- The permuter mutates a copy under `decomp-permuter/nonmatchings/`, not your repo source.
- Copy only the useful winning variant back into `src/`.
- Clean it before accepting it: remove `permuterslop`, bad names, fake expressions, and unnecessary padding.
- Re-run objdiff after copying. A permuter win can still be too ugly for review.

Use permuter less for:

- wrong struct/field knowledge
- wrong function call
- wrong literal/data section
- bad split/symbol metadata
- source that is not semantically close

## Phase 6: Land The Source Cleanly

Before final verification:

- run clang-format on touched C when appropriate
- remove generated comments and local experiment markers
- replace `!ptr` with explicit `ptr == NULL` / `ptr != NULL` style where applicable
- use literal casing from `.github/CONTRIBUTING.md`
- use structs with offset-prefixed fields when adding Melee structs
- avoid naming global fields/functions from AI guesses
- preserve local include style
- scope pragmas
- avoid redefining `HSD_ASSERT` or other project macros
- avoid fake data-section anchors unless explicitly documented

If the source is still fake but valuable, document the exact blocker and why the tradeoff is acceptable.

## Phase 7: Final Verification

Minimum local evidence:

```bash
export WINEDEBUG=-all
python configure.py --require-protos
ninja build/GALE01/src/melee/it/items/itlinkbomb.o
build/tools/objdiff-cli diff -p . -u main/melee/it/items/itlinkbomb itLinkbomb_UnkMotion3_Anim --format json-pretty -o /tmp/itlinkbomb.diff.json
```

Operator-only broader checks when data, symbols, splits, includes, statics, or
pragmas changed:

```bash
# Do not run these from an orchestrated live worker.
ninja
build/tools/objdiff-cli report generate -p . -o /tmp/report.json
```

During an orchestrated live worker run, do not run those broader/global checks
from the worker. Report the narrow object/objdiff evidence and let the
operator/orchestrator run broad verification after the worker pool is idle.

Note: some PRs mention `python tools/checkdiff.py`, but this checkout does not currently have that script. Use `build/tools/objdiff-cli` and the GUI here.

When preparing a PR or summary, include:

- target symbol and file
- before/after match percent
- commands run
- whether object/TU neighbors regressed
- any fake-match tradeoff
- whether AI/permuter assisted

## Concrete Local Example

Queued target from `SETUP_NOTES.md`:

```text
src/melee/it/items/itlinkbomb.c
itLinkbomb_UnkMotion3_Anim
```

Current local facts:

- `symbols.txt`: `.text:0x8029EF84`, size `0xC8`
- `report.json`: 98.8% fuzzy
- neighboring `itlinkbomb` motion callbacks are mostly 100%
- `splits.txt`: this TU owns `.rodata`, `.data`, `.sdata`, and `.sdata2`
- current source contains `PAD_STACK(8)` and `permuterslop` markers

Good first hypotheses:

- Check whether `itLinkbomb_UnkMotion3_Anim_inline1` should reuse `it_8029EC34` shape or differ by a small inline/code-shape issue.
- Test whether `ok`, `attrs`, and the empty branches are only register/stack shapers or can be replaced by a cleaner local lifetime/order.
- Check if `PAD_STACK(8)` is hiding a missing inline or a temp lifetime mismatch.
- Avoid adding statics or changing `.sdata2` until instruction shape is understood, because this TU owns local data sections.

Useful commands:

```bash
rg -n "itLinkbomb_UnkMotion3_Anim|it_8029EC34|it_8029DB5C" src/melee/it/items/itlinkbomb.c
jq '.units[] | select(.name=="main/melee/it/items/itlinkbomb") | .functions[] | select(.name=="itLinkbomb_UnkMotion3_Anim")' build/GALE01/report.json
tools/permuter/import_func.sh src/melee/it/items/itlinkbomb.c itLinkbomb_UnkMotion3_Anim
```

## Failure Decision Tree

If branch order differs:

- try loop/if restructuring
- invert condition
- split branch-local temps
- compare sibling functions

If registers differ:

- reorder locals
- add/remove a local pointer
- narrow temp lifetime
- consider static inline shape

If stack frame differs:

- check struct sizes and by-value temporaries
- check missing inlines
- use `PAD_STACK` only after those fail

If calls/literals differ:

- inspect relocations
- check `symbols.txt`
- check include-introduced literals
- compare `.sdata2` ownership in `splits.txt`

If data sections differ:

- avoid new statics
- inspect string/assert ownership
- check neighboring object regressions
- consider split or symbol metadata before source hacks

If source matches but is ugly:

- run review standards before accepting
- prefer a cleaner fuzzy improvement over a fragile fake 100% if review cost is high
