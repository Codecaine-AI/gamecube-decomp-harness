import json,pathlib,re,hashlib,datetime
out=pathlib.Path(__file__).parent;camp=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');m=json.load(open(camp/'manifest.json'));root=pathlib.Path(m['checkout_root']);rev=m['head_revision'];tu='main/sysdolphin/baselib/axdriver';src='src/sysdolphin/baselib/axdriver.c';hdr='src/sysdolphin/baselib/axdriver.h';static='src/sysdolphin/baselib/axdriver.static.h';unit=camp/'units/main__sysdolphin__baselib__axdriver';rows=json.load(open(out/'facts.json'));support=json.load(open(out/'supporting-reads.json'));ls=(root/src).read_text().splitlines()
def ev(p,a,b,why):return {'kind':'code','locator':f'code://{rev}/{p}#L{a}-L{b}','why':why}
def name(r):return next(iter(r['subject'].values())).split(':')[-1].split('#')[0]
ranges={0:(29,153),1:(14,153),2:(1023,1083),3:(803,913),4:(1276,1321),5:(155,272),44:(1,1321)}
for i,r in enumerate(rows[:44]):
 if i<6:continue
 n=name(r);a=next(j+1 for j,l in enumerate(ls) if re.search(r'^(?:static )?(?:void\*?|bool|int|u32|s32) '+re.escape(n)+r'\(',l));b=next(j+1 for j in range(a,len(ls)) if ls[j]=='}');ranges[i]=(a,b)
changes={}
def setv(i,t,v):changes[i,t]=v
def old(i,t):return next(f['value'] for f in rows[i]['facts'] if f['type']==t)
def add(i,t,v):setv(i,t,old(i,t)+' '+v)
setv(0,'data_flow','Initialization clears only SMSTATE_MASK on all 96 records and inserts them into the free list; it does not zero whole records. Sound startup reserves a record and initializes selected fields and routing defaults. Commit associates a successful Synth node with the 64-slot lookup. Channel send operations always save the default but live per-record changes depend on independent low-bit API permission gates. Aux setup copies parameters into driver-owned effect contexts and registers them.')
setv(2,'data_flow','Two fixed integer dimension arrays feed the high and standard reverb cases of HSD_AudioGetAuxHeapSize. They contribute delay-line allocation sizes; these read-only constants are not allocation assertion strings.')
setv(2,'inferred_type','Existing split and source objects have a 48-byte .rodata containing s32 dims[8] = {0x6FD,0x7CF,0x91D,0x1B1,0x95,0x2F,0x49,0x43} and s32 dims[4] = {0x6FD,0x7CF,0x1B1,0x95}. They initialize the local arrays in the high/standard reverb heap-size branches. The axdriver.c and axfxallocsize assertion strings are in .data.')
setv(2,'purpose','Stores the fixed delay-line dimension arrays used to estimate high-quality and standard AXFX reverb work-memory sizes.')
add(3,'state_behavior','The empty active list, zero counters and pristine free list are cold-start assumptions. Initialization does not clear list heads, generation, clock, mapping or record counters; repeated invocation is not a safe reset and can relink records already present. The DVD completion callback leaves the flag unchanged for -1.')
add(4,'inferred_type','This describes the two application globals, not the whole section: existing split/source .sdata sizes are 24/20 bytes and include the diagnostic string "vID > 0" and padding.')
add(4,'state_behavior','The packed type records the request even after effect initialization failure, so it is not proof that an effect callback is active. Low bits are per-bus command/API permissions, independent of those type nibbles.')
setv(6,'state_behavior','Returns base plus the old byte cursor after adding size and asserting new_cursor < capacity. There is no alignment adjustment or reclamation. The cursor is u32; addition is not checked for wraparound, so this is not a complete arbitrary-size overflow check. Exact capacity is rejected, and zero-size requests still require the current cursor below capacity.')
for i in [9,10]:
 setv(i,'purpose','Requests '+('pause' if i==9 else 'resume')+' for the singleton path-selected stream whose Synth handle is stored in AXDriver_804D6038. False means the stored handle is exactly -1; true means a request was forwarded, not that the handle is live or that playback completed the transition.')
 if i==9:setv(i,'game_mapping','Controls pause of the singleton path-selected disc-audio stream. It does not pause every logical HSD_SM sound or validate Synth liveness.')
