## FingerGun2 transition unit

The implementation contains two state-entry routines, two local inline dispatch wrappers, and the exported Anim/IASA/Phys/Coll callbacks. The header declares all six exported routines with `void(HSD_GObj*)` signatures. Both owned canonical and rendered files were reviewed completely; rendered substitutions were treated as hypotheses, not independent evidence.

### Entry and cross-file lifetime

`ftCh_GrabUnk1_8015ABD0` enters numeric motion state `0x16D`, calls `ftAnim_8006EBA4`, and initializes `mv.ch.unk0.xC` to `(da->xCC_pos.y, da->xD4, 0)`. `ftCh_GrabUnk1_8015AC50` similarly enters `0x16E` and initializes `(da->x18, da->x1C, 0)`. Both motion changes use flags zero, frame zero, playback speed one, zero blend, and NULL. Neither entry directly initializes `x18` or `x20`. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandfingergun2.c#L19-L39.

The neighboring FingerBeamEnd callback clears all three self-velocity components before invoking the `0x16E` entry when animation expires. Its initializer previously sets `x20` to zero. The registered callback `fn_80159288` instead clears velocity, sets `x20 = true`, clears `x221E_b6`, and invokes the `0x16D` entry. These establish the selector's cross-file producer/consumer relationship without treating every non-one value as a Boolean failure. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandfingerbeam.c#L119-L134 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandfingerbeam.c#L243-L251.

### Completion and exceptional branches

Anim does nothing while animation frames remain. On exhaustion, `x20 == 1` calls `ftCh_Init_801592D4`; every other value calls `ftCh_Init_80158F34`. Canonical callee definitions establish state `0x16F` alongside the BackAirplane1 family and state `0x172` alongside BackPunch. The latter is not entry into FingerBeam despite residing in the fingerbeam source file. The BackAirplane1 initializer forwards `victim_gobj` to its preparation helper without a local NULL check and rewrites the destination. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandfingergun2.c#L41-L62, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandbackairplane1.c#L21-L37, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandfingerbeam.c#L152-L187.

### Input, movement, collision

IASA forwards the unchanged object to `ftBossLib_8015BD20` only for `Gm_PKind_Human`; every nonhuman classification skips that hook. This proves human-slot support, not debug/test intent. Phys first obtains translation-derived XY velocity from `ft_80085134`, then overwrites XY through `ftBossLib_8015BE40`. The latter computes destination minus current position. If distance is strictly below `da->x14`, it writes zero to move-local `x18` and uses the remaining XY displacement directly. Otherwise—including equality—it writes the measured distance and normalizes/scales displacement by distance times `da->x10`. `x18` is an output, not an accumulated input. These helpers do not write Z velocity, and Phys performs no explicit state transition. Coll is completely empty; unlike neighboring BackAirplane1 collision code, it does not stop velocity when `x18` is zero. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandfingergun2.c#L64-L81, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_084E.c#L120-L125, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L57-L80.

### Evidence boundaries

The entry name `ftCh_FingerGun2_Enter` remains plausible for `ftCh_GrabUnk1_8015AC50`, not a proven unique name covering both numeric states. Exact motion-table registration was not established here. Player-facing Laser Nail, Reverse Throw, and Power Punch mappings remain unresolved rather than being proved by rendered names or frozen assertions. Source literals establish zero/unit usage but do not establish `.sdata2` size, contents, placement, or loads. No compiled layout or opcode-matching claim is made.

Status: synthesized; independent review and live promotion pending.
