# Knowledge Naming and Code Rendering Research

Research completed September 5, 2026, local time. This is a proposal and working research record, not an implemented contract. The database inventory was read in one SQLite transaction at 2026-09-06T02:13:53Z. No knowledge records or game source were changed.

## Recommendation

Build a read-only code projection that applies explicit, scoped naming hypotheses to source identifiers. Keep the canonical source and symbol identities authoritative for edits, tools, and citations. Use the same projection for the dashboard, agent reads, and generated documentation examples.

The first scope should be one translation unit with function declarations and calls. Extend to struct definitions and member accesses after adding reliable bindings and field-name coverage. A complete object view is feasible, but the current naming facts cannot support replacing every identifier.

## Inventory

The repeatable script is `analysis/kb-naming-audit-2026-09-05/audit.py`. Its default database connection is read-only. Run it from the repository root with Python 3. Outputs are `summary.json`, `naming-facts.csv`, and `other-facts-name-language.csv` beside the script.

| Measurement | Count |
| --- | ---: |
| All live fact rows scanned | 119,322 |
| Naming facts | 9,094 |
| Bare identifier-shaped values | 1,505 |
| Quoted identifier-shaped values | 687 |
| Prose or other values | 6,902 |

Identifier shape is only a lexical screen. It does not establish C validity, uniqueness in scope, correct meaning, or fitness for rendering.

Naming subjects comprise 8,734 current functions, 316 current data sections, 41 active translation units, two moved functions, and one unresolved data section. No naming facts are attached to structs, struct fields, parameters, game concepts, or patterns. The store nevertheless contains 628 structs, 4,613 struct fields, and 25,285 parameters, including historical identities.

The lexical candidates flag 15 values equal to their current canonical symbol and 153 differing candidates that already occur as a current symbol somewhere. Existing spellings can be legitimate in separate scopes. There are also 313 naming values containing `or` or `alternatively`, and three inactive subjects. The prose search flags 351 other facts across all five remaining fact types. These searches deliberately produce review queues, not semantic findings. They miss naming claims phrased differently and include false positives such as explanations of existing names. No evidence-freshness scan or semantic audit of every record was performed.

## What Exists Today

| Area | Current Behavior and Research Finding |
| --- | --- |
| Storage | `apps/server/src/core/knowledge-v2/storage/schema.ts:94` stores `value`, `rationale`, confidence, and evidence-backed claims. There is one live fact per subject and type. There is no separate proposed-identifier field. |
| Submission validation | `apps/server/src/core/knowledge-v2/apply/index.ts:279` checks generic fact shape and confidence. Later apply code resolves scope and citations. It does not require identifier syntax, reject a redundant canonical name, or check naming collisions. |
| Naming generation | `apps/server/src/core/agent-catalog/agents/knowledge/librarian-v2/prompt.ts:118` asks for a plausible original developer name, permits better-name proposals on already named symbols, and forbids restating the symbol. The backfill prompt uses a shorter rule at line 72. Neither requires a bare identifier. |
| Worker and dashboard rendering | `apps/server/src/core/knowledge-v2/card.ts:540` wraps name values as guesses with confidence. `apps/frontend/src/pages/workspace/knowledge/record.tsx:55` shows guess text and a confidence badge. These render facts, not renamed source. The raw record tool and dashboard search have different formatting paths, so they also need a shared naming presentation contract. |
| Renames and drift | `apps/server/src/core/knowledge-v2/ingest/reconcile.ts:167` moves facts between canonical identities and resolves fact collisions by timestamp. The librarian prompt at line 191 asks it to rewrite old-symbol mentions and clear guesses that landed. This is an instruction to the model, not a dedicated identifier comparison gate. |

The source review rules include conservative naming and a ban on global rename aliases made with `#define`. Neither is a substitute for validating the knowledge naming contract. A reading projection should not require source aliases.

The documented fact contract currently permits prose and describes an inferred name as a human-readable name or role. The librarian prompt instead emphasizes the original developers' probable spelling. That mismatch helps explain the database contents. Before cleanup, make the intended distinction explicit: a useful semantic reading name does not claim recovery of an original spelling.

## Proposed Name Contract

