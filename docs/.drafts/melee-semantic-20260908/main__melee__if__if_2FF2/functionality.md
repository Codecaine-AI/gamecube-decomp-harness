## Semantic review

The unit owns a six-slot player-associated numeric HUD and also supplies debug-menu camera/light constructors and a shared DevText initialization wrapper. Existing descriptive names remain useful; capitalization and subsystem-prefix differences alone do not warrant changes. Rendered names were assessed against canonical behavior, not used as independent proof.

### Numeric HUD

Each slot retains a process GObj, HSD_Text pointer, text-entry handle, unsigned cached value and suppression byte. Initialization zeroes the aggregate and creates a shared SisLib context attached to the common HUD GObj; it does not destroy previously live resources. Slot setup accepts an unchecked index, replaces existing process/text resources, creates decimal text at `(hud_x, hud_y + 3.2f)`, applies uniform `0.06f` scale, assigns the empty render hook, and registers the update process at priority 17. Setup does not initialize the cached value or clear suppression.

The update callback finds its slot by GObj identity. An unmatched object causes no work. Suppression exactly equal to 1 writes two spaces on each invocation without updating the cache. Otherwise the callback obtains the indexed game-manager integer, caps only values above 9999, and replaces decimal text only when the result differs from the unsigned cache. Negative values are not lower-clamped. The accessor refreshes shared state when its freshness marker changes. Existing Coin Get associations are retained as contextual knowledge, not proof that these functions are exclusive to coin-mode rules.

Hide sets suppression for all six slots and hides existing text without removing resources. Show clears suppression for every slot, but only slots with text are rebuilt and explicitly revealed; repeated show calls reconstruct resources again. Teardown independently removes each non-null process and text object without clearing retained pointers, so it does not establish a safely repeatable post-teardown state. Common HUD dispatchers and the Venom Smash Taunt path use the visibility pair; common HUD cleanup invokes teardown.

Evidence: [state and lifecycle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/if_2FF2.c#L89-L231), [score accessor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gm_16AE.c#L971-L982), [rule-gated slot caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/ifstatus.c#L844-L889), [HUD visibility dispatch](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/ifall.c#L37-L57), [HUD cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/ifall.c#L243-L271), [Smash Taunt integration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grvenom.c#L714-L737).

### Rendering and developer text

The authored camera descriptor references eye/interest descriptors and specifies a 640-by-480 viewport and scissor. The linked light descriptors supply the lighting configuration. The light constructor immediately consumes its GObj allocation without a local null guard and registers the light callback on GX link 0 at priority 0. The camera constructor guards GObj creation, loads and attaches the camera, registers the max-link callback at priority 11, and assigns mask `0x20000`. Neither installs a recurring process. The canonical debug-menu entry explicitly invokes both constructors; their rendered Coin Get prefixes do not prove coin-HUD use.

The DevText wrapper forwards `(21, 24, 0, 17, 0, 11)` to `DevText_Setup`, invokes `un_80304138` only on a non-null result, and returns that result unchanged. Camera and pool setup occur inside the callee before nullable rendering-GObj creation, so a null return is not a no-side-effects guarantee.

Evidence: [descriptors](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/if_2FF2.c#L19-L87), [constructors and wrapper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/if_2FF2.c#L233-L261), [debug-menu caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmmovieend.c#L54-L64), [DevText setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/textdraw.c#L301-L324).

### Outcome

Retain 78 existing facts and all 31 links explicitly through the checkpoint ledger. Four exact layout/section claims remain unresolved because appropriate compiled or ABI-layout evidence was not supplied. No supported semantic correction or meaningfully better replacement warrants a knowledge write.

Status: synthesized; independent review and live promotion pending.
