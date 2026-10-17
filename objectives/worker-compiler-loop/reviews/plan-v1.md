# Plan: worker cleanup, the real compiler in the loop, real code over score

Status: draft v1, for review. Nothing is implemented.
Base: `origin/main` = `0c4137f9e` (steering gate in `enforce` for SMS, "100% but unverified" state, gate sized to the sandbox profile).

## 1. Goal

Workers stop guessing source spellings until a score goes up.
They work like a human with the compiler's source open:

1. Make a hypothesis about what the original source had.
2. Compile it and read what MWCC actually decided (registers, inlines, CSE temps, frame slots, schedule), not only the score.
3. Explain the remaining difference as a compiler decision ("one extra vreg made `this` reach degree 29").
4. Turn that explanation into a *kind* of construct that would cause it ("one more coalesced neighbour of `this`, no new instruction").
5. Find *which* real construct the original had, from evidence: the map, header inlines, matched sibling functions, other games' sources, Ghidra cross-references, similar instruction windows elsewhere in the binary.
6. Write the real construct, remove every probe edit, and let the steering gate certify it.

A function that scores 100% is not done when the gate cannot certify it ("100% but unverified").
Then the job is to find the real source, never to keep a spelling that only satisfies the score or the frame.

Three user decisions are fixed (Ford, 2026-10-17):

- **D1.** For SMS, attempt-budget extensions come from certified progress, not from raw score gains.
- **D2.** The compiler delta for a steering probe is computed by a post-gate host job, off the validation critical path.
- **D3.** The traced compiler is a new capture backend of `mwcc_alloc` (`--capture native`), not a separate tool.

## 2. What main has today (findings this plan answers)

| # | Finding | Where |
|---|---|---|
| F1 | The workflow teaches steering: phase 4 lists "declaration order, casts, scope, expression form, literal form, temporary naming" as variant families; technique 2 says "split a value into two locals, reuse an existing temporary, rescope a local"; ablation says "a cue whose removal regresses the score is the mechanism; keep it". `<steering_policy>` calls exactly these steering. | rendered prompt lines 108, 142, 147, 158, 187; `prompt.ts:100-113` |
| F2 | Score is the reward: "continue toward 100%", "save your best-scoring source"; +2 attempts per score improvement; an over-claimed exact still counts as improved. | `worker-cycle.ts:821-825`; `change-validation.ts:966-974` |
| F3 | "100% but unverified" exists only in the packet; the system prompt's `previous_attempt` bullet covers only rollbacks; the goal line ("decompile to a 100% match") is already met for those targets; two labels ("100% unverified" vs "100% but unverified"). | `context.ts:413-477`; `prompt.ts:107`; `steering-validation.ts:63` |
| F4 | Ten rules are stated 2–7 times (frame-only = done 7×); "done" contradicts itself (full window match vs frame-only accepted); "leave it nonmatching" appears only in the packet. | rendered prompt; `context.ts:384`; `change-validation.ts:1261` |
| F5 | Fixtures and preview do not show the live prompt: `sms-system-enforce.txt` was rendered with steering and ordering off; live SMS is shadow advisory + `<steering_policy>` + `<order_and_scope>` (~288 lines); the preview defaults advisory to off while runtime defaults to shadow. Melee text leaks into SMS (`melee.worker.system`, "master"); SMS-only `MarNameRefGen` sits in generic code. The context contract promises injected "available tools" that are not injected. | `prompt.ts:182-183`, `:123`; `kernel-preview.ts:281`; `runtime-options.ts:52` |
| F6 | Compiler tools: `mwcc_debug_*` live tools never run (no sandbox has `mwcceppc_debug.exe`); `mwcc_alloc` works but steps the real compiler under qemu+gdb (minutes per trace, function picked by symbol index, 1.2.5/1.2.5n only); `steering_check.py unused-test` is named in the prompt but is not a tool. | `worker-cycle.ts:1236`; `compiler/mwcc_alloc/` |
| F7 | Similar-structure search is half-wired: SMS has a Ghidra export (377k xref rows, `function_shapes`, `patterns`) but workers have no graph tool (`code_graph_*`, `graph_related_functions` are only on reconcile/QA/librarian profiles). Workers do have `asm_window_search` and `m2c_decompile`. | `tools/profiles/defaults.ts:16-46`; `games/sms/runtime/tool-data/ghidra/indexes/` |
| F8 | The steering probe's hypotheses come from a fixed shape table (`SHAPE_HYPOTHESES`): it knows what an edit looks like, not what it changed in the compiler. S* lives only in memory during the gate. | `steering_diagnose.py:44-90`; `steering_check.py:1613-1625`, `:1400` |

