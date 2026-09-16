## DownBound and DownWait

The module implements knockdown impact entry, floor-dependent presentation, and timed prone recovery. The HipN query selects a flag-dependent matrix component and tests whether it is positive; ordinary DownBound entry optionally inverts that result before selecting DownBoundU/D. The pose-sensitive initializer instead compares horizontal and vertical component magnitudes. Equal magnitudes take its alternate-response branch, which requests impact feedback and an additional large quake before choosing between two handlers using the facing-direction product.

Impact audio uses the planar magnitude of combined self and knockback velocity, multiplied by fighter weight. Floor lookup can supply material-specific sounds, replace default effect 1031, and suppress common audio. Failed lookup preserves defaults; absent individual mappings use sentinels. The sound selector repeats the x1F4 comparison, making table entry 2 unreachable. Effect and camera requests are unconditional; controller feedback has downstream admission guards. The floor-oriented effect wrapper is also used by ShieldBreakDown, and FlyReflect shares the weighted sound selector and table. Synchronous helper invocation does not establish the lifetime of spawned effects.

The public impact entry clears downspot.x4 after dispatch; the DownReflect entry does not. DownBound's IASA callback is empty. After animation completion, recovery priority is buffered attack, directional recovery, then DownWait. The shared directional predicate tests specifically for DownWaitU, so invocation from DownBound follows its D-variant branch.

Normal DownWait entry initializes the float countdown from common data and preserves incoming Bound/Spot orientation. Return from grounded DownDamage selects matching DownWait without reinitializing the shared countdown. DownWait decrements it while x2224_b2 is clear, but tests expiration outside that guard, permitting an already-expired timer to trigger standing even while decrement is suppressed. Input priority is attack, directional recovery, then neutral standing. Both physics callbacks delegate friction followed by grounded movement.

Collision explanations retain the exact GA_Ground comparisons rather than silently interpreting them as loss of ground. DownBound can attempt guarded DownReflect on the other branch; DownWait delegates its possible Fall transition to the common helper.

## Semantic assessment

Existing supported knowledge is retained in the inherited research ledger. Corrections distinguish the private standard initializer from the public Enter dispatcher, restore its internal-linkage description, and clarify the float countdown. Compiled data-section size, placement, alignment, and literal-pool composition remain unresolved without compiled evidence. The rendered C view reports an Enter name collision and a shadowed HipN predicate binding; the header substitutions succeed. Rendered names were assessed against canonical behavior, not treated as independent proof.

Status: synthesized; independent review and live promotion pending.
