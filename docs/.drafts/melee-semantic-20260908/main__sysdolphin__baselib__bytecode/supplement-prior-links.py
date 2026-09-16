from pathlib import Path
import json,hashlib,sqlite3,datetime,shutil
root=Path('games/melee/state/knowledge_v2/semantic-sweep-20260908');m=json.loads((root/'manifest.json').read_text());rev=m['head_revision'];draft=Path('docs/.drafts/melee-semantic-20260908');names=['objalloc','archive','lbgx','hash','id','util','hsd_3B33','hsd_397E','hsd_393C'];db=sqlite3.connect('file:'+m['baseline_db']+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
b='src/sysdolphin/baselib/'
def ev(f,a,z):return {'kind':'code','locator':f'code://{rev}/{f}#L{a}-L{z}','why':'Canonical implementation or consumer independently rechecked for outgoing link.'}
summary=[]
for n in names:
 tu=('main/melee/lb/lbgx' if n=='lbgx' else 'main/sysdolphin/baselib/'+n);tid=tu.replace('/','__');bp=root/'baseline-links'/f'{tid}.json';p=draft/tid;p.mkdir(exist_ok=True);status='exact_baseline_file'
 if bp.exists():links=json.loads(bp.read_text());bh=hashlib.sha256(bp.read_bytes()).hexdigest()
 else:
  links=[dict(x) for x in db.execute('SELECT l.* FROM link l WHERE l.from_target_id IN (SELECT id FROM target WHERE unit=?) OR l.from_entity_id IN (SELECT id FROM entity WHERE locator=?)',(tu,b+n+'.c'))];assert not links;bh=None;status='baseline_file_absent_readonly_db_verified_zero'
 out=[]
 for l in links:
  dest=l.get('to_entity_id') or '';source=l.get('from_target_id') or '';d='retain';reason='Canonical behavior supports this relationship. Retain the existing record without adding a duplicate or changing the DB.'
  if n=='objalloc':e=[ev(b+n+'.c',57,68),ev(b+n+'.c',119,126)];reason+=' Links live in released object storage and form a head-inserted free list.'
  elif n=='archive':
   if 'public' in dest:e=[ev(b+n+'.c',70,85)];reason+=' Name comparison resolves public data offset to the archive payload address.'
   elif 'GetExtern' in source:e=[ev(b+n+'.c',87,94)];reason+=' This helper implements name enumeration only, as the inherited rationale states; it does not bind addresses.'
   else:e=[ev(b+n+'.c',96,121)];reason+=' The first matching import chain is patched while offsets satisfy the existing bound; no malformed-chain safety guarantee.'
  elif n=='lbgx':e=[ev('src/melee/ft/ftdrawcommon.c',180,230)];reason+=' Caller supplies the three item-pickup rectangle categories to this drawing helper.'
  elif n=='util':e=[ev(b+n+'.c',31,58),ev(b+'pobj.c',1140,1196)];reason+=' Returned matrix slots feed position/normal matrix uploads for rigid or weighted envelopes.'
  elif n=='hsd_3B33':
   e=[ev(b+n+'.c',8,33)]
   if 'compiler-generated-cpp' in dest:
    d='unresolved';eh=hashlib.sha256((p/'compiled-evidence.json').read_bytes()).hexdigest();reason=f'Existing compiled-evidence.json SHA-256 {eh} confirms extab/extabindex and two function-record pairs. Canonical C has explicit longjmp but no native C++ exception constructs. Defer the broader compiler-generated C++ exception pattern until compiler/runtime format evidence independently supports it. Do not equate longjmp with C++ unwinding.'
   elif 'jpeg' in dest:e.append(ev(b+'hsd_3B34.c',1053,1116));reason+=' JPEG comment and Huffman payload/marker calls directly use these writers.'
   else:e.append(ev(b+'hsd_3B34.c',1053,1076));reason+=' Failed writer bounds call longjmp into the shared environment initialized by the encoder.'
  elif n=='hsd_3982':e=[ev(b+n+'.c',11,16),ev(b+n+'.c',40,55),ev(b+'hsd_392A.c',45,79),ev(b+'hsd_3924.c',129,175)];reason+=' Camera callback updates CPU/draw/total values and invokes registered display-item rendering; constructor registers this callback and producer.'
  elif n=='hsd_397E':e=[ev(b+n+'.c',9,20),ev(b+n+'.c',214,228),ev(b+'debugconsole_main.c',2335,2370)];reason+=' Register reads exist only under MWERKS_GEKKO; without that macro the accessor reports unsupported and returns zero.'
  elif n=='hsd_393C':
   e=[ev(b+n+'.c',30,98),ev(b+n+'.c',110,147)]
   if 'crash' in dest:e.append(ev('src/melee/db/dberror.c',62,78));reason+=' No-debugger crash setup allocates 0x2000 bytes and invokes the initializer.'
   elif 'logging' in dest:e.append(ev(b+'debug.c',20,37));reason+=' Report-console capture, despite legacy ParticleConsoleState spelling; it is not particle gameplay.'
   elif 'length-prefixed' in dest:
    d='reject';e=[ev(b+n+'.c',43,65),ev(b+n+'.c',176,204)];reason='The writer appends length after line characters, making it a trailer in forward byte order. Relative traversal reads these trailers backward. The relationship to line-indexed circular storage is supported elsewhere, but the length-prefixed pattern label is misleading. Record rejection only; no DB deletion.'
   elif 'developer-debug' in dest:
    if 'hsd_803941E8' in source:e=[ev(b+n+'.c',273,334),ev(b+'debugconsole_main.c',558,578)];reason+=' The display initializer supplies zeroed output slots.'
    else:e.extend([ev(b+n+'.c',247,271),ev(b+'debugconsole_main.c',1230,1280),ev(b+'debugconsole_main.c',647,682)]);reason+=' Coordinate reads support navigation; sequential reads support drawing. Do not infer pure/non-mutating access.'
   elif 'hsd_80393EF4' in source:e=[ev(b+n+'.c',149,220)];reason+=' Positive-row movement leaves cached x20 unchanged; the relationship does not imply correct length-cache refresh.'
   elif 'hsd_80393E34' in source:e=[ev(b+n+'.c',100,108),ev(b+'debugconsole_main.c',1323,1357)]
   elif 'hsd_80394128' in source:e=[ev(b+n+'.c',110,147),ev(b+n+'.c',247,271)]
  out.append({'link_id':l['id'],'baseline':l,'disposition':d,'reason':reason,'evidence':e})
 counts={x:sum(v['disposition']==x for v in out) for x in ['retain','reject','unresolved']}
 data={'tu':tu,'revision':rev,'reviewed_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'baseline_path':str(bp),'baseline_sha256':bh,'inventory_status':status,'link_count':len(links),'retained':counts['retain'],'rejected':counts['reject'],'unresolved':counts['unresolved'],'links':out,'db_link_changes':False}
 (p/'link-dispositions.json').write_text(json.dumps(data,indent=2)+'\n');s=root/'units'/tid;shutil.copyfile(p/'link-dispositions.json',s/'link-dispositions.json');summary.append({'tu':tu,'link_count':len(links),**counts,'inventory_status':status})
print(json.dumps(summary,indent=2));(draft/'main__sysdolphin__baselib__bytecode'/'prior-link-supplements.json').write_text(json.dumps(summary,indent=2)+'\n')
