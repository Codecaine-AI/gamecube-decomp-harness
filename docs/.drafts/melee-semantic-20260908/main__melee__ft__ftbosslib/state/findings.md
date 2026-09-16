# Boss State Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Applied unslop writing guidance.

Canonical and rendered reads cover source L158-448 and full dox L1-53. The source has 447 physical lines; the renderer exposes its final empty line as 448. No shared KB or canonical source was changed.

## Findings

Canonical GetFighterGObj and GetMotionId are authoritative; their identical inherited aliases should clear. IsMasterHandEntry should keep its canonical spelling and clear IsMasterHandInEntry. Crazy Hand 0x183 must not inherit an Entry label merely because a separate initializer enters the shared ftMh_MS_Entry constant.

GetFighterGObj returns the first match, not a unique-kind guarantee. GetMotionId makes absence indistinguishable from an actual DeadDown return. Special-attribute access checks GObj, userdata and ext_attr, but assumes ft_data exists. Flag predicates guard absent GObjs, not malformed Fighter userdata.

Fresh consumer reads locate x16C and x174 use in gm_17C0.c L106-109 and L212-253. They drive successive background-flash calls and cumulative controller thresholds. The old loss of gmregclear evidence does not make these consumers absent. Camera setup passes an unmodified interest vector and a Z-offset position vector, then starts a count-10 transition. Item reset independently propagates x7 to x5 and clears x3.

## Subject Reviews

### main/melee/ft/ftbosslib:ftBossLib_8015C2A8

Returns whether Crazy Hand's queried motion ID equals 0x183. The current Entry initializer uses ftMh_MS_Entry; it does not establish that 0x183 means Entry.

- `fact:e7717ae2-fbb1-43db-99e6-4ede899a5204` at `2026-09-02T12:12:12.709Z`: retain. data_flow. Complete function confirms Crazy Hand input, 0x183 comparison and Boolean output.
- `fact:f1dd1e24-85a2-41b3-a96c-47bbc6e403fb` at `2026-09-05T15:08:42.770Z`: supersede. game_mapping. Remove unsupported Entry equivalence; keep the observed literal motion test.
- `fact:0e9952cc-66be-4211-96c6-57be6577e850` at `2026-09-04T22:42:20.936Z`: reject. inferred_name. 0x183 equality does not establish Entry. The pinned Crazy Hand Entry initializer uses ftMh_MS_Entry, so inherited Entry identification lacks support.
- `fact:49515083-57a3-481a-947c-ba1133cf740b` at `2026-09-02T12:12:12.709Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:e52200c7-c1ab-4e7c-bb1f-4ae7d92a81ef` at `2026-09-04T22:42:20.936Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:3d7002b0-394b-4b0a-937f-fc88d85c6900` at `2026-09-04T22:42:20.936Z`: supersede. state_behavior. Remove unsupported Entry equivalence; keep the observed literal motion test.

### main/melee/ft/ftbosslib:ftBossLib_8015C2E0

Returns true for Master Hand motion IDs 0x158 or 0x159 and false otherwise.

- `fact:76d33361-2b3f-4234-8f14-5ac4c765d7f9` at `2026-09-02T12:25:54.914Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:a595c5ef-b4cb-4d59-a0c6-bb774d21e9a9` at `2026-09-04T22:42:20.936Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:c9926189-8bbe-4fb5-8560-1ee1ab4112b8` at `2026-09-02T12:25:54.914Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:bfe6e4df-7bb9-4ad4-acd0-52dddb501f19` at `2026-09-04T18:52:54.431Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:4ee13a18-ecbd-45d0-927d-966fa0690703` at `2026-09-02T12:25:54.914Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C31C

Returns true for Crazy Hand motion IDs 0x181 or 0x182 and false otherwise.

- `fact:413f0379-0375-48d2-ae91-be1ef1e51c26` at `2026-09-02T12:10:02.285Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:e7294169-0f45-4bd2-9b78-7c828c7836b2` at `2026-09-02T12:10:02.285Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:1763767f-58bc-4070-9ee1-a545cf66473c` at `2026-09-02T12:10:02.285Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:42799b52-4382-417f-b9de-c26ebc0325c8` at `2026-09-02T12:10:02.285Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:4ce403e4-844e-4c9f-b811-7df0b720a9e4` at `2026-09-02T12:10:02.285Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C358

