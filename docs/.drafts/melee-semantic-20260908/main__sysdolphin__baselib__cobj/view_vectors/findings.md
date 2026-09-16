# View Vectors and Viewing-Matrix Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Reviewed canonical and rendered `src/sysdolphin/baselib/cobj.c` lines 467–855. Source SHA-256 `b49cc2726fa8617c73c12090815611e7c554721f4f5d43bfca77df2cfa24cdce`. Both returned pages were readable; rendering reports two parse errors and zero substitutions. Canonical bodies, including both MUST_MATCH branches, support the review. No headers or foreign shared types are claimed.

30 source functions, 22 report targets, 33 parameter entities, 99 existing facts. Six fact replacements proposed; no names proposed. Parameter entities have no existing facts. `coverage.json` records each signature parameter and exact owned locator. `dispositions.json` records every fact ID, timestamp and original snapshot. Integer versions were not returned by the helper.

## Behavior by Function

### `HSD_CObjSetupViewingMtx`

Rebuilds view_mtx with eye, up and interest only when mask 2 is clear and the dirty predicate holds. Clears WObj mask 2 and camera bit 30; sets inverse-dirty bit 31.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L467-L483.

### `HSD_CObjSetCurrent`

Rejects null input; clears Z-list and installs current before selecting the render-pass helper. Failure leaves the newly installed current pointer in place. Successful setup calls viewing-matrix setup.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L485-L519.

### `HSD_CObjEndCurrent`

Calls _HSD_ZListSort followed by _HSD_ZListDisp, without local arguments, guards, or resetting current.
Parameters: `void`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L521-L525.

### `HSD_CObjGetInterestWObj`

Asserts camera and returns its interest pointer unchanged.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L527-L531.

### `HSD_CObjSetInterestWObj`

Asserts camera and assigns interest pointer directly without local dirty marking or ownership bookkeeping.
Parameters: `HSD_CObj* cobj, HSD_WObj* interest`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L533-L537.

### `HSD_CObjGetEyePositionWObj`

Asserts camera and returns its eyepos pointer unchanged.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L539-L543.

### `HSD_CObjSetEyePositionWObj`

Asserts camera and assigns eyepos pointer directly without local dirty marking or ownership bookkeeping.
Parameters: `HSD_CObj* cobj, HSD_WObj* eyepos`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L545-L549.

### `HSD_CObjGetInterest`

Asserts camera and forwards the interest WObj plus caller output to HSD_WObjGetPosition.
Parameters: `HSD_CObj* cobj, Vec3* interest`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L551-L555.

### `HSD_CObjSetInterest`

Asserts camera and forwards the interest WObj plus caller input to HSD_WObjSetPosition.
Parameters: `HSD_CObj* cobj, Vec3* interest`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L557-L561.

### `HSD_CObjGetEyePosition`

Asserts camera and forwards the eye WObj plus caller output to HSD_WObjGetPosition.
Parameters: `HSD_CObj* cobj, Vec3* position`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L563-L567.

### `HSD_CObjSetEyePosition`

Asserts camera and forwards the eye WObj plus caller input to HSD_WObjSetPosition.
Parameters: `HSD_CObj* cobj, Vec3* position`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L569-L573.

### `HSD_CObjGetEyeVector`

Normalizes interest minus eye into caller output. Returns 0 on success; otherwise writes negative-Z when output exists and returns -1.
Parameters: `HSD_CObj* cobj, Vec3* eye`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L575-L594.

### `HSD_CObjGetEyeDistance`

Returns zero for null camera. Otherwise asserts both WObjs, subtracts eye from interest and returns vector magnitude.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L596-L611.

### `upvec2roll`

Converts supplied up to roll using a look-at matrix and atan2f(-v.x,v.y), with a signed half-pi branch for zero transformed Y. Returns zero on failed eye retrieval or when 1-abs(dot(up,eye)) is below FLT_MIN. Does not normalize its input up.
Parameters: `HSD_CObj* cobj, Vec3* up`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L617-L642.

### `vec_get_x`

Returns the supplied vector X component.
Parameters: `Vec3* v`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L644-L647.

### `cobj_fabsf_p`

Under MUST_MATCH, dereferences a float pointer and returns its absolute value as f64.
Parameters: `f32* v`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L650-L653.

### `roll2upvec`

Obtains normalized eye direction, chooses a perpendicular seed with a near-Y alternate formula, rotates by negative roll radians around eye, and normalizes into up. Propagates eye failure before writing up.
Parameters: `HSD_CObj* cobj, Vec3* up, float roll`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L656-L685.

### `cobj_get_up_x`

