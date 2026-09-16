# Ft_07C1 semantic review

Pinned `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and separate rendered C1–204/H1–15 cover219 manifest lines. Both renders statusok/exhausted; zero parser errors and20 substitutions (C16/H4). Counts: {'owned_files': 2, 'owned_lines': 219, 'targets': 6, 'function_targets': 5, 'writable_subjects': 15, 'parameter_entities': 8, 'existing_facts': 37, 'source_functions': 5, 'source_only_functions': 0, 'proposals': 7, 'dispositions': {'unresolved': 4, 'retain': 26, 'supersede': 7}}.

## Contact history and response

The nonintersection path removes primary victim pointers, not collision geometry. Response checks only one history direction and interleaves each registration with that recipients movement response. Weight ratios have an upper cap only and no denominator validation. List ordering avoids duplicate unordered tests only under a stable once-per-source schedule. Source state is not checked as strictly as candidate state.

## Complete source behavior

### `ft_8007C114`

`void ft_8007C114(HSD_GObj* gobj)`

Reads held item when non-NULL; Hammer calls ftCo_800C555C then always clears x2219_b4. The motion-state caller gates this on absence of SkipHit and a pending flag, but the helper itself does not test that flag. Hammer helper passes false to item reset, which disables four item hit capsules and clears active flags. No item destruction, drop, or replacement is performed here.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_07C1.c#L20-L33

### `ft_8007C17C`

`void ft_8007C17C(Fighter_GObj* gobj)`

Sets x4=0 and stateEnabled, clears both victim pointer arrays and their replacement cursors through lbColl_80008440, assigns jobj from parts[ft_data->x34->x0] and configured scale, zeros local offset and x43_b1/b2, clears fighter participation x2227_b2, then samples immediately through224. Final state isUnk2 with coincident endpoints. Does not memset the capsule or reset all fields such as owner/damage or victim metadata; no bounds/null configuration checks.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_07C1.c#L35-L50

### `ft_8007C224`

`void ft_8007C224(Fighter_GObj* gobj)`

void ft_8007C224(Fighter_GObj* gobj). Mutates the embedded thrown capsule according to its state. Active states pass jobj and b_offset to lb_8000B1CC; a NULL jobj is supported and copies b_offset directly into the position. Non-NULL joints provide the transformed point. Unknown state values, including declared Unk4, are no-ops. StateEnabled samples current and copies to previous then becomesUnk2. StateUnk2 becomesUnk3 and falls through: previous=current then a new sample. Unk3 performs the same history update. Fighter participation flag is untouched.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_07C1.c#L52-L74

### `ft_8007C2E0`

`void ft_8007C2E0(Fighter* fp0, HitCapsule* hit0, Fighter* fp1, HitCapsule* hit1)`

Checks only whether hit0 primary victim history contains fp1 and returns if so. Otherwise registers fp0 in hit1 with type3, applies fp1 response if airborne, registers fp1 in hit0, then applies fp0 response if airborne. For each recipient, divides source weight by recipient weight, caps only values greater than1, then multiplies hit_weight_mul. On X and Y separately, movement product>=0 uses source-minus-recipient delta; a negative or NaN comparison uses source delta. Results accumulate in x98_atk_shield_kb.x/y; Z is unchanged. No zero/negative/NaN weight guard or lower ratio clamp. The initial suppression check is one-sided: hit0 recording fp1 prevents all work, even if hit1 lacks fp0. New processing interleaves registration and movement: hit1 registration, fp1 response, hit0 registration, fp0 response. Registration return values are ignored, so an already-present reverse entry does not suppress movement. Victim tables hold12 entries and can evict an old entry when full; suppression lasts only while the queried entry remains recorded. Each airborne recipient receives its own response; grounded recipients do not. No damage, motion state, position delta or Z response is directly written. Distinct Fighter/capsule pairing is a caller invariant; no alias check.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_07C1.c#L77-L131

### `ft_8007C4BC`

`void ft_8007C4BC(Fighter_GObj* gobj)`

Reads source eligibility and excludes victim_gobj, or dmg.x1868_source when x221C_b6 and no victim_gobj. Traverses the global fighter list and considers collisions only after encountering the source, with candidate eligibility/relationship/disabled-state filters. Intersection passes the later fighter as fp0 and the source as fp1 to the response helper. Nonintersection calls lbColl_800089B8 in both directions, clearing matching primary victim pointers; it does not resample or maintain capsule positions. Source requires x2227_b2, status!=2 and !x221F_b4. Candidates additionally require !x2219_b1, participation, status!=2, !x221F_b4, no guarded damage-source link back to source, a non-disabled capsule, and list position after source. Source capsule state is not explicitly checked. Status is the maximum of the x221D_b6-derived0/1 and x1988/x198C; only exact2 is rejected. If source is absent from the list, no pair is processed. Nonintersection removes both primary victim entries. List ordering avoids duplicate unordered tests only under a stable roster with one invocation per source; this function does not enforce that schedule. Eligibility-skipped and earlier-list pairs keep existing histories; clearing occurs only after an actual nonintersection test. No team or opponent filtering is explicit here.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_07C1.c#L133-L203

## Types, header and completeness

C1–18 imports fighter/item/collision types and helper declarations. C76 is an implementation comment about duplicated response blocks, not a missing source helper. Header7–12 declares all five functions, with Fighter_GObj* for114 while source uses HSD_GObj*. Outside M2C, Fighter_GObj is a typedef of HSD_GObj; M2C declares a separate layout stub. No source-only functions or authored data objects are present. The .sdata2 target has four unresolved facts because literal pool extent/order cannot be established from C alone.

HitCapsule is size0x138, has five declared states0..4 and two12-entry victim histories. This updater explicitly handles only0..3; state4/default is inert. Initialization clears victim pointers/cursors but not all other fields. A NULL attached joint is supported by the transform helper and treats b_offset as the result directly. The collision response updates X/Y accumulation only.

Every baseline fact, inferred name, target, file subject and eight empty parameter entities has been reviewed. Proposed names remain hypotheses; canonical identifiers unchanged. Existing external gameplay relationships are supported by motion-state, reset and collision-loop callers.

Exact outgoing links: {'expected': 9, 'reviewed': 9, 'retain': 9, 'reject': 0, 'unresolved': 0}; every original record preserved. Seven corrections address null-joint support, response math/order, victim-history removal, schedule assumptions and unknown states.

Complete packet mirrored; validation dry-run only. No source/shared KB, Git, UI, publication or promotion writes.

Validation: dry-run valid7/reject0/skip0. SHA256 `c817b3360f26823f9638918668ff7ffea138bb0ef8afb5fa829054ea18d98556`.
