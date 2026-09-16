## Fighter model-parts layer

The unit specializes HSD JObj/PObj classes, binds loaded primary and auxiliary animation hierarchies to indexed FighterBone records, maintains DObj lists and costume visibility profiles, remaps common parts between fighter layouts, splices/removes configured joints, resolves flattened texture indices and exposes representation-aware rotation access.

### Rendering and lifetimes
The JObj callback delegates position-matrix construction, then computes rmtx * reciprocal-local-scale * inverse(rmtx) when fighter Z scale differs from 1. The shared correction remains valid only while has_z_scale is true; unit scale clears the flag without clearing the matrix. PObj dispatch otherwise delegates to the base class; active correction selects rigid, shared-vertex or envelope paths, with no default action for unknown types. Rigid cache misses use OR, shared-vertex requests use AND; both shared banks execute after the early-return guard, including with MUST_MATCH disabled. Envelope setup processes at most ten entries, uses a first-weight >=1 fast path, and otherwise accumulates weighted transforms. Shadow mode suppresses normal-related setup; actual GX normal loads additionally require lighting. pmtx is a prepared position matrix, not a projection matrix.

Default-class overrides affect subsequent fallback allocations; clear resets to NULL rather than restoring a previous override. Costume loading brackets the PObj override and converts the root JObj in place. Interpolation loading temporarily nulls the descriptor's DObj pointer and restores it after the base call. The returned auxiliary skeleton persists on the Fighter and supplies paired transforms for animation blending.

### Parts, visibility and attachments
Primary hierarchy traversal preserves conditional null slots without consuming a JObj, skips instance descendants, captures depth/render flags, and records the accumulated DObj count. Auxiliary collection checks the 32-entry limit but does not set DObjList.count. Pool initialization clears only specified flag words, not entire records. Common-part mapping is part_to_joint; the obsolete .dox annotation reverses that direction.

Visibility setup independently falls back to costume zero for four channels and reserves a null fifth channel. prev is baseline/requested selection; idx is active selection. The shared modified flag also controls restoration on motion changes unless SkipModel preserves it. Restore/clear do not directly change DObj flags. cleared is a processing latch shared by selective application and reveal-all, not proof that all objects are visible. Event 2 operates auxiliary group 2 then main group 3; callbacks run after each request even if a helper does no work. Selection application does not latch a zero-model channel.

Configured attachment isolates one descriptor and loads two joints through the interpolation path; it should not be described as necessarily adding DObjs. Registration uses a local counter initialized to zero. Recognized insertion modes require non-null root/new nodes despite conditional link reads; invalid modes do nothing. Parent-link updates are asymmetric and must not be normalized into a generic safe tree insertion. Kirby cleanup separately frees hat lists and removes selected configured parts in reverse mask order.

### Rotation and evidence quality
Per-axis access selects the alternate joint if the primary is quaternion-backed and reports an unsupported double-quaternion case. Canonical ftPartGetRotZ actually returns Y; the existing ftPartGetRotY hypothesis is retained. Full rotation assignment followed by clearing quaternion mode is not a quaternion-to-Euler conversion. Transform dirtying is conditional on local-SRT matrix dependence. Fox/Falco blendFrames entries hold sampled X angles here, not frame counts.

All owned canonical and rendered pages and all frozen subjects/links were reviewed. Existing useful names were retained rather than cosmetically rewritten. The current header leaves two proposed names unsubstituted as shadowed_binding; the .dox file contains stale prototypes and misleading annotations. Source declarations and literal encounter order do not prove compiled section sizes, membership or pool ordering.

Status: researched; no-change lead bypass; independent review and live promotion pending.
