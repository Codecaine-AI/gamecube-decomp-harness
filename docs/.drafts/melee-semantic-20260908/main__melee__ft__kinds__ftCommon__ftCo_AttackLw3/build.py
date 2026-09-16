import json,pathlib,hashlib,datetime,struct,shutil
D=pathlib.Path('docs/.drafts/melee-semantic-20260908/main__melee__ft__kinds__ftCommon__ftCo_AttackLw3');S=pathlib.Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');M=json.load(open(S/'manifest.json'));R=M['head_revision'];root=pathlib.Path(M['checkout_root']);C=json.load(open(D/'context.json'));X=json.load(open(D/'baseline-facts.json'));tu=C['task']['tu'];P=C['task']['source_path'];U=S/'units'/C['task']['id'];start='2026-09-08T15:50:57Z'
def c(p,a,b):
 assert 1<=a<=b<=len((root/p).read_text().splitlines()),(p,a,b)
 return f'code://{R}/{p}#L{a}-L{b}'
foreign=[]
def add(p,*pairs):
 for a,b in pairs:foreign.append(('src/melee/'+p,a,b))
add('ft/ft_0881.c',(317,328),(382,394));add('ft/ft_0892.c',(84,122),(191,199));add('ft/ft_084E.c',(42,53));add('ft/ft_081B.c',(1043,1050));add('ft/fighter.c',(1198,1230));add('ft/ftanim.c',(380,386));add('ft/ftcommon.c',(606,609));add('ft/ftmotionstates.c',(762,771));add('pl/plstale.c',(1,97));add('pl/plattack.c',(65,73));add('pl/pltrick.c',(55,87));add('ft/kinds/ftCommon/ftpickupitem.c',(238,252));add('ft/kinds/ftCommon/ftCo_ItemThrow.c',(46,54));add('ft/kinds/ftCommon/ftCo_SquatWait.c',(50,86));add('ft/kinds/ftGameWatch/ftgamewatchattacklw3.c',(1,54),(140,151))
fr=[]
for p,a,b in foreign:
 c(p,a,b);t=(root/p).read_text();fr.append(dict(path=p,start_line=a,end_line=b,sha256=hashlib.sha256(t.encode()).hexdigest(),canonical_read=True,rendered_read=False,ownership='foreign evidence only'));(D/(p.replace('/','__')+f'.{a}-{b}.txt')).write_text('\n'.join(f'{i}: {l}' for i,l in enumerate(t.splitlines(),1) if a<=i<=b))
E=[c(P,1,172)]+[c(p,a,b) for p,a,b in foreign]
report=root/'build/GALE01/report.json';rh=hashlib.sha256(report.read_bytes()).hexdigest();assert rh==M['report_sha256'];unit=next(u for u in json.load(open(report))['units'] if u['name']==tu);objects=[]
for typ in ['src','obj']:
 p=root/f'build/GALE01/{typ}/melee/ft/kinds/ftCommon/ftCo_AttackLw3.o';b=p.read_bytes();e='>' if b[5]==2 else '<';off=struct.unpack_from(e+'I',b,32)[0];sz,n,si=struct.unpack_from(e+'HHH',b,46);sh=[struct.unpack_from(e+'10I',b,off+i*sz) for i in range(n)];st=sh[si];names=b[st[4]:st[4]+st[5]]
 for s in sh:
  if names[s[0]:].split(b'\0')[0]==b'.sdata2':objects.append(dict(path=str(p),sha256=hashlib.sha256(b).hexdigest(),section='.sdata2',size=s[5],elf_flags=s[2],writable=bool(s[2]&1),allocated=bool(s[2]&2),bytes_hex=b[s[4]:s[4]+s[5]].hex()))