Returns true when Master Hand exists and its Fighter x221F_b3 flag is set; returns false otherwise.

- `fact:8b441219-40da-4518-ad3c-2f115b013ce4` at `2026-09-02T12:10:38.661Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:02d4abbb-c40e-4aa4-8ff9-af9755a228a5` at `2026-09-02T12:10:38.661Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:989f065a-14f8-497c-8a24-862d86b19487` at `2026-09-02T12:10:38.661Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:bb00c0e7-3423-4eec-919d-ba15c061ca2e` at `2026-09-02T12:10:38.661Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:a5bb4836-6baf-4245-9e2f-8d5847e5052c` at `2026-09-02T12:10:38.661Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C3A0

Returns true when Crazy Hand exists and its Fighter x221F_b3 flag is set; returns false otherwise.

- `fact:1330bc0a-b41f-4bcb-873b-1501f22c7571` at `2026-09-02T12:10:53.900Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:5453b7e9-b14e-4002-961c-62b8f1ca358a` at `2026-09-02T12:10:53.900Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:ba859778-822e-4172-8e14-e5063152914f` at `2026-09-02T12:10:53.900Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:8c46031f-0d1e-4005-8689-b1a13f398f7f` at `2026-09-02T12:10:53.900Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:be060151-056d-4a43-822a-abee5b420832` at `2026-09-02T12:10:53.900Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C4C4

Returns Crazy Hand's stored u.mh.x2250 value, or zero when Crazy Hand is absent. This stored selection is separate from the GetMotionId query.

- `fact:7e7e35fd-ecf5-4aa8-aec9-31eec46e0f5d` at `2026-09-02T12:09:21.652Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:ac8a1be5-7493-4157-91e1-10bb142672a0` at `2026-09-02T12:09:21.652Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:0052089b-cd16-4812-81a1-eb54405a0943` at `2026-09-06T02:34:38.472Z`: retain. inferred_name. Independent current caller or callee confirms descriptive selection, delay or camera transition role; alias is inferred.
- `fact:c0160951-eb8d-41ea-87e6-567f60ad2545` at `2026-09-02T12:09:21.652Z`: unresolved. inferred_type. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:c2abef09-49f8-46a0-b62a-ef37cc86e9fb` at `2026-09-02T12:09:21.652Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:e0ce5d8d-891f-4987-978e-99af8e53a965` at `2026-09-02T12:09:21.652Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C530

Selects Master Hand extended attributes x0, x4, x8, xC or x10 for cpu_level 0 through 4; every other value selects x14. Returns zero when Master Hand is absent.

- `fact:2cc0bfe2-47d8-412b-9f38-0667f7064282` at `2026-09-05T15:08:42.770Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:10e29c83-1173-4015-9281-b42e79b2c99d` at `2026-09-02T12:10:20.403Z`: unresolved. inferred_type. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:356ef17d-dc96-43b2-a87d-adcca1bfd527` at `2026-09-05T15:08:42.770Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:89a77142-4f83-4387-a994-0decfc833417` at `2026-09-02T12:10:20.403Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C5F8

Uses HSD_Randi(4) to choose a branch that plays SFX 0x4E21A through 0x4E21D for the supplied Fighter, with playback arguments 0x7F and 0x40.

