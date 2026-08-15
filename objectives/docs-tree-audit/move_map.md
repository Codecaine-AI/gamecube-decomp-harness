# Move Map — docs/ restructure (locked 2026-08-14)

Mechanical phase M1. Every move is a plain filesystem `mv` (NEVER `git mv`,
NEVER `git add` — the working tree holds unrelated dirty files that must not be
staged). After all moves, rewrite every relative link inside every affected
`doc.json` so `bun run docs:links` reports 0 stale and `bun run docs:audit`
reports 0 errors. Link rewriting here is a mechanical path retarget only — no
content changes. Prose references to old numbering (e.g. "03-state-and-events")
are fixed later by content writers, not M1.

TEMP entries are merge sources parked next to their merge targets; content
writers merge them, M2 deletes them.

## 10-system-design spine

| From | To |
|------|----|
| 10-system-design/01-core-idea | 10-system-design/10-core-idea |
| (writer creates) | 10-system-design/20-architecture |
| 10-system-design/10-intake-and-sessions | 10-system-design/30-games |
| 30-projects/10-session-operating-flow (post-rename) | 10-system-design/50-workflows/10-sync |
| 30-projects/20-project-session-architecture | 10-system-design/30-games/20-sessions |
| 30-projects/30-save-points | (stays) 10-system-design/30-games/30-save-points |
| 10-system-design/03-state-and-events | 10-system-design/40-harness-state |
| 40-project-state/05-project-state-and-authority/10-project-state-composition | 40-project-state/10-state-composition |
| 40-project-state/05-project-state-and-authority/20-dispatch-authority-and-handoffs | 40-project-state/20-dispatch-authority |
| 40-project-state/05-project-state-and-authority/30-operator-action-contract | 40-project-state/30-operator-actions |
| 40-project-state/05-project-state-and-authority/40-project-state-view | 40-project-state/35-project-state-view (TEMP → merge into 30) |
| 40-project-state/05-project-state-and-authority (emptied; keeps its doc.json) | 40-project-state/05-authority-overview (TEMP → fold into 40-project-state index) |
| 40-project-state/10-durable-state-records | 40-project-state/40-durable-records |
| 40-project-state/20-run-state-and-recovery | 10-system-design/50-workflows/20-run/15-run-state-and-recovery (TEMP → merge into 10-run-state) |
| 40-project-state/30-event-handshake | 40-project-state/60-event-handshake |
| 40-project-state/40-project-events (subtree intact) | 40-project-state/50-project-events |
| 10-system-design/20-running | 10-system-design/50-workflows/20-run |
| 50-workflows/20-run/05-run-state | 50-workflows/20-run/10-run-state |
| 50-workflows/20-run/10-run-director-loop | 50-workflows/20-run/20-director-loop |
| 50-workflows/20-run/20-board-prioritization | 50-workflows/20-run/30-board-prioritization |
| 50-workflows/20-run/30-process-guardians | 50-workflows/20-run/50-process-guardians |
| 10-system-design/30-workers | 10-system-design/50-workflows/20-run/40-workers |
| 40-workers/10-worker-lifecycle | 40-workers/10-lifecycle |
| 40-workers/20-worker-capabilities | 40-workers/20-capabilities |
| 40-workers/30-write-safety | (stays) 40-workers/30-write-safety |
| 10-system-design/50-ship-and-pr | 10-system-design/50-workflows/30-pr |
| 50-workflows/30-pr/10-score-and-pr-handoff | 50-workflows/30-pr/10-score-gate-and-handoff |
| 50-workflows/30-pr/20-operator-flow-and-pr-tracking | 50-workflows/30-pr/20-campaign-and-tracking |
| 10-system-design/40-knowledge | 10-system-design/60-knowledge |
| 60-knowledge/05-principles | 60-knowledge/10-principles |
| 60-knowledge/10-connection-map | 60-knowledge/20-connection-map |
| 60-knowledge/20-per-target (children intact) | 60-knowledge/30-per-target |
| 60-knowledge/30-knowledge-stores | 60-knowledge/40-knowledge-stores |
| 40-knowledge-stores/15-knowledge-intake | 40-knowledge-stores/20-knowledge-intake |
| 40-knowledge-stores/20-smashwiki-corpus | 40-knowledge-stores/30-smashwiki-corpus |
| 40-knowledge-stores/30-standards | 40-knowledge-stores/40-standards |
| 60-knowledge/40-inputs (children intact) | 60-knowledge/50-inputs |
| 60-knowledge/50-worker-surfaces | 60-knowledge/60-worker-surfaces |
| 60-knowledge/70-execution-classes-and-jobs (children intact) | 60-knowledge/70-background-jobs |
| 60-knowledge/60-implementation-record (children intact) | 60-knowledge/90-record/10-implementation-record |
| 60-knowledge/85-decision-log | 60-knowledge/90-record/20-decision-log |
| 60-knowledge/80-open-questions | 60-knowledge/90-record/30-open-questions |
| (writer creates index) | 60-knowledge/90-record/doc.json |

Note: the 50-workflows folder and 20-run nesting are created by the moves;
50-workflows/doc.json and 50-workflows/20-run/doc.json and
50-workflows/30-pr/doc.json do not exist after M1 — content writers create
them. Until they exist, audit may report missing-index findings for those
folders; that is expected mid-migration and must be resolved by the end of
wave B (audit target at verification: 0 errors).

## 20-implementation

| From | To |
|------|----|
| 20-implementation/10-agents/25-knowledge-curator | 10-agents/30-knowledge-curator |
| 20-implementation/10-agents/30-runtime | 10-agents/40-runtime |

FROZEN: docs/20-implementation/30-knowledge/** children keep their numbering.
The file docs/20-implementation/30-knowledge/doc.json is pre-dirty and must
never be staged or committed; retarget its links if stale (edits ride along
uncommitted). Same never-stage rule for docs/40-new-features/10-daytona-*/**
doc.json files.

## Unchanged

00-foundation, 30-runbooks, 40-new-features (paths), 20-implementation
{20-server-jobs, 40-state, 50-tools, 60-ui, 99-appendix}, docs/assets.

## Link retarget notes

- Relative-link depth changes wherever nesting depth changed (e.g. anything
  moved under 50-workflows/20-run/ gained a level; 90-record children gained a
  level). Recompute relative prefixes, do not string-replace blindly.
- Check canvas references (HTML comments `<!-- canvas: ... -->`) under
  60-knowledge — links check may not cover them; grep and fix depth manually.
- Verify with: `bun run docs:links` (0 stale) and `bun run docs:audit`
  (0 errors; W4 warnings are pre-existing and handled by content waves).
