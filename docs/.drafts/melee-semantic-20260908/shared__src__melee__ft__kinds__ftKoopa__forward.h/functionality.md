## Koopa special-motion declarations

`src/melee/ft/kinds/ftKoopa/forward.h` defines reusable special-motion flag combinations and two distinct enum ranges; it contains no executable control flow.

The shared flag combination contains `Ft_MF_SkipModel`, `Ft_MF_SkipItemVis`, `Ft_MF_UnkUpdatePhys`, and `Ft_MF_FreezeState`. Specialized combinations add fast-fall, graphics, sound, or collision-animation/hit-status preservation flags. Start/air variants add `Ft_MF_SkipParasol` as explicitly declared, while neutral-loop combinations add `Ft_MF_Unk19`. The unknown flags' runtime meanings are not established here. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/forward.h#L7-L37.

`ftKoopa_MotionState` extends `ftCo_MS_Count` with 23 motion states; `ftKp_Submotion` extends `ftCo_SM_Count` with 21 submotions. Both cover neutral, side, up, and down specials, including ground/air distinctions and down-special landing. Motion states distinguish side-special `Hit0_0` and `Hit0_1` entries on both ground and air, whereas submotions have one `Hit0` entry per ground/air group. These are separate sequential enum entries, not evidence of aliases or a runtime mapping. Each enum defines its own terminal count and relative self-count. Absolute numeric bases and state-to-animation mapping are not established by this header. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/forward.h#L39-L91.

The complete rendered view matches the canonical declarations, with zero substitutions and zero parse errors. No existing facts, links, or subjects were returned by the exhaustive baseline enumeration. No supported semantic correction or renaming is warranted.

Status: researched; no-change lead bypass; independent review and live promotion pending.
