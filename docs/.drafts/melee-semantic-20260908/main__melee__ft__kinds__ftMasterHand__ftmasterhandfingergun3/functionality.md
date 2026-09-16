# FingerGun3 Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files were read in canonical and rendered views through EOF: 40 C lines and 13 header lines. All 12 manifest subjects are accounted for: five functions, one data target, one file entity and five parameter entities.

The registered FingerGun3 callbacks wait for animation expiry, gate an empty boss hook on slot type 0, apply animation-derived X/Y velocity and perform no collision work. The neighboring `ftMh_MS_366_80153820` enters `BackAirplane1`, not FingerGun3. Its caller labels that destination Jet. No callback or entry helper in this TU creates bullets.

| Canonical Function | Lines | Behavior |
|---|---:|---|
| `ftMh_FingerGun3_Anim` | 13-18 | Checks ftAnim_IsFramesRemaining for the supplied fighter object and calls ftMh_MS_389_80151018 only when false. That completion helper clears mv.mh.unk0.x20, selects Wait2_1, dispatches its setup, installs ftMh_MS_341_8014FFDC and records the attribute-derived return position. |
| `ftMh_FingerGun3_IASA` | 20-26 | Reads Fighter.player_id, queries its player-slot type and forwards the fighter object to ftBossLib_8015BD20 only for type 0. That helper immediately returns at this revision, so this callback has no direct state writes or effective mutation through that helper. |
| `ftMh_FingerGun3_Phys` | 28-31 | Forwards the fighter object to ft_80085134, which assigns self_vel.x = x6A4_transNOffset.z * facing_dir and self_vel.y = x6A4_transNOffset.y. It leaves self_vel.z unchanged and performs no local collision or state-transition work. |
| `ftMh_FingerGun3_Coll` | 33-33 | An empty void(HSD_GObj*) collision callback. It does not read its input, call helpers or write state. |
| `ftMh_MS_366_80153820` | 35-39 | Enters ftMh_MS_BackAirplane1 with flags 0, animation start 0, speed 1, blend 0 and null final object argument, then invokes ftAnim_8006EBA4. The destination is BackAirplane1 despite the function identifier containing MS_366; the attack-selector caller labels its case Jet. |

The owned header declares all five `void(HSD_GObj*)` interfaces and includes the baselib forward declaration. No new names are proposed; the canonical symbols remain authoritative. No inherited name aliases exist for these subjects.

## State and Dependencies

Animation expiry calls the shared wait setup with the same fighter object. The setup clears the move field, selects Wait2_1, installs a callback and records the attribute-derived return position. Physics delegates to `ft_80085134`; its X assignment includes facing direction, its Y assignment copies animation translation, and Z velocity is untouched. The collision callback is empty. The entry helper uses fixed transition arguments followed by `ftAnim_8006EBA4`.

Foreign source was read as context only. Claims on shared types and other TUs remain with their owners. The rendered names for `ftBossLib_8015BD20`, `ft_80085134` and `ftAnim_8006EBA4` were not used as proof.

## Coverage and Unresolved Data

Fact dispositions: {'unresolved': 4, 'retain': 19, 'supersede': 11}. Proposed writes: 11. All five parameter entities have explicit reviewed_empty records. IDs, versions, exact code locators, file hashes and render metadata are in `findings.json`.

Four `.sdata2` facts remain unresolved. The source confirms zero/one arguments but not an eight-byte pool, float ordering or address-level references. Immutable object/section review is required before those physical layout claims are accepted.

No source or shared KB edits, matching, publication or UI startup occurred. Independent review remains pending.

Dry-run passed: 11 accepted operations and zero rejections. Proposal SHA-256 `62014501025a1e6187495d5d1dca63d16f5c06fa90492b8419c7d401c1794fab`. The validator excludes the trailing empty C line; file-level evidence ends at39 while canonical/rendered EOF coverage remains40.

## Live application status

Live promotion confirmed by [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftMasterHand__ftmasterhandfingergun3/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftMasterHand__ftmasterhandfingergun3/staged-completion.json), [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/62014501025a1e6187495d5d1dca63d16f5c06fa90492b8419c7d401c1794fab/2026-09-08T14-38-46.860Z-3e01c309-bc92-424e-a3ef-92477b047b56.receipt.json). Unresolved inherited claims remain unresolved. Proposal and review hashes are preserved.
