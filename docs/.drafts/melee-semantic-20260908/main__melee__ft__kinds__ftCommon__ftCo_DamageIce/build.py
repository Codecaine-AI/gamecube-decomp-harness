import json,pathlib,hashlib,datetime,struct,shutil
D=pathlib.Path('docs/.drafts/melee-semantic-20260908/main__melee__ft__kinds__ftCommon__ftCo_DamageIce');S=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');M=json.load(open(S/'manifest.json'));R=M['head_revision'];root=pathlib.Path(M['checkout_root']);C=json.load(open(D/'context.json'));X=json.load(open(D/'baseline-facts.json'));tu=C['task']['tu'];P=C['task']['source_path'];U=S/'units'/C['task']['id'];start='2026-09-08T16:07:21Z'
def c(p,a,b):
 assert 1<=a<=b<=len((root/p).read_text().splitlines()),(p,a,b)
 return f'code://{R}/{p}#L{a}-L{b}'
foreign=[]
def add(p,*pairs):
 for a,b in pairs:foreign.append(('src/melee/'+p,a,b))
for p,pairs in json.load(open(D/'foreign-ranges.json')).items():add(p,*pairs)
foreign.append(('src/sysdolphin/baselib/jobj.h',598,605))
# Reuse bounded dependency reads from completed DamageFall packet in this same session.
for row in json.load(open(D.parent/'main__melee__ft__kinds__ftCommon__ftCo_DamageFall/coverage.json'))['foreign_evidence_reads']:
 if any(q in row['path'] for q in ['PassiveStand','Passive.c','DownBound','ftcommon.c']):foreign.append((row['path'],row['start_line'],row['end_line']))
fr=[]
for p,a,b in foreign:
 c(p,a,b);t=(root/p).read_text();fr.append(dict(path=p,start_line=a,end_line=b,sha256=hashlib.sha256(t.encode()).hexdigest(),canonical_read=True,rendered_read=False,ownership='foreign evidence only'));(D/(p.replace('/','__')+f'.{a}-{b}.txt')).write_text('\n'.join(f'{i}: {l}' for i,l in enumerate(t.splitlines(),1) if a<=i<=b))
E=[c(P,1,514)]+[c(p,a,b) for p,a,b in foreign]
report=root/'build/GALE01/report.json';rh=hashlib.sha256(report.read_bytes()).hexdigest();assert rh==M['report_sha256'];unit=next(u for u in json.load(open(report))['units'] if u['name']==tu);objects=[]
for typ in ['src','obj']:
 p=root/f'build/GALE01/{typ}/melee/ft/kinds/ftCommon/ftCo_DamageIce.o';b=p.read_bytes();e='>' if b[5]==2 else '<';off=struct.unpack_from(e+'I',b,32)[0];sz,n,si=struct.unpack_from(e+'HHH',b,46);sh=[struct.unpack_from(e+'10I',b,off+i*sz) for i in range(n)];st=sh[si];names=b[st[4]:st[4]+st[5]]
 for s in sh:
  if names[s[0]:].split(b'\0')[0]in [b'.sdata2',b'.sdata',b'.rodata']:objects.append(dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),section=names[s[0]:].split(b'\0')[0].decode(),size=s[5],elf_flags=s[2],writable=bool(s[2]&1),allocated=bool(s[2]&2),bytes_hex=b[s[4]:s[4]+s[5]].hex()))
