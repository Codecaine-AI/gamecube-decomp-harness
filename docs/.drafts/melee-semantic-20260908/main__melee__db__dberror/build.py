import json,pathlib,re,hashlib,datetime
out=pathlib.Path(__file__).parent;camp=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');m=json.load(open(camp/'manifest.json'));root=pathlib.Path(m['checkout_root']);rev=m['head_revision'];tu='main/melee/db/dberror';src='src/melee/db/dberror.c';unit=camp/'units/main__melee__db__dberror';rows=json.load(open(out/'facts.json'));support=json.load(open(out/'supporting-reads.json'))
def ev(p,a,b,why):return {'kind':'code','locator':f'code://{rev}/{p}#L{a}-L{b}','why':why}
def name(r):return next(iter(r['subject'].values())).split(':')[-1].split('#')[0]
ranges={0:(27,60),1:(16,25),2:(62,81),3:(27,37),4:(39,60),5:(1,81),6:(27,37),7:(39,60),8:(39,60)}
changes={}
def setv(i,t,v):changes[i,t]=v
def old(i,t):return next(f['value'] for f in rows[i]['facts'] if f['type']==t)
def add(i,t,v):setv(i,t,old(i,t)+' '+v)
setv(0,'inferred_type','Compiler-generated OSReport format string "%s\\n" has four bytes including its terminator. Existing source .sdata is four bytes; split .sdata is eight bytes with four trailing zero padding bytes. Both have alignment 8. Existing-object observations do not certify fresh source-object equivalence.')
setv(1,'purpose','Masks saved FPSCR with 0x000FFFFF and reloads the current FPU context after setting MSR mask 0x900. This precisely clears stored high twelve FPSCR bits while retaining low twenty; it should not be interpreted as clearing every possible exception-related FPSCR field.')
setv(1,'state_behavior','Unconditionally writes current MSR | 0x900, saves FPU state into the current context, applies fpscr &= 0x000FFFFF and reloads it. No old MSR restoration or null-context check exists locally. The save also marks the context FPU-state bit and refreshes FPR/conditional paired-single state. The masks are idempotent if no intervening state changes occur; they do not guarantee permanent processor configuration.')
add(1,'data_flow','OSSaveFPUContext also marks the context FPU-state bit and copies FPRs and conditional paired-single state, so the current saved context itself is an additional output.')
setv(2,'state_behavior','A nonzero DBIsDebuggerPresent result leaves setup unchanged. Every zero-result invocation allocates a fresh 0x2000-byte low-arena block, resets report-console state and installs the report callback, replaces the HSD panic callback, and replaces OS handlers for 0..15 except 4,7,8,9. There is no once-only guard, restoration of prior callbacks, or arena-capacity check in this path; skipped OS entries are untouched. DBIsDebuggerPresent also returns zero when its interface pointer is NULL.')
setv(3,'state_behavior','Clears both HSD user retrace callbacks, cancels the lb_0195 alarm if active, prints the timestamp and up to 16 stack entries, writes (0x1388+15)>>4 = 313 through hsd_80397DFC, stores DbLevel, then calls the context-thread helper. That helper creates and resumes a thread without checking OSCreateThread success; it has no explicit nonreturning transfer. The panic caller proceeds to OSPanic if this callback returns.')
setv(4,'state_behavior','First extracts DSISR and DAR from two unnamed int arguments, then clears both user retrace callbacks, cancels the lb_0195 alarm if active, prints the timestamp, reports up to 16 stack entries and exception details, stores the size-derived value 313 and DbLevel, and invokes the context-thread helper. va_end executes if the helper returns. The inspected OS dispatcher supplies DSISR then DAR, calls the handler only with SRR1 recoverability set, and disables scheduling around the callback; the wrapper does not itself guarantee debugger-thread execution or terminal handling.')
setv(5,'state_behavior','Every setup call without reported debugger presence allocates another 8 KiB and replaces report, panic and selected OS handlers; no once-only guard exists. OS codes 4,7,8,9 are untouched. Both crash callbacks clear user retrace hooks and cancel the lb_0195 alarm if active before diagnostics. The FPU helper is independent and unconditional, applying exact MSR and FPSCR masks without restoring the old MSR.')
def evidence(i):
 a,b=ranges[i];e=[ev(src,a,b,'Pinned owned implementation for this subject.')]
 for r in support:
  p=r['path'];a,b=r['canonical_range']
  yes=(p.endswith('/OSContext.c') if i==1 else not p.endswith('/OSContext.c')) or i==5
  if yes:e.append(ev(p,a,b,'Independently read foreign callback, setter or SDK support; ownership not claimed.'))
 return e