- `fact:82754d75-d821-4ab5-8ff1-7443195cb36c` at `2026-09-02T12:10:12.880Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:a14ac3bd-bbff-42f7-bee8-7eb7bad65527` at `2026-09-02T12:10:12.880Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:5b7dd1d3-066f-4e66-a5ba-39ea6d3104cd` at `2026-09-02T12:10:12.880Z`: retain. inferred_name. The complete implementation directly supports the descriptive alias; it remains inferred, not canonical.
- `fact:a2c7958a-ea85-40d6-ba9e-8193ca6022a3` at `2026-09-02T12:10:12.880Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:6dc33173-656a-42b2-a1c3-70a517eb49f9` at `2026-09-02T12:10:12.880Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:e49e152f-febe-4c5f-b0f3-b109b71e393b` at `2026-09-02T12:10:12.880Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C6BC

Returns the active Master Hand Fighter's ft_data->ext_attr pointer. Returns NULL for absent GObj, absent userdata or absent ext_attr; ft_data itself is not null-checked.

- `fact:6e66994d-e8e8-4801-afbd-bc41d51e9f2c` at `2026-09-02T12:12:00.782Z`: retain. data_flow. The complete local implementation and adjacent helper support the stated flow and failure behavior.
- `fact:c4ae1fb6-4731-4302-a78c-67b3be99502d` at `2026-09-02T12:12:00.782Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:d47a9d11-93b3-4346-b284-c38023a24102` at `2026-09-06T02:34:38.472Z`: retain. inferred_name. The complete implementation directly supports the descriptive alias; it remains inferred, not canonical.
- `fact:f071ff88-08cc-4b0f-b3f9-28a4f3e16ff1` at `2026-09-02T12:12:00.782Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:fa08f9fd-d90c-4279-8940-c4a01281f56e` at `2026-09-02T12:12:00.782Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:342b7d1c-c532-4925-94fa-d4c804a71032` at `2026-09-02T12:12:00.782Z`: retain. state_behavior. The complete local implementation and adjacent helper support the stated flow and failure behavior.

### main/melee/ft/ftbosslib:ftBossLib_8015C74C

Returns Master Hand special attribute x164, or -1 when the attribute lookup fails.

- `fact:fe69227a-229a-4fe1-b5e1-b27544362333` at `2026-09-05T15:08:42.770Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:9e70273b-a7a9-440b-a559-d61c4f88350b` at `2026-09-05T15:08:42.770Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:21b9cd5d-fd83-481d-a3e5-a937b36fab88` at `2026-09-06T02:34:38.472Z`: retain. inferred_name. Independent current caller or callee confirms descriptive selection, delay or camera transition role; alias is inferred.
- `fact:fa542b82-ef2c-49c2-912c-bc2d56d32c99` at `2026-09-05T15:08:42.770Z`: unresolved. inferred_type. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:0057c89e-f16f-4a8b-8806-65fc39d9b8c7` at `2026-09-05T15:08:42.770Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:57906830-e248-4961-b2d6-abadc25d68dd` at `2026-09-04T18:52:54.431Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C7EC

Returns Master Hand special attribute x168, or -1 when the attribute lookup fails.

- `fact:1d77c5a9-acbd-4e48-94e0-58a380a80fd3` at `2026-09-05T15:08:42.770Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:2229915a-8b95-4ec0-ac8c-a50a98e6b3ec` at `2026-09-05T15:08:42.770Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:cec2ee82-870d-411d-a238-7225bb7f4ae8` at `2026-09-02T12:10:17.809Z`: unresolved. inferred_type. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:9e7a7add-e81e-4873-8470-0783d879a2ec` at `2026-09-05T15:08:42.770Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:ce3a7dd5-e7b1-4b89-bca2-be885b3e8a7a` at `2026-09-05T15:08:42.770Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C88C

Returns Master Hand special attribute x16C, or -1 when the attribute lookup fails.

- `fact:9f62cf74-ba69-40a3-a247-de03a64091da` at `2026-09-05T15:08:42.770Z`: supersede. data_flow. Replaced by independently confirmed pinned cross-file claim.
- `fact:d13879b5-4725-41b6-96ae-f079839e08f5` at `2026-09-04T22:42:20.936Z`: unresolved. inferred_type. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:00842332-bc41-43f3-aaeb-ff48185b7a13` at `2026-09-05T15:08:42.770Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:5507276c-c7c4-4eab-83c4-040516e1bd62` at `2026-09-05T15:08:42.770Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C92C

Returns Master Hand special attribute x170, or -1 when the attribute lookup fails.

- `fact:9fd4e0a4-30cf-4cce-ae1b-66e0601db7d4` at `2026-09-04T18:52:54.431Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:f4d3e0f6-9344-44ef-9dbc-b345fdec6142` at `2026-09-04T18:52:54.431Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:7712779a-c44c-47c9-b0c8-258ed22ed8a2` at `2026-09-06T02:34:38.472Z`: unresolved. inferred_name. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:43e94d61-a4c8-4a43-b6c9-6539a3b992f6` at `2026-09-04T22:42:20.936Z`: unresolved. inferred_type. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:96f4d8f7-127a-4d4a-8005-c8b2c1ec5d0b` at `2026-09-04T18:52:54.431Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:be3f2c2a-15a7-4162-b425-e24545fe8cf8` at `2026-09-04T18:52:54.431Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C9CC

