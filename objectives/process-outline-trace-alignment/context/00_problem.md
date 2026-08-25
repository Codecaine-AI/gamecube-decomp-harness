# Problem

## Objective Question

Can an operator read a Process Outline in the harness docs, open the corresponding runtime trace in the harness UI or Observatory, and visually confirm that the system ran as documented?

Today the answer is no. The docs and traces describe overlapping systems at different levels, with different names and, in some cases, different process boundaries. The harness UI also drops container data when building trace spans, so a hierarchy that exists in server mapping code can render as a flat list.

## Docs Baseline

- The corpus is `docs/**/doc.json`. It contains 49 `process-outline` blocks across 42 files.
- Canonical outlines include `30-harness/10-process-overview` for the game lifecycle and knowledge lane, `50-workflows/20-run/20-run-loop`, `40-workers/10-lifecycle`, and `50-workflows/10-sync/20-process`.
- The Run Loop outline maps stage by stage to `runRunLoop` at `apps/server/src/core/cycle-runtime/phases/running/scheduler/run-loop.ts:671`, but omits the shutdown and drain path at lines 1477-1510.
- The Worker lifecycle has 28 steps. The Sync process has 26 steps.
- Seven outlines in the `60-tracing` chapter are sequence diagrams in disguise; their block IDs end in `-sequence`.
- `30-pr/20-score-gate-and-handoff` has 14 lowercase root steps with paragraph children converted from a code block.
- `90-record`'s migration-map outline has six unnamed root steps.

## Trace Baseline

- Container lineage lives in `apps/server/src/infrastructure/kernel/bridge/session-mapping.ts` and `bridge/spawn-context.ts`. `describeMeleeContainer` covers 22 kinds at `session-mapping.ts:236-391`; spawn lineage is assembled at `spawn-context.ts:235-518` from run through Epoch and Worker claim descendants.
- Application events come through `bridge/workflow-trace.ts` as `melee:<phase>_<status>`. Rows use `eventData.operation` for titles, for example `prepare.calculateBaseline`.
- The frontend calls `buildTraceSpans` without the `containers` argument at `apps/frontend/src/pages/workspace/trace/index.tsx:307-310`. The server does not emit phase or container events, so the harness view renders a flat list. Observatory in peer repo `Core/observatory` passes containers and renders the hierarchy.
- The docs' five-phase lifecycle does not match code phases `preparing`, `sync`, `running`, `pr`, and `complete`.
- Knowledge-lane outline steps have no matching trace containers.

## Naming Failures

- One concept appears as "cycle" in docs, `Game session <id>` in the trace root container at `session-mapping.ts:251`, and "Cycles" in the harness UI column.
- "reconcile" means merged-PR intake in docs but PR conflict resolution in traces at `spawn-context.ts:498-516`.
- `pr-qa` and `pr-handoff` hit the default branch of `describeMeleeContainer` at `session-mapping.ts:380-389`. Their bare-string labels are then re-parented to the root.

## Why This Matters

An outline should be an operator's map, not a second interpretation of the code. A flat or differently named trace makes normal execution look wrong and hides missing lineage. The finished system must make deviations visible enough to diagnose, not force the operator to translate between three vocabularies.
