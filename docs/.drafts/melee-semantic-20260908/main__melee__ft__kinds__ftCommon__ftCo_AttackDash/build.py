import json,pathlib,hashlib,datetime,struct,shutil
D=pathlib.Path('docs/.drafts/melee-semantic-20260908/main__melee__ft__kinds__ftCommon__ftCo_AttackDash');S=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');M=json.load(open(S/'manifest.json'));R=M['head_revision'];root=pathlib.Path(M['checkout_root']);C=json.load(open(D/'context.json'));X=json.load(open(D/'baseline-facts.json'));tu=C['task']['tu'];P=C['task']['source_path'];U=S/'units'/C['task']['id'];start='2026-09-08T15:55:21Z'
def c(p,a,b):
 assert 1<=a<=b<=len((root/p).read_text().splitlines()),(p,a,b)
 return f'code://{R}/{p}#L{a}-L{b}'
foreign=[]
def add(p,*pairs):
 for a,b in pairs:foreign.append(('src/melee/'+p,a,b))
add('ft/ft_084E.c',(79,89));add('ft/ft_081B.c',(1043,1050));add('ft/ft_08A1.c',(54,98));add('ft/ftanim.c',(380,386));add('ft/ftmotionstates.c',(685,694));add('ft/ftswing.c',(27,61),(63,99));add('it/it_26B1.c',(120,124));add('ft/kinds/ftCommon/ftCo_Dash.c',(83,118));add('ft/kinds/ftCommon/ftCo_RunDirect.c',(22,45));add('ft/kinds/ftCommon/ftCo_Catch.c',(60,81));add('ft/kinds/ftCommon/ftCo_ItemThrow.c',(179,186));add('ft/kinds/ftCommon/ftCo_Wait.c',(44,67));add('ft/kinds/ftKirby/ftkirbyattackdash.c',(22,55))
fr=[]
for p,a,b in foreign:
 c(p,a,b);t=(root/p).read_text();fr.append(dict(path=p,start_line=a,end_line=b,sha256=hashlib.sha256(t.encode()).hexdigest(),canonical_read=True,rendered_read=False,ownership='foreign evidence only'));(D/(p.replace('/','__')+f'.{a}-{b}.txt')).write_text('\n'.join(f'{i}: {l}' for i,l in enumerate(t.splitlines(),1) if a<=i<=b))
E=[c(P,1,102)]+[c(p,a,b) for p,a,b in foreign]
report=root/'build/GALE01/report.json';rh=hashlib.sha256(report.read_bytes()).hexdigest();assert rh==M['report_sha256'];unit=next(u for u in json.load(open(report))['units'] if u['name']==tu);objects=[]
for typ in ['src','obj']:
 p=root/f'build/GALE01/{typ}/melee/ft/kinds/ftCommon/ftCo_AttackDash.o';b=p.read_bytes();e='>' if b[5]==2 else '<';off=struct.unpack_from(e+'I',b,32)[0];sz,n,si=struct.unpack_from(e+'HHH',b,46);sh=[struct.unpack_from(e+'10I',b,off+i*sz) for i in range(n)];st=sh[si];names=b[st[4]:st[4]+st[5]]
 for s in sh:
  if names[s[0]:].split(b'\0')[0]==b'.sdata2':objects.append(dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),section='.sdata2',size=s[5],elf_flags=s[2],writable=bool(s[2]&1),allocated=bool(s[2]&2),bytes_hex=b[s[4]:s[4]+s[5]].hex()))
