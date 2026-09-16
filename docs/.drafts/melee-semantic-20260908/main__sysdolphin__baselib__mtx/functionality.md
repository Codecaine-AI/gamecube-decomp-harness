# main/sysdolphin/baselib/mtx

Status: TU synthesis complete; independent root review pending.

# Matrix and Vector Utilities

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical and rendered C510/H65 read. UTC research 2026-09-08T15:05:00Z to 2026-09-08T15:08:23.678843+00:00.

## Entry Points

### HSD_MtxInverse
Computes an affine inverse from determinant-scaled cofactors and inverse translation when source and destination are distinct. Determinant magnitude below 1e-10f yields identity. The equal-pointer path protects cofactor inputs but reads translation from the progressively overwritten source, so full in-place inversion is not generally correct.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L21-L57

### HSD_MtxInverseConcat
Computes the affine transform obtained by concatenating the inverse of `inv` with `src`, producing `dest = inverse(inv) * src`; if `inv` is effectively singular, it leaves the transform uninverted and returns a copy of `src` instead.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L60-L157

### HSD_MtxInverseTranspose
Computes the inverse transpose of the linear 3×3 portion of a 3×4 affine matrix and writes it as a translation-free matrix. If the source determinant has magnitude below `EPSILON`, it falls back to the original source matrix instead of attempting the inverse transpose.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L159-L203

### HSD_MtxGetRotation
Extracts an XYZ Euler-angle representation in radians from the upper 3x3 matrix using column magnitudes, asin, and a thresholded atan2 helper; translation is ignored. This normalizes selected column magnitudes but does not remove shear or guarantee invariance under arbitrary signed per-axis scale.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L205-L266

### HSD_MtxGetTranslate
Extracts the translation component of a 3×4 affine matrix into a three-component vector.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L269-L274

### HSD_MtxGetScale
Decomposes the linear 3×3 portion of an affine matrix into three scale factors, first removing inter-axis projections so shear does not inflate the later-axis scales, then assigning a common negative sign when the resulting basis has reflected handedness.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L276-L321

### HSD_MkRotationMtx
Constructs a 3×4 affine rotation matrix from three Euler-angle components, representing the composition Rz × Ry × Rx and leaving the translation column zero.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L323-L355

### HSD_MtxQuat
Provides HSD with a thin quaternion-to-matrix conversion wrapper. It delegates to Dolphin's `MTXQuat` implementation, which constructs a translation-free 3×4 affine rotation matrix from a nonzero quaternion and compensates for a quaternion that is not already unit length by dividing its terms by the squared magnitude.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L357-L360

### HSD_MtxSRT
Constructs a 3×4 affine matrix from componentwise scale, Euler rotation, and translation, with an optional accumulated parent-scale correction used before hierarchical matrix concatenation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L362-L410

### HSD_MtxSRTQuat
Constructs a local 3D affine transform from scale, quaternion rotation, and translation, optionally conjugating the rotation-and-scale portion by an accumulated parent scale so the result can be composed into a scaled JObj hierarchy.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L412-L434

### HSD_MtxScaledAdd
Performs a component-wise scaled addition of two 3×4 affine matrices, producing each destination element as the corresponding element of the second input plus a scalar multiple of the corresponding element of the first input.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L437-L457

### HSD_VecAlloc
Allocates one three-component vector from the mtx subsystem's reusable vector pool for transform bookkeeping, requiring the allocation to succeed before returning it.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L459-L466

### HSD_VecFree
Returns a non-NULL three-component vector allocation to HSD's dedicated vector pool for reuse. It is a low-level storage-release wrapper used for optional JObj accumulated-scale vectors; it does not clear the owner's pointer or perform any higher-level JObj teardown.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L468-L473

### HSD_MtxAlloc
Allocates one 3×4 matrix-sized block from HSD's dedicated matrix object pool, requires the allocation to succeed, and returns the storage without initializing its matrix elements.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L475-L482

### HSD_MtxFree
Returns a non-NULL 3×4 matrix allocation to HSD's dedicated reusable matrix pool. It is a low-level storage-release routine used after an owning object has finished with a projection or envelope matrix; it does not perform owner-specific teardown.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L484-L489

### HSD_VecGetAllocData
Provides access to the mtx subsystem's persistent object-allocation descriptor for pooled three-component vectors, allowing allocator setup and inspection to operate on the same descriptor used by vector allocation and release.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L491-L494

### HSD_VecInitAllocData
Initializes and registers the HSD fixed-size allocation descriptor used for three-component vectors, configuring Vec-sized entries with four-byte alignment during the engine-wide HSD object-allocation startup sequence.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L496-L499

### HSD_MtxGetAllocData
Exposes the singleton HSD object-allocation descriptor that manages the translation unit's dedicated pool of 3×4 matrix-sized entries, allowing allocator setup and external inspection or configuration of that pool.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L501-L504

### HSD_MtxInitAllocData
Initializes and registers the fixed-size allocation descriptor used by HSD_MtxAlloc and HSD_MtxFree for 3×4 matrices, configuring Mtx-sized entries with four-byte alignment during the common HSD object-allocation startup sequence.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L506-L509

## Inversion and Numerical Boundaries

