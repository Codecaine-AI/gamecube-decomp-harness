# Luigi Target Stage Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full canonical and rendered source L1-143 and header L1-35 reviewed.

## Functionality

StageData binds Gr_Kind_TLuigi to /GrTLg.dat and a four-row callback array. Target-stage initialization sets two stage flags, creates IDs 0,1,2 through the local installer and runs four common setup helpers. Ground_GetStageGObj allocates a new GObj; failures are returned without callback setup. The local installer indexes before any bounds check, so its callers must provide valid IDs.

The setup inline stores callback3, invokes on_init, and schedules gobj_proc after setting the GX link. It does not consume callback1 or the table flags. Three false-returning callback1 functions are registered in data, but that alone does not prove runtime dispatch. The zero fourth row is not scanned as a terminator by this initializer.

Component 0 sets animation resources from its map ID. Components 1 and 2 use the joint initialization inline, then collision processing as their process callback; component 2 first services the global LB timed-record list. Empty process/cleanup callbacks have no effects. The dynamics query returns NULL; the shadow-render check always returns true. OnLoad is empty. OnStart calls the common Zako manager with NULL and ignores allocation failure.

## Data Section

Existing source object .data is191 bytes; the split object is192. The callback array occupies offsets0-79, archive string begins at80, and StageData occupies92-143. Diagnostic strings follow. Object hashes and exact paths are in object-evidence.json. These files were inspected without building; source-to-object provenance was not reproduced.

## Per-Subject Review

### main/melee/gr/grtluigi:.data

- `fact:11b938c3-474b-4b67-8a7d-d022029df67b` at `2026-09-02T07:24:40.160Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:c8062c01-c149-48bd-9397-6357ed548e2c` at `2026-09-04T23:11:17.260Z`: unresolved game_mapping. TLuigi target-stage role is supported; specific mode placement and visual course geometry require separately owned game-mode or asset evidence.
- `fact:2011836a-51ad-462f-bda9-c2506d128ce0` at `2026-09-04T23:11:17.260Z`: supersede inferred_type. Object symbols and bytes disprove a structures-only or directly adjacent layout. Object provenance is recorded separately; no build was run.
- `fact:dfd5f7b1-1a17-49e8-a016-74f9ac2e2756` at `2026-09-04T23:11:17.260Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:f498000e-3cc7-4989-bbb3-6aa044a29647` at `2026-09-04T23:11:17.260Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221C10

- `fact:7bbae240-ca35-4ee2-800a-5caf49ddbb59` at `2026-09-02T07:24:17.916Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:d0bc7d65-ff25-47fc-8e79-2fa1a92b0040` at `2026-09-02T07:24:17.916Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:4eceb2f6-f751-4d14-945f-1f8e8d0926cb` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:361e1470-cb88-4ad8-95c6-bfbb3913a53b` at `2026-09-04T23:11:17.260Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:5edc215e-9228-4194-87e9-858680b2f375` at `2026-09-04T23:11:17.260Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:fbab0bb9-701f-4e03-beda-191fd185b5e3` at `2026-09-02T07:24:17.916Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221C14

- `fact:c57ce77b-27b5-485d-9411-4a4ff8ba5607` at `2026-09-02T07:23:07.728Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:b45b14fa-b9f8-419a-9579-a63ea8065835` at `2026-09-02T07:23:07.728Z`: unresolved game_mapping. TLuigi target-stage role is supported; specific mode placement and visual course geometry require separately owned game-mode or asset evidence.
- `fact:088b6d05-72dc-4f01-84d6-908161b0ea85` at `2026-09-04T23:11:17.260Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:88e45018-5b89-487e-91cd-34aa34bc15fc` at `2026-09-04T23:11:17.260Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:15a6e53c-432c-4599-b636-73e19931cfd2` at `2026-09-02T07:23:07.728Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:f0c86f8a-acbe-48a8-83f8-604d37809b77` at `2026-09-02T07:23:07.728Z`: supersede state_behavior. Independent inline read exposes the concrete initialization sequence.

### main/melee/gr/grtluigi:grTLuigi_80221CAC

- `fact:1c768201-2863-4bd5-b258-434da0c4c10d` at `2026-09-04T23:11:17.260Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:8f6d0efc-1c55-48c2-bf7f-498515c1b018` at `2026-09-02T07:23:52.414Z`: unresolved game_mapping. TLuigi target-stage role is supported; specific mode placement and visual course geometry require separately owned game-mode or asset evidence.
- `fact:f24336f3-0c4b-4d9b-9816-1e58a061cb35` at `2026-09-04T23:11:17.260Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:84b285c3-f966-4619-8daf-2be941ab5606` at `2026-09-04T23:11:17.260Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:c4d52b7c-68c3-484c-9692-611a6692a22b` at `2026-09-02T07:23:52.414Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221CB4

