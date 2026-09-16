## Matrix-vector operations

The source defines seven void procedures: affine single-vector transforms (`C_MTXMultVec`, `PSMTXMultVec`), linear-only single-vector transforms (`C_MTXMultVecSR`, `PSMTXMultVecSR`), affine array transforms (`C_MTXMultVecArray`, `PSMTXMultVecArray`), and the linear-only array transform `MTXMultVecArraySR`.

Affine outputs use the first three matrix rows as `(x,y,z,1)` dot products. SR outputs use only the upper-left 3×3 coefficients; neither variant performs perspective division. The paired-single SR implementation nevertheless fetches each fourth coefficient into a lane that does not contribute to the stored scalar. Its memory reads must not be described as restricted to nine coefficients. See [single-vector implementations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/mtxvec.c#L6-L77).

Both assembly single-vector routines load all source components before storing output, permitting source/destination in-place use, and contain no explicit pointer guards. The C implementations assert pointer validity and compute through a temporary vector. C array loops advance both vector pointers and perform no iterations for count zero, after assertions. This does not establish safety for arbitrary overlapping arrays.

`PSMTXMultVecArray` pipelines vector loads and stores using CTR initialized to count minus one, without a small-count guard. Counts zero and one are not ordinary empty/single-element cases: the loop is entered unconditionally and CTR decrement wraps. For ordinary counts of at least two, its pipeline also loads one vector beyond the requested input range. Caller padding and count guarantees are not established here. See [array implementations](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/src/dolphin/mtx/mtxvec.c#L79-L192).

Existing canonical function names accurately distinguish affine and SR operations; no renaming is warranted. Rendered source was reviewed in full but reports 128 parse errors, zero substitutions, and uncertain assembly parsing. It supplies no independent behavioral proof. No compiled export, section, or layout conclusion is drawn.

Status: synthesized; independent review and live promotion pending.
