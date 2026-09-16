import pathlib,json,re,hashlib,datetime
out=pathlib.Path(__file__).parent;m=json.load(open('games/melee/state/knowledge_v2/semantic-sweep-20260908/manifest.json'));root=pathlib.Path(m['checkout_root']);rev=m['head_revision'];tu='main/melee/lb/lbaudio_ax';src='src/melee/lb/lbaudio_ax.c';hdr='src/melee/lb/lbaudio_ax.static.h';ls=(root/src).read_text().splitlines();rows=json.load(open(out/'facts.json'));support=json.load(open(out/'supporting-reads.json'));unit=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbaudio_ax')
def ev(p,a,b,why):return {'kind':'code','locator':f'code://{rev}/{p}#L{a}-L{b}','why':why}
def name(r):return next(iter(r['subject'].values())).split(':')[-1].split('#')[0]
ranges={}
for i,r in enumerate(rows[:99]):
 n=name(r)
 if n.startswith('.'):continue
 a=max(j+1 for j,l in enumerate(ls) if re.search(r'^(static )?(void|bool|int|u64|HSD_GObj\*) '+re.escape(n)+r'\(',l))
 b=next(j+1 for j in range(a,len(ls)) if ls[j]=='}');ranges[i]=(a,b)
# Include direct local helpers that are part of the reported entry point.
ranges.update({0:(2085,2253),1:(39,193),2:(637,1030),3:(637,1030),4:(728,1253),6:(99,135),42:(265,292),46:(397,435),85:(1772,1825),88:(1897,1966),90:(1976,2083),99:(1,2276)})
changes={}
def change(i,t,v):changes[i,t]=v
def old(i,t):return next(f['value'] for f in rows[i]['facts'] if f['type']==t)
def append(i,t,s):change(i,t,old(i,t)+' '+s)
change(0,'state_behavior','Allocator initialization registers the userdata pool. Hardware initialization fills four 56-entry bank arrays with -1 and clears byte accounting. Runtime initialization resets all 17 ID/timer slots, while queue operations use only slots 0 through 15. Language changes clear nonzero bank entries and mark selected slots state 2 after blocking waits without inspecting a load result locally; state 2 is bookkeeping, not an independent success check.')
change(1,'data_flow','Character and translated stage indices yield bank masks; metadata, inclusive ID ranges, size records and SSM filenames support bank loading. HPS names support indexed streams. The paired-ID table maps ordinary character-bank IDs to or from bank 33 according to its finalized load state; bank 33 is kirbytm.ssm, not a region selector. JP/US path selection is a separate mechanism.')
change(1,'game_mapping','Stores character and stage audio mappings, SSM bank names, HPS stream names, bank attributes and byte budgets. The paired-ID remap depends on whether kirbytm.ssm bank 33 is finalized; its table alone does not establish regional numbering. Localization separately selects /audio/ or /audio/us/.')
change(1,'purpose','Stores initialized asset catalogs and mutable path buffers for character and stage SFX banks, HPS streams, per-bank ranges and sizes, and the load-state-dependent paired-ID mapping to or from bank 33 (kirbytm.ssm).')
change(2,'inferred_type','Existing source and split objects have a 0x68-byte .sbss section. The static header declares one float and 25 four-byte integer or Boolean objects. Of the seven bank-accounting objects at offsets 0x4D6438 through 0x4D6450, six are int and only lbl_804D6450 is unsigned int; do not describe all seven as unsigned.')
change(3,'inferred_type','Writable initialized small data contains individual int and float mixer globals, mode and path offsets, inactive -1 identifiers, a compact mode-translation array, and short strings. Existing source/split objects have 194/200 bytes; strings include dk.ssm, fox.ssm, ice.ssm, zs.ssm, gw.ssm, end.ssm and "0". Volume controls commonly use 0 through 127 and gain factors use float.')
change(5,'inferred_type','int calcPan(int current, int end, int left, int right). The helper does not validate duration or endpoint domains. With unequal endpoints it divides by end and subtracts signed integer endpoints before float conversion; end == 0 and overflowing differences are not handled. For a defined finite calculation it clamps the float to 0 through 127 and truncates to int; equal endpoints return 64.')
append(5,'purpose','This bounded result requires defined finite arithmetic; unequal endpoints with zero duration have no protected result.')
append(5,'data_flow','There is no lower progress clamp or zero-duration guard. Signed endpoint subtraction can overflow before conversion; invalid floating results are not made safe by the final comparisons.')
append(5,'state_behavior','A zero duration with unequal endpoints still reaches division, and negative progress is not raised to zero. Equal endpoints bypass division.')
for i in [7,8]:
 for t in ['data_flow','inferred_type','purpose','state_behavior']:
  append(i,t,'Doubling occurs in signed int before saturation; this behavior assumes the multiplication is representable and does not guarantee saturation for arbitrary extreme int inputs.')
