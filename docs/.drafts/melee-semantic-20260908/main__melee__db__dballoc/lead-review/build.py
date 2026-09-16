import json,pathlib,re,hashlib,datetime
out=pathlib.Path(__file__).parent;camp=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');m=json.load(open(camp/'manifest.json'));root=pathlib.Path(m['checkout_root']);rev=m['head_revision'];tu='main/melee/db/dballoc';src='src/melee/db/dballoc.c';unit=camp/'units/main__melee__db__dballoc';rows=json.load(open(out/'facts.json'));support=json.load(open(out/'supporting-reads.json'))
def ev(p,a,b,why):return {'kind':'code','locator':f'code://{rev}/{p}#L{a}-L{b}','why':why}
def name(r):return next(iter(r['subject'].values())).split(':')[-1].split('#')[0]
ranges={0:(1,62),1:(7,62),2:(1,62),3:(9,13),4:(15,62),5:(1,62),6:(15,21)}
changes={}
def setv(i,t,v):changes[i,t]=v
def old(i,t):return next(f['value'] for f in rows[i]['facts'] if f['type']==t)
def add(i,t,v):setv(i,t,old(i,t)+' '+v)
setv(0,'inferred_type','Existing split .data is 16 bytes: the 11-byte null-terminated ASCII filename "objalloc.h" followed by five zero bytes. Existing source .data is exactly the 11-byte filename. Both report alignment 8; do not infer a separate 12-byte source object from the split extent. These are existing-object observations, not a fresh build or proof of source-object equivalence.')
setv(2,'inferred_type','Existing split .sdata is 8 bytes containing ASCII "data" plus a null terminator and three additional zero bytes; existing source .sdata is exactly the five-byte terminated string. Both report alignment 8. The split extent includes padding, not an eight-byte source string object. These observations do not certify current source-object equivalence.')
setv(1,'inferred_type','Static UnkFlagStruct db_804D6BA0 is a byte union containing u8 and eight one-bit u8 fields. This unit uses b0 and b1 as 0/1 software toggle latches. Existing source .sbss is one byte, while the padded split .sbss extent is eight bytes.')
add(1,'data_flow','The written bits record this routine\'s last toggle branch; setup can clear them without disabling allocator enforcement, and external allocator changes are not read back.')
setv(1,'game_mapping','Stores the developer limiter software toggles: b0 selects the EF_Effect allocator branch, and b1 selects a shared branch for generator, particle and PSAppSrt allocators. These bits are not authoritative readbacks of allocator enforcement flags.')
setv(1,'purpose','Stores two persistent software latches that select enable versus disable branches for the developer allocation limiter. Setup resets the latches without changing actual allocator limits or enforcement flags.')
setv(3,'data_flow','Clears db_804D6BA0.b0 and b1. Update later uses b0 for efLib_AllocData and b1 for the generator allocator hsd_804D0F90.alloc_data, particle allocator hsd_804D0F60.alloc_data and HSD_PSAppSrt_804D10B0. Setup performs no allocator reconfiguration.')
setv(4,'game_mapping','Implements a DEVELOP-only controller control that snapshots each selected allocator\'s historical peak as its enforced live-object ceiling. Allocations may still increase used up to that peak; this does not freeze the current used count or total reserved heap storage. HSD_ObjAlloc returns NULL when enforcement is enabled and used >= num_limit, even if free entries exist.')
setv(4,'state_behavior','Inert unless DbLevel == DbLKind_Develop. Held B plus newly pressed D-pad Up toggles the effect allocator through b0; independently held A plus newly pressed Up toggles generator, particle and PSAppSrt allocators through b1. With both A and B held, both groups toggle, B first. Zero latches snapshot each allocator\'s own peak and enable; set latches disable enforcement without clearing numeric limits. No player-0 guard or local bounds check exists. The inspected caller invokes this for players 0..3, so multiple matching players can toggle shared state back in one caller pass. Setup or external allocator changes can desynchronize latches and enforcement.')
setv(5,'state_behavior','Maintains two independent software latches, cleared by setup without disabling allocator enforcement. At exact DEVELOP level, B plus newly pressed Up toggles the effect group and A plus newly pressed Up toggles the generator/particle/SRT group; both tests can run in the same call. Shared latches can be toggled repeatedly by the inspected four-player caller loop.')
def evidence(i):
 a,b=ranges[i];e=[ev(src,a,b,'Pinned owned source for this subject.')]
 if i==3:e.append(ev(src,15,62,'Consumers of setup latches.'))
 for r in support:
  p=r['path'];a,b=r['canonical_range'];yes=(i not in [0,2]) or p.endswith('/objalloc.h')
  if yes:e.append(ev(p,a,b,'Independently read foreign allocator, bitfield, or caller support; ownership not claimed.'))
 return e
