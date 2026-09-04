# Process Map

This is the living design document. Update it after every interview round, phase gate, and trace walkthrough.

## Settled Decisions

Decisions from the live design interview with Ford on 2026-08-20:

1. Fidelity: outlines are pretty detailed. They mirror what happens in the trace and add a few words of explanation per step. Labels need not match word for word, but when a trace node has a proper name such as Epoch, Worker, PR review, or Sync, the outline uses that name and never a synonym.
2. Trace emission is in scope. Every documented process must emit real containers and lineage so it appears hierarchically in the trace viewer. Today the harness frontend calls `buildTraceSpans` without the `containers` argument at `apps/frontend/src/pages/workspace/trace/index.tsx:307-310`, and the server never emits phase or container events, so the harness renders a flat list. Observatory in peer repo `Core/observatory` passes containers and renders hierarchy.
3. Scope includes all harness processes, including global ones. The harness has one global flow. Workflows, lifecycles, and similar processes are subpieces of that global flow. The docs structure must show global flow to subprocess outlines.
4. Naming uses one convention, chosen now. Known drift is "cycle" in docs, `Game session <id>` in the trace root at `session-mapping.ts:251`, and "Cycles" in the harness UI column. "reconcile" means merged-PR intake in docs but PR conflict resolution in traces at `spawn-context.ts:498-516`. The `pr-qa` and `pr-handoff` kinds hit the default branch of `describeMeleeContainer` at `session-mapping.ts:380-389`, get bare-string labels, and are re-parented to root. Winning terms remain a Round 2 question.
5. Bugs found along the way are triaged by severity. Fix trace-emission and labeling bugs inline. Catalog behavior bugs in this objective for separate threads.
6. This objective bundle is the tracker. `context/05_process_map.md` is the living design document and is updated after each interview round.
7. The interview switched to a process walkthrough (7 groups in global-flow order). A working visualization doc `docs/05-global-flow/doc.json` ('Global Flow (Working Map)') holds the entire system as one large process outline; it is the shared surface Ford and the agent iterate on, and detail is later mapped to owning chapters.
8. Group 1 (server-global daemons) confirmed 2026-08-20: server boot = small outline in a new server-and-global-infrastructure doc; global compile jobserver = outline, no trace containers; kernel trace tailer = outline beside the kernel-trace-linkage doc; managed process controller = full outline (high value; its doc 50-workflows/20-run/50-process-lifecycle currently has no outline block); generic job-queue consumer = one shared outline referenced by run and knowledge docs; dashboard SSE = one-line mention, no outline; UI hot-reload watcher = skipped; cycle process mirror = a note inside the process-controller outline.

## Open Questions

Round 2 is pending:

1. What single name wins for cycle, game session, and Cycles?
2. What rename gives merged-PR intake and PR conflict resolution distinct terms?
3. Where does the global-flow outline live, and how do subprocess outlines sit beneath it?
4. What is the granularity floor for a trace-visible action to receive its own outline step?
5. Which block types replace the seven sequence outlines, the converted score-gate code block, and the unnamed migration map?
6. What is the doctrine home: harness `docs-structure.md`, the Core docs-system vocabulary page, or both with one authoritative source?

## Key Findings

- There are 49 Process Outline blocks across 42 `docs/**/doc.json` files.
- Canonical outlines are `30-harness/10-process-overview` for game lifecycle and knowledge lane, `50-workflows/20-run/20-run-loop` for the stage-by-stage map to `runRunLoop` at `run-loop.ts:671`, `40-workers/10-lifecycle` with 28 steps, and `50-workflows/10-sync/20-process` with 26 steps.
- The `60-tracing` chapter has seven outlines that are sequence diagrams; their block IDs end in `-sequence`. `30-pr/20-score-gate-and-handoff` has 14 lowercase roots with paragraph children converted from a code block. `90-record`'s migration-map outline has six unnamed roots.
- Trace lineage uses 22 container kinds in `bridge/session-mapping.ts`, including `describeMeleeContainer` at lines 236-391, and `bridge/spawn-context.ts:235-518`, which builds run to Epoch to Worker claim lineage and related branches.
- Application events come through `bridge/workflow-trace.ts` as `melee:<phase>_<status>`. Rows use `eventData.operation`, for example `prepare.calculateBaseline`.
- The docs' five-phase lifecycle differs from code phases `preparing`, `sync`, `running`, `pr`, and `complete`. Knowledge-lane steps have no container counterparts.
- The Run Loop outline omits shutdown and drain at `run-loop.ts:1477-1510`.

