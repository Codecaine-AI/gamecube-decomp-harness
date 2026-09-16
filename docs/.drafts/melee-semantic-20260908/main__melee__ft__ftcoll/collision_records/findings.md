# Collision Records Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Owned C1-746 fully read in canonical and rendered forms. Twenty targets (15 functions, five sections), 39 parameter entities, 107 existing facts. Header and source entity remain sibling-owned.

## Fact decisions

{'retain': 94, 'supersede': 10, 'unresolved': 3}; 10 proposed writes. Every fact has ID, updated_at version, decision and precise evidence in fact-dispositions.json. Correct facts are retained without citation-only rewrites.

### .data: inferred_type

Writable initialized storage containing two int[3] arrays {141,142,143} and {107,108,109}, the 17-entry hit_effect_ids table, and compiler-local diagnostic/file strings. The existing object has 276 raw bytes; the report attributes 280 bytes including alignment. Its symbol inventory does not show switch dispatch-table objects.

The existing object contradicts the prior attribution of local data to dense-switch dispatch tables; object-symbols.txt and object-data-contents.txt corroborate the source arrays and diagnostic strings.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L726-L745, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L67-L85, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2600-L2645, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2708-L2750

### .sbss: state_behavior

ftColl_800765E0 clears both damage-log indices. Successful appends increment the relevant index while below 20; overflow assertions leave it unchanged. The ordinary branch of ftColl_80076ED8 also clears the secondary index during processing, so growth is not monotonic across an entire pass. Matching enabled capsules have scratch bytes cleared after successful new-victim registration when the clear flag is set.

The ordinary-contact assignment at line 645 contradicts pass-wide monotonic growth.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L67-L85, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L187-L191, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L240-L292, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L640-L650

### .sdata: inferred_type

Initialized small-data storage whose existing object contains the two-byte compiler-local string @368, bytes 30 00 ("0" plus NUL). The frozen report attributes eight bytes, including alignment. Zero-expression assertions occur in this source; the exact macro-to-symbol association is not independently established here.

Object symbols and raw contents identify the formerly opaque payload without inventing a gameplay role.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L233-L236, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L252-L256

### ftColl_800765E0: inferred_type

Parameterless void-returning reset helper: void ftColl_800765E0(void). It returns normally after setting the two private damage-log indices to zero.

Void return type does not mean non-returning; source returns normally.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L187-L191, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L2621-L2639

### ftColl_80076528: purpose

Updates the combo-triggered displacement timer each frame. While the timer is active, a grounded fighter with no held victim receives displacement along the floor tangent, signed by facing direction and the selected common-data value.

The body establishes the vector formula but this review does not establish the signs of runtime common-data values.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L145-L171

### ftColl_80076528: game_mapping

Implements temporary combo-triggered floor-tangent displacement after repeated hits with the same attack. Airborne state or holding a victim suppresses movement while the timer continues to decrease.

Avoid asserting backward direction independently of common-data signs.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L145-L171

### ftColl_80076528: state_behavior

A zero x2092 timer has no effect. Otherwise it decrements once; movement requires no held victim and grounded state. Select x4D0 when x2090 < x4C8, otherwise x4D4. With selected value m, position changes by dx=-floor.normal.y*facing_dir*m and dy=floor.normal.x*facing_dir*m.

Source chooses fields; their relative sizes are not established.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L145-L171

### ftColl_8007699C: game_mapping

Implements fighter-attack clanking and damage priority using two strict comparisons against the common tolerance. Each qualifying side receives collision feedback; grounded state gates rebound initialization inside each response, rather than gating the whole function.

The function has no global grounded guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L317-L442

### ftColl_80076ED8: data_flow

