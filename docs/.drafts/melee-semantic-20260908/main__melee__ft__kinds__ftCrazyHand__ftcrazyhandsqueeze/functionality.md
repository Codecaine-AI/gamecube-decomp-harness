## Crazy Hand Squeeze

The pinned implementation contains five `void(HSD_GObj*)` functions: entry, Anim, IASA, Phys, and an empty Coll callback. The header declares all five. Earlier baseline claims that Coll is absent are incorrect.

`ftCh_Init_8015A3F4` clears `cmd_vars[1]`, stores the result of looking up Master Hand in `x1A5C`, enters numeric motion state `0x17A` with arguments `0, 0.0f, 1.0f, 0.0f, NULL`, and calls `ftAnim_8006EBA4`. The proposed name `ftCh_Squeeze_Enter` is consistent with this canonical body and the surrounding callback family, independently of the rendered substitution.

Anim first services a nonzero `cmd_vars[1]` through `ftBossLib_8015C5F8` and clears the latch. A separate short-circuit disjunction tests `ftBossLib_8015C2E0`, then `ftBossLib_8015C358`, then animation exhaustion. On exit it calls `Fighter_UnkSetFlag_8006CFBC`, clears `x1A5C`, and invokes `ftCh_GrabUnk1_8015BC88`. Event servicing and exit can occur in the same update. Clearing the partner pointer is not proof of object destruction or reference-count release. [Canonical entry and animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandsqueeze.c#L15-L41).

The boss predicates inspect Master Hand's numeric states `0x158`/`0x159` and, separately, the presence of a Master Hand object with `x221F_b3` set. The lookup can return NULL; the flag predicate explicitly handles absence. These observations do not establish semantic names for those numeric states. [Predicate and lookup implementations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L177-L232).

Cross-file entry comes from `ftMh_MS_382_801552F8`: it obtains Crazy Hand, conditionally invokes this entry under `!ftBossLib_8015C31C()`, stores the Crazy Hand pointer, and selects `ftMh_MS_TagApplaud`. There is no explicit NULL guard at the call site. This paired entry supports coordination, but cautions against equating the source label Squeeze with the flowering, three-repetition pummel described in baseline gameplay facts. [Paired caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandtagcrush.c#L41-L54).

The exit continuation clears `mv.ch.unk0.x20`, builds a destination from attributes `x18`/`x1C`, writes `u.mh.x2258 = 0x184`, then tests that field against `0x156`. As written, the preceding assignment selects the other branch. It installs `ftCh_Init_80156198` in `mv.ch.unk0.x4` and saves the destination in `mv.ch.unk0.xC`. The neighboring collision routine invokes the saved callback when `x18 == 0`, after zeroing velocity. This is a cross-file return/movement lifetime, not demonstrated pummel-count or throw logic. [Continuation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtagcancel.c#L98-L133).

IASA forwards the object to `ftBossLib_8015BD20` only for `Gm_PKind_Human`; that helper currently returns immediately. Phys delegates once to `ft_80085134`, and Coll does nothing. Rendered names suggesting active IASA handling or animation-derived velocity are not independent evidence of helper semantics. [Local callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandsqueeze.c#L43-L56); [empty IASA helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34).

Source literals alone do not establish `.sdata2` size, contents, placement, or relocations. No compiled artifacts were supplied.

Status: synthesized; independent review and live promotion pending.
