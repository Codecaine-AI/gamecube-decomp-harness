# Independent verification-script review

Read-only review of `verify_batch.py`, `compare_matching.py`, generated Ninja edges, and current report schema.
No script modifications made.

## Broad matching coverage is present

`ninja changes_all` depends on report.json; that report depends on `all_source`, not only caller-supplied units.
Compiler rules emit transformed GCC depfiles and Ninja tracks header consumers.
Thus per-function, per-section, and selected per-unit measures are compared across all 736 target units after a broad header rebuild.
Current report contains 12,881 target functions and 2,812 sections with no duplicate names inside any unit/group.
The comparator checks unit and target symbol key coverage and reports every decreasing fuzzy score; it also detects falling matched-code/data/function totals per unit.

Ninja dependency inventory finds 74 compiled consumers of MarioGamePad.hpp, 8 of TimeRec.hpp, and 141 of GameSequence.hpp.
Saved inventory: round3-system-header-consumers.json.

## Gaps requiring parent workflow checks

1. `verify_batch.py` is an evidence collector, not a pass/fail gate: after a successful build it returns success even if the comparison contains regressions or strict exits are nonzero.
   The parent must inspect comparison_to_before and comparison_to_baseline, and handle coverage exceptions as rejected/incomplete evidence.
   This is especially important when a header candidate improves one TU but damages another.
2. Strict validation only runs on the explicitly supplied units.
   Broad header consumers can gain linkage/missing/order errors even if every fuzzy score is unchanged.
   Run the final 736-unit strict inventory and named-failure comparison before declaring the combined patch verified; ideally scan all changed-object consumers per header batch.
3. `before` is read from an existing report before Ninja runs.
   Sequential parent integration with a verified/restored report is essential; dirty concurrent edits or an old report can make the apparent per-batch delta include unrelated work.
   The caller currently follows this serial discipline.
4. Fuzzy percentages and matched totals do not prove identical instructions at partial scores.
   Equal scores can contain different mismatches, and missing fuzzy fields are treated as zero.
   Claims should remain “no reported matching regression,” with source/assembly review for behavior and byte-identical claims verified separately.
5. Target symbol maps are keyed by names; duplicate names would silently collapse, and no target size/address/metadata invariants are enforced.
   No duplicate target names exist in the inspected report, and fixed target objects/toolchain make metadata drift unlikely here.
   This is a generic future-hardening concern, not an observed failure of this batch.

The final DOL hash must still be checked separately: changes_all builds source reports, not the final linked hash target.
Neither script weakens the upstream strict validator.
