<current_state>
<last_updated>2026-08-13</last_updated>

<status>
- Deliverable C1 implementation is complete and locally verified.
- The authoritative PR-campaign and event bundles have been rendered and read.
- Existing concurrent changes, including protected PR runtime and sync files, are being treated as read-only.
</status>

<completed>
- Confirmed the exact campaign, series, and work-item status vocabularies.
- Confirmed one event per accepted transition and per-series event subjects correlated under the campaign.
- Reserved `apps/server/src/core/orchestrator-state/storage/migrations/0XX-pr-campaign.ts` as the intentionally unregistered migration placeholder.
- Added the three-table migration, campaign/series/work-item state machines, stable named-save-point open gate, background-safe feedback ingestion, and the `pr.*` event vocabulary.
- Focused validation passes: 15 tests across three new test files; server TypeScript validation passes.
</completed>

<in_progress>
- None for Deliverable C1.
</in_progress>

<next_actions>
- Coordinator: replace the `0XX` filename and placeholder migration version with the next free number, then register the migration in `migrations/index.ts`.
- Continue with later deliverables without changing C1's event/subject/correlation invariants.
</next_actions>

<risks_or_open_questions>
- Before registration, the coordinator must replace both the `0XX` filename and the migration module's placeholder version with the next free migration number.
- No runtime, route, UI, timeline, PR runtime, PR records, or sync wiring belongs to C1.
</risks_or_open_questions>

<important_paths>
- `objectives/project-state-slice-4/spec.md`
- `apps/server/src/core/orchestrator-state/storage/migrations/0XX-pr-campaign.ts`
- `apps/server/src/core/session-runtime/phases/pr/campaign/`
</important_paths>
</current_state>
