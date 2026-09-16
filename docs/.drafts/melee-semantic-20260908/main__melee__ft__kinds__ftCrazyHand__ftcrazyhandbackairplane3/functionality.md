## BackAirplane3

This module defines one state-entry routine and four lifecycle callbacks, all returning `void` and accepting `HSD_GObj*`; the header declares the same five functions. [Definitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane3.c#L20-L61), [declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane3.h#L6-L10).

### Entry and release

`ftCh_Init_80159670` unconditionally selects motion state `0x171` with arguments `0, 0.0f, 1.0f, 0.0f, NULL`, calls `ftAnim_8006EBA4`, then clears `cmd_vars[0]`. BackAirplane1 calls this entry after animation exhaustion whenever `u.mh.x2250 != 0x170`; that branch is not an explicit equality test against `0x171`. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane3.c#L20-L26), [caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane1.c#L37-L54).

The animation callback consumes nonzero `cmd_vars[0]` by clearing it first, then calling `ftCh_GrabUnk1_8015B850(fp->victim_gobj, 0x153)`. Only afterward does it test `victim_gobj`; a non-null value enables the ordered calls `ftCommon_8007E2F4(fp, 0)`, `ftCo_800DE2A8(gobj, victim)`, and `ftCo_800DE7C0(victim, 0, 0)`. It clears `mv.ch.unk0.x20` after that guarded block. This is a one-shot consumption per nonzero command, not proof that the event can occur only once per animation. [Release ordering](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane3.c#L28-L42).

The later null test does **not** make the entire release path null-safe. The earlier helper resolves the supplied object's Fighter and its reciprocal `victim_gobj`, then reads the reciprocal fighter's facing direction without guards. It ignores its `msid` parameter and hardcodes state `0x153`, clears a move variable, restores visibility, and installs `ftCo_800DE508` as `accessory1_cb`. Consequently, cleanup after that call is guaranteed only if preceding operations return normally; valid capture relationships must survive into this transition. [Victim helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandthrowncrazyhand.c#L14-L25).

### Completion and continuation

An independent remaining-frames test calls `ftCh_GrabUnk1_8015BC88` when animation is exhausted, including when no command event occurred that update. The callee clears `x20`, prepares a destination from attributes, sets `u.mh.x2258 = 0x184`, and then tests that field against `0x156`. In the visible sequence this selects the other branch, entering through `ftCh_GrabUnk1_8015B8FC`. It stores `ftCh_Init_80156198` in `mv.ch.unk0.x4` and the destination in `xC`; TagCancel collision later invokes the stored callback when `x18 == 0`. This is a deferred cross-file continuation, not merely an immediate return to idle justified by the rendered `Wait1_2_Enter` name. [Completion call](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane3.c#L43-L45), [transition and deferred callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L98-L133), [state-0x184 helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L22-L33).

### Other callbacks

IASA queries the fighter's player slot and calls `ftBossLib_8015BD20` only for `Gm_PKind_Human`; there is no direct local state transition or non-human handler. Physics delegates to `ft_80085134`, whose canonical body sets `self_vel.x = x6A4_transNOffset.z * facing_dir` and `self_vel.y = x6A4_transNOffset.y`, leaving Z untouched. Collision is empty; this establishes no local collision response, not global collision immunity. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane3.c#L48-L61), [physics helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125).

### Evidence limits

Both owned canonical and rendered files were read completely. Rendered substitutions were treated as hypotheses; notably the physics interpretation was verified from its canonical callee. Exact public Reverse Throw/backward-direction correspondence remains unresolved rather than inferred solely from BackAirplane naming. No compiled artifact was supplied, so source literals do not establish `.sdata2` size, layout, contents, or relocation use. The ledger covers 33 facts (23 retained, nine unresolved, one superseded) and 13 links (five retained, eight unresolved).

Status: synthesized; independent review and live promotion pending.
