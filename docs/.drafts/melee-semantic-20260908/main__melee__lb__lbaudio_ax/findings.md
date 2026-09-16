# Audio semantic findings

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Started 2026-09-08T15:04:46.568Z; completed 2026-09-08T15:21:09.125539+00:00.

## main/melee/lb/lbaudio_ax:.bss

Provides zero-initialized runtime storage for allocator-backed sound controllers, active-sound timers, SFX-bank planning and load bookkeeping, AR initialization, and AX reverb and delay processing.

- fact:2e2e58de-6274-4b9a-9318-33719e289316 @ 2026-09-04T21:10:27.870Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:51f55cc0-5880-4ec3-a7d0-ed925cce21d9 @ 2026-09-04T21:10:27.870Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5b55ff8b-ee17-48fa-af5d-976092456fb6 @ 2026-09-04T21:10:27.870Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9cf53c4b-914d-4654-b3dd-f3a74596ca55 @ 2026-09-04T21:10:27.870Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:.data

Stores initialized asset catalogs and mutable path buffers for character and stage SFX banks, HPS streams, per-bank ranges and sizes, and the load-state-dependent paired-ID mapping to or from bank 33 (kirbytm.ssm).

- fact:ecc843a0-4792-424c-9d20-031836e584d4 @ 2026-09-04T21:10:27.870Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:4cbf5a6d-9b88-4e5e-853f-207783ca8248 @ 2026-09-04T21:10:27.870Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:7d5b50ea-a516-44c9-a5a8-60733865321f @ 2026-09-04T21:10:27.870Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:61ef0c51-555a-4b6b-a34f-21a597c84f27 @ 2026-09-04T21:10:27.870Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:.sbss

Holds zero-initialized mutable control state for cached applied audio levels, pause and attenuation, timed persistent sounds, and SFX-bank capacity, resident-byte, and pending-byte accounting.

- fact:180874ad-4014-4e09-8a49-80a0169d9638 @ 2026-09-04T21:10:27.870Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:34724fe0-b344-404e-b92b-5ae9843435c0 @ 2026-09-04T21:10:27.870Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a1603d22-f21c-4d7d-b88a-9609d91d4d57 @ 2026-09-04T21:10:27.870Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:d9f53532-8671-4155-afbf-d723cafa70ba @ 2026-09-04T21:10:27.870Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:14c2e8bc-79ec-4cf5-917e-e03420a33bee @ 2026-09-04T21:10:27.870Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:.sdata

Stores initialized mutable state for the lbAudio mixer, including sound mode, master and category levels, multiplicative modifiers, auxiliary defaults, path-stem positions, and inactive persistent-sound identifiers.

- fact:27638f76-f310-40dc-8fc7-f4e4a7f3ddc9 @ 2026-09-04T21:10:27.870Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d9f20b6f-51ae-4bf4-8dcf-d256103eb59a @ 2026-09-04T21:10:27.870Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:dca57306-5eed-4570-94a3-550bb2121825 @ 2026-09-04T21:10:27.870Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:8ca31fcb-c47c-4d99-940b-2cd9a5a2fb5f @ 2026-09-04T21:10:27.870Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d61f3bd4-06a7-4bcd-aad0-d4a8ce0c2239 @ 2026-09-04T21:10:27.870Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:.sdata2

Provides read-only floating-point literals used by lbAudioAx for unity and zero defaults, attenuation factors, 7-bit normalization and clamping, and centered stereo pan.

- fact:a0bbe8c6-6766-4422-81cc-d2dd4d0db747 @ 2026-09-04T21:10:27.870Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a6ec3294-18d1-44ea-b834-9e5c9442564b @ 2026-09-04T21:10:27.870Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a109c776-c43f-487e-b7bb-cf8389f6712e @ 2026-09-04T21:10:27.870Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f086767e-0fa9-4744-8365-7ce012d2405d @ 2026-09-04T21:10:27.870Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:calcPan

Calculates a bounded 7-bit pan value for a timed sweep from the lesser of two configured endpoints toward the greater endpoint. This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.

- fact:2b28475f-c14e-4966-b3d9-d7b54dc6bf1f @ 2026-09-04T21:10:27.870Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:1e0203ac-6af6-4fae-8cee-a5a0bf71f6f0 @ 2026-09-04T21:10:27.870Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:53ff3411-c40b-4175-a8bc-31172ef228ee @ 2026-09-04T21:10:27.870Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:4dd56e05-f546-4f66-9596-f06e91fa3363 @ 2026-09-04T21:10:27.870Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:f4008b10-757d-410f-bde1-bcfac64c4ff2 @ 2026-09-04T21:10:27.870Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_80023254

Builds a descending size-ranked list of SFX banks belonging to one allocation category for startup capacity planning.

- fact:59611699-eaca-440d-a489-6163a72e31ec @ 2026-09-04T23:38:48.022Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e55f80fa-4036-4968-9e69-9f38f4da631a @ 2026-09-04T01:26:30.566Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3393c16e-db48-47c5-9aea-2abcb9626551 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:068ffbb1-8614-4f8f-ad59-a22bf1e91778 @ 2026-09-04T23:38:48.022Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3e684497-6557-491b-a47a-ee68bfa61372 @ 2026-09-04T23:38:48.022Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:15ca9791-a79c-4a12-919d-642c9f6f47ee @ 2026-09-04T23:38:48.022Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_80023750

Starts a sound effect through AXDriver after converting Melee's logical volume and pan to saturated byte-sized controls, forwarding the SFX ID, track, and channel, and returning the playback handle. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

- fact:a489f832-b038-4b3c-a6bc-47f83474e2cd @ 2026-09-04T21:10:27.870Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:a47beb57-4cf9-4dfe-b746-5f7810995fdb @ 2026-09-04T21:10:27.870Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3a74bcec-7a31-4609-a30b-865c68225052 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:702414b1-5d76-485a-bf0a-763661831806 @ 2026-09-04T21:10:27.870Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:9187fe1e-c8ed-41e4-919c-a2ae90400ddc @ 2026-09-04T21:10:27.870Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:3b408cee-bd5a-4b9d-bb37-29b5ff71e843 @ 2026-09-04T21:10:27.870Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_80023ED4

Adapts Melee-level streamed-audio parameters to AXDriver by converting logical volume to the byte scale, bounding the track selector, and delegating creation of the path-selected stream. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

- fact:aadbbb49-7bf0-4fa3-ab2d-ec85b2c7a135 @ 2026-09-04T21:10:27.870Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:b2faa521-f8b2-43cb-84dc-9983ea146d69 @ 2026-09-04T21:10:27.870Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9a1ce73c-8e9f-4eac-8938-3ca977af1b94 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:bf56afc5-bdbe-495f-8c5f-40123234bd48 @ 2026-09-04T21:10:27.870Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:ce3aca59-55fe-4099-ba32-03c804ad14f9 @ 2026-09-04T21:10:27.870Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:9ed45e37-33d7-402e-88ae-1c90dc5a28fc @ 2026-09-04T21:10:27.870Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_800244F4

Initializes lbAudioAx runtime controls to full-scale levels, unity modifiers, cleared caches and flags, and inactive identifiers, then reapplies the player's persisted music-versus-SFX balance.

- fact:c8d007b5-feb2-4041-999e-16ce30a0c278 @ 2026-09-04T21:10:27.870Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:cae178be-f1af-4356-bb91-7cdb19965baf @ 2026-09-04T21:10:27.870Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7b1913ba-01ff-4779-91c4-7326ef1825b5 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8de9553f-9d6a-41d5-9933-3e9463803b57 @ 2026-09-04T21:10:27.870Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:670b1a41-1da9-493e-b37e-285a2e6526c9 @ 2026-09-04T21:10:27.870Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:45f7e889-692a-481a-b28d-f3cacebb004e @ 2026-09-04T21:10:27.870Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_80024654

Recomputes and applies lbAudioAx's high-level mix, updating stream gain, four grouped-SFX outputs, and selected auxiliary sends while caching each applied result to avoid redundant maintenance writes.

- fact:6ba2a1f5-0523-4987-8ea7-41cd0a93c126 @ 2026-09-04T21:10:27.870Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9eb8a77a-27f4-4657-aea5-31c79c8aeb68 @ 2026-09-04T21:10:27.870Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:943841cf-0d85-4ff9-877d-2eb385f567fd @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9ec527e7-eef1-4f4a-b43a-ac8303e6dabb @ 2026-09-04T21:10:27.870Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:04c173b7-9da2-425e-bb62-d0d6b21d09e5 @ 2026-09-04T21:10:27.870Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:349d4872-daf4-4b2e-b778-9a62af8b86bc @ 2026-09-04T21:10:27.870Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_800251EC

Updates a sound object's stereo pan from its attached entity's horizontal world position relative to the camera's visible left edge, center, and right edge.

- fact:bb517653-64bc-4d7b-9c74-8cb25333a0b0 @ 2026-09-04T21:10:27.870Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ed5f3c47-b418-4ee1-b031-9bdeb1778880 @ 2026-09-04T21:10:27.870Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:160dcc3b-2b01-4934-9471-49d3c309ccbf @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0f7bddf1-33d9-47be-88fc-36cdd193ad0b @ 2026-09-04T21:10:27.870Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d7cb617e-82eb-46e4-aab0-fb665bf0a72f @ 2026-09-04T21:10:27.870Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:63a7ee39-a51f-4730-9da8-aac017acf38f @ 2026-09-04T21:10:27.870Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_800253D8

Updates a sound object's pan for the current point in a timed transition, optionally mirroring the calculated value across the 7-bit stereo range. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

- fact:4401d014-0a9e-44e5-ad25-e398a19d1705 @ 2026-09-04T21:10:27.870Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:43ad3b27-0451-49d6-8efe-09b2bed25748 @ 2026-09-04T21:10:27.870Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:6f28c720-bec4-4672-ba39-f05cebf5b055 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:bd5c3dd9-41f4-4eec-b87e-ce6646f44c34 @ 2026-09-04T21:10:27.870Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:bb8691f2-8a66-439b-a34d-76e14d95a1d4 @ 2026-09-04T21:10:27.870Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:80935d46-fda0-44ba-b6d6-59ded2f6071f @ 2026-09-04T21:10:27.870Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_800256BC

Updates a managed sound object's current 7-bit pan from its frame-based pan transition, choosing the direct or mirrored orientation according to `x3C`. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

- fact:d98c84d0-7737-403d-88f0-0461abb0fe11 @ 2026-09-04T21:10:54.178Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:92720ef4-a706-4662-9479-3826cfb572b5 @ 2026-09-04T21:10:54.178Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:e061a8cf-04ef-45db-8688-1f9c72a30a22 @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a3a337c4-53da-4990-9278-9ee9f47117d1 @ 2026-09-04T21:10:54.178Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:c01fa190-31d0-4ba7-bd21-e84b4782fc39 @ 2026-09-04T21:10:54.178Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_800259A0

Performs a one-time initialization of a managed sound object's camera-relative pan by latching the operation and delegating to the attached-entity pan updater.

- fact:6798c7e2-f5b4-4730-9fb4-e74ee83dcaf6 @ 2026-09-04T21:10:54.178Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e6c11f5e-6b84-483c-af8a-ee7cb9d9416b @ 2026-09-04T21:10:54.178Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d4f1a6dc-1482-4fa6-afab-58fd4abbad6c @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3c9e170f-b0b8-40f2-8c53-d46d8a46ae11 @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b3030d1a-fd15-4fe6-8893-c1b1df8754df @ 2026-09-04T21:10:54.178Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ae27942f-7c9e-4dbc-903e-b13eb7426b88 @ 2026-09-04T21:10:54.178Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_800259EC

Performs a one-time initialization of a sound object's directional pan by setting its initialization latch and invoking the shared frame-based pan updater. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

- fact:36c1dda9-5539-4bb0-8896-ba5e2a1cf066 @ 2026-09-04T21:10:54.178Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:6b1feb8c-58b1-4915-8215-10407b0d2a81 @ 2026-09-04T21:10:54.178Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:90ac4b5f-20ae-403e-96bc-7419a4777311 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c60dfdf4-67c0-4a1d-a763-7bee809de93e @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:29847d39-ba11-405c-8d1f-a9e8ab5b7193 @ 2026-09-04T21:10:54.178Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:e4048e9c-5ae4-4b80-a4fd-3a5a849a3b8b @ 2026-09-04T21:10:54.178Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_80025A98

