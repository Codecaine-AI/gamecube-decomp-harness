## Smash Coin implementation

This unit implements value-driven spawning and the runtime lifecycle of Coin Battle's physical Smash Coins. The header declares its public helpers, callbacks and state table. Canonical and rendered versions of both owned files were reviewed completely in the inherited research; rendering reported no parse errors. Existing descriptive names remain supported, with historical spelling and prefix consistency deliberately left uncertain.

### Construction and value flow

`it_802E5F00` prepares item-origin emission using supplied velocity, request `x10 = 0`, and request `x14 = 1`. `it_802E5F8C` prepares fighter-origin emission, wraps `π/2 + angle` into the inclusive 0–2π interval, derives facing, enables generated launch motion, and preserves the caller's independent per-item mode. The common descriptor initializer copies position, velocity and two distinct parent associations; it does not allocate an item.

`it_802E609C` repeatedly attempts allocation while the remaining value is nonzero. In generated-launch mode, the first successful allocation supplies attributes for a once-only adjusted budget. Per-instance initialization chooses among three configured tiers, subtracts the selected threshold, stores that threshold as collectible value, configures presentation, collision bounds and timers, and optionally initializes pickup tracking. The shared vertical launch scalar is multiplied in place for each generated coin; one random sample contributes to both velocity axes.

**Launch mode and runtime mode are independent.** Request `x10` controls budget adjustment and generated velocity; request `x14` becomes item-variable `x8`, which selects initial state 0 when exactly 1 and state 1 otherwise. The direct-velocity wrapper therefore selects state 0, not state 1. Allocation failure does not reduce the budget or exit the loop. The return local is assigned only during the first successful generated-mode adjustment; zero-budget requests and direct-mode returns have no initialized result in this source.

### Runtime states

The three table indices are distinct from their first-column animation identifiers, which are 0, -1 and 0. States 0 and 1 share vertical-speed-responsive animation and falling physics; only state 0 has a collision callback. State 2 uses the same lifetime helper through a separate animation adapter, empty physics, and terrain-support recovery.

The shared collision helper always synchronizes collision position and performs the bottom-adjusted terrain query. With impact response enabled, slow velocity, disabled restitution or the no-bounce flag stops motion. Otherwise the helper clears its terminal-contact result, conditionally reflects inward motion, applies attenuation and contact bookkeeping, and increments the landing count. Reflection itself requires an inward floor-normal dot product; the continuing branch can execute without reflection. Terminal contact enters state 2 and clears landing bookkeeping. Support loss in state 2 can restore state 0; the source retains a second mode read and an exceptional state-1 branch.

Lifetime expiration is tested before decrementing, so reaching zero during an update does not report expiration until the next invocation. Extra countdowns run only for item mode exactly 1. Pickup-transform initialization and accessory updates instead test nonzero mode. These tests must not be normalized into one Boolean interpretation.

### Cross-file ownership and lifetime

The accessory callback copies the current pickup-position sample to the previous sample before resampling the retained JObj's origin. Fighter pickup processing independently tests eligibility and overlap, reads the stored denomination, updates both current and cumulative coin totals, and destroys the collected item. The KO caller deducts half the balance before capping the amount passed to physical emission. The item-drop caller supplies mode/chance gating and optional launch velocity. Reference invalidation delegates matching-pointer cleanup, including source-player metadata reset, to the shared item helper.

The capacity helper conditionally requests removal of the last matching item in list order before allocation; this is not proof of age ordering or guaranteed allocation success. Its caller has no allocation-failure escape. No compiled artifacts were supplied, so section extents, consecutive compiled placement and constant-pool ownership remain unverified.

### Review outcome

The inherited fact ledger retains 133 facts, marks five compiled-evidence claims unresolved, and supersedes two explanations: the worker's conflated modes and the activation routine's reversed initialization ordering. All 52 existing links are retained. Independent lead checks support both proposed corrections and all five deferrals. No naming-only churn, entity changes or link merges are proposed.

Status: synthesized; independent review and live promotion pending.
