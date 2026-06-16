---
covers: Plan for configurable epoch sizing, tiered knowledge-graph maintenance, epoch-boundary report refresh, and UI/CLI orchestration controls
concepts: [epoch-orchestration, epoch-size, kg-maintenance, graph-refresh, report-boundary, scheduler, ui-controls]
status: draft
depends-on: [EVIDENCE_REFRESH_CADENCE.md, docs/10-system-design/10-run-director-loop.md, docs/10-system-design/50-knowledge-model.md, docs/20-implementation/cli/00-overview.md, docs/20-implementation/knowledge/00-overview.md]
---

# Epoch Orchestration Update

This plan describes the move from a mostly implicit epoch/checkpoint cadence to
an operator-configurable epoch system with two maintenance lanes:

- fast maintenance that keeps run learnings useful while workers are still
  active;
- full maintenance that refreshes compiled truth and heavyweight evidence at an
  epoch boundary.

The core distinction is:

> Fast maintenance updates what we learned. Full epoch maintenance updates what
> is true.

## Goals

- Let the operator choose an epoch size instead of relying only on worker-count
  derived checkpoint intervals.
- Support a `Full` epoch mode that admits every currently schedulable unmatched
  target when the operator wants to burn down the remaining board.
- Keep graph-ranked scheduling responsive to worker reports during an epoch
  without paying the full Ghidra/opseq/mismatch/tool-runner cost after every
  completion.
- Make epoch boundaries the clean place for report rebuilds, regression repair
  planning, heavyweight tool refreshes, and save-point accounting.
- Expose the mode clearly in the dashboard without adding controls that fight
  the stable managed process name or existing drain/stop controls.

## Current Shape

The current system already has several pieces of this model:

- Workers persist reports, facts, blockers, and wake events as durable state.
- `run-loop` can run `kg-maintain` in the background on
  `--knowledge-maintenance-interval-ms`.
- `kg-maintain` can skip heavyweight tool runners with `--no-tool-runners`.
- The epoch cycle commits validated work, rebuilds the report in the epoch
  worktree, publishes fresh report artifacts, records an `epoch` save point,
  and requeues regression repairs.
- Queue refill and priority refresh use graph-ranked board snapshots.

The gap is that the operator model is still blurry:

- epoch size, ready queue size, queue target compatibility, and candidate
  window are related but not always presented as one coherent mode;
- background KG maintenance is all-or-mostly-full maintenance rather than a
  named fast lane;
- the UI does not expose epoch sizing or maintenance tiering as first-class
  controls;
- docs historically mixed older drain-to-zero batch language with newer
  scheduler checkpoint behavior.

## Target Model

An epoch is a bounded scheduling wave selected from the freshest authoritative
report and graph state available at epoch start.

The operator chooses an epoch size:

| Setting | Meaning |
| --- | --- |
| `32`, `64`, `128`, `256`, `512` | Admit up to this many fresh targets into the epoch. |
| `Full` | Admit all currently schedulable unmatched targets from the ranked board. |

The epoch runs workers against that admitted target set. During the epoch, fast
maintenance may update graph/rank evidence from completed worker reports, but
the authoritative report is not rebuilt until the epoch boundary.

At the boundary, the system drains or stops intake, rebuilds the report, runs
full maintenance, removes matched targets from future scheduling, routes
regressions to repair priority, and seeds the next epoch from the refreshed
board.

## Flow Sketch

```text
                    one configured epoch

    +---------------------+
    | fresh report + graph|
    | choose epoch size   |
    +----------+----------+
               |
               v
    +---------------------+
    | admit epoch targets |
    | N preset or Full    |
    +----------+----------+
               |
               v
    +---------------------+        completed reports
    | workers lease/run   |---------------------------+
    | admitted targets    |                           |
    +----------+----------+                           v
               ^                           +----------------------+
               |                           | fast refresh         |
               |                           | learnings -> graph   |
               |                           | priorities refreshed |
               |                           | no report rebuild    |
               |                           +----------+-----------+
               |                                      |
               |        reorder admitted queue        |
               +--------------------------------------+
               |
               |        optional adjacency injection
               |        only when policy allows it
               v
    +---------------------+
    | epoch done / drain  |
    | intake pauses       |
    +----------+----------+
               |
               v
    +---------------------+
    | full boundary work  |
    | rebuild report      |
    | tool evidence       |
    | rebuild graph       |
    | save point          |
    +----------+----------+
               |
               v
    +---------------------+
    | route and refill    |
    | matches removed     |
    | repairs prioritized |
    | facts/stalls routed |
    +----------+----------+
               |
               v
          next epoch
```

## Maintenance Lanes

### Fast Run-Evidence Refresh

Fast refresh is designed to run while workers are active. It should be cheap
enough to schedule every few minutes or after a coalesced batch of worker
reports.

Fast refresh should:

