---
covers: Worker capability model, evidence emitted by each capability, guardrails, and melee-assist absorption map
concepts: [worker-capabilities, evidence, guardrails, melee-assist, context-packaging]
---

# Worker Capabilities

Worker capabilities are tactics chosen inside one lease after research. They are
not separate worker types. The director controls target assignment and budgets;
the worker controls the local tactic mix inside its write set.

## Capability Table

| Capability | When A Worker Uses It | Evidence It Emits | Guardrail |
| --- | --- | --- | --- |
| Context packaging | Every worker begins by turning the target packet into a compact read set. | Target assembly, current C, TU preamble, siblings, header snippets, provenance. | Keep context focused; do not dump the whole repo. |
| Type and symbol resolution | Unknown types, callbacks, globals, r13/r2 references, or undefined labels appear. | Accepted type/symbol facts, missing-context requests, evidence paths. | Request exact missing facts instead of inventing fields or labels. |
| Scratch and history reconnaissance | Public decomp.me work, prior PR discussion, or previous attempts may exist. | Scratch status, URL/owner, prior attempt summary, reusable hints. | Treat public scratches as approximate and provenance-tagged. |
| Isolated check loop | A candidate source shape is ready to test without promotion. | Compile log, symbol/unit objdiff, score delta, first mismatch key, best-attempt history. | Prefer narrow checks first. |
| Duplicate adaptation | Duplicate groups or similar assembly-shape edges point to a matched reference. | Adapted patch, objdiff result, reusable duplicate-shape facts. | Verify against the target, not only the reference. |
| Focused source editing | Research supports a small set of grounded source-shape hypotheses. | Natural source improvement, mismatch notes, validation commands, stop/continue recommendation. | Stop when the next move becomes guesswork. |
| Fact research | A field, naming convention, data owner, or compiler-shape question blocks progress. | Accepted fact, rejected hypothesis, or graph edge. | Facts need evidence paths. |
| Experimental search | A bounded source-shape matrix can be defined from measured evidence. | Result shards, Pareto frontier, learned patterns, negative-result rows. | Workers write shards; reducers merge shared artifacts. |
| Permuter handoff | A finalist is close, reviewable, and mechanically narrow. | Permuter artifacts, candidate patch, provenance notes. | Do not substitute permuter output for understandable source. |
| Review and cleanup | A byte improvement needs quality/type/regression review before integration. | Debt report, safer rewrite, validation transcript, or rejection. | Prevent fake matches from entering the baseline. |

## `melee-assist` Absorption Map

| Reference | Capability To Absorb | Why It Matters |
| --- | --- | --- |
| `assembly/parser.py` | Read `report.json` as offline function/unit truth. | Gives workers target names, source paths, unit names, sizes, addresses, and current fuzzy match without scraping assembly folders. |
| `loop/context_pack.py` | Extract target function, TU preamble, siblings, and referenced type definitions. | Keeps prompts focused while preserving local declarations and conventions. |
| `resolver/symbols.py` | Resolve `symbols.txt`, including r13/r2 small-data references. | Turns raw global loads into named data facts that can propagate. |
| `resolver/structs.py` | Look up module headers and member-offset hints. | Moves workers from pointer arithmetic guesses to field/name hypotheses with evidence. |
| `api/decomp_me.py` | Check public decomp.me scratches for target status and prior attempts. | Lets workers learn from public progress while preserving provenance. |
| `loop/orchestrator.py` | Run isolated compile/check loops and preserve attempt history. | Records which hypotheses improved, regressed, failed to compile, or retained a mismatch. |
| `llm/prompts.py` | Use explicit missing-context requests such as `NEED_TYPE` and `NEED_SYMBOL`. | Gives workers a disciplined path to ask for facts instead of guessing. |

## Related

- [Worker lifecycle](40-worker-lifecycle.md)
- [Knowledge model](50-knowledge-model.md)
