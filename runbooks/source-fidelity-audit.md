# Source Fidelity Audit Runbook

Run this whenever a batch of worker integrations lands (a PR, an epoch, or every few hundred checkpoints). It finds code the harness accepted because the score went up but that no programmer on the original team would have written, checks whether an existing standard already forbids it, turns the gaps into lint rules, measures what those rules would have rejected, and then keeps the standards themselves from drifting into overlap and contradiction.

The first full pass ran on Super Mario Sunshine on 2026-09-15 and 2026-09-16. Its artifacts are the worked example for every step below:

- `audits/sms-pr161-source-quality-2026-09-15/` (PR audit, 19 findings)
- `audits/sms-worktree-source-quality-2026-09-16/REPORT.md` (worktree audit, harness root causes, lint proposals)
- `audits/sms-worktree-source-quality-2026-09-16/IMPACT.md` (what the rules would reject)
- `audits/sms-worktree-source-quality-2026-09-16/ALIGNMENT.md` (standards overlap and contradictions)

Scripts live beside this file in `runbooks/source-fidelity/`. Nothing in this runbook builds the game. Any step that needs a compile runs in a Daytona sandbox created from the game's snapshot, started and stopped around each call, and deleted afterwards.

## What counts as a finding

The bar is the upstream project's own definition of a fakematch: code that compiles to identical bytes but is clearly not what the original developers wrote. Three tiers, in order of severity:

1. **Wrong code.** Undefined behavior, semantic changes accepted on score, one-definition violations, forged symbols. Examples: returning a reference to a by-value parameter, indexing across three scalar members, a swapped argument pair, a class whose consumers dereference storage nothing allocates, `extern "C" float mRopeWidthX__9TCogwheel`, a hand-written `void* __vt__7TKiller[]`.
2. **Inert emission.** Source whose only job is to make bytes appear. Discarded literals, `strcmp` calls with the result dropped, uncalled `dummy()` functions, unused `static const` arrays, `#pragma force_active` around dead data.
3. **Compiler steering.** Constructs the project tolerates as marked temporary debt: `volatile` casts, fixed function pointers to defeat inlining, goto networks, `dont_inline` pragmas, unused locals for frame size, single-use wrappers, `- -x` spellings.

Tier 1 and tier 2 are rejected outright. Tier 3 is a warning that requires the game's marker convention (`// fabricated`, `// TODO`) and stays visible as debt. An unused local could genuinely have existed in the original source, so tier 3 findings say "unevidenced", never "impossible".

## Step 1: Fix the scope and build the evidence folder

1. Create `audits/<game>-<scope>-<date>/evidence/`.
2. Pick the range. For a PR, the base and head SHAs. For the live worktree, the last audited head to the current head of `games/<game>/workspace/checkout`.
3. Save the diff: `git diff <base> <head> -- src include tools configure.py | gzip > evidence/delta.diff.gz`.
4. Index every integration in the range to its retained artifacts:

```
python3 runbooks/source-fidelity/build_integration_index.py --game sms --base <base> --head <head> --out evidence/integrations.json
```

Each row carries the retained `write_set` patch, the runner validation summary with before and after scores, the scanned `qa_diff.patch`, and the materialized post-change tree (`attempt-N.qa_current/`). The worker's own notes sit two directories above the patch path as `worker_*.txt`. Everything later cites these rows.

Record the head, the row count, how many rows are recorded exact, and how many are section targets. Those are the denominators for Step 7.

## Step 2: Mechanical sweep

```
python3 runbooks/source-fidelity/sweep_patterns.py <(gunzip -c evidence/delta.diff.gz)
```

This greps the added lines for every pattern in the three tiers and prints hit counts by file with two samples each. It is a map for reviewers, not a verdict. Two rules of thumb from the SMS pass: a category with zero hits is worth one line in the report ("no goto networks outside the two known files"), and a category with hundreds of hits usually means a new mechanism that deserves its own finding (the 140 mangled prototypes in `killer.cpp` were one hand-written vtable, not 140 problems).

## Step 3: Fan out the review by area

Split the changed files by directory into slices of roughly 20 to 60 files and give each reviewer the same brief. The brief is the whole handoff, so it must contain:

- the paths to the checkout, the diff, the integration index, and the worker notes
- the upstream project rules (`AGENTS.md` fakematch section, `docs/AGENT_MATCHING_TIPS.md`) and the symbol map (`config/<id>/symbols.txt`, `splits.txt`)
- the sweep hits in that slice, named file by file
- the required shape of each finding: file and line in the live checkout, category (reuse the ids from the last report or `NEW-<name>`), pre-existing versus new in this range, the integrating commit with target symbol and before and after score and exact flag, a one-sentence quote of the worker's rationale, and a certainty label
- an instruction to list genuine fixes of pre-existing bugs separately, because every pass so far found dozens and they must not be reverted with the fakes
- a count table by category at the end

Run two dedicated readers alongside the area reviewers:

- **Section targets.** Classify every `.rodata`, `.data`, `.sdata`, `.sdata2`, `.bss` integration as real owner, map-listed unused, convention copy, structural spoof, or fabricated content. Check whether the worker's final note admits the section is not exact while the runner recorded it exact. Diff the pre-worker and post-worker unit snapshots for same-unit function regressions the comparator ignored.
- **Cross-cutting integrity.** Micro-gain patches (under half a point, or exact from above 99.5) whose diff adds only a local, a hoist, a cast, or a reorder. Duplicate file-scope statics across translation units versus the map. Header shadowing: every `#define <X>_HPP`, every `#define Type Other` around an include, every file-scope `class X` in a `.cpp` that a header also declares, with the map unit that owns the vtable. Reference-returning helpers taking by-value parameters. Symbol order against `symbols.txt` for the most-changed units, remembering that `-inline deferred` units are reversed.

## Step 4: Verify before you trust

Every finding gets a second, independent read before it goes in the report. Give the verifier the finding and the evidence paths, not the conclusion, and ask for a verdict of accurate, accurate with corrections, overstated, or wrong. On the SMS PR audit the verifiers kept every line number and score but downgraded three "conflicting class definition" labels to "ODR-divergent duplicate, identical layout", found that one "semantic fix" repaired the PR's own earlier regression, and found two constructs the first pass missed. Expect that ratio.

Write the report with the findings table first, the harness causes second, and the coverage table last. Every score in it is a historical runner checkpoint, not a fresh measurement, and the report must say so.

## Step 5: Find the harness cause

The constructs are symptoms. For each accepted finding ask why the gate let it through, and reproduce the answer with a probe patch rather than reasoning about it. On SMS the causes were:

- the worker QA scan passed no game, so the resolver defaulted to Melee and loaded rules that only apply to `.c` files
- the banned-idiom micro gate only read `.c` and `.h` paths
- section targets ignored regressions in functions below exact
- integration kept the highest-scoring attempt even after the worker retracted it
- owning-header widening was denied, so workers forged the symbol in the `.cpp` instead

Probe method: write a synthetic diff containing one instance of every construct, run the scan as production runs it (same surface, same environment, same file extension), then run it again with one variable changed. The probes from the SMS pass are in `audits/sms-worktree-source-quality-2026-09-16/evidence/probe.diff` and `gate-probe.ts`.

## Step 6: Compare with the standards and write the rule matrix

Dump every record the game composes (global plus game-scoped) with its summary, do, do_not, rule ids, and first example. For each finding category decide:

- Does an existing record already forbid it? Then the gap is enforcement, not policy: extend the rule's `applies_to`, fix the file filter, or bind a new rule to that record.
- Is the construct wrong in any MWCC decomp (validity, one-definition, inert emission, compiler steering)? Global.
- Does it depend on this game's map semantics, precompiled-header conventions, runtime intrinsics, or the upstream marker rule? Game-scoped.

Write the matrix with one row per construct: scope, existing standard id or "none", proposed rule id, trigger sketch, severity. Severity follows the tiers: error, error, warning with marker.

## Step 7: Implement the rules and measure the loss

Rules live in `knowledge/global/sources/injectable/decomp_standards/standards/<family>/` (global) and `games/<id>/knowledge/sources/injectable/decomp_standards/standards/<family>/` (game). Each family has `slice.json`, `rules.py`, `standards.jsonl`, `examples.jsonl`, and the manifest test requires `slice.json` and the `RULES` list in `rules.py` to agree. A rule binds to a record through `standard_id` in `rules.py`; the record's `qa_rule_ids` must list exactly those rules. New records start as `accepted` only once the rule exists and has tests, and carry the audit path in a `provenance` field rather than in the summary.

