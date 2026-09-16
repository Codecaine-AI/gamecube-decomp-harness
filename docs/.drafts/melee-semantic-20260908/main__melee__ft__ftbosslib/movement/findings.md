# Movement Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Reviewed canonical C lines 1-157 and complete header lines 1-46, plus both corresponding frozen rendered views. Hashes, actual independent external ranges, every assigned subject and fact ID/version are in coverage.json. Fact schema has no numeric version; updated_at plus value SHA-256 records the exact baseline version.

## Findings

### ftBossLib_8015BD20

Empty shared boss IASA endpoint. Master Hand FingerBeamEnd_IASA and Crazy Hand Grab_IASA call it behind player-slot checks; the body ignores gobj and returns without state changes. CrazyHand-only naming is too narrow.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandfingergun.c#L27-L33, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandgrab.c#L29-L35

### ftBossLib_8015BD24

Writes ((arg3 / arg0) + HSD_Randi(arg4 - arg5) + arg5) / arg2 through arg1. The first quotient is signed integer division. Both Hand wait controllers pass cpu.level, countdown x223C, a timing scale, base delay and random bounds after decrementing the countdown below zero. No guard checks either divisor or the random range.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L36-L40, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c#L214-L233, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandwait10.c#L184-L201

### ftBossLib_8015BE40

Computes the XYZ destination displacement and length. Below the strict arg3 threshold, reports zero but still assigns the remaining raw displacement to XY self velocity. Otherwise reports distance, normalizes displacement and scales by distance times arg4 before assigning XY velocity. self_vel.z remains unchanged.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L57-L80

### ftBossLib_8015BF74

Adds the signed target X separation capped by x_diff_max to existing self_vel.x. A nonnegative cap bounds the increment, not the final speed. Target acquisition uses C208; Y velocity remains unchanged.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L82-L98, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L113-L160, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L299-L303, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L325-L331, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L690-L707

### ftBossLib_8015C010

Overwrites self_vel.x with the signed target X separation capped by x_diff_max. For nonnegative caps, output magnitude does not exceed the cap or remaining horizontal separation. Target acquisition uses C208; Y velocity remains unchanged.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L100-L115, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L113-L160, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L299-L303, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L325-L331, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L690-L707

### ftBossLib_8015C09C

Stores the supplied facing scalar in Fighter.facing_dir and sets root JObj rotation with a zero-initialized Quaternion whose y is M_PI_2 times that scalar. No restriction to +1 or -1 is enforced.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L117-L126

### ftBossLib_8015C190

Checks floor 0 right X first and left X second. Strict overrun clamps cur_pos.x to that endpoint and zeroes self_vel.x. Equality leaves velocity unchanged. No action-state or timer update.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L128-L144

### ftBossLib_8015C208

Uses requester cur_pos as the origin for C244 selection, then copies the selected fighter cur_pos to the output Vec3. Selection measures squared XY distance to candidate positions supplied by ftLib_800866DC, which derives a bone-based point; output is the selected fighter current position. No null-result guard precedes the copy.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L146-L151, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L113-L160, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L299-L303, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L325-L331, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L690-L707

### ftBossLib_8015C244

Returns ftLib_8008627C(origin, requester) unchanged. That selector skips the same object or same player_id, x221F_b3 candidates, and same-team candidates when gm_8016B168() is true. It chooses strictly smaller squared XY distance to the point obtained by ftLib_800866DC and may return NULL.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L153-L156, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L113-L160, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L299-L303, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L325-L331, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftlib.c#L690-L707

### ftBossLib_ReportGObjSlotType

Reads gobj.user_data as Fighter and checks Player_GetPlayerSlotType(player_id) against Human, Boss and Cpu. Other kinds invoke HSD_ASSERTREPORT with the diagnostic boss is human or boss!; Cpu is accepted despite omission from that string. Canonical name is ftBossLib_ReportGObjSlotType.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L42-L50

## Dispositions

Reviewed 10 targets, 25 parameter entities and 59 existing facts. All parameter entities have zero facts. Explicit retain/supersede/unresolved decisions and reasons are recorded by fact ID in coverage.json.

The new no-op alias covers both Hand callers. BF74 receives an additive steering name. ReportGObjSlotType keeps its canonical name and clears the obsolete competing alias. Other retained aliases remain reading hypotheses.

C208/C244 selection uses a bone-derived candidate point, while C208 returns cur_pos. Same-player filtering excludes matching player IDs as well as the same object. Missing candidates can return NULL; C208 does not test that result before obtaining the position.

The header declarations beyond this movement cluster were read for complete header coverage only; their behavior/fact ownership belongs to the other TU clusters. C244 shows shadowed_binding in the header renderer.

Unresolved named-attack facts stay unchanged pending independent caller reads. Shared type claims and obsolete BDB4 identity cleanup belong to the parent/family review. Proposal entities, links, merges and follow_ups are empty.