- ingest new worker reports, facts, blockers, stalls, and validation summaries;
- update curator-derived run evidence when deterministic reduction is cheap;
- rebuild or patch the graph state needed for file cards and rank features;
- refresh queued target priorities from the updated graph-ranked board;
- avoid Ghidra, opseq extraction, mismatch database sampling, and other
  heavyweight compiled-artifact runners.

Fast refresh may start as:

```sh
bun run kg:maintain -- --project melee --run-id <run-id> --no-tool-runners
```

If that is still too broad, split out a narrower command such as:

```sh
bun run kg:refresh-run-evidence -- --project melee --run-id <run-id>
```

That future command should do only worker-report ingestion, deterministic
curator reduction, graph rebuild or graph patching, and priority refresh inputs.

### Full Epoch Maintenance

Full epoch maintenance runs at the epoch boundary, after the report rebuild has
produced fresh compiled truth.

Full maintenance should:

- rebuild `build/GALE01/report.json` and `report_changes.json`;
- refresh generated assembly and compiled artifacts used by tool evidence;
- run selected live tool runners such as `ghidra`, `opseq`, `mismatch_db`, and
  `mwcc_debug` according to the evidence cadence policy;
- rebuild tool lookup indexes;
- reduce worker reports and PR evidence into curator enrichment;
- rebuild the graph from current project code data and graph-owned enrichment;
- write the epoch save point and route regression repairs.

Some boundary work can overlap, but graph publication must wait until all inputs
it depends on are ready:

- report build must finish before report-derived rank data, opseq, Ghidra, and
  mismatch refreshes can be authoritative;
- deterministic worker-report reduction can run before or during report build;
- final graph rebuild should wait for fresh report/code data, selected tool
  indexes, and curator output.

### Run-Boundary Maintenance

Run-boundary maintenance remains the exhaustive mode. It should be used before
handoff, sync, fresh-run setup, or another unattended campaign. It can enable
optional PR/curator agents and strict smoke checks.

## Runtime Flow

### 1. Configure Epoch

The operator selects:

- epoch size: base-2 preset or `Full`;
- worker count;
- fast maintenance cadence;
- full maintenance policy;
- drain behavior at epoch boundary.

The CLI receives equivalent flags or project config values.

### 2. Start Epoch

The run loop reads the current report and graph-ranked board, admits up to
the epoch size, and queues the epoch target set.

For `Full`, the admission set is every currently schedulable unmatched target
within the ranked board scan, expanding the scan until the board is exhausted.

### 3. Run Workers

Workers lease targets from the epoch set. Reports are persisted as usual.

Fast maintenance is coalesced by time and/or report count. Example policy:

- run every 3-5 minutes while workers are active;
- run sooner after N completed reports if no fast refresh is already in flight;
- never launch overlapping fast refreshes;
- skip if no worker reports changed since the last fast refresh.

Fast refresh can change priority order for queued-but-not-leased targets inside
the current epoch. Whether it can inject new targets from outside the admitted
epoch set is an explicit policy decision, not an accidental side effect.

### 4. Finish Epoch

An epoch finishes when one of these conditions is met:

- all admitted targets have reached a terminal report state;
- the completed lease count reaches the configured epoch size;
- the `Full` epoch exhausts currently admitted work;
- the operator drains/stops the run;
- regression/error policy pauses the run.

Boundary logic should prefer draining active leases when practical. If a worker
exceeds the boundary grace policy, lease recovery should route the target back
into the next epoch or into a stalled/rework lane.

### 5. Rebuild Truth

The epoch boundary runs the full report build and full maintenance lane. The
fresh report becomes the source of truth for:

- matched target removal;
- remaining target count;
- regression detection;
- next epoch board ranking;
- dashboard progress measures.

### 6. Route And Refill

After the full refresh:

- exact matches leave the future board;
- regressions become high-priority repair targets;
- `needs_fact` reports go to a fact/tool/research lane;
- repeated stalls cool down unless new evidence arrived;
- newly promising adjacent targets can enter the next epoch from the refreshed
  board;
- the next epoch is admitted from the current graph-ranked board.

## Scheduler Semantics

The plan should make three sizes explicit:

| Concept | Purpose |
| --- | --- |
| Epoch size | Total target admissions for one epoch. |
| Ready queue size | Number of queued targets kept immediately leaseable. |
| Candidate window | Number of ranked board candidates scanned to fill the epoch or queue. |

The MVP can keep epoch size and ready queue size identical. A later refinement
can make ready queue size smaller than epoch size, allowing the runtime to keep
workers fed from a fixed epoch pool without materializing every target at once.

## UI Controls

Add an epoch configuration area to the dashboard run controls:

- epoch size segmented control: `32`, `64`, `128`, `256`, `512`, `Full`;
- fast maintenance cadence selector or numeric interval;
- full maintenance mode summary;
- read-only status for current epoch progress: admitted, leased, completed,
  matched after last boundary, remaining, fast refresh age, boundary status.

