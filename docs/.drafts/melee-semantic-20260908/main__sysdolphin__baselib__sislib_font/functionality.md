# SIS Font Atlas

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Owned canonical and rendered C1-6 and H1-13 read to EOF, no parse errors or substitutions. Started 2026-09-08T15:26:30.396Z; completed 2026-09-08T15:28:05.675757+00:00.

The TU defines HSD_SisLib_FontAtlas with generated raw initializer data. The header declares 287 TextGlyphTexture entries, each exactly 512 bytes of u8 storage. Total size is 146944 bytes, 0x23E00. The definition requests 32-byte alignment and is not const-qualified. There are no functions, allocations or runtime state transitions in the TU.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sislib_font.c#L3-L5 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sislib_font.h#L6-L10.

The independently read SIS header derives the glyph count from sizeof the atlas and stores texture-array pointers in SIS. The text renderer initializes its default data pointer to this atlas before considering alternate SIS textures. This establishes font-data use without inferring glyph encoding or texture dimensions from byte size alone.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/sislib.h#L14-L28 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3A76.c#L450-L490.

Extraction configuration names a generated raw include and binary. Both generated artifacts were inventoried and hashed, but individual glyph images were not visually reviewed. They are not owned files in this manifest. Existing source and target objects each contain one 0x23E00-byte data symbol; their section alignment differs, 32 versus 8 bytes. Object hashes and symbol/section output are saved without claiming pinned build parity.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/config/GALE01/config.yml#L22-L32 and object-evidence.txt. Canonical/render snapshots and receipts are in `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__sislib_font/`.

Both owned subjects are fact-free. The missing baseline-link export was checked against the read-only baseline database and both subjects have zero outgoing records. The packet proposes three factual writes and no names, links or source changes.