asm=root/'build/GALE01/asm/melee/ft/kinds/ftCommon/ftCo_AttackDash.s'
json.dump(dict(report_path=str(report),report_sha256=rh,pinned_report_hash_matches=True,unit=unit,objects=objects,assembly=dict(path=str(asm),sha256=hashlib.sha256(asm.read_bytes()).hexdigest(),read='section declaration and all literal-load sites',finding='@248 f32 zero and @249 f32 one used in doEnter state parameters; no extra constants.'),permission_limit='Object flags do not prove final runtime protection.'),open(D/'section-evidence.json','w'),indent=2)
O={}
def replace(n,t,v,why,ev):O[n,t]=(v,why,ev)
replace('.sdata2','inferred_type','The split target is an eight-byte ALLOC literal pool with IEEE-754 f32 zero and one at offsets 0 and 4. The existing source object has a 12-byte WRITE|ALLOC section containing those two words plus a trailing zero word. It is compiler literal storage; source/split section parity and runtime protection are not established.','Observed source and split ELF sections differ in size (12/8) and flags (3/2); distinguish the split target layout from the source object.',[c(P,61,69)])
pev=[c(P,92,97),c('src/melee/ft/ft_084E.c',79,89)]
replace('ftCo_AttackDash_Phys','game_mapping','Provides grounded dash-attack motion. With x594_b0 clear, character ground friction multiplied by common x50 controls friction. With x594_b0 set, the helper instead derives ground acceleration from animation translation Z times facing minus current ground velocity. Both paths advance grounded movement.','The downstream helper bypasses friction when animation-driven movement is enabled.',pev)
replace('ftCo_AttackDash_Phys','purpose','Delegates grounded dash-attack movement to ft_80085030 with common x50 times character ground friction and fighter facing. The callee chooses animation-driven ground acceleration when x594_b0 is set, or the supplied friction otherwise, then applies grounded movement.','The supplied friction and facing are used by distinct downstream branches; friction is not unconditional.',pev)
sev=[c(P,26,69),c(P,78,82),c('src/melee/ft/kinds/ftCommon/ftCo_Dash.c',103,109),c('src/melee/ft/kinds/ftCommon/ftCo_RunDirect.c',22,35)]
replace('ftCo_AttackDash_SetMv0','purpose','Writes common x68 to the move-union slot spelled attackdash.x0 after movement callers accept AttackDash_CheckInput. Generic and Kirby dash-attack entry clear that slot first, but the same callers also invoke this setter after accepted dash-item throw or item-swing substitutions.','The callers condition this write on CheckInput true, which includes item substitutions; it is not exclusively an overwrite of a newly cleared AttackDash field.',sev)
replace('ftCo_AttackDash_SetMv0','state_behavior','Unconditionally assigns common x68 to attackdash.x0. Dash and RunDirect invoke it after any successful AttackDash_CheckInput result, including Kirby/generic dash attack, LightThrowDash and item-swing variant 4. For generic or Kirby dash attack it replaces the entry zero; no current-motion guard exists in this setter or those caller branches.','The accepted input predicate has three kinds of output; caller scope must not be narrowed to the generic dash-attack branch.',sev)

rows=[];disp=[];facts=[]
for s in X:
 name=next(iter(s['subject'].values())).split(':')[-1];rows.append(dict(subject=s['subject'],status='reviewed' if s['facts'] else 'reviewed_no_existing_facts',fact_count=len(s['facts']),evidence=E,notes='Parameter records are empty; no ABI register-to-source mapping promoted.'))
 for f in s['facts']:
  q=O.get((name,f['type']));new,why,ev=q if q else (None,'Complete owned canonical/rendered source and bounded dependencies support the existing value. Historical citations are preserved, not asserted re-read.',E)
  disp.append(dict(subject=s['subject'],fact_id=f['id'],version=f['updated_at'],type=f['type'],old_value=f['value'],disposition='supersede' if q else 'retain',reason=why,replacement=new,evidence=ev))
  if q:facts.append(dict(subject=s['subject'],type=f['type'],op='write',value=new,rationale=why,confidence=0.97,evidence=[dict(kind='code',locator=e,why=why) for e in ev]))
end=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z');reads=[json.loads(l) for l in open(U/'reads.jsonl') if json.loads(l).get('reader')=='AttackDash'];L=S/'baseline-links'/f'{C["task"]["id"]}.json';links=json.load(open(L));ld=[]
for l in links:
 ld.append(dict(link_id=l['id'],baseline_record=l,from_target_id=l['from_target_id'],from_entity_id=l['from_entity_id'],to_target_id=l['to_target_id'],to_entity_id=l['to_entity_id'],role=l['role'],prior_rationale=l['why'],version_or_digest=l.get('digest'),disposition='retain',reconciliation_owner='/root/semantic_coordinator',reason='AttackDash callback registration, A-input item substitutions, Kirby/common dispatch, animation completion, prioritized catch/item handling, general interrupt gate, movement and ground-loss processing support these relationships. Complete original record retained; historical wiki and old-revision resources not asserted re-read.',evidence=E))
