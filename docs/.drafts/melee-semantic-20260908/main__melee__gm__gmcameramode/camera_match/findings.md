# Camera Match Review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. All owned source lines 189–250 were read separately in canonical and rendered form. Contextual state-table lines 21–78 were also read in both forms. No header is assigned to this cluster.

## gm_PrepCameraModeVSScene

Builds Camera Mode battle enter data from persistent modes.vs_camera. Calls gm_80167BC8(vs), copies its rules into the entering StartMeleeData, specializes rule fields and callback pointers, copies every player and sets each xD_b3 true. Calls subcolor, rumble, announcer and card-work setup, then passes preloaded archives 2007 and 2008 to lbSnap_8001E218.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L189-L233

## gm_801B2AF8

Processes Camera Mode match exit by obtaining KO-count storage, calling gm_80168638 with the shared match_end, calling gm_80168710 with that payload and persistent vs_camera, passing gm_801688AC(match_end) to gm_8016247C, and calling gmVsMelee_UpdateKOCounts. Finally requests next state ID 1. The GameModeState argument is unused.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L235-L244

## gm_Mode_Camera_OnInit

Passes the persistent gmMainLib_804D3EE0->modes.vs_camera address to gm_InitVsMode. Takes no parameters and performs no other direct operation.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L246-L249

## State and Callback Boundaries

The prep function copies persistent rules first. Line 202 then disables the entering timer while clearing persistent x4_4. It does not clear entering x4_4. Player records are copied for every GM_MAX_PLAYERS slot and xD_b3 is forced true. No player count or unnamed flag meaning is invented.

Pause and unpause pointers both receive gm_80165268. Pauser selection receives gm_CameraModeVSGetPauser. Match-start, frame-start and frame-end pointers receive gmCamera_801A31FC, gmCamera_801A3098 and gmCamera_801A30E4 respectively. These are wiring claims; rendered aliases do not establish their behavior.

The contextual table assigns prep and gm_801B2AF8 to state 3 with GS_VS and shared start/exit data. State 1 contains GS_CSS, so the exit request returns to character selection. gm_ExitCameraModeVSScene remains a supported descriptive hypothesis, not an attested rename. The other two canonical names are retained without redundant aliases.

Context: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gm/gmcameramode.c#L43-L78

## Coverage and Dispositions

3 targets, 2 parameter entities and 15 existing facts accounted for. Dispositions: {'supersede': 6, 'retain': 7, 'unresolved': 2}. Both parameter entities have empty fact inventories. gm_801B2AF8 arg0 is unused; prep state supplies enter data. OnInit has no parameter.

Unresolved extensions are the OnInit CSS/SSS data-flow and external Camera Mode gameplay claims. Callback and shared rule-layout meanings remain family followups. Source hashes, read receipts and per-fact ID/version decisions are in the JSON artifacts. No source or shared KB writes were made.

Dry-run validation accepted 6 facts with zero rejections. No proposal was applied.