Returns supplied up vector X component.
Parameters: `Vec3* up`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L687-L690.

### `HSD_CObjGetUpVector`

Copies stored up unchanged when flag bit 0 is set; otherwise derives up from roll. Returns 0 for those success paths. On failure writes positive-Y if output exists and returns -1. Stored-up mode performs no validity check.
Parameters: `HSD_CObj* cobj, Vec3* up`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L692-L709.

### `HSD_CObjSetUpVector`

Null arguments do nothing. Explicit-up mode normalizes input or uses positive-Y fallback, dirties matrices on component change and stores the selected vector. Roll mode passes up through upvec2roll and delegates SetRoll.
Parameters: `HSD_CObj* cobj, Vec3* up`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L711-L733.

### `HSD_CObjGetLeftVector`

Computes and normalizes up cross eye after successful prerequisite getters. Returns 0 on success; failure writes positive-X when output exists and returns -1.
Parameters: `HSD_CObj* cobj, Vec3* left`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L735-L756.

### `HSD_CObjSetMtxDirty`

ORs camera flags with bits 30 and 31 without checking null or calculating matrices.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L758-L761.

### `HSD_CObjMtxIsDirty`

Returns whether camera bit 30 or either non-null WObj mask 2 is set. Does not mutate state and does not check camera null.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L763-L768.

### `get_up_vector_for_viewing_mtx_inner`

Forwards camera and output vector to HSD_CObjGetUpVector and returns its status.
Parameters: `HSD_CObj* cobj, Vec3* up`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L770-L773.

### `get_up_vector_for_viewing_mtx`

Forwards camera and output vector through the inner wrapper and returns its status.
Parameters: `HSD_CObj* cobj, Vec3* up`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L775-L778.

### `HSD_CObjGetViewingMtx`

Copies the viewing-matrix pointer accessor result into caller matrix storage.
Parameters: `HSD_CObj* cobj, Mtx mtx`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L780-L783.

### `HSD_CObjGetInvViewingMtxPtrDirect`

When bit 31 is set, allocates proj_mtx if absent, calls PSMTXInverse(view_mtx, *proj_mtx), ignores inversion status and clears bit 31. Returns *proj_mtx; clean path assumes storage exists. Does not rebuild view_mtx.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L785-L795.

### `HSD_CObjGetViewingMtxPtr`

Rebuilds dirty view_mtx only if mask 2 is clear, using eye/up/interest. Clears WObj mask 2 and camera bit 30, sets bit 31, then returns the direct viewing accessor result.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L797-L815.

### `HSD_CObjGetInvViewingMtxPtr`

Performs the same guarded view refresh and flag transition, then calls the direct inverse accessor, which may rebuild the cached inverse.
Parameters: `HSD_CObj* cobj`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L817-L835.

### `HSD_CObjSetRoll`

Null camera does nothing. Explicit-up mode ignores roll2upvec status and forwards local up to SetUpVector; failed eye retrieval leaves that local uninitialized. Roll mode stores the requested radians and sets bits 30/31 only on value change.
Parameters: `HSD_CObj* cobj, float roll`. Canonical name retained. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/cobj.c#L837-L854.

## Limits and Deferred Work

The explicit-up SetRoll path ignores roll2upvec failure. Failed eye retrieval leaves the local up vector uninitialized before SetUpVector reads it. The direct inverse getter ignores PSMTXInverse status and clears its dirty flag anyway; when already clean it assumes proj_mtx storage exists. These are observed code paths, not proposed source changes.

upvec2roll does not normalize its up input before its dot-product degeneracy test. Therefore claims that every supplied up vector becomes an equivalent roll need qualification. GetUpVector also copies explicit stored up without validation.

Claims about display list internals, shadow projection consumers, WObj setter flags/null behavior, and animation consumers remain unresolved pending the responsible cluster or family review. Local caller behavior is documented independently. Matrix coordinate conventions follow the LookAt/inverse calls; no foreign type or field rename is proposed.

Missing report identities: `HSD_CObjSetInterestWObj`, `HSD_CObjSetEyePositionWObj`, `upvec2roll`, `vec_get_x`, `cobj_fabsf_p`, `cobj_get_up_x`, `get_up_vector_for_viewing_mtx_inner`, `get_up_vector_for_viewing_mtx`. These functions were read and described above; no unwritable target was invented.

Proposal dry-run passed with 6 accepted and 0 rejected. Validation artifact: `games/melee/state/knowledge_v2/semantic-sweep-20260908/validation/ff119e27444340863ee509dd260d8129ff625a6b6a43adf982067c24c8e869a1`. No KB or canonical source changes were made.