Performs a one-time initialization of a sound object's directional pan by latching the operation and invoking the shared pan-transition updater. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

- fact:db1283a0-4e63-4a95-b578-fe1ef4a9ad48 @ 2026-09-04T21:10:54.178Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:4a304a48-5540-4a7b-a333-7c5d85400e97 @ 2026-09-04T21:10:54.178Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:4279ff07-047a-4a53-8e6f-af1c48cafa73 @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:2156e565-7274-4631-98ba-fd773f193050 @ 2026-09-04T21:10:54.178Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:fa38c844-bcc1-4189-93c3-98e324603117 @ 2026-09-04T21:10:54.178Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_80025B44

Updates a sound object's non-mirrored pan for the current point in a bounded frame-based transition between configured pan endpoints. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

- fact:3ac8c6a4-d054-4eef-a866-341b7c69def6 @ 2026-09-04T21:10:54.178Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:decb7c41-044d-467d-8280-28cc052382c7 @ 2026-09-04T21:10:54.178Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:41a90493-3005-42da-8a11-28f208099334 @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:2dca7009-3626-44e5-b24f-823360153dcb @ 2026-09-04T21:10:54.178Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:582b2e0d-9e88-4c28-bf6d-6c20179abdae @ 2026-09-04T21:10:54.178Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_80025CBC

Updates a sound object's mirrored pan for the current point in a bounded frame-based transition between configured pan endpoints. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

- fact:bc9e9904-0ebf-43cc-ae9d-fa34b74f441a @ 2026-09-04T21:10:54.178Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:d94b2047-2a26-471a-9a02-c6d23526df45 @ 2026-09-04T21:10:54.178Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:932d3629-00a7-4ee9-a7c5-1e0ca934b57b @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:560642c0-802f-4c90-8329-2d593ad131af @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c0c2890f-b4f0-4fae-b9f4-b679676ab8f6 @ 2026-09-04T21:10:54.178Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:ee618906-e87b-4858-8220-271930bdf3b8 @ 2026-09-04T21:10:54.178Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_80025E38

Computes a managed sound volume from frame/duration and endpoint difference, using start_vol + delta on the increasing branch and end_vol - delta otherwise; frame beyond duration yields 127. It does not generally interpolate between the two requested endpoints.

- fact:63f0edfd-535a-492c-bc77-d7f361024cab @ 2026-09-04T21:10:54.178Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:3387addb-204e-4747-8bca-ec8443845f98 @ 2026-09-04T21:10:54.178Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:0f2949a5-f9d2-453b-ab4a-b952bcb1695e @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9481e300-ce9b-42bf-bae0-48d3a5148870 @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:014a09ab-a204-4218-a6d7-89094b2c4692 @ 2026-09-04T21:10:54.178Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:f90e57d9-fdff-4e36-8700-fc8b78c1b7ca @ 2026-09-04T21:10:54.178Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_80025FAC

Initializes a newly created managed-sound GObj from a `SoundParams` packet and starts or adopts the sound-effect voice that the controller will manage.

- fact:6aa2bddb-b92d-4417-9742-7fbac75bdee7 @ 2026-09-04T21:10:54.178Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6654fb47-95d2-4901-aa89-a827b02a0145 @ 2026-09-04T21:10:54.178Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6f03979d-de0e-43bd-a1e5-76b8aeb96509 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0fe03b84-5f68-4fd3-92c4-33f5681425ff @ 2026-09-04T21:10:54.178Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:228f4a20-ba10-4f51-ac9f-3e3a73a2ff15 @ 2026-09-04T21:10:54.178Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:050fc1f4-77f4-4e32-a169-1e588e05a2f6 @ 2026-09-04T21:10:54.178Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_800262A0

Runs the per-tick process for an lbAudioAx-managed sound GObj by invoking its mode strategy, retiring it when that strategy completes, applying current pan and volume to a live voice, and ending or advancing its configured frame lifetime.

- fact:b297693e-ce48-4564-8359-530611e64004 @ 2026-09-04T21:10:54.178Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:71a42ae0-a963-4c95-9227-0622dc6bf1ee @ 2026-09-04T21:10:54.178Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8ae9b8f2-cd12-45ce-81b9-cbc6d23cda44 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:cd567253-7a3f-4c2a-a0bd-6025308f2173 @ 2026-09-04T23:38:48.022Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:77ad3c2a-5f24-41aa-a81c-5ef9f4b71152 @ 2026-09-04T21:10:54.178Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:bcbad00b-3633-471a-a54a-64d1e00657b9 @ 2026-09-04T21:10:54.178Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_80026650

Selects the next requested SFX-bank slot eligible for loading by scanning all 55 slots from priority 4 down through priority 0 and returning the first slot with `requested == 1` and `load_state == -1`; returns -1 if none qualifies.

- fact:d09e87ee-e302-46e4-81c5-422ee6d0059e @ 2026-09-04T21:10:54.178Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3ff1835b-ef74-49ce-aa17-b3aa6c8b7298 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:24d2aca4-76c3-4c61-b49c-50afb2865e31 @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c8e15468-af0d-468b-88da-267ed2808f5e @ 2026-09-04T21:10:54.178Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:707b483c-b687-4a57-9cce-99a598141bf7 @ 2026-09-04T21:10:54.178Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_800267B0

Evicts loaded but no-longer-requested SFX packages while loaded plus pending bytes exceed capacity, then compacts SFX bank 2 and waits for compaction to finish.

- fact:839041be-91d3-459d-a732-7c7c3f15e99d @ 2026-09-04T21:10:54.178Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b13fc1cf-2305-4bc4-a2c1-1696bf284275 @ 2026-09-04T21:10:54.178Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:005f6953-0fa4-420e-bd7a-d2e5816079c1 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:fe2644cb-e85e-4536-bee4-73c10a9bf7a0 @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:96bb1ed1-63b8-46a9-87d2-3eb2f87f0342 @ 2026-09-04T21:10:54.178Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:cdc4a159-41ef-49dd-a3c4-3714340d1594 @ 2026-09-04T21:10:54.178Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_800268B4

Recomputes aggregate byte counts for requested SFX banks, currently loaded banks, and requested-but-not-yet-loaded banks so the reload sequence can enforce its memory budget and decide whether eviction is necessary.

- fact:11494440-5385-441d-8499-6b84b68d99e2 @ 2026-09-04T21:10:54.178Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8a742a5e-762d-47ef-bdda-bc8bfafd4e98 @ 2026-09-04T21:10:54.178Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4046c1c1-d86f-47d8-8c30-11e3af32f936 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5cfde98c-2861-4e49-a698-8238580a9c0f @ 2026-09-04T21:10:54.178Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a4b30c81-ef4f-4757-b846-7bc82c3580b2 @ 2026-09-04T21:10:54.178Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a9104f65-3318-447e-89d5-7eab6520cad3 @ 2026-09-04T21:10:54.178Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_800269AC

Cleans up outstanding asynchronous sound-effect loads before SFX bank 2 is discarded. It retries cancellation for eligible tracked handles, waits for remaining work, unloads the bank, and invalidates affected tracking entries.

- fact:aad54a9e-2319-458f-a60a-3cefbb5ab404 @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a57d96f9-e37b-4b19-8ccb-a667fcc5ef5b @ 2026-09-04T21:11:38.998Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:43e6f492-9369-46a9-aff4-b4a644855265 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ba208704-bdd9-46e1-80de-0d0eedd2d342 @ 2026-09-04T21:11:38.998Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7ba24091-7b52-41a7-9cc0-5f0761ba0659 @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5a7ef3fc-4e33-4b1b-83a6-20008d2c60c6 @ 2026-09-04T21:11:38.998Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:fn_80026C04

Handles completion of one asynchronously loaded sound-effect bank and advances lbAudio's prioritized bank-loading chain. It records the completed slot, adjusts aggregate byte counters, selects the next requested bank eligible for loading, and submits that bank to HSD Synth with itself installed as the next completion callback.

- fact:a7b50bc2-e3b8-4be5-b484-7614c1e2b226 @ 2026-09-04T02:38:46.111Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:77271c40-add1-41ea-b267-1bcb02d5a362 @ 2026-09-04T02:38:46.111Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7a7ceee8-f0af-401b-acac-35feefce5664 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c8a149b8-ca52-4759-8831-ecf0bbb7bb75 @ 2026-09-04T02:38:46.111Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:30690d53-2cd9-4e5a-a62e-475d9f1c7619 @ 2026-09-04T02:38:46.111Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:968c8b03-7fd4-4024-9257-6a7352023319 @ 2026-09-04T02:38:46.111Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_80026E58

Reports whether a caller-selected sound-effect bank slot is in state 2, the finalized ready state used by the surrounding bank-loading code.

- fact:988eb8a5-9109-44a7-a8b7-c70a811dd59b @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e0051eb6-073d-490a-bea5-18bd23ed0577 @ 2026-09-04T21:11:38.998Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:efe90f0d-0c25-4b40-a967-f5e5228026a5 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:48854b33-5493-476b-8eb6-e5f1baf84b34 @ 2026-09-04T21:11:38.998Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:50fe42f4-5714-4d2d-b236-9377eb0e5b19 @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:cd9c7c73-b85e-4fe2-9df8-ca2147e91e2e @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:fn_80027488

Polls for requested SFX banks that remain pending and, once none remain, promotes every requested callback-completed bank from state 1 to ready state 2.

- fact:14ea8b07-be65-457b-bd87-f9e85fef5994 @ 2026-09-04T21:11:38.998Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:754baead-0810-466c-b2b3-e202f8218637 @ 2026-09-04T21:11:38.998Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e9aee2fa-19f8-4e69-b64c-b17a3495ee14 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:24a06808-c1fd-4c01-80d5-7bffc299d96b @ 2026-09-04T21:11:38.998Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:da37d5d5-ab70-4622-bf64-5d282ddb635d @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4ca2d890-34c4-4a51-abc4-e26fa4b22704 @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002305C

Looks up one of two character-associated background-music IDs from a 33-row table and returns fallback music ID 0x62 when the character index is invalid.

- fact:9d6306c4-b0d6-4f58-ac89-5bc59c78b0b4 @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:692ce161-1f8f-4e38-8822-3ec7e9b4b75d @ 2026-09-04T21:11:38.998Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:fc5a3bc8-08c3-4afa-b183-bcbda3a2826a @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8d8b7601-660d-4f57-b2d1-b3323317152e @ 2026-09-04T21:11:38.998Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9b7009f6-c3e4-4daa-8dc3-b7af9122e658 @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:2788554f-e16a-4c2c-8970-7f3bb3635d2c @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023090

Returns the static metadata byte for a streamed-music index from 0 through 0x61, with out-of-range indices producing zero.

- fact:c545d3a9-38d5-40a0-8f55-b218f8125e9c @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3f52f03f-86f2-43f0-bab2-6c6010c33042 @ 2026-09-04T21:11:38.998Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:173eeb21-3599-45a8-a1e7-9650dcaee6eb @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0474ff30-ac17-41ea-9e95-86933bcb9453 @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800230C8

Retrieves the inclusive lower and upper SFX-ID bounds for one of 55 sound-effect-bank slots, writing either requested endpoint and returning success or invalid-input status.

- fact:03cae949-b4e2-466d-8992-b567742a232e @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:bd191f92-874a-419a-b532-b37c5ac31a09 @ 2026-09-04T21:11:38.998Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:27b5d1f6-9a7a-4946-a61c-b27d243ffc5d @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ca6861c5-bf41-4d22-8292-d5136f13b08e @ 2026-09-04T21:11:38.998Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3c6d129b-3f35-461a-8f9b-7eb4104f545d @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:46e55904-71ea-40be-86d3-8497a51eb646 @ 2026-09-04T21:11:38.998Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023130

Classifies an integer SFX ID into the first of 55 inclusive sound-bank ranges containing it, returning slot 55 for invalid or unclassified input.