Returns Master Hand special attribute x174, or -1 when the attribute lookup fails.

- `fact:6fcd03f4-946a-4e75-a2c0-1bdeba804244` at `2026-09-05T15:08:42.770Z`: supersede. data_flow. Replaced by independently confirmed pinned cross-file claim.
- `fact:6d1cd38a-7724-489a-8df6-92e2ea15ca62` at `2026-09-05T15:08:42.770Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:d0b52cf9-c920-4b89-92b1-cc88208cfc8d` at `2026-09-05T15:08:42.770Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:d04e7030-62ee-48ae-8da1-6d8b956bc5b2` at `2026-09-05T15:08:42.770Z`: retain. state_behavior. The complete local implementation and adjacent helper support the stated flow and failure behavior.

### main/melee/ft/ftbosslib:ftBossLib_8015CA6C

Forwards its integer to Player_80036790 for slot zero, and to ftLib_80086A4C for each present Hand GObj; then calls it_8026C3FC.

- `fact:5fef632e-f90b-4181-8b68-90ce3668fdb8` at `2026-09-05T15:08:42.770Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:b0870315-5d15-4aed-92c6-6556376ea711` at `2026-09-04T18:50:55.284Z`: unresolved. inferred_type. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:d8c9369c-e8c2-45c8-b792-81f642215d7b` at `2026-09-05T15:08:42.770Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:38f3ca2e-2a2b-4f38-a9e3-f8d8b8a345d5` at `2026-09-05T15:08:42.770Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015CB7C

Unconditionally delegates to it_8026C42C and returns no value.

- `fact:9c5e3a05-1143-4968-b942-90a2c558eee7` at `2026-09-02T12:09:15.331Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:0e1d3e73-24a6-445a-b7aa-2d6c065bbc64` at `2026-09-02T12:09:15.331Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:ffb9c298-414f-40ed-a9a4-5d566187eb1f` at `2026-09-05T15:08:42.770Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:27cc6398-d94b-418f-ac6e-d802359d31ba` at `2026-09-02T12:09:15.331Z`: supersede. state_behavior. Replaced by independently confirmed pinned cross-file claim.

### main/melee/ft/ftbosslib:ftBossLib_8015CB9C

Loads the selected player coordinates, passes them to Camera_8002E818, offsets a copy on Z by Master Hand x178 or -1 if unavailable, passes it to Camera_8002EA64, then calls Camera_8002F0E4 with 10.

- `fact:b1d4d3fa-89d5-4e52-a4f2-03d71b0f49a6` at `2026-09-04T18:50:55.284Z`: supersede. data_flow. Replaced by independently confirmed pinned cross-file claim.
- `fact:7b7ba3a7-51b8-4e7e-a966-93d6c4e537e9` at `2026-09-05T15:08:42.770Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:74367d9b-77ec-436a-bdf5-ae6a1b37d830` at `2026-09-06T02:34:38.472Z`: retain. inferred_name. Independent current caller or callee confirms descriptive selection, delay or camera transition role; alias is inferred.
- `fact:48c938af-3296-4c68-99c2-6139d63ea1bf` at `2026-09-04T18:50:55.284Z`: unresolved. inferred_type. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:05fcb79e-1bb3-49f2-a1dd-41f8dcccec7a` at `2026-09-04T18:50:55.284Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:06490ef0-7bf7-4796-8f5e-e551a12eee80` at `2026-09-05T15:08:42.770Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015CC14

