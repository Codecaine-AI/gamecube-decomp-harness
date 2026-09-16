# Fighter Data Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. UTC 2026-09-08T16:08:24.447Z to 2026-09-08T16:16:21.833810+00:00. All 1861 C, 62 header and 73 dox lines read canonically and separately rendered. Zero parser errors. Table rows below preserve exact source order and initializer expressions.

## Function Contracts

### ft_8008521C

Requires Fighter user data and JObj. Copies JObj translation into a local vector and writes translation minus cur_pos into self_vel componentwise. It does not divide by elapsed time, update cur_pos, traverse parent matrices, or establish that both inputs are world-space coordinates.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L157-L167

### ft_800852B0

Directly clears all gFtDataList entries and every configured costume joint and pad_x8. Other writes use cast-derived addresses: one past CostumeListsForeachCharacter for one count table, byte offset 5940 from that array for another, and one past gFtDataList for six ft_8045993C_t records. Their identity with separately declared globals requires compiled placement evidence. Resets selected fields only, does not free resources or clear costume x4/x14_archive. Source pointer arithmetic crosses declared object bounds.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L169-L209

### ft_8008549C

Overwrites all FTKIND_MAX reference counters with zero regardless of outstanding references. It is idempotent for that array and does not reset resources or call callbacks.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L211-L217

### ftData_80085560

Adds signed increment before checking the resulting counter for negativity. A negative result stays written before report/assert. idx is unchecked, signed overflow is not guarded, and there is no saturation, zero-transition callback or resource free.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1519-L1526

### ftData_800855C8

Requires valid kind. Preserves color 0xFF for all costumes; any other color at or above the costume count becomes zero. Independently skips NULL base, costume and animation filenames. Effect guard compares a u8 element, whose -1 initializer stores 255, with (char)-1. Sentinel skipping depends on plain-char signedness, which was not established from the pinned build configuration; signed char makes 255 differ from -1. The function registers requests without a local completion wait.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1531-L1564

### ftData_8008572C

Requires valid kind. A non-NULL cached root is a no-op. Otherwise passes base DAT filename and public name to lbArchive_80017040, which uses an existing DVD archive or loads/parses one and fatally asserts on a missing requested public symbol. No cache invalidation or lifetime ownership is established here.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1566-L1572

### ftData_8008578C

Checks color against Kirby costume count, not copied-kind costume count. Keeps 0xFF, normalizes other excessive values to zero, then calls the Kirby loader once with copied kind, color and Kirby count. Copied kind is unchecked. The downstream routine uses 0xFF to iterate all variants.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1574-L1583

### ftData_800857E0

Indexes the Event table without kind bounds validation and invokes the selected non-NULL void callback once. Only Kirby has a populated entry. ftLib runs it after base, effect, costume and animation loading; Kirby callback visits occupied player slots and loads copy resources for their internal IDs with costume zero.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1585-L1590

### ftData_80085820

Requires valid kind and costume indices. joint alone gates loading; a non-NULL joint skips all writes. A miss loads DAT and joint plus optional matanim symbol into the shared costume record and retains the archive. Absent matanim name causes x4=NULL. Missing requested symbol is fatal in the delegated resolver. Body is identical to ftData_800858E4; neither normalizes costume IDs.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1592-L1613

### ftData_800858E4

Requires valid kind and costume indices. joint alone gates loading; a non-NULL joint skips all writes. A miss loads DAT and joint plus optional matanim symbol into the shared costume record and retains the archive. Absent matanim name causes x4=NULL. Missing requested symbol is fatal in the delegated resolver. Body is identical to ftData_80085820; separate demo call-site selection does not imply distinct behavior.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1615-L1636

### ftData_800859A8

Signed x61C=-1 returns. Otherwise scans the fighter list, excludes fp by pointer identity, and preserves the flag if any other Fighter has the same identifier. If none does, clears ft_8045993C[x61C].x6_b0. Other negative values and values >=6 are not guarded. Does not free resources, clear fp->x61C or prove ownership of the indexed slot.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1638-L1652

### ftData_80085A14

Requires valid kind, loaded gFtDataList and trusted descriptor count. Cached data is a no-op. On miss loads file, asserts non-NULL head, and for each nonzero x8 checks only x8<=0x8000 before writing x14=head+x4. Does not check offset+size against returned file length; zero-size entries retain x14. Stores head after loop. No allocation failure recovery, unload or reentrancy guard.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1654-L1683

### ftData_80085B10

Unconditionally replaces x59C/x5A0 with unchecked allocations, clears x5A4/x5A8, copies normal count to x58C and invokes shared per-kind loading. Does not initialize result pointers x590/x598 or release old buffers. Initial source zero equals cleared key and can leave those result pointers unchanged in subsequent loaders.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1685-L1694

### ftData_80085B98

Allocates two unchecked buffers, clears keys and installs demo count. Checks only arg2<count, with no lower-bound or arg1<=arg2 validation. If shared archive base exists, rebases inclusive arg1..arg2 entries with nonzero size, asserting only size<=0xB000, and clears shared base even for an empty or partial range. Does not validate archive length, initialize x590/x598, free old buffers or load a file. Demo allocator uses size 0xB000 and alignment 0x20, not 0xB000 alignment.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1696-L1727

### ftData_80085CD8

Checks only msid<source->x58C; negative values pass. Source Fighter selects descriptor while destination supplies primary buffer/cache. Cache equality compares source address alone, not public-symbol name or size. Matching key is a no-op, including initial zero key/source. Changed zero source clears x590; changed nonzero source either copies matching partner primary archive into destination x59C and relocates it, requests lower-than-0x80000000 source bytes with NULL callback and waits for completion, or memcpy copies memory. Parses non-partner path, resolves public symbol, records x5A4. No local buffer-size/overlap/descriptor-bounds validation. IDs >=count leave destination unchanged.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1729-L1780

### ftData_80085E50

Checks only msid<fp->x58C; negative values pass and IDs >=count return NULL without clearing cache. Source-address-only equality returns x598 without checking symbol/size, including initial key zero. Changed zero source clears x598. Normal load/copy parses x5A0, but matching partner reuse copies and relocates into x59C, the primary buffer. That branch can overwrite primary archive while updating only secondary x5A8/x598. NULL-callback ARQ waits for completion. No local size/overlap checks; resolved pointer lifetime depends on later buffer overwrites.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1782-L1835

### ftData_80085FD4

Returns a borrowed descriptor. Only non-demo Nana with own x14=0 falls back to global Popo xC entry. Other cases use own x24 entry. Neither msid bounds nor gFtDataList[POPO] availability are checked. No resource allocation or mutation occurs.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1837-L1847

### ftData_80086060

Non-Nana or demo Nana returns NULL. Otherwise queries logical entity zero in the same player slot and returns its Fighter data when GObj exists. It does not verify returned Fighter kind, exclude self, retain ownership, or guarantee that returned user data is non-NULL.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1849-L1860

## Table Policy and Exceptions

FTKIND_MAX is 33. Tables preserve source enum order, including bosses, wireframes and Sandbag. NULL entries are absence of a callback, not proof that all consumers guard the entry. Nana shares Popo N/Lw ground and air handlers but has NULL S/Hi handlers. Donkey AirLw is NULL. Only Pikachu has UnkMotionStates1/2; Pichu does not share them. CharacterStateTables is NULL for both wireframes. Absorb only supports Ness and GameWatch. Knockback hooks are NULL for Captain, Samus, GameWatch, hands and wireframes, while Sandbag has callbacks. Item Ext tables differ for Link/Young Link; Nana shares Popo; hands and Sandbag are NULL.

OnLoad, OnDeath and attribute loaders cover every row. Optional startup callback only Kirby/Purin; user-data-remove only Purin; post-load callback only Kirby. UnkMotionStates0 and demo getter/callback families select Mario, Kirby, Luigi and Giga Bowser. UnkMotionStates3 selects Kirby/Koopa/Giga; UnkMotionStates4 Donkey/Kirby/Seak/Samus/Mewtwo/GameWatch. Model visibility aggregate has Kirby and Purin arrays; anonymous callback pairs explicitly populate Kirby row and otherwise zero initialize. Demo resources are NULL for hands, wireframes and Sandbag. Demo counts are 16 Mario/Luigi, 18 Kirby, 15 Giga and 14 otherwise.

Costume count expressions are preserved rather than guessed from external array sizes. Effect IDs are stored as u8, so -1 initializers yield 255. The dox calls that table s8 and contains other stale signatures; it is documentation, not the active declaration. Header exposes common motion tables defined outside this TU.

## Complete Kind-Indexed Table Ledger

