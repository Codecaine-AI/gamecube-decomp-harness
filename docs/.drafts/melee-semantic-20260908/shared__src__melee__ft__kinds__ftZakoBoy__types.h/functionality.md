This guarded header declares two Zako Boy data types. `ftZakoBoy_FighterVars` contains only `char filler0[FIGHTERVARS_SIZE]`; it does not expose semantic fighter-variable fields. `ftZakoboyAttributes`, typedef'd from `struct _ftZakoboyAttributes`, contains one member, `s32 x0`. The header provides no meaning, initialization, or lifetime for that member, and no runtime behavior. These declarations do not independently establish compiled layout or the numeric value of `FIGHTERVARS_SIZE`. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZakoBoy/types.h#L1-L16.

All canonical and rendered lines were reviewed. The rendered view agrees with the canonical declarations, with no substitutions or parse errors. There are no baseline subjects, facts, or links to retain or correct. No supported semantic improvement warrants a proposal.

Status: researched; no-change lead bypass; independent review and live promotion pending.
