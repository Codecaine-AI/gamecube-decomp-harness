# lb_01F8 Functionality

Three entry points share a source-local 0xA0 state object with three texture objects and plane pointers, u16 dimensions, HSD image/SObj descriptors, an SObj pointer and loaded-file metadata. Movieplayer is declared extern but never used.

| Canonical | Behavior |
|---|---|
| lbMthp8001F890 | Builds shared HSD image/SObj descriptors using stored u16 dimensions, NULL image pointer, GX_TF_RGBA8, mipmap zero, zero LOD and NULL TLUT. Calls HSD_SObjLib_803A477C with gobj and descriptor, stores the returned pointer, sets x40 bit 0x10 and returns it. No NULL-result check is present. |
| lbMthp8001F928 | Initializes and binds three retained image planes as GX textures. Texture unit zero uses full stored dimensions; units one and two use each u16 dimension shifted right by one. All use numeric format 1, zero wrap/mipmap arguments and zero LOD arguments. Then forwards gobj and arg1 to HSD_SObjLib_803A49E0. |
| lbMthp8001FAA0 | Truncates width/height into u16 singleton fields, initializes THP, loads filename into retained file pointer/size, allocates one width*height plane and two product>>2 planes and invalidates their ranges. Allocates a 0xC context, prepares a zeroed header with u16 dimensions, calls THP decoder setup/work-size/decode functions and converts the result into retained planes. Stored width 0x280 selects THPDec_80331340; other widths call THPDec_803313D0 with that stored width. Frees context and decode_buf only. |

## Invariants and Limits

Dimensions truncate to u16. Multiplication promotes them to signed int on the target ABI, so sufficiently large dimensions can overflow. Plane allocation uses product>>2; texture dimensions use width>>1 and height>>1 independently. No load, allocation or decode result is checked. Construction dereferences its returned SObj without a NULL check.

The decoder frees context and work buffer only. Input and plane buffers remain in singleton fields; repeated calls overwrite those references without freeing the previous buffers in this TU. External cleanup and input constraints need caller review.

## Naming and Coverage

Retain lbMthp_CreateSObj and lbMthp_DrawDecodedFrame as hypotheses. lbMthp8001FAA0 has no inherited name; no new name is proposed. Complete review covers one file and all118 displayed lines in canonical and rendered form, five targets, twelve subjects and all inherited facts. There is no assigned header.

The renderer reports three parse errors and zero substitutions. Section placement, pixel-channel conversion, scene mapping and lifecycle outside this unit remain family questions.

Reviewer correction: two inherited aliases collide with distinct lbmthp functions, and two inherited Y/chroma claims lack decoder evidence. All four remain unresolved. Final dispositions: {'unresolved': 15, 'retain': 8, 'supersede': 6}. Six-write proposal unchanged.
