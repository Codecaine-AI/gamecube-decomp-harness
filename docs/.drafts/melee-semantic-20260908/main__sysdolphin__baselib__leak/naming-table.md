# Naming Table

| Canonical | Inferred Alias | Decision |
|---|---|---|
| HSD_Leak_80387DF8 | HSD_LeakCheck | Retain hypothesis; canonical name remains authoritative |
| .data | None | Section target; descriptor and longer report literals |
| .sdata | None | Section target; short output literals |

TU and parameter entities have no inherited inferred names. No name change is proposed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L74-L86 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/leak.c#L157-L169.
