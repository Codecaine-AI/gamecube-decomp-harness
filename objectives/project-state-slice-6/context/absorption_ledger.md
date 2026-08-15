# Slice 6 Documentation Absorption Ledger

Each row assigns one atomic fact from a rendered feature source to one primary canonical document. The feature sources remain unchanged. `A` facts come from `10-authority-and-actions`, `K` facts from `60-knowledge`, and `OV` facts from `80-operator-view`.

Destination abbreviations: `COMP` = `docs/10-system-design/03-state-and-events/05-project-state-and-authority/10-project-state-composition`; `LEASE` = its `20-dispatch-authority-and-handoffs`; `ACTION` = its `30-operator-action-contract`; `VIEW` = its `40-project-state-view`; `CLASS`, `JOBS`, and `PUB` = the three children of `docs/10-system-design/40-knowledge/70-execution-classes-and-jobs`; `UI-DTO` = `docs/20-implementation/60-ui/20-harness-state-workspace/10-dto-and-client-model`.

## Authority and Actions

| Fact | Source fact | Primary destination |
| --- | --- | --- |
| A001 | Four workflow/session domains are separate state machines. | COMP |
| A002 | Every durable state object uses the common envelope. | COMP |
| A003 | Envelope identity is id, project_id, and kind. | COMP |
| A004 | revision increments once per accepted transition. | COMP |
| A005 | caused_by_event_id names the producing event. | COMP |
| A006 | Revision and causation support generic stale-write protection and reconstruction. | COMP |
| A007 | Blockers carry code, message, source_kind, source_id, and recoverable. | COMP |
| A008 | Shared blockers support domain-independent explanations. | COMP |
| A009 | trace_id joins state, events, and operations. | COMP |
| A010 | Each domain supplies its status enum and payload. | COMP |
| A011 | New state kinds adopt the envelope. | COMP |
| A012 | StateEnvelope has identity, status, revision, time, trace, causation, and blockers. | COMP |
| A013 | The rendered draining-run envelope is illustrative, not a separate contract. | COMP |
| A014 | Exclusive-dispatch working-design callout is preserved verbatim. | LEASE |
| A015 | 2026-08-12 ProjectState/dispatch-lease decision is preserved verbatim. | LEASE |
| A016 | ProjectState retains every workflow slot. | COMP |
| A017 | PR review state remains real while a run executes. | COMP |
| A018 | Requested sync is real before acquiring authority. | COMP |
| A019 | Only the dispatch lease grants dispatch and checkout mutation. | LEASE |
| A020 | At most one workflow holds the dispatch lease. | LEASE |
| A021 | Future run/PR concurrency changes lease policy, not ProjectState shape. | LEASE |
| A022 | foreground lease maps to dispatch lease. | LEASE |
| A023 | foreground workflow maps to active workflow. | LEASE |
| A024 | project.foreground_* maps to project.dispatch_*. | LEASE |
| A025 | Background evidence ingestion can continue without the dispatch lease. | LEASE |
| A026 | ProjectState is the state-tree root. | COMP |
| A027 | One ProjectState exists per project. | COMP |
| A028 | ProjectState answers what exists and who may act. | COMP |
| A029 | It composes session, run, PR, and sync slots. | COMP |
| A030 | Workflow slots mirror identity and status only. | COMP |
| A031 | Domain workflow objects remain canonical for detail. | COMP |
| A032 | No universal workflow status enum exists. | COMP |
| A033 | Each workflow owns its vocabulary. | COMP |
| A034 | ProjectState carries project, slots, active workflow, knowledge, trace, and time. | COMP |
| A035 | Project revision is monotonic and protects writes. | COMP |
| A036 | Session slot is nullable and mirrors session id/head revision. | COMP |
| A037 | Run slot is nullable only when no session run exists. | COMP |
| A038 | PR slot mirrors the open campaign. | COMP |
| A039 | Sync slot mirrors current/requested sync. | COMP |
| A040 | Null active_workflow forbids dispatch without hiding workflows. | COMP |
| A041 | background_knowledge carries counts, revision, and oldest pending time. | COMP |
| A042 | trace carries trace id, latest event sequence, and active operations. | COMP |
| A043 | The rendered ProjectState example demonstrates simultaneous durable slots. | COMP |
| A044 | active_workflow carries the dispatch lease. | LEASE |
| A045 | Fencing, not actor trust, enforces ownership. | LEASE |
| A046 | Acquisition mints a fresh lease_id. | LEASE |
| A047 | Worker-dispatch commands present the current lease id. | LEASE |
| A048 | Source-mutation commands present the current lease id. | LEASE |
| A049 | Stale lease actors are refused. | LEASE |
| A050 | DispatchLease carries owner, fence, status, time, handoff, and blockers. | LEASE |
| A051 | Lease kind is run, pr, or sync. | LEASE |
| A052 | workflow_id names the owning workflow. | LEASE |
| A053 | Lease statuses are acquiring, active, draining, blocked, releasing. | LEASE |
| A054 | heartbeat_at supplies recovery liveness evidence. | LEASE |
| A055 | Handoff carries target, reason, and request time. | LEASE |
| A056 | A requested handoff waits for the owner to settle. | LEASE |
| A057 | Lease blockers explain inability to settle/release. | LEASE |
| A058 | acquiring validates authority before domain work. | LEASE |
| A059 | active owns dispatch and allowed resources. | LEASE |
| A060 | draining forbids new work while obligations settle. | LEASE |
| A061 | blocked retains ownership pending recovery/operator action. | LEASE |
| A062 | releasing durably commits final/handoff evidence first. | LEASE |
| A063 | requestDispatch queues or immediately acquires. | LEASE |
| A064 | beginDrain disables new work and records handoff. | LEASE |
| A065 | releaseDispatch settles obligations and commits handoff evidence. | LEASE |
| A066 | recoverDispatch records cancellation and reconciliation evidence. | LEASE |
| A067 | getStateView projects summaries, freshness, and actions. | VIEW |
| A068 | getStateView returns ProjectStateView. | VIEW |
| A069 | Available actions project server authority. | VIEW |
| A070 | 2026-08-12 confirmation/publish decision is preserved verbatim. | ACTION |
| A071 | Confirmation is exactly for outward-facing or irreversible actions. | ACTION |
| A072 | PR batch publication is outward-facing. | ACTION |
| A073 | Sync publication is outward-facing. | ACTION |
| A074 | Published work cannot be quietly unpublished. | ACTION |
| A075 | Sync cancel, campaign abandon, and hard stop discard work. | ACTION |
| A076 | Run cancel, closures, and lease recovery are terminal. | ACTION |
| A077 | Routine controls are single-click and blocker-gated. | ACTION |
| A078 | Routine controls do not prompt. | ACTION |
| A079 | Blockers explain unavailable routine controls. | ACTION |
| A080 | Validated sync rests at validated. | ACTION |
| A081 | Only confirm-gated sync.publish crosses publication. | ACTION |
| A082 | Post-validation upstream movement creates staleness. | ACTION |
| A083 | Stale validation can be re-run. | ACTION |
| A084 | The matrix contains the complete 21-action v1 inventory. | ACTION |
| A085 | run.start guard/blocker/result/confirmation contract. | ACTION |
| A086 | run.pause guard/result/confirmation contract. | ACTION |
| A087 | run.resume guard/blocker/result/confirmation contract. | ACTION |
| A088 | run.hard_stop guard/result/confirmation contract. | ACTION |
| A089 | run.cancel guard/blocker/result/confirmation contract. | ACTION |
| A090 | run.recover guard/result/confirmation contract. | ACTION |
| A091 | pr.open_campaign guard/blocker/result/confirmation contract. | ACTION |
| A092 | pr.activate guard/blocker/result/confirmation contract. | ACTION |
| A093 | pr.publish_batch guard/blocker/result/confirmation contract. | ACTION |
| A094 | pr.release guard/blocker/result/confirmation contract. | ACTION |
| A095 | pr.close_campaign guard/blocker/result/confirmation contract. | ACTION |
| A096 | pr.abandon_campaign guard/result/confirmation contract. | ACTION |
| A097 | pr.campaign_recover guard/result/confirmation contract. | ACTION |
| A098 | sync.start guard/blocker/result/confirmation contract. | ACTION |
| A099 | sync.resolve_conflict guard/result/confirmation contract. | ACTION |
| A100 | sync.publish guard/blocker/atomic-result/confirmation contract. | ACTION |
| A101 | sync.cancel guard/blocker/result/confirmation contract. | ACTION |
| A102 | sync.recover guard/result/confirmation contract. | ACTION |
| A103 | session.save_point guard/result/confirmation contract. | ACTION |
| A104 | session.close guard/blocker/result/confirmation contract. | ACTION |
| A105 | knowledge.process guard/blocker/result/confirmation contract. | ACTION |

