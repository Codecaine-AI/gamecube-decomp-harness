# Pokémon Stadium semantic review

Pokémon Stadium owns a ten-row Ground callback table, terrain controller states0..6 and display modes0..17. Local setup installs init/proc/callback3 and omits callback1 and flags; shared Ground consumers use b2 for camera, b1 for fog and b0 for lights. Terrain alternates neutral5 with Fire3,Grass4,Water9,Rock6 via async DAT files; readiness poll accepts null archive result. Display combines text250x160, large640x406 and small124x80 captures, masks and optional camera subject. Countdown checks use old timer values; weighted selection can loop forever and downstream remap can repeat effective modes. Missing image lookup leaves caller material uninitialized; capture objects are dereferenced before null checks. Shared union aliases display.xD8 to controller timer D8. Physical section layout and external collision, game-query, allocation and renderer internals are not established.

All2386 owned canonical/rendered lines, 78 functions,6 data targets,80 entities,476 facts and127 exact outgoing links reviewed. 55 unresolved, 250 supersede, 171 retain; 250 proposed fact writes.

## grStadium_OnDemoInit

Empty int-argument demo callback; no work.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L161-L161)

## grStadium_OnInit

Cache yakumono parameters; clear stage b4 and set b5; invoke factory for 0, Display,2 in order and ignore results; call Ground_801C39C0 then 801C3BB4; call mpLib_80057BC0 for1,2,3,5,7,0 then800581DC(6,4). External camera and collision internals delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L163-L184)

## grStadium_OnLoad

Empty parameterless callback; no work.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L186-L186)

## grStadium_OnStart

Call grZakoGenerator_801CAE04(NULL) once and ignore result. Manager allocation, scheduling and failure recovery are external.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L188-L191)

## grStadium_801D10F0

Stage descriptor callback4 returns false; no calls or writes.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L193-L196)

## grStadium_801D10F8

Unchecked id indexes ten-row callback table before Ground_GetStageGObj. Success clears x8/xC callbacks, registers grDisplay_801C5DB0 on GX link3 priority0, conditionally stores callback3, invokes on_init and schedules gobj_proc priority4. callback1 and flags are omitted locally; shared Ground consumers use b2 for camera, b1 for fog and b0 for lights. Failure reports id and returns NULL. No caller recovery guaranteed.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L202-L228)

## fn_801D11E4

Store Camera_80029020 result in display.xF4. Nonnull result gets inactive state, position(0,30s,0), horizontal(-25s,+25s), vertical(+10s,-10s), where s=Ground scale. Null result stops writes; allocation/queue dispatch semantics external.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L230-L247)

## grStadium_801D1290

Initialize animation selector0, call grAnime_801C77FC(0,7), lookup named image descriptor from archive1. Missing image or TObj reports but continues. FindTObj helper stores TObj in xC8 and local mobj in xCC; failed search leaves local mobj uninitialized. Initialize display state, queue fn_801D11E4, set b012=1 and render callback fn_801D5074. No resource-failure recovery.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L249-L271)

## grStadium_801D1388

Callback1 in row1 returns false; input unused. Factory does not schedule or install callback1.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L273-L276)

## grStadium_801D1390

Call random effect attempt801D1E20 then display dispatcher801D2344, in order. Installed as row1 gobj_proc priority4; no local guard.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L278-L282)

## grStadium_801D13C4

Empty row1 callback3, stored by factory in x1C_callback; argument unused.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L284-L284)

## fn_801D13C8

Clear controller stadium.xC4_b0. Queued by row2 initializer; row2 process advances terrain only while bit clear. Exact shared queue timing unreviewed.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L286-L290)

## grStadium_801D13E0

Call Ground_801C2ED0 and animation selector0; retain preload entry0x7D5 or unchecked allocation0x50000 as xCC. Clear b1,D0,D4; set DC0,DE5,E0/E2=-1,E4=factory5,E8NULL. Set D8 via random between x0/x4, b012=1; call mpLib_800575B0 for0x55/0x6F; queue fn13C8 then set gate b0. No allocation/factory failure checks.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L302-L340)