- `fact:8506cf44-6391-4ffb-a088-14982131a919` at `2026-09-02T07:22:29.960Z`: supersede data_flow. The current inline installs selected fields, not the entire record. Ground_GetStageGObj creates a new GObj.
- `fact:695ae99e-99ae-4999-85fe-c84346fefee8` at `2026-09-02T07:22:29.960Z`: unresolved game_mapping. TLuigi target-stage role is supported; specific mode placement and visual course geometry require separately owned game-mode or asset evidence.
- `fact:81ac6ca7-8fea-49e9-831f-50ab45a40330` at `2026-09-02T07:22:29.960Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:8c4590d7-5f5b-4ca5-95cb-a2bf660084ef` at `2026-09-02T07:22:29.960Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:47ea20f1-ad45-4445-9b3a-100ed19dcefb` at `2026-09-02T07:22:29.960Z`: supersede state_behavior. Clarifies the caller-supplied index invariant and setup ordering.

### main/melee/gr/grtluigi:grTLuigi_80221D9C

- `fact:def5472a-020b-4352-9181-bcb67aba4aff` at `2026-09-04T23:11:17.260Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:cc497e3e-1694-4c4f-b8b4-2366f25cde1c` at `2026-09-02T07:24:10.882Z`: unresolved game_mapping. TLuigi target-stage role is supported; specific mode placement and visual course geometry require separately owned game-mode or asset evidence.
- `fact:3181e879-78e2-42ed-bd48-18d72173dfbe` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:c2dc1cf7-3c66-4a8a-ad42-6b2ce97134cd` at `2026-09-04T23:11:17.260Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:babe0bc7-5c86-4024-b5a1-130b4923daf6` at `2026-09-04T23:11:17.260Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:0e85462f-5ed4-4b53-87cc-1df6fc16e9ed` at `2026-09-04T23:11:17.260Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221DC8

- `fact:2c7696c5-ba39-4870-8d34-07a40999a993` at `2026-09-02T07:25:47.439Z`: supersede data_flow. Distinguish table membership from actual consumption by the current inline installer.
- `fact:27a9ee84-7a08-4d62-8940-a801de90cff4` at `2026-09-02T07:25:47.439Z`: retain game_mapping. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.
- `fact:de0342a6-9942-459a-b796-53e920a062e2` at `2026-09-04T23:11:17.260Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:26d1964d-11f3-4d38-849b-b0b1b7684196` at `2026-09-02T07:25:47.439Z`: retain inferred_type. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.
- `fact:43538649-0846-47c9-bb51-2582a3262683` at `2026-09-04T23:11:17.260Z`: retain purpose. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.
- `fact:1a09fbb6-af94-4739-aa75-5d52860227d7` at `2026-09-02T07:25:47.439Z`: retain state_behavior. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.

### main/melee/gr/grtluigi:grTLuigi_80221DD0

- `fact:940b741a-0a4c-4aba-be00-2f99bd6b54da` at `2026-09-02T07:23:30.993Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:6215eadd-0517-455a-8414-4a1cccdf758b` at `2026-09-02T07:23:30.993Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:0bc6f685-e4e5-4591-9b00-3c7f900008fc` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:39e07abc-d10b-4a44-b7e7-1d1e978f5d84` at `2026-09-04T23:11:17.260Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:2db87f8d-82c8-4568-9d99-d15ddbb6526d` at `2026-09-04T23:11:17.260Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:cfbeb45d-3651-4f5b-8cdb-b3a5de2af22f` at `2026-09-02T07:23:30.993Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221DD4