- fact:007c1244-5056-489f-9b4f-dcb4c90ee479 @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:726006d5-ca55-42e4-9aab-c1da18508ff8 @ 2026-09-04T21:11:38.998Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:08bdee78-ecda-4439-8f1c-68380dd0e86e @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:35a83e33-a526-45f9-967b-415ef07b4e41 @ 2026-09-04T21:11:38.998Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9245391f-9b47-41f4-8560-523696f5f1b9 @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:13aa1ba9-3dae-467a-9d11-8f744aca1195 @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023220

Retrieves column 3 of the metadata row for one of 55 SFX banks. Fighter audio uses it as a bank-relative boundary for entries that receive fighter-size variants.

- fact:89adfc6a-79e3-4935-ac45-be2438175903 @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e914839b-2d50-43ad-a8db-8bc3a03b9889 @ 2026-09-04T21:11:38.998Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:efd83219-3b1f-430e-9b4c-2a56bc888eac @ 2026-09-04T21:11:38.998Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:1c9bdb17-e365-41e3-bd9a-1681455556b2 @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:2ffdb276-7f12-4aa6-bdd0-e3f0d1249039 @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800233EC

Canonicalizes an SFX ID through a 74-row paired-ID table. With bank slot 33 loaded, designated ordinary-bank IDs map from column 0 to column 1; otherwise slot-33 IDs map from column 1 back to column 0. Ineligible or unlisted IDs pass through unchanged.

- fact:a5bb57dc-5da0-4326-ac73-39ee3107f32c @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:fe97b9ac-d088-465e-9b22-cb63846565a4 @ 2026-09-04T21:11:38.998Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3f8ffaac-5f35-4ccb-ab62-3ed948b153db @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e0de0e65-5c04-4cd8-b1db-04bc58a3ed65 @ 2026-09-04T21:11:38.998Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:db9e9461-3829-47bc-97ce-5c983bf507ac @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a8faf29a-f8ee-4b1f-a720-1b00aaa9adb1 @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023694

Provides the game-facing wrapper that requests key-off for every sound effect in AXDriver's managed list and then returns the fixed value -1.

- fact:de1237dc-47d1-44d2-a359-a278cd20f652 @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c22dc53b-7092-4ba8-99dc-8a1dab2e05b4 @ 2026-09-04T21:11:38.998Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9a485e1b-ff59-4c49-a331-273cb93bf74b @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:254b5859-bebc-4b82-9ec6-a1df6249190b @ 2026-09-02T13:57:17.860Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0808d904-33f5-4738-8005-443f97173bcf @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:aa574821-5416-41d9-b8c1-baaf286a5714 @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800236B8

Provides the game-facing per-handle SFX key-off operation by forwarding one retained playback handle to AXDriver and returning the lbAudioAx layer's fixed -1 sentinel.

- fact:6c5436c2-9f9a-4a8a-b327-bc17a3b418bf @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5a7d4a29-8d0c-4f9e-aac1-5461a946f109 @ 2026-09-04T21:11:38.998Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:23e9042b-a7cf-4296-babd-2fa27cbd5b73 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:43913b8b-e12f-4e87-a5ac-5ac79d8d7526 @ 2026-09-04T21:11:38.998Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0cc4864e-4bea-4d19-9285-4f0485f8bd92 @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4ef3dc64-c7ab-4b82-a298-1d6791b86e29 @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800236DC

Stops the current singleton streamed-audio instance, if present, and unconditionally clears lbAudioAx's active marker and cached stream path.

- fact:909cc586-6b3a-4483-a980-9e5cda73778a @ 2026-09-04T21:11:38.998Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c3c757b4-0ef3-4994-9530-f405a8640e73 @ 2026-09-04T21:11:38.998Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:ccd34cf9-4734-4c7d-9f51-27a9dafd63d4 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:76e74cc3-4c21-4011-98e7-532d3066fe3a @ 2026-09-04T21:11:38.998Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9d2f827c-5bfc-4a30-b455-335d36287bfc @ 2026-09-04T21:11:38.998Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:133eb13d-3e50-4c8d-8021-0a12f9e7a316 @ 2026-09-04T21:11:38.998Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023710

Checks whether a sound-effect playback handle still identifies a live AXDriver-managed voice, exposing the driver status query through the lbAudioAx facade.

- fact:6c3495c9-5a66-4d7a-a1e1-2c7e40b0d81e @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8d2f57a8-fa2c-4c43-bc12-0f722bf20cb6 @ 2026-09-02T15:09:04.095Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:b36c98e6-74c9-44f5-90f8-700d9dcb95a0 @ 2026-09-04T21:10:08.706Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6b8d787e-b5b3-4205-a1d1-32dd762d9926 @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:55e8bfdc-af52-4465-a6f2-252aac54f7d5 @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:2a7b5579-de7e-4de6-be4a-56140bb66f4f @ 2026-09-04T23:38:48.022Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023730

Reports whether the audio layer's singleton path-selected stream is still active. It is a read-only wrapper around the AXDriver stream-status query and does not stop playback or clear retained stream state.

- fact:7ce95267-3a02-4d9a-bf5b-41a3ab903a22 @ 2026-09-02T13:57:15.444Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:631b39d3-0254-4b0f-a0ae-3a9cd75566a3 @ 2026-09-04T21:10:08.706Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:c3fe9783-f7c4-4c8f-bb2d-df2239f16e2e @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:76460f7d-eb6a-4de5-adc4-ea5b9ecc3e56 @ 2026-09-02T13:57:15.444Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:cc7862e6-2689-4aae-a7ea-7e42a7cda217 @ 2026-09-02T13:57:15.444Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:85b027ac-0f51-4558-bcde-2b8a3522cd49 @ 2026-09-02T13:57:15.444Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800237A8

Starts an untracked sound effect through AXDriver using game-facing volume and pan controls. IDs at or above 0x83D61 are replaced with the fixed fallback request `(0x83D60, 0, PAN_MID, 0, 7)`.

- fact:af6446b9-55d4-49d5-9a72-8eead29119f5 @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f730352b-cba0-41b0-8ddb-0e2ec86c1cda @ 2026-09-04T21:10:08.706Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:fc6a42e1-e2e1-4e14-b28d-d651fc66c3e9 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:81eaa182-d5f6-4570-89ed-c278ebf59dd6 @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:318a0f43-42d0-459b-8fde-ecf8c7d7a774 @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0609e5d1-0397-4d3f-9930-67047b1f663d @ 2026-09-04T21:10:08.706Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023870

Starts or stops an SFX on an optional AX track. Track zero delegates to untracked playback; control ID 0x83D61 on a nonzero track keys off that track and returns -1; other tracked requests start normally.

- fact:8aa23774-f459-4649-a3d9-a6b38a26b502 @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:11a6395e-1d1e-4188-8eca-30b2f0248bf0 @ 2026-09-04T21:10:08.706Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:65f2d4be-d747-4c9c-b2b9-517aa169e73a @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4395378f-f128-437d-9423-da8ea10296b1 @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:380d87b4-b42c-4d73-a0e0-f42cde36acc6 @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:afee5523-a79a-4dc7-9558-83479801fc3d @ 2026-09-04T21:10:08.706Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002392C

Synchronously loads `LbAd.dat` and publishes its required `lbAudioLoadData` public entry through the module-global pointer used by language-dependent audio-list accessors.

- fact:786d71d7-73a8-4923-8f85-1778d889df12 @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:72dec96c-35d3-49e9-98eb-2b3b76d66438 @ 2026-09-04T21:10:08.706Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:92f21a0d-3d46-4716-8f3c-29501e3b09ba @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ad8cfab6-84f0-486e-bcc4-0a05582b7cd5 @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:74d37cb5-6165-480f-936e-143ce9084c03 @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:aee754b7-642d-47ff-a599-092358cd4edb @ 2026-09-04T21:10:08.706Z: unresolved state_behavior. Local archive request is verified; fatal required-symbol resolver behavior and synchronous transaction details were not independently re-read.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023968

Returns the number of SFX IDs in a selected language-dependent audio-list group by scanning to terminator 0x83D60.

- fact:17c4312a-718a-4aa4-b172-64bda5144164 @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:fe8ff9b2-3ab0-447e-8217-c1442eb6253d @ 2026-09-04T21:10:08.706Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a7266845-9d12-47a0-b249-d6181d33a4e3 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:2f27118d-69e9-4c25-812a-e28b7af65883 @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ed2f1b50-0f1e-48a5-ba97-af77a90acd76 @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f8d70344-8214-438a-aa8b-1039bc7a3395 @ 2026-09-04T21:10:08.706Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023A44

Returns the SFX ID at a requested index in a selected language-dependent audio-list group.

- fact:7eb73b7e-5df2-4fc8-bbae-f936d5375a02 @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e76abee3-1f4a-4bd6-8e9b-e6401e6fa7a4 @ 2026-09-04T21:10:08.706Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c0a6ee7b-6a35-4994-a886-f4cd341dce9b @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f619fe98-c677-4c27-849d-034c619893b9 @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5a2e7835-dae8-45e1-a984-8a7f68eb5e5f @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:bd979f78-ab6b-4f31-8159-6e85c3e76f80 @ 2026-09-04T21:10:08.706Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023B24

Ensures the bank containing a requested SFX is resident, replacing dynamically managed Synth bank 2 when necessary, then starts the effect with standard playback controls. It performs no local load-result validation; invalid or unclassified IDs can yield sentinel bank 55, whose filename is NULL, so the general input domain is not safely ensured.

- fact:1cfb99d4-189d-46a5-b08c-b95697dcb4eb @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d50d0ef7-173c-4e67-9bfc-efa67023deb9 @ 2026-09-04T21:10:08.706Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6c79bac6-2633-405e-bd5a-545648b54fce @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:34b6de2b-afaa-4e72-9a36-66f53ea21dad @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f32be8ef-02af-4302-b43b-bdabbac86fd9 @ 2026-09-04T21:10:08.706Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:fcccac92-8eac-4167-bf44-aa81d70cd903 @ 2026-09-04T21:10:08.706Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023F28

Selects the HPS stream associated with a music index, avoids restarting the same path, and replaces a changed stream at full volume on track 1.

- fact:e4038b32-b50a-46e8-a8b3-0cf2180f7eb9 @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9a749622-8828-47bf-9d0c-555d58360891 @ 2026-09-04T21:10:08.706Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7413571a-44dc-4562-956b-d2e148b5b0cb @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3e13a9b4-dff4-4187-bca4-c94200db056c @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0c8ed0be-9328-4f39-baee-13861839bc6b @ 2026-09-04T21:10:08.706Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024030

Plays one of eleven predefined common interface SFX presets at maximum game-facing volume and centered pan, using each preset's stored track and channel.

- fact:fd0bb4af-b063-4f4a-a412-bf5244901947 @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:803acdd2-2f16-44ba-ad6b-9b8a5d341886 @ 2026-09-05T15:23:56.313Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:b584428e-0908-4b33-8070-ec81cee3f30e @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ac3000e1-1319-4ffc-983d-04e40a447a4e @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c1bdcec2-fea0-438e-b4ca-2de9cceaccff @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:34170d9d-1217-4aaf-b704-008a4028f178 @ 2026-09-05T15:23:56.313Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800240B4

Starts one SFX with fixed controls `(VOL_MAX, PAN_MID, track 0, channel 5)` and returns its playback handle.

- fact:e62c4e33-6d49-4dfb-879a-ba75ce9ddb2c @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:04306a6a-f35d-4ea0-849c-cb8397de853d @ 2026-09-02T13:58:00.086Z: unresolved game_mapping. Crowd manager use is verified, but the specific repeated fighter-cheer path remains unreviewed.
- fact:8ac9b27e-9f0f-45bd-b8b6-9447a84a1377 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:633f352a-6bcc-4491-b767-0e6a3de5bfb6 @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:541e3f04-8cb6-4acb-9c28-c6e1907be7dc @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:2f8bdad5-79cb-4869-8c17-489e420fe878 @ 2026-09-04T21:10:08.706Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002411C

