# Decomp Orchestrator

Production-shaped vertical slice for the Melee decomp orchestration runner.

This package lives at repo-root `decomp-orchestrator/`. That is the canonical
source and command surface. Generated state defaults to
`.decomp-orchestrator-state/` so runtime files do not mix with source files.

The runner stays intentionally thin:

- SQLite stores runs, targets, queue rows, leases, file locks, events, Pi
  sessions, director cycles, and worker reports.
- The runner owns state transitions, locks, artifacts, and Pi invocation.
- Director and worker Pi agents own reasoning.
- Workers communicate through durable reports, facts, and wake events, not by
  talking to each other.
- The required smoke path uses dry-run Pi agents and fixture board data.

## Current Self-Sufficiency

The package now owns the runtime knowledge that the director and workers need:

- `knowledge/manifest.json` routes role defaults and worker capabilities to
  concrete knowledge references and optional workflows.
- `knowledge/decomp_resources/` stores the local decomp resource library,
  indexes, data-sheet CSVs, and mirrored hint surfaces.
- `knowledge/past_prs/` stores the stable PR dump, searchable postmortem
  library, shared PR-agent prompts, and refresh utilities.
- `package.json` exposes the PR refresh/postmortem/sync utilities as package
  scripts.

The package now has a trigger-agent supervisor command. `init-run` records
`desired_workers`, queues initial targets, and writes run state; `trigger-agent`
or its `bootstrap` alias wakes the director on durable events, fills worker
slots up to the configured worker count, and rests when no event, queued work,
or active worker remains. PR knowledge refreshes and global build/report
refreshes remain explicit operator steps.

## Documentation

Package-local docs live under `docs/`. These are D-Comp Orchestrator docs, not
top-level Melee repository docs.

- `docs/design.html` preserves the original standalone visual design artifact.
- `docs/00-foundation/` captures purpose, principles, and boundaries.
- `docs/10-system-design/` captures director, worker, state, knowledge, and
  score-gate behavior.
- `docs/20-implementation/` captures current source layout, agent slices, CLI,
  state, and knowledge implementation details.

## Setup

From this directory:

```sh
bun install
bun run check
bun run smoke
```

`bun run smoke` is the fixture-backed vertical-slice gate. It creates a clean
temporary state directory, runs the CLI end to end in dry-run mode, and asserts
the SQLite rows plus artifact files that prove the slice.

## Dependencies

Required for package install, typecheck, and smoke:

- Bun.
- Python 3.
- Git.

Required for live Pi sessions:

- `@earendil-works/pi-coding-agent`, installed by `bun install`.
- Whatever provider/auth setup Pi needs for the selected `--provider`,
  `--model`, and `--thinking-level`.

Required for a live Melee checkout run:

- A configured doldecomp/melee checkout with the normal decomp toolchain.
- Generated `objdiff.json` and `build/GALE01/report.json`.
- The repo's build and verification tools, including `python configure.py`,
  `ninja`, and `build/tools/objdiff-cli`.

Required for PR knowledge refresh:

- GitHub CLI `gh`, authenticated with access to `doldecomp/melee`.
- Network access to GitHub.

Optional tools referenced by knowledge references and prompts:

- `pdftotext` for rebuilding the PowerPC PDF page index.
- `openpyxl` for re-exporting the SSBM data-sheet workbook to CSV.
- `tools/table-typer` for typed table inference when that repo-local tool is
  present and built.
- `decomp-permuter/`, `permuter_settings.toml`, and
  `tools/permuter/import_func.sh` for permuter handoff workflows.

There is no `decomp-promoter` dependency or installer declared inside this
package today. If a local promoter-style helper is part of an operator workflow,
it is external to the orchestrator package until it is added as a package script,
submodule dependency, or documented optional tool.

## Canonical Command Path

Use the package scripts from repo-root `decomp-orchestrator/`:

```sh
bun run orch -- --help
bun run smoke
```

## Run Model

The CLI exposes single-step commands plus a trigger-agent supervisor:

- `init-run` creates the SQLite state, stores the goal and `desired_workers`,
  loads `objdiff.json` plus `build/GALE01/report.json`, queues the initial
  candidate targets, and writes the initial board snapshot.
