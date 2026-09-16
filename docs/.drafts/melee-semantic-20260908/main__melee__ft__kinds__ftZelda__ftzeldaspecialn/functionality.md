## Zelda neutral-special lifecycle

This unit implements paired grounded and aerial SpecialN callbacks, mapped in the frozen baseline to Nayru's Love. Full source, rendered-name, subject and relationship coverage is inherited from research. Independent lead checks confirm the disputed branches without treating rendered names as evidence. The final proposal is empty; descriptive CreateGFX names remain baseline hypotheses, not newly recovered original spellings.

### Entry and effects
Ground entry selects numeric state 341 at frame 0 and rate 1 with zero preservation flags. Aerial entry selects 342 after zeroing vertical self-velocity and dividing horizontal self-velocity by attribute x8. There is no local zero-divisor guard, and division does not guarantee attenuation. Both entries initialize animation, clear command slot 0, copy attribute x4 into mv.zd.specialn.x0 and install the corresponding accessory callback. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialn.c#L48-L89).

The effect callbacks spawn effect 1268 or 1269 on TransN only when x2219_b0 is clear, then set that latch. Both paths install effect-hitlag callbacks and clear accessory4_cb. Callback retirement does not terminate the effect or reset its latch. [Effects](code://c302741689bd67c3617faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialn.c#L23-L46).

### Animation and reflection
Both animation callbacks consume command 1 by writing 2 and creating a reflector from attribute x84 with ftZd_SpecialN_8013ADB0. Only command 0 explicitly clears reflecting; other values are not a general inactive-window branch. Animation completion calls ft_8008A2BC on the ground or ftCo_Fall_Enter in the air. Both IASA callbacks and the reflector-response callback are empty; this does not exclude external damage or common state handling. [Animation and IASA](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialn.c#L91-L150); [response](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialn.c#L243-L246).

### Physics
Ground physics calls ft_80084F3C followed by ftColl_8007AEF8 without locally decrementing the move counter. Aerial physics decrements any signed nonzero counter, including negative values. Only an already-zero counter selects ftCommon_Fall with attribute xC and common terminal velocity. One-to-zero does not apply falling in that invocation. Both trailing aerial helpers execute regardless of this branch. [Physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialn.c#L153-L181).

### Collision and continuity
Ground collision dispatches when ft_80082708 returns zero; aerial collision dispatches when ft_80081D0C returns nonzero. The transition helpers select states 342 and 341 respectively, reconstruct the reflector only for command 2 and unconditionally install the destination effect callback. Neither locally repeats entry initialization or resets the effect latch. Common transition inlines pass through cur_anim_frame. [Transitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/ftzeldaspecialn.c#L185-L241); [frame continuity](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/inlines.h#L71-L89).

Intended terrain roles remain separate from numeric result semantics. GA_Ground is 0 and GA_Air is 1. ft_80081D0C returns GA_Air on a true map result, but GA_Ground on false or the exceptional ft_80081A00 branch, which suppresses Zelda's local dispatch. ft_80082708 likewise maps its map result into this enum. Rendered helper names cannot resolve the discrepancy. [Enum](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/forward.h#L442-L445); [aerial result](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123); [ground result](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L393-L404).

### Evidence limits
The transition mask adds KeepGfx, KeepColAnimHitStatus and SkipHit to the common ground/air collision mask. Full effect, command and reflector lifetimes across state changes, damage and death require cross-file review. [Mask](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftZelda/forward.h#L35-L37).

Source literals do not establish compiled .sdata2 membership, size, encoding or ordering. All 14 upstream fact deferrals are accepted. The inherited ledger retains 74 of 88 facts and all 39 relationships; broad relationships do not prove disputed numeric predicates.

Status: synthesized; independent review and live promotion pending.
