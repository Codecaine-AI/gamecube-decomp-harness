# Particle semantic review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. All four owned files fully read in canonical and separate rendered views: C1–3096,H1–48,static header1–14,dox1–3. Total3161 manifest lines. C renderer has10 parser errors; canonical interpreter was fully reviewed. All pages exhausted. Counts: {'owned_files': 4, 'owned_lines': 3161, 'targets': 21, 'function_targets': 14, 'writable_subjects': 105, 'parameter_entities': 83, 'file_entities': 1, 'existing_facts': 108, 'source_functions': 16, 'source_only_functions': 2, 'proposals': 19, 'dispositions': {'unresolved': 28, 'retain': 61, 'supersede': 19}}.

## Function behavior

### `hsd_803983A4`

`void hsd_803983A4(HSD_Generator* gen)`

No-op for null gen, kind bit0x800, absent type0x100 or null jobj. Prepares the joint matrix. Independent type0x200 copies translation to gen.pos; type0x800 copies translation to appsrt.translate and type0x1000 extracts scale, both only for nonnull appsrt with gp==gen. Does not copy rotation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L74-L115

### `psInitDataBankLoad`

`void psInitDataBankLoad(int bank, const int* cmdBank, const int* texBank, const u32* ref, const int* formBank)`

No index bounds check. Form/texture count mismatch panics before writes. Publishes ref, texture count through an s32 view of psFormGroupArray, texture table, and optional form table through psNumCmdList. Version0 gives count cmdBank[1], table cmdBank+2; versions0x40..0x43 give count cmdBank[2]+cmdBank[1], table cmdBank+3-cmdBank[1]. Unknown version panics after the first four registry writes. Reads borrowed already-relocated resources without relocating them.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L117-L157

### `psInitDataBankLocate`

`void psInitDataBankLocate(HSD_Archive* cmdBank, HSD_Archive* texBank, int* formBank)`

Mutates serialized banks in place with32-bit base additions. Version0 adds cmdBank to every counted command entry including zero; versions0x40..0x43 rebase nonzero relocation entries using header.nb_reloc and derive the versioned command range. Other versions jump to common traversal with uninitialized base,num,num2. Nonnull command kind becomes (kind&0xF1FFFFFF)|0x08000000. Nonzero texture-group roots and texture entries are rebased; formats8/9/10 also rebase one palette if palflag&1, palnum palettes if nonzero, otherwise num additional palettes. Optional form roots/entries use texture-group count, not an independent verified form count. No size, bounds, repeated-relocation or pointer-validity guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L159-L324

### `psInitDataBank`

`void psInitDataBank(int bank, int* cmdBank, int* texBank, u32* ref, int* formBank)`

For bank<65 calls Locate then Load; negative bank passes, bank>=65 does nothing. Unknown command versions can reach uninitialized traversal in Locate before Load's panic. Resources are mutated before form count validation in Load. Intended bank domain0..64 and valid serialized storage are caller obligations; relocation is not idempotent.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L326-L334

### `hsd_80398A08`

`void hsd_80398A08(u32 unused)`

Initializes allocator for sizeof(HSD_Particle),4-byte alignment; ignores u32 input. Clears16 list heads, all six65-entry registry arrays, live/peak particle counters, callback table pointer and eight JObj slots. HSD_ObjAllocInit zeroes/relinks allocator metadata, but neither it nor this routine frees existing particles or unreferences cached joints, so reinitialization is not teardown. Other exported counters/camera are not reset here.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L336-L373

### `psGenerateParticle0`

`HSD_Particle* psGenerateParticle0(HSD_Particle** head, int linkNo, int bank, u32 kind, u16 texGroup, u8* list, int life, int palflag, f32 x, f32 y, f32 z, f32 vx, f32 vy, f32 vz, f32 size, f32 grav, f32 fric, HSD_Generator* gp, int flgInterpret)`