- `fact:e50e623c-c5fc-4f02-844f-70e78fb964c1` at `2026-09-02T07:24:15.951Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:5ff0aac5-2550-4bc5-9e86-50bbd4cdc664` at `2026-09-02T07:24:15.951Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:5ec5d335-89b6-4a03-b319-e3d3747ed289` at `2026-09-04T23:11:17.260Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:71def50d-e4ee-4e21-8f2d-ec521c0c193c` at `2026-09-04T23:11:17.260Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:4d9ede1a-cfec-4927-b88e-fcf5b2a9f80d` at `2026-09-02T07:24:15.951Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221DD8

- `fact:eb049c78-15aa-40d9-bf5a-bc4821099eee` at `2026-09-02T07:22:18.850Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:a7a678ad-d452-454d-8370-849911b26780` at `2026-09-02T07:22:18.850Z`: unresolved game_mapping. TLuigi target-stage role is supported; specific mode placement and visual course geometry require separately owned game-mode or asset evidence.
- `fact:8cdea3be-e719-4a89-a9b4-7dccffecacbe` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:0862c950-de38-433e-8b8e-4128c5efe70d` at `2026-09-02T07:22:18.850Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:803b6b9b-54aa-45bd-8aa9-80c4b3934197` at `2026-09-02T07:22:18.850Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:6a25ed08-1fb0-4bef-b732-d32ce4804674` at `2026-09-02T07:22:18.850Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221E28

- `fact:a7f4f3cb-237a-4d83-bea9-75b5f07ededf` at `2026-09-02T07:25:32.749Z`: supersede data_flow. Distinguish table membership from actual consumption by the current inline installer.
- `fact:0d562d13-f8d6-4ffe-b320-2f1c784647cf` at `2026-09-02T07:25:32.749Z`: unresolved game_mapping. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.
- `fact:a0c63456-67b6-4a5f-92ec-22242cd111fd` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:0449ac37-e43d-4b31-8377-a915e8ade38f` at `2026-09-02T07:25:32.749Z`: retain inferred_type. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.
- `fact:9ea793ee-385b-4bbb-8a50-c1e7f1fe9872` at `2026-09-02T07:25:32.749Z`: retain purpose. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.
- `fact:30664c22-b04b-4c3c-a03a-2b78cb450817` at `2026-09-02T07:25:32.749Z`: retain state_behavior. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.

### main/melee/gr/grtluigi:grTLuigi_80221E30

- `fact:7ecb888a-6d0e-4666-a2cc-4018b8cbca29` at `2026-09-02T07:25:29.921Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:5dd87de9-2853-43ea-9466-24041d21746a` at `2026-09-02T07:25:29.921Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:776e781e-377e-4310-990d-531ff531ed4e` at `2026-09-02T07:25:29.921Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:50bbdc06-461e-4de9-af6a-e26495bea7f2` at `2026-09-02T07:25:29.921Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:a7ff8c63-61a3-4213-bab9-a2312a569f84` at `2026-09-02T07:25:29.921Z`: supersede state_behavior. Replace ambiguous disabled-state wording with the exact zero-flag guard.

### main/melee/gr/grtluigi:grTLuigi_80221E64

- `fact:71566c40-a5c9-4e6d-916d-2832fd17817b` at `2026-09-02T07:23:55.213Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:ba41c8bc-2ce4-472b-a793-55748beba70e` at `2026-09-02T07:23:55.213Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:99c22106-454d-4242-b666-3d0e1502bf14` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:5eb5c0eb-8a7c-40f9-a7af-e81ebc62f0d1` at `2026-09-02T07:23:55.213Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:2560d0b0-0744-47a2-a974-4df6b1426507` at `2026-09-04T23:11:17.260Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:9b1fa8fd-0979-4159-9e27-7f7233c13d29` at `2026-09-02T07:23:55.213Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221E68

- `fact:e85afe44-bdd3-4a18-b8e8-57aabc003a28` at `2026-09-02T07:24:05.534Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:9a6883e9-36df-475f-bc5c-24936ffcc163` at `2026-09-02T07:24:05.534Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:b836af31-9c3c-4144-bf5d-20e8a9aa0ee0` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:d16f76de-b9d2-4879-8305-d7e7ad052b0c` at `2026-09-02T07:24:05.534Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:8948eaaa-31f8-4ac5-916d-56b1f530405a` at `2026-09-02T07:24:05.534Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:ba6ad48a-fe80-4f1f-958d-c40041c19a01` at `2026-09-02T07:24:05.534Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221EB8

