from pathlib import Path
import struct,json,hashlib,collections
p=Path(__file__).parent;m=json.loads(Path('games/melee/state/knowledge_v2/semantic-sweep-20260908/manifest.json').read_text());r=Path(m['checkout_root'])
def parse(rel):
 d=(r/rel).read_bytes();h=struct.unpack_from('>16sHHIIIIIHHHHHH',d);sh=[struct.unpack_from('>IIIIIIIIII',d,h[6]+i*h[11]) for i in range(h[12])];s=sh[h[13]];ns=d[s[4]:s[4]+s[5]]
 def st(b,i):return b[i:b.index(0,i)].decode()
 syms={}
 for i,s in enumerate(sh):
  if s[1]!=2:continue
  a=sh[s[6]];ss=d[a[4]:a[4]+a[5]];syms[i]=[]
  for o in range(s[4],s[4]+s[5],s[9]):
   n,v,z,info,other,idx=struct.unpack_from('>IIIBBH',d,o);syms[i].append({'name':st(ss,n),'offset':v,'size':z,'section_index':idx,'binding':info>>4,'type':info&15})
 out={'path':rel,'sha256':hashlib.sha256(d).hexdigest(),'sections':[],'relocations_to_owned_symbols':[]}
 for i,s in enumerate(sh):
  n=st(ns,s[0])
  if n in ['.bss','.sbss']:
   out['sections'].append({'name':n,'size':s[5],'type':s[1],'flags':s[2],'alignment':s[8],'symbols':[a for tab in syms.values() for a in tab if a['section_index']==i]})
  if s[1]==4:
   for o in range(s[4],s[4]+s[5],s[9]):
    off,info,add=struct.unpack_from('>IIi',d,o);sym=syms[s[6]][info>>8]
    if sym['name'] in ['hsd_804D1138','hsd_804D1148','hsd_804D2348','hsd_804D2648','hsd_804D2E70']:
     out['relocations_to_owned_symbols'].append({'relocation_section':n,'offset':off,'type':info&255,'addend':add,'symbol':sym})
 return out
out={'revision':m['head_revision'],'objects':[parse('build/GALE01/'+kind+'/sysdolphin/baselib/'+n+'.o') for kind,n in [('src','hsd_4D11'),('obj','hsd_4D11'),('src','hsd_3A94'),('src','hsd_3B34')]]}
d=(r/'build/GALE01/report.json').read_bytes();out['report_sha256']=hashlib.sha256(d).hexdigest();assert out['report_sha256']==m['report_sha256'];out['unit_report']=next(u for u in json.loads(d)['units'] if u['name']=='main/sysdolphin/baselib/hsd_4D11');(p/'compiled-evidence.json').write_text(json.dumps(out,indent=2)+'\n')
for o in out['objects']:
 print(o['path'],o['sha256']);print(json.dumps(o['sections']));print('relocations',dict(collections.Counter(x['symbol']['name'] for x in o['relocations_to_owned_symbols'])))