## grStadium_801D1518

Row2 callback1 returns false; argument unused. Factory ignores callback1.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L342-L345)

## grStadium_801D1520

If startup gate b0 clear, call terrain controller4548. Regardless call lb_800115F4 then Ground_801C2FE0. Row2 scheduled process; shared dynamics/collision internals delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L347-L355)

## grStadium_801D156C

Empty row2 callback3; stored in x1C_callback.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L357-L357)

## grStadium_801D1570

Row5 neutral initializer calls Ground_801C2ED0,801C3214,mpJointListAdd(4),grAnime_801C8138(map,0); clears b0,b1 and sets b5. Shared animation/collision internals delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L359-L370)

## grStadium_801D15FC

Row5 callback1 returns false; factory ignores this slot.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L372-L375)

## grStadium_801D1604

Row5 scheduled process calls Ground_801C2FE0(gobj) once, ignores result. No local guard; shared collision internals delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L377-L380)

## grStadium_801D1624

Row5 callback3 ignores gobj and calls mpLib_80057BC0(4). No local state clear; idempotence and removal lifecycle are external.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L382-L385)

## grStadium_801D1648

Row4 initializer calls Ground_801C2ED0,801C3214,mpJointListAdd(3),animation selector0; clears b0,b1 and sets b5. Controller explicitly maps type4 to Grass file index1.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L387-L398)

## grStadium_801D16D4

Row4 callback1 returns false; factory ignores this slot.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L400-L403)

## grStadium_801D16DC

Row4 scheduled process calls Ground_801C2FE0(gobj), discards result; no local guard. Shared collision behavior delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L405-L408)

## grStadium_801D16FC

Row4 callback3 ignores object, calls mpLib_80057BC0(3); no local idempotence proof.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L410-L413)

## grStadium_801D1720

Row6 Rock initializer runs Ground_801C2ED0,801C3214,mpJointListAdd(5),animation selector0; clears b0,b1. Store grLib_801C96F8(0x7546,0x1E,zeroVec) result in stadium9.xC8; set b5. No result check.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L417-L432)

## grStadium_801D17E0

Always-false row6 callback1, not gobj_proc. Factory ignores callback1; scheduled row6 process is801D17E8.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L434-L437)

## grStadium_801D17E8

Row6 scheduled process forwards gobj to Ground_801C2FE0 and discards result; local body has no guards.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L439-L442)

## grStadium_801D1808

Row6 callback3 calls grLib_801C9834 on nonnull retained xC8, then mpLib_80057BC0(5). Does not clear retained pointer; external cleanup/idempotence unreviewed.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L444-L451)

## grStadium_801D1840

Row3 Fire initializer calls Ground setup, adds joints1/2, initializes animation0, clears b0/b1. Optional joints0x13..0x19 receive grLib_801C9808 effects respectively753F,7549,7549,753F,753F,7549,753F with bank1E. Missing joint skips only its call. Set b5 at end; exact effect imagery external.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L453-L503)

## grStadium_801D19D0

Always-false row3 callback1, not scheduled process. Factory ignores this slot; actual row3 gobj_proc is801D19D8.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L505-L508)

## grStadium_801D19D8

Row3 scheduled process calls Ground_801C2FE0 once and discards result; no local guard or collision algorithm.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L510-L513)

## grStadium_801D19F8

Row3 callback3 resolves joint0x12, calls grLib_801C9908 only if nonnull, then calls mpLib_80057BC0 for1 and2. External recursive cleanup/idempotence unreviewed.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L515-L523)

## grStadium_801D1A38

Row9 Water initializer configures Ground/animation, adds joint7, creates types7/8 in xCC/xD0, calls mpLib_80057BC0(0), clears b0/b1. Retains grLib_801C96F8(7544,1E,zero) in xC8 and joint7 in xD4; sets all root flags8 and b5. No allocation or cached-joint guard; controller maps type9 to Water file2.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L527-L551)

## grStadium_801D1B40

Row9 callback1 always false; factory ignores this slot.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L553-L556)

## grStadium_801D1B48

