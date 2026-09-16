# Melee TU Semantic Backfill Plan

Status: proposed workflow. Both local checkouts now contain current upstream and their fresh reports show 100% matched code, data, and functions. Both builds passed main.dol hash validation. Mechanical KB reconciliation migrated 13 renames and imported eight PR archives. No semantic campaign has started.

## Outcome

Review the completed Melee source TU by TU. Each TU gets an evidence-backed account of its functionality, canonical and proposed names, types, data and state flow, and relationships to other files. Publish its canonical source, final rendered reading view, and unresolved questions alongside the account.

The campaign covers all TUs, including ones already indexed or already well named. Completion means complete review and explicit uncertainty, not a guessed name for every identifier. A 100% matching build establishes the source baseline; it does not establish 100% semantic understanding.

## Baseline

Pin upstream revision 05a1394faea2aac458e4bdd030621d8a5631ae62, fetched on 2026-09-08. The normal checkout is at that revision. The cycle checkout contains it through merge c302741689bd67c361cd7faadb221df3193992c3 and has an identical tracked tree. Refresh these pins before campaign launch if upstream changes again.

Build and reconcile before freezing the manifest. Preserve a SQLite-consistent KB backup. Import the latest naming PRs, preserve recognized rename continuity, extract entities, reanchor unchanged evidence, and report remaining semantic drift. Do not treat mechanically migrated facts as re-reviewed facts.

The 2026-09-08 audit found 22,389 current KB targets, all reconciled to c302741689. Two malformed report entries have no address and cannot become normal targets. The evidence preview examined 212,145 code citations: 176,174 can be reanchored, 35,954 have changed content, and 17 refer to a missing path. These counts describe citations, not distinct functions or invalid semantic claims. Prioritize changed citations during the TU pass.

Reanchoring is now applied. The full post-sync drift scan reviewed 23,207 subjects and flagged 8,835. It queued 914 review tasks without starting agents. Across all code evidence, 176,174 citations are unchanged, 31,884 drifted, and 4,087 are unresolvable at the new revision. The full scan classifies evidence differently from the snippet-reanchor preview; both leave 35,971 citations for investigation. SQLite integrity and foreign-key checks passed. Full-text archival search was refreshed; embeddings were not regenerated.

Eight new PR-import librarian tasks are queued. Archive ingestion and search indexing do not imply their semantic review is complete. The paused decomp run and its historical lifecycle checkpoint are not a semantic campaign and must not be resumed as a substitute.

The Git update used a fast-forward and a history-preserving merge. It did not publish a dashboard sync boundary or advance the paused matching run's saved lifecycle checkpoint. The future semantic campaign must pin the current checkout explicitly and maintain its own manifest and checkpoints.

## Agent Hierarchy

1. The campaign coordinator freezes the manifest, assigns ownership, enforces budgets, and tracks coverage. It spawns TU agents and later schedules family reviews.
2. A TU agent reads its complete source and rendered view, divides it into coherent research clusters, and spawns librarians. It owns the final account of that TU.
3. Librarians investigate bounded function/data clusters using canonical code, rendered code, headers, callers/callees, data references, and relevant archived evidence. They return structured proposals and evidence; they do not directly edit the shared KB.
4. The TU agent reconciles contradictions and naming collisions. An independent reviewer checks promoted names and cross-file conclusions against canonical evidence. A single apply service validates accepted proposals and preserves before/after facts and evidence.
5. The coordinator schedules remaining shared-entity and cross-TU work, then assembles final subsystem documentation. A TU can be locally reviewed while still waiting for a family decision; its final document is regenerated when those decisions settle.

Use one shared permit pool across the hierarchy. Idle parents must not prevent their children from getting permits. Stop requests stop new claims and propagate to descendants. Resume uses saved task IDs, proposals, and coverage, never list positions.

## Work Unit and Coverage

Use a manifest entry keyed by campaign, source revision, TU identity, and file hash. Include C/C++/assembly, corresponding headers, source documentation, symbol maps, and explicitly assigned shared/header-only material. Inventory the full repository scope, not only src/melee. Record generated/vendor exclusions with reasons.

Every source file must have recorded canonical and rendered page ranges. Follow rendering continuation until the file is exhausted. Existing automatic context is only a preview. Record renderer failures, parse gaps, and oversized files as exceptions requiring disposition, not completed reads.