The dashboard-managed process name remains `melee-live`. These controls should
configure the stable process launch, not create per-mode process names.

## CLI And Config

Candidate CLI/config additions:

| Option | Meaning |
| --- | --- |
| `--epoch-size <n|full>` | Total target admissions for one epoch. |
| `--epoch-ready-queue-size <n>` | Optional ready queue cap when decoupled from epoch size. |
| `--fast-kg-maintenance-interval-ms <n>` | Cadence for in-epoch fast refresh. |
| `--fast-kg-maintenance-report-count <n>` | Coalesced report-count trigger. |
| `--no-fast-kg-maintenance` | Disable in-epoch fast refresh. |
| `--full-kg-maintenance-mode <full|no-tool-runners|custom>` | Boundary maintenance policy. |

Existing flags should be preserved where possible:

- `--queue-target-size` can initially serve as epoch size for compatibility.
- `--epoch-ready-queue-size` decouples immediately leaseable work from total
  epoch admission.
- `--knowledge-maintenance-interval-ms` remains the optional background
  maintenance knob; `--fast-kg-maintenance-*` controls the dedicated in-epoch
  fast lane.

## State And Events

The runtime should persist enough state to explain every epoch:

- epoch id and ordinal;
- configured size and mode;
- admitted target count;
- target ids admitted to the epoch;
- fast refresh runs and inputs;
- full boundary refresh result;
- report build result;
- matched/remaining deltas;
- regression repair plan;
- pause or error reason.

Candidate events:

- `epoch_admitted`;
- `epoch_fast_refresh_started`;
- `epoch_fast_refresh_finished`;
- `epoch_boundary_started`;
- `epoch_boundary_finished`;
- `epoch_full_refresh_started`;
- `epoch_full_refresh_finished`;
- reuse existing `epoch_started`, `epoch_finished`,
  `epoch_regression_pause`, and `epoch_cycle_error` where they still fit.

## Migration Plan

### Phase 1: Documentation And Naming

- Land this plan.
- Update system docs to distinguish epoch size, ready queue size, and candidate
  window.
- Update Evidence Refresh Cadence to reference fast and full maintenance lanes.

### Phase 2: CLI Compatibility Layer

- Add `--epoch-size <n|full>` as an alias or wrapper around existing queue and
  checkpoint behavior.
- Preserve current defaults.
- Emit runtime summaries that show epoch size, admitted count, and maintenance
  mode.

### Phase 3: Fast Maintenance Lane

- Add or narrow a command for fast run-evidence refresh.
- Coalesce runs by interval/report count.
- Refresh queued priorities after a successful fast refresh.
- Record fast refresh events for dashboard visibility.

### Phase 4: Boundary Full Refresh

- Make full epoch maintenance an explicit boundary stage.
- Ensure report build, tool runners, tool indexes, curator output, graph rebuild,
  and save point have clear dependency ordering.
- Route exact matches, regressions, needs-fact, stalls, and repairs after the
  fresh report is published.

### Phase 5: Dashboard Controls

- Add epoch size control.
- Add maintenance status and last-refresh age.
- Add current epoch progress view.
- Keep process management stable under `melee-live`.

### Phase 6: Cleanup And Doc Promotion

- Fold stable behavior into system design and implementation docs.
- Keep this file as the migration record or move unresolved pieces into a newer
  plan.

## Validation

- Unit-test epoch size parsing, including `Full`.
- Smoke-test a small epoch in dry-run mode.
- Smoke-test fast maintenance with `--no-tool-runners`.
- Verify fast refresh does not launch overlapping graph writes.
- Verify epoch boundary removes newly matched targets after report rebuild.
- Verify regression repairs outrank normal board candidates.
- Verify dashboard process controls still address `melee-live`.
- Verify `Full` mode stops cleanly when no unmatched schedulable targets remain.

## Open Questions

- Should fast maintenance be allowed to admit newly promising adjacent targets
  into the current epoch, or only reorder the admitted set?
- Should `Full` mode queue every target at once, or maintain a smaller ready
  queue from a fixed full-epoch admission set?
- What is the default epoch size for 16, 24, and 32 worker pools?
- Should full boundary maintenance always run Ghidra/opseq/mismatch runners, or
  use a policy based on changed artifacts and elapsed time?
- Is deterministic curator reduction cheap enough for every fast refresh, or
  should it be split into report indexing and lesson reduction?
- Should epoch state live in new SQLite tables, save-point payloads, or both?

## Non-Goals

- Do not make workers directly mutate the canonical graph.
- Do not run heavyweight tool runners after every worker completion.
- Do not make UI controls rename or fork the managed Melee process.
- Do not treat a fast graph refresh as proof that the compiled report is current.
- Do not precompute target-specific exploratory tools across the whole repo.
