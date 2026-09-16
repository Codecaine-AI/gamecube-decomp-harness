# Single-Precision Inverse Trigonometry

Reviewed semantic record at `c302741689bd67c361cd7faadb221df3193992c3`. The source implements atan2f, acosf and asinf, a local reciprocal-square-root helper, and an atanf definition compiled only under __MWERKS__. The paired header contains only an include guard. Independent review and live promotion are complete.

## Function Behavior

`atan2f` computes an angular result using atanf(y/x), sign-bit comparisons and pi corrections. For either signed-zero x it returns pi/2 with y's sign, including both-zero pairs. It does not implement a separate infinity-pair or NaN case. Standard-library names therefore do not prove complete standard exceptional-value behavior. [Quadrant branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L22-L43).

`acosf` computes 1-x*x. For a positive result, it refines a reciprocal-square-root estimate three times with 0.5*guess*(3-guess*guess*result), then returns pi/2 minus atanf(x*guess). A nonzero nonpositive result selects NAN, while zero selects INF. `asinf` computes atanf of x times the local helper applied to 1-x*x. Despite its name, `lb_sqrtf` returns a reciprocal-square-root approximation, using the same three refinements; nonpositive inputs select NAN or INF. [Inverse sine, cosine and helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L45-L84).

`atanf` saves and removes the sign bit, reduces magnitude into a small argument, evaluates an odd polynomial from table coefficients, adds region offsets and restores the sign. Magnitudes at least approximately 2.41421366 use reciprocal reduction; intermediate magnitudes above approximately 0.414213568 use bit-pattern thresholds and table-assisted reduction. Large-argument reconstruction uses pi/2. [Reduction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L147-L208), [polynomial and reconstruction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L210-L243).

## Constants and Constraints

The source contains a 46-float lookup table for coefficients, reduction centers and offsets. On small and reciprocal-reduced branches, lookup_index remains -1, so lookup_ptr is formed one element before the array. Later relative reads at offsets 20 and 27 resolve numerically to zero-valued entries 19 and 26. This matching-oriented source does not establish portable-C pointer bounds. [Table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L98-L145), [relative lookup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L210-L233).

NAN fallback and INF refer to external MSL arrays. Canonical declarations do not prove those arrays' values or emitted section placement. No numeric error bound, hardware execution, compiler build or floating-point exception guarantee was tested. [Macros and imports](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbtrigf.c#L8-L20).

## Naming and Coverage

Canonical math symbols remain preferred. The behavior of lb_sqrtf is documented without renaming it. All 244 source lines and five header lines were read in canonical and rendered views. The source renderer returned one parse error and zero substitutions; header rendering returned no errors or substitutions. The final empty source line is present in rendering while validation counts 243 non-trailing lines. All proposed citations stop at valid nonempty bounds.

The librarian artifacts enumerate every target, parameter, prior fact and section uncertainty. Emitted section membership and external MSL constants remain family followups. Shared KB changes require independent review.

## Verified Live Promotion

5 proposal operations were independently reviewed and promoted. The completion receipt records unchanged source.

[Promotion receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbtrigf/staged-completion.json) · [Final rendered source](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbtrigf/final-render.json)

Live promotion: [immutable live receipt](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/5cebefec4c4f27fa9de1adeca745ceca8064fc3beb338f8a71012af37a34b7e0/2026-09-08T14-51-21.405Z-74fac6f2-55ec-491d-adb6-74dba0550ec0.receipt.json>).
