---
covers: Current Melee repo mechanics that the orchestrator indexes or wraps
concepts: [repo-mechanics, report-json, objdiff, configure, progress-terms, commands]
code-ref: decomp-orchestrator/knowledge/tools, decomp-orchestrator/src/board, decomp-orchestrator/src/shell
---

# Current Repo Mechanics

The orchestrator should index and drive the existing Melee progress pipeline. It
should not fork the compiler, report, objdiff, or progress machinery.

## Artifacts And Commands

| Artifact Or Command | Current Role | Orchestrator Use |
| --- | --- | --- |
| `config/GALE01/config.yml` | Input to DTK's DOL split; points at the original DOL, symbols, and splits. | Read-only provenance for object/unit boundaries and target addresses. |
| `python configure.py` | Generates `build.ninja`, `objdiff.json`, and compile commands. | Run during workspace/bootstrap and after source/config changes that require regeneration. |
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
python configure.py
ninja build/GALE01/report.json
ninja progress
python decomp-orchestrator/knowledge/tools/rank_decomp_candidates.py --json --limit 200
build/tools/objdiff-cli diff -p . -u <unit> <symbol>
(cd tools/table-typer && go run . dups)
```

The original design referenced the old `.codex/skills/decomp-find` path for
candidate ranking. The package-owned equivalent now lives under
`decomp-orchestrator/knowledge/tools/`.
