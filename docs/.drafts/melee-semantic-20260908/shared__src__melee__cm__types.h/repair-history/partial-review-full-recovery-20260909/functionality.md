# Shared Camera Types Family Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 263 canonical and rendered header lines are reviewed. This is one shared-file family assignment and adds zero TUs to the campaign count. The manifest has no writable subjects, so no KB proposal is emitted.

The header declares 11 types. CmSubject separates the owner anchor from bone_pos and separates current from target extents. Fighter initialization seeds both sets and copies the anchor to bone_pos; ordinary update performs a different set of writes. Camera stores two transform records and a 0x39C source size assertion. Its transform_copy has a confirmed consumer in a second CObj, contrary to the tentative unused comment.

The cinematic state uses tagged unions. Radius storage is s16, even though its setter takes float. Position interpolation reuses the first-member Vec3 layout of CameraTransformState. None of these declarations resolve uninitialized spherical locals under partial component masks.

CameraModeCallbacks contains nine void(void*) slots. It does not describe the separate GameModeState scheduler or gmCamera snapshot UI state. Shared gm/lb/baselib layouts, unknown callers and complete negative/exclusive-writer claims remain unresolved.

## Reconciled Results

### cm-layout-subject

Canonical CmSubject separates owner anchor pos from bone_pos and current ext from target_ext. ftCamera initialization copies pos into bone_pos and target extents into current extents; ordinary updates refresh only horizontal target extents/pos/facing, clear on_ledge and delegate bone_pos. Do not conflate the two paths or claim bone_pos is always bone-derived.

### cm-layout-copy

The tentative types.h comment that transform_copy is unused is not supported. camera.c passes it to Camera_8002AF68 with cm_804D6464 in STANDARD/FIXED modes and smooths it independently. This establishes a consumer, not the final visual purpose of that second camera.

### cm-layout-spherical

x35C is a vector/callback/bitfield union and bits.x2 is s16. The float radius setter assigns into that field. The position updater interprets the beginning of Vec3 x368 as s16 for starting radius and uses y/z as angles. Partial component flags still leave interpolation locals potentially uninitialized; the header does not supply a missing runtime guarantee.

### cm-layout-interpolation

CameraTransformState begins with interest. This explains the position interpolation call that casts &transform.position to CameraTransformState*: the helper writes its first Vec3 field into position. This is a description of source aliasing, not a general type-safety or compiler guarantee.

### cm-layout-unknown-vectors

x54 and x60 are declared Vec3 and the subject reset zeroes them. The dox claim that they are unused and force_inactive has exclusive writers is not established by this bounded family review. Keep those negative/exclusive claims unresolved.

### cm-layout-ui-boundary

gmCamera_VsCamUiState is a gmCameraUnkStruct and its x54 stores a SIS context-creation result. It is not Camera or CmSubject merely because offsets or module names overlap. Camera Mode hooks point to gmCamera scene/frame routines; that wiring does not identify the nine CameraModeCallbacks entries.

The renderer returned status ok on both pages, with three file-level parse diagnostics and zero substitutions. Both views were fully read; no target compilation was performed. Exact ranges, file hashes, artifact inputs and owned-TU followups are in family-findings.json and followups.json.

No shared KB/source edits, tests, compilation, matching, publication or UI startup occurred.