- `tick` handles one unhandled wake event by launching one director Pi session.
  The director can return target packets, which the runner uses to update queue
  priorities.
- `worker` leases one queued target, launches one worker Pi session, records the
  durable report/facts/blocker artifacts, releases the lease, and emits the
  resulting wake event. The worker prompt requires a local regression ledger:
  before editing, the worker records the target and affected-neighbor baseline;
  after each attempt, it reruns narrow object/objdiff checks and must undo its
  own regressing hunks before reporting progress.
- `trigger-agent` is the resting supervisor loop. It checks durable state for an
  unhandled event, wakes one director Pi session when needed, starts worker
  sessions until active leases reach `desired_workers` or `--max-workers`, and
  then sleeps for `--idle-sleep-ms` before checking state again. `bootstrap` is
  an alias for this command.
- `recover-leases` writes synthetic stalled reports for interrupted or expired
  active leases after operator confirmation.
- `regression-check` runs the repo's global match-regression gate, persists the
  Ninja stdout/stderr/summary under the state dir, and exits non-zero when the
  branch has any regression against the saved baseline.
- `status` prints the current run, queue, lease, event, and report summary.

`desired_workers` is stored on the run and used by the trigger-agent loop as the
default worker-pool target. Pass `--max-workers` to cap that target for a local
run or smoke-style dry run.

Manual fixture run:

```sh
STATE_DIR="$(mktemp -d)"
FIXTURE_ROOT="$PWD/testdata/smoke_repo"

bun run orch -- --repo-root "$FIXTURE_ROOT" --state-dir "$STATE_DIR" --dry-run-agents init-run \
  --desired-workers 1 \
  --candidate-limit 8 \
  --goal-kind matched_code_percent \
  --goal-value 72

bun run orch -- --repo-root "$FIXTURE_ROOT" --state-dir "$STATE_DIR" --dry-run-agents tick \
  --candidate-limit 8

bun run orch -- --repo-root "$FIXTURE_ROOT" --state-dir "$STATE_DIR" --dry-run-agents worker \
  --worker-id smoke-worker-1 \
  --report-type stalled_no_useful_guess

bun run orch -- --repo-root "$FIXTURE_ROOT" --state-dir "$STATE_DIR" --dry-run-agents status
```

Bounded trigger-agent fixture run:

```sh
STATE_DIR="$(mktemp -d)"
FIXTURE_ROOT="$PWD/testdata/smoke_repo"

bun run orch -- --repo-root "$FIXTURE_ROOT" --state-dir "$STATE_DIR" --dry-run-agents init-run \
  --desired-workers 1 \
  --candidate-limit 8 \
  --goal-kind matched_code_percent \
  --goal-value 72

bun run orch -- --repo-root "$FIXTURE_ROOT" --state-dir "$STATE_DIR" --dry-run-agents trigger-agent \
  --max-workers 1 \
  --max-iterations 5 \
  --max-idle-iterations 1 \
  --idle-sleep-ms 1 \
  --candidate-limit 8
```

For real repo data, set `--repo-root` to the Melee checkout root and pass an
explicit `--state-dir` while experimenting. If omitted, `--state-dir` defaults
to `<repo-root>/.decomp-orchestrator-state/`, which is ignored by Git.

## Regression Gate

Regression protection is intentionally two-layered. Workers catch local
regressions while they work by comparing the leased target and affected
neighbors with narrow build/objdiff checks. They must not return `progress` or
`score_candidate` while a retained worker edit has an unresolved local
regression.

Workers must not refresh global progress reports while leases may still be
active. After workers are idle and before PR handoff, the operator/orchestrator
runs the global saved-baseline check from the Melee checkout:

```sh
git switch master
git pull --ff-only origin master
python configure.py --require-protos
ninja baseline

git switch <branch>
python configure.py --require-protos
bun run --cwd decomp-orchestrator regression-check -- --repo-root "$PWD"
```

The branch-side command wraps `ninja changes_all`, writes artifacts under
`.decomp-orchestrator-state/regression_checks/`, and fails if `changes_fmt.py`
finds any metric that moved backward. Running `ninja changes_all` directly is
equivalent for the gate, but it will not preserve the orchestrator artifact
summary.

