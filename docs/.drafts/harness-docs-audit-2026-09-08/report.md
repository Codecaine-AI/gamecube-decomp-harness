# Harness Documentation Drift Report

Start with findings 01 through 05. They describe current operator and runtime behavior incorrectly.

Audit date: September 8, 2026. Harness revision: `cfc6460e1de02d9d69cd9727ddc83b31b23c8a0c`.

## Scope and Result

The harness `/docs` corpus has **15 grouped findings**, including five high-priority behavioral contradictions. The main problem is uneven maintenance: recently corrected pages coexist with older descriptions of the same system.

| Check | Result |
| --- | --- |
| Published document bundles inventoried and CLI-rendered | 140 of 140 succeeded |
| Structural/writing audit | Failed: 732 errors, 27 warnings |
| Separate structured-reference check | Passed: 0 stale references |
| Semantic comparison | Targeted source review across agents, worker execution, sync, epoch boundary, state/actions, knowledge infrastructure, tooling, tracing, registration, and repo setup |
| Existing documentation or implementation edits | None |

This is a documentation audit of harness code and contracts, including the harness's knowledge-system implementation. It does not audit Melee facts, source interpretations, PR-corpus quality, or any other game's knowledge. Existing `.drafts` work was excluded.

Source evidence describes the current checkout, not a live end-to-end runtime test. No workers, sync jobs, knowledge jobs, application servers, or test suites were started. Only documentation render/audit/link commands ran. The new files under this report folder are audit artifacts, not canonical documentation updates.

## Fix Operator and Runtime Contradictions

### 01. Remove Retired PR Campaign Controls

**High.** The operator page claims a 21-action inventory and exposes seven PR campaign actions, including `pr.open_campaign` and `pr.publish_batch`. The current projection has 13 canonical actions and always returns an empty `pr_work` array. This directs operators toward controls the current implementation does not provide.

**Affected docs:** [docs/10-system-design/30-harness/60-operator-actions](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:1010); [docs/10-system-design/30-harness/20-harness-state](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:282)

**Code evidence:** [apps/server/src/application/dashboard/read-model.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/application/dashboard/read-model.ts:1409); [apps/server/src/application/dashboard/read-model.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/application/dashboard/read-model.ts:298). The existing read-model test also expects 13 actions.

**Update:** Replace the inventory and DTO example with the current projection. Audit the surrounding harness-state PR shapes and links. Keep any retained campaign contract explicitly historical; distinguish it from the still-active epoch draft-PR publication path.

### 02. Replace the Old Sync Flow

**High.** The global flow still enqueues legacy knowledge-stage jobs, blocks on `knowledge_stage_failed`, and rebases the cycle and PR series. The owning Sync Process page already describes policy merge and post-publication V2 intake. Readers get two incompatible workflows.

**Affected docs:** [docs/40-new-features/30-global-flow-map/30-sync](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:8450); [docs/10-system-design/50-workflows/10-sync/20-process](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:5301)

**Code evidence:** [apps/server/src/core/cycle-runtime/phases/sync/engine.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/sync/engine.ts:82); [apps/server/src/core/cycle-runtime/phases/sync/engine.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/sync/engine.ts:736); [apps/server/src/core/cycle-runtime/phases/sync/publication.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/sync/publication.ts:536); [apps/server/src/core/orchestrator-state/storage/migrations/005-drop-legacy-sync-knowledge-tables.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/orchestrator-state/storage/migrations/005-drop-legacy-sync-knowledge-tables.ts:1).

**Update:** Rewrite the flow, recovery stages, and cancellation text around the current merge/staging/publication implementation. Include reconciliation followed by mechanical citation re-anchoring before the other V2 intake lanes. Audit the sync canvas and sequence assets in the same pass.

### 03. Rewrite the Epoch-Boundary Contract

**High.** The boundary page says the pass is agentless, has no build-repair lane, and immediately admits regression-repair epochs. Code has a bounded Codex build-fixer, and regression findings are deferred with no boundary repair admission. The page also names the old 10-source knowledge maintenance sequence and calls August 27 fixes uncommitted.

**Affected docs:** [docs/40-new-features/30-global-flow-map/45-epoch-boundary](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:8568); [docs/10-system-design/45-agents](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:5138)

**Code evidence:** [apps/server/src/core/cycle-runtime/phases/running/epochs/build-fixer.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/running/epochs/build-fixer.ts:10); [apps/server/src/core/cycle-runtime/phases/running/epochs/cycle.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/running/epochs/cycle.ts:76); [apps/server/src/core/cycle-runtime/phases/running/epochs/cycle.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/running/epochs/cycle.ts:1565); [apps/server/src/core/cycle-runtime/phases/running/scheduler/epoch-boundary.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/running/scheduler/epoch-boundary.ts:375).

