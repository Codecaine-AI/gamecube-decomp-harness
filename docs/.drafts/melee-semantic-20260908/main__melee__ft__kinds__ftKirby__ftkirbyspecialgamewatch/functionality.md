## Kirby copied Chef

This unit implements fighter-side behavior for Kirby's copied Mr. Game & Watch neutral special: pan setup and lifetime integration, randomized food requests, grounded/aerial entry, animation and input repetition, physics delegation, and reciprocal ground/air transitions. The header declares public callbacks and helpers; the food and pan-setup callbacks have local forward declarations in the C file.

### Entry and article setup

Both entry routines zero vertical self-velocity, enter their corresponding motion at frame 0 and rate 1, call ftAnim_8006EBA4, clear command variables 0–2, enable looping, reset the per-use count, and schedule fn_8010CFB0. They do not explicitly reset persistent trajectory history. Pan setup transforms the left-thumb joint origin and stores the nullable it_802C74D8 result in xDC. Only successful creation installs damage and secondary-death callbacks; hitlag callbacks and the food accessory callback are installed regardless of allocation success. [Entry/setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialgamewatch.c#L99-L188).

### Food requests

fn_8010CE5C does nothing while command variable 0 is zero. Otherwise it consumes the command and checks the per-use count against the configured attribute. Below that limit it increments the count, transforms the left-thumb-relative offset (2.5, 6.5, 0), builds candidates from indices 0–4 excluding xD4 and xD8, randomly selects one, shifts persistent history, and calls it_802C837C with It_Kind_Kirby_GameWatchChef and facing direction. Count/history updates precede the constructor call, whose result is not checked. Every consumed request clears accessory4_cb, including a request blocked by the count limit. Five trajectory candidates do not prove a five-projectile configured cap. [Food callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialgamewatch.c#L32-L97).

### Repetition and completion

Animation callbacks consume command variable 2 before checking the count limit and loop-disable latch. Permitted repeats restart the corresponding motion; animation exhaustion is checked independently afterward. Grounded exhaustion calls ft_8008A2BC; aerial exhaustion enters Fall. IASA callbacks latch loop disabling when B is not held, but independently permit a pressed-B repeat when command variable 1 is active and the count is below the limit. This branch does not test the disable latch. Repeat helpers use mask 0x0C4C508C and the supplied repeat frame minus 1, call ftAnim_8006EBA4, clear commands 1/2, re-enable looping, and rearm food creation. They do not explicitly reset the count, history, or command variable 0. [Control](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialgamewatch.c#L190-L258), [repeat helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialgamewatch.c#L304-L329).

### Physics and collision

Physics callbacks unconditionally delegate to common grounded friction/movement or gravity, terminal-velocity and air-friction processing. The grounded helper scales friction by a configured factor above walking speed. Ground collision dispatches to the aerial helper when ft_800827A0 returns zero. Aerial collision dispatches to the grounded helper precisely when ft_80081D0C returns a value unequal to GA_Ground. The enum spelling must not substitute for physical-state meaning: the callee updates collision positions and has an exceptional early GA_Ground return. Both transition helpers use ftKb_MF_GwSpecialN_Coll and restore the food callback. [Callbacks/transitions](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialgamewatch.c#L260-L302), [physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L33-L53), [collision return branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L105-L123).

### Cross-file pan lifetime

Pre/post-hitlag callbacks forward only while xDC is non-null. Owner cleanup invokes the post-hitlag path before clearing xDC. Explicit fighter removal calls the item remover and then owner cleanup again. When its Item exists, the item remover notifies a non-null owner before generic teardown; the normal owner-notified path therefore clears the reference before the fighter's second cleanup. The pan animation callback completes when no owner exists or the owner predicate returns true. That predicate is side-effect-free and returns false inside the inclusive GwSpecialN–GwSpecialAirN motion interval, true outside. Owner-null and item-null branches remain distinct from normal tracked-pan cleanup. [Fighter helpers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialgamewatch.c#L116-L157), [item lifetime](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itkirbygamewatchchefpan.c#L32-L86).

### Evidence limits

Full baseline coverage is inherited from the hash-bound research handoff. This independent lead read both owned files completely in canonical and rendered form and inspected the cited contextual collision, physics, and pan-lifetime source. Rendered names remain hypotheses rather than evidence of original symbol recovery. No compiled artifact was supplied; .sdata2 membership, layout, alignment, and emitted contents remain unresolved.

Status: synthesized; independent review and live promotion pending.
