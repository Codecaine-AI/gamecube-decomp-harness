1. [BLOCKING] Historical passes certify unrelated code — `epochs/sync-certification.ts:47–48`. A backfill `pass` from a divergent or newer revision certifies ours without checking `analyzedRev`. Any historical landed certificate also certifies a later ungated body. Higher-scoring uncertified code can therefore survive sync. Fix: bind evidence to pinned ours HEAD, require ancestry and certified source/input identity, and fail closed. **New versus origin/main.**

2. [BLOCKING] Overload deduplication deletes real functions — `epochs/certified-merge.ts:525–537`. Functions are grouped by name and parameter count. An ours-added `f(float)` is deleted when upstream contains `f(int)`, even outside the conflict. Reproduced with the pure splicer. Fix: identify full signatures and deduplicate only proven copies. **New.**

3. [BLOCKING] Helper removal ignores surviving global references — `epochs/certified-merge.ts:495–500`. `stillUsed` scans function blocks only. When a caller goes upstream, the merge deletes `helper()` while retaining `auto callback = &helper;`, breaking compilation. Reproduced. Fix: inspect the whole resulting translation unit, excluding only the helper definition; retain it when usage is uncertain. **New.**

4. [BLOCKING] Unsupported C++ silently bypasses operator review — `epochs/certified-merge.ts:399–422`. Valid class bodies and some operators are skipped without a parser error. A conflict inside an inline member resolves upstream with no decision or certification status, even when ours is certified and higher. Reproduced. Fix: detect code-bearing conflicts that cannot be mapped safely and invoke the operator path with statuses. **New.**

5. [BLOCKING] Retry loses certified decision records — `epochs/boundary-sync.ts:710`, `:743`, `:810–816`. After merge succeeds but report recomputation fails, retry sees upstream already merged and leaves `functionDecisions=[]`. It never performs the second record write or restores rule-specific displacement reasons. Ordinary score-loss requeue still runs. Fix: persist decisions in the recovery journal and reload them on retry. **New.**

For the unit mismatches below, use **one game-aware normalization helper** for stored units, report units, target keys, SQL queries, and lookups. Normalize known module prefixes without stripping arbitrary path components. Add mixed-prefix regression cases.

6. [BLOCKING] Held functions retain completion credit — `board/unverified-measures.ts:119`. `${unitName}::${symbol}` uses report unit `mario/Animal/AnimalBase`; completion indexes contain `Animal/AnimalBase::f`. Reproduced: the held function retains matched bytes/functions, 100% fuzzy credit, and complete-unit credit; `unverified_targets=0`. Fix: use the shared normalized key on both sides. **Already in origin/main.**

7. [BLOCKING] Board retires held exact functions — `board/candidates.ts:67–68`. The same raw-key comparison misses the hold and returns `null` at 100%, removing the repair candidate. `board/snapshot.ts:104` and `:168–179` repeat the mismatch for exact retirement and manifest credit. Fix: normalize all those comparisons. **Already in origin/main.**

8. [BLOCKING] PR slices award held matches and bytes — `pr/pr-worktrees.ts:330–340`. `byTarget` contains short-unit hold keys, but lookup uses raw `entry.unitName`. A held newly exact function receives one match and its full byte credit. Fix: normalize map construction and report lookup. **Already in origin/main.**

9. [BLOCKING] Checkpoint PR candidates bypass holds — `pr/checkpoint/steering-holds.ts:144–146`. Prefixed worker units reach exact-unit SQL queries for `activeUnverifiedMatch` and `latestSteeringRollback`; short-unit holds return no row. `checkpoint.ts:406` retains exact credit, and `:916` repeats the miss during publication recheck. Fix: normalize persistence/query boundaries and checkpoint keys. **Already in origin/main.**

10. [BLOCKING] Held-file mapping can permit publication — `pr/pr-worktrees.ts:263`. `unitPaths.get(hold.unit)` misses prefixed report units. The filename fallback covers ordinary paths, but a report mapping `mario/Animal/AnimalBase` to `src/Animal/Shared.cpp` leaves `Shared.cpp` shippable despite its hold. Fix: normalize `unitPaths` insertion and lookup. **Already in origin/main.**

11. [BLOCKING] Certified repairs are rejected as regressions — `epochs/certified-regression.ts:312`, `:357`; also `pr/pr-worktrees.ts:247`. Judgements use short certification units from `:108`, while report lookups use prefixed units. A valid uncertified-100 → certified-96 repair remains a broken match and can be rejected or reverted. Fix: normalize judgement construction, report lookups, and the target comparison at `:110`. **New.**

12. [BLOCKING] Dashboard score tiers retain held matches — `application/dashboard/score-tiers.ts:271`, `:274`. Raw report-derived `row.unit` misses both hold and label indexes. Reproduced: the held function remains in `matches`. Fix: normalize both comparisons. **Already in origin/main.**

13. [BLOCKING] Dashboard workers count held exact completions — `application/dashboard/read-model.ts:3057`, `:3136`, `:3179–3180`. Raw worker/epoch target units miss active rows and revision holds. Completion remains unwithheld, exact counts increase, and unverified run-target counts stay zero. Fix: normalize annotations, revision-hold checks, and counts. **Already in origin/main.**

14. [BLOCKING] Knowledge graph labels held functions as completed evidence — `knowledge/graph/builders/code-graph.ts:100`, `:260`; `knowledge/graph/queries/file-card.ts:56`, `:62`. Raw report keys miss short-unit holds during graph construction and live overlays. Held exact functions remain matched and their files can remain `read_only_complete` reference evidence. Fix: normalize graph keys and file-card comparisons with the shared helper. **Already in origin/main.**

15. [BLOCKING] Single-change ranking misses SMS targets — `board/candidates.ts:36`. `singleChangeUnverifiedKeys()` produces short-unit keys; ranking compares raw prefixed candidate units. Reproduced with explicitly unverified candidates: the single-change target receives no priority, violating §3.4.3. Fix: normalize producer and ranking keys. **New.**

`unverified-matches-evidence.ts` exports short units, but `evidence_search.py:948` conservatively falls back to same-symbol holds. This prefix mismatch does not falsely certify siblings there.

15 blocking findings.