Starts one SFX with fixed default controls on AXDriver channel 6—maximum game-facing volume, centered pan, and track 0—and returns its playback handle.

- fact:f5ac557a-dfcc-444d-b51c-175da86dc7ae @ 2026-09-04T21:10:08.706Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f2b17812-4753-44c3-9f5c-3a62866dda52 @ 2026-09-04T21:10:08.706Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:01278c8a-6413-44c3-9d14-21e9e9ba979f @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4e1ab942-78f8-4099-bb74-36fd7b6fa37e @ 2026-09-04T21:10:08.706Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:48948186-4a74-4292-ba06-1521ea14da20 @ 2026-09-04T21:10:08.706Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:60d3a2ad-30e5-4176-83e8-5ebd2aa60b9c @ 2026-09-04T21:10:08.706Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024184

Starts an SFX on channel 7 after selecting its track by ID. Fourteen IDs have fixed tracks; ID 0x20D preserves the supplied track unless it is exactly -1, in which case it uses 0. Other unlisted IDs use 0. Negative tracks other than -1 are forwarded and may be rejected by AXDriver.

- fact:a378f227-0ef3-4b6c-8611-1b94611bda3e @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:67e4394b-14b7-4496-b003-5db9ef842233 @ 2026-09-04T21:10:46.975Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a2edf975-3730-4b1a-99b6-2990865b01f8 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8d0e641e-f83d-4757-a5a7-355623619836 @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e28c513f-6666-45de-9c82-6efb36bc06f7 @ 2026-09-04T21:10:46.975Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:455c2433-9649-4f26-bd1a-0636c0cc2f84 @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024304

Starts a sound effect with full game-facing volume and centered pan on channel 7. IDs 0x8A, 0x8B, and 0x8C are canonicalized to ID 0x8B with track 0x16; other IDs retain their requested value and use track 0.

- fact:5d3be22d-4139-4153-aa20-b020169f9249 @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0196e5f8-5ff9-47b3-927f-a2bebde1ad90 @ 2026-09-02T13:57:33.393Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:2e680d03-1366-4425-a3b3-c826d200c956 @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0c49799c-1dc6-48d0-a9ad-bdcb23b05b8b @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c915dd44-69e8-4050-bc1a-94b63b6f0043 @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002438C

Starts one sound effect through the common playback helper using full game-facing volume, centered pan, track 0, and channel 8, then returns the resulting playback handle or failure value.

- fact:7637d6c5-4538-429d-8aff-b11b4595506c @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b9b59a09-edad-4e3b-baad-69b1ff98bb70 @ 2026-09-05T15:23:56.313Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:f912b6df-f80e-4474-9905-11890478e090 @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4dde74d4-2170-4fbf-85f9-572b6faad173 @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:952c5685-0850-4148-953a-be7b1ea7a939 @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800243F4

Starts one of the fighter-name announcer sound effects with full game-facing volume and centered pan, assigning each recognized sound ID a distinct track value before playback on channel 7.

- fact:79f6c9f4-516b-4e2f-bb04-b6bbfe2f7b82 @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b64b46fa-8971-4a8d-a1bf-67180322e9ba @ 2026-09-04T21:10:46.975Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:cbdd320f-0b34-49c6-93bd-13217f932455 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:138e6436-b5b6-4f21-81a9-d33ea97f77c4 @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:db3d5907-2251-46ac-b0b0-0a78a959204d @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:26325ef8-59bd-4115-a6f7-3bd96ba49d27 @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800245D4

Sets the requested HSD Synth streamed-audio volume. It saturates the input to 0–127 and retains it for the shared mix-update routine rather than applying it immediately.

- fact:aa2e252f-e87f-484d-b978-3c47d7988ce8 @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:63e29dd8-eef7-4f52-bf25-2a48cfa7eb2b @ 2026-09-04T21:10:46.975Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4e78f46e-4ffd-4960-b1f7-25d321927dfe @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a0134272-ec0d-4bb3-aa7c-8836faad8897 @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:83b66a8e-f6ea-4e17-ac3f-efb75181dd93 @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9fbb4ca2-b86a-4afc-84ce-7b7c54120278 @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800245F4

Sets and returns a bounded mix gain used when recalculating HSD Synth SFX groups 2 through 8. The requested level is saturated to 0–127 and retained in `lbl_804D388C`.

- fact:77397ac8-6635-4a27-8095-8e25b0a7025f @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a8330f95-af73-4923-9b5d-efb36925b534 @ 2026-09-05T05:20:34.220Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c07fe1f4-dc55-4d26-8a03-e60f3f24d4ed @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:cd9e7989-6d2f-4081-87e4-ad9096315961 @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3afa1a3e-85c3-4d1a-92b4-65f0420c082c @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024614

Sets the bounded runtime gain stored in `lbl_804D3884` and later applied to HSD Synth SFX group 1.

- fact:d14c3544-b0ce-42f5-8393-f7a78cc4939c @ 2026-09-04T21:10:46.975Z: unresolved data_flow. Saved balance mapping is verified; the inherited player Sound Test attenuation path needs its exact caller range, beyond the independently read developer Sound Test setters.
- fact:ef9337ba-4760-48c6-ae5e-54b86219edb9 @ 2026-09-05T05:20:34.220Z: unresolved game_mapping. Saved balance mapping is verified; the inherited player Sound Test attenuation path needs its exact caller range, beyond the independently read developer Sound Test setters.
- fact:166224d9-f6d4-499a-bfcb-fd357237b61b @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8384cadb-86a3-4a72-8fe7-68fb93704dd6 @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d77b64cd-ed0e-45a9-892d-e3f32ff6416a @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:39267efe-6b0c-469c-a125-8e5b4b572e3d @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024634

Sets the requested auxiliary-bus-1 send level used for audio channels 7 and 8. It saturates the input to 0–255 and retains it for the shared mix updater.

- fact:29ed7811-3c34-4817-8417-e0696b7e65e9 @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7b7a3d2c-643b-451f-b371-7016638c22d8 @ 2026-09-04T21:10:46.975Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:1a1e7e99-9376-48bf-af8e-9cc3d142de31 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9d5479fa-bf47-467c-b81c-aaf527a4a163 @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:195e451c-b3a1-49cb-95a1-93d9d0f57bd2 @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0b1346df-76a8-4535-808c-9901ecd49707 @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024B1C

Sets the stereo pan of one sound-effect playback handle, exposing a game-facing 0–127 control and converting it to AXDriver's 0–254 byte domain.

- fact:8624537d-8224-4e65-9193-b12106e30aba @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8383e324-8b63-4622-a209-1d1459311433 @ 2026-09-02T13:56:47.576Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:aef05f88-50e5-46cb-a88a-416d877d2462 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:09fa2e1a-79c7-467a-8274-0aa6a1c42da2 @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:32133c16-892d-41b9-9227-68fe9bd75bbe @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8586c80d-11b3-4fee-86b7-3303a4f8f507 @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024B58

Sets the runtime volume of one sound-effect playback handle, exposing a game-facing 0–127 control and converting it to AXDriver's byte-volume domain.

- fact:464f2cf3-8cb9-45b8-90be-63517aa17dc6 @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b864c677-5aca-4eb7-8f0a-6e72cf4674f9 @ 2026-09-04T21:10:46.975Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:065935d7-c072-497d-b018-00a79ea69017 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0dc81493-cfbc-41a9-9947-101ab0321f16 @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a4693e32-35d0-418a-96dc-7500ea294c7b @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a6b0b6e6-a6c4-4b0f-a298-0672b9f8ac72 @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024B94

Sets a bounded secondary pitch offset for one sound-effect playback handle and returns whether AXDriver accepted the request.

- fact:6569ba62-64a7-452c-aef8-84d065786cb1 @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d6bbd651-6705-4a89-9374-ca83655c2fec @ 2026-09-04T21:10:46.975Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7218a0d2-6ef3-4c09-b56b-46e5ea51ec68 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9f2b5696-3ea4-4f12-a02c-8124b9e48dde @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:39106fee-2b43-4316-8786-4b19d3c168d5 @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9ef2fc3e-cff4-4393-be50-c2def9213faf @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024BD0

Reads the console's persisted mono/stereo output mode, refreshes lbAudioAx's cached raw mode, and converts it to the menu convention: false for stereo and true for mono.

- fact:7d204b24-2923-43d0-a010-136ace19fb52 @ 2026-09-04T21:10:46.975Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:777985b6-f0b7-4f7d-94d0-b84a94a319a3 @ 2026-09-04T21:10:46.975Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4e7faf4d-35d2-4681-930d-cd7e81b7d19e @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:34e41b94-fbe8-456c-9f52-8e130d6628eb @ 2026-09-04T21:10:46.975Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b5c3410b-dfa9-4354-85d3-6284cdab1c6f @ 2026-09-04T21:10:46.975Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5aaa0c1a-e365-48b9-9ffa-a16850c71e77 @ 2026-09-04T21:10:46.975Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024C08

Validates and applies the game's two-choice sound-mode setting. It maps the menu selection to the synthesizer's stereo or mono value, avoids reapplying an unchanged mode, and delegates actual changes to HSD Synth.

- fact:e34a4f4b-8996-45ff-b222-5efda7826954 @ 2026-09-05T05:20:34.220Z: unresolved data_flow. Mapping and Synth persistence are verified; the full player Sound-options caller has not been independently read.
- fact:fa83f490-f7d9-4dd4-8f59-6094176384a2 @ 2026-09-05T05:20:34.220Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f2d338fe-1fb7-48fd-98ad-dc09a04b8a48 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a781395e-66b1-4b91-aac5-a81f4ee18f5b @ 2026-09-04T21:11:10.688Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:eba0915c-6a9a-451e-a462-c3bcf28904df @ 2026-09-04T21:11:10.688Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:766ad501-84e9-4fa3-bf86-3b7fc802a32f @ 2026-09-04T21:11:10.688Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024C84

Resets the high-level SFX controller's transient playback and mix state: it clears flags, counters, timers, and retained voice handles; restores normal multipliers and the full-scale SFX value; keys off tracks 5 and 6; and resumes logical channels 5, 6, 7, and 8.

- fact:253c1cfe-038f-4c84-8b8e-89628d211bad @ 2026-09-04T21:11:10.688Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:10b440d5-c1f9-4fb3-a1f5-d5630a3062d0 @ 2026-09-04T21:11:10.688Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:00f6f531-b6d6-499c-afe3-18b306267561 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:37699628-d3ae-46a4-ba6d-afa640ea9662 @ 2026-09-04T21:11:10.688Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f2745446-b3b9-4326-b5f9-0d1667185767 @ 2026-09-04T21:11:10.688Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:179d0eed-204d-4aa0-b15e-b0020fcbdc11 @ 2026-09-04T21:11:10.688Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024D50

Resets transient audio state and schedules one replay of the sixteen-slot tracked-SFX queue on the next update. The flag causes playback and queue clearing, not just deferred retirement.

- fact:68e3a67f-f192-45ec-abc4-78ae5624389c @ 2026-09-04T21:11:10.688Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:2520734f-4118-4186-92bc-57ebb4d36e93 @ 2026-09-04T21:11:10.688Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:f3777e4f-db73-41fe-915b-cf60dbee10c8 @ 2026-09-04T21:11:10.688Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ed5b7326-cb05-4cd0-b697-ec4756ca9a5c @ 2026-09-04T21:11:10.688Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:eba2f454-c8c8-47d4-bdc2-b7895cd5a6c4 @ 2026-09-04T21:11:10.688Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024D78

Selects the stage-specific Aux B effects-send level used by logical SFX channels 7 and 8. It maps the selected internal stage to GrKind, reads the caller-selected column of a per-GrKind table, and caches the resulting byte for the central mix updater.

