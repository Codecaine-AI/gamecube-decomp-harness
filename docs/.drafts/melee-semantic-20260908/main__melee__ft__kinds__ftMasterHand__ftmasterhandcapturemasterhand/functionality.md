## Master Hand victim-side capture handling

The translation unit defines four empty CaptureMasterHand callbacks, an entry helper for CaptureDamageMasterHand, and its animation-side mash callback. All accept `HSD_GObj*` and return void. The empty Anim, IASA, Phys and Coll bodies perform no local work; they do not establish global immobility, collision immunity or noninterruptibility. The owned header declares those four callbacks and the entry helper, but not the damage animation callback. [Implementation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandcapturemasterhand.c#L15-L44); [header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandcapturemasterhand.h#L1-L13).

### Entry and setup

Master Hand's Squeeze entry supplies its `victim_gobj` to `ftMh_CaptureMasterHand_80155B80`. That helper resolves the Fighter, unconditionally enters `ftCo_MS_CaptureDamageMasterHand` with arguments `0, 0, 1, 0, 0`, sets invisibility and `x2220_b3`, installs `ftCo_800DB464` in `accessory1_cb`, calls `ftCommon_8007E2F4(fp, 511)`, sets `x2220_b3` again, and calls `ftAnim_8006EBA4`. No local guard, timer initialization or alternate path appears. The repeated flag write is preserved. The inferred name `ftMh_CaptureDamageMasterHand_Enter` is independently supported by the canonical destination, not by rendered substitution. [Caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandsqueeze.c#L18-L32); [setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandcapturemasterhand.c#L23-L34).

### Mash processing and staged handoff

`ftMh_CaptureDamageMasterHand_Anim` first calls `ftCommon_GrabMash(fp, p_ftCommonData->x3A8)`. Only when the resulting `grab_timer <= 0` does it call `ftMh_CaptureDamageMasterHand_80155C94(gobj)`, followed by `ftMh_MS_381_8015483C(fp->victim_gobj)`. There is no additional local transition while the guard is false and no null check. The linked object is read after the first helper call, not cached beforehand. [Timer callback](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandcapturemasterhand.c#L36-L44).

This is not immediate release of both participants: the first helper enters `CaptureWaitMasterHand` and keeps the victim invisible. The second enters Master Hand's `Cancel`, initializes a separate timer and command flag, zeros velocity, and sets a movement target. `Cancel_Anim` later invokes another victim handler when its decremented timer is nonpositive and its command flag is set; animation completion has a separate branch. The held-object relationship therefore remains relevant beyond this unit's timer-expiration callback. [Victim intermediate state](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandcapturedamagemasterhand.c#L18-L27); [Cancel sequence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandbackdisappear.c#L208-L235).

### Evidence limits

Rendered views parsed successfully, but helper renamings remain hypotheses unless independently checked. The Crazy Hand analogue uses numeric state `0x151` and omits the first flag write; structural similarity does not independently decode that numeric state. No compiled artifacts were supplied, so no section layout, constant placement or ABI-register conclusions are made for `.sdata2` or the `#r3` subjects.

Status: synthesized; independent review and live promotion pending.