**Update:** Reconstruct the ordered pass from the scheduler boundary and epoch code. Document the five-minute build-fixer, its patch checks, retry and failure behavior, deferred regressions, and current knowledge intake. Audit the page's remaining open-bug rows individually; this sweep does not assert they remain live. Adjust the agent roster's "only agent that edits game source" claim to account for the boundary fixer.

### 04. Align the Worker Page With Its Actual Prompt and Tools

**High.** The Worker page lists 31 core tools, includes five graph/archive tools absent from the default worker profile, and describes a legacy graph card and tool listing in boot context. The current default profile has 28 tools, including `knowledge_render_file` and `mwcc_alloc_analyze`. The newer Worker Knowledge Surfaces page already describes the first diff, single V2 card, and proposed-name reading view.

**Affected docs:** [docs/10-system-design/45-agents/10-worker](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:4841); [docs/10-system-design/40-knowledge/60-worker-surfaces](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:3969)

**Code evidence:** [apps/server/src/core/tools/profiles/defaults.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/tools/profiles/defaults.ts:16); [apps/server/src/core/agent-catalog/agents/running/worker/context.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/context.ts:1); [apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts:89).

**Update:** Update the roster and boot-context contract together. Link to the detailed worker-surfaces page instead of maintaining a second independent explanation. Distinguish registered tools from role defaults and injected file-operation builtins.

### 05. Consolidate Sandbox Execution and Sleep Behavior

**High.** Core worker pages still describe detached host worktrees. The older Daytona chapter says sandboxes remain running throughout a claim and sleep is deferred. The worker path requires a sandbox, enables sleep by default, and the host deletes a sandbox after the worker claim closes. The newer stop-while-thinking page describes this substantially better.

**Affected docs:** [docs/10-system-design/50-workflows/20-run/40-workers/10-lifecycle](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:5775); [docs/10-system-design/50-workflows/20-run/40-workers/30-write-safety](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:5963); [docs/40-new-features/10-daytona-sandbox-execution](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:8071); [docs/40-new-features/10-daytona-sandbox-execution/30-lease-claims-and-lifecycle](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:7871); [docs/40-new-features/20-stop-while-thinking](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:8156)

**Code evidence:** [apps/server/src/core/cycle-runtime/phases/running/workers/worker-cycle.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/running/workers/worker-cycle.ts:1278); [apps/server/src/core/cycle-runtime/phases/running/scheduler/run-loop.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/running/scheduler/run-loop.ts:224); [apps/server/src/core/job-queue/sandbox-sleep.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/job-queue/sandbox-sleep.ts:41); [apps/server/src/core/cycle-runtime/phases/running/workers/worker-job.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/running/workers/worker-job.ts:365).

**Update:** Make sandbox-only execution, sleep/wake, close-time cleanup, and the host integration boundary canonical in system design. Mark older always-running decisions as superseded. Cover `--no-sandbox-sleep` and the debounce option. Audit the old host-versus-sandbox tool-placement and capacity tables rather than copying them unchanged.

## Update Contracts and Coverage

### 06. Add the Missing Tool Suites and Allocator Contract

**Medium.** The roster documents 14 suites; the registry contains 17. Missing suite pages are `asm_window_search`, `type_layout_lookup`, and `mwcc_alloc`. Allocator tools appear by name on the Worker page, but the docs have no dedicated explanation of trace capture or the analysis added September 7.

**Affected docs:** [docs/20-implementation/50-tools](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:7464); [docs/20-implementation/50-tools/45-mwcc-debug](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:7348)

**Code evidence:** [toolpacks/gamecube-decomp/registry.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/toolpacks/gamecube-decomp/registry.json:224); [apps/server/src/core/tools/resolver.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/tools/resolver.ts:368); [apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts:235); [toolpacks/gamecube-decomp/compiler/mwcc_alloc/tool.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/toolpacks/gamecube-decomp/compiler/mwcc_alloc/tool.json:1).

**Update:** Add the three suite pages and correct the roster. For allocator tooling, cover snapshot/pair/trace, `stages` versus `full`, sandbox-required capture, saved artifacts, analysis modes, compiler identity/omissions, and the need to validate hypotheses. Use the pinned tool manifest as the detailed reference. This code inspection does not establish live sandbox provisioning success.

### 07. Update the Librarian Agent Contract