subjects=[];proposal={'tu':tu,'proposal':{'facts':[],'links':[],'entities':[],'merges':[],'follow_ups':[]}}
for i,r in enumerate(rows):
 s={'subject':r['subject'],'canonical_range':ranges[i],'evidence':evidence(i),'facts':[],'review':changes.get((i,'purpose'),next((f['value'] for f in r['facts'] if f['type']=='purpose'),'Canonical signature, section or parameter uses reviewed.'))}
 if not r['facts']:s.update(disposition='reviewed_no_existing_facts',parameter_review='Canonical int player parameter is forwarded unchanged to button accessors; no ungrounded register alias added.')
 for f in r['facts']:
  v=changes.get((i,f['type']));d='supersede' if v else 'retain';why='Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.' if v else 'Pinned implementation and independently read supporting source substantiate the inherited claim.'
  s['facts'].append({'id':f['id'],'version':{'updated_at':f['updated_at'],'numeric_version':None},'type':f['type'],'value':f['value'],'disposition':d,'reason':why,'evidence':s['evidence']})
  if v:proposal['proposal']['facts'].append({'subject':r['subject'],'type':f['type'],'op':'write','value':v,'rationale':why,'confidence':0.98,'evidence':s['evidence']})
 subjects.append(s)
receipts=[]
for p in sorted((unit/'pages').glob('*.json')):
 r=json.load(open(p));match=re.match(r'(.*)\.(\d+)-(\d+)\.json',p.name);path=match[1].replace('__','/');a,b=int(match[2]),int(match[3]);phys=len((root/path).read_text().splitlines());receipts.append({'path':path,'canonical_range':[a,min(b,phys)],'rendered_range':[a,b],'source_sha256':next(x['sha256'] for x in m['files'] if x['path']==path),'artifact':str(p),'render_metadata':r['rendered']})
logs=[json.loads(l) for l in (unit/'reads.jsonl').read_text().splitlines() if json.loads(l).get('reader')=='dballoc_leaf'];start=min(x['at'] for x in logs);end=datetime.datetime.now(datetime.timezone.utc).isoformat();counts={'targets':5,'entities':2,'facts':sum(len(r['facts']) for r in rows),'proposals':len(proposal['proposal']['facts']),'dispositions':{d:sum(f['disposition']==d for s in subjects for f in s['facts']) for d in ['retain','supersede','reject','unresolved']}}
coverage={'campaign':m['campaign_id'],'tu':tu,'revision':rev,'reader':'dballoc_leaf','started_at':start,'completed_at':end,'read_receipts':receipts,'supporting_canonical_reads':support,'object_evidence':json.load(open(out/'object-evidence.json')),'subjects':subjects,'counts':counts,'exceptions':['Owned C62 physical lines/rendered63, zero substitutions or parse errors; final phantom blank excluded from citations.','No owned header in manifest. Foreign support remains foreign.','Existing object inspection is not a rebuild or source-object equivalence check.'],'unresolved':[]}
for n,v in [('coverage.json',coverage),('proposal.json',proposal)]: (out/n).write_text(json.dumps(v,indent=2)+'\n')
base=camp/'baseline-links/main__melee__db__dballoc.json';links=[]
for j,r in enumerate(json.load(open(base))):
 idx=[5,4,3,1][j];links.append({'id':r['id'],'baseline_record':r,'baseline_record_sha256':hashlib.sha256(json.dumps(r,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'disposition':'retain','reason':'Owned implementation supplies the developer allocation limiter relationship. Latches record local toggle branches, not authoritative allocator status; setup does not disable allocators.' if j==3 else 'Pinned implementation independently supports this subject implementing the developer allocation limiter.','evidence':evidence(idx)})
ledger={'tu':tu,'revision':rev,'baseline_path':str(base),'baseline_sha256':hashlib.sha256(base.read_bytes()).hexdigest(),'counts':{'total':4,'retain':4,'reject':0,'unresolved':0},'links':links};(out/'link-dispositions.json').write_text(json.dumps(ledger,indent=2)+'\n')
find=['# dballoc Semantic Findings','',f'Pinned revision `{rev}`.','']
for s in subjects:
 find+=['## '+next(iter(s['subject'].values())),'',s['review'],'']
 for f in s['facts']:find += [f"- {f['id']} @ {f['version']['updated_at']}: {f['disposition']} {f['type']}. {f['reason']}"]
 if not s['facts']:find += [s['parameter_review']]
 find+=['']
(out/'findings.md').write_text('\n'.join(find)+'\n')
nt=['# dballoc Naming Decisions','','Canonical names remain authoritative. No new aliases proposed.','','| Subject | Existing alias | Decision |','|---|---|---|']
for r in rows[:5]:
 f=next((f for f in r['facts'] if f['type']=='inferred_name'),None);nt += [f"| {name(r)} | {f['value'] if f else 'none'} | Retain supported semantic alias as hypothesis; canonical identity unchanged |"]
(out/'naming-table.md').write_text('\n'.join(nt)+'\n')
summary={'tu':tu,'revision':rev,'started_at':start,'completed_at':end,'status':'research_complete_pending_review','counts':counts,'link_counts':ledger['counts'],'artifacts':{n:str(out/n) for n in ['functionality.md','findings.md','naming-table.md','coverage.json','unresolved.md','proposal.json','link-dispositions.json']},'proposal_sha256':hashlib.sha256((out/'proposal.json').read_bytes()).hexdigest(),'link_dispositions_sha256':hashlib.sha256((out/'link-dispositions.json').read_bytes()).hexdigest()};(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
