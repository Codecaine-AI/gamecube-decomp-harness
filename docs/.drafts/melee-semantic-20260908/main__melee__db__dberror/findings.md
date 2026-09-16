# dberror Semantic Findings

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`.

## main/melee/db/dberror:.sdata

Supplies the short OSReport format literal used by both crash callbacks to print the build timestamp before they emit stack, exception, debug-level, and processor-context diagnostics.

- fact:a837f4e5-6913-49b9-a2a8-f00bf68ff966 @ 2026-09-04T18:25:15.921Z: retain data_flow. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:4743daf1-55b0-4a79-a5b7-29408732f281 @ 2026-09-04T18:25:15.921Z: retain game_mapping. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:5d6b6d34-e423-407f-ac2f-5f9f552a4cb3 @ 2026-09-04T18:25:15.921Z: supersede inferred_type. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:b0ac8c8d-01bd-42c1-ae69-f6c562527c1f @ 2026-09-04T18:25:15.921Z: retain purpose. Pinned implementation and independently read supporting source substantiate the inherited claim.

## main/melee/db/dberror:db_ClearFPUExceptions

Masks saved FPSCR with 0x000FFFFF and reloads the current FPU context after setting MSR mask 0x900. This precisely clears stored high twelve FPSCR bits while retaining low twenty; it should not be interpreted as clearing every possible exception-related FPSCR field.

- fact:98fe4684-b1cc-44e6-9ad8-822a9fd292de @ 2026-09-02T00:23:02.340Z: supersede data_flow. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:747e47bd-389a-4976-adf5-2cc77a8f90da @ 2026-09-04T18:25:15.921Z: retain game_mapping. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:9623db44-21d9-4943-9f8f-35297a04026c @ 2026-09-02T00:23:02.340Z: retain inferred_type. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:f087a667-4d90-4bb7-aaf3-fcaad3392732 @ 2026-09-02T00:23:02.340Z: supersede purpose. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:753173c9-c2ae-4315-8a9d-425973dec695 @ 2026-09-02T00:23:02.340Z: supersede state_behavior. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.

## main/melee/db/dberror:db_SetupCrashHandler

Configures Melee's fallback crash-handling path when no external debugger is attached by allocating diagnostic workspace, registering the game's HSD panic callback, and installing its OS-exception callback for the supported error-number set.

- fact:62484edd-40c4-4e73-a042-7d1e6cead9d0 @ 2026-09-02T00:22:55.874Z: retain data_flow. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:624b461c-2324-497a-9493-b229e511791f @ 2026-09-02T00:22:55.874Z: retain game_mapping. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:09145734-00ce-4a54-a9de-2539c74c2638 @ 2026-09-02T00:22:55.874Z: retain inferred_type. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:e40e5faf-90d5-4f43-892f-7a05d4fe2d95 @ 2026-09-02T00:22:55.874Z: retain purpose. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:13c67bd4-d46a-4a0d-8765-1fc081fc73a2 @ 2026-09-02T00:22:55.874Z: supersede state_behavior. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.

## main/melee/db/dberror:fn_HSDPanicHandler

Handles an HSD panic by quiescing user video-retrace hooks and assembling crash diagnostics for the internal exception console, including the build timestamp, a stack trace, and the active debug level.

- fact:508d3e0c-e713-4060-8fde-85dfbaba6e7e @ 2026-09-02T00:22:30.883Z: retain data_flow. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:14ff7aef-00ab-466a-938b-4a352b70edb0 @ 2026-09-02T00:22:30.883Z: retain game_mapping. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:f3895466-2f28-4615-8952-9024b3ddb32d @ 2026-09-02T00:22:30.883Z: retain inferred_type. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:3396b55c-fe56-480c-934e-33a7a86a09a0 @ 2026-09-02T00:22:30.883Z: retain purpose. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:13446135-75fb-41b8-949e-318a272b9878 @ 2026-09-02T00:22:30.883Z: supersede state_behavior. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.

## main/melee/db/dberror:fn_OSErrorHandler

Handles a selected operating-system exception by stopping user retrace callbacks and feeding build, stack, exception-register, debug-level, and processor-context information into Melee's internal exception-reporting console.

- fact:fc446d1f-adf4-46c8-87fc-ad86ad0444e8 @ 2026-09-01T23:16:56.426Z: retain data_flow. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:794b25de-b5b4-47f5-b019-e79d5458b679 @ 2026-09-01T23:16:56.426Z: retain game_mapping. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:ea98fe5a-516a-4307-a0c1-32c02f1d277b @ 2026-09-01T23:16:56.426Z: retain inferred_type. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:febae4a8-ecec-4be7-b7ef-5764275757e2 @ 2026-09-01T23:16:56.426Z: retain purpose. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:432bb92b-2a56-4bc7-ac47-5932fb933c87 @ 2026-09-01T23:16:56.426Z: supersede state_behavior. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.

## src/melee/db/dberror.c

Centralizes low-level error handling for the game's debug subsystem: it clears pending floating-point exceptions, implements panic and OS-exception diagnostic callbacks, and installs those callbacks when no external debugger is present.

- fact:db29f7f1-cdcf-4a73-919c-845a64cf2bb9 @ 2026-09-06T16:49:50.986Z: retain data_flow. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:8267e1b8-f352-4ccd-a3ec-27bdd286e96b @ 2026-09-06T16:49:50.986Z: retain game_mapping. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:621310fb-2d88-430c-9ab8-12c4d8567da3 @ 2026-09-06T16:49:50.986Z: retain purpose. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:c016c0ad-7b95-436e-aca3-d099e7cd1dfd @ 2026-09-06T16:49:50.986Z: supersede state_behavior. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.

## main/melee/db/dberror:fn_HSDPanicHandler#r3

Canonical signature, section or parameter uses reviewed.

Canonical callback parameter uses read; no speculative register-to-parameter naming fact added.

## main/melee/db/dberror:fn_OSErrorHandler#r3

Canonical signature, section or parameter uses reviewed.

Canonical callback parameter uses read; no speculative register-to-parameter naming fact added.

## main/melee/db/dberror:fn_OSErrorHandler#r4

Canonical signature, section or parameter uses reviewed.

Canonical callback parameter uses read; no speculative register-to-parameter naming fact added.