- `fact:3c8ffbd3-db81-4980-8bc6-3be04b141db1` at `2026-09-02T07:24:02.059Z`: supersede data_flow. Distinguish table membership from actual consumption by the current inline installer.
- `fact:a71ec4f1-8478-4c32-90ec-fc0c8b94c7e5` at `2026-09-02T07:24:02.059Z`: retain game_mapping. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.
- `fact:5c66087d-774c-4f71-ab1d-63b69e1cc561` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:24fea8f2-aaa0-4420-a81e-96807d98ba46` at `2026-09-02T07:24:02.059Z`: retain inferred_type. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.
- `fact:9035bc7f-aad2-477d-8d7b-f1a9bd915634` at `2026-09-02T07:24:02.059Z`: retain purpose. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.
- `fact:aecc0509-ccab-4a02-a01d-9f993d9e6a4f` at `2026-09-02T07:24:02.059Z`: retain state_behavior. Retain as callback-table slot/body description only. No actual invocation by the current installer is claimed.

### main/melee/gr/grtluigi:grTLuigi_80221EC0

- `fact:24dfe90d-94e5-47a8-b758-bb1b481855f0` at `2026-09-02T07:25:12.397Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:a3d11338-b16d-44dc-8dcb-445826e414f9` at `2026-09-02T07:25:12.397Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:4426e9c8-ba83-49ba-91b0-c9d19c8b73b3` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:624650f4-e62a-46eb-8e6d-854844f0fcc8` at `2026-09-04T23:11:17.260Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:67189d30-7153-4dc3-8bec-8d7904820a5c` at `2026-09-04T23:11:17.260Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:8aa01a2c-3444-48ba-b708-506dcf095568` at `2026-09-02T07:25:12.397Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221EE0

- `fact:4e1381c2-b639-4093-8bd2-aa998eeb64b2` at `2026-09-02T07:25:40.890Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:8e51ef59-c9b4-4952-b257-46bc08a39914` at `2026-09-02T07:25:40.890Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:eb2f5c07-4597-4db9-b8ff-c2c845a2f1fe` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:a78a1712-1137-4765-bbb9-9fe76e375a92` at `2026-09-02T07:25:40.890Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:58787ae4-ecda-49a5-82ee-da236d17cf98` at `2026-09-04T23:11:17.260Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:fdea0740-2c9a-458e-a354-a9ab9542887e` at `2026-09-02T07:25:40.890Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221EE4

- `fact:940dcb68-9d60-4a33-ba82-cffaa4ea2abe` at `2026-09-04T23:09:09.985Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:82d864a9-5652-46b7-83c0-3b06032871cd` at `2026-09-04T23:09:09.985Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:a600e8a7-2415-414f-867b-fb31ec7ee4eb` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Descriptive inferred alias is consistent with current callback-table slot. It is not an attested canonical rename.
- `fact:38c08438-cb3b-46bc-a6c7-9b045e6f7cda` at `2026-09-04T20:15:00.553Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:8522ca2e-193c-4332-8553-214b5b0e69a1` at `2026-09-04T23:09:09.985Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:9dcb9513-f875-4764-ac4a-efeaa1e59822` at `2026-09-02T07:25:11.429Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTLuigi_80221EEC

- `fact:11bbcd43-3586-4f87-b010-b7b6572d300b` at `2026-09-02T07:24:09.420Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:0b5a3b14-c258-4707-aa9a-b176305ce6f2` at `2026-09-02T07:24:09.420Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:c2dedc85-8526-47e0-811d-cd19fb76bbc6` at `2026-09-02T07:24:09.420Z`: supersede inferred_type. Retain exact signature and current slot identity without inventing a selector meaning.
- `fact:a2de9a1e-863d-4150-ad43-5d2be59e204e` at `2026-09-02T07:24:09.420Z`: supersede purpose. Current StageData field order identifies this previously generic stage predicate as the shadow-render check.
- `fact:bfe8f92d-c4e2-417e-97fe-4221d6e4a79f` at `2026-09-02T07:24:09.420Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTluigi_UnkStage0_OnLoad

- `fact:867cdd6d-2ee7-4854-afd2-b3a54e2ce892` at `2026-09-02T04:53:27.495Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:b1b5d0ac-aeb1-41b6-a42e-da1bc010f35d` at `2026-09-02T04:53:27.495Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:69f0967c-1177-4293-b0c2-e79a876e0297` at `2026-09-02T04:53:27.495Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:edb33bde-aa7b-47db-9946-01f4ba76e1f3` at `2026-09-02T04:53:27.495Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:1c1eae65-cf14-4ef2-8e82-e908d6edbd75` at `2026-09-02T04:53:27.495Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### main/melee/gr/grtluigi:grTluigi_UnkStage0_OnStart

