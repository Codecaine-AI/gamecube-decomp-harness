import json,pathlib,re,hashlib,datetime
out=pathlib.Path(__file__).parent;camp=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');m=json.load(open(camp/'manifest.json'));root=pathlib.Path(m['checkout_root']);rev=m['head_revision'];tu='main/melee/db/dbsound';src='src/melee/db/dbsound.c';hdr='src/melee/db/dbsound.h';unit=camp/'units/main__melee__db__dbsound';rows=json.load(open(out/'facts.json'));support=json.load(open(out/'supporting-reads.json'))
def ev(p,a,b,why):return {'kind':'code','locator':f'code://{rev}/{p}#L{a}-L{b}','why':why}
def name(r):return next(iter(r['subject'].values())).split(':')[-1].split('#')[0]
ranges={0:(7,43),1:(20,137),2:(11,137),3:(9,9),4:(22,43),5:(117,138),6:(22,44),7:(46,115),8:(1,138)}
changes={}
def setv(i,t,v):changes[i,t]=v
def old(i,t):return next(f['value'] for f in rows[i]['facts'] if f['type']==t)
def add(i,t,v):setv(i,t,old(i,t)+' '+v)
add(1,'state_behavior','The labels reflect the local selected bits, not a readback of effective audio gains. Setup resets indices without calling the audio-mode setter, so repeated setup can desynchronize labels and stored mixer enables until another chord applies them.')
add(2,'state_behavior','The countdown is decremented on the same call that sets it to 240, leaving 239. Hidden modes with an existing panel freeze peaks and timers; a missing panel seeds both values and zeroes timers on every call. The inspected db_RunEveryFrame caller invokes CheckSoundInfo for all four players, and each invokes UpdateSoundInfo, producing four updater calls per caller pass.')
setv(4,'inferred_type','Existing split and source .sdata2 sections each contain exactly 16 bytes: GXColor bytes 80 80 80 80 and FF FF FF FF, followed by big-endian f32 12.0 and 16.0. The first two words are color initializers, not floating-point scale or unidentified padding. Object inspection does not certify current source-object equivalence.')
setv(4,'data_flow','Setup consumes gray translucent background RGBA {128,128,128,128}, white text RGBA {255,255,255,255}, and text scale 12.0 by 16.0. Existing .sdata2 bytes contain these two color words and two f32 values. The colors are sent to DevText setters and the scales to DevText_SetScale; these values are not mutated by the sound-control routines.')
setv(4,'purpose','Stores immutable setup literals for the sound panel: gray translucent background, white text, horizontal scale 12.0 and vertical scale 16.0.')
add(5,'state_behavior','Button masks are observed, not consumed. The once-per-chord property assumes one player-0 call per newly computed pressed mask; repeated calls with the same edge can advance again. The inspected caller does make one call for each player index per pass, but all four calls update diagnostics.')
setv(6,'state_behavior','Resets two mode indices and both peak/timer pairs, then stores the DevText_Create result. Success registers the panel, sets background {128,128,128,128}, white text and12-by 16 scale, and hides cursor/background/text. Duplicate ID 9 can return NULL; DevText pool exhaustion asserts, so creation is not uniformly a benign failure return. Setup does not destroy an existing panel, reapply audio-mode enables or explicitly reset the audio debug latch.')
setv(7,'inferred_type','void(void) updater over dbsound globals, audio queries and retained DevText. Its unit is a call, not intrinsically a frame: the inspected db_RunEveryFrame loop calls CheckSoundInfo for four players, each of which invokes this updater.')
setv(7,'purpose','Updates the audio debug latch and panel visibility; in visible modes samples both node-associated and allocated-logical counts, updates separate retained peaks, and redraws status text. Both displayed current columns receive the second, virtual-count sample, while PVoice and VVoice peaks remain separate.')
setv(7,'state_behavior','First writes audio debug_enabled = (show_info > 3), even if no panel exists. With a panel, modes 0..3 hide it without sampling or decrementing timers; modes 4..7 sample each count and update its retained peak. A new high sets timer 240 then immediately decrements to 239; reaching zero replaces the peak with the current sample. Without a panel, every call samples both counters and clears timers. The inspected caller performs four such calls per pass, so the timer is not a 240-frame hold.')
setv(8,'data_flow','Player 0 pressed/current masks advance the output index modulo 4 and display index modulo 8. The order table supplies cached audio enable bits. Visible updates independently sample the number of logical records associated with Synth nodes and the number of allocated logical records, retain separate peaks, then print the virtual current value in both rows because local x was overwritten. The associated-node count is not a hardware AX-voice total; one Synth node can own two AX voices.')
# All baseline facts have a local or independently read supporting disposition.
unresolved={}
def evidence(i):
 a,b=ranges[i];e=[ev(src,a,b,'Pinned owned implementation for this subject.'),ev(hdr,4,7,'Owned public declarations.')]
 if i!=3:e += [ev(src,22,115,'Panel setup, visible/hidden branches, samples and current-value reuse.'),ev(src,117,138,'Chord transitions and unconditional updater call.')]
 for r in support:
  p=r['path'];a,b=r['canonical_range'];yes=False
  if p.endswith('/dbinit.c'):yes=i!=3
  elif p.endswith('/textlib.c'):yes=i in [0,4,6,7,8]
  elif p.endswith('/textdraw.c'):yes=i in [0,2,6,8]
  elif p.endswith('/lbaudio_ax.c'):yes=i in ([1,2,5,6,7,8] if a!=2255 else [2,7,8])
  elif p.endswith('/axdriver.c') or p.endswith('/synth.c'):yes=i in [2,7,8]
  if yes:e.append(ev(p,a,b,'Independently read supporting callee or caller; foreign ownership not claimed.'))
 return e
