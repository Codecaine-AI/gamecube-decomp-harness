# mn — Menus

Every menu screen, one file each. Menus are GObj-based scenes with heavy
`HSD_SisLib`/`HSD_Text` text, cursor state structs, and archive asset-name
tables (`MenMain*` strings). Scene switching is driven from `gm`.

| File | Screen |
|------|--------|
| `mnmain.c` | Main menu. |
| `mncharsel.c` | Character select screen (CSS) — ports, tokens, ready-to-fight banner. |
| `mnstagesel.c` | Stage select screen (SSS). |
| `mnmainrule.c`, `mnruleplus.c` | Rules (time/stock/handicap) and Additional Rules. |
| `mnitemsw.c` | Item Switch (item frequency/toggles). |
| `mnstagesw.c` | Random Stage Switch `(?)`. |
| `mnevent.c` | Event Match select (the 51 events). |
| `mnname.c`, `mnnamenew.c` | Name-tag list and name entry. |
| `mngallery.c` | Trophy Gallery (viewing collection; trophy logic in `ty/`). |
| `mnhyaku.c` | Multi-Man Melee select ("hyaku" = hundred, from 100-Man Melee). |
| `mninfo.c`, `mninfobonus.c` | Records/info screens; bonus-list browser. |
| `mndiagram.c`, `mndiagram2.c`, `mndiagram3.c` | Data/records diagram screens `(?)`. |
| `mncount.c` | Play-count/records tallies `(?)`. |
| `mnsound.c`, `mnsoundtest.c` | Sound options and Sound Test. |
| `mnvibration.c` | Rumble settings. |
| `mnlanguage.c` | Language select (JP/EN). |
| `mndeflicker.c` | Deflicker option. |
| `mnsnap.c` | Snapshot viewer (camera-mode photos; capture in `lb/lbsnap.c`). |
| `mndatadel.c` | Erase-data screens. |