asm=root/'build/GALE01/asm/melee/ft/kinds/ftCommon/ftCo_DamageIce.s'
json.dump(dict(report_path=str(report),report_sha256=rh,pinned_report_hash_matches=True,unit=unit,objects=objects,assembly=dict(path=str(asm),sha256=hashlib.sha256(asm.read_bytes()).hexdigest(),read='complete split data sections',finding='rodata two zero Vec3 templates; sdata jobj.h and jobj assertion strings; sdata2 source48/split32 bytes with zero, one, three, double half and three.' ),permission_limit='Object flags do not prove final runtime protection.'),open(D/'section-evidence.json','w'),indent=2)
O={}
def replace(n,t,v,why,ev):O[n,t]=(v,why,ev)
replace('.sdata','data_flow','The existing objects store the NUL-terminated assertion strings jobj.h at offset zero and jobj at offset eight. Inlined HSD_JObj helpers use these as diagnostic arguments. The zero vectors copied into hurtbox endpoints are in .rodata, not this section.','Assembly and both objects contradict the prior zero-vector attribution.',[c(P,50,51),c('src/sysdolphin/baselib/jobj.h',598,605)])
replace('.sdata','game_mapping','Contains joint-assertion diagnostics compiled into this TU. It does not define frozen hurtbox geometry; that geometry uses the separate .rodata zero-vector templates.','The prior gameplay attribution assigned the wrong section.',[c(P,50,51),c('src/sysdolphin/baselib/jobj.h',598,605)])
replace('.sdata','purpose','Stores jobj.h and jobj diagnostic strings for joint assertions. Source ELF size is 13 bytes and split size is 16 bytes with trailing padding; both have WRITE|ALLOC flags.','Verify actual section contents rather than infer from nearby C declarations.',[c('src/sysdolphin/baselib/jobj.h',598,605)])
replace('.sdata2','inferred_type','Compiler scalar-literal storage. Existing source object is 48 bytes with WRITE|ALLOC flags; split is 32 bytes with ALLOC flags. Split literals are f32 zero, one and three, alignment padding, then f64 half and three. Final runtime protection is not established.','Source and split differ in size and ELF permissions.',[c(P,305,321),c(P,400,461)])
replace('.sdata2','purpose','Supplies floating-point operands for initialization, ice geometry and effect scaling, early collision timing, square-root arithmetic and breakout countdown. Local uses read the pool; source and split object permissions are recorded separately.','Local reads do not prove read-only source ELF storage.',[c(P,400,461),c(P,493,502)])
replace('ftCo_DamageIceJump_Anim','inferred_type','A void(HSD_GObj*) fighter animation callback. The escape_timer field is a float initialized from the float common damageicejump_escape_time. Each positive-timer update subtracts 1.0.','Both field declarations contradict the integer-countdown claim.',[c(P,488,502),c('src/melee/ft/kinds/ftCommon/types.h',146,148),c('src/melee/ft/types.h',528,528)])
replace('ftCo_DamageIceJump_Anim','purpose','Decrements a positive DamageIceJump escape timer by one per animation update and enters Fall when that decrement leaves the timer zero or below.','A fractional positive timer can cross below zero.',[c(P,493,502)])
replace('ftCo_DamageIceJump_Anim','state_behavior','A positive escape timer is decremented by one. If the result is zero or below, Fall is entered on that update; otherwise the state continues. An already zero or negative timer bypasses the entire conditional and produces no decrement or transition.','Preserve the positive-entry guard and nonpositive exit comparison.',[c(P,493,502)])
replace(P,'game_mapping','Implements ice confinement with a visible ice enclosure and restricted ordinary input. Frozen fighters still move under transferred knockback and physics. Mashing and later damage shorten the timer; fire sets it to zero, with release dispatched by the animation update. Timer release chooses HammerJump for a held Hammer or DamageIceJump otherwise. Fast terrain impacts leave through the DamageFall entry dispatcher, including its parasol branch.','The prior value incorrectly claimed immobility, immediate fire transition and one universal successor.',[c(P,295,347),c(P,415,502),c('src/melee/ft/kinds/ftCommon/ftCo_DamageFall.c',95,109)])
replace(P,'state_behavior','DamageIce initializes ice collision, hurtbox, rotation, effect and confinement timer. Passive decay is gated by x2224_b2, while mash processing still runs. OnHit2 reduces the timer and sets it to zero for fire; Anim dispatches a nonpositive result to HammerJump or ordinary DamageIceJump. Fast wall or ceiling impact exits through the DamageFall/parasol dispatcher. Ordinary breakout sets frame and animation speed to zero, initializes launch velocity and a float timer, and has empty IASA. Its Anim enters Fall only when decrementing a positive timer to zero or below; collision can transition earlier.','Respect timer guards, deferred fire release and alternate exits.',[c(P,295,347),c(P,415,514),c('src/melee/ft/kinds/ftCommon/ftCo_DamageFall.c',95,109)])
for subj in X:
 name=next(iter(subj['subject'].values())).split(':')[-1]
 if name=='ftCo_DamageIce_Collide':
  for f in subj['facts']:
   if f['type'] in ['data_flow','game_mapping','purpose','state_behavior']:
    value=f['value'].replace('enters DamageFall','uses the DamageFall entry dispatcher, which can choose its parasol branch').replace('into DamageFall','through the DamageFall entry dispatcher, including its parasol branch').replace('through DamageFall','through the DamageFall entry dispatcher, including its parasol branch').replace('attenuates X and Y','scales X and Y').replace('with reduced speed','with X/Y scaled by the common multiplier').replace('reflecting and attenuating velocity','reflecting and scaling X/Y velocity').replace('reflected and attenuated velocity','reflected and scaled X/Y velocity')
    value+=' The reflection helper changes only X/Y, leaving Z untouched; speed comparison uses the full XYZ magnitude.'
    replace(name,f['type'],value,'Qualify delegated parasol exit and two-dimensional reflection; no runtime multiplier bound was established.',[c(P,415,461),c('src/melee/lb/lbvector.c',257,264),c('src/melee/ft/kinds/ftCommon/ftCo_DamageFall.c',95,109)])