- fact:d7e4060b-4468-4fc7-9c9c-98db3ae0638c @ 2026-09-04T21:11:10.688Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:05772e97-1878-4afb-8086-6f38a1b44488 @ 2026-09-04T21:11:10.688Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:9824c437-66f5-44d4-8aad-e61bf2ad6dd5 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6a900fd4-2716-43b1-b3f0-8a550a7a1fba @ 2026-09-04T21:11:10.688Z: unresolved inferred_type. Column index is unchecked locally; inherited demonstrated Mute City/Venom caller columns are not independently re-read.
- fact:bcf7599f-94f1-40c2-b9d3-83039434b084 @ 2026-09-04T21:11:10.688Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:eb614604-3b01-49bc-b6bf-aea18decc1d2 @ 2026-09-04T21:11:10.688Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024DC4

Registers an SFX identifier in the shared sixteen-slot tracked-SFX table or refreshes its existing entry, setting the associated counter to ten.

- fact:68e353a1-fee3-482f-ba5a-26067d13d27b @ 2026-09-04T21:11:10.688Z: unresolved data_flow. Fighter registration is verified; item 0x12F and KO-specific lifecycle claims remain unreviewed.
- fact:7361def2-055d-4a38-81a4-f89f99c5fee0 @ 2026-09-04T21:11:10.688Z: unresolved game_mapping. Fighter registration is verified; item 0x12F and KO-specific lifecycle claims remain unreviewed.
- fact:9528e6a0-3efa-42c6-8225-f158368f1bd6 @ 2026-09-04T21:11:10.688Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:c3044656-85c4-42dc-b91d-d0452043ed35 @ 2026-09-04T21:11:10.688Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d6191242-2059-47bc-8e62-a2384b18cd69 @ 2026-09-04T21:11:10.688Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024E50

Sets the paused latch and requests pause or resume of AXDriver's singleton path-selected stream. It does not pause all AXDriver-managed SFX or all game audio; the low-level singleton is the same handle used by AXDriverStop and the stream-status wrapper.

- fact:b5e852eb-6aa7-4fed-84fb-b456c135120e @ 2026-09-04T21:11:10.688Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0eda867d-d582-45c4-b50c-8e69929ccae1 @ 2026-09-04T21:11:10.688Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:04e01b22-9444-4ed5-817a-909654982161 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7a31802a-f746-4cbe-aaa9-c960be6cf8af @ 2026-09-04T21:11:10.688Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:49cccfa9-5410-40df-b098-df73b3529953 @ 2026-09-04T21:11:10.688Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:a4c42d19-6ad7-4374-9e8a-24ed4870a3d3 @ 2026-09-04T21:11:10.688Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024E84

Applies or removes the partial gameplay-audio suppression used during match pauses and Camera Mode capture. Enabling it sets two SFX mix factors to 0.2 and pauses logical channels 5 through 8; disabling it restores unity factors and resumes those channels.

- fact:ee799661-4b03-4b31-9b02-4f51099e1a8c @ 2026-09-04T21:11:10.688Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:02ba4fdc-ede7-4298-b662-e48467c7927e @ 2026-09-04T21:11:10.688Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:98da27c4-0008-4174-b222-cf84ed19dd75 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:99b266f1-c3e1-4463-94c2-743e5b22af3c @ 2026-09-04T21:11:10.688Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7b5b0a43-b5c4-414a-9eef-c3482d673145 @ 2026-09-04T21:11:10.688Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:fd7adbbc-7010-4091-9d44-65581e752a36 @ 2026-09-04T21:11:10.688Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024F08

Begins a reversible broad audio-suspension interval by setting HSD Synth stream gain to zero and pausing AXDriver channels 2 through 9. Its known caller uses it before entering the blocking disc-drive error display.

- fact:f921d7da-3444-4ea6-943e-ef0aff12b857 @ 2026-09-04T21:11:10.688Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:2b594367-7e69-4ae3-ada9-63c2cf09beaf @ 2026-09-04T21:11:10.688Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:6316ccce-c413-4a9f-9edd-b4d833f40d98 @ 2026-09-04T21:11:10.688Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ca8972e0-5fe6-4fa2-bfb3-7835f788fc28 @ 2026-09-04T21:11:10.688Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c36f80da-dc21-41c0-a1de-c9707b5ad95f @ 2026-09-04T21:11:10.688Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024F6C

Ends the broad audio-suspension interval initiated by `lbAudioAx_80024F08`. It restores the retained `synth_volume`, resumes channels 2, 3, 4, and 9, and resumes channels 5 through 8 only when their independent suppression mode is inactive.

- fact:473130e5-5c5c-4def-8a05-5f540e8f4d1b @ 2026-09-04T21:11:10.688Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7bb31927-c867-4c2f-aabf-c9e19976646a @ 2026-09-04T21:11:10.688Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:5f516372-1fdb-43bc-936a-56e4382208fe @ 2026-09-04T21:11:10.688Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ef4c0c86-94c8-41af-8e7f-da9c0d9e8bed @ 2026-09-04T21:11:10.688Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7616529f-1555-4e5f-88a1-b69369518a07 @ 2026-09-04T21:11:10.688Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024FDC

Registers one activation of the reference-counted global audio mode used during the music-bearing portion of a fighter's Super Star status. It refreshes the mode control value to 510 and increments its global activation count.

- fact:5e2d067d-858f-45f6-ba40-4cf29774d94d @ 2026-09-04T21:11:10.688Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:29717b58-ac55-41b4-8fb6-95559e037ee9 @ 2026-09-04T21:11:10.688Z: unresolved game_mapping. Fighter wrapper and status-duration registration are verified; exact Super Star asset/status identity remains a family claim without independently read item source.
- fact:14f16fe3-45eb-43c9-b36c-452a86fe7a3d @ 2026-09-04T21:11:10.688Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:9ba6ea67-d2f8-4b26-814a-664e391e067f @ 2026-09-04T21:11:10.688Z: unresolved purpose. Fighter wrapper and status-duration registration are verified; exact Super Star asset/status identity remains a family claim without independently read item source.
- fact:9945f5fa-7c74-4301-a741-c83131ad06c6 @ 2026-09-04T21:11:10.688Z: unresolved state_behavior. Global and fighter-local acquisition writes are verified; all claimed cleanup consumers were not exhausted.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024FF4

Registers one activation of the reference-counted global audio mode used during a fighter's Hammer-item lifecycle. It refreshes that mode's control value to 480 and increments its global activation count.

- fact:a9ce47b3-72f9-4724-b5b2-25e7e560b787 @ 2026-09-04T21:11:10.688Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:aa937db6-dbcb-49b0-8a3d-e99881188491 @ 2026-09-04T21:11:10.688Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7438848a-b0bf-4fb1-97d4-67ee326fc08a @ 2026-09-04T21:11:10.688Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b1c0787e-94e8-4956-953e-c21b79c1ba99 @ 2026-09-04T21:11:10.688Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f4f7c825-52c3-4390-97fe-6896fec25294 @ 2026-09-04T21:11:10.688Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002500C

Releases one or more references to the Super Star special-audio mode, subtracting a supplied positive release count from `lbl_804D6420` without allowing the shared count to become negative.

- fact:d69383a0-98a9-4802-b5b4-783126730925 @ 2026-09-04T21:11:10.688Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:1fc179f0-1034-4613-b2c9-f4ec74aa84fb @ 2026-09-04T21:11:10.688Z: unresolved game_mapping. Counter release and fighter-local wrapper are verified; exact Super Star identity remains with the item/fighter family.
- fact:a178acbb-6e0d-4e3a-986a-273b7382179c @ 2026-09-04T21:11:10.688Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3ab858c8-338f-42ce-84fe-11fcda3d0193 @ 2026-09-04T21:11:10.688Z: unresolved purpose. Counter release and fighter-local wrapper are verified; exact Super Star identity remains with the item/fighter family.
- fact:d6ec6f29-3af9-4c02-b862-4f5ebbe16bb9 @ 2026-09-04T21:11:10.688Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80025038

Releases a caller-specified number of outstanding registrations from the shared audio state associated with Hammer carriers. It ignores nonpositive release counts and prevents the shared registration counter from becoming negative.

- fact:ab49c798-3b9c-4836-92d7-167486fa5c16 @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:dc53e61f-50fa-450e-9290-e9aac5183c3d @ 2026-09-04T21:12:41.488Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8fae762d-0ad7-48e5-aa87-df6874175ed7 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:635fed4d-ad90-4c76-b1c0-d319f745498d @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4916c47c-6cf4-47ad-aace-7741cac93099 @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e5314c2c-9c01-4469-9c68-f104b0caa7f7 @ 2026-09-04T21:12:41.488Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80025064

Sets independent background-music and foreground-sound enable controls, allowing any enabled or disabled combination of BGM and FGM.

- fact:27abfe2d-5750-4dab-b653-3431e6951bd2 @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b97acd72-e084-4b1e-9469-a5eb9b723706 @ 2026-09-04T21:12:41.488Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:614c5b2e-296b-4335-b06b-a3030d64e434 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6adbe919-7f5f-41f6-bbd6-7f45af999f6e @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0b1c457e-b106-43c5-8629-cdf1bdddfd96 @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a19c3c64-a3fe-4062-838a-4e3e939c2a4a @ 2026-09-04T21:12:41.488Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80025098

Stores whether the audio library's developer sound-status instrumentation is enabled. Modes 4 through 7 enable it and modes 0 through 3 disable it.

- fact:c0041bdb-cb6c-410d-9541-c0bd620476cc @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:83d71bef-9c9f-4654-9c76-092fc8c9353f @ 2026-09-04T21:12:41.488Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:12d3aa08-de51-4200-9fbb-02d70dfb442a @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0eed84da-f796-4c06-a8a8-7645f0adf646 @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5c801cef-c84b-44f8-82a7-7c82708a0187 @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:21eeb16f-7a8e-4fa3-829f-5b51e98b78ce @ 2026-09-04T21:12:41.488Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

- fact:ba1d22ae-b31e-4e27-ae24-c69b34f46142 @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:67554261-121d-4b46-a9af-62fdafb7822f @ 2026-09-04T21:12:41.488Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:4b461f3f-f3fa-499d-bb95-68bb4988a3f0 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:abdc30e5-d4ae-41d5-80a3-9fbfa02945c6 @ 2026-09-04T21:12:41.488Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:0707b643-0ebf-4d5f-91ee-25f69355ebdb @ 2026-09-04T21:12:41.488Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:bb2ae916-5cd0-45f1-973f-c2a5427b6217 @ 2026-09-04T21:12:41.488Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_800264E4

Retrieves the AXDriver voice ID from a nullable managed sound-controller GObj, returning its userdata's `voice_id` when present and `-1` otherwise.

- fact:247efe6c-b506-428f-96b4-114bc81001e1 @ 2026-09-04T21:12:41.488Z: unresolved data_flow. Null-safe voice extraction is verified; exact category-specific fighter field consumer was not independently read.
- fact:4c476fda-53ee-428c-85b8-f9e1aac8b0f2 @ 2026-09-04T21:12:41.488Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:86fba222-a0e1-4902-a01b-5c07bb003dbf @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:cf12fca1-22e8-4360-9670-b8ee22568fd4 @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:bd2413fd-90a5-48fb-961e-134bcefb572a @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:973602a7-9e65-4a23-bcf3-5cefda75a503 @ 2026-09-04T21:12:41.488Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80026510

Stops and removes every managed sound object associated with a supplied game object, keying off live voices, destroying wrapper GObjs, and reporting whether any object was removed.

- fact:7375d59b-a5d6-4456-9587-d273e37251d1 @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f0cf947a-6332-4e46-9dc9-341d91eaf1c8 @ 2026-09-04T21:12:41.488Z: unresolved game_mapping. Fighter teardown is verified; inherited item teardown consumer remains unreviewed.
- fact:6c7b2c50-0d1c-4aad-81c0-94ffe072a1a9 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ca9e9962-313c-4045-a2fe-89c2d136367c @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:de9ac920-8328-4fc9-b067-25ad64a09cb0 @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6b1eaa29-33bd-4abf-b148-f68035a49545 @ 2026-09-04T21:12:41.488Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_800265C4

Stops and retires one managed sound controller selected by owner and AXDriver voice handle, then reports whether an exact match was found.

