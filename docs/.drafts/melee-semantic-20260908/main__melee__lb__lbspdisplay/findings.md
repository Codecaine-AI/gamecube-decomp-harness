# Findings

coverage.json contains all fact IDs, versions, dispositions and exact evidence.

## main/melee/lb/lbspdisplay:.data

Two fixed unlit HSD channel descriptors; section also contains assertion strings.

- fact:cea95238-e9e6-4963-9352-ffad2c8cd463 @ 2026-09-04T21:14:37.532Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:5ddef0c0-9ec8-4016-8937-b0eddcd29233 @ 2026-09-04T21:14:37.532Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:4c0ac9c5-c7fd-464d-bbf1-df34f00f010c @ 2026-09-04T21:14:37.532Z: supersede inferred_type. Correct inherited source/branch/section claim from pinned implementation.
- fact:b8e07817-bdac-4600-aa24-e9e2663f9d42 @ 2026-09-04T21:14:37.532Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:d77cec23-92b6-4096-8e44-d5d19929408c @ 2026-09-04T21:14:37.532Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:.rodata

Two constant Vec3 values, eye0,0,1 and interest0,0,0, total24 bytes.

- fact:09dd46ff-b25d-428b-b3ca-150efacf5fc5 @ 2026-09-04T21:14:37.532Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:2f83fefc-c9d9-4ba4-832d-10af12b4a946 @ 2026-09-04T21:14:37.532Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:6c7837aa-0ded-48db-b8ae-63f2b0537f92 @ 2026-09-04T21:14:37.532Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:a16261af-1c54-4fcc-a4af-4b35e816221b @ 2026-09-04T21:14:37.532Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:.sdata

Existing objects identify lobj.h and lobj assertion strings emitted by inline HSD_LObjSetNext.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:.sdata2

Pooled color coefficients, reciprocal blur spacing, conversion double and camera literals.

- fact:ca0aabee-6930-4a77-adec-c32e06903a39 @ 2026-09-04T21:14:37.532Z: supersede data_flow. Correct inherited source/branch/section claim from pinned implementation.
- fact:cf232258-225d-4e9a-ad2d-8d640ef69c45 @ 2026-09-04T21:14:37.532Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:3df7e08d-7b47-4c52-93dc-83ae47bd9fb8 @ 2026-09-04T21:14:37.532Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:d45648cd-39db-46f5-85ff-23e69761a9d5 @ 2026-09-04T21:14:37.532Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:fn_80013614

Call event before mode test, then draw21 samples for mode1 or one for all other modes; tint mode1 restricts scissor.

- fact:901c2e3a-2bab-4c94-9804-ff6ff79c0b89 @ 2026-09-04T21:14:37.532Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:dbe41246-bfde-4c57-b148-bd8176248e16 @ 2026-09-04T21:14:37.532Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:dd0dde8a-c1aa-46ef-b15c-8c447cd02bf0 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:b6719591-5594-4c96-b3c6-75738954006c @ 2026-09-04T21:14:37.532Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:3af0a5b3-a58d-489d-b9c8-ee501d275fc7 @ 2026-09-04T21:14:37.532Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:ee779090-29d0-421a-9ceb-f163c475bf48 @ 2026-09-04T21:14:37.532Z: supersede state_behavior. Correct inherited source/branch/section claim from pinned implementation.

## main/melee/lb/lbspdisplay:fn_800138AC

Free supplied user-state allocation.

- fact:1da16e45-67ac-4699-8191-eb143dd22351 @ 2026-09-04T21:14:37.532Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:4facd52b-d789-4b5a-bc59-e10f38425257 @ 2026-09-04T21:14:37.532Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:73bc2707-7323-47b5-a921-10d07d89e6eb @ 2026-09-04T21:14:37.532Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:1d223b04-9903-419c-8a7d-f88143ba8337 @ 2026-09-04T21:14:37.532Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_80011AC4

Load descriptor chains, attach first animation chain, link previous head directly to current head; empty array leaves first undefined.