Allocates and zeroes one particle; failure returnsNULL before publication/accounting. Success increments u16 live/peak counters, chooses parent ID or new ID, attaches optional AppSRT, prepends to custom head or unchecked global linkNo, and stores inputs with byte/u16 narrowing. life=(u16)(life+1); texGroup and bank narrow to bytes. Sets opaque-white primary, zero environment, palNumFF, alpha mode33/1/FF, material/ambientFF, trail1 and other counters/rotation0. Stores parent and increments numChild, calls optional hookCreate ignoring its result, then resets callback=NULL (overwriting a hook assignment). If flgInterpret, calls updater with prevNULL, ignores its successor and returns original pp even if initial update freed it. Custom-head use with immediate deletion still uses global unlink path; caller must avoid that mismatch.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L375-L499

### `hsd_80398F0C`

`void hsd_80398F0C(s32 linkNo, s32 bank, s32 kind, u16 texGroup, s32 cmdList, s32 life, s32 zero, s32 gen, f32 pos_x, f32 pos_y, f32 pos_z, f32 vel_x, f32 vel_y, f32 vel_z, f32 fric, f32 rate, f32 angle3)`

Void wrapper calls psGenerateParticle0 with headNULL and flgInterpret1, casts s32 command/gen values to pointers, and discards the nullable/possibly retired result. Last three float parameters named fric,rate,angle3 map respectively to factory size,grav,fric. Generator caller supplies ordinary position/velocity in some branches, but tornado supplies angular/radial state in velocity and grav/fric slots. An allocated instance can expire during immediate interpretation; success does not guarantee a live returned particle.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L505-L513

### `hsd_80398F8C`

`void hsd_80398F8C(HSD_Particle* pp, f32 angle)`

Reads velocity, builds two orientation angles with signed pi/2 fallback when denominator absolute value is below minimum-normal f32, approximates sqrt of positive squared speed using reciprocal-sqrt and three refinements, chooses azimuth2pi*HSD_Randf, reconstructs a vector at supplied radian cone angle, and writes velocity. For ordinary finite well-scaled values this approximately preserves speed/angular offset; rounding, underflow/overflow and nonfinite inputs preclude an exact guarantee. Finite angle with zero velocity yields zero.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L518-L597

### `hsd_803991D8`

`s32 hsd_803991D8(HSD_Generator* gen, HSD_JObj* jobj, f32 force, f32 range)`

Null jobj or negative range returns0. Prepares joint, forms target translation minus gen.fric/size/radius, returns1 when squared distance<=range squared, otherwise zero-distance guard returns0, else adds force/dist_sq times displacement into gen.pos.z/vel.x/vel.y and returns0. In opcodeB8 the HSD_Particle cast maps those offsets to particle pos[xyz] and vel[xyz]; positive force points toward the target. Proximity makes life1 and exits commands to immediate deletion. No gen-null, finite-value or cached-index bounds guard.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L599-L629

### `psReadFloat`

`static inline void psReadFloat(u8** stream)`

Copies four successive bytes into shared u32 workspace hsd_804D78D0 through a float-byte union view and advances stream by4. Interpreter reinterprets workspace as f32. No bounds/endian conversion or reentrancy protection; assumes target representation and valid stream.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L631-L639

### `psSpawnChild`

`static inline HSD_Particle* psSpawnChild(HSD_Particle** head, int linkNo, int bank, int idx)`

Rejects linkNo>=8,bank>=65,idx>=command count or null command entry; negative indices and null tables are unchecked. Reads texture group palflag or0 for null group, then creates a zero-position particle with command defaults, parentNULL and interpretation0 through the supplied head. Texture-group index bounds are unchecked.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L641-L672

### `hsd_8039930C`

`void* hsd_8039930C(HSD_Particle* pp, HSD_Particle* prev)`

