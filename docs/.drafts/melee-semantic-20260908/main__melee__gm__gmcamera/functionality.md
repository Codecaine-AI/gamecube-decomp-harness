# VS Camera Snapshot UI

Owns the nine-state VS Camera capture and snapshot-storage UI, controller-index-3 input, cached storage classifications, text/model resources, and synchronous entry/update dispatch. State-table flags separately control model visibility.

## State Flow

| State | Entry / Update | Transitions |
|---|---|---|
| 0 | Restore presentation / idle input | B toggles info; Z enters 1 |
| 1 | Suppress presentation and request capture / poll after two updates | Non-null prepared image enters 2; preparation failure enters 0 |
| 2 | Rebuild three storage texts / storage and A/B input | Changed storage reenters 2; A routes by aggregate class; B enters 0 |
| 3–5, 8 | No entry / dismiss message | B enters 0 |
| 6 | Initialize binary confirmation / monitor and input | Changed storage enters 2; accept selection 0 enters 7; cancel enters 0 |
| 7 | Submit selected channel / poll operation | 0xB remains; 0 enters 0; other values enter 8 |

Transitions run the new entry callback synchronously, even when reentering the same state. Update and visibility application remain separate calls. The table has nine entries; dispatch does not validate indices.

Slot classifications prioritize channel 1 as aggregate class 0 and channel 0 as class 1 when available capacity meets x20. Nonzero query errors leave cached capacity fields intact. Status text construction rewrites each UI class before the aggregate minimum is used. The numeric formatter writes up to nine bytes and caps numbers at 9999.

The confirmation cursor uses selection zero at x=-5 and one at x=+5. A/Start precedes B and directional input. In idle, B precedes Z. The capture counter begins polling on update three. Text cleanup tests only the first of three pointers before disposing the full set.

## Owned Headers and Limits

The main header defines state, slot records and callback rows. Its bool x0 field carries multi-valued status codes in the source. Several prototypes retain placeholders. The static header is read completely but is not included by this C file; its separate layout declarations do not prove compiled section ownership. Four section targets await object-level confirmation. Snapshot/card, SIS, and pause helper internals are separate family claims.

## Function Coverage

