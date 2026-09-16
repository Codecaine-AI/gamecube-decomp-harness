# Regular Clear presentation

`gmregclear.c` implements the post-match Regular Clear score presentation. Its header also declares functions belonging to other split subsystems; those declarations do not establish implementation ownership here.

## Calculation and initialization

`fn_8017F008` maps numeric classifications to bonus masks, with fallback `0xFD`. `fn_8017F09C` calculates a rule- and variant-gated timer product, clamping negative products to zero. `fn_8017F14C` applies an upper-only 9,999 cap to the signed counter at input offset `0x98`, then multiplies by `x10A`; negative counters are not clamped. `fn_8017F1B8` scans all 256 bonus indices, filters by applicability, uses different evaluators below versus at/above kind `0xD7`, records qualifying indices, and returns the aggregate. The recording call ultimately ORs a bit into save data.

`fn_80180630` clears the persistent presentation record, installs display-cache sentinels, and configures numeric variants 1, 2 and 3. Variant 1 obtains Ground counts and changes the timer multiplier to 200. Variant 3 suppresses ordinary calculated components and imports Push On score and coins only for `OUTCOME_UNK_1P_BONUS_STAGE_END`; the signed conversion round trip precedes narrowing into `u16`. The initializer combines incoming and calculated scores, clamps the target to 0–999,999,999, and sets `lbl_804D65C0` to `(target - starting_score) / 10`. Thus the earlier checkpoint's unresolved producer question is resolved: this initializer supplies the step. A nonzero difference smaller than ten can still produce a zero step.

It loads `GmRegClr`/`ScGamRegClear_scene_data`, localized clear text, lights, camera and model resources, capture/blur resources, and optional coin UI. It writes the finalized coin count back to the supplied result record. Missing scene data is reported but still passed onward. The model-allocation failure branch dereferences the null GObj before its diagnostic/panic calls; it is not a safe recovery path.

## Text and recurring behavior

`fn_8017F2A4` creates a localized seven-row decision layout plus a total field. `fn_8017F47C` refreshes row values and caches, always rewrites the aggregate, and returns a lookup at the original cursor. Importantly, score lookup occurs before the negative/repeated-index guard. The guard detects only consecutive repetition, not arbitrary cycles.

Component text is created lazily and rebuilt while unsettled, normally showing multiplier notation for the first 59 updates and a final integer from update 60. Suppression conditions can settle the timer display immediately. Text positions follow a transformed model anchor. The total updater deletes text while hidden; while visible it adds the signed global step or snaps when within its absolute magnitude. Its return indicates anchor visibility, not tally completion. The addition updater recreates visible text every call and changes its displayed contribution at timer thresholds 12 and 32.

The registered `fn_8017FF1C` process animates the model, updates score text, browses bonuses after frame 41, reveals variant elements, and updates navigation indicators. Manual navigation sets `xC8=1`, disabling the local automatic-scroll branch rather than restarting it. Human-player A input completes the tally immediately; input mask `0x1000` after frame 62 latches dismissal. The blur-progress increment can overshoot one before a subsequent call clamps it. The frame guard remains literally `x110 + 0x10000 != 0xFFFF` and is not interpreted as an ordinary 16-bit saturation check.

The blur renderer invokes `fn_8017FE54` before consuming its updated fields. The callback refreshes the capture, supplies `(int)(120*x10C)+1` through a signed-byte setter, and computes `0.0225*x110-0.175`, forcing values below 0.05 to zero and values above one to one.

## Cross-file lifetime and evidence limits

The match controller conditionally prepares or reuses finalized result data, calls the initializer, and enters numeric phase 2. It polls `fn_80180AC0`; that accessor returns one only when `x116 == 1`, without consuming the latch, allowing transition to phase 3. Match exit separately selects `fn_8017F294` under rules bit `x4_4`, otherwise retaining the rules score. These entry and exit guards are not identical and should not be collapsed into a single assumed lifecycle condition.

Canonical evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmregclear.c#L119-L1105`; `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L1493-L1547`; `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L2093-L2097`; `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain_lib.c#L707-L717`; `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbspdisplay.c#L703-L818`.

No current compiled artifact was available to establish section occupancy, padding, constant-pool duplication or emission order. Those baseline claims remain unresolved. Rendered names were treated as hypotheses, not independent proof.

Status: synthesized; independent review and live promotion pending.
