# Fighter Action Commands

Draft review of `main/melee/ft/ftaction` at `c302741689bd67c361cd7faadb221df3193992c3`. This unit interprets fighter subaction commands against animation time. Handler functions decode command fields, update fighter state or request work from collision, animation, sound and other subsystems, and advance the command cursor.

## Three Interpreter Paths

All three entry points derive `frame_count` from `cur_anim_frame + x898_unk`. They read the fighter-owned `x3E4_fighterCmdScript`, decrement a non-sentinel timer by `frame_speed_mul`, and process commands that are due. The common `Command_Execute` gets the first chance to handle an opcode. Unhandled opcodes use an index rebased by 10.

| Entry Point | Fighter-Specific Operation |
|---|---|
| `ftAction_80073240` | Calls the primary handler table `ftAction_803C06E8` |
| `ftAction_80073354` | Calls alternate table `ftAction_803C07AC`; clears throw flags on entry and after selected timing changes |
| `ftAction_8007349C` | Advances the cursor using `ftAction_803C0870`, without calling fighter-specific handlers |

The alternate table is not a blanket skip path. It shares many handlers with the primary table and replaces selected handlers with skip or modified handlers. The third path still executes common commands, so describing it as a no-op would also be wrong. See [tables](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L174-L210) and [interpreter bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1318-L1420).

The loops stop for a null cursor, a positive timer, or the `F32_MAX` sentinel/frame-boundary conditions. A sentinel timer is not decremented. Frame-count writes happen before the null-cursor check. The code does not locally validate the rebased table index, so any valid-opcode guarantee belongs to the script producer or common decoder.

## Handler Behavior

The initial GFX handler decodes five cursor units, with an invisible-fighter path that delegates to the five-unit skip handler. Its source retains uncertainty about the offset/range coordinate mapping; the review preserves the actual assignments rather than resolving them from parameter names.

Hitbox creation accesses the selected `x914` entry, conditionally enables and initializes it when disabled or when the hit group changes, assigns its joint, size, offsets and combat fields, and advances through the payload. The skip condition depends on a packed flag and the thrown-hitbox owner pointer. Both paths reach `ftCommon_80080484` afterward. The code reads a `create_hitbox_5` field after its fifth cursor advance. That access must not be rewritten as a sixth consumed word without validating the encoded layout. See [creation and skip paths](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L232-L367).

Other handlers set command variables, throw bits and interrupt state, request collision-state changes, or modify jab-related flags. Their exact guards matter: the jab-combo handler sets its flag when the payload is not disabled or `x197C` is non-null, and does not clear it on the opposite branch. Many skip handlers only advance the cursor. See [state handlers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L425-L572).

The middle group handles audio, model parts, visibility and the indexed `xDF4` collision records. Later handlers request texture/part animation, rumble, color animation and dynamic-bone work, update additional fighter fields, or apply damage. A paired part-animation handler passes zero instead of the payload's third value, so it is a modified execution path rather than a pure skip. See [model and collision requests](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L660-L745) and [later requests](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L977-L1135).

The sound-effect handler advances three cursor units for behavior values 0 through 6 and 10 through 15, but only two for the default branch. Its paired skip handler always advances three. These paths agree for the supported behaviors; the code does not prove that arbitrary behavior values preserve identical stream alignment. See [audio command branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L574-L658).

## Dependencies and Review Boundaries

`Command_Execute` owns shared script instructions. The fighter, lb command and command-union headers own shared structure definitions. Collision helpers own the effects of delegated hit/hurt operations; audio, animation, part, dynamics and common-fighter modules own their subsystem behavior. This TU can establish arguments, control flow, assignments and callback selection without assigning new names to shared fields or claiming full downstream policy.

The paired header exports six selected handler entry points and all three interpreter entry points. Private declarations and the dispatch tables remain in the C file. Existing canonical source symbols stay unchanged. The review proposes only KB facts and descriptive aliases, independently reviewed and promoted by root.

## Corrected Inherited Claims

The indexed collision-disable pair is `ftAction_80071784` and its alternate skip handler `ftAction_800717C8`; the inherited throw-flag names conflate this operation with separate flag handlers. The alternate rumble skip is not restricted to throws. Later payload-type corrections distinguish encoded integer bitfields from float callee arguments. The demonstrated consumer of `x2225_b2` is Purin/Jigglypuff auxiliary-model rendering, so the previous Peach attribution is superseded. Exact evidence and fact versions are recorded in [fact-dispositions.json](fact-dispositions.json).

Independent-review repair: the 26-bit command operand assigned by ftAction_80072B14 is narrowed into a one-bit field. The two inherited no-transformation/boolean claims are unresolved. The 49-write proposal remains unchanged.

Additional width-review deferrals: 80072B3C data_flow and 800730B8 data_flow/inferred_type remain unresolved because payload and destination widths differ.

Further retained-claim deferrals: 80071B50 inferred_type and 80071FC8 data_flow/inferred_type require packed-width and random-selection domain qualifications.

## Reviewed final render

Root promoted 49 reviewed facts to the live KB. [Final-render receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftaction/final-render.json) records the exact reviewed rendered pages; [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftaction/staged-completion.json) and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/39f7eeb57ca3c07905facea68058ba1265c7427fbd5c7e29bf705bfd7010b9e7/2026-09-08T14-53-20.501Z-e2765be9-c3d0-4bf8-b19b-c8309c0493dc.receipt.json) establish application. Final-render SHA256: `a7953950af3b598ef78beb0c1efc018b9270620057f9bd30afa316e4166ca5c7`. Canonical source remains unchanged.