Backfill v4: 378 pass, 802 unverified, 163 steering left.

Proven on 2026-10-16: rayanht/mwcc GC_1_2_5n rebuilds byte-identical (SHA-1 `ef0480e9…`); a `Coloring.c` patch with an allocator trace relinks, runs under wibo, and compiles Melee `ftcommon.c` to a byte-identical object while printing 1,737 allocator decisions. Patch saved at `/Users/Ford/Archives/gamecube-decomp-harness/rmwcc-coloring-trace-20261016.patch`.

## 3. Phases

Phases 1, 2 and 3 touch different files and run in parallel. Phase 4 needs 2. Phase 5 needs all.

### Phase 1 — worker prompt and loop (Opus, about 1 day)

**1.1 One method section replaces the steering-shaped workflow.**
Delete workflow phase 4's variant-family list, techniques that prescribe form edits (2, FPR, scheduling) and the ablation rule as written.
Replace them with `<method>` (draft text in §4). It is the same for both games; game-specific parts are only the done definition and the gate wording.

**1.2 One definition of done per game.**

- SMS (gate `enforce`): done = exact **and** the steering gate certifies the attempt. "100% but unverified" is not done. Frame-only (every instruction matches, only the frame differs) = stop and report frame-only; it is never banked as exact. A certified attempt that scores lower than an uncertified one is the better attempt.
- Melee (gate off): done stays "the full instruction window matches", and the method section still applies; it is how a worker gets there without steering. The stack-frame policy stays as configured per game.
- The system prompt itself says when to stop with the function nonmatching (§4), instead of only the packet.

**1.3 Incentives in code (D1).**

- SMS: an attempt earns +2 budget only for certified progress: a certified pass, a certified improvement, or a `previous_attempt` unexplained edit that the gate now attributes as real. A raw score gain without certification earns nothing.
- Melee keeps today's rule (its gate is off, so there is no certification signal yet). A config flag (`matching.budgetExtension: "score" | "certified"`) holds the per-game choice.
- An over-claimed exact no longer counts as "improved" when the gate is enforced (`change-validation.ts:966-969`).

**1.4 Words.** Remove "toward 100%", "best-scoring", "after any change that improves the score". The checkpoint field stays (the runner needs a score) but the prompt calls it "your last certified or best-explained source".

**1.5 Deduplicate.** Each of the ten repeated rules (F4) gets one home. Target: ~170 lines for live SMS (from ~288), ~150 for Melee.

**1.6 Unverified in the system prompt.** One bullet in `<method>` explains `previous_attempt variant="unverified_match"`: start from its `unexplained_edits`, explain each with the compiler and evidence, keep the real ones, remove the rest. One label everywhere: "100% but unverified".

**1.7 Leaks, fixtures, preview.**

