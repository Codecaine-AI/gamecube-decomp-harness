## Master Hand forward declarations

The complete canonical and rendered `src/melee/ft/kinds/ftMasterHand/forward.h` were reviewed (133 lines). This guarded header includes the common fighter forward declarations and declares the incomplete `ftMasterHand_SpecialAttrs` type; it does not define its fields or lifetime (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/forward.h#L1-L6).

`ftMasterHand_UnkEnum0` contains eleven implicitly numbered members, with values 0–10. Their behavioral meanings remain unspecified; the header does not justify replacing the unknown names (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/forward.h#L8-L20).

`ftMasterhand_MotionState` and `ftMh_Submotion` each declare 50 character-specific entries in matching suffix order. Their first values use separate common bases, `ftCo_MS_Count` and `ftCo_SM_Count`; each ends with a count sentinel and a self-count calculated by subtracting its respective common base. Matching order does not establish equal absolute numeric values or prove runtime mapping. Distinct wait variants and squeezing entries are preserved rather than collapsed (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/forward.h#L22-L130).

This declaration-only file provides no runtime branches, transition implementations, resource ownership, or compiled layout evidence. The rendered view reports zero substitutions and zero parse errors and agrees with the canonical declarations. Enumeration of the frozen baseline returned no subjects, facts, or links. No supported semantic correction or rename is warranted; the proposal is empty.

Status: researched; no-change lead bypass; independent review and live promotion pending.
