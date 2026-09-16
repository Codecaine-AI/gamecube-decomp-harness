## Player subsystem forward declarations

`src/melee/pl/forward.h` is a guarded declaration-only header. It forward-declares six structure types without defining their fields, allocation behavior, or lifetimes ([lines 1–9](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/forward.h#L1-L9)).

- `Gm_PKind` declares Human, Cpu, Demo, NA, and Boss with sequential values 0–4. The header does not establish their runtime handling ([lines 11–17](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/forward.h#L11-L17)).
- `plStats_Attack` defines attack-statistic identifiers spanning ordinary attacks, specials, `KbSpecialN` variants, grabs and throws, ledge attacks, and item-related attacks. Values run from `StatsAttack_None` at 0 through `StatsAttack_99` at 99, followed by `StatsAttack_Count` at 100. Numeric placeholders remain at 47, 48, 61, and 99; this header does not resolve their meanings ([lines 19–121](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/forward.h#L19-L121)).
- `PlATK` defines normal-attack boundary constants 1 and 16, matching the first and last ordinary attack identifiers above. Consumer range-check behavior is not present here ([lines 123–126](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/forward.h#L123-L126)).
- `Pl_ItemLog` declares bonus item-log indices with unknown labels 0–38 and `Pl_ItemLog_Terminate = 39`. Its comment attributes the terminator name to assertions in `pl_8003E2CC` and `pl_8003E334`; those assertions were not independently examined in this owned-file pass ([lines 128–172](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/pl/forward.h#L128-L172)).

The complete rendered view matches the canonical declarations, with zero substitutions or parse errors. There are no frozen subjects, facts, or links to revise or retain. No supported correction or improved name was identified, so the proposal is empty. No compiled-layout or runtime-lifetime claims are made.

Status: synthesized; independent review and live promotion pending.
