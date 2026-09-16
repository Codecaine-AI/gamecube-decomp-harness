# Naming Decisions

Retain all current canonical names. No inherited inferred names or new aliases exist in this TU proposal.

| Canonical Name | Decision |
|---|---|
| `HSD_LogInit` | Retain canonical; behavior documented separately. |
| `HSD_Panic` | Retain canonical; behavior documented separately. |
| `HSD_SetPanicCallback` | Retain canonical; behavior documented separately. |
| `HSD_SetReportCallback` | Retain canonical; behavior documented separately. |
| `__assert` | Retain canonical; behavior documented separately. |
| `report_func` | Retain canonical; behavior documented separately. |

report_func is the established static hook name. Naming does not imply preservation of downstream error status. HSD_Panic remains canonical while its callback-continuation limits are corrected in semantic facts. Owned callback typedefs and macro names remain unchanged.