- Per-game prompt id and title (`<game>.worker.system`); remove "master" (use the game's base ref name); move `MarNameRefGen` into `games/sms/game.json` (`ordering.registries`).
- Remove the "available tools are injected" claim, or inject the list; choose remove (tools are native).
- Regenerate fixtures for the variants that run: `melee-off`, `melee-shadow`, `sms-live` (shadow advisory + steering enforce + ordering enforce). Delete the misleading `sms-system-enforce.txt` or render it with the real live flags.
- Preview default advisory = runtime default (shadow); the preview hydrates sample `steering_probe` (with `compiler_delta`) and `previous_attempt unverified_match` blocks.
- Keep `kernel-preview.ts`, `kernel-catalog.ts` and `apps/frontend/src/pages/workspace/agents/index.tsx` aligned (AGENTS.md), with the nearby Bun tests.

**1.8 Tool list cleanup.**

- Remove the five dead `mwcc_debug_*` live tools from the worker profile once Phase 2 ships (keep `mwcc_debug_lookup` only if its cached notes are still useful; otherwise remove it too).
- Expose `steering_check.py unused-test` as a worker tool (`unused_stub_test`) or remove the prompt instruction; choose expose (the rule needs it).
- Add read-only `graph_related_functions` and `code_graph_file_card` to the worker profile for games that have a Ghidra export (F7), so "who calls this, what does it reference, which functions look like this" is one call.

**1.9 Guardrails against new failure modes** (in `<method>` and in code):

- *Compiler-guided steering is still steering.* Knowing that one more vreg flips `this` to r31 does not license adding a dummy local; the gate reverts it. The prompt says so with that exact example.
- *An explanation is not evidence.* A compiler explanation says what kind of construct is missing; only outside evidence (map, header, matched sibling, string, reference project, Ghidra xref) says which one. Without it, stop.
- *Bounded exploration.* At most 3 explained hypotheses per residual before the worker writes its findings and stops (prevents long compiler-reading detours). The findings ("needs one more coalesced neighbour of `this`; candidates checked: X, Y; none backed") are recorded in the attempt so the next worker or a human starts there.
- *The permuter is a locator only.* A permuter hit is a probe result to explain; it is never submitted as is (the gate would reject it anyway).
- *No compiler editing by workers.* Workers read the compiler source and traces; they never patch or rebuild the compiler.

### Phase 2 — the real compiler as a worker tool (Opus, about 3 days)

**2.1 Traced compiler build** at `toolpacks/gamecube-decomp/compiler/mwcc_alloc/native/`:

- `PIN.json`: rayanht/mwcc commit (`92f893f`) and the SHA-1s of the stock compilers.
- `patches/*.patch`: the trace patch set (§2.2), applied to a clean checkout.
- `build.sh`: clone at the pin, apply patches, build `GC_1_2_5` and `GC_1_2_5n` with the repo's own `configure.py`/`ninja`, copy the two traced `mwcceppc.exe` to `bin/GC_1_2_5/` and `bin/GC_1_2_5n/`. Needs `unshield` (build from source with `USE_OUR_OWN_MD5=ON`; Homebrew's openssl@4 fails on this machine).
- Built binaries are committed to the private harness repo only (they contain CodeWarrior runtime code; never publish them). `/tmp/rmwcc` can then be deleted.
- GC/1.1p1 (one SMS group) is a follow-up; rayanht supports it.

**2.2 Trace points**, all off unless `MWCC_TRACE_OUT=<path>` is set, filtered by `MWCC_TRACE_FUNC=<name or mangled name>`. Output is JSON lines written to the file (not stderr, because `mwcc_objcache` replays stderr on cache hits; the tool also sets `MWCC_CACHE_DISABLE=1`).

| Decision | Source | Recorded |
|---|---|---|
| vreg numbering | `CodeGen.c` (`allocate_local_vregs`) | vreg → object name or `@NNN` temp, kind (arg, local, temp, backend temp) |
| interference graph | `InterferenceGraph.c`, `Coloring.c` | per class: node, degree, neighbours, coalesced flag, spill cost |
| colouring | `Coloring.c` | push order (with the sweep index), stall picks with cost/degree, pop order, colour, commit to physical register |
| coalescing | `InterferenceGraph.c` / `Registers.c` | merged pairs and why |
| inlining | `CInline.c` | per call site and pass: statement count, verdict, reason |
| CSE | `IroCSE.c` | temp birth: expression, block, occurrence index |
| frame | `StackFrameEABI.c` | slot offset → owning object or temp, size, alignment |
| scheduling (later) | `Scheduler.c` | per block: ready list and pick per cycle |

**2.3 Safety gate.** Before any worker sees it: every unit of SMS (GC/1.2.5 and 1.2.5n units) and Melee compiles to a byte-identical object with the traced compiler, both with tracing off and with tracing on for one function per unit. Recorded in `native/VALIDATION.md`. Re-run on every patch change (a test that compiles a fixed sample, plus a script for the full sweep).

**2.4 `mwcc_alloc --capture native` (D3).**

