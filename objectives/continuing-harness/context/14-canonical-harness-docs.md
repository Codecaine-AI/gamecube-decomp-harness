# Canonical Harness State and Documentation

The user rejected the proposal name becoming the production name and asked to merge the feature specification into existing documentation.

## Result

- `HarnessState` in `apps/server/src/core/harness-state/state.ts` owns durable game state. `DispatchState` in `types.ts` owns lease coordination. The dashboard keeps `HarnessStateView.state` and derives `harness_revision` from that state's revision.
- `40-new-features/40-continuing-harness` was deleted after its content moved to the owning Game, Harness, and Knowledge chapters. The global file tree, configuration shapes, sandbox profiles, and initial Sync flow live in Registration and Setup. Source configuration and stage state live in Knowledge Sources.
- State examples and definitions use State Shape. The active corpus has 55 State Shape blocks and five Code blocks containing executable commands, a source excerpt, a formula, and event ordering. No active prose or component props contain the old continuing terminology.
- The ownership Canvas lives in `10-system-design/20-harness/assets/canvases/game-harness.canvas.json`; the epoch Sequence lives in `10-system-design/20-harness/10-process-overview/assets/sequences/epoch-sync.sequence.json`.

## Database Evidence

Migration v10 was validated on a copy before live application. The live tool created a SQLite backup before renaming the tables. Independent row hashing verified all 638,786 original rows across 58 tables, including events and trace associations. SQLite integrity and foreign-key checks pass. The accepted head remains `c302741689bd67c361cd7faadb221df3193992c3`; execution remains paused with no active lease.

Evidence files are `state-name-live-result.json`, `state-name-live-verification.json`, `state-name-live-second-apply.json`, and `state-name-kernel-preservation.json` in this directory. Historical migration names and this objective path remain evidence identifiers.

## Validation

`bun run check` and the frontend production build pass. The final document check, after a shared docs-rule update, reports zero errors, zero stale references, and one unrelated Foundation opening-paragraph warning. Its authored content was preserved. No rendered-browser QA is claimed. Runtime test completion is recorded in current_state.md.

The server stays stopped. This correction performed no worker execution, external source acquisition, or image push.