All inversion helpers compare sign-bit-cleared determinant against strict 1e-10f. Equality proceeds to inversion; NaN does not satisfy the less-than fallback. Inverse returns identity for small determinant; InverseConcat copies src or leaves equal src/dest unchanged; InverseTranspose copies the full source including its translation for the small-determinant fallback, and zeros translation only in the invertible branch. InverseConcat protects exact dest equality with either input using a complete temporary; InverseTranspose copies its source before in-place cofactor reads. Partial overlap is not checked. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L13-L203.

HSD_MtxInverse has a narrower equal-pointer path: cofactors use the saved matrix but translation reads original src, now also dest. A source-derived example with linear block [[1,0,0],[1,1,0],[0,0,1]] and translation [1,2,3] produces correct distinct-output translation [-1,-1,-3], but sequential in-place translation stores yield [-1,-3,-3]. This is arithmetic inspection, not a compiled runtime test. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L21-L57.

GetRotation returns zeros when any computed length is strictly below FLOAT_MIN; negated less-than guards do not reject NaN. Pitch saturates only ordinary out-of-range comparisons. calcVal uses <= FLOAT_MIN and y>=0, including positive pi/2 at zero/zero. The cosine branch is an actual float comparison, not a proof of exact symbolic gimbal-lock handling. Column magnitudes remove positive scale magnitudes for suitable unsheared input, not arbitrary shear/reflection. GetScale instead performs ordered projection removal, normalizes without degeneracy checks, and flips all three signs on negative handedness. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L205-L321.

## Composition and Pool State

MkRotationMtx expands Rz*Ry*Rx and clears translation. SRT uses local scale and optional parent-axis ratios; SRTQuat builds T*R*S or T*P^-1*R*P*S. Optional parent scale has no zero-component guard. MTXQuat maps to the paired-single implementation outside DEBUG; it uses a reciprocal estimate/refinement for squared-magnitude normalization, while the scalar DEBUG implementation asserts nonzero quaternion. No bit-exact agreement across implementations is claimed. ScaledAdd walks twelve elements as B + scalar*A, safe for exact destination/input equality by elementwise independence, with no partial-overlap check. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L323-L457; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mtx.h#L68-L113; code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/mtx.c#L801-L897.

Vector descriptor HSD_Mtx_804C2310 uses sizeof(Vec); matrix descriptor HSD_Mtx_804C233C uses sizeof(Mtx); both request alignment4. Allocators assert success and leave payload uninitialized. Frees accept null but otherwise neither validate ownership nor prevent duplicate releases. Init clears descriptor accounting and reinserts it in the registry; no preservation of outstanding pool allocations is implied. Getters expose persistent mutable descriptors. Canonical VecAlloc return remains void*. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L459-L509; code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/objalloc.c#L71-L156.

## Header, Names, and Coverage

All 19 canonical function names retained; all 33 parameter subjects have no facts and were reviewed against signatures. Matrix arguments are input/output by accesses, Euler/scale/translation vectors have distinct roles, quaternion uses x/y/z/w, and optional parent scale is the only nullable construction vector. Header VecMtx is Vec3[4], not a new matrix type declaration. VEC2_SQ_LEN/VEC3_SQ_LEN repeat macro arguments. Header helpers clear the float sign bit, copy/set a selected column, and compute column magnitude without null/index guards. Six source/header-only helpers are recorded as missing report targets. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.h#L11-L62.

Ten section facts remain unresolved until compiled layout evidence is reviewed. No source edits, shared KB application, Git changes, matching runs, UI activity, or publication occurred.


## TU independent review

Owned C510/H65 independently reviewed canonical and separate rendered pages; no parse errors/substitutions. All83 facts and6 proposals reviewed. Six inline helpers inventoried, including unchecked column selection and bitwise sign clearing. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.h#L38-L62`.

In-place inverse preserves only linear inputs. With A=[[1,0,0],[1,1,0],[0,0,1]],t=[1,2,3], distinct inverse translation is[-1,-1,-3]; sequential in-place stores yield[-1,-3,-3]. The correction follows directly from source expressions, without compiled matching runs. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L21-L57`.

InverseConcat stages the entire result when destination equals either input; inverse transpose stages input and zeros translation only on nonsingular path. Near-singular fallbacks differ: inverse identity; concat source; inverse-transpose source. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L60-L203`.

GetRotation uses thresholded calcVal rather than unrestricted atan2. Magnitude normalization does not remove shear or arbitrary signed-scale effects. GetScale orthogonalizes columns, has no degeneracy guard and negates all three magnitudes for negative handedness. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/mtx.c#L205-L321`.

Foreign canonical-only allocator71-161 verifies free/used/peak counters and registry initialization. JObj138-196,471-529,1180-1252,1511-1527 verifies SRT dispatch, accumulated-scale allocations, translation extraction and teardown. Earlier owned robj review supports radian-to-degree expression use. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/jobj.c#L138-L196`.

Foreign canonical-only Dolphin mtx header1-42,89-113 confirms Vec/Vec3 alias and retail delegation; PSMTXQuat/C_MTXQuat801-900 confirms magnitude-scaled conversion and zero translation. Fighter ftparts64-154 confirms lighting normal-matrix use. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/mtx.c#L801-L900`.

## Packet

[Coverage](coverage.json), [fact dispositions](dispositions.json), [subject coverage](subject-coverage.json), [unresolved claims](unresolved.json), [proposal](proposal.json), [validation](validation.json).
