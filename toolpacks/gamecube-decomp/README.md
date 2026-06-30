# GameCube Decomp Toolpack

This directory owns reusable callable tool capabilities for GameCube decomp
projects. It is intentionally outside knowledge sources and outside any single
project: the toolpack defines stable tool ids, default APIs, runner scripts,
recipes, and shared helper code. A project opts into the pack, supplies
tool-specific bindings, and owns the generated data for its checkout.

Project-owned runtime data is resolved from `projects/<id>/project.json` and
`projects/<id>/tool-bindings/<tool_id>.json`. Stable indexes and caches live
under `projects/<id>/shared/tool-data/<tool_id>`. Mutable output for parallel
worktrees lives under
`projects/<id>/worktrees/<worktree_id>/tool-cache/<tool_id>`.

The server does not duplicate this pack under resource folders. Server code
resolves a project-enabled toolpack, merges the project binding, and invokes
the selected API path from that resolved context.

`toolpacks/gamecube-decomp/registry.json` is the source of truth for stable
tool ids, physical paths, categories, and lightweight usage metadata. Agent
prompts should present tool ids as available capabilities; code should resolve
suite paths through the server tool runtime rather than hardcoding category
folders.

```text
toolpacks/gamecube-decomp/
+-- toolpack.json
+-- registry.json
+-- recipes/
+-- research/
+-- validation/
+-- compiler/
+-- source_editing/
+-- data_conversion/
+-- operations/
+-- _impl/
+-- _shared/
```

Each registered suite keeps the same shape:

```text
<category>/<tool_id>/
+-- tool.json
+-- README.md
+-- api/
+-- runners/
+-- tests/
```

Runtime storage for each suite is project-owned:

```text
projects/<id>/
+-- tool-bindings/
|   +-- <tool_id>.json
+-- shared/tool-data/<tool_id>/
|   +-- cache/
|   +-- indexes/
+-- worktrees/<worktree_id>/tool-cache/<tool_id>/
```

Shared implementations that support multiple public tool suites live under
`toolpacks/gamecube-decomp/_impl/gamecube`. Project-specific assumptions belong
in project bindings, project-owned shared data, or project override roots.

## MWCC Runner And Tool Slots

For high-throughput worker runs, wibo is the preferred MWCC process runner. The
orchestrator-managed install lives at `projects/<id>/state/tools/wibo`; the
server resolver exports that path as `MWCC_WIBO`, and tool helpers also discover
it from `ORCH_PROJECT_STATE_DIR` or from worker worktree paths. Checkout-local
`build/tools/wibo` and `wibo` on `PATH` are fallback wibo locations. Wine is a
compatibility fallback when wibo is not available or a tool explicitly requests
it.

Compile-heavy API calls are queued by `_shared/toolpack_runtime.py` before the
helper command starts. Slot directories sit beside the epoch worker worktrees
under `.worker-tool-slots/<tool>/slot-N` and carry `owner.json` so stale slots
can be recovered. Defaults are 12 checkdiff slots, 1 source-permuter run/replay
slot, 8 m2c slots, 2 mwcc_debug slots, and 16 for other tool APIs. Source
permuter run/replay calls fail fast with `queue_busy` when all configured
source-permuter slots are full instead of waiting in line. Tune tool API slots
with `ORCH_TOOL_CONCURRENCY_<TOOL>`,
`ORCH_WORKER_TOOL_CONCURRENCY_<TOOL>`, or
`ORCH_WORKER_TOOL_CONCURRENCY`. Tune shared MWCC/wibo compile slots with
`ORCH_WORKER_COMPILE_CONCURRENCY` or `ORCH_WORKER_NINJA_CONCURRENCY`; the
default is 12. Source-permuter run calls are capped at 1 internal job by
default; set `ORCH_SOURCE_PERMUTER_MAX_JOBS` to intentionally allow more.

## Capability Roles

| Tool | Category | Role | Default use |
| --- | --- | --- | --- |
| `checkdiff` | validation | compile/checkdiff feedback | attempt evaluation |
| `review_lint` | source_editing | source review guardrail | attempt evaluation |
| `include_fixer` | source_editing | missing include preview | conditional feedback |
| `objdiff_score` | validation | candidate object scoring | conditional feedback |
| `mwcc_debug` | compiler | compiler-shape diagnosis | conditional feedback |
| `ghidra` | research | binary lookup | on demand |
| `opseq` | research | similar function lookup | on demand |
| `mismatch_db` | research | mismatch tactic lookup | on demand |
| `m2c_decomp` | research | control-flow scaffold | on demand |
| `type_oracle` | compiler | expression type lookup | on demand |
| `source_permuter` | source_editing | source-shape exploration | on demand |
| `struct_infer` | data_conversion | asm layout inference | on demand |
| `item_state_table` | data_conversion | asm data conversion preview | on demand |

## Recipes

Recipes are optional bundles, not schedulers. The baseline contract is:
the agent sees the available tools, chooses the relevant research or validation
capability, and calls it when it needs evidence.

- `toolpacks/gamecube-decomp/recipes/attempt-evaluation.json` describes the validation feedback
  bundle for a concrete source-edit attempt: review lint, compile/checkdiff,
  and conditional follow-up suggestions. It is useful when the agent wants a
  structured answer to "what is right, wrong, or still unknown about this
  attempt?"

## Maintenance Commands

- `bun run kg:maintain -- --project melee` runs the server-backed maintenance
  pipeline: PR postmortems, tool runners, tool indexes, data-sheet facts,
  curator enrichment, and graph rebuild.
- `python3 toolpacks/gamecube-decomp/build_tool_indexes.py --repo-root <repo_root>`
  creates lightweight JSONL indexes for registered lookup suites.
- `python3 toolpacks/gamecube-decomp/research/ghidra/runners/run_headless_probe.py --repo-root <repo_root>`
  runs the Ghidra headless probe.
- `python3 toolpacks/gamecube-decomp/research/opseq/runners/extract_opcode_sequences.py --repo-root <repo_root>`
  refreshes opcode fingerprints.
- `python3 toolpacks/gamecube-decomp/research/mismatch_db/runners/analyze_objdiff_mismatches.py --repo-root <repo_root>`
  refreshes mismatch evidence.
- `python3 toolpacks/gamecube-decomp/compiler/mwcc_debug/runners/probe_mwcc_compiler.py --repo-root <repo_root>`
  refreshes MWCC runner probe evidence.

Workers usually call Pi extensions or suite `api/*.py` scripts, not runners.
Runners and caches are operator surfaces for refreshing shared evidence.
