# Knowledge V2 Backfill Run Plan

Status: review only. Do not execute phase 3 before Section 9 is approved.

Store: `games/melee/knowledge/knowledge.sqlite`, 47 MB.

## 1. Scope and the Real Population

Pass 1 covers the 2,743 targets with material, not all 20,903 targets.

| Target kind | Count |
|---|---:|
| `function` | 19,828 |
| `unit` | 1,075 |
| `data` | 0 |
| Total | 20,903 |

All targets have `identity_status='current'`. The 2,743 ranked rows contain 1,736 functions and 1,007
units. The other 18,160 targets have no attempt, PR, matching Discord message, or event. Pass 1 excludes
them because there is no archival material from which to propose a delta.

| Material rows | Targets | Treatment |
|---|---:|---|
| 0 | 18,160 | Out of scope |
| 1 | 678 | Below recommended cut |
| 2-5 | 615 | Include only if score reaches cut |
| 6-10 | 337 | Include only if score reaches cut |
| 11-25 | 654 | Include only if score reaches cut |
| 26-100 | 452 | Include only if score reaches cut |
| 100+ | 7 | Include; monitor as outliers |

Recommended pass-1 cut: the 1,442 targets scoring `>= 20`.

The measured distribution is min 3, p25 5, median 20, p75 48, p90 88, max 1,410. The cut includes
the median and more than the top 1,061 targets that carry 80% of score mass. The top 433 carry 50% of
the 98,261 total score mass. Alternative measured cuts are 665 targets at `>= 50` and 1,897 at `>= 10`.
After quality review, process the remaining 1,301 material-bearing targets.

| Signal | Weight |
|---|---:|
| Runs | 3 |
| Submissions | 1 |
| PRs | 4 |
| Discord | 5 |
| Events | 2 |

Every top-30 target has zero attempt runs. The first batches therefore exercise PR and Discord lanes.

| Rank | Stable key | Kind | PRs | Discord | Score |
|---:|---|---|---:|---:|---:|
| 1 | `main/melee/ft/fighter` | unit | 180 | 138 | 1,410 |
| 2 | `main/melee/gr/ground` | unit | 115 | 13 | 525 |
| 3 | `main/melee/pl/player` | unit | 74 | 43 | 511 |
| 4 | `main/melee/it/item` | unit | 86 | 19 | 439 |
| 5 | `main/melee/ft/ftcommon` | unit | 99 | 5 | 421 |
| 6 | `main/melee/gm/gm_1601` | unit | 100 | 4 | 420 |
| 7 | `main/melee/ft/ftcoll` | unit | 87 | 7 | 383 |
| 8 | `main/melee/ft/ftlib` | unit | 84 | 5 | 361 |
| 9 | `main/sysdolphin/baselib/debug:__assert` | function | 0 | 70 | 350 |
| 10 | `main/melee/it/it_2725` | unit | 79 | 1 | 321 |

## 2. Batching

Use 25 targets per batch in exact `kg2-prioritize` order.

`25` is an ASSUMPTION requiring approval. It gives 58 batches for 1,442 targets and 110 for 2,743.
The final batch is partial. Ranked targets average 13.18 material rows, but seven exceed 100 and the
head score is 1,410. This size bounds retry scope while avoiding hundreds of tiny tasks. Process each
subject independently so an outlier does not force completed neighbors to rerun.

Ordering is:

1. `never_indexed` first.
2. `score DESC`.
3. `stable_key ASC`.

All 20,903 targets are cold, so the first rung is a pass-1 no-op. It discriminates on pass 2.

Create one `index_task` row per batch with `pathway='archival_ingest'` and this payload shape:

```json
{"run_id":"<approved run identity>","target_ids":["target:...","target:..."]}
```

Derive the task ID from the run identity and ordered IDs. `enqueueIndexTask` is a plain insert into
`index_task(id,pathway,payload,enqueued_at)`. It performs no JSON validation, dedupe, or upsert.

| API | Real semantics |
|---|---|
| `claimIndexTask` | Sets `started_at` only where `started_at IS NULL AND done_at IS NULL`; this compare-and-set prevents double claims |
| `completeIndexTask` | Sets `done_at` only where `started_at IS NOT NULL AND done_at IS NULL` |
| `stampSubjectIndexed` | Upserts one target state row and replaces `indexed_at` |

For each subject, commit the delta and then stamp it. Complete the task only after every subject in the
payload is stamped.

