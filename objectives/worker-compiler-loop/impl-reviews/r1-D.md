Native compiler:

1. [BLOCKING] **Unvalidated builds gain capabilities** — `native/tools/capabilities.py:71`. Default `build.sh` supplies no sweep reports, enabling six points for known-miscompiling 1.1p1. Require passing, hash-bound byte-identity evidence before enabling points; keep 1.1p1 disabled.

2. [BLOCKING] **Trace naming mutates compiler allocation state** — `native/patches/0001-trace-module-and-traced-link.patch:386`. `trace_final_name` resets the compiler’s mangler buffer and calls `mangle_function_name`. Long names can resize its compiler-owned handle, introducing allocation from tracing. Use trace-owned storage or defer until the real link name exists.

Python and tool contracts:

1. [BLOCKING] **Physical coalescing changes disappear** — `api/decisions.py:325`. Coalescing a named web into r3 versus r4 returns `changes=[]`: physical parents are absent from the identity maps, and register comparison skips coalesced nodes. Resolve physical parent identities explicitly; add an r3→r4 regression.

2. [BLOCKING] **Unknown comparisons become “no difference”** — `api/decisions.py:302`. Equal counts of unidentified webs suppress comparisons. An unidentified web changing r3→r4 returns “No traced decision differs.” Report unresolved comparisons as ambiguous; test equal-count register and spill changes.

3. [BLOCKING] **The saved full report loses changes** — `api/decisions.py:491`. Changes are truncated to 300 before `compare_sources.py` saves `decision-diff.json`. A 302-change comparison permanently loses two details despite promising them in the full report. Persist every change; truncate only worker output.

4. [BLOCKING] **CSE uses are reported as new temporaries** — `api/decisions.py:428`. Two replacement events referencing the same temp are counted as two temps. Adding another use therefore falsely reports a temp birth. Count distinct temp identities within each capture; report replacement occurrences separately.

5. [BLOCKING] **Extab cleanup escapes the deadline** — `toolpacks/gamecube-decomp/_impl/gamecube/tools/stack_check.py:527`. After the bounded compiler finishes, `_run_extab_clean` runs without timeout or output caps. A stalled DTK process can exceed capture deadlines indefinitely. Pass the remaining deadline and caps through cleanup in both compile paths; test a stalled cleaner.

`native/` and `api/` paths above are under `toolpacks/gamecube-decomp/compiler/mwcc_alloc/`.

Validation: wrapper tests 22/22; focused Python tests 17/17; server typecheck passes. Temporary-file tests were blocked by the read-only sandbox.

7 blocking findings.