def dump(n,v):json.dump(v,open(D/n,'w'),indent=2)
dump('proposal.json',dict(tu=tu,proposal=dict(facts=facts,links=[],entities=[],merges=[],follow_ups=[])))
dump('fact-dispositions.json',dict(revision=R,start_utc=start,end_utc=end,counts=dict(retain=len(disp)-len(facts),supersede=len(facts)),dispositions=disp))
dump('link-dispositions.json',dict(revision=R,input_path=str(L),input_sha256=hashlib.sha256(L.read_bytes()).hexdigest(),expected_count=len(links),reviewed_count=len(ld),counts=dict(retain=len(ld)),reconciliation_owner='/root/semantic_coordinator',dispositions=ld))
dump('coverage.json',dict(campaign=M['campaign_id'],tu=tu,revision=R,role='TU librarian',model=M['model'],reasoning_effort=M['reasoning_effort'],start_utc=start,end_utc=end,input_files=C['files'],canonical_and_rendered_receipts=reads,foreign_evidence_reads=fr,subjects=rows,counts=dict(targets=9,source_entities=1,parameter_entities=8,existing_facts=len(disp),outgoing_links=len(ld),proposal_facts=len(facts),owned_lines=119),exceptions=[],section_evidence='section-evidence.json'))
dump('unresolved.json',dict(unresolved=[],family_followups=['Source literal section is 12 bytes versus split 8; trailing zero word has no promoted gameplay role. Runtime protection unverified.','No ABI parameter mapping promoted.','Historical link locators preserved, not re-read; coordinator owns reconciliation.']))
(D/'functionality.md').write_text(f"""# Common dash attack

Revision `{R}`; canonical and rendered C1-103/H1-16 read completely. Terminal empty lines account for renderer totals; code citations stop at C102/H15.

CheckInput requires pressed A, with no local ground or movement-state test. A held item plus held LR or classification zero enters LightThrowDash. Otherwise classification two invokes item-swing variant four; remaining cases dispatch Kirby to its dedicated AttackDash or everyone else to common entry. Item classification is the item attribute x0_78. The swing helper selects an item-kind table row and variant column. Accepted input returns true for all three outcomes.

Generic entry disables interruption, changes motion 50 at frame zero, speed one and zero blend with no flags, invokes animation setup, then clears move x0. Kirby entry performs the analogous setup for its dedicated state and also clears x0. Dash and RunDirect call SetMv0 after every accepted input result, including item substitutions; the setter unconditionally writes common x68 to the shared union slot. It does not inspect the actual new state.

Anim leaves ongoing animation alone and dispatches its end through ft_8008A2BC. That helper routes Master Hand and Crazy Hand separately; the ordinary neutral helper handles DownSpot and held Hammer before Wait, with ground conversion and item/animation handling. IASA first calls ftCo_800D8AE0 regardless of allow_interrupt. Its initial held-item plus LR check can enter LightThrowDash. After two eligibility guards it can enter CatchDash on held LR and nonzero move x0; otherwise it decrements nonzero x0 and returns false. Early eligibility failures bypass that decrement. Only a false return plus allow_interrupt invokes the ordered Wait input chain.

Phys supplies common x50 times ground friction and facing to ft_80085030. That helper uses animation translation for ground acceleration when x594_b0 is set; otherwise it applies friction. Both paths apply ground movement. Coll calls shared ground checking and enters Fall when it returns false. Motion table 50 registers the four callbacks consistently with the header.

The split literal section is eight bytes containing zero/one. Existing source section is 12 bytes with a trailing zero word and WRITE|ALLOC versus split ALLOC. Assembly literal loads establish zero/one entry use. Frozen report hash matches; no build ran.

All {len(ld)} exact outgoing records are individually retained with their original endpoints, roles, rationale and locators. New canonical evidence is attached without asserting historical PR/wiki/old-source resources were re-read. All {len(disp)} fact versions and 18 subjects are accounted for.
""")
(D/'naming.md').write_text('# Naming review\n\nOwned targets have no inferred names. Preserve canonical decideFighter, doEnter, SetMv0 and public callback identifiers. SetMv0 writes an overlapping move-union field after item substitutions too, so no name narrowing its full caller scope is proposed. Foreign rendered aliases remain hypotheses.\n')
(D/'README.md').write_text(f'# AttackDash review packet\n\nRevision `{R}`. UTC `{start}` to `{end}`. Model `{M["model"]}`, role TU librarian.\n\n18 owned subjects: nine targets, source entity and eight empty parameters. {len(disp)} facts: {len(disp)-len(facts)} retain, {len(facts)} corrections. All {len(ld)} exact outgoing records retained. Two full owned render receipts, no parser errors.\n\nNo source, shared KB or build edits. Dry-run proposal only.\n')
print(len(disp),len(facts),len(ld),end)