kind0x800 returns successor before all work. Advances size/rotation interpolation and appearance countdowns, then if nonzero cmdWait decrements it and decodes only on reaching0. Variable-length commands mutate appearance/motion/state, spawn children, call hooks and maintain u16 cursor/loop marks; execution continues until nonzero wait or termination, with no stream bound or instruction budget. life is u16 and predecrement0 deletes; initial life0 wraps. Deletion calls hook, unlinks using global head when prevNULL, decrements parent/live counts, detaches AppSRT and JObj, frees and returns successor. AppSRT finalizer can change global head, so normal head deletion rechecks it. Surviving ordinary physics applies gravity then friction then position; tornado uses generator angle/radius/aux state without null guard. Attachment adds world-position differences to local translation fields, not a verified general world transform. Callback-1 goes directly to delete_particle without another life decrement. Exact opcode exceptions are recorded in the opcode ledger: sequential position overwrite inB2, E9 alpha timing0 division, EC null-gen dereference, EA/EB zero-duration alpha omission, unchecked callback/remap/JObj indices and recursive spawning.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L674-L2963

### `hsd_8039CEAC`

`void hsd_8039CEAC(u32 mask)`

Traverses16 global lists unless mask bit16+i is set, calling updater(cur,prev). Compares returned successor against current head/prev.next to infer survival, advancing prev only when cur remains linked. Handles ordinary head/interior/consecutive current-node deletions under stable-list/callback invariants; arbitrary callback mutation, recursive spawn or invalid pointers are not universally safe. Low16 mask bits are ignored.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L2965-L2994

### `hsd_8039CF4C`

`void hsd_8039CF4C(s32 index, HSD_JObj* jobj)`

Index<0 or>8 no-op. Index1..8 selects slot index-1; identical pointer no-op. If replacing a nonnull old slot, calls HSD_JObjUnref on incoming jobj, not old; then stores incoming pointer and ref_INC(incoming), which ignoresNULL. Incoming object can be freed before that increment, and old reference is not released. Index0 scans all eight slots, unreferences and clears every match. Does not establish balanced reference transfer for replacement.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L2996-L3023

### `hsd_8039D048`

`void hsd_8039D048(void* particle)`

Requires particle pointer, reads kind. If bit0x8000 set, uses bits12..14 to select one of8 cached joints, unreferences a nonnull pointer and clears the slot. Particle flags remain unchanged. This is slot cleanup, not unique particle ownership validation.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L3025-L3035

### `hsd_8039D0A0`

`void hsd_8039D0A0(HSD_Generator* gen)`

Requires generator and selected valid list. Casts the address of eight-joint array to ParticleData overlay (8joint pointers,146particle pointers,0x410pad,allocator), relying on32-bit linked global adjacency beyond the authored array. Walks selected link list, caches next before callbacks, and removes only matching idnum and nonnull equal gen pointer. Calls hookDelete, unlinks, decrements child count, detaches AppSRT, clears flagged joint slot, frees through overlay allocator and decrements live count. Preserves predecessor for ordinary consecutive matches. Unlike normal deletion, does not refresh cached next after AppSRT finalizer; arbitrary callback/finalizer list changes are not proven safe. No generator reclamation is performed here.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L3037-L3095

## Header and state review

The public header exports current particle functions and globals. H17–19 declares psInitDataBankRelocate with six pointers but no owned body; the authored C326–334 function is psInitDataBank with five parameters. The static header declares the shared float-bit workspace and callback-function table. Its .data comment does not prove linked section attribution. particle.dox documents hsd_80393A04 as a USB-server predicate belonging to foreign hsd_3933; no particle-owned body is inferred.

C5–20 PerfDispItem is an unused node/payload type; C61–65 PSNode is unused; ParticleFloatBytes supplies byte-wise float assembly. Persistent state comprises16 particle heads,8JObj slots,six65-entry registries,allocator state,u16 counters,camera and integer callback/list placeholders. Source address comments are not pinned object mapping. All7 raw data targets remain individually accounted for, with28 baseline section facts unresolved.

Foreign psstructs.h establishes152-byte HSD_Particle, byte bank/texGroup/link, u16 lifetime/timers/cursors, float velocity/position, callbacks, and HSD_Generator layout. Generator fric/size/radius offsets40/44/48 overlap particle pos; generator pos.z/vel.x/vel.y offsets2C/30/34 overlap particle velocity. The inferred particle-force signature is supported as a hypothesis. Old hsd_80398C04 parameter identities are preserved and mapped to current psGenerateParticle0 declarations without merging subjects or claiming physical ABI registers, especially across float arguments.