Copy parent scaleY to each nonnull subordinate object. Unguarded cached xD4 joint rotates Z by -0.5 degrees. If b0 set clear then mpJointListAdd(0); if b1 set clear then mpLib_80057BC0(0), so both calls occur in that order when both bits set. Finish Ground_801C2FE0 and mpLib_8005667C(0). External collision outcome delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L558-L591)

## grStadium_801D1D84

Row9 callback3 independently calls grLib_801C9874(nonnull xC8), Ground_801C4A08(nonnull xCC), Ground_801C4A08(nonnull xD0), then mpLib_80057BC0(7). Does not clear stored handles; parent destruction and idempotence unreviewed.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L593-L607)

## grStadium_801D1DE4

Shared row7/8 initializer calls grAnime_801C8138(gobj,map_id,0). Archive channels, frame evaluation and allocation are delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L609-L613)

## grStadium_801D1E10

Shared row7/8 callback1 returns false. Factory ignores this slot.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L615-L618)

## grStadium_801D1E18

Shared row7/8 gobj_proc is empty, scheduled priority4 by factory.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L620-L620)

## grStadium_801D1E1C

Shared row7/8 callback3 is empty; stored in x1C_callback.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L622-L622)

## grStadium_801D1E20

If HSD_Randi(200)!=0 return. Otherwise choose sign from Randi(2), X magnitude100+Randi(200), Y=-100,Z=-660; multiply coordinates by Ground scale and call grLib_801C96F8(7530,1E,pos), ignoring result. Two extra draws only on trigger. Exact visual and allocation success unverified.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L633-L647)

## grStadium_801D1EF8

Only when xF8_0 set: XOR cached/requested masks, map bits1,2,4,8,10,20,40,80 to joints6,3,4,7,9,8,2,5. Changed requested-set bits clear HIDDEN, unset bits set it, skipping missing joints. Modes0,1,9..14,17 select xD4 text image with21E4(false);7 selects xD8 and8 xDC with21E4(true), guarded for missing TObj/source. Copy E6 to E8 even when joints missing. Does not clear readiness bit.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L657-L793)

## grStadium_801D21E4

Null retained MObj returns. True clears RENDER_DIFFUSE_VTX, sets RENDER_DIFFUSE_MAT and copies parameter RGB; false reverses diffuse bits without RGB rewrite. Always call HSD_MObjCompileTev for present material. Other rendermode bits preserved; compiler internals delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L795-L814)

## grStadium_801D2278

Set E4/E6=1,E8/EA=-1,EE99,F2=0,F8 flags false; create xD4 text,xD8 large capture,xDC small capture. Dereference xDC userdata unguarded to set origins200,160. Set xF4NULL and call2528(mode0,0), recording previous1. Allocation failures unchecked.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L816-L838)

## grStadium_801D2344

Mode0 resets text;1,9,14 run formatter then test old E0--<0;10..13 run static formatter without timer.2..6,15,16 only expiry-select.7 expiry-select else rearm xD8.flag=false.8 expiry/missing or ineligible player selects next; otherwise dereference xDC to rearm before later xDC-null check, then require tracking32D0.17/default no action. Zero timer itself does not expire until next call.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L840-L915)

## grStadium_801D2528

If gm_8018841C true remap requests1/9..16 to7 and assert for2..6. Record previous/current.0,1,9..14 set mask40, clear two readiness flags, deactivate optional subject;0 resets text,1/9/14 format and get x20/x24/x2C timers;10..13 format but keep timer.15/16 masks20/80 with x20 timer and no readiness reset.7 mask40,random x38/x3C timer.8 mask40,random x30/x34 timer, cycle entity slots0..5 with third-wrap fallback slot0/timer-1.17 clears dynamic and sets static4 but does not alter subject state.2..6 masks1,2,4,10,8 with x28 timer and active subject. Any nonzero duration, including negative, overrides timer last.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L945-L1126)

## grStadium_801D2A60

