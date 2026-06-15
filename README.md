# GameCube Decomp Harness

GameCube Decomp Harness is a Bun/TypeScript workspace for coordinating
high-parallelism decompilation runs. It gives a GameCube decomp project a
durable agent control plane: many Pi worker agents can research, edit, validate,
and report in parallel while sharing one run board, one knowledge graph, and one
set of project-specific safety rails.

The current tracked project is Melee, but the harness is organized around
`projects/<id>/project.json` descriptors so the same machinery can be pointed at
other GameCube decompilation workspaces.

![GameCube Decomp Harness dashboard](docs/assets/dashboard-screenshot.png)

## What It Does

- Runs director and worker Pi agents against queued decompilation targets.
- Coordinates many workers through SQLite leases, file locks, events, reports,
  and run artifacts instead of agent-to-agent chat.
- Feeds agents from a shared knowledge graph of docs, workflows, tools, past PRs,
  decomp resources, and project-specific facts.
- Keeps long-running sessions inspectable through a dense dashboard with process
  controls, worker reports, queue state, progress panels, and handoff surfaces.
- Wraps validation and handoff flows such as smoke runs, score regression checks,
  PR slice planning, and knowledge refresh.

The intent is not to replace maintainers or project-specific build systems. The
harness automates the repetitive search, edit, validate, and report loop so a
human can supervise progress and review the work that survives validation.

## Quick Start

Install dependencies and run the local checks:

```sh
bun install
bun run check
bun run smoke
```

`bun run smoke` uses dry-run agents and fixture data, so it does not require a
live provider or edit a real decompilation checkout.

Inspect the CLI:

```sh
bun run orch -- --help
bun run orch -- --project melee status
```

Launch the dashboard when you want the browser control surface:

```sh
bun run ui
```

The dashboard serves at `http://localhost:8787` by default.

## Live Project Setup

The tracked Melee descriptor defaults to `projects/melee/checkout/`. For local
work, either place a `doldecomp/melee` checkout there or create ignored
`projects/melee/local.project.json` with machine-specific paths for the repo,
state directory, graph database, env file, and process defaults.

Live agent sessions need:

- Bun, Python 3, and Git.
- A configured GameCube decompilation checkout with its normal build and objdiff
  tooling.
- Pi provider/auth configuration for the selected provider, model, and thinking
  level.
- Project-local secrets in ignored env files such as
  `projects/melee/local.env`.

Keep literal API keys and generated session state out of tracked files.

## Typical Run Shape

Initialize a run:

```sh
bun run orch -- --project melee init-run \
  --desired-workers 16 \
  --goal-kind matched_code_percent \
  --goal-value 72
```

Run the supervised worker loop:

```sh
bun run orch -- --project melee --agent-timeout-seconds 14400 babysit \
  --max-workers 16 \
  --idle-sleep-ms 5000 \
  --worker-thinking-level low
```

Before review or handoff, run the regression gate:

```sh
bun run orch -- --project melee regression-check
```

For high-throughput runs, tune worker count, queue size, candidate windows, graph
ranking, and lease recovery flags from the CLI or dashboard. The detailed
operational notes live in the docs.

## Repository Map

| Area | Purpose |
| --- | --- |
| `apps/cli/` | CLI entry point and commands for runs, workers, recovery, regression checks, PR handoff, and knowledge graph maintenance. |
| `apps/dashboard/` | React/Vite dashboard frontend. |
| `apps/dashboard-server/` | Bun dashboard API, static serving, process controls, and PR handoff actions. |
| `apps/agent-viewer/` | Prompt preview and inspection UI for agent templates. |
| `packages/core/` | Project resolution, SQLite state, board loading, shell helpers, regression logic, handoff helpers, and shared runtime types. |
| `packages/agents/` | Director, worker, PR-review, knowledge-curator, prompt templates, and Pi runtime integration. |
| `packages/knowledge/` | Knowledge graph/resource APIs over repo-level `knowledge/` data. |
| `packages/ui-contract/` | Browser-safe dashboard payload types and formatting helpers. |
| `projects/` | Tracked project descriptors plus ignored project-local checkout, state, graph, env, and session paths. |
| `knowledge/` | Repo-level references, resources, indexes, graph state, and past-PR corpus. |
| `docs/` | Foundation, system design, implementation details, runbooks, and preserved design artifacts. |

## Docs

- [Docs map](docs/README.md)
- [Evidence refresh cadence](EVIDENCE_REFRESH_CADENCE.md)
- [Foundation overview](docs/00-foundation/00-overview.md)
- [System design overview](docs/10-system-design/00-overview.md)
- [Run director loop](docs/10-system-design/10-run-director-loop.md)
- [Agent model](docs/10-system-design/20-agent-model.md)
- [Process guardians](docs/10-system-design/25-process-guardians.md)
- [Worker lifecycle](docs/10-system-design/40-worker-lifecycle.md)
- [CLI implementation](docs/20-implementation/cli/00-overview.md)
- [UI implementation](docs/20-implementation/ui/00-overview.md)
