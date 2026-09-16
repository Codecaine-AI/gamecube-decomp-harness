# AXDriver Naming Decisions

Canonical names remain authoritative. All inherited aliases below describe observed local roles and remain hypotheses; no new alias is proposed.

| Canonical | Existing alias | Decision |
|---|---|---|
| .bss | none | Preserve canonical identity |
| .data | none | Preserve canonical identity |
| .rodata | none | Preserve canonical identity |
| .sbss | none | Preserve canonical identity |
| .sdata | none | Preserve canonical identity |
| .sdata2 | none | Preserve canonical identity |
| AXDriverAlloc | none | Preserve canonical identity |
| AXDriverFree | none | Preserve canonical identity |
| AXDriverKeyOff | none | Preserve canonical identity |
| AXDriverPause | none | Preserve canonical identity |
| AXDriverResume | none | Preserve canonical identity |
| AXDriverSetupAux | none | Preserve canonical identity |
| AXDriverStop | none | Preserve canonical identity |
| AXDriverUnlink | none | Preserve canonical identity |
| AXDriver_8038BF6C | AXDriverUpdate | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038C678 | AXDriverGetCommandDelay | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038C6C0 | AXDriverCommandProc | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038CFF4 | HSD_AudioSFXStart | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038D2B4 | AXDriverSetPan | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038D3B8 | HSD_AudioSFXSetVolume | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038D4E4 | AXDriverSetPitch | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038D5B4 | HSD_AudioSFXSetAuxLevel | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038D914 | HSD_AudioSFXSetAuxLevelAll | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038D9D8 | HSD_AudioSFXCheck | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038DA70 | AXDriverLoadSFXTable | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038DCFC | HSD_AudioSFXUnload | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038E30C | none | Preserve canonical identity |
| AXDriver_8038E37C | HSD_AudioSetAuxDefaults | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038E498 | AXDriverInit | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038E5D4 | HSD_AudioGetPVoiceCount | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038E5DC | HSD_AudioGetVirtualVoiceCount | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038E5E4 | AXDriverSFXPause | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038E6C0 | AXDriverPauseChannel | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038E768 | AXDriverSFXResume | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038E844 | AXDriverResumeChannel | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038E8EC | AXDriverStart | Retain as role hypothesis; see behavioral corrections |
| AXDriver_8038EA18 | AXDriverCheck | Retain as role hypothesis; see behavioral corrections |
| HSD_AudioGetAuxHeapSize | none | Preserve canonical identity |
| HSD_AudioSFXKeyOffAll | none | Preserve canonical identity |
| HSD_AudioSFXKeyOffTrack | none | Preserve canonical identity |
| fn_8038CC1C | AXDriverMasterClockCallback | Retain as role hypothesis; see behavioral corrections |
| fn_8038CEA4 | AXDriverInactivatedCallback | Retain as role hypothesis; see behavioral corrections |
| fn_8038CF48 | AXDriverPauseCallback | Retain as role hypothesis; see behavioral corrections |
| fn_8038DA5C | AXDriverDVDReadCallback | Retain as role hypothesis; see behavioral corrections |

The PVoice alias is an inherited diagnostic label. The accessor counts associated Synth nodes, not individual AX voices. AXDriverUpdate applies pending operations to one record; the separate master-clock callback traverses the complete driver list.
