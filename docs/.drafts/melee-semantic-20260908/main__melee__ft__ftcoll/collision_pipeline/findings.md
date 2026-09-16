# Collision Pipeline Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Complete canonical and rendered source review covers lines 1635–2972, 1338 lines. Six manifest targets, 21 parameter entities and 35 existing facts are accounted for. Header and dox review belongs to other clusters. Exact UTC times and immutable read receipts are in coverage.json.

## Fighter-originated Hits, ftColl_80078C70

The supplied object is the defender. The loop variable victim_fp is the attack source, despite its name. The global gm_8016B1C4 guard must return zero. Self is skipped while setting is_same_gobj; this records that subsequent list entries lie after the defender and controls reciprocal clash work. The source is excluded if its thrown-hit owner equals this_gobj, or its thrown-hit grabber identity equals the defender player. Ordinary same-player sources are excluded. Team filtering compares defender team to source team or x119C_teamUnk under gm_8016B168, !gm_8016B0D4 and !source.x2225_b4. These are exact predicate combinations, not independently revalidated option names.

For eligible sources after self, while defender x221B_b5 is clear, ftColl_804D6560 marks each defender attack that is non-disabled, not x43_b2, neither Catch nor Inert, has x40_b0 and x42_b5 set, accepts the source ground/air state and is absent from lbColl_8000ACFC history. The incoming source attack must be non-disabled, not Catch, x42_b5 set, compatible with defender ground/air, allowed by the hit_grabbed_victim_only relationship and absent from its history. Its x43_b2 becomes a forced-geometry flag.

Before shield handling, a grounded pair after self may clash when the incoming hit is not forced or Inert, both clash permissions hold, defender is not x221B_b5, defender is not source.victim_gobj and eligible reciprocal attacks exist. lbColl_80007AFC overlap plus a true ftColl_8007699C_dontinline result suppresses shield/hurt processing for that incoming hit. A false response or no overlap leaves those stages reachable.

Shield handling requires defender x221B_b0 and passes facing-side checks under x221B_b3. Defender x221B_b4 rejects incoming hits without x42_b4. lbColl_80007BCC receives shield_hit, transform, forced flag, scales and defender Z. A non-Inert success calls ftColl_80076CBC and suppresses hurt handling. Inert success sets source.x221C_b5 and source.unk_gobj, then still enters hurt handling.

Hurt handling requires both x1988 and x198C differ from 2. It scans hurt capsules in order through lbColl_8000805C. On the first overlap, non-Inert attacks call ftColl_80076ED8; only a true response proceeds to sound. Nonzero x1988/x198C, x221D_b6 or a hurt state other than Enabled selects ftColl_803C0C40 severity sound. Otherwise sfx_kind=13 and severity=2 stores lbColl_80005BB0 result in x215C with routing base 0x72; the other branch stores x2160 with base 0x7E. Both include player_id*2+x221F_b4. Inert overlap writes source.unk_gobj. Every overlap breaks the hurt scan, even when ftColl_80076ED8 returns false. The phantom-hit continuation described in comments is not executable.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L1656-L1798; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L1800-L1962.

## Item-originated Hits, ftColl_8007925C

The pass scans the global item list, skipping It_Kind_Unk4. Owner relation ftLib_80086FD4 excludes an item unless xDCD_flag.b5 permits it. Team equality excludes it under gm_8016B168, !gm_8016B0D4 and !xDCD_flag.b6. If defender x221B_b5 is clear, hit_count is initialized to zero. Thrown-owner/team restrictions can skip building reciprocal-hit eligibility but still reach item-hitbox processing with that zero count.

Eligible defender hitboxes are non-disabled, not forced, not Catch, x42_b5 set, compatible with item ground/air and absent from history. This cache contains eligibility bytes, not overlaps. Each of four item attack hitboxes must be non-disabled, x42_b5 set, compatible with fighter ground/air, and absent from history. x42_b2 rejects equal facing. A true gm_8016B1C4 rejects the hit unless item_hitbox.x138 permits it.

1. Reflection and absorption are skipped for Inert hits, forced hits, or missing x42_b4. Reflection needs fp.reflecting and hit.x41_b7; overlap of reflect_hit calls ftColl_80077464 and continues. Absorption requires x2218_b6 plus x42_b0 or the conjunction x2218_b7 and hit.x41_b7. Absorb overlap calls it_8026FAC4 with type 6, records item.xC90_absorbGObj and direction from relative X, then continues. x42_b0 additionally accumulates integer damage and hit count. Nonzero damage truncated to zero contributes 1; zero damage contributes 0.
2. Reciprocal hitbox testing requires !fp.x221B_b5, !forced and nonzero eligibility count. When exactly one hit is Inert, overlap sets item.xDCE_flag.b6 and toucher. Two Inert hits do not interact here. Non-Inert pairs require both x40_b0, then overlap calls ftColl_80077970. Either accepted pair consumes this item hitbox before shield/hurt stages.
3. Shield requires non-Inert, fp.x221B_b0 and hit.x42_b1, plus facing and x221B_b4/x42_b4 checks. Overlap calls ftColl_80077688 then continues. coll_pos/coll_dist are computed by lbColl_80007DD8 only when !x221B_b2 and either hit.x42_b3 or fp.x221B_b1; safe use on other paths depends on response-helper guards and is not established here.
4. Inert hurt contact uses lbColl_80008248 without the x1988/x198C gate, writes toucher/flag and breaks at the first overlap. Non-Inert hurt contact rejects x1988==2 or x198C==2, and x42_b6 requires is_grabbable on each capsule. lbColl_8000805C overlap calls ftColl_80077C60. Its false result breaks the scan; a true result selects the same protected/ordinary sound branches as the fighter pass and then breaks.

