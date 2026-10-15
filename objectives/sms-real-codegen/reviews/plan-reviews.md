# Plan review round 1 findings (verbatim summaries)

## Reviewer A: correctness / gaming resistance
1. BLOCKING: IR equality is not a sound equivalence proof, and IR inequality is not proof of a real fix. Fingerprint must encode flags, call attrs, volatile/atomic, alignment, ABI; define cyclic back-edge hashing. Non-inlined accessors, reordered pure calls, equivalent CFGs can differ → steering stays in S* and passes as real. Clang vs MWCC packing/bitfields/signedness/FP contraction/intrinsics; UB; shims can erase differences; NaN policy for float operand sorting. Fix: fingerprints as evidence within a documented supported subset; preserve semantics; unsupported → unverified; pin clang/flags/shims; "fingerprint differs" must never establish real.
2. BLOCKING: reduction failure becomes acceptance (entangled temp + real fix in one hunk; coordinated reverts; greedy order/format dependence; combination-only steering; header consumers omitted; inconsistent S* per header). Fix: unresolved for compile-blocked/budget-limited/unproven groups; dependency-aware grouped reduction; order sensitivity; single consistent S* across TUs; attribution limits never raise confidence.
3. BLOCKING: forced rules allow evidence laundering (map-backed name + steering in one edit) and reject legit fixes (volatile/pragma/asm forced revert); excluding header-backed inlines contradicts brief. Fix: immutable evidence, smallest construct, target-site relevance; unsupported directives block for review; revalidate after forced decisions.
4. BLOCKING: enforcement bypass via unavailable/incremental analysis (clang-incompatible syntax + fallback 'other'; tool failure lets improvements through; inherited steering in pre-worker baseline; stop_at_frame completion path). Verdicts diverge from audit (stack_only, approximate score; mixed from score only). Fix: separate semantic classification, completeness, match; withhold done credit when incomplete; trusted steering-clean baseline; carry unresolved status; separate audit mapping.
5. BLOCKING: validation can't justify enforce flip (68 cases used for tuning; 90% hides rejections; unavailable exclusion; Apple clang 21 vs Debian clang 18; fallback in workers; circular loop success). Fix: independent review of loop successes; held-out adversarial suite; count unavailable; end-to-end in worker image; define acceptance criteria before flip.

## Reviewer B: integration / tests
1. BLOCKING: baseline (`pre_worker_source`, host dir, selected paths only) not available inside the sandbox where stack_check runs. Fix: upload overlay or other trusted base; test remote, headers, additions, deletions, widened paths.
2. BLOCKING: stack-only completion paths (claim shortcut worker-cycle.ts:2003; board snapshot.ts:154/160) unaffected by steering rows; backfill --apply must rebuild reports and reconcile stack-only records.
3. BLOCKING: bank the cleaned source, not the verdict; checkpoint references candidate patch (worker-cycle.ts:2731); PR export consumes checkpoints (checkpoint.ts:367-379).
4. BLOCKING: trigger holes (equal-score changes, neighbouring functions, stack-only completion).
5. BLOCKING: Jev integration needs question routing/result lookup/thresholds by question id (index.ts:396, 510-521; config.ts:61); justification requirement; shadow-only independent of advisory enforcement.
6. BLOCKING: dashboard read-model reports raw exact/improved before rejection (read-model.ts:2335-2356).
7. BLOCKING: production oracle: Dockerfile (Bookworm) has only python libclang, no clang executable; Linux parity; 180 s deadline; timed-out analysis must not authorize completion.
8. BLOCKING: evidence tool registration (execution.ts:71 registry, workspace-tool-exec.ts:80 api/<script> entry, wrappers/capabilities.ts:147-154 only --query/--limit, sandbox env excludes host refs path).
9. BLOCKING: slice.json manifest + order.json coverage; question routing for accessor findings; duplicate rules/sms.py; end-to-end tests (prompt snapshot, kernel catalog/preview, checkpoint selection, integration, PR export, board); compiled IR fixtures.
10. NON-BLOCKING: path corrections; migration rollback (index.ts:137 rejects ahead schema); scope cuts (refs image bake, duplicate TS lesson loader, dashboard badge); admitCuratedEntity alone isn't searchable.

# Plan review round 2 findings (summaries)

