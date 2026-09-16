## Victim-side Master Hand capture transitions

This unit defines two transition helpers and eight empty phase callbacks. The header declares the same ten functions. Canonical and rendered views were reviewed completely; proposed names are hypotheses, not independent evidence.

### Capture release
`ftMh_CaptureWaitMasterHand_80155D1C` obtains the supplied fighter, clears invisibility, negates facing, and calls `ftCo_CaptureCut_Enter` unconditionally. Cancel and TagCancel supply Master Hand's stored victim and own countdown/command gating. CaptureCut separates the pair, chooses ground velocity versus airborne horizontal self-velocity, and enters `ftCo_MS_CaptureCut`. Pair cleanup can also conditionally correct position and ground/air status. The inferred `Release` suffix is plausible, not a recovered original name.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandthrownmasterhand.c#L13-L19; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackdisappear.c#L224-L235; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandtagrockpaper.c#L151-L161; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_CaptureCut.c#L24-L196.

### Thrown-state entry
`ftMh_CaptureWaitMasterHand_80155D6C` accepts an unused `s32 arg1`. It follows the supplied fighter's `victim_gobj`, copies that linked participant's facing, clears `mv.mh.unk4.x0`, and requests `ftCo_MS_ThrownMasterHand` with arguments `0, 0.0f, 1.0f, 0.0f, 0`. It then reveals the fighter, installs `ftCo_800DE508` in `accessory1_cb`, calls `ftCommon_8007E2F4(fp, 511)`, and calls `ftAnim_8006EBA4(gobj)`. Neither object dereference has a local null guard. The unknown move field and numeric 511 are not assigned stronger meanings here.

Squeeze-associated Throw, Slam, and TagSqueeze call this shared setup at command events. Their later victim-null checks do not protect the preceding helper call. Subsequent throw processing belongs to those callers; ordinary Throw and TagSqueeze reverse damage-facing afterward, whereas the inspected Slam path does not. TagSqueeze also has a boss-condition-or-animation-end exit. The supplied state argument does not select the helper's destination because it is unused. The inferred `ThrownMasterHand_Enter` name is supported by the explicit transition, not by its rendered substitution.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandthrownmasterhand.c#L29-L42; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandsqueezing.c#L53-L82; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandslam.c#L21-L40; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandtagrockpaper.c#L80-L106.

### Periodic callbacks and evidence limits
Both CaptureWaitMasterHand and ThrownMasterHand provide empty Anim, IASA, Phys, and Coll callbacks with `void(HSD_GObj*)` signatures. They do not consume their parameters, implement mash handling, integrate movement, test collisions, or transition states. This is a local statement: it does not exclude engine-wide or accessory processing. The installed accessory callback's lifetime and ultimate clearing are outside this unit.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandthrownmasterhand.c#L21-L50; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandthrownmasterhand.h#L6-L16.

Source literals do not prove `.sdata2` extent, placement, ordering, or relocation provenance. No compiled artifacts were supplied. All five pool-subject facts therefore remain unresolved rather than being promoted from source-level observations.

Status: synthesized; independent review and live promotion pending.