The proposed psGenerateParticle name for hsd_80398F0C collides with a distinct foreign declaration in psstructs.h323–327 (different return and parameter ordering). Retained only as an existing naming hypothesis, not a verified original name or safe source rename. Other four name candidates remain semantic hypotheses.

## Review decisions

Every108 baseline facts and 105 subjects reviewed: {'unresolved': 28, 'retain': 61, 'supersede': 19}. All target/function/empty-parameter entries are included. Original values, IDs and timestamps retained in dispositions; no new name or subject merge. Exact links: {'expected': 26, 'reviewed': 26, 'retain': 16, 'reject': 0, 'unresolved': 10}.

Foreign reads establish effect startup/process callbacks, DAT preload/registration paths, stage banks40 and1E, particle/generator structure overlays, random range, allocator reset and AppSRT lifetime. Foreign source is canonical-only supporting context, not an ownership completion claim.

Dry-run only. No source/shared KB edits, matching, Git, UI or publication.

## Interpreter opcode ledger

### `00–7F`

Low5 bits supply wait; bit20 appends next byte to13-bit value. Class40 also reads pose byte and conditionally sets DispTexture from bank/group/pose lookup; null entry does not clear a previously set flag. No table bounds guard. Nonzero wait yields; zero continues. High op classification groups80/88/90/98 in8-wide classes, C0/D0 in16-wide classes, others exact.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L768-L829

### `80/88/90/98,A0,A1,A2,A3`

Low3 mask selects float XYZ assignments/additions to position/velocity. A0 reads7/15-bit size duration and float target, immediate on0. A1 clears texture. A2 sets gravity and bit0 according to nonzero. A3 sets friction and bit1 according to value!=1.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L830-L977

### `A4,F1,A5,EF,F0`

A4 readsBE16 command ID and spawns child after current with ID/gen/AppSRT/position inheritance, incrementing parent child count and recursively updating child with prev=current. F1 first uses optional unchecked remap. A5 spawns generator, inherits ID/JObj(ref)/type bits and AppSRT; placement branches on parent/child SRT existence and equality. EF additionally replaces kind bits25..27 from flags&7; F0 adds unchecked remap. Creation/allocation failure skips child inheritance. No recursion budget.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L979-L1266

### `A6,A7,A8,A9,AA,AB,AC,AD`

A6 sets u16 life fromBE16 base+truncated BE16 range*random. A7 kills if byte threshold>=truncated100*random, so threshold0 can kill. A8 adds independent symmetric XYZ random offsets. A9 changes cone angle via98F8C. AA randomizes then optionally remaps child ID, inherits ID/gen/SRT/position and recursively steps child. AB scales whole velocity. AC sets timed size target=base+range*random. AD sets PrimEnv.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L1268-L1439

### `AE,AF,B0,B1,B2`

AE clears both mirrors; AF setsS/clearsT; B0 setsT/clearsS; B1 setsboth. B2 requires SRT and xA2==0, refreshes generator, builds matrix from scale and first3 quaternion fields cast as Euler Vec3, assigns pos.x then uses newx for pos.y then newx/newy for pos.z, and detaches. This sequential update is not general alias-safe matrix-vector multiplication; velocity and size remain unchanged.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L1441-L1500

### `B3,B4,B5,B6,B7,B8`

B3 materializes existing alpha-compare interpolation using16.16 fraction, reads7/15-bit duration, mode and targets, immediate both on0 or sets remain. B4/B5 set/clear TexInterpNear. B6 adds float to rotateTarget and sets duration, immediate on0. B7 aims velocity at indexed JObj using approximate current speed/distance, no index guard, null/coincident target skips. B8 reads JObj byte+offset and two floats; force helper proximity sets life1 and exits to deletion.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L1502-L1657

### `B9,F2`

