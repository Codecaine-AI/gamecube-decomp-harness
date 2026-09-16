# Snapshot Functionality

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Read started 2026-09-08T14:49:38.936Z; completed 2026-09-08T15:08:29.711551+00:00.

## State and Card Catalogs

The0x60-byte singleton holds caller-owned snapshot/slot pointers,64-byte description, icon resource pointer, two probe results and three change flags. Runtime polling uses only two flags. Initialization does not clear all workspace fields. ClearWorkPointers nulls only two pointers and frees nothing.

Polling latches changed CARDProbe results. Refresh clears the latch before querying the card and replaces cached count only on success. Delete, swap and save invalidate cached success to8 before submission; load preserves zero on allowed submission. These return immediate task status, not persistence completion. Channels and accessor indices are unchecked; the filename formatter asserts only index<num and therefore permits negative indices through that condition.

The lower catalog layer recognizes current-disc company/game files beginning with a digit, parses decimal prefixes and sorts by descending parsed time. It does not prove filenames are wholly numeric or snapshots valid. Unique names are unique only against the cached timestamps.

## Image and Metadata

Capture preparation stores type4,640x480, stage/item/fighter metadata and mode3; the encoder receives256000 bytes of payload capacity. Banner generation samples source coordinates96+floor(448*x/64),138+floor(204*y/32), converting RGB565 to opaque RGB5A3. It writes64x32 pixels at banner columns16-79; the96x32 banner margins remain untouched. It does not create a32x32 icon. Both banner and timestamp description are updated even if the encoder returns zero.

Decode accepts only type4, forwards payload to the JPEG decoder and always flushes metadata width*height*2 after that call. Decoder traversal uses dimensions parsed from JPEG with16-pixel block rounding. The wrapper neither compares dimensions nor validates destination capacity. For normal640x480 images the output is614400 bytes.

## Persistence and Ownership

Required-block and save paths install payload length+0x38 and work pointer into the descriptor; load replaces the pointer without recalculating that size. Snapshot allocation is256064 bytes; catalog allocation2112 bytes contains two1032-byte records with48 spare bytes. Existing objects confirm96-byte BSS,3-byte %u small data and descriptor/string data with four bytes of split padding. No rebuild establishes current source-to-object equivalence.

Foreign card implementations substantiate task dispatch, delete/rename operations and synchronous refresh. Current menu consumers substantiate copy guards, allocation and album load/decode. Internal preview references remain unresolved. No shared type claims or source renames are proposed.

## Entry Points

- `.bss`: 0x60-byte singleton binds caller-owned workspaces, description, icon data and card state. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L24-L67.
- `.data`: Mutable save descriptor followed by strings in existing objects;44-byte descriptor,20-byte icon header and two CardEntry records. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L61-L74.
- `.sdata`: Three-byte %u decimal filename format, independently identified in existing object bytes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L140-L178.
- `8001D2BC`: Poll channels0/1, store each CARDProbe result and latch change on inequality; equal results preserve the flag. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L76-L86.
- `8001D338`: Return unchecked channel change flag without acknowledgement. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L88-L91.
- `8001D350`: Mutating cached-result query: zero plus pending change becomes8; return cached result. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L93-L100.
- `8001D394`: Return unchecked cached catalog count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L102-L105.
- `8001D3B0`: Return unchecked cached free blocks. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L107-L110.
- `8001D3CC`: Return unchecked cached free-file capacity. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L112-L115.
- `8001D3E8`: Return unchecked selected entry block count. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L117-L120.
- `8001D40C`: Clear change flag, refresh catalog/capacities synchronously, count sentinel entries only on success. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L122-L138.
- `8001D4A4`: Generate decimal whole-second filename unique within cached catalog; clear33-byte output. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L140-L162.
- `8001D5FC`: Guard cached result, invalidate to8, submit indexed timestamp-file deletion. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L180-L197.
- `8001D7B0`: Guard cached result, format two names and unused temporary name, invalidate to8, submit three renames. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L199-L220.
- `8001DA5C`: Nearest source sampling of448x204 region at96,138 into64x32 opaque RGB5A3 pixels centered in96x32 banner; existing margins untouched. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L222-L335.
- `8001DC0C`: Set type4,640x480, scene fields and encoder mode3; encode with256000 capacity; always create banner and localized timestamp label. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L340-L377.
- `8001DE8C`: Decode only type4; flush metadata width*height*2 bytes even on decoder failure; return booleanized decoder result. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L379-L390.
- `8001DF20`: Write payload size plus0x38 and snapshot pointer into descriptor; calculate card-layout block requirement. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L392-L409.
- `8001DF6C`: Guard and invalidate cached slot, build unique name and descriptor, submit save. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L414-L435.
- `8001E058`: Guard slot, format selected name, install destination pointer and submit load; successful submission does not set cached slot result8. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L437-L455.
- `8001E204`: Return256064-byte snapshot allocation requirement. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L457-L460.
- `8001E210`: Return2112-byte catalog allocation requirement; two0x408 records require2064 bytes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L462-L465.
- `8001E218`: Bind caller workspaces, set both card results8 and load MemSnapIconData; does not initialize all other fields. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L467-L475.
- `8001E27C`: Null only snapshot and slot pointers, without freeing storage. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L477-L481.
- `8001E290`: Null icon pointer, probe two channels and clear first two change flags; leave workspaces and third flag untouched. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L483-L491.
- `file`: Snapshot metadata/image preparation, card catalogs and asynchronous persistence requests. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbsnap.c#L1-L491.

Reviewed live application: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/801f9f787e7648214d6e12c95ef5c061d5967de7c51b199f8c67501fbb139163/2026-09-08T15-09-55.983Z-35c416e5-10bf-4977-b292-408e0349640a.receipt.json); [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbsnap/final-render.json).
