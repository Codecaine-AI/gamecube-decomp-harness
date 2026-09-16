# Cardgame Naming

Upstream canonical names are authoritative. No new names proposed.

| Subject | Alias | Disposition |
|---|---|---|
| main/melee/lb/lbcardgame:.bss | lbCardGameState | unresolved |
| main/melee/lb/lbcardgame:.sdata | s_memCardAccessIconPositions | unresolved |
| main/melee/lb/lbcardgame:fn_8001CC30 | lbCardGame_ReadCallback | supersede |
| main/melee/lb/lbcardgame:fn_8001CEC0 | lbCardGame_Anim | retain |
| main/melee/lb/lbcardgame:lb_8001C658 | lbCardGame_MakeSaveComment | retain |
| main/melee/lb/lbcardgame:lb_8001C820 | lbCardGame_GetSaveCommentOffset | unresolved |
| main/melee/lb/lbcardgame:lb_8001C87C | lbCardGame_CheckSaveFileStatus | unresolved |
| main/melee/lb/lbcardgame:lb_8001C8BC | lbCardGame_SaveGameDataSync | unresolved |
| main/melee/lb/lbcardgame:lb_8001CAF4 | lbCardGame_UpdateCardStatus | retain |
| main/melee/lb/lbcardgame:lb_8001CBAC | lbCardGame_SetCardStatus | retain |
| main/melee/lb/lbcardgame:lb_8001CBBC | lbCardGame_Load | unresolved |
| main/melee/lb/lbcardgame:lb_8001CC4C | lbCardGame_DeleteSaveFile | unresolved |
| main/melee/lb/lbcardgame:lb_8001CC84 | lbCardGame_ServiceRead | supersede |
| main/melee/lb/lbcardgame:lb_8001CDB4 | lbCardGame_WaitRead | supersede |
| main/melee/lb/lbcardgame:lb_8001CF18 | lbCardGame_CreateMemoryCardAccessIcon | retain |
| main/melee/lb/lbcardgame:lb_8001D1F4 | lbCardGame_Reset | retain |
| main/melee/lb/lbcardgame:lb_8001D21C | lbCardGame_Init | retain |

Three read-specific aliases are proposed for clearing. Other operation-specific aliases remain unresolved pending foreign source proof. The seven empty parameter subjects include old lb_8001D164#r3 and canonical lbCardGame_LoadArchive#r3.

Independent controls review confirms BE30 ultimately queues retryCardWriteAsync through the task-10 and type-9 pipeline. The three Read aliases contradict this chain and are proposed for clearing. This packet promotes no replacement alias. Foreign files are peer evidence, not owned read coverage. Proposal has 72 fact writes and 3 alias clears.