### CostumeListsForeachCharacter

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L219-L253

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `{ ftMr_CostumeList, ARRAY_SIZE(ftMr_CostumeList) }` |
| 1 | FTKIND_FOX | `{ ftFx_CostumeList, ARRAY_SIZE(ftFx_CostumeList) }` |
| 2 | FTKIND_CAPTAIN | `{ ftCa_CostumeList, ARRAY_SIZE(ftCa_CostumeList) }` |
| 3 | FTKIND_DONKEY | `{ ftDk_CostumeList, ARRAY_SIZE(ftDk_CostumeList) }` |
| 4 | FTKIND_KIRBY | `{ ftKb_CostumeList, ARRAY_SIZE(ftKb_CostumeList) }` |
| 5 | FTKIND_KOOPA | `{ ftKp_CostumeList, ARRAY_SIZE(ftKp_CostumeList) }` |
| 6 | FTKIND_LINK | `{ ftLk_CostumeList, ARRAY_SIZE(ftLk_CostumeList) }` |
| 7 | FTKIND_SEAK | `{ ftSk_CostumeList, ARRAY_SIZE(ftSk_CostumeList) }` |
| 8 | FTKIND_NESS | `{ ftNs_CostumeList, ARRAY_SIZE(ftNs_CostumeList) }` |
| 9 | FTKIND_PEACH | `{ ftPe_CostumeList, ARRAY_SIZE(ftPe_CostumeList) }` |
| 10 | FTKIND_POPO | `{ ftPp_CostumeList, ARRAY_SIZE(ftPp_CostumeList) }` |
| 11 | FTKIND_NANA | `{ ftNn_CostumeList, FTNANA_COSTUME_COUNT }` |
| 12 | FTKIND_PIKACHU | `{ ftPk_CostumeList, ARRAY_SIZE(ftPk_CostumeList) }` |
| 13 | FTKIND_SAMUS | `{ ftSs_CostumeList, ARRAY_SIZE(ftSs_CostumeList) }` |
| 14 | FTKIND_YOSHI | `{ ftYs_CostumeList, ARRAY_SIZE(ftYs_CostumeList) }` |
| 15 | FTKIND_PURIN | `{ ftPr_CostumeList, ARRAY_SIZE(ftPr_CostumeList) }` |
| 16 | FTKIND_MEWTWO | `{ ftMt_CostumeList, ARRAY_SIZE(ftMt_CostumeList) }` |
| 17 | FTKIND_LUIGI | `{ ftLg_CostumeList, ARRAY_SIZE(ftLg_CostumeList) }` |
| 18 | FTKIND_MARS | `{ ftMs_CostumeList, ARRAY_SIZE(ftMs_CostumeList) }` |
| 19 | FTKIND_ZELDA | `{ ftZd_CostumeList, ARRAY_SIZE(ftZd_CostumeList) }` |
| 20 | FTKIND_CLINK | `{ ftCl_CostumeList, ARRAY_SIZE(ftCl_CostumeList) }` |
| 21 | FTKIND_DRMARIO | `{ ftDr_CostumeList, ARRAY_SIZE(ftDr_CostumeList) }` |
| 22 | FTKIND_FALCO | `{ ftFc_CostumeList, ARRAY_SIZE(ftFc_CostumeList) }` |
| 23 | FTKIND_PICHU | `{ ftPc_CostumeList, ARRAY_SIZE(ftPc_CostumeList) }` |
| 24 | FTKIND_GAMEWATCH | `{ ftGw_CostumeList, ARRAY_SIZE(ftGw_CostumeList) }` |
| 25 | FTKIND_GANON | `{ ftGn_CostumeList, ARRAY_SIZE(ftGn_CostumeList) }` |
| 26 | FTKIND_EMBLEM | `{ ftFe_CostumeList, ARRAY_SIZE(ftFe_CostumeList) }` |
| 27 | FTKIND_MASTERH | `{ ftMh_CostumeList, ARRAY_SIZE(ftMh_CostumeList) }` |
| 28 | FTKIND_CREZYH | `{ ftCh_CostumeList, ARRAY_SIZE(ftCh_CostumeList) }` |
| 29 | FTKIND_BOY | `{ ftBo_CostumeList, ARRAY_SIZE(ftBo_CostumeList) }` |
| 30 | FTKIND_GIRL | `{ ftGl_CostumeList, ARRAY_SIZE(ftGl_CostumeList) }` |
| 31 | FTKIND_GKOOPS | `{ ftGk_CostumeList, ARRAY_SIZE(ftGk_CostumeList) }` |
| 32 | FTKIND_SANDBAG | `{ ftSb_CostumeList, ARRAY_SIZE(ftSb_CostumeList) }` |

### ftData_Table_Unk0

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L255-L262

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `{ 0, 303 }` |
| 1 | FTKIND_FOX | `{ 0, 327 }` |
| 2 | FTKIND_CAPTAIN | `{ 0, 318 }` |
| 3 | FTKIND_DONKEY | `{ 0, 337 }` |
| 4 | FTKIND_KIRBY | `{ 0, 479 }` |
| 5 | FTKIND_KOOPA | `{ 0, 316 }` |
| 6 | FTKIND_LINK | `{ 0, 314 }` |
| 7 | FTKIND_SEAK | `{ 0, 317 }` |
| 8 | FTKIND_NESS | `{ 0, 326 }` |
| 9 | FTKIND_PEACH | `{ 0, 318 }` |
| 10 | FTKIND_POPO | `{ 0, 321 }` |
| 11 | FTKIND_NANA | `{ 0, 321 }` |
| 12 | FTKIND_PIKACHU | `{ 0, 320 }` |
| 13 | FTKIND_SAMUS | `{ 0, 313 }` |
| 14 | FTKIND_YOSHI | `{ 0, 314 }` |
| 15 | FTKIND_PURIN | `{ 0, 327 }` |
| 16 | FTKIND_MEWTWO | `{ 0, 314 }` |
| 17 | FTKIND_LUIGI | `{ 0, 312 }` |
| 18 | FTKIND_MARS | `{ 0, 327 }` |
| 19 | FTKIND_ZELDA | `{ 0, 311 }` |
| 20 | FTKIND_CLINK | `{ 0, 314 }` |
| 21 | FTKIND_DRMARIO | `{ 0, 303 }` |
| 22 | FTKIND_FALCO | `{ 0, 327 }` |
| 23 | FTKIND_PICHU | `{ 0, 320 }` |
| 24 | FTKIND_GAMEWATCH | `{ 0, 323 }` |
| 25 | FTKIND_GANON | `{ 0, 318 }` |
| 26 | FTKIND_EMBLEM | `{ 0, 327 }` |
| 27 | FTKIND_MASTERH | `{ 0, 345 }` |
| 28 | FTKIND_CREZYH | `{ 0, 344 }` |
| 29 | FTKIND_BOY | `{ 0, 295 }` |
| 30 | FTKIND_GIRL | `{ 0, 295 }` |
| 31 | FTKIND_GKOOPS | `{ 0, 316 }` |
| 32 | FTKIND_SANDBAG | `{ 0, 296 }` |

### ftData_Table_Unk1

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L264-L298

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `NULL` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `ftKb_Init_800EE528` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `ftPr_Init_8013C2F8` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `NULL` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `NULL` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_OnLoad

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L300-L310

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnLoad` |
| 1 | FTKIND_FOX | `ftFx_Init_OnLoad` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_OnLoad` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnLoad` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnLoad` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnLoad` |
| 6 | FTKIND_LINK | `ftLk_Init_OnLoad` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnLoad` |
| 8 | FTKIND_NESS | `ftNs_Init_OnLoad` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnLoad` |
| 10 | FTKIND_POPO | `ftPp_Init_OnLoad` |
| 11 | FTKIND_NANA | `ftNn_Init_OnLoad` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnLoad` |
| 13 | FTKIND_SAMUS | `ftSs_Init_OnLoad` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnLoad` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnLoad` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnLoad` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnLoad` |
| 18 | FTKIND_MARS | `ftMs_Init_OnLoad` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnLoad` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnLoad` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnLoad` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnLoad` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnLoad` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_OnLoad` |
| 25 | FTKIND_GANON | `ftGn_Init_OnLoad` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnLoad` |
| 27 | FTKIND_MASTERH | `ftMh_Init_OnLoad` |
| 28 | FTKIND_CREZYH | `ftCh_Init_OnLoad` |
| 29 | FTKIND_BOY | `ftBo_Init_OnLoad` |
| 30 | FTKIND_GIRL | `ftGl_Init_OnLoad` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnLoad` |
| 32 | FTKIND_SANDBAG | `ftSb_Init_OnLoad` |

### ftData_OnDeath

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L312-L322

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnDeath` |
| 1 | FTKIND_FOX | `ftFx_Init_OnDeath` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_OnDeath` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnDeath` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnDeath` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnDeath` |
| 6 | FTKIND_LINK | `ftLk_Init_OnDeath` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnDeath` |
| 8 | FTKIND_NESS | `ftNs_Init_OnDeath` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnDeath` |
| 10 | FTKIND_POPO | `ftPp_Init_OnDeath` |
| 11 | FTKIND_NANA | `ftNn_Init_OnDeath` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnDeath` |
| 13 | FTKIND_SAMUS | `ftSs_Init_OnDeath` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnDeath` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnDeath` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnDeath` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnDeath` |
| 18 | FTKIND_MARS | `ftMs_Init_OnDeath` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnDeath` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnDeath` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnDeath` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnDeath` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnDeath` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_OnDeath` |
| 25 | FTKIND_GANON | `ftGn_Init_OnDeath` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnDeath` |
| 27 | FTKIND_MASTERH | `ftMh_Init_OnDeath` |
| 28 | FTKIND_CREZYH | `ftCh_Init_OnDeath` |
| 29 | FTKIND_BOY | `ftBo_Init_OnDeath` |
| 30 | FTKIND_GIRL | `ftGl_Init_OnDeath` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnDeath` |
| 32 | FTKIND_SANDBAG | `ftSb_Init_OnDeath` |

