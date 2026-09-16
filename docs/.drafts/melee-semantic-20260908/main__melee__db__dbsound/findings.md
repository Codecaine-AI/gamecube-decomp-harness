# dbsound Semantic Findings

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`.

## main/melee/db/dbsound:.bss

Provides the module-owned character storage backing the developer sound-information DevText panel.

- fact:11b7d14a-851b-4bbb-ae49-cc08f9a624fe @ 2026-09-04T18:30:28.740Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:0c58c871-40cd-4994-8249-c9b02e09b0d7 @ 2026-09-04T18:30:28.740Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:095a0b16-c6cd-42db-be9b-37b7c36dc656 @ 2026-09-06T02:34:38.472Z: retain inferred_name. Canonical implementation and recorded support substantiate this claim.
- fact:bb558d43-57a8-47a7-99de-6480846ddd44 @ 2026-09-04T18:30:28.740Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:5ae387ff-baa8-4f56-8ffb-5115f8861db5 @ 2026-09-04T18:30:28.740Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:fbdc8f2c-7084-45cb-964c-bf99f32feff2 @ 2026-09-04T18:30:28.740Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/melee/db/dbsound:.data

Supplies the initialized lookup table and display strings used by the DEVELOP-mode sound control: the table translates its cyclic mode index into foreground-audio/background-music enable bits, while the strings label those combinations and format the developer voice diagnostics.

- fact:f0c4a31c-4a13-4dd8-bcbb-fd54ddda7ce6 @ 2026-09-04T18:30:28.740Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:11987721-40c6-4645-b945-299bc0cbfa03 @ 2026-09-04T18:30:28.740Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:c140c938-74d2-4e2d-bf36-f20c5c9daf5b @ 2026-09-04T18:30:28.740Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:e8e5b9c1-be73-4c6f-860a-77da43f6b0cb @ 2026-09-04T18:30:28.740Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:f303affc-3f87-44d0-9943-2aae6476221b @ 2026-09-04T18:30:28.740Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/melee/db/dbsound:.sbss

Holds the zero-initialized persistent state for the DEVELOP-mode sound controls and sound-status overlay: the sound-output and information-display mode indices, two retained audio voice-statistic values with their retention countdowns, and the DevText and game-object pointers used to present the panel.

- fact:b96a7216-81c7-40fa-9835-69c940e2d5f6 @ 2026-09-04T18:30:28.740Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:42e166c0-e02b-42dd-a4d7-d2c612ce2d41 @ 2026-09-04T18:30:28.740Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:d1d1ba98-fe78-4c94-86ac-20b6dfde4c4f @ 2026-09-04T18:30:28.740Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:0e76d278-761d-4f07-8c69-b5dc270d5cf1 @ 2026-09-04T18:30:28.740Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:450d9e51-81ed-48b6-8bf4-2b81df4f29f8 @ 2026-09-04T18:30:28.740Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/melee/db/dbsound:.sdata

Canonical signature and input uses reviewed.

- fact:04851f79-fc1e-47b5-bc9e-0631469713b9 @ 2026-09-04T18:30:28.740Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:1e796b30-96be-4f78-ae2b-4736570f1daf @ 2026-09-02T05:02:34.253Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.

## main/melee/db/dbsound:.sdata2

Stores immutable setup literals for the sound panel: gray translucent background, white text, horizontal scale 12.0 and vertical scale 16.0.

- fact:800790ac-4be8-4343-aec6-aed6aa21bb3b @ 2026-09-04T22:36:14.106Z: supersede data_flow. Correct inherited claim using pinned source and recorded object observations.
- fact:510808fc-cf27-4ea3-acc1-4e44add0ed24 @ 2026-09-04T18:30:28.740Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:44052278-a6ae-48bf-a861-443ba1429c45 @ 2026-09-04T22:36:14.106Z: supersede inferred_type. Correct inherited claim using pinned source and recorded object observations.
- fact:736a1f7d-c45f-41b4-8e6c-a971ce8522fc @ 2026-09-04T22:36:14.106Z: supersede purpose. Correct inherited claim using pinned source and recorded object observations.

## main/melee/db/dbsound:fn_CheckSoundInfo

Processes the player-0 DEVELOP-mode sound-control chord once per new button press, advances the sound-output and information-display modes, applies a newly selected sound configuration, and refreshes the sound-information display every time it is called.

- fact:9ff75160-583a-4916-acad-450a8487f403 @ 2026-09-01T23:17:30.360Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:9f71c70d-8c64-494d-8e7d-e8af2b3f9494 @ 2026-09-01T23:17:30.360Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:83280943-36e8-4dd9-a39e-d4346e6c9c49 @ 2026-09-01T23:17:30.360Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:38a1012e-5b02-490d-926d-93167fbdef54 @ 2026-09-01T23:17:30.360Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:7d7d7a07-9065-459e-bd61-bdbdd710ad65 @ 2026-09-01T23:17:30.360Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/melee/db/dbsound:fn_SetupSoundInfo

Initializes the debug sound-information subsystem and prepares its developer-text panel in a registered but initially hidden state for later update and display.

- fact:aa90ac6d-aa1a-4acb-b2f8-f0490b5a7409 @ 2026-09-01T23:17:08.692Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:627bf2e9-af31-4673-a627-513a264c4d90 @ 2026-09-01T23:17:08.692Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:00594853-858d-4f8f-8327-43d30a67a7ce @ 2026-09-01T23:17:08.692Z: retain inferred_type. Canonical implementation and recorded support substantiate this claim.
- fact:9c7fa045-25e7-4933-95b4-8b0a7bc6785b @ 2026-09-01T23:17:08.692Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:2c7aea31-a3a7-45b5-8cef-886576f0be76 @ 2026-09-01T23:17:08.692Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## main/melee/db/dbsound:fn_UpdateSoundInfo

Updates the audio debug latch and panel visibility; in visible modes samples both node-associated and allocated-logical counts, updates separate retained peaks, and redraws status text. Both displayed current columns receive the second, virtual-count sample, while PVoice and VVoice peaks remain separate.

- fact:07303079-25f3-4e57-bdeb-1c9f3988bcb1 @ 2026-09-04T18:30:28.740Z: retain data_flow. Canonical implementation and recorded support substantiate this claim.
- fact:5ff7846d-e960-44bc-91b8-490825152aed @ 2026-09-04T18:30:28.740Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:ff70fd64-5c96-4bb3-84b3-199ec4344b68 @ 2026-09-04T18:30:28.740Z: supersede inferred_type. Correct inherited claim using pinned source and recorded object observations.
- fact:8df94ea1-64c1-4587-8396-be1a4df5f1b4 @ 2026-09-04T18:30:28.740Z: supersede purpose. Correct inherited claim using pinned source and recorded object observations.
- fact:68ffd654-9aca-4ff1-bbcc-d2d05cab0b75 @ 2026-09-04T18:30:28.740Z: supersede state_behavior. Correct inherited claim using pinned source and recorded object observations.

## src/melee/db/dbsound.c

Implements the DEVELOP-mode sound-control subsystem: it creates a developer-text panel, maintains sound-output and information-display modes, applies music and sound-effect enablement changes, samples voice statistics, and refreshes diagnostics.

- fact:0bde01a0-1fca-4c42-b34a-4c49761c83d4 @ 2026-09-06T03:12:01.317Z: supersede data_flow. Correct inherited claim using pinned source and recorded object observations.
- fact:9cc827fe-6576-4f9e-ab77-1cf5e9a9043e @ 2026-09-06T03:12:01.317Z: retain game_mapping. Canonical implementation and recorded support substantiate this claim.
- fact:e4b4a16f-ef7e-4710-8ad6-8b39c172c454 @ 2026-09-06T03:12:01.317Z: retain purpose. Canonical implementation and recorded support substantiate this claim.
- fact:c5a0d9ce-1a34-4067-8deb-8f0f03db76fb @ 2026-09-06T03:12:01.317Z: retain state_behavior. Canonical implementation and recorded support substantiate this claim.

## main/melee/db/dbsound:fn_CheckSoundInfo#r3

Processes the player-0 DEVELOP-mode sound-control chord once per new button press, advances the sound-output and information-display modes, applies a newly selected sound configuration, and refreshes the sound-information display every time it is called.

Canonical signature and input uses read; no speculative register-to-parameter fact added.