- fact:b51b0a50-6c77-4a41-b136-4e54e65182f4 @ 2026-09-02T07:59:14.340Z: supersede data_flow. Correct inherited source/branch/section claim from pinned implementation.
- fact:d6332d5b-ae18-40d8-983c-19a04f668adc @ 2026-09-02T07:59:14.340Z: unresolved game_mapping. Local behavior verified, but inherited external caller guards, Pokemon Stadium usage or detailed light-animation property mapping were not independently reviewed.
- fact:50c9ce06-03dc-45aa-bd68-1d3bdee6b384 @ 2026-09-02T07:59:14.340Z: supersede inferred_type. Correct inherited source/branch/section claim from pinned implementation.
- fact:f19f0b4e-3ccd-4a3e-a0f3-b05b963bc5fb @ 2026-09-02T07:59:14.340Z: supersede purpose. Correct inherited source/branch/section claim from pinned implementation.
- fact:2abb3ca3-1127-4219-b493-d640e87ff9e9 @ 2026-09-02T07:59:14.340Z: supersede state_behavior. Correct inherited source/branch/section claim from pinned implementation.

## main/melee/lb/lbspdisplay:lb_80011B74

Recursively OR flags into DObj material modes, tail first; required nonnull head/materials.

- fact:08c81153-015c-4aa5-a259-43125ad52adb @ 2026-09-02T08:04:51.650Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:9c9c9ed8-9c8b-4884-9c5d-cc806bcb9151 @ 2026-09-04T23:40:20.684Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:32f5e9fd-6660-4774-bd47-456aec15215b @ 2026-09-02T08:04:51.650Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:5c0dde9d-1628-4739-b28e-2e076048d663 @ 2026-09-04T23:40:20.684Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:1369c67e-664d-43a6-bcc5-530e8fb16030 @ 2026-09-02T08:04:51.650Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_80011C18

Postorder child/sibling material traversal; particle/spline payloads skipped but children still traversed.

- fact:d2d97425-7705-41ac-bfe3-c6bdff3510d7 @ 2026-09-04T23:40:20.684Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:50915cea-005d-458d-bc5c-b508d1027f17 @ 2026-09-02T07:57:28.368Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:3f4493f6-9966-4309-b167-fc3ff6c4bf9d @ 2026-09-02T07:57:28.368Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:6aa9a6f6-20ed-47f5-89f2-f5d0e0aeb23e @ 2026-09-04T23:40:20.684Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:d1310a48-438e-4bfb-898c-bc193dae6a9d @ 2026-09-04T23:40:20.684Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_80011E24

Resolve variadic indices ending-1 with depth-first walk and retained position; instance children skipped.

- fact:49184e55-88fd-46dd-a99e-e1bc7bab7838 @ 2026-09-02T08:05:53.436Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:8ee37c82-6a9e-428b-ac49-6ae5377332be @ 2026-09-04T23:40:20.684Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:038ec766-cbdd-440a-9e23-6370b3c029ba @ 2026-09-02T08:05:53.436Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:f4cd6aa7-eaa4-461b-bda0-c206a5dc81f5 @ 2026-09-02T08:05:53.436Z: supersede state_behavior. Correct inherited source/branch/section claim from pinned implementation.

## main/melee/lb/lbspdisplay:lb_8001204C

Resolve u16 array indices with positive count; nonpositive count makes no writes.

- fact:ff10afb4-2dd8-436f-ad41-765e90961cff @ 2026-09-02T12:45:49.403Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:df4c2895-4989-4420-8be2-87fbc9db9e33 @ 2026-09-04T23:40:20.684Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:44a25133-792a-4af7-a2f4-4e865ef081c5 @ 2026-09-02T12:45:49.403Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:88a312d1-4e9c-4eec-b97d-f9c9f179b222 @ 2026-09-02T12:45:49.403Z: supersede state_behavior. Correct inherited source/branch/section claim from pinned implementation.

## main/melee/lb/lbspdisplay:lb_800121FC

Initialize nonmipmapped descriptor and adopt preload or allocate32-byte-rounded size; assert empty image pointer after metadata writes.

- fact:5ec4ac2b-fe90-4daa-ba78-71b50d5c3bbe @ 2026-09-02T12:43:29.281Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:5285c859-0f5d-47ed-9ff4-143233e40880 @ 2026-09-02T12:43:29.281Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:b2b76a62-df2a-4b6e-8477-fc77330ef788 @ 2026-09-02T12:43:29.281Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:5e668033-3f8c-40c6-835c-29642a900b32 @ 2026-09-02T12:43:29.281Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_800122C8

Forward EFB copy origin/clear with sync=true.

- fact:7f1683f5-2ccd-4784-8f62-f713a81280c3 @ 2026-09-02T14:55:50.651Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:27de06f7-0eef-4df1-be07-3269d92d1657 @ 2026-09-04T23:40:20.684Z: unresolved game_mapping. Local behavior verified, but inherited external caller guards, Pokemon Stadium usage or detailed light-animation property mapping were not independently reviewed.
- fact:5042fcd4-324b-4529-b994-da89794f26ce @ 2026-09-02T14:55:50.651Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:a532603c-820c-4420-b90e-75cff5a3a9b0 @ 2026-09-02T14:55:50.651Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:a0af3473-d559-4f9c-be74-1087354d0570 @ 2026-09-02T14:55:50.651Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_800122F0

