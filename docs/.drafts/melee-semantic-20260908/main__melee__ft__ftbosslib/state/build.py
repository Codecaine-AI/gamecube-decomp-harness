import json,pathlib,hashlib,datetime
out=pathlib.Path(__file__).parent
m=json.load(open('games/melee/state/knowledge_v2/semantic-sweep-20260908/manifest.json'));rev=m['head_revision'];tu='main/melee/ft/ftbosslib';src='src/melee/ft/ftbosslib.c'
rows=json.load(open(out/'fact-inventory.json'))
data={
'IsMasterHandEntry':(158,165,"Returns whether Master Hand's queried motion equals the canonical ftMh_MS_Entry constant."),
'8015C2A8':(167,175,'Returns whether Crazy Hand\'s queried motion ID equals 0x183. The current Entry initializer uses ftMh_MS_Entry; it does not establish that 0x183 means Entry.'),
'8015C2E0':(177,186,'Returns true for Master Hand motion IDs 0x158 or 0x159 and false otherwise.'),
'8015C31C':(188,197,'Returns true for Crazy Hand motion IDs 0x181 or 0x182 and false otherwise.'),
'8015C358':(199,207,'Returns true when Master Hand exists and its Fighter x221F_b3 flag is set; returns false otherwise.'),
'8015C3A0':(209,217,'Returns true when Crazy Hand exists and its Fighter x221F_b3 flag is set; returns false otherwise.'),
'GetFighterGObj':(219,232,'Traverses the global fighter list and returns the first GObj whose ftLib_GetKind equals the requested FighterKind, or NULL when no match exists.'),
'GetMotionId':(234,245,'Looks up the requested FighterKind and returns ftLib_GetMotionId for the first matching GObj, or ftCo_MS_DeadDown if none exists.'),
'8015C4C4':(247,258,'Returns Crazy Hand\'s stored u.mh.x2250 value, or zero when Crazy Hand is absent. This stored selection is separate from the GetMotionId query.'),
'8015C530':(260,287,'Selects Master Hand extended attributes x0, x4, x8, xC or x10 for cpu_level 0 through 4; every other value selects x14. Returns zero when Master Hand is absent.'),
'8015C5F8':(289,306,'Uses HSD_Randi(4) to choose a branch that plays SFX 0x4E21A through 0x4E21D for the supplied Fighter, with playback arguments 0x7F and 0x40.'),
'8015C6BC':(308,336,'Returns the active Master Hand Fighter\'s ft_data->ext_attr pointer. Returns NULL for absent GObj, absent userdata or absent ext_attr; ft_data itself is not null-checked.'),
'8015C74C':(338,348,'Returns Master Hand special attribute x164, or -1 when the attribute lookup fails.'),
'8015C7EC':(350,360,'Returns Master Hand special attribute x168, or -1 when the attribute lookup fails.'),
'8015C88C':(362,372,'Returns Master Hand special attribute x16C, or -1 when the attribute lookup fails.'),
'8015C92C':(374,384,'Returns Master Hand special attribute x170, or -1 when the attribute lookup fails.'),
'8015C9CC':(386,396,'Returns Master Hand special attribute x174, or -1 when the attribute lookup fails.'),
'8015CA6C':(398,421,'Forwards its integer to Player_80036790 for slot zero, and to ftLib_80086A4C for each present Hand GObj; then calls it_8026C3FC.'),
'8015CB7C':(423,426,'Unconditionally delegates to it_8026C42C and returns no value.'),
'8015CB9C':(428,442,'Loads the selected player coordinates, passes them to Camera_8002E818, offsets a copy on Z by Master Hand x178 or -1 if unavailable, passes it to Camera_8002EA64, then calls Camera_8002F0E4 with 10.'),
'8015CC14':(444,447,'Unconditionally calls Camera_SetModeToStandard.')}
def ev(p,a,b,why):return {'kind':'code','locator':f'code://{rev}/{p}#L{a}-L{b}','why':why}
proposal={'tu':tu,'proposal':{'facts':[],'links':[],'entities':[],'merges':[],'follow_ups':[]}}
coverage=[]
clear={'GetFighterGObj','GetMotionId','IsMasterHandEntry','8015C2A8'}
retained_names={'8015C5F8','8015C6BC','8015CC14'}
# Semantics that require foreign context are reviewed below; unverified complete claims remain unresolved.
for row in rows:
 subject=row['subject'];key=next(iter(subject.values()));name=key.split(':')[-1].split('#')[0].removeprefix('ftBossLib_');canonical={'8015C3E8':'GetFighterGObj','8015C44C':'GetMotionId'}.get(name,name);a,b,purpose=data[canonical]
 evidence=[ev(src,a,b,'Complete current implementation establishes the local behavior and signature.')]
 item={'subject':subject,'canonical_symbol':'ftBossLib_'+canonical,'canonical_range':[a,b],'fact_count':len(row['facts']),'facts':[],'review':purpose}
 if 'entity_locator' in subject:
  item['disposition']='reviewed_no_existing_facts';item['review']+=' Parameter identity retained; historical C3E8/C44C locator migration is deferred to the coordinator, with no merge proposed.'
 else:
  for f in row['facts']:
   typ=f['type'];decision='unresolved';reason='Local behavior is supported, but the full inherited claim includes external consumer or domain details not independently verified in this cluster. Preserve pending family or caller review.'
   if typ=='inferred_name' and name in clear:
    decision='reject' if name=='8015C2A8' else 'supersede';reason='Current canonical name is authoritative; the inherited alias is redundant or displaces it.' if name!='8015C2A8' else '0x183 equality does not establish Entry. The pinned Crazy Hand Entry initializer uses ftMh_MS_Entry, so inherited Entry identification lacks support.'
    proposal['proposal']['facts'].append({'subject':subject,'type':typ,'op':'clear','value':'','rationale':reason,'confidence':0.99,'evidence':evidence})
   elif typ=='inferred_name' and name in retained_names:
    decision='retain';reason='The complete implementation directly supports the descriptive alias; it remains inferred, not canonical.'
   elif typ=='purpose':
    decision='supersede';reason='Refresh to complete locally established behavior with pinned citations; preserve wider unresolved consumer claims in this review.'
    proposal['proposal']['facts'].append({'subject':subject,'type':typ,'op':'write','value':purpose,'rationale':reason,'confidence':0.98,'evidence':evidence})
   elif typ=='inferred_type' and name not in {'8015C530','8015C74C','8015C7EC','8015C88C','8015C92C','8015CA6C','8015CB9C','8015C4C4'}:
    decision='retain';reason='Current declaration and return paths independently confirm the stated signature and local type behavior.'
   elif name in {'8015C6BC','8015C9CC','8015CC14'} and typ in {'data_flow','state_behavior'}:
    decision='retain';reason='The complete local implementation and adjacent helper support the stated flow and failure behavior.'
   elif name=='GetFighterGObj' and typ=='state_behavior':
    decision='retain';reason='Full traversal contains only reads and returns, with no allocation or persistent writes.'
   elif name=='8015C2A8' and typ in {'game_mapping','state_behavior'}:
    decision='supersede';reason='Remove unsupported Entry equivalence; keep the observed literal motion test.'
    proposal['proposal']['facts'].append({'subject':subject,'type':typ,'op':'write','value':'Queries Crazy Hand and returns true exactly when the motion-ID query returns 0x183; all other query results return false.','rationale':reason,'confidence':0.99,'evidence':evidence})
   elif name=='8015C2A8' and typ=='data_flow':decision='retain';reason='Complete function confirms Crazy Hand input, 0x183 comparison and Boolean output.'
   item['facts'].append({'id':f['id'],'version':{'updated_at':f['updated_at'],'numeric_version':None},'type':typ,'value':f['value'],'disposition':decision,'reason':reason,'evidence':evidence})
 coverage.append(item)
