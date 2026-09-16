## IfPrize semantic review

The owned C file and header implement a queued prize-notification scene. Existing descriptive function names fit their canonical bodies and the rendered declarations; no function renaming is proposed.

### Mapping and presentation
`un_802FE3F8` searches the code-to-message-offset table until sentinel code 66. Recognized codes write a base-relative primary message index when its output pointer is non-null. Code 62 additionally permits a secondary index one greater than the primary. Unknown codes leave outputs unchanged. The prize scene uses base 2; `mnInfo_80251F04` independently uses base 0x4BD for information-menu labels. The code and auxiliary trophy identifier are distinct domains.

`un_802FE918` plays the current sound variant, chooses a different next variant for valid indices 0..2, clears the indexed save-data bit through `gmMainLib_8015D8B0`, selects the animation category, and populates the message and localized acquisition timestamp. It does not record a new acquisition through that call. Code 0x3E builds message 0x4A using two mapped messages and Toy-derived text. An unknown code falls back to animation category zero, but message lookup leaves the previous message index untouched; the preceding save-bit operation is not protected by the table lookup.

### Lifecycle and resources
Entry retains the incoming record pointer and its successor rather than copying or freeing the linked records. It assigns counter -1, phase 0, both gates, a random initial sound index, and initial presentation fields. It loads `IfPrize` / `ScInfPrize_scene_data` and language-specific `SdPrize.usd` or `SdPrize.dat`, then constructs camera, light, UI model, process callback, and two text objects.

Phase 0 increments the counter while below 5, then presents the head record and enters phase 1. Phase 1 sets the counter to 10 and handles A/Start: present and advance the successor, or request exit. Exit initiation checks both gates, selects phase 2, and releases SIS slot 2 without resetting the counter or checking the current phase. Normally phase 2 therefore increments 10 to 15 over five callbacks, selects phase 3 on the next callback, and performs cleanup on the following callback. Fifteen is a counter threshold, not a fifteen-frame exit duration. Phase 3 removes camera/light/UI objects, releases the scene archive, clears gates, selects terminal phase 4, and returns before animation requests. The scene-exit callback itself is empty.

SIS cleanup and scene-archive cleanup are separate operations. Module pointer fields are not explicitly nulled during final cleanup. Retained record storage must remain valid while callbacks consume it; this file does not establish its external allocation or release policy. Plain `char` is used for the counter, with an explicit `s8` cast at animation submission; no compiled signedness or layout conclusion is drawn.

### Evidence boundaries
All owned canonical and rendered pages, all 24 subjects, all 60 facts, and all 10 links were reviewed. Source-level resource and presentation roles are retained explicitly in the checkpoint ledger. Seven factual corrections address timing, returning-void terminology, and save-bit clearing. Seven compiled-section/layout facts remain unresolved because no compiled artifacts were supplied. The renderer reports no parse errors but suppresses two external text-constructor substitutions because both propose `HSD_SisLib_CreateText`.

Status: synthesized; independent review and live promotion pending.
