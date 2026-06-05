---
covers: D-Comp Orchestrator CLI command modules and operator command surface
concepts: [cli, commands, init-run, tick, worker, trigger-agent, recovery, regression-check]
code-ref: decomp-orchestrator/src/cli, decomp-orchestrator/src/bin/decomp-orchestrator.ts
---

# CLI: Overview

The CLI is split into command modules under `src/cli/commands/`. The binary
entry point stays thin: it parses arguments, applies defaults, and dispatches
to the selected command.

## File Tree

```text
src/
+-- bin/
|   +-- decomp-orchestrator.ts
+-- cli/
    +-- args.ts
    +-- defaults.ts
    +-- main.ts
    +-- usage.ts
    +-- commands/
        +-- index.ts
        +-- init-run.ts
        +-- recover-leases.ts
        +-- regression-check.ts
        +-- shared.ts
        +-- status.ts
        +-- tick.ts
        +-- trigger-agent.ts
        +-- worker.ts
```

## Commands

| Command | Purpose |
| --- | --- |
| `init-run` | Creates run state, loads board data, queues initial candidate targets, and writes the initial board snapshot. |
| `tick` | Handles one unhandled wake event by running one director cycle. |
| `worker` | Leases one queued target, runs one worker session, writes report artifacts, releases the lease, and emits a wake event. |
| `trigger-agent` | Resting supervisor loop that wakes the director on events, starts workers up to `desired_workers` or `--max-workers`, and sleeps when the board is quiet. |
| `bootstrap` | Alias for `trigger-agent`. |
| `recover-leases` | Converts interrupted or expired active leases into durable stalled reports after operator confirmation. |
| `regression-check` | Wraps the repo's global saved-baseline regression gate and writes run artifacts. |
| `status` | Prints run, queue, lease, event, and report summary data. |

## Boundaries

The CLI keeps the single-step commands for debuggability and exposes
`trigger-agent` for autonomous runs. The trigger-agent is deliberately not a Pi
agent. It is a thin loop over durable SQLite state: wake the director for
unhandled events, start worker sessions for open slots, then rest until state
changes.

## Related

- [State implementation](../state/00-overview.md)
- [Agent runtime](../agents/30-runtime.md)
