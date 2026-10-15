# SMS real-codegen plan: steering gate, diagnosis, evidence, learning

Status: implemented on feat/sms-real-codegen (commits fd8611aa6..). Plan v3 after Codex plan review rounds 1-5; implementation review rounds 1-6 closed with no blocking findings. SMS ships steeringGate "shadow": validation 8.3 criteria not all met (validation/gate-vs-audit.md). Section 11 answers round 1, section 12 answers round 2; section 13 lists what v3 changed.

## 0. Core idea

A steering edit changes the source form but not the program's behaviour. The gate answers two separate questions per edit, and never infers "real" from one signal alone:

1. **Is the edit behaviour-identical?** Evidence: clang `-O2` LLVM IR (powerpc-eabi, SMS flags) of the unit, canonical dataflow fingerprint, unchanged when the edit is reverted. IR equality is sufficient to call an edit *removable*; IR difference is *not* sufficient to call it real.
2. **Is a retained edit a real fix?** Positive evidence is required. A retained group (IR differs) is `real` only if (a) the classifier finds at least one *real shape* in it (section 2.2: literal/constant change, member change, callee change, call added/removed, condition change, canonical type change, control-flow change, declaration/definition added or removed, initializer change) and (b) it carries no steering shape and no codegen directive. A group with only `other`, a steering shape, a directive, an unsupported construct, or an inseparable mix of real and steering shapes is `unresolved`. Unresolved never earns credit; the probe tells the worker to separate or justify it (section 2.3, evidence review).

Then the MWCC question: rebuild the reduced source S* (base + retained edits) and compare it with the candidate. A function gets done credit only when analysis is complete, nothing is unresolved, and S* produces the same object code as the candidate for that function (stack-frame-only differences are handled by the existing stack policy, see 3.3).

Feasibility (host, Apple clang 21, `--target=powerpc-eabi`, SMS `compile_commands.json` flags): 368/381 SMS `src/` units and 651/734 units overall compile to IR, ~0.2 s per unit. PR 03 hanasambo steering differs from upstream only in independent load order, which the canonical fingerprint removes. A spike of the oracle on audit cases is running in parallel; its results feed the validation section.

## 1. Definitions