# The callback family shares calcPan, whose zero-duration path is reachable through the constructor.
for i in [12,13,15,16,17,18]:
 for t in ['data_flow','game_mapping','purpose','state_behavior']:
  append(i,t,'Any bounded-pan claim assumes calcPan completes defined finite arithmetic: unequal endpoints with end_frame == 0 are not guarded, and endpoint subtraction can overflow. The callback does not validate those inputs.')
for t in ['data_flow','game_mapping','purpose','state_behavior']:
 change(19,t,{'data_flow':'Reads frame, duration and volume endpoints. While frame <= duration, computes delta = int((float(frame) / float(duration)) * abs(start_vol - end_vol)), then stores start_vol + delta if start_vol < end_vol, otherwise end_vol - delta. Beyond duration stores 127. The zero-duration division and signed endpoint difference are unchecked.', 'game_mapping':'Supplies a time-dependent logical volume for managed sound voices. The increasing branch is a conventional ramp, but the decreasing branch starts at end_vol and subtracts progress-scaled endpoint difference; it is not a fade from start_vol down to end_vol.', 'purpose':'Computes a managed sound volume from frame/duration and endpoint difference, using start_vol + delta on the increasing branch and end_vol - delta otherwise; frame beyond duration yields 127. It does not generally interpolate between the two requested endpoints.', 'state_behavior':'Null GObj or userdata is inert. For positive duration, frame 0 gives start_vol on the increasing branch and end_vol on the other branch; at duration the decreasing branch gives 2*end_vol - start_vol. Equal endpoints still execute the division. Zero duration can produce invalid floating arithmetic before conversion to int. It never advances time and returns false.'}[t])