## Process Inventory

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |

### A. Server-global daemons

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |
| HTTP+dashboard server | `S/infrastructure/http/server.ts:925` | operator boot | No | no | No |
| Sync startup reconciliation | `phases/sync/runtime.ts:723` | server boot | Partial | partial | No |
| Dashboard SSE | `http/server.ts:571` | browser connect | No | no | No |
| UI hot-reload watcher | `http/server.ts:204` | dev env flag | No (skipped) | no | No |
| Global compile jobserver | `S/infrastructure/shell/global-compile-jobserver.ts:387` | auto-config by every CLI job | No | no | No |
| Kernel trace tailer | `S/infrastructure/kernel/bridge/tailer.ts:295` | kernel runtime creation | Partial (write path only) | no | No |
| Managed process controller | `S/infrastructure/process-control/managed-process-controller.ts:552` | operator `/api/process/*` | No (doc exists, no outline block) | no | No |
| Generic job-queue consumer | `S/core/job-queue/consumer.ts:39` | started by run loop + knowledge processor | Partial (states outlined, loop not) | partial | No |
| Cycle process mirror | `S/core/cycle/process-mirror.ts:41` | process status reads | No (fold into controller outline) | no | No |

### B. Cycle lifecycle

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |
| Cycle phase state machine | `S/core/cycle-runtime/index.ts:511` | operator API | Partial (only open+close outlined; startRunning/enterPr/finishPrFinalBuild/markPrComplete/markCycleComplete/block/unblock not) | partial | No |
| Preparing phase | `phases/preparing/runtime.ts:295` | `/api/run/fresh\|init` | Partial + MISMATCH (legacy paths throw) | partial | No |
| Complete phase | `phases/complete/index.ts:3` | `/api/cycle/complete` | Yes | yes | No |
| Save points | `phases/pr/state/save-points.ts + jobs/save-point.ts:73` | CLI + API | No (doc `30-harness/40-save-points` has no outline block) | no | No |
| Save-point failure spool replay | `S/core/cycle/save-point-failure-spool.ts:186` | deferred replay | No | no | No |
| Game registration | `S/core/game-registry/resolver.ts:444` | descriptor + CLI | MISMATCH (design-only outline) | no | No |

### C. Sync

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |
| Sync workflow | `phases/sync/engine.ts:571` | operator API | Yes (2 outlines) | yes | No |
| Sync action projection | `phases/sync/runtime.ts:188` | read model | Partial | partial | No |
| Sync knowledge ingest | `phases/sync/knowledge.ts:400` | inside sync | Yes | yes | No |
| Sync CLI retry driver | `phases/sync/runtime.ts:530` | sync staging | No (minor) | no | No |

