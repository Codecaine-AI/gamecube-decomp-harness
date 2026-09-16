# Player-slot interface semantic review

The inherited research establishes translation-unit coverage. Its supported existing names and explanations are retained; rendered substitutions remain hypotheses rather than independent evidence. The final proposal preserves the nine supported corrections in the research artifact, without adding equivalent rewrites or speculative gameplay names.

## Responsibilities

The module maintains persistent player-slot records, character-to-fighter mappings, references to up to two fighter entities, configuration fields, position and facing data, counters, flags, and embedded statistics. Most slot accessors validate the slot before accessing storage. Several entity and statistic interfaces use `transformed[]` as an indirection; swapping those entries changes logical selection rather than exchanging the underlying objects.

Ordinary fighter construction creates the primary mapped fighter, writes `player_state = 2`, and conditionally creates an extra fighter. After extra creation it preserves state 1 rather than unconditionally restoring 2. When the final state is 2 and the registered callback is non-null, it invokes that callback with the slot. The header declares the callback as `void (*)(s32 slot)`, the setter stores its argument, and reset clears the callback. These mechanical facts are established; they do not independently establish event-mode provenance or gameplay labels for states 0, 1 and 2.

The roster callback iterator traverses six live slot records. It does not capture a roster snapshot, and it reads character mapping again after invoking the callback. Entity-management routines dispatch through mapped entity references, skip null entities in specified branches, and coordinate external fighter/GObj operations. Clearing registrations and resetting records must not be confused with proving completion of externally managed object destruction.

Position and configuration interfaces distinguish persistent-field updates from setters that also forward values to existing fighters. Stored arguments may undergo byte or bitfield conversion even when assignment is direct. In particular, handicap and unk45 have unsigned-byte storage, unk4C has signed-byte storage, CPU settings have unsigned-byte storage, more_flags.b5 is one bit, and more_flags.b6 is two bits. These are source declarations, not compiled bit-position or section-layout claims.

Damage and remaining-HP interfaces select stored entries through the transformation mapping. Remaining-HP calculations clamp negative results to zero. Falls aggregation additionally depends on a string-rooted compatibility overlay; its equivalence to the separately declared mapping table is not proven by source declaration order.

Stock loss decrements only positive values. KO recording is condition-gated, saturates its selected counter, and retains distinct same-slot, conditionally same-team, and other branches. Suicide-count recording is condition-gated and saturates at 65535. Frame-count recording calls the current canonical `gm_GetFrameCount` only when the suppression condition is false and the unsigned stored count satisfies the sentinel expression. The expression selects UINT32_MAX; a permanent one-shot guarantee would additionally require that the recorded value cannot itself be the sentinel.

## Reset and external lifetimes

Core reset assigns explicit defaults rather than zeroing the entire record. The first mapped pose writes use the previous transformation entries; later mapping-dependent writes observe the restored 0/1 entries. Therefore clearing every distinct pose requires an entry invariant. The reset clears selected flags, counters, entity registrations and the callback, sets ratio/scale fields to unity, and installs the frame-count sentinel.

`Player_80036D24` performs core reset before `pl_80038F10`. The latter resets local extended fields and scans six records, removing matching references in xD64, xCAC and xD6C. The xD6C cleanup was missing from the baseline description. Other initialization wrappers invoke different external reset/bootstrap routines; comprehensive claims about every delegated subsystem remain deferred.

Common-data loading resolves the named archive symbol and publishes its first pointer entry. Demo creation variants differ visibly in descriptor b0 and conditionally create a second entity; neither explicitly clears the second registration when that branch is skipped. The archive-forwarding compatibility cast and compiled section membership remain unverified.

## Reconciliation

The nine proposed facts accurately correct omitted cleanup, obsolete canonical member/callee spellings, storage conversions, and sentinel behavior. The functionality artifact was read through its final line, including the previously missing tail. Its shard-local uncertainty statements are not treated as universal conclusions: callback invocation, callback declaration, stored suicide-counter type and construction-state assignments are visible in the combined canonical evidence.

Accepted deferrals concern compiled layout and ABI bindings, numeric-state interpretation, opaque item/mode identities, deeper external-callee effects, stale caller locations, and gameplay/UI/records provenance. Such deferrals are not findings that the corresponding gameplay claims are false. Existing supported research remains inherited without wholesale ledger repetition.

Status: synthesized; independent review and live promotion pending.
