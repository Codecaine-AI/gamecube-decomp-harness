## Shared library type declarations

`src/melee/lb/types.h` defines shared data records rather than executable routines.

- **Combat and environment collision:** hit/hurt capsules, victim arrays, reflector/absorber/shield descriptors, ECB sources and collision history/contact surfaces. The hit-capsule owner and grabbed-victim flag are union alternatives, not independent storage. The reflector comment specifically describes behavior value 1 as skipping ownership change; this header does not establish other values' behavior. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L15-L240.
- **Resource and presentation state:** allocation-list nodes, preload entries and current/new scene caches, camera blur data, snapshot metadata, and color/light overlay state. These declarations do not establish allocation ownership, release ordering, preload state transitions, or callback execution. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L242-L397.
- **Dynamics descriptors:** partially understood transform records, a polymorphic descriptor union, linked dynamics records and fixed-capacity container declarations. Unknown and explicitly inferred fields remain uncertain. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L399-L520.
- **Command representations:** bitfield payloads for action state, hitboxes, graphics, audio, animation, smash charging and wind effects, collected through the `CmdUnion` pointer in `CommandInfo`. Fighter and item hitbox payloads have distinct declarations and must not be treated as interchangeable. `CommandInfo` also declares timing, loop and return-pointer fields; its return-array length is explicitly provisional. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L522-L1018.
- **Small utility records:** shadow pointer/flags and signed-byte two-dimensional vectors. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L1020-L1034.

## Semantic assessment

All canonical and rendered pages were reviewed. The rendered view makes zero substitutions and therefore introduces no alternate names to validate. No baseline subjects, facts or links exist for this assignment, and no supported KB correction is proposed. Existing unknown names and declaration-level caveats are preserved. Source offset comments and `ASSERT_SIZE` declarations are not treated as verified compiled layout evidence.

Status: synthesized; independent review and live promotion pending.
