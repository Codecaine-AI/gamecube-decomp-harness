# Item Contact and Grab Review

Reviewed all 888 assigned source lines, c747–1634, in canonical and separate rendered views at `c302741689bd67c361cd7faadb221df3193992c3`. All 16 targets, 54 parameter entities and 96 existing facts are accounted for. This is complete local source review with 27 inherited external claims still unresolved.

## Names and Behavior

Two inherited aliases collide inside this TU. Keep ftColl_ProcessItemHit for the collision resolver 80077C60 and ftColl_RecordFighterHit for the post-hit wrapper 8007891C. Rename the attribution wrappers descriptively to `ftColl_RecordItemHitAttribution` at 800787B4 and `ftColl_RecordFighterHitAttribution` at 80078710. These remain hypotheses; canonical source symbols are unchanged. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L1448-L1454 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L1472-L1494.

| Canonical | Alias decision | Inputs, Writes and Control Flow |
|---|---|---|
| ftColl_80077464 | ftColl_ReflectItemHit; retain hypothesis | Item/hit/fighter inputs. Registers mode7, converts damage, branches on maxDamage, records overload or reflector metadata and multipliers. Item flag b1 is latched only, b2 copied. Direction uses relative X and item X velocity. |
| ftColl_80077688 | ftColl_ItemShieldHit; retain hypothesis | Item/hit/fighter plus response vector/scalar. Registers mode1/2, compares converted damage against xC34_damageDealt before writing xC50 and response fields. Accumulates max(dmg+shield_damage,0), assigns owner attribution and strongest fighter-side contact, then spawns 0x41C. |
| ftColl_80077970 | ftColl_ResolveItemHitboxClank; retain hypothesis | Item and fighter hit capsules. Averages contact positions; independently tests each integer damage against the other plus common tolerance and invokes inlineItemA0/A1. Both may run and spawn feedback. |
| ftColl_80077C60 | ftColl_ProcessItemHit; retain hypothesis | Item, contacting capsule, fighter and secondary capsule. Special type4 performs conditional Star/Kinoko/DKinoko handling and returns false. Other paths compute scaled damage, use low-distance secondary logging or normal damage/reserve/primary logging, and return according to processing branch rather than applied damage. |
| ftColl_80078384 | ftColl_PlayHitSFX; retain hypothesis | Fighter/hurt/hit inputs. Suppression fields or non-enabled hurt state select severity-indexed fighter audio. Otherwise stores collision-audio return into x215C for sound kind13/severity2 or x2160 otherwise, with player-derived selectors. |
| ftColl_80078488 | ftColl_PlayPhantomHitSFX; retain hypothesis | Fighter input only. Calls ft_PlaySFX with 85,0x7F,0x40 unconditionally. |
| ftColl_800784B4 | ftColl_PlayClankSFX; retain hypothesis | Fighter and two hit capsules. Both Slash elements select ftColl_803C0C4C[HSD_Randi(3)]; otherwise fixed0x6A. Always one ft_PlaySFX call. |
| ftColl_80078538 | ftColl_SpawnNormalHitEffects; retain hypothesis | Fighter GObj, contact position, severity, damage and computed knockback as established by caller. Always primary effect; below threshold passes address of damage to Ef_Id_Unk1000, otherwise uses0x3F3. Positive severity permits variant0 random0x3EF; variant1 only consumes RNG. |
| ftColl_8007861C | ftColl_RecordHitAttribution; retain hypothesis | Optional attacker, victim, source class/kind, event data, attack instance, optional context and preservation flag. Writes victim attribution, preserves previous player when null source and requested, tests context word2 for grounded and calls pl_80038144 with previous source player. |
| ftColl_80078710 | Correct to ftColl_RecordFighterHitAttribution | Attacker/victim and opaque context. Packages fighter kind/event metadata as class1 and forwards to shared attribution. No local guard. |
| ftColl_80078754 | ftColl_RegisterGrabHit; unresolved grab-specific caller role | Two fighter GObjs and bool. Packages class1 source metadata, casts bool to context pointer, calls shared recorder, then overwrites victim source player6 and secondary source-1. Only zero context is plainly null; validity of nonzero pointer cast is not established. |
| ftColl_800787B4 | Correct to ftColl_RecordItemHitAttribution | Item GObj/victim and integer context. BombHei adds pl_80041B08 call. Then class2 attribution uses recognized fighter owner or null source with preservation selected by pl_8003D60C. Third argument is pointer-cast into shared context slot. |
| ftColl_800788D4 | ftColl_RecordUnattributedHit; retain hypothesis | Victim GObj only. Sends null source, class0, kind-10 and zero metadata/context/preservation to shared recorder. |
| ftColl_8007891C | ftColl_RecordFighterHit; retain hypothesis | Attacker/victim and damage. Calls canonical stale-move helper, ftColl_80076444, then pl_8003EB30 with player IDs/discriminators, damage and classification. Does not itself write live damage. |
| ftColl_80078998 | ftColl_ItemHitFighter; retain hypothesis | Item/victim GObjs and damage. Calls canonical item stale helper and ftColl_8007646C. If owner passes ftLib_80086960, calls pl_8003EB30 with owner/victim identity and item classification. |
| ftColl_80078A2C | ftColl_FindGrabVictim; retain hypothesis | Grabber GObj. Clears victim and resets best distance to finite F32_MAX. Scans filtered fighters, four non-disabled Catch capsules and grabbable hurt capsules. First overlap ends per-candidate search even if final helper rejects. Strict absolute-X minimum chooses victim; ties retain earlier list order. |

