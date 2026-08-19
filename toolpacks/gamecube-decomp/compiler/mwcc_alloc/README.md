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

The CLI gets the function's 1-based capture index from the built PowerPC ELF
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
before/after pair. A qemu-emulated compile can take several minutes.

On a macOS host without `gdb-multiarch` and `qemu-i386`, the API returns
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
2. Run the existing bundle builder. It copies the four `sandbox/*.py` files to
   `$MELEE_ROOT/build/tools/mwcc-alloc/` in the bundle.

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
