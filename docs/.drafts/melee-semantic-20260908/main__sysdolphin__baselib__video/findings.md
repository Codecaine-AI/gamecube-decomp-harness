# Video Semantic Findings

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`.

## main/sysdolphin/baselib/video:.bss

Provides the video unit's zero-initialized working storage: the persistent HSD VI presentation state and a private aligned scratch framebuffer used by the split high-resolution anti-aliasing display-copy path.

- fact:83dad471-3141-4c6a-948e-b7b26f390cf1 @ 2026-09-04T21:37:27.289Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:b2681cd5-6cec-4278-867f-b58d3e80a8be @ 2026-09-04T21:37:27.289Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:27e4ffab-9722-4ad0-bd48-d58c2e8d969a @ 2026-09-02T05:00:41.724Z: supersede inferred_type. Correct inherited claim using pinned source and recorded object observations.
- fact:26e340d3-bb43-45a1-abd3-b585e76e2d9f @ 2026-09-02T05:00:41.724Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:45d50538-b913-462d-b9c1-63f00460828d @ 2026-09-04T21:37:27.289Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:.data

Stores video.c's initialized diagnostic text: the stringified conditions for its three HSD_ASSERT guards and the panic message used when HSD_VICopyEFB2XFBPtr receives an unsupported render-pass value.

- fact:5a46211a-aa43-4332-94d4-31fc35ec11e9 @ 2026-09-04T21:37:27.289Z: supersede data_flow. Correct inherited claim using pinned source and recorded object observations.
- fact:a4b8766c-27bf-4884-8705-236c3e5dc717 @ 2026-09-04T21:37:27.289Z: supersede inferred_type. Correct inherited claim using pinned source and recorded object observations.
- fact:b2ac8fbe-a16b-4f35-98b9-d9bff26fa4b3 @ 2026-09-04T21:37:27.289Z: retain purpose. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:.sbss

Provides persistent storage for HSD_VIPreRetraceCB's retrace-window performance counters: one counts VI retraces and the other counts framebuffer-renewal events so the video layer can periodically publish how many frames were renewed.

- fact:3d28d537-700b-4259-9997-e17c924fde2a @ 2026-09-02T04:59:56.812Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:062e924b-dc38-40cb-ad4c-474f9521e6fd @ 2026-09-02T04:59:56.812Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:438b305c-43e9-4f00-91f6-181d9a39caae @ 2026-09-02T04:59:56.812Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:701c6f6b-4326-4320-9d6b-df002bac528f @ 2026-09-02T04:59:56.812Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:4fa10f2c-73d0-4918-803d-fbcabff790cc @ 2026-09-02T04:59:56.812Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:.sdata

Stores the video.c filename used in this unit's assertion and panic diagnostics.

- fact:a72c4372-4dcd-4966-ab34-4cbd6e169839 @ 2026-09-02T05:00:27.849Z: supersede data_flow. Correct inherited claim using pinned source and recorded object observations.
- fact:e72eb389-f10b-4b47-955f-feaa8a921899 @ 2026-09-02T05:00:27.849Z: supersede game_mapping. Correct inherited claim using pinned source and recorded object observations.
- fact:cf6f3a07-dbc0-4436-ab31-aee34f5da5bf @ 2026-09-02T05:00:27.849Z: supersede inferred_type. Correct inherited claim using pinned source and recorded object observations.
- fact:dd7672f2-d7a5-4ba9-8dfd-01a3b16c1f6c @ 2026-09-02T05:00:27.849Z: supersede purpose. Correct inherited claim using pinned source and recorded object observations.
- fact:8f632ffe-169a-4d8c-8339-65aa1e44a66e @ 2026-09-02T05:00:27.849Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:.sdata2

Canonical signature and input uses reviewed.

Section has no baseline facts. Existing object .sdata2 contains 1.0f and the double conversion bias 0x4330000000000000, with padding; no new data identity proposed.

## main/sysdolphin/baselib/video:HSD_VICopyEFB2XFBPtr

Configures GX display-copy state from an HSD video configuration and transfers either a complete EFB image or one half of the split high-resolution antialiasing image into caller-supplied XFB storage, clearing the copied EFB region as part of each transfer.

- fact:dda70158-353a-4bda-bc39-3d2b87dc79f3 @ 2026-09-02T00:17:13.343Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:dae67d12-7824-485f-a63e-bd9aa9f0450c @ 2026-09-02T00:17:13.343Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:9e535dfc-c10a-4f69-ba06-66ccf83678b0 @ 2026-09-02T00:17:13.343Z: supersede inferred_type. Correct inherited claim using pinned source and recorded object observations.
- fact:80d83217-5949-48b7-a28e-8e761b33a1de @ 2026-09-02T00:17:13.343Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:31cdd580-0841-4511-9975-86d13b66902d @ 2026-09-02T00:17:13.343Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VICopyXFBAsync

Queues an EFB-to-XFB display copy into an available external framebuffer and attaches a GX draw-completion fence so that framebuffer can enter the asynchronous presentation pipeline.

- fact:e750d2b5-0ee0-4aad-bdc4-2c097afef2f9 @ 2026-09-02T00:17:12.570Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:7bbb777b-177e-4656-8ba5-9631386ce75e @ 2026-09-02T00:17:12.570Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:6d4ffd4d-8d90-4447-a808-d437b1185136 @ 2026-09-02T00:17:12.570Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:9045c021-6f3e-4b43-90aa-654bb6fc8aad @ 2026-09-02T00:17:12.570Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:83f5ff73-1f7e-4654-b38d-384869edf1a4 @ 2026-09-02T00:17:12.570Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:HSD_VIDrawDoneXFB

Completes the XFB bookkeeping stage of an asynchronous EFB-to-XFB copy after GX signals draw completion, making the completed framebuffer the next frame for presentation when the queue is empty or retaining it as a completed frame behind an already queued XFB.

- fact:e158dbc7-b02e-442d-9572-5514b4b41289 @ 2026-09-02T00:18:24.072Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:c4a99b29-8e21-4061-8bc5-b6cf54f6e1cf @ 2026-09-02T00:18:24.072Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:b11b350b-f713-4aaf-844b-1e1b8160a418 @ 2026-09-02T00:18:24.072Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:2bd08abd-9dee-400b-91d0-b0238b8ebcd3 @ 2026-09-02T00:18:24.072Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VIGXDrawDoneCB

Serves as the HSD video layer's internal GX draw-completion handler: when GX reports that a requested draw is finished, it releases the outstanding-request wait state and forwards completion to the optional user draw-done callback.

- fact:f79e5ac1-6206-427a-9b8e-c458a925d7d3 @ 2026-09-02T00:16:54.201Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:8f41e593-136b-409a-8177-3ac1a22e03c6 @ 2026-09-02T00:16:54.201Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:e621bff1-78a5-47aa-af75-07e0f73621d7 @ 2026-09-02T00:16:54.201Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:32512e01-d1e0-455e-991c-d584e6bdd1fb @ 2026-09-04T21:37:27.289Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VIGetDrawDoneWaitingFlag

Reports whether the HSD video layer is still waiting for completion of a previously issued GX draw-done command, so the command-issuing routine can wait before starting another draw-done cycle.

- fact:4d9d0f82-c1fa-4f3f-bfd5-b91cb7f367db @ 2026-09-04T21:37:27.289Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:db4b38b6-7de1-42bf-b07a-370bfc439544 @ 2026-09-04T21:37:27.289Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:6c97e98d-dea1-4df2-aa3e-838f8b020e9c @ 2026-09-02T00:16:57.719Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:d8300199-8ba6-4d33-ae0d-db0810e8c5ae @ 2026-09-04T21:37:27.289Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VIGetXFBDrawEnable

Provides the nonblocking XFB-acquisition step used before an EFB-to-XFB copy: when at least two external framebuffers are configured, it returns the slot already reserved for drawing or reserves a free slot; otherwise it reports that no drawable slot is available.

- fact:4f932be4-7821-4777-b29f-9cc13d8c26cb @ 2026-09-02T00:17:28.720Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:eaa14169-7232-45bf-a842-a46e53d41b69 @ 2026-09-02T00:17:28.720Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:e8bd8123-1afc-4279-b42e-8b05d3e15f33 @ 2026-09-02T00:17:28.720Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:56101e04-25e7-48e8-a147-a759fdd8246e @ 2026-09-02T00:17:28.720Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:443626ea-6ba2-4425-bb3b-0b941820915b @ 2026-09-02T00:17:28.720Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VIGetXFBLastDrawDone

Returns the first slot found in status-priority order WAITDONE, DRAWDONE, NEXT, DISPLAY, or -1 if none exists. WAITDONE may still have an outstanding GPU copy, so this result is not a guarantee that the selected framebuffer is complete or safe to read.

- fact:0f057ce5-6b1c-4276-848e-48192d3b5731 @ 2026-09-02T00:17:10.569Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:b51c9604-403c-4d64-81e3-a1ae6b988c8d @ 2026-09-02T00:17:10.569Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:e2ff4ce8-2d90-41b2-a351-0354056b46e6 @ 2026-09-02T00:17:10.569Z: supersede purpose. Correct inherited claim using pinned source and recorded object observations.
- fact:ce755bcf-8d3e-4322-8a7b-65f7ef03695e @ 2026-09-02T00:17:10.569Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VIInit

Initializes HSD video state and callbacks, configures and flushes VI mode/black settings, then submits a full-screen EFB copy into the first FREE XFB. It leaves that slot FREE and does not call VISetNextFrameBuffer here, so this initial copy alone does not establish displayed-frame ownership.

- fact:5192a413-7b85-4ea2-ab14-c9dcf7d6e1f1 @ 2026-09-01T23:06:29.615Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:54c41f38-1499-4db7-a9d7-c95cd3dbfa39 @ 2026-09-01T23:06:29.615Z: supersede game_mapping. Correct inherited claim using pinned source and recorded object observations.
- fact:8e000901-9bcc-4865-a96a-87075bf198ac @ 2026-09-01T23:06:29.615Z: supersede inferred_type. Correct inherited claim using pinned source and recorded object observations.
- fact:30a4dc6a-b23c-4717-b8fc-ebf03f1ffef9 @ 2026-09-01T23:06:29.615Z: supersede purpose. Correct inherited claim using pinned source and recorded object observations.
- fact:89e94613-53dd-496f-bb8c-afcd0aceaffa @ 2026-09-01T23:06:29.615Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:HSD_VIPostRetraceCB

Handles each VI post-retrace event by advancing HSD's framebuffer presentation queue, or by completing a deferred EFB-to-XFB copy when no XFB is already queued, then invokes the optional user post-retrace callback.

- fact:23097066-cdef-413e-bbd0-b27e6310f680 @ 2026-09-01T23:12:42.387Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:6b6e14c5-608c-4cdd-8d5a-15df879f6a6d @ 2026-09-01T23:12:42.387Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:db979137-f24c-4467-a411-5e3b65886a56 @ 2026-09-01T23:12:42.387Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:a5269ec1-aa9f-4a85-9a0c-93cf3a6d7e7a @ 2026-09-01T23:12:42.387Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:a60ebb07-fa74-4166-8088-0370c11c3aad @ 2026-09-01T23:12:42.387Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VIPreRetraceCB

Handles each VI pre-retrace event by staging the framebuffer and display configuration that VI should commit for the upcoming scan, preparing the single-XFB deferred-copy path when necessary, updating frame-renewal performance counters, and finally invoking the optional user pre-retrace callback.

- fact:b59bcb75-4ac6-463b-bbac-417913f9815f @ 2026-09-02T00:16:55.375Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:4225bfaf-0b1c-46d5-814d-6041552bc31a @ 2026-09-02T00:16:55.375Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:683bb9d7-ed11-4f41-9160-0af5f33ecfcb @ 2026-09-02T00:16:55.375Z: supersede inferred_type. Correct inherited claim using pinned source and recorded object observations.
- fact:98688965-1f86-4d93-a798-a58519d9c11e @ 2026-09-02T00:16:55.375Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:723c068d-474b-4eaa-938b-04d0718149c6 @ 2026-09-02T00:16:55.375Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VISearchXFBByStatus

Scans all three XFB slots in ascending index order for the requested status and returns the first match, or -1. It does not filter configured buffers or nb_xfb, so a request for NONE may return an absent slot.

- fact:3d8a6d02-81e5-43e7-8aea-d9f1a00f2cc9 @ 2026-09-02T00:16:47.119Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:e7e2b51d-b222-4095-ad82-53db1d49f93e @ 2026-09-02T00:16:47.119Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:5233c8cd-262a-42d7-8b3d-9883285bc219 @ 2026-09-02T00:16:47.119Z: supersede purpose. Correct inherited claim using pinned source and recorded object observations.
- fact:a20b9bec-aefb-422f-b324-656f13284341 @ 2026-09-02T00:16:47.119Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VISetBlack

Stages a request to enable or disable Video Interface output blanking in HSD's current presentation configuration, marking that configuration changed so the requested black state is applied with a subsequent framebuffer presentation rather than immediately by the setter.

- fact:e0c30eb8-b0e1-4a96-ac93-68dc742825e6 @ 2026-09-02T00:17:41.844Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:e3ae5b6d-dbb1-4984-8159-3ae80dbe5da7 @ 2026-09-02T00:17:41.844Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:c03c1d66-a91d-4333-8af0-2b4f40c70e6f @ 2026-09-02T00:17:41.844Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:933c5269-8ab7-42f4-ac30-6ccdd7ce8cec @ 2026-09-02T00:17:41.844Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:5929f81d-9375-4b8d-ad4b-6e05c52894a0 @ 2026-09-02T00:17:41.844Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/sysdolphin/baselib/video:HSD_VISetConfigure

Stages a new GX render-mode configuration for subsequent frame presentation. It updates HSD's current video configuration and marks that configuration as changed so the presentation pipeline applies it with a later framebuffer at a VI retrace boundary instead of reconfiguring VI immediately.

- fact:ea70f29e-cae5-43e5-89b7-33e9a1a30443 @ 2026-09-02T00:17:57.464Z: supersede data_flow. Correct inherited claim using pinned source and recorded object observations.
- fact:7b078b9d-d827-4190-bca8-8189b68ccddd @ 2026-09-02T00:17:57.464Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:ef794e06-08f8-437d-bcf0-b00692d021ba @ 2026-09-02T00:17:57.464Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:543e489f-cd23-484a-95ae-aaa395cfdec8 @ 2026-09-02T00:17:57.464Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:fd104474-66a0-47b6-8b3e-a88a787666fe @ 2026-09-02T00:17:57.464Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:HSD_VISetUserGXDrawDoneCallback

Installs, replaces, or removes the video layer's optional user callback for GX draw-completion notifications and returns the callback that was previously registered, allowing callers to preserve or restore an earlier handler.

- fact:361a568e-3a11-4188-8d16-b9fc65dd494c @ 2026-09-02T00:17:20.324Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:cfdcf41c-f32a-4fdc-8f6c-20f7618545c3 @ 2026-09-02T00:17:20.324Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:149bab9c-09e5-4501-8ecc-37914ce8a0f5 @ 2026-09-02T00:17:20.324Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:ef0d0b75-89e4-4235-9e0f-115938eee4fd @ 2026-09-02T00:17:20.324Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:HSD_VISetUserPostRetraceCallback

Installs or removes the optional user hook that HSD's video layer invokes after its internal post-retrace framebuffer processing, and returns the hook that was previously registered.

- fact:69ffddc6-06d0-4af3-8a3d-a4c2160e5b14 @ 2026-09-02T00:16:31.567Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:19885f73-daf2-4ba9-9478-7c29dd053df6 @ 2026-09-02T00:16:31.567Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:e43d0978-50f6-4f9c-9d1b-ef69282a865b @ 2026-09-02T00:16:31.567Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:9c85949d-35fe-4d1f-9067-41a5efa445e0 @ 2026-09-02T00:16:31.567Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:HSD_VISetUserPreRetraceCallback

Installs, replaces, or removes the HSD video layer's optional user pre-retrace callback and returns the callback that was previously registered, allowing callers to change retrace handling without replacing HSD's internal VI pre-retrace handler.

- fact:54b68dec-620d-4e71-ad5c-7f949e50fee0 @ 2026-09-02T00:17:08.108Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:d41281af-6eb5-4cc5-9c8c-e3f3edbfe0ff @ 2026-09-04T21:37:27.289Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:39a9d8c1-1326-43f6-8007-3f8d9fb31883 @ 2026-09-02T00:17:08.108Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:89efced5-0621-4605-a988-666729204513 @ 2026-09-02T00:17:08.108Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:HSD_VIWaitXFBFlush

Blocks until the multi-XFB presentation pipeline has no buffer waiting for GX completion, completed but not yet queued, or queued for the next display handoff. It yields between checks by sleeping until the next VI retrace; configurations with fewer than two XFBs require no flush and return immediately.

- fact:391ea5bc-52fd-4432-90d9-7fe5004ec1d2 @ 2026-09-02T00:16:53.681Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:fdb1c4d0-bab3-41e1-9b98-63f0313d0753 @ 2026-09-02T00:16:53.681Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:50ee3d57-0093-4c0f-9a99-0b0e73704cb4 @ 2026-09-02T00:16:53.681Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:6f4be02b-4d89-4ed7-9818-99ed2ad2ef09 @ 2026-09-02T00:16:53.681Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:24c379f9-8ae6-463b-9251-e6a85bacb472 @ 2026-09-02T00:16:53.681Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:HSD_VIWaitXFBFlushNoYield

Synchronously drains the multi-XFB presentation pipeline without yielding: when at least two external framebuffers are configured, it busy-waits until no XFB remains waiting for GX draw completion, completed but not yet queued, or queued for display.

- fact:f69ac3d6-35a9-421b-bf2e-9ed8e7399a1c @ 2026-09-02T00:17:14.935Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:11f8393a-ee96-4f30-b355-3979e71fe3dc @ 2026-09-02T00:17:14.935Z: unresolved game_mapping. Specific foreign handoff caller was not independently read. Local busy-wait behavior is verified; defer this consumer claim.
- fact:2edf4277-9a3d-480a-b095-8158097a8d74 @ 2026-09-02T00:17:14.935Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:01a7449b-ab03-44de-94a2-8a95c51acc52 @ 2026-09-02T00:17:14.935Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:adc669d0-3b65-4e85-852d-5dc1ae6297bd @ 2026-09-02T00:17:14.935Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## src/sysdolphin/baselib/video.c

Implements the HSD video-presentation layer: it owns video configuration and EFB/XFB bookkeeping, installs retrace and GX draw-done callbacks, coordinates framebuffer copies, and exposes synchronization and configuration operations around the Dolphin VI and GX APIs.

- fact:90392c57-bdc8-41cf-a319-e453bf3c9b7f @ 2026-09-04T01:53:27.086Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:6c4d571e-b307-4848-844a-2bad10e06d14 @ 2026-09-04T01:53:27.086Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:4d786481-49a6-4a38-ab44-4a75a8001814 @ 2026-09-04T01:53:27.086Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:3e77ff43-36d1-4f7a-b8e9-9543042d7397 @ 2026-09-04T01:53:27.086Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/sysdolphin/baselib/video:HSD_VICopyEFB2XFBPtr#r3

Configures GX display-copy state from an HSD video configuration and transfers either a complete EFB image or one half of the split high-resolution antialiasing image into caller-supplied XFB storage, clearing the copied EFB region as part of each transfer.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VICopyEFB2XFBPtr#r4

Configures GX display-copy state from an HSD video configuration and transfers either a complete EFB image or one half of the split high-resolution antialiasing image into caller-supplied XFB storage, clearing the copied EFB region as part of each transfer.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VICopyEFB2XFBPtr#r5

Configures GX display-copy state from an HSD video configuration and transfers either a complete EFB image or one half of the split high-resolution antialiasing image into caller-supplied XFB storage, clearing the copied EFB region as part of each transfer.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VICopyXFBAsync#r3

Queues an EFB-to-XFB display copy into an available external framebuffer and attaches a GX draw-completion fence so that framebuffer can enter the asynchronous presentation pipeline.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VIDrawDoneXFB#r3

Completes the XFB bookkeeping stage of an asynchronous EFB-to-XFB copy after GX signals draw completion, making the completed framebuffer the next frame for presentation when the queue is empty or retaining it as a completed frame behind an already queued XFB.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VIInit#r3

Initializes HSD video state and callbacks, configures and flushes VI mode/black settings, then submits a full-screen EFB copy into the first FREE XFB. It leaves that slot FREE and does not call VISetNextFrameBuffer here, so this initial copy alone does not establish displayed-frame ownership.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VIInit#r4

Initializes HSD video state and callbacks, configures and flushes VI mode/black settings, then submits a full-screen EFB copy into the first FREE XFB. It leaves that slot FREE and does not call VISetNextFrameBuffer here, so this initial copy alone does not establish displayed-frame ownership.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VIInit#r5

Initializes HSD video state and callbacks, configures and flushes VI mode/black settings, then submits a full-screen EFB copy into the first FREE XFB. It leaves that slot FREE and does not call VISetNextFrameBuffer here, so this initial copy alone does not establish displayed-frame ownership.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VIInit#r6

Initializes HSD video state and callbacks, configures and flushes VI mode/black settings, then submits a full-screen EFB copy into the first FREE XFB. It leaves that slot FREE and does not call VISetNextFrameBuffer here, so this initial copy alone does not establish displayed-frame ownership.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VIPostRetraceCB#r3

Handles each VI post-retrace event by advancing HSD's framebuffer presentation queue, or by completing a deferred EFB-to-XFB copy when no XFB is already queued, then invokes the optional user post-retrace callback.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VIPreRetraceCB#r3

Handles each VI pre-retrace event by staging the framebuffer and display configuration that VI should commit for the upcoming scan, preparing the single-XFB deferred-copy path when necessary, updating frame-renewal performance counters, and finally invoking the optional user pre-retrace callback.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VISearchXFBByStatus#r3

Scans all three XFB slots in ascending index order for the requested status and returns the first match, or -1. It does not filter configured buffers or nb_xfb, so a request for NONE may return an absent slot.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VISetBlack#r3

Stages a request to enable or disable Video Interface output blanking in HSD's current presentation configuration, marking that configuration changed so the requested black state is applied with a subsequent framebuffer presentation rather than immediately by the setter.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VISetConfigure#r3

Stages a new GX render-mode configuration for subsequent frame presentation. It updates HSD's current video configuration and marks that configuration as changed so the presentation pipeline applies it with a later framebuffer at a VI retrace boundary instead of reconfiguring VI immediately.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VISetUserGXDrawDoneCallback#r3

Installs, replaces, or removes the video layer's optional user callback for GX draw-completion notifications and returns the callback that was previously registered, allowing callers to preserve or restore an earlier handler.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VISetUserPostRetraceCallback#r3

Installs or removes the optional user hook that HSD's video layer invokes after its internal post-retrace framebuffer processing, and returns the hook that was previously registered.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/video:HSD_VISetUserPreRetraceCallback#r3

Installs, replaces, or removes the HSD video layer's optional user pre-retrace callback and returns the callback that was previously registered, allowing callers to change retrace handling without replacing HSD's internal VI pre-retrace handler.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

