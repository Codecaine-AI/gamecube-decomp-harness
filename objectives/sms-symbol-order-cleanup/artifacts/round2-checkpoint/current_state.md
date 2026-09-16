<current_state>
<last_updated>2026-09-15</last_updated>
<status>
- Round 2 complete. Five sub-agents audited candidates; parent reviewed, integrated serially, rejected regressions, and completed full verification. User requested one combined patch.
- Combined result: 12 formerly failing TUs now pass, nine additional TUs partially improved. Strict final: 452 pass, 269 fail, 15 coverage errors across all 736 TUs.
</status>
<completed>
- Independent clone /Users/Ford/sms-symbol-order-20260915 on cleanup/strict-symbol-order, upstream ab00c3c9a466152f6e6bc5b9c28aca959d1a8454. Combined patch changes 19 game sources and seven game headers; changes remain uncommitted. No PR opened or updated.
- Round 2 reduced failures 272 -> 269: fishoid, MapCheck, MapObjSirena now pass. Nine other TUs improved. Resolved six missing symbols, five linkage mismatches, and ordering in three files.
- Both rounds together resolve nine missing symbols, 20 linkage mismatches, and ordering in six files. Raw remaining counts: 4523 missing symbols, 41 linkage mismatches, 14 files with ordering failures. Full scan checks exact newly missing/binding names as well as category counts.
- Original ninja baseline preserved; changes_all after candidate batches and all header consumers rebuilt. Final report has 8239 matched functions, 1406804 matched code bytes, 368015 matched data bytes. Gains: three functions, 784 code bytes, 8972 data bytes. Every target function and section checked; no regressions. Data gains include existing sections becoming fully matched through corrected symbol references.
- Final DOL SHA-1 passes: 9f5a8caf56f5356aeac9d3ed28bf8de976a03625. git diff --check and patch application against clean index/reverse application against working tree pass. Live checkout, workers, queues, runtime/configuration, restricted source, validator and PRs 161/162 untouched.
</completed>
<in_progress>None.</in_progress>
<next_actions>
- Review REPORT.md and artifacts/sms-symbol-order-cleanup.patch. Keep this as one combined patch. No need to rerun baseline; doing so would replace the preserved upstream reference.
</next_actions>
<risks_or_open_questions>
- Remaining failures: 136 restricted-library files, 59 empty game files, 74 nonempty game files. Fifteen coverage errors are additional. Whole-file failure count hides partial improvements.
- Rejected and reverted CameraMultiPlayer emission, four-method bath relocation, MarNameRefGen class instantiations, and sun helper relocation. Only the separately verified clearHeightMap move remains from the bath trial. Details and measured losses are in round2-decisions.json and REPORT.md.
- ShadowUtil still has 12 generated-name mismatches despite unique exact-size emitted weak counterparts. IDs advanced by two after game-header changes; refreshed evidence records uniform offset 1287. Template/inlining questions remain unresolved. No forced emission or new placeholder bodies added.
</risks_or_open_questions>
<important_paths>
- REPORT.md and artifacts/sms-symbol-order-cleanup.patch: combined local handoff.
- artifacts/comparison.json, case-ledger.csv, handoff-verification.json: full totals, exact source patch hash, DOL hash, and matching comparisons.
- artifacts/round2-decisions.json and round2-*.md: accepted, rejected, uncertain, and independent-review evidence. Per-batch strict logs, changes_all output, and full report snapshots retained.
- artifacts/baseline-strict/, final-strict/, baseline-report.json, final-report.json: original and final verification. artifacts/round1-checkpoint/ preserves the previous handoff.
</important_paths>
<active_runs>
- None. All build/inventory jobs and sub-agent work finished. Only the isolated Wine prefix was stopped after final verification.
- For future rebuilding, use WINEPREFIX=/Users/Ford/sms-symbol-order-20260915/.wine-audit and initialize Wine outside Ninja with output redirected to a task artifact, preventing background services from retaining Ninja pipes. Never control another prefix or live processes.
</active_runs>
</current_state>
