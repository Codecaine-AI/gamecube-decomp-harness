import pathlib,json,hashlib,datetime
base=pathlib.Path('docs/.drafts/melee-semantic-20260908');campaign=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');rev='c302741689bd67c361cd7faadb221df3193992c3'
def ev(p,a,b,why):return {'kind':'code','locator':f'code://{rev}/{p}#L{a}-L{b}','why':why}
configs=[('main__melee__lb__lbvector','',{},{}),('main__melee__lb__lbbgflash','',{0:'The current TU has no embedded ColorOverlay or asset command loader; this belongs to the separate color-overlay family.',5:'The archived description conflates the separate scripted color-overlay module with the current direct-color/wipe singleton.',6:'No two-JObj IK solver occurs anywhere in the complete current owned source/header.',8:'The current singleton is static BSS and its GObjs do not allocate controller userdata from a four-record pool.',9:'No animation-asset loader or ColorOverlay advancement exists in the complete current TU.',11:'No articulated-chain state or IK solver exists in the current TU.',16:'The direct-color and wipe paths are present, but the asserted animated ColorOverlay processing is absent.',20:'The claimed script-driven activation path is not part of the current TU; timed/direct-color and wipe entry points are.',26:'An asset-driven animation manager is absent from the current owned source.'},{28:'Transparent-to-white transition is verified; exact defeat-sequence caller remains a family claim.',40:'Loop-scope declarations are observable, but PR rationale and causal register-coloring outcome are not established by canonical source alone.'}),('main__melee__lb__lbspdisplay','',{},{}),('main__melee__lb__lbsnap','',{31:'This routine writes a 64x32 image centered inside the 96x32 banner, not an archive-backed Memory Card icon.'},{27:'Album decode/texture use is verified; the separate preview consumer remains unreviewed.'}),('main__melee__gr__grtluigi','',{},{}),('main__melee__ft__ftbosslib','state',{81:'The predicate tests literal0x183; the shared Hand Entry initializer uses ftMh_MS_Entry, whose value is0x157. Reject the asserted Entry identity.'},{3:'Exact gmregclear Crazy Hand teardown branch not independently read by this cluster.',19:'Exact TagCrush consumer not independently read by this cluster.',30:'Local difficulty-indexed attribute selection is verified; starting-stamina semantic consumer is not.',40:'Exact Crazy Hand TagRockPaper consumer not independently read by this cluster.',44:'Exact Master Hand TagApplaud consumer not independently read by this cluster.',46:'Entry predicate is verified; the claimed entrance-progression consumer is not.',49:'Exact Classic post-defeat consumer not independently read by this cluster.',52:'Exact terminal defeat consumer not independently read by this cluster.',61:'Direct event callback behavior is read; Event50 table-position identity is not independently proved.',64:'Camera offset from Master Hand attribute is verified; scripted boss-controller consumer not independently read.',65:'Exact Crazy Hand controller states not independently read.',66:'Exact Classic controller states not independently read.',67:'Exact terminal defeat controller not independently read.',74:'Exact regular defeat slow-motion threshold consumer not independently read.',75:'Callback threshold use is read; Event50 identity needs independent table evidence.',77:'Broadcast fighter/item calls are verified; exact half-HP transition consumer is not.'}),('main__melee__ft__ftcamera','update',{}, {})]
for tid,cluster,reject,unresolved in configs:
 out=base/tid/cluster;c=json.load(open(out/'coverage.json'));tu=c['tu'];src='src/'+tu.removeprefix('main/')+'.c';records=json.load(open(campaign/'baseline-links'/f'{tid}.json'));subjects={next(iter(s['subject'].values())):s for s in c['subjects']};result=[];skipped=[]
 for ix,l in enumerate(records):
  key=(l['from_target_id'].removeprefix('target:function:').removeprefix('target:data:') if l['from_target_id'] else l['from_entity_id'].removeprefix('translation_unit:'))
  s=subjects.get(key)
  if s is None:
   if cluster:skipped.append(l['id']);continue
   raise RuntimeError((tid,key))
  es=[]
  for f in s.get('facts',[]):
   for e in f.get('evidence',[]):
    if e not in es:es.append(e)
  if not es and s.get('canonical_range'):es=[ev(src,*s['canonical_range'],'Complete canonical subject implementation.')]
  if not es:raise RuntimeError((tid,key,'no evidence'))
  # Whole-TU relationships use the owned implementation rather than inherited old locators.
  if key==src:
   phys={'main__melee__lb__lbbgflash':504,'main__melee__lb__lbsnap':491,'main__melee__lb__lbspdisplay':906,'main__melee__gr__grtluigi':142}.get(tid)
   if phys:es.insert(0,ev(src,1,phys,'Complete owned TU reviewed; current definitions establish presence or absence of the asserted subsystem.'))
  disp='reject' if ix in reject else 'unresolved' if ix in unresolved else 'retain';why=reject.get(ix,unresolved.get(ix,'Current canonical behavior and previously independently read support substantiate the relation.'))
  if tid.endswith('lbbgflash') and ix in [4,10,21,24,34]:why+=' Duration supplies interpolation steps, not an exact countdown guarantee; zero steps or invalid row heights can stall.'
  if tid.endswith('lbvector') and ix in [1,6]:why+=' Standard principal-axis form uses approximate trig and requires selector1,2,4; other selectors are not defined.'
  if tid.endswith('lbvector') and ix in [0]:why+=' Only supported camera projection modes return a result; unsupported modes return NULL.'
  if tid.endswith('lbsnap') and ix in [0,5,7,17]:why+=' The generated image is a64x32 banner component, not a newly generated32x32 icon.'
  if tid.endswith('lbsnap') and ix==9:why+=' Filename uniqueness is only relative to the supplied cached catalog.'
  if tid.endswith('lbsnap') and ix in [22,34]:why+=' Initialization is partial; it does not clear all caller-owned workspace state.'
  if tid.endswith('lbspdisplay') and ix in [21,30]:why+=' Construction leaves blur-size/tint fields untouched and the current pointer-returning definition has no C return statement.'
  if tid.endswith('lbspdisplay') and ix in [13,29]:why+=' Signed input is assigned into u8 and can wrap.'
  if tid.endswith('lbspdisplay') and ix in [3,26]:why+=' All21 samples execute even at zero blur size or zero caller alpha; synthetic negative-index stack temporaries remain a source limitation.'
  if tid.endswith('ftbosslib') and ix in [26,80,81]:es += [ev('src/melee/ft/kinds/ftMasterHand/forward.h',22,75,'Shared Hand motion enumeration.'),ev('src/melee/ft/kinds/ftCommon/forward.h',626,631,'Common motion count used as Hand base.'),ev('src/melee/ft/kinds/ftCrazyHand/ftcrazyhandentry.c',1,47,'Current Crazy Hand Entry initializer.')]
  # Include bounded supporting reads already recorded during the original review.
  for r in c.get('supporting_canonical_reads',c.get('external_reads',[])):
   p=r['path'];ranges=r.get('canonical_ranges',[r['canonical_range']] if 'canonical_range' in r else [])
   relevant=(tid.endswith('lbvector') and ix in [3,4] and p.endswith('/ifstock.c')) or (tid.endswith('ftcamera')) or (tid.endswith('ftbosslib') and ix in [6,79] and p.endswith('/ftmasterhandwait10.c')) or (tid.endswith('ftbosslib') and ix==60 and p.endswith('/gmevent.c'))
   if relevant:
    for a,b in ranges:
     if p.endswith('ftCo_WarpStar.c'):b=min(b,235)
     es.append(ev(p,a,b,'Independently read original-review supporting caller.'))
  result.append({'id':l['id'],'baseline_record':l,'version':{'updated_at':None,'record_sha256':hashlib.sha256(json.dumps(l,sort_keys=True,separators=(',',':')).encode()).hexdigest()},'disposition':disp,'reason':why,'evidence':es})
 payload={'tu':tu,'cluster':cluster or None,'revision':rev,'baseline_path':str(campaign/'baseline-links'/f'{tid}.json'),'baseline_sha256':hashlib.sha256((campaign/'baseline-links'/f'{tid}.json').read_bytes()).hexdigest(),'reviewed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'counts':{'total':len(result),**{d:sum(r['disposition']==d for r in result) for d in ['retain','reject','unresolved']}},'links':result,'outside_cluster_link_ids':skipped,'policy':'Read-only baseline review. No DB link deletion or mutation.'};(out/'link-dispositions.json').write_text(json.dumps(payload,indent=2)+'\n');print(tid,cluster,payload['counts'],'outside',len(skipped))