**Medium.** The event-driven agent page says confirmed facts are re-cited, says no producer exists for drift rechecks, lists the older kv2/subject_record tool vocabulary, and omits the newer per-task failure behavior. Its output example omits follow-ups and its context table omits the proposed-name file excerpts. These details matter when diagnosing repeated passes and failed drains.

**Affected docs:** [docs/10-system-design/45-agents/20-librarian-v2](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:4867); [docs/10-system-design/45-agents/30-backfill-librarian](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:4973)

**Code evidence:** [apps/server/src/core/agent-catalog/agents/knowledge/librarian-v2/prompt.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/knowledge/librarian-v2/prompt.ts:65); [apps/server/src/core/knowledge-v2/drift/cli.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/knowledge-v2/drift/cli.ts:174); [apps/server/src/core/knowledge-v2/librarian/consumer.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/knowledge-v2/librarian/consumer.ts:48); [apps/server/src/core/knowledge-v2/librarian/consumer.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/knowledge-v2/librarian/consumer.ts:1181); [apps/server/src/core/tools/profiles/defaults.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/tools/profiles/defaults.ts:86).

**Update:** Align both agent pages with the current prompt, schema, and consumer. Document 24-row PR splitting, 12-subject drift splitting, splitting or abandonment after two task failures, follow-ups, manual drift-scan production, and the head-code citation exception for drifted PR facts. Keep this focused on harness behavior, not game knowledge quality.

### 08. Remove Retired Ledger and Dashboard Claims

**Medium.** The implementation map still says the legacy learnings ledger, `ledger_search`, classification lane, and dashboard route remain live. The dashboard page points to `/knowledge/legacy`. The legacy exit removed those components; code-graph support remains and should not be conflated with the removed learnings ledger.

**Affected docs:** [docs/20-implementation/30-knowledge](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:7172); [docs/10-system-design/40-knowledge/85-dashboard-and-operator-controls](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:4233)

**Code evidence:** [apps/server/src/api/routes/knowledge.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/api/routes/knowledge.ts:57); [apps/server/src/api/routes/knowledge-v2.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/api/routes/knowledge-v2.ts:353); [apps/server/src/core/tools/profiles/defaults.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/tools/profiles/defaults.ts:1). Commit `9fa6a39b` records the legacy-ledger/API/view removal, and the docs worklist itself records that exit.

**Update:** Rewrite the module map and remove the legacy dashboard destination. Add the implemented `/api/knowledge/v2/drift-warnings` view and summary behavior. Retain frozen V1 data only as an explicitly historical archive reference.

### 09. Correct the Schema-Parity Rule

**Medium.** The implementation page explicitly permits the Drizzle schema mirror to lag the DDL. The repository has a parity test for every table, column, and named index. The worklist records this gap as closed September 3.

**Affected docs:** [docs/20-implementation/30-knowledge](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:7202)

**Code evidence:** [apps/server/src/core/knowledge-v2/storage/schema.test.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/knowledge-v2/storage/schema.test.ts:38).

**Update:** Keep DDL as the schema authority, but require the typed schema and fresh-store parity test to change with it. Remove "may lag" as an accepted rule.

### 10. Complete the Event Catalog

**Medium.** The catalog has 79 event rows versus 88 literal v1/status registrations in the source. It omits seven `job.*` events and `sandbox.created`/`sandbox.deleted`. The adjacent knowledge-events page still describes the retired knowledge-job lifecycle without the historical qualification already added to the catalog.

**Affected docs:** [docs/10-system-design/60-tracing/20-registry-and-catalog](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:6289); [docs/10-system-design/60-tracing/40-sync-and-knowledge-events](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:6765)

**Code evidence:** [apps/server/src/core/harness-state/event-registry.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/harness-state/event-registry.ts:349); [apps/server/src/core/harness-state/event-registry.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/harness-state/event-registry.ts:374). Set comparison found no document-only event names; this is a coverage gap, not grounds to remove replay registrations.

**Update:** Add `job.enqueued`, `job.claimed`, `job.started`, `job.waiting`, `job.succeeded`, `job.failed`, `job.cancelled`, and both sandbox events with their contracts. Mark historical producers consistently and audit PR campaign entries for active-versus-replay status. Validate payload fields separately; the set comparison only checks event names.

## Repair Navigation and Maintenance Guidance

### 11. Replace the Fictional Registration Activation Flow

**Medium.** The registration page still promises repository/toolkit/credential validation, worktree verification, activation, and a durable registration result. `resolveGame` reads and merges descriptors, resolves paths/defaults, and returns warnings. The bug catalog calls this documentation problem corrected, but the current page still contains it.

**Affected docs:** [docs/10-system-design/20-game/20-registration-and-setup](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:155); [docs/40-new-features/30-global-flow-map/90-known-bugs](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:8857)