| Symbol | Canonical Evidence | Behavior |
|---|---|---|
| gmCamera_801A2224 | [52–90](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L52-L90) | Formats a u32 capped at 9999 into one to four two-byte decimal table entries, suppressing leading zeroes, writing a one-byte zero terminator, and returning its address. Destination capacity is unchecked. |
| gmCamera_801A2334 | [92–169](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L92-L169) | Creates a text object using the stored SIS handle and supplied geometry, selects group 6 or 7, classifies one of two cached storage records, writes its xC class, formats a nonzero count, appends the selected status/count label, and binds the group. Status classes are 0/1 for enough capacity, 2 for insufficient blocks, 3 when x8 is zero, 5 for status 15, and 4 for other errors. |
| gmCamera_801A253C | [171–192](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L171-L192) | Caches the minimum of two xC classes in x44 and optionally returns it. The optional capacity output is the maximum of slot-0 x4 admitted only for class 1 and slot-1 x4 admitted only for class 0. |
| gmCamera_801A25C8 | [194–204](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L194-L204) | Refreshes each of two x0 status fields through lbSnap_8001D40C. Only a zero result replaces its x4 and x8 values through two further lbSnap queries; errors leave those cached values unchanged. |
| gmCamera_801A2640 | [206–209](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L206-L209) | Returns the stored SIS context value x54 without mutation. |
| gmCamera_801A2650 | [211–216](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L211-L216) | Sets the capacity threshold x20 to 2, loads SdVsCam/SIS_VsCameraData through SisLib slot 3, and stores the context-creation result in x54. |
| gmCamera_801A26C0 | [261–280](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L261-L280) | State-0 entry conditionally clears scene flag 3 and restores pause or active-match presentation, writes hud_enabled=1 and unk_3=0 in that branch, then frees all three text slots only when the first slot is non-null. |
| gmCamera_801A2798 | [282–294](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L282-L294) | State-0 update reads controller index 3 triggers. B toggles information visibility modulo two and returns; otherwise Z plays cue 6 and enters state 1. B wins over simultaneous Z. |
| gmCamera_801A2800 | [296–316](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L296-L316) | State-1 entry resets the delay counter, requests frame 0 on UI branch 2, sets scene flag 3, selects paused or active presentation suppression, writes HUD flags, and invokes cmSnap_800315C8. |
| gmCamera_801A28AC | [318–332](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L318-L332) | State-1 update increments the counter and starts polling cmSnap_80031618 after it exceeds 2. Stores the image pointer even when null; non-null images passed successfully through lbSnap_8001DC0C update x20 and enter state 2, while failure enters state 0. |
| gmCamera_801A292C | [334–368](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L334-L368) | State-2 entry conditionally releases previous texts, refreshes both storage records, creates required-capacity text and two slot status texts using the twelve-float layout table, and caches the minimum class in x44. |
| gmCamera_801A2AAC | [370–402](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L370-L402) | State-2 update prioritizes either nonzero storage-change query by reentering state 2. Otherwise A precedes B: classes 0/1 go to state 6, 5 to 3, 2/3 to 4, others to 5; B returns to 0. |
| gmCamera_801A2BB0 | [404–410](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L404-L410) | Shared update for states 3, 4, 5 and 8: controller index 3 B triggers back feedback and enters state 0; other input does nothing. |
| gmCamera_801A2BF0 | [425–451](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L425-L451) | State-6 entry selects animation frame 1 when x44==1, otherwise 2, evaluates branch 9 and stops TOBJ animation, resets selection x18 to zero, and places branch 12 at x=-5. |
| gmCamera_801A2D44 | [489–516](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L489-L516) | State-6 update prioritizes storage-change queries by returning to state 2. A or Start enters state 7 for selection zero, otherwise state 0; B enters 0. Remaining left/right triggers update binary selection and cursor x to -5/+5. |
| gmCamera_801A2FBC | [518–527](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L518-L527) | State-7 entry passes channel 1 to lbSnap_8001DF6C when aggregate class x44 is zero, otherwise channel 0. It does not check an immediate result. |
| gmCamera_801A2FFC | [529–540](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L529-L540) | State-7 update polls lb_8001B6F8. Result 0xB leaves the state unchanged, zero enters 0, and every other result plays cue 3 then enters 8. |
| gmCamera_801A3048 | [542–548](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L542-L548) | Stores the requested state index and synchronously runs its optional entry callback. Does not validate the index, skip identical transitions, or run update/visibility callbacks. |
| gmCamera_801A3098 | [550–555](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L550-L555) | Runs the current state row's update callback once if non-null; it does not itself modify state or validate the index. |
| gmCamera_801A30E4 | [557–579](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L557-L579) | Shows the information hierarchy only when the row flag, x14 toggle and clear scene flag 1 allow it. Hides the main hierarchy, then reveals branches selected by the current row's 16-bit mask. |
| fn_801A31D8 | [581–584](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L581-L584) | Passes the attached GObj hsd_obj to HSD_JObjAnimAll. Setup installs it on the IfCamera model GObj. |
| gmCamera_801A31FC | [601–630](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcamera.c#L601-L630) | Initializes snapshot support, sets x14=1 before selecting state 0 and invoking its entry callback, loads IfVsCam and both interface models, registers GX drawing and main-model animation, initializes SIS resources and threshold 2, then nulls all text slots. |

All 710 owned lines were read in canonical and rendered forms. The header renderer reports shadowed bindings for the number and slot-text prototypes; their canonical declarations were read directly. Naming decisions and every inherited fact ID/update marker are in findings.json.

## Live application status

Live promotion confirmed: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gm__gmcamera/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gm__gmcamera/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/1214a89891f8a5b49312625070d26514a76d3ddc6dea70174727c7b93e3ae331/2026-09-08T14-44-05.561Z-bc8e6d78-97bd-42da-ae72-dbead9b9e623.receipt.json). Unresolved inherited claims remain unresolved. Proposal and review hashes preserved.

Verified completion: live promoted. [final-render.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gm__gmcamera/final-render.json>) and [staged-completion.json](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gm__gmcamera/staged-completion.json>).