- Reuses `ninja_compile.py` to take the unit's exact `build.ninja` command, substitutes the traced binary path, sets the env, runs under the same wibo runner as the gate.
- Emits the existing `mwcc-coloring-snapshot-v1` and `mwcc-allocator-snapshot-v1` schemas, plus a new `mwcc-decisions-v1` file for inline/CSE/frame/vreg-name data.
- All existing `analyze` modes (provenance, explain, inverse, source-rank, stack, origins) work on native snapshots. `coloring_model.py` replay is checked against native captures; a mismatch is a test failure.
- Selects the function by name, not symbol index. Seconds per call, not minutes.
- `--capture pair` with `--a <file> --b <file>` captures two source variants of the same function and returns a `mwcc-decision-diff-v1` (see §2.5), so a worker can ask "what did my edit change inside the compiler".
- qemu capture stays as a cross-check, no longer the default.
- Binaries ship inside the toolpack (job-time sync to `/opt/toolpacks`); no image rebake. Add `mwcc_alloc` to `toolpack.json` (it is only in `registry.json` today).

**2.5 Decision diff format** (shared by the worker tool and Phase 4): per class, nodes added/removed, degree changes, coalescing changes, colouring-order changes, register changes, inline verdict changes, CSE temp changes, frame slot changes; then a one-line summary per change in compiler terms. Size-capped; the full JSON stays in the output dir.

### Phase 3 — compiler knowledge (Opus, about half a day)

- **3.1** Ingest SMS's `docs/AGENT_MATCHING_TIPS.md` at `doldecomp/sms@4641b450` into the SMS standards and knowledge store: the measured 1.2.5 facts (vreg numbering, degree limit, webs, CSE birth, coalescing, inline pass ladder, frame slots). Each fact keeps its upstream citation. Their "Fakematches" and "Evidence" rules become SMS standards where ours are weaker.
- **3.2** Pin rayanht/mwcc source as a ref (same mechanism as the TP/TWW JSystem refs) and add `real_code_evidence --mode compiler <query>` (grep the compiler source with file:line results).
- **3.3** Place the pinned source at `../mwcc` relative to the SMS checkout in sandboxes, because upstream SMS docs tell agents to look there.
- **3.4** A compiler map in the prompt (§4 `<compiler>`): which file decides which mismatch class.

### Phase 4 — compiler delta in the steering probe (Opus, 1–2 days, after Phase 2)

**4.1 Post-gate host job (D2).** When the gate records a non-pass function, a queued `steering-explain` job:

- rebuilds S* on the host from `attempt-N.steering.edits.json` + `mwcc.revert_edits` with `apply_reverts(..., preserve_lines=True)` (the same function the gate uses), using the generated-include manifest the gate already transfers;
- runs `--capture native` on S* and on the candidate for that function;
- writes the decision diff as `compiler_delta` into the stored probe (`steering_observations.probe_json`).

The validation path and its 480 s budget are untouched. The probe is read at claim time, so the job only has to finish before the next claim of that target; if it has not, the worker gets the probe without `compiler_delta` and can run `--capture pair` itself.

