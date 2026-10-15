# Order and scope: make the harness work in the right order ("don't jump the fence")

Status: plan v3 (after Codex plan review rounds 1-2). Section 11 maps round-1 findings, section 12 round-2 findings.

## 0. Problem and evidence

Rulings on SMS (2026-10-15): #330 closed (fakematch, steering); #342 merged after removing reconstructed UNUSED bodies ("UNUSED functions may only be reconstructed when they were inlined into other functions in the same TU"); #347/#348 closed ("leave MarNameRefGen alone ... doing things out of order", "don't jump the fence"). #347/#348 filled `src/System/MarNameRefGen_{BossEnemy,Enemy,Map}.cpp` and added or expanded headers for classes whose units are blank stubs.

Root cause, verified: the board admits every sub-100% function in report order with no dependency data (`board/candidates.ts:20-41`, `epochs.ts:374-452`, claim by `admission_index`, ranking removed on purpose in `056b71c7b`); header widening never checks the header's owner (`write-set-widening.ts:358-380`) and SMS owner inference is broken (`write-set-categories.ts:57-65`, `change-validation.ts:1642`); integration and publication check paths, not order or scope (`worker-output-queue.ts:431-575`, `harness-draft-pr.ts:211-243`).

Data: target-object relocations resolve 99.98% of external references to an owner object. The 15 SMS blank-stub units define nothing; the classes MarNameRefGen_Enemy/_BossEnemy construct from them are exactly the 14+14 classes upstream left as `// TODO`. A 309-unit dependency SCC rules out unit-level topological order. Humans: registry #92 constructed only classes with full declarations (202/202) and enabled the rest later one at a time (165/167 pointed at units with source); 70% of PRs touch one unit; foreign-header edits are small and target units that already have source; nobody declared classes whose unit had no source.

## 1. Readiness model: per class, bound to a revision

New `toolpacks/gamecube-decomp/_impl/gamecube/tools/readiness.py` (stdlib; uses `stack_compare.ElfObject`, `unit_progress`, the m2c demangler).

Static facts (from the TARGET objects `build/<ver>/obj/**.o` and `mario.MAP`; they never change for a game version):
- Per function, references to other symbols with kinds `construct` (`__ct__<C>`), `vtable` (`__vt__<C>`), `rtti`, `destroy`, `call`, `data`.
- Class owner: the object that strongly defines the class's vtable; else the object with a strict majority of its strong member definitions; ties → `ambiguous`. Classes defined only weakly (templates, header-only classes) → `shared`. Qualified names are the identity. Every owner carries provenance (`vtable` | `majority` | `weak_only` | `ambiguous`).