Texture setup with optional three-stage RGB filter; exactly zero uses one-stage passthrough.

- fact:056a78f6-d748-45d7-9b4e-1d7a6720bff1 @ 2026-09-02T12:46:55.385Z: supersede data_flow. Correct inherited source/branch/section claim from pinned implementation.
- fact:fad2434f-c764-4de7-bc6c-9d542abdfec3 @ 2026-09-04T21:14:37.532Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:ef139bc7-6b34-4737-99eb-1d75d55a8430 @ 2026-09-06T02:34:38.472Z: supersede inferred_name. Resolve duplicate alias with the distinct unfiltered helper; this variant has an explicit optional color-filter factor.
- fact:818fd91e-3eb1-45c7-87fe-f73310ea9039 @ 2026-09-02T12:46:55.385Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:7f74598a-4440-40d6-989f-1b33cadebb50 @ 2026-09-02T12:46:55.385Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:81054d0f-b21e-41c1-99f0-309971c815fa @ 2026-09-02T12:46:55.385Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_8001271C

Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio.

- fact:6f7f10a2-73b5-43b8-bc65-68c1048e6094 @ 2026-09-02T07:59:03.919Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:37cf5757-62cd-4923-9727-5d8cca03a607 @ 2026-09-04T21:14:15.051Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:b548f9ce-fdfd-49e2-8b09-20c76528b78f @ 2026-09-06T02:34:38.472Z: retain inferred_name. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:ac05e169-9962-42fa-9f7f-25f1ec0ce792 @ 2026-09-02T07:59:03.919Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:6949d52d-3aea-4557-8772-7ea116b4d2e2 @ 2026-09-04T21:14:15.051Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:d3777eaf-1ece-4e8a-9fd8-0cd1a20f43c5 @ 2026-09-04T21:14:15.051Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_8001285C

Single-stage unfiltered texture/GX state setup without alpha-input setup or drawing.

- fact:deddc64c-4330-485d-8b6b-af37aac7018b @ 2026-09-04T21:14:15.051Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:cd41edae-1444-44b0-81e2-8d19ced36c1a @ 2026-09-04T21:14:15.051Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:49c8feca-e340-4bc0-ae1d-dcb39ffa486f @ 2026-09-06T02:34:38.472Z: retain inferred_name. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:8391ab1a-fa0a-49bb-8229-30c1f2ad1f7e @ 2026-09-04T21:14:15.051Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:9f3fcc02-1aab-4e12-9dbf-4c28d6a55f49 @ 2026-09-04T21:14:15.051Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:7b40d88b-6a74-4e74-b35b-d7e00112a0ed @ 2026-09-04T21:14:15.051Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_80012994

Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d.

- fact:c3438097-0887-433c-84a8-c3aa1fc2d9b2 @ 2026-09-02T07:57:00.009Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:49fe5c55-4c65-4c2b-8b53-ad9a0e0b3abe @ 2026-09-04T21:14:15.051Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:15240608-0ae2-44ec-9e5d-521b64a6bf5e @ 2026-09-06T02:34:38.472Z: retain inferred_name. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:810679ed-54db-48fc-ad7b-1223adce3f14 @ 2026-09-02T07:57:00.009Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:335763a7-1566-4166-9b05-6e2015fc0459 @ 2026-09-02T07:57:00.009Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:ec3edf9a-e981-456a-8f1b-15574e087c5b @ 2026-09-02T07:57:00.009Z: supersede state_behavior. Correct inherited source/branch/section claim from pinned implementation.

## main/melee/lb/lbspdisplay:lb_800138CC

Replace optional pre-render callback, includingNULL.

- fact:0795a5b1-4b86-4835-96cc-bf9c96fffe82 @ 2026-09-04T21:14:15.051Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:3d7d959d-e6b9-4a95-b82f-9845c738bd78 @ 2026-09-04T21:14:15.051Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:956e52e7-9656-4532-b1cf-a5a1f62025f6 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:dc58196e-f782-48c4-a27b-991cd40bf936 @ 2026-09-04T21:14:15.051Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:1f277ec4-30c0-44a4-86a3-796512842317 @ 2026-09-04T21:14:15.051Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:776b5f4d-4f1f-4c69-96d7-ee0704fb4850 @ 2026-09-04T21:14:15.051Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_800138D8