## Knowledge

| Fact | Source fact | Primary destination |
| --- | --- | --- |
| K01 | Worker-result evidence flows through the always-on background sink. | PUB |
| K02 | Other sources stage for operator-initiated sync. | PUB |
| K03 | All execution classes share one job vocabulary. | JOBS |
| K04 | Completed worker evidence is background_safe. | CLASS |
| K05 | Completed worker evidence is immutable. | CLASS |
| K06 | Completed worker evidence does not mutate checkout. | CLASS |
| K07 | A serialized materializer may publish worker evidence during a run. | PUB |
| K08 | Discord corpora are sync_stage. | CLASS |
| K09 | Static corpora are sync_stage. | CLASS |
| K10 | Those corpora may use workers under the sync lease. | CLASS |
| K11 | Those corpora need not change source truth. | CLASS |
| K12 | Those corpora stage before sync. | PUB |
| K13 | Those corpora publish during sync. | PUB |
| K14 | They may publish knowledge-only when upstream did not move. | PUB |
| K15 | Newly merged PRs are sync_stage. | CLASS |
| K16 | Merged PRs may invalidate the baseline. | CLASS |
| K17 | Merged PRs may duplicate local work. | CLASS |
| K18 | Merged PRs may create conflicts. | CLASS |
| K19 | Merged-PR knowledge publishes with reconciled sync. | PUB |
| K20 | PR review outcome class depends on effect. | CLASS |
| K21 | PR review evidence is background-safe. | CLASS |
| K22 | Source fixes require PR authority. | CLASS |
| K23 | Review ingestion is separate from fixer execution. | PUB |
| K24 | queued means durable unstarted work. | JOBS |
| K25 | queued is nonterminal. | JOBS |
| K26 | processing means a processor owns the lease. | JOBS |
| K27 | processing is nonterminal. | JOBS |
| K28 | waiting means dependency or retry delay. | JOBS |
| K29 | waiting is nonterminal. | JOBS |
| K30 | succeeded means accepted output with provenance. | PUB |
| K31 | succeeded is terminal. | JOBS |
| K32 | failed means no accepted output for the attempt. | JOBS |
| K33 | Retry policy chooses what follows failure. | JOBS |
| K34 | failed is terminal for that attempt. | JOBS |
| K35 | cancelled means intentionally discarded work. | JOBS |
| K36 | Cancellation preserves earlier accepted knowledge. | PUB |
| K37 | cancelled is terminal. | JOBS |

