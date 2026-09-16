# Fighter Action Hitbox Review

Local source review covers all 342 assigned lines, c232–573, at `c302741689bd67c361cd7faadb221df3193992c3`. All 26 targets, 52 parameter entities and 152 existing facts are accounted for. Canonical and separate rendered views were read for both assigned pages. This is a complete local review with 27 existing facts awaiting external semantic verification.

## Corrections

The inherited names for ftAction_80071784 and ftAction_800717C8 incorrectly describe throw flags. The canonical call chain disables an indexed hit capsule. Proposed names are `ftAction_DisableHitbox` and `ftAction_SkipDisableHitbox`. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L430-L439, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3112-L3115 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcollision.c#L1786-L1789.

The GFX handler reads positions current through current+4 and advances to current+5. The old six-word description counted its final advance as another payload read. Hitbox creation also advances five positions, but reads a create_hitbox_5 view at its final cursor; the relation between that view and packed stride needs shared command-layout review. These are separate observations, not proof that both encodings contain six independent words. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L252-L273 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L322-L354.

The damage operand is packed `u32 value : 23`, not a floating-point payload. The scale literal is exactly `0.003906f`, not exact 1/256. Air selector 1 assigns jumpsUsed=1, so it does not preserve previous remaining-jump state. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L652-L656 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L515-L538.

## Per-Target Findings

All canonical names below remain unchanged in source. Existing aliases are retained as hypotheses unless the table marks a correction. No names are proposed for throw bits whose gameplay interpretation remains unresolved.

| Canonical | Existing or corrected alias | Behavior |
|---|---|---|
| ftAction_80071028 | ftAction_SpawnGFX | Visible-only GFX decoding. Uses alternate fighter-data bone when flagged, copies bone/lifetime flags, scales offset/range by 0.003906f with X/Z field reversal, advances five positions and calls ftCo_8009F834. Invisible path calls the five-position skip. |
| ftAction_800711DC | ftAction_SkipGFXSpawn | Ignores gobj and payload; advances cmd five positions. |
| ftAction_8007121C | ftAction_CreateHitbox | Special flag plus null thrown-hitbox owner skips creation. Otherwise selects x914[id], enables/reinitializes only for disabled state or changed group, resolves joint and overwrites attack properties. Five advances occur; final create_hitbox_5 field is read at the resulting cursor. Optional ftColl_8007AD18 call requires current GObj and s_link>9. ftCommon_80080484 always runs. |
| ftAction_800715EC | ftAction_SkipHitboxSpawn | Ignores gobj and payload; advances cmd five positions. Does not itself notify ftCommon. |
| ftAction_8007162C | ftAction_SetHitboxDamage | Selects x914[idx], forwards packed unsigned damage to ftColl_8007ABD0 and advances once. |
| ftAction_8007168C | ftAction_SkipAdjustHitboxDamage | Paired damage skip advances once without fighter writes. |
| ftAction_8007169C | ftAction_SetHitboxScale | Sets selected hitbox scale to 0.003906f times operand, then advances once. |
| ftAction_800716F8 | ftAction_SkipSetHitboxScale | Paired scale skip advances once. |
| ftAction_80071708 | ftAction_SetHitboxFlags | Type 0 writes x42_b5; type 1 writes x42_b7. Other values write neither. No enabled-state check. Always advances once. |
| ftAction_80071774 | ftAction_SkipSetHitboxFlags | Paired flag skip advances once. |
| ftAction_80071784 | Correct to ftAction_DisableHitbox | Disables selected x914 hitbox through ftColl_8007AFC8 and lbColl_80008428, then advances once. Does not set throw flags. |
| ftAction_800717C8 | Correct to ftAction_SkipDisableHitbox | Paired indexed-disable skip advances once. |
| ftAction_800717D8 | ftAction_ClearAllHitboxes | Disables every x914 hitbox through ftColl_8007AFF8, clears x2219_b3 in that helper, then advances once. |
| ftAction_80071810 | ftAction_SkipClearHitboxes | Paired all-hitbox-disable skip advances once. |
| ftAction_80071820 | ftAction_SetCmdVar | Indices 0..3 write corresponding cmd_vars slot. Other indices do not write. Always advances once. |
| ftAction_800718A4 | ftAction_SetThrowFlag | Selector0 asserts throw_flags_b3 and copies cmd.timer to cmd_timer; selector1 asserts throw_flags_b4. Other selectors make no fighter write. Always advances. |
| ftAction_80071908 | None; keep canonical | Asserts throw_flags_b1 and advances once; no operand read. |
| ftAction_8007192C | None; keep canonical | Asserts throw_flags_b2 and advances once; no operand read. |
| ftAction_80071950 | ftAction_AllowInterrupt | Sets allow_interrupt true and advances once; no operand read. |
| ftAction_80071974 | None; keep canonical | Asserts throw_flags_b0 and advances once; no operand read. |
| ftAction_80071998 | ftAction_HandleGroundOrAirState | Selector0 grounds through ftCommon_8007D7FC; selector1 assigns airborne, jumpsUsed=1 and ECB lock10; selector2 assigns airborne, jumpsUsed=max_jumps and ECB lock5. Other selectors call nothing. All advance once. |
| ftAction_80071A14 | ftAction_SetBodyCollisionState | Forwards state to ftColl_8007B62C then advances. Callee stores x1988 and maps 0/1/2 to ftCo_800BFFD0 arguments 1/3/2; other values remain stored without that call. |
| ftAction_80071A58 | ftAction_SetAllHurtCapsuleState | Forwards state to ftColl_8007B0C0 then advances. Callee updates every hurt capsule, clears skip_update_pos and sets x221A_b5 according to non-enabled state. |
| ftAction_80071A9C | ftAction_SetHurtState | Forwards bone_idx/state to ftColl_8007B128 then advances on return. Callee updates first matching bone and asserts when no bone matches; non-enabled state sets x221A_b5. |
| ftAction_80071AE8 | ftAction_SetJabCombo | If disabled is false OR x197C is nonnull, sets x2218_b1 true; otherwise preserves it. Never clears the bit. Always advances once. |
| ftAction_80071B28 | ftAction_SetJabRapid | Assigns set_jab_rapid.state to x2218_b2, then advances once. This assigns, not toggles. |

