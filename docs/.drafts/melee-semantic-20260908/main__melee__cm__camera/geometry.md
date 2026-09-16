# Camera Subjects, Framing and Quake Application

Review complete for canonical and rendered `camera.c` lines 1-1086 at `c302741689bd67c361cd7faadb221df3193992c3`. The parent reduced the original 1-2352 assignment before review reached line 721. All 17 function targets and 26 parameter entities were checked. The parameter entities have no inherited facts. No headers were assigned to this cluster.

The subject pool uses `cm_804D6458` as its free head and `cm_804D645C` as the allocated base. Active records form a doubly linked list from `cm_804D6460` to `cm_804D6468`. Checkout initializes non-link fields; release repairs the active links and returns the record to the free chain. Exhaustion loops after an error report.

Framing first filters subjects, smooths five extent components and collects a stage-constrained rectangle. The eligibility function changes state each time it is called. Its 600-count cooldown is not proven to mean 600 frames: the bounds builder performs an eligibility pass for weighting and another for sampling. An expired timer can therefore change acceptance between passes.

The geometry helpers compute bounds depth, desired interest and eye positions, and smoothing toward those targets. Preserve the FOV distinction: `Camera_80029BC4` takes the tangent of full target FOV, while `Camera_80029CF8` uses half current FOV plus or minus pan angles. The latter also clamps viewing depth after computing offsets.

Quake application consumes the pending X/Y sample, scales it through camera projection and depth tuning, publishes the pair to `Camera_80030DE4`, and clears the sample. Quake maintenance snapshots 16 records and decrements nonzero counters. It releases the stored object only when some counter was active before decrement and the loop counter is zero afterward. Mode presentation copies selected state into HSD CObjs; its pause path clamps only a temporary eye position.

## Target Review

Canonical names remain authoritative. Inherited hypotheses on the 13 address-named functions remain reading aids. Clear the four hypotheses on `Camera_Init`, `Camera_ApplyQuake`, `Camera_SetQuakeOffset`, and `Camera_UpdateQuakes`.

| Canonical Target | Reading Aid | Canonical Evidence |
| --- | --- | --- |
| `Camera_Init` | `Use canonical name` | [L163-L227](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L163-L227) |
| `Camera_80028F5C` | `Camera_InitSubject` | [L229-L256](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L229-L256) |
| `Camera_80029020` | `Camera_AllocSubject` | [L258-L261](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L258-L261) |
| `Camera_80029044` | `Camera_AllocSubjectWithState` | [L263-L284](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L263-L284) |
| `Camera_800290D4` | `Camera_FreeSubject` | [L286-L302](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L286-L302) |
| `Camera_80029124` | `Camera_GetBoundsFlags` | [L304-L345](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L304-L345) |
| `Camera_8002928C` | `Camera_CheckSubjectEligibility` | [L352-L385](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L352-L385) |
| `Camera_800293E0` | `Camera_ApproachSubjectBounds` | [L387-L462](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L387-L462) |
| `Camera_8002958C` | `Camera_CalcSubjectBounds` | [L464-L676](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L464-L676) |
| `Camera_80029AAC` | `Camera_ApproachTargetInterest` | [L701-L743](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L701-L743) |
| `Camera_80029BC4` | `Camera_CalcBoundsDepth` | [L749-L766](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L749-L766) |
| `Camera_80029C88` | `Camera_SmoothPositionTowardTarget` | [L768-L787](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L768-L787) |
| `Camera_80029CF8` | `Camera_CalcTransformFromBounds` | [L806-L908](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L806-L908) |
| `Camera_ApplyQuake` | `Use canonical name` | [L910-L966](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L910-L966) |
| `Camera_SetQuakeOffset` | `Use canonical name` | [L968-L972](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L968-L972) |
| `Camera_UpdateQuakes` | `Use canonical name` | [L974-L1000](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L974-L1000) |
| `Camera_8002A4AC` | `Camera_UpdateCObj` | [L1032-L1085](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/cm/camera.c#L1032-L1085) |

## Review Limits and Artifacts

The 101 inherited facts receive individual IDs, `updated_at` versions, dispositions and current canonical citations in [geometry.findings.json](geometry.findings.json). There are 56 retained facts, 28 superseded facts, four rejected hypotheses and 13 unresolved claims. Unresolved claims concern caller-specific fighter/item/stage roles, quake animation producers, game-mode meaning or a header field width. They remain pending family review rather than being silently accepted.

[geometry.proposal.json](geometry.proposal.json) contains 45 proposed fact operations, including the four clears. Its adapter dry run accepted all 45 with zero rejections. Nothing was applied to the KB. Validation receipt directory ends in `6ab4c725afa9f7c10803d75cf348833ccaa07d1d70ab301fb8e7b9196fb1ad32`.

The findings record all five canonical/rendered page paths and SHA-256 hashes, the pinned manifest hash, globals encountered and family followups. All page renders returned `ok` with zero parse errors. [geometry.facts.json](geometry.facts.json) preserves the full inherited rows and evidence. The TU lead retains file and data-section claims.
