## Game & Watch Turtle article

This unit implements the separately spawned Turtle article associated with Mr. Game & Watch's back aerial. The constructor selects `It_Kind_GameWatch_Turtle`, initializes a spawn descriptor, and attaches a successfully created item to the requested fighter part using its special attributes. Failed creation returns NULL without accessing attributes or attaching anything. Fighter-side setup supplies the left-shoulder position and part, tracks the returned object, and installs lifecycle callbacks only on success.

The two state-table rows have animation IDs 0 and 1, share `itGamewatchturtle_UnkMotion1_Anim`, and have null physics and collision callbacks. Pickup always clears `xDAC_itcmd_var0`, but requests state 0 and advances animation/script only when an owner exists. `it_802C7158` unconditionally requests state 1 with `ITEM_ANIM_UPDATE`. Its landing-role name is supported by its caller, but that caller explicitly checks `ftGw_MS_LandingAirN`, not `LandingAirB`; the source comment's explanation remains speculative. Ordinary back-aerial landing must not be assumed to execute the state-1 request.

The shared animation callback returns true immediately for an ownerless article. With an owner, it delegates to the fighter predicate, which returns false within the inclusive numeric interval `ftGw_MS_AttackAirB` through `ftGw_MS_LandingAirB`. Outside that interval it notifies the owner and returns true. The generic item animation dispatcher consumes true as a destruction request; this is not an animation-end test.

The destroyed callback only notifies a present owner. Explicit removal additionally guards the resolved Item userdata, notifies a present owner before common teardown, and still tears down a live ownerless item. Fighter notification exits hitlag for tracked aerial articles before clearing the Turtle reference and damage/death callbacks; it does not clear every fighter callback. The fighter's explicit removal path subsequently calls the same bookkeeping cleanup again.

Hitlag wrappers forward unchanged pointers without local guards. Canonical fighter entry/exit callers independently support the rendered names. Generic entry sets `xDC8_word.flags.x3`; exit conditionally sets x5 when x7 is set and clears x3. Landing entry also exits article hitlag before choosing dedicated landing continuation versus basic landing and cleanup.

The event callback forwards both objects to reference invalidation and discards its Boolean result. Matching owner, reflector, absorber, source-fighter, auxiliary-fighter and toucher references are cleared; source-fighter removal also assigns source player 6. The callback itself neither changes motion state nor destroys the article. Its surrounding generic removal loop can separately destroy an item using the owner captured before invalidation and flag x13; otherwise owner loss permits later lifetime completion.

Existing inferred names are retained as semantic descriptions, not recovered historical spellings. Both owned canonical and rendered files were read completely. The header renderer reports `shadowed_binding` for the spawn declaration, leaving it canonical while the implementation is renamed. No compiled section placement or literal-pool contents are established by this review.

Status: synthesized; independent review and live promotion pending.
