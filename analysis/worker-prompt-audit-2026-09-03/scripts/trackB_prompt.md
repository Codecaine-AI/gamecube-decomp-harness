# Research track B: The worker prompt and injected context — full audit

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness` (READ-ONLY except the output file).
Output: write ONE markdown file `analysis/worker-prompt-audit-2026-09-03/B-worker-prompt-audit.md` (≤ 400 lines).
Use sub-agents / parallel execution wherever the work can be split — optimize for wall-clock speed.

## Why
An audit of 1,627 worker runs (see `analysis/worker-audit-2026-09-01/rollups/phase3_rollup.md` — read its "Consistent differentiators", "Failure modes", and "Candidate prompt rules" sections first) found that near-miss workers correctly read the diff but then churn variants (36/43 stalls), over-use the permuter as a blind search, and under-use history/knowledge lookups. We are going to revise the worker system prompt and its injected context. This track audits what the prompt and context ARE today. Deliverable is analysis only — do not modify code.

## Read these
- Prompt source: `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts` (and `prompt.test.ts` for the expectations that pin it), `agent.ts`, `context.ts`, `packet.ts`, `tools.ts`, `consumer-map.ts`, `micro-gates.ts`, `checkpoint-note.ts`, `runner-validation.ts`, `tool-paths.ts`, `change-validation.ts`, `index.ts` — all in that directory.
- A rendered system prompt from epoch 1 (2026-08-26): `games/melee/state/runs/4a45af8a-9f8c-499b-b375-c0d8e93fc8fd/worker_state/fbe12874-df73-4565-b9eb-6cc310ee9ae5/worker_01a03f05-faa8-73c9-a105-464a5e9ee8da.system.md` and its `.user.md`, plus `task_spec.json` in that directory. Then find the MOST RECENT worker directory under that `worker_state/` that has a `*.system.md` and `task_spec.json` (ls -t; many recent ones lack them) and diff the two rendered prompts.
- The injected packet as the worker actually sees it: find the first user/system message in the condensed transcript `analysis/worker-audit-2026-09-01/condensed/fbe12874-df73-4565-b9eb-6cc310ee9ae5.md` (or any file in that `condensed/` dir) and describe every injected block (`worker-packet`, `knowledge-graph-file-card`, `canonical_tool_paths`, standards, repair request, etc.), with approximate sizes.
- Worker docs: `docs/10-system-design/45-agents/10-worker/doc.json` and `docs/10-system-design/45-agents/40-worker-summarizer/doc.json` (BlockNote JSON — extract text).
- Tool profile: `apps/server/src/core/tools/profiles/defaults.ts`, `apps/server/src/core/tools/metadata/capabilities.ts` — what tools the worker profile exposes now and their one-line descriptions as shown to the model.
- Retired concepts: `docs/10-system-design/40-knowledge/90-record/50-retired-concepts/doc.json` and `git show --stat 9fa6a39b 15259ff7` — so you can flag prompt text that references retired things (e.g. "opseq similarity leads", "graph file card").

## Answer, with file:line citations
1. **Prompt anatomy.** Section-by-section outline of the CURRENT `prompt.ts` output (goal, definition_of_done, thinking, context_contract, workflow_context phases, runner_validation_handoff, contracted_in_rules, anything else), with per-section character counts and what each is trying to make the worker do. Note any conditional sections (widening enabled, repair request, etc.).
2. **Injected context anatomy.** Every block the worker receives at boot, its source, its cap, and whether it is target-specific. Total boot-context size in chars/tokens for a typical worker.
3. **Staleness.** Every phrase in the prompt or packet that references a retired/renamed tool or concept, with what it should say now.
4. **What the prompt says about process** vs what the audit found matters. Map each audit differentiator / candidate rule (R1–R13 in the rollup) to: already stated in the prompt (quote) / partially stated / absent. Note where the prompt's current phrasing actively pushes the wrong behavior (e.g. rule 13 frames the permuter as "last resort" without saying how to use it as a bounded probe; phase 4 says "use source mutation previews first" with no diff-classification step).
5. **Diff-reading.** What the prompt and tool descriptions say about reading `checkdiff_run` output — is there any instruction to classify the residual (instruction / register / stack / scheduling / relocation / data-layout) or to name the live range before editing? Quote or state absent.
6. **Handoff / feedback.** What the handoff JSON captures (fields, from `runner-validation.ts` / `checkpoint-note.ts`), and whether a near-miss's diagnosis and tried-variants list is captured in a structured way the next worker could consume.
7. **Tests that pin the prompt.** What `prompt.test.ts` asserts, so a rewrite knows what it must keep or update.
8. **Budget.** Model/context limits configured for the worker (agent.ts / pi-agent runtime config), so we know how much room a longer prompt + richer packet has.

Be concrete; quote the prompt. Print DONE when finished.
