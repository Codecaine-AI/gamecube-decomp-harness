# Naming Table

| Canonical target | Inferred alias | Decision and independent support |
|---|---|---|
| .bss | none | Retain canonical; 0x60-byte singleton binds caller-owned workspaces, description, icon data and card state. |
| .data | none | Retain canonical; Mutable save descriptor followed by strings in existing objects;44-byte descriptor,20-byte icon header and two CardEntry records. |
| .sdata | none | Retain canonical; Three-byte %u decimal filename format, independently identified in existing object bytes. |
| lbSnap_8001D2BC | lbSnap_PollCardStateChanges | Retain hypothesis; Poll channels0/1, store each CARDProbe result and latch change on inequality; equal results preserve the flag. |
| lbSnap_8001D338 | lbSnap_IsCardStateChanged | Retain hypothesis; Return unchecked channel change flag without acknowledgement. |
| lbSnap_8001D350 | none | Retain canonical; Mutating cached-result query: zero plus pending change becomes8; return cached result. |
| lbSnap_8001D394 | lbSnap_GetPhotoCount | Retain hypothesis; Return unchecked cached catalog count. |
| lbSnap_8001D3B0 | lbSnap_GetFreeBlockCount | Retain hypothesis; Return unchecked cached free blocks. |
| lbSnap_8001D3CC | lbSnap_GetFreeFileCount | Retain hypothesis; Return unchecked cached free-file capacity. |
| lbSnap_8001D3E8 | lbSnap_GetSnapshotBlockCount | Retain hypothesis; Return unchecked selected entry block count. |
| lbSnap_8001D40C | lbSnap_RefreshCardCatalog | Retain hypothesis; Clear change flag, refresh catalog/capacities synchronously, count sentinel entries only on success. |
| lbSnap_8001D4A4 | lbSnap_MakeUniqueFilename | Retain hypothesis; Generate decimal whole-second filename unique within cached catalog; clear33-byte output. |
| lbSnap_8001D5FC | lbSnap_Delete | Retain hypothesis; Guard cached result, invalidate to8, submit indexed timestamp-file deletion. |
| lbSnap_8001D7B0 | lbSnap_SwapEntries | Retain hypothesis; Guard cached result, format two names and unused temporary name, invalidate to8, submit three renames. |
| lbSnap_8001DA5C | lbSnap_GenerateBanner | Retain hypothesis; Nearest source sampling of448x204 region at96,138 into64x32 opaque RGB5A3 pixels centered in96x32 banner; existing margins untouched. |
| lbSnap_8001DC0C | lbSnap_PrepareSnapshot | Retain hypothesis; Set type4,640x480, scene fields and encoder mode3; encode with256000 capacity; always create banner and localized timestamp label. |
| lbSnap_8001DE8C | lbSnap_DecodeImage | Retain hypothesis; Decode only type4; flush metadata width*height*2 bytes even on decoder failure; return booleanized decoder result. |
| lbSnap_8001DF20 | lbSnap_CalcRequiredBlocks | Retain hypothesis; Write payload size plus0x38 and snapshot pointer into descriptor; calculate card-layout block requirement. |
| lbSnap_8001DF6C | lbSnap_Save | Retain hypothesis; Guard and invalidate cached slot, build unique name and descriptor, submit save. |
| lbSnap_8001E058 | lbSnap_Load | Retain hypothesis; Guard slot, format selected name, install destination pointer and submit load; successful submission does not set cached slot result8. |
| lbSnap_8001E204 | lbSnap_GetSnapshotBufferSize | Retain hypothesis; Return256064-byte snapshot allocation requirement. |
| lbSnap_8001E210 | lbSnap_GetCardCatalogWorkSize | Retain hypothesis; Return2112-byte catalog allocation requirement; two0x408 records require2064 bytes. |
| lbSnap_8001E218 | lbSnap_Init | Retain hypothesis; Bind caller workspaces, set both card results8 and load MemSnapIconData; does not initialize all other fields. |
| lbSnap_8001E27C | lbSnap_ClearWorkPointers | Retain hypothesis; Null only snapshot and slot pointers, without freeing storage. |
| lbSnap_8001E290 | lbSnap_InitRuntimeState | Retain hypothesis; Null icon pointer, probe two channels and clear first two change flags; leave workspaces and third flag untouched. |
