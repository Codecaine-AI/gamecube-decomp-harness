# Plan: worker cleanup, the real compiler in the loop, real code over score

Status: **final (v7) + Phase 6 (Ford, 2026-10-17: everything except LLM calls in sandboxes; rebuilt images; ready for ~200 parallel workers)**. Implementation started on `feat/worker-compiler-loop`; interfaces in `contract.md`. Both Codex reviewers reported no blocking findings in round 6. Nothing is implemented.
§8–§12 map the round-2 to round-6 findings to their answers.
Base: `origin/main` = `0c4137f9e`.
v1 and the round-1 findings: `reviews/plan-v1.md`, `reviews/r1-A.md`, `reviews/r1-B.md`. §7 maps every round-1 finding to its answer.

## 1. Goal

Workers stop guessing source spellings until a score goes up.
They work like a human with the compiler's source open:

1. Form one hypothesis about what the original source had: a construct, the evidence for it, and the instruction change it predicts.
2. Compile it and look at what MWCC decided for this candidate (registers, inlines, CSE temps, frame slots, instruction order), not only the score.
3. State what was measured, what that predicts for the target, and what would prove the hypothesis wrong.
4. Use that to name the *kind* of construct that would produce the target's code.
5. Find *which* real construct the original had, from evidence tied to this site (map, headers, certified siblings, other games' sources, strings, relocations, Ghidra cross-references).
6. Write it, remove every probe edit, and get the attempt validated (and, for SMS, certified by the steering gate).

A 100% score that the gate cannot certify ("100% but unverified") is not done.
The job then is to find the real source, never to keep a spelling that only satisfies the score or the frame.

Fixed decisions (Ford, 2026-10-17):

- **D1.** For SMS, attempt-budget extensions come from new certified progress, not from raw score gains.
- **D2.** The compiler delta for a steering probe is computed by a separate job after the gate, off the worker's validation path and budget. (v2 runs that job in a build sandbox rather than on the host, because the sandbox already has the exact MWCC build environment; see §3.4.1.)
- **D3.** The traced compiler is a new backend of `mwcc_alloc`, not a separate tool.

Scope note on Melee: Melee keeps its own done definition, stack-frame policy and acceptance rules (its steering gate is off, and its upstream accepts things SMS rejects, such as `PAD_STACK`). It shares the method section and the compiler tools. Changing Melee's acceptance rules is out of scope.

## 2. What main has today

| # | Finding | Where |
|---|---|---|
| F1 | The workflow teaches steering: the variant-family list ("declaration order, casts, scope, expression form, literal form, temporary naming"), technique 2, the FPR and scheduling techniques, and ablation's "a cue whose removal regresses the score is the mechanism; keep it". `<steering_policy>` calls these steering. | `prompt.ts:51`, `:336-345`; rendered prompt lines 108, 142, 147, 158, 187; `prompt.ts:100-113` |
| F2 | Score is the reward: "continue toward exact", "save your best-scoring source", "keep iterating while the evidence suggests a next move"; budget +2 per new score high with an exact-claim bypass; checkpoint selection needs a score improvement. | `prompt.ts:54`, `:341-343`; `worker-cycle.ts:980-988`; `worker-state.ts:795-802` |
| F3 | A certified repair that scores lower or equal is rejected before the gate runs (target regression / no change), so "find the real code" cannot win today. | `change-validation.ts:1002`, `:2099`; `steering-validation.ts:305` |
| F4 | "100% but unverified" is only in the packet; the packet's `real_only` is explicitly not a certified subset and `unexplained_edits` is capped at six; two labels in use. | `context.ts:413-477`; `previous-attempt.ts:109`; `prompt.ts:107`; `steering-validation.ts:63` |
| F5 | Rules repeated 2–7 times; "done" contradicts itself; the stop-nonmatching rule is only in the packet; allocator diagnostics are forbidden on residuals not classified register-only; Melee's stack technique prescribes `PAD_STACK`. | `prompt.ts:57`, `:89`, `:194-201`, `:521`; `context.ts:384` |
| F6 | Fixtures and preview do not show the live prompt; Melee text leaks into SMS; `MarNameRefGen` in generic code; the "available tools are injected" claim is false. | `prompt.ts:123`, `:182-183`; `kernel-preview.ts:281`; `runtime-options.ts:52` |
| F7 | Compiler tools: `mwcc_debug_*` live tools never run in sandboxes; `mwcc_alloc` capture is qemu+gdb (minutes, symbol-index selection, stock 1.2.5/1.2.5n only); `steering_check.py unused-test` is in the prompt but not a tool. | `worker-cycle.ts:1236`; `compiler/mwcc_alloc/` |
| F8 | Similar-structure search is half wired: SMS has a Ghidra export (377k xrefs, `function_shapes`, `patterns`) but workers have no graph tool. `real_code_evidence usage` treats any report fuzzy-match as "matched", including uncertified SMS functions. | `tools/profiles/defaults.ts:16-46`; `evidence_search.py:977-995` |
| F9 | Probe hypotheses come from a fixed shape table; S* lives only in memory; a function's verdict can use a per-function variant (`evidence_sstar`, `steering_sstar`) that differs from the global revert set. | `steering_diagnose.py:44-90`; `steering_check.py:1613-1625`, `:3091-3097`, `:3137-3145` |
| F10 | Bug: steering observations match probes by demangled `probe.function` against `fn.name`; for mangled C++ names the probe is never stored. | `steering-validation.ts:458` |

Backfill v4: 378 pass, 802 unverified, 163 steering left.

Proven 2026-10-16: rayanht/mwcc GC_1_2_5n rebuilds byte-identical; a traced `Coloring.c` relinks (stock SHA check fails by design), runs under wibo, and compiles Melee `ftcommon.c` byte-identically while recording 1,737 allocator decisions. Patch: `/Users/Ford/Archives/gamecube-decomp-harness/rmwcc-coloring-trace-20261016.patch`.

## 3. Work

Implementation runs in parallel by file ownership. **Activation is ordered** (§5): nothing a prompt mentions is switched on before the tool exists in a provisioned sandbox.

### 3.0 Phase 0 — fixes and schema (Opus, half a day)

- Fix F10: match unit and `probe.symbol === fn.name || probe.function === fn.name`; test with a mangled SMS symbol.
- Game registry: add parser and type support for `matching.budgetExtension: "score" | "certified"` (default `"score"`; SMS sets `"certified"`) and `ordering.registries: string[]` (default empty). Unknown keys stay rejected (`game-registry/resolver.ts:459-467`).
- `real_code_evidence usage` and the probe's `prefetch_evidence` adapter (`steering_diagnose.py:295-296`, which today flattens results to `function (match%)`): report each sibling's certification status (gate pass / unverified / ungated) and its revision; "matched" means 100% *and* not unverified. Uncertified siblings are listed separately as hypotheses. A test checks that a mixed certified/unverified result keeps the distinction after the probe's `fit()` size cap.

### 3.1 Phase 1 — certification lane and incentives (Opus, about 1 day)

This is what makes "real code over score" reachable in code, not only in words.

- **Repair validation.** For a target whose verification state is open (unverified match, or a `steering_located` result on its latest attempt), an attempt that does not raise the target score is not rejected for that reason alone. It still must pass every other check: build, hard gates, micro-gates, review lint, no regression of any *other* function in the unit. The steering gate then runs, against the trusted base for unverified targets (as today). Only a certified result is accepted on this lane; anything else is rejected as before.
- **Restoration.** If removing the unexplained edits restores the recorded trusted base for the target (the target file and every compile input match `trusted_base_rev`), the gate has no edit group to certify (`steering-validation.ts:102-122`). The runner then accepts a revision-bound base-identity proof instead: it clears the unverified state, records the restoration, and leaves the function an ordinary open target at the base score. No exact completion and no budget grant come from a restoration.
- **Evidence-review constructs.** A behaviour-identical construct the original really had (for example a map-backed weak inline) is certified by the gate only through its curated approvals (`steering_check.py:1070-1107`). When a worker submits one with cited site evidence and the gate rejects it as `evidence_review`, the attempt is rejected as today, and the runner persists a deduplicated human-review request (new; nothing consumes `evidence_review` today). The request holds target, base revision, edit-group identity, the construct's patch, and the cited site evidence; it is keyed by target + construct so resubmissions do not duplicate it. The dashboard lists open requests; an operator approves or rejects with a note. **Approvals become site-bound:** the approval schema and both lookup paths (`steering_check.py:1279` `_find_approval`, and the reducer check at `:1098-1108`) require game, unit, exact mangled target, trusted base revision, the reviewed site (file and line range) and a normalized digest of the approved edit group (operands included). Today's lookup matches only callee and enclosing function, so an approval at site A would also certify the same callee at an unsupported site B. Changed operands, placement or any accompanying edit need a new review. Existing legacy approvals are migrated to the new schema by hand or retired. Approval does not accept anything by itself: the target goes back on the board and a fresh attempt must pass the gate. While a request is open, the target's packet shows it and the worker treats that lead as pending. Workers still cannot add approvals. Tests: one rejected construct produces exactly one request; approval followed by exact resubmission certifies; with A approved, the same callee at site B, A with altered operands, and A plus a second swap are all rejected.
- **Certified baseline.** Per target, store the certified high-water mark: the best gate-certified score and its revision and certificate hash. Checkpoint selection for SMS prefers the best certified checkpoint over any higher uncertified one. Settlement uses the certified checkpoint.
- **Budget (D1).** With `budgetExtension: "certified"`, an attempt earns +2 only when it (a) raises the certified high-water mark, or (b) certifies a target that had no certificate (closing an unverified match). Grants are deduplicated by certificate hash and target revision, so resubmitting or reshuffling the same code earns nothing. The exact-claim bypass (`worker-cycle.ts:984-988`) does not apply. Melee keeps `"score"` and today's behaviour; a test pins it.
- **Exact claims.** `claimedExact` is passed on every validation (`worker-cycle.ts:2884`), so the fix is narrow: an exact claim gives no acceptance or budget bypass when the game's gate is enforced. Independently measured, selectable, certified progress on a nonexact target stays eligible.
- Tests: unverified 100 → certified 95 → certified 96 is accepted, settles on 96 and grants twice; the same certificate twice grants once; an uncertified 100 never grants; Melee score budgeting is unchanged.

### 3.2 Phase 2 — worker prompt (Opus, about 1 day)

- **Replace** the variant-family list, technique 2, the FPR and scheduling techniques, technique 8 and both `FRAME_TEXT.inlineBoundary` entries (`prompt.ts:60`, `:76`, `:448`), the "freeze matching regions / revert regressing incremental edits" directives (`prompt.ts:332-333`; replacement: "Matching instructions and score do not certify edits. When resolving unverified work, remove unsupported edits and keep evidence-backed repairs even when the target score falls. Unrelated-function regression checks still apply."), the "permuter iterations in the hundreds" guidance (`prompt.ts:458`; replaced by the allowance rule in §4), and (inline boundary replacement: "A persistent live-range cluster suggests candidate causes; it does not identify an original helper. Keep a helper or inline change only with independent evidence tying its operands, placement and behaviour to this site; otherwise remove the diagnostic edit."), the ablation rule, "continue toward exact", "best-scoring", "keep iterating while the evidence suggests a next move", and the "register-only before allocator diagnostics" rule with the §4 sections. §4 is the reviewed text; implementation keeps its meaning and may only shorten it.
- **Stack.** SMS keeps its frame prohibitions (`prompt.ts:89`) verbatim in `<stack_frame_policy>`. Melee keeps its stack technique but reworded so `PAD_STACK` is the last resort after slot owners, lifetimes and inline boundaries are diagnosed (its current meaning, stated once).
- **Deduplicate** the repeated rules (each gets one home). Target: ~180 lines for live SMS (from ~288), ~160 for Melee.
- **Leaks and fixtures.** Per-game prompt id and title; base-ref name instead of "master"; `MarNameRefGen` from `ordering.registries`; remove the "available tools are injected" claim. Fixtures for the variants that run (`melee-off`, `melee-shadow`, `sms-live`); delete or re-render the misleading `sms-system-enforce.txt`. Preview advisory default = runtime default; preview hydrates sample `steering_probe` (with and without `compiler_delta`) and `previous_attempt unverified_match`. Keep `kernel-preview.ts`, `kernel-catalog.ts` and the agents page aligned (AGENTS.md) with their Bun tests.
- **Tools in the prompt** match the registered list exactly; a test fails if the prompt names a tool the worker does not have.
- **Unverified packet delivery.** The `previous_attempt variant="unverified_match"` block gains `trusted_base_rev`, the target's source path, `total_edits` and `omitted_edits` counts, and `full_report_locator` (a path the worker can read in its sandbox). Provisioning copies the full gate report for the target into the sandbox and makes the trusted-base source readable (`git show <trusted_base_rev>:<path>` works in the sandbox checkout, or the file is materialised next to the report). Code refs: `previous-attempt.ts:356-388`, `context.ts:416-477`.
- **Per-game tags.** Every `[SMS]` line in §4 renders only when the game's steering gate is enforced; every `[Melee]` line only when it is off. Untagged lines are game-neutral and must be true for both; a fixture test renders both games and a reviewer checklist confirms no untagged rule contradicts Melee's `match_frame` policy or its `PAD_STACK` exception.

### 3.3 Phase 3 — the real compiler as a worker tool (Opus, about 3–4 days)

**3.3.1 Build.** At `toolpacks/gamecube-decomp/compiler/mwcc_alloc/native/`:

- `PIN.json`: rayanht/mwcc commit (`92f893f`) and the stock SHA-1s.
- `patches/*.patch`: the trace patch set.
- `build.sh`: clone at the pin, apply patches, build GC_1_1p1, GC_1_2_5 and GC_1_2_5n (all three are split versions, so the hybrid link works). A dedicated `traced` link target writes `build/<ver>/traced-ok` and does **not** run the stock SHA check; the stock reconstruction is built and checked separately first, so a broken upstream build is caught. Needs `unshield` built from source (`USE_OUR_OWN_MD5=ON`).
- **No binaries in git.** The repo holds pins, patches and the script. Built binaries go to `games/<id>/runtime/tool-data/mwcc_native/<ver>/` (untracked) and are baked into the sandbox image bundle at `build/compilers-traced/GC/<ver>/mwcceppc.exe` (the image already carries the stock compilers the same way). Never pushed upstream or published.

**3.3.2 Trace points.** Off unless `MWCC_TRACE_OUT=<path>`; filtered by `MWCC_TRACE_FUNC` (mangled or plain). JSON lines to the file, never stderr (the object cache replays stderr). Every record carries the pass and register class.

| Decision | Source | Recorded |
|---|---|---|
| vreg identity | `CodeGen.c` | vreg → object name, declaration site (file:line), kind (arg, local, `@NNN` temp with its creating pass and expression), web index |
| interference | `InterferenceGraph.c` | node, degree, neighbours, coalesced flag, spill cost, per allocation pass |
| colouring | `Coloring.c` | push order with sweep index, stall picks with cost/degree, pop order, colour, commit to physical register |
| coalescing | `InterferenceGraph.c`, `Registers.c` | merged pairs |
| inlining | `CInline.c` | per call site and pass: statement count, verdict, reason |
| CSE | `IroCSE.c` | temp birth: expression, block, occurrence |
| frame | `StackFrameEABI.c` | slot offset → owner object or temp, size, alignment |
| scheduling | `Scheduler.c` | per block: ready list and pick per cycle (second milestone) |

**Per-version capabilities.** The hybrid link takes a rebuilt object only for sources marked matching in that version (`/tmp/rmwcc/mwcc/configure.py:149`); a patch in a nonmatching source never reaches the executable. So each trace point is available only where its source file links from source:

| Version | Used by | Not from source | Trace points unavailable |
|---|---|---|---|
| GC_1_2_5 | most of SMS | none | none |
| GC_1_2_5n | Melee, 4 SMS DSP units | `StackFrameEABI.c`, `CObjC.c` | frame |
| GC_1_1p1 | one SMS group | `CodeGen.c`, `Scheduler.c`, `StackFrameEABI.c`, `CObjC.c` | vreg identity, scheduling, frame |

`native/CAPABILITIES.json` records this per version, generated from the upstream configs at build time. Tools and the prompt read it: an unavailable trace point is reported as unavailable, never as empty. Linking rebuilt nonmatching objects is out of scope (they are not the shipped compiler).

**3.3.3 Safety gate.** Two checks, both required before a version is provisioned:

1. **Byte identity.** Every unit of SMS (per its version) and Melee compiles to a byte-identical object with the traced compiler, tracing off and tracing on for one function per unit.
2. **Event presence.** For each trace point the capability file claims, a fixture function produces the expected events (e.g. a known local appears in vreg identity with its declaration line; a known frame slot has its owner). A claimed point with no events fails the build.

A small fixed sample runs as a test on every patch change; the full sweep is a script; results in `native/VALIDATION.md`.

**3.3.4 Tool surface (D3).** Existing `pair` (two allocator stages of one compile, the default) is unchanged.

- New `--backend auto|native|qemu`, default `auto`: the backend is chosen per requested operation and the version's capabilities. In milestone 1 the existing `pcode`, `pair` and `trace` captures keep using qemu (they need PCode artifacts, `api/snapshot.py:36`, `sandbox/mwcc_alloc_capture.py:673-677`); native serves the new `coloring-native`, `decisions` and `compare-sources` operations. Every result states the backend actually used. A regression test pins the default `pair` artifact contract.
- New operation `compare-sources` returning `mwcc-decision-diff-v1`. Inputs: the unit, the function, and two **overlay manifests** (`{logical path → content | deleted}` relative to the repo, covering any `.c/.cpp/.h` under `src/`, `include/`, `libs/`). Each variant compiles in its own shadow root via `stack_check.make_shadow_root` and `compile_in` (`stack_check.py:377`, `:400`), preserving logical source paths and quote-include resolution (short paths for wibo). Tests: a header-inline-only change, a TU-only change, and a mixed change. Workers usually pass "my working tree" vs "the trusted base" or "with/without this edit"; the tool builds the manifests from git for those cases.
- Function selected by name.
- Provenance records both the traced executable hash and the stock compiler identity it reproduces; stock-hash validators keep checking stock identity.
- **Analyze modes, milestone 1:** native provides the coloring snapshot (`mwcc-coloring-snapshot-v1`), coloring compare, `mwcc-decisions-v1` (vreg identity, inlining, CSE, frame) and `compare-sources`. `provenance`, `origins` (consumes provenance, `api/analyze.py:208-215`), `explain`, `source-rank`, `inverse` and `stack` need PCode blocks, operands and def/use links (`allocator_provenance.py:674`, `explain_register.py:121`), which milestone 1 does not trace; those modes run on the qemu backend and the tool says so. **Milestone 2** adds a PCode/operand/def-use trace point and adapters; a mode moves to native only when a test shows identical results to qemu on the same functions.
- `coloring_model.py` replay must reproduce native captures across all classes and spill passes; a mismatch fails the test suite.
- Worker wrapper schema, argument mapping, metadata and guidance updated together (`tools/wrappers/capabilities.ts`, `wrappers/mwcc-alloc.ts`). `mwcc_alloc` added to `toolpack.json`.
- Resource limits: both compile paths (`ninja_compile.py` and `stack_check.compile_in`) gain a compiler-path override, extra env, a deadline with process cleanup, and an output size cap. `MWCC_CACHE_DISABLE=1` for traced runs, with a test that capture works on a warm cache. Benchmarked on the SMS 1-core 2 GiB profile before any latency claim.

**3.3.5 Decision diff.** Values are matched across the two captures by function, pass, class, declaration site and temp origin, never by raw vreg number (an early new local renumbers every later vreg). Ambiguous matches are reported as ambiguous. Output: per change, one line in compiler terms plus the raw IDs; size-capped, full JSON kept on disk. Test: inserting an early local yields "one new node", not a cascade of register changes.

**3.3.6 Other worker tools.**

- Remove the five dead `mwcc_debug_*` live tools; keep `mwcc_debug_lookup` only if its notes still help (checked during cleanup).
- Expose `steering_check.py unused-test` as `unused_stub_test` (SMS).
- Add read-only `graph_related_functions` and `code_graph_file_card` for games with a Ghidra export.

### 3.4 Phase 4 — compiler knowledge and the steering probe (Opus, 2–3 days, after Phase 3's tool exists)

**3.4.1 Compiler delta job (D2).**

- The gate's `mwcc` step persists, per function: the S* variant its verdict used (global, `evidence_sstar` or `steering_sstar`), the effective revert IDs, the edits hash and base revision, and the **fidelity record**: candidate and selected-S* object hashes, the exact compile command (flags, `mw_version`, wrappers), the stock compiler hash, and hashes of every dependency the compile read. `stack_check.compile_in` (`stack_check.py:400-412`) is changed to emit a fresh depfile for each candidate and selected-S* compile; the inputs it lists (generated includes included) are hashed before shadow-root reuse or cleanup. Checkout depfiles and `.ninja_deps` are never reused.
- When an observation is recorded for a non-pass function, a `steering-explain` job is queued with the exact observation ID. It runs in a build sandbox (the configured `build_profile`) at the observation's base revision, materialises base + candidate from `edits.json`, reconstructs that function's exact S* variant as overlay manifests, verifies every dependency hash, rebuilds candidate and S* with the stock compiler, and requires both object hashes to equal the recorded ones. Any mismatch or missing input publishes `compiler_delta: {unavailable: "reconstruction: <reason>"}`, never a delta. Only then does it run `compare-sources` with the traced compiler, and it requires each traced object to equal its verified stock object (same extab normalization); otherwise it publishes `unavailable: "traced-object-mismatch"`. The worker-facing `compare-sources` makes the same check against stock compiles of both variants and reports a mismatch instead of a diff.
- It writes `compiler_delta` into that observation's probe, idempotently (keyed by observation ID + input hashes + tool hash), with bounded retries. Units whose compiler version has no validated traced build get `compiler_delta: {unavailable: "<reason>"}`.
- The worker path and its 480 s gate budget are untouched. A probe read before the job finishes simply has no delta.

**3.4.2 Hypotheses from measurement.** `build_probe` lists measured changes first ("+1 node: coalesced neighbour of `this`; `this` degree 28→29; coloured first; r28→r31"), then *candidate construct kinds* for each (seeded from SMS's tips: degree limit, web split, CSE birth, inline pass, bound-argument order), clearly labelled as candidates, then the shape-table hypotheses as fallback. `fit()` keeps the measured summary within the 3 KB cap and drops details first.

**3.4.3 Unverified sweep.** First an inventory of the 802: per function, whether a distinct S* exists, is identical to the candidate, or is unavailable. Then the delta job on the distinct ones; extra ablations (beyond the gate's own variants) are labelled as ablations. An unavailable comparison is never shown as an empty delta. The board ranks targets whose delta is a single measured change first.

**3.4.4 Compiler knowledge.**

- Ingest SMS's `docs/AGENT_MATCHING_TIPS.md` (`doldecomp/sms@4641b450`) into SMS standards and knowledge, each fact with its citation; adopt their Evidence and Fakematch rules where ours are weaker.
- Ship the pinned rayanht/mwcc source (about 10 MB) with the toolpack sync, verified by commit hash, and place it at `../mwcc` relative to the checkout in SMS and Melee sandboxes (repaired on resume).
- Add a `compiler` command to `real_code_evidence` (existing command enum): grep the pinned compiler source, file:line results.

### 3.6 Phase 6 — sandbox-first and scale readiness (Ford, 2026-10-17)

Principle: every non-LLM computation of a worker attempt runs in the worker's sandbox. The host keeps orchestration, the state databases, LLM calls and cheap index/knowledge reads.

- **Image.** Add to `sandbox-image/Dockerfile`: pinned clang 21.1.8 (PowerPC target, `llvm-cxxfilt`) for the IR oracle with `ORCH_IR_ORACLE_CLANG=/usr/bin/clang-21` (clang 18 changed 3 of 137 verdicts against the host); m2c; a build stage that clones rayanht/mwcc at the pin, applies `native/patches`, builds GC_1_1p1/1_2_5/1_2_5n traced compilers into `build/compilers-traced/GC/<ver>/` and writes `CAPABILITIES.json` (binaries never touch git); the pinned compiler source at `/opt/mwcc` with `../mwcc` linked next to the checkout; TP/TWW JSystem refs at `/opt/refs/jsystem`; the toolpack baked with its `.ready` stamp.
- **Steering gate.** `reduce` and `decide` run in the worker sandbox (clang from the image, sandbox-local cache, approvals and lessons uploaded with the reduce input). The host-side split stays available behind a flag for backfill.
- **QA lint.** `scan_diff.py` runs in the worker sandbox instead of an ephemeral 4-core build sandbox per attempt.
- **Tools.** `real_code_evidence` and `m2c_decompile` are sandbox-routed.
- **Provisioning.** Thin git bundle (`^snapshot_baked_rev`); toolpack sync skipped when the baked stamp matches.
- **Snapshots.** A script automates bundle → Dockerfile ARG pinning → `daytona snapshot create` per profile → `sandbox.json` update, and refreshes the stale context Dockerfiles.
- **Scale readiness (no LLM run here).** A sandbox-side load test at 200 concurrency without LLM calls: provision, build, gate (`edits/reduce/mwcc/decide`), native capture, `compare-sources`, QA lint; measure Daytona API limits, sqlite contention, host memory per worker child (today 450–700 MB, about 90–140 GB at 200) and integration-queue throughput. Report limits found and fixes; the go/no-go for a 200-worker run is that report.

### 3.5 Phase 5 — measure (about 1 epoch)

Baseline: the last SMS epoch before activation. Metrics on the unverified frontier and on fresh targets: certified passes per 100 attempts; `steering_located` rate; attempts per certified pass; share of attempts that stop with recorded findings; Codex audit of 20 random certified passes for real-code quality; a Melee epoch checks no regression. Acceptance: certified-pass rate up, `steering_located` down, Melee unchanged or better.

## 4. Prompt text (reviewed wording; `[SMS]`/`[Melee]` lines render per game)

```
<goal>
Recover the source code the original developers wrote for the target
function. Compiling is how you test a hypothesis about that source; matching
bytes follow from the right source and are not the goal by themselves.
[SMS] A match counts only when the steering gate certifies it.
</goal>

<definition_of_done>
Done: the runner confirms the target matches strictly (instructions,
relocations and data), every review gate passes, and your edits regress no
other function.
[SMS] Also: the steering gate certifies the attempt against the trusted base.
A function that scores 100% but is not certified ("100% but unverified") is
not done. Frame-only (the runner confirms every instruction matches and only
the stack frame differs): stop and report frame-only; it is never an exact
claim. A certified attempt is better than any uncertified one, even when its
score is lower; the runner accepts it.
[Melee] Frame-only is not done: continue with the stack-frame policy above.

Stop with the function not done, and record your findings, when:
- three distinct hypotheses (see method) have been tested against the same
  residual and none is supported, or
- your diagnostic allowance (see method) is spent, or
- the only edits that close the residual are probes [Melee] that Melee's
  standards do not accept, or
- the fix needs a file outside your write set and widening is refused.
</definition_of_done>

<method>
Work in this loop.

1. Classify the residual from checkdiff: control flow, call order, loads and
   stores, instruction selection, registers, frame, relocations or data.
   Work in that order; registers and frame often follow from earlier fixes.

2. Form one hypothesis. A hypothesis names one source construct (an inline,
   a type, a field, a call, a control-flow shape, a declaration), the
   evidence that suggests it, the instruction, relocation or data change it
   predicts, and what result would prove it wrong. Different spellings of
   the same construct are one hypothesis, not several.

3. Test it and measure. Build and diff. Then look at what the compiler did,
   using the tool for the residual class:
   - registers, inlines, CSE temps, frame slots: mwcc_alloc_snapshot with
     backend native (one capture), or compare-sources (what an edit changed
     inside the compiler);
   - instruction order and control flow: the diff, the assembly and its
     dependencies (and the scheduler trace where available);
   - types, signedness, offsets, struct layout: type_layout_lookup,
     type_oracle_lookup;
   - relocations and data: relocation and byte diffs from checkdiff.
   If a capture or trace point is unavailable for this unit's compiler
   version, say so and continue with the other tools.

4. Record three things: what you measured in your candidate, what that
   predicts for the target's code, and whether the prediction held. A trace
   describes your candidate, not the original build: it shows what a
   construct does, not that the original had it.

5. Name the construct kinds consistent with the measurement. Example: "The
   candidate's second field read became a CSE temp. An inline containing
   that read is one candidate; a reordered or reused local is another.
   Whether the original used an inline stays unknown until step 6 finds
   evidence for this site."

6. Find which construct the original had. Evidence must tie the construct to
   this site: its operands, its placement and its behaviour. In order of
   strength:
   - the link map: real_code_evidence map-calls, map-unit (what this
     function calls, which inlines this unit emitted);
   - strings and relocations in the target object;
   - header inlines used at the same kind of site by accepted matching
     functions (real_code_evidence inlines, usage) [SMS] (accepted means
     gate-certified; an uncertified sibling is a hypothesis, not evidence);
   - other games' sources for shared code (real_code_evidence jsystem);
   - callers and references (graph_related_functions, code_graph_file_card).
   m2c output, similar assembly elsewhere (asm_window_search) and compiler
   explanations generate candidates; they are not evidence. That a helper
   exists does not show the original used it here.

7. Write the construct, remove every probe edit, and submit.

Probes. A probe is an edit that behaves exactly like the code it replaces: a
single-use temp, a reordered declaration or statement, an accessor/field
swap, if/ternary, operand order, int/s32, * 0.5f vs / 2.0f, a padding local.
Use probes, the permuter and ablation to find which value or statement
drives a difference, then go to steps 4-6. A compiler explanation alone never
justifies keeping a probe.
An original construct with site evidence (step 6), such as a map-backed
inline, is not a probe even if it behaves identically: submit it alone, in
its own statement, and cite the evidence in your record. [SMS] The gate
certifies such constructs only through site-bound evidence-review
approvals. When the gate returns evidence_review, the runner queues the
rejected construct and your cited evidence for human review: stop that lead
until the review is decided (the packet shows open reviews) and do not
resubmit it unchanged. Other rejection kinds do not queue a review; record
their reasons.
Approval of a construct never covers other edits next to it.
[SMS] Do not submit a probe. The steering gate reverts probes, so a
probe-based match is rejected. Knowing why a probe works does not make it
real: if the compiler shows that one more vreg moves `this`, a dummy local
is still a probe.
[Melee] Submit a probe only after your real-construct hypotheses failed and
only in a form Melee's standards accept (for the frame, the PAD_STACK rule
in the stack-frame policy); say in your record that it is a probe.

Diagnostic allowance. Per hypothesis: at most 6 build-or-capture runs and
at most 6 compiler-source reads or searches. Per attempt: at most three
hypotheses, and leave enough of the attempt to validate and submit. A
supported hypothesis continues only within these limits. A residual counts
as new only when its measured diff (instructions, relocations or data)
changed because of a non-probe edit; probes never reset the allowance.
A compare-sources call counts as one run. The permuter is a locator: at
most one permuter run per hypothesis, max_iters at most 200, counted as one
run; explain any hit (steps 4-6) before using it.

When you stop without done, record: the residual, what you measured, the
construct kinds it points to, the candidates you checked and why each
failed, and untried leads. That record is the next worker's starting point.

[SMS] previous_attempt variant="unverified_match": the code scores 100% but
is not certified. The block is a short summary, not a list of approved
code: nothing in the current source is certified, including edits it omits
(it gives total_edits and omitted_edits). Read full_report_locator and the
source at trusted_base_rev; if either is unavailable, record that and do
not treat omitted edits as approved. Compare the whole candidate against the
trusted base first (compare-sources). Attribute a compiler change to one
edit only after an isolated with/without comparison of that edit; report
edits that interact (through CSE or allocation) as interacting. Then find
the real construct for each (step 6) or remove the edit. Submit for fresh
certification; a lower score that certifies is accepted.

[SMS] steering_probe: the probe edits the gate found, the match without
them, and compiler_delta when available (what those edits changed inside
the compiler). Check that its function and revision match your target. If
compiler_delta is missing or stale, run compare-sources yourself when this
unit's compiler supports it. If it is marked unavailable, record the reason
and continue from the assembly and other evidence; do not retry a known
unsupported capture. Missing compiler data is not evidence that a construct is absent.
</method>

<compiler>
The compiler is decompiled (rayanht/mwcc). The pinned source is at ../mwcc;
search it with real_code_evidence, command compiler. Start at these entry
points and follow references your written hypothesis needs, within the
diagnostic allowance:
- registers: src/backend/Coloring.c, InterferenceGraph.c, Registers.c, CodeGen.c
- instruction selection: src/backend/InstrSelection.c, Peephole.c
- inlining: src/frontend/CInline.c
- loads, CSE, propagation: src/optimizer/IroCSE.c, IroPropagate.c
- instruction order: src/backend/Scheduler.c
- frame: src/backend/StackFrameEABI.c
Native trace points for this game's compiler versions: [rendered from
native/CAPABILITIES.json, e.g. "GC/1.2.5: all; GC/1.2.5n: no frame;
GC/1.1p1: no vreg identity, scheduling or frame"]. Measured facts for this
compiler are in the decomp standards.
</compiler>
```

## 5. Activation order

1. Phase 0 (fixes, schema) merged and live.
2. Phase 3 traced compilers built and validated (§3.3.3); image rebaked; `--backend native`, `compare-sources`, `unused_stub_test`, graph tools and the `compiler` evidence command verified by a real call from a provisioned SMS and Melee sandbox; an unverified SMS target's `full_report_locator` and trusted-base source read successfully from its sandbox.
3. Phase 1 certification lane plus Phase 2 prompt, together (the prompt promises the lane). Prompt render tests check every named tool is registered.
4. Phase 4 delta job and probe changes; then the unverified sweep.
5. Phase 5 epoch.

Codex review at each step boundary; prompt changes also get the adversarial "read it as a worker" review.

## 6. Review protocol

Two Codex reviewers (`gpt-6.1-sol`, reasoning `medium`, fast mode), read-only, in parallel: A on behaviour (§1, §3.1, §3.2, §4), B on technical feasibility (§3, §5). Each finding is blocking or not, with a concrete fix. Rounds repeat until both report no blocking findings.

## 7. Round-1 findings and answers

| Finding | Answer |
|---|---|
| A-1 budget replenishes on repeated certificates | §3.1 grants only on a raised certified high-water mark or a first certificate, deduplicated by certificate hash and revision |
| A-2 / B-1 lower-score certified repair rejected | §3.1 repair validation lane, certified baseline, certified checkpoint selection, tests |
| A-3 circular evidence (m2c, fuzzy siblings) | §4 step 6: candidates vs evidence; §3.0 usage reports certification |
| A-4 traces presented as the original run | §4 step 4: measured vs predicted vs held |
| A-5 hypothesis undefined, unbounded reading | §4 step 2 definition; diagnostics budget; new residual = diff changed; stop record |
| A-6 invented certified subset | §4 unverified paragraph |
| A-7 stack contradictions, Melee PAD_STACK | §3.2 stack: SMS prohibitions verbatim; Melee keeps its policy, reworded; probe rule gate-aware |
| A-8 method vs retained restrictions, no fallbacks | §4 step 3 per-class tools; register-only rule removed; type tools; per-version availability |
| A-9 done omits relocations, regressions, review | §4 definition_of_done |
| A-10 compiler_delta assumed present | §4 steering_probe paragraph |
| B-2 traced link fails SHA check | §3.3.1 dedicated traced link target |
| B-3 native vs analyze modes | §3.3.4: native supports compare/provenance/explain; others fall back until proven equal |
| B-4 `pair` API break | §3.3.4 `pair` unchanged; `--backend`, `compare-sources` |
| B-5 cross-capture identity | §3.3.5 matching by site and origin |
| B-6 1.1p1 | §3.3.1 builds 1.1p1; per-version availability; unsupported is reported |
| B-7 wrong S* from global reverts | §3.4.1 per-function variant persisted and verified |
| B-8 host lacks MWCC environment | §3.4.1 job runs in a build sandbox |
| B-9 probe dropped for mangled names | §3.0 fix F10; job keyed by observation ID, idempotent, retried |
| B-10 compiler source delivery, `--mode` | §3.4.4 shipped with toolpack sync, verified; `compiler` command |
| B-11 activation order, schema keys | §5; §3.0 parser support |
| B-12 sweep pairs may be identical | §3.4.3 inventory first |
| B-13 resource limits | §3.3.4 helper deadline, cleanup, cap, benchmark |
| B-14 binary distribution | §3.3.1 no binaries in git; untracked tool-data and image bake |

## 8. Round-2 findings and answers

| Finding | Answer |
|---|---|
| A2-1 shared text overrides Melee policy | §3.2 per-game tags and fixture check; §4 frame-only, probes and sibling evidence tagged per game; Melee keeps `PAD_STACK` last resort |
| A2-2 step 5 invents provenance from CSE | §4 step 5 rewritten: candidate kinds, original use unknown until step 6 |
| A2-3 hypothesis count does not bound diagnostics | §4 diagnostic allowance (6 runs per hypothesis, named files only), supported leads continue, stop list includes allowance |
| A2-4 report and trusted base not delivered | §3.2 unverified packet delivery fields and provisioning; §5 activation check |
| A2 non-blocking: relocation/data wording; exact-claim wording | §4 steps 2 and allowance; §3.1 exact claims |
| B2-1 native provenance lacks PCode | §3.3.4 milestone 1 excludes provenance/explain/source-rank/inverse/stack (qemu); milestone 2 adds PCode and def/use with equality tests |
| B2-2 hybrid link omits patches in nonmatching sources | §3.3.1 per-version capability matrix and `CAPABILITIES.json`; §3.3.3 event-presence checks |
| B2-3 two files cannot represent header-changing S* | §3.3.4 overlay manifests, shadow roots, header/TU/mixed tests |
| B2-4 class check does not prove fidelity | §3.4.1 fidelity record (object hashes, command, compiler, dependency hashes) and object-equality check before tracing |

## 9. Round-3 findings and answers

| Finding | Answer |
|---|---|
| A3-1 compiler reading unbounded | §4 allowance: 6 runs and 6 compiler reads per hypothesis, 3 hypotheses per attempt, probes never reset |
| A3-2 technique 8 and inlineBoundary keep helper-existence justification | §3.2 replaces them with site-evidence wording |
| A3-3 probe definition blocks approved constructs | §4 probes paragraph: evidence-backed constructs submitted alone; §3.1 evidence-review routing to human adjudication |
| A3-4 full removal cannot certify | §3.1 restoration: base-identity proof clears unverified, no credit |
| A3-5 compiler list too narrow | §4 entry points plus followed references; added Registers.c, InstrSelection.c, Peephole.c |
| B3-1 default capture vs milestone 1 | §3.3.4 `--backend auto` per operation; pcode/pair/trace stay qemu; regression test; `origins` added to qemu list |
| B3-2 depfile not produced by gate | §3.4.1 `stack_check.compile_in` emits fresh depfiles, hashed before cleanup |

## 10. Round-4 findings and answers

| Finding | Answer |
|---|---|
| A4-1 freeze/revert directives undo repairs | §3.2 replaces `prompt.ts:332-333` |
| A4-2 / B4-1 no human-review queue | §3.1 new durable review request: persisted, deduplicated, dashboard decision writes approvals, fresh gate validation, test; §4 worker wording |
| A4-3 permuter bypasses allowance | §4 every candidate compile counts; §3.2 replaces `prompt.ts:458` |
| B4-2 probe drops sibling certification | §3.0 includes `prefetch_evidence` and a `fit()` test |

## 11. Round-5 findings and answers

| Finding | Answer |
|---|---|
| A5-1 / B5-1 approval certifies other sites | §3.1 site-bound approvals (target, base, site, normalized edit digest) and tests for site B, altered operands, extra swap |
| A5-2 review promised for ineligible constructs | §4 only `evidence_review` queues a review |
| A5-3 whole-candidate comparison cannot attribute per edit | §4 whole first, then isolated with/without; interacting edits reported |
| B5-2 traced output not checked against stock | §3.4.1 traced-object equality in the delta job and in worker `compare-sources` |
| (own change) permuter allowance too strict to be useful | §4 one permuter run per hypothesis, max_iters ≤ 200, counts as one run, hit must be explained |

## 12. Round-6 findings and answers

Both reviewers: no blocking findings.

| Finding | Answer |
|---|---|
| A6-1 unavailable delta triggers a retry | §4 retry only when the unit's compiler supports it |
| B6-1 shadow-root helper misnamed; limits only on one path | §3.3.4 names `stack_check.make_shadow_root`/`compile_in`; limits on both paths |
