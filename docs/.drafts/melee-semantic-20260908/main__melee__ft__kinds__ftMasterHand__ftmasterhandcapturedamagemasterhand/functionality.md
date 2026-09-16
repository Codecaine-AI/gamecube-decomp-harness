## CaptureDamageMasterHand

The owned C file defines three empty `void(HSD_GObj*)` callbacks: IASA, physics, and collision. They ignore their arguments and perform no local updates, checks, or transitions. This does not imply that the entire capture state lacks updates.

`ftMh_CaptureDamageMasterHand_80155C94` is an unconditional state-entry helper. It obtains the Fighter, calls `Fighter_ChangeMotionState(gobj, ftCo_MS_CaptureWaitMasterHand, 0, 0, 1, 0, 0)`, sets `invisible`, calls `ftCommon_8007E2F4(fp, 511)`, sets `x2220_b3`, and calls `ftAnim_8006EBA4`. It contains no guard or alternate branch. The proposed name `ftMh_CaptureWaitMasterHand_Enter` describes this canonical behavior but is not proof of original spelling. The rendered `ftAnim_Advance` name was not used to establish callee semantics. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandcapturedamagemasterhand.c#L12-L27)

The header also declares `ftMh_CaptureDamageMasterHand_Anim`, whose implementation is in the neighboring capturemasterhand file, not this unit. That implementation calls `ftCommon_GrabMash`, tests `grab_timer <= 0`, transitions the current object through this helper, then separately passes `fp->victim_gobj` to `ftMh_MS_381_8015483C`. If the comparison is false, neither transition occurs. This is progression into capture-wait, not demonstrated release from capture. The helper does not explicitly clear the linked-object pointer or the accessory callback installed by the preceding capture-damage initializer; their subsequent lifetime depends on external state machinery. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandcapturedamagemasterhand.h#L6-L10) [Neighbor](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandcapturemasterhand.c#L23-L44)

No numeric motion-state identity, detailed meaning of mask 511 or `x2220_b3`, compiled literal-pool layout, or named-attack reachability is established by these reads.

Status: synthesized; independent review and live promotion pending.
