# Independent Camera Naming Review

Retain all four existing aliases as supported hypotheses. Retain canonical `ftCamera_UpdateCameraBox`. The setup alias needs one scope qualification: `InitCameraBox` reseeds an existing camera subject and is reused after fighter scale changes. It does not allocate the box.

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Reader `ftcamera_naming_review`. The complete canonical and frozen-baseline rendered C file, lines 1–115, and header, lines 1–15, were read. Both renders are `ok`, have zero parse errors, and have 7 and 4 substitutions respectively. No empty or failed render.

| Symbol | Existing Alias | Decision |
|---|---|---|
| `ftCamera_80076018` | `ftCamera_ScaleCameraData` | Accept ScaleCameraData. The complete body multiplies each of six scalar components into the output. It assigns no field meaning beyond camera data. Evidence `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L10-L18`. Reviewed fact `fact:b21f9c41-6bcf-497d-af78-af3b7618fe0b`, updated `2026-09-06T02:34:38.472Z`. |
| `ftCamera_80076064` | `ftCamera_InitCameraBox` | Accept InitCameraBox as initialization or reseeding of an existing CmSubject, not allocation or first-use-only setup. It activates state, computes horizontal and vertical target extents, copies both into current extents, and seeds pos and bone_pos. The scaling caller in ft_0D27.c:27-33 proves reuse after a scale change. The source comment describes only the position-copy part and does not supersede body evidence. Evidence `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L20-L47`. Reviewed fact `fact:31a12f8d-3ff7-4e37-a8d8-a60ecf235961`, updated `2026-09-06T02:34:38.472Z`. |
| `ftCamera_800762F4` | `ftCamera_UpdateCameraBonePosition` | Accept UpdateCameraBonePosition. This wrapper passes the existing subject bone_pos address to the same helper labeled Fighter_GetCameraBonePos in the canonical full updater at lines 85-86. No other field is explicitly written in this wrapper. Evidence `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L89-L93`. Reviewed fact `fact:40072cd3-f436-4378-86c8-417f00157f6f`, updated `2026-09-06T02:34:38.472Z`. |
| `ftCamera_80076320` | `ftCamera_UpdateDeadUpCameraBox` | Accept UpdateDeadUpCameraBox. It calls the full updater, scales pos.x by camera-top distance divided by blast-top distance from stage center, asserts the denominator is nonzero, and places pos.y at blast-zone top. DeadUpStar_Cam and DeadUpFall_Cam callers confirm the DeadUp scope. The function does not change pos.z after the ordinary update. Evidence `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L95-L114`. Reviewed fact `fact:85d63cea-54b9-4230-a256-a1b80eb4b547`, updated `2026-09-06T02:34:38.472Z`. |

## Setup and Update Are Different

Canonical `.c:27,38-46` activates the subject, seeds vertical targets, synchronizes current extents with targets, and copies the calculated position into bone_pos. The canonical comment at line 20, `Camera_CopyPlayerPositionToCameraBoxPosition`, describes part of this behavior; it is not an attested function identifier. The body supports the broader InitCameraBox hypothesis. Pinned `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D27.c#L27-L33` calls it after `ftLib_SetScale`, so initialization here includes reseeding.

Canonical UpdateCameraBox at `.c:49-87` updates horizontal target extents, facing, and position, clears on_ledge, and refreshes bone_pos through ftLib_800866DC. It does not refresh vertical target extents, current extents, or subject state. No inferred-name row exists for this canonical API. Neither the comments `Fighter_UpdateCameraBox` nor `Camera_UpdatePlayerCameraBoxPosition` justify replacing the current name.

The DeadUp naming context was independently checked at `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D31.c#L697-L700` and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D4D.c#L50-L53`. Foreign canonical reads do not claim ownership or full rendered review of those TUs.

## Inputs and Limits

C SHA-256 `32ee5ff56e14c03c047927493a12ad1432a4249bde223d289593bf59a0b8e376`. Header SHA-256 `ca2e575788e508f0e6e108b5bd6405d6151b80d8e159af0f36555970ea7411d4`. Exact page receipts, fact IDs, and foreign ranges are in `naming-review.json`.

The renderer reports foreign naming collisions for ftLib_800866DC and Stage_GetBlastZoneTopOffset. Those aliases are outside this review and cannot establish canonical identities. This review introduces no names and makes no new claim about those foreign implementations. The attempted ftLib read at 415–445 was unrelated to the camera helper, so it supplies no helper evidence. Four aliases accepted, one canonical API retained, zero rejected, zero deferred. No KB mutation or source edit.
