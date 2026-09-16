# Fighter Camera Data Review

Both section interpretations are confirmed. Retain four purpose/data-flow facts and refine two type facts with exact bytes. Six proposed writes refresh evidence; zero clears or new names.

.data stores ftcamera.c at offset 0 and the upper-blast-zone divisor assertion text at offset 12. Source lines 95-114 place their consumer in ftCamera_80076320. Relocations at text offsets 0x34a, 0x34e, 0x352, and 0x356 address these strings within that function. The source object has 52 bytes; the split object and report account for 56 bytes with final padding.

.sdata2 contains +1.0f, -1.0f, and 0.0f at offsets 0, 4, and 8. Source lines 21-47 and 51-87 consume signed unit literals for facing comparison and assignment. Lines 95-114 use zero in the divisor assertion. The object relocations independently map these literals into the three consumer functions. The source object has 12 bytes; the split object and report account for 16 bytes including final padding.

Canonical and rendered C lines 1-115 were read completely. The render used the frozen baseline, reported zero parse errors and seven substitutions, and ended with next_line null. No assigned header was required for these two section claims. No foreign-file ownership claim is made.

Existing report SHA-256 equals the manifest's dc38bdb51205241c2b638f057f8e34d932bbfafcff7c404170689aeb89585998 and records all 72 data bytes matching for this TU. This review read existing files and did not compile or invoke matching. Exact object hashes, bytes, symbol sizes and relocation offsets are in evidence.json, SHA-256 49bbc1068b722effcc4c45d8c40122182755a6b42791695345ee0e5bbc558b8d. Every proposal has pinned canonical source citations; companion evidence is referenced by hash in its rationale.

Coverage records all six fact IDs and updated_at versions. JSON parsing and count checks pass. No canonical source, shared KB, Git publication, UI or build state changed.
