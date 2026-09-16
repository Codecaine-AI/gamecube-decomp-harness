# Naming Review

Canonical lbGx_8001E2F8 is retained. The inherited hypothesis lbGx_DrawDebugRect is retained with stronger caller evidence, pending independent review. No new alias or canonical rename is proposed.

| Manifest Subject | Canonical Parameter | Meaning |
|---|---|---|
| #r3 | arg0, Vec4* | Center offsets x/y and half-extents z/w |
| #r4 | arg1, Vec3* | Origin x/y; z ignored |
| #r5 | arg2, U8Vec4* | Four repeated direct color bytes |
| #r6 | arg3, u32 | Drawing gate, exactly 2 |
| #r7 | argf1, float | Horizontal offset multiplier, caller facing |

These are manifest parameter identities, not an assertion that the floating-point argument uses physical register r7. No parameter facts existed. The owned header contains no vector definitions; no foreign type claim is proposed. The .sdata2 target receives no inferred name.