For code-addressable subjects, make `inferred_name.value` exactly one preferred identifier. Put the explanation, uncertainty, and rejected alternatives in the existing rationale. Preserve confidence and original evidence. This uses the current one-fact-per-type model without introducing a second unsynchronized name store.

If original-spelling hypotheses need independent tracking later, introduce a structured distinction with separate evidence and confidence. Do not silently convert confidence about behavior into confidence about historical spelling.

Validation must depend on subject kind. A concept label or unit label can contain spaces or a path and should not be forced through a C identifier rule. A data-section claim is not a binding to a variable. A projection entry should resolve to a specific declaration and source revision before becoming substitutable.

## Rendering Contract

The projection should return source revision and content hash, the canonical source locator, rendered text, and a mapping of each substituted occurrence to its canonical identifier, subject, proposed name, confidence, and supporting fact. Keep it outside the editable worktree. Agents request it on demand; normal boot context needs only its availability and a small summary.

Resolve bindings with a parser or compiler-backed symbol analysis. Tokenization prevents edits inside comments and literals but cannot distinguish unrelated fields called `x14`, static functions with the same spelling in different units, or shadowed variables. Unresolved bindings remain canonical and are reported as omitted. Never replace raw substrings globally.

Preserve original line references through an occurrence map. Display a persistent hypothesis label, support original and proposed views, and expose the canonical symbol beside each alias. Disambiguate collisions by scope or leave conflicting occurrences unchanged. Stale mappings must be rebuilt against the active checkout, including uncommitted source content, rather than trusted from a HEAD identifier alone.

The existing extractor needs additional scrutiny before member rendering. `ingest/entities.ts:216` identifies structs by name and fields by struct plus field spelling. Parameters receive sequential `r3`, `r4`, and later slots at line 116. Those identities are useful KB anchors but do not by themselves establish full C binding or PowerPC ABI correctness for all parameter types. Locals have no durable entity identity under the current contract. Use revision-scoped bindings for local reading aliases if that feature is added.

Data targets are created from report sections in `ingest/reconcile.ts:390`. A fact attached to `.sbss` may describe a pointer within that section. It must never cause `.sbss` to be substituted with the pointer's name. Variable-level identities or a derived declaration binding are required first.

## Concrete Pilot

The active checkout at research time was cycle `c66a1559-2865-4602-96bf-c4907f200c4e/current`, HEAD `5a1156fc38`. In `src/melee/ft/kinds/ftLink/ftlinkspecialn.c`, the KB proposes:

| Canonical Source Symbol | Proposed Reading Name | Confidence |
| --- | --- | ---: |
| `ftLk_SpecialN_ProcessFv10` | `ftLk_SpecialN_RemoveArrow` | 0.84 |
| `ftLk_SpecialN_ProcessFv14` | `ftLk_SpecialN_RemoveBow` | 0.94 |

The source bodies at lines 120 and 131 conditionally pass an object to an item helper and clear the object pointer. This makes a useful real pilot. It also exposes a naming gap: the arrow pointer is `arrow_gobj`, while the corresponding other field is still `x14`. A proposed `bow_gobj` field name would require its own evidence and binding; it must not inherit the function-name confidence automatically.

## Cleanup and Delivery Process

1. Establish the naming contract and enforce it at submission. Update both librarian prompts, validation, examples, dashboard prompt previews, and nearby Bun tests together. Keep existing prose readable during migration.
2. Generate a snapshot-backed dry-run cleanup plan. Normalize unambiguous wrapped identifiers mechanically. Extract sentence-embedded candidates into proposals while retaining the complete original text, rationale, evidence, and fact version. Never select the first code-like word from arbitrary prose.
3. Review ambiguous proposals by translation unit, with current code, related facts, callers, callees, and types. Handle conflicting alternatives, already-landed names, stale subjects, and field or parameter names embedded in function prose. Use the librarian apply path and recheck fact versions before committing batches, since workers and librarians may still be active.
4. Pilot the read-only projection on the Link neutral-special unit. Verify declaration and call consistency, shadowing, comments and strings, collision behavior, skipped bindings, unchanged source files, and canonical citations. Reuse the renderer in the dashboard and agent tool; synchronize prompt previews if injected context changes.
5. Expand the audit and projection by subsystem. Report mapped and omitted occurrences, unresolved proposals, and new name-validation failures. Generate docs from the same canonical mappings and preserve uncertainty and citations. Measure whether agents identify missing behavior more accurately before enabling the view by default.

