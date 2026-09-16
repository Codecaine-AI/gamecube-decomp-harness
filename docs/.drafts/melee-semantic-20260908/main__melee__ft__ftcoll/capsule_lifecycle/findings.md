# Capsule lifecycle review

Draft at `c302741689bd67c361cd7faadb221df3193992c3`. UTC 2026-09-08T14:44:58Z to 2026-09-08T14:50:58.364641Z. Complete canonical and separate rendered reads: C2973-3762, H1-108, DOX1-112. No read/render failures or parser errors. AB48/AB80 belong to this assignment, confirmed by the TU lead. 39 owned targets, 63 empty parameter entities, 230 owned existing facts.

## Target findings

- `ftColl_8007AB48` (2973-2977): Resolves the fighter's primary pending damage-collision log by invoking the shared damage resolver with the Fighter's primary result storage and with hit-effect generation enabled. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2973-L2977.

- `ftColl_8007AB80` (2979-2985): Resolves the fighter's pending phantom-hit tip log into secondary damage-result storage. It initializes secondary knockback to zero, invokes the shared greatest-knockback resolver with hit-effect generation disabled, and preserves the resulting knockback in a separate Fighter damage field. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2979-L2985.

- `ftColl_8007ABD0` (2987-3003): Updates a fighter-owned attack HitCapsule from a new integer base-damage value. Before committing the capsule fields, it adjusts that value for non-default fighter size and active smash-attack charge, stores the resulting pre-stale integer damage in `unk_count`, applies the attacking fighter's stale-move multiplier, and stores that final effective damage in `damage`. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L2987-L3003.

- `ftColl_8007AC68` (3005-3013): Classifies an encoded knockback angle for fighter damage processing, accepting configured ordinary-angle values while rejecting the special 361 encoding and values outside the configured interval. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3005-L3013.

- `ftColl_8007AC9C` (3015-3026): Assigns a fighter HitCapsule's knockback angle and, when that angle belongs to the engine-configured special downward-angle window, records the category once for the owning fighter's player statistics. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3015-L3026.

- `ftColl_8007AD18` (3028-3066): Updates one fighter attack hitbox's world-space position history from its joint attachment and local offset, initializing coincident interpolation endpoints when newly enabled and advancing them on subsequent updates. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3028-L3066.

- `ftColl_8007AE80` (3068-3075): Updates every fighter-owned attack HitCapsule, maintaining the world-space capsule positions and position history needed by subsequent fighter collision processing. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3068-L3075.

- `ftColl_8007AEE0` (3077-3080): Re-enables positional updating for a fighter's shield collision region by clearing its `skip_update_pos` flag, allowing the joint-attached shield volume to be refreshed after fighter physics changes the fighter's position or pose. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3077-L3080.

- `ftColl_8007AEF8` (3082-3085): Enables positional updating of a fighter's reflector collision region by clearing the reflector record's position-update suppression flag. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3082-L3085.

- `ftColl_8007AF10` (3087-3090): Marks the fighter's absorption collision region as needing its position refreshed, allowing an active bone-attached absorption volume to follow the fighter after physics movement. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3087-L3090.

- `ftColl_8007AF28` (3092-3099): Invalidates the cached world-space endpoint positions of every hurt capsule owned by a fighter, causing subsequent hurtbox processing to recompute each capsule from its current bone transform. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3092-L3099.

- `ftColl_8007AF60` (3101-3110): Updates the world-space positions of every fighter dynamics-hit collision record so the fighter's dynamic-bone solver can test its secondary-motion chains against collision geometry attached to the current model pose. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3101-L3110.

- `ftColl_8007AFC8` (3112-3115): Disables one selected ordinary fighter attack hitbox. It is the indexed counterpart to the neighboring all-hitbox cleanup routine and allows an action script to end one hitbox while leaving the fighter's other hitboxes unchanged. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3112-L3115.

- `ftColl_8007AFF8` (3117-3125): Disables the fighter's complete set of ordinary attack hitboxes and clears the fighter-level flag indicating that any such hitbox is active. It is the shared collision cleanup used by action scripts, motion-state changes, death processing, and other systems that must retire a fighter's current attacks. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3117-L3125.

