## Documentation scope
`src/melee/it/it_266F.dox` is a declaration/documentation inventory associated with `melee/it/it_266F.h`, not an implementation. It lists item-system globals, article tables for common/Pokémon/character/stage items, and function declarations spanning item handling and collision interfaces (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_266F.dox#L1-L158).

Canonical comments describe loading `ItCo.dat/usd`, checking GObj classes, setting item lifetime, clearing unspecified flags, and advancing an item script. These support only those broad descriptions; they do not establish implementation branches, precise flag meanings, timer interactions, or ownership lifetimes (code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_266F.dox#L27-L28; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_266F.dox#L65-L69; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_266F.dox#L94-L123).

## Semantic assessment
The rendered class-query names agree with the canonical comments. `itSetLifeTimers` agrees broadly with the lifetime-setting description, but the plural timer semantics are not demonstrated here. Other rendered behavioral names remain hypotheses requiring implementation evidence. No supported correction is proposed. There are no owned subjects, baseline facts, or baseline links to disposition. No compiled layout or section conclusions are drawn.

Status: synthesized; independent review and live promotion pending.