### ftData_OnUserDataRemove

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L324-L330

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `NULL` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `NULL` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnUserDataRemove` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `NULL` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `NULL` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_CharacterStateTables

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L332-L366

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_MotionStateTable` |
| 1 | FTKIND_FOX | `ftFx_Init_MotionStateTable` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_MotionStateTable` |
| 3 | FTKIND_DONKEY | `ftDk_Init_MotionStateTable` |
| 4 | FTKIND_KIRBY | `ftKb_Init_MotionStateTable` |
| 5 | FTKIND_KOOPA | `ftKp_Init_MotionStateTable` |
| 6 | FTKIND_LINK | `ftLk_Init_MotionStateTable` |
| 7 | FTKIND_SEAK | `ftSk_Init_MotionStateTable` |
| 8 | FTKIND_NESS | `ftNs_Init_MotionStateTable` |
| 9 | FTKIND_PEACH | `ftPe_Init_MotionStateTable` |
| 10 | FTKIND_POPO | `ftPp_Init_MotionStateTable` |
| 11 | FTKIND_NANA | `ftNn_Init_MotionStateTable` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_MotionStateTable` |
| 13 | FTKIND_SAMUS | `ftSs_Init_MotionStateTable` |
| 14 | FTKIND_YOSHI | `ftYs_Init_MotionStateTable` |
| 15 | FTKIND_PURIN | `ftPr_Init_MotionStateTable` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_MotionStateTable` |
| 17 | FTKIND_LUIGI | `ftLg_Init_MotionStateTable` |
| 18 | FTKIND_MARS | `ftMs_Init_MotionStateTable` |
| 19 | FTKIND_ZELDA | `ftZd_Init_MotionStateTable` |
| 20 | FTKIND_CLINK | `ftCl_Init_MotionStateTable` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_MotionStateTable` |
| 22 | FTKIND_FALCO | `ftFc_Init_MotionStateTable` |
| 23 | FTKIND_PICHU | `ftPc_Init_MotionStateTable` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_MotionStateTable` |
| 25 | FTKIND_GANON | `ftGn_Init_MotionStateTable` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_MotionStateTable` |
| 27 | FTKIND_MASTERH | `ftMh_Init_MotionStateTable` |
| 28 | FTKIND_CREZYH | `ftCh_Init_MotionStateTable` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_MotionStateTable` |
| 32 | FTKIND_SANDBAG | `ftSb_Init_MotionStateTable` |

### ftData_UnkMotionStates0

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L368-L402

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_UnkMotionStates0` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `ftKb_Init_UnkMotionStates0` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `NULL` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `ftLg_Init_UnkMotionStates0` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_UnkMotionStates0` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_SpecialS

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L404-L438

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_SpecialS_Enter` |
| 1 | FTKIND_FOX | `ftFx_SpecialSStart_Enter` |
| 2 | FTKIND_CAPTAIN | `ftCa_SpecialS_Enter` |
| 3 | FTKIND_DONKEY | `ftDk_SpecialS_Enter` |
| 4 | FTKIND_KIRBY | `ftKb_SpecialS_Enter` |
| 5 | FTKIND_KOOPA | `ftKp_SpecialS_Enter` |
| 6 | FTKIND_LINK | `ftLk_SpecialS_Enter` |
| 7 | FTKIND_SEAK | `ftSk_SpecialS_Enter` |
| 8 | FTKIND_NESS | `ftNs_SpecialS_Enter` |
| 9 | FTKIND_PEACH | `ftPe_SpecialS_Enter` |
| 10 | FTKIND_POPO | `ftPp_SpecialS_Enter` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `ftPk_SpecialS_Enter` |
| 13 | FTKIND_SAMUS | `ftSs_SpecialS_Enter` |
| 14 | FTKIND_YOSHI | `ftYs_SpecialS_Enter` |
| 15 | FTKIND_PURIN | `ftPr_SpecialS_Enter` |
| 16 | FTKIND_MEWTWO | `ftMt_SpecialS_Enter` |
| 17 | FTKIND_LUIGI | `ftLg_SpecialS_Enter` |
| 18 | FTKIND_MARS | `ftMs_SpecialS_Enter` |
| 19 | FTKIND_ZELDA | `ftZd_SpecialS_Enter` |
| 20 | FTKIND_CLINK | `ftLk_SpecialS_Enter` |
| 21 | FTKIND_DRMARIO | `ftMr_SpecialS_Enter` |
| 22 | FTKIND_FALCO | `ftFx_SpecialSStart_Enter` |
| 23 | FTKIND_PICHU | `ftPk_SpecialS_Enter` |
| 24 | FTKIND_GAMEWATCH | `ftGw_SpecialS_Enter` |
| 25 | FTKIND_GANON | `ftCa_SpecialS_Enter` |
| 26 | FTKIND_EMBLEM | `ftMs_SpecialS_Enter` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftKp_SpecialS_Enter` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_SpecialAirHi

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L440-L474

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_SpecialAirHi_Enter` |
| 1 | FTKIND_FOX | `ftFx_SpecialAirHiStart_Enter` |
| 2 | FTKIND_CAPTAIN | `ftCa_SpecialAirHi_Enter` |
| 3 | FTKIND_DONKEY | `ftDk_SpecialAirHi_Enter` |
| 4 | FTKIND_KIRBY | `ftKb_SpecialAirHi_Enter` |
| 5 | FTKIND_KOOPA | `ftKp_SpecialAirHi_Enter` |
| 6 | FTKIND_LINK | `ftLk_SpecialAirHi_Enter` |
| 7 | FTKIND_SEAK | `ftSk_SpecialAirHi_Enter` |
| 8 | FTKIND_NESS | `ftNs_SpecialAirHiStart_Enter` |
| 9 | FTKIND_PEACH | `ftPe_SpecialAirHi_Enter` |
| 10 | FTKIND_POPO | `ftPp_SpecialAirHi_Enter` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `ftPk_SpecialAirHi_Enter` |
| 13 | FTKIND_SAMUS | `ftSs_SpecialAirHi_Enter` |
| 14 | FTKIND_YOSHI | `ftYs_SpecialAirHi_Enter` |
| 15 | FTKIND_PURIN | `ftPr_SpecialAirHi_Enter` |
| 16 | FTKIND_MEWTWO | `ftMt_SpecialAirHiStart_Enter` |
| 17 | FTKIND_LUIGI | `ftLg_SpecialAirHi_Enter` |
| 18 | FTKIND_MARS | `ftMs_SpecialAirHi_Enter` |
| 19 | FTKIND_ZELDA | `ftZd_SpecialAirHi_Enter` |
| 20 | FTKIND_CLINK | `ftLk_SpecialAirHi_Enter` |
| 21 | FTKIND_DRMARIO | `ftMr_SpecialAirHi_Enter` |
| 22 | FTKIND_FALCO | `ftFx_SpecialAirHiStart_Enter` |
| 23 | FTKIND_PICHU | `ftPk_SpecialAirHi_Enter` |
| 24 | FTKIND_GAMEWATCH | `ftGw_SpecialAirHi_Enter` |
| 25 | FTKIND_GANON | `ftCa_SpecialAirHi_Enter` |
| 26 | FTKIND_EMBLEM | `ftMs_SpecialAirHi_Enter` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftKp_SpecialAirHi_Enter` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_SpecialAirLw

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L476-L510

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_SpecialAirLw_Enter` |
| 1 | FTKIND_FOX | `ftFx_SpecialAirLw_Enter` |
| 2 | FTKIND_CAPTAIN | `ftCa_SpecialAirLw_Enter` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `ftKb_SpecialAirLw_Enter` |
| 5 | FTKIND_KOOPA | `ftKp_SpecialAirLw_Enter` |
| 6 | FTKIND_LINK | `ftLk_SpecialAirLw_Enter` |
| 7 | FTKIND_SEAK | `ftSk_SpecialAirLw_Enter` |
| 8 | FTKIND_NESS | `ftNs_SpecialAirLwStart_Enter` |
| 9 | FTKIND_PEACH | `ftPe_SpecialAirLw_Enter` |
| 10 | FTKIND_POPO | `ftPp_SpecialAirLw_Enter` |
| 11 | FTKIND_NANA | `ftPp_SpecialAirLw_Enter` |
| 12 | FTKIND_PIKACHU | `ftPk_SpecialAirLw_Enter` |
| 13 | FTKIND_SAMUS | `ftSs_SpecialAirLw_Enter` |
| 14 | FTKIND_YOSHI | `ftYs_SpecialAirLw_Enter` |
| 15 | FTKIND_PURIN | `ftPr_SpecialAirLw_Enter` |
| 16 | FTKIND_MEWTWO | `ftMt_SpecialAirLw_Enter` |
| 17 | FTKIND_LUIGI | `ftLg_SpecialAirLw_Enter` |
| 18 | FTKIND_MARS | `ftMs_SpecialAirLw_Enter` |
| 19 | FTKIND_ZELDA | `ftZd_SpecialAirLw_Enter` |
| 20 | FTKIND_CLINK | `ftLk_SpecialAirLw_Enter` |
| 21 | FTKIND_DRMARIO | `ftMr_SpecialAirLw_Enter` |
| 22 | FTKIND_FALCO | `ftFx_SpecialAirLw_Enter` |
| 23 | FTKIND_PICHU | `ftPk_SpecialAirLw_Enter` |
| 24 | FTKIND_GAMEWATCH | `ftGw_SpecialAirLw_Enter` |
| 25 | FTKIND_GANON | `ftCa_SpecialAirLw_Enter` |
| 26 | FTKIND_EMBLEM | `ftMs_SpecialAirLw_Enter` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftKp_SpecialAirLw_Enter` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_SpecialAirS

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L512-L546

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_SpecialAirS_Enter` |
| 1 | FTKIND_FOX | `ftFx_SpecialAirSStart_Enter` |
| 2 | FTKIND_CAPTAIN | `ftCa_SpecialAirS_Enter` |
| 3 | FTKIND_DONKEY | `ftDk_SpecialAirS_Enter` |
| 4 | FTKIND_KIRBY | `ftKb_SpecialAirS_Enter` |
| 5 | FTKIND_KOOPA | `ftKp_SpecialAirS_Enter` |
| 6 | FTKIND_LINK | `ftLk_SpecialAirS_Enter` |
| 7 | FTKIND_SEAK | `ftSk_SpecialAirS_Enter` |
| 8 | FTKIND_NESS | `ftNs_SpecialAirS_Enter` |
| 9 | FTKIND_PEACH | `ftPe_SpecialAirS_Enter` |
| 10 | FTKIND_POPO | `ftPp_SpecialAirS_Enter` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `ftPk_SpecialAirS_Enter` |
| 13 | FTKIND_SAMUS | `ftSs_SpecialAirS_Enter` |
| 14 | FTKIND_YOSHI | `ftYs_SpecialAirS_Enter` |
| 15 | FTKIND_PURIN | `ftPr_SpecialAirS_Enter` |
| 16 | FTKIND_MEWTWO | `ftMt_SpecialAirS_Enter` |
| 17 | FTKIND_LUIGI | `ftLg_SpecialAirS_Enter` |
| 18 | FTKIND_MARS | `ftMs_SpecialAirS_Enter` |
| 19 | FTKIND_ZELDA | `ftZd_SpecialAirS_Enter` |
| 20 | FTKIND_CLINK | `ftLk_SpecialAirS_Enter` |
| 21 | FTKIND_DRMARIO | `ftMr_SpecialAirS_Enter` |
| 22 | FTKIND_FALCO | `ftFx_SpecialAirSStart_Enter` |
| 23 | FTKIND_PICHU | `ftPk_SpecialAirS_Enter` |
| 24 | FTKIND_GAMEWATCH | `ftGw_SpecialAirS_Enter` |
| 25 | FTKIND_GANON | `ftCa_SpecialAirS_Enter` |
| 26 | FTKIND_EMBLEM | `ftMs_SpecialAirS_Enter` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftKp_SpecialAirS_Enter` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_SpecialAirN

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L548-L582

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_SpecialAirN_Enter` |
| 1 | FTKIND_FOX | `ftFx_SpecialAirN_Enter` |
| 2 | FTKIND_CAPTAIN | `ftCa_SpecialAirN_Enter` |
| 3 | FTKIND_DONKEY | `ftDk_SpecialAirN_Enter` |
| 4 | FTKIND_KIRBY | `ftKb_SpecialAirN_Enter` |
| 5 | FTKIND_KOOPA | `ftKp_SpecialAirN_Enter` |
| 6 | FTKIND_LINK | `ftLk_SpecialAirN_Enter` |
| 7 | FTKIND_SEAK | `ftSk_SpecialAirN_Enter` |
| 8 | FTKIND_NESS | `ftNs_SpecialAirNStart_Enter` |
| 9 | FTKIND_PEACH | `ftPe_SpecialAirN_Enter` |
| 10 | FTKIND_POPO | `ftPp_SpecialAirN_Enter` |
| 11 | FTKIND_NANA | `ftPp_SpecialAirN_Enter` |
| 12 | FTKIND_PIKACHU | `ftPk_SpecialAirN_Enter` |
| 13 | FTKIND_SAMUS | `ftSs_SpecialAirN_Enter` |
| 14 | FTKIND_YOSHI | `ftYs_SpecialAirN_Enter` |
| 15 | FTKIND_PURIN | `ftPr_SpecialAirN_Enter` |
| 16 | FTKIND_MEWTWO | `ftMt_SpecialAirN_Enter` |
| 17 | FTKIND_LUIGI | `ftLg_SpecialAirN_Enter` |
| 18 | FTKIND_MARS | `ftMs_SpecialAirN_Enter` |
| 19 | FTKIND_ZELDA | `ftZd_SpecialAirN_Enter` |
| 20 | FTKIND_CLINK | `ftLk_SpecialAirN_Enter` |
| 21 | FTKIND_DRMARIO | `ftMr_SpecialAirN_Enter` |
| 22 | FTKIND_FALCO | `ftFx_SpecialAirN_Enter` |
| 23 | FTKIND_PICHU | `ftPk_SpecialAirN_Enter` |
| 24 | FTKIND_GAMEWATCH | `ftGw_SpecialAirN_Enter` |
| 25 | FTKIND_GANON | `ftCa_SpecialAirN_Enter` |
| 26 | FTKIND_EMBLEM | `ftMs_SpecialAirN_Enter` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftKp_SpecialAirN_Enter` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_SpecialN

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L584-L618

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_SpecialN_Enter` |
| 1 | FTKIND_FOX | `ftFx_SpecialN_Enter` |
| 2 | FTKIND_CAPTAIN | `ftCa_SpecialN_Enter` |
| 3 | FTKIND_DONKEY | `ftDk_SpecialN_Enter` |
| 4 | FTKIND_KIRBY | `ftKb_SpecialN_Enter` |
| 5 | FTKIND_KOOPA | `ftKp_SpecialN_Enter` |
| 6 | FTKIND_LINK | `ftLk_SpecialN_Enter` |
| 7 | FTKIND_SEAK | `ftSk_SpecialN_Enter` |
| 8 | FTKIND_NESS | `ftNs_SpecialNStart_Enter` |
| 9 | FTKIND_PEACH | `ftPe_SpecialN_Enter` |
| 10 | FTKIND_POPO | `ftPp_SpecialN_Enter` |
| 11 | FTKIND_NANA | `ftPp_SpecialN_Enter` |
| 12 | FTKIND_PIKACHU | `ftPk_SpecialN_Enter` |
| 13 | FTKIND_SAMUS | `ftSs_SpecialN_Enter` |
| 14 | FTKIND_YOSHI | `ftYs_SpecialN_Enter` |
| 15 | FTKIND_PURIN | `ftPr_SpecialN_Enter` |
| 16 | FTKIND_MEWTWO | `ftMt_SpecialN_Enter` |
| 17 | FTKIND_LUIGI | `ftLg_SpecialN_Enter` |
| 18 | FTKIND_MARS | `ftMs_SpecialN_Enter` |
| 19 | FTKIND_ZELDA | `ftZd_SpecialN_Enter` |
| 20 | FTKIND_CLINK | `ftLk_SpecialN_Enter` |
| 21 | FTKIND_DRMARIO | `ftMr_SpecialN_Enter` |
| 22 | FTKIND_FALCO | `ftFx_SpecialN_Enter` |
| 23 | FTKIND_PICHU | `ftPk_SpecialN_Enter` |
| 24 | FTKIND_GAMEWATCH | `ftGw_SpecialN_Enter` |
| 25 | FTKIND_GANON | `ftCa_SpecialN_Enter` |
| 26 | FTKIND_EMBLEM | `ftMs_SpecialN_Enter` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftKp_SpecialN_Enter` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_SpecialLw

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L620-L654

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_SpecialLw_Enter` |
| 1 | FTKIND_FOX | `ftFx_SpecialLw_Enter` |
| 2 | FTKIND_CAPTAIN | `ftCa_SpecialLw_Enter` |
| 3 | FTKIND_DONKEY | `ftDk_SpecialLw_Enter` |
| 4 | FTKIND_KIRBY | `ftKb_SpecialLw_Enter` |
| 5 | FTKIND_KOOPA | `ftKp_SpecialLw_Enter` |
| 6 | FTKIND_LINK | `ftLk_SpecialLw_Enter` |
| 7 | FTKIND_SEAK | `ftSk_SpecialLw_Enter` |
| 8 | FTKIND_NESS | `ftNs_SpecialLwStart_Enter` |
| 9 | FTKIND_PEACH | `ftPe_SpecialLw_Enter` |
| 10 | FTKIND_POPO | `ftPp_SpecialLw_Enter` |
| 11 | FTKIND_NANA | `ftPp_SpecialLw_Enter` |
| 12 | FTKIND_PIKACHU | `ftPk_SpecialLw_Enter` |
| 13 | FTKIND_SAMUS | `ftSs_SpecialLw_Enter` |
| 14 | FTKIND_YOSHI | `ftYs_SpecialLw_Enter` |
| 15 | FTKIND_PURIN | `ftPr_SpecialLw_Enter` |
| 16 | FTKIND_MEWTWO | `ftMt_SpecialLw_Enter` |
| 17 | FTKIND_LUIGI | `ftLg_SpecialLw_Enter` |
| 18 | FTKIND_MARS | `ftMs_SpecialLw_Enter` |
| 19 | FTKIND_ZELDA | `ftZd_SpecialLw_Enter` |
| 20 | FTKIND_CLINK | `ftLk_SpecialLw_Enter` |
| 21 | FTKIND_DRMARIO | `ftMr_SpecialLw_Enter` |
| 22 | FTKIND_FALCO | `ftFx_SpecialLw_Enter` |
| 23 | FTKIND_PICHU | `ftPk_SpecialLw_Enter` |
| 24 | FTKIND_GAMEWATCH | `ftGw_SpecialLw_Enter` |
| 25 | FTKIND_GANON | `ftCa_SpecialLw_Enter` |
| 26 | FTKIND_EMBLEM | `ftMs_SpecialLw_Enter` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftKp_SpecialLw_Enter` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_SpecialHi

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L656-L690

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_SpecialHi_Enter` |
| 1 | FTKIND_FOX | `ftFx_SpecialHi_Enter` |
| 2 | FTKIND_CAPTAIN | `ftCa_SpecialHi_Enter` |
| 3 | FTKIND_DONKEY | `ftDk_SpecialHi_Enter` |
| 4 | FTKIND_KIRBY | `ftKb_SpecialHi_Enter` |
| 5 | FTKIND_KOOPA | `ftKp_SpecialHi_Enter` |
| 6 | FTKIND_LINK | `ftLk_SpecialHi_Enter` |
| 7 | FTKIND_SEAK | `ftSk_SpecialHi_Enter` |
| 8 | FTKIND_NESS | `ftNs_SpecialHiStart_Enter` |
| 9 | FTKIND_PEACH | `ftPe_SpecialHi_Enter` |
| 10 | FTKIND_POPO | `ftPp_SpecialHi_Enter` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `ftPk_SpecialHi_Enter` |
| 13 | FTKIND_SAMUS | `ftSs_SpecialHi_Enter` |
| 14 | FTKIND_YOSHI | `ftYs_SpecialHi_Enter` |
| 15 | FTKIND_PURIN | `ftPr_SpecialHi_Enter` |
| 16 | FTKIND_MEWTWO | `ftMt_SpecialHiStart_Enter` |
| 17 | FTKIND_LUIGI | `ftLg_SpecialHi_Enter` |
| 18 | FTKIND_MARS | `ftMs_SpecialHi_Enter` |
| 19 | FTKIND_ZELDA | `ftZd_SpecialHi_Enter` |
| 20 | FTKIND_CLINK | `ftLk_SpecialHi_Enter` |
| 21 | FTKIND_DRMARIO | `ftMr_SpecialHi_Enter` |
| 22 | FTKIND_FALCO | `ftFx_SpecialHi_Enter` |
| 23 | FTKIND_PICHU | `ftPk_SpecialHi_Enter` |
| 24 | FTKIND_GAMEWATCH | `ftGw_SpecialHi_Enter` |
| 25 | FTKIND_GANON | `ftCa_SpecialHi_Enter` |
| 26 | FTKIND_EMBLEM | `ftMs_SpecialHi_Enter` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftKp_SpecialHi_Enter` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_OnAbsorb

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L692-L726

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `NULL` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `NULL` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `ftNs_Init_OnAbsorb` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `NULL` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `NULL` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_OnAbsorb` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `NULL` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_OnItemPickupExt

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L728-L762

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnItemPickup` |
| 1 | FTKIND_FOX | `ftFx_Init_OnItemPickup` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_OnItemPickup` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnItemPickup` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnItemPickup` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnItemPickup` |
| 6 | FTKIND_LINK | `ftLk_Init_OnItemPickupExt` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnItemPickup` |
| 8 | FTKIND_NESS | `ftNs_Init_OnItemPickup` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnItemPickup` |
| 10 | FTKIND_POPO | `ftPp_Init_OnItemPickup` |
| 11 | FTKIND_NANA | `ftPp_Init_OnItemPickup` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnItemPickup` |
| 13 | FTKIND_SAMUS | `ftSs_Init_OnItemPickup` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnItemPickup` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnItemPickup` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnItemPickup` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnItemPickup` |
| 18 | FTKIND_MARS | `ftMs_Init_OnItemPickup` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnItemPickup` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnItemPickupExt` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnItemPickup` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnItemPickup` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnItemPickup` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_OnItemPickup` |
| 25 | FTKIND_GANON | `ftGn_Init_OnItemPickup` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnItemPickup` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `ftBo_Init_OnItemPickup` |
| 30 | FTKIND_GIRL | `ftGl_Init_OnItemPickup` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnItemPickup` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_OnItemInvisible

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L764-L798

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnItemInvisible` |
| 1 | FTKIND_FOX | `ftFx_Init_OnItemInvisible` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_OnItemInvisible` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnItemInvisible` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnItemInvisible` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnItemInvisible` |
| 6 | FTKIND_LINK | `ftLk_Init_OnItemInvisible` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnItemInvisible` |
| 8 | FTKIND_NESS | `ftNs_Init_OnItemInvisible` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnItemInvisible` |
| 10 | FTKIND_POPO | `ftPp_Init_OnItemInvisible` |
| 11 | FTKIND_NANA | `ftPp_Init_OnItemInvisible` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnItemInvisible` |
| 13 | FTKIND_SAMUS | `ftSs_Init_OnItemInvisible` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnItemInvisible` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnItemInvisible` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnItemInvisible` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnItemInvisible` |
| 18 | FTKIND_MARS | `ftMs_Init_OnItemInvisible` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnItemInvisible` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnItemInvisible` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnItemInvisible` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnItemInvisible` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnItemInvisible` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_OnItemInvisible` |
| 25 | FTKIND_GANON | `ftGn_Init_OnItemInvisible` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnItemInvisible` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `ftBo_Init_OnItemInvisible` |
| 30 | FTKIND_GIRL | `ftGl_Init_OnItemInvisible` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnItemInvisible` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_OnItemVisible

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L800-L834

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnItemVisible` |
| 1 | FTKIND_FOX | `ftFx_Init_OnItemVisible` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_OnItemVisible` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnItemVisible` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnItemVisible` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnItemVisible` |
| 6 | FTKIND_LINK | `ftLk_Init_OnItemVisible` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnItemVisible` |
| 8 | FTKIND_NESS | `ftNs_Init_OnItemVisible` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnItemVisible` |
| 10 | FTKIND_POPO | `ftPp_Init_OnItemVisible` |
| 11 | FTKIND_NANA | `ftPp_Init_OnItemVisible` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnItemVisible` |
| 13 | FTKIND_SAMUS | `ftSs_Init_OnItemVisible` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnItemVisible` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnItemVisible` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnItemVisible` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnItemVisible` |
| 18 | FTKIND_MARS | `ftMs_Init_OnItemVisible` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnItemVisible` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnItemVisible` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnItemVisible` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnItemVisible` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnItemVisible` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_OnItemVisible` |
| 25 | FTKIND_GANON | `ftGn_Init_OnItemVisible` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnItemVisible` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `ftBo_Init_OnItemVisible` |
| 30 | FTKIND_GIRL | `ftGl_Init_OnItemVisible` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnItemVisible` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_OnItemDropExt

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L836-L870

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnItemDrop` |
| 1 | FTKIND_FOX | `ftFx_Init_OnItemDrop` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_OnItemDrop` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnItemDrop` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnItemDrop` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnItemDrop` |
| 6 | FTKIND_LINK | `ftLk_Init_OnItemDropExt` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnItemDrop` |
| 8 | FTKIND_NESS | `ftNs_Init_OnItemDrop` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnItemDrop` |
| 10 | FTKIND_POPO | `ftPp_Init_OnItemDrop` |
| 11 | FTKIND_NANA | `ftPp_Init_OnItemDrop` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnItemDrop` |
| 13 | FTKIND_SAMUS | `ftSs_Init_OnItemDrop` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnItemDrop` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnItemDrop` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnItemDrop` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnItemDrop` |
| 18 | FTKIND_MARS | `ftMs_Init_OnItemDrop` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnItemDrop` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnItemDropExt` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnItemDrop` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnItemDrop` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnItemDrop` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_OnItemDrop` |
| 25 | FTKIND_GANON | `ftGn_Init_OnItemDrop` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnItemDrop` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `ftBo_Init_OnItemDrop` |
| 30 | FTKIND_GIRL | `ftGl_Init_OnItemDrop` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnItemDrop` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_OnItemPickup

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L872-L906

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnItemPickup` |
| 1 | FTKIND_FOX | `ftFx_Init_OnItemPickup` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_OnItemPickup` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnItemPickup` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnItemPickup` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnItemPickup` |
| 6 | FTKIND_LINK | `ftLk_Init_OnItemPickup` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnItemPickup` |
| 8 | FTKIND_NESS | `ftNs_Init_OnItemPickup` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnItemPickup` |
| 10 | FTKIND_POPO | `ftPp_Init_OnItemPickup` |
| 11 | FTKIND_NANA | `ftPp_Init_OnItemPickup` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnItemPickup` |
| 13 | FTKIND_SAMUS | `ftSs_Init_OnItemPickup` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnItemPickup` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnItemPickup` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnItemPickup` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnItemPickup` |
| 18 | FTKIND_MARS | `ftMs_Init_OnItemPickup` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnItemPickup` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnItemPickup` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnItemPickup` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnItemPickup` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnItemPickup` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_OnItemPickup` |
| 25 | FTKIND_GANON | `ftGn_Init_OnItemPickup` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnItemPickup` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `ftBo_Init_OnItemPickup` |
| 30 | FTKIND_GIRL | `ftGl_Init_OnItemPickup` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnItemPickup` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_OnItemDrop

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L908-L942

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnItemDrop` |
| 1 | FTKIND_FOX | `ftFx_Init_OnItemDrop` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_OnItemDrop` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnItemDrop` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnItemDrop` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnItemDrop` |
| 6 | FTKIND_LINK | `ftLk_Init_OnItemDrop` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnItemDrop` |
| 8 | FTKIND_NESS | `ftNs_Init_OnItemDrop` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnItemDrop` |
| 10 | FTKIND_POPO | `ftPp_Init_OnItemDrop` |
| 11 | FTKIND_NANA | `ftPp_Init_OnItemDrop` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnItemDrop` |
| 13 | FTKIND_SAMUS | `ftSs_Init_OnItemDrop` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnItemDrop` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnItemDrop` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnItemDrop` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnItemDrop` |
| 18 | FTKIND_MARS | `ftMs_Init_OnItemDrop` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnItemDrop` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnItemDrop` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnItemDrop` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnItemDrop` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnItemDrop` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_OnItemDrop` |
| 25 | FTKIND_GANON | `ftGn_Init_OnItemDrop` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnItemDrop` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `ftBo_Init_OnItemDrop` |
| 30 | FTKIND_GIRL | `ftGl_Init_OnItemDrop` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnItemDrop` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_UnkMotionStates1

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L944-L978

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `NULL` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `NULL` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_UnkMotionStates1` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `NULL` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `NULL` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `NULL` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_UnkMotionStates2

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L980-L1014

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `NULL` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `NULL` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_UnkMotionStates2` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `NULL` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `NULL` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `NULL` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_OnKnockbackEnter

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1016-L1050

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnKnockbackEnter` |
| 1 | FTKIND_FOX | `ftFx_Init_OnKnockbackEnter` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnKnockbackEnter` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnKnockbackEnter` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnKnockbackEnter` |
| 6 | FTKIND_LINK | `ftLk_Init_OnKnockbackEnter` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnKnockbackEnter` |
| 8 | FTKIND_NESS | `ftNs_Init_OnKnockbackEnter` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnKnockbackEnter` |
| 10 | FTKIND_POPO | `ftPp_Init_OnKnockbackEnter` |
| 11 | FTKIND_NANA | `ftPp_Init_OnKnockbackEnter` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnKnockbackEnter` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnKnockbackEnter` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnKnockbackEnter` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnKnockbackEnter` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnKnockbackEnter` |
| 18 | FTKIND_MARS | `ftMs_Init_OnKnockbackEnter` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnKnockbackEnter` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnKnockbackEnter` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnKnockbackEnter` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnKnockbackEnter` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnKnockbackEnter` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `ftGn_Init_OnKnockbackEnter` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnKnockbackEnter` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnKnockbackEnter` |
| 32 | FTKIND_SANDBAG | `ftSb_Init_OnKnockbackEnter` |

