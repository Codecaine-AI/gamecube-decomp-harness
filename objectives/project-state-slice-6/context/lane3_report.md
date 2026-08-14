# Lane 3 report — frontend ProjectState projection and controls

## Changed files

- `apps/frontend/src/pages/workspace/_lib/types.ts`
- `apps/frontend/src/pages/workspace/_lib/model.ts`
- `apps/frontend/src/pages/workspace/_lib/model.test.ts`
- `apps/frontend/src/components/app/_lib/projectedCanonicalActions.ts`
- `apps/frontend/src/components/app/_lib/projectedCanonicalActions.test.ts`
- `apps/frontend/src/components/app/_lib/projectedCompatibilityControls.ts`
- `apps/frontend/src/components/app/_lib/projectedKnowledgeControls.ts`
- `apps/frontend/src/components/app/_lib/projectedSessionControls.ts`
- `apps/frontend/src/components/app/_lib/projectedRunControls.ts`
- `apps/frontend/src/components/app/_lib/projectedRunControls.test.ts`
- `apps/frontend/src/components/app/_lib/projectedPrCampaignControls.ts`
- `apps/frontend/src/components/app/_lib/projectedPrCampaignControls.test.ts`
- `apps/frontend/src/components/app/index.tsx`
- `apps/frontend/src/pages/workspace/index.tsx`
- `apps/frontend/src/pages/workspace/knowledge/index.tsx`
- `apps/frontend/src/pages/workspace/overview/SyncStateCard.tsx`
- `apps/frontend/src/pages/workspace/sessions/index.tsx`
- `apps/frontend/src/pages/workspace/sessions/active/subphases/pr/components/PrCampaignCard.tsx`

## Model shape decisions

- The workspace model consumes only the canonical top-level names: `project_id`,
  `project_revision`, `pr_work`, `knowledge`, `active_operations`, `recent_events`,
  `available_actions`, and `compatibility_actions`. No fallback to legacy `revision` or
  singular `pr` is present.
- `active_workflow` preserves the existing lease/hand-off detail fields while adding the
  required `headline` and canonical blockers.
- `pr_work` is parsed as an array. Action dispatch selects the campaign matching the
  server-projected `subject_id`, with the first projected campaign used only for legacy
  non-authority display paths.
- Knowledge freshness explicitly models published revision, queued/processing/waiting/
  failed counts, oldest pending time, active lease, retry/backoff state, and recent
  failures. Summary objects also preserve additional server fields through `JsonObject`
  spreads so the moving Lane 1/2 seam is not lossy.
- Operation and event summaries preserve all server fields while requiring their stable
  display anchors (`operation_id`/`status` and `event_type`/`sequence`).
- `projectStateAction` searches only the 21 canonical `available_actions`.
  `projectStateCompatibilityAction` searches only `compatibility_actions`.
- The exact 21-action ordered inventory is exported from
  `projectedCanonicalActions.ts`. Run, PR, sync, session, and knowledge surfaces show
  projected actions even when disabled, including blockers and expected transitions.
- `pr.adopt_legacy` is rendered in a separately titled compatibility section and is
  dispatched through separate compatibility maps.
- Confirmation and `confirmed: true` are driven by `confirmation_required`. Cancelling
  the browser confirmation returns before command dispatch. `session.close` uses the
  same projected flow.

## Validation

1. `bun run ui:check`
   - PASS, exit 0.
   - `tsc --noEmit -p apps/frontend/tsconfig.json`; zero diagnostics.

2. `bun test apps/frontend/src/pages/workspace/_lib/model.test.ts`
   - INFRASTRUCTURE BLOCKED after three attempts (including one isolated retry).
   - Latest result: exit 1, 0 pass, 1 fail, 1 unhandled error, 0 tests executed.
   - Bun failed before loading the test with `EMFILE`/`ENFILE` while reading the frontend
     directory and `apps/frontend/tsconfig.json`.

3. `bun test apps/frontend/src/components/app/_lib/`
   - INFRASTRUCTURE BLOCKED after two attempts.
   - Result: exit 1 before assertions; Bun reported `EMFILE`/`ENFILE`, could not load the
     test modules, and executed 0 tests.

No additional component test file was touched outside the required `_lib/` test target.

## Deviations and blockers

- Focused Bun assertions could not execute because the shared machine exhausted its
  process/system file-descriptor quota. Repeated parallel and isolated invocations had
  the same pre-test module-loading failure. This is the only validation deviation.
- No server, docs, migration, or package file was edited. No server was started. No git
  write command was run.

## Bounded test fix

- The canonical-inventory aggregation deduplicates action IDs within each domain map,
  preserving the legacy `syncRevalidate` alias while still asserting that every canonical
  ID belongs to exactly one domain.
- `bun test ./apps/frontend/src/components/app/_lib/`: PASS — 14 pass, 0 fail.