- `ftColl_8007B064` (3127-3135): Reactivates one indexed fighter attack hitbox as a fresh hitbox: it enables the selected HitCapsule, clears both of its recorded-victim histories, and marks the fighter as having active ordinary hitboxes. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3127-L3135.

- `ftColl_8007B0C0` (3137-3150): Bulk-updates a fighter's hurtbox collision state. It applies one `HurtCapsuleState` to every configured hurt capsule, clears each capsule's position-update skip flag, and synchronizes a fighter-level flag indicating whether the capsules are in a non-enabled state. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3137-L3150.

- `ftColl_8007B128` (3153-3172): Sets the collision state of the first fighter hurt capsule attached to a specified model bone, allowing animation commands and move-specific code to change the vulnerability of an individual body region. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3153-L3172.

- `ftColl_8007B1B8` (3175-3187): Activates and configures a fighter-owned shield collision region from a `ShieldDesc`, registering the callback to invoke when that region intercepts a collision. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3175-L3187.

- `ftColl_8007B320` (3215-3254): Initializes a newly constructed fighter's runtime collision data from its character assets. It builds the complete default hurt-capsule array and a parallel set of bone-attached dynamics-hit records, resolving every asset bone index to the corresponding model joint. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3215-L3254.

- `ftColl_8007B4E0` (3256-3276): Restores all of a fighter's runtime hurt capsules from the fighter-data hurtbox descriptors: it rebuilds their model-joint attachments and geometry, enables them, resumes automatic position updates, and clears the fighter flag indicating that its hurtboxes had been specially configured. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3256-L3276.

- `ftColl_8007B62C` (3292-3307): Sets the fighter's whole-body hurtbox interaction state and starts the color-animation profile representing the selected normal, invincible, or intangible state. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3292-L3307.

- `ftColl_8007B6A0` (3309-3316): Enables an untimed, full-fighter collision-immunity state and starts its associated fighter color-animation cue. Unlike the neighboring duration-based helper, it marks the state as persistent until the paired clearing routine removes it. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3309-L3316.

- `ftColl_8007B6EC` (3323-3340): Removes the fighter-wide persistent hit-status override established by `ftColl_8007B6A0`, restores the effective status from remaining timed sources when appropriate, and clears color-animation ID 9 when that overlay is currently active. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3323-L3340.

- `ftColl_8007B760` (3342-3350): Grants or extends temporary whole-fighter intangibility and requests its associated fighter color-animation cue. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3342-L3350.

- `ftColl_8007B7A4` (3352-3360): Applies or extends timed full-fighter invincibility and starts its associated color-animation cue. If stronger timed intangibility is already active, the routine preserves that effective state instead of downgrading it. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3352-L3360.

- `ftColl_8007B7FC` (3362-3370): Activates the fighter-side timed status granted by touching a Super Star: it enables the status, installs the item's configured duration, starts profile 107, and begins the associated counted audio mode when the duration exceeds the music-ending threshold. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3362-L3370.

- `ftColl_8007B868` (3372-3383): Returns the fighter's effective fighter-wide collision-immunity level by combining a Boolean protection flag with two explicit status fields and selecting the strongest active level. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3372-L3383.

- `ftColl_8007B8A8` (3385-3389): Detaches a HitCapsule from its model joint and copies the supplied vector into b_offset. It does not immediately write the current or previous world-space endpoints; those are maintained by the separate position-update lifecycle. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3385-L3389.

- `ftColl_8007B8CC` (3391-3397): Assigns ownership and player-side attribution to a fighter's thrown hitbox by recording the responsible fighter object and copying that fighter's team and player ID. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3391-L3397.

- `ftColl_8007B8E8` (3399-3410): Removes references to a fighter GObj from every other active fighter's thrown-hitbox owner field during fighter teardown, preventing collision records from retaining a pointer to the departing fighter. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3399-L3410.