Spawn child after current, inherit position AND velocity,ID,gen,AppSRT and recursively update; F2 optionally remaps ID before guards. Upper link/bank/count checks and null command checks only. Texture group and remap lengths unvalidated.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L1659-L1783

### `BA,BB`

Materializes existing primary/environment color using remain/count16.16, then independently adds 2*signed_delta*random to each existing target channel with0..255 clamping. This is one-sided in delta sign, not symmetric +/-delta jitter. Signed negative delta left shift is not portable ISO-C behavior. Copies target immediately if count0, else resets remain to existing count.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L1785-L1959

### `BC,BD,BE,BF`

BC sets byte pose from base+truncated random range then conditionally sets texture bit via unchecked lookup. BD normalizes to base+range*random only if approximate speed>1e-10, no change for tiny speed. BE multiplies XYZ by separate floats. BF ORs masked JObj index bits and attachment bit without clearing prior index bits; repeated BF combines indices.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L1961-L2064

### `C0–CF,D0–DF`

Materializes current primary/environment16.16 interpolation, reads7/15-bit duration, starts target from current color and overwrites channels selected by opcode low4 mask; copies immediately and remain0 on duration0, else remain=count.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L2066-L2188

### `E0`

Materializes both colors, draws independent random per RGBA channel, and applies each signed delta*2*random to BOTH corresponding targets with clamping. Resets both remain counts and copies any zero-duration target.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L2190-L2339

### `E9`

Materializes both colors, reads flags,timing. RGB shares one random scale, quantized floor((timing+1)*r)/timing for timing>0 or plain random for0. Flags low4 select channels,10 selects primary,20 environment. Alpha draws a separate quantized random and divides by timing unconditionally; timing0 yields invalid0/0 for the known random domain. Targets clamp finite results; NaN comparison does not sanitize. Resets remains and syncs zero-count colors.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L2341-L2534

### `E1,EC,E2,E3,E4,E5,E6,E7,E8`

E1 index0 clears callback, else unchecked psCallback[index-1]. EC reads byte index/float; dereferences gen without null guard, dispatches userfunc setUserData if present else writes userdata[index] when nonnull, no length bound. E2 sets TexEdge only (comment kill does not execute deletion). E3 sets palette byte. E4/E5 select clear/set/toggle/50% random for texture flipS/T. E6/E7 set/clear DirVec. E8 negative disables Trail else enables and stores scale.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L2536-L2652

### `EA,EB,ED`

EA/EB materialize existing material/ambient RGB+A interpolation, read7/15-bit duration and flags. RGB target defaults current; alpha target only overwritten when flag8. Duration0 copies RGB only, leaving alpha current unchanged even if new target differs. Nonzero remain eventually copies both at expiry. ED reads base/range float,timing and adds randomized offset to both rotate and rotateTarget; timing0 uses unquantized random and is guarded.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L2654-L2781

### `FA,FB,FC,FD,FE,FF,default`

FA sets byte loopCount and u16 loop cursor. FB predecrements and jumps while nonzero; zero wraps to255. FC stores u16 mark; FD jumps to it without guard or nesting stack. FE/FF set life1 and exit. Unrecognized high opcode silently continues. Saves u16 cursor and wait operand at yield/exit; stream length and eventual yielding are caller invariants.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L2783-L2826

### `post-command state`

u16 predecrement life can wrap0; zero expiration deletes before physics. Simple gravity/friction/position or generator-backed tornado then optional joint updates then callback. Callback-1 enters delete body directly. Joint setters add world differences into local translate, which is not a general world-position guarantee under transformed parents. Cleanup calls arbitrary hooks/AppSRT finalizer and normal head path may refresh successor; no general reentrancy guarantee.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/sysdolphin/baselib/particle.c#L2828-L2963


Validation: valid19 dry-run proposals,0 rejected,0 skipped. Proposal SHA256 `18f155a882d378e63bc82c0fc5ca38ce1bf3a49d07215281332dc0dc26c92fbe`. Receipt inspected at 2026-09-08T15:52:39.083789+00:00.