asm=root/'build/GALE01/asm/melee/ft/kinds/ftCommon/ftCo_AttackLw3.s'
json.dump(dict(report_path=str(report),report_sha256=rh,pinned_report_hash_matches=True,unit=unit,objects=objects,assembly=dict(path=str(asm),sha256=hashlib.sha256(asm.read_bytes()).hexdigest(),read='section declaration and all literal-load sites',finding='@250 f32 zero and @251 f32 one used in doEnter state parameters; no extra constants.'),permission_limit='Object flags do not prove final runtime protection.'),open(D/'section-evidence.json','w'),indent=2)
O={}
def replace(n,t,v,why,ev):O[n,t]=(v,why,ev)
replace('.sdata2','inferred_type','The split target is eight bytes: f32 zero at offset 0 and one at offset 4, with ALLOC flags. The existing source object instead has a 24-byte WRITE|ALLOC section: eight zero bytes, f32 zero/one at offsets 8/12, then eight zero bytes. Runtime protection and a source/split section match are not established.','The split section is 8 bytes while the source section is 24 bytes; write flags also differ. Record the target layout separately from the observed source object.',[c(P,79,91)])
replace('.sdata2','purpose','Provides zero and one literals for common down-tilt entry at frame zero, speed one and zero blend. This is a compiler-emitted literal pool, not a standalone gameplay table; local code reads it without writing.','Read usage does not establish read-only ELF flags or runtime protection.',[c(P,79,91)])
replace('ftCo_AttackLw3_Phys','game_mapping','Maintains grounded sliding and deceleration during down tilt according to character ground friction. When absolute ground velocity exceeds maximum walk speed, friction is multiplied by common friction_when_above_walk_speed before ground movement.','The callee proves multiplication above walking speed, not that the runtime multiplier must always strengthen deceleration.',[c(P,164,167),c('src/melee/ft/ft_084E.c',42,53)])
rows=[];disp=[];facts=[]
for s in X:
 name=next(iter(s['subject'].values())).split(':')[-1];rows.append(dict(subject=s['subject'],status='reviewed' if s['facts'] else 'reviewed_no_existing_facts',fact_count=len(s['facts']),evidence=E,notes='Parameter records are empty; no ABI register-to-source mapping promoted.'))
 for f in s['facts']:
  q=O.get((name,f['type']));new,why,ev=q if q else (None,'Complete owned canonical/rendered source and bounded dependencies support the existing value. Historical citations are preserved, not asserted re-read.',E)
  disp.append(dict(subject=s['subject'],fact_id=f['id'],version=f['updated_at'],type=f['type'],old_value=f['value'],disposition='supersede' if q else 'retain',reason=why,replacement=new,evidence=ev))
  if q:facts.append(dict(subject=s['subject'],type=f['type'],op='write',value=new,rationale=why,confidence=0.97,evidence=[dict(kind='code',locator=e,why=why) for e in ev]))
end=datetime.datetime.now(datetime.timezone.utc).isoformat().replace('+00:00','Z');reads=[json.loads(l) for l in open(U/'reads.jsonl') if json.loads(l).get('reader')=='AttackLw3'];L=S/'baseline-links'/f'{C["task"]["id"]}.json';links=json.load(open(L));ld=[]
for l in links:
 ld.append(dict(link_id=l['id'],baseline_record=l,from_target_id=l['from_target_id'],from_entity_id=l['from_entity_id'],to_target_id=l['to_target_id'],to_entity_id=l['to_entity_id'],role=l['role'],prior_rationale=l['why'],version_or_digest=l.get('digest'),disposition='retain',reconciliation_owner='/root/semantic_coordinator',reason='AttackLw3 callback registration, input/throw override, GameWatch/common entry, repeat/interrupt handling, physics/collision and attack-instance allocation with stale-queue deduplication support these relationships. Complete original record retained; historical wiki and old-revision resources not asserted re-read.',evidence=E))
