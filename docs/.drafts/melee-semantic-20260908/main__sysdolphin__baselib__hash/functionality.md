# Callback-Driven Hash Lookup

This TU implements lookup over caller-provided chained buckets. It contains two externally declared functions and no module-owned mutable table. HashSearchEntry returns an entry; HSD_HashSearch returns its value and can separately report whether an entry matched. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hash.c#L5-L49.

## Entry and Value Search

HashSearchEntry accepts a preselected signed bucket index and reads table[idx] without its own bounds check. An empty bucket returns NULL. Both traversal branches call keycheck(hash, stored_key, requested_key); a zero result means equality despite the callback's bool return declaration. A first match returns its entry; exhausting the chain returns NULL.

If ptr is non-NULL, traversal keeps the address of each incoming link slot, starting at the bucket-head slot and then moving through next fields. On success it writes that slot address through ptr after casting it to HSD_HashEntry*. This is neither the entry address nor a predecessor-node pointer. A miss leaves ptr untouched. The helper itself does not rewrite the chain. Callback side effects are not constrained by this TU. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hash.c#L5-L33 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hash.h#L12-L26.

HSD_HashSearch invokes getidx(hash), with no key argument. It assigns the int callback result to u32 and asserts the result is below table_size. It invokes HashSearchEntry with ptr NULL. If supplied, success receives the boolean existence of an entry. A found entry with a NULL value therefore returns NULL with success equal to one; a miss returns NULL with success zero. The declared result is HSD_HashClassInfo*, but the implementation casts the opaque entry value rather than proving its dynamic type. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hash.c#L35-L49 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hash.h#L18-L35.

## Owned Header

HSD_HashEntry stores next, opaque key and opaque value. HSD_HashClass stores a class-info pointer. HSD_HashClassInfo embeds foreign HSD_ClassInfo then declares getidx and keycheck callbacks. HSD_Hash stores its hash-class wrapper, bucket pointer array and u32 table_size. These are the four owned record declarations; the embedded generic class definition is outside this ownership. There are two exported declarations and no header inline functions. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hash.h#L12-L35.

The hash(s) macro expands to (s % 0x65). Its argument lacks parentheses, so it is not a general side-effect/precedence-safe expression wrapper. Neither function invokes it. The review does not equate its modulo operation with any concrete getidx callback. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hash.h#L10-L10 and code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/hash.c#L5-L49.

## Diagnostic Sections

Existing source and split objects show .data holds the 23-byte null-terminated expression idx < hash->table_size and one linked padding byte. The .sdata allocation holds the seven-byte hash.c string and one padding byte. Code relocations map both strings to HSD_HashSearch's assertion path. The frozen-hash report records 32 matched data bytes. compiled-evidence.json contains the exact bytes, symbols, relocations and hashes. No compilation or matching ran.

## Boundaries

Hash objects, bucket storage and callback pointers must already be valid. No insertion, deletion, allocation or callback implementation is supplied here, and no GObj subtype relationship is inferred. The optional output slot can help a caller identify an incoming link, but this TU never performs unlinking. Concrete family consumers remain outside this packet.

All 51 C lines and 38 header lines were read canonically and rendered to EOF. Both views have zero parse errors and zero substitutions. The header reported shadowed_binding names with full text available. Canonical names remain unchanged; no inherited name hypotheses or new names exist.

## TU Lead Verification

Complete canonical and rendered C/header reviewed. Checked callback equality polarity, incoming-link slot output, untouched output on miss, getidx without key, unsigned range assertion, NULL-value success and unused macro. Compiled string attribution remains independently gated. See [lead verification](lead-verification.json). Independent review and KB application remain pending.

## Current Application Status

Root completed reviewed live KB promotion for 16 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hash/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hash/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/60e1ff8b1658b9622c5bbc4e23bd8d229fb4206e14ce3e3c66625735980e8117/2026-09-08T14-51-21.635Z-4c9fb7ec-ca83-4017-9c19-c23f2507da88.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__sysdolphin__baselib__hash/final-render.json).
