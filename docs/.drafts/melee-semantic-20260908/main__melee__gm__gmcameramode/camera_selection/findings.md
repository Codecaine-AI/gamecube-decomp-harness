# Camera Selection Review

Reviewed c113–188 in canonical and separate rendered views at `c302741689bd67c361cd7faadb221df3193992c3`, plus scene-table evidence c25–78. All 76 assigned lines, four targets, four parameter entities and 23 existing facts are accounted for. The TU lead owns header and remaining source coverage. Source SHA-256 is `bc69874ede714c3d5c38d627dec75c6ddc1cd519f5651cbf53fc9a95cd2eb5d1`.

## Behavior and Names

| Canonical | Alias decision | Behavior |
|---|---|---|
| gm_801B254C | Retain gm_PrepCameraModeCSSScene | CSS entry copies vs_camera into CSSData, sets match_type to 1, attaches KO-count storage, sets up VS preload cache and marks GM_CAMERA_MODE. |
| gm_801B25D4 | Propose gm_ExitCameraModeCSSScene | CSS exit sends pending_scene_change 2 to GM_MENU and returns. Other values save vs_camera, OR helper results for all six character kinds into a u64, then perform audio calls. |
| gm_801B26AC | Retain gm_CameraMode_EnterSss | SSS entry copies vs_camera into entering SSSData and calls gm_80167FC4 with that payload. |
| gm_801B2704 | Retain gm_ExitCameraModeSSSScene | Nonzero start_game saves configuration and performs stage-keyed audio calls. Zero start_game requests CSS state 1 without copying configuration or making those audio calls. |

All four canonical symbols remain address-based. Existing aliases and the new name are descriptive hypotheses, not attested original names. The proposed CSS exit alias follows the retained CSS entry and SSS exit names. The scene table pairs these callbacks with GS_CSS state 1 and GS_SSS state 2. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L43-L66.

CSS entry takes the preload cache pointer before calling lbDvd_SetupVsPreloadCache, writes mode_kind afterward, then calls lbDvd_80018254. No internal effect of that final helper is inferred. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L120-L133.

CSS cancellation is exactly pending_scene_change == 2. The other path copies the whole VsModeData, visits players 0 through 5 without a local active-player guard, then calls lbAudioAx_80026F2C with 0x14, lbAudioAx_8002702C with category argument 4 and the combined mask, and lbAudioAx_80027168. This supports roster-keyed audio setup without relying on rendered callee aliases. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L142-L158.

SSS confirmation similarly copies the whole configuration and calls the audio sequence with 0x18 and 8, using lbAudioAx_80026EBC of the selected stage kind. It returns without explicitly choosing state 3. State-table order alone cannot establish automatic advancement, so the inherited progression claims are narrowed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L171-L187.

## Fact and Parameter Coverage

`fact-dispositions.json` records 19 retained and four superseded facts with every ID and updated-at version. Superseded facts remove implied dispatcher progression or replace an unreviewed callee-role assertion with the concrete gm_80167FC4 call. All retained facts receive refreshed full-revision citations. The new CSS exit name makes 24 proposed writes.

Each #r3 entity has an empty fact inventory. Each corresponding function has one source parameter, GameModeState*, and forwards it to the appropriate enter-data or exit-data accessor. Parameter entities are individually recorded in `coverage.json`; no new entity or parameter facts are proposed. External GameModeState, CSSData, SSSData and VsModeData layouts are not claimed.

## Validation and Limits

Both reviewed pages rendered successfully with zero parse errors; substitutions were 10 and 6. No source or rendered page was truncated. `coverage.json` links canonical/rendered artifacts and hashes.

Dry-run validation accepted 24 writes, rejected zero and skipped zero. Proposal SHA-256 is `c36d22e3adf1238b279c4b5f6ac857fbb99f4935936c3501ae73dfca1b16a9c5`. No KB application occurred. Independent name and semantic review remain pending. Family followups defer dispatcher progression and detailed audio helper/constants interpretation. Proposal entities, merges, links and follow_ups are empty.