**Code evidence:** [apps/server/src/core/game-registry/resolver.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/game-registry/resolver.ts:588); [apps/server/src/core/game-registry/resolver.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/game-registry/resolver.ts:580).

**Update:** Document descriptor discovery, local overrides, explicit overrides, and warning behavior. Put actual cycle/worktree provisioning under its owning lifecycle. Remove the implied registration event unless an implemented producer is identified, and reopen the docs-corrected catalog row until the rewrite is verified.

### 12. Fix the Contradictory Write-Set Default

**Medium.** The same page labels widening modes "default: off" and later correctly says omission selects `header`. This gives readers the wrong default edit-authority expectation.

**Affected docs:** [docs/10-system-design/50-workflows/20-run/40-workers/30-write-safety](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:5999)

**Code evidence:** [apps/server/src/core/game-registry/runtime-options.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/game-registry/runtime-options.ts:34).

**Update:** Change the stale label to `header` and reconcile the page's claim/workspace terminology with the sandbox rewrite. Preserve the distinction between an initially target-only claim and a default mode that allows a properly approved widening request.

### 13. Refresh the Entry Point and Implementation Roadmap

**Medium.** The root page says these are package-local markdown docs under `decomp-orchestrator/`, points at nonexistent `../docs-system`, and calls New Features decided-but-unbuilt starting with Daytona. The roadmap mixes a historical plan with "current status", names absent agent areas, says richer graph edges are future work, and says the dashboard does not publish PRs. Those descriptions no longer form a reliable current entry point.

**Affected docs:** [docs](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:8976); [docs/20-implementation/99-appendix/20-implementation-roadmap](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:7610)

**Code evidence:** [package.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/package.json:32); [apps/server/src/core/agent-catalog/registry.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/agent-catalog/registry.ts:1); [apps/server/src/core/cycle-runtime/phases/running/epochs/cycle-draft-pr.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/cycle-runtime/phases/running/epochs/cycle-draft-pr.ts:1). The package scripts use `../Core/docs-system`; the corpus consists of `doc.json` bundles rendered through the CLI.

**Update:** Rewrite the root scope and docs-tooling path. Label the roadmap as historical or replace its current-status column with verified behavior. Separate retired campaign machinery from the surviving epoch draft-PR publication. State which New Features pages are implemented, superseded, or still proposed.

### 14. Reconcile Worklist Status With Owning Pages

**Medium.** The records contain contradictory current-status statements: one worklist row retains `ledger_search` while a later row records its removal; Open Questions still asks when the retired ledger will exit; the schema-parity gap is marked done while implementation guidance permits lag; registration is marked docs-corrected while the old flow persists. Some completed rows still call code uncommitted.

**Affected docs:** [docs/10-system-design/40-knowledge/90-record/70-worklist](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:4652); [docs/10-system-design/40-knowledge/90-record/30-open-questions](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:4485); [docs/40-new-features/30-global-flow-map/90-known-bugs](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:8849)

**Code evidence:** [apps/server/src/core/tools/profiles/defaults.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/tools/profiles/defaults.ts:1); [apps/server/src/core/knowledge-v2/storage/schema.test.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/knowledge-v2/storage/schema.test.ts:1); [apps/server/src/core/game-registry/resolver.ts](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/game-registry/resolver.ts:588). These contradictions are also visible between the linked rendered pages.

**Update:** Keep dated measurements as historical evidence. Add explicit supersession to old decisions, close only verified open questions, and require completed docs tasks to link to the owning updated page. Audit the still-open bug rows against source/tests before changing their statuses.

### 15. Repair the Documentation Health Gate

**Maintenance blocker.** `bun run docs:check` exits 1 during audit, so its chained link check is skipped. Audit reports 732 errors and 27 warnings: 725 em-dash errors across 76 pages, seven E6 unwritable structured-table property errors, 24 dense-paragraph warnings, two heading-order warnings, and one multiple-H1 warning. All 140 bundles still render successfully through the CLI.

**Affected docs:** [docs/10-system-design](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:7103); [docs/10-system-design/20-game](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:213); [docs/10-system-design/30-harness](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:1085); [docs/10-system-design/30-harness/20-harness-state](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:282); [docs/10-system-design/30-harness/70-durable-records](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:1049)

**Code evidence:** [package.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/package.json:35); [full audit output](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/audit.txt). The E6 errors reject nested `attributes.reference` properties. The other two affected E6 pages are [docs/10-system-design/50-workflows/20-run](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:6141) and [docs/40-new-features/30-global-flow-map](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md:8884).

