# Melee Semantic Sweep

Status at 2026-09-08 16:28 UTC: 140 unit receipts have independently reviewed fact updates promoted to the live KB, totaling 3,519 changes. Full semantic and relationship reconciliation remains unfinished. Completion receipts under `units/*/staged-completion.json` record fact promotion, distinct from the relationship gate.

The campaign uses Astra medium throughout. The active one-time kernel scheduler supports 64 librarians, 16 independent leads and 24 independent reviewers, alongside existing native assignments and family repairs. Kernel agents read canonical and rendered source and propose changes; the scheduler serializes reviewed stage and live promotion. Source remains unchanged.

Provider interruptions at 16:22 UTC caused failed attempts. A real Astra recovery probe passed at 16:25 UTC. Dispatch now staggers starts, retries transient errors with preserved attempt artifacts and pauses briefly when provider availability fails. Check `kernel-pool/state.json`, `config.json` and `scheduler.json` for live execution state. The completion ETA awaits stable post-recovery throughput.

## Initial Assignments

| TU | Work |
|---|---|
| `main/melee/cm/camera` | Camera modes, transitions, bounds, quakes, and recent names |
| `main/melee/ft/ftbosslib` | Boss state queries, movement helpers, names, and object data |
| `main/melee/lb/lbcollision` | Collision geometry and helper contracts |
| `main/sysdolphin/baselib/cobj` | Camera objects, projection, transforms, and lifecycle |

The frozen inventory covers 1,130 TUs and 341 shared-file tasks, with 2,502 files. All remaining work stays in the manifest; the initial 16-TU queue is the first batch, not the campaign's full scope.

## Records

- [Frozen manifest](../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/manifest.json)
- [Coordinator assignments](../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/coordinator-queue.json)
- [Last generated status](../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/status.json)
- [Coordinator contract](coordinator-contract.md)

Canonical and rendered pages, naming-fact versions, reading receipts, and proposal validation artifacts live in the campaign directory. A returned page is not proof that its meaning has been reviewed. Final TU documents will identify all reviewed subjects and retained, changed, or unresolved claims.

The campaign is orchestrated by the active Codex agents. These files are checkpoints, not a detached scheduler daemon. Resume from the queue and accepted artifacts after interruption; never infer running agents from a saved status string.

## Refresh Status

From the harness root:

```sh
python3 games/melee/state/knowledge_v2/semantic-sweep-20260908/scripts/status.py
```

Stop by asking the orchestrator to stop the campaign. That stops assignments and descendants while preserving artifacts. The paused matching run `melee-live` is separate and remains stopped.

## First Launch Check

At 2026-09-08 14:18 UTC, the coordinator reported all sixteen librarian handles launched under the four TU leads. The original sixteen TUs have passed independent review and live promotion. Leads reuse the librarian handles for remaining manifest work. Seven reviewer children and their coordinator provide independent review. Active worker counts vary during reassignment.

## Relationship Completion Gate

Fact promotion is distinct from complete semantic reconciliation. The frozen baseline contains 36,827 links: 36,596 have an owned source subject, and 231 require family ownership. Current and earlier promoted TUs receive explicit outgoing-link dispositions and independent review. The inventory is in `baseline-links/inventory.json` in the campaign directory. Existing unsupported edges remain named blockers until separately reconciled.
