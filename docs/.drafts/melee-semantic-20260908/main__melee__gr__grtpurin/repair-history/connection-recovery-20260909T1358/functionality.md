# Grtpurin Functionality

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Both owned files fully read in canonical and rendered form.

## grTPurin_80223160

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L45-L48

## grTPurin_80223164

Caches Ground_GetYakumonoParam(), clears stage_info.unk8C.b4 and sets b5. Calls grTPurin_8022320C with 0,1,2, ignoring results, then Ground_801C39C0, Ground_801C3BB4, Ground_801C4210 and Ground_801C42AC in order. Foreign effects delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L50-L63

## grTpurin_UnkStage0_OnLoad

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L65-L68

## grTpurin_UnkStage0_OnStart

Calls grZakoGenerator_801CAE04(NULL) once; shared generator effects delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L70-L73

## grTPurin_80223204

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L75-L78

## grTPurin_8022320C

Forms &grTPr_StageCallbacks[id] before Ground_GetStageGObj(id). On non-null passes result and row to Ground_SetupStageCallbacks; otherwise reports ID. Returns result. No local index bounds guard; table has four rows, three populated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L80-L94

## grTPurin_802232F4

Obtains Ground user data and calls grAnime_801C8138(gobj,gp->map_id,0). No pointer guards; animation internals delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L96-L100

## grTPurin_80223320

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L102-L105

## grTPurin_80223328

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L107-L110

## grTPurin_8022332C

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L112-L115

## grTPurin_80223330

Calls Ground_JObjInline1(gobj) once. Inline effects delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L117-L120

## grTPurin_80223380

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L122-L125

## grTPurin_80223388

Iterates s16 values 0x37,0x39,0x3B,0x3D,0x3F,0x41,0x43 until -1. For each, calls Ground_801C32D4(2,value); result -1 skips the entry. Otherwise gets jobj via Ground_801C3FA4(gobj,value). Non-null jobj triggers lb_8000B1CC(jobj,NULL,&vec); only vec.x<130.0f calls mpJointListAdd(res). Missing jobj, equality, larger x or unordered NaN comparison calls mpLib_80057BC0(res). After all entries calls lb_800115F4 then Ground_801C2FE0. Exact mapping, transform-space and add/remove collision effects require foreign evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L127-L152

## grTPurin_80223478

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L154-L157

## grTPurin_8022347C

Calls Ground_JObjInline1(gobj) once. Inline effects delegated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L159-L162

## grTPurin_802234CC

Returns false without reading inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L164-L167

## grTPurin_802234D4

Calls Ground_801C2FE0(gobj) once and ignores its result.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L169-L172

## grTPurin_802234F4

Empty body; ignores inputs and performs no calls, writes or returned-value computation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L174-L177

## grTPurin_802234F8

Returns null for arg0==-1 or mpJointFromLine(arg0)==-1. For every other mapped joint calls mpLineGetKind(arg0) but discards its result. Joint0 and joint1 both return yakumono_param->x0, irrespective of line kind; all other joints return null. Cached pointer is not guarded and returned descriptor may be null.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L179-L196

## grTPurin_80223578

Returns true without reading any of its three inputs or mutating state.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L198-L201

## .data

Source declares StageCallbacks[4], three populated rows plus a zero row, and StageData with Gr_Kind_TPurin, /GrTPr.dat, callbacks and flag bit0. Row2 has bits30/31; rows0/1 have zero flags. Field semantics and exact compiler-section membership require independent evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L15-L37

## file

Registers Gr_Kind_TPurin and /GrTPr.dat, directly configures IDs0,1,2 and calls four Ground routines and defines three populated callback rows. Setup retrieves a GObj and delegates callback installation; lifecycle and row functions are local stubs or shared-helper calls. Character identity, mode usage, callback-field meanings and delegated engine effects require family evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L15-L201

## .sbss

Static yakumono_param points to a structure with one DynamicsDesc pointer x0. Initialization caches Ground_GetYakumonoParam. Exact .sbss membership requires object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L39-L62

## .rodata

Source defines a local s16[8] initializer with seven odd IDs 0x37 through0x43 and final0xFFFF sentinel. Exact emitted .rodata placement requires object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L127-L149

## .sdata2

Source compares vec.x strictly below130.0f. Exact literal pooling and .sdata2 placement require object evidence.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtpurin.c#L137-L147
