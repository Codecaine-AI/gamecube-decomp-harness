## Crazy Hand Slam callback unit

The source defines four Anim/IASA/Phys/Coll callback families—Slam, Fail, TagCrush and TagApplaud—and one fixed motion-state entry helper. All 17 functions accept an HSD_GObj pointer and return void; the header declares the same interface. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandslam.h#L6-L22.

### Completion and transitions

Slam short-circuits across two boss predicates and animation exhaustion. On exit it clears all self-velocity components, calls Fighter_UnkSetFlag_8006CFBC, clears x1A5C and invokes ftCh_GrabUnk1_8015A888. That helper unconditionally enters numeric motion 0x17E with flags 0, frame 0, speed 1, blend 0 and NULL animation source, then calls ftAnim_8006EBA4. Fail instead checks ftBossLib_8015C31C or animation exhaustion, performs the flag-helper/x1A5C cleanup without a local velocity clear, and calls ftCh_GrabUnk1_8015BC88. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandslam.c#L21-L80.

The Slam predicates inspect Master Hand motions 0x158/0x159 and, separately, an existing Master Hand object's x221F_b3 flag. The latter returns false when no matching object exists. Fail's predicate checks Crazy Hand motions 0x181/0x182. These numeric identities are not renamed into presumed gameplay states. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L177-L207.

TagCrush hands off only after animation exhaustion. TagApplaud predecrements mv.ch.unk0.x24 on every callback; when the resulting value is nonpositive and cmd_vars[0] is nonzero, it calls ftCh_GrabUnk1_8015B800 on victim_gobj, then clears the command. This is one-shot per arming, not necessarily once over the move's lifetime. Animation exhaustion is a separate subsequent test, so the victim event and self handoff can both occur in one invocation. There is no local victim NULL check. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandslam.c#L82-L114.

### Cross-file lifetimes

The victim helper makes its supplied fighter visible, reverses facing and enters CaptureCut; its paired capture entry makes the fighter invisible and sets additional fields. The inspected release helper does not itself reverse every capture-entry write. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandcapturewaitcrazyhand.c#L13-L29.

The shared completion helper clears mv.ch.unk0.x20, derives a destination from external attributes x18/x1C with z=0, sets u.mh.x2258 to 0x184 and stores ftCh_Init_80156198 in mv.ch.unk0.x4 plus the destination in xC. Its subsequent comparison with 0x156 follows the explicit 0x184 assignment, so the visible path selects ftCh_GrabUnk1_8015B8FC, whose 0x184 branch preserves cur_anim_frame. The neighboring TagCancel collision callback later consumes x18==0 and invokes the stored callback if non-NULL; it does not locally clear that callback. This is deferred cross-file state, not an immediate call to the stored completion function. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L22-L33 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L98-L133.

### Input, movement and collision

All four IASA callbacks forward only human-slot fighters to ftBossLib_8015BD20. The pinned callee is empty, so the rendered control-hook name must not imply active input processing. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandslam.c#L34-L122.

Every physics callback calls ft_80085134, which assigns self_vel.x from translation-offset z times facing and self_vel.y from translation-offset y, leaving z untouched. Slam, Fail and TagCrush collision callbacks are empty. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandslam.c#L42-L102.

TagApplaud physics subsequently supplies destination xC, distance output x18, threshold da->x14 and scale da->x10 to ftBossLib_8015BE40. The helper computes three-dimensional distance. Strictly below the threshold it reports zero but still writes raw displacement to x/y velocity; otherwise it reports distance and writes normalized displacement scaled by distance times the scale. It does not write z velocity. TagApplaud collision clears all self velocity only when x18 equals zero; nonzero leaves it unchanged. Arrival is therefore a physics-to-collision protocol, not a guarantee that the movement helper alone stops the fighter. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L52-L80 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandslam.c#L124-L139.

### Evidence boundaries

Both owned canonical and rendered files were read completely. Rendering reported no parse errors; the C view had 14 substitutions and the header none. Rendered names were treated as hypotheses and checked against canonical callees where their effects mattered. No compiled artifact was available to prove .sdata2 size, ordering, placement or individual constant loads. Full Applause/Sandwich Punch mechanics and precise external move-name mappings remain unresolved rather than inferred from callback names.

Status: synthesized; independent review and live promotion pending.