There are 1,828 pre-existing open tasks: 1,827 `pr_imported` and one `archival_ingest`. All have
`done_at IS NULL`; none has ever been claimed or completed. They are not backfill tasks. Backfill queue
queries must filter both `pathway='archival_ingest'` and the run ID in JSON. Pathway alone is unsafe.

## 3. Coverage and Stop Condition

A target is covered when its `subject_index_state.indexed_at` is newer than its newest material.

| Lane | Timestamp |
|---|---|
| Attempts | `worker_run.closed_at` |
| PRs | `pull_request.merged_at` |
| Discord | matching `discord_message.posted_at` |
| Events | `event.created_at` |

Persist the exact prioritizer matches as `backfill_discord_match(target_id,message_id)` and the approved
manifest as `backfill_run_scope(target_id)`. These are required phase-3 relations, not current DDL.

```sql
WITH attempt_material AS (
  SELECT target_id, MAX(closed_at) newest_at FROM worker_run GROUP BY target_id
),
pr_material AS (
  SELECT target_id, MAX(merged_at) newest_at FROM pull_request GROUP BY target_id
),
discord_material AS (
  SELECT m.target_id, MAX(d.posted_at) newest_at
  FROM backfill_discord_match m
  JOIN discord_message d ON d.id = m.message_id
  GROUP BY m.target_id
),
event_material AS (
  SELECT target_id, MAX(created_at) newest_at FROM event GROUP BY target_id
),
material AS (
  SELECT target_id, MAX(newest_at) newest_at
  FROM (
    SELECT * FROM attempt_material
    UNION ALL SELECT * FROM pr_material
    UNION ALL SELECT * FROM discord_material
    UNION ALL SELECT * FROM event_material
  ) GROUP BY target_id
)
SELECT s.target_id, m.newest_at, sis.indexed_at
FROM backfill_run_scope s
JOIN material m ON m.target_id = s.target_id
LEFT JOIN subject_index_state sis ON sis.target_id = s.target_id
WHERE sis.indexed_at IS NULL OR sis.indexed_at <= m.newest_at
ORDER BY s.target_id;
```

Stop only when that returns zero rows and this returns zero rows:

```sql
SELECT id, started_at, done_at
FROM index_task
WHERE pathway = 'archival_ingest'
  AND json_extract(payload, '$.run_id') = '<approved run identity>'
  AND done_at IS NULL;
```

Keep the run scope immutable. New material makes a stamped target uncovered again.

## 4. Runs Against CURRENT Library State, Never From Scratch

Every pass calls `knowledgeRecord(store, { targetId })` first.

That view returns subject identity, facts, evidence, and incoming and outgoing links. Facts include
value, rationale, confidence, update time, and ordered evidence. Evidence includes kind, locator,
digest, why, and capture time. Links include direction, role, why, provenance, and the other identity.

The agent proposes deltas against this assembled state.

| Current table | Rows |
|---|---:|
| `fact` | 0 |
| `evidence` | 0 |
| `link` | 0 |

Pass 1 is genuinely cold. Pass 2 and later are not. The same code path must serve both. A pass may not
blindly overwrite the record, replace a fact without resolving its current value, or drop evidence or
links because the new source did not mention them.

The v2 successor should retain the v1 `librarian-backfill.ts` shape of deterministic batches,
source-shaped inputs, structured validation, bounded concurrency, and resume state. V1 groups by
source and appends ledger records. V2 groups by subject, reads `knowledgeRecord`, and commits deltas.

## 5. Cost and Throughput

The recommended cut makes exactly 1,442 subject-agent calls. The full population makes exactly 2,743.
This uses one call per subject.

| Material | Total | Per subject |
|---|---:|---:|
| Worker runs | 5,344 | 1.95 |
| Submissions | 14,718 | 5.37 |
| PRs | 12,954 | 4.72 |
| Discord hits | 3,139 | 1.14 |
| Events | 0 | 0 |
| Total | 36,155 | 13.18 |

| Overlap | Targets |
|---|---:|
| Attempts only | 711 |
| PRs only | 755 |
| Discord only | 941 |
| Attempts and Discord | 99 |
| PRs and Discord | 237 |
| Attempts and PRs | 0 |
| All three | 0 |

No target has both attempt and PR history. The populations are fully disjoint: 810 attempt targets plus
992 PR targets equals 1,802 distinct targets. A pass usually reads one major lane.