## Reviewer A (correctness)
R1 findings 1-5: all PARTIALLY resolved.
6. BLOCKING host oracle may analyze a different program (lagging headers); header consumers limited to change set. Fix: materialize exact claim-base tree on host, verify context hashes, discover affected units via include deps; bind edit hash to paths/existence/texts/snapshot.
7. BLOCKING classifier miss still establishes real (blacklist). Fix: positive evidence for retained groups; other/compile-blocked/inseparable → unresolved; adjudication path for genuine fixes caught by steering shapes; two orders are diagnostic only.
8. BLOCKING unresolved improvements launder steering across attempts; codegen-neutral removable edits retained can matter later. Fix: certified clean revision; prefer banking S*; per-function done-credit incl. neighbours.
9. BLOCKING evidence exceptions: map call edge doesn't prove receiver/args/count/position; header-inline exclusion contradicts brief. Fix: construct-level correspondence; independent review; allow authentic header inline/weak with provenance and relevant use.
10. BLOCKING flip criteria can pass with all 56 incomplete. Fix: steering detection + mixed thresholds; production-runner smoke test (transport, timeout, neighbours, cumulative unresolved).

## Reviewer B (integration)
R1: 1 RESOLVED (use immutable baseRev, provisioning.ts:265-270), 2/3/4/5/8/9 PARTIALLY, 6/7 RESOLVED.
N1. BLOCKING host evidence tool resolves sandbox checkout (worker-cycle.ts:1781, :2217; tools/resolver.ts:152, :307). Fix: explicit host checkout path for host-only tools.
N2. BLOCKING host reduction context unverified (lagging headers). Fix: reconstruct at baseRev, transfer sandbox-only inputs, verify identity; regression test.
N3. BLOCKING incomplete neighbour exact still becomes done (board/candidates.ts:28, snapshot.ts:93, tick.ts:184-190).
N4. BLOCKING steering rows lack source identity/publication rules; attempt observations vs authoritative integrated state; shadow must not alter board; backfill coverage.
N5. BLOCKING separate Jev path lacks lifecycle wiring (catch-up.ts:87-93, handlers/adjudication.ts:63-96, worker-cycle.ts:2705).
Also: 012 test teardown must remove v13 bookkeeping; migration index.ts:155/:205 warns and continues on ahead schema (rollback note wrong).

# Plan review round 3 (summaries)
Correctness: R1 #2,#3,#5 and R2 #6,#9,#10 RESOLVED; #1,#4,#7,#8 PARTIALLY. BLOCKING: (1) equivalent out-of-line callee swap passes as callee_change; (2) historical cleanup not required by eligibility. Non-blocking: reconcile stale section 11; keep limits explicit.
Integration: R1 #1,#3-#9, N1,N3,N5 RESOLVED; R1 #2, N2, N4 PARTIALLY. BLOCKING: B1 git archive omits generated build/<ver>/include inputs; B2 coverage existence doesn't prove safe retirement; B3 inline-evidence approval can't clear steering rejection (adjudication ordering worker-cycle.ts:1334/2670).
Round 4 A: A(2),B1,B2,B3 RESOLVED; A(1) PARTIALLY: old-callee-absent alternative still certifies F->G swap when neither in relocations. Fixed in 12d.