Computes victim-scaled damage and separates phantom and ordinary paths. An eligible phantom halves damage, substitutes 1 only when that half truncates to zero and the original scaled amount is nonzero, and registers secondary victim history. Additional victim guards gate tip-log insertion and reduced-damage state, while accepted phantom feedback still occurs. Ordinary handling clears the secondary log and registers the victim; guarded reserve acceptance permits a primary entry whose damage field stores raw hit0->damage, followed by bookkeeping. If no entry is accepted, fallback feedback occurs.

Distinguish branch acceptance from log insertion, and record the raw primary-log field rather than implying overflow damage is stored there.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L513-L724

### ftColl_80076ED8: state_behavior

Phantom acceptance requires an empty primary log, zero victim damage frames and no matching secondary victim history. Damage is halved; a nonzero original whose half truncates to zero becomes 1. Further victim-state and hit1-disabled guards control reduced-damage state and tip-log insertion. The ordinary path first clears the secondary log, registers the victim and updates attacker maxima. Victim guards then control absorption, primary-log insertion and post-hit work. It returns true even when these guards prevent logging; rejected phantom candidates return false.

The old wording implied a universal clamp and unconditional logging after branch acceptance.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L513-L724

## Coverage and data flow

Combo registration tracks only one victim and repeat identity; self-hits and different tracked victims are ignored. Fighter and fighter-owned item wrappers share the state machine. Unsigned continuation timers avoid zero underflow; victim cleanup walks all listed fighters. Combo displacement is floor-tangent movement with common-data magnitude and facing sign.

Damage scaling composes held-victim context, DamageIce, and fighter behavior factors. Reserve absorption only breaks below zero, so exact exhaustion remains active. The integral maximum uses the original candidate snapshot even when accepted float damage becomes reserve overflow. Primary and phantom logs each hold 20 entries and use logical counter resets.

Same-group hitboxes share victim records. CopyHitCapsule copies victim tables and cursors only. Clear resets victim pointers and cursors, not every auxiliary victim-entry byte. Existing victim registration can refresh its auxiliary field even though it returns false. Clank responses use strict damage comparisons and may update both sides; only rebound initialization is grounded. Shield handling records maxima and chooses ordinary accumulation or guarded alternate feedback.

Phantom branch acceptance is distinct from successful log insertion. Ordinary handling discards the secondary log before later victim guards and logs raw capsule damage after reserve acceptance. Resolver feedback can occur for each candidate; the strict greatest-knockback candidate supplies DmgResult and winning attribution.

## Existing object evidence

No build or report generation ran. Report SHA256 matches the frozen manifest. Existing object SHA256: 6eca80587d0b07b7630be2cf7796f66dbd5c33be31a69fb4807ebda83d67d407. Report section contributions are .bss=1600, .data=280, .sbss=16, .sdata=8, .sdata2=64. Raw object .data is 276 bytes and .sdata is 2 bytes; alignment explains the contribution difference.

The two 800-byte logs occupy .bss offsets 0 and 0x320. The two four-byte indices occupy .sbss offsets 0 and 4, followed by the eight-byte scratch array at 8. .data contains the two three-int arrays, hit_effect_ids and diagnostics/file strings, including later-source assertions. .sdata contains 30 00. .sdata2 bytes match the synthetic ordering list, including aligned conversion doubles and padding. See object-symbols.txt, object-data-contents.txt and object-metadata.json.

## Naming and limitations

All 15 existing function naming hypotheses retained; canonical symbols remain authoritative. Parameter roles are exhaustively recorded by inventory locator in coverage.json without speculative ABI recovery. Source-only inline helpers are inventoried there.

Three GuardReflect/power-shield facts remain unresolved because the dependency is outside the frozen manifest. Shared Fighter types remain family-owned; its rendered page reports 30 parse errors while the requested unsigned fields are readable. Common-data values need family review before asserting displacement direction or relative magnitude. Exact assertion macro-to-string identity remains unassigned.

Dry-run valid: 10 writes, zero rejected or skipped. Completion UTC `2026-09-08T14:52:24.393560+00:00`; elapsed 469 seconds from 14:44:35Z. Shared KB unchanged.
