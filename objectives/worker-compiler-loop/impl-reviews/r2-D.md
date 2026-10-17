Round-1 verification:

| Prior finding | Status | Why |
|---|---|---|
| Unvalidated capabilities | RESOLVED | Hash-bound event evidence and full sweeps gate capabilities; 1.1p1 remains disabled. |
| Mangler state mutation | RESOLVED | Naming reads existing link names; deferred events use trace-owned buffers. |
| Physical coalescing changes | RESOLVED | Physical parents resolve explicitly; r3→r4 regression covers it. |
| Unidentified comparisons | RESOLVED | Register/spill/degree differences are reported as ambiguous. |
| Full-report truncation | RESOLVED | Full JSON is saved before worker-output truncation. |
| CSE temporary counts | RESOLVED | Distinct temporaries and replacement uses are counted separately. |
| Extab cleanup deadline | RESOLVED | Both compile paths pass remaining deadlines and output caps. |

New frame findings:

1. [BLOCKING] **Discarded slots become reported frame slots** — `toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/decisions.py:112`. The adapter drops `reserved` and frame-layout metadata while retaining `reserved:false` slots. Real SMS samples therefore report discarded slots as actual frame slots. Changing only reservation status reproduces “No traced decision differs.” Preserve reservation/layout metadata, distinguish discarded slots, and compare reservation changes.

2. [BLOCKING] **Duplicate frame owners lose changes** — `toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/decisions.py:501`. `setdefault` retains only the first slot named `x`. Two scoped locals at offsets 8 and 12 compare unchanged when the second moves to 16. Reproduced in memory. Retain every slot; match by declaration identity or report duplicate-owner changes as ambiguous.

3. [BLOCKING] **Trace capacity silently drops facts** — `toolpacks/gamecube-decomp/compiler/mwcc_alloc/native/patches/0001-trace-module-and-traced-link.patch:1193`. Slots after 1,024 disappear without an incomplete-trace marker. Changing slot 1,025 can yield no frame delta while `frame` remains advertised. Deferred C++ event buffers similarly discard events when full. Emit an overflow marker and reject affected captures as unavailable; add overflow regressions.

Other findings:

1. [BLOCKING] **PCH cache misses newly shadowing headers** — `toolpacks/gamecube-decomp/_impl/gamecube/tools/ninja_compile.py:723`. Cache validation hashes only previously read dependencies. After warming against `libs/JSystem/include/JSystem/J3DJoint.hpp`, adding `include/JSystem/J3DJoint.hpp` leaves those hashes unchanged, so both stock and traced compiles reuse the obsolete PCH. The comparison can falsely report no change. Invalidate on include-resolution changes or rebuild per capture root; test a newly added higher-priority header.

2. [BLOCKING] **Replay accepts incorrect spills** — `toolpacks/gamecube-decomp/compiler/mwcc_alloc/api/native_trace.py:363`. `validate_colors` skips captured negative colors. A degree-zero v32 captured as spilled returns `ok:true, colors_checked:0` although replay assigns r0. Reproduced in memory. Compare every popped web’s color or spill outcome, including −1; add a mismatch regression.

3. [NON-BLOCKING] **Fast exits bypass watched-file caps** — `toolpacks/gamecube-decomp/_impl/gamecube/tools/bounded_run.py:97`. Successful `wait()` breaks before checking file sizes, allowing an oversized trace to report successful execution. `load_trace` subsequently enforces 64 MiB, containing the native-result impact. Check watched files after termination too.

Validation: wrapper tests 22/22; focused Python checks 30 passed; server typecheck passed. Frozen binary hashes match the sweep evidence. Temporary-file and compilation tests were blocked by the read-only sandbox.

6 blocking findings.