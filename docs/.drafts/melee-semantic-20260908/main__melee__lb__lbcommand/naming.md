# Naming Decisions

| Canonical Symbol | Existing Alias | Proposed Alias | Decision |
|---|---|---|---|
| .data | lbCommand_HandlerTable | none | unresolved |
| .sdata2 | none | none | retain canonical |
| Command_00 | Command_Reset | Command_ClearCursor | supersede |
| Command_01 | Command_SynchronousTimer | none | retain |
| Command_02 | Command_AsynchronousTimer | none | retain |
| Command_03 | Command_SetLoop | none | retain |
| Command_04 | Command_ExecuteLoop | none | retain |
| Command_05 | Command_Subroutine | none | retain |
| Command_06 | Command_Return | none | retain |
| Command_07 | Command_Goto | none | retain |
| Command_08 | Command_SetTimerAnimation | Command_SetMaxTimer | supersede |
| Command_09 | Command_BgFlash | none | retain |
| Command_Execute | none | none | retain canonical |

Source comments attest opcode labels but do not establish external timing or scheduling. New aliases remain proposals until independently reviewed. All twelve parameter entities were reviewed; canonical info/command parameter names remain unchanged.