setv(11,'purpose','Replaces the requested AX auxiliary bus effect: unregisters its callback, shuts down the old recorded type, copies the new parameter block and attempts initialization, then installs the new callback only on success. Failure leaves no callback and does not restore the old effect.')
add(11,'state_behavior','The four array-element addresses are formed before the channel assertion. Direct callers must supply a valid channel and compatible parameter object; the public heap wrapper validates channel before entering. The function itself has no surrounding interrupt exclusion.')
setv(14,'purpose','Applies pending low-ten-bit operations to one HSD_SM: starts a Synth instance, propagates priority, volume, pan-position, pitch and routing controls, or puts the logical record to sleep or keys it off.')
setv(14,'state_behavior','Processes pending bits in ascending order and normally clears each. Successful start associates a Synth handle and increments the assigned-node count; failed start clears state and returns. Bit 0x10 does no Synth work. Bit 0x100 sets SLEEP and returns without clearing that pending bit; bit 0x200 calls the inline key-off helper, not an arbitrary callback, and returns. Early returns leave later bits unprocessed.')
add(16,'state_behavior','The zero-count indefinite-loop bit is set but not cleared by later nonzero loop-count commands. Branch subtraction is followed by the common cursor increment. Stream bounds, opcode validity, cycle limits and signed tick overflow are unchecked. A pending start that fails during the pre-delay commit does not itself stop interpretation of the current command.')
setv(17,'purpose','Reserves and initializes a logical HSD_SM for a bank-qualified sound, queues its command stream and returns an encoded handle. The routine checks upper bank/sample limits, track and channel, but does not fully validate negative sound IDs; actual Synth voice creation occurs later during command processing.')
add(17,'inferred_type','Negative sound_id has no lower-bound guard before bank-offset access. For sufficiently negative IDs the quotient indexes before the bank table; negative member values can also yield invalid sample indices. A returned logical handle does not certify an allocated Synth voice. The generation check allows the sign-producing shift boundary before its upper-bit assertion, so indefinite nonnegative handle generation is not guaranteed.')
setv(17,'state_behavior','Upper bank/sample bounds, track 0..255, channel 0..15, paused-channel state and an empty free list can return -1. Negative sound IDs are not safely rejected before table access. A reserved slot gets vID=-1, x30=-1 and cleared flags, selected defaults, and an encoded generation/slot ID. It becomes ACTIVE on the active list and increments the allocated-record count. Initialization is partial: command-dependent fields need valid stream sequencing. Actual Synth startup may later fail.')
setv(18,'purpose','For a matching state-bearing logical handle, applies the requested pan byte to an assigned Synth node or caches it in HSD_SM.pan with pending bit 0x20000. Handle validation occurs before interrupt masking; only the update portion is protected, so the full validate-and-update sequence is not atomic.')
for i in [18,19,20,21,31,33]:add(i,'state_behavior','Full-handle and state checks occur before OSDisableInterrupts. The protected update is not an atomic validation-plus-update transaction, and a forwarded Synth request is not independently checked for success.')
setv(21,'game_mapping','Provides per-sound Aux A/B send control when the corresponding low-bit API permission is set. These bits are independent of whether an AXFX processor is enabled; the packed effect type occupies different nibbles.')
setv(21,'purpose','Updates a logical sound\'s selected auxiliary send when the corresponding low-bit API gate permits it. Recomputes and submits the three mix gains only when a Synth handle is assigned; otherwise caches the send byte and marks pending bit 0x80000.')
setv(21,'state_behavior','Rejects invalid handle/index/state, a bus outside 0..1 or a selected low-bit API gate not equal to one. Effect-type nibbles and callback activity are not checked. After validation and interrupt masking, an assigned Synth handle receives recalculated mix; an unassigned ACTIVE record receives the send byte and pending bit 0x80000. The store region is protected but validation precedes it.')
setv(22,'data_flow','Filters state-bearing HSD_SM records by itdflag channel and requests each per-record send change with the raw u8 representation of the signed-byte argument. Per-record API permission failures are ignored. Independently writes the saved send byte for future records, even if no existing record accepted the request.')
setv(22,'purpose','Requests an auxiliary-send update for every state-bearing record on a logical channel and unconditionally saves the new default for later starts. Return true confirms valid channel/bus indices, not that current records changed.')
setv(22,'state_behavior','Invalid channel/bus returns false. Valid indices protect traversal and the default write with interrupt exclusion, ignore each per-record result, save the raw byte and return true. Live updates require the selected low-bit API gate, which is distinct from the installed effect type; the default still changes when that gate denies them.')
setv(24,'purpose','Attempts to load the global SFX metadata image into the audio heap, waits by repeatedly calling the supplied service callback, then parses five count-prefixed sections and relocates three pointer tables. The loader is blocking and does not validate file structure or independently confirm a complete successful DVD transfer before parsing.')
setv(24,'state_behavior','Path/open failure reports and returns. Zero-length after open reports and returns without DVDClose. Nonempty input allocates aligned length, publishes the base pointer, starts an async read without checking its return and spins through callback() until the shared flag changes. The completion callback accepts every result except -1; -1 leaves an unbounded wait. No NULL callback guard, count/offset bounds, allocation cleanup-on-failure or previous-image release exists here. After waiting it closes the file and parses in place. The independently read language-change caller explicitly unloads its old image first.')
add(25,'state_behavior','Outstanding logical command pointers and the derived count/table globals are not invalidated; using them after unload is outside a safe caller lifecycle.')
add(26,'inferred_type','Validation is limited to channel, type and enabled-effect param non-NULL. heap validity, size sufficiency, alignment, aliasing and parameter field ranges are unchecked locally; allocator assertions are not a false-return path.')
add(28,'state_behavior','This assumes fresh global state. It neither clears all record fields nor resets list heads, lookup entries, counts, generation, clock or paused-channel mask. Repeated calls can duplicate existing list membership and are not a supported reset by this implementation alone.')
setv(29,'inferred_type','int(void) accessor for the number of logical records with assigned Synth nodes, backed by a 64-slot node-association table. This is not a sum of AX hardware voices: a Synth node may own two AX voices, and the singleton streamed node is not included by these logical-record increments.')
setv(29,'purpose','Returns the count of logical HSD_SM records currently associated with a Synth node. The developer interface calls this PVoice, but one associated node can own multiple AX voices, so it is not a literal hardware-voice total.')
setv(29,'game_mapping','Feeds the developer PVoice peak tracker through lbAudioAx_80028B2C. In the current overlay, x is overwritten with the virtual count before both current-value rows are printed; the PVoice peak uses this accessor, but its displayed current column uses the virtual count.')
add(31,'state_behavior','Assigned ordinary Synth nodes are requested to pause through deferred volume processing; the later Synth pause callback sets the driver timing bit. For an unassigned record with x30==-1, the next clock callback initializes x30 before its pause-bit branch and can execute the initial command batch despite the pending pause marker.')
add(32,'state_behavior','Per-record helper results are ignored. Assigned ordinary nodes complete pausing through Synth processing rather than an immediate guaranteed halt, and a never-scheduled record can process its first batch despite its deferred pause bit because x30==-1 takes precedence in the clock callback.')
add(35,'state_behavior','The DVD entry may be -1; it is forwarded unchecked. The Synth starter can block waiting for its prior request and dereferences AXAcquireVoice without a local NULL check. Returning true from this wrapper does not establish successful loading or playback. The second Synth argument -1 converts to u8 255.')
setv(37,'purpose','Calculates an effect-dependent work-memory estimate using fixed reverb dimensions, preDelay or three delay values. It checks only type and enabled param presence. Parameter ranges, arithmetic overflow and the allocator\'s strict less-than capacity rule require separate handling; this result alone does not guarantee a sufficient usable heap.')
add(37,'state_behavior','Reverb float-to-s32 conversion and signed accumulation are unchecked for extreme/nonfinite preDelay. AXFX_DELAY.delay elements are u32, so subtraction and multiplication use unsigned arithmetic and can wrap for small or large values. A returned size equal to actual allocator consumption would still fail the allocator\'s strict cursor < capacity assertion.')
add(40,'state_behavior','Pause handling is an else-if after x30==-1 initialization: a newly scheduled paused record can still execute its first command batch. Records whose state clears during the ACTIVE branch are recycled on a later traversal, not by falling through the current switch. Signed clock/deadline overflow is not guarded.')
add(41,'state_behavior','The callback clears the association table and state but leaves v->vID unchanged. It is the state guard and later recycling, not resetting that field to -1 here, that make the record inactive.')
add(42,'state_behavior','This preserves an existing scheduled deadline only after x30 has been initialized. The clock callback prioritizes x30==-1 initialization over the pause-marker branch.')
unresolved={(20,'game_mapping'):'Exact fighter caller and randomized SFX range were not independently read. Local cents conversion and wrapper clamp are verified.'}
def evidence(i):
 a,b=ranges[i];e=[ev(src,a,b,'Pinned canonical implementation of this subject.'),ev(hdr,8,45,'Owned state masks, aux enum and HSD_SM fields.')]
 if i<6 or i==44:e += [ev(static,7,47,'Owned storage declarations.'),ev(src,1147,1172,'Actual partial initialization.'),ev(src,179,272,'Sound commit and physical-node accounting.'),ev(src,440,519,'Clock and inactivation/pause callbacks.'),ev(src,803,913,'Loaded image ownership and parsed tables.'),ev(src,915,1145,'Aux setup, dimensions, heap arithmetic and presets.'),ev(src,1276,1321,'Singleton stream operations.')]
 if i in [6,7,11,26,27,28,37]:e += [ev(src,14,27,'Strict cursor bound and no-op free.'),ev(src,915,1145,'Aux replacement, arena installation and type-dependent values.'),ev(src,1147,1172,'Allocator hook installation.')]
 if i in [8,13,14,15,16,17,18,19,20,21,22,23,28,29,30,31,32,33,34,38,39,40,41,42,44]:e += [ev(src,29,153,'Intrusive list and shared key-off helper.'),ev(src,179,438,'Pending flags and command interpretation.'),ev(src,440,617,'Clock, callbacks and logical-record creation.'),ev(src,697,794,'Aux permissions and node liveness.'),ev(src,1184,1274,'Individual and channel pause/resume.')]
 if i in [9,10,12,35,36]:e += [ev(src,1276,1321,'Single path-selected handle and sentinel-only forwarding guards.')]
 for r in support:
  p=r['path'];a,b=r['canonical_range'];yes=False
  if p.endswith('/synth.c'):
   if a==20:yes=i in [3,24,25,44]
   elif a==531:yes=i in [8,14,17,18,19,20,21,23,29,38,39,41,44]
   elif a==651:yes=i in [0,4,8,9,10,12,14,18,19,20,21,22,23,29,31,32,33,34,35,36,38,39,40,41,42,44]
   elif a==863:yes=i in [8,9,10,12,14,18,19,20,21,22,23,31,32,33,34,38,39,40,41,42]
   elif a in [1129,1144]:yes=i in [0,3,28,29,30,31,32,40,41,42,44]
   elif a==1382:yes=i in [4,9,10,12,29,35,36,44]
  elif p.endswith('/dbsound.c'):yes=i in [29,30]
  elif p.endswith('/lbaudio_ax.c'):
   if a==804:yes=i in [18,19,20]
   elif a==2255:yes=i in [29,30]
   elif a in [885,870,225]:yes=i in [17,32,34,38,39]
   elif a==1897:yes=i in [3,24,25,44]
   elif a==2085:yes=i in [0,5,6,7,11,26,27,28,37,44]
  elif p.endswith('/axfx.c'):yes=i in [6,7,11,26,28,44]
  elif p.endswith('/axfx.h'):yes=i in [0,2,5,6,7,11,26,27,37,44]
  elif p.endswith('/AXAux.c'):yes=i in [0,11,26,27,28,44]
  if yes:e.append(ev(p,a,b,'Independently read supporting implementation or consumer; foreign ownership not claimed.'))
 return e