| Variable | Meaning | Cut | Full |
|---|---|---:|---:|
| `N` | Calls | 1,442 | 2,743 |
| `B` | ASSUMPTION: batch size | 25 | 25 |
| `Q=ceil(N/B)` | Tasks | 58 | 110 |
| `T` | ASSUMPTION: time per subject | Operator supplies | Operator supplies |
| `C` | ASSUMPTION: concurrency | Operator supplies | Operator supplies |
| `K` | ASSUMPTION: tokens per subject | Operator supplies | Operator supplies |

Wall time formula: `ceil(N/C) * T`. Token formula: `N * K`, which is `1,442 * K` or `2,743 * K`.
Dollar cost is the token total times approved input and output rates. No dollar figure is supportable
because no token rate or tokens-per-subject measurement was supplied.

## 6. Failure and Resume Semantics

A mid-batch crash leaves `started_at` set, `done_at` null, and some subjects possibly stamped.

1. Read the payload and recompute coverage.
2. Skip currently covered subjects.
3. Re-read `knowledgeRecord` and process uncovered subjects.
4. Complete only when every payload subject is covered.

The claim compare-and-set prevents double claim but cannot reclaim a stale started row. After proving no
worker owns it, recovery must atomically clear `started_at` only where task ID, old `started_at`, and
`done_at IS NULL` match. Normal claim can then acquire it. Do not create a replacement ID.

| Operation | Idempotence |
|---|---|
| Claim | Yes; compare-and-set |
| Complete | Yes; guarded update |
| Stamp | Conditional; API does not enforce newer timestamps |
| Record read | Yes; read-only |
| Delta | Must use stable identities and dedupe |
| Enqueue | No; duplicate primary key fails |

Commit the delta before stamping. A stamp without a committed delta is false coverage. A delta without
a stamp is safely retryable only when delta identity deduplicates replay.

## 7. Operator Kill Switch

Use a run-scoped stop flag checked before each claim and each subject. It stops new work; a delta already
in a transaction may finish and stamp.

Phase 3 must add these controls. They do not exist today:

```sh
bun run server:job -- --game melee kg2-backfill-control --run-id '<run>' --stop
bun run server:job -- --game melee kg2-backfill-control --run-id '<run>' --resume
```

```sql
SELECT COUNT(*) total,
 SUM(started_at IS NULL) unclaimed,
 SUM(started_at IS NOT NULL AND done_at IS NULL) active,
 SUM(done_at IS NOT NULL) done
FROM index_task
WHERE pathway='archival_ingest'
 AND json_extract(payload,'$.run_id')='<run>';
```

Run that query until counts stop changing, and run this until no new stamp appears:

```sql
SELECT COUNT(*) stamped_subjects, MAX(indexed_at) newest_stamp
FROM subject_index_state
WHERE target_id IN (SELECT target_id FROM backfill_run_scope);
```

The 1,828 existing tasks must not enter either check. Resume with `--resume`, reclaim verified stale
work as described in Section 6, and continue the same manifest.

## 8. Known Limitations

Discord matching is case-sensitive whole-token equality. Units match only dotted source basenames such
as `fighter.c`. Bare `float`, `list`, `state`, `math`, and `debug` inflated counts by up to 7x.
`fighter` had 900 hits before the fix and 138 after it.

| Stoplisted token | Raw hits |
|---|---:|
| `main` | 548 |
| `callback` | 85 |
| `reset` | 49 |
| `cb` | 29 |
| `exit` | 24 |

These are `AMBIGUOUS_SYMBOL_TOKENS`. Recall is deliberately conservative; unit mentions without the
`.c` filename are missed.

`knowledge-index.sqlite` did not exist for the measurement. The query scanned 76,086
`discord_message` rows, about 5.6 MB of content, in 0.94 seconds. FTS is an optimization, not a need.

Wiki is structurally absent: `wiki_section` is 0, no wiki watermark exists, and wiki coverage is 0.
A separate workstream owns that lane. Events are also 0.

The never-indexed rung is a pass-1 no-op because `subject_index_state` is 0 and all 20,903 targets are
cold. It becomes meaningful on pass 2.

The store has 6,316 entities: 1,075 files, 628 structs, and 4,613 struct fields. Ranking covers targets.

## 9. What the Operator Must Approve Before Phase 3 Executes

1. [ ] **Cut.** Approve 1,442 at `score >= 20`; choose 665 at `>= 50`; choose 1,897 at `>= 10`; or
   approve all 2,743 material targets.