Revision-bound facts (from git at a given revision; never from build artifacts, so stale objects or reports cannot decide):
Two readiness levels per class `C` at revision `R`. "Defines" always means an active definition (comments, `#if 0` and inactive preprocessor branches stripped) with the exact qualified name and parameter list of a symbol the owner's target object strongly defines:
- `started(C, R)` ("class implementation started"): the owner unit's source file at `R` (objdiff `source_path`, `git show R:path`) defines at least one strong member of `C` from the owner object. Used by the declaration fence (section 3).
- `construct_ready(C, R)`: if the target object strongly defines a constructor of `C`, the owner source at `R` defines that constructor (signature match); if every constructor of `C` in the target is weak (the original defined it inline), construction needs no owner-unit code and `C` is `shared` for construction. Header text never grants readiness: a header-inline constructor added by a worker does not count when the target has a strong one. Used by the scheduler and order-gated files (sections 2, 3).
- `not_ready`: owner known and the relevant level does not hold (all 15 stub units' classes).
- `shared`: weak-only class (or weak-only constructors, for construction) → ready.
- `unresolved`: ambiguous owner, owner unit without a `source_path`, or `C` absent from the map. Never treated as ready by the fence (section 3); the scheduler treats it as not blocking.
- Unit progress (fuzzy %) is reported for context only; no threshold decides readiness (the human data does not support a fuzzy threshold).

Function readiness at `R`: `unmet(f) = {C : f's target code has construct/vtable/rtti refs to C, owner(C) != unit(f), C not ready/shared at R}`; `unresolved(f)` likewise for unresolved classes. Calls, destroys and data references never count (callers need only declarations; humans matched 12 such functions).

CLI `readiness.py index --repo R --rev REV [--version V] --json` → `{identity: {rev, version, target_stamp, map_sha, policy_hash}, classes: {C: {owner, provenance, state}}, functions: {"unit::sym": {unmet: [...], unresolved: [...]}}, units: {u: {fuzzy, stub}}, summary}`. Static facts cached by target stamp + map hash; revision facts cached by `(rev, policy_hash)`. Cold ~4 s, warm < 1 s.

Config `games/<id>/game.json`:
```json
"ordering": { "mode": "off" | "shadow" | "enforce",
  "gatedPaths": ["src/System/MarNameRefGen*.cpp"],
  "scope": { "maxForeignHeaders": 3, "maxForeignHeaderLines": 25 } }
```
Optional in `resolver.ts` (absent stays absent: Melee fingerprint unchanged; strict parse; integer limits). `ordering.mode = enforce` requires `matching.steeringGate` ∈ {shadow, enforce} (the UNUSED certification comes from the steering run, section 4); config validation fails otherwise. SMS ships `shadow`; flip to `enforce` only per section 8.

## 2. Scheduler: deferred frontier, blocked registries

- Readiness is loaded asynchronously before the admission transaction (new `loadReadinessForEpoch` in the scheduler, host runner like the steering host runner), once per epoch at the epoch-start revision, keyed by identity; it is never called inside `ensureSchedulerEpochFromBoard`'s transaction.
- Admission (`board/snapshot.ts` via `options.readiness`):
  - A function in an `ordering.gatedPaths` unit with non-empty `unmet` → `blocked` (not admitted; enforce). A blocked registry function is re-evaluated at every epoch start, so it is admitted in the first epoch after its classes become ready.
  - Any other function with non-empty `unmet` or `unresolved` → `deferred` (this is a scheduling preference, not global dependency enforcement; construction through existing declarations stays possible and is documented as a limit): admitted after all ready candidates in the same epoch (later `admission_index`), with the unmet classes in its worker packet (`<not_ready_classes>`: "do not construct or declare these; their units are not decompiled"). Partial work stays possible: the worker may fill ready branches, and the fence (section 3) rejects fence-jumping edits.
  - Shadow: nothing is blocked or reordered; `snapshot.wouldBlock` / `wouldDefer` are recorded.
- Epoch closure: blocked rows never enter `epoch_targets`. Admission returns a discriminated result: when zero targets would be admitted while blocked rows exist, it returns `readiness_blocked_only` BEFORE `startSchedulerEpoch` (today `tick.ts:169-182` would create an empty epoch and `run-loop.ts:1288-1296` would start settlement). `tick`, `run-loop` and post-boundary admission (`epoch-boundary.ts:1354`) handle it by parking: no epoch, no settlement, the blocked list recorded. On resume or a readiness-changing event (integration of new work, operator resume), readiness is reloaded and admission retried without an active epoch; if still blocked, the run stays parked without creating epochs. Tests: mixed frontier closes; blocked-only parks without settlement; resume recomputes readiness before admission; unblocking; restart.
- Loader failure in enforce (missing objects, timeout, malformed, identity mismatch): gated-path functions are blocked, others admitted normally, `readiness_unavailable` recorded (fail closed only where the ruling applies). Shadow: record and admit.
- Other board callers (`init-run.ts:42`, `worker-cycle.ts:~1854`, settlement's current-board artifact at `settlement.ts:1777`) receive the same readiness so counts agree; settlement writes a revision-bound `readiness` artifact after boundary Sync, and `read-model.ts` exposes `blockedTargets` / `deferredTargets` (shadow: would-block) for the dashboard work table.

## 3. Edit-scope fence

New `toolpacks/.../tools/edit_scope.py` (pure; uses `readiness`). Input: base revision, candidate file texts (complete before/after of every changed file, tracked and untracked, under `src/`, `include/`, `libs/*/include/`). It parses class definitions (class/struct heads, bodies, members, inline bodies, out-of-class member definitions, typedef/using aliases resolved to their target names) in before and after, and compares per qualified class:
- `introduced_or_changed(C)`: C defined in after but not before (anywhere), or C's definition gained/changed members, base classes or inline bodies. Pure moves (identical normalized definition removed in one place and added elsewhere) and forward declarations do not count.
- Class checks run before any path exemption, for every file including the target `.cpp`:
  - owner(C) == target unit → `own_class` (allowed: the worker is decompiling C).
  - C `not_ready` → `not_ready` (reject).
  - C has no map identity and is defined only in a `.cpp` (TU-local helper; its name matches no mapped class, so it cannot stand in for one) → `local_helper` (allowed, warning).
  - C `unresolved` otherwise (no map identity in a header, ambiguous owner) → `unresolved` (reject in enforce with the reason).
  - The declaration fence uses `started(C)`: declaring members of a class whose owner has no started implementation is `not_ready`.
  - C `ready`/`shared`, in a foreign header → `foreign_header` (allowed; counted against the soft limits).
- Order-gated files (`gatedPaths`): added references (`new TX`, `TX::`, `TX(`, includes of a class header) to a class that is `not_ready` or `unresolved` → `order_gated` (reject). Renamed or aliased classes cannot match the target (the mangled symbol must name the real class), so name identity covers the bypasses that matter for matching.
- Soft limits (`maxForeignHeaders`, `maxForeignHeaderLines`, human p90/p75) → warnings only.
- Output: `{identity: {base_rev, patch_sha256, readiness_identity}, hunks: [{file, line, class, verdict, reason}], verdict: pass|reject, warnings}`.

Worker: new `edit_scope` gate in `validateWorkerChange` after `summarizeMicroGates` and before the steering gate; cumulative from the claim base (`git diff <baseRev>` plus untracked). Enforce rejects with repair reason `edit_scope: ...`; `tool_unavailable` is a failure in enforce (unlike other micro-gates); shadow records. Widening rung 3 denies headers whose classes are `not_ready`/`unresolved` (readiness passed into `executeWriteSetWidening`, `write-set-widening.ts:697`, cached decisions included); `categorizePath` learns `.cpp` and `libs/*/include`; `.hpp`→`.cpp` owner inference is case-insensitive.

## 4. Reconstruction evidence (UNUSED rule), separate from scope

- Certification stays in the steering run (`unused_checks`), which runs whenever `steeringGate != off`, independent of ordering mode. `inlined` requires a same-unit caller whose match gets worse when the body is emptied and that has no call relocation to F; anything else is `inconclusive` (needs review). Each check is bound to `{base_rev, edits_hash, body_sha256}`.
- The worker attaches `unused_checks` to the checkpoint; integration writes them as trailers on the integration commit (subject unchanged; boundary Sync reads `%s` only), e.g. `Evidence-Inlined: TChuuHana::rolling -> TNerveChuuHanaRoll::execute (86.0% -> 45.0% when emptied)`.
- Integration and publication require, for every UNUSED reconstruction in the patch, a matching bound `inlined` check; missing, stale (hash mismatch) or inconclusive → rejection (enforce).

## 5. Integration gate and PR shaping

- `applyClaimedWorkerOutput` gets the game's ordering policy passed in. Rejection reuses status `rejected` with disposition `rejected_out_of_scope`, via a helper extracted from `jobs/resolve-integration.ts:63-105` (`immediateTransaction`, `updateWorkerOutputIntegration`, checkpoint `selected = 0`, `addEvent`) without the operator wrapper's live-lease guard, invoked under the queue's serial claim (`worker-output-queue.ts:606`) before `completeJob`; `rejected` is non-blocking (`worker-output-integration.ts:38`) and next-epoch admission readmits the target. Under one integration lock (the queue already applies serially), it classifies the actual patch over the current HEAD in an isolated overlay (readiness at HEAD), and checks UNUSED evidence. Reject → terminal disposition `rejected_out_of_scope` (not a blocking conflict): checkpoint deselected atomically with the reason and classifier output recorded, the target becomes claimable again in the next epoch with the reason in its repair context. No partial apply. Tests: unchanged HEAD/index on reject, checkpoint deselection, blocking counts unchanged, restart.
- Publication (`HarnessDraftPrPublishResult.status` gains `scope_refused`; both boundary publication branches `epoch-boundary.ts:867,1176` and recovery `:847-848` treat it as unpublished; the publisher pushes the checked SHA, not mutable `HEAD`): `publishHarnessDraftPr` runs `pr_scope_check` on `base...HEAD` immediately before push, binds the result to the exact SHA it pushes, refuses with a retry-aware result (`scope_refused`, recovery in `epoch-boundary.ts:842` treats it as not published), and never pushes or mutates GitHub on refusal or checker failure. Same-PR prerequisites (a class made ready earlier in the same branch) are reported as "split suggested" warnings, not refusals; readiness for the PR check is evaluated at the PR base.
- `server:job -- pr-scope-check --game G --repo R --base B [--head H]`: the same check as a CLI (validation, operators), including PR size warnings from the human distribution.
- Lints `sms_out_of_order_fill`, `sms_undecompiled_class_decl`, `sms_unused_reconstruction` stay as the review backstop; their readiness switches to `readiness.py` (the lint agent's thresholds become irrelevant).

## 6. Learning from humans (scoped down)

- Commit the human-order statistics with provenance (`objectives/sms-real-codegen/validation/human-order.json` + the scripts from `/tmp/humanorder/` under `validation/human_order/`), and cite them in the standard and plan as the source of the soft limits and the "construct only classes that exist" rule.
- Deferred: a generic `human_order.py` tool and learned admission priority (ranking stays removed; base-class-first noted as a possible tie-break).

## 7. Prompt and knowledge

- Worker prompt `<order_and_scope>`, gated by `ordering.mode != off`, wording per mode (shadow: "are flagged"; enforce: "are rejected"): work in order; edit your target's file and only the declarations your target needs in headers of decompiled units; never add a class, members or header for a class whose unit is not decompiled (forward declarations are fine); registries such as MarNameRefGen are filled after the classes exist; UNUSED bodies only with inline evidence; one unit per change. `<not_ready_classes>` packet placeholder. Dashboard preview aligned; Melee/SMS-off HEAD fixtures unchanged.
- Review lessons: `games/sms/knowledge/sources/injectable/steering_lessons/review_rulings.jsonl` (#330, #342, #347/#348 with quotes, rules, enforcement and examples), loaded into the steering probe and the prompt's knowledge context; seed CLI support tested against a copied store. Live store apply is left to the operator (command documented), because the seed opens and migrates the live store.
- Standard `global_standard:sms-decompile-in-order` updated to the class-readiness definition.

## 8. Validation

1. Freeze expectations first: a separate Codex adjudicator lists every hunk of #338–#348 (and #342/#344 pre-fix heads) with an expected verdict per rule, without seeing the tool output.
2. Run `pr-scope-check` + lints + UNUSED checks on each PR head over its own base (`efbba0f1` for #338–#341, `84bca82f` for #342–#348; sandboxes `sb-upefb`, `sb-up84` read-only via overlays), readiness at the base. Report hunk by hunk vs expectations.
3. Historical readiness spot checks at actual parent commits (e.g. MarNameRefGen `new TX` additions after #92) and unknown/unresolved coverage counts.
4. Readiness index on `sb-up84`: blocked/deferred sets; compare blocked registry entries with upstream TODO lists.
5. Adversarial cases with expectations frozen before tool output (unit tests + validation): bogus inline constructor added in an earlier commit for a stub class; class whose owner defines only a trivial member (`started` but not `construct_ready`) entering MarNameRefGen; TU-local helper struct; out-of-class inline header definitions; class layout in the target `.cpp`, alias/typedef, shared header, `libs/*/include`, mixed header, incremental attempts, stale identity, cyclic deferral.
Flip SMS to `enforce` only if: every adjudicated blocking hunk in #347/#348 is rejected; no merged #338–#346 hunk is rejected unless the adjudicator also marked it a violation; zero ready-class false blocks among merged hunks.

## 9. Tests
Python: readiness (fixture ELF objects + repo history: owners incl. ties/weak, revision-bound readiness, inline-ctor readiness, unresolved), edit_scope (all verdicts and bypass cases), pr_scope_check. TS: resolver ordering parse + mode constraint + Melee fingerprint; readiness loader (async, identity, failure modes, cache); snapshot/tick blocked vs deferred vs shadow, epoch closure, blocked-only parking, other board callers, settlement artifact; worker gate (enforce/shadow/off, tool_unavailable, steering-mode combinations); widening; integration `rejected_out_of_scope` lifecycle; trailers; publish refusal (initial, update, recovery, changed HEAD, checker failure → no push); read-model; prompt + preview + HEAD fixtures; review rulings loading.

## 10. Commits
1. Toolpack: readiness, edit_scope, pr_scope_check (+ tests).
2. Server: ordering config, readiness loader, frontier, dashboard.
3. Worker fence, widening fixes, evidence trailers, integration gate, publish check, CLI job.
4. Prompt + preview, standards, review rulings.
5. Validation + SMS mode decision.

## 11. Responses to round-1 findings
Correctness: (1) per-class, revision-bound readiness with provenance and `unresolved`; no unit threshold; inline-ctor classes ready (TDirectionCalc). (2) Whole-file class comparison in every file incl. the target `.cpp` and `libs/*/include`, class checks before path exemptions, per class, aliases resolved, moves only when identical; own-class allowed. (3) Readiness from git at an explicit revision (no build artifacts), identity-bound; worker checks are cumulative from the claim base; integration re-checks at HEAD under the integration lock; PR checks at the PR base, same-PR prerequisites warned. (4) Scope and reconstruction split; `inlined` needs a worsened same-unit caller and patch-bound evidence; missing evidence rejects. (5) Pre-frozen independent adjudication; deferral instead of blocking for non-registry work; blocked-only parking; shadow wording; human data used for soft limits only.
Integration: (1) async loader before the transaction, per epoch, identity-bound, explicit failure modes. (2) blocked-only parking state. (3) `rejected_out_of_scope` terminal disposition with atomic deselection and readmission. (4) classifier before steering, UNUSED after, ordering enforce requires steering ≥ shadow, tool_unavailable fails in enforce. (5) publish check inside the publisher, SHA-bound, retry-aware, no push on refusal. Non-blocking: settlement readiness artifact + read-model; shadow wording; resolver absence; widening readiness plumbing; trailer tests; live seeding deferred; generic history tool deferred.

## 12. Responses to round-2 findings
Correctness: (1, blocking) header inline constructors no longer grant readiness; construction readiness comes from the target object's constructor binding (strong → owner source must define it; weak-only → shared); two levels `started` / `construct_ready`; active, signature-exact definitions only; adversarial fixtures for a bogus inline overload and an earlier accepted bogus constructor. (2) "started" documented as implementation started; registries use construct_ready. (3) TU-local helpers allowed with warning; header map-absent classes stay unresolved; TDirectionCalc example removed (it is declaration-only at 84bca82f, so constructing it is deferred). (4) deferral limits and parking resume documented and tested. (5) adversarial expectations frozen too; expected verdicts may not change to pass enforce.
Integration: all five resolved; implementation notes adopted: full identity recheck after the async load; discriminated `readiness_blocked_only` admission result before `startSchedulerEpoch`, handled in tick/run-loop/epoch-boundary with resume retry; rejection via an extracted resolve-integration helper under the queue claim; unavailable scope checks fail in enforce; ordering/steering constraint checked after effective config merge; readiness rechecked for cached widening approvals; `scope_refused` publish status, SHA-bound push, both boundary branches and recovery updated.