- *base*: trusted source the change is measured against. Worker gate: the immutable claim `baseRev` from provisioning (`job-queue/provisioning.ts:265-270` detached checkout; worker edits are working-tree changes). The sandbox step verifies `git rev-parse HEAD == baseRev`. Changed set = `git diff --name-only baseRev` + untracked files under `src/ include/ libs/`. Base text = `git show baseRev:<path>` (absent = new file). This covers headers, new and deleted files, widened paths. Backfill/validation: a git ref (upstream `7fed828b` for the audit).
- Inherited steering: in enforce mode every banked attempt is certified (incomplete or unresolved attempts are rejected, not banked; 3.3), so steering in a claim base can only come from pre-gate history. The backfill job (3.6) finds it and `--apply` replaces it with S*. Until a unit has backfill coverage (3.5), the claim-time stack-only shortcut is disabled for it in enforce mode.
- *edit*: a `git diff -U0` hunk; hunks are refined into line-level sub-edits with difflib. Edits are enumerated deterministically by one function (`steering_edits.enumerate(base_text, cand_text)`), so host and sandbox derive identical edit ids from identical texts. `edits_hash` binds baseRev, every path, base/candidate existence flags and full texts; every request carries it and both sides check it.
- *edit group*: dependency-aware unit of reversion. Identifier analysis groups a newly declared local/alias with every edit that mentions it; edits inside one statement are grouped; reverting a group is atomic.
- *removable* group: reverting it keeps the unit compiling and every function/global fingerprint equal to the candidate's.
- *retained* group: not removable. Classified `real` or `unresolved` (section 0, point 2). Groups whose revert breaks compilation even after merging with dependency neighbours are `unresolved` unless they carry only real shapes.
- S*: base + retained groups. Must be one consistent text per file across every unit that includes the file. Units that include a changed header come from ninja deps in the sandbox (`stack_check.Repo.units_including`); all of them are compiled for header groups (cap 96 units, beyond that `incomplete`; every consumer gets base + candidate MWCC builds). A group removable for one unit but not another is retained.
- Per-function result (three independent fields):
  - `analysis`: `complete` | `incomplete` (oracle unavailable for the unit, budget hit, unresolved compile-blocked groups, tool failure).
  - `semantic`: `clean` (no removable group affects the function's codegen) | `steering` (some removable group changes its MWCC code) | `unresolved` (retained groups with steering shapes/directives touch it).
  - `match`: base / candidate / S* objdiff status and %.
- Gate decision per function: `pass` iff analysis complete, semantic clean, and S* object code for the function equals the candidate's (via `stack_compare.compare_function`, `identical`). Otherwise `steering_located` (semantic steering) or `unresolved` (incomplete or unresolved).
- Attempt decision: `pass` iff every considered function passes AND the attempt has no removable group except pure `cosmetic` ones (comments/whitespace). So the banked patch is S* up to comments: no codegen-neutral rewrite is banked that could start steering after later edits.
- Audit-compatible label (validation only, kept separate): `real` = S* exact with nothing unresolved; `mixed` = steering present and at least one retained `real` group touches the function and S* score > base; `steering` = steering present and no retained real group touches it.

## 2. Python toolpack (`toolpacks/gamecube-decomp/_impl/gamecube/tools/`)

### 2.1 `ir_oracle.py` + `ir_oracle_prelude.h`
- Flags: from the repo's `compile_commands.json`; if absent, from a per-game flags template recorded in the toolpack (`ir_oracle_flags/sms.json`, generated from the SMS `compile_commands.json`). Drop `-c/-o`; add `-O2 -S -emit-llvm -w -o -`; `-x c -std=gnu99` for `.c`; `-include ir_oracle_prelude.h` (intrinsic shims as opaque external functions, NOT as builtins, so shims never erase differences: e.g. `float __frsqrte(float)` declared extern). Clang from `$ORCH_IR_ORACLE_CLANG`, else `clang`. Clang version, flags hash, and prelude hash are recorded in every report.
- Compile in a shadow root (APFS clone / copy of `src include libs` via `stack_check.make_shadow_root`) with overlay files, so quoted includes and header overlays resolve exactly.
- `fingerprint`: Merkle value numbering. Preserved: opcode, types, all integer/float flags (`nsw nuw exact fast-math`), `volatile`, atomic ordering, call callee and calling convention, call attributes that change semantics (`noreturn`, `nounwind` ignored), GEP offsets, constants (bit-exact float), switch case values, globals' initializer/section/constness/linkage class. Canonicalized: value names, commutative integer ops and `fadd/fmul` operand order (IEEE commutative incl. NaN payload policy: sorted only when neither operand is a NaN constant), icmp/fcmp predicate swaps, independent load order (loads keyed by address + memory epoch; every non-`readnone` call, store, fence, volatile/atomic op starts a new epoch), block numbering by DFS from entry in successor order, phi incoming lists by canonical block id (back-edge operands hashed by (block id, instruction index) after blocks are numbered, so cycles terminate), `.cold.N` splits folded into the parent, private/internal constants identified by content.
- Unsupported subset: inline asm, `llvm.*` intrinsics outside an allowlist, `setjmp`, functions with `naked` → the unit's affected functions are `incomplete`.
- Tests: hand-written IR for every invariance/sensitivity, plus compiled C++ fixtures (`tests/ir_fixtures/*.cpp`, compiled with clang when present) covering temps, accessors (inline and out-of-line), ternary/if, volatile, atomics, aliasing through pointers, branch shape, attributes, globals, and a header overlay.

### 2.2 `steering_shapes.py` (shared shape classifier)
Lives in `review_lint/api/steering_shapes.py` (pure stdlib) and is imported by both the lints and the tools (the tools dir already imports review_lint helpers? if not, a thin re-export module). Classifies a group (removed lines, added lines, post context) into: `temp_alias`, `accessor_swap` (moved from `sms_fidelity/rules.py:accessor_swap`, which then imports it), `ternary_if`, `operand_order`, `statement_permutation`, `decl_reorder`, `type_spelling`, `float_form`, `compound_assign_split`, `bool_form`, `codegen_directive` (`volatile`, `register`, `#pragma`, `asm`), `cosmetic` (comment/whitespace only). Real shapes (token-level, typedef-aware via a typedef table built from the base headers): `literal_change`, `member_change`, `callee_change`, `call_added`, `call_removed`, `condition_change`, `type_change` (canonical types differ; `int`↔`s32` is `type_spelling`, not `type_change`), `control_flow_change`, `definition_added_removed`, `initializer_change`. Anything else is `other`. A group may carry several shapes.
- Construct checks for call shapes: `callee_change` and `call_added` count as real only if the new callee (when out-of-line) appears in the original function's relocations in the target object; the old callee's absence alone is never enough. `call_removed` counts as real only if the removed callee is absent from those relocations. Otherwise the group is `unresolved` (catches swapping between two equivalent out-of-line functions). Inlined callees are covered by the IR rule itself (identical bodies give identical IR and the group is removable).

### 2.3 `steering_check.py` (CLI next to `stack_check.py`; reuses `Repo`, `ShadowPool`, `TargetOracle`, `compile_in`, `stack_compare`)
Subcommands (`--json`, exit 0 for analysis results, 2 for tool failure):
- `edits --repo R --base-ref REF [--paths src include libs]` → `{edits_hash, files:[{path, base_exists, cand_exists, base_text, cand_text}]}` (sandbox side; texts are what the host needs).
- `reduce --oracle-repo H --input edits.json [--units …] [--budget-seconds 120] [--max-groups 64]` → removable/retained groups with shapes, per-unit fingerprints, analysis completeness (host or sandbox side; wherever clang exists).
- `mwcc --repo R --base-ref REF --edits-hash X --revert GROUP_IDS [--attribute] [--functions …] [--jobs N≤3]` → per function: base/candidate/S* status and %, `compare_function` class S* vs candidate, attribution deltas (sandbox side; recomputes edits from the same texts and verifies `edits_hash`).
- `check` = `edits` + `reduce` + `mwcc` in one process (local, backfill, validation; also the worker's self-check when clang exists).
- `apply --report FILE` (backfill only): writes S*.
- Reduction algorithm: build groups → try reverting each group (largest first, then smaller); accept if compiles and all fingerprints equal; repeat to a fixpoint (bounded by budget). Groups whose revert breaks compilation are retried merged with their dependency neighbours; still blocked → retained and marked `compile_blocked` (counts as unresolved if it has any steering shape, otherwise real). Order sensitivity: the reduction runs twice (forward and reverse group order); different results → `incomplete`.
- Attribution (diagnosis only, never confidence): for `steering` functions, add back each removable group alone to S* and record the MWCC delta; also the full candidate. Cap 12 compiles per function.
- Evidence keep (construct-level): a removable group that adds a call to an out-of-line function F is retained as `real` with `evidence: map_call` only when all hold: the immutable map (`mario.MAP` from baseRev) lists F as a callee of the function; the target object (`build/<ver>/obj/…`, original code) has relocations to F in that function; the MWCC object of S*+group has the same number of F relocations in that function as the target object, while S* without the group has fewer. Receiver/argument correctness is then settled by the exact MWCC match required for pass. A group with other shapes is split first; if it cannot be split it is `unresolved`.
- Evidence review (header inlines / weak functions): a removable group that switches to, or adds, an inline/weak function whose definition exists in baseRev headers or in the pinned TP/TWW JSystem sources with the same body is `unresolved:evidence_review`, not steering. In the live gate it stays unresolved (the attempt is rejected, with the provenance in the probe). It becomes `real` only through a curated approval list `games/sms/knowledge/sources/injectable/steering_lessons/evidence_approvals.jsonl` (`{symbol, function, provenance, approved_by, edits_example}`), read by the gate from the host checkout; entries come from human review or the offline review job, never from the worker. No live adjudication ordering is involved. Plain accessor↔field swaps without provenance stay steering. No other forced rules: directives are `unresolved`, not reverted.
- Order check: the reduction runs forward and reverse; disagreement → `incomplete`. This is a diagnostic tripwire, not a certificate; the certificate is the positive-shape rule plus the MWCC identity rule.

### 2.4 `steering_diagnose.py`
Turns a `steering_located`/`unresolved` function into a probe (≤3 KB):
`{function, unit, match:{base,candidate,real_only}, steering_edits:[{file,line,shapes,before,after,delta}], unresolved:[…], hypotheses:[{cause, why, how_to_check}], evidence:{map_callees, emitted_inlines, unused, header_inlines, sibling_uses, jsystem_hits}, lessons:[…]}`.
Shape → hypotheses table (brief): `temp_alias` → missing inline / wrong type or signedness; `accessor_swap` → wrong inline used / header inline body wrong; `ternary_if`, `operand_order` → original used an inline with that shape / different operand types; `statement_permutation`, `decl_reorder` → missing inline / extra temporary object / declaration types; stack-only residual → missing inline (inlines add stack slots). Evidence prefetch calls `evidence_search` functions directly. Lessons from the lesson store (6.2).

### 2.5 `evidence_search.py` (+ worker tool)
Read-only subcommands: `map-calls --symbol`, `map-unit --unit`, `inlines --type [--member]` (headers in `include/` and `libs/*/include/`), `usage --inline [--unit]` (callers at 100% in `report.json`), `jsystem --query [--game tp|tww|all]`. Parsers cached by mtime+size. Runs host-side (like the `knowledgeApiTool` tools, e.g. `type_layout_lookup`). Worker context points `ORCH_GAME_REPO_ROOT` at the sandbox path (`worker-cycle.ts:1781,2217`, `tools/resolver.ts:152,307`), so the resolver gains an explicit `ORCH_GAME_HOST_REPO_ROOT` (host checkout, `globals.repoRoot`) exported for host-executed tools; the evidence tool reads only that. Test: registration with distinct host/sandbox roots and an attached sandbox handle. Map, symbols and headers come from that host checkout at the claim baseRev (via the same baseRev cache as 3.2 when available), JSystem refs from `$ORCH_GAME_STATE_DIR/refs/jsystem/{tp,tww}` (pinned sparse clones made by `fetch_jsystem_refs.sh`, commits in `refs.lock.json`; already fetched on this host: tp `c8fa8c9e`, tww `8b93b372`). Exposed as registered tool `real_code_evidence` with an `api/real_code_evidence.py` entry point, a parameter schema `{command: enum, symbol?, unit?, type?, member?, inline?, query?, game?, limit?}`, registry/profile/metadata entries, and a test through the registered-tool boundary.

## 3. Server

### 3.1 Policy
`resolver.ts`: `STEERING_GATE_MODES = ["off","shadow","enforce"]`, `GameMatchingConfig.steeringGate`, default `off`, strict parse; `games/sms/game.json` gets `steeringGate` (value decided by the flip criteria in 8.3). `core/tools/steering-gate.ts` (`ORCH_STEERING_GATE`, `gameSteeringGate`), forwarded by `tools/resolver.ts` and `workspace-tool-exec.ts`; Python `game_policy.steering_gate()`. Melee: `off`; tests pin no behaviour change and byte-identical prompts.

### 3.2 Runner (`core/validation/steering/steering-check.ts`)
- `steeringEdits(exec)`: sandbox `steering_check.py edits --base-ref HEAD`.
- `steeringReduce(input)`: host `steering_check.py reduce` when the host has clang (default), sandbox otherwise. Context is exact, never "close enough": the host materializes `baseRev` from its own git object DB (`globals.repoRoot`, i.e. `hostRepoRoot` at `worker-cycle.ts:2617`) with `git archive baseRev src include libs` into a cache dir keyed by baseRev, then overlays the changed files. Generated inputs: the sandbox `edits` step also returns a manifest of `build/<ver>/include/**` (path, sha256, and content for text files ≤ 256 KB; MWCC-only binaries such as `*.mch` by hash only, clang never reads them) and the unit compile flags from the sandbox `compile_commands.json`/`build.ninja`; the host writes them into the baseRev cache and rebases repo-relative paths to the cache root. Identity checks: the host verifies `git rev-parse baseRev^{tree}` equals the tree id the sandbox reports, and the hash of generated compile inputs (`build/<ver>/include/**`, compile flags for the unit) equals the sandbox's. Missing baseRev on the host or any mismatch → `incomplete` (no credit). Regression tests: a lagging host header that would change the verdict is detected as a context mismatch; a fresh cache with a sandbox-only generated header compiles after materialization.
- `steeringMwcc(exec, revert)`: sandbox `steering_check.py mwcc`.
- One wall-clock budget for the whole gate (default 240 s); exceeding it → `incomplete`.

### 3.3 Worker validation (`agents/running/worker/change-validation.ts`, `runner-validation.ts`)
- Trigger: every attempt that would otherwise be checkpoint-eligible (hard gates passed) and changed any source, when mode ≠ off. Functions considered: every function whose object code changed vs the claim base in any touched unit (from the `mwcc` base vs candidate comparison), not only the target. Runs after `evaluateWorkerStackPolicy`.
- New runner validation status `steering_located` and field `steering?: WorkerSteeringResult`.
- `enforce`:
  - Any considered function `steering_located` → status `steering_located`, reason lists the steering groups and the S* score; attempt fails hard gates.
  - Any considered function `unresolved`/`incomplete`, or a non-cosmetic removable group, or a tool failure → status `steering_located` (reason says which), whether the attempt is exact, stack-only-done, or an improvement. Nothing uncertified is banked, so no target or neighbour can become done through an uncertified attempt, and no later attempt inherits uncertified code.
- `shadow`: run, record artifact + rows, never change status.
- Banking: `pass` (attempt decision, section 1) means the banked candidate equals S* up to comments, and its object code is identical to S* for every considered function. Selected checkpoints, integration and PR export (`phases/pr/checkpoint/checkpoint.ts:367-379`) therefore only ever see certified patches; tests pin that a `steering_located` attempt is never selected.
- Stack interaction: if S* vs candidate differ only in the stack frame (`stack_only`) and policy is `stop_at_frame`, the removable groups bought only the frame → reuse the existing `stack_only_perturbation` status and instruction.
- Artifact `attempt-N.steering.json`.

### 3.4 Hint into the next attempt (`core/harness-runtime/phases/running/workers/worker-cycle.ts`, `worker/context.ts`)
- `repairRequest.steering_probe` = probe JSON; `instruction` gains `STEERING_LOCATED_INSTRUCTION`.
- Cross-claim: on claim, the latest probe observation for the target (3.5) whose recorded function-source hash still matches the claim base yields `packet.steering_probe`, rendered by `{{STEERING_PROBE_XML}}` in `WORKER_PACKET_CONTEXT_TEMPLATE` (empty when absent/off). Lands in the same commit as preview hydration: `kernel-preview.ts` sample probe in SMS mode, `kernel-catalog.ts` pass-through, `kernel-catalog.test.ts` (no raw placeholders, SMS sample has `<steering_probe>`). No new frontend badge (cut).

### 3.5 Migration 013: two tables
Attempt observations and authoritative state are separate.
- `steering_observations` (append-only): `id, game_id, unit, symbol, run_id, attempt_ref, base_rev, function_source_sha, verdict, analysis, scores_json, probe_json, mode (shadow|enforce), recorded_at`. Written by every gated attempt (shadow and enforce). Used only for probes/hints and the dashboard; never for eligibility.
- `steering_backfill` (authoritative history state): `game_id, unit, symbol, analyzed_rev, function_source_sha, verdict, applied (0/1), applied_rev, report_json, recorded_at`, PK `(game_id, unit, symbol)`, plus `steering_backfill_coverage(game_id, unit, analyzed_rev, applied, recorded_at)`, PK `(game_id, unit)`. Written only by the backfill job.
- Coverage identity: `steering_backfill_coverage` rows carry `baseline_rev`, `clean` (true only when every function in the unit ended `pass` or was applied and re-verified; `--record` without `--apply` on a unit with steering writes `clean = 0`). The claim shortcut requires a clean row whose `baseline_rev` is an ancestor of the claim baseRev; unclean, unresolved or non-ancestor rows never authorize retirement. Tests: `--record` without `--apply`; a later revision on a non-descendant branch.
- Enforce prerequisite: `steering_backfill_runs(game_id, baseline_rev, clean, recorded_at)` records each full backfill; it is `clean` only if every analysed function ended `pass` or was `--apply`-cleaned and re-verified. A run in enforce mode refuses to start (run preflight, with the backfill command in the error) unless a clean backfill run exists whose `baseline_rev` is an ancestor of the integration head; after that, every banked change is certified by the gate, so retired exact/stack-only functions are certified by construction.
- Eligibility rules (enforce only; shadow changes nothing): the claim-time stack-only shortcut (`worker-cycle.ts:~2003`) additionally requires a clean coverage row for the unit; board/scheduler exact and stack-only retirement need no special case because certified attempts are the only banked code and backfill `--apply` turns historical steering into S* (report < 100%, stack-only rows reconciled).
- Files: `storage/migrations/013-steering.ts` registered in `index.ts`; `013-steering.test.ts`; version bumps in `011-accepted-advisory.test.ts`, `012-stack-only-functions.test.ts` (incl. teardown removing the v13 row/tables), `baseline.test.ts`, `tools/harness-cutover.test.ts`, `store.test.ts`. `core/harness-runtime/run-state/steering.ts`: recordObservation, latestProbe(game, unit, symbol, sourceSha), recordBackfill, coverageFor, listBackfill. Rollback note: the runner warns and continues on an ahead schema (`index.ts:155,205`); the new tables are additive and ignored by older binaries.

### 3.6 Job `steering-gate` (`core/validation/jobs/steering-gate.ts`, registered in `application/jobs/job-runner.ts`)
`--game sms --repo <checkout> --base <ref> [--head <ref>] [--unit] [--function] [--record] [--apply] [--dry-run] [--force]`. Host runner for all three phases. `--record` writes `steering_backfill` + coverage. `--apply` writes S* for files with steering functions, rebuilds affected objects and `report.json` (`ninja -j3 <objects> build/<ver>/report.json`), re-runs the gate on the result (must be all `pass` or `unresolved`-free), clears `stack_only_functions` rows for functions no longer done, and marks rows `applied`. The operator commits the result through the normal integration path; the job never commits. Test with an injected runner.

### 3.7 Dashboard (`application/dashboard/read-model.ts`)
Result/endstate builders give a rejected `steering_located` attempt precedence over raw target `exact`/`improved` (around `:2335-2356`). Tests: exact target rejected for steering; accepted improvement followed by a rejected exact attempt.

## 4. Lints, standards, Jev
- New rules in `sms_fidelity/rules.py` + `slice.json` entries + `standards.jsonl` `qa_rule_ids` + `order.json`:
  - `sms_single_use_temp` (warning, `llm_review`): `temp_alias` shape.
  - `sms_form_rewrite` (warning, `llm_review`): `ternary_if`, `statement_permutation`, `decl_reorder`, `type_spelling`, `float_form`, `compound_assign_split`, `bool_form`.
  - `sms_codegen_directive` (error): added `volatile`/`register`/`#pragma` in `src/` and `include/`.
  - `sms_accessor_evidence`: unchanged id/severity; imports `accessor_swap` from `steering_shapes`; message points at the steering gate.
  - `sms_operand_flip` unchanged. `review_lint/rules/sms.py` (duplicate of `sms_baseline/rules.py`) untouched because no baseline rule changes.
- Standard `global_standard:sms-no-steering` + examples (#330 temp; `getColorChan` inline hop; a real control-flow fix) in `examples.jsonl`; ids in `order.json`.
- Jev: the two new rules are `llm_review` warnings, so in the live worker they flow through the existing justified-advisory path unchanged (worker must justify or remove; no new lifecycle wiring). The behaviour question ("Does the added code behave differently from the removed code for any input, ignoring register allocation, instruction order and stack layout?") is an offline, shadow-only job: `application/jobs/steering-behaviour-review/` runs Jev with its own question id and question-keyed thresholds (model-keyed advisory thresholds untouched) over a dataset of hunks (`data/sms-behaviour-change.jsonl`, built from the audited PRs with the audit's labels, plus gate artifacts), and writes results + agreement with the IR gate. It never affects worker outcomes. Live wiring is a follow-up once calibrated.

## 5. Worker prompt
`steeringPolicySection()` in `prompt.ts`, gated by `steeringGate !== "off"`; option threaded through `WorkerPromptOptions`, `workerSystemPromptDocument`, prompt cache key, `WorkerPreviewMode`, `KernelPreviewOptions`. Content: what steering is; a steering match is never done; steering is a probe (find the smallest same-behaviour edit that moves codegen, read `<steering_probe>`, search evidence with `real_code_evidence`, write the real construct, remove every steering edit); entangled hunks are rejected as unresolved, so keep real fixes in separate statements. Tests: Melee snapshot unchanged; SMS contains `<steering_policy>`; kernel-catalog SMS payload contains it.

## 6. Knowledge
### 6.1 Relabel
`knowledge-v2/stack-policy-filter.ts` gains `relabelSteeringTactics` (kinds `steering_temp|steering_accessor|steering_form`): matching code lines and prose get the suffix `[diagnostic probe: shows what codegen the original needs; not a fix]`, negation-aware. One helper `applyKnowledgePolicies(game, value)` composes stack redaction and steering relabel and replaces the direct `applyStackFramePolicy` calls (FTS, cards, knowledge-v2 tools, legacy graph, checkpoint feed). Gated by steering gate ≠ off. Tests beside the existing filter tests.
### 6.2 Lessons
One store: `games/sms/knowledge/sources/injectable/steering_lessons/lessons.jsonl` (`{id, function, pr, steering:{shapes, summary, example}, real_cause:{kind, summary, evidence}, outcome: real|mixed|loop_confirmed, reviewed_by}`), seeded from the 6 real + 6 mixed audit cases. Read by `steering_diagnose.py` (probe) only. Seed CLI `knowledge-v2/steering-lessons/seed.ts`: `admitCuratedEntity` (`pattern`, locator `steering-lesson:<id>`) + a fact/evidence record carrying the lesson text so knowledge search indexes it. Loop-confirmed pairs appended after independent review.

## 7. Tests
- Python: `test_ir_oracle.py` (hand IR + compiled fixtures), `test_steering_shapes.py`, `test_steering_check.py` (grouping, reduction with fake oracle, order sensitivity, header consistency, evidence keep limits, verdict fields, edits_hash), `test_evidence_search.py` (fixture map/symbols/headers), adversarial suite (8.2, `@needs_sandbox`), review_lint `SteeringShapesTest` + Melee unaffected + slice manifest/order coverage. New npm script `toolpack:test`.
- Bun: resolver; migration 013 + bumps; steering-functions store; `change-validation.steering.test.ts` (off/shadow/enforce; Melee never runs; exact vs improvement vs incomplete vs tool failure; non-target function becomes exact; stack-only interplay); worker-cycle (repair probe, claim shortcut precedence, checkpoint not selected when rejected); context placeholder + kernel preview/catalog; prompt; steering-gate job; dashboard precedence; board stack-only precedence; knowledge relabel; lessons seed; evidence tool registration; Jev behaviour review (shadow-only, question routing, thresholds).
- Keep `bun test ./apps ./toolpacks`, `bun run check`, `review-lint:test` green.

## 8. Validation
### 8.1 Audit reproduction
`objectives/sms-real-codegen/validate_audit.py`: new sandboxes `sb-sg1..3` (`make-sandbox.sh`, upstream `7fed828b`); per audited PR head, run `steering_check check --base-ref 7fed828b` scoped to the audited functions (`-j3`). Report: confusion matrix of audit-compatible labels vs audit verdict, every `incomplete`/`unresolved` counted explicitly (never dropped), per-shape agreement with the audit's change kinds, runtime. Output `objectives/sms-real-codegen/validation/gate-vs-audit.{json,md}`.
### 8.2 Adversarial suite (held out from tuning)
Synthetic edits on real SMS functions in a sandbox, each with an expected gate outcome: coupled temp + real condition fix in one hunk (→ unresolved/steering, never pass); volatile added (→ unresolved); map-backed call + temp in one group (→ unresolved); non-inlined accessor swap (→ unresolved via shape); independent call reorder (→ unresolved); shared header edit used by two units with different reductions (→ consistent S* or retained); clang-incompatible but MWCC-valid syntax (→ incomplete, no credit); `int`→`s32` (→ removable); real field-offset fix (→ pass); real missing call (→ pass); helper extraction into a non-inlined static function (→ unresolved, `other`); macro-expanded rewrite (→ removable); host/sandbox context mismatch (→ incomplete); removable cosmetic-free rewrite with no codegen effect (→ attempt rejected); switching a call between two existing out-of-line functions with identical bodies, with neither symbol in the target function's relocations (→ unresolved), and with only the new symbol present (→ real shape accepted, decided by MWCC).
### 8.3 Enforce flip criteria (decided before running)
Flip SMS to `enforce` only if all hold:
- Steering detection: 0 of 56 audited-`steering` functions get gate `pass`; ≥ 50/56 get `steering_located` with complete analysis (the rest may be `unresolved`/`incomplete`, each listed).
- Mixed: 0/6 pass; ≥ 4/6 labelled `mixed` or `steering`.
- Real: ≥ 5/6 audited-`real` functions pass (each miss explained).
- Adversarial suite: every case gives its expected outcome.
- Production-runner smoke test passes: `change-validation` driven end to end with a local `WorkspaceExec` against a real SMS sandbox (`@needs_sandbox` Bun test): host reduction + sandbox MWCC transport, budget timeout → rejection, a neighbour function becoming exact while the target improves, a rejected attempt not becoming a checkpoint.
Otherwise commit `shadow` and report why.
### 8.4 Diagnose + evidence loop
Stratified sample of 12 of the 56 steering functions (by steering shape). Per function: start from S*, give the probe and `real_code_evidence` to an Opus worker in its own sandbox. Success = gate `pass` with exact (or stack-only under SMS policy) AND an independent Codex review confirms the retained change is a real behaviour/evidence-backed fix (not a disguised steering). Report successes, partials, failures with causes. Confirmed pairs → lessons.

## 9. Rollout
1. Land everything with SMS `steeringGate: "shadow"`.
2. Run 8.1–8.3; flip to `enforce` on this branch only if the criteria hold.
3. Production oracle: host-side `reduce` by default (orchestrator host needs clang; checked by a doctor step and reported in the gate result). Sandbox clang is optional: `sandbox-image/Dockerfile` gains `clang` (Bookworm `clang-14`, all targets) for future sandbox-side reduction; not required for enforcement.
4. Before the first enforced run, the operator runs the backfill job on the integration checkout (documented in the runbook section of the plan's final report).

## 10. Commits
1. Toolpack: oracle, shapes, steering_check, diagnose, evidence search, fetch script, tests.
2. Server: policy, runner, validation, migration 013, run-state, job, dashboard precedence, board/shortcut precedence.
3. Prompt + context placeholder + preview (one commit).
4. Lints, standards, Jev behaviour review.
5. Knowledge relabel, lessons, seed, evidence tool registration.
6. Validation artifacts (+ SMS mode decision).

## 11. Responses to round-1 findings
Correctness reviewer:
1. IR equality is evidence of removability only; IR difference never establishes real (section 0, 2.3). Semantic IR properties preserved; unsupported subset → incomplete; clang/flags/prelude pinned and recorded; shims are opaque externs. Layout: base and candidate are compiled with the same clang layout, so only edits that change layout-affecting declarations are affected, and those change IR (retained, then shape-checked).
2. Dependency-aware groups; compile-blocked groups with steering shapes are unresolved; budget hit and order sensitivity → incomplete; one consistent S* per file across units; attribution caps never raise confidence.
3. Evidence keep limited to map call-tree callees of the target function, read from the immutable base map, group split first; directives are unresolved, not reverted. Header-only inlines without map evidence stay hypotheses (deliberate deviation from the brief's broader wording, because the maintainer called accessor swaps to header inlines fake; reported in the final report).
4. Enforce: incomplete/tool failure → no done credit; improvements banked under incomplete analysis carry an `unresolved` row that blocks later completion until a gated pass; stack-only completion is gated like exact; separate analysis/semantic/match fields; audit mapping separate.
5. Adversarial suite (8.2), explicit unavailable counting, independent review of loop successes, flip criteria fixed in advance (8.3); production oracle runs on the host, so host-clang validation matches production.

Integration reviewer:
1. Base = sandbox `git HEAD` (claim base rev); texts fetched with `git show`; no host directory passed to the sandbox.
2. Claim shortcut and board stack-only exclusion consult steering rows; backfill `--apply` rebuilds objects + `report.json` and reconciles stack-only rows.
3. Pass requires S* object code == candidate object code, so the banked patch is codegen-identical to the cleaned source; otherwise rejected and the worker resubmits.
4. Trigger on every checkpoint-eligible attempt; all functions with changed object code are considered; stack-only completion included.
5. Separate `behaviour-review.ts` path with its own question id, thresholds, persisted id, shadow-only, no justification needed; justified path untouched.
6. Dashboard result/endstate precedence for rejected steering (3.7).
7. Host-side oracle by default; Dockerfile clang optional; one wall-clock budget; incomplete never authorizes completion.
8. `api/real_code_evidence.py`, registry, schema, host-side data, boundary test.
9. `slice.json`, `order.json`, examples, question routing included; duplicate `rules/sms.py` untouched; compiled IR fixtures; checkpoint/integration/PR export covered by the codegen-identity rule and tests for checkpoint selection.
10. Paths fixed; rollback note on migration 013; preview lands with the placeholder; cuts: frontend badge, TS lesson loader, image refs bake.

## 12. Responses to round-2 findings
Correctness reviewer:
- R1.1/R1.2/finding 7: retained groups need positive real shapes (section 0.2, 2.2); `other`, compile-blocked with non-real shapes, inseparable mixes → unresolved; two orders are a tripwire only. Genuine signedness fixes are `type_change` (typedef-aware), not `type_spelling`.
- Finding 6: exact baseRev context materialized on the host with tree-id and generated-input hash checks; header consumers from ninja deps; edits_hash binds paths/existence/texts/baseRev.
- R1.4/finding 8: incomplete/unresolved/tool failure → attempt rejected in enforce (nothing uncertified is banked); attempt pass also requires no non-cosmetic removable groups, so the banked patch is S* up to comments; every considered function, including neighbours, must pass.
- R1.3/finding 9: map-call keep needs the original object's relocations to F and matching call counts; header/weak inline provenance goes to evidence review via the existing justified-advisory adjudication instead of being rejected outright.
- R1.5/finding 10: numeric steering/mixed/real thresholds and a production-runner smoke test (8.3).
Integration reviewer:
- N1: `ORCH_GAME_HOST_REPO_ROOT` for host-executed tools.
- N2: as finding 6 above.
- N3: any unresolved considered function rejects the whole attempt, so neighbours cannot become done uncertified.
- N4: `steering_observations` (attempt, never eligibility) vs `steering_backfill` + coverage (authoritative, backfill only); shadow alters nothing; probe reuse keyed by function source hash.
- N5: live worker uses the existing justified path; the behaviour question is an offline shadow job, no live lifecycle wiring.
- Migration: 012 test teardown updated; rollback note corrected (runner warns and continues).

## 12b. Responses to round-3 correctness findings
- Equivalent callee swaps: call shapes need relocation evidence from the original object (2.2); adversarial case added (8.2).
- Historical cleanup: enforce requires a clean backfill run on an ancestor of the integration head (run preflight, 3.5); coverage rows are bound to the analysed baseline and are clean only when applied and re-verified.
- Section 11 answers 3.4/4.4 are superseded by v3: incomplete improvements are rejected, not banked; header/weak inlines go to evidence review rather than being excluded.

## 12c. Responses to round-3 integration findings
- B1: generated include manifest transferred and verified (3.2); fresh-cache test.
- B2: coverage rows carry baseline_rev + clean; shortcut needs clean + ancestor; record-only is unclean (3.5).
- B3: no live promotion; header/weak inline evidence becomes real only via a curated approval list read by the gate (2.3).

## 12d. Round-4 response
- Call evidence: the new callee must be in the target function's relocations; old-callee absence no longer suffices; adversarial case with neither symbol present added.

## 13. What v3 changed
Positive-shape rule; exact baseRev host context; whole-attempt rejection for anything uncertified; cosmetic-only leftovers; construct-level map evidence; evidence review for header/weak inlines; two state tables; host repo root for host tools; Jev behaviour question offline; numeric flip criteria + production smoke test.