2. [ ] **Batch size.** Approve ASSUMPTION 25, giving 58 cut tasks or 110 full tasks; or replace it and
   recompute task counts.
3. [ ] **Weights.** Approve runs 3, submissions 1, PRs 4, Discord 5, events 2; or rerank with new values.
4. [ ] **Discord.** Approve case-sensitive tokens, dotted unit basenames, and the five-token stoplist;
   or change them and remeasure coverage, overlap, ranks, and concentration.
5. [ ] **Scope and controls.** Approve targets only and defer 6,316 entities, or add an entity lane.
   Require the kill switch and stale-claim recovery before execution.

Run these exact commands from the repository root:

```sh
bun run server:job -- --game melee kg2-prioritize --limit 20903 --json | jq '.summary'
bun run server:job -- --game melee kg2-prioritize --limit 20903 --json | jq '.rows | length'
bun run server:job -- --game melee kg2-prioritize --limit 10 --json \
 | jq '.rows | to_entries | map({rank:(.key+1), stable_key:.value.stable_key, kind:.value.kind, attempts_runs:.value.attempts_runs, prs:.value.prs, discord:.value.discord, score:.value.score})'
bun run server:job -- --game melee kg2-prioritize --include-zero --limit 20903 --json \
 | jq '{summary, rows:(.rows | length)}'
bun test apps/server/src/core/knowledge-v2/migration/prioritize.test.ts
```

The first command must report `total_targets=20903`, `targets_with_material=2743`, and
`never_indexed=20903`. The second must report 2,743 rows. The fourth must report 20,903 rows. These
commands are read-only; the test asserts that `PRAGMA data_version` does not change.

---

# ADDENDUM — supersedes Sections 1 and 5 numbers (post-restructure, 2026-08-31)

The store was restructured after this plan was written, on the operator's direction: targets are
workable items only (function | data); translation units are entities; the file entity kind is gone;
pull_request carries a target XOR entity subject. Function-level PR attribution was recovered from
the decomp-dev CI report tables, and data-section targets were added. The prioritizer now separates
DIRECT material (the target's own PRs, runs, discord mentions, events) from INHERITED unit-level
material (the unit entity's PRs, unit-basename discord), ranks on direct, and tiebreaks on inherited.

## Current numbers (kg2-prioritize, read-only, against the rebuilt store)

- Targets: 22,237 (19,828 function + 2,409 data; no unit targets).
- targets_with_direct_material: 7,373. Inherited-only: 14,363. No material at all: 545.
- source_coverage: attempts 839 · prs 6,662 · unit_prs 21,520 · discord 1,049 · unit_discord 7,528 ·
  wiki 0 (structural) · events 0.
- match_pct of the direct population: 6,926 at 100%, 442 below 100%, 5 unknown.
- Direct-score histogram: 1 → 4,906 · 2-5 → 1,619 · 6-10 → 186 · 11-25 → 288 · 26-100 → 373 · 100+ → 1.

## What this changes about the decisions in Section 9

1. CUT — re-decide on the direct-score histogram above (the old 1,442 @ >=20 figure is void).
   The long tail is 4,906 targets with exactly one direct PR row; the head above score 25 is ~374.
   A defensible pass-1 shape: everything with direct_score >= 6 (~847 targets) first, then the
   one-PR tail as cheap follow-up batches.
2. BATCH SIZE / WEIGHTS — unchanged as assumptions; weights now also cover unit_prs and
   unit_discord as inherited tiebreak channels (weight constants in prioritize.ts).
3. DISCORD RULES — two decided-in-code rules to ratify: data-target symbols (section names) never
   match discord directly; the 5-token stoplist stands. One open judgment: `__assert` (70 msgs) and
   `OSReport` (57 msgs) top the ranking because crash logs get pasted to Discord — real mentions,
   debatable value. Options: leave (librarian will judge), stoplist them, or discount
   already-at-100% targets in ordering.
4. MATCHED TARGETS — 94% of the direct population is already at 100% match. The backfill builds
   knowledge records, not matches, so this is not a filter by default — but if pass 1 should favor
   the 442 unmatched-with-material targets, that is a one-line ordering change to approve.
5. ENTITY SWEEP — unchanged: 6,316 entities (1,075 translation_unit, 628 struct, 4,613 struct_field)
   are out of scope for pass 1 unless an entity lane is approved. Unit-level PR history (12,953
   entity-keyed rows) reaches function passes through the ledger view's unit arm.