Set mode1 and assign signed size into unsigned byte; tint not initialized.

- fact:46a59dce-b15c-4309-85b1-3fd2c50babde @ 2026-09-04T21:14:15.051Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:fd2b6a48-b29d-4f73-8ea8-de6fd270e111 @ 2026-09-04T21:14:15.051Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:982d0d19-4cd9-48c2-867c-4322566a4ffc @ 2026-09-06T02:34:38.472Z: retain inferred_name. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:d5a04a50-61b5-46f2-aa81-5798376ed033 @ 2026-09-04T21:14:15.051Z: supersede inferred_type. Correct inherited source/branch/section claim from pinned implementation.
- fact:7c1632c0-14a4-4962-835d-678deb948068 @ 2026-09-04T21:14:15.051Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:8a730524-b028-4f37-9225-6fef634b52f7 @ 2026-09-04T21:14:15.051Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:lb_800138EC

Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations.

- fact:484e6e5d-6265-478c-b3e5-070ad9e5a9bd @ 2026-09-04T21:14:15.051Z: supersede data_flow. Correct inherited source/branch/section claim from pinned implementation.
- fact:8b4198ef-e45d-4f36-a524-8676ecae0cc0 @ 2026-09-04T21:14:15.051Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:f497668b-2cf7-4455-9ca1-c6d1836831ad @ 2026-09-06T02:34:38.472Z: retain inferred_name. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:5806a256-6ddf-41e6-a61c-023f5febd619 @ 2026-09-04T21:14:15.051Z: supersede inferred_type. Correct inherited source/branch/section claim from pinned implementation.
- fact:b0dac65f-7b7f-4f8e-b316-8dcfe5e15262 @ 2026-09-04T21:14:15.051Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:87dca9a4-0699-42dd-b779-6efb57733a2e @ 2026-09-04T21:14:15.051Z: supersede state_behavior. Correct inherited source/branch/section claim from pinned implementation.

## main/melee/lb/lbspdisplay:lb_80013B14

Load camera, exact1.18 perspective aspect correction, upper caps on scissor right/bottom only.

- fact:c660543b-746f-432c-978e-0cb4a7fed0a8 @ 2026-09-04T21:14:15.051Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:82416e3c-3ad8-4008-ab6c-019b7bcfd887 @ 2026-09-04T21:14:15.051Z: supersede game_mapping. Correct inherited source/branch/section claim from pinned implementation.
- fact:68e9f377-8a25-48a3-903e-88eef1f98b27 @ 2026-09-04T21:14:15.051Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:c3320bcf-a981-4bf6-96d8-5603859a4bc2 @ 2026-09-04T21:14:15.051Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:0ac5f4bd-09b3-43a0-9ab4-0c890635fb5c @ 2026-09-04T21:14:15.051Z: unresolved state_behavior. Local behavior verified, but inherited external caller guards, Pokemon Stadium usage or detailed light-animation property mapping were not independently reviewed.

## src/melee/lb/lbspdisplay.c

Scene light/material/joint helpers and image capture, filtering and overlay camera composition.

- fact:7c680942-a7ad-4b3c-93c2-5fb6793b6085 @ 2026-09-06T03:55:40.132Z: retain data_flow. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:86ec87cd-c94c-4464-8781-df2bedf0a1dc @ 2026-09-06T03:55:40.132Z: retain game_mapping. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:f61afdca-df7b-40c7-8d19-ad3f19a9804e @ 2026-09-06T03:55:40.132Z: retain inferred_type. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:9dae6d07-ae0c-46a5-a586-5ecb1f58ca0d @ 2026-09-06T03:55:40.132Z: retain purpose. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.
- fact:bf6bfd08-02f5-4574-844a-e38ee11154d8 @ 2026-09-04T21:40:03.726Z: retain state_behavior. Complete pinned source and supporting helper evidence support this claim; canonical symbols unchanged.

## main/melee/lb/lbspdisplay:fn_80013614#r3

Call event before mode test, then draw21 samples for mode1 or one for all other modes; tint mode1 restricts scissor.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:fn_800138AC#r3

Free supplied user-state allocation.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80011AC4#r3

Load descriptor chains, attach first animation chain, link previous head directly to current head; empty array leaves first undefined.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80011B74#r3

Recursively OR flags into DObj material modes, tail first; required nonnull head/materials.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80011B74#r4

