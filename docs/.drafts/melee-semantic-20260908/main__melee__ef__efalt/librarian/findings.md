# Efalt librarian review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. All557 canonical/rendered lines reviewed; C76parser diagnostics,0substitutions, full text present. Header0diagnostics with shadowed binding. Hashes/timing and all65recipe bodies are in coverage.json.

## Entry and queue contract

efAlt_Spawn takes a prepared va_list, not an ellipsis. It aliases that list as void* and uses EFALT_VA_ARG or forwards it to a helper. No va_copy,va_start,va_end or local reset exists. Payload pointers and arity depend on gfx_id; scalar reads dereference f32*. Allocation failure often skips later pointer reads. Caller efSync clears AnimCount before dispatch; efAlt itself preserves existing queue count and forces LoadKindSYNC without restoring it.

65explicit labels cover479..4B9 inclusive. The upstream caller also sends478 here, which has no case and returnsNULL after mode change/queue drain. Direct calls with any unsupported ID have those same side effects. Upstream479 fallback is owned by efsync and is not repeated here.

Common epilogue decrements AnimCount and reads pointer-sized slots, newest first. Queue producer casts EF_ParamEntry[16] storage to HSD_JObj**; consumer adds u32 words before reading its first field. The source comment claiming ordinary EF_ParamEntry indexing is misleading. Drain includes old entries and entries produced by this call.4A9/4AA call AnimAll immediately and may animate the same queued root again. Nothing here proves nested-spawn/global-queue isolation.

## Recipe behavior

Every case has its exact source, lexical pointer reads, constructors and semantic notes in coverage.json. Position-only generators can ignore gobj; model scale and callback paths require owner model or fighter-like data. Standard Scale/FacingDir model helpers use ownerY uniformly rather than preserving nonuniform scale.4B6/4B7 explicitly override with full owner scale. Facing negative means-pi/2; zero and nonnegative mean+pi/2.48E/4AC setY+pi/2 and caller-suppliedZ.490 stores a scalar in params.z for its callback.

47A/49F/4B1 attempt a secondary attached generator regardless of primary model creation and return only the model. A NULL return therefore does not imply no visual was created.48F/4AB/4B3 consume two separate joint pointers and link a second model only after first success; later failure preserves first.494 consumes no varargs: reads owner user_data+0x5E8 as a joint-pointer-array pointer, uses indices0xB0/4 and constructs up to3effects1388/1389/138A. Successful nodes get lifetime65 and transition callback; first user_dataNULL, later nodes original owner user_data. No cleanup rollback exists. Raw indices are not promoted to semantic fighter part names.

49D consumes position then, on success, a sign pointer and one angle pointer. Its two lexical angle reads are mutually exclusive: total runtime payload3pointers. It uses parentY uniformly, writes childZ=rootZ-6, selectsYquarter-turn and signedZangle, then installs offsetZ callback. It relies on child existence.48D/49A/4B0 forward JObj* then sign f32* to AppSRT facing helper;4A5..4A8 forward JObj* to AppSRT attachment/uniformY scale helper.

## Coverage and limits

One function body and one header prototype; no source-only function helpers. EFALT_VA_ARG is a macro, not a new target. Two volatile globals are declared extern; no concrete data objects or jump tables are defined here.3compiled sections remain attribution-limited. Existing archival PR references are recorded but not treated as fresh matching evidence. Frozen baseline exact-link query returned0 across TU targets and source/parameter entities; missing export was not assumed zero without that query.

All16 facts reviewed: {'retain': 1, 'supersede': 6, 'reject': 0, 'unresolved': 9}. Six draft operations; complete five-file packet mirrored. No source/shared KB/Git/UI or matching edits.