### ftData_OnKnockbackExit

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1052-L1086

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_OnKnockbackExit` |
| 1 | FTKIND_FOX | `ftFx_Init_OnKnockbackExit` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `ftDk_Init_OnKnockbackExit` |
| 4 | FTKIND_KIRBY | `ftKb_Init_OnKnockbackExit` |
| 5 | FTKIND_KOOPA | `ftKp_Init_OnKnockbackExit` |
| 6 | FTKIND_LINK | `ftLk_Init_OnKnockbackExit` |
| 7 | FTKIND_SEAK | `ftSk_Init_OnKnockbackExit` |
| 8 | FTKIND_NESS | `ftNs_Init_OnKnockbackExit` |
| 9 | FTKIND_PEACH | `ftPe_Init_OnKnockbackExit` |
| 10 | FTKIND_POPO | `ftPp_Init_OnKnockbackExit` |
| 11 | FTKIND_NANA | `ftPp_Init_OnKnockbackExit` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_OnKnockbackExit` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `ftYs_Init_OnKnockbackExit` |
| 15 | FTKIND_PURIN | `ftPr_Init_OnKnockbackExit` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_OnKnockbackExit` |
| 17 | FTKIND_LUIGI | `ftLg_Init_OnKnockbackExit` |
| 18 | FTKIND_MARS | `ftMs_Init_OnKnockbackExit` |
| 19 | FTKIND_ZELDA | `ftZd_Init_OnKnockbackExit` |
| 20 | FTKIND_CLINK | `ftCl_Init_OnKnockbackExit` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_OnKnockbackExit` |
| 22 | FTKIND_FALCO | `ftFc_Init_OnKnockbackExit` |
| 23 | FTKIND_PICHU | `ftPc_Init_OnKnockbackExit` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `ftGn_Init_OnKnockbackExit` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_OnKnockbackExit` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_OnKnockbackExit` |
| 32 | FTKIND_SANDBAG | `ftSb_Init_OnKnockbackExit` |