Before measuring, confirm the composed scan fires as expected on the probe from Step 5 under `ORCH_GAME_DIR=<abs>/games/<id>`.

Then replay every integration in the range:

```
python3 runbooks/source-fidelity/measure_impact.py --game sms --index evidence/integrations.json --out evidence/impact-raw.json
```

The summary gives rows rejected, exact matches lost split by function and section, gain points lost, and hits per rule. Two corrections are always needed before the number is honest:

1. Legacy rules that misfire on the new language. On SMS, `bare_local_prototype` fired 165 times on C++ class bodies. Scope such rules back to `.c` and re-run.
2. Verification of every error in the rejected rows. Open each excerpt in the post-change tree, label it true or false positive, and re-tally. On SMS 420 of 429 errors were true and none of the 9 false ones caused a rejection on its own.

Write `IMPACT.md` with the headline table first, then the per-rule true and false counts, then every lost exact match with a "path to keep it" column. Most lost matches have a path: a one-line static declaration in the owning header, an include, a marker comment. The ones with no path are the fakes.

## Step 8: Align the standards

New records overlap old ones, and game records written before composition restate global ones. Run two readers over the dump: one for pairwise overlap with a merge or keep decision per pair, one for contradictions (record versus record, record versus rule severity, record versus upstream project rules, and a record's own example against its own rule). Then run the mechanical cross-check:

```
python3 runbooks/source-fidelity/check_standard_bindings.py --game sms --game melee
```

It exits non-zero if any record lists a rule no slice binds to it, any rule binds to a deleted record, or any example points at a deleted record. Finding-level overrides, where `rules.py` re-points individual findings to another record, go in `finding_override_rule_ids`, not `qa_rule_ids`.

Apply the merges as record edits. Keep the enforcement bindings intact, move examples with their records, demote process descriptions to `workflow_only`, and move game-specific sentences in global records into a game slice so other games never see them. Re-run the replay from Step 7 afterwards; the rejection count should be unchanged or lower only by collapsed double-fires.

## Step 9: Deploy and confirm the worker sees it

When a branch was rewritten outside the harness (reverts, re-lands, an out-of-band upstream merge), the harness still records the old accepted head, and a manual Sync will refuse because the worktree tip differs from it. Adopt the new head the way an epoch boundary does, with a boundary record and the rebuild evidence, using `runbooks/source-fidelity/adopt-head.ts` (run with `bun` from `apps/server`; `--dry-run` first, then `--new <sha> --prior <sha> --report <evidence path> --snapshot <name> --reason "..."`). Install the sandbox-built report at `build/GMSJ01/report.json` and write its reuse key with `write-reuse-key.ts --write` so the next validator step reuses it instead of building on the host. If the configuration revision changed (any edit under `games/<id>/config/`), run `validate-sandbox` afterwards; the adoption script leaves the sandbox gate alone otherwise.


1. Restart the dashboard server so the composed loader is live: `bun run ui:server` from the repo root.
2. Check `GET /api/standards?gameId=<id>` for the expected record count and a `scope` on each record.
3. Check `GET /api/kernel/agents?gameId=<id>` for the worker preview's `<standard>` count.
4. Regenerate the sandbox image context under `games/<id>/runtime/images/` if the lint engine changed, since the image carries a copy.
5. After the next real worker runs, grep its session transcript under `worker_state/<id>/host-cwd/.pi-sessions/**/worker/*.jsonl` for `scope="global"`. That transcript is the only proof a worker received the block.

## Cadence and checklist

Run Steps 1 through 4 on every PR before it opens, and on the live worktree every 500 integrations or every epoch, whichever is sooner. Run Steps 5 through 8 whenever Step 4 produces a category the rules do not cover. Run Step 8 alone whenever more than two records change.

Before closing a pass:

- [ ] evidence folder has the diff, the integration index, the raw replay, and the probes
- [ ] every finding cites a live checkout line, a commit, a score pair, and a worker quote
- [ ] genuine fixes are listed separately from findings
- [ ] the harness cause is reproduced by a probe, not inferred
- [ ] every new rule has a test, a bound record, and an example that passes its own rule
- [ ] the replay number is true-positive adjusted and the lost exact matches are listed with a path
- [ ] `check_standard_bindings.py` exits zero
- [ ] the composed block for the game contains no other game's conventions
- [ ] the server was restarted and the API count matches