- fact:2c976463-3051-454e-ba66-35591953ab68 @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b4d23671-5e6f-4641-81e6-e01c3cd2c570 @ 2026-09-04T21:12:41.488Z: unresolved game_mapping. Fighter teardown is verified; inherited item teardown consumer remains unreviewed.
- fact:0803ee8e-f594-4462-bbe4-724d718e1c74 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c447d86c-1fff-41cd-a960-94e5b59de30a @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6a108aa0-855c-4a68-9000-cdb933f2dc09 @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c5048bd9-2106-41f5-bb8f-aa30a1ff2f11 @ 2026-09-04T21:12:41.488Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80026E84

Looks up the 64-bit SFX-bank selection mask for a character kind, returning zero outside the valid `CharacterKind` range.

- fact:dd3d8c36-e102-4cac-a017-72be646819e5 @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:549998a5-0baa-446a-87e7-3cc1f1457754 @ 2026-09-04T21:12:41.488Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:981b62f3-8a4f-4780-a26d-5e857d5d9237 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a5742d84-8b53-4c45-b6e9-037bf6197726 @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d9dfe88e-3a51-495b-b463-02987c6ca3c5 @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7a2e4521-9159-477f-9882-158014baeefc @ 2026-09-04T21:12:41.488Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80026EBC

Converts a stage-selection identifier into the one-hot SFX-bank mask associated with its ground implementation. Unsupported ground kinds and entries with sentinel value 55 return zero.

- fact:c4adc3db-b3ec-4cbd-a191-e31d41d950f3 @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:56360f3a-515a-4950-b20d-d98b3b0193fa @ 2026-09-04T21:12:41.488Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:bb6c11ea-0743-4114-a891-31f5548ba748 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8d804c1e-c921-4e74-8c3a-d9971dbac8ba @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d4d9356d-83f5-4cdf-86f0-33303fa956d0 @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c25b1b87-accf-43e5-b6d8-2f1978759707 @ 2026-09-04T21:12:41.488Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80026F2C

Removes selected SFX-bank categories from desired-bank state by expanding five category bits into fixed masks and writing `-1` to selected entries before later selection and reload.

- fact:7c119790-1cfe-4e64-8c2a-927480726c5f @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:005ccd21-2104-4833-a566-e028ac29b1de @ 2026-09-04T21:12:41.488Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7b8cec09-e655-432f-94d1-2be198f93f3a @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:18bb6c04-fb77-457f-9ad2-7a2f1c0ec392 @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5e72d29a-893f-4a20-bb7f-379a51ac7298 @ 2026-09-04T21:12:41.488Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002702C

Adds selected SFX banks to desired-bank state by restricting a caller mask, augmented with fixed common banks, to five selected categories and writing `1` to surviving slots; later code performs loading. The common mask is added with unsigned 64-bit +=, not OR. Overlapping input bits can generate carries, changing the selected bit set; an OR interpretation is valid only when the relevant masks do not overlap.

- fact:0f3789f7-7085-443c-8f4c-cb59e295ddf6 @ 2026-09-04T21:12:41.488Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:6c810c15-526b-4a02-9bf6-12ea982b2c53 @ 2026-09-04T21:12:41.488Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5d44ede9-3798-412f-b7e0-898586705965 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b74cc6ba-a4ce-4d01-b0c0-a19482f758cd @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d36198e1-d51e-4d83-bf0d-8414d9092091 @ 2026-09-04T21:12:41.488Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:5a0e16c3-597e-4952-a8bc-ed44a1abf4f5 @ 2026-09-04T21:12:41.488Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80027168

Reconciles desired SFX banks with current and pending banks, reclaims obsolete packages, validates the FGM memory budget, and starts the first asynchronous load; completion callbacks continue remaining loads.

- fact:4cede13b-599b-4188-9a5a-3cb10eb5d290 @ 2026-09-04T21:12:41.488Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:80b97d87-f87e-4982-bfa0-a60fe8068011 @ 2026-09-04T21:12:41.488Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:679e15db-5c94-45f5-bad1-75c2751e3956 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f82103b3-3e18-4450-83f8-74793ce73256 @ 2026-09-04T21:12:41.488Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f00dc1c5-60f8-4430-a2ee-43f71ce004d0 @ 2026-09-04T21:12:41.488Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:63a12705-ea83-49ea-bf57-9df47eb978f5 @ 2026-09-04T21:12:41.488Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80027648

Provides a synchronous completion barrier for sound-effect bank loads requested by lbAudio. It waits while any requested slot remains unresolved and promotes completed requested slots to the final loaded state.

- fact:82f83311-3711-4d12-bf6c-d2b01d5db072 @ 2026-09-04T21:13:15.072Z: unresolved data_flow. The local wait and slot finalization are verified; lb_800195D0 disc-error/card service internals remain with the storage owner.
- fact:f2c19ea6-63c3-4fb1-b449-1ef79d0d311c @ 2026-09-04T21:13:15.072Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:326f76a6-9c55-40c5-aba4-8e72f0be5269 @ 2026-09-04T21:13:15.072Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:49e37b6b-83a2-4925-aeab-fe51587a3d9b @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:464e7cd5-1d2a-4a09-98e3-e6a32ca885d7 @ 2026-09-04T21:13:15.072Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7dce6554-c472-4bf4-8d0c-91d39c8a16de @ 2026-09-04T21:13:15.072Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002785C

Prepares the sound-effect banks required for the match being initialized. It assembles a 64-bit selection mask from participating characters, the current stage, and supplemental special-case groups, records a stage-table audio value, replaces the relevant desired-bank categories, starts reconciliation, and waits for completion.

- fact:8c043caa-6569-4705-b235-c532ce2a10d8 @ 2026-09-04T21:13:15.072Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:11c2fe69-9a7a-47bc-8906-33d702503680 @ 2026-09-04T21:13:15.072Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:02069f5d-4664-48a5-9924-bbea53225f21 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6180176d-e664-4a9d-b31e-74dc624d4b74 @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ae0087db-2720-4204-a20f-2b560bf578b7 @ 2026-09-04T21:13:15.072Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d26e1786-bad5-4f39-8a36-d82f98c4cfa9 @ 2026-09-04T21:13:15.072Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80027AB0

Synchronizes the sound-effect subsystem with the persisted JP/US language selection. It keys off current SFX and, when the selection changed, replaces the AXDriver SFX metadata image, resets replaceable bank bookkeeping, unloads Synth banks 1 and 2, and synchronously reloads required slots `0x33`, `1`, and `0x36` from the selected audio directory.

- fact:c3e6a902-69bd-41ed-b9c4-f010941f11b3 @ 2026-09-04T21:13:15.072Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:1294a1b7-ded3-4e8d-9485-2538ceaa9da5 @ 2026-09-04T21:13:15.072Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:5d916197-4fd6-4b87-ac28-4ffe320b8fac @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0ae017a9-9999-46a2-a882-d39763dc26d2 @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:41e859cf-804e-4a07-b764-ce9624fe9542 @ 2026-09-04T21:13:15.072Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d1697e63-8c9e-4791-a898-9af2ad18fe4b @ 2026-09-04T21:13:15.072Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80027DBC

Coordinates comprehensive runtime-audio cleanup without deinitializing the audio hardware. It keys off all driver-managed SFX, stops and forgets streamed audio, restores high-level playback controls and reserved tracks to defaults, and cancels or drains outstanding asynchronous SFX-bank loads.

- fact:df9b0cc2-0023-4657-9e19-dbcfa0e38908 @ 2026-09-04T21:13:15.072Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8c7353de-a268-42ed-8772-b47b4c6c76dc @ 2026-09-04T21:13:15.072Z: unresolved game_mapping. Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.
- fact:1e7cf33d-b9ca-4b17-8448-f4c0cb1dd867 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d16f22cd-bcb9-46b3-a198-813523412ee9 @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:bf9ab0ca-8649-474b-813e-6df9241c0b7e @ 2026-09-04T21:13:15.072Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3e59d03f-e081-4537-a638-f64ec4d7e51c @ 2026-09-04T21:13:15.072Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80027DF8

Performs per-update high-level SFX maintenance: it advances the lifetimes of two specially managed voices, keeps enabled voices alive at requested volumes, tears down disabled voices, updates shared attenuation, services the mix path, and dispatches or ages sixteen delayed-SFX slots.

- fact:5139d803-643a-43f0-b56b-1839f7d6c687 @ 2026-09-04T21:13:15.072Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ff567ac2-4142-4a83-8b8a-efd1b406b255 @ 2026-09-04T21:13:15.072Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:ba5274c0-e4ef-4606-9a53-044726a24adb @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:000713f8-7347-4861-8063-3b34ca5ac447 @ 2026-09-05T20:54:39.499Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:87b5b91f-1e4d-49df-a9a9-e4d4a7722850 @ 2026-09-04T21:13:15.072Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:72e37860-19e2-4153-bf74-ac28b76830d3 @ 2026-09-04T21:13:15.072Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002835C

Initializes and registers the fixed-size HSD object allocator used for lbAudioAx sound-controller user data. It prepares `sizeof(lbAudioAx_UserData)` records with four-byte alignment for attachment to sound-controller GObjs.

- fact:100a5400-81fe-4dbd-9bb6-934f8bc19b39 @ 2026-09-04T21:13:15.072Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:dd4f2b1b-f3ea-453e-a755-4d235a50e035 @ 2026-09-04T21:13:15.072Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c45c78ed-6bf1-4489-a5b4-ff01e4baf8e7 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:913fba96-d2b6-45cf-9713-1d68477af4c1 @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:7473ecd2-796c-4479-b618-b6aa72d37956 @ 2026-09-04T21:13:15.072Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d4bfdea2-75a5-4396-941f-e9a53c57ee3e @ 2026-09-04T21:13:15.072Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002838C

Configures the principal audio resources: AR/ARQ/AI services, calculated bank capacity, fixed reverb/delay work buffers, three Synth banks and initial bookkeeping. It is intended for startup, but has no one-time-call guard and does not validate every lower-level result.

- fact:f298d207-d812-4cb5-aa65-4206d474d0bd @ 2026-09-04T01:26:30.566Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:450efbd4-a8f4-4a98-b4b7-c33f20b24bd6 @ 2026-09-04T01:26:30.566Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:839ec971-669f-40f2-9248-278e3dab4288 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:0244fff6-8ac7-4f73-ad32-fbc38bf98fc0 @ 2026-09-04T01:26:30.566Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a38cf866-f927-43c6-9711-a6139faab59c @ 2026-09-04T01:26:30.566Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:3bc1041c-b2f1-445c-ac9d-2fff81db812f @ 2026-09-04T01:26:30.566Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80028690

Initializes lbAudioAx's game-facing runtime state after persistent settings have been established. It restores and force-applies the audio mix, selects the language-dependent audio configuration, installs the corresponding global SFX metadata, synchronously loads required common and language-dependent SFX banks, clears stale bank bookkeeping, and resets the seventeen retained playback slots and associated control globals.

- fact:ed65293a-3200-4605-be35-e380ea70aedd @ 2026-09-04T02:38:46.111Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c007c941-292f-466a-a75f-cc7ceef52a33 @ 2026-09-04T02:38:46.111Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:51012f4c-4879-48c6-8739-05442310bbf5 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:1245d593-1945-497f-8ad9-09a29fb469ad @ 2026-09-04T02:38:46.111Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e8f5e215-a5ea-400e-bb4f-7ae51a77ba63 @ 2026-09-04T02:38:46.111Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:33a5f2cc-4698-4178-af1e-2e67b704aa5f @ 2026-09-04T02:38:46.111Z: supersede state_behavior. Correct the inherited claim from pinned canonical behavior and directly read support.

## main/melee/lb/lbaudio_ax:lbAudioAx_80028B2C

Exposes AXDriver's current physical Synth-voice usage count through Melee's high-level audio interface for developer diagnostics.

- fact:0c404487-736d-4fd0-89b9-8c1477f2b9a5 @ 2026-09-04T21:13:15.072Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:300722a8-fe04-4543-9408-e7aed017582b @ 2026-09-04T21:13:15.072Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:aeaf98e0-5497-443e-b10a-d0b22677d124 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:28d90679-e865-43a1-8a98-013ddc84a84b @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:d628e563-2f62-47c1-8859-e602df6dc8dd @ 2026-09-04T21:13:15.072Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a0c60bcf-c575-4a98-8d86-2aec01039fc9 @ 2026-09-04T21:13:15.072Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80028B4C

