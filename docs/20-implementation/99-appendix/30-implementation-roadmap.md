---
covers: Original implementation plan, current status, and v1 defaults
concepts: [implementation-plan, roadmap, defaults, v1, status]
code-ref: decomp-orchestrator/
---

# Implementation Roadmap And Defaults

This document preserves the implementation plan and v1 defaults from the design
artifact while naming the current package status.

## Roadmap

| Phase | Deliverable | Current Status |
| --- | --- | --- |
| 0 | Design doc and repo survey | Preserved in `docs/design.html` and markdown docs. |
| 1 | Top-level orchestrator scaffold | Present under `decomp-orchestrator/`. |
| 2 | Pi agent SDK adapter | Present for dry-run and live worker/review/curation sessions. |
| 3 | State substrate | Present for runs, targets, queue, leases, locks, reports, events, sessions, and integrations. |
| 4 | Read-only indexer | Present for `report.json` and `objdiff.json` fixture/live loading; richer graph edges are future work. |
| 5 | Scheduler tick dry run | Present through deterministic `tick` and run-loop activation. |
| 6 | Prompt builder and capability templates | Present under `packages/agents/src/{worker,pr-review,knowledge-curator,qa-repair}` plus agent context manifest routes. |
| 7 | One locked worker | Present through `worker` and run-loop subprocess workers. |
| 8 | Score integration dry run | Represented by `regression-check`, PR promotion reports, and dashboard QA controls; full patch accept/reject integration is future work. |
| 9 | Event-driven refill loop | Present through `run-loop`; `trigger-agent` / `bootstrap` remain aliases. |
| 9.5 | Process guardian wrapper | Present through `babysit`, guardian incident artifacts, worker-id lease recovery, and child restart policy. |
| 10 | Fact-aware loop | Facts are represented in state and reports; reducer/fact promotion is future work. |
| 11 | Human dashboard | Present as the Bun/React UI for progress, work tables, process controls, collapsible rails, checkpointing, and PR handoff controls. |
| 12 | Run summary artifact | Partially present through checkpoint artifacts, carry-forward ledgers, regression reports, PR split plans, and smoke summary artifacts. |

## V1 Defaults

- The orchestrator lives as the platform repo, with configured projects under
  `projects/<id>/`.
- It is not a Codex plugin and is not hidden under `tools/` as a side utility.
- The primary objective is global `matched_code_percent`; each run's
  `goal_value` is a checkpoint/pause threshold inside the long-term movement
  toward `100%`.
- Runs are the progress boundary; files, symbols, workers, and leases are work
  units, not PR units.
- Central SQLite leases and file locks are mandatory.
- Worktrees or isolated workspaces are optional tools, added only where they
  reduce real coordination risk.
- Header and data-owner locks start precise and widen only when evidence shows
  dependent targets can be invalidated.
- Active workers keep going after score integration; new facts/signals affect
  future target packets.
- Build/report generation is serialized in v1 through one global validation
  path.
- PR handoff is operator-controlled through dashboard actions that pause intake,
  checkpoint the run, run PR QA, and build a split plan. The dashboard prepares
  artifacts but does not publish GitHub PRs.
- Crash recovery is restart-from-state: selected project checkout plus
  project-scoped SQLite, artifacts, and guardian incident packets. Worker Pi
  sessions are not resumed in v1.
- Worker prompting is standardized through shared system prompts plus
  target-specific initial user context.
- Initial score integration is serial and evidence-producing; auto-apply should
  be an explicit later policy.
- The end-of-run artifact is a PR-description-style summary, not an automatic
  PR.
