1. [BLOCKING] **Historical certificates survive changed compile inputs** — `apps/server/src/core/harness-runtime/phases/running/epochs/sync-certification.ts:124–127`. An ancestor pass remains certified when source text matches, even after headers, macros, globals, or compiler inputs change. Newly steering-dependent, higher-scoring code can therefore win sync. Fix: verify certified dependency/input identity or require a fresh pass at ours. **R1-1 NOT RESOLVED; new versus origin/main.**

2. [BLOCKING] **Deduplication deletes conditional definitions** — `apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:709`. Identical definitions in separate `#if`/`#else` branches are treated as duplicates. Reproduced: an unrelated conflict leaves the second branch empty with `error:null`; configurations selecting it lose the function. Fix: preserve conditional scope and deduplicate only proven redundant definitions within the same scope. **New versus origin/main.**

3. [BLOCKING] **Helper cleanup deletes externally used functions** — `apps/server/src/core/harness-runtime/phases/running/epochs/certified-merge.ts:750–753`. Every inserted function is tested only for references inside its translation unit. Reproduced: ours adds externally linked `publicApi()` while upstream adds another function; `publicApi()` disappears as `ours_only_helper_unreferenced`, breaking callers elsewhere. Fix: restrict pruning to proven internal, report-less helpers whose callers were displaced. **New versus origin/main.**

4. [BLOCKING] **Knowledge-v2 credits held SMS matches** — `apps/server/src/core/knowledge-v2/ingest/attempts.ts:144,148`; also `:120`. Raw SQL `unit = ?` compares prefixed worker targets against short steering units. `Animal/AnimalBase::f` is invisible to `mario/Animal/AnimalBase::f`, so `loadAttemptMatchHold()` returns `undefined` and raw 100 earns `match` at `:297–301`. Existing imported matches and the live summarizer also escape withholding. Fix: pass game identity and use shared `unitVariants` normalization in these queries; cover ingestion and summarization. **Already in origin/main.**

Round-1 verification:

| Item | Status | Evidence |
|---|---|---|
| 1 | NOT RESOLVED | Input identity remains unchecked; finding 1. |
| 2 | RESOLVED | Full signatures distinguish overloads. |
| 3 | RESOLVED | Whole-TU checks retain global/address-of references. |
| 4 | RESOLVED | Unmappable C++ takes the operator path with statuses. |
| 5 | RESOLVED | Journal preserves decisions across retries. |
| 6 | RESOLVED | Completion indexes normalize report lookups. |
| 7 | RESOLVED | Board retirement uses normalized holds. |
| 8 | RESOLVED | PR credit uses canonical tagged indexes. |
| 9 | RESOLVED | Checkpoint queries read unit variants. |
| 10 | RESOLVED | Held-file mapping canonicalizes units. |
| 11 | RESOLVED | Certified-regression keys normalize consistently. |
| 12 | RESOLVED | Score tiers use normalized hold lookups. |
| 13 | RESOLVED | Dashboard annotations and counts normalize units. |
| 14 | RESOLVED | Graph construction and overlays expand variants. |
| 15 | RESOLVED | Single-change ranking uses normalized keys. |

Server typecheck passed. Pure reproductions confirmed findings 2–4; injected-git verification confirmed finding 1. Stateful tests were blocked by sandbox `EPERM` during temporary-directory creation.

4 blocking findings.