Returns the number of logical HSD sound-manager voices currently allocated by AXDriver, exposing the lower-level virtual-voice count through Melee's high-level audio interface.

- fact:0feb65d0-6185-446a-aa9b-e11c0ac52706 @ 2026-09-04T21:13:15.072Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3f82ee7f-d903-4d27-81d8-8b7c57d55990 @ 2026-09-04T21:13:15.072Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:3800be1c-c417-45fa-8fd7-e7d1ffd01624 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:e06e4e0d-a1c1-496f-ab22-eca426118ec0 @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:8af22d46-abd7-4dd8-9c32-e9afe9b10391 @ 2026-09-04T21:13:15.072Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:f45068dd-9f14-4a10-abab-91ffc9abdb75 @ 2026-09-04T21:13:15.072Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80028B6C

Advances a shared sound-effect fade by reducing its 0-to-127 volume scale by one step without allowing it to become negative. The mix update normalizes that scale and applies it across HSD Synth sound-effect groups. This shared fade factor affects Synth groups 1 through 7; the group-8 calculation omits lbl_804D38CC and is not faded by this factor.

- fact:6d142e81-2e22-48f4-9c44-4f9a725a0231 @ 2026-09-05T15:23:56.313Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:16fbca4b-e331-477d-90d9-19f839f8d4e0 @ 2026-09-05T15:23:56.313Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:615e2964-7c87-4c48-baf5-f7bd347ccc76 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:6e1ca9ff-4ae6-4ad6-87e1-4e078aa31eb8 @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:a4cd048a-1bd9-452e-ba36-1bb6d6f21cf9 @ 2026-09-04T21:13:15.072Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:095a27f5-cf95-4755-8f89-79c87d365cc1 @ 2026-09-02T13:58:02.245Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_80028B90

Restores the shared sound-effect fade scale to its full value of 127. A later mix update normalizes this state and applies it across HSD Synth SFX groups, cancelling attenuation from the companion fade-step routine without directly updating voices. This shared fade factor affects Synth groups 1 through 7; the group-8 calculation omits lbl_804D38CC and is not faded by this factor.

- fact:358eeadd-0e59-4991-ab5b-6a07c17daf60 @ 2026-09-04T21:13:15.072Z: supersede data_flow. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:f9054f98-54f8-4912-8d58-9195c654d475 @ 2026-09-04T21:13:15.072Z: supersede game_mapping. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:605af14a-f9ad-4fb8-812e-2b4df50bc626 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:49a098ab-4a08-44b7-a97d-d3d81ac0dfdc @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:03a38916-dcbb-49ce-8529-6f912c413c4d @ 2026-09-04T21:13:15.072Z: supersede purpose. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:5ccfa136-5ca8-4eb1-9a4e-5500779fadbb @ 2026-09-02T15:09:35.310Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:lbAudioAx_ObjFree

Returns a non-NULL object to lbAudioAx's dedicated reusable object pool. It is a low-level storage-release wrapper and does not perform object-specific teardown or return memory to a general-purpose heap.

- fact:ab213af8-2f5e-4b9a-9f1f-3419bef28fb6 @ 2026-09-04T21:13:15.072Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:2366f8c7-0fa5-4577-a0cd-6a30f63a8021 @ 2026-09-04T21:13:15.072Z: retain inferred_type. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:b4945bf4-49d3-4179-86e1-5100963fe4b3 @ 2026-09-04T21:13:15.072Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:1e929aa5-a022-4299-960c-ebd78dd3c923 @ 2026-09-04T21:13:15.072Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## src/melee/lb/lbaudio_ax.c

Implements Melee's high-level audio facade over HSD Synth and AXDriver, including SFX-ID mapping, bank management, voice lifecycle, mix control, auxiliary effects, and streamed-audio wrappers.

- fact:b949df23-99fa-4fa6-b7c0-104586fe83a7 @ 2026-09-04T23:38:48.022Z: retain data_flow. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:c744dba0-0b94-4630-ae3b-e279deeb298b @ 2026-09-04T23:38:48.022Z: retain game_mapping. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:714c8607-63b9-4e0d-8f5e-abc95e56c678 @ 2026-09-05T20:54:39.499Z: supersede inferred_type. Correct the inherited claim from pinned canonical behavior and directly read support.
- fact:f2656f09-2450-42f9-a983-3e076277446a @ 2026-09-06T03:55:40.132Z: retain purpose. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.
- fact:5541027d-794b-4e2f-b4a1-028e226984f5 @ 2026-09-04T01:26:30.566Z: retain state_behavior. Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.

## main/melee/lb/lbaudio_ax:calcPan#r3

Calculates a bounded 7-bit pan value for a timed sweep from the lesser of two configured endpoints toward the greater endpoint. This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:calcPan#r4

Calculates a bounded 7-bit pan value for a timed sweep from the lesser of two configured endpoints toward the greater endpoint. This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:calcPan#r5

Calculates a bounded 7-bit pan value for a timed sweep from the lesser of two configured endpoints toward the greater endpoint. This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:calcPan#r6

Calculates a bounded 7-bit pan value for a timed sweep from the lesser of two configured endpoints toward the greater endpoint. This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80023254#r3

Builds a descending size-ranked list of SFX banks belonging to one allocation category for startup capacity planning.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80023750#r3

Starts a sound effect through AXDriver after converting Melee's logical volume and pan to saturated byte-sized controls, forwarding the SFX ID, track, and channel, and returning the playback handle. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80023750#r4

Starts a sound effect through AXDriver after converting Melee's logical volume and pan to saturated byte-sized controls, forwarding the SFX ID, track, and channel, and returning the playback handle. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80023750#r5

Starts a sound effect through AXDriver after converting Melee's logical volume and pan to saturated byte-sized controls, forwarding the SFX ID, track, and channel, and returning the playback handle. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80023750#r6

Starts a sound effect through AXDriver after converting Melee's logical volume and pan to saturated byte-sized controls, forwarding the SFX ID, track, and channel, and returning the playback handle. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80023750#r7

Starts a sound effect through AXDriver after converting Melee's logical volume and pan to saturated byte-sized controls, forwarding the SFX ID, track, and channel, and returning the playback handle. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80023ED4#r3

Adapts Melee-level streamed-audio parameters to AXDriver by converting logical volume to the byte scale, bounding the track selector, and delegating creation of the path-selected stream. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80023ED4#r4

Adapts Melee-level streamed-audio parameters to AXDriver by converting logical volume to the byte scale, bounding the track selector, and delegating creation of the path-selected stream. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80023ED4#r5

Adapts Melee-level streamed-audio parameters to AXDriver by converting logical volume to the byte scale, bounding the track selector, and delegating creation of the path-selected stream. Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80024654#r3

Recomputes and applies lbAudioAx's high-level mix, updating stream gain, four grouped-SFX outputs, and selected auxiliary sends while caching each applied result to avoid redundant maintenance writes.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_800250A0#r3

Calculates a bounded 7-bit pan value for a timed sweep from the lesser of two configured endpoints toward the greater endpoint. This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.

Historical fn_800250A0 parameter identity has no current canonical definition; calcPan has the corresponding four-int behavior, but identity migration is deferred.

## main/melee/lb/lbaudio_ax:fn_800250A0#r4

Calculates a bounded 7-bit pan value for a timed sweep from the lesser of two configured endpoints toward the greater endpoint. This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.

Historical fn_800250A0 parameter identity has no current canonical definition; calcPan has the corresponding four-int behavior, but identity migration is deferred.

## main/melee/lb/lbaudio_ax:fn_800250A0#r5

Calculates a bounded 7-bit pan value for a timed sweep from the lesser of two configured endpoints toward the greater endpoint. This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.

Historical fn_800250A0 parameter identity has no current canonical definition; calcPan has the corresponding four-int behavior, but identity migration is deferred.

## main/melee/lb/lbaudio_ax:fn_800250A0#r6

Calculates a bounded 7-bit pan value for a timed sweep from the lesser of two configured endpoints toward the greater endpoint. This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.

Historical fn_800250A0 parameter identity has no current canonical definition; calcPan has the corresponding four-int behavior, but identity migration is deferred.

## main/melee/lb/lbaudio_ax:fn_800251EC#r3

Updates a sound object's stereo pan from its attached entity's horizontal world position relative to the camera's visible left edge, center, and right edge.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_800253D8#r3

Updates a sound object's pan for the current point in a timed transition, optionally mirroring the calculated value across the 7-bit stereo range. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_800256BC#r3

Updates a managed sound object's current 7-bit pan from its frame-based pan transition, choosing the direct or mirrored orientation according to `x3C`. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_800259A0#r3

Performs a one-time initialization of a managed sound object's camera-relative pan by latching the operation and delegating to the attached-entity pan updater.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_800259EC#r3

Performs a one-time initialization of a sound object's directional pan by setting its initialization latch and invoking the shared frame-based pan updater. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80025A98#r3

Performs a one-time initialization of a sound object's directional pan by latching the operation and invoking the shared pan-transition updater. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80025B44#r3

Updates a sound object's non-mirrored pan for the current point in a bounded frame-based transition between configured pan endpoints. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80025CBC#r3

Updates a sound object's mirrored pan for the current point in a bounded frame-based transition between configured pan endpoints. Any bounded-pan claim assumes calcPan completes arithmetic with a result safe to convert to int: unequal endpoints with end_frame == 0 are not guarded. Endpoint subtraction is floating-point because one operand is explicitly cast before subtraction. The callback does not validate those inputs.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80025E38#r3

Computes a managed sound volume from frame/duration and endpoint difference, using start_vol + delta on the increasing branch and end_vol - delta otherwise; frame beyond duration yields 127. It does not generally interpolate between the two requested endpoints.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80025FAC#r3

Initializes a newly created managed-sound GObj from a `SoundParams` packet and starts or adopts the sound-effect voice that the controller will manage.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80025FAC#r4

Initializes a newly created managed-sound GObj from a `SoundParams` packet and starts or adopts the sound-effect voice that the controller will manage.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80025FAC#r5

Initializes a newly created managed-sound GObj from a `SoundParams` packet and starts or adopts the sound-effect voice that the controller will manage.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_800262A0#r3

Runs the per-tick process for an lbAudioAx-managed sound GObj by invoking its mode strategy, retiring it when that strategy completes, applying current pan and volume to a live voice, and ending or advancing its configured frame lifetime.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80026C04#r3

Handles completion of one asynchronously loaded sound-effect bank and advances lbAudio's prioritized bank-loading chain. It records the completed slot, adjusts aggregate byte counters, selects the next requested bank eligible for loading, and submits that bank to HSD Synth with itself installed as the next completion callback.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80026C04#r4

Handles completion of one asynchronously loaded sound-effect bank and advances lbAudio's prioritized bank-loading chain. It records the completed slot, adjusts aggregate byte counters, selects the next requested bank eligible for loading, and submits that bank to HSD Synth with itself installed as the next completion callback.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:fn_80026E58#r3

Reports whether a caller-selected sound-effect bank slot is in state 2, the finalized ready state used by the surrounding bank-loading code.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002305C#r3

Looks up one of two character-associated background-music IDs from a 33-row table and returns fallback music ID 0x62 when the character index is invalid.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002305C#r4

Looks up one of two character-associated background-music IDs from a 33-row table and returns fallback music ID 0x62 when the character index is invalid.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023090#r3

Returns the static metadata byte for a streamed-music index from 0 through 0x61, with out-of-range indices producing zero.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800230C8#r3

Retrieves the inclusive lower and upper SFX-ID bounds for one of 55 sound-effect-bank slots, writing either requested endpoint and returning success or invalid-input status.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800230C8#r4

Retrieves the inclusive lower and upper SFX-ID bounds for one of 55 sound-effect-bank slots, writing either requested endpoint and returning success or invalid-input status.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800230C8#r5