subjects=[];proposal={'tu':tu,'proposal':{'facts':[],'links':[],'entities':[],'merges':[],'follow_ups':[]}}
for i,r in enumerate(rows):
 s={'subject':r['subject'],'canonical_range':ranges[i],'evidence':evidence(i),'facts':[],'review':changes.get((i,'purpose'),next((f['value'] for f in r['facts'] if f['type']=='purpose'),'Canonical signature, section or parameter uses reviewed.'))}
 if not r['facts']:s.update(disposition='reviewed_no_existing_facts',parameter_review='Canonical callback parameter uses read; no speculative register-to-parameter naming fact added.')
 for f in r['facts']:
  v=changes.get((i,f['type']));d='supersede' if v else 'retain';why='Correct or narrow inherited claim with pinned canonical source and saved existing-object observations.' if v else 'Pinned implementation and independently read supporting source substantiate the inherited claim.'
  s['facts'].append({'id':f['id'],'version':{'updated_at':f['updated_at'],'numeric_version':None},'type':f['type'],'value':f['value'],'disposition':d,'reason':why,'evidence':s['evidence']})
  if v:proposal['proposal']['facts'].append({'subject':r['subject'],'type':f['type'],'op':'write','value':v,'rationale':why,'confidence':0.98,'evidence':s['evidence']})
 subjects.append(s)
receipts=[]
for p in sorted((unit/'pages').glob('*.json')):
 r=json.load(open(p));match=re.match(r'(.*)\.(\d+)-(\d+)\.json',p.name);path=match[1].replace('__','/');a,b=int(match[2]),int(match[3]);phys=len((root/path).read_text().splitlines());receipts.append({'path':path,'canonical_range':[a,min(b,phys)],'rendered_range':[a,b],'source_sha256':next(x['sha256'] for x in m['files'] if x['path']==path),'artifact':str(p),'render_metadata':r['rendered']})
logs=[json.loads(l) for l in (unit/'reads.jsonl').read_text().splitlines() if json.loads(l).get('reader')=='dberror_leaf'];start=min(x['at'] for x in logs);end=datetime.datetime.now(datetime.timezone.utc).isoformat();counts={'targets':5,'entities':4,'facts':sum(len(r['facts']) for r in rows),'proposals':len(proposal['proposal']['facts']),'dispositions':{d:sum(f['disposition']==d for s in subjects for f in s['facts']) for d in ['retain','supersede','reject','unresolved']}}
coverage={'campaign':m['campaign_id'],'tu':tu,'revision':rev,'reader':'dberror_leaf','started_at':start,'completed_at':end,'read_receipts':receipts,'supporting_canonical_reads':support,'object_evidence':json.load(open(out/'object-evidence.json')),'subjects':subjects,'counts':counts,'exceptions':['Owned C81 physical lines/rendered82, two substitutions and three parse errors; final phantom blank excluded from citations. Canonical source resolves parse-uncertain callback reads.','No owned header in manifest. Foreign support remains foreign.','Existing object inspection is not a rebuild or source-object equivalence check.'],'unresolved':[]}
for n,v in [('coverage.json',coverage),('proposal.json',proposal)]: (out/n).write_text(json.dumps(v,indent=2)+'\n')
base=camp/'baseline-links/main__melee__db__dberror.json';links=[]
for j,r in enumerate(json.load(open(base))):
 idx=[5,4,4,3,2,0][j];links.append({'id':r['id'],'baseline_record':r,'baseline_record_sha256':hashlib.sha256(json.dumps(r,sort_keys=True,separators=(',',':')).encode()).hexdigest(),'disposition':'retain','reason':'Pinned setup, callbacks and shared timestamp format independently support the existing diagnostic relationship.','evidence':evidence(idx)})
ledger={'tu':tu,'revision':rev,'baseline_path':str(base),'baseline_sha256':hashlib.sha256(base.read_bytes()).hexdigest(),'counts':{'total':6,'retain':6,'reject':0,'unresolved':0},'links':links};(out/'link-dispositions.json').write_text(json.dumps(ledger,indent=2)+'\n')
find=['# dberror Semantic Findings','',f'Pinned revision `{rev}`.','']
for s in subjects:
 find+=['## '+next(iter(s['subject'].values())),'',s['review'],'']
 for f in s['facts']:find += [f"- {f['id']} @ {f['version']['updated_at']}: {f['disposition']} {f['type']}. {f['reason']}"]
 if not s['facts']:find += [s['parameter_review']]
 find+=['']
(out/'findings.md').write_text('\n'.join(find)+'\n')
nt=['# dberror Naming Decisions','','Canonical names remain authoritative. No new aliases proposed.','','| Subject | Existing alias | Decision |','|---|---|---|']
for r in rows[:5]:
 f=next((f for f in r['facts'] if f['type']=='inferred_name'),None);nt += [f"| {name(r)} | {f['value'] if f else 'none'} | Retain supported semantic alias as hypothesis; canonical identity unchanged |"]
(out/'naming-table.md').write_text('\n'.join(nt)+'\n')
summary={'tu':tu,'revision':rev,'started_at':start,'completed_at':end,'status':'research_complete_pending_review','counts':counts,'link_counts':ledger['counts'],'artifacts':{n:str(out/n) for n in ['functionality.md','findings.md','naming-table.md','coverage.json','unresolved.md','proposal.json','link-dispositions.json']},'proposal_sha256':hashlib.sha256((out/'proposal.json').read_bytes()).hexdigest(),'link_dispositions_sha256':hashlib.sha256((out/'link-dispositions.json').read_bytes()).hexdigest()};(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary))
