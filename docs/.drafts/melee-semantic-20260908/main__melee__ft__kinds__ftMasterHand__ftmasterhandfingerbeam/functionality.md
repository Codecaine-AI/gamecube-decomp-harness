## Master Hand FingerBeam

The owned C file implements FingerBeam startup, active-loop setup and completion, and a static ending-state initializer. The header declares the externally visible callbacks and helpers; the static ending initializer is intentionally absent. The unrelated, empty `ftMh_Poke1_Coll` definition belongs to the Poke callback family despite its placement here.

### State and resource flow

- `ftMh_MS_359_80152BCC` enters `ftMh_MS_FingerBeamStart`, calls `ftAnim_8006EBA4`, and initializes three audio-handle slots (`x28`, `x2C`, `x30`) to -1. It does not explicitly initialize the four laser slots.
- Startup animation completion calls `ftMh_MS_361_80152CD8`, which enters `ftMh_MS_FingerBeamLoop`, performs animation setup, installs `ftMh_MS_362_80152E28` as `accessory4_cb`, and sets `cmd_vars[0]` to 1.
- The accessory callback returns when the command is zero. Otherwise, it obtains positions from `FtPart_RLegJA`, `FtPart_BustN`, `FtPart_LHandN`, and `FtPart_L3rdNa`, passes each position as both position arguments to `it_802F0340`, and stores four Master Hand laser objects in `x34` through `x40`. It starts sounds 320004–320006 with arguments 127 and 64, retains their handles, and clears the command. This is one-shot per arming, not a guarantee that all allocations succeed; neither this callback nor the inspected constructor supplies a local allocation-failure recovery branch.
- Loop animation completion first invokes static `ftMh_MS_362_80152F80`. That helper enters `ftMh_MS_FingerBeamEnd`, calls animation setup, keys off the three retained audio handles, and restores their -1 sentinels. The caller then requests termination of four laser objects and clears their fighter-held slots.

These operations are explicit in [the canonical implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandfingerbeam.c#L19-L137). The three entry calls use flags 0, animation start 0, speed 1, blend 0, and a null final object argument; parameter types are declared in [fighter.h](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.h#L44-L48). Numeric fragments in legacy helper names are not evidence of current motion-state values.

### Recurring callbacks

Both physics callbacks delegate unconditionally to `ft_80085134`, which sets self velocity X from animation translation Z multiplied by facing direction and self velocity Y from animation translation Y ([callee](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125)). Both IASA callbacks query the player slot and call `ftBossLib_8015BD20` only for classification zero. The named Poke analog supports the human-slot interpretation, but [the shared hook is empty](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34). Neither path implements an effective interrupt here. Startup and loop collision callbacks are empty.

### Cross-file lifetime and exceptional branches

Laser construction attaches an item model to the selected owner joint. `it_802F046C` is a null-safe termination-request setter, not immediate removal. The item animation callback may first restart its state, resetting that request, before testing it; if the request survives, it detaches the model and returns true ([item implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmasterhandlaser.c#L50-L116)). Thus fighter-slot clearing must not be equated with confirmed object destruction.

Damage entry provides another cleanup route: it clears the command, requests termination of the four laser slots, clears those slots, and keys off the three audio handles before changing state. Unlike normal FingerBeamEnd entry, this inspected route does not reset those audio slots to -1 ([damage implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhanddamage0.c#L29-L67)). Broader owner destruction and callback-reset guarantees are not established by this pass.

### Naming and evidence limits

The rendered Start/Loop `_Enter` names agree with canonical state-selection behavior but remain inferred names. Rendered helper names do not independently prove semantics; in particular, the rendered Crazy Hand IASA label does not establish Crazy-Hand-specific behavior. Both owned rendered views reported no parse errors. Existing Laser Nail and Tri-Poke associations are retained as baseline terminology consistent with the canonical mechanics, not as newly recovered public names. No compiled artifacts were available to prove `.sdata2` size, contents, placement, or literal sharing.

Status: synthesized; independent review and live promotion pending.
