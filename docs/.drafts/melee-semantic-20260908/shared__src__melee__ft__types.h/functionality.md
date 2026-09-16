## Shared fighter type declarations

This header defines fighter data structures rather than executable gameplay algorithms. `FighterPartsTable` provides joint/part mappings; `ftCommonData` contains shared tuning fields and explicitly remains incomplete. `ftData` connects attributes, parts, animations, dynamics, hurtbox initialization, camera, item and sound resources. `ftCo_DatAttrs` declares character movement and gameplay attributes. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.h#L43-L555 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.h#L557-L769.

`MotionState` declares animation, input, physics, collision and camera callbacks. Supporting declarations cover bones, smash charging, costumes, animation resources and auxiliary flags. `CpuFighter` contains controls, two eight-entry move queues with separate counts, thirty input/position records and command-script storage. These declarations do not establish callback execution order or queue processing behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.h#L771-L1086.

`Fighter` aggregates identity, motion, physics, attributes, rendering, buffered input, collision and damage state, item references, shield/reflect/absorb records, CPU state, timers, callbacks and flags. Its character-variable union `u` is distinct from motion-variable union `mv`; their reset and persistence rules require implementation evidence. Distinct damage, hitlag and death callbacks must not be collapsed into one lifecycle hook. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.h#L1126-L1806.

The remainder declares script bitfields, model callbacks, dynamics resources, Kirby hat resources, IK state, damage-log records and an unknown next-linked record. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/types.h#L1808-L1948.

## Semantic assessment

All canonical and rendered pages were reviewed in the inherited research. The lead reconciled the hash-bound handoff, functionality document and empty proposal. The rendered view made zero substitutions and supplies no independent semantic confirmation. Existing tentative comments, unknown members, numeric-state ambiguities and provisional arrays remain tentative. Source `ASSERT_SIZE` expressions and offset annotations are not treated as verified compiled-layout evidence. No executable branches or cross-file resource lifetimes are established by this header alone.

Subjects and links enumeration both returned empty. There are no baseline facts or links to retain or correct, and no supported naming or explanation improvement warrants a proposal. The handoff contains no non-retain dispositions or contradictions requiring targeted source checks. Source-only layout, capacity, runtime-semantics and lifecycle deferrals are accepted rather than converted into unsupported facts.

Status: synthesized; independent review and live promotion pending.
