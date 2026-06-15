---
covers: When to refresh build artifacts, tool caches, graph evidence, and learned context during epochs and runs
concepts: [refresh-cadence, epoch, run-boundary, tool-runners, knowledge-maintenance, evidence-freshness]
status: proposed
depends-on: [docs/10-system-design/50-knowledge-model.md, docs/10-system-design/60-score-and-pr-handoff.md, docs/10-system-design/70-save-points.md]
---

# Evidence Refresh Cadence

Status: proposed operational policy. The commands and concepts here are meant
to guide epoch/run refresh design and manual operation; they should not be read
as a claim that every epoch boundary is automated today.

The orchestrator treats generated evidence as part of the working map of the
codebase. When many workers change source, the map must be refreshed often
enough that the next workers see the new terrain: fresh report rows, fresh asm,
fresh file cards, current target ranking, and lessons from the work that just
landed.

Refresh cadence is not "rerun every tool after every edit." It is a boundary
policy. Per-attempt tools answer narrow questions; epoch and run boundaries
refresh the shared evidence layer used to choose the next work.

## Boundary Levels

| Boundary | Trigger | Refresh posture |
| --- | --- | --- |
| Attempt | One worker is iterating on one target. | Run narrow validation and on-demand research only. Do not refresh global graph or heavyweight caches. |
| Epoch | A meaningful batch of accepted worker output has integrated into the checkout, such as a fixed completion count, score movement, or drain/checkpoint interval. | Refresh build/report artifacts, tool indexes, selected live tool runners, curator output, and graph state before scheduling the next wave. |
| Run | The run is ending, pausing for handoff, or preparing the next run. | Run the full evidence refresh and validation ladder. This is the clean starting point for the next run. |
| Sync or handoff | Upstream moved, PRs merged, or local work is being packaged. | Rebuild against the new baseline, refresh PR/knowledge evidence, and record a save point. |

## Epoch Refresh

An epoch refresh is the in-run version of "the codebase has changed enough that
new workers deserve a fresh map." For example, if 32 workers complete 128
targets, the next 32 should not be scheduled from stale file cards and stale
rank features.

The epoch should first refresh the selected project's build artifacts. The
knowledge layer reads compiled outputs, not only raw source:

| Artifact | Why it matters |
| --- | --- |
| `build/GALE01/report.json` | Source paths, function status, fuzzy percent, sizes, and ranking inputs. |
| `build/GALE01/asm/**/*.s` | Opcode-sequence fingerprints for similar-function lookup. |
| `build/GALE01/main.elf` | Ghidra headless import/analyze evidence. |
| `build.ninja` / compile database | MWCC rule snippets, type-oracle flags, and compile/check tooling. |

After the build/report refresh, run the knowledge maintenance pass for the
active run. Direct maintenance is deterministic unless optional model review
flags are enabled:

```sh
bun run kg:maintain -- --project melee --run-id <run-id>
```

That pass refreshes pending deterministic PR indexes, live tool runners, tool
lookup indexes, curator reductions from worker reports, and the graph database.
The resulting graph should drive the next queue refill and worker packet
construction.

If an epoch needs to be lighter than full maintenance, the minimum useful
refresh is:

1. Refresh `report.json` and the generated asm for the integrated checkout.
2. Refresh tool lookup indexes from the report.
3. Rebuild the graph from the current code graph and curator output.

Skipping live tool runners is acceptable for a fast epoch only when their
inputs are known not to matter for the next scheduling decision. The next run
boundary should still run the full pass.

The fast-path command shape is:

```sh
bun run kg:maintain -- --project melee --run-id <run-id> --no-tool-runners
```

Use the fast path only after the project build/report refresh has already run.
If opcode or binary lookup quality matters for the next wave, use the full
maintenance command instead.

## Run Refresh

A run boundary should be exhaustive. The next run should start from a state
where the shared map, durable lessons, and project artifacts all describe the
same checkout commit.

The run-boundary sequence is:

1. Drain or pause worker intake so no new source edits race the boundary.
2. Refresh the project build/report artifacts through the normal QA/report
   command for the selected project.
