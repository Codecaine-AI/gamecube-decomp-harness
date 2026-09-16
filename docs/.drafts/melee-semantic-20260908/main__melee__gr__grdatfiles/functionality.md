# Grdatfiles Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 200 canonical and rendered lines reviewed.

## .bss

Source declares static UnkArchiveStruct grDatFiles_8049EE10[4]. unk0 is the free-slot marker, unk4 holds map_head or fallback, and unk8 is set to 0 or 1 on two registration paths. Exact bytes, field layout and section membership need type/object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L112-L132

## .data

Source defines StageParam, GroundParam and zero-initialized UnkStageDat fallback objects as well as public-symbol strings earlier in the file. GroundParam points to the StageParam. Exact section membership cannot be inferred from these declarations alone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L170-L182

## .sdata

Assertions name expressions 0 and arc at lines 127 and 160. Compiler allocation of strings and padding into .sdata is not proven by source.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L119-L128

## grDatFiles_801C5FC0

Calls lbArchive_InitializeDAT on the supplied descriptor, data and length. Resolves map_ptcl and map_texg and calls psInitDataBankLocate with both and NULL only when both exports are non-null. No registry or stage_info updates occur here; relocation and particle internals are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L22-L33

## grDatFiles_801C6038

Selects the first free record before testing arg0. Non-null arg0 chooses lbArchive_800171CC when arg2!=0 or lbArchive_80016DBC otherwise, resolving map_head and setting unk8=0. When arg1==0, resolves nine stage_info exports including quake_model_set. Stores the archive; if retained stage_info particle roots are both non-null, calls psInitDataBankLoad for nonzero loader result or psInitDataBank otherwise, using bank 0x40. This particle step still occurs when arg1!=0 and roots were not refreshed. Calls the map-head flag helper. Null arg0 installs fallback map_head and archive sentinel -1, leaves unk8 unchanged, and when arg1==0 clears listed roots including x6C8 and installs fallback GroundParam. The null branch does not clear quake_model_set or run particle/flag setup.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L35-L97

## grDatFiles_801C6228

When root and unk28 array are non-null, loops i from 0 while i<unk2C and ORs 0x04000000 into each non-null entry unk4. A zero count produces no iterations; the signedness of the stored count requires the shared type definition. Repeating the operation preserves all other bits. Runtime meaning of the bit is unresolved.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L99-L110

## grDatFiles_801C6288

Passes the whole four-record array and its sizeof to memzero. This clears records without per-archive cleanup or stage_info reset.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L112-L117

## grDatFiles_801C62B4

Scans four records in ascending order and returns the first with unk0==NULL, without reserving or modifying it. Any non-null marker, including -1, is occupied. Exhaustion reaches HSD_ASSERT(229,0), with no explicit fallback return.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L119-L128

## grDatFiles_GetArchive

Returns the base address of static grDatFiles_8049EE10[4]. This is array decay to the first record, not a load of a retained archive pointer or a lookup of the current archive.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L130-L133

## grDatFiles_801C6330

For nonnegative arg0, returns the first of four records with non-null unk0, non-null map_head, unkC>arg0 and map_head->unk8[arg0].unk0!=0. Negative input or no match returns NULL. Sentinel -1 counts as occupied; there is no local null guard for the indexed unk8 array. No state is changed.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L135-L151

## grDatFiles_801C6478

Calls lbHeap_80015BD0(0,sizeof(HSD_Archive)) and initializes that descriptor over data/length before selecting a free record. Asserts the record, stores descriptor and map_head export, sets unk8=1, runs the map-head flag helper and returns the record. Allocation result and missing map_head are not rejected locally. No stage_info or particle-bank setup occurs. Meaning of unk8 beyond distinguishing registration paths is unproven.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L153-L168

## file

Maintains four archive-wrapper records, supports supplied DAT descriptors and raw-data registration, resolves map_head and optional shared stage exports, calls particle-bank routines, and flags map-head entries. Null-input registration uses static defaults and sentinel -1. GetArchive returns the array base; indexed lookup returns the first qualifying record. Resource ownership, foreign loader behavior and field/flag meanings remain bounded by their call sites.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L22-L182