At F2>=x50 reset F2 and choose14; otherwise sample weights x48,x4C,x4A,x4E to modes8,7,1,15 and retry while candidate equals E4 or EA. Unbounded rejection loop can fail to terminate with degenerate weights. Increment F2 then call2528. Downstream remap can defeat effective no-repeat; forced14 bypasses exclusions.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1128-L1157)

## grStadium_801D2BEC

Create GObj11/13/0 and camera from descriptor, set orthographic0,-160,0,250, attach camera and GXmax fn2ED0 priority1 with gxlink_prios2. Allocate TextWrapper, register free, zero image descriptor only, initialize250x160 format4 preload7D2. Load SIS_GrPStadiumData into global slot1; create static/dynamic text, dynamic z0 and box250x160. No null checks or full-wrapper zeroing.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1178-L1209)

## grStadium_801D2D78

Create GObj11/12/0 with GXmax2FD0 priority3; allocate0x1C wrapper, attach free, zero descriptor only. Initialize640x406 format4 preload7D3 and set flagtrue, initially idle. No null checks; unused crop fields not initialized here.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1211-L1224)

## grStadium_801D2E24

Create GObj11/12/0 with GXmax3084 priority3; allocate sizeof ImageDescWrapper, attach free, zero descriptor only. Initialize124x80 format4 preload7D4 and flagfalse, initially armed. Crop origin set by2278 later; no null checks.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1226-L1237)

## fn_801D2ED0

If HSD_CObjSetCurrent succeeds, set erase color0001, erase with1,0,0, fogNULL, dispatch GObj rendering mask7 and end camera. Regardless of activation success call lb_800122C8(desc,0,0,1); assert display object/payload and set xF8_0. No local latch; capture helper internals delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1239-L1262)

## grStadium_801D2FD0

When wrapper flagfalse call lb_800122C8(desc,0,36,0), set flagtrue, assert display/payload and set xF8_0. Flagtrue no-op; mode7 rearms. Does not verify capture success.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1264-L1282)

## grStadium_801D3084

When wrapper flagfalse call lb_800122C8(desc,x1A,x1C,0), set flagtrue, assert display/payload and set xF8_0. Flagtrue no-op; mode8 rearms. This callback does not itself validate player or rectangle.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1284-L1303)

## grStadium_801D3138

Traverse JObj via child unless INSTANCE, next and ancestor-next; scan DObj only for union_type_dobj, nonnull MObj TObj chains. Pointer-equal imagedesc returns first TObj and writes owning MObj. No match returns NULL leaving out-param untouched. Null desc may match null image. Traversal may follow root siblings or ancestor siblings; no root boundary/cycle guard.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1331-L1379)

## grStadium_801D32D0

Get camera, selected player and eligibility; dereference xDC before testing its userdata wrapper, so missing xDC is not a safe false case. Project ftLib_80086B90 output with WorldToScreen, subtract62/40, apply ordered viewport X/Y guards for124x80 rectangle. Store origin as ((int)value>>1)*2 in u16 even when clamped; returnfalse if clamped, true if unchanged. Narrow viewport is not repaired by repeated clamping. Guarded missing camera/player/wrapper yieldsfalse; no safe top-level gobj check.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1381-L1434)

## grStadium_801D3460

Assert text windows, clear dynamic; unchecked map2 selects static variant from terrain3/9/6/4/other via SIS resources9/10/11/12/8 between common6 and7, staticID5. Publish 0x100 glyph scratch. JP name scale.3125/.625 else.26/.625, colorC0C0FFFF,alignment1. Scan slots0..3 only, retain nonnull names for non-NA slots; place1 at124/70,2 at62/186 y70,3 at62/186 y60 plus124/80,4 grid62/186 y60/80. Toggle fitting on then off; set scale.625/.625. If time_limit0 OR timer disabled, emit literal00:00 00; else format gm16AEEC/60,%60 and gm16AF0C. Exact query internals delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1441-L1546)

## grStadium_801D384C

Read integer gm_801694A0(text_gobj), assert windows, clear dynamic, staticID13,kerning0,scale1.5,colorC0C0FFFF. JP assigns alignment1 and prints%d at125,52; other language prints%3d at-3,52 without assigning alignment. Remaining-enemy semantics require gm owner; inherited alignment carries in non-JP branch.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1550-L1590)

