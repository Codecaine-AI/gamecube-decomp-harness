import pathlib,json,hashlib,datetime,copy,re
base=pathlib.Path('docs/.drafts/melee-semantic-20260908');campaign=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');m=json.load(open(campaign/'manifest.json'));rev=m['head_revision'];root=pathlib.Path(m['checkout_root'])
def ev(p,a,b,why):return {'kind':'code','locator':f'code://{rev}/{p}#L{a}-L{b}','why':why}
for short,clusters in [('ftcamera',['setup','update']),('ftbosslib',['movement','state'])]:
 tid='main__melee__ft__'+short;out=base/tid;src='src/melee/ft/'+short+'.c';baseline=campaign/'baseline-links'/f'{tid}.json';raw=json.load(open(baseline));existing={};origins=[]
 for cluster in clusters:
  p=out/cluster/'link-dispositions.json';x=json.load(open(p));origins.append({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'counts':x['counts']})
  for r in x['links']:
   q=copy.deepcopy(r);lid=q.get('id',q.get('link_id'));assert lid not in existing;existing[lid]=q
 added=[];result=[]
 for ix,l in enumerate(raw):
  lid=l['id']
  if lid in existing:
   q=existing[lid];assert q['baseline_record']==l
  else:
   assert l['from_entity_id']=='translation_unit:'+src
   disp='retain';reason='Pinned canonical implementation directly supports this TU-level relationship. The archived wording is not used as independent source evidence.'
   es=[ev(src,1,114 if short=='ftcamera' else 447,'Complete owned canonical implementation inspected across current and original cluster reads.'),ev(src.removesuffix('.c')+'.h',1,14 if short=='ftcamera' else 45,'Complete public entry point declarations.')]
   if short=='ftcamera':
    es += [ev(src,20,47,'Initial active camera subject, framing extents and position.'),ev(src,51,114,'Per-fighter updates and top-blast-zone adjustment.')]
   else:
    es += [ev(src,158,287,'Explicit Hand kind lookup, motion/state predicates and selected attributes.'),ev(src,308,447,'Master Hand attributes and present-Hand dispatch/camera operations.')]
    if ix in [2,63]:disp='unresolved';reason='Direct Crazy Hand lookup and operations are verified, but the inherited game-mode controller configuration/spawn/run details were not independently read.'
    if ix in [18,43]:disp='unresolved';reason='Local paired-action predicates are verified; the inherited TagCrush/other named synchronization consumers remain pending in the state cluster.'
    if ix==4:
     es += [ev('src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c',217,247,'Previously independently read motion and private-phase dispatch consumer.')]
    if ix in [10,11,14,15,41]:
     # Reuse already reviewed exact caller evidence from the movement cluster; preserve its decisions.
     symbols={10:'ftBossLib_8015C09C',11:'ftBossLib_8015C09C',14:'ftBossLib_8015BD24',15:'ftBossLib_8015BD24',41:'ftBossLib_8015BF74'}
     for r in existing.values():
      if (r['baseline_record'].get('from_target_id') or '').endswith(':'+symbols[ix]):
       for e in r['evidence']:
        if e not in es:es.append(e)
     reason='Retain TU relationship using the completed movement-cluster exact caller review plus the fully inspected current TU. Cluster decisions are preserved.'
    if ix==20:es += [ev(src,289,306,'Four-way authored SFX selection and ft_PlaySFX dispatch.')]
   q={'id':lid,'baseline_record':l,'version':{'updated_at':None,'record_sha256':hashlib.sha256(json.dumps(l,sort_keys=True,separators=(',',':')).encode()).hexdigest()},'disposition':disp,'reason':reason,'evidence':es};added.append(lid)
  # Keep the originating record fields and decisions intact; normalize only an additional lookup key.
  q.setdefault('id',lid)
  for e in q['evidence']:
   match=re.fullmatch(r'code://([^/]+)/(.*)#L(\d+)-L(\d+)',e['locator'])
   assert match and match[1]==rev
   physical=len((root/match[2]).read_text().splitlines())
   if int(match[4])>physical:
    e['originating_locator']=e['locator'];e['locator']=f'code://{rev}/{match[2]}#L{match[3]}-L{physical}'
    e['range_normalization']='Excluded trailing rendered blank lines beyond physical EOF; original cluster ledger remains unchanged.'
  result.append(q)
 assert len(result)==len(raw) and len({q['id'] for q in result})==len(raw)
 reads=[]
 for p,a,b in ([(src,1,114),(src.removesuffix('.c')+'.h',1,14)] if short=='ftcamera' else [(src,1,157),(src.removesuffix('.c')+'.h',1,45)]):
  rb=(root/p).read_bytes();reads.append({'path':p,'canonical_range':[a,b],'source_sha256':hashlib.sha256(rb).hexdigest(),'read_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})
 payload={'tu':'main/melee/ft/'+short,'revision':rev,'baseline_path':str(baseline),'baseline_sha256':hashlib.sha256(baseline.read_bytes()).hexdigest(),'reviewed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'counts':{'total':len(result),**{d:sum(r['disposition']==d for r in result) for d in ['retain','reject','unresolved']}},'links':result,'cluster_inputs':origins,'new_tu_relationship_count':len(added),'new_tu_relationship_ids':added,'additional_canonical_reads':reads,'database_changes':False,'policy':'Consolidation preserves all originating cluster decisions and baseline records. No proposal or accepted cluster ledger is changed.'};p=out/'link-dispositions.json';p.write_text(json.dumps(payload,indent=2)+'\n');print(short,payload['counts'],hashlib.sha256(p.read_bytes()).hexdigest())