### D. Run

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |
| Run loop | `phases/running/scheduler/run-loop.ts:671` | CLI run-loop via process controller | Yes (incomplete: provider probe, drain, force-finish-epoch, fast knowledge lane thin) | yes | No |
| Scheduler tick | `scheduler/tick.ts:231` | run loop + CLI | Yes | yes | No |
| Epoch boundary | `scheduler/epoch-boundary.ts:112` | run loop | Yes | yes | No |
| Epoch cycle | `epochs/cycle.ts:565` | boundary | Yes | yes | No |
| Confirmation pass + revert-bisect | `epochs/confirmation-pass.ts:212` | boundary | Yes | yes | No |
| Cycle draft PR publication | `epochs/cycle-draft-pr.ts:292` | boundary when enabled | No | yes | No |
| Worker output integration drain | `integration/worker-output-queue.ts:527` | run loop | Yes | yes | No |
| Integration resolver | `integration/integration-resolve.ts:201` | run loop + CLI | Partial (agent doc has no outline) | yes | No |
| Worker task | `workers/worker-cycle.ts:2378` | spawned per claim | Yes (attempt/repair loop thin) | yes | No |
| Worker job + lease reaping | `workers/worker-job.ts:327` | consumer | Yes | yes | No |
| Claim recovery | `jobs/recover-claims.ts:649` | CLI + startup + stop | Partial (journal procedure unoutlined) | partial | No |
| Supervised run settlement | `jobs/settle-supervised-run.ts:16` | run-loop finally | No | partial | No |
| Run control pause/resume/hard-stop/cancel/recover | `running/run-control-runtime.ts:90` | operator API | Partial (`30-harness/60-operator-actions` has no outline block) | partial | No |
| Run init | `service/init-run.ts:15` | operator | Partial | partial | No |
| Board prioritization | `running/board/*` | tick + boundary | Yes | no | No |
| Pending integration reconcile | `S/core/cycle/pending-integrations.ts:324` | boundary/startup | Yes | yes | No |
| Run checkpoint | `phases/pr/checkpoint/checkpoint.ts:764` | CLI + API | Yes | yes | No |

### E. PR

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |
| Campaign state machine | `phases/pr/campaign/runtime.ts:560` | operator API | Yes (adoptLegacy + recoverCampaign not outlined) | yes | No |
| Work items | `campaign/work-items.ts:155` | API | Yes | yes | No |
| Remote PR observation | `campaign/observation.ts:63` | dormant refresh | Yes | yes | No |
| PR split plan | `pr/jobs/pr-split-plan.ts:1397` | CLI + API | Partial (splitter agent doc has no outline) | yes | No |
| Draft-PR QA | `jobs/pr-draft-qa.ts:547` | CLI + API | Partial (comment classification lane unoutlined) | yes | No |
| QA repair | `jobs/qa-repair.ts:1056` | CLI + API | Yes | yes | No |
| Pre-ship review | `jobs/pr-preship-review.ts:371` | CLI | No | yes | No |
| PR cycle review | `jobs/pr-cycle-review.ts:1504` | CLI | Yes (re-diff outline) | yes | No |
| Verify ship set | `jobs/verify-ship-set.ts:121` | CLI + API | Yes | yes | No |
| Reconcile agent | `jobs/reconcile.ts:106` | CLI + API | No (agent doc has no outline) | yes | No |
| Local PR prepare/open batch | `S/api/routes/handoff.ts:44-48` | operator | Partial | partial | No |

### F. Knowledge

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |
| Background processor | `S/core/knowledge/background/index.ts:399` | run loop + API | Yes (shutdown-abandon unoutlined) | yes | No |
| Maintenance | `jobs/kg.ts:296` | cadence + boundary + CLI | Yes (tool-runner plan not a stage) | yes | No |
| Graph rebuild | `jobs/kg.ts:258` | CLI + boundary + review | Yes | yes | No |
| Opseq/siblings builders | `graph/builders/*` | rebuild | Yes | yes | No |
| Crosswalk | `no builder exists (tools only)` | design only | MISMATCH (design-only outline) | no | No |
| Attempt record | `jobs/attempt-record.ts` | shared attempt-record helpers | Yes | yes | No |
| Librarian corroborate | `jobs/librarian-corroborate.ts:172` | CLI | Yes | yes | No |
| Librarian backfill | `jobs/librarian-backfill.ts:599` | CLI one-shot | Partial (Discord input doc has no outline) | partial | No |
| PR indexer agent | `jobs/kg.ts:527` | CLI + prepare + review | Yes | yes | No |
| Knowledge intake agent | `jobs/kg.ts:624` | CLI + sync batches | Partial (source-classification doc has no outline) | yes | No |
| Curation | `S/core/knowledge/curator.ts:76` | CLI `kg-curate` | No | yes | No |
| Attempt ledger/tactic views | `attempt-view.ts` | rebuild + publication | Yes | no | No |
| Rank features/file card | `jobs/kg.ts:763/751` | CLI + board | Yes | no | No |

