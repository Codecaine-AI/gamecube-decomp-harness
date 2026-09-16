# Camera Mode Resource Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 112 assigned C lines and all 11 header lines were read separately in canonical and rendered views. No page was truncated.

## Target Behavior

### `.data`

Defines Camera Mode state descriptors with IDs 0 through 3 for GS_CAMERA_VS, GS_CSS, GS_SSS and GS_VS, followed by an ID -1 terminator. Each descriptor supplies lbDvdPreload_3, paired callbacks and scene payload pointers.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L30-L80

### `.sbss`

Provides static s64 gm_804D68C8 as both payload pointers for state 0, GS_CAMERA_VS. This file does not expose the complete payload layout or the producer of the integer exit statuses.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L28-L42

### `gm_801B23F0`

Passes three resource requests to lbDvd_80017740 with IDs 2006, 2007 and 2008. ID 2006 uses OSRoundUp32B of GXGetTexBufferSize(640,480,4,0,0); IDs 2007 and 2008 use values returned by lbSnap_8001E204 and lbSnap_8001E210. No return values or failure conditions are checked here.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L82-L88

### `gm_801B24B4`

Initial Camera Mode callback. Obtains the GameCache pointer, calls lbDvd_SetupVsPreloadCache, writes GM_CAMERA_MODE, calls lbDvd_80018254 and lbCardNew_AllocWorkArea, retrieves 0x7D8 then 0x7D7, and passes 0x7D7 followed by 0x7D8 to lbSnap_8001E218. Its GameModeState argument is unused.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L30-L42, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L90-L102

### `gm_801B2510`

State 0 exit callback obtains the integer payload through gm_GetGameModeStateExitData and requests GM_MENU after the current scene when its first integer is 1 or 2. Other values make no transition call. It does not write the payload or check for NULL.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L30-L42, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L104-L111

## State Table

| ID | Scene | Entry Callback | Exit Callback |
| --- | --- | --- | --- |
| 0 | GS_CAMERA_VS | gm_801B24B4 | gm_801B2510 |
| 1 | GS_CSS | gm_801B254C | gm_801B25D4 |
| 2 | GS_SSS | gm_801B26AC | gm_801B2704 |
| 3 | GS_VS | gm_PrepCameraModeVSScene | gm_801B2AF8 |

The final descriptor has ID -1. This table defines bindings, not an unconditional progression through all four states.

## Header and Naming

The complete header declares gm_801B23F0, gm_Mode_Camera_OnInit and gm_Mode_Camera_States. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.h#L1-L11. OnInit is outside this leaf's claim ownership.

Retain gm_PreloadCameraModeResources as the existing inferred name for gm_801B23F0. Keep gm_801B24B4 and gm_801B2510 canonical; no speculative name is added. Rendered names for DVD and snapshot functions do not prove callee internals.

## Coverage and Limits

5 targets, 2 parameter entities, 21 existing facts. Dispositions: {'retain': 17, 'supersede': 4}. Proposal contains 23 writes. The parameter entities have no baseline facts and are individually accounted for in coverage.json.

The two resource IDs supplied to lbSnap are matched locally: decimal 2007 equals 0x7D7, and 2008 equals 0x7D8. Fixed buffer sizes, snapshot storage layout and scheduler exclusivity are deferred to their owning families. Statuses 1 and 2 have no local user-action labels.

Source hashes, render receipts, per-subject accounting and followups are in coverage.json; all fact IDs and updated_at versions are in fact-dispositions.json. No source, shared KB, matching, Git, or UI edits.

Helper dry-run validated all 23 writes, with zero rejected items. Proposal hash `4c6f779dd56ae686fa606f4d2c586918d3ecbe11ffb3b721df67b759f12501a1`. No apply ran.