- `fact:7dab986c-35f7-45e2-94b4-f2d8763c23b7` at `2026-09-02T04:53:07.661Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:2d011ca4-fde1-466d-922e-fe9bc5456925` at `2026-09-04T23:09:09.985Z`: retain game_mapping. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:60e7cda9-f1f1-442c-b3ce-3f36b74bbcef` at `2026-09-04T23:09:09.985Z`: supersede inferred_type. The inherited non-returning wording could imply noreturn; the wrapper has ordinary void return semantics.
- `fact:99022bb7-9da3-44d6-9502-df0dae52fc71` at `2026-09-02T04:53:07.661Z`: retain purpose. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:6767510b-b2e0-4da3-b9c0-c4f94e33d246` at `2026-09-02T04:53:07.661Z`: retain state_behavior. Current canonical implementation, table position and independently read helpers support this claim.

### src/melee/gr/grtluigi.c

- `fact:1996c4bd-53b5-467d-853b-35ffee958cac` at `2026-09-06T03:42:20.186Z`: retain data_flow. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:1e315a0d-0fcd-4615-b9af-cba88fe50e44` at `2026-09-02T04:53:27.495Z`: unresolved game_mapping. TLuigi target-stage role is supported; specific mode placement and visual course geometry require separately owned game-mode or asset evidence.
- `fact:13ab205c-7851-48c9-afbe-1f9a51bd2899` at `2026-09-02T04:53:27.495Z`: retain inferred_type. Current canonical implementation, table position and independently read helpers support this claim.
- `fact:2b538d6c-2ba2-4bbb-bb0b-cc7bd63a7b44` at `2026-09-02T04:53:27.495Z`: supersede purpose. The source starts a shared manager, not a proven target-specific generator.
- `fact:d716d8cf-64a5-42bd-a423-999e654f836c` at `2026-09-06T03:42:20.186Z`: supersede state_behavior. A zero row exists but terminator semantics are not established by this initializer.

### main/melee/gr/grtluigi:grTLuigi_80221C10#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221CB4#r3

Parameter exists in canonical signature. Flows into the local operations documented for its parent function.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221D9C#r3

Parameter exists in canonical signature. Flows into the local operations documented for its parent function.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221DC8#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221DD0#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221DD4#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221DD8#r3

Parameter exists in canonical signature. Flows into the local operations documented for its parent function.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221E28#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221E30#r3

Parameter exists in canonical signature. Flows into the local operations documented for its parent function.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221E64#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221E68#r3

Parameter exists in canonical signature. Flows into the local operations documented for its parent function.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221EB8#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221EC0#r3

Parameter exists in canonical signature. Flows into the local operations documented for its parent function.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221EE0#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221EE4#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221EEC#r3

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221EEC#r4

Parameter exists in canonical signature. Unused by the body.
No existing facts.


### main/melee/gr/grtluigi:grTLuigi_80221EEC#r5

Parameter exists in canonical signature. Unused by the body.
No existing facts.



## TU Lead Verification

Complete canonical and rendered C143/H35 independently read by TU lead. Canonical shared callback layouts and inline setup/init code confirm selective slot use and direct IDs0,1,2 rather than terminator iteration. Owned proposal preserves upstream names; no source edit. See lead-verification.json. Independent root gate remains pending.

## Live Promotion Receipt

Root promoted 13 reviewed operations to the live KB. Source files are unchanged. See [completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grtluigi/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grtluigi/final-render.json). Proposal and review hashes are preserved.

## Current Application Status

Root completed reviewed live KB promotion for 13 operations. Source is unchanged. See [completion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grtluigi/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grtluigi/final-render.json). Earlier pending statements describe the research handoff.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/4e7fe2aa3f4d8507c486862c557a6df3914d7e4cbab1a97c066ce2fca6097a38/2026-09-08T14-38-47.161Z-27f04ac1-125c-472b-9d60-85e48c0b6f23.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__gr__grtluigi/final-render.json).