append(20,'inferred_type','The mode indexes a ten-entry callback table before the switch and is unchecked; callers must supply 0 through 9. Negative durations become zero, so duration normalization does not prevent zero-divisor callbacks.')
append(20,'state_behavior','The callback-table lookup occurs before mode dispatch and has no bounds guard. All normalized durations may be zero; the process invokes the callback before checking expiration. A newly created controller does not imply successful driver playback.')
change(21,'data_flow','Runs the userdata callback first. If it returns true, requests GObj destruction and returns. Otherwise any voice_id other than -1, including other negative values, is forwarded with current pan and volume to the setters. Lifetime handling then destroys the controller or increments current_frame. Ordinary destruction reaches the allocator destructor but does not key off the voice here.')
append(21,'state_behavior','The callback runs before the zero-duration termination check, so retirement does not protect interpolation from division by zero. The test for voice propagation is != -1, not nonnegative or a driver liveness check. Destruction itself performs no local voice key-off.')
append(21,'inferred_type','The -1 frame test bypasses retirement on that tick, but the else path still increments current_frame, including -1 to 0.')
change(25,'game_mapping','Reconciles outstanding dynamic-bank loads before replacement or reset. Cancellation is bounded to 64 attempts per eligible handle and bookkeeping is cleared regardless of individual cancellation success; any remaining pending work triggers a blocking wait and bank-2 unload. This is not an independent proof of safe cancellation for arbitrary failed I/O.')
append(25,'state_behavior','After its bounded retry loop an eligible entry is cleared even if no cancellation attempt succeeded; the later global pending check determines whether to wait and unload.')
change(27,'inferred_type','bool fn_80026E58(int bank_slot), an unchecked index into the 56-element lbl_80433984 array. Normal bank scans cover slots 0 through 54; slot 55 is a sentinel. Returns true only for stored value 2, not for callback-completed value 1.')
change(28,'data_flow','Scans slots 0 through 54 for active_request == 1 and load_state == -1; such a pair returns 1 immediately. If none exists, a second scan promotes pairs (1,1) to (1,2) and returns 0. The -1 test is on load state, not requested state.')
append(31,'state_behavior','If lo and hi alias, the later upper-bound write wins; separate endpoint preservation assumes distinct output locations.')
change(34,'inferred_type','int lbAudioAx_800233EC(int sfx_id), a value-returning helper without writes. It reads bank 33 load state and the bank-range/remap tables, so it is not independent of mutable global state. Bank 33 is kirbytm.ssm; state 2 selects the forward domain.')
append(45,'purpose','It performs no local load-result validation; invalid or unclassified IDs can yield sentinel bank 55, whose filename is NULL, so the general input domain is not safely ensured.')
change(45,'state_behavior','The first metadata test uses column 1: value 5 skips the replacement block. Other banks first key off all SFX; state 2 retains the bank, while other states unload Synth bank 2 and clear tracking for rows whose column 2 is not 5, then load/wait and mark state 2 without checking the load result. These are distinct metadata columns. All paths then submit the original ID.')
append(46,'state_behavior','The starter result is ignored and return 0 means a changed selection was attempted. The new path remains cached even if playback fails, suppressing a retry of the same path. AXDriver itself returns true after submission and has no local success check.')
change(50,'purpose','Starts an SFX on channel 7 after selecting its track by ID. Fourteen IDs have fixed tracks; ID 0x20D preserves the supplied track unless it is exactly -1, in which case it uses 0. Other unlisted IDs use 0. Negative tracks other than -1 are forwarded and may be rejected by AXDriver.')
change(63,'state_behavior','Unconditionally clears transient latches, counters and voice handles, restores gains, keys off tracks 5 and 6, resumes channels 5,6,8,7 and clears replay flag lbl_804D641C. It sets paused false without calling AXDriverResume for the singleton stream; the stored latch alone does not prove that stream resumed.')
change(64,'data_flow','Calls lbAudioAx_80024C84 to reset transient state, then writes lbl_804D641C = 1. The periodic updater consumes that flag by playing every non-sentinel tracked ID at full volume and centered pan, clearing each entry and finally clearing the flag.')
change(64,'purpose','Resets transient audio state and schedules one replay of the sixteen-slot tracked-SFX queue on the next update. The flag causes playback and queue clearing, not just deferred retirement.')
change(64,'game_mapping','Provides reset followed by deferred replay of recently registered SFX IDs. The local code proves this playback behavior; the exact match-outcome consumer remains a separate family review.')
change(66,'inferred_type','void lbAudioAx_80024DC4(int sfx_id). The two backing arrays are int[17], but registration and runtime aging use only indices 0 through 15. IDs use 0x83D60 as empty sentinel and associated counters are refreshed to ten.')
change(67,'purpose','Sets the paused latch and requests pause or resume of AXDriver\'s singleton path-selected stream. It does not pause all AXDriver-managed SFX or all game audio; the low-level singleton is the same handle used by AXDriverStop and the stream-status wrapper.')
append(67,'inferred_type','The tracked instance is specifically the singleton path-selected stream, not the complete SFX driver.')
change(67,'game_mapping','Provides pause/resume control for the singleton stream. Movie-specific caller behavior has not been independently re-read in this TU review; no claim that the operation pauses all audio or the movie is made.')
append(69,'state_behavior','This routine does not update lbAudioAx\'s cached synth_volume value. A later ordinary mix update can suppress a write when its calculated value equals that cache, so the cache is not a separate guarantee of actual hardware gain during suspension.')
append(74,'state_behavior','The callee itself does not clear any fighter-local count; that is done by the independently read ft_80088110 wrapper.')
append(77,'inferred_type','sfx_id is checked only against the upper bound 0x83D60; negative IDs pass. mode is used as an unchecked callback-table index before the initializer switch. Callers must provide mode 0 through 9 and inputs that keep callback arithmetic defined.')
change(77,'purpose','Allocates a managed sound-controller GObj and pooled userdata, installs the process and destructor, initializes from the supplied packet and returns the GObj. IDs >= 0x83D60 and allocation failures return NULL. Negative IDs pass the sole ID guard, modes are unchecked, and a returned GObj does not guarantee a successfully started voice.')
append(77,'state_behavior','Negative IDs pass the upper-only guard; out-of-range mode causes an unchecked callback-table access. Zero duration remains possible and callback interpolation happens before expiration. Controller retirement frees userdata but does not itself stop the voice.')
append(80,'state_behavior','Unlike StopAllForEntity, this routine does not reject a NULL owner; NULL is a valid equality key. A non--1 stored handle is considered a candidate without a driver liveness query, and the key-off result is discarded.')
append(82,'state_behavior','Stage_8022519C is called before the translated-value bounds test, so this wrapper does not establish that arbitrary invalid StKind inputs are safe for the converter.')
for t in ['data_flow','purpose','state_behavior']:
 append(84,t,'The common mask is added with unsigned 64-bit +=, not OR. Overlapping input bits can generate carries, changing the selected bit set; an OR interpretation is valid only when the relevant masks do not overlap.')
