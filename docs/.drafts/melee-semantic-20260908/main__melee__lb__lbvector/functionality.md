# Vector Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Review started 2026-09-08T14:36:13.409Z; completed 2026-09-08T14:49:47.413337+00:00.

## Data and Mutation

The unit operates on caller-owned vectors and matrices. Add/Sub update the first vector; Diff writes a separate result; normalized cross product uses the SDK cross product and then local normalization. XY helpers deliberately preserve or ignore Z. No named module runtime state is declared. Existing object bytes identify .data as filename/range diagnostics, .sdata as pos3d, and .sdata2 as pooled floating literals.

Lerp computes a+f*(b-a) without clamping or endpoint shortcuts, but its output must not alias a. Point-to-line distance uses an infinite line with no segment clamp; the residual calculation rereads c after writing d, so d==c corrupts the nondegenerate returned distance. General input preservation assumes output storage is distinct.

## Angles and Rotation

Normalize tests computed length for exact zero. Angle uses a1e-10 product threshold; AngleXY tests exact product zero. Both clamp cosine, while CosAngle does neither a zero check nor a clamp. Euler extraction assumes an orthonormal basis and recognizes singularities only at exact b.z=+/-1. Partial basis conversion normalizes only c cross a, leaving a and c unchanged and unvalidated.

Rotation helpers use a local quintic sine approximation and phase-shifted cosine with at most one tau correction. They are approximate and do not guarantee exact norm preservation. Rotate accepts exactly1,2,4; other selectors use uninitialized local outputs. ApplyEulerRotation reads successive angle components between mutations, so callers should keep angle and vector storage distinct. The matrix constructor reads Quaternion.x/y/z as Euler angles and ignores w.

## Interpolation and Projection

Quadratic interpolation interprets nine packed floats as points at parameter0,0.5,1. Its local clamp applies to ordered values; NaN is not repaired. A current stock-icon caller supplies a0.1-scaled counter and subtracts the root translation after evaluation.

WorldToScreen checks the source pointer and strict coordinate bounds, supports perspective/orthographic modes and chooses rebuilt or stored viewing state. The depth correction reaches -0.01 only when the viewing row has unit length. Camera parameters, output pointer and finite result are not validated here. Unsupported projection types return NULL before output writes.

## Square Roots and Section Evidence

The target math header ordinary and accurate paths use three and four reciprocal-square-root refinements respectively for positive input. Inputs failing x>0 pass through unchanged. Non-Gekko placeholder macros select a different fallback. Existing split/source objects differ in diagnostic padding; hashes and bytes are captured, without any build or binary acceptance claim.

## Current Application Status

Root completed reviewed live KB promotion for 19 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbvector/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbvector/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/a6565b04f7eb0a3a9f67881d4537da501d678cc86fbc70fc4cf8e624e3796ca6/2026-09-08T14-51-20.471Z-a82cca2e-f8f1-4569-a47f-456d605d0b46.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbvector/final-render.json).