def dump(n,v):json.dump(v,open(D/n,'w'),indent=2)
dump('proposal.json',dict(tu=tu,proposal=dict(facts=facts,links=[],entities=[],merges=[],follow_ups=[])))
dump('fact-dispositions.json',dict(revision=R,start_utc=start,end_utc=end,counts=dict(retain=len(disp)-len(facts),supersede=len(facts)),dispositions=disp))
dump('link-dispositions.json',dict(revision=R,input_path=str(L),input_sha256=hashlib.sha256(L.read_bytes()).hexdigest(),expected_count=len(links),reviewed_count=len(ld),counts=dict(retain=len(ld)),reconciliation_owner='/root/semantic_coordinator',dispositions=ld))
dump('coverage.json',dict(campaign=M['campaign_id'],tu=tu,revision=R,role='TU librarian',model=M['model'],reasoning_effort=M['reasoning_effort'],start_utc=start,end_utc=end,input_files=C['files'],canonical_and_rendered_receipts=reads,foreign_evidence_reads=fr,subjects=rows,counts=dict(targets=9,source_entities=1,parameter_entities=8,existing_facts=len(disp),outgoing_links=len(ld),proposal_facts=len(facts),owned_lines=188),exceptions=[],section_evidence='section-evidence.json'))
dump('unresolved.json',dict(unresolved=[],family_followups=['Runtime literal-pool permissions not established; source section is 24 bytes versus split 8. Extra eight-byte zero symbols were observed but not assigned gameplay meaning.','No exact ABI parameter mapping promoted.','Historical link locators preserved but not re-read; coordinator owns reconciliation.','Friction multiplier value not inspected; replacement describes the verified scaling operation.']))
(D/'functionality.md').write_text(f"""# Common down tilt

Revision `{R}`; full canonical and rendered C1-173/H1-15 reviewed. Terminal empty lines count in renderer totals; canonical code spans C1-172/H1-14.

CheckInput requires pressed A, left-stick Y <= common xB0 and atan2(Y, abs(X)) < -x20_radians. An eligible held item selects LightThrowLw. Eligibility tests A and either held LR or the negated item predicate; otherwise fighter-kind dispatch selects GameWatch or common entry. There is no local grounded-state test; grounding is action context. GameWatch installs its Manhole accessory setup, confirming the bespoke down tilt.

Common entry first permits nearby light/heavy item pickup. Only an unconsumed request clears command 0, allow_interrupt and the repeat latch, installs callUnk in x21EC, changes to AttackLw3 with SkipAttackCount, and runs animation setup. Fighter_ChangeMotionState invokes and clears x21EC after motion attack metadata setup. callUnk refreshes the stale attack instance then resets per-attack condition/statistics data, allocates the plAttack sequence and invokes trick processing with previous value zero. Stale insertion deduplicates move-ID/instance pairs, so repeated contacts do not add the same occurrence twice.

Anim prioritizes command gate plus buffered repeat over exhaustion; a repeat dispatch can itself be consumed by pickup. Otherwise animation exhaustion enters SquatWait. The fake wrapper is source scaffolding with no additional behavior. checkPadA runs after five interrupt-gated attack checks: pressed A with command gate immediately dispatches repeat and returns true; with gate closed it latches a repeat and returns false, allowing later processing. Thus repeat input is independent of allow_interrupt and can be buffered before the script permits repetition. The later gated chain is downward throw/down-tilt dispatch, neutral attack, jump, dash, squat, turn and walk. Earlier returns prevent later checks.

Phys delegates friction then grounded movement. Above walk speed, friction is multiplied by the shared factor; no claim is made that every possible factor increases it. Coll delegates a ground check that enters Fall on false. The registered motion 57 callback table agrees with all four phases. Header declarations and definitions agree; Fighter_GObj/HSD_GObj spellings are compatible.

Literal pool: split object is eight bytes 000000003f800000 with ALLOC. Existing source object is 24 bytes with WRITE|ALLOC: zero-filled symbols @96 (8 bytes) and @166 (8 bytes) surround f32 zero/one symbols @107/@108 at offsets 8/12. These objects do not establish section parity. Assembly constant-load sites show zero/one in doEnter. Frozen report hash matches; no build ran.

All {len(ld)} exact outgoing records are individually retained, including repeated endpoints. Their original role, rationale and locators remain in link-dispositions.json. Fact evidence and foreign canonical ranges are in coverage.json and fact-dispositions.json.
""")
(D/'naming.md').write_text('# Naming review\n\nNo inferred names exist on owned targets. Preserve canonical callUnk, decideFighter, doEnter and public callback names. Their roles are explained in functionality.md; no speculative alias is needed. wrapper, checkPadA and checkItemThrowInput lack manifest target identities but are fully covered in source review. Rendered substitutions are foreign hypotheses and are not treated as canonical identifiers.\n')
(D/'README.md').write_text(f'# AttackLw3 review packet\n\nRevision `{R}`. UTC `{start}` to `{end}`. Model `{M["model"]}`, role TU librarian.\n\n18 subjects: nine targets, source entity and eight empty parameter entities. {len(disp)} fact versions: {len(disp)-len(facts)} retained, {len(facts)} corrections. All {len(ld)} outgoing records retained. Two complete owned render receipts; no parser errors.\n\nNo source, KB or build edits. Proposal is dry-run only.\n')
print(len(disp),len(facts),len(ld),end)
