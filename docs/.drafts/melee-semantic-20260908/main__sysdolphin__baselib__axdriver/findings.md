# AXDriver Semantic Findings

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`.

## main/sysdolphin/baselib/axdriver:.bss

Provides the AX driver's large zero-initialized runtime storage: a fixed pool of logical HSD_SM sound records, a synth-voice-to-record lookup table, per-aux-bus and per-channel send levels, and driver-owned AXFX state for both auxiliary buses.

- fact:43cadb2d-d63a-4fcb-95e2-b3fef4ae00ad @ 2026-09-04T21:31:39.257Z: supersede data_flow. Correct inherited claim using pinned source and recorded support/object observations.
- fact:08557688-92ca-4e3a-9e66-34b916dbc5c8 @ 2026-09-04T21:31:39.257Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:e7817aff-858c-47ba-b420-4fc882e0e25e @ 2026-09-02T13:20:10.345Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:50cc5244-1ec3-48b1-808c-718ceca35543 @ 2026-09-04T21:31:39.257Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:ad29d5dd-3515-488d-aaac-66eebd83d6ac @ 2026-09-04T21:31:39.257Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:.data

Provides initialized diagnostic strings and compiler-generated code-address tables for command-delay decoding and sound-command execution. Existing .data relocations target AXDriver_8038C678 and AXDriver_8038C6C0, not auxiliary-effect dispatch.

- fact:700e0d96-17c1-46eb-9dab-99c9f7997681 @ 2026-09-04T21:31:39.257Z: supersede data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:fb7d9bb0-15cc-458b-9007-305ec26fe2aa @ 2026-09-04T21:31:39.257Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:4dedf3ac-8c7f-4671-8a13-92488b42522f @ 2026-09-04T21:31:39.257Z: supersede purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:.rodata

Stores the fixed delay-line dimension arrays used to estimate high-quality and standard AXFX reverb work-memory sizes.

- fact:fe42eed2-d0b7-4ff5-b4e9-9cc33f1ed0f7 @ 2026-09-04T21:31:39.257Z: supersede data_flow. Correct inherited claim using pinned source and recorded support/object observations.
- fact:d52326fd-1e95-4c6f-b29d-babfb8eda6e3 @ 2026-09-04T21:31:39.257Z: supersede inferred_type. Correct inherited claim using pinned source and recorded support/object observations.
- fact:95a42504-ffec-48d7-80a0-6765e674e706 @ 2026-09-04T21:31:39.257Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:.sbss

Holds AXDriver's compact zero-initialized runtime state: the logical-sound handle generation and master-clock counters, free and active HSD_SM list heads, the loaded sound-bank image and its parsed count/pointer tables, active-voice and active-record counts, the paused-channel mask, AXFX work-heap allocation state, streamed-audio pitch/timing state, and the asynchronous DVD-read completion flag.

- fact:1ead32fa-584c-4160-a565-d72eccaacf10 @ 2026-09-04T21:31:39.257Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:fb13d2f3-457b-4f3d-adfc-ed988ead5880 @ 2026-09-04T21:31:39.257Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:5d84e25c-a66c-4284-82ce-32634947c995 @ 2026-09-04T21:31:39.257Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:ce62d198-63b0-4e09-a7c8-2e9ae22298cf @ 2026-09-04T21:31:39.257Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:1294af76-f777-4861-90b7-a90380776a3b @ 2026-09-04T21:31:39.257Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:.sdata

Holds the AX driver's initialized persistent control state: the singleton synth handle used for path-selected streamed audio and a packed configuration word used both to gate selected sound-command mix updates and to remember the effect type assigned to each AX auxiliary bus.

- fact:91e659c1-2ed5-46fd-84bc-a34154c03f8f @ 2026-09-04T21:31:39.257Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:7b2cdca1-553e-4fca-a233-742ebd9d4b09 @ 2026-09-04T21:31:39.257Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:6a61927e-38b8-4c54-91b1-046d3d11e271 @ 2026-09-04T21:31:39.257Z: supersede inferred_type. Correct inherited claim using pinned source and recorded support/object observations.
- fact:dcbc2edd-e037-451b-b0d5-ecef5ab065db @ 2026-09-04T21:31:39.257Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b58e27f2-a2b0-43c9-a58d-eb9f2db6cf87 @ 2026-09-04T21:31:39.257Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:.sdata2

Provides the AX driver's read-only floating-point literal pool for sound-effect mixing and pitch calculations, auxiliary-effect heap sizing, and the default parameter presets for AXFX reverb processors.

- fact:4299df6c-9ef8-4adb-a850-b034402af422 @ 2026-09-04T21:31:39.257Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:5e787239-c814-4938-9bba-8b8e57de2fbd @ 2026-09-04T21:31:39.257Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:3d0bd92e-14d4-4fb6-98c4-c87eab4b1b4b @ 2026-09-04T21:31:39.257Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:e194dc74-6fa6-4dff-8e5d-fff6feefaae5 @ 2026-09-04T21:31:39.257Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriverAlloc

Provides AXFX with the next requested block from the caller-supplied auxiliary-effect work heap during effect initialization, using a shared monotonic byte offset rather than the general HSD audio heap.

- fact:39add3df-85ec-4dd5-970a-9ec9828e302b @ 2026-09-04T21:31:39.257Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:872e351f-00e7-44c0-b407-5d6b22030bae @ 2026-09-04T21:31:39.257Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:0cedabec-6552-4235-81dd-e01c85c67121 @ 2026-09-04T23:44:43.654Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:67f11623-c181-4509-973c-2a50d9a766e0 @ 2026-09-04T21:31:39.257Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:d627a015-0246-40f0-b1d5-1eeeee351b50 @ 2026-09-04T21:31:39.257Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriverFree

Provides AXFX with the release half of AXDriver's custom auxiliary-effect arena policy. It deliberately performs no per-allocation reclamation because the paired allocator is a monotonic cursor into a pre-supplied arena rather than an allocator that tracks independently freeable blocks.

- fact:0dc88260-e337-4b9f-ad69-7aaa20e61ce0 @ 2026-09-04T21:31:39.257Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:9edf2811-66bb-4325-8474-86f2749e2dbe @ 2026-09-04T21:31:39.257Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:33cf72f3-2d99-4a00-96b3-9a1719afe84a @ 2026-09-02T13:05:52.840Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:2a15a64f-6414-4cfe-ad06-4a8a353d89a2 @ 2026-09-04T21:31:39.257Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:f583eb87-6cc5-43ac-a1db-f4a21ff5658b @ 2026-09-04T21:31:39.257Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriverKeyOff

Terminates one logical AXDriver sound-effect instance. It validates the supplied playback handle, retires the corresponding active or sleeping HSD_SM record, and forwards any assigned synth-instance handle to the synth key-off layer.

- fact:81bc4312-f559-4006-8e01-138982764bcd @ 2026-09-04T21:31:39.257Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:f5a08939-7a9c-4307-8368-56d50c3d3856 @ 2026-09-04T21:31:39.257Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:049069d1-4659-4c44-8932-418789c38dcd @ 2026-09-02T14:57:58.180Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:2b843c0f-ddd6-4417-86d8-02d9f878ab64 @ 2026-09-04T21:31:39.257Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b6eff6ca-ded4-4467-a8c5-53c2fecd8088 @ 2026-09-04T21:31:39.257Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriverPause

Requests pause for the singleton path-selected stream whose Synth handle is stored in AXDriver_804D6038. False means the stored handle is exactly -1; true means a request was forwarded, not that the handle is live or that playback completed the transition.

- fact:c060a6e1-92ad-4bff-9e95-e6f3a7d0d5c1 @ 2026-09-02T13:04:38.704Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:a78af9ab-1512-48a7-a972-1b298aecbebe @ 2026-09-02T13:04:38.704Z: supersede game_mapping. Correct inherited claim using pinned source and recorded support/object observations.
- fact:0c0c4671-1342-4efd-b3be-c3a91542ba3e @ 2026-09-02T13:04:38.704Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:602e61b4-0b52-4bc3-8a3a-795878156729 @ 2026-09-02T13:04:38.704Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:77cec3ca-f3a0-49b9-b7b4-e6d869ac4186 @ 2026-09-02T13:04:38.704Z: supersede state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriverResume

Requests resume for the singleton path-selected stream whose Synth handle is stored in AXDriver_804D6038. False means the stored handle is exactly -1; true means a request was forwarded, not that the handle is live or that playback completed the transition.

- fact:c264d6a0-7ea2-4c92-9cfe-f3d5a1ed6140 @ 2026-09-02T13:05:16.848Z: supersede data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:2f0f6df9-5fcd-4e98-b3cc-21ff6b060622 @ 2026-09-02T13:05:16.848Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:a2e799ae-953f-4665-a6aa-c9c0784c98ea @ 2026-09-02T13:05:16.848Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:c8d8e419-9d45-4a60-823b-150e3a90b08e @ 2026-09-02T13:05:16.848Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriverSetupAux

Replaces the requested AX auxiliary bus effect: unregisters its callback, shuts down the old recorded type, copies the new parameter block and attempts initialization, then installs the new callback only on success. Failure leaves no callback and does not restore the old effect.

- fact:434aba6c-d3cf-49e9-9b92-640026abe086 @ 2026-09-02T13:05:52.777Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:ab5f6de1-ebd0-46e7-b6d9-8b42ef46c3fa @ 2026-09-02T13:05:52.777Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:8f8d80ca-2efd-49b3-9361-1e20234ddabe @ 2026-09-02T13:05:52.777Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:158fe664-5e87-449f-933e-d716c7d44107 @ 2026-09-02T13:05:52.777Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:123debec-7dec-4f57-9c0d-82c86a71b219 @ 2026-09-02T13:05:52.777Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriverStop

Requests termination of the singleton path-selected streamed-audio instance managed by AXDriver and immediately releases the driver's reference to its synth handle.

- fact:ff0ea25c-ed2c-4faf-a9ba-36cbfcafa1b0 @ 2026-09-04T21:31:39.257Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:ee441f28-4865-4115-8d26-d10247416fc3 @ 2026-09-04T21:31:39.257Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:3fd021f2-0247-4eba-aada-caae211bf1b9 @ 2026-09-02T13:06:40.920Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:fcf2e686-d86f-4bd9-8fda-3499e3ad7f71 @ 2026-09-02T13:06:40.920Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:60e3663c-ce9c-4e76-8170-dcb17af3c655 @ 2026-09-02T13:06:40.920Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriverUnlink

Detaches an HSD_SM entry from an intrusive doubly linked list, repairing both neighboring links and the external list head while clearing the removed entry's own links. The audio-manager update path uses it to retire state-zero entries from its active list.

- fact:9a0cf801-932e-4749-817b-9794c124b8ca @ 2026-09-02T13:05:45.368Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:c15e86fd-8b87-4aed-aa37-caa3b0232959 @ 2026-09-04T21:31:39.257Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:19227586-78d4-4369-9ff8-019c852c445d @ 2026-09-02T13:05:45.368Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:9a515f82-efe3-4df4-95d3-0fab099773d8 @ 2026-09-04T21:31:39.257Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b132256c-62da-4c88-bce2-74bb4c498263 @ 2026-09-02T13:05:45.368Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriver_8038BF6C

Applies pending low-ten-bit operations to one HSD_SM: starts a Synth instance, propagates priority, volume, pan-position, pitch and routing controls, or puts the logical record to sleep or keys it off.

- fact:13a9bda2-1a99-4413-9cb8-6c64dbed7cb3 @ 2026-09-04T21:31:39.257Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:f2c4d7d5-ae2c-4bc5-8c7d-bde2924cd292 @ 2026-09-02T13:18:33.731Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:bd0126b9-8915-4700-a95e-b4c5c3e38d8e @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:42c94f36-e7c1-4d16-b8f5-0187a8805d5f @ 2026-09-02T13:18:33.731Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:e0aad82a-9cb0-44a6-a8ed-9c74148a09d7 @ 2026-09-04T21:31:39.257Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:8e5df0b6-93f0-4b49-964a-7cf85a245ebb @ 2026-09-02T13:18:33.731Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038C678

Extracts the scheduling delay from a packed sound-command word according to its opcode, accounting for how much of the command payload is occupied by that opcode's operand.

- fact:26d3a611-f4d7-4bd5-8646-3f217bf2354c @ 2026-09-04T21:31:17.299Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b016820f-cc3b-4c01-9b72-e9129c7ac4fb @ 2026-09-04T21:31:17.299Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:ff837f14-9643-4c66-8f86-e074f333ca4e @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:a5f78423-e847-47e9-85d7-b5d662d6c732 @ 2026-09-04T21:31:17.299Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:a30949e2-2a75-4291-8344-00cc2ac654ba @ 2026-09-04T21:31:17.299Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:1ac49346-d576-4517-a7a4-119d4f38c8d4 @ 2026-09-04T21:31:17.299Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriver_8038C6C0

Interprets all commands due for one active HSD_SM sound record at the current driver tick. It commits previously queued sound-parameter changes, advances the record's scheduled tick, executes commands that start or reconfigure synthesis, handles counted backward branches, and stops when the sequence is delayed, put to sleep, or ended.

- fact:9f583fd4-77fd-4b7c-a0fb-adff456c0896 @ 2026-09-04T21:31:17.299Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:4a0ecd6b-a464-483b-8b16-34cdebb48c12 @ 2026-09-04T21:31:17.299Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:79e8da8e-c8aa-4bf4-a728-5e7a711af852 @ 2026-09-04T21:31:17.299Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:8a6b8849-7a3a-447e-a36e-1d1e44339dfe @ 2026-09-04T23:44:43.654Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:8390a664-d820-47e2-b126-916dfc6b6137 @ 2026-09-04T21:31:17.299Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:3b976ae6-2218-4546-ac30-03a8e68c4d60 @ 2026-09-04T23:44:43.654Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038CFF4

Reserves and initializes a logical HSD_SM for a bank-qualified sound, queues its command stream and returns an encoded handle. The routine checks upper bank/sample limits, track and channel, but does not fully validate negative sound IDs; actual Synth voice creation occurs later during command processing.

- fact:48a1a03c-1671-49f7-88dd-21d9c082c782 @ 2026-09-05T21:10:24.324Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:43b918c9-46a2-45e3-84a7-26efcb8bc27c @ 2026-09-04T23:44:43.654Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:15845f90-e6f1-4617-b3aa-744d31d2532f @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:bde3a258-d278-48b9-9b32-72832db389cc @ 2026-09-04T23:44:43.654Z: supersede inferred_type. Correct inherited claim using pinned source and recorded support/object observations.
- fact:03f52bc3-a083-4ea4-86ce-0d2a0e559312 @ 2026-09-04T21:31:17.299Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:8880420c-f1ba-48ae-8da9-8ba9670fcf00 @ 2026-09-05T21:10:24.324Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D2B4

For a matching state-bearing logical handle, applies the requested pan byte to an assigned Synth node or caches it in HSD_SM.pan with pending bit 0x20000. Handle validation occurs before interrupt masking; only the update portion is protected, so the full validate-and-update sequence is not atomic.

- fact:787c8a85-29f1-4305-8c88-4a873f13c5f2 @ 2026-09-04T21:31:17.299Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:6a709254-d446-4f95-83b3-383666762d30 @ 2026-09-04T21:31:17.299Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:597deef1-9f4a-4a3d-8047-6d7a54ddfeb0 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:d47ba2f9-8262-4d11-b5da-8a989201ba75 @ 2026-09-02T13:18:17.297Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:646dadc8-dc6d-453f-b6de-3e196ae9bb87 @ 2026-09-02T13:18:17.297Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:92bec1eb-93c9-4d16-a6d1-4e32ae222cd8 @ 2026-09-02T13:18:17.297Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D3B8

Sets the runtime volume of one logical HSD sound-effect instance, applying the change immediately when the record already owns a synth voice or retaining it as a pending update while the voice is still being created.

- fact:7b1e0dfd-74bd-446a-80c8-de37aabb5046 @ 2026-09-02T13:18:17.458Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b74f2075-6d0e-42c6-91c4-c0277a497193 @ 2026-09-02T13:18:17.458Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:efb278cd-e836-4f3d-b825-b4ac652285d8 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:7189c4ff-bb9f-4a47-8876-b2c95ade90e4 @ 2026-09-02T13:18:17.458Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:4d3a0adc-7af3-4903-ab6a-91e2e43d6c36 @ 2026-09-02T13:18:17.458Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:1978f5bf-8e53-4a08-bca1-93c8eb8c1a39 @ 2026-09-02T13:18:17.458Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D4E4

Validates a logical HSD sound-effect handle and queues a new secondary pitch offset for that sound record so the AX driver can apply the corresponding playback-rate ratio to its active synth voices.

- fact:b664eff6-041f-4a67-9e74-e8148f005069 @ 2026-09-04T21:31:17.299Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:04ff440f-05ef-4ec8-b9d8-936b98bf34c8 @ 2026-09-04T21:31:17.299Z: unresolved game_mapping. Exact fighter caller and randomized SFX range were not independently read. Local cents conversion and wrapper clamp are verified.
- fact:d2f59fa2-6978-454f-90f3-b0f5c19f28eb @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:94095341-1661-412d-8f6c-b1b109e7ccc2 @ 2026-09-04T23:44:43.654Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b99fd994-67c5-486b-8f10-bb7d97a63f40 @ 2026-09-02T13:20:11.680Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:e2a28f4e-cce7-4277-927e-fd0fe372fad6 @ 2026-09-04T23:44:43.654Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D5B4

Updates a logical sound's selected auxiliary send when the corresponding low-bit API gate permits it. Recomputes and submits the three mix gains only when a Synth handle is assigned; otherwise caches the send byte and marks pending bit 0x80000.

- fact:d785e697-f417-4761-a1fb-65b0d0a0a055 @ 2026-09-02T13:17:44.776Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:bb501d31-3a81-4355-a261-aef569b0ce3b @ 2026-09-02T13:17:44.776Z: supersede game_mapping. Correct inherited claim using pinned source and recorded support/object observations.
- fact:7679949b-e7a0-4633-a006-b518180b96ff @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:f894a99a-fc4b-4906-80c8-3fe284ac4e69 @ 2026-09-04T23:44:43.654Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:620d8bbe-49bb-4d3e-a40b-c57ceceb0369 @ 2026-09-02T13:17:44.776Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:0740dd53-04b1-4ad0-98df-bba38435a3e1 @ 2026-09-02T13:17:44.776Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D914

Requests an auxiliary-send update for every state-bearing record on a logical channel and unconditionally saves the new default for later starts. Return true confirms valid channel/bus indices, not that current records changed.

- fact:b3d65053-f639-448e-b56a-6b8de30ff217 @ 2026-09-02T15:01:44.262Z: supersede data_flow. Correct inherited claim using pinned source and recorded support/object observations.
- fact:a8ec43f3-a1c1-45fe-ae8d-0cd0f24e9868 @ 2026-09-04T21:31:17.299Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:064ce443-bd0f-4810-b1ea-0a6169f1a194 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:f8b5c73f-efa0-4890-a786-8f746ac455f8 @ 2026-09-04T23:44:43.654Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b9a56e35-7185-4d89-92b7-e8e16d386a82 @ 2026-09-02T15:01:44.262Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:6acb5427-9eb3-4501-b31a-68a95891f455 @ 2026-09-02T15:01:44.262Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D9D8

Checks whether a driver-issued sound-effect handle still identifies a live HSD_SM record whose underlying synth sound effect remains playable. It rejects malformed, stale, inactive, or synth-invalid handles.

- fact:13a14a73-8a46-4247-a97d-a492bc23260a @ 2026-09-02T13:18:30.886Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:8682670c-d896-4c66-ac1a-f955b88ec91d @ 2026-09-02T13:18:30.886Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:6f230edd-e802-486c-82a3-1e1ac6e27442 @ 2026-09-04T23:44:43.654Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:abaa2bc2-1c1c-4439-8dbc-f6dd0b1aa7ce @ 2026-09-02T13:18:30.886Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:922792af-a827-4dac-a18a-be925e16e108 @ 2026-09-02T13:18:30.886Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:4d1bcfec-0595-4df1-aecf-eed946a94344 @ 2026-09-04T23:44:43.654Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriver_8038DA70

Attempts to load the global SFX metadata image into the audio heap, waits by repeatedly calling the supplied service callback, then parses five count-prefixed sections and relocates three pointer tables. The loader is blocking and does not validate file structure or independently confirm a complete successful DVD transfer before parsing.

- fact:44322986-5f63-4518-b478-d5adc9398666 @ 2026-09-02T13:19:45.835Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:84e27ab0-31a9-458c-b74c-5c5472673ac9 @ 2026-09-04T21:31:17.299Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:de70ebe4-5336-4e92-adba-42585f51b442 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:9ced0898-4b91-429d-b6fa-c63596638bd2 @ 2026-09-02T13:19:45.835Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:79862774-c6f6-4aec-b048-c8ff69607ffe @ 2026-09-02T13:19:45.835Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:2682c77a-cf7d-40e6-b2a1-665832f03556 @ 2026-09-04T21:31:17.299Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038DCFC

Releases the audio-heap allocation that holds the currently loaded sound-effect metadata image and marks that image as no longer loaded.

- fact:00fecbf9-cc45-4323-bc4a-32d9fc888174 @ 2026-09-04T21:31:17.299Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:6b6dae48-4909-4ff3-831e-24c66bbfd864 @ 2026-09-04T23:44:43.654Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:318d5d9e-b5b0-4d69-96db-bd95096e8378 @ 2026-09-04T23:44:43.654Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:326c5109-4cf7-46b6-ac02-4f29fcc2ea17 @ 2026-09-04T21:31:17.299Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:76fd3672-0dc8-4358-b554-72adfd379ab7 @ 2026-09-02T13:18:52.278Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E30C

Configures one AX auxiliary audio channel with an off, reverb, chorus, or delay processor while supplying the bounded work-memory arena from which that AXFX processor may allocate its internal buffers.

- fact:f954ef9a-34f0-4794-a5f1-1c58b8dfd182 @ 2026-09-04T21:31:17.299Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:565454a8-3d2c-49af-82d4-db3675987a36 @ 2026-09-04T21:31:17.299Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:10ba4539-31b7-49c8-8422-1b7b41e51d58 @ 2026-09-04T23:44:43.654Z: supersede inferred_type. Correct inherited claim using pinned source and recorded support/object observations.
- fact:3e2ebd4f-9026-4654-80e2-30df3be96a9e @ 2026-09-04T21:31:17.299Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:34c71eee-fcb0-46a2-90c3-a055c14891da @ 2026-09-04T21:31:17.299Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E37C

Validates an auxiliary-effect selection and initializes the caller-supplied AXFX parameter structure with the driver's default profile for high-quality reverb, standard reverb, chorus, or delay; the off selection succeeds without requiring or modifying a parameter structure.

- fact:5de54174-be22-4208-9bf8-d41a455e902f @ 2026-09-04T21:31:17.299Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:9b8b759a-a166-4d93-a77b-9a5345d15f29 @ 2026-09-04T21:31:17.299Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:4f09361c-07dd-44ab-b833-b14a5c22fbcd @ 2026-09-04T23:44:43.654Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:d451ae14-bc26-47f7-8ff3-e5f2c6194b41 @ 2026-09-04T23:44:43.654Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:798ed1f7-ae4a-4930-8806-14f4445a1eb0 @ 2026-09-02T13:19:03.673Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:84153e2e-52f3-4e6f-806f-910474506540 @ 2026-09-02T13:19:03.673Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E498

Initializes the HSD AX audio-driver layer by preparing its fixed pool of logical sound records, initializing the synthesizer with caller-supplied capacity and memory settings, installing driver-state callbacks, disabling both auxiliary-effect routes, and registering the driver's AXFX allocator hooks.

- fact:31bb8d9e-7b76-4bf9-a784-f4658b61f86c @ 2026-09-04T21:31:29.871Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:bb909cf6-86d2-44a6-8a30-e0efc5851064 @ 2026-09-04T21:31:29.871Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:073bfd89-214e-4641-9223-dc324a5e01d8 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:0efde6ff-7144-49b2-9935-62bf6e66060d @ 2026-09-02T13:18:58.322Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:acf02e8a-d5e3-41ab-ad7b-51c7e8dc2b76 @ 2026-09-02T13:18:58.322Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:e3b1907c-4085-4985-ace1-0618a8a94355 @ 2026-09-04T21:31:29.871Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E5D4

Returns the count of logical HSD_SM records currently associated with a Synth node. The developer interface calls this PVoice, but one associated node can own multiple AX voices, so it is not a literal hardware-voice total.

- fact:427eeb1d-03a0-473b-bff3-aaed0d96a5ff @ 2026-09-04T21:31:29.871Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:cee68775-a36e-4814-8867-c3a604b9d199 @ 2026-09-04T21:31:29.871Z: supersede game_mapping. Correct inherited claim using pinned source and recorded support/object observations.
- fact:38d4118d-25a0-4ee6-bde0-fa6f95286ad4 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:35fa8409-29c9-4e1a-8b58-b23d535433a8 @ 2026-09-04T23:44:43.654Z: supersede inferred_type. Correct inherited claim using pinned source and recorded support/object observations.
- fact:c6c62d04-9e3d-43b0-a129-e860b085eff8 @ 2026-09-04T21:31:29.871Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:e52d1dc6-093b-4d25-b375-1729de6d928d @ 2026-09-04T21:31:29.871Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E5DC

Returns the number of logical HSD_SM sound records currently allocated from the driver's fixed pool, exposing virtual-voice load to higher-level audio and debug code.

- fact:674ef6eb-fb1a-4171-a08b-30d66bef417f @ 2026-09-04T21:31:29.871Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:0edaf46c-29f3-484f-ba4b-9240806670d7 @ 2026-09-04T21:31:29.871Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:fe68b57c-f1ff-4782-9f20-dc9d12bbe3c4 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:81bb5c0d-e3d7-4f5c-aab5-d10dd4f51e0a @ 2026-09-04T23:44:43.654Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:734fda8b-0091-4888-81a8-ad008063670e @ 2026-09-04T21:31:29.871Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:e943c8f9-5918-4ffe-bd0c-729097f0aa60 @ 2026-09-04T21:31:29.871Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E5E4

Pauses one logical HSD sound-manager voice identified by its driver voice ID. It rejects invalid, stale, or inactive IDs; for a record with an instantiated synth voice it forwards the pause to the synthesizer, while for an active record without a synth voice yet it records a deferred pause request.

- fact:4fc1b83d-d0f7-417c-aeee-e93116f6c914 @ 2026-09-02T13:17:04.290Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:66ee0a4a-d77a-47f2-8bc2-8d6f6f3caf25 @ 2026-09-02T13:17:04.290Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:3b16dfb4-119e-4e8f-b245-c5e910e4e14c @ 2026-09-02T13:17:04.290Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:81161b5c-7916-4081-9220-c152e76465cd @ 2026-09-02T13:17:04.290Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:80a203e8-e360-4ce0-be55-1ab590e86a2e @ 2026-09-02T13:17:04.290Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:01c64dc3-3929-4b11-b04f-b7c27ac72a7b @ 2026-09-02T13:17:04.290Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E6C0

Requests pause for state-bearing logical records on one channel and sets the channel mask to refuse later sound starts. Ordinary Synth pause completion is deferred. A never-scheduled record can still execute its initial command batch because deadline -1 initialization precedes the clock pause-bit branch.

- fact:0528eaf5-0d82-49c5-b33f-3330529b99b8 @ 2026-09-02T15:31:38.839Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:c4f409af-2e8f-4ba6-9fcc-84dce0b18277 @ 2026-09-02T15:31:38.839Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:16d6763f-e419-48e5-abaa-7c4f6585291d @ 2026-09-04T21:31:29.871Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:0e7493b8-4ea2-4e57-b508-af7db0b2f950 @ 2026-09-04T23:43:47.029Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:7a804221-b5d0-404a-b702-dd52aafd9f1e @ 2026-09-02T15:31:38.839Z: supersede purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:91387bc6-4cf9-49f6-af23-533c9e1dd716 @ 2026-09-02T15:31:38.839Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E768

Resumes one valid driver-managed sound-effect record, forwarding the record's synth voice ID to the synth resume layer when a synth node exists and clearing the driver's deferred-pause marker.

- fact:eb3aff0c-7a66-4f0e-85b3-51c5a416eb9c @ 2026-09-02T13:18:36.765Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:bfa80c79-e92a-4dbf-8bcc-4ccca0f27bfb @ 2026-09-02T13:18:36.765Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:10c59666-c1c4-4c38-a7f9-500f5707fb2f @ 2026-09-02T13:18:36.765Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:68b94171-0f40-46fc-9805-c59f82dec11f @ 2026-09-02T13:18:36.765Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:d58821be-fe37-4e38-b017-34e3491b34f7 @ 2026-09-02T13:18:36.765Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:95169d31-c7d1-410c-8e4a-82d2abd7240a @ 2026-09-02T13:18:36.765Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E844

Resumes the driver-managed sound effects assigned to one logical audio channel, then clears that channel's bit in the global channel-pause mask.

- fact:40ff3cc6-eec3-4c2b-84be-24ee95a075bf @ 2026-09-02T13:19:02.640Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:75da8143-6c4d-4ce9-a87d-6cea986b7795 @ 2026-09-02T13:19:02.640Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:4143e1c3-1499-42cf-88a1-55c7502ecb5c @ 2026-09-04T21:31:29.871Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b0855610-1074-425c-9f27-22926e1b9999 @ 2026-09-04T23:43:47.029Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:79a8ed25-d138-4838-90f6-0d73a2a4a8a6 @ 2026-09-02T13:19:02.640Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:9507ae37-683e-4197-97d9-bd56bebbcf70 @ 2026-09-02T13:19:02.640Z: supersede state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E8EC

Starts or replaces the AX driver's singleton path-selected disc-audio stream. It resolves the requested file path to a DVD entry, requests key-off for the previously retained stream handle when one exists, starts a new synth stream with the requested volume and track, and retains the new handle for the driver's stop, pause, resume, and status operations.

- fact:9b75e27a-dbf8-4175-abd0-7a80ee0796f6 @ 2026-09-04T21:31:29.871Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:05ac0874-301f-4719-b54e-f164aa1c9988 @ 2026-09-04T21:31:29.871Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:d05042a4-a207-4eb8-8835-5d825f9bd1d1 @ 2026-09-04T23:43:47.029Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:9b3f7e07-91d1-43cc-be3c-128505801ae1 @ 2026-09-04T23:43:47.029Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b6215c71-2434-4f7a-a72e-0f3eeddb3932 @ 2026-09-02T13:18:55.668Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:62a53887-ffb5-47f3-b6a0-46dcb2ed9c8a @ 2026-09-02T13:18:55.668Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:AXDriver_8038EA18

Reports whether the AX driver's singleton path-selected audio stream still has an acceptable live synth node. It passes the retained stream handle to HSD_SynthSFXCheck and returns false when that query yields the invalid sentinel, without stopping the stream or clearing the retained handle.

- fact:5721b81e-3f0e-4d97-9353-73a1cad0e1f1 @ 2026-09-02T13:18:41.722Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:4112d355-8583-4968-b172-11b25f8f001d @ 2026-09-04T21:31:29.871Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:f611fe39-546b-45fe-b901-56e98d4c3c3e @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:85f972d7-d20b-4081-a739-84aeca77b931 @ 2026-09-04T23:43:47.029Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:eef75230-4785-4c99-bb9a-acf993f2985e @ 2026-09-02T13:18:41.722Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:a990df11-a920-42f3-81b8-9048248b73c3 @ 2026-09-02T13:18:41.722Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:HSD_AudioGetAuxHeapSize

Calculates an effect-dependent work-memory estimate using fixed reverb dimensions, preDelay or three delay values. It checks only type and enabled param presence. Parameter ranges, arithmetic overflow and the allocator's strict less-than capacity rule require separate handling; this result alone does not guarantee a sufficient usable heap.

- fact:7be10e40-b9c5-4872-b213-5d81a4da7906 @ 2026-09-04T02:32:02.213Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b2e4d7e4-d0f1-44bb-a361-29f0032bdac6 @ 2026-09-04T02:32:02.213Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:2bd6b317-c883-45af-86fa-d1de7dc971ee @ 2026-09-04T23:43:47.029Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:37830999-9a0e-4d9d-b8ad-9f232f4eac9b @ 2026-09-04T02:32:02.213Z: supersede purpose. Correct inherited claim using pinned source and recorded support/object observations.
- fact:0a28f383-e71a-469b-9fb6-60175145d808 @ 2026-09-04T02:32:02.213Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:HSD_AudioSFXKeyOffAll

Requests key-off for every currently active or sleeping sound-effect record in the AX driver, retiring each record's driver-side voice assignment and forwarding its synth instance handle for termination.

- fact:f9b40062-1615-4945-a9ca-203fdc92995a @ 2026-09-04T21:31:29.871Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:e06c6819-bd0a-408d-a441-28819a87ad2c @ 2026-09-04T21:31:29.871Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:1dc0a315-0c41-4180-9219-e75d102581db @ 2026-09-02T13:03:42.900Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:7e8c95c7-aadb-40e4-baf1-378c5e8f97b7 @ 2026-09-04T21:31:29.871Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:0bd908e0-35f5-4b70-a1d9-b8e6f828e543 @ 2026-09-04T21:31:29.871Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:HSD_AudioSFXKeyOffTrack

Requests key-off for every active or sleeping AX-driver sound-effect record assigned to a specified logical track, retiring each selected driver-side voice assignment and forwarding its synth instance handle for termination.

- fact:0f02a5d9-dc3e-4351-bc90-9f1be72a99df @ 2026-09-04T21:31:29.871Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:36064b49-9721-42f9-a2ca-c8d2f4d78bf5 @ 2026-09-04T21:31:29.871Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:45848306-e571-4706-b056-835a3fdf912c @ 2026-09-04T23:43:47.029Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:1421cde4-8450-44ed-b9ef-f8ce1eb81893 @ 2026-09-04T21:31:29.871Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:7b6f2d8c-993e-406b-a720-677f449ca9db @ 2026-09-04T21:31:29.871Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:fn_8038CC1C

Services AXDriver's logical sound records at each HSD synth master-clock update by committing pending pitch changes, advancing due command streams, preserving timing while records are paused, and recycling inactive records.

- fact:d80ccf88-8223-4541-bb49-f7ced13776e6 @ 2026-09-04T21:31:29.871Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:a72eef48-8d33-4cad-a8af-9de317d90477 @ 2026-09-02T13:18:30.515Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:b370a693-fc92-4602-8d11-74b1a129df57 @ 2026-09-04T21:31:29.871Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:0e3fe671-4aaf-4964-bfa8-f01fe5d0e68f @ 2026-09-04T21:31:29.871Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:434dc754-02e2-49b8-af15-9bacd1d0a20b @ 2026-09-04T21:31:29.871Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:d41247f9-8626-412a-9b00-90057b1cd710 @ 2026-09-04T23:43:47.029Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:fn_8038CEA4

Handles notification that an HSD Synth sound-effect node became inactive by retiring the corresponding AXDriver-side HSD_SM playback state and identifier mapping.

- fact:33045e54-6742-4d29-a0ea-ecb48b649721 @ 2026-09-04T21:31:29.871Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:3a9c9991-6a94-4ed0-a578-25e4b445f5ca @ 2026-09-04T21:31:29.871Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:bd278160-c098-4b95-8050-e33e1774d249 @ 2026-09-02T15:00:44.902Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:3033e503-cd48-4f30-9c3d-c09372beae9e @ 2026-09-04T21:31:29.871Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:76f82540-71d3-4cc2-ad10-32c29b367b10 @ 2026-09-04T21:31:29.871Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:c0ec4dd4-727d-4d32-8b19-1c0a9a87ba1d @ 2026-09-02T15:00:44.902Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:fn_8038CF48

Handles notification that an HSD synth sound-effect voice has been paused by marking the corresponding HSD_SM driver record so its command-stream schedule remains synchronized across the pause.

- fact:6646b1bb-eebb-4d4c-9dd6-bc7e19ae5ead @ 2026-09-02T13:18:58.327Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:e42dab5f-762b-4009-94a7-a77db055f6a9 @ 2026-09-02T13:18:58.327Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:e84d695b-5600-4d3a-b440-aa1ca1b91905 @ 2026-09-02T13:18:58.327Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:26883317-e649-4ae1-b3cd-146b32040a61 @ 2026-09-02T13:18:58.327Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:259c6195-9db9-4d3c-9ede-939e67ba9d99 @ 2026-09-02T13:18:58.327Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:d9df086b-6779-4e52-81a7-26d3556bf9a8 @ 2026-09-04T23:43:47.029Z: supersede state_behavior. Correct inherited claim using pinned source and recorded support/object observations.

## main/sysdolphin/baselib/axdriver:fn_8038DA5C

Handles completion of the asynchronous DVD read used to load the AX driver's sound-effect metadata image. It releases the loader's callback-pumped wait by setting the shared completion flag whenever the DVD result is not -1.

- fact:6f18d66c-9a2a-4fec-9937-33e95323e5b8 @ 2026-09-02T15:01:25.533Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:0860aab1-5c30-48c9-96ac-56139367c373 @ 2026-09-02T15:01:25.533Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:88e2d8f9-2ebf-40ee-ba1d-a4664ca1e311 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:720a3364-0c3c-49d9-b0cd-a6ba939d818d @ 2026-09-02T15:01:25.533Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:5e8db93d-6092-46db-bb4b-47510b2484bc @ 2026-09-02T15:01:25.533Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:966b03a9-f80c-428a-a343-11a5f64b9a06 @ 2026-09-02T15:01:25.533Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## src/sysdolphin/baselib/axdriver.c

Implements HSD's AX-facing audio driver layer: it provides bounded effects-memory allocation, maintains logical HSD_SM sound records and their synth handles, mediates key-off, pause, and resume operations, configures AX auxiliary effects, and exposes controls for one path-selected streamed-audio instance.

- fact:0a2566a7-6f5f-409c-8cfe-ffbaae3b50b3 @ 2026-09-04T02:16:15.793Z: retain data_flow. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:f8702c84-aa14-434e-b826-ec6e8841295f @ 2026-09-04T02:16:15.793Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:46391f2f-6668-44dc-b80a-6461e37305c6 @ 2026-09-06T16:48:24.354Z: retain purpose. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.
- fact:6c6259b5-78cc-4dfe-bc48-29b4bffaa200 @ 2026-09-06T16:48:24.354Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.

## main/sysdolphin/baselib/axdriver:AXDriverAlloc#r3

Provides AXFX with the next requested block from the caller-supplied auxiliary-effect work heap during effect initialization, using a shared monotonic byte offset rather than the general HSD audio heap.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriverFree#r3

Provides AXFX with the release half of AXDriver's custom auxiliary-effect arena policy. It deliberately performs no per-allocation reclamation because the paired allocator is a monotonic cursor into a pre-supplied arena rather than an allocator that tracks independently freeable blocks.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriverKeyOff#r3

Terminates one logical AXDriver sound-effect instance. It validates the supplied playback handle, retires the corresponding active or sleeping HSD_SM record, and forwards any assigned synth-instance handle to the synth key-off layer.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriverSetupAux#r3

Replaces the requested AX auxiliary bus effect: unregisters its callback, shuts down the old recorded type, copies the new parameter block and attempts initialization, then installs the new callback only on success. Failure leaves no callback and does not restore the old effect.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriverSetupAux#r4

Replaces the requested AX auxiliary bus effect: unregisters its callback, shuts down the old recorded type, copies the new parameter block and attempts initialization, then installs the new callback only on success. Failure leaves no callback and does not restore the old effect.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriverSetupAux#r5

Replaces the requested AX auxiliary bus effect: unregisters its callback, shuts down the old recorded type, copies the new parameter block and attempts initialization, then installs the new callback only on success. Failure leaves no callback and does not restore the old effect.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriverUnlink#r3

Detaches an HSD_SM entry from an intrusive doubly linked list, repairing both neighboring links and the external list head while clearing the removed entry's own links. The audio-manager update path uses it to retire state-zero entries from its active list.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriverUnlink#r4

Detaches an HSD_SM entry from an intrusive doubly linked list, repairing both neighboring links and the external list head while clearing the removed entry's own links. The audio-manager update path uses it to retire state-zero entries from its active list.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038BF6C#r3

Applies pending low-ten-bit operations to one HSD_SM: starts a Synth instance, propagates priority, volume, pan-position, pitch and routing controls, or puts the logical record to sleep or keys it off.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038C678#r3

Extracts the scheduling delay from a packed sound-command word according to its opcode, accounting for how much of the command payload is occupied by that opcode's operand.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038C678#r4

Extracts the scheduling delay from a packed sound-command word according to its opcode, accounting for how much of the command payload is occupied by that opcode's operand.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038C6C0#r3

Interprets all commands due for one active HSD_SM sound record at the current driver tick. It commits previously queued sound-parameter changes, advances the record's scheduled tick, executes commands that start or reconfigure synthesis, handles counted backward branches, and stops when the sequence is delayed, put to sleep, or ended.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038CFF4#r3

Reserves and initializes a logical HSD_SM for a bank-qualified sound, queues its command stream and returns an encoded handle. The routine checks upper bank/sample limits, track and channel, but does not fully validate negative sound IDs; actual Synth voice creation occurs later during command processing.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038CFF4#r4

Reserves and initializes a logical HSD_SM for a bank-qualified sound, queues its command stream and returns an encoded handle. The routine checks upper bank/sample limits, track and channel, but does not fully validate negative sound IDs; actual Synth voice creation occurs later during command processing.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038CFF4#r5

Reserves and initializes a logical HSD_SM for a bank-qualified sound, queues its command stream and returns an encoded handle. The routine checks upper bank/sample limits, track and channel, but does not fully validate negative sound IDs; actual Synth voice creation occurs later during command processing.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038CFF4#r6

Reserves and initializes a logical HSD_SM for a bank-qualified sound, queues its command stream and returns an encoded handle. The routine checks upper bank/sample limits, track and channel, but does not fully validate negative sound IDs; actual Synth voice creation occurs later during command processing.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038CFF4#r7

Reserves and initializes a logical HSD_SM for a bank-qualified sound, queues its command stream and returns an encoded handle. The routine checks upper bank/sample limits, track and channel, but does not fully validate negative sound IDs; actual Synth voice creation occurs later during command processing.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D2B4#r3

For a matching state-bearing logical handle, applies the requested pan byte to an assigned Synth node or caches it in HSD_SM.pan with pending bit 0x20000. Handle validation occurs before interrupt masking; only the update portion is protected, so the full validate-and-update sequence is not atomic.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D2B4#r4

For a matching state-bearing logical handle, applies the requested pan byte to an assigned Synth node or caches it in HSD_SM.pan with pending bit 0x20000. Handle validation occurs before interrupt masking; only the update portion is protected, so the full validate-and-update sequence is not atomic.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D3B8#r3

Sets the runtime volume of one logical HSD sound-effect instance, applying the change immediately when the record already owns a synth voice or retaining it as a pending update while the voice is still being created.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D3B8#r4

Sets the runtime volume of one logical HSD sound-effect instance, applying the change immediately when the record already owns a synth voice or retaining it as a pending update while the voice is still being created.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D4E4#r3

Validates a logical HSD sound-effect handle and queues a new secondary pitch offset for that sound record so the AX driver can apply the corresponding playback-rate ratio to its active synth voices.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D4E4#r4

Validates a logical HSD sound-effect handle and queues a new secondary pitch offset for that sound record so the AX driver can apply the corresponding playback-rate ratio to its active synth voices.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D5B4#r3

Updates a logical sound's selected auxiliary send when the corresponding low-bit API gate permits it. Recomputes and submits the three mix gains only when a Synth handle is assigned; otherwise caches the send byte and marks pending bit 0x80000.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D5B4#r4

Updates a logical sound's selected auxiliary send when the corresponding low-bit API gate permits it. Recomputes and submits the three mix gains only when a Synth handle is assigned; otherwise caches the send byte and marks pending bit 0x80000.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D5B4#r5

Updates a logical sound's selected auxiliary send when the corresponding low-bit API gate permits it. Recomputes and submits the three mix gains only when a Synth handle is assigned; otherwise caches the send byte and marks pending bit 0x80000.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D914#r3

Requests an auxiliary-send update for every state-bearing record on a logical channel and unconditionally saves the new default for later starts. Return true confirms valid channel/bus indices, not that current records changed.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D914#r4

Requests an auxiliary-send update for every state-bearing record on a logical channel and unconditionally saves the new default for later starts. Return true confirms valid channel/bus indices, not that current records changed.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D914#r5

Requests an auxiliary-send update for every state-bearing record on a logical channel and unconditionally saves the new default for later starts. Return true confirms valid channel/bus indices, not that current records changed.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038D9D8#r3

Checks whether a driver-issued sound-effect handle still identifies a live HSD_SM record whose underlying synth sound effect remains playable. It rejects malformed, stale, inactive, or synth-invalid handles.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038DA70#r3

Attempts to load the global SFX metadata image into the audio heap, waits by repeatedly calling the supplied service callback, then parses five count-prefixed sections and relocates three pointer tables. The loader is blocking and does not validate file structure or independently confirm a complete successful DVD transfer before parsing.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E30C#r3

Configures one AX auxiliary audio channel with an off, reverb, chorus, or delay processor while supplying the bounded work-memory arena from which that AXFX processor may allocate its internal buffers.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E30C#r4

Configures one AX auxiliary audio channel with an off, reverb, chorus, or delay processor while supplying the bounded work-memory arena from which that AXFX processor may allocate its internal buffers.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E30C#r5

Configures one AX auxiliary audio channel with an off, reverb, chorus, or delay processor while supplying the bounded work-memory arena from which that AXFX processor may allocate its internal buffers.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E30C#r6

Configures one AX auxiliary audio channel with an off, reverb, chorus, or delay processor while supplying the bounded work-memory arena from which that AXFX processor may allocate its internal buffers.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E30C#r7

Configures one AX auxiliary audio channel with an off, reverb, chorus, or delay processor while supplying the bounded work-memory arena from which that AXFX processor may allocate its internal buffers.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E37C#r3

Validates an auxiliary-effect selection and initializes the caller-supplied AXFX parameter structure with the driver's default profile for high-quality reverb, standard reverb, chorus, or delay; the off selection succeeds without requiring or modifying a parameter structure.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E37C#r4

Validates an auxiliary-effect selection and initializes the caller-supplied AXFX parameter structure with the driver's default profile for high-quality reverb, standard reverb, chorus, or delay; the off selection succeeds without requiring or modifying a parameter structure.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E498#r3

Initializes the HSD AX audio-driver layer by preparing its fixed pool of logical sound records, initializing the synthesizer with caller-supplied capacity and memory settings, installing driver-state callbacks, disabling both auxiliary-effect routes, and registering the driver's AXFX allocator hooks.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E498#r4

Initializes the HSD AX audio-driver layer by preparing its fixed pool of logical sound records, initializing the synthesizer with caller-supplied capacity and memory settings, installing driver-state callbacks, disabling both auxiliary-effect routes, and registering the driver's AXFX allocator hooks.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E498#r5

Initializes the HSD AX audio-driver layer by preparing its fixed pool of logical sound records, initializing the synthesizer with caller-supplied capacity and memory settings, installing driver-state callbacks, disabling both auxiliary-effect routes, and registering the driver's AXFX allocator hooks.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E498#r6

Initializes the HSD AX audio-driver layer by preparing its fixed pool of logical sound records, initializing the synthesizer with caller-supplied capacity and memory settings, installing driver-state callbacks, disabling both auxiliary-effect routes, and registering the driver's AXFX allocator hooks.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E5E4#r3

Pauses one logical HSD sound-manager voice identified by its driver voice ID. It rejects invalid, stale, or inactive IDs; for a record with an instantiated synth voice it forwards the pause to the synthesizer, while for an active record without a synth voice yet it records a deferred pause request.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E6C0#r3

Requests pause for state-bearing logical records on one channel and sets the channel mask to refuse later sound starts. Ordinary Synth pause completion is deferred. A never-scheduled record can still execute its initial command batch because deadline -1 initialization precedes the clock pause-bit branch.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E768#r3

Resumes one valid driver-managed sound-effect record, forwarding the record's synth voice ID to the synth resume layer when a synth node exists and clearing the driver's deferred-pause marker.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E844#r3

Resumes the driver-managed sound effects assigned to one logical audio channel, then clears that channel's bit in the global channel-pause mask.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E8EC#r3

Starts or replaces the AX driver's singleton path-selected disc-audio stream. It resolves the requested file path to a DVD entry, requests key-off for the previously retained stream handle when one exists, starts a new synth stream with the requested volume and track, and retains the new handle for the driver's stop, pause, resume, and status operations.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E8EC#r4

Starts or replaces the AX driver's singleton path-selected disc-audio stream. It resolves the requested file path to a DVD entry, requests key-off for the previously retained stream handle when one exists, starts a new synth stream with the requested volume and track, and retains the new handle for the driver's stop, pause, resume, and status operations.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:AXDriver_8038E8EC#r5

Starts or replaces the AX driver's singleton path-selected disc-audio stream. It resolves the requested file path to a DVD entry, requests key-off for the previously retained stream handle when one exists, starts a new synth stream with the requested volume and track, and retains the new handle for the driver's stop, pause, resume, and status operations.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:HSD_AudioGetAuxHeapSize#r3

Calculates an effect-dependent work-memory estimate using fixed reverb dimensions, preDelay or three delay values. It checks only type and enabled param presence. Parameter ranges, arithmetic overflow and the allocator's strict less-than capacity rule require separate handling; this result alone does not guarantee a sufficient usable heap.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:HSD_AudioGetAuxHeapSize#r4

Calculates an effect-dependent work-memory estimate using fixed reverb dimensions, preDelay or three delay values. It checks only type and enabled param presence. Parameter ranges, arithmetic overflow and the allocator's strict less-than capacity rule require separate handling; this result alone does not guarantee a sufficient usable heap.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:HSD_AudioSFXKeyOffTrack#r3

Requests key-off for every active or sleeping AX-driver sound-effect record assigned to a specified logical track, retiring each selected driver-side voice assignment and forwarding its synth instance handle for termination.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:fn_8038CEA4#r3

Handles notification that an HSD Synth sound-effect node became inactive by retiring the corresponding AXDriver-side HSD_SM playback state and identifier mapping.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:fn_8038CF48#r3

Handles notification that an HSD synth sound-effect voice has been paused by marking the corresponding HSD_SM driver record so its command-stream schedule remains synchronized across the pause.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:fn_8038DA5C#r3

Handles completion of the asynchronous DVD read used to load the AX driver's sound-effect metadata image. It releases the loader's callback-pumped wait by setting the shared completion flag whenever the DVD result is not -1.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

## main/sysdolphin/baselib/axdriver:fn_8038DA5C#r4

Handles completion of the asynchronous DVD read used to load the AX driver's sound-effect metadata image. It releases the loader's callback-pumped wait by setting the shared completion flag whenever the DVD result is not -1.

Canonical signature and input uses read; no speculative register-to-parameter fact added.


## Lead verification corrections

The existing .data relocations target only the delay decoder and command interpreter; auxiliary switches are not established as .data tables. Singleton pause/resume check sentinel presence, then Synth applies its own validity/state guards. Channel pause is a request and initial scheduling can precede the pause marker. Channel resume ignores per-record failures. Relationship review now retains 66 and rejects 7 exact stored rationales. Shared relationships are unchanged.
