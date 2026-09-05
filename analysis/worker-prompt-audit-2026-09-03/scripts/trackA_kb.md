# Research track A: Knowledge System V2 — what it is and what the worker gets from it

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness` (READ-ONLY except the output file).
Output: write ONE markdown file `analysis/worker-prompt-audit-2026-09-03/A-knowledge-v2-audit.md` (≤ 350 lines).
Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

## Why
We audited 1,627 decomp worker runs. Workers that reached exact matches used knowledge/history lookups far more (`past_prs_search` 96% vs 76%, the now-retired `ledger_search` 98% vs 83%, `knowledge_graph_search` 81% vs 63%), and the winning move in 11/44 deep-read pairs was recovering *target-specific* prior evidence (accepted PR, matched sibling, packed type, prior exact commit) and turning it into the next experiment. The knowledge base was just overhauled (knowledge-system-v2; legacy ledger retired in commit 9fa6a39b). We need to know exactly what the new store offers and how much of it reaches a worker today, so we can spec the changes to the worker context. Deliverable is analysis only — do not modify code.

## Read these
- `objectives/knowledge-system-v2/*.md` and `objectives/knowledge-system-v2/handoffs/*`
- Design docs (BlockNote JSON; extract the text): every `doc.json` under `docs/10-system-design/40-knowledge/` — especially `10-knowledge-sources`, `20-record-contracts`, `50-search-and-cards`, `60-worker-surfaces` (Boot Context, blocks, budgets, tools, gate/sequence, feedback), `90-record/50-retired-concepts`, `90-record/70-worklist`.
- Code: `apps/server/src/core/knowledge-v2/**`, `apps/server/src/core/knowledge/**` (what's left), `apps/server/src/core/agent-catalog/agents/knowledge/**` (librarians/summarizer), `apps/server/src/core/agent-catalog/agents/running/worker/context.ts` + `packet.ts` (what is actually injected into a worker), `apps/server/src/core/tools/profiles/defaults.ts` and the tool implementations for any knowledge/history tools a worker can call (find them under `apps/server/src/core/tools/`).
- Store: `games/melee/knowledge/knowledge.sqlite` — run `.schema` and row counts per table (entity, fact, evidence, link, target, target_status, worker_run, run_narrative, wiki_section, pull_request, submission, event...). Also count facts/evidence by kind/type columns if present, and how many targets have ≥1 fact. Read-only queries only (use `sqlite3` with `-readonly`).
- `git log --oneline -40` for the knowledge-v2 commit series, to reconstruct what changed and what was retired.

## Answer, with file:line citations
1. **Store model.** Entities, facts, evidence, links, confidence/lifecycle — what a "fact" about a target looks like concretely (show 3 real rows). What sources feed it (PRs, worker runs, wiki, discord, ...). Current population numbers.
2. **Worker surfaces as DESIGNED** (per 60-worker-surfaces doc): the boot-context blocks, budgets, gate sequence, the tools named, and the feedback path (summarizer → librarian).
3. **Worker surfaces as IMPLEMENTED today**: what `context.ts`/`packet.ts` actually inject (list each block, its data source, its size cap), which knowledge tools are in the worker tool profile now, and which of the old tools (`ledger_search`, `knowledge_graph_search`, `code_graph_search`, `code_graph_file_card`, `graph_related_functions`, `past_prs_search`, `asm_window_search`) still exist, were renamed, or were retired — and what replaces each. Flag every gap between design and implementation.
4. **Target-specific retrieval.** For a given target symbol, what can the V2 store return today: prior worker-run narratives for that symbol? accepted PR diffs touching it? sibling/matched-analog functions? compiler-behavior facts (MWCC allocator/inline/scheduling idioms)? Give the exact query/tool for each, or state "not available".
5. **Feedback loop.** How a worker run's outcome becomes knowledge (worker_run, run_narrative, summarizer job, librarian). Does a failed near-miss's diagnosis ("stalled on f5/f6 fcmpo register swap after trying X, Y, Z") get stored in a form the *next* worker on that target will see? Cite.
6. **Opportunities.** 5-10 concrete, cited proposals for injecting V2 knowledge into the worker boot context and tools — each with: what data, from which table/tool, at what budget, and which of the audit findings it addresses. Include a "compiler idiom card" idea if the store can support it.

Be precise and skeptical: distinguish what the docs claim from what the code does. Print DONE when finished.
