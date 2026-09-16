### Yoshi forward declarations and state constants

This header imports fighter/common forward declarations and forward-declares `S_UNK_YOSHI1` and `ftYs_DatAttrs`; it provides no structure layouts or executable callbacks ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/forward.h#L1-L8)).

It defines compositional motion-flag masks for shield and special-move transitions. The special base combines `SkipModel`, `SkipItemVis`, `UnkUpdatePhys`, and `FreezeState`; derived masks selectively add fast-fall, graphics, sound, collision-animation hit-status, throw-exception, or parasol flags. The neutral-special collision mask derives separately from `ftCommon_GroundAirColl_MF`, and its `CollHit` variant adds `SkipHit`. These are source-level mask relationships, not proof of runtime transition behavior or unknown bit semantics ([source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/forward.h#L10-L52)).

`ftYoshi_MotionState` extends `ftCo_MS_Count` with 28 states covering guard and special-move variants. `ftYs_Submotion` independently extends `ftCo_SM_Count` with 19 entries. Each enum defines an ending count and a self-count by subtracting its common base. The two sequences must not be treated as interchangeable; suffixes, numeric comments, and numeric mask names alone do not resolve state meanings or absolute values ([motion states](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/forward.h#L54-L85), [submotions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftYoshi/forward.h#L87-L109)).

All 112 canonical and rendered lines were reviewed. The renderer reported zero substitutions and zero parse errors; it supplied no independent naming evidence. Subjects and links were enumerated to completion and both were empty. No supported correction or sufficiently established rename warrants a proposal. No compiled layout, exceptional execution path, or cross-file lifetime is established by this declaration-only header.

Status: synthesized; independent review and live promotion pending.
