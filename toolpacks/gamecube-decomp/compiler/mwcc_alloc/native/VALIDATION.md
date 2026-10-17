# Validation of the traced compilers

Run 2026-10-17 on macOS (Apple M-series, wibo `1.2.0-2-ge8f4795` from the Melee checkout), pin
`92f893fbcbb23d9833be5fc24ac9e069090f8729`, patches as committed. `build.sh` rebuilt the same three executables
byte for byte from the patches.

| Version | Traced SHA-1 | Stock SHA-1 (reproduced first) |
|---|---|---|
| 1.2.5 | `792ba9aae1b415c8640da03c30edbf6755ef924d` | `03187e49c58ce9c1bcbfe3691bbd0fb92fbe7909` |
| 1.2.5n | `f0f4162a3e9f82a71c9cf77087fc9ab357c438fe` | `ef0480e9b4a42398bda3e412794c6628e26e1bf7` |
| 1.1p1 | `01f2524d44e37a3874dd95cda9ef2cb584d375fc` | `73dc1588d7fbbcfed019e16a2ce3968d10cc53a2` |

## Gate 1: byte identity (full sweeps)

`validate/byte_identity.py` compiles every MWCC unit of the checkout's `build.ninja` three times from the checkout
(outputs under `/tmp`): stock compiler, traced with tracing off, traced with tracing on. Raw compiler output is
compared (no `dtk extab clean`). "One function" traces the unit's first function; `--trace-all` traces every function
(`MWCC_TRACE_FUNC=*`), which runs every hook on every function.

| Checkout | Version | Units | Stock fails | Identical off | Identical on, one fn | Identical on, all fns |
|---|---|---|---|---|---|---|
| SMS (`games/sms/workspace/checkout`) | 1.2.5 | 627 | 5 | 622 / 622 | 622 / 622 | 622 / 622 |
| SMS | 1.2.5n | 88 | 0 | 88 / 88 | 88 / 88 | 88 / 88 |
| SMS | 1.1p1 | 20 | 0 | 19 / 20 | 19 / 20 | 19 / 20 |
| Melee (`games/melee/workspace/repository`) | 1.2.5 | 104 | 0 | 104 / 104 | 104 / 104 | 104 / 104 |
| Melee | 1.2.5n | 1005 | 0 | 1005 / 1005 | 1005 / 1005 | 1005 / 1005 |
| Melee | 1.1p1 | 20 | 0 | 19 / 20 | 19 / 20 | 19 / 20 |

- Wall time with 12 jobs: SMS 53–80 s, Melee 97–114 s (about 0.5–0.9 s per unit for three compiles).
- These are the frozen binaries (after the naming, path, site, declaration-line, review-D and overflow-record changes); the reports are in
  `/tmp/wcl-final6/{sms,melee,sms-all,melee-all}/byte_identity.json` (archived with the build in
  `~/Archives/gamecube-decomp-harness/mwcc-native-20261017/`), filed by `build.sh --byte-identity` as
  `validation/byte-identity/<game>/{one-function,all-functions}.json`; the sweeps ran on them before
  `CAPABILITIES.json` was written.
- The sweep builds SMS's precompiled header (`include/SMS.pch` -> `SMS.mch`) fresh with each compiler instead of
  reading the build tree's, which was stale (it caused the 42 stock failures earlier sweeps reported). The 5 units
  left fail with the stock compiler too, from source errors at the checkout's HEAD (`Map/Map`,
  `Map/BathWaterManager`, `MoveBG/MapObjMare`, `GC2D/Option`, `GC2D/MovieRumble`), and are left out of the counts;
  SMS's `worker-image.json` lists them among its stock exclusions. Melee has no PCH and is unchanged.