subjects=[];proposal={'tu':tu,'proposal':{'facts':[],'links':[],'entities':[],'merges':[],'follow_ups':[]}}
for i,r in enumerate(rows):
 n=name(r);idx=i if i<45 else next(j for j,x in enumerate(rows[:44]) if name(x)==n);a,b=ranges[idx];s={'subject':r['subject'],'canonical_range':[a,b],'evidence':evidence(idx),'facts':[],'review':changes.get((idx,'purpose'),next((f['value'] for f in rows[idx]['facts'] if f['type']=='purpose'),'Canonical signature and input uses reviewed.'))}
 if not r['facts']:s.update(disposition='reviewed_no_existing_facts',parameter_review='Canonical signature and input uses read; no speculative register-to-parameter fact added.')
 for f in r['facts']:
  k=(i,f['type']);v=changes.get(k);d='supersede' if v else 'unresolved' if k in unresolved else 'retain';why='Correct inherited claim using pinned source and recorded support/object observations.' if v else unresolved.get(k,'Canonical implementation and recorded support substantiate this claim. Inferred names remain hypotheses.')
  s['facts'].append({'id':f['id'],'version':{'updated_at':f['updated_at'],'numeric_version':None},'type':f['type'],'value':f['value'],'disposition':d,'reason':why,'evidence':s['evidence']})
  if v:proposal['proposal']['facts'].append({'subject':r['subject'],'type':f['type'],'op':'write','value':v,'rationale':why,'confidence':0.98,'evidence':s['evidence']})
 subjects.append(s)