- `ftColl_8007BA0C` (3436-3454): Processes registered ground devices that can initiate a fighter-side bury-subsystem interaction. For the supplied fighter, it tests each present device for current eligibility and activity, then dispatches the common Fighter response for every successful interaction. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3436-L3454.

- `ftColl_8007BAC0` (3468-3507): Runs the fighter-side stage-dynamics interaction pass. It queries registered ground devices for applicable collision descriptors and, when the fighter is eligible to receive a new response, dispatches those descriptors to the common environmental-collision handler before checking the fighter's current floor, ceiling, and wall contacts for an additional surface-provided descriptor. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3468-L3507.

- `ftColl_8007BBCC` (3509-3538): Calculates the total Lip's Stick flower-effect amount produced by the current fighter collision log. It sums Lipstick-element hit damage from fighter-owned hit capsules and effective damage from item-owned hit capsules so the caller can apply or extend the struck fighter's flower status. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3509-L3538.

- `ftColl_8007BC90` (3544-3625): Finds the eligible item with the smallest absolute horizontal distance among items overlapping an active fighter catch capsule. It scans item availability, ground/air targeting, history and hurtbox overlap, records each overlapping item, and stores the best target; equal distances keep the first candidate. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3544-L3625.

- `ftColl_8007BE3C` (3634-3758): Finalizes a fighter's deferred pending-damage event when its delay expires without applied knockback. It subjects the stored damage to the fighter's finite absorption pool, admits any accepted or overflow damage into pending percent and applied-damage state, attributes fighter- or item-sourced damage to stale-move, combo-count, and match-statistics bookkeeping, and spawns the impact effect selected by the stored damage element. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3634-L3758.

- `ftColl_CreateAbsorbHit` (3205-3213): Creates and enables a fighter's projectile-absorption collision region by attaching it to a descriptor-selected model joint and copying the region's radius and local offset into the fighter's absorb-hit state. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3205-L3213.

- `ftColl_CreateReflectHit` (3189-3203): Activates and configures a fighter's reflector collision region from a ReflectDesc, registering the callback to invoke when a reflection hit is detected. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3189-L3203.

- `ftColl_GetWindOffsetVec` (3414-3434): Computes the total environmental wind displacement affecting one fighter for the current update by summing vectors from every applicable active ground device. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3414-L3434.

- `ftColl_HurtboxInit` (3278-3290): Initializes one fighter hurt capsule from a hurtbox descriptor, attaches it to the descriptor-selected model joint, enables it for collision processing, and marks the fighter as having updated hurtbox state. Status: reviewed. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcoll.c#L3278-L3290.

## Invariants and contradictions

B128 changes only the first matching bone and neither invalidates its position cache nor clears the aggregate flag when enabling it. Shield, reflect and absorb constructors replace geometry without clearing skip_update_pos. HurtboxInit also leaves that cache flag untouched; B4E0 explicitly clears it and rebuilds only the current runtime hurt count. BC90 resets target_item_gobj and best distance, not x1A64 or x221B_b6, and records all overlapping items while choosing by absolute X distance. BE3C computes the integer pending amount before absorption; exact exhaustion stays absorbed, strictly negative pool becomes excess damage. The fighter caller establishes delay-expired/no-applied-knockback timing.

The renderer alias ftColl_GetHitStatus for B868 conflicts with the canonical local inline at C3456. A distinct qualified alias is proposed for independent review. Current canonical named functions CreateAbsorbHit, CreateReflectHit, GetWindOffsetVec and HurtboxInit are preserved. DOX is historical evidence: B868 bool differs from s32, HurtboxInit capsule type differs, AC68 signed angle differs from u32, B128 omits its Fighter argument, AF60 is unresolved there, and B8A8 position wording is broader than its immediate writes. These are source-family followups, not canonical edits.

## Dispositions

{'unresolved': 80, 'retain': 141, 'supersede': 9}. 9 substantive corrections proposed. Unresolved dispositions preserve baseline history and explicitly avoid asserting foreign specifics as re-attested. All 63 owned parameter entities had zero facts. No ABI speculation promoted.
