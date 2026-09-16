## Crazy Hand TagGrab/TagSqueeze

The unit defines one initializer and five callbacks; the header declares all six with `void(HSD_GObj*)` signatures. Canonical and rendered views were read completely. Rendered helper names were treated as hypotheses rather than independent evidence.

### Initialization and lifetime boundaries
`ftCh_GrabUnk1_8015ADD0` clears `cmd_vars[0]`, zeros all self-velocity components, passes four stored object pointers to `it_802F046C`, and then nulls those four fields. It passes three stored audio handles to `lbAudioAx_800236B8` without clearing the handle fields. When `mv.ch.unk0.x20` is nonzero, it forwards `victim_gobj` without a separate null check. It initializes y/z velocity from `x12C_pos.x`/`x134_pos.x`, converts `x13C_pos.x` to the integer duration, requests numeric state `0x181`, invokes animation processing, starts two opening sound calls, and clears event counters `x60`/`x64`. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtaggrab.c#L22-L60).

The victim helper independently restores visibility, reverses facing, and enters CaptureCut. Thus this entry path can end a prior victim capture; it does not itself establish a new capture. The caller relies on the `x20`/victim-pointer invariant. [Victim helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandcapturewaitcrazyhand.c#L23-L29).

### Animation and exceptional cases
`ftCh_TagGrab_Anim` and `ftCh_TagSqueeze_Anim` have identical bodies. Each nonzero script event increments `x60`; sound `0x81652` is requested while that counter is within `x124`. Only after exceeding that threshold does `x64` increment, with sound `0x81653` limited by `x128`. Once both limits are exceeded, an event can produce no sound, but the command variable is still cleared.

With positive duration and no animation frames remaining, either callback requests numeric state `0x182` and invokes animation processing. It then unconditionally predecrements the shared duration and calls `ftCo_800D4F24(gobj, 0)` only when the result is exactly zero. An initially zero duration is not an immediate-expiration case; it becomes negative. A duration of one can take both the animation-restart path and the expiration path in the same invocation. No timer or counter reset occurs in these callback bodies on repetition. [Both callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtaggrab.c#L62-L106).

### Input, physics and collision
IASA queries the player slot and calls `ftBossLib_8015BD20` only for a human slot; the pinned callee immediately returns. Physics unconditionally adds `x12C_pos.y` and `x134_pos.y` to y/z self-velocity, respectively, without changing x velocity, clamping, or requesting a state transition. Collision is an empty callback; this does not establish absence of collision processing elsewhere. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCrazyHand/ftcrazyhandtaggrab.c#L108-L124), [IASA callee](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L31-L34).

### Cross-hand coordination and evidence limits
Master Hand's corresponding callbacks observe Crazy Hand through `ftBossLib_8015C31C`, which tests numeric motion states `0x181` and `0x182`; Master Hand's squeeze callback also performs victim-facing thrown-state processing. This supports coordinated family membership, without assigning new enum names to the numeric states. [Master Hand](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftMasterHand/ftmasterhandtagrockpaper.c#L50-L106), [state observer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L188-L197).

The disabled-grab/tagnigiru mapping is retained as the frozen baseline's independent documentary attribution, not as a newly established reachability result. Source literals establish zero/one usage but do not prove the `.sdata2` target's size, layout, or provenance. All three section-target facts remain unresolved pending compiled evidence.

Status: synthesized; independent review and live promotion pending.