# Implementation review round 1
## Correctness/gaming (Codex)
1. BLOCKING approval promotes whole removable group incl. steering shapes (steering_check.py:1068).
2. BLOCKING --functions exclusive filter excludes changed neighbours (steering_check.py:1427).
3. BLOCKING MWCC build errors with no rows can pass (steering_check.py:1785/1882); TS must not trust top-level attempt only.
4. BLOCKING worker mwcc runs without --attribute → no map-call/data-order evidence (steering-check.ts:276).
5. BLOCKING fingerprints drop nsw/nuw/exact/fast-math/call attrs/calling conv (ir_oracle.py:304/1600).
Responses: all five sent to the owning agents (Python gate; TS runner + steering-validation).
## Integration/tests (Codex)
1. BLOCKING backfill certifies pre-apply headRev; job never commits (steering-gate.ts:219).
2. BLOCKING backfill clean derived from function rows only; empty/unresolved reports pass (steering-gate.ts:188).
3. BLOCKING scoped --apply reverts edits outside scope (steering-gate.ts:152).
4. BLOCKING worker mwcc lacks --attribute (same as correctness #4).
5. BLOCKING Melee tool context changes: real_code_evidence in every worker profile; resolver adds env unconditionally; Melee prompt identity tests compare current renderers only.
Responses: 1-3 + resolver env gating → server agent (record only certifies a clean HEAD; apply is provisional; strict clean rule; scoped apply refusal). Tool profile gating → evidence agent. Melee/SMS-off prompt + context pinned against fixtures generated from clean HEAD → worker agent.
Round-1 responses landed: Python gate (approval scoping, union of changed functions, unit coverage → unresolved, attribute parity test, semantic IR flags, shape misreads); server (attribute upload with sha check, certificate checks independent of attempt, --record only certifies clean HEAD, apply provisional, strict clean rule, scoped apply refusal, steering env only for active games, Melee env pinned); evidence tool gated to steering games; Melee/SMS-off prompt+context pinned to HEAD fixtures. Validation-driven fixes: false-SAME guard only for pure-real-shape groups, evidence-based group attribution, max-groups 256, S** labelling, signature type_change.

# Implementation review round 2
## Correctness (Codex)
Round-1: approvals PARTIALLY; --functions, build errors, --attribute, fingerprint flags RESOLVED.
1. BLOCKING units coverage schema mismatch (Python built object vs TS literal true) → every genuine fix rejected.
2. BLOCKING approval matches any class sharing a method name (_find_approval suffix match).
3. BLOCKING TS keeps reduce-time unresolved groups after decide resolved them (data_order/map-call promotions).
Responses: Python emits boolean built/compared + final unresolved_groups, real-output fixtures, exact-identity approvals; TS reconciles final group statuses (fail closed when absent) + cross-language fixture test.
## Integration (Codex) round 2
Round-1: backfill certify RESOLVED; clean rule PARTIALLY (schema mismatch); scoped apply RESOLVED; --attribute RESOLVED; Melee gating RESOLVED.
1. BLOCKING coverage schema mismatch (= correctness #1). 2. BLOCKING reduce-time unresolved groups override decide promotions (= correctness #3). 3. P2 BLOCKING `no_changes` never emitted by Python. Non-blocking: frontend label/description for validation_steering_located.
Responses: TS reconciles decide's final unresolved_groups (fallback to reduce, fail closed) + cross-language fixture test from real Python output (done); Python emits boolean coverage, final unresolved_groups, no_changes from the edits manifest; frontend label + description added.
Round-2 responses landed (Python): boolean units coverage + builds detail; group_statuses and post-promotion unresolved_groups; exact-identity approvals; real-output fixtures (pass / steering / nochange) regenerated by test; addic. stack ops; header cap 96 with MWCC skipped for header-only consumers whose IR is unchanged (ir_unchanged_units); no_changes from the edits manifest; --tmp created.

# Implementation review round 3
## Correctness
Round-2: coverage schema, approval identity, final unresolved groups RESOLVED.
1. BLOCKING MWCC skip for IR-unchanged header consumers lets a real-for-A header group steer B's MWCC codegen unseen.
2. BLOCKING addic(.) normalization hides carry (CA) changes (addic. r0,r1,-1; addze vs 0).
Non-blocking: plan still says cap 24 (updated to 96).
## Integration
Round-2: all RESOLVED. 1. BLOCKING ir_unchanged_units dropped at TS boundary.
Responses: skip removed entirely (every header consumer built and compared; S* build skipped only when its inputs equal the candidate's), so no exempt rows; addic normalized only when CA is not consumed before being overwritten or a branch; TS rejects any non-built row.

# Implementation review round 4
Integration: R3 finding RESOLVED; Melee pinned (prompts, context, tool ids, env, knowledge) and SMS shadow confirmed; No blocking findings. Note: shadow already enables steering prompt section, evidence tool, knowledge relabel and observation logging for SMS; only acceptance is unchanged.
Correctness: C1 RESOLVED, I1 RESOLVED, C2 PARTIALLY → BLOCKING: CA liveness misses mfxer/XER reads and treats branches as killing CA. Response: forward worklist liveness over in-function branch targets; bl/blr/bctr exit kills; unknown targets conservative (code); mfxer/mcrxr readers.

# Implementation review rounds 5-6
Round 5 (correctness): CA liveness PARTIALLY → BLOCKING conditional calls (bcl, conditional bclrl/bcctrl) killed CA on the not-taken path. Response: linked branches end only the taken path; conditional ones push the fallthrough (word and text classifiers), regression tests added.
Round 6 (correctness): RESOLVED. No blocking findings.
Integration reviewer: no blocking findings since round 4.
