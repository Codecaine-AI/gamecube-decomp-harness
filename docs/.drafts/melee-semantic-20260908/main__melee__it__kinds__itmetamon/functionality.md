## Metamon controller

The implementation defines a three-entry item-state table, a file-local cached `Item_GObj*`, and a one-float special-attribute view. The header declares all implemented callbacks and the state table; canonical and rendered declarations agree.

Spawn initialization reads the special-attribute float, passes it to `it_80279CDC`, enters state 2 through `it_802D31B4`, calls `Item_8026AE84` with `0x2728, 0x7F, 0x40`, and caches the original object. The cached pointer has no read or clearing operation in this unit; its assignment does not establish ownership or extend object lifetime.

### State behavior

- **State 0 / animation ID 0:** animation processing returns the inverse of `it_80272C6C`; physics is empty; collision delegates to `it_8026E15C` with the empty `it_802D306C` response and returns false.
- **State 1 / animation ID 1:** has the same local callback behavior as state 0. No local transition selects state 1. Its visible phase and external reachability remain unspecified.
- **State 2 / animation ID -1:** is selected during spawn. Animation delegates appearance scaling to `it_80279FF8` and returns false. Physics invokes `it_8027A09C`, discarding its completion boolean. That helper applies movement before testing the appearance timer; an expired timer restores normal scale and returns true, while a positive timer is decremented and returns false.
- **State-2 collision:** delegates through `it_8027A118` to `it_8026E4D0`. The shared implementation refreshes terrain data and position, handles contact masks, and invokes the supplied response on its floor-contact path. The response resets velocity and requests state 0 with `ITEM_ANIM_UPDATE`. The shared collision routine subsequently restores normal scale using the model pointer captured before the response. `it_8027A118` always returns false, including when the response changes state.

The reference event forwards both objects to `it_8026B894` and discards its owner-match result. That helper independently clears matching ownership and interaction references, resetting source player to 6 when the primary fighter reference matches. It does not clear the separate file-local cached pointer or change Metamon's motion state.

### Semantic assessment

The rendered names `itMetamon_Logic19_Spawned`, `itMetamon_Spawn_Phys`, and `itMetamon_UnkMotion2_CollCallback` fit canonical initialization, table registration, and callback flow. Remaining numbered motion names appropriately preserve uncertainty; table indices must not be confused with animation identifiers or chronological phase order. Existing Ditto/METAMON historical context is retained from the frozen baseline, not independently established by rendered names or this source alone.

Two changes are proposed: remove an unsupported compiled small-BSS characterization from the pointer's type explanation, and document the useful cross-file collision guard, fixed return value, and post-response scale restoration. All other baseline facts and links are explicitly retained in the checkpoint ledger.

Status: synthesized; independent review and live promotion pending.
