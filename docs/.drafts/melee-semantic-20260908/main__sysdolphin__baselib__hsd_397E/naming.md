# Naming Review

Retain canonical baselib_mfspr. No inherited inferred-name fact exists and no new name is proposed. The only parameter subject, baselib_mfspr#r3, is canonical spr, a signed numeric SPR selector. Its lack of prior facts is recorded in coverage.json.

The .data allocation remains a section target, not a renamed register table. The owned header has no CPU register definitions. Source-native mnemonics are documented in register-cases.json; selector 0x118 remains unnamed and compiler-specific operands remain unchanged.