**Update:** First resolve structured-table reference compatibility with the current docs toolchain and verify that edits round-trip. Then repair the writing/heading violations and rerun both checks. Do not remove references merely to silence E6. A separately executed link check passed with zero stale structured references; it does not validate behavior or every path written as prose.

## Further Audits to Schedule

These are follow-up audit scopes, not additional claims of confirmed implementation defects.

| Area | What to audit | Why |
| --- | --- | --- |
| Sync and validation edge cases | Score-policy helper closure, fallback preservation, cycle-report baseline selection, rename-aware function/data pairing, and upstream-only adoption | Recent source changes are more specific than the current high-level Sync Process contract. Review `policy-merge.ts`, `sync/engine.ts`, and the shared regression evaluator before writing exact rules. |
| Operational runbook and defaults | Document the current CLI/dashboard entry points, `melee-live`, persisted versus fresh-run settings, 12-worker defaults, `gpt-6-astra`/medium, sleep controls, and independent summarizer/librarian enablement | A corpus-wide rendered-text search found no docs for the current model name, stable process name, docs-check commands, or sandbox-sleep disable flag. Trace defaults through entry-point overrides rather than publishing one universal value. |
| Diagrams and UI presentation | Visually review sync, worker lifecycle, write-safety, knowledge feedback, and global-flow diagrams after the semantic rewrite | CLI render exposes diagram references but does not visually validate the canvas/sequence content or dashboard rendering. |
| State/event contracts | Compare every documented DTO field, event payload, nullable field, and historical producer against types and fixtures | The action-count and event-name checks exposed drift, but were not exhaustive field-by-field conformance checks. |
| Historical bug and rollout records | Check each open/fixed/uncommitted status against commits, tests, and dated evidence | An old measurement or incident is not automatically wrong; presenting it as current status is the problem. |

## What Already Has Useful Current Coverage

| Page | Verified alignment in the inspected material |
| --- | --- |
| Worker Knowledge Surfaces | Describes the current reading-view tool, canonical-symbol caveat, first-diff context, and V2 card. Use this as the starting point for the Worker page rewrite. |
| Sync Process | Already describes policy merge and post-publication V2 intake. Extend it for recent edge cases and align the flow map with it. |
| Stop While Thinking | Describes the implemented sandbox-only placement, serialized sleep controller, and close-time cleanup. Supersede the older Daytona wording with this contract. |
| Knowledge worklist closure rows | Correctly record several implemented changes, including ledger removal, schema parity, and drift tooling. Propagate those conclusions into owning pages. |

These observations are bounded checks, not a declaration that those entire pages are drift-free.

## Recommended Update Order

1. Rewrite the five high-priority contracts together, including their duplicate flow maps.
2. Update the agent, tool, event, and storage inventories from current code.
3. Repair the root reading path, registration page, defaults, and contradictory worklist statuses.
4. Resolve the E6 table compatibility errors and writing/heading backlog.
5. Re-run the checks and visually review the affected diagrams and pages.

## Evidence and Reproduction

All documentation was read through the docs CLI. The rendered snapshot makes each cited claim reviewable even if canonical pages later change.

| Artifact | Contents |
| --- | --- |
| [Rendered corpus](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/corpus.md) | CLI output for all 140 bundles, grouped by original path |
| [Inventory](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/inventory.md) | Every bundle, line count, and rendered snapshot link |
| [Audit output](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/audit.txt) | Full errors and warnings, including block IDs |
| [Link output](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/links.txt) | Independent reference-check result |
| [Render manifest](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/docs/.drafts/harness-docs-audit-2026-09-08/manifest.json) | Per-bundle render exit status and stderr |

Commands executed from the harness root:

```sh
bun ../Core/docs-system/packages/docs-cli/src/index.ts render <document-folder>
bun run docs:check
bun ../Core/docs-system/packages/docs-cli/src/index.ts audit docs
bun ../Core/docs-system/packages/docs-cli/src/index.ts links check docs
```

The configured docs toolchain is an external sibling checkout at `../Core/docs-system`, HEAD `1c3a627d3e2d3a445207469223f05b6a10f8979b`, with local changes. The lint/compatibility results apply to that installed checkout. This audit did not establish whether the E6 errors originated in a corpus change or a toolchain change.

The locally mounted docs-framework skill referenced a missing `30-workflows/70-audit.md`; an available framework copy was consulted for audit categories. Its older Markdown/frontmatter script instructions do not match this block-bundle corpus, so the harness's configured CLI checks were used. This tooling-documentation mismatch is outside the requested `/docs` findings.

No semantic health percentage is assigned. Render success and valid structured references do not establish that documented behavior matches code.