## Material Details

Shield response compares damage against `item->xC34_damageDealt` while storing its result in `xC50`. It therefore does not independently retain a maximum over previous xC50 shield responses. Zero damage stays zero; nonzero damage truncating to zero becomes one. The response branch can replace geometry without exceeding its previous shield value. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L862-L935.

The low-distance item path can return true after contact registration and sound even when eligibility prevents damage logging. Its initial guards require empty primary log, no frame guard and no matching secondary victim history. Actual secondary-log writes have additional fighter/secondary-capsule guards. The ordinary path also returns true when damage was not logged, spawning fallback feedback. A caller must not read true as damage applied. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L1160-L1225 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L1271-L1338.

The ordinary damage-reserve path computes integer damage before reducing the reserve. If reserve is exhausted, the percent addition uses the remaining excess while the earlier integer value can still update x183C_applied. Log fields carry raw capsule damage/raw item damage rather than all being replaced by scaled excess. This distinction is preserved in source, not normalized by the review.

Grab selection uses absolute X separation, not Euclidean distance. It resets victim_gobj and unk_grab_val only; x1A5C and x221B_b5 remain unchanged on a miss. The first overlap moves to the next candidate regardless of the final helper's result. Only a strictly smaller distance replaces the prior selection. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L1550-L1563 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L1575-L1632.

## Inline Helpers and Parameters

inlineItemA0 converts damage, iterates active same-group fighter hitboxes, clears ftColl_804D6560 entries when lbColl_80008688 succeeds, updates the fighter's maximum clash damage and optional grounded rebound fields, then spawns midpoint feedback. inlineItemA1 converts damage, chooses item event mode3/4, updates item xC48/defender/direction when stronger and spawns feedback. Their bodies are c976–1080.

getUnkVal returns the supplied base plus player_id*2+x221F_b4. HitCapsuleGetPtr returns &fp->x914[i]. ftGrabDist implements the strict horizontal reduction and selected-output writes. These five source-only inline definitions have no manifest target identities; preserve canonical names and record coverage without creating entities.

All 54 parameter entity subjects were queried and contain no facts. Function-level source signatures and roles are reviewed in the table. No register-derived semantic names or shared Item/Fighter/HitCapsule type claims are written. The TU lead owns headers, dox, source entity and other definitions.

## Dispositions and Validation

`fact-dispositions.json` records every ID and timestamp version: 58 retain, 11 supersede and 27 unresolved. Only the 11 substantive corrections are proposed. Retained facts are not rewritten for citation refresh.

External assertions about callbacks, owner transfer, reflector breaking, player-event duplicate suppression, stale/combo internals, grab-confirmation callers and wall/team helpers remain family followups. Rendered aliases were not used to prove those behaviors. The inherited grab-registration alias is explicitly unresolved until caller evidence supports it.

Source SHA-256 is `f376f14500c1e018fd022b45563ac8163d0aba043f1817f8e1b2eeba651f16e7`. All assigned and supplemental renders succeeded with zero parse errors; duplicate-name statuses were recorded and addressed by the two proposed aliases. coverage.json links each immutable page and records hashes.

Dry-run accepted 11 writes, rejected zero and skipped zero. Proposal SHA-256 is `1dbcb0374e2586cbde7fee6a5104af359f6f810503cbee5fabbe6cb05479d117`. No KB application or source changes occurred. Independent review remains pending.

UTC review interval: 2026-09-08T14:44:37Z to 2026-09-08T14:48:48Z, 251 seconds.
