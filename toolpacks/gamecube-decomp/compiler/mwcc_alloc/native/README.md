# Traced MWCC (native backend of `mwcc_alloc`)

A rebuild of the GameCube CodeWarrior compiler (`mwcceppc.exe`, GC 1.1p1, 1.2.5 and 1.2.5n) from the
[rayanht/mwcc](https://github.com/rayanht/mwcc) decompilation, with hooks that write the compiler's decisions for one
function as `mwcc-trace-v1` JSON lines. With tracing off, and with tracing on, it compiles the same objects as the
stock compiler (checked unit by unit, see `VALIDATION.md`).

This directory holds the pin, the patches, the build script and the validation. Built binaries never go into git.

| Path | What |
|---|---|
| `PIN.json` | rayanht/mwcc commit, the stock SHA-1 per version, the unshield commit |
| `patches/*.patch` | the trace patch set, applied in order to the pinned checkout |
| `build.sh` | clone, build and check the stock reconstruction, build the traced variant, check event presence, write `CAPABILITIES.json` |
| `CAPABILITIES.json` | committed copy of the generated file for the validated binaries: trace points per version, with their evidence (the tools read it) |
| `tools/capabilities.py` | the generator |
| `validate/byte_identity.py` | safety gate 1: every unit of a game checkout, stock vs traced (tracing off, tracing on) |
| `validate/event_presence.py` | safety gate 2: each claimed trace point fires on `fixtures/trace_fixture.c` |
| `validate/overflow_check.py` | a small-limit test build reports every trace table's overflow; the traced build reports none on the fixtures |
| `tests/` | pytest: capabilities logic, a fast byte-identity sample, the build.ninja parser |
| `VALIDATION.md` | sweep results |

## Build

```sh
./build.sh --out games/<id>/runtime/tool-data/mwcc_native     # untracked tool data
./build.sh --out /tmp/mwcc-native --source /tmp/rmwcc/mwcc --seed /tmp/rmwcc/mwcc   # reuse a local clone and its downloads
```

Needs `python3` (3.11+), `ninja`, `git` and `unshield`; when `unshield` is missing the script builds it from
`PIN.json`'s commit with `-DUSE_OUR_OWN_MD5=ON` (needs `cmake`, a C compiler, zlib headers). The upstream build
downloads its own tools (wibo, the CodeWarrior Pro 4/5/5.3/6 compilers, the MSL sources, the original executables),
about 200 MB; `--seed` copies them from an existing mwcc checkout instead.

Per version the script:

1. builds the stock reconstruction and requires the original's SHA-1 (a broken upstream build stops here);
2. applies `patches/` to a second checkout and builds it with `configure.py --traced`: the trace module joins the
   link, and `tools/link_traced.py` writes `build/<VER>/traced-ok` (SHA-1, sources linked from source) instead of the
   stock SHA-1 check, which upstream's `tools/link.py` would fail;
3. copies `mwcceppc.exe`, `lmgr326b.dll` and `traced-ok.json` to `<out>/<ver>/`;
4. runs `validate/event_presence.py` against the fixture, and `validate/overflow_check.py` against a test build with
   tiny trace tables (`configure.py --trace-small-limits`, copied to `<out>/test-builds/small-limits/<ver>/`, never
   provisioned);
5. writes `<out>/CAPABILITIES.json` and `<out>/BUILD-INFO.json`. Without byte-identity sweeps of these exact binaries
   no version has trace points (`disabled: "no byte-identity evidence ..."`): `tools/capabilities.py` judges the
   evidence with the sandbox image's gate (`_impl/gamecube/sandbox-image/gate_traced_capabilities.py`), the one rule
   for both, against the requirements in `games/*/config/worker-image.json` (`traced_compilers`). 1.1p1 is always
   disabled.

About 2.5 minutes on an M-series Mac with the downloads seeded. The output layout (`<out>/<ver>/mwcceppc.exe` with
`CAPABILITIES.json` beside them) is what `api/native_backend.py` reads through `ORCH_MWCC_TRACED_ROOT`; the sandbox
image places the same files at `build/compilers-traced/GC/<ver>/`.

To fold a byte-identity sweep into the capabilities:

```sh
./build.sh --out <out> --work <work> ...                         # keep the work dir
python3 validate/byte_identity.py --checkout <sms checkout> --traced-root <out> --out /tmp/bi-sms
python3 validate/byte_identity.py --checkout <melee checkout> --traced-root <out> --out /tmp/bi-melee
./build.sh --out <out> --work <work> --capabilities-only \
  --byte-identity /tmp/bi-sms/byte_identity.json --byte-identity /tmp/bi-melee/byte_identity.json
```

The reports are filed as `<out>/validation/byte-identity/<game>/{one-function,all-functions}.json`, where the image
bundle reads them. A version with any mismatch, or without a full sweep from every game that requires it, keeps no
trace points.

## Tracing

| Variable | Meaning |
|---|---|
| `MWCC_TRACE_OUT=<file>` | turn tracing on; lines are appended to the file (never stderr: the object cache replays stderr) |
| `MWCC_TRACE_FUNC=<name>` | the function: link (mangled) name, or plain name (every function with that name: overloads, other classes' methods); `*` traces every function |
| `MWCC_CACHE_DISABLE=1` | set by traced runs so a cached object never stands in for a compile |

Every line is `{"v":1,"fn":<link name>,"display":<plain name>,"pass":..,"cls":"gpr|fpr|vr|-","ev":..}` plus the
event's fields (contract § "Trace stream"). A C++ function gets its link (mangled) name only when its code is
emitted, so the trace holds a function's lines in a static buffer and writes them when the function is done, under
the link name the compiler made (the trace never runs the mangler). A C++ function done before its link name exists
(an inline body optimized when saved) is parked by object and written when the function comes back with one; if it
never does, it was never emitted and its lines are dropped. A plain-name candidate whose final name is not the one
asked for is dropped. Paths are built in trace buffers from the compiler's directory registry, read only. Paths (`decl_file`, `site_file`) are the
ones the compiler opened, include search applied (wibo's `Z:` drive and backslashes turned back into the host path).
Events and where they come from:

| Event | Hook | Notes |
|---|---|---|
| `function` | `CInline.c` (`fn_0050ee60`, `generate_inline_code` select; written first when the function's lines are) | `name` (link name) |
| `vreg` | `Coloring.c` (after the class's graph is bound) | `vreg`, `kind` (`arg`, `local`, `temp`, `backend_temp`), `object`, `decl_file`/`decl_line` (locals: the token the compiler declared them with, also for C++ functions generated later from a saved body, whose rebuilt locals take the saved local's token, null when it was not saved; arguments and temporaries: null, as the compiler keeps no token for them; arguments add `decl_site:"function_body"` with `body_file`/`body_line`, where the body opens), `arg_index`, `varnumber`, `origin` (`cse: <expr>`), `web` (null), `pair` |
| `node` | `Coloring.c` | `degree`, `neighbors`, `coalesced`, `coalesced_into`; `spill_cost` is null (costs exist only once the allocator stalls: see `node_cost`) |
| `node_cost` | `Coloring.c` (after `SpillCode_ComputeSpillCosts`) | `vreg`, `spill_cost`, `degree` for the nodes still in the graph |
| `push` | `Coloring_SimplifyGraph` | `sweep`, `stalled`; stalls add `cost_ratio`, `spill_cost`, `degree` |
| `color`, `spill` | `Coloring_SelectColors` | `color` (-1 when spilled), `order` (pop index) |
| `commit` | `Coloring_CommitAssignments` | `reg` (`r31`, `f1`, `v2`), coalesced chains resolved |
| `coalesce` | `SpillCode_CoalesceCopies` | `a` (kept), `b` (merged), `reason:"copy"`; `pass` is the allocation pass about to start |
| `inline` | `inline_expression`, `inline_statement` | `site` (`path:line` of the statement), `site_file`, `site_line` (all null for compiler-generated code with no position), `callee`, `pass_index`, `stmt_count`, `verdict` (`inlined`/`called`), `reason`, `auto_inline` |
| `cse` | `IRO_CommonSubs` | `temp`, `expr`, `block`, `occurrence`, `def_index`, `use_index`, `line` |
| `overflow` | the trace module, when a function's lines are written | `what` (`line`, `origins`, `frame_slots`, `deferred_events`, `function_files`, `saved_locals`, `rebuilt_locals`), `dropped` (count, null when not countable): a trace table ran out of room and this function's capture lacks facts; treat it as incomplete |
| `frame`, `frame_slot` | `CodeGen.c` (slots and layout), `InterferenceGraph.c` (spill slots) | `frame`: `local_base`, `size`, `local_size`, `locals_cleared`; `frame_slot`: `offset` (from r1), `local_offset`, `size`, `align`, `owner`, `reserved`, `in_register` |

`pass` is the allocation pass per register class (0, then 1, 2… per spill retry), the inliner's pass for `inline`, and
the call of `IRO_CommonSubs` within the function for `cse`.

## Capabilities

A trace point exists in a version only when every source holding its hooks links from source there (upstream
`configure.py` links the rebuilt object only for sources Matching in that version) and the fixture shows its events:

| Point | Hook sources | 1.2.5 | 1.2.5n | 1.1p1 |
|---|---|---|---|---|
| vreg_identity | Coloring.c | yes | yes | (yes) |
| interference | Coloring.c, InterferenceGraph.c | yes | yes | (yes) |
| coloring | Coloring.c | yes | yes | (yes) |
| coalescing | InterferenceGraph.c | yes | yes | (yes) |
| inlining | CInline.c | yes | yes | (yes) |
| cse | IroCSE.c | yes | yes | (yes) |
| frame | CodeGen.c, InterferenceGraph.c | yes | yes | no (CodeGen.c is not Matching) |
| scheduling | Scheduler.c | milestone 2 | | |

Every point also needs `CInline.c` (it selects the traced function) and the trace module. 1.1p1's points are withheld
in `CAPABILITIES.json` because its byte-identity sweep fails (`VALIDATION.md`).

## Keeping codegen untouched

The hooks only read compiler state, behind `if (mwcc_trace_on)`, and write with the Win32 calls the compiler already
imports from static buffers (no heap allocation). Three things the validation found and the patches handle:

- **x87 precision.** `Coloring_SimplifyGraph` compares spill-cost ratios in x87 registers; a hook call that kept
  `best_cost` live forced it to memory, rounded it, and changed which node stalled (SMS `pakkun.o`). The stall hook
  recomputes the ratio from the node instead.
- **Hand-patched bytes under fixups (1.1p1, 1.2.5n).** These executables keep base relocations over bytes patched
  by hand that are not addresses. `tools/split.py` wrote them against the symbol holding them, so they changed when
  code before that unit grew; with `--traced` they stay literal.
- **COMMON layout.** The trace flag is an initialized global: an uninitialized one joined the linker's COMMON block,
  whose order the split units assume.

Static initializers (`__sinit_*`) and assembler functions are not traced (they do not pass the inliner).

## Tests

```sh
python3 -m pytest toolpacks/gamecube-decomp/compiler/mwcc_alloc/native/tests -q
```

The sample test needs the game checkouts, traced binaries (`MWCC_NATIVE_TRACED_ROOT`, default `/tmp/wcl-native/bin`)
and wibo; it skips otherwise. Run it on every patch change; run the full sweep (`validate/byte_identity.py` without
`--sample`, plus `--trace-all`) before provisioning a build.