subjects=[];proposal={'tu':tu,'proposal':{'facts':[],'links':[],'entities':[],'merges':[],'follow_ups':[]}}
for i,r in enumerate(rows):
 n=name(r);idx=i if i<9 else next(j for j,x in enumerate(rows[:8]) if name(x)==n);a,b=ranges[idx];s={'subject':r['subject'],'canonical_range':[a,b],'evidence':evidence(idx),'facts':[],'review':changes.get((idx,'purpose'),next((f['value'] for f in rows[idx]['facts'] if f['type']=='purpose'),'Canonical signature and input uses reviewed.'))}
 if not r['facts']:s.update(disposition='reviewed_no_existing_facts',parameter_review='Canonical signature and input uses read; no speculative register-to-parameter fact added.' if i>=9 else 'No existing facts on this manifest subject.')
 for f in r['facts']:
  k=(i,f['type']);v=changes.get(k);d='supersede' if v else 'unresolved' if k in unresolved else 'retain';why='Correct inherited claim using pinned source and recorded object observations.' if v else unresolved.get(k,'Canonical implementation and recorded support substantiate this claim.')
  s['facts'].append({'id':f['id'],'version':{'updated_at':f['updated_at'],'numeric_version':None},'type':f['type'],'value':f['value'],'disposition':d,'reason':why,'evidence':s['evidence']})
  if v:proposal['proposal']['facts'].append({'subject':r['subject'],'type':f['type'],'op':'write','value':v,'rationale':why,'confidence':0.98,'evidence':s['evidence']})
 subjects.append(s)
receipts=[]
for p in sorted((unit/'pages').glob('*.json')):
 r=json.load(open(p));match=re.match(r'(.*)\.(\d+)-(\d+)\.json',p.name);path=match[1].replace('__','/');a,b=int(match[2]),int(match[3]);phys=len((root/path).read_text().splitlines());receipts.append({'path':path,'canonical_range':[a,min(b,phys)],'rendered_range':[a,b],'source_sha256':next(x['sha256'] for x in m['files'] if x['path']==path),'artifact':str(p),'render_metadata':r['rendered']})
logs=[json.loads(l) for l in (unit/'reads.jsonl').read_text().splitlines() if json.loads(l).get('reader')=='dbsound_leaf'];start=min(x['at'] for x in logs);end=datetime.datetime.now(datetime.timezone.utc).isoformat();counts={'targets':8,'entities':2,'facts':sum(len(r['facts']) for r in rows),'proposals':len(proposal['proposal']['facts']),'dispositions':{d:sum(f['disposition']==d for s in subjects for f in s['facts']) for d in ['retain','supersede','reject','unresolved']}}
coverage={'campaign':m['campaign_id'],'tu':tu,'revision':rev,'reader':'dbsound_leaf','started_at':start,'completed_at':end,'read_receipts':receipts,'supporting_canonical_reads':support,'object_evidence':json.load(open(out/'object-evidence.json')),'subjects':subjects,'counts':counts,'exceptions':['C138/H9 physical lines, rendered139/10; phantom final blanks excluded from canonical citations. C6 substitutions, header0, both0 parse errors.','Existing source and split object observations are not a rebuild or source-to-object equivalence certificate.','Only manifest-owned dbsound.c and dbsound.h are claimed; shared db.h remains foreign.'],'unresolved':['External uses of db_804D4AF8 are not inferred from its initializer; local source never reads or writes it.']}
for n,v in [('coverage.json',coverage),('proposal.json',proposal)]: (out/n).write_text(json.dumps(v,indent=2)+'\n')
find=['# dbsound Semantic Findings','',f'Pinned revision `{rev}`.','']
for s in subjects:
 find += ['## '+next(iter(s['subject'].values())),'',s['review'],'']
 for f in s['facts']:find += [f"- {f['id']} @ {f['version']['updated_at']}: {f['disposition']} {f['type']}. {f['reason']}"]
 if not s['facts']:find += [s['parameter_review']]
 find+=['']
(out/'findings.md').write_text('\n'.join(find)+'\n')
nt=['# dbsound Naming Decisions','','Canonical names remain authoritative. No new aliases proposed.','','| Subject | Existing alias | Decision |','|---|---|---|']
for r in rows[:8]:
 f=next((f for f in r['facts'] if f['type']=='inferred_name'),None);nt += [f"| {name(r)} | {f['value'] if f else 'none'} | Preserve canonical identity; retain supported buffer alias |"]
(out/'naming-table.md').write_text('\n'.join(nt)+'\n')
summary={'tu':tu,'revision':rev,'started_at':start,'completed_at':end,'status':'research_complete_pending_review','counts':counts,'artifacts':{n:str(out/n) for n in ['functionality.md','findings.md','naming-table.md','coverage.json','unresolved.md','proposal.json','link-dispositions.json']},'proposal_sha256':hashlib.sha256((out/'proposal.json').read_bytes()).hexdigest()}
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