### ftData_UnkMotionStates3

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1088-L1122

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `NULL` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `ftKb_Init_UnkMotionStates3` |
| 5 | FTKIND_KOOPA | `ftKp_Init_UnkMotionStates3` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `NULL` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `NULL` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_UnkMotionStates3` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_UnkMotionStates4

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1124-L1158

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `NULL` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `ftDk_Init_UnkMotionStates4` |
| 4 | FTKIND_KIRBY | `ftKb_Init_UnkMotionStates4` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `ftSk_Init_UnkMotionStates4` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `ftSs_Init_UnkMotionStates4` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `NULL` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_UnkMotionStates4` |
| 17 | FTKIND_LUIGI | `NULL` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_UnkMotionStates4` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `NULL` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftKindCalcIndiviParamTable

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1160-L1178

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_LoadSpecialAttrs` |
| 1 | FTKIND_FOX | `ftFx_Init_LoadSpecialAttrs` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_LoadSpecialAttrs` |
| 3 | FTKIND_DONKEY | `ftDk_Init_LoadSpecialAttrs` |
| 4 | FTKIND_KIRBY | `ftKb_Init_LoadSpecialAttrs` |
| 5 | FTKIND_KOOPA | `ftKp_Init_LoadSpecialAttrs` |
| 6 | FTKIND_LINK | `ftLk_Init_LoadSpecialAttrs` |
| 7 | FTKIND_SEAK | `ftSk_Init_LoadSpecialAttrs` |
| 8 | FTKIND_NESS | `ftNs_Init_LoadSpecialAttrs` |
| 9 | FTKIND_PEACH | `ftPe_Init_LoadSpecialAttrs` |
| 10 | FTKIND_POPO | `ftPp_Init_LoadSpecialAttrs` |
| 11 | FTKIND_NANA | `ftNn_Init_LoadSpecialAttrs` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_LoadSpecialAttrs` |
| 13 | FTKIND_SAMUS | `ftSs_Init_LoadSpecialAttrs` |
| 14 | FTKIND_YOSHI | `ftYs_Init_LoadSpecialAttrs` |
| 15 | FTKIND_PURIN | `ftPr_Init_LoadSpecialAttrs` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_LoadSpecialAttrs` |
| 17 | FTKIND_LUIGI | `ftLg_Init_LoadSpecialAttrs` |
| 18 | FTKIND_MARS | `ftMs_Init_LoadSpecialAttrs` |
| 19 | FTKIND_ZELDA | `ftZd_Init_LoadSpecialAttrs` |
| 20 | FTKIND_CLINK | `ftCl_Init_LoadSpecialAttrs` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_LoadSpecialAttrs` |
| 22 | FTKIND_FALCO | `ftFc_Init_LoadSpecialAttrs` |
| 23 | FTKIND_PICHU | `ftPc_Init_LoadSpecialAttrs` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_LoadSpecialAttrs` |
| 25 | FTKIND_GANON | `ftGn_Init_LoadSpecialAttrs` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_LoadSpecialAttrs` |
| 27 | FTKIND_MASTERH | `ftMh_Init_LoadSpecialAttrs` |
| 28 | FTKIND_CREZYH | `ftCh_Init_LoadSpecialAttrs` |
| 29 | FTKIND_BOY | `ftBo_Init_LoadSpecialAttrs` |
| 30 | FTKIND_GIRL | `ftGl_Init_LoadSpecialAttrs` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_LoadSpecialAttrs` |
| 32 | FTKIND_SANDBAG | `ftSb_Init_LoadSpecialAttrs` |

### ftData_803C1F40

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1186-L1220

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `{ ftMr_Init_DatFilename, ftMr_Init_DataName }` |
| 1 | FTKIND_FOX | `{ ftFx_Init_DatFilename, ftFx_Init_DataName }` |
| 2 | FTKIND_CAPTAIN | `{ ftCa_Init_DatFilename, ftCa_Init_DataName }` |
| 3 | FTKIND_DONKEY | `{ ftDk_Init_DatFilename, ftDk_Init_DataName }` |
| 4 | FTKIND_KIRBY | `{ ftKb_Init_DatFilename, ftKb_Init_DataName }` |
| 5 | FTKIND_KOOPA | `{ ftKp_Init_DatFilename, ftKp_Init_DataName }` |
| 6 | FTKIND_LINK | `{ ftLk_Init_DatFilename, ftLk_Init_DataName }` |
| 7 | FTKIND_SEAK | `{ ftSk_Init_DatFilename, ftSk_Init_DataName }` |
| 8 | FTKIND_NESS | `{ ftNs_Init_DatFilename, ftNs_Init_DataName }` |
| 9 | FTKIND_PEACH | `{ ftPe_Init_DatFilename, ftPe_Init_DataName }` |
| 10 | FTKIND_POPO | `{ ftPp_Init_DatFilename, ftPp_Init_DataName }` |
| 11 | FTKIND_NANA | `{ ftNn_Init_DatFilename, ftNn_Init_DataName }` |
| 12 | FTKIND_PIKACHU | `{ ftPk_Init_DatFilename, ftPk_Init_DataName }` |
| 13 | FTKIND_SAMUS | `{ ftSs_Init_DatFilename, ftSs_Init_DataName }` |
| 14 | FTKIND_YOSHI | `{ ftYs_Init_DatFilename, ftYs_Init_DataName }` |
| 15 | FTKIND_PURIN | `{ ftPr_Init_DatFilename, ftPr_Init_DataName }` |
| 16 | FTKIND_MEWTWO | `{ ftMt_Init_DatFilename, ftMt_Init_DataName }` |
| 17 | FTKIND_LUIGI | `{ ftLg_Init_DatFilename, ftLg_Init_DataName }` |
| 18 | FTKIND_MARS | `{ ftMs_Init_DatFilename, ftMs_Init_DataName }` |
| 19 | FTKIND_ZELDA | `{ ftZd_Init_DatFilename, ftZd_Init_DataName }` |
| 20 | FTKIND_CLINK | `{ ftCl_Init_DatFilename, ftCl_Init_DataName }` |
| 21 | FTKIND_DRMARIO | `{ ftDr_Init_DatFilename, ftDr_Init_DataName }` |
| 22 | FTKIND_FALCO | `{ ftFc_Init_DatFilename, ftFc_Init_DataName }` |
| 23 | FTKIND_PICHU | `{ ftPc_Init_DatFilename, ftPc_Init_DataName }` |
| 24 | FTKIND_GAMEWATCH | `{ ftGw_Init_DatFilename, ftGw_Init_DataName }` |
| 25 | FTKIND_GANON | `{ ftGn_Init_DatFilename, ftGn_Init_DataName }` |
| 26 | FTKIND_EMBLEM | `{ ftFe_Init_DatFilename, ftFe_Init_DataName }` |
| 27 | FTKIND_MASTERH | `{ ftMh_Init_DatFilename, ftMh_Init_DataName }` |
| 28 | FTKIND_CREZYH | `{ ftCh_Init_DatFilename, ftCh_Init_DataName }` |
| 29 | FTKIND_BOY | `{ ftBo_Init_DatFilename, ftBo_Init_DataName }` |
| 30 | FTKIND_GIRL | `{ ftGl_Init_DatFilename, ftGl_Init_DataName }` |
| 31 | FTKIND_GKOOPS | `{ ftGk_Init_DatFilename, ftGk_Init_DataName }` |
| 32 | FTKIND_SANDBAG | `{ ftSb_Init_DatFilename, ftSb_Init_DataName }` |

### ftData_UnkMotionStates5

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1222-L1230

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `NULL` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `ftKb_Init_UnkMotionStates5` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `NULL` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `NULL` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `NULL` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_UnkMtxFunc0

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1232-L1266

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `NULL` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `ftKb_UnkMtxFunc0` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `ftPr_Init_UnkMtxFunc0` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `NULL` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `NULL` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_UnkCallbackPairs0

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1346-L1352

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `{ NULL, NULL }` |
| 1 | FTKIND_FOX | `{ NULL, NULL }` |
| 2 | FTKIND_CAPTAIN | `{ NULL, NULL }` |
| 3 | FTKIND_DONKEY | `{ NULL, NULL }` |
| 4 | FTKIND_KIRBY | `{ ftKb_Init_UnkCallbackPairs0_0, ftKb_Init_UnkCallbackPairs0_1 }` |
| 5 | FTKIND_KOOPA | `0 /* implicit */` |
| 6 | FTKIND_LINK | `0 /* implicit */` |
| 7 | FTKIND_SEAK | `0 /* implicit */` |
| 8 | FTKIND_NESS | `0 /* implicit */` |
| 9 | FTKIND_PEACH | `0 /* implicit */` |
| 10 | FTKIND_POPO | `0 /* implicit */` |
| 11 | FTKIND_NANA | `0 /* implicit */` |
| 12 | FTKIND_PIKACHU | `0 /* implicit */` |
| 13 | FTKIND_SAMUS | `0 /* implicit */` |
| 14 | FTKIND_YOSHI | `0 /* implicit */` |
| 15 | FTKIND_PURIN | `0 /* implicit */` |
| 16 | FTKIND_MEWTWO | `0 /* implicit */` |
| 17 | FTKIND_LUIGI | `0 /* implicit */` |
| 18 | FTKIND_MARS | `0 /* implicit */` |
| 19 | FTKIND_ZELDA | `0 /* implicit */` |
| 20 | FTKIND_CLINK | `0 /* implicit */` |
| 21 | FTKIND_DRMARIO | `0 /* implicit */` |
| 22 | FTKIND_FALCO | `0 /* implicit */` |
| 23 | FTKIND_PICHU | `0 /* implicit */` |
| 24 | FTKIND_GAMEWATCH | `0 /* implicit */` |
| 25 | FTKIND_GANON | `0 /* implicit */` |
| 26 | FTKIND_EMBLEM | `0 /* implicit */` |
| 27 | FTKIND_MASTERH | `0 /* implicit */` |
| 28 | FTKIND_CREZYH | `0 /* implicit */` |
| 29 | FTKIND_BOY | `0 /* implicit */` |
| 30 | FTKIND_GIRL | `0 /* implicit */` |
| 31 | FTKIND_GKOOPS | `0 /* implicit */` |
| 32 | FTKIND_SANDBAG | `0 /* implicit */` |

### ftData_803C2360

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1355-L1374

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_CostumeStrings` |
| 1 | FTKIND_FOX | `ftFx_Init_CostumeStrings` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_CostumeStrings` |
| 3 | FTKIND_DONKEY | `ftDk_Init_CostumeStrings` |
| 4 | FTKIND_KIRBY | `ftKb_Init_CostumeStrings` |
| 5 | FTKIND_KOOPA | `ftKp_Init_CostumeStrings` |
| 6 | FTKIND_LINK | `ftLk_Init_CostumeStrings` |
| 7 | FTKIND_SEAK | `ftSk_Init_CostumeStrings` |
| 8 | FTKIND_NESS | `ftNs_Init_CostumeStrings` |
| 9 | FTKIND_PEACH | `ftPe_Init_CostumeStrings` |
| 10 | FTKIND_POPO | `ftPp_Init_CostumeStrings` |
| 11 | FTKIND_NANA | `ftNn_Init_CostumeStrings` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_CostumeStrings` |
| 13 | FTKIND_SAMUS | `ftSs_Init_CostumeStrings` |
| 14 | FTKIND_YOSHI | `ftYs_Init_CostumeStrings` |
| 15 | FTKIND_PURIN | `ftPr_Init_CostumeStrings` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_CostumeStrings` |
| 17 | FTKIND_LUIGI | `ftLg_Init_CostumeStrings` |
| 18 | FTKIND_MARS | `ftMs_Init_CostumeStrings` |
| 19 | FTKIND_ZELDA | `ftZd_Init_CostumeStrings` |
| 20 | FTKIND_CLINK | `ftCl_Init_CostumeStrings` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_CostumeStrings` |
| 22 | FTKIND_FALCO | `ftFc_Init_CostumeStrings` |
| 23 | FTKIND_PICHU | `ftPc_Init_CostumeStrings` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_CostumeStrings` |
| 25 | FTKIND_GANON | `ftGn_Init_CostumeStrings` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_CostumeStrings` |
| 27 | FTKIND_MASTERH | `ftMh_Init_CostumeStrings` |
| 28 | FTKIND_CREZYH | `ftCh_Init_CostumeStrings` |
| 29 | FTKIND_BOY | `ftBo_Init_CostumeStrings` |
| 30 | FTKIND_GIRL | `ftGl_Init_CostumeStrings` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_CostumeStrings` |
| 32 | FTKIND_SANDBAG | `ftSb_Init_CostumeStrings` |

### ftData_803C23E4

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1376-L1394

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_AnimDatFilename` |
| 1 | FTKIND_FOX | `ftFx_Init_AnimDatFilename` |
| 2 | FTKIND_CAPTAIN | `ftCa_Init_AnimDatFilename` |
| 3 | FTKIND_DONKEY | `ftDk_Init_AnimDatFilename` |
| 4 | FTKIND_KIRBY | `ftKb_Init_AnimDatFilename` |
| 5 | FTKIND_KOOPA | `ftKp_Init_AnimDatFilename` |
| 6 | FTKIND_LINK | `ftLk_Init_AnimDatFilename` |
| 7 | FTKIND_SEAK | `ftSk_Init_AnimDatFilename` |
| 8 | FTKIND_NESS | `ftNs_Init_AnimDatFilename` |
| 9 | FTKIND_PEACH | `ftPe_Init_AnimDatFilename` |
| 10 | FTKIND_POPO | `ftPp_Init_AnimDatFilename` |
| 11 | FTKIND_NANA | `ftNn_Init_AnimDatFilename` |
| 12 | FTKIND_PIKACHU | `ftPk_Init_AnimDatFilename` |
| 13 | FTKIND_SAMUS | `ftSs_Init_AnimDatFilename` |
| 14 | FTKIND_YOSHI | `ftYs_Init_AnimDatFilename` |
| 15 | FTKIND_PURIN | `ftPr_Init_AnimDatFilename` |
| 16 | FTKIND_MEWTWO | `ftMt_Init_AnimDatFilename` |
| 17 | FTKIND_LUIGI | `ftLg_Init_AnimDatFilename` |
| 18 | FTKIND_MARS | `ftMs_Init_AnimDatFilename` |
| 19 | FTKIND_ZELDA | `ftZd_Init_AnimDatFilename` |
| 20 | FTKIND_CLINK | `ftCl_Init_AnimDatFilename` |
| 21 | FTKIND_DRMARIO | `ftDr_Init_AnimDatFilename` |
| 22 | FTKIND_FALCO | `ftFc_Init_AnimDatFilename` |
| 23 | FTKIND_PICHU | `ftPc_Init_AnimDatFilename` |
| 24 | FTKIND_GAMEWATCH | `ftGw_Init_AnimDatFilename` |
| 25 | FTKIND_GANON | `ftGn_Init_AnimDatFilename` |
| 26 | FTKIND_EMBLEM | `ftFe_Init_AnimDatFilename` |
| 27 | FTKIND_MASTERH | `ftMh_Init_AnimDatFilename` |
| 28 | FTKIND_CREZYH | `ftCh_Init_AnimDatFilename` |
| 29 | FTKIND_BOY | `ftBo_Init_AnimDatFilename` |
| 30 | FTKIND_GIRL | `ftGl_Init_AnimDatFilename` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_AnimDatFilename` |
| 32 | FTKIND_SANDBAG | `ftSb_Init_AnimDatFilename` |

### ftData_803C2468

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1397-L1431

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `&ftMr_Init_DemoMotionFilenames` |
| 1 | FTKIND_FOX | `&ftFx_Init_DemoMotionFilenames` |
| 2 | FTKIND_CAPTAIN | `&ftCa_Init_DemoMotionFilenames` |
| 3 | FTKIND_DONKEY | `&ftDk_Init_DemoMotionFilenames` |
| 4 | FTKIND_KIRBY | `&ftKb_Init_DemoMotionFilenames` |
| 5 | FTKIND_KOOPA | `&ftKp_Init_DemoMotionFilenames` |
| 6 | FTKIND_LINK | `&ftLk_Init_DemoMotionFilenames` |
| 7 | FTKIND_SEAK | `&ftSk_Init_DemoMotionFilenames` |
| 8 | FTKIND_NESS | `&ftNs_Init_DemoMotionFilenames` |
| 9 | FTKIND_PEACH | `&ftPe_Init_DemoMotionFilenames` |
| 10 | FTKIND_POPO | `&ftPp_Init_DemoMotionFilenames` |
| 11 | FTKIND_NANA | `&ftNn_Init_DemoMotionFilenames` |
| 12 | FTKIND_PIKACHU | `&ftPk_Init_DemoMotionFilenames` |
| 13 | FTKIND_SAMUS | `&ftSs_Init_DemoMotionFilenames` |
| 14 | FTKIND_YOSHI | `&ftYs_Init_DemoMotionFilenames` |
| 15 | FTKIND_PURIN | `&ftPr_Init_DemoMotionFilenames` |
| 16 | FTKIND_MEWTWO | `&ftMt_Init_DemoMotionFilenames` |
| 17 | FTKIND_LUIGI | `&ftLg_Init_DemoMotionFilenames` |
| 18 | FTKIND_MARS | `&ftMs_Init_DemoMotionFilenames` |
| 19 | FTKIND_ZELDA | `&ftZd_Init_DemoMotionFilenames` |
| 20 | FTKIND_CLINK | `&ftCl_Init_DemoMotionFilenames` |
| 21 | FTKIND_DRMARIO | `&ftDr_Init_DemoMotionFilenames` |
| 22 | FTKIND_FALCO | `&ftFc_Init_DemoMotionFilenames` |
| 23 | FTKIND_PICHU | `&ftPc_Init_DemoMotionFilenames` |
| 24 | FTKIND_GAMEWATCH | `&ftGw_Init_DemoMotionFilenames` |
| 25 | FTKIND_GANON | `&ftGn_Init_DemoMotionFilenames` |
| 26 | FTKIND_EMBLEM | `&ftFe_Init_DemoMotionFilenames` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `&ftGk_Init_DemoMotionFilenames` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_803C24EC

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1433-L1467

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_GetMotionFileString` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `ftKb_Init_GetMotionFileString` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `NULL` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `ftLg_Init_GetMotionFileString` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_GetMotionFileString` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_UnkDemoCallbacks0

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1469-L1503

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `ftMr_Init_UnkDemoCallbacks0` |
| 1 | FTKIND_FOX | `NULL` |
| 2 | FTKIND_CAPTAIN | `NULL` |
| 3 | FTKIND_DONKEY | `NULL` |
| 4 | FTKIND_KIRBY | `ftKb_Init_UnkDemoCallbacks0` |
| 5 | FTKIND_KOOPA | `NULL` |
| 6 | FTKIND_LINK | `NULL` |
| 7 | FTKIND_SEAK | `NULL` |
| 8 | FTKIND_NESS | `NULL` |
| 9 | FTKIND_PEACH | `NULL` |
| 10 | FTKIND_POPO | `NULL` |
| 11 | FTKIND_NANA | `NULL` |
| 12 | FTKIND_PIKACHU | `NULL` |
| 13 | FTKIND_SAMUS | `NULL` |
| 14 | FTKIND_YOSHI | `NULL` |
| 15 | FTKIND_PURIN | `NULL` |
| 16 | FTKIND_MEWTWO | `NULL` |
| 17 | FTKIND_LUIGI | `ftLg_Init_UnkDemoCallbacks0` |
| 18 | FTKIND_MARS | `NULL` |
| 19 | FTKIND_ZELDA | `NULL` |
| 20 | FTKIND_CLINK | `NULL` |
| 21 | FTKIND_DRMARIO | `NULL` |
| 22 | FTKIND_FALCO | `NULL` |
| 23 | FTKIND_PICHU | `NULL` |
| 24 | FTKIND_GAMEWATCH | `NULL` |
| 25 | FTKIND_GANON | `NULL` |
| 26 | FTKIND_EMBLEM | `NULL` |
| 27 | FTKIND_MASTERH | `NULL` |
| 28 | FTKIND_CREZYH | `NULL` |
| 29 | FTKIND_BOY | `NULL` |
| 30 | FTKIND_GIRL | `NULL` |
| 31 | FTKIND_GKOOPS | `ftGk_Init_UnkDemoCallbacks0` |
| 32 | FTKIND_SANDBAG | `NULL` |

### ftData_UnkIntPairs

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1505-L1512

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `{ 0, 16 }` |
| 1 | FTKIND_FOX | `{ 0, 14 }` |
| 2 | FTKIND_CAPTAIN | `{ 0, 14 }` |
| 3 | FTKIND_DONKEY | `{ 0, 14 }` |
| 4 | FTKIND_KIRBY | `{ 0, 18 }` |
| 5 | FTKIND_KOOPA | `{ 0, 14 }` |
| 6 | FTKIND_LINK | `{ 0, 14 }` |
| 7 | FTKIND_SEAK | `{ 0, 14 }` |
| 8 | FTKIND_NESS | `{ 0, 14 }` |
| 9 | FTKIND_PEACH | `{ 0, 14 }` |
| 10 | FTKIND_POPO | `{ 0, 14 }` |
| 11 | FTKIND_NANA | `{ 0, 14 }` |
| 12 | FTKIND_PIKACHU | `{ 0, 14 }` |
| 13 | FTKIND_SAMUS | `{ 0, 14 }` |
| 14 | FTKIND_YOSHI | `{ 0, 14 }` |
| 15 | FTKIND_PURIN | `{ 0, 14 }` |
| 16 | FTKIND_MEWTWO | `{ 0, 14 }` |
| 17 | FTKIND_LUIGI | `{ 0, 16 }` |
| 18 | FTKIND_MARS | `{ 0, 14 }` |
| 19 | FTKIND_ZELDA | `{ 0, 14 }` |
| 20 | FTKIND_CLINK | `{ 0, 14 }` |
| 21 | FTKIND_DRMARIO | `{ 0, 14 }` |
| 22 | FTKIND_FALCO | `{ 0, 14 }` |
| 23 | FTKIND_PICHU | `{ 0, 14 }` |
| 24 | FTKIND_GAMEWATCH | `{ 0, 14 }` |
| 25 | FTKIND_GANON | `{ 0, 14 }` |
| 26 | FTKIND_EMBLEM | `{ 0, 14 }` |
| 27 | FTKIND_MASTERH | `{ 0, 14 }` |
| 28 | FTKIND_CREZYH | `{ 0, 14 }` |
| 29 | FTKIND_BOY | `{ 0, 14 }` |
| 30 | FTKIND_GIRL | `{ 0, 14 }` |
| 31 | FTKIND_GKOOPS | `{ 0, 15 }` |
| 32 | FTKIND_SANDBAG | `{ 0, 14 }` |

### ftData_UnkBytePerCharacter

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftdata.c#L1514-L1517

| Index | Kind | Initializer |
| --- | --- | --- |
| 0 | FTKIND_MARIO | `1` |
| 1 | FTKIND_FOX | `3` |
| 2 | FTKIND_CAPTAIN | `4` |
| 3 | FTKIND_DONKEY | `8` |
| 4 | FTKIND_KIRBY | `5` |
| 5 | FTKIND_KOOPA | `12` |
| 6 | FTKIND_LINK | `6` |
| 7 | FTKIND_SEAK | `17` |
| 8 | FTKIND_NESS | `10` |
| 9 | FTKIND_PEACH | `15` |
| 10 | FTKIND_POPO | `14` |
| 11 | FTKIND_NANA | `14` |
| 12 | FTKIND_PIKACHU | `7` |
| 13 | FTKIND_SAMUS | `2` |
| 14 | FTKIND_YOSHI | `9` |
| 15 | FTKIND_PURIN | `11` |
| 16 | FTKIND_MEWTWO | `13` |
| 17 | FTKIND_LUIGI | `18` |
| 18 | FTKIND_MARS | `16` |
| 19 | FTKIND_ZELDA | `17` |
| 20 | FTKIND_CLINK | `6` |
| 21 | FTKIND_DRMARIO | `1` |
| 22 | FTKIND_FALCO | `3` |
| 23 | FTKIND_PICHU | `7` |
| 24 | FTKIND_GAMEWATCH | `-1` |
| 25 | FTKIND_GANON | `19` |
| 26 | FTKIND_EMBLEM | `49` |
| 27 | FTKIND_MASTERH | `-1` |
| 28 | FTKIND_CREZYH | `-1` |
| 29 | FTKIND_BOY | `-1` |
| 30 | FTKIND_GIRL | `-1` |
| 31 | FTKIND_GKOOPS | `12` |
| 32 | FTKIND_SANDBAG | `-1` |

## Evidence Boundaries

Compiled placement, alignment and section contents were not inspected. Source one-past and byte-offset reset expressions must not be rewritten as confirmed named-global assignments. No matching build, source mutation, shared KB write, server or publication was performed. Exact baseline facts retain IDs and updated_at; all 39 outgoing records have individual decisions. Inferred names are retained as hypotheses. Twenty-seven parameter identities have source types and roles; their #r labels do not prove ABI registers.

{"subjects": 49, "targets": 21, "function_targets": 18, "section_targets": 3, "parameter_entities": 27, "facts": 121, "retained": 61, "superseded": 46, "unresolved": 14, "proposed_facts": 73, "links": 39, "links_retained": 33, "links_unresolved": 6, "table_ledgers": 41}
