# Card and JPEG Work Storage

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. This TU defines storage only, with no functions or owned header. Existing source/split objects agree on NOBITS .bss size 9564 and .sbss size 32, both aligned to eight bytes.

## Bulk Layout

| Symbol | Offset | Bytes | Evidence-backed role |
|---|---:|---:|---|
| hsd_804D1138 | 0 | 16 | CardContext leading fields |
| hsd_804D1148 | 0x10 | 4608 | 128 rows of nine u32 words, matching CardCmd area |
| hsd_804D2348 | 0x1210 | 768 | 32 card queue records in consumer overlay |
| hsd_804D2648 | 0x1510 | 2088 | Byte backing for JPEG encoder JpegWork/jump environment |
| hsd_804D2E70 | 0x1D38 | 2084 | Byte array; specific role deferred |

Consumer CardContext spans the first three adjacent symbols through casts from hsd_804D1138. This describes the existing target layout, not portable C object-bounds validation. The JPEG header exposes only __jmp_buf, while encoder code uses the larger JpegWork union including coefficient and prior-DC fields. The owned comment says decoder; inspected code encodes JPEG components.

## Small State and Lifetime

Eight s32 objects run from hsd_804D7980 through hsd_804D799C. The first two are volatile and track command positions in card consumers. Queue cursors hsd_804D7990/94 advance modulo 32. Reset code clears those cursors and the queue, clears both command cursors, writes hsd_804D799C=2, clears the first word of each command row and clears hsd_804D7988. Initial NOBITS zero state therefore differs from explicit subsystem reset. Detailed roles outside the inspected consumer ranges remain with the card TU review.

## Addressing and Provenance

The source comment documents separate-TU placement for extern-reference matching. Existing card object contains 22 named relocations to hsd_804D1138, eight to hsd_804D1148 and four to hsd_804D2348; existing JPEG object has twelve to hsd_804D2648. This verifies current named external addressing. No compile, matching experiment or alternate merged TU was performed. The single inherited compiler-addressing link is retained with this qualification.

Compiled companion SHA256 `d11fb2e0b0328dfa0d9af2d8f97ab938ffac9c44d3ba8561225bcbc7db01e856`. Canonical/rendered lines 1-26 reached EOF with zero errors/substitutions. Immutable page and read receipt are under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_4D11`. proposal.json carries pinned canonical citations; coverage.json accounts for every fact and foreign read; link-dispositions.json preserves the exact outgoing record.