Formatting cleanup is distinct from validating a hypothesis. Even a correctly formatted, high-confidence name may be wrong. Acceptance for this work means the rendering is traceable and the cleanup preserves evidence, not that every proposed name has become historically correct.

## Regex and Terra Batch Follow-Up

The user requested regex extraction, a symbols footer, and Terra agents at low reasoning to finish the remaining batches. `analysis/kb-naming-audit-2026-09-05/normalize_names.py` extracts candidates through five anchored sentence forms and checks prefix changes, callback suffixes, placeholder patterns, scope collisions, and alternative language. It extracted candidates from 8,858 of 9,094 values in under one second on this machine. This is extraction coverage, not a correctness score.

Four Terra batches handled the 236 unparsed rows. Four more reviewed 3,158 extracted rows carrying flags. The original 5,700 unflagged rows remain regex-only. All eight batches have exact fact-ID coverage. The combined validator checks candidate syntax, occurrence in the original claim or rationale, decisions, and complete review coverage.

| Final Disposition | Rows |
| --- | ---: |
| Single-name normalization proposal | 8,535 |
| Ambiguous or conflicting | 315 |
| Label or aggregate rather than one symbol | 213 |
| Already equals canonical symbol | 23 |
| No recoverable name | 8 |

Of the single-name proposals, 7,125 change the value's formatting and 1,410 already have that format. A normalization proposal does not establish a binding: names on non-function subjects still need declaration bindings, and same-unit collisions are separately flagged. Agents interpreted aggregate records conservatively, so unresolved labels and section members need another pass before rendering.

`combine_batches.py` creates `cleanup-plan.jsonl`, `cleaned-names.csv`, `remaining-review.jsonl`, and `cleanup-summary.json`. The plan retains each original value, rationale, confidence, fact version, and evidence count. Proposed rationale text preserves any replaced prose. Evidence itself remains in the untouched KB. Applying the plan would require a fresh snapshot, a fact-version check, and the normal controlled write path.

`reviewed-symbols-footer.txt` demonstrates the user's proposed end block for Link's neutral-special unit. It maps canonical symbols to proposed names with confidence and disposition. It currently lists naming facts belonging to that unit, not every symbol referenced by its source. A production footer should inventory the source's declarations and references first, then attach these mappings.

## Live Cleanup Completed

The user authorized the prompt/context contract and live KB cleanup. Both librarian prompts, turn prompts, injected contexts, output schema descriptions, and dashboard previews enforce the direct-name contract. The apply layer rejects malformed naming values and names equal to the canonical symbol. Functions and mechanical code entities require a C identifier; other subjects can carry short direct labels or filenames. The Fact contract documentation was updated through the docs-server API.

Four additional Terra batches resolved the 536 remaining review entries other than canonical duplicates. Final review retained existing candidate spellings where agents had introduced unsupported changes. Explanations and alternative names remain in rationale, with confidence unchanged. These names continue to be hypotheses, not verified source renames.

The live transaction checked all 9,094 input facts against their exact original value, rationale, confidence, and update timestamp. It updated 7,575 values, cleared 28 redundant or unsupported names, and left 1,491 already-valid names unchanged. All 9,066 remaining naming facts passed the shared validator after application. The maintenance path archives exact before-images, including evidence, before changing rows. Surviving evidence is left untouched.

The full backup is `games/melee/knowledge/backups/knowledge-2026-09-06T023410Z-pre-direct-names.sqlite`. The paired `knowledge-2026-09-06T023410Z-direct-names-before.jsonl` stores all changed and cleared records. `analysis/kb-naming-audit-2026-09-05/live-cleanup-result.json` records the applied counts. The earlier proposal files remain historical audit inputs.

Validation: 42 naming/apply/maintenance tests and 47 librarian-context/dashboard tests passed. The full TypeScript check still reports errors outside the changed naming paths, including existing cycle route fixtures and compile-option types. The repository-wide documentation audit reports 733 errors and 27 warnings in the existing corpus. The changed contract rendered successfully, and the docs API accepted the edit. Rendered source substitution remains the next implementation stage.
