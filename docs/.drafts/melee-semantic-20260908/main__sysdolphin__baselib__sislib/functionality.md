# SisLib Object and Resource Lifecycle

Draft at pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full owned C and both headers, 775 canonical and rendered lines, were inspected. Immutable paired snapshots are in the assigned unit state's `pages/` directory. Citations and exact fact versions are in coverage.json; existing object details are in compiled-evidence.json.

## Private Arena

HSD_SisLib_803A6048 allocates a caller-sized region, saves base and size, formats one 12-byte SisBlock header, and clears text, context and five resource pairs. It does not validate size/allocation result or release prior state. Scene preload chooses 0xC000 for staff roll/results, 0x2400 for character select and 0x4800 otherwise.

HSD_SisLib_Alloc selects an exact or smallest larger free block after four-byte request rounding. Only zero is explicitly rejected. The scan assumes a non-NULL free head. A selected head must also leave room for a new 12-byte header, so an exact-fit head panics. A non-head allocation consumes the entire block. Allocations append to the used list.

HSD_SisLib_Free searches by payload identity and ignores unknown pointers. Its sole coalescing case is a released block immediately before the current free head. Other blocks append to the tail. It neither coalesces arbitrary neighbors nor handles an empty free list by establishing a new head. Normal operation retains a head block.

## Text Construction and Destruction

HSD_SisLib_803A5ACC uses a negative context ID for a text without a rendering GObj. Nonnegative IDs select the per-font occurrence from context records and create a GX-linked text GObj whose user-data destructor is HSD_SisLib_803A5A2C. Lookup dereferences the context cursor before its NULL check. The constructor initializes position, box, visible white text, transparent background and unit scales, but leaves many active fields untouched. The font argument stores through u8 truncation.

HSD_SisLib_803A5A2C unlinks one member of the active-text list and releases nested allocation data, metadata, string buffer and object storage. Single/all/font-filtered removal routes entity-bearing texts through GObj removal and then clears entity. GObj removal can defer for the current GObj. On its immediate path the callback frees the text before the caller's entity=NULL write. No runtime test establishes whether a hazardous scheduling case occurs.

The font-filtered context pass sets last=curr even after freeing curr. Consecutive matches can therefore update a released predecessor rather than the live list. This limitation is preserved in the proposed state facts.

## Contexts and Resources

HSD_SisLib_803A611C appends a 16-byte context and returns the number of prior matching font entries. It stores font_idx as u16, class ID as u16 and process/GX fields as bytes. parent_gobj is only a presence flag; its pointer is not retained. NULL requests an owned camera, loaded from the static perspective descriptor and changed to ortho bounds 0,-480,0,640. Allocation failure leaves an appended context without a camera. The camera mask shifts a 64-bit one by unvalidated gx_link. fn_803A60EC clears the first context retaining the removed GObj, without freeing the context.

HSD_SisLib_803A62A0 loads a named archive, resolves its public SIS table and stores both into one of five slots. It stores before checking for NULL and panics on failure. No index guard, rollback or release of a replaced archive exists. Progressive scan supplies localized SdProge.usd/dat and SIS_ProgeData.

HSD_SisLib_803A6368 conditionally selects an indexed SIS pointer, resets selected active formatting/progress fields and replaces string_buffer with sixteen zero bytes. A NULL table preserves the previous sis_buffer. It does not reset every field. Progressive-scan and Stadium callers select authored message/layout entries with this operation.

## Reset and Shutdown

HSD_SisLib_803A5E70 requests text/context cleanup and rebuilds the arena while retaining font resources. It clears context and used roots directly but relies on callbacks for the text root. Safe lifecycle use requires deferred callbacks not to outlive this reset. Per-font unloading releases occupied archive pairs after filtered cleanup. Final shutdown resets, unloads all occupied pairs and frees the arena without clearing its saved pointer. Repeated shutdown is not made safe.

## Data and Header Boundaries

Existing source/split .bss is 40 bytes for paired five-pointer arrays; .sbss is 24 bytes for arena size/base and four list roots. Source .data is 212 bytes and split allocation 216, including 96 descriptor bytes, diagnostic/file-name strings and padding. Source .sdata is a one-byte empty string; split allocation is eight bytes. It does not hold arena metadata. Both .sdata2 pools contain four f32 values, 0,1,-480,640; source ELF includes WRITE while split does not.

The public header defines SIS, TextKerning, SisBlock, HSD_Text, a partly understood allocation record and the 16-byte context structure. Its guessed field comments and suggested struct merge remain hypotheses. sislib.static.h supplies only the canonical HSD_SisLib_BytePtr identity conversion. The atlas is declared through a foreign font header and defined in sislib_font.c; no atlas artwork was inspected here.

Forty-nine manifest parameter locators refer to declarations whose bodies moved to hsd_3A64/hsd_3A76. They have no inherited facts and remain identity followups. HSD_SisLib_CreateText collides between this constructor and the hsd_3A64 convenience wrapper, so its inherited name receives no write or clear. Eleven other names remain hypotheses pending independent review.