## grStadium_801D39A0

Only mode1 acts. If gm_8016B184() or xF8_2 true call384C, else3460. No direct writes; single-player meaning and counter meaning need gm owner.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1592-L1602)

## grStadium_801D3A0C

Assert text windows, clear dynamic, staticID3,kerning1,colorC0C0FFFF,alignment1. If F0 Human, scale.625/1.5 and print full-width Player EE+1 Defeated at125,56; otherwise scale.42/1.2 and Computer Player Defeated. Any non-Human uses latter branch; no slot validation.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1606-L1641)

## grStadium_801D3B4C

Only on Gr_Kind_PStadium: unchecked display lookup; store arg0 in EE and slot_type in F0, request mode9 with duration0. Formatter proves defeat-message use; final-stock caller event not reviewed. Setter can remap mode.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1643-L1655)

## grStadium_801D3BBC

Count eligible slots0..5: non-NA,!Player_8003219C,nonnull entity,gm_8016C6C0(entity)==0. Assert windows,clear dynamic; count1..4 staticIDs14..17 else3 andreturn. JP scale1/1,else.8/1 with kerning; alignment1,fitting1 remains set. Packed presets yield initialY80,64,48,32 by count. Rescan same predicate, obtain gm palette, brighten each RGB1.25 clamp255,alphaFF; render nonnull name at125,Y+offset and advance offset32 even for null name. Standing/leader and team-color query semantics delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1678-L1783)

## grStadium_801D3F40

Assert text windows,clear dynamic; modes10,11,12,13 select staticIDs18,19,20,21 respectively; all other values select3. No state or timer write.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1792-L1819)

## grStadium_801D4040

If Stadium, request2528(display,11,0); otherwise no-op. No display null guard. Match-start caller meaning unreviewed; downstream remap applies.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1821-L1826)

## grStadium_801D4084

If Stadium, request2528(display,10,0); otherwise no-op. No display null guard. External HUD phase meaning unreviewed.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1828-L1833)

## grStadium_801D40C8

If Stadium, request2528(display,12,0); otherwise no-op. No display null guard. HUD suppression caller meaning unreviewed.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1835-L1840)

## grStadium_801D410C

If Stadium, request2528(display,13,0); otherwise no-op. No display null guard. External setup/Training caller meanings unreviewed.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1842-L1847)

## grStadium_801D4150

If Stadium, request2528(display,1,0); otherwise no-op. No display null guard. HUD restoration caller meaning unreviewed; downstream remap applies.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1849-L1854)

## grStadium_801D4194

Assert static/dynamic text windows; clear dynamic and select staticID3. No local mode/timer write; used by mode0.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1856-L1867)

## fn_801D4220

Ignore request,args,buf; assert cancelflagfalse, map2nonnull and payloadnonnull. Clear controller b1; does not inspect loaded bytes or validate archive.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1870-L1881)

## grStadium_801D42B8

Assert map2 and Ground. If b1 pending returnfalse. Otherwise call grDatFiles_801C6478(xCC,xC8), store resultxD0 and returntrue even if resultNULL. Repeated calls repeat registration; no success or reentry guard.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1887-L1902)

## grStadium_801D4354

Return gobj->user_data as Ground pointer without guards, mutation or ownership transfer.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1907-L1910)

## grStadium_801D435C

If cached xD4==0 sum nine path scalars. Five iterations sample Randf*cached total, subtract while value>weight and index<8, interpolate vec[index] to vec[index+1] by value/weight, scale by Ground scale, call grLib_801C96F8(7548,1E,pos). Scalar weights are not all segment lengths; final record has0 and no successor. Safety depends on RNG/cache consistency, no explicit index8/zero-divisor protection. Five attempts do not prove five successful generators.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L1961-L2005)

## grStadium_801D4548