receipts=[]
for p in sorted((unit/'pages').glob('*.json')):
 r=json.load(open(p));match=re.match(r'(.*)\.(\d+)-(\d+)\.json',p.name);path=match[1].replace('__','/');a,b=int(match[2]),int(match[3]);phys=len((root/path).read_text().splitlines());receipts.append({'path':path,'canonical_range':[a,min(b,phys)],'rendered_range':[a,b],'source_sha256':next(x['sha256'] for x in m['files'] if x['path']==path),'artifact':str(p),'render_metadata':r['rendered']})
logs=[json.loads(l) for l in (unit/'reads.jsonl').read_text().splitlines() if json.loads(l).get('reader')=='axdriver_leaf'];start=min(x['at'] for x in logs);end=datetime.datetime.now(datetime.timezone.utc).isoformat();counts={'targets':44,'entities':57,'facts':sum(len(r['facts']) for r in rows),'proposals':len(proposal['proposal']['facts']),'dispositions':{d:sum(f['disposition']==d for s in subjects for f in s['facts']) for d in ['retain','supersede','reject','unresolved']}}
coverage={'campaign':m['campaign_id'],'tu':tu,'revision':rev,'reader':'axdriver_leaf','started_at':start,'completed_at':end,'read_receipts':receipts,'supporting_canonical_reads':support,'object_evidence':json.load(open(out/'object-evidence.json')),'subjects':subjects,'counts':counts,'exceptions':['C1321/public H84/static H49 physical lines, rendered1322/85/50; final phantom blanks excluded from canonical citations. C has10 parse errors and32 substitution occurrences across pages; public H20 substitutions and shadowed allocator binding; static H0.','Existing source and split object observations are not a rebuild or source-to-object equivalence certificate.','Whole owned source and headers include inline helpers absent from indexed target inventory; no source identity changes proposed.'],'unresolved':['Exact fighter pitch-randomization consumer deferred by fact ID.','AXFX internals and shared Synth types remain owned by their assigned families; supporting ranges do not claim full foreign coverage.']}
for n,v in [('coverage.json',coverage),('proposal.json',proposal)]: (out/n).write_text(json.dumps(v,indent=2)+'\n')
find=['# AXDriver Semantic Findings','',f'Pinned revision `{rev}`.','']
for s in subjects:
 find += ['## '+next(iter(s['subject'].values())),'',s['review'],'']
 for f in s['facts']:find += [f"- {f['id']} @ {f['version']['updated_at']}: {f['disposition']} {f['type']}. {f['reason']}"]
 if not s['facts']:find += [s['parameter_review']]
 find+=['']
