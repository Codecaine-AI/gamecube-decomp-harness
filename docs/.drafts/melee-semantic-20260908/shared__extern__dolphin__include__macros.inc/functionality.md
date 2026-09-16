## Assembly register aliases and symbol macros

`extern/dolphin/include/macros.inc` supplies assembler definitions rather than runtime functions.

- Defines `r0`–`r31` and `f0`–`f31` as register indices 0–31, and `qr0`–`qr7` as quantization-register indices 0–7. These lowercase `qr` aliases are distinct from the uppercase `GQR0`–`GQR7` SPR numbers 912–919. [Register definitions](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/macros.inc#L1-L147)
- Defines named special-purpose register numbers and condition-register bit indices. CR aliases enumerate `lt`, `gt`, `eq`, and `un` for each field, covering indices 0–31. [CR definitions](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/macros.inc#L149-L181)
- `.fn` and `.obj` apply a caller-selected visibility directive, defaulting to `global`, set function or object type, and define the label. Their matching end macros assign size using the current location minus that label. `.sym` follows the same visibility/label pattern without emitting a type directive; `.endsym` supplies its size. These macros do not themselves select sections or impose alignment. [Symbol macros](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/macros.inc#L183-L225)
- `.rel name, label` emits `.4byte "\name" + ("\label" - "\name")`. Although its comment describes a relative relocation, the source alone does not establish the emitted relocation kind or linked layout; no compiled artifacts were supplied. [Relocation macro](code://c302741689bd67c361cd7faadb221df3193992c3/extern/dolphin/include/macros.inc#L227-L232)

## Semantic assessment

All 233 canonical and rendered lines were reviewed. The rendered view contains no proposed-name substitutions and reports 155 parse errors; its complete visible text was checked against canonical definitions rather than treated as independent semantic proof. Subject and link enumeration both returned empty baselines, so there are no existing facts, names, or links requiring dispositions. No supported knowledge correction is proposed.

Status: synthesized; independent review and live promotion pending.
