# CaptureKoopa translation-unit review

## Scope and naming
The owned implementation and header define five address-named helpers and eight empty lifecycle callbacks. Inherited full-file, subject, and link coverage is accepted. No source-level global object establishes the baseline `.sdata` or `.sdata2` contents or layout.

Rendered names such as `ftCo_CaptureKoopa_UpdateAnim`, `ftCo_CaptureKoopa_Enter`, and `ftCo_CaptureKoopaAir_Enter` remain descriptive hypotheses, not canonical symbols or independent behavioral evidence. The entry wrappers select damage-state continuations, not the states served by the adjacent empty callback quartets.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureKoopa.c#L1-L112.

## Model-scale callback
`ftCo_800BC438` forwards its object unchanged to `Fighter_UpdateModelScale`. That callee obtains the common model scale, selects `x34_scale.z` for X when it differs from 1 and otherwise selects the common scale, uses the common scale for Y and Z, and updates the root JObj scale.

The identified installation is YoshiEgg entry assigning this function to `take_dmg_cb` after entering `ftCo_MS_YoshiEgg`. This corrects the baseline's Koopa-specific attribution without asserting exclusive YoshiEgg use. There is no local allocation, timer processing, guard, or state transition. Complete callback dispatch and clearing lifetime remain external.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureKoopa.c#L20-L23; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L213-L230; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_YoshiEgg.c#L91-L103.

## Grab timing and mash input
`ftCo_800BC458` operates on the captive. Its `victim_gobj` supplies the associated captor's parameters despite the field's name. The helper subtracts attribute `x48` from `grab_timer`, calls `ftCommon_GrabMash` with attribute `x44`, and stores the result in `capturekoopa.x0`.

The inherited common-helper review establishes separate deductions for qualifying button input and remembered thresholded stick-direction changes. Multiple qualifying buttons still use one button deduction; changes on both axes use one stick deduction. Equality/dead-zone input does not reset the remembered direction. Grab initialization with flag 0 clears the remembered directions and disables extended shake bookkeeping.

There is no local clamp, release, or positivity/finiteness validation. Waiting callbacks process timing before expiration. Damage callbacks can first transition to waiting on animation completion without processing timing that invocation. Processed expiration notifies the captor, reverses the captive's facing, and enters CaptureCut; continuation calls `ftCo_800BC4A8`. Negative parameters may increase the timer, and NaN fails the ordered expiration test. Eventual escape is not guaranteed for arbitrary values.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureKoopa.c#L25-L31; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopa.c#L395-L407; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L670-L719; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureWaitKoopa.c#L22-L54; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureDamageKoopa.c#L27-L48.

## Pose and animation maintenance
`ftCo_800BC4A8` first tests `mv.ca.specialhi.vel.y` for nonzero. Within that branch it resolves YRotN, multiplies `x1A50` and `x1A51` by `capturekoopa.xC`, and independently attempts Z and Y translation additions. The absolute proposed coordinate must be at most `capturekoopa.x10` for Z or `mv.co.walk.fast_anim_frame` for Y. Equality is accepted; outside-bound steps are rejected, not clamped. Existing out-of-range coordinates are not necessarily repaired. Negative finite bounds reject ordinary finite absolute coordinates; NaN fails ordered bound comparisons, and infinities are not sanitized.

The branch then decrements `capturekoopa.x8`, rereads `mv.ca.specialhi.vel.y`, and restores rate 1 and clears `x8` when that reread is nonpositive and `x0` is false. A final independent `x8 <= 0 && x0` check reloads `x8` from captor attribute `x40` and animation rate from `x3C`. Zero skips the outer branch but not restart checking. Signed zero is false in the outer test; NaN is nonzero but fails ordered nonpositive comparisons. Reload intervals and rates receive no validation.

Mixed motion-variable views are preserved exactly. The Captain declaration suggests that its `vel.y` shares timer storage with `capturekoopa.x8`, but exact compiled overlap remains deferred. The Y-bound spelling is not normalized or assumed equal to the Z bound. The helper directly changes joint translation and animation rate, not world position, and performs no motion-state transition.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureKoopa.c#L33-L62; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCaptain/types.h#L55-L71; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/types.h#L271-L277; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopa.c#L409-L435.

## Shared entry and cross-file lifetime
The TU-local `inlineA0` resolves both Fighters, calls `ftCommon_8007DB58`, `ftCo_8009750C`, and `ftCo_800DD168` on the captive, stores the captor in `x1A5C` and `victim_gobj`, clears `x221B_b5` and `x221B_b7`, and copies facing. It initializes the grab with flag 0 and captor attribute `x4C`, clears `mv.ca.specialhi.vel.y`, calls `ftCo_800DB368(vic_fp, fp)`, and invokes its continuation synchronously. Afterward it calls `ftCommon_8007D5D4`, loads attributes `x34` and `x38` into `capturekoopa.xC` and `x10`, and calls `ftCommon_8007E2FC`.

The first object is the mutation target; the second is a retained relationship and parameter source. No allocation, ownership transfer, reference counting, local null protection, or rollback occurs. The continuation itself is not retained. Captor links must remain valid for later queries, and cached Fighter validity across callbacks is an external invariant. The inherited cleanup review notes that `ftCommon_8007DB58` can invoke optional damage/death callbacks, so the overall operation is not unconditionally branchless.

`ftCo_800BC7E0` selects `ftCo_800BC9C8`, which enters CaptureDamageKoopa. `ftCo_800BC8D4` selects `ftCo_800BCAF4`, which enters CaptureDamageKoopaAir. Both continuations use frame 0, rate 1, blend 0 and the linked animation source; `x2222_b6` conditionally selects FreezeState. They install `ftCo_800DB464` as `accessory1_cb`. Full clearing and attachment lifetimes remain unproved here. Ground and air SpecialS callers register the respective wrappers; numeric state values alone are not used as semantic proof.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureKoopa.c#L64-L103; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureDamageKoopa.c#L16-L25; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureDamageKoopa.c#L58-L67; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/ftkoopaspecials.c#L49-L97; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L657-L680.

## Empty lifecycle callbacks and limits
All eight CaptureKoopa/CaptureKoopaAir Anim, IASA, Phys and Coll bodies are empty and ignore their argument. The active motion table registers their respective quartets with a separate camera callback. Registration proves callback slots, not an actual visit after grab connection. Meaningful timing is owned by the damage/wait families; the nearby wrappers enter damage states instead. Consequently the upstream exact-state initialization/held-state gameplay claims and seven associated links remain deferred.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureKoopa.c#L87-L111; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftmotionstates.c#L3192-L3278.

No compiled section, relocation, or layout evidence supports assigning diagnostic pathnames, padding, constant-pool contents, or byte overlap. Rendered external cleanup/attachment aliases, includes, header address comments, and gameplay descriptions do not independently prove those claims. The four proposed facts agree with this functionality review; no lead overrides are necessary.

Status: synthesized; independent review and live promotion pending.