gm_8018841C guard returns; Stage_80225194()==0xF0 activates optional display subject then returns. States0..6: old D8--<0 chooses transformed3/4/6/9 after neutral5 (rejects E2) or neutral5 otherwise, shifts history; transformed maps Fire/Grass/Water/Rock files0/1/2/3, frees old archive, sets b1, submits async read then waitsstate1. Ready42B8 advances2 even for null archive. State2 writes display.xD8=NULL through union, clearing controller D8, requests mapped display mode then3. State3 oldD8++>x10 signals old object b1, resets timer, emits two Ground calls then4. State4 shrinkY by scale*.95/x14; threshold .05*scale but terminal write literal.05. After oldD8++>x18 animate old, create replacement unchecked, scale.05*scale, translate literal-10, setstate5 and enable lines55/6F; emit effect attempts and quake. State5 increments timer, grows replacement to scale, raises it over first half and lowers old over second; after x14 restore replacement scale/Y0, destroy old, promote/clear handles,state6. Effects/quake continue. State6 sets new b0,rebuilds collision, chooses dwell from x0/x4 ifneutral elsex8/xC; neutral frees buffer and disables55/6F; state0. Shared type overlay confirms D8 reset; divisors/factory/handles unchecked. History guard does not establish no-repeat transformed forms.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L2007-L2235)

## grStadium_801D4FF8

Returntrue only for Stadium,nonnull display,nonnull Ground,mode8 and EE==input slot. Otherwise false. Read-only; does not validate actual player existence.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L2240-L2254)

## fn_801D5074

Call display synchronization1EF8 then grDisplay_801C5DB0(gobj,arg1), in order. Generic renderer guards unreviewed.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L2256-L2260)

## grStadium_OnTouchLine

Ignore enum argument and returnNULL DynamicsDesc for every query; no side effects.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L2262-L2265)

## grStadium_OnCheckShadowRender

Call lb_8000B1CC(jobj,NULL,&point), return arg0.y+1>point.y. Equality returnsfalse; input pointers unguarded. Shadow callback slot established, exact transform helper internals external.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L2267-L2276)

## grStadium_801D511C

Query GX texture sizes250x160,640x406,124x80 format4 unmipmapped; round each32 and call lbDvd_80017740 for7D2/7D3/7D4 with fixed0,4,4,...,0,7,10,0 arguments. Register7D5 size50000. Four unconditional requests, no result or local state; cache reuse, scheduling and failure internals delegated.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L2278-L2292)

## file

Pokémon Stadium owns a ten-row Ground callback table, terrain controller states0..6 and display modes0..17. Local setup installs init/proc/callback3 and omits callback1 and flags; shared Ground consumers use b2 for camera, b1 for fog and b0 for lights. Terrain alternates neutral5 with Fire3,Grass4,Water9,Rock6 via async DAT files; readiness poll accepts null archive result. Display combines text250x160, large640x406 and small124x80 captures, masks and optional camera subject. Countdown checks use old timer values; weighted selection can loop forever and downstream remap can repeat effective modes. Missing image lookup leaves caller material uninitialized; capture objects are dereferenced before null checks. Shared union aliases display.xD8 to controller timer D8. Physical section layout and external collision, game-query, allocation and renderer internals are not established.

