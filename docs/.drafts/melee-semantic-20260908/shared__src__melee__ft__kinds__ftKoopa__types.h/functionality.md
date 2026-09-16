## Koopa shared type declarations

`src/melee/ft/kinds/ftKoopa/types.h` defines data types only; it contains no executable behavior.

- `ftKoopa_FighterVars` declares two floats, `x222C` and `x2230`, with corresponding source offset annotations ([canonical lines 8–11](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/types.h#L8-L11)).
- `ftKoopa_MotionVars` provides two union alternatives: `unk1`, containing two `UNK_T` members and two booleans, and `specials`, containing three booleans, an integer named `facing_dir`, and three `s32` members. The source explicitly leaves the first state's name unresolved and questions the relationship between the two structs. Names such as `b_held` are not independently verified behavioral descriptions here ([canonical lines 13–31](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/types.h#L13-L31)).
- `ftKoopaAttributes` declares predominantly float fields, with `s32` fields `x4` and `x20` and `u32` fields `x2C` and `unk50`. Their gameplay meanings are not documented in this header ([canonical lines 33–74](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/types.h#L33-L74)).
- `ftKoopaVars` separately declares two floats, `x0` and `x4`; this declaration alone does not establish its relationship to the fighter-variable struct ([canonical lines 76–79](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKoopa/types.h#L76-L79)).

The complete rendered view matches the canonical declarations, with zero substitutions and zero parse errors. There are no baseline subjects, facts, or links to retain or correct. No semantic rename or knowledge write is proposed. Source offset comments are not treated as compiled layout evidence, and this header does not establish initialization, state transitions, exceptional branches, or cross-file lifetimes.

Status: synthesized; independent review and live promotion pending.