Retrieves the inclusive lower and upper SFX-ID bounds for one of 55 sound-effect-bank slots, writing either requested endpoint and returning success or invalid-input status.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023130#r3

Classifies an integer SFX ID into the first of 55 inclusive sound-bank ranges containing it, returning slot 55 for invalid or unclassified input.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023220#r3

Retrieves column 3 of the metadata row for one of 55 SFX banks. Fighter audio uses it as a bank-relative boundary for entries that receive fighter-size variants.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800233EC#r3

Canonicalizes an SFX ID through a 74-row paired-ID table. With bank slot 33 loaded, designated ordinary-bank IDs map from column 0 to column 1; otherwise slot-33 IDs map from column 1 back to column 0. Ineligible or unlisted IDs pass through unchanged.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800236B8#r3

Provides the game-facing per-handle SFX key-off operation by forwarding one retained playback handle to AXDriver and returning the lbAudioAx layer's fixed -1 sentinel.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023710#r3

Checks whether a sound-effect playback handle still identifies a live AXDriver-managed voice, exposing the driver status query through the lbAudioAx facade.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800237A8#r3

Starts an untracked sound effect through AXDriver using game-facing volume and pan controls. IDs at or above 0x83D61 are replaced with the fixed fallback request `(0x83D60, 0, PAN_MID, 0, 7)`.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800237A8#r4

Starts an untracked sound effect through AXDriver using game-facing volume and pan controls. IDs at or above 0x83D61 are replaced with the fixed fallback request `(0x83D60, 0, PAN_MID, 0, 7)`.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800237A8#r5

Starts an untracked sound effect through AXDriver using game-facing volume and pan controls. IDs at or above 0x83D61 are replaced with the fixed fallback request `(0x83D60, 0, PAN_MID, 0, 7)`.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023870#r3

Starts or stops an SFX on an optional AX track. Track zero delegates to untracked playback; control ID 0x83D61 on a nonzero track keys off that track and returns -1; other tracked requests start normally.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023870#r4

Starts or stops an SFX on an optional AX track. Track zero delegates to untracked playback; control ID 0x83D61 on a nonzero track keys off that track and returns -1; other tracked requests start normally.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023870#r5

Starts or stops an SFX on an optional AX track. Track zero delegates to untracked playback; control ID 0x83D61 on a nonzero track keys off that track and returns -1; other tracked requests start normally.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023870#r6

Starts or stops an SFX on an optional AX track. Track zero delegates to untracked playback; control ID 0x83D61 on a nonzero track keys off that track and returns -1; other tracked requests start normally.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023968#r3

Returns the number of SFX IDs in a selected language-dependent audio-list group by scanning to terminator 0x83D60.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023A44#r3

Returns the SFX ID at a requested index in a selected language-dependent audio-list group.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023A44#r4

Returns the SFX ID at a requested index in a selected language-dependent audio-list group.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023B24#r3

Ensures the bank containing a requested SFX is resident, replacing dynamically managed Synth bank 2 when necessary, then starts the effect with standard playback controls. It performs no local load-result validation; invalid or unclassified IDs can yield sentinel bank 55, whose filename is NULL, so the general input domain is not safely ensured.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80023F28#r3

Selects the HPS stream associated with a music index, avoids restarting the same path, and replaces a changed stream at full volume on track 1.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024030#r3

Plays one of eleven predefined common interface SFX presets at maximum game-facing volume and centered pan, using each preset's stored track and channel.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800240B4#r3

Starts one SFX with fixed controls `(VOL_MAX, PAN_MID, track 0, channel 5)` and returns its playback handle.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002411C#r3

Starts one SFX with fixed default controls on AXDriver channel 6—maximum game-facing volume, centered pan, and track 0—and returns its playback handle.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024184#r3

Starts an SFX on channel 7 after selecting its track by ID. Fourteen IDs have fixed tracks; ID 0x20D preserves the supplied track unless it is exactly -1, in which case it uses 0. Other unlisted IDs use 0. Negative tracks other than -1 are forwarded and may be rejected by AXDriver.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024184#r4

Starts an SFX on channel 7 after selecting its track by ID. Fourteen IDs have fixed tracks; ID 0x20D preserves the supplied track unless it is exactly -1, in which case it uses 0. Other unlisted IDs use 0. Negative tracks other than -1 are forwarded and may be rejected by AXDriver.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024184#r5

Starts an SFX on channel 7 after selecting its track by ID. Fourteen IDs have fixed tracks; ID 0x20D preserves the supplied track unless it is exactly -1, in which case it uses 0. Other unlisted IDs use 0. Negative tracks other than -1 are forwarded and may be rejected by AXDriver.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024184#r6

Starts an SFX on channel 7 after selecting its track by ID. Fourteen IDs have fixed tracks; ID 0x20D preserves the supplied track unless it is exactly -1, in which case it uses 0. Other unlisted IDs use 0. Negative tracks other than -1 are forwarded and may be rejected by AXDriver.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024304#r3

Starts a sound effect with full game-facing volume and centered pan on channel 7. IDs 0x8A, 0x8B, and 0x8C are canonicalized to ID 0x8B with track 0x16; other IDs retain their requested value and use track 0.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002438C#r3

Starts one sound effect through the common playback helper using full game-facing volume, centered pan, track 0, and channel 8, then returns the resulting playback handle or failure value.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800243F4#r3

Starts one of the fighter-name announcer sound effects with full game-facing volume and centered pan, assigning each recognized sound ID a distinct track value before playback on channel 7.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800245D4#r3

Sets the requested HSD Synth streamed-audio volume. It saturates the input to 0–127 and retains it for the shared mix-update routine rather than applying it immediately.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800245F4#r3

Sets and returns a bounded mix gain used when recalculating HSD Synth SFX groups 2 through 8. The requested level is saturated to 0–127 and retained in `lbl_804D388C`.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024614#r3

Sets the bounded runtime gain stored in `lbl_804D3884` and later applied to HSD Synth SFX group 1.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024634#r3

Sets the requested auxiliary-bus-1 send level used for audio channels 7 and 8. It saturates the input to 0–255 and retains it for the shared mix updater.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024B1C#r3

Sets the stereo pan of one sound-effect playback handle, exposing a game-facing 0–127 control and converting it to AXDriver's 0–254 byte domain.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024B1C#r4

Sets the stereo pan of one sound-effect playback handle, exposing a game-facing 0–127 control and converting it to AXDriver's 0–254 byte domain.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024B58#r3

Sets the runtime volume of one sound-effect playback handle, exposing a game-facing 0–127 control and converting it to AXDriver's byte-volume domain.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024B58#r4

Sets the runtime volume of one sound-effect playback handle, exposing a game-facing 0–127 control and converting it to AXDriver's byte-volume domain.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024B94#r3

Sets a bounded secondary pitch offset for one sound-effect playback handle and returns whether AXDriver accepted the request.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024B94#r4

Sets a bounded secondary pitch offset for one sound-effect playback handle and returns whether AXDriver accepted the request.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024C08#r3

Validates and applies the game's two-choice sound-mode setting. It maps the menu selection to the synthesizer's stereo or mono value, avoids reapplying an unchanged mode, and delegates actual changes to HSD Synth.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024D78#r3

Selects the stage-specific Aux B effects-send level used by logical SFX channels 7 and 8. It maps the selected internal stage to GrKind, reads the caller-selected column of a per-GrKind table, and caches the resulting byte for the central mix updater.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024DC4#r3

Registers an SFX identifier in the shared sixteen-slot tracked-SFX table or refreshes its existing entry, setting the associated counter to ten.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024E50#r3

Sets the paused latch and requests pause or resume of AXDriver's singleton path-selected stream. It does not pause all AXDriver-managed SFX or all game audio; the low-level singleton is the same handle used by AXDriverStop and the stream-status wrapper.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80024E84#r3

Applies or removes the partial gameplay-audio suppression used during match pauses and Camera Mode capture. Enabling it sets two SFX mix factors to 0.2 and pauses logical channels 5 through 8; disabling it restores unity factors and resumes those channels.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002500C#r3

Releases one or more references to the Super Star special-audio mode, subtracting a supplied positive release count from `lbl_804D6420` without allowing the shared count to become negative.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80025038#r3

Releases a caller-specified number of outstanding registrations from the shared audio state associated with Hammer carriers. It ignores nonpositive release counts and prevents the shared registration counter from becoming negative.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80025064#r3

Sets independent background-music and foreground-sound enable controls, allowing any enabled or disabled combination of BGM and FGM.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80025064#r4

Sets independent background-music and foreground-sound enable controls, allowing any enabled or disabled combination of BGM and FGM.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80025098#r3

Stores whether the audio library's developer sound-status instrumentation is enabled. Modes 4 through 7 enable it and modes 0 through 3 disable it.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r10

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r11

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r12

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r13

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r3

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r4

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r5

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r6

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r7

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r8

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800263E8#r9

Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800264E4#r3

Retrieves the AXDriver voice ID from a nullable managed sound-controller GObj, returning its userdata's `voice_id` when present and `-1` otherwise.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80026510#r3

Stops and removes every managed sound object associated with a supplied game object, keying off live voices, destroying wrapper GObjs, and reporting whether any object was removed.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800265C4#r3

Stops and retires one managed sound controller selected by owner and AXDriver voice handle, then reports whether an exact match was found.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_800265C4#r4

Stops and retires one managed sound controller selected by owner and AXDriver voice handle, then reports whether an exact match was found.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80026E84#r3

Looks up the 64-bit SFX-bank selection mask for a character kind, returning zero outside the valid `CharacterKind` range.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80026EBC#r3

Converts a stage-selection identifier into the one-hot SFX-bank mask associated with its ground implementation. Unsupported ground kinds and entries with sentinel value 55 return zero.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80026F2C#r3

Removes selected SFX-bank categories from desired-bank state by expanding five category bits into fixed masks and writing `-1` to selected entries before later selection and reload.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002702C#r3

Adds selected SFX banks to desired-bank state by restricting a caller mask, augmented with fixed common banks, to five selected categories and writing `1` to surviving slots; later code performs loading. The common mask is added with unsigned 64-bit +=, not OR. Overlapping input bits can generate carries, changing the selected bit set; an OR interpretation is valid only when the relevant masks do not overlap.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_8002702C#r4

Adds selected SFX banks to desired-bank state by restricting a caller mask, augmented with fixed common banks, to five selected categories and writing `1` to surviving slots; later code performs loading. The common mask is added with unsigned 64-bit +=, not OR. Overlapping input bits can generate carries, changing the selected bit set; an OR interpretation is valid only when the relevant masks do not overlap.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_80027AB0#r3

Synchronizes the sound-effect subsystem with the persisted JP/US language selection. It keys off current SFX and, when the selection changed, replaces the AXDriver SFX metadata image, resets replaceable bank bookkeeping, unloads Synth banks 1 and 2, and synchronously reloads required slots `0x33`, `1`, and `0x36` from the selected audio directory.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.

## main/melee/lb/lbaudio_ax:lbAudioAx_ObjFree#r3

Returns a non-NULL object to lbAudioAx's dedicated reusable object pool. It is a low-level storage-release wrapper and does not perform object-specific teardown or return memory to a general-purpose heap.

Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.


Lead review:94 writes pass dry-run. Baseline569 facts:438 retain,94 supersede,37 unresolved. Exact166 links:143 retain,4 reject,19 unresolved. Optional language-change sound occurs after metadata replacement and before bank unloading/loading. Foreign match-pause, Camera Mode, disc-error and storage-service claims remain deferred where their exact evidence was not recorded; bounded-pan relation wording also awaits finite-input qualification.

Final overlay correction:95 writes validated;437 inherited facts retained,95 superseded,37 unresolved. dbsound.c overwrites x with the virtual count before printing both current columns, although the PVoice peak uses the earlier associated-node count. Final proposal73d363e2fd606a951ec5eac91c183f8a1493a659af2a2f51fc9f0b8038222218.
