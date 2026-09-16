## Projection constructors
The unit implements three appropriately named, stateless constructors. Each synchronously writes all sixteen matrix entries into caller-supplied storage despite the `Mtx` signature spelling.

- `MTXFrustum` constructs an off-center perspective matrix from six clipping bounds. Horizontal and vertical scales are `2*n/(r-l)` and `2*n/(t-b)`; offsets occupy the Z column.
- `MTXPerspective` converts half the vertical field of view from degrees to radians and computes its cotangent through `tanf`. Horizontal scale is cotangent divided by aspect; vertical scale is cotangent.
- Both perspective forms use depth coefficients `-n/(f-n)` and `-(f*n)/(f-n)`, with final row `[0,0,-1,0]`.
- `MTXOrtho` uses scales `2/(r-l)`, `2/(t-b)`, and `-1/(f-n)`, corresponding translations, and final row `[0,0,0,1]`.

Frustum and orthographic source assertions check non-null output and unequal opposing bounds. Perspective checks output, `0 < fovY < 180`, and nonzero aspect, but does not assert unequal near/far values. Assertion presence does not establish enforcement in every build; no additional finite-value or clipping-order validation appears.

HSD camera dispatch selects these constructors and passes local matrices to `GXSetProjection`. Half-screen paths adjust clipping bounds, including using frustum construction for cropped field-of-view perspective. The top-half caller explicitly documents a `Mtx` versus four-row-write mismatch; this review does not infer compiled stack placement from that comment.

Canonical and rendered source were read completely. Rendering reports no parse errors or substitutions and covers function names only. Existing function names and explanations remain useful; no equivalent-wording changes are proposed. Source literals establish arithmetic roles, but not the exact contents or ownership of the compiled `.sdata2` pool.

Status: synthesized; independent review and live promotion pending.