[Canonical evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grpstadium.c#L41-L159)

## Helpers and logical data

[
  {
    "symbol": "randi",
    "canonical_ranges": [
      [
        293,
        300
      ]
    ],
    "behavior": "Zero bound returns0; otherwise HSD_Randi without bound validation."
  },
  {
    "symbol": "mul_vec",
    "canonical_ranges": [
      [
        626,
        631
      ]
    ],
    "behavior": "Multiply all three vector components in place by scalar."
  },
  {
    "symbol": "ImageDescWrapper",
    "canonical_ranges": [
      [
        649,
        653
      ]
    ],
    "behavior": "Image descriptor, one-bit latch and two u16 crop coordinates; constructors initialize only selected fields."
  },
  {
    "symbol": "TextWrapper",
    "canonical_ranges": [
      [
        917,
        921
      ]
    ],
    "behavior": "Image descriptor followed by two text-window pointers."
  },
  {
    "symbol": "randi_between helpers",
    "canonical_ranges": [
      [
        924,
        943
      ]
    ],
    "behavior": "Choose lower bound plus randi(abs difference); equal bounds return that bound; upper-bound inclusion depends on delegated Randi."
  },
  {
    "symbol": "jobj_next/parent/child",
    "canonical_ranges": [
      [
        1307,
        1329
      ]
    ],
    "behavior": "Nullable links used by search; parent-next can escape original subtree."
  },
  {
    "symbol": "grStadium_ScaleColor",
    "canonical_ranges": [
      [
        1669,
        1676
      ]
    ],
    "behavior": "Multiply byte1.25, upper clamp255, convert to byte."
  },
  {
    "symbol": "yakumono_param",
    "ranges": [
      [
        41,
        65
      ]
    ],
    "role": "Cached timing,weight,RGB struct pointer."
  },
  {
    "symbol": "grPs_803E1208",
    "ranges": [
      [
        67,
        70
      ]
    ],
    "role": "Six GrJoint records."
  },
  {
    "symbol": "grPs_StageCallbacks",
    "ranges": [
      [
        72,
        143
      ]
    ],
    "role": "Ten rows;0 empty,1display,2controller,3Fire,4Grass,5neutral,6Rock,7/8subobjects,9Water."
  },
  {
    "symbol": "grPs_StageData",
    "ranges": [
      [
        145,
        159
      ]
    ],
    "role": "Stadium descriptor /GrPs, flag1, six joint records."
  },
  {
    "symbol": "zero vector",
    "ranges": [
      [
        415,
        415
      ]
    ],
    "role": "Origin effect argument."
  },
  {
    "symbol": "grPs_803E14FC",
    "ranges": [
      [
        1159,
        1176
      ]
    ],
    "role": "250x160 camera descriptor; orthographic setter overrides projection setup."
  },
  {
    "symbol": "grPs_804DAF3C/grPs_8049F040",
    "ranges": [
      [
        1436,
        1439
      ]
    ],
    "role": "White color and256-byte I4 glyph scratch."
  },
  {
    "symbol": "grPs_803B7F8C",
    "ranges": [
      [
        1785,
        1790
      ]
    ],
    "role": "Four packed byte records yield vertical offsets80,64,48,32 on target big-endian; not alpha despite type name."
  },
  {
    "symbol": "datfiles",
    "ranges": [
      [
        1912,
        1917
      ]
    ],
    "role": "GrPs1.dat..4 selected Fire,Grass,Water,Rock."
  },
  {
    "symbol": "lbl_803E1630",
    "ranges": [
      [
        1919,
        1959
      ]
    ],
    "role": "Nine VecScalar records closed path; weights100,28.28,53.85,5,100,28.28,60,28.28,0, not all Euclidean distances."
  }
]

## Header

Header1–93 declarations reviewed;4040/4084/40C8/410C/4150 retain UNK_RET/UNK_PARAMS declarations despite concrete void(void) definitions. Shared enum names only Display=1.

## Limits

Callback1 is stored in the table but omitted by the local setup body; wrong scheduled-process claims require correction. Shared Ground xCC is typed HSD_MObj* but used as DAT buffer; shared union D8 write is controller timer reset. Owner should review type names. Factory Ground_SetupStageCallbacks name collides with actual shared inline; generic stageGObj aliases need TU scoping. No name writes proposed. Camera, archive, collision, particle, game query and text internals require owner evidence. No gameplay outcome inferred solely from rendered alias. Source hazards: uninitialized material on lookup failure, pre-check capture dereference, unchecked constructors, null archive acceptance, unbounded display sampling and unchecked timing divisors. No source fixes authorized. No source, shared knowledge, compilation, matching, publishing or UI changes.

## Lead corrections

Ground_GetStageGObj constructs a Ground object. Shared flag consumers are established in ground.c lines 817–937, 1084–1106 and 2661–2677. Fire initialization reads the existing map_id. Three inherited mapping claims and five link explanations remain unresolved; local completion flags do not establish successful loading, archive conversion or a final-stock caller trigger.
