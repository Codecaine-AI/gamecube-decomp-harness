# `lblanguage` Functionality

Local research is complete; independent proposal review and application are pending. Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. The two owned files contain eight canonical functions, one TU entity and two parameter entities. All 42 existing facts were reviewed.

## State and API

The TU exposes two independent language values: `gmMainLib_804D3EE0->language` and `gmMainLib_8015CC58()->saved_language`. The latter accessor returns a field inside current in-memory save data. It does not load a memory card. Both fields are declared u8 in foreign game-state structures. Dependency evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmain_lib.c#L99-L112`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/types.h#L100-L110`, and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/types.h#L319-L323`.

The owned header defines LANG_JP=0, LANG_US=1, and LANG_COUNT=2. The two setters check the half-open interval from zero to LANG_COUNT. The sentinel is not an accepted language value. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lblanguage.h#L6-L19`.

| Canonical API | Signature Shape | Behavior | Evidence |
|---|---|---|---|
| `lbLang_GetLanguageSetting` | none → enum_t | Returns active byte without validation. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lblanguage.c#L6-L9` |
| `lbLang_SetLanguageSetting` | enum_t → enum_t | Stores only 0 or 1; always returns the requested input. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lblanguage.c#L11-L18` |
| `lbLang_IsSettingJP` | none → bool | Tests active byte == LANG_JP. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lblanguage.c#L20-L23` |
| `lbLang_IsSettingUS` | none → bool | Tests active byte == LANG_US. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lblanguage.c#L25-L28` |
| `lbLang_GetSavedLanguage` | none → enum_t | Returns saved byte through the save-data accessor. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lblanguage.c#L30-L33` |
| `lbLang_SetSavedLanguage` | enum_t → void | Stores only 0 or 1 in the saved byte. Invalid input skips accessor. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lblanguage.c#L35-L40` |
| `lbLang_IsSavedLanguageJP` | none → bool | Tests saved byte == LANG_JP. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lblanguage.c#L42-L45` |
| `lbLang_IsSavedLanguageUS` | none → bool | Tests saved byte == LANG_US. | `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lblanguage.c#L47-L50` |

## Setter Outcomes

| Requested Value | Stored Field | Active Setter Return | Saved Setter Return |
|---|---|---|---|
| 0 / LANG_JP | Updated to 0 | 0 | void |
| 1 / LANG_US | Updated to 1 | 1 | void |
| Negative or >=2 | Unchanged | Original rejected value | void |

The active setter return is an input echo. It is not a success result or stored-value readback. The saved setter validates before calling its accessor. Neither setter updates the other language field, performs callbacks, synchronizes resources, or initiates a storage commit. These statements are bounded to the complete TU and the independently read address-returning accessor chain.

## Getter and Predicate Limits

Getters return raw stored bytes without sanitizing them. A valid-only return-domain claim is therefore too strong even though these setters accept only 0 and 1. Both corresponding JP and US predicates return false for an unexpected stored value. Global game-state pointers are used without local NULL guards. Initialization and other writers belong to the surrounding game-state lifecycle.

The saved field is a save-data preference in memory. Its name does not prove that a value was written to persistent storage. This review narrows inherited wording that described it as already persisted. The wider load/save lifecycle remains outside this TU.

## Presentation Evidence

The card-game description formatter calls the active JP predicate to select Japanese or English save-description text at `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L50-L68`. A separate menu query uses the JP and US predicates to gate branches for numeric entries 0x34 and 0x35 at `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mninfo.c#L57-L74`; the meaning of those entry IDs was not inferred. These reads support the localization role without promoting ownership of foreign payloads or structs.

## Naming, Coverage and Exceptions

All eight function names are already canonical and useful. No local inferred-name facts exist and no aliases or source renames are proposed. The rendered C view substitutes a foreign gmMainLib_GetPersistentSettings hypothesis. The reviewed canonical callee remains gmMainLib_8015CC58; no foreign naming decision is made.

Canonical and rendered C1–51 and H1–22 were read to EOF. Both renders returned ok, zero parse errors and next_line null. C made four foreign-name substitutions; H made none. The renderer includes a trailing empty C line 51, but the canonical validator recognizes 50 lines; file-level proposal citations stop at actual code line 50. The first failed dry-run recorded this discrepancy, and the corrected proposal passes.

Source SHA-256 `b0d043426a8dd52d2647273c9f3ab8c6e3563809e0725074ec75cd18f9dfeee6`. Header SHA-256 `a8e6f97e6b188a3b495bfa17f850498e36e4fbb1b69924d15d5e134fd11eb606`. Exact read receipts and page paths are in `coverage.json`. There are no owned data-section targets and no compiled-object claims. All foreign types remain family-only.

The proposal refreshes 42 existing category-specific facts, adds three state-behavior facts for raw getters and the active JP predicate, and adds two parameter-purpose facts. Fact IDs, updated_at versions, old/new values and dispositions are recorded in `fact-dispositions.json`. No shared KB write, compilation, matching, UI action or Git publication occurred.

## TU Lead Verification

Complete canonical and rendered source reviewed. Checked setter range validation, active setter input echo, saved accessor skipped on rejected input, independent fields and raw getters. Foreign byte-field/accessor evidence remains independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending. Snapshots are under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lblanguage/pages/`.

## Current Application Status

Root completed reviewed live KB promotion for 47 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lblanguage/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lblanguage/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/9eac87565e5c2e9afd70ee6f5755776c8e5e59101dd5c3bf949ac6164b7f87ce/2026-09-08T14-49-10.395Z-a0e00876-2f00-4a6b-bbcd-9511b8a8a953.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lblanguage/final-render.json).
