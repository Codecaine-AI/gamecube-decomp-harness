# Naming Review

Retain canonical HSD_MulColor, HSD_GetNbBits and HSD_Index2PosNrmMtx. No inferred-name facts existed and no new names are proposed. HSD_identityMtx is an attested variable name; .data also contains the switch table and is not renamed to the matrix alone.

| Subject | Canonical Parameter Meaning |
|---|---|
| HSD_GetNbBits#r3 | c, 32-bit mask |
| HSD_Index2PosNrmMtx#r3 | arg0, palette ordinal 0 through 9 |
| HSD_MulColor#r3 | arg0, first source color |
| HSD_MulColor#r4 | arg1, second source color |
| HSD_MulColor#r5 | dest, output color |

All five parameter subjects lacked facts. Header inline names vec_normalize_check and atan2f_check remain canonical; their bodies are covered even though no owned target identity exists. Imported GXColor, Mtx and Vec3 types receive no ownership or rename claim.
