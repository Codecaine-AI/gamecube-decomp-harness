## OSLink semantic review
Canonical and rendered OSLink.c were reviewed through all 379 lines, together with both baseline subjects and the empty link ledger. Seven facts remain supported; one requires correcting “non-returning” to “returns no value.” The existing __OSModuleInit name fits its behavior. The renderer made no substitutions and reported 14 parse errors, so canonical source supplies the behavioral evidence.

The unit maintains a module queue and optional module-name string-table base. __OSModuleInit unconditionally clears both queue endpoints and the string-table pointer; OSInit calls it within its one-time initialization guard. Resetting independently would discard registrations without unlink processing. OSSetStringTable simply replaces the pointer.

OSLink asserts the module version, enqueues the module, clears caller-provided BSS, rebases metadata and populated sections in place, assigns BSS space to nonempty zero-offset sections, and adjusts defined entry-point offsets and optionally the module name. It processes import ID zero with a zero symbol base, then attempts relocation in both directions with registered modules, including self-relocation once. Entry-point addresses are adjusted, not invoked. Notification functions are empty hooks.

Relocate supports ADDR32, ADDR24, ADDR16/LO/HI/HA and REL24 patches, plus NONE and Dolphin control records. SECTION records select the destination and trigger data-cache flush/instruction-cache invalidation for the previously selected executable section; the final executable section is also maintained. Missing matching imports return FALSE. Unknown relocation types are reported but do not abort processing. OSLink ignores helper return values and returns TRUE.

OSUnlink dequeues first and repairs references in survivors. Undo clears supported absolute patch fields; REL24 targets the importing module's unresolved handler when defined, otherwise its displacement field is zeroed. It performs analogous executable-section cache maintenance. OSUnlink ignores helper return values and returns TRUE. It does not free module/BSS storage, invoke the epilog, restore rebased metadata, or reconstruct original relocation values.

The fixed cached offsets are explicit source declarations, not conclusions about compiled section placement. Both relocation walkers advance an initially uninitialized destination pointer before SECTION establishes it; this review does not infer malformed-stream safety or compiled behavior from that source pattern.

Status: synthesized; independent review and live promotion pending.