## Operator View

| Fact | Source fact | Primary destination |
| --- | --- | --- |
| OV01 | ProjectStateView is server-owned. | VIEW |
| OV02 | It explains authority. | VIEW |
| OV03 | It exposes queued work. | VIEW |
| OV04 | It exposes knowledge freshness. | VIEW |
| OV05 | It exposes available actions. | VIEW |
| OV06 | Every operator surface renders this projection. | UI-DTO |
| OV07 | Clients do not recompute project state. | UI-DTO |
| OV08 | available_actions applies two-tier confirmation. | ACTION; cross-linked from UI-DTO |
| OV09 | project_id is ProjectId. | VIEW |
| OV10 | project_revision is integer. | VIEW |
| OV11 | session is nullable SessionSummary. | VIEW |
| OV12 | Session summary carries active identity. | VIEW |
| OV13 | Session summary carries head revision. | VIEW |
| OV14 | Session summary carries latest timeline entry. | VIEW |
| OV15 | active_workflow is nullable ActiveWorkflowSummary. | VIEW |
| OV16 | It identifies the dispatch-lease holder. | VIEW |
| OV17 | It is null when the lease is free. | VIEW |
| OV18 | Active kind is run, pr, or sync. | VIEW |
| OV19 | Active workflow_id is WorkflowId. | VIEW |
| OV20 | Active status uses the five lease statuses. | VIEW |
| OV21 | Active headline is string. | VIEW |
| OV22 | Active blockers is Blocker[]. | VIEW |
| OV23 | queued_dispatch_requests is DispatchRequest[]. | VIEW |
| OV24 | Queue entries wait for the dispatch lease. | VIEW |
| OV25 | run is nullable RunSummary. | VIEW |
| OV26 | pr_work is PrWorkflowSummary[]. | VIEW |
| OV27 | knowledge is KnowledgeFreshnessSummary. | VIEW |
| OV28 | sync is nullable SyncSummary. | VIEW |
| OV29 | active_operations is OperationSummary[]. | VIEW |
| OV30 | recent_events is EventSummary[]. | VIEW |
| OV31 | available_actions is ActionProjection[]. | VIEW |
| OV32 | Action projection has string action_id. | VIEW |
| OV33 | Action projection has string subject_kind. | VIEW |
| OV34 | Action projection has string subject_id. | VIEW |
| OV35 | Action projection has boolean enabled. | VIEW |
| OV36 | Action projection has Blocker[] blocked_by. | VIEW |
| OV37 | Action projection has expected_transition. | VIEW |
| OV38 | Action projection has confirmation_required. | VIEW |
| OV39 | Example is melee project revision 1842. | VIEW |
| OV40 | Example session-7 head is upstream-9ba1. | VIEW |
| OV41 | Example lease holder is run-2026-08-11-01. | VIEW |
| OV42 | Example lease is draining with its stated headline. | VIEW |
| OV43 | Example blocker is two active claims. | VIEW |
| OV44 | Example queues sync-2026-08-11-02. | VIEW |
| OV45 | Example run has two active workers. | VIEW |
| OV46 | Example series-18 waits for review. | VIEW |
| OV47 | Example knowledge is revision 381 with six queued results. | VIEW |
| OV48 | Example sync is requested at observed upstream-9ac4. | VIEW |
| OV49 | Example drain operation is running. | VIEW |
| OV50 | Example recent event is dispatch_requested sequence 92811. | VIEW |
| OV51 | Example run.hard_stop is enabled and unblocked. | ACTION |
| OV52 | Its expected transition is draining → paused. | ACTION |
| OV53 | It requires confirmation. | ACTION |
| OV54 | Example sync.start is disabled. | ACTION |
| OV55 | It is blocked by two active claims. | ACTION |
| OV56 | Its expected transition is requested → ingesting. | ACTION |
| OV57 | Disabled sync.start does not require confirmation. | ACTION |