rows=[];disp=[];facts=[]
for s in X:
 name=next(iter(s['subject'].values())).split(':')[-1];rows.append(dict(subject=s['subject'],status='reviewed' if s['facts'] else 'reviewed_no_existing_facts',fact_count=len(s['facts']),evidence=E,notes='Parameter records are empty; no ABI register-to-source mapping promoted.'))
 for f in s['facts']:
  q=O.get((name,f['type']));new,why,ev=q if q else (None,'Complete owned canonical/rendered source and bounded dependencies support the existing value. Historical citations are preserved, not asserted re-read.',E)
  disp.append(dict(subject=s['subject'],fact_id=f['id'],version=f['updated_at'],type=f['type'],old_value=f['value'],disposition='supersede' if q else 'retain',reason=why,replacement=new,evidence=ev))
  if q:facts.append(dict(subject=s['subject'],type=f['type'],op='write',value=new,rationale=why,confidence=0.97,evidence=[dict(kind='code',locator=e,why=why) for e in ev]))
end=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z');reads=[json.loads(l) for l in open(U/'reads.jsonl') if json.loads(l).get('reader')=='DamageIce'];L=S/'baseline-links'/f'{C["task"]["id"]}.json';links=json.load(open(L));ld=[]
for l in links:
 ld.append(dict(link_id=l['id'],baseline_record=l,from_target_id=l['from_target_id'],from_entity_id=l['from_entity_id'],to_target_id=l['to_target_id'],to_entity_id=l['to_entity_id'],role=l['role'],prior_rationale=l['why'],version_or_digest=l.get('digest'),disposition='retain',reconciliation_owner='/root/semantic_coordinator',reason='Frozen-state lifecycle, input/timer, effect, geometry, hit and physics/collision relationships supported by complete owned source and bounded dependencies. Complete original record preserved; historical locators not asserted re-read.',evidence=E))
for row in ld:
 if (row['from_target_id'] or '').endswith(':.sdata'):
  row['disposition']='reject';row['reason']='The section stores jobj assertion strings. The rationale belongs to .rodata zero-vector templates, not .sdata. Coordinator should remove or reassign the relationship.'
 elif 'surface-rebound' in (row['to_entity_id'] or ''):
  row['disposition']='revise';row['reason']='Relationship is supported, but state precisely that reflection and subsequent scaling affect only X/Y; the multiplier runtime value is not established.'
