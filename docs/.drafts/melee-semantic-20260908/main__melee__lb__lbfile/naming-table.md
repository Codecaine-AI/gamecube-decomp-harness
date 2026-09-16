# Naming Table

Canonical declarations are authoritative. Six inherited aliases are retained as hypotheses; no canonical names are replaced.

| Canonical | Inferred Name | Disposition |
|---|---|---|
| .bss | result | Retain |
| .sbss | cancel | Retain |
| lbFile_8001634C | lbFileGetSizeByEntryNum | Retain |
| lbFile_800164A4 | lbFileReadAsyncByEntryNum | Retain |
| lbFile_80016580 | lbFileLoadAsync | Retain |
| lbFile_8001668C | lbFileLoadFileSync | Retain |
| lbFile_80016760 | lbFileLoadAlloc | Retain |
| lbFile_800168A0 | lbFile_LoadPreloadedOrAlloc | Retain |

.bss: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L14-L177
.sbss: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L14-L177
lbFile_8001634C: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L92-L107
lbFile_800164A4: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L119-L129
lbFile_80016580: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L131-L142
lbFile_8001668C: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L144-L149
lbFile_80016760: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L151-L164
lbFile_800168A0: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L151-L177

Other targets have no inferred names. The two obsolete address-parameter locators have no facts and remain unresolved identity work.
