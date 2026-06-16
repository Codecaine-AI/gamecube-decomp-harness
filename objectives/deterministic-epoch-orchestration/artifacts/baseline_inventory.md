---
covers: Baseline director dependency inventory for deterministic epoch orchestration
concepts: [director-removal, trigger-agent, scheduler, epoch, baseline-inventory]
created: 2026-06-16
---

# Baseline Inventory

## Summary

The current hot scheduling path still invokes the LM director:

- `apps/cli/src/cli/commands/trigger-agent.ts` imports `runDirectorTick` from
  `tick.ts`, stores `DirectorTickResult` rows in memory, and runs a director
  tick for any unhandled event returned by `nextUnhandledEvent`.
- `apps/cli/src/cli/commands/tick.ts` imports
  `@decomp-orchestrator/agents/director`, builds a director prompt, runs a Pi
  `director` session, parses `target_packets`, prioritizes those targets, and
  marks the wake event handled only when the director output is accepted.
- `packages/agents/src/director/` contains the runtime prompt/parser/templates
  for target packet scheduling.

The trigger loop already owns most deterministic scheduling primitives:

- graph-ranked refill through `refillQueueFromBoard`;
- priority-only refresh for queued targets;
- lease-aware worker-slot calculation and spawning;
- completed-lease epoch checkpoints through `runEpochCycle`;
- background `kg-maintain` cadence;
- queue-pressure events through `pool_below_target`.

## Runtime References

Live runtime references that must be replaced or deleted:

- `apps/cli/src/cli/commands/trigger-agent.ts`
  - `import { runDirectorTick, type DirectorTickResult } from "./tick.js";`
  - `directorResults` result collection and `directorTicks` result field.
  - unhandled-event branch that launches `runDirectorTick`.
- `apps/cli/src/cli/commands/tick.ts`
  - imports `directorPrompt`, `directorQueuedTargets`, and `runPiAgent`;
  - writes director Pi sessions and `director_cycles`;
  - parses and enqueues director `target_packets`.
- `packages/agents/src/index.ts`
  - exports the director package.
- `packages/agents/package.json`
  - exposes `./director` and `./director/*`.
- `packages/agents/src/registry.ts`, `packages/agents/src/tools/profiles.ts`,
  and `packages/agents/src/context/manifest.json`
  - still register director role/profile/context.
- `packages/core/src/types/agents.ts`
  - still includes `director` in agent role unions.

## Tests And Smoke Assertions

Smoke tests currently assert director behavior that must become deterministic
scheduler behavior:

- `tests/smoke.ts` asserts director target packets can requeue attempted
  targets.
- `tests/smoke.ts` asserts director Pi session and `director_cycles` rows after
  `tick`.
- `tests/smoke.ts` asserts `trigger-agent` wakes the director three times and
  records three director cycles.
- `tests/smoke.ts` asserts director dry-run prompt artifacts and model/thinking
  settings.
- `tests/smoke.ts` has a renderer assertion that already expects worker prompts
  not to include director scheduling context.

## Docs And UI References

Current docs describe the old model as present behavior:

- `docs/10-system-design/10-run-director-loop.md` is entirely director-centric.
- `docs/20-implementation/cli/00-overview.md` says `tick` runs one director
  cycle and `trigger-agent` wakes the director.
- Additional system/implementation docs reference director-owned scheduling,
  including core principles, board prioritization, state/events, process
  guardians, agent model, worker lifecycle, knowledge model, agents docs, UI
  docs, and appendices.

UI/runtime status still surfaces director terminology:

- `apps/dashboard-server/src/server.ts` reads `director_cycles` and has
  timeline text for "director cycle".
- `packages/ui-contract/src/dashboard.ts`,
  `apps/dashboard/src/components/DetailsRail.tsx`, and Agent Viewer prompt
  preview lists still include `director`.

## Immediate Replacement Path

The first safe replacement is to repurpose `tick` into a deterministic
scheduler wake handler:

1. Read one unhandled event.
2. Refresh/refill the queue from the graph-ranked board with the existing
   distinct-source and lock-aware refill helper.
3. Mark the event handled after deterministic scheduling has run.
4. Return an inspectable summary with queue pressure and refill counts.

This removes the LM director from the `trigger-agent` hot path while preserving
worker leasing, queue refill, completed-lease epoch cycles, and existing
operator entry points for a compatibility window.

Full completion still requires durable epoch state, fast-refresh coalescing,
dashboard status, director package deletion, smoke/docs rewrites, and the final
reference audit.