Unconditionally calls Camera_SetModeToStandard.

- `fact:866a8555-02cb-4a99-b493-510d89021c02` at `2026-09-02T12:10:35.854Z`: retain. data_flow. The complete local implementation and adjacent helper support the stated flow and failure behavior.
- `fact:8840dbeb-c8fe-4dd5-8661-552c23678c23` at `2026-09-02T12:10:35.854Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:a39c0942-8dc6-4f8a-b7ad-7a1ee9c8e55f` at `2026-09-02T12:10:35.854Z`: retain. inferred_name. The complete implementation directly supports the descriptive alias; it remains inferred, not canonical.
- `fact:62da5d8d-4fb5-425e-9dd7-2fffe44c06b3` at `2026-09-02T12:10:35.854Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:d6b4161e-88f0-49dd-ba4b-a0e82000cb05` at `2026-09-02T12:10:35.854Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:337f8c79-e2b5-4a8a-96c9-6ea0448b7891` at `2026-09-02T12:10:35.854Z`: retain. state_behavior. The complete local implementation and adjacent helper support the stated flow and failure behavior.

### main/melee/ft/ftbosslib:ftBossLib_GetFighterGObj

Traverses the global fighter list and returns the first GObj whose ftLib_GetKind equals the requested FighterKind, or NULL when no match exists.

- `fact:649eee84-f01e-4a13-ad75-9c6f87e609f3` at `2026-09-02T12:12:06.010Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:0673e646-74cc-4214-bad6-1f08f5b27945` at `2026-09-04T22:42:20.936Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:48dc8885-1476-41a4-94ef-03bc9da851f6` at `2026-09-02T12:12:06.010Z`: supersede. inferred_name. Current canonical name is authoritative; the inherited alias is redundant or displaces it.
- `fact:4d835caf-f52e-4c00-b8b2-abf395b18234` at `2026-09-02T12:12:06.010Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:227120e6-6f3c-460c-b99d-41f4e43a8683` at `2026-09-04T22:42:20.936Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:af2adbfb-4a72-4748-ab4d-726f1edd8752` at `2026-09-02T12:12:06.010Z`: retain. state_behavior. Full traversal contains only reads and returns, with no allocation or persistent writes.

### main/melee/ft/ftbosslib:ftBossLib_GetMotionId

Looks up the requested FighterKind and returns ftLib_GetMotionId for the first matching GObj, or ftCo_MS_DeadDown if none exists.

- `fact:7d777191-aae5-45c7-a885-b5c18e6067d7` at `2026-09-02T12:25:47.365Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:8f1cd960-743e-46f1-ae60-2e1cbe57c519` at `2026-09-02T12:25:47.365Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:9fc9721f-6a25-4359-b5ca-1f30b5c06ea2` at `2026-09-02T12:25:47.365Z`: supersede. inferred_name. Current canonical name is authoritative; the inherited alias is redundant or displaces it.
- `fact:b342df2e-fecb-4cc2-90bd-d629f77a90cc` at `2026-09-02T12:25:47.365Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:bbca5b0a-0bda-4d6b-b0a1-22f1a6379aee` at `2026-09-02T12:25:47.365Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:2c55e743-2945-4a81-b5b6-5440ffe935ea` at `2026-09-02T12:25:47.365Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_IsMasterHandEntry

Returns whether Master Hand's queried motion equals the canonical ftMh_MS_Entry constant.

- `fact:42622fb7-2921-40c9-9dc7-05e1eeeb1e82` at `2026-09-05T15:08:42.770Z`: unresolved. data_flow. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:1108653a-ee2f-47fa-8f63-1d4a5dcebf01` at `2026-09-05T15:08:42.770Z`: unresolved. game_mapping. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.
- `fact:42f4b66d-6046-4a1e-9134-b7aa7604de0c` at `2026-09-04T18:52:54.431Z`: supersede. inferred_name. Current canonical name is authoritative; the inherited alias is redundant or displaces it.
- `fact:b1ae1ec0-b0fa-4db7-963c-1028835e3172` at `2026-09-05T15:08:42.770Z`: retain. inferred_type. Current declaration and return paths independently confirm the stated signature and local type behavior.
- `fact:87146dd7-6779-411a-95b6-d21cdc88d51e` at `2026-09-05T15:08:42.770Z`: supersede. purpose. Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.
- `fact:266f0268-e0e7-4027-9ec7-3b83c9066ff2` at `2026-09-05T15:08:42.770Z`: unresolved. state_behavior. Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.

