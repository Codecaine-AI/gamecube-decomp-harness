# MWCC Allocator Snapshots

`mwcc_alloc` captures the stock MWCC register allocator's live state for one
function. It records PCode blocks before coloring and the interference graph,
simplify order, and assigned registers around each GPR coloring attempt.

This tool fills the register-allocation evidence gap behind the gated
`mwcc_debug_diagnose_regflow` and `mwcc_debug_diagnose_stack` tools. Those tools
need the instrumented `mwcceppc_debug.exe`, which has not been provisioned in
the worker image. `mwcc_alloc` instead observes the stock `mwcceppc.exe` under
qemu and GDB. It does not need an instrumented compiler.

## Provenance

The reader, GDB commands, and comparison code come from
[`MarkMcCaskey/decomp-scripts`](https://github.com/MarkMcCaskey/decomp-scripts)
at commit `88f0abe02080a1d3f19df3aebf551dc5fb226442`. The upstream code is MIT
licensed, Copyright (c) 2026 Mark McCaskey.

The vendored files and local changes are:

- `sandbox/allocator_snapshot.py`, from `mwcc/allocator_snapshot.py`, accepts
  both supported compiler hashes, records the compiler identity, and validates
  either identity.
- `sandbox/gdb_allocator_snapshot.py`, from
  `mwcc/gdb_allocator_snapshot.py`, reads the compiler identity and selected
  function index from the environment.
- `sandbox/compare_coloring_snapshots.py`, from
  `mwcc/compare_coloring_snapshots.py`, adds machine-readable JSON output and a
  reliable sibling import.
- `sandbox/mwcc_alloc_capture.py` is local glue that builds the unit, selects
  the function, runs the debugger, validates the captures, and reports one
  JSON result.

## Architecture

Upstream capture uses two coordinated processes: `qemu-i386 -g` exposes the
compiler through a GDB stub, and `gdb-multiarch` loads the Python commands that
set allocator breakpoints and write snapshots. `mwcc_alloc_capture.py` folds
that pattern into one synchronous CLI. It starts both children, enforces one
deadline, kills and reaps them on every exit path, then returns JSON.

No qemu, GDB, daemon, or other background process may survive the command. The
sandbox run-and-sleep quiescence barrier depends on this.

Legacy modes get the function's 1-based capture index from the built PowerPC ELF
symbol table. This assumes MWCC runs one allocator pass per emitted function in
object symbol order. Check neighboring captures if the result looks wrong.

Run a capture inside the Linux sandbox:

```sh
python3 toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/snapshot.py \
  --repo-root "$PWD" \
  --unit src/melee/ft/chara/ftDemo.c \
  --function <symbol> \
  --capture pair \
  --json
```

`pcode` keeps the pre-coloring allocator snapshot. `coloring` keeps the first
GPR before-coloring graph. `pair` keeps the allocator snapshot and every GPR
before/after pair.

`trace` defaults to `--trace-detail stages`. It retains nine PCode stages,
allocator and GPR/FPR coloring, the compiled object, and GDB/qemu logs. The
stage profile omits creation/clone/virtual-register event, stack/local-object,
home-list, code-motion and peephole event tracing. Each artifact and result
lists these omissions; no empty files stand in for uncollected evidence.
`--trace-detail full` enables those expensive breakpoint classes.

Use the current synced capture entry point in existing sandboxes:

```sh
python3 /opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/snapshot.py \
  --repo-root "$PWD" --unit src/melee/mn/mnSnap.c \
  --function mnSnap_80257F24 --capture trace --trace-detail stages --json
```

Trace checks the compiler hash before building the current unit. It selects
the requested function by its index in the resulting object, rejects decoded
nonempty mismatching names, and compares the capture object's function order.
Some compiler function objects have an empty name cache, so this fallback
retains an explicit symbol-order caveat. Every successful trace requires all
artifacts for its chosen profile. Timeout and failure preserve unvalidated
partial artifacts and logs. A qemu-emulated full trace can take several minutes.

On a macOS host, the snapshot API returns
`sandbox_required`. Attach a sandbox-backed worker claim or run the command in
the sandbox image.

Compare two coloring snapshots on either host or sandbox:

```sh
python3 toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/compare.py \
  --before <before.json> \
  --after <after.json> \
  --json
```

## Snapshot Formats and Compiler Gate

Allocator files use `mwcc-allocator-snapshot-v1`. They contain the function's
PCode basic blocks and instructions. Coloring files use
`mwcc-coloring-snapshot-v1`. They contain the register class, interference
graph, simplify order, and physical-register assignments. Comparisons use
`mwcc-coloring-compare-v1` and report per-vreg changes without embedding either
full snapshot.

The reader and validators accept only these compiler SHA-256 hashes:

| Compiler | SHA-256 |
| --- | --- |
| `GC/1.2.5` | `0443b5c02b1aa7b575b61e0e24c4d5ad6bed8fd54cc42de5a2204a5216001914` |
| `GC/1.2.5n` | `ccf4b465cec73b5aae9c5c5543dcf8cda8a62aba246f89e2e0b200d742f2e55c` |

Both hashes were verified against
`games/melee/checkout/build/compilers/GC/{1.2.5,1.2.5n}/mwcceppc.exe`. The
allocator code and data regions used by this tool are byte-identical in those
two binaries. Any other hash returns `compiler_hash_mismatch`; do not bypass
the gate because all breakpoint and data addresses are compiler-specific.

## Capture Statuses

Every anticipated condition exits 0 with structured JSON. Only an unexpected
programming error exits nonzero.

| Status | Meaning and operator action |
| --- | --- |
| `debug_tools_not_provisioned` | The image lacks `gdb-multiarch`, `qemu-i386`, GDB Python support, or a real ELF wibo. Do not retry on the same image. Continue with checkdiff or `mwcc_debug_lookup` evidence, or rebake the image. |
| `invalid_arguments` | A unit path, symbol, capture kind, output path, timeout, or repository root failed validation. Correct the named input and rerun. |
| `unit_build_failed` | Ninja could not build the requested unit's object. Read `stderr_tail`, fix the build failure, and rerun. |
| `compiler_hash_mismatch` | The selected compiler is not one of the two verified binaries. Use the image's pinned `GC/1.2.5` or `GC/1.2.5n` compiler. |
| `function_not_found` | The built object's ELF function symbols do not include the requested symbol. Check `unit_functions`, the unit path, and whether the function emitted code. |
| `timeout` | The qemu and GDB phase exceeded the deadline. The CLI has killed and reaped both children. Increase `--timeout-seconds` within the 60 to 1800 second limit only if the image is otherwise healthy. |
| `capture_failed` | qemu or GDB failed and wrote no selected captures. Inspect `gdb_stderr_tail` and `qemu_stderr_tail`. |
| `capture_index_missing` | Capture files exist, but none use the ELF-derived function index. Inspect `captured_indices` and the reported symbol-order caveat. |
| `internal_error` | An unexpected exception occurred. Treat this as a tool bug; the JSON `error` field has the immediate cause. |

## Sandbox Image Rebake

Do this in the existing Linux image build pipeline, not in this macOS
worktree.

1. Add the `gdb-multiarch` and `qemu-user` apt packages to the sandbox image.
2. Run the existing bundle builder. It copies the four legacy `sandbox/*.py` files, the analysis wrapper,
   and the pinned modern Python vendor tree to
   `$MELEE_ROOT/build/tools/mwcc-alloc/` in the bundle. It also bakes stock upstream wibo 1.2.0 to `$MELEE_ROOT/build/tools/wibo-qemu`; the optimized wibo crashes under qemu-user, so captures require the stock binary.

   ```sh
   toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/build_image_bundle.sh \
     --harness-root <harness-root> \
     --checkout <melee-checkout> \
     --out <bundle.tar.zst>
   ```

3. Feed that bundle through the existing image build and snapshot-push flow.
4. Run the acceptance checks in
   `toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/MANIFEST.md`, then
   run these allocator-specific checks inside a fresh sandbox:

   ```sh
   gdb-multiarch --version
   qemu-i386 --version
   gdb-multiarch --batch -ex "python print(1)"
   python3 build/tools/mwcc-alloc/mwcc_alloc_capture.py \
     --repo-root "$MELEE_ROOT" \
     --unit <small-matched-unit> \
     --function <matched-symbol> \
     --capture pair \
     --json
   ```

The version and Python probes must exit 0. The smoke capture must return
`"status": "ok"`, list validated snapshot files, and leave no qemu or GDB
process running.

## Tests

The unit suite needs only Python's standard library and does not run live qemu
or GDB capture:

```sh
python3 -m unittest discover \
  -s toolpacks/gamecube-decomp/compiler/mwcc_alloc/tests \
  -v
```

## Modern Analysis

`vendor/mwcc-decomp` contains the required Python modules and register-site
catalogs from [MarkMcCaskey/mwcc-decomp](https://github.com/MarkMcCaskey/mwcc-decomp)
at `0f0e1dbc7496d1a0bdf00798ff6752e813e0d0d0`, licensed CC0-1.0.
`PIN.json` records hashes for every vendored file. No binaries, capture data,
or Git metadata are vendored. Legacy capture and compare code remains separate.

Run analysis on saved JSON using `api/analyze.py`. The sandbox runtime name is
`/opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/analyze.py` from the
synced toolpack. New image bundles also include the baked analysis wrapper;
current sandboxes use the synced path. Both return one JSON object with
`status`, `mode`, `format`, and `result` or `error`. Every completed analysis saves the full raw
result as an artifact, suitable as input for later analysis. `--output` chooses
its location; the default is a unique file under `build/mwcc-alloc/analysis/`.
Tool output contains its path and at most 8 KiB of result facts. Artifacts have
a 128 MiB serialization limit and never overwrite an input file. Input and output paths must resolve inside `--repo-root`,
including symlinks. Analysis never executes a compiler and also runs on macOS.

| Mode | `--input` | Additional arguments |
| --- | --- | --- |
| `provenance` | Allocator snapshot | Optional repeated `--coloring`, `--creations` |
| `explain` | Provenance JSON | Required `--register gpr:N`, `fpr:N`, or `vr:N` |
| `inverse` | Before-coloring snapshot | Required `--after` and repeated `--target N=N`; optional `--provenance`, `--degree-search` |
| `source-rank` | Capture directory | Required `--function-index` and repeated `--target N=N`; optional repeated `--fixed-object vN` |
| `stack` | Stack-frame trace | Optional `--provenance`, `--after` comparison trace |
| `origins` | Provenance JSON | Optional `--after` comparison provenance |

For example, build provenance before explaining a register:

```sh
python3 /opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/analyze.py --repo-root "$PWD" \
  --mode provenance --input build/mwcc-alloc/example/allocator-0001.json \
  --coloring build/mwcc-alloc/example/coloring-0001-gpr-01-after.json \
  --creations build/mwcc-alloc/example/pcode-creations-0001-scheduled.json \
  --output build/mwcc-alloc/example/provenance.json --json
python3 /opt/toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/analyze.py --repo-root "$PWD" \
  --mode explain --input build/mwcc-alloc/example/provenance.json \
  --register gpr:41 --json
```

Targets always use numeric `vreg=physical`, such as `41=17`, in both solver
modes. `source-rank` requires the first GPR before/after pair and scheduled
PCode from the named index. It does not substitute final-round graphs or an
allocator snapshot. Fixed objects preserve the listed object webs during
source-rank search; the upstream model also fixes object web 32 automatically.

Provenance joins reject conflicting compiler, function index, decoded name, or
function-object pointer evidence, including conflicts between coloring inputs.
Older captures with missing identity fields remain supported.

Solvers compare baseline replay with captured colors before searching. A
mismatch returns `baseline_replay_mismatch` without solver conclusions. A
large inverse prefix uses at most 256 pair transpositions and returns
`search_limited`, including any witness and every changed color. This does
not establish source feasibility or prove impossibility when no witness is
found. Apply source changes separately and verify with compile/checkdiff.
Missing creation events make origin information incomplete, even when the
reported origin groups are empty.

Source-rank has a global 256-replay budget across all removable-object subsets.
It divides the sample/permutation allowance by the subset count. If subsets
alone exceed 256, it requests more fixed objects instead of starting a larger
search. No-witness results are reported as `search_limited`, never as proof
that a matching C source cannot exist.

Each analysis has a 45-second deadline, a 32 MiB per-file and 128 MiB total
input limit, at most 4096 solver nodes, 16 targets, 64 coloring inputs, and 64
fixed objects. Virtual registers are 0 through 65535, physical registers 0
through 31, function indices 1 through 100000, and degree-search bounds 0
through 8. Expected failures use `invalid_arguments`, `invalid_input`,
`baseline_replay_mismatch`, `search_limited`, or `timeout` and exit zero.
