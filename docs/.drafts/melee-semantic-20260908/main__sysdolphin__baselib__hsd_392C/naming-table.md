# Naming Table

| Canonical | Inherited Alias | Decision |
|---|---|---|
| .bss | MCC event queue | Reject prose alias; clear without replacement |
| fn_80392CCC | HSD_MCCEnumDevicesCallback | Retain hypothesis |
| fn_80392CD8 | MCCReportError | Retain hypothesis |
| hsd_80392E80 | HSD_UsbProcessEvents | Retain hypothesis |
| hsd_803931A4 | HSD_ParticleConsoleInit | Retain historical hypothesis; particle role unproven |
| TU | particle | Retain historical hypothesis; original split unknown |

Other targets and entities have no inherited names. Canonical spelling remains authoritative. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L9-L38, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L40-L123, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_392C.c#L156-L308, code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3933.c#L10-L34.

Review correction: HSD_ParticleConsoleInit (fbbe3dc6) and TU particle alias (670c2a70) are unresolved historical names, not demonstrated particle ownership. File game_mapping8f53616d is superseded with MCC/FIO transport scope. Final20operations; dispositions {'retain': 29, 'reject': 1, 'supersede': 13, 'unresolved': 2}; SHA `0974b5e232c5a875762cb0bd893ded3d20558288f8df3d398309ead00739ad97`.