### G. Validation

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |
| Report run | `S/core/validation/report/run.ts:264` | CLI + API + boundary + prep | No | no | No |
| Regression check | `validation/jobs/regression-check.ts:56` | CLI + boundary | Partial | no | No |
| QA scan/gate | `validation/qa/*` | boundary + QA + gate | Yes | partial | No |

### H. Sandbox

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |
| Provisioning | `S/core/job-queue/provisioning.ts:57` | `buildWorkerTask` | Yes | yes | No |
| Lifecycle reconcile | `job-queue/sandbox-lifecycle.ts:131` | startup + settle + reap | Yes | yes | No |
| Stop-while-thinking | `job-queue/sandbox-sleep.ts:316` | turn quiescence | Yes | yes | No |
| Sandbox events | `job-queue/sandbox-events.ts:60` | transitions | Yes | yes | No |

### I. Tracing/events

| Process | Entry point | Trigger | Outline? | Containers in trace? | Verified? |
| --- | --- | --- | --- | --- | --- |
| Event handshake | `run-state/events.ts + run-loop.ts:1439` | producer→claim | Yes | yes | No |
| Dispatch lease | `S/core/harness-state/lease.ts` | workflow activation | Yes | yes | No |
| Kernel trace linkage | `S/infrastructure/kernel/runtime.ts:199` | every workflow event | Yes | yes | No |
| Operator timeline paging | `harness-state/event-query.ts` | UI | Yes | no | No |

### Coverage flags

- 12 processes have no outline coverage: global compile jobserver; managed process controller; kernel trace tailer; operator run-control actions; save points; report run; pre-ship review; reconcile agent job; cycle draft PR publication; knowledge curation; server boot + dashboard SSE; server-jobs CLI inventory.
- 5 outlines mismatch code: registration 4-stage process unimplemented; crosswalk wiki-mirror/generation unimplemented; preparing-phase legacy git-intake/PR-intake paths hard-throw; score-gate outline needs re-diff vs `pr-cycle-review.ts`; run-loop outline missing provider-probe/pause, force-finish-epoch, shutdown/drain.

## Naming Table

| Drifted terms | Current meanings and locations | Proposed winner | Decision status |
| --- | --- | --- | --- |
| cycle / `Game session <id>` / Cycles | Docs / trace root at `session-mapping.ts:251` / harness UI column | TBD | Round 2 pending |
| reconcile | Merged-PR intake in docs / PR conflict resolution at `spawn-context.ts:498-516` | TBD | Round 2 pending |
| Docs five-phase lifecycle / `preparing`, `sync`, `running`, `pr`, `complete` | Documented labels / runtime phase names | TBD | Round 2 pending |
| PR review / `pr-qa` / `pr-handoff` | Proper-name policy must cover default-labeled PR containers | TBD | Round 2 pending |

## Bug Catalog

| Severity | Where | Description | Fix inline? |
| --- | --- | --- | --- |
| medium | docs `20-game/20-registration-and-setup` | outlines a 4-stage registration process that has no implementation (`resolver.ts:444` is pure descriptor resolution) | no — rewrite outline in P3 |
| medium | docs `40-knowledge search-indexes 40-crosswalk` | documents wiki-mirror refresh + crosswalk generation that do not exist in code | no — rewrite or mark design-only |
| medium | `preparing/runtime.ts:317,324` vs docs | legacy prep subphases hard-throw but docs imply they run | no — docs fix in P3 |
| low | run-loop outline | missing provider-probe, force-finish-epoch, shutdown/drain stages | no — P3 rewrite |
| medium | `session-mapping.ts:380-389` | `pr-qa` + `pr-handoff` hit default branch, bare-string labels re-parented to root | yes — P2 |