append(85,'state_behavior','Demotion of non-permanent state-2 slots occurs before the no-applicable-desired-slot early return, so even that early path changes loaded bookkeeping.')
append(86,'state_behavior','There is no local failure or timeout exit: if requested state -1 persists after lower-level waits return, this loop continues.')
append(88,'state_behavior','Path prefix and append offset are refreshed even when the cached language matches. Marking a bank state 2 follows a wait without inspecting an independent result locally.')
append(90,'state_behavior','The gameplay-pause latch gates both countdown aging and queue TTL aging. A replay request still dispatches and clears queued IDs while paused. Slot 16 is initialized but not used by these runtime loops; disabling either persistent voice submits SFX sentinel 0x83D60 on its reserved track rather than directly calling key-off here.')
change(92,'state_behavior','Initializes AR/ARQ/AI, computes three bank capacities and installs effects. Reverb defaults use type 2 and set time 1.88; the delay defaults use type 4, but the delay heap-size assertion calls HSD_AudioGetAuxHeapSize(2, &delay), then installation uses type 4. Therefore that assertion is not a type-correct delay-size check. Effect-installation return values are ignored. Bank arrays are filled with -1 and byte counters zeroed; no reinitialization guard exists.')
change(92,'purpose','Configures the principal audio resources: AR/ARQ/AI services, calculated bank capacity, fixed reverb/delay work buffers, three Synth banks and initial bookkeeping. It is intended for startup, but has no one-time-call guard and does not validate every lower-level result.')
append(93,'state_behavior','The local state-2 writes follow waits without a local success-result check. The routine resets cur_hps_file to /audio/ but does not clear cur_hps_stem or call stream stop in this path. All 17 queue slots are reset, although runtime queue operations use only 16.')
for i in [96,97]:
 for t in ['data_flow','purpose','game_mapping']:
  append(i,t,'This shared fade factor affects Synth groups 1 through 7; the group-8 calculation omits lbl_804D38CC and is not faded by this factor.')
