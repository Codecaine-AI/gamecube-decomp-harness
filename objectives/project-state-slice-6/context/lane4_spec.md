# Lane 4 — documentation structure and absorption

First read: context/lane_common_rules.md. Then follow the docs-framework skill at
`.codex/skills/docs-framework/` (SKILL.md → cookbook → workflows). Rules from it:
- Read docs ONLY via the docs CLI (`render` / `grep`).
- Create/edit docs ONLY through the workbench/docs API the skill describes — NEVER write
  or hand-edit `doc.json` files directly. (If the workbench API requires the docs server,
  you may run `docs serve` on an ephemeral port and stop it when done. Never start the
  melee UI server.)
- Parents are compact overviews; children own contracts. Do not append the Slice 6
  contract into existing large pages.

## Exclusive ownership
- The five NEW canonical subtrees listed below.
- Compact index/reading-order updates to their existing section parents only:
  `docs/10-system-design/03-state-and-events/`, `docs/10-system-design/40-knowledge/`,
  `docs/20-implementation/30-knowledge/`, `docs/20-implementation/40-state/` (create if
  missing), `docs/20-implementation/60-ui/`.
- `objectives/project-state-slice-6/context/absorption_ledger.md` (your source-fact ledger).
DO NOT touch: any `apps/**` code, any other docs bundle, and NEVER delete or retire
`docs/40-new-features/20-project-state-and-events/` or any of its children.
Note some doc.json files are pre-dirty with unrelated edits (context/preexisting_dirty.txt);
if a parent you must index-update is in that list, make the minimal additive edit only.

## Exact structure to create (canonical, verbatim)
```
docs/10-system-design/03-state-and-events/05-project-state-and-authority/
  10-project-state-composition/  20-dispatch-authority-and-handoffs/
  30-operator-action-contract/   40-project-state-view/
docs/10-system-design/40-knowledge/70-execution-classes-and-jobs/
  10-source-classification/  20-job-lifecycle-and-leasing/
  30-processing-publication-and-provenance/
docs/20-implementation/30-knowledge/30-background-processing/
  10-job-storage-and-migration/  20-enqueue-claim-and-retry/
  30-materialization-and-idempotency/  40-operator-trigger/
docs/20-implementation/40-state/10-harness-state-and-authority/
  10-project-state-view-builder/  20-action-projection-and-guards/
  30-dispatch-integration/
docs/20-implementation/60-ui/20-harness-state-workspace/
  10-dto-and-client-model/  20-state-summary-and-freshness/
  30-action-controls-and-confirmation/  40-compatibility-actions/
```
(each node is a folder whose content is its doc bundle; parents are compact overviews
linking children).

## Document ownership (facts live in exactly one place; cross-link otherwise)
System Design:
- 10-project-state-composition: canonical ProjectState + workflow slots.
- 20-dispatch-authority-and-handoffs: leases, fencing, queues, handoffs, recovery.
- 30-operator-action-contract: the 21-action inventory, blockers, expected transitions,
  two-tier confirmation (keep the dated 2026-08-12 decision callouts).
- 40-project-state-view: canonical read-model shape and projection rules.
- 70-execution-classes-and-jobs (+children): source classes, job lifecycle/leasing,
  publication, provenance.
Implementation:
- 30-background-processing children: migration 017, enqueueing, claims/retries,
  materialization/idempotency, manual knowledge.process trigger.
- 40-state/10-project-state-and-authority children: view builder, action projection and
  guards, dispatch integration.
- 60-ui/20-project-state-workspace children: DTO hydration, summaries/freshness, action
  controls + confirmation, compatibility actions.

## Absorption task
Absorb these rendered feature sources into the canonical tree above:
- docs/40-new-features/20-project-state-and-events/10-authority-and-actions
- docs/40-new-features/20-project-state-and-events/60-knowledge
- docs/40-new-features/20-project-state-and-events/80-operator-view
Rules:
- Every source fact gets ONE primary canonical destination; cross-link instead of
  duplicating full contracts. Preserve dated decision callouts verbatim (2026-08-12
  decisions). State remains authoritative; events are accepted-fact history.
- Maintain the ledger at context/absorption_ledger.md: one row per source fact →
  destination doc (or "cross-linked from ..."), so absorption is auditable.
- Existing section parents get only compact index/reading-order updates.
- The new-features bundle stays untouched; retirement is a later, user-approved step.
- Write in the repo's design-narrative prose style (see writingstyle.md at repo root):
  what/where/why paragraphs, not atomized bullet dumps.
- Implementation docs may cite the Slice 6 code surfaces by path (apps/server knowledge
  background core, dashboard read-model, workspace UI); the code is being written
  concurrently by other lanes — describe the contract-level behavior and the named
  surfaces from context/02_implementation_scope.md rather than line-level details.

## Validation (focused only)
- `docs-cli render` every new parent and child (all 5 subtrees).
- Links check scoped to affected bundles if the CLI supports a path argument; otherwise
  `bun run docs:links` once and confirm no NEW failures versus pre-existing ones.
- Scoped diff check: `git status --porcelain docs/` — confirm the only newly-changed docs
  paths are your five subtrees + the named parents.

## Report
Write `objectives/project-state-slice-6/context/lane4_report.md` (created bundle paths,
parent updates, ledger location, render/link results, deviations).
