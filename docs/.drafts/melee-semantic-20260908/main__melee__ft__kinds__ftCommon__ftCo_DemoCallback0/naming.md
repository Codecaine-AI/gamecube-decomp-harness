# Naming decisions

| Subject | Existing inferred name | Decision |
|---|---|---|
| ftCo_800C6150 | ftCo_DemoCallback0 | Retain descriptive hypothesis; demo caller and canonical file name support it. C render collision recorded. |
| .sdata2 | None | Preserve section identity. |
| Source entity | Canonical path | Preserve path; correct respawn-specific purpose/mapping. |
| #r3 parameter | No inferred name/facts | Account as Fighter_GObj input; zero baseline facts. |

No name promotion or renaming is proposed. C view leaves the function unchanged because of name_collision; header view substitutes its hypothesis. This difference is recorded rather than treated as failed source coverage.
