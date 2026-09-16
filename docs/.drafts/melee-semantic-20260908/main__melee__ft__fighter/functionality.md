# Fighter runtime semantic sweep

## Scope and evidence

Revision: `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical/rendered file, subject and link coverage is inherited from the hash-bound librarian handoff. This distinct lead independently checked every proposal's cited source and the handoff's contradiction evidence. Supported existing knowledge is retained; unchanged research dispositions are inherited rather than rewritten. Rendered names remain hypotheses, not independent proof of callee behavior.

## Shared resources and lifecycle

The module initializes six allocation descriptors, loads `ftLoadCommonData` from `PlCo.dat`, publishes 23 common-data pointers, and initializes the spawn counter. Spawn allocation returns the old counter and repairs a wrapped next value of zero to one. Symbolic allocation sizes and C declaration order are not compiled-layout evidence.

`Fighter_Create` allocates a fighter GObj, Fighter state and attribute backup, attaches the destructor, sequences character/costume/model-related setup, invokes optional OnLoad setup, obtains camera/shadow infrastructure and installs ordered processing callbacks. It runs the shared reset orchestrator and selects startup helpers through the exact kind, transformation and player-flag branch ladder, preserving the no_normal_motion assertion branch. Its final `ftLib_800867E8` call resets input and sets `x221D_b4`; it is not final fighter-library registration. The helper's canonical evidence is **ftlib.c lines 377–382**, not 383–388.

Initial load transfers allocation/player configuration, selects costume and motion tables, initializes input samples and sentinel counters, and delegates attribute setup. Runtime reset initializes broad transient state but must not be described as directly clearing every velocity. The reset orchestrator is also used during creation, so its name does not restrict it to a death event. A common cross-file handoff resets a destination fighter before overlaying live state; its particular character attribution remains deferred.

Unload calls the optional kind removal hook, performs subsystem cleanup, clears asynchronous effects, releases dynamic bones and model/light resources, and frees auxiliary allocations before Fighter state itself.

## Motion entry and scheduled processing

Motion entry assigns the requested motion, performs conditional cleanup, selects a descriptor, initializes timing and conditionally loads animation and command state. `FreezeState` zeroes playback speed only inside the valid-animation-ID branch. A subsequent no-animation result clears the explicitly shown animation state. Descriptor anim/input/phys/coll/cam callbacks are installed; accessory slots **1 and 4** are cleared here, not slots 2 and 3. The duplicated `x594_b0` test and standalone `!fp` expression are preserved as canonical source oddities.

Timer processing handles separately gated hitlag/damage timers and queued applications. `ftCo_800C37A0` runs **before** both queue-draining loops. Application dispatch can fail eligibility or refresh existing state, so queue consumption is not synonymous with a new transformation.

Status processing records positional displacement, maintains timers and attachments, applies guarded damage/recovery, invokes kind/instance callbacks and advances animation under a separate gate. Exceptional expiration branches can return early. Metal expiration is tested only while `metal_timer` is nonzero. The magnify counter is preserved when its outer guards fail; it resets only under its inner failed condition or after damage.

CPU processing is scheduled and gated by fighter state and a canonical CPU-eligibility predicate. The dispatcher calls five phases in order and increments `cpu.x7C`; historical offsets and all phase-specific gameplay roles remain unverified.

## Input, physics and presentation

Input reset installs neutral samples and 0xFE/0xFF timer sentinels. Scheduled input processing preserves sample history, chooses controller or CPU values, filters analog values, synthesizes logical button bits, computes edges and maintains saturating timing counters. Tap-jump and short-hop/jumpsquat mappings require their action consumers.

Physics integrates self velocity, ordinary and attacker-shield knockback, animation contributions, environmental motion and wind under distinct gates. The inherited source review records the explicit cross-vector assignment that clears ordinary knockback Y in the low-magnitude airborne shield-knockback branch; it is not silently corrected. Map processing maintains the ECB lock and brackets collision callback work with joint-position synchronization.

Root-model scaling combines runtime and character scale with an optional X override. Flat Zone chooses an external configured value, otherwise 1.0f; its magnitude is not established here. A separate routine constructs a root-scale correction matrix. Grounded pose work has an additional global enable gate for both leg branches, but not root rotation.

Accessory processing selects callbacks according to hitlag state, flushes asynchronous effects, animates the accessory hierarchy and conditionally stores a camera-offset-adjusted minimum height. Camera preparation reconstructs additive transient shifts before optional callback dispatch. Neither this minimum nor callback naming alone proves all downstream presentation effects. Player publication forwards position, prior position and facing; persistent bonus semantics remain deferred.

## Contacts, damage and linked state

Grab/contact processing prioritizes fighter victims and returns before the item branch. The item path dispatches an opaque helper and optional callback; acquisition semantics require further evidence. A separate scheduled collision pipeline forwards only a strictly positive final result to a common attachment helper. Earlier helper side effects still occur for a non-positive result. Complete flower/Lip's Stick and hitbox-specific mappings remain deferred.

Ordinary damage processing updates percent under its guard, reduces active auxiliary health pools, caps percent at 999 and publishes player accounting. Player storage uses a transformation-indexed accumulated-loss value. The secondary damage helper has independent gating and fallback arguments; its complete Coin Battle interpretation is not promoted from rendered names.

Randomized eligible-item operations pass a zero vector and scalar to `Item_8026ABD8`, whose body stores the scalar and invokes the dropped callback. `x1980` is an object pointer, while `x2018` is its countdown; the scalar's 'mode' interpretation is unverified. `x18F0` accumulation feeds gradual percentage recovery, but specific pickup callers remain deferred.

Hitlag entry/exit invokes optional callbacks and coordinates linked fighters through `x1A5C` and `x2219_b7`. A marked propagated-exit request consumes the marker even if SDI or a remaining timer prevents immediate exit. Hit processing preserves prioritized reaction branches, shield accounting, hitlag calculation and transient-result cleanup.

## Naming and proposal outcome

Retain supported existing names and explanations without equivalent-wording rewrites. The four supported proposals preserve the motion-entry correction and three constructor explanations. Only the three erroneous constructor helper citations are repaired. No new entities, links, merges, register mappings or compiled-section claims are proposed.

Status: synthesized; independent review and live promotion pending.
