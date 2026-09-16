<current_state>
<last_updated>2026-09-15</last_updated>
<status>
- Completed the bounded cleanup and final verification. Nine formerly failing TUs now pass strict validation; remaining and uncertain cases are documented.
</status>
<completed>
- Independent clone /Users/Ford/sms-symbol-order-20260915, branch cleanup/strict-symbol-order, upstream ab00c3c9a466152f6e6bc5b9c28aca959d1a8454. Changes remain uncommitted and reviewable in eleven game source/header files. No PR opened or updated.
- All 736 tracked TUs compiled and checked. Strict failures 281 -> 272, passes 440 -> 449, execution/coverage errors unchanged at 15. Fixed 15 linkage mismatches, three missing symbols, and three files with ordering errors. No strict regressions.
- ninja baseline preceded edits; changes_all ran after each logical change. Entire final matching report equals baseline: 8236 matched functions, 1406020 matched code bytes, 359043 matched data bytes.
- Final ninja build passes SHA-1: 9f5a8caf56f5356aeac9d3ed28bf8de976a03625. Source patch checked against the clean index and reverse-checked against the patched tree; git diff --check passes.
- Live checkout, workers, queue, runtime state and configuration untouched. SDK, middleware, runtime, THPPlayer, validator, and CI untouched.
</completed>
<in_progress>None.</in_progress>
<next_actions>
- Review REPORT.md and artifacts/sms-symbol-order-cleanup.patch. The next implementation work requires selecting an evidence-backed remaining case from artifacts/case-ledger.csv; do not fabricate bodies for empty files.
</next_actions>
<risks_or_open_questions>
- 59 empty game files account for 3321 missing symbols. 136 restricted-library failures remain read-only. Raw totals retain compiler-generated-name and map-resolution limitations.
- ShadowUtil has twelve emitted functions whose generated numeric names differ; normalization policy unresolved. MapMirror/MapObjLib template-emission ordering and PauseMenu2 inlining need caller/codegen analysis.
- Existing UNUSED-size warnings and placeholder bodies are unchanged. Passing strict validation does not establish matching or source authenticity.
</risks_or_open_questions>
<important_paths>
- REPORT.md: result, fixes, remaining/uncertain findings, evidence, reproduction.
- artifacts/comparison.json and artifacts/case-ledger.csv: complete before/after inventory.
- artifacts/baseline-strict/ and artifacts/final-strict/: per-TU raw strict results and fingerprints.
- artifacts/baseline-report.json, artifacts/final-report.json, artifacts/baseline-objects/: matching evidence.
- artifacts/sms-symbol-order-cleanup.patch: source-only patch against upstream.
</important_paths>
<active_runs>
- None. All build and inventory jobs completed. Only the isolated Wine prefix was stopped at handoff.
- Before another rebuild that launches Wine, initialize that prefix with stdout/stderr redirected to a file outside Ninja, to avoid its background services holding Ninja output pipes open.
</active_runs>
</current_state>