def dump(n,v):json.dump(v,open(D/n,'w'),indent=2)
dump('proposal.json',dict(tu=tu,proposal=dict(facts=facts,links=[],entities=[],merges=[],follow_ups=[])))
dump('fact-dispositions.json',dict(revision=R,start_utc=start,end_utc=end,counts=dict(retain=len(disp)-len(facts),supersede=len(facts)),dispositions=disp))
dump('link-dispositions.json',dict(revision=R,input_path=str(L),input_sha256=hashlib.sha256(L.read_bytes()).hexdigest(),expected_count=len(links),reviewed_count=len(ld),counts={k:sum(x['disposition']==k for x in ld) for k in ['retain','revise','reject']},reconciliation_owner='/root/semantic_coordinator',dispositions=ld))
dump('coverage.json',dict(campaign=M['campaign_id'],tu=tu,revision=R,role='TU librarian',model=M['model'],reasoning_effort=M['reasoning_effort'],start_utc=start,end_utc=end,input_files=C['files'],canonical_and_rendered_receipts=reads,foreign_evidence_reads=fr,subjects=rows,counts=dict(targets=21,source_entities=1,parameter_entities=20,existing_facts=len(disp),outgoing_links=len(ld),proposal_facts=len(facts),owned_lines=537),exceptions=[],section_evidence='section-evidence.json'))
dump('unresolved.json',dict(unresolved=[],family_followups=['Coordinator owns two erroneous .sdata links and two rebound-rationale revisions.','Source/split .sdata sizes 13/16, .sdata2 sizes 48/32. Runtime protection not established.','Historical locators retained; no foreign fact changes or ABI parameter mappings proposed.']))
(D/'functionality.md').write_text(f"""# DamageIce Review

Revision `{R}`. Complete canonical and rendered C1-515/H1-22 read with four receipts. Citation bounds stop at C514/H21. Foreign dependencies are bounded canonical reads; listed DamageFall dependency excerpts reuse prior reads in this same session.

Init transfers knockback to self velocity in air or ground velocity when grounded. It positions the skeleton, resets dynamics, initializes grab duration, builds the custom ice ECB and first hurtbox, makes normal capsules intangible, chooses random spin, spawns effect 0x415, installs hit callbacks and plays 0x122. Repeated-hit entry preserves the confinement timer and skips initial skeletal placement and sound while rebuilding geometry and callbacks. OnHit only clears x2227_b6. OnHit2 reduces the timer and zeroes it for fire; it does not transition directly.

Animation rotates XRotN only in air, gates passive decay on x2224_b2, always checks mash input and dispatches nonpositive duration. Frozen IASA is empty but frozen fighters still move. Air physics supplies friction and scaled gravity with normal terminal velocity. Ground physics delegates friction/movement. Custom airborne collision uses the early probe through frame three, prioritizes right-wall, left-wall, then ceiling response with direction markers 1/2/3. Markers are written after impact handling, including after an exit, and do not identify individual stage lines. Kirby's helper spawns a Kirby-only effect using the supplied offset.

Impact emits effect 0x406, quake, rumble and sound. Full XYZ speed strictly above threshold clears the frozen flag and enters the DamageFall/parasol dispatcher. Otherwise lbVector_Mirror and subsequent scaling affect only X/Y. The duplicated RightWallHug test is preserved. Ground contact can settle the fighter without changing the DamageIce action.

Timer release checks Hammer first. Ordinary breakout changes DamageIceJump at frame zero and animation speed zero, spawns effect 1091 using the second zero vector and assigns stick-derived X and configured Y velocity. The float timer decrements only while positive, transitioning to Fall when that subtraction produces zero or below. Empty IASA coexists with normal airborne physics and collision dispatch, including platform input predicate, landing, wall-jump and ledge checks.

The ground-impact helper attempts directional tech, neutral tech and DownBound in order. External upper-KO and frozen DeadUpFall entry/phase paths reuse the ice effect spawner. Existing inferred names remain hypotheses; colliding foreign ground-check aliases were not substituted for canonical names.

.rodata contains the two twelve-byte zero Vec3 constants in both objects. .sdata contains jobj.h and jobj diagnostic strings, with source13/split16 bytes. .sdata2 is source48/split32; split literals are float zero/one/three and double half/three. Source .sdata2 is writable ELF storage. No runtime memory protection inferred. Report hash matches the frozen manifest; no build ran.

All {len(disp)} fact versions and {len(ld)} exact link records have individual dispositions. Two .sdata links require coordinator rejection or reassignment. Two rebound rationales require X/Y precision. No shared KB or source writes.
""")
(D/'naming.md').write_text('# Naming Review\n\nRetain existing SetupECB, SpawnEffect, CheckGroundTransition and DamageIceJump_Enter hypotheses. CheckGroundTransition also serves DamageFall. Canonical identifiers remain authoritative; foreign ground-check aliases collide and are not used as semantic proof.\n')
(D/'README.md').write_text(f'# DamageIce Review Packet\n\nRevision `{R}`. UTC `{start}` to `{end}`. Model `{M["model"]}`.\n\n42 subjects, 109 existing facts, {len(facts)} corrections, {len(ld)} reviewed links. Four owned render receipts. Dry-run only; coordinator owns link reconciliation.\n')
print(len(disp),len(facts),len(ld),end)