change(99,'inferred_type','Audio-support TU with bank metadata and remap tables, module mixer state, asynchronous bank coordination and GObj controllers. Source and paired static header define individual objects; the existing object sections distinguish initialized tables/strings, BSS allocator and buffers, small-data controls and numeric literals. Allocator state belongs to BSS, not retail .data. Existing objects were inspected without rebuilding or certifying current source-to-object equivalence.')
# Specific inherited foreign details are not promoted merely because local behavior agrees.
unresolved={}
def defer(i,types,why):
 for t in types.split():unresolved[i,t]=why
for i in [36,37,38,39,47,49,51,52,63,65,69,70,81,82,88,89]:defer(i,'game_mapping','Local behavior is verified; the complete inherited caller-specific scene/item/menu claim was not independently exhausted. Defer to the owning family rather than treat a prior assertion as evidence.')
defer(42,'state_behavior','Local archive request is verified; fatal required-symbol resolver behavior and synchronous transaction details were not independently re-read.')
defer(48,'game_mapping','Crowd manager use is verified, but the specific repeated fighter-cheer path remains unreviewed.')
defer(56,'data_flow game_mapping','Saved balance mapping is verified; the inherited player Sound Test attenuation path needs its exact caller range, beyond the independently read developer Sound Test setters.')
defer(62,'data_flow','Mapping and Synth persistence are verified; the full player Sound-options caller has not been independently read.')
defer(65,'inferred_type','Column index is unchecked locally; inherited demonstrated Mute City/Venom caller columns are not independently re-read.')
defer(66,'data_flow game_mapping','Fighter registration is verified; item 0x12F and KO-specific lifecycle claims remain unreviewed.')
defer(71,'purpose game_mapping','Fighter wrapper and status-duration registration are verified; exact Super Star asset/status identity remains a family claim without independently read item source.')
defer(71,'state_behavior','Global and fighter-local acquisition writes are verified; all claimed cleanup consumers were not exhausted.')
defer(73,'purpose game_mapping','Counter release and fighter-local wrapper are verified; exact Super Star identity remains with the item/fighter family.')
defer(78,'data_flow','Null-safe voice extraction is verified; exact category-specific fighter field consumer was not independently read.')
defer(79,'game_mapping','Fighter teardown is verified; inherited item teardown consumer remains unreviewed.')
defer(80,'game_mapping','Fighter teardown is verified; inherited item teardown consumer remains unreviewed.')
defer(86,'data_flow','The local wait and slot finalization are verified; lb_800195D0 disc-error/card service internals remain with the storage owner.')
# A pure accessor claim is inappropriate for a mutable global lookup; local type corrected above.
# Detailed support routing keeps citations relevant to each reviewed subject.
def evidence(i):
 a,b=ranges[i];e=[ev(src,a,b,'Pinned canonical implementation of this subject and its local helper.')]
 if i<5 or i in [6,22,23,24,25,26,27,28,31,32,33,34,45,81,82,83,84,85,86,87,88,92,93,99]:e += [ev(hdr,88,148,'Allocator, queue and bank arrays; character and bank metadata.'),ev(hdr,150,331,'Stage records, flags, inclusive ranges, filenames, sizes and paired IDs.')]
 if i<5:e += [ev(hdr,11,100,'Controller layout and individual storage declarations.')]
 if i in [5,11,12,13,14,15,16,17,18,19,20,21,77,78,79,80,91,98]:e += [ev(hdr,11,31,'Owned 0x48-byte controller layout.'),ev(src,1032,1074,'Pan arithmetic and fighter/item position resolution.'),ev(src,1229,1416,'Volume arithmetic, initializer, callback-before-retirement and allocator destructor.')]
 if i in [7,8,40,41,46,47,48,49,50,51,52,53,58,59,60]:e += [ev(src,225,263,'Playback normalization and ID/track branching.')]
 if i in [9,10,54,55,56,57,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,90,96,97]:e += [ev(src,728,802,'Actual mixer formulas, group-8 exception and cache suppression.'),ev(src,1976,2083,'Paused countdowns, persistent voices and replay/aging distinction.')]
 if i in [22,23,24,25,26,27,28,81,82,83,84,85,86,87]:e += [ev(src,1529,1851,'Request, load, accounting, cancellation and finalization lifecycle.')]
 for r in support:
  p=r['path'];a,b=r['canonical_range'];yes=False
  if p.endswith('/axdriver.c'):yes=i in [7,8,10,21,35,36,37,38,39,40,41,46,48,49,50,51,52,53,57,58,59,60,63,67,68,69,70,77,79,80,89,90,92,94,95]
  elif p.endswith('/synth.c'):yes=i in [8,10,23,25,26,35,36,37,38,39,45,46,58,59,60,61,62,67,68,69,70,85,86,88,92,93]
  elif p.endswith('/gm_1601.c'):yes=i in ([53] if a>3900 else [9,55,56])
  elif p.endswith('/gmmain_lib.c'):yes=i in [9,55,56]
  elif p.endswith('/dbsound.c'):yes=i in [75,76,94,95]
  elif p.endswith('/ft_0877.c'):yes=i in [31,32,33,34,40,60,66,71,72,73,74]
  elif p.endswith('/ft_0881.c'):yes=i in [41,71,72,73,74,79,80]
  elif p.endswith('/ftCo_HammerWait.c'):yes=i in [72,74]
  elif p.endswith('/ftcoll.c'):yes=i in [71,73]
  elif p.endswith('/crowdsfx.c'):yes=i in [36,38,48]
  elif p.endswith('/ground.c'):yes=i==29
  elif p.endswith('/mncharsel.c'):yes=i==53
  elif p.endswith('/lbcollision.c'):yes=i==50
  elif p.endswith('/objalloc.c'):yes=i in [0,21,77,91,98]
  elif p.endswith('/mnsoundtest.c'):yes=i in [30,37,42,43,44,45,46,55]
  elif p.endswith('/soundtest.c'):yes=i in [54,55,56,61,62]
  if yes:e.append(ev(p,a,b,'Independently read supporting callee or consumer; foreign ownership not claimed.'))
 return e