(out/'findings.md').write_text('\n'.join(find)+'\n')
nt=['# AXDriver Naming Decisions','','Canonical names remain authoritative. All inherited aliases below describe observed local roles and remain hypotheses; no new alias is proposed.','','| Canonical | Existing alias | Decision |','|---|---|---|']
for r in rows[:44]:
 f=next((f for f in r['facts'] if f['type']=='inferred_name'),None);nt += [f"| {name(r)} | {f['value'] if f else 'none'} | {'Retain as role hypothesis; see behavioral corrections' if f else 'Preserve canonical identity'} |"]
nt += ['','The PVoice alias is an inherited diagnostic label. The accessor counts associated Synth nodes, not individual AX voices. AXDriverUpdate applies pending operations to one record; the separate master-clock callback traverses the complete driver list.']
(out/'naming-table.md').write_text('\n'.join(nt)+'\n')
summary={'tu':tu,'revision':rev,'started_at':start,'completed_at':end,'status':'research_complete_pending_review','counts':counts,'artifacts':{n:str(out/n) for n in ['functionality.md','findings.md','naming-table.md','coverage.json','unresolved.md','proposal.json','link-dispositions.json']},'proposal_sha256':hashlib.sha256((out/'proposal.json').read_bytes()).hexdigest()}
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
