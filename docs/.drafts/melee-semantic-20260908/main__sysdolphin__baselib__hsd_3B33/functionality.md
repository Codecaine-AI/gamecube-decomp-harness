# JPEG Output Writers

This TU supplies two writers for a shared JPEG destination stream. It owns no destination storage or recovery context. Its paired header declares both functions and defines no types or inline helpers. Canonical names remain unchanged.

hsd_803B3344 loads the cursor and compares its u32 address with base plus capacity. On success it advances the global cursor first, stores the byte at the old address, and returns. On false comparison it calls longjmp with the shared context and true. Under valid non-wrapping buffer state this accepts the last available destination byte. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B33.c#L8-L20.

hsd_803B3398 uses the exact strict comparison cursor < base + capacity - size, copies size bytes with memcpy, then advances the global cursor through a u32 lvalue. It does not increment before copying. A false guard calls longjmp without local copy/cursor writes. Under valid non-wrapping arithmetic an exact-fit block is rejected. A zero-size request passes only when cursor is strictly below the end. Address addition and subtraction are not independently checked for wraparound, and no universal bounds-safety claim is justified for arbitrary pointer/capacity inputs. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B33.c#L22-L32.

## Encoder Context

The bounded encoder caller initializes cursor and base from output and capacity from output_capacity. Its HSD_804D2648_BUF macro aliases the same jump context used by these functions; a nonzero setjmp result returns zero. It calls the byte writer for JPEG marker and length bytes and the block writer for comments plus DC/AC luminance/chrominance Huffman payloads. These calls establish the serialization purpose without transferring ownership of the encoder globals or JPEG types. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L11-L11 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hsd_3B34.c#L1024-L1116.

## Exception Metadata

The existing source and split objects both have extab length 16 and extabindex length 24. extab has two opaque eight-byte records. extabindex has two twelve-byte entries with function address, extent length and record address. Four R_PPC_ADDR32 relocations pair hsd_803B3344 with record offset zero and length 0x54, and hsd_803B3398 with record offset eight and length 0x70.

Both metadata sections have ELF flag SHF_ALLOC and no SHF_WRITE in the inspected objects. The inherited claim that extab is a writable ELF contribution is replaced. Their records are compiler exception metadata, but their exact unwind decoding and linked memory permissions were not inspected. The metadata is distinct from the writers' explicit longjmp failure mechanism. compiled-evidence.json records all bytes, symbols, flags, relocations and hashes. The existing report hash matches the immutable manifest; no compilation or matching ran.

## Review Boundaries

All 34 C lines and ten header lines were read canonically and rendered through EOF. Both views have zero parser errors and substitutions. No inferred-name facts existed and no new names are proposed. The helpers require valid shared state and a live saved jump context; they do not return an error status. Detailed exception-runtime semantics remain unresolved, with existing metadata facts narrowed to directly observed layout and associations rather than cleared.

## TU Lead Verification

Complete canonical and rendered C/header reviewed and every proposed slot scanned. Checked byte cursor advance before store versus block advance after memcpy, strict exact-fit rejection, non-wrapping arithmetic limits and nonlocal failure. Foreign encoder/jump context and exception metadata associations remain independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

Reviewed live application: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/0b5446c81a4078680c4c3775dbbb17b504dba466625bb0de3d670fa1c70d73cb/2026-09-08T15-07-34.482Z-6eb1b833-78a6-460e-8061-958da4c4828e.receipt.json); [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hsd_3B33/final-render.json).
