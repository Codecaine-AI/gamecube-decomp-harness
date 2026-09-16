## Functionality and semantic assessment

This file implements five paired-single matrix routines. Original names remain appropriate to their broad roles; the rendered view contains no proposed substitutions. There are no baseline subjects, facts, or links and no writable subjects, so the proposal is empty.

- **PSMTXReorder** rearranges twelve matrix elements from three four-element rows into four three-element columns. All source loads precede destination stores, supporting same-buffer reordering. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/psmtx.c#L11-L33.
- **PSMTXROMultVecArray** applies a reordered affine matrix, including translation, to floating-point vectors in a two-vector pipeline. The final parity branch stores one result for odd counts and two for even counts. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/psmtx.c#L35-L113.
- **PSMTXROSkin2VecArray** forms matrix coefficients as `m0 + weight * (m1 - m0)` per vector and applies the resulting affine transform. Weights are not clamped. Its pipeline reads an additional weight beyond those used for output. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/psmtx.c#L115-L229.
- **PSMTXROMultS16VecArray** uses the same reordered affine, two-vector pipeline with quantized signed-16 input loads and floating-point output stores. It sets GQR6 to `0x00070000` without restoring its prior value. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/psmtx.c#L231-L311.
- **PSMTXMultS16VecArray** computes three row-wise affine outputs using matrix offsets 0–47 despite its `Mtx44*` parameter; it does not compute a fourth output or perform perspective division. It sets GQR6 without restoration, but the initial next-vector XY preload exceptionally uses `qr1` at line 334. Consequently, a uniform signed-16 interpretation of every input load requires external GQR1 state that this file does not establish. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/psmtx.c#L313-L362.

## Boundary and lifetime qualifications

Array loops enter their bodies without checking the initialized count register. The reordered multiply routines initialize CTR with `(count - 1) >> 1`; the skinning and row-wise routines use `count - 1`. Thus small counts are not safely handled as ordinary empty/single-element cases: normal finite traversal requires at least three elements for the paired routines and two for the single-vector pipelines. Multiply pipelines also preload vectors beyond the requested output range. These observations do not establish caller padding or valid-count contracts. GQR6 changes persist beyond return, and GQR0/GQR1 configuration comes from outside this file. No compiled layout or section conclusions are drawn.

Status: synthesized; independent review and live promotion pending.