subjects=[];proposal={'tu':tu,'proposal':{'facts':[],'links':[],'entities':[],'merges':[],'follow_ups':[]}}
for i,r in enumerate(rows):
 n=name(r);idx=i if i<100 else next((j for j,x in enumerate(rows[:99]) if name(x)==n),None)
 if idx is None:
  # Historical parameter slots still refer to fn_800250A0; current source names the helper calcPan.
  assert n=='fn_800250A0';idx=5
 a,b=ranges[idx];s={'subject':r['subject'],'canonical_range':[a,b],'evidence':evidence(idx),'facts':[]}
 s['review']=changes.get((idx,'purpose'),next((f['value'] for f in rows[idx]['facts'] if f['type']=='purpose'),'Canonical signature and storage use reviewed.'))
 if not r['facts']:
  s['disposition']='unresolved' if n=='fn_800250A0' else 'reviewed_no_existing_facts'
  s['parameter_review']='Historical fn_800250A0 parameter identity has no current canonical definition; calcPan has the corresponding four-int behavior, but identity migration is deferred.' if n=='fn_800250A0' else 'Current function signature and use of inputs read. No parameter-name or ABI-register mapping claim added; constructor float/register mapping is not inferred from r-number labels.'
 for f in r['facts']:
  key=(i,f['type']);v=changes.get(key);disp='supersede' if v else ('unresolved' if key in unresolved else 'retain')
  why=('Correct the inherited claim from pinned canonical behavior and directly read support.' if v else unresolved.get(key,'Pinned implementation and the listed support substantiate this fact; inferred names remain hypotheses.'))
  s['facts'].append({'id':f['id'],'version':{'updated_at':f['updated_at'],'numeric_version':None},'type':f['type'],'value':f['value'],'disposition':disp,'reason':why,'evidence':s['evidence']})
  if v:proposal['proposal']['facts'].append({'subject':r['subject'],'type':f['type'],'op':'write','value':v,'rationale':why,'confidence':0.98,'evidence':s['evidence']})
 subjects.append(s)