## Dispatch and State

The normal and alternate tables pair the first seven operations with skip handlers. Later variable/throw/interrupt/situation/hurt/jab handlers appear in both tables. Normal dispatch subtracts 0xA from fighter event opcodes; alternate dispatch uses the same indexing and clears aggregate throw_flags before execution and again when a timer change remains due. The bit setters do not clear themselves. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L174-L204 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1318-L1388.

The interpreter bodies do not by themselves establish every caller's nonzero-motion-entry or color-animation use. Existing claims containing those extra contexts are explicitly unresolved and left unchanged. The same applies to unreviewed randomization, Yoshi command-variable consumers, IASA consumers, color meanings and Bunny-Hood/jab consumers. These are family followups, not silently accepted claims.

Every source callback has Fighter_GObj* gobj and CommandInfo* cmd. The skip callbacks ignore gobj; other callbacks derive or forward it. cmd supplies operands and mutable cursor state. All 52 #r3/#r4 parameter entity inventories are empty and recorded individually in coverage.json. No new parameter or shared-type facts are proposed.

## Artifacts and Validation

`fact-dispositions.json` records IDs, timestamp versions, evidence and decisions for all 152 facts: 105 retain, 20 supersede and 27 unresolved. Only the 20 substantive corrections are in proposal.json; retained facts are not rewritten. No source entity, shared type, link, merge or follow-up is written through the proposal.

Source hash is `f866206af4b9b1cd956e3206c5c95f0a5780947a4cfc71ed15ceef3ef98e79ba`. coverage.json records all page receipts and foreign supplemental reads. Assigned renders had zero parse errors; supplemental ftcommon rendering reported one parse error and name collisions, so canonical evidence controls. Two foreign header excerpts were read canonically for macros and operand type only, with no owned-header or rendered-header completeness claim.

Dry-run accepted 20 writes, rejected zero and skipped zero. Proposal SHA-256 is `70c9c193df3619a3576bd56e6108521ed6907db23c8eb59d44fbc0930155c75e`. No KB application occurred. Independent review remains pending.

UTC review interval: 2026-09-08T14:32:49Z to 2026-09-08T14:38:00Z, 311 seconds.

Independent-review ledger repair: packed operand widths and malformed random-selection outcomes must not be inferred from destination types. The final fact-dispositions.json supersedes any broader narrative here for the eight deferred retained claims. Consolidated final counts: 327 retain, 48 supersede, 88 unresolved; 49-write proposal unchanged.
