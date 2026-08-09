---
concepts: [repo-mechanics, report-json, objdiff, configure, progress-terms, commands, wibo]
---

# Current Repo Mechanics

Current Melee repo mechanics that the orchestrator indexes or wraps.

Sources: [toolpacks](/toolpacks), [apps/server/src/core/session-runtime/phases/running/board](/apps/server/src/core/session-runtime/phases/running/board), [apps/server/src/infrastructure/shell](/apps/server/src/infrastructure/shell).

The orchestrator should index and drive the existing Melee progress pipeline. It
should not fork the compiler, report, objdiff, or progress machinery.

## Artifacts And Commands

| Artifact Or Command | Current Role | Orchestrator Use |
| --- | --- | --- |
| `config/GALE01/config.yml` | Input to DTK's DOL split; points at the original DOL, symbols, and splits. | Read-only provenance for object/unit boundaries and target addresses. |
| `python configure.py` | Generates `build.ninja`, `objdiff.json`, and compile commands. | Run during workspace/bootstrap and after source/config changes that require regeneration. |
| `python3 configure.py --require-protos --wrapper <state>/tools/wibo` | Generates the same build graph with MWCC invocations routed through wibo. | Preferred orchestrator configure command when project-state wibo is installed. |
| `configure.py` object flags | `Object(Matching, ...)` means linked from rebuilt source; `NonMatching` means diffable but not linked. | Distinguish exact code progress from linked progress. |
| `objdiff.json` | Maps units to original objects, rebuilt objects, source paths, scratch context, and completion metadata. | Primary source for unit metadata, source paths, compiler flags, and write-set derivation. |
| `build/GALE01/report.json` | Generated report with unit/function match metrics. | Main index input for target discovery, progress targets, score deltas, and regression checks. |
| `decomp-find` | Candidate ranking helper built from `report.json`. | Internal board-scan signal, not the top-level workflow. |
| `tools/table-typer dups` | Finds normalized assembly duplicate groups with matched refs and unmatched candidates. | High-confidence graph edges and duplicate-adaptation worker evidence. |
| `decomp-runs/` | Existing experiment-bundle convention. | Per-target or per-capability artifact ledger; the orchestrator DB can point into these bundles. |

## Progress Terms

| Term | Meaning |
| --- | --- |
| `fuzzy_match_percent` | Objdiff closeness; useful diagnostic telemetry but not the v1 success target. |
| `matched_code_percent` | Exact matched code bytes/functions, including inside non-linked units. |
| `complete_code_percent` | Linked progress from units marked complete/linkable through `Matching`. |
| `metadata.complete` | Generated from the source object's `Matching`/`NonMatching` state when source exists. |

## Commands To Wrap First

```sh
python3 configure.py --require-protos --wrapper projects/<id>/state/tools/wibo
ninja build/GALE01/report.json
ninja progress
bun run server:job -- --project melee kg-rank-features --limit 200
build/tools/objdiff-cli diff -p . -u <unit> <symbol>
(cd tools/table-typer && go run . dups)
```

Run project checkout commands from the selected project repo and orchestrator
commands from the platform repo. Raw `--repo-root` remains available when the
project descriptor is not the desired target.

## MWCC Runner Setup

The orchestrator prefers wibo for MWCC process execution. A project-local
install at `projects/<id>/state/tools/wibo` is the stable path used by managed
run-loop configure commands, worker subprocess environments, and resolver-backed
tool APIs. When that file exists on macOS or Linux, the run loop passes
`--wrapper <state>/tools/wibo` to `configure.py` and exports `MWCC_WIBO` for
worker tool calls.

Tool helpers resolve runners in this order:

1. explicit `MWCC_WIBO`;
2. `ORCH_PROJECT_STATE_DIR/tools/wibo` or the state wibo inferred from the
   worktree path;
3. checkout-local `build/tools/wibo` or `wibo` on `PATH`;
4. Wine as a compatibility fallback.

The runner choice should not change generated code: it only changes how the
Windows MWCC executables are launched. `build.ninja`, DTK, objdiff, compiler
flags, and target objects remain the source of truth.
