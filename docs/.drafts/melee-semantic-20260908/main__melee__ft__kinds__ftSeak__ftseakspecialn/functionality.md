## Sheik neutral special: Needle Storm

The owned C file implements paired grounded and aerial Start, Loop, Cancel and End callback families, two entry wrappers, interruption cleanup and the accessory firing callback. The header declares the public interface. Canonical callback registration in ftseak.c independently connects these functions to the SpecialN motion states; rendered proposed names were not used as proof.

### Entry and charging
Both entry wrappers use doEnter to select the appropriate Start state at frame zero and rate one, clear throw_flags_b0 and four command variables, reset the three per-use specialn fields, and install ftSk_Init_80110198 in take_dmg_cb and death2_cb. Only a zero persistent needle count is changed to one; other values are preserved rather than validated or clamped here. Startup waits for animation exhaustion, attempts held-needle creation on part 23, stores the returned pointer, and enters Loop even if allocation returned NULL.

Both Loop animation callbacks play SFX 270134 when the per-use x8 counter begins at zero and increment that counter each invocation. At animation frame zero they increment persistent stock and reset x8. An attempted increment above six clamps stock to six, sets x8 to 100 and requests color animation 86. This overflow response is distinct from first reaching six. Neither Loop animation callback exits the charging state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialn.c#L75-L202.

### Input, release and cancellation
The shared Loop IASA handler first tests whether B is no longer held. Release takes priority over a simultaneous shoulder trigger, resets the firing counter, enters End, reinstalls interruption callbacks and assigns shootNeedles to accessory4_cb. Only while B remains held can pressed HSD_PAD_LR select Cancel. The other six IASA callbacks are empty; that callback-local absence of input processing does not preclude collision or lifecycle interruption.

Both End animation callbacks set a pending-shot flag and clear the held-item reference at counters 2, 5, 8, 11, 14 and 17, then increment the counter. These are callback-update counters, not a demonstrated compiled jump-table layout. Grounded Cancel and End call ft_8008A2BC after animation exhaustion. Aerial Cancel and End select ordinary Fall when attribute x10 is zero, otherwise call ftCo_80096900. Cancel clears the held reference without directly consuming stock.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialn.c#L142-L284.

### Individual shots and allocation failure
shootNeedles clears a pending request before testing positive stock. With stock remaining, it derives a position from fighter position, facing and model Y scale. Ground and air use separate positional attributes; both select one of nine authored vertical offsets, with the aerial path doubling that offset. The projectile plane is forced to z=0. It attempts thrown-needle creation and invokes setup mode 0 only for a nonnull result. Stock decrement, effect 1283 and SFX 270140 occur even if allocation fails. Thus a request is not a guarantee that a projectile exists.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialn.c#L435-L476; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakneedlethrown.c#L60-L154.

### Movement and collision graph
Ground physics delegates to ft_80084F3C, which selects ordinary or overspeed-scaled ground friction and then applies ground movement. Air physics delegates to ft_80084EEC for common falling and aerial friction. The wrappers do not own state transitions.

Only Start and Loop preserve their phase across ground/air collision transitions and reinstall interruption callbacks. Ground callbacks use the exact comparison ft_80082708(gobj) == GA_Ground; aerial callbacks use ft_80081D0C(gobj) != GA_Ground. These are helper-result comparisons, not direct reads of Fighter.ground_or_air. The preservation mask is a u32 with eight specified set bits.

Cancel and End instead leave the special through common fall or landing paths. Cancel collision exits preserve stock; End collision exits clear stock and the pending-shot flag. Aerial Cancel calls basic landing before clearing callbacks, whereas aerial End clears callbacks and firing state before basic landing. Basic landing has a hammer-specific alternative. The nonzero-x10 fall helper normally stores x10 as landing_lag, but its x2224_b2 branch redirects early to ftCo_80090780. Consequently, neither universal zero landing lag nor unconditional entry into FallSpecial is established.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialn.c#L286-L433; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L33-L53; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L83-L91; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L28-L59.

### Cleanup and cross-file lifetime
ftSk_Init_80110198 calls needle cleanup followed by chain cleanup. Needle cleanup gates its drop loop on a nonnull held-item reference, clears that reference first, and attempts mode-1 thrown-item creation once per remaining stock unit. Failed allocations still consume stock. Within that held-reference branch, if either interruption callback matches the shared handler, both callback slots are cleared. Stock is then unconditionally reset to zero, including when no held item was recorded.

Clearing the fighter reference is not itself item destruction. The held-item animation callback separately checks its saved owner, owner consistency and the fighter-side reference query in ftseakspecials.c. A null saved owner or cleared fighter reference can produce a true return, while an owner mismatch returns false. This cross-file lifetime must not be collapsed into a synchronous destroy operation in the fighter callback.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialn.c#L30-L80; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseak.c#L319-L348; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakneedleheld.c#L89-L132; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecials.c#L1071-L1094.

### Evidence limits
All owned canonical/rendered pages and all frozen subject/link pages were delivered. The ledger covers 200 facts and 69 links: 188 retained facts, nine unresolved section-attribution facts and three superseded behavioral facts; 65 retained links and four unresolved section-attribution links. No compiled artifact establishes .data/.sdata2 extents, placement, literal-pool membership or compiler-generated branch tables. The retained CheckAndDestroyNeedles name remains a source-annotated hypothesis, not a recovered original spelling or proof of direct destruction.

Status: synthesized; independent review and live promotion pending.