### main/melee/ft/ftbosslib:ftBossLib_8015C3E8#r3

Traverses the global fighter list and returns the first GObj whose ftLib_GetKind equals the requested FighterKind, or NULL when no match exists. Parameter identity retained; historical C3E8/C44C locator migration is deferred to the coordinator, with no merge proposed.


### main/melee/ft/ftbosslib:ftBossLib_8015C44C#r3

Looks up the requested FighterKind and returns ftLib_GetMotionId for the first matching GObj, or ftCo_MS_DeadDown if none exists. Parameter identity retained; historical C3E8/C44C locator migration is deferred to the coordinator, with no merge proposed.


### main/melee/ft/ftbosslib:ftBossLib_8015C530#r3

Selects Master Hand extended attributes x0, x4, x8, xC or x10 for cpu_level 0 through 4; every other value selects x14. Returns zero when Master Hand is absent. Parameter identity retained; historical C3E8/C44C locator migration is deferred to the coordinator, with no merge proposed.


### main/melee/ft/ftbosslib:ftBossLib_8015C5F8#r3

Uses HSD_Randi(4) to choose a branch that plays SFX 0x4E21A through 0x4E21D for the supplied Fighter, with playback arguments 0x7F and 0x40. Parameter identity retained; historical C3E8/C44C locator migration is deferred to the coordinator, with no merge proposed.


### main/melee/ft/ftbosslib:ftBossLib_8015CA6C#r3

Forwards its integer to Player_80036790 for slot zero, and to ftLib_80086A4C for each present Hand GObj; then calls it_8026C3FC. Parameter identity retained; historical C3E8/C44C locator migration is deferred to the coordinator, with no merge proposed.


### main/melee/ft/ftbosslib:ftBossLib_8015CB9C#r3

Loads the selected player coordinates, passes them to Camera_8002E818, offsets a copy on Z by Master Hand x178 or -1 if unavailable, passes it to Camera_8002EA64, then calls Camera_8002F0E4 with 10. Parameter identity retained; historical C3E8/C44C locator migration is deferred to the coordinator, with no merge proposed.


### main/melee/ft/ftbosslib:ftBossLib_GetFighterGObj#r3

Traverses the global fighter list and returns the first GObj whose ftLib_GetKind equals the requested FighterKind, or NULL when no match exists. Parameter identity retained; historical C3E8/C44C locator migration is deferred to the coordinator, with no merge proposed.


### main/melee/ft/ftbosslib:ftBossLib_GetMotionId#r3

Looks up the requested FighterKind and returns ftLib_GetMotionId for the first matching GObj, or ftCo_MS_DeadDown if none exists. Parameter identity retained; historical C3E8/C44C locator migration is deferred to the coordinator, with no merge proposed.


## Evidence and Limits

Exact claims, IDs, versions, current evidence locators and read receipts are in coverage.json. Proposed changes require independent review, especially the four cross-file facts. All unresolved inherited claims remain in the baseline pending that review. No entities, merges, links or follow-ups are included in the proposal envelope.