`regression-check` also generates a PR-style Markdown report at
`<artifact-dir>/pr_report.md`. Use that report as the PR description under an
`Expected / local run` heading, because it documents what the saved-baseline
local run expects CI to confirm. A typical PR body is:

```md
## Expected / local run

Generated by:
`bun run --cwd decomp-orchestrator regression-check -- --repo-root "$PWD"`

<paste <artifact-dir>/pr_report.md here>
```

Do not open or hand off the PR if the report contains any broken matches or
regressions. If CI later reports different numbers, treat CI as the source of
truth and rerun the baseline/check flow against the same base revision.

For a custom report title or a longer table, pass:

```sh
bun run --cwd decomp-orchestrator regression-check -- --repo-root "$PWD" \
  --report-title "Report for GALE01 (<base> - <head>)" \
  --report-max-rows 0
```

If switching branches would disturb local dirty work, make the upstream
baseline in a separate clean checkout/worktree and copy its
`build/GALE01/baseline.json` into this checkout before running
`regression-check`.

## Smoke Fixture

Fixture root:

```text
decomp-orchestrator/testdata/smoke_repo/
+-- objdiff.json
+-- build/GALE01/report.json
+-- src/melee/ft/chara/ftDemo.c
```

The fixture contains one fuzzy function and one already-matched function. The
smoke test proves the board loader queues only the fuzzy function.

## Agent Layout

Agent definitions are centralized under `src/agents/`. Each agent owns its
prompt builder, output parsing, schema or packet helpers, and templates:

```text
src/agents/
+-- registry.ts
+-- runtime/
+-- director/
|   +-- prompt.ts
|   +-- output.ts
|   +-- templates/
+-- worker/
|   +-- packet.ts
|   +-- output.ts
|   +-- prompt.ts
|   +-- templates/
+-- pr-review/
    +-- prompt.ts
    +-- schema.json
    +-- templates/
```

The system prompt defines role, authority, safety rules, and output contract.
The initial user prompt carries current run state, files to read first,
available resources/commands, and the concrete director wake event or worker
target packet. Dry-run and live sessions both write rendered prompt artifacts
beside the Pi output. Shared Pi invocation, prompt rendering, and JSON-output
salvage live in `src/agents/runtime/`.

## Agent Knowledge

Runtime Pi agent knowledge lives under `knowledge/`, not under Codex skills:

```text
knowledge/
+-- manifest.json
+-- references/
+-- workflows/
+-- tools/
+-- decomp_resources/
+-- past_prs/
```

`manifest.json` maps role defaults and worker capabilities to concrete
references and optional workflows. `src/knowledge/` builds the selected
knowledge references and resource map for agent prompt builders. The director
gets scheduling policy by default; the worker gets targeted iteration, Melee
matching tactics, resource research, and review standards. Experimental search
and permuter handoff are opt-in capabilities, not the default worker posture.

The decomp resource library and past-PR corpus are also package-owned:

- `knowledge/decomp_resources/` contains the data-sheet CSVs, PowerPC indexes,
  external hint indexes, manifests, and resource notes.
- `knowledge/tools/` contains helper scripts such as target ranking, context
  lookup, and optional experimental-search utilities.
- `knowledge/past_prs/` contains the stable `current/` PR dump, searchable
  `prs/` postmortem library, legacy PR-agent prompt mirrors under `agent/`, and
  refresh utilities under `utils/`. The canonical PR-review agent lives under
  `src/agents/pr-review/`.

## PR Knowledge Refresh

The PR refresh flow lives inside this package, so it can travel with the
orchestrator instead of depending on repo-root docs:

```sh
bun run pr:refresh:dry
bun run pr:refresh
bun run pr:refresh -- --postmortem-mode pi --postmortem-scope fetched --postmortem-jobs 16
bun run pr:postmortems -- --dump-root knowledge/past_prs/current --run-agent --rerun-existing --jobs 16
```

For the combined branch sync plus PR-library refresh:

```sh
bun run pr:sync -- --postmortem-jobs 16
```

These scripts default to `knowledge/past_prs`, with the refresh window recorded
in `knowledge/past_prs/current/fetch_metadata.json`.

