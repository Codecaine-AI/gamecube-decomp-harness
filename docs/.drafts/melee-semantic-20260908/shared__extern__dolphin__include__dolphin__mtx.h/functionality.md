## Dolphin matrix/vector interface

`extern/dolphin/include/dolphin/mtx.h` is a guarded, C++-compatible declaration header. It defines floating-point and integer vector aliases, a four-component quaternion/vector type, `Mtx` as `f32[3][4]`, `Mtx44` as `f32[4][4]`, and `ROMtx` as `f32[4][3]`, together with pointer aliases and degree/radian conversion macros. These are source-level type declarations, not compiled-layout findings. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mtx.h#L1-L60)

The public interface covers projection and camera matrices, matrix construction and transformation, inversion and inverse transpose, vector arithmetic, matrix/vector arrays, reordered matrices, and weighted two-matrix vector-array operations. Many generic names select `C_` functions under `DEBUG` and `PS` functions otherwise. The mapping is not universal: `MTXTrans` is mapped only in the non-debug branch, while the five aliases labeled assembly-only are unconditional. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mtx.h#L62-L159)

`MTXStack` exposes a matrix count and base/current matrix pointers, with initialization, push variants, pop, and current-pointer declarations. This header does not establish allocation ownership, pointer lifetime, or overflow/underflow behavior. The remaining declarations expose matrix/vector multiplication and vector operations without specifying exceptional inputs or aliasing guarantees. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mtx.h#L161-L223)

Declaration details must remain distinct from implementation semantics: `MTXPerspective` is declared with both `Mtx` and `Mtx44`, whose array parameters both adjust to pointers to four-element rows; that does not establish the number of rows accessed. Several single-vector multiplication declarations use `Mtx44`, whereas array variants use `Mtx`; `PSMTXMultS16VecArray` instead accepts `Mtx44*`. No signature correction or implementation inference is justified by these declarations alone. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mtx.h#L50-L66) [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/dolphin/mtx.h#L176-L196)

## Semantic review

All 230 canonical and rendered lines were reviewed. The renderer reported zero parse errors and zero substitutions; existing SDK names remain unchanged and adequately describe the declared interface. Subject and link enumeration both returned empty collections, so there are no frozen facts or links to retain or correct and no writable subjects. No knowledge changes are proposed.

Status: synthesized; independent review and live promotion pending.