Keep the naming-fact IDs and versions used in each rendering. The canonical source hash alone does not identify a rendering when the KB changes. Freeze render inputs within a review stage; apply findings between stages and regenerate affected files.

Small TUs need one or two librarians; large TUs need several coherent clusters. Shared struct and header facts get a designated owner. Other TUs send proposals to that owner instead of racing to replace the same fact.

## Per-TU Deliverables

Default publication target is the existing docs viewer, with one page per TU and links to immutable artifacts. This is a planning assumption pending the user's preference; it does not require changing source comments during research.

1. A functionality document covering purpose, entry points, state/data flow, dependencies, invariants, and behavior observed in canonical code.
2. A naming table with canonical symbol, historical aliases, proposed descriptive name, rationale, evidence, and review outcome. Distinguish historically attested spelling from inferred behavior.
3. Canonical and final rendered source snapshots with revision, file hashes, naming-fact versions, replacement mappings, and rendering exceptions.
4. Structured proposals, validation results, and before/after facts and evidence so accepted changes are auditable and reversible.
5. A coverage and uncertainty record listing reviewed subjects, retained supported facts, unresolved questions, and family/shared-entity followups.

Draft the account during research, reconcile it after review, and mark it final only after the accepted KB updates and final rendering agree. Explicit unknowns remain visible in final documents.

## Evidence and Naming

Rendered names are reading aids and cannot justify their own meaning. Cite canonical source locations. Resolve original code and archived history when researching a proposed name. For a family pattern, cite multiple examples and record exceptions.

Review existing inferred names against newly adopted upstream conventions, including camera and ftBossLib changes. Do not merely carry forward older naming prose. Preserve target.symbol as canonical; semantic proposals do not directly rename source code. Any eventual source rename batch needs separate matching/build validation.

The sync's sample rendering demonstrates this review need: upstream Camera_RequestQuake is still rendered as the inherited hypothesis Camera_StartQuake. Other hypotheses now equal upstream names, such as Camera_Init and ftBossLib_GetMotionId. Reconcile redundant or superseded hypotheses while preserving their history. A meaningful upstream name remains the default unless evidence supports a distinct semantic interpretation; rendering must keep that distinction visible.

## Runtime Work Required

The current catalog explicitly forbids child spawning, and each invocation gets a single-agent catalog. Implement an allowlisted research hierarchy or an isolated campaign runtime. Keep existing matching-worker restrictions intact.

Required pieces are a manifest/checkpoint store, coordinator and TU agent definitions, bounded child spawning, shared cancellation/budget accounting, writable-subject ownership, independent review, proposal history, and TU document/render generation.

Reuse existing librarian research tools, source renderer, evidence locators, structured proposal validation, and index infrastructure. Add a semantic-sweep pathway rather than manufacturing run-closed or drift events. Existing backfill skips indexed targets and is not the campaign selector.

Entity extraction currently only scans src/melee headers and uses partial parsing. Expand coverage or maintain explicit unresolved inventory for complex declarators, shared library headers, parameters, and stale entities. Rendering currently substitutes function names only; data, fields, and parameters require explicit review.

Update dashboard catalog conversion, Agent prompt previews, placeholder hydration, and nearby Bun tests with agent/context changes. Tests should cover resume without duplicate application, stable ownership, complete pagination, naming collisions, canonical evidence, child cancellation, shared concurrency limits, and stage/version consistency.

## Pilot and Scale

Start with 16 TUs across named references, address-heavy code, fighter/item/stage families, and shared libraries. Include the recently renamed camera and boss-library code. Associated headers have explicit ownership.

Suggested pilot limit: one coordinator, two TU agents, two librarians per TU, and one independent reviewer, for eight live agents maximum. Allow 60–90 minutes initially, then estimate the full run from measured agent-minutes by TU complexity and reviewer throughput. This is a planning allowance, not a measured forecast.

Expansion can use four TU agents, up to six librarians per TU, and two reviewers with one coordinator, capped at 31 live agents. These are proposed limits, not a committed full-run budget.

Scale only after the pilot demonstrates full range accounting, resolvable evidence for promoted claims, no circular use of rendered names, validated ownership, and reviewable final documentation. Measure accepted/rejected names, corrected facts, unresolved contradictions, family patterns, cost, and time.

## Next Implementation Step

Build the immutable manifest and preview a 16-TU assignment without invoking models. Then implement and test the bounded hierarchy and artifact pipeline before starting the pilot.
