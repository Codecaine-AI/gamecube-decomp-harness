# Small Rendering and Numeric Utilities

The TU exports three helpers and the writable HSD_identityMtx. Its owned header also defines two inline math wrappers and scalar constants. Every declaration and implementation was read in canonical and rendered form.

HSD_MulColor writes each destination RGBA channel as the corresponding integer source-channel product divided by 255U, truncating the result. It does not blend with destination contents or handle null pointers. Exact destination aliasing with either source is compatible with the component-by-component computation; arbitrary partial overlap is not promised. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/util.c#L10-L16.

HSD_GetNbBits intends to test all 32 positions and return the number set. The source uses signed 1 << i, including i equal to 31. The population-count interpretation describes the intended recovered-target semantics, not a portable-C guarantee; this review did not separately decode its object instructions. Its expression-evaluator caller sums counts of HSD_Rvalue flags into nb_args and checks the resulting argument count against buffer capacity. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/util.c#L18-L29 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/robj.c#L689-L724.

HSD_Index2PosNrmMtx maps input 0 through 9 to 0,3,6,9,12,15,18,21,24,27. Other values invoke HSD_ASSERT with authored line 132 and condition zero; the macro selects line 132 under MUST_MATCH and the invocation __LINE__ otherwise; the source's trailing zero return is a post-assert fallback. SetupEnvelopeModelMtx consumes these selectors while traversing at most ten palette entries, loading their view-composed position matrices and, when enabled, inverse-transpose normal matrices. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/util.c#L31-L58 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/pobj.c#L1125-L1199.

## Identity and Compiled Data

HSD_identityMtx is initialized as a 3x4 affine identity matrix with unit diagonal and zero translation. It is a writable global, not a const declaration; this TU does not modify it after initialization. Existing objects identify its 48 bytes at .data offset zero. A 40-byte jump table follows at offset 48, with ten R_PPC_ADDR32 relocations to HSD_Index2PosNrmMtx case labels. Thus the full .data section is 88 bytes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/util.c#L6-L8 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/util.c#L31-L58.

.sdata contains util.c at offset zero and 0 at offset eight, with linked padding to 16 bytes. These are assertion diagnostics. compiled-evidence.json records bytes, symbols, relocations and hashes. The existing report hash matches the frozen manifest. No compilation or matching ran.

## Complete Header Review

The header declares the three exports and extern identity matrix, then defines FLT_MIN as 1.17549435e-38f, DEG_TO_RAD and RAD_TO_DEG. It owns no vector, matrix or color type definition. Those imported definitions are not renamed or described as owned facts.

vec_normalize_check returns -1 for either null pointer, or when all three absolute components are at most FLT_MIN. The threshold is component-wise, not a length test. Those failures do not call PSVECNormalize or write the destination. Otherwise it invokes PSVECNormalize and returns zero; it does not explicitly reject NaNs or infinities. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/util.h#L18-L35.

atan2f_check takes signed eight-bit y and x. If x is zero it returns positive pi/2 for y at least zero and negative pi/2 otherwise. In particular, the zero/zero input returns positive pi/2. A nonzero x delegates to atan2f. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/util.h#L37-L44.

The rendered header labels vec_normalize_check as a different-file binding in cobj, but leaves the name and complete owned body unchanged. Source and header both have zero parser errors, no substitutions and EOF. No new naming hypotheses or foreign type claims are proposed.

## TU Lead Verification

Complete canonical and rendered C/header reviewed and all 18 proposal slots scanned. Requested and verified signed 1<<31 portability qualification in population-count facts and MUST_MATCH versus __LINE__ assertion handling. Checked per-channel multiplication aliasing, identity matrix mutability, ten-slot mapping, componentwise normalization cutoff and zero/zero angle returning positive pi/2. Foreign callers and compiled sections remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/e4f373b75e68da94698c8e6db31ebec93661031f1f5d2ce42bbee91768ecfe20/2026-09-08T15-01-05.962Z-c5f503f0-63df-4fe5-ab71-e8abfd12c41f.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__util/final-render.json).
