# `lbarchive` Functionality

Review status: complete local TU research, pending independent proposal review and application. Revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files and all 36 subjects were reviewed. Start UTC `2026-09-08T14:33:02.661Z`. Completion UTC appears in `summary.json`.

## Purpose

This TU loads DAT resource images, binds named public roots into caller-owned pointers, and releases heap-backed archives. Three wrappers first try the DVD preload cache. A separate relocator maps a serialized image and applies an explicit additive relocation base. Header declarations match all ten current function targets.

## Entry Points

| Canonical Function | Inputs and Result | Behavior |
|---|---|---|
| `lbArchive_InitializeDAT` | Descriptor, mutable image, byte length; void | Parses and enumerates external names for NULL binding. Parse failure reports and asserts. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L17-L36` |
| `lbArchive_LoadSections` | Existing archive, alternating destination/name arguments terminated by a NULL destination; void | Looks up each public name, writes its result and reports missing names without stopping later requests. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L41-L56` |
| `lbArchive_LoadArchive` | Resource name; archive pointer | Allocates rounded image storage and descriptor on heap 0, loads bytes, initializes DAT and returns the descriptor. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L58-L74` |
| `lbArchive_LoadSymbols` | Resource name plus public-root requests; archive pointer | Direct load followed by fatal symbol binding. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L76-L90` `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L107-L125` |
| `lbArchive_80016DBC` | Resource name plus public-root requests; archive pointer | Direct load followed by nonfatal symbol binding. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L92-L105` `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L127-L145` |
| `lbArchive_80016EFC` | Archive pointer; void | Asserts non-NULL and DONT_FREE, frees data minus 0x20 and then the descriptor through heap 0. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L147-L153` |
| `lbArchive_80016F80` | Optional archive output and resource name; Boolean | Reuses a preloaded archive or falls back to direct loading. True means preload reuse. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L155-L179` |
| `lbArchive_80017040` | Optional archive output, resource name and root requests; Boolean | Preload-aware acquisition followed by fatal binding. True means preload reuse. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L181-L220` |
| `lbArchive_800171CC` | Same shape as 80017040; Boolean | Preload-aware acquisition followed by nonfatal binding. True means preload reuse. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L222-L261` |
| `lbArchiveRelocate` | Output descriptor, mutable image, supplied size and additive base; int | Returns -1 for NULL descriptor or header-size mismatch. Maps sections, adds base to relocation words, returns 0. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L263-L320` |

The internal helpers are part of source coverage. `lbArchive_LoadArchive_inline` holds the allocation/load sequence. `lbArchive_vLoadSectionsFatal` and `lbArchive_vLoadSections` consume an existing va_list with the two missing-symbol policies. `Locate` applies the explicit base. Include directives and MUST_MATCH pragma boundaries were read on the first source page.

## Data and Control Flow

The backing allocation capacity rounds file size upward to 32 bytes; the loader supplies the byte length passed to parsing. The descriptor is a separate allocation. It keeps pointers into that mutable image, so keeping only the descriptor is not enough to preserve its data. Source `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L58-L68`, with the blocking file-loader path at `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L13-L41` and `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbfile.c#L109-L149`.

Each variadic request begins with an output-pointer destination and then its symbol name. Later destinations and names alternate; a NULL destination terminates the sequence. The wrapper signature may spell the first destination `void*`, while its helper consumes it as `void**`. Destinations are cleared before lookup. Nonfatal applies only to missing public names, not file or parse failures. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L41-L56` `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L76-L105`.

The preload wrappers return provenance separately from archive and payload outputs. A NULL archive-output pointer skips only the final pointer store, not acquisition or binding. The underlying lookup can assert when debug preload enforcement is active and the resource is absent: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbdvd.c#L462-L471`. This means the apparent fallback branch is not a universal recovery guarantee.

External NULL binding depends on the foreign archive implementation. Its lookup picks the first matching name, then follows saved link offsets while overwriting reachable in-range slots. The broad inherited assertion that every encoded external import is sanitized is narrowed to well-formed archives with unique names and valid chains. `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.c#L87-L122`.

## Relocation and Lifetime Invariants

Explicit relocation clears the descriptor before validating its copied size. Failure after that point leaves a partially initialized descriptor. Successful mapping leaves absent sections NULL and `top_ptr` zero, because this routine never assigns it after memset. Unlike HSD_ArchiveParse, it adds caller base_addr rather than the data pointer at each relocation site. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L263-L319` and `code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/archive.c#L7-L67`.

Neither a successful return nor header-size equality proves that all section and relocation offsets are valid. There is no full bounds validator, no NULL src guard, and no external binding in this explicit relocation path. Calling it twice over the same backing image adds the base twice. These are source-level constraints, not a request to change matching-sensitive code.

Release requires heap-compatible storage as well as the checked flag. The routine does not consult or remove preload cache entries, and it does not clear aliases held by callers. DONT_FREE is a flag consumed by this API, not proof of exclusive caller ownership. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbarchive.c#L147-L153`.

## Game Consumers and Shared Types

The HUD initializer obtains IfAll through 80016F80, resolves ScInfDmg_scene_data, then constructs camera state from the result. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/ifall.c#L196-L218`. Stage acquisition uses 800171CC for map_head and uses the preload Boolean to select its particle-bank initialization variant. `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdatfiles.c#L35-L79`.

HSD_Archive layouts, flag definitions, DVD cache state, heap internals and payload types are foreign-family knowledge. They were read only as dependency evidence. No shared-type claim, foreign subject mutation, cross-TU link, or source rename is proposed.

## Data Sections and Rendering

Both inspected object files contain the same diagnostic strings in .data and the labels 0 and archive in .sdata. Their .sdata sizes are 16 and 12 bytes because the observed trailing padding differs. `compiled-artifacts.json` records exact paths, bytes and SHA-256 hashes. Source establishes how the literals are used; the object observations establish only the inspected section contents. No rebuild, freshness claim or binary parity claim is made.

Both canonical source pages and their rendered equivalents were read through EOF. The C renderer returns status ok with 15 parser errors, including variadic parse_uncertain entries. The header returns status ok with zero parser errors and several shadowed_binding declaration entries. Those are retained rendering exceptions, not evidence that the functions were skipped. Coverage and immutable page links are recorded in `coverage.json`.

## TU Lead Verification

Complete canonical and rendered source reviewed. Checked fatal/nonfatal output-slot iteration, preload assertion qualification, heap release ordering, relocation bias and unset top_ptr. C parse errors 15; all text available. See [lead verification](lead-verification.json). Independent review and KB application remain pending. Canonical and rendered snapshots are under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbarchive/pages/`.

## Current Application Status

Root completed reviewed live KB promotion for 87 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbarchive/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbarchive/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/3a727a0d1ecc682d5142d4fbddfe1795f59c134262b588fbd090fef1bb97e60c/2026-09-08T14-44-05.119Z-e95c1c0f-b5cd-4525-8d58-ed31d067e3c4.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbarchive/final-render.json).