3. Run `kg:maintain` for the completed run.
4. Run strict graph/tool smoke if this boundary will launch another unattended
   worker wave.
5. Record a save point with the refreshed report, board snapshot, and commit.

The typical command pair is:

```sh
bun run kg:maintain -- --project melee --run-id <completed-run-id>
bun run kg:smoke -- --project melee --strict
```

Run-boundary maintenance may enable optional PR or curator agents when the goal
is to improve the long-lived knowledge base, but the deterministic maintenance
pass is the baseline requirement.

## Tool Freshness Rules

| Tool or source | Refresh at epoch | Refresh at run boundary | Notes |
| --- | --- | --- | --- |
| `type_oracle` | No global refresh. | No global refresh. | Source-state-specific; workers call it on demand after editing the relevant file. |
| `checkdiff` / `objdiff_score` | Per target or integration candidate. | As part of validation gates. | These prove edits; they are not shared lookup caches. |
| `opseq` runner | Yes when generated asm changed and similar-function lookup should be fresh. | Yes. | Reads `build/GALE01/asm/**/*.s`. |
| `ghidra` runner | Yes when `main.elf` changed and binary lookup may guide the next wave. | Yes. | Imports/analyzes the current `main.elf`; not a source-code compiler. |
| `mismatch_db` runner | Useful after report/objdiff state changes enough that old samples are stale. | Yes. | Produces shared mismatch evidence; target-specific validation still happens elsewhere. |
| `mwcc_debug` runner | Usually optional unless compiler setup or build rules changed. | Yes by default through maintenance. | The shared runner proves MWCC/Wine/build-rule readiness; target-specific dump/diagnose calls stay on demand. |
| `kg:tool-indexes` | Yes. | Yes. | Rebuilds Ghidra symbol fallback and opseq function-shape rows from the latest report/code graph. |
| Curator reduction | Yes after accepted worker reports changed. | Yes. | Turns run evidence into graph-owned lessons and proposal-only source updates. |
| Graph rebuild | Yes. | Yes. | Recomputes file cards, rank features, PR edges, mismatch links, and selected source evidence. |
| PR refresh/sync | Usually no inside an active run. | Yes at sync or handoff boundaries. | Pulling upstream is a hard session boundary because it changes the baseline. |

## What Not To Precompute

Some tools are deliberately on demand. A fresh epoch should not run them across
the whole repository:

- `type_oracle` expression maps, because they depend on one source file and
  exact source spans.
- `mwcc_debug` function dumps and diagnoses, because they answer a concrete
  mismatch question.
- `m2c_decomp`, source permuter, struct inference, and data-conversion previews,
  because they are exploratory aids for a selected target.
- Compile/checkdiff proof for every possible target; validation belongs to the
  edited target, integration candidate, or QA gate.

The boundary refresh keeps the shared map fresh. Workers still collect
target-specific proof when they touch a target.

## Staleness Contract

If source has changed but the epoch refresh has not run, the system should
treat graph-ranked board data and tool lookup caches as provisional. They can
still be useful, but they may describe the previous compiled state.

After an epoch or run refresh, the next worker packet should be able to assume:

- report-derived function status and sizes match the current integrated
  checkout;
- opcode and binary lookup evidence comes from the current build artifacts, or
  is explicitly marked stale/unavailable;
- file cards and rank features include accepted lessons from prior workers;
- targets already matched or invalidated by the last epoch are no longer
  scheduled as if nothing happened.

That is the purpose of refreshing during a long run: not ceremony, but keeping
the next wave from solving yesterday's version of the puzzle.

## Related

- [Knowledge model](docs/10-system-design/50-knowledge-model.md)
- [Score integration and PR handoff](docs/10-system-design/60-score-and-pr-handoff.md)
- [Campaign and save points](docs/10-system-design/70-save-points.md)
- [Tools implementation](docs/20-implementation/tools/00-overview.md)
- [Knowledge implementation](docs/20-implementation/knowledge/00-overview.md)