Recursively OR flags into DObj material modes, tail first; required nonnull head/materials.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80011C18#r3

Postorder child/sibling material traversal; particle/spline payloads skipped but children still traversed.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80011C18#r4

Postorder child/sibling material traversal; particle/spline payloads skipped but children still traversed.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80011E24#r3

Resolve variadic indices ending-1 with depth-first walk and retained position; instance children skipped.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80011E24#r4

Resolve variadic indices ending-1 with depth-first walk and retained position; instance children skipped.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001204C#r3

Resolve u16 array indices with positive count; nonpositive count makes no writes.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001204C#r4

Resolve u16 array indices with positive count; nonpositive count makes no writes.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001204C#r5

Resolve u16 array indices with positive count; nonpositive count makes no writes.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001204C#r6

Resolve u16 array indices with positive count; nonpositive count makes no writes.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800121FC#r3

Initialize nonmipmapped descriptor and adopt preload or allocate32-byte-rounded size; assert empty image pointer after metadata writes.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800121FC#r4

Initialize nonmipmapped descriptor and adopt preload or allocate32-byte-rounded size; assert empty image pointer after metadata writes.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800121FC#r5

Initialize nonmipmapped descriptor and adopt preload or allocate32-byte-rounded size; assert empty image pointer after metadata writes.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800121FC#r6

Initialize nonmipmapped descriptor and adopt preload or allocate32-byte-rounded size; assert empty image pointer after metadata writes.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800121FC#r7

Initialize nonmipmapped descriptor and adopt preload or allocate32-byte-rounded size; assert empty image pointer after metadata writes.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800122C8#r3

Forward EFB copy origin/clear with sync=true.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800122C8#r4

Forward EFB copy origin/clear with sync=true.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800122C8#r5

Forward EFB copy origin/clear with sync=true.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800122C8#r6

Forward EFB copy origin/clear with sync=true.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800122F0#r3

Texture setup with optional three-stage RGB filter; exactly zero uses one-stage passthrough.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800122F0#r4

Texture setup with optional three-stage RGB filter; exactly zero uses one-stage passthrough.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800122F0#r5

Texture setup with optional three-stage RGB filter; exactly zero uses one-stage passthrough.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001271C#r3

Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001271C#r4

Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001271C#r5

Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001271C#r6

Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001271C#r7

Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001271C#r8

Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001271C#r9

Draw four vertices with negative screen Y; horizontal texture extent uses height ratio and vertical extent uses width ratio.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001285C#r3

Single-stage unfiltered texture/GX state setup without alpha-input setup or drawing.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_8001285C#r4

Single-stage unfiltered texture/GX state setup without alpha-input setup or drawing.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80012994#r10

Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80012994#r3

Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80012994#r4

Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80012994#r5

Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80012994#r6

Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80012994#r7

Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80012994#r8

Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80012994#r9

Fixed21-quad composition, first alpha caller supplied then20 fixed constants; offsets d=size/64 and2d.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138CC#r3

Replace optional pre-render callback, includingNULL.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138CC#r4

Replace optional pre-render callback, includingNULL.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138D8#r3

Set mode1 and assign signed size into unsigned byte; tint not initialized.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138D8#r4

Set mode1 and assign signed size into unsigned byte; tint not initialized.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138EC#r10

Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138EC#r3

Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138EC#r4

Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138EC#r5

Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138EC#r6

Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138EC#r7

Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138EC#r8

Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_800138EC#r9

Create orthographic camera and overlay user data; omitted return and partially initialized data remain source limitations.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.

## main/melee/lb/lbspdisplay:lb_80013B14#r3

Load camera, exact1.18 perspective aspect correction, upper caps on scissor right/bottom only.

Current source signature/role reviewed; no existing facts. No parameter entity rename proposed.


Independent review repair: facts c3320bcf-a981-4bf6-96d8-5603859a4bc2 and 7c680942-a7ad-4b3c-93c2-5fb6793b6085 are superseded. Scissor normalization only upper-caps right/bottom; priority and render callback go to GX registration, not CameraBlurData. Final packet has 22 writes, 85 retain, 19 supersede, 3 unresolved. SHA `572ee6f055cbed01499413b2c94561f4c3194757c9982a97aa8572a6359da554`.

Final light-loader correction: prev != NULL controls direct linking, while prev == NULL assigns first=curr. A NULL load causes the following iteration to reset first. Final proposal SHA `fdc89f01bfbc5eade300e7df4b1220dc4b6ca3b8b7c5b15cbc01dfee314d947b` (22 writes).
