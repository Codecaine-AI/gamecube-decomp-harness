# dballoc Semantic Findings

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`.

## main/melee/db/dballoc:.data

Carries the source-header filename diagnostic emitted for assertion paths in the inlined object-allocation helpers used by the limiter; it is compiler-owned diagnostic data rather than mutable limiter or gameplay state.

- fact:1b7bbdf4-6e0b-4bd2-a83e-019b30d13a76 @ 2026-09-04T22:36:54.095Z: supersede inferred_type. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:68b84dcd-9a67-44a1-afb4-9d726c41da32 @ 2026-09-04T22:36:54.095Z: retain purpose. Pinned implementation and independently read supporting source substantiate the inherited claim.

## main/melee/db/dballoc:.sbss

Stores two persistent software latches that select enable versus disable branches for the developer allocation limiter. Setup resets the latches without changing actual allocator limits or enforcement flags.

- fact:4bde065e-484e-4875-b448-170a5b80632d @ 2026-09-04T22:36:54.095Z: supersede data_flow. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:4cf88e99-e37a-4cbd-855d-f5d3ad142a4f @ 2026-09-04T22:36:54.095Z: supersede game_mapping. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:26aa7a5d-cd85-42aa-8657-12201765ac11 @ 2026-09-04T22:36:54.095Z: retain inferred_name. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:b437b09d-1343-47d9-afb5-0e61a9d5394a @ 2026-09-04T22:36:54.095Z: supersede inferred_type. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:6c1d2a3a-29ed-4275-9b86-e8e4f21a6635 @ 2026-09-04T22:36:54.095Z: supersede purpose. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:5b60460c-9683-41b4-884e-a5faeff8e2d0 @ 2026-09-04T22:36:54.095Z: retain state_behavior. Pinned implementation and independently read supporting source substantiate the inherited claim.

## main/melee/db/dballoc:.sdata

Canonical signature, section or parameter uses reviewed.

- fact:ca8a0206-eef9-41d7-b737-1f548e95dab1 @ 2026-09-02T05:00:28.352Z: supersede inferred_type. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.

## main/melee/db/dballoc:fn_SetupObjAllocLimiter

Initializes the debug object-allocation limiter's two software toggle latches, establishing the state from which the effect-allocator and HSD particle/SRT allocator groups are subsequently toggled.

- fact:dcce4627-0929-4195-9ed2-7c2b1d818555 @ 2026-09-04T22:36:54.095Z: supersede data_flow. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:62833c32-8284-4503-aee6-438538f332e1 @ 2026-09-04T22:36:54.095Z: retain game_mapping. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:573c5705-23d5-4349-80e7-6e829c4b75bf @ 2026-09-02T00:19:40.897Z: retain inferred_type. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:d8f2dfc7-9e74-4a25-8647-f3c206c64985 @ 2026-09-04T22:36:54.095Z: retain purpose. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:4dcd9554-d8c4-4df3-bf73-8870169884ec @ 2026-09-04T22:36:54.095Z: retain state_behavior. Pinned implementation and independently read supporting source substantiate the inherited claim.

## main/melee/db/dballoc:fn_UpdateObjAllocLimiter

Processes hidden debug controller shortcuts that toggle object-count limits for the effect allocator or for a group of three HSD particle/SRT allocators, freezing each enabled limit at that allocator's peak usage observed so far.

- fact:61aeeb9c-3b29-4665-a9b0-a5648ba65888 @ 2026-09-04T18:18:29.003Z: retain data_flow. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:a3e7479f-5ee5-4ee4-9783-c5286a752e63 @ 2026-09-04T18:18:29.003Z: supersede game_mapping. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.
- fact:6fe11066-c3ee-4863-a28d-9352d8d0e703 @ 2026-09-04T18:18:29.003Z: retain inferred_type. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:64bf25b0-5faf-42eb-a20a-09fcbb466db0 @ 2026-09-04T18:18:29.003Z: retain purpose. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:6616e309-4564-412d-8b41-1694b48ba0f1 @ 2026-09-04T18:18:29.003Z: supersede state_behavior. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.

## src/melee/db/dballoc.c

Provides debug setup and controller-driven updates for imposing or removing runtime object-allocation limits on the effect allocator and three particle or SRT-related allocators.

- fact:bc52f915-4c01-4931-b733-1b2cef567742 @ 2026-09-06T03:12:01.317Z: retain data_flow. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:0ab917d2-759b-419c-a628-9028433be530 @ 2026-09-06T03:12:01.317Z: retain game_mapping. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:3fe0f1ea-73c0-46eb-90b6-46681c84714a @ 2026-09-06T03:12:01.317Z: retain purpose. Pinned implementation and independently read supporting source substantiate the inherited claim.
- fact:f1f9f7f2-96f7-419c-9a11-84993c2d19ca @ 2026-09-06T03:12:01.317Z: supersede state_behavior. Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.

## main/melee/db/dballoc:fn_UpdateObjAllocLimiter#r3

Canonical signature, section or parameter uses reviewed.

Canonical int player parameter is forwarded unchanged to button accessors; no ungrounded register alias added.