receipts=[]
for p in sorted((unit/'pages').glob('*.json')):
 r=json.load(open(p));match=re.match(r'(.*)\.(\d+)-(\d+)\.json',p.name);path=match[1].replace('__','/');a,b=int(match[2]),int(match[3]);phys=len((root/path).read_text().splitlines());receipts.append({'path':path,'canonical_range':[a,min(b,phys)],'rendered_range':[a,b],'source_sha256':next(x['sha256'] for x in m['files'] if x['path']==path),'artifact':str(p),'render_metadata':r['rendered']})
logs=[json.loads(l) for l in (unit/'reads.jsonl').read_text().splitlines() if json.loads(l).get('reader')=='lbaudio_leaf'];start=min(x['at'] for x in logs);end=datetime.datetime.now(datetime.timezone.utc).isoformat();counts={'targets':99,'entities':110,'facts':569,'proposals':len(proposal['proposal']['facts']),'dispositions':{d:sum(f['disposition']==d for s in subjects for f in s['facts']) for d in ['retain','supersede','reject','unresolved']}}
coverage={'campaign':m['campaign_id'],'tu':tu,'revision':rev,'reader':'lbaudio_leaf','started_at':start,'completed_at':end,'read_receipts':receipts,'supporting_canonical_reads':support,'object_evidence':json.load(open(out/'object-evidence.json')),'subjects':subjects,'counts':counts,'exceptions':['Owned C2276/H91/static H331 physical lines read to EOF; rendered2277/92/332 includes final phantom blank, excluded from canonical citations.','C renderer reports2 parse errors; public header54 substitutions plus shadowed constructor alias; static header zero substitutions. Names are hypotheses.','Existing source and split objects inspected without rebuilding or certifying source-object equivalence.','Four historical fn_800250A0 parameter entities have no current canonical function identity; no merge or register-name claim.'],'unresolved':['Specific foreign caller facts are itemized by ID and version, not implicitly accepted.','Shared fighter/item/camera/Synth type and lifecycle ownership remains with the assigned families.']}
for n,v in [('coverage.json',coverage),('proposal.json',proposal)]: (out/n).write_text(json.dumps(v,indent=2)+'\n')
find=['# Audio semantic findings','',f'Pinned revision `{rev}`. Started {start}; completed {end}.','']
for s in subjects:
 find += ['## '+next(iter(s['subject'].values())),'',s['review'],'']
 for f in s['facts']:find += [f"- {f['id']} @ {f['version']['updated_at']}: {f['disposition']} {f['type']}. {f['reason']}"]
 if not s['facts']:find += [s['parameter_review']]
 find+=['']
(out/'findings.md').write_text('\n'.join(find)+'\n')
nt=['# Audio naming decisions','','Canonical names are authoritative. All aliases below remain descriptive hypotheses; no new aliases are proposed.','','| Canonical | Existing alias | Decision |','|---|---|---|']
for i,r in enumerate(rows[:99]):
 f=next((f for f in r['facts'] if f['type']=='inferred_name'),None);nt += [f"| {name(r)} | {f['value'] if f else 'none'} | {'Retain hypothesis supported by current body and listed callees/consumers' if f else 'Preserve canonical name; no speculative alias'} |"]
(out/'naming-table.md').write_text('\n'.join(nt)+'\n')
summary={'tu':tu,'revision':rev,'started_at':start,'completed_at':end,'status':'research_complete_pending_review','counts':counts,'artifacts':{n:str(out/n) for n in ['functionality.md','findings.md','naming-table.md','coverage.json','unresolved.md','proposal.json','link-dispositions.json']},'proposal_sha256':hashlib.sha256((out/'proposal.json').read_bytes()).hexdigest()}
for p in [out/'summary.json',unit/'summary.json']:p.write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary))
