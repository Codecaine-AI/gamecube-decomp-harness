# Cardgame Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All 369 canonical and rendered lines reviewed.

## .bss

The static header declares the 0x68-byte lb_80433318 singleton. It holds probe x0, event x4, condition x8, request xC, operation x10, error latch x14, enable, a 64-byte comment, resource pointers x5C/x64 and index x60. Section placement requires object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L284-L317

## .data

Source declares metadata initialized with 0x2000100, 0 and 0x300, plus CardEntry[10]: header {0,3,NULL}, main {0x1790,0,NULL}, seven {0x1F2C,1,NULL}, and {-1,0,NULL}. Exact section contents require object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L21-L38

## .sdata

Source declares one float coordinate row {21.5F,16.5F}. Scene setup indexes it with x60 without bounds checks. Section placement requires object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L247-L272

## .sdata2

Scene setup requests animation frame 0.0F. Exact pooled literal contents and section placement require object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L269-L271

## lb_8001C600

Stores CARDProbe(0) in x0 and sets x4 to 1 when the value changes. An unchanged result leaves x4 unchanged.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L40-L47

## lb_8001C658

Converts OS time through a u32 whole-second value to calendar time, clears the shared 64-byte comment, selects Japanese or English Game Data text and formats title and date with sprintf. Returns shared storage. Formatting has no explicit capacity check.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L49-L69

## lb_8001C820

Returns x5C[2] when un_80304470() is true, else x5C[1] when gm_80164ABC() is true, else x5C[0]. The predicates and selected integer semantics are delegated; there is no local pointer guard.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L71-L83

## lb_8001C87C

Returns lb_8001B7E0 with channel 0, fixed filename SuperSmashBros0110290334, entry manifest, metadata and &x4. Operation semantics and waiting are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L85-L89

## lb_8001C8BC

Asserts enable and returns lb_8001BC18 with channel 0, fixed filename, manifest, metadata, generated comment, selected x5C value, x5C[3] and &x4. Operation direction and waiting are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L91-L98

## lb_8001CAF4

Snapshots and clears x4. State x8=0 becomes 1 on an event; state 3 becomes 4 when lb_8001C404(0) is nonzero; state 4 becomes 3 when an event is present and that predicate is zero. Other states remain unchanged. Returns x8.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L104-L126

## lb_8001CBAC

Copies the supplied integer into x8 without validation. This can install values outside 0 through 4.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L131-L134

## lb_8001CBBC

Calls the condition updater and returns 0xD if nonzero. Otherwise delegates to lb_8001BD34 with channel 0, fixed filename, manifest and &x4. A result other than 0 or 2 sets x8=2; returns the result.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L136-L148

## fn_8001CC30

Completion callback sets x8=2 for a nonzero argument; zero leaves x8 unchanged. It does not identify operation direction.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L150-L155

## lb_8001CC4C

Returns lb_8001BA44 with channel 0, fixed filename and &x4. Deletion, waiting and result translation are delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L157-L160

## lb_8001CC84

Services request xC and operation x10. In state 0 it clears a present request before checking x8, discarding the request if x8 is nonzero. Otherwise the helper result 0xB sets x10=1; every other start result sets x14=1, including zero. State 1 polls lb_8001B6F8; a result other than 0xB clears x10, and nonzero also sets x14. Repeats while x10!=1 and xC!=0. Other x10 values have no switch action.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L176-L210

## lb_8001CDB4

Repeatedly calls lb_8001CC84 while xC or x10 is nonzero. There is no yield, timeout or returned result. Exit does not prove successful I/O; a blocked request can be discarded. An unsupported nonzero x10 value can prevent termination.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L212-L217

## lbCardGame_UpdatePowerTime

Asserts enable, adds gmMainLib_8015FC74() to the value addressed by gm_GetPowerTime(), and sets xC=true. Repeated requests coalesce in the Boolean flag. Foreign time units and checkpoint mechanics require independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L219-L224

## lbCardGame_DecideGameMode

Refreshes x8 through the condition updater. Returns GM_COUNT for x8 equal to 0 or 4, otherwise GM_MEMCARD.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L226-L233

## fn_8001CEC0

Calls HSD_JObjAnimAll with gobj->hsd_obj. No local guard or condition. Hierarchy traversal and null handling belong to the callee.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L235-L238

## fn_8001CEE4

Calls HSD_GObj_803910D8(gobj,arg1) only while x10==1. Every other state returns without that call.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L240-L245

## lb_8001CF18

When x64 is non-null, creates camera and model GObjs from the first scene entries. Installs fn_8001CEE4 on the camera with GX mask 0x80000. Translates the model using the single coordinate row indexed by x60, attaches draw and animation callbacks, binds animations, requests frame 0 and evaluates it. No allocation-result or index checks appear locally.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L249-L272

## lbCardGame_LoadArchive

Only when x5C is null, loads LbMcGame./MemCardIconData and NtMemAc/ScNtcCommon_scene_data, stores arg0 in x60 and sets enable=1. Loader success is not checked before enabling. A non-null x5C makes later calls no-ops.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L274-L282

## lb_8001D1F4

Clears x5C, x64, enable, xC, x10 and x14. Does not free assets or clear x0, x4, x8, x60 or the comment buffer.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L284-L292

## lb_8001D21C

Probes channel 0 into x0 and clears x4, x8, resource pointers, enable, request, operation and error fields. Sets manifest entry 1 to gmMainLib_GetSaveData(), and entries 2 through 8 to seven consecutive 0x1F2C-byte records from gmMainLib_8015CC4C(). Does not start card I/O or clear x60/comment.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L298-L317

## file

Game-facing card manager with fixed channel 0 and filename SuperSmashBros0110290334. Maintains probe/condition state separately from queued/pending operation state, prepares a dated localized comment and entry manifest, delegates file operations, and creates an access scene whose camera call is gated by x10==1. Operation direction, progression predicates and compiler-section membership need independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcardgame.c#L21-L317

The non-target helper at lines 162-174 refreshes condition and delegates BE30. Its operation direction is unresolved.

Independent controls review confirms BE30 ultimately queues retryCardWriteAsync through the task-10 and type-9 pipeline. The three Read aliases contradict this chain and are proposed for clearing. This packet promotes no replacement alias. Foreign files are peer evidence, not owned read coverage. Proposal has 72 fact writes and 3 alias clears.
