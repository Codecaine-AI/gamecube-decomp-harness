## Link forward declarations and motion identifiers

`src/melee/ft/kinds/ftLink/forward.h` declares the attribute and fighter-variable structures and motion-variable union without defining their layouts. It includes the fighter and common-fighter forward headers. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLink/forward.h#L1-L9)

The header defines named `MotionFlags` combinations for AttackS42, neutral-special charge/fire variants, side-special variants, up/down specials, and aerial catch. These are bitwise compositions, not executable transition handlers. Some differently named combinations are algebraically identical: SpecialAirNFire already inherits UnkUpdatePhys through SpecialAirNCharge; SpecialSCatch likewise adds an already inherited flag to SpecialSThrow; SpecialAirSThrow and SpecialAirSThrowEmpty compose the same flags. These identities do not establish equivalent move behavior. The meanings of Unk19 and UnkUpdatePhys are not resolved here. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLink/forward.h#L11-L60)

`ftLink_MotionState` extends `ftCo_MS_Count` with 21 states, including two appeal states, ground/air specials, explicit empty side-special variants, and AirCatch/AirCatchHit. `ftLk_Submotion` extends the separate `ftCo_SM_Count` namespace with 19 entries and omits the appeal entries. Their SelfCount values are relative counts; this file does not establish either common base's absolute numeric value or a one-to-one numeric mapping between the namespaces. `ftLk_SpecialNIndex` separately enumerates ground Start/Loop/End, air Start/Loop/End, and None, with implicit values 0–6. [Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftLink/forward.h#L62-L120)

## Review outcome

All 123 canonical and rendered lines were reviewed. The rendered view reports zero substitutions and zero parse errors and agrees with the canonical declarations. There are no frozen subjects, facts, or links to disposition. No supported naming correction or knowledge mutation is needed. This header supplies no executable exceptional branches, object-lifetime implementation, or compiled section/layout evidence; none is inferred.

Status: researched; no-change lead bypass; independent review and live promotion pending.