# Independently confirmed foreign behavior, proposed only on owned function targets.
external_claims=[
 ('8015C88C','data_flow','Returns x16C; fn_8017C1A4 adds it after x164 and passes it to lbBgFlash_80020688 at the initial defeat threshold.','src/melee/gm/gm_17C0.c',106,109,212,253),
 ('8015C9CC','data_flow','Returns x174; fn_8017C1A4 adds it after x164 plus x16C, passes it to lbBgFlash_800205F0 at that intermediate threshold, and exits after the final cumulative threshold.','src/melee/gm/gm_17C0.c',106,109,212,253),
 ('8015CB7C','state_behavior','Visits every current active item through it_8026C42C. For each, x7 independently sets x5 and x3 independently clears itself; repeated calls are idempotent for these writes.','src/melee/it/it_26B1.c',1155,1169,1155,1169),
 ('8015CB9C','data_flow','The unmodified loaded player coordinates become camera target_interest. A Z-offset copy becomes target_position. The final camera call sets progress to zero, terminal count to 10 and captures current interest, position and field of view.','src/melee/cm/camera.c',3106,3130,3378,3423)]
for name,typ,value,p,a,b,c,d in external_claims:
 la,lb,_=data[name];e=[ev(src,la,lb,'Owned producer.'),ev(p,a,b,'Independent current consumer or callee.'),ev(p,c,d,'Independent current state and data flow.')]
 if name=='8015CB9C':e.append(ev(p,3180,3202,'Copies fixed target position.'))
 proposal['proposal']['facts'].append({'subject':{'target_stable_key':tu+':ftBossLib_'+name},'type':typ,'op':'write','value':value,'rationale':'Independent pinned canonical read confirms this cross-file flow; shared field naming remains deferred.','confidence':0.98,'evidence':e})
 for item in coverage:
  if item['subject'].get('target_stable_key')==tu+':ftBossLib_'+name:
   for f in item['facts']:
    if f['type']==typ:f.update(disposition='supersede',reason='Replaced by independently confirmed pinned cross-file claim.',evidence=e)
