# Slice 4 — PR Campaign (implementation spec)

Authority: docs/40-new-features/20-project-state-and-events/40-pr-campaign
(render via bun packages/docs-framework/packages/docs-cli/src/index.ts render),
plus 10-authority-and-actions (pr.* action rows), 20-project-session (pr_phase
timeline entries), 70-events (per-series subjects, pr.* event table). Slices
1-3 primitives are in force: core/project-state (lease/queue/drain),
run-envelope-cas pattern, core/project-session/timeline.ts (pr_phase schema
exists, writer lands HERE), phases/sync (reconciles series branches at its
boundary). Contract wins — stop and report disagreements.

Ground rules unchanged: tracing everywhere; one event per accepted transition
same-tx; manual operator control (publication is operator-gated per batch;
fixers run only inside operator-entered activations); loud failure; no
timers; temp dirs; never touch live state; no git state ops in the shared
worktree; bun test with explicit paths from apps/server.

Existing PR landscape (verify, do not trust blindly): phases/pr/ runtime.ts
(publish/handoff), pr-records.ts (pr_records.json session_pr_records_v2, real
session uuid threaded in slice 2), pr-worktrees.ts (branch worktrees,
force-with-lease), pr-sync.ts (GitHub PR-record observation — splitSeries*
helpers parse codex/split-NN-<slug> branches), review-ledger.ts,
github-comments.ts, checkpoint/ (run_checkpoints), jobs/ (split-plan,
session-review, draft-qa, qa-repair, preship-review, verify-ship-set,
reconcile). PR state today is smeared across SQLite checkpoints,
pr_records.json, and pr_state_json blobs and keyed to run ids.

## Deliverable C1 — PrCampaign/PrSeries state machines

- Migration (write the module but do NOT register it in migrations/index.ts —
  the coordinator wires registration serially to avoid registry collisions;
  use the next free number at wiring time, write the file as
  0XX-pr-campaign.ts with a placeholder number in the filename documented in
  current_state.md): pr_campaigns table (envelope: campaign_id PK, project_id,
  session_uuid, revision, status, trace_id, caused_by_event_id, blockers_json,
  created_at, closed_at, latest_event_sequence; source_anchor_json
  {save_point_id, source_revision} immutable; publication_policy_json
  {batch_size default 4}); pr_series table (series_id PK, campaign_id FK,
  revision, batch_index, status, branch, upstream_pr_number NULL,
  target_units_json, last_validation_json, trace_id, caused_by_event_id,
  blockers_json, updated_at); pr_work_items table (item_id PK, series_id FK,
  source_kind, source_id, status, summary, created_at, resolved_at). Partial
  unique index: at most one campaign per project with status NOT IN
  ('completed','abandoned').
- Status vocabularies exactly per contract: campaign preparing | in_review |
  working | completed | abandoned; series prepared | published |
  changes_requested | revising | approved | merged | closed; work items
  pending | in_progress | resolved | declined.
- Module core/session-runtime/phases/pr/campaign/ : CAS primitives for
  campaign and series (one event per accepted transition; per-series events
  carry the SERIES as subject_id with correlation_id grouping under the
  campaign, per the contract's per-series-subject decision), work-item
  ingestion (background-safe: ingesting feedback never needs the lease),
  events pr.campaign_opened, pr.batch_published, pr.series_published,
  pr.feedback_ingested, pr.series_revised, pr.series_merged, pr.series_closed,
  pr.campaign_recovered, pr.campaign_closed + derived status-transition
  events.
- Campaign opens from a validated stable save point (source anchor) —
  pr.open_campaign valid when no open campaign exists and a named,
  non-stale save point anchors the current session head (reuse the slice-1
  close-gate staleness machinery).

## Deliverable C2 — activations, batches, and the lease

- Activation = the period the campaign holds the dispatch lease (kind 'pr'):
  pr.activate (campaign exists + lease free → working; drain-handoff via the
  standard queue+drain path when the run holds it), pr.release (working →
  in_review once fixers settle; lease released). Every activation writes a
  pr_phase timeline entry pair (open on acquire, close on release) via
  core/project-session/timeline.ts — implement the pr_phase writer now
  (durable with the lease transitions, per the contract's timeline table).
- Batch publication: operator-gated, pr.publish_batch (confirm) publishes the
  next prepared batch (batch_size series) — wire onto the existing publish
  machinery in phases/pr/runtime.ts + pr-worktrees.ts (branch push + PR open
  via the existing gh integration), series prepared→published with
  upstream_pr_number recorded. Remaining series stay prepared until the next
  explicit go. Blocked by unvalidated series and sync-invalidation blockers.
- Migration of existing state: existing open split PRs (pr_records.json +
  codex/split-* branches) must be adoptable into a campaign: a one-shot
  adoption path (operator command pr.adopt_legacy or automatic on first
  campaign open IF unambiguous — prefer explicit operator command) creates
  series rows for existing branches with their real statuses derived from
  pr-sync observation. Do not lose or duplicate the existing records; the
  ledger and records files stay as evidence.

## Deliverable C3 — background observation + feedback

- pr-sync.ts observation maps remote state onto series CAS transitions
  (published→changes_requested/approved/merged/closed) as background-safe
  transitions with events (actor external_observer). Feedback ingestion
  creates work items immediately (pending) — never preempts, never needs the
  lease; fixer execution happens only inside activations (jobs/qa-repair +
  fixer agents run under the pr lease with lease_id threaded).
- Merged series: terminal; the merged result returns via the next sync
  (sync's pr_reconciliation already handles open branches; merged branches
  are excluded by the slice-3 repair — verify integration).

## Deliverable C4 — actions, read model, UI

- ActionProjections per the inventory: pr.open_campaign (no confirm),
  pr.activate (no confirm), pr.publish_batch (confirm), pr.release (no
  confirm), pr.close_campaign (confirm; every series terminal),
  pr.abandon_campaign (confirm), pr.campaign_recover (confirm; stale/failed
  activation lease → in_review).
- projectState.pr summary: campaign status, series by status, next batch
  (indices + validation state), pending work items, activation state.
- Frontend: campaign card (status, series table with per-series status +
  upstream PR links, batch publish button with confirm dialog listing the
  batch's series, work-item queue, activate/release controls); replaces the
  legacy PrModeActions surface progressively — legacy buttons route through
  the new projections where they overlap.

## Deliverable C5 — docs re-point (after C2/C3)

- Re-point docs/10-system-design/50-ship-and-pr to the campaign model as
  present-state truth (parent = compact overview; content in child bundles —
  NEVER write content into the parent doc.json; the structural exemplar is
  docs/40-new-features/20-project-state-and-events). Mirror the contract's
  dated decisions (PR phase operator-entered 2026-08-11; durable campaign
  2026-08-12). Do not touch 10-score-and-pr-handoff content owned by the
  other stream beyond what the campaign model supersedes — verify overlap
  before editing. Render+audit 0/0 + links check.

## Verification (coordinator)

Full suites; migration dry-run on real melee DB copy then live; trace
reconstruction covering campaign open → activate (pr_phase entry) → batch
publish → feedback ingest → revise → release → merged; adversarial review +
repairs. Legacy-adoption verified against the real pr_records.json shape
(read-only) before live migration.