- The traced compiler's `SMS.mch` differs from the stock compiler's (it embeds heap addresses, which differ with the
  traced image's larger data sections), but a unit compiled with either PCH by either compiler gives the same object
  (checked on `Enemy/bosseel.o`, all four combinations). Traced compiles should still use a PCH built by the traced
  compiler, as the sweep and `stack_check` do.
- Units whose trace is empty: data-only units (no function), assembler functions and static initializers
  (`__sinit_*`), which do not pass the inliner that selects the traced function, and functions with no decisions to
  record (a function's lines, `function` included, are written only when it has events). With all functions traced,
  33 SMS 1.2.5, 1 SMS 1.2.5n and 8 Melee 1.2.5 units wrote nothing.

**1.1p1 fails**: MetroTRK `msgbuf.o` (SMS and Melee) differs with tracing off and on. In
`TRKAppendBuffer1_ui16`/`_ui32` the traced compiler gives the local `swapBuffer` the stack slot of the
address-taken argument `data` (`addi r4,r1,8` where the stock compiler has `addi r4,r1,12`): a miscompile. Any growth
of code that runs before code generation reproduces it, including a two-line edit in `CDecl.c` with no trace code, while
the patch to `InterferenceGraph.c` alone does not. 1.1p1 links the original binary's `CodeGen.c` and
`StackFrameEABI.c` (they do not match from source in that version), so the likeliest cause is an uninitialized read
in that original code whose value comes from stack contents the patched callers leave. It is not fixed;
`CAPABILITIES.json` lists no points for 1.1p1, `tests/test_byte_identity_sample.py` pins the failure (strict xfail),
and the 1.1p1 binary must not be provisioned. 1.1p1 serves 20 units in each game (MetroTRK and similar libraries).

Found and fixed during the sweeps (each failed the gate first):

| Symptom | Cause | Fix |
|---|---|---|
| 1.2.5 `pakkun.o`, `JUTException.o`, `ShadowUtil.o`, `MarDirectorPreEntry.o`: registers swapped with tracing off | the stall hook in `Coloring_SimplifyGraph` kept the x87 `best_cost` live across a call, so it was rounded to a double in memory and the allocator's cost comparisons changed | the hook recomputes the ratio from the node; `best_cost` is never passed |
| 1.1p1: SIGILL/SIGSEGV on most units, with tracing off | base relocations over hand-patched bytes (`CObjC.c`) were written against the holding function, so the bytes changed when code before it grew | `tools/split.py --traced` keeps such bytes literal |
| 1.1p1: crashes while the trace flag was a common symbol | it joined the linker's COMMON block, whose layout the split units assume | the flag is an initialized global |
| SMS C++ methods: allocator records labelled with the plain name (49 `execute` records merged in `bosseel.o`) | a C++ function gets its link name only when its code is emitted, after the hooks ran | a function's lines are held and written when it is done, under its link name (made like `CMangler_GetLinkName` when the compiler has not, without interning); plain-name candidates whose link name was not asked for are dropped |
| SMS C++ locals: `decl_line` off (bosseel.cpp `eel` declared at 2413, recorded 2427) | a function generated after its definition rebuilds its locals from the saved body, and a rebuilt local's token is wherever the parser was then | the trace keeps each saved local's token by saved body and position and gives it to the rebuilt local (null when not saved); arguments' `decl_file`/`decl_line` are null (`decl_site:"function_body"`, `body_file`, `body_line`) |
| (review) the trace ran the compiler's mangler and path helpers | `trace_final_name` reset and filled the mangler's buffer; `trace_file_path` went through `COS_FileGetPathName`, whose helpers fill the driver's static path buffers | names: read-only (the compiler's link name once it exists; a C++ function without it is parked by object and written when it comes back with one, dropped if it never does); paths: built in trace buffers from the directory registry (`build_name_and_backslash_path`, which writes only the buffers it is given) |
| Melee 1.2.5n, 5 units, one function traced: SIGBUS at exit (seen with `-MMD`) | the exit flush read the last traced function's object after the compiler had freed it | the name is cached while the function is live; the exit flush reads no compiler object |
| (review) trace tables dropped facts silently when full (frame slots after 1,024, parked C++ lines, ...) | fixed capacities | every table counts what it drops and the function's lines end with `{"ev":"overflow","what":...,"dropped":N}`; capacities raised; a truncated line ends at its last whole field (it could end mid-key); a function too large to hold no longer loses the line that overflowed it; `validate/overflow_check.py` runs a small-limit test build (`configure.py --trace-small-limits`) and requires a record for every table |
| SMS 1.2.5n `OSError.o`: crash with tracing on | the inline hook read `u.func.u` of an intrinsic (`__builtin_va_info`) as inline information | read only for functions the inliner can inline |

Reproduce:

```sh
V=toolpacks/gamecube-decomp/compiler/mwcc_alloc/native/validate
WIBO=games/melee/workspace/repository/build/tools/wibo   # SMS has none; /tmp/rmwcc's wibo 1.2.0 cannot run sjiswrap.exe
python3 $V/byte_identity.py --checkout games/sms/workspace/checkout --traced-root <out> --wibo $WIBO --out /tmp/bi-sms [--trace-all]
python3 $V/byte_identity.py --checkout games/melee/workspace/repository --traced-root <out> --out /tmp/bi-melee [--trace-all]
```

## Gate 2: event presence

`validate/event_presence.py` compiles `fixtures/trace_fixture.c` with every function traced and checks each point's
events at the marked lines; the fixture also compiles identically with tracing off, on, and with the stock compiler.

| Point | Check | 1.2.5 | 1.2.5n | 1.1p1 |
|---|---|---|---|---|
| vreg_identity | local `count` with its declaration line; argument `pair` | ok | ok | ok |
| interference | a node with neighbours | ok | ok | ok |
| coloring | push, color, commit to `rN`/`fN` | ok | ok | ok |
| coalescing | copy coalesce in `fixture_forward` | ok | ok | ok |
| inlining | `fixture_helper` inlined at its line; `fixture_extern` called | ok | ok | ok |
| cse | temp for `pair->a + pair->b`, its vreg origin `cse: …` | ok | ok | ok |
| frame | slot owned by `buf`, 16 bytes, reserved | ok | ok | missing (CodeGen.c not linked) |
| scheduling | (milestone 2) | missing | missing | missing |
| declaration lines | C: `count`, `copy`, `scaled` at their marked lines, argument `pair` with null line and its body site; C++: `total` in each `Counter::step` and `sum` in `fixture_deferred` (generated from its saved body) at their marked lines | ok | ok | ok |
| naming (C++ fixture) | `Counter::step(int)`, `Counter::step(int,int)`, `Other::step(int)` trace as `step__7CounterFi`, `step__7CounterFii`, `step__5OtherFi` (display `step`) under `*` and `step`; only the first under `step__7CounterFi`; `decl_file` is the fixture's path; objects identical to stock | ok | ok | ok |

## Gate 3: overflow records

`validate/overflow_check.py` (run by `build.sh`, report `validation/overflow-<ver>.json`): the test build with tiny
trace tables, tracing every function of both fixtures, wrote an overflow record for each of `line`, `origins`,
`frame_slots`, `deferred_events`, `function_files`, `saved_locals` and `rebuilt_locals`, compiled the same objects as
the traced build with tracing off, and gave every checked local a null or exact declaration line; the traced build
wrote no overflow record on the fixtures (nor on the published samples).

## Not validated here

- **Linux amd64.** `build.sh` is written for Debian bookworm as well (upstream picks the Linux wibo; unshield builds
  from source there: checked in a `debian:bookworm` container), but wibo cannot run in OrbStack's Rosetta amd64
  containers on Apple Silicon (`rosetta error: invalid gdt selector index 4`, also with the stock compiler), so the
  full Linux build and the sweeps under Linux wibo have not run. Build the sandbox image on a real amd64 host (or
  with QEMU emulation), then run the sample test there.
- **Latency on the sandbox profile.** Not benchmarked; a traced compile of Melee `ftcommon.c` takes about 0.2 s here,
  like the stock one. The 1-core 2 GiB profile benchmark belongs to the tool surface (plan §3.3.4).