No item hurtbox is tested in this function. The earlier claim about attacks damaging items is broader than these branches establish. There are no indirect callback invocations here; response functions own any callbacks and later damage effects.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2016-L2115; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2117-L2182; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2187-L2356.

## Knockback Formula Family

ftColl_GetDamageCount returns x6D8[0] converted to s32 when x2225_b7 and x2224_b2 are both set, x6D4 when only the former is set, and accumulated percent converted to s32 otherwise. It has no manifest identity, so no entity is invented.

Let w=weight*xF4. The shared expression computes defense * attack * [arg3 * (0.01*hit.x24 * (x11C * (xF8 - w*xF8/(1+w)) * inner) + x120) + hit.x2C], preserving the source's nested evaluation order. A nonzero hit.x28 uses inner=x118*x110 + x114*(x118*hit.x28) and does not read accumulated damage. Otherwise inner=x110*(count+percentTemp) + x114*(unk_count*(count+percentTemp)). The count is truncated before percentTemp is added. The result is replaced by x108 when result>=x108; there is no lower clamp or NaN guard.

ftColl_80079AB0 receives all four scalar factors. ftColl_80079C70 obtains victim weight, player defense/attack ratios and gm_8016B248, with an explicit u32 conversion of its signed unk_count on the ordinary branch. ftColl_80079EA8 uses victim weight and all three multipliers equal to one. None directly mutates state. The last two inherited aliases both equal ftColl_CalcKnockback and produce name_collision render metadata. Proposed distinct hypotheses are ftColl_CalcFighterKnockback and ftColl_CalcUnmodifiedKnockback; neither collides with any current target symbol or inferred-name value in the frozen baseline.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2363-L2528.

## Damage-log Resolution, ftColl_8007A06C

idx==0 returns before dereferencing the object or output. Otherwise the function interprets log as DmgLogEntry[], initializes best knockback to -1 and computes candidates by x0 category. Category 1 uses the source Fighter attack ratio and ftColl_80079AB0. Category 2 uses an Item owner attack ratio only when ftLib_80086960(owner) passes, otherwise one, and expands the same formula. Category 3 fills a temporary HitCapsule through lbColl_80008D30 and uses attack ratio one. All use defender weight/defense and gm_8016B248. Unsupported tags have no kb initialization branch.

arg4 enables mapped effects for category 1 and 2 candidates before arbitration, including losing candidates. Effect 1000 delegates to ftColl_80078538; the enumerated other effects call efSync_Spawn, with facing supplied for 1005; 1003 is a no-op. Category 3 has no effect branch. Strict kb>best selects the first tied maximum and updates x221C_b0 on each new provisional winner according to its category-1 victim relationship. The scan assumes at least one valid candidate exceeds -1.

The winner's category selects direction: relative Fighter X; relative Item X below the horizontal-speed threshold, otherwise opposite item horizontal velocity; or defender facing for category 3. Angle, element and severity come from the selected hit, with descriptor angle/element and zero severity for category 3. A subsequent unconditional hit0->kb_angle==0x16A check can replace direction and angle using hurt-axis midpoint minus contact position. If abs(dx)<1e-5, angle becomes zero; otherwise it truncates degrees of atan(dy/abs(dx)). This check and the later hurt1->height access require valid pointer relationships even for descriptor entries; producers need separate review.

DmgResult receives dir, integer angle, hurt height, maximum kb, contact pos, element, source, logged x20 damage and severity. Only then does ftColl_8007861C receive source-specific metadata. Item attribution resolves item_sub.entity and its owner, with a BombHei pl_80041B08 call and distinct owner/bonus branches. Category 3 supplies null owner, kind and final flag 1. Electric element writes fp.x1960_vibrateMult=x1A4. Other elements leave that field untouched.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2534-L2630; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2632-L2829; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2831-L2968.

## Coverage and Decisions

Every parameter entity has an empty fact inventory. Canonical signature order and roles are in coverage.json; floating parameters are not asserted to inhabit literal r6–r9 registers. DmgResult is a local record, not a new shared type. Conditional MUST_MATCH pragmas and all intervening lines are reviewed.

Existing facts receive explicit ID/updated_at-version decisions: {'supersede': 8, 'unresolved': 4, 'retain': 23}. Valid facts are retained without rewriting. Eight proposed facts correct pipeline scope, cache meaning, missing order/side effects and colliding names. Unreviewed global-predicate interpretations, external gameplay callers and shared-type constraints remain family followups. Source and shared KB are unchanged.

UTC interval: 2026-09-08T14:44:47.639Z to 2026-09-08T14:49:05.976385+00:00. Dry-run accepted eight facts, zero rejections. No application performed.
