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
| 2 | Pi agent SDK adapter | Present for dry-run and live director/worker sessions. |
| 3 | State substrate | Present for runs, targets, queue, leases, locks, reports, events, sessions, and integrations. |
| 4 | Read-only indexer | Present for `report.json` and `objdiff.json` fixture/live loading; richer graph edges are future work. |
| 5 | Director-cycle dry run | Present through `tick` and trigger-agent activation. |
| 6 | Prompt builder and capability templates | Present under `src/agents/{director,worker,pr-review}` plus knowledge manifest routes. |
| 7 | One locked worker | Present through `worker` and trigger-agent subprocess workers. |
| 8 | Score integration dry run | Partially represented by `regression-check`; full patch accept/reject integration is future work. |
| 9 | Event-driven refill loop | Present through `trigger-agent` / `bootstrap`. |
| 10 | Fact-aware loop | Facts are represented in state and reports; reducer/fact promotion is future work. |
| 11 | Human dashboard | Future work. |
| 12 | Run summary artifact | Future work beyond smoke summary and regression report artifacts. |

## V1 Defaults

- The system lives under top-level `decomp-orchestrator/`.
- It is not a Codex plugin and is not hidden under `tools/` as a side utility.
- The primary objective is global `matched_code_percent`.
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
- Crash recovery is restart-from-state: canonical checkout plus SQLite and
  artifacts. Worker Pi sessions are not resumed in v1.
- Worker prompting is standardized through shared system prompts plus
  target-specific initial user context.
- Initial score integration is serial and evidence-producing; auto-apply should
  be an explicit later policy.
- The end-of-run artifact is a PR-description-style summary, not an automatic
  PR.
