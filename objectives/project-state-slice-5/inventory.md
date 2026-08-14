# Event-catalog coverage inventory (read-only audit, 2026-08-13)
# Referenced by spec.md as "inventory #N". Verbatim findings summary.

## Emitter coverage
- Contract coordination events: all sync.*, run.*, session.*, knowledge.*, project.dispatch_* have live emitters with required facts EXCEPT: handoff_snapshot always null (no caller supplies it).
- pr.*: all live after slice 4 except none (series_revising/revised went live with the fixer commands).
- Derived status events: run complete; sync complete but sync.reconciling reused for progress facts (see conventions); session closing/blocked/complete have NO named events; work-item declined path exists post-slice-4.

## Extra events without contract counterpart
project.dispatch_request_cancelled; run.lease_reconciled; run.desired_workers_changed (double-writes legacy events table); sync.pr_push_started/succeeded/failed (subject_kind sync_push); eleven session phase-mirror events (session.preparing_subphase_updated etc.) — highest-volume writers.

## Gaps
1. (resolved by slice 4) pr.* wiring.
2. (resolved by slice 4) pr_phase timeline entries.
3. dispatch_released.handoff_snapshot structurally unimplemented.
4. save-point failure spool never replayed into project_events.
5. No read surface: listProjectEvents/latestSequence have zero production callers; only runRecoveryPoints reads the log.
6. Event payloads used as durable state: getSyncBlockedOriginStatus (state.ts:443), validationEvidence (publication.ts:218).
7. schema_version always 1, no registry.
8. Session closing/blocked/complete statuses eventless.

## Convention inconsistencies (numbering used by spec)
7.1 correlation_id: six defaulting rules; PR transitions drop caller correlation (dead field); lease ?? commandId fallback fragments workflows.
7.2 correlation chains break at lease handoffs (settlePausedRun: released vs sync.ingesting share neither correlation nor causation).
7.3 causation mixes command/event ids without discipline; per-call command minting in runs.ts; sub-command string suffixing.
7.4 span_id: three schemes (random, stableId, unprefixed composite); no parent_span_id column; no hierarchy.
7.5 trace_id per-subject: one workflow spans 3+ traces; PR series use series trace not campaign.
7.6 status event types reused for non-transition progress facts (sync.reconciling ×5 payload shapes).
7.7 actor unreliable: actorForProducer maps dashboard→operator; sync publish mixes operator/runner/runner in one action; agent never used.
7.8 payload/state duplication inconsistent (status/resulting_status/previous_status three names).
7.9 payload validation only in sync/pr/knowledge domains; nothing validates dispatch/run/session.
7.10 subject_kind unregistered vocabulary; dispatch events straddle project + workflow subjects.

## Kernel bridge
No linkage in either direction between project_events and kernel traces; only weak session-level join via project_sessions.kernel_trace_json. Frontend trace page reads kernel data only; correlation via string-matching heuristics.
