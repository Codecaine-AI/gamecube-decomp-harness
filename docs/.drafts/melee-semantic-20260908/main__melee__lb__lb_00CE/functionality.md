# lb_00CE Functionality

The unit defines five stateless scalar helpers. The public header declares powi and the two geometry helpers; expf and powf are defined in the C file. Canonical names expf, powf and powi remain authoritative.

| Canonical | Behavior |
|---|---|
| expf | Accumulates the Maclaurin series for exp(abs(input)), starting from 1+abs(input) and adding power/factorial terms until exact f32 equality says the sum stopped changing. Negative inputs select the reciprocal. No iteration cap, overflow or nonfinite guard is present. |
| powf | Returns zero for zero base regardless of exponent. Otherwise sums odd powers of z=(base-1)/(base+1) until exact f32 equality, then calls local expf(exponent*2*sum). No negative-base, division-by-zero, overflow or nonfinite guard occurs. |
| powi | Returns zero for base zero or negative exponent; otherwise performs exponent signed-integer multiplications from result one. Nonzero base with zero exponent returns one. Signed overflow is unchecked. |
| lb_8000D008 | Computes a quadrant-aware angle-like value from y,x. Strict |x|<1e-5 uses zero for also-small y or signed pi/2. Positive x returns atanf(y/x); negative x returns sign(y)*(pi-atanf(abs(y/x))). For x=NaN, ordered comparisons fail and the function returns original y. |
| lb_8000D148 | Returns a Boolean from three 2D coordinate pairs and threshold. Rejects squared endpoint separation below 1e-5. Computes abs(x0*y1-y0*x1+(x1-x0)*x2+(y0-y1)*y2)/sqrt(separation_squared), gates it against threshold, then uses endpoint squared distances and strict coordinate straddling. This expression is not the usual perpendicular point-to-line distance. |

## Contradictory Geometry Evidence

The inherited circle-boundary intersection claim fails for endpoints 0,0 and 10,0, center5,0, threshold1. The canonical gate computes5 and returns0 despite the segment crossing that circle. The source pairs dx with point2_x and reversed dy with point2_y; a conventional line equation would pair those coefficients oppositely. This is a semantic finding, not a source-fix request.

The later tests reject both endpoints strictly inside threshold, accept many endpoint equalities, and use strict coordinate straddling when both are outside. They do not repair the first gate. No new geometry name is proposed.

## Coverage and Limits

Both files are read to EOF in canonical and rendered form:224 C display lines plus11 header lines. All six targets,21 writable subjects and inherited facts are accounted. Renderer reports zero parse errors. The conditional constant-order helper is reviewed; compiled section mapping remains unresolved.

The series routines stop on exact f32 equality without an iteration cap. NaNs or overflowed intermediates do not establish termination. powi has unchecked signed multiplication overflow. The angle helper is atan2-like for ordinary inputs, but uses a strict near-zero tolerance and does not implement a full standard atan2 contract.

Reviewer correction: inherited powf result guarantee remains unresolved because accuracy and termination are not established for all positive bases. Final dispositions: 12 retain, 9 supersede, 7 unresolved. Proposal unchanged.

## Live application status

Live promotion confirmed: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_00CE/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_00CE/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/6f06057048629cfbdd9992ff9a99f119ffb7a144f92815d8d771f11a4f4ee694/2026-09-08T14-53-44.450Z-390c84aa-f690-4a12-b3f3-d99993227a36.receipt.json). Unresolved inherited claims remain unresolved. Proposal and review hashes preserved.

Verified completion: live promoted. [final-render.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_00CE/final-render.json>) and [staged-completion.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lb_00CE/staged-completion.json>).