PR refresh is built into the package command surface, but it is not
automatically run by `init-run`, `tick`, or `worker`. Run it before starting a
live orchestration run, or schedule it as a separate operator maintenance step.

## State And Artifacts

State directory layout:

```text
<state-dir>/
+-- orchestrator.sqlite
+-- runs/
    +-- <run_id>/
        +-- snapshots/initial_board.json
        +-- director_cycles/director_<session>.system.md
        +-- director_cycles/director_<session>.user.md
        +-- director_cycles/director_<session>.txt
        +-- worker_logs/<lease_id>/worker_<session>.system.md
        +-- worker_logs/<lease_id>/worker_<session>.user.md
        +-- worker_logs/<lease_id>/worker_<session>.txt
        +-- worker_logs/<lease_id>/report/worker_report.json
        +-- worker_logs/<lease_id>/report/facts.json
        +-- worker_logs/<lease_id>/report/blocker.json
        +-- smoke_summary.json
```

The smoke command asserts row counts in `runs`, `targets`, `queue`, `events`,
`pi_sessions`, `director_cycles`, `leases`, `file_locks`, and
`worker_reports`. It also asserts the initial board snapshot, director output,
director system/user prompts, worker output, worker system/user prompts, worker
report, trigger-agent wake/refill behavior, and smoke summary artifacts.

`recover-leases` is the operator recovery path for interrupted workers. By
default it recovers only expired active leases. Pass `--force` only after a
process scan confirms the run's worker process is gone. Recovery writes a
synthetic `stalled_no_useful_guess` report, releases the lease, preserves the
worker report artifact, removes the transient file-lock row, and emits a
`worker_stalled` wake event for the director.

```sh
bun run orch -- --repo-root "$REPO_ROOT" --state-dir "$STATE_DIR" recover-leases \
  --run-id "$RUN_ID" \
  --force \
  --reason "operator-confirmed interrupted worker process"
```

## Dry-Run And Live Pi Mode

`--dry-run-agents` writes the Pi prompt and metadata to an artifact instead of
calling the Pi SDK. This is the required mode for `bun run smoke`.

Without `--dry-run-agents`, `tick`, `worker`, and the Pi activations launched by
`trigger-agent` attempt to use `@earendil-works/pi-coding-agent`. The adapter
passes the rendered system prompt through Pi's `DefaultResourceLoader`
system-prompt override, then sends the rendered initial user prompt as the
session prompt. Both director and worker sessions default to `--provider
codex-lb --model gpt-5.5 --thinking-level xhigh`; those flags remain
overrideable per CLI invocation. Live Pi execution is not part of the required
smoke gate yet. The current worker command still writes an explicit runner-side
report row after the Pi session; parsing a live worker's report is future work.

## Current Limitations

- No Melee source files are edited by the smoke path.
- No real build, objdiff, score gate, or patch integration runs in this slice.
- The trigger-agent loop does not refresh PR knowledge, recover stale leases, or
  serialize global build/report refreshes; run those as explicit maintenance or
  gate commands.
- The smoke gate exercises the trigger-agent loop with one worker; broad live
  multi-worker scheduling still depends on real Pi/toolchain runs.
- File-lock rows are transient lease guards; worker reports and recovery remove
  them when a lease is released.
- `matched_code_percent` is the long-term progress metric. `fuzzy_match_percent`
  remains target-selection telemetry only.

## Trigger Agent

The trigger agent is a resting supervisor, not a long-lived Pi director. It keeps
no hidden agent memory. It waits on durable state, activates director or worker
Pi sessions only when state calls for them, and then returns to rest.

Typical live shape:

```sh
bun run orch -- --repo-root "$REPO_ROOT" --state-dir "$STATE_DIR" init-run \
  --desired-workers 16 \
  --goal-kind matched_code_percent \
  --goal-value 72

bun run orch -- --repo-root "$REPO_ROOT" --state-dir "$STATE_DIR" bootstrap \
  --max-workers 16 \
  --idle-sleep-ms 5000
```

Use `--max-iterations`, `--max-idle-iterations`, and `--idle-sleep-ms` for
bounded dry runs. Run PR refresh before starting a live run when fresh PR
evidence matters.