# retained inferred names needing independently read callers
for item in coverage:
 n=item['canonical_symbol'].removeprefix('ftBossLib_')
 if n in {'8015C4C4','8015C74C','8015CB9C'}:
  for f in item['facts']:
   if f['type']=='inferred_name':
    f['disposition']='retain';f['reason']='Independent current caller or callee confirms descriptive selection, delay or camera transition role; alias is inferred.'
    p,a,b={'8015C4C4':('src/melee/ft/kinds/ftMasterHand/ftmasterhandwait10.c',222,247),'8015C74C':('src/melee/gm/gmevent.c',2407,2488),'8015CB9C':('src/melee/cm/camera.c',3378,3423)}[n];f['evidence'].append(ev(p,a,b,'Independent name support.'))
receipts=[]
for a,b,p in [(158,397,src),(398,448,src),(1,53,'src/melee/ft/ftbosslib.dox')]:
 path=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftbosslib/pages')/(p.replace('/','__')+f'.{a}-{b}.json');page=json.load(open(path));render=page['rendered'];receipts.append({'path':p,'sha256':next(f['sha256'] for f in m['files'] if f['path']==p),'canonical_range':[a,b],'rendered_range':[render['start_line'],render['end_line']],'render_metadata':{k:v for k,v in render.items() if k not in ['content','text','symbols','rendered_source']},'artifact':str(path)})
counts={d:sum(f['disposition']==d for i in coverage for f in i['facts']) for d in ['retain','supersede','reject','unresolved']}
result={'campaign':m['campaign_id'],'tu':tu,'cluster':'state','revision':rev,'reader':'boss_state','owned_files_read':receipts,'subjects':coverage,'counts':{'targets':21,'entities':8,'facts':sum(len(i['facts']) for i in coverage),'dispositions':counts,'proposals':len(proposal['proposal']['facts'])},'exceptions':['C source has 447 physical newline-terminated lines and renderer includes trailing empty line 448. Dox likewise has 52 physical lines and renderer includes trailing line 53.','One external read batch exceeded it_26B1.c EOF after printing L1169; no owned read failed.','Shared Fighter bit meanings and Hand type field naming remain family review; no shared entity claims proposed.'],'unresolved':['Full inherited partner callback claims require separate caller review.','Crazy Hand literal 0x183 is not proven Entry; current entry initializer uses shared ftMh_MS_Entry.','Event-specific x170 name retained as unresolved until event-number binding and flash implementation are checked.']}
(out/'proposal.json').write_text(json.dumps(proposal,indent=2)+'\n');(out/'coverage.json').write_text(json.dumps(result,indent=2)+'\n')
lines=['# Boss State Review','',f'Pinned revision `{rev}`. Applied unslop writing guidance.','', 'Canonical and rendered reads cover source L158-448 and full dox L1-53. The source has 447 physical lines; the renderer exposes its final empty line as 448. No shared KB or canonical source was changed.','', '## Findings','', 'Canonical GetFighterGObj and GetMotionId are authoritative; their identical inherited aliases should clear. IsMasterHandEntry should keep its canonical spelling and clear IsMasterHandInEntry. Crazy Hand 0x183 must not inherit an Entry label merely because a separate initializer enters the shared ftMh_MS_Entry constant.','', 'GetFighterGObj returns the first match, not a unique-kind guarantee. GetMotionId makes absence indistinguishable from an actual DeadDown return. Special-attribute access checks GObj, userdata and ext_attr, but assumes ft_data exists. Flag predicates guard absent GObjs, not malformed Fighter userdata.','', 'Fresh consumer reads locate x16C and x174 use in gm_17C0.c L106-109 and L212-253. They drive successive background-flash calls and cumulative controller thresholds. The old loss of gmregclear evidence does not make these consumers absent. Camera setup passes an unmodified interest vector and a Z-offset position vector, then starts a count-10 transition. Item reset independently propagates x7 to x5 and clears x3.','', '## Subject Reviews','']
for i in coverage:
 lines += ['### '+next(iter(i['subject'].values())), '',i['review'],'']
 for f in i['facts']:lines += [f"- `{f['id']}` at `{f['version']['updated_at']}`: {f['disposition']}. {f['type']}. {f['reason']}"]
 lines+=['']
lines+=['## Evidence and Limits','','Exact claims, IDs, versions, current evidence locators and read receipts are in coverage.json. Proposed changes require independent review, especially the four cross-file facts. All unresolved inherited claims remain in the baseline pending that review. No entities, merges, links or follow-ups are included in the proposal envelope.']
(out/'findings.md').write_text('\n'.join(lines)+'\n');print(json.dumps(result['counts']))
