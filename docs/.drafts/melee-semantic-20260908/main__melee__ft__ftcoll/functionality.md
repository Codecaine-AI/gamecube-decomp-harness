# Fighter Collision Functionality

Pinned source revision `c302741689bd67c361cd7faadb221df3193992c3`. Draft semantic review; canonical source unchanged. Root independent fact review and promotion are complete.

## Behavior

The TU maintains fighter hit, hurt, shield, reflection and absorption regions; records bounded damage contacts; dispatches fighter and item collision responses; resolves damage logs; and handles registered environmental devices. Two logs are reset through ftColl_800765E0. Their producers append only within array capacity and assert on overflow. Hit-capsule updates initialize coincident endpoints and subsequently advance previous/current positions. Disabled capsules do not update. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L186-L277 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3028-L3135.

Collision selection is ordered. Reciprocal clashes precede ordinary shields and hurt capsules; successful earlier item responses continue to the next item hitbox. The temporary bytes in ftColl_804D6560 represent eligible attacks, not cached geometric overlaps. The fighter and item passes stop at the first hurt-capsule overlap even when the downstream response rejects damage. Neither Boolean response nor geometric overlap alone establishes applied damage. See [collision pipeline](collision_pipeline/findings.md) and [item/grab](item_grab/findings.md).

Knockback arbitration starts at -1 and updates on a strict greater-than comparison. Valid ties keep the earliest entry, zero can win, and empty logs return untouched. Candidate effects can execute before arbitration for losing entries; selected metadata is published afterward. Unsupported tags, all candidates below the sentinel, and descriptor pointer compatibility remain unresolved input-domain questions. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2575-L2630, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2807-L2828 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2907-L2967.

The grab scans choose minimum absolute horizontal distance with strict tie handling. Their miss paths clear selected target pointers but leave some auxiliary state unchanged. The item shield response threshold is xC34_damageDealt while its result is written to xC50; it is not a maximum over prior shield xC50 responses. Damage conversion generally truncates nonzero subunit damage to the fallback integer 1. Reserve exhaustion distinguishes exactly zero from negative overflow. Detailed source roles and exceptional paths are recorded in the leaf findings.

## State and naming

Bulk hurt-state writes invalidate positions and synchronize the aggregate flag; a bone-specific update modifies only the first matching capsule and does not clear that aggregate flag on enable. Constructors replace shield/reflect/absorb geometry without resetting their position-cache flags. Hurt initialization checks and populates the hurt array before checking the dynamics-array limit. The dynamics record contains a vector plus a scalar; neither is a second vector. See [capsule lifecycle](capsule_lifecycle/findings.md).

Five distinct alias repairs separate fighter/item attribution wrappers, the two ratio variants of knockback calculation, and the fighter-wide hit-status query from a canonical local inline. Every existing alias and proposed replacement appears in [naming](naming.md). Rendered names are hypotheses and are never behavioral evidence. Source-only helpers remain documented without invented manifest entities.

## Ownership and documentation

All three owned files are reviewed in canonical and separate rendered form. The header and dox are included, including historical dox signature disagreements for B868, AC68, B128 and HurtboxInit. Executable code takes precedence; canonical documentation was not edited. Shared Fighter, Item, HitCapsule and common-data definitions are foreign evidence and remain assigned to their own owners.

The source-entity account is retained with explicit valid-input qualifications. Every target, parameter entity and inherited fact has a coverage or disposition entry. Parameter inventories with no facts are explicitly reviewed; no semantic register identities are invented. Read receipts, immutable hashes and exact UTC role intervals are in coverage.json and assignment.json.

Five data targets require object/report corroboration recorded by collision_records. Full findings: [contact records](collision_records/findings.md), [item/grab](item_grab/findings.md), [collision pipeline](collision_pipeline/findings.md), [capsule lifecycle](capsule_lifecycle/findings.md).

## Limits

External gameplay-predicate meanings, opaque callbacks, statistics, timer callers and shared-type invariants are retained only where independently established; remaining claims are unresolved in fact-dispositions.json. A reviewed target may have both supported local mechanics and unresolved external claims. The leaf narrative provides context; the ID/version ledger is the authoritative acceptance disposition.

## Reviewed final render

Root promoted 38 reviewed fact operations. [Final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftcoll/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftcoll/staged-completion.json), and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/7e66761ea1e0a04c8d7baad25412b1d7914e8f7f8f8c53d43831c670d5623fd6/2026-09-08T15-03-14.628Z-0fe857d7-aa50-45f9-aa8e-e8ff9f1918a0.receipt.json). Final-render SHA256: `e5576981240fbd62d139bc6de939b7bac95b453fa7e9a74e65a82ef834651904`. Canonical source unchanged.