**4.2 Hypotheses from measurement.** `build_probe` ranks hypotheses from `compiler_delta` first (e.g. "+1 coalesced neighbour of `this` → look for an accessor or global-pointer call the original had at this site"), and uses `SHAPE_HYPOTHESES` only as a fallback. A small table maps delta kinds to construct kinds (seeded from SMS's tips: degree limit, web split, CSE birth, inline pass, bound-argument order). `fit()` keeps `compiler_delta`'s summary lines under the 3 KB cap and drops its detail first.

**4.3 Unverified sweep.** A batch run of the same job over the 802 unverified functions (their candidate and reduced versions are known). Output: per function, the delta summary and its construct kinds; the board ranks "single-construct" deltas first.

### Phase 5 — measure (about 1 epoch)

- Baseline: the last SMS epoch before these changes.
- Metrics on the unverified frontier and on fresh targets: certified passes per 100 attempts, `steering_located` rate, attempts per certified pass, share of attempts that stop with recorded findings (§1.9), Codex audit of 20 random certified passes for real-code quality.
- Acceptance: certified-pass rate up, `steering_located` rate down, no rise in human-reported fakematches.

### Reviews

Codex review at each phase boundary; prompt changes also get an adversarial "read it as a worker" review (§5).

## 4. Draft prompt text (the part that must capture the method)

```
<goal>
Recover the source code the original developers wrote for the target function.
The compiler's output is how you test a hypothesis; matching bytes are the
consequence of the right source, not the goal. [SMS] A match counts only when
the steering gate certifies it.
</goal>

<definition_of_done>
[SMS] Done: every instruction matches and the steering gate certifies the
attempt. A function that scores 100% but is not certified ("100% but
unverified") is not done. Frame-only (all instructions match, only the stack
frame differs): stop and report frame-only.
[Melee] Done: the full instruction window matches.
Stop and leave the function nonmatching, with your findings recorded, when:
- you have explained the residual and no real construct with evidence
  produces it after 3 hypotheses, or
- the only edits that close it are probes (see method).
A certified or real-code attempt that scores lower than a probe-based one is
the better result.
</definition_of_done>

<method>
Work in this loop. Each step uses a tool, not intuition.
1. Classify the residual with checkdiff: control flow, call order, loads and
   stores, instruction selection, registers, frame. Fix in that order;
   registers and frame often follow from the earlier ones.
2. Form one hypothesis about the original source (a missing inline, a type,
   a field, a call, a construct) from evidence you already have.
3. Compile it and read the compiler's decisions, not only the score:
   mwcc_alloc_snapshot --capture native (or --capture pair for before/after)
   shows vregs and their source names, interference, colouring order,
   coalescing, inline verdicts, CSE temps and frame slots.
4. Explain the remaining difference as a compiler decision, in one sentence
   ("one extra vreg raised `this` to degree 29, so it was coloured first and
   took r31"). The compiler source is the reference: see <compiler>.
5. Turn the explanation into the kind of construct that would cause it
   ("one more coalesced neighbour of `this` with no new instruction").
6. Find which real construct the original had. Evidence, strongest first:
   the link map (real_code_evidence map-calls, map-unit), header inlines and
   matched siblings that use them (inlines, usage), strings, other games'
   sources (jsystem), callers and references (graph_related_functions,
   code_graph_file_card), similar instruction windows elsewhere in the
   binary (asm_window_search), an m2c reading of the target.
7. Write that construct, remove every probe edit, and resubmit.

Probes. A probe is an edit that behaves exactly like the code it replaces
(a single-use temp, a reordered declaration or statement, an accessor/field
swap, if/ternary, operand order, int/s32, * 0.5f vs / 2.0f, a padding local).
Use probes, the permuter and ablation only to locate which value or
statement drives the difference, then explain it (steps 3-5). Never submit a
probe. Knowing why a probe works does not make it real: if the compiler says
one more vreg moves `this`, a dummy local is still a probe and the gate
reverts it.

An explanation is not evidence. The compiler tells you what kind of
construct is missing; only step 6 tells you which one. Without evidence,
record the explanation and the candidates you checked, and stop.

[SMS] previous_attempt variant="unverified_match": the code already scores
100% but is not certified. Start from its unexplained_edits. For each one,
explain what it changes in the compiler (step 3, --capture pair), then find
the real construct (step 6) or remove it. Keep the parts the gate already
certified.
[SMS] steering_probe: lists the probe edits the gate found, the match
without them, and compiler_delta (what they changed inside the compiler).
Start at step 5 with compiler_delta.
</method>

<compiler>
The compiler is decompiled (rayanht/mwcc, at ../mwcc; search it with
real_code_evidence --mode compiler). Read it instead of guessing:
- registers: src/backend/Coloring.c, InterferenceGraph.c, CodeGen.c
- inlining: src/frontend/CInline.c
- loads, CSE, propagation: src/optimizer/IroCSE.c, IroPropagate.c
- instruction order: src/backend/Scheduler.c
- frame: src/backend/StackFrameEABI.c
Measured facts for this compiler are in the decomp standards.
</compiler>
```

## 5. Review protocol for this plan

Two Codex reviewers (`gpt-6.1-sol`, reasoning `medium`, fast mode), in parallel, read-only:

- **A — behaviour.** Read §4 as a worker would. Find every path where the text leads a worker to: steering with extra steps (compiler-justified probes), score chasing, endless compiler-reading without converging, giving up too early, fabricating evidence, misusing the unverified state, or contradicting the gate's rules. Check that the method generalises beyond register allocation (inlines, CSE, scheduling, frame, control flow).
- **B — technical.** Check §3 against the code: feasibility, missing pieces, wrong file references, budget and data-flow problems (S* rebuild on the host, object cache, wibo, versions, schema compatibility with `mwcc_alloc analyze`), test strategy, rollout order, Melee regressions.

Each finding is blocking or non-blocking with a concrete fix. Rounds repeat until both report no blocking findings.
