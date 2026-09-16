import pathlib,struct,json,hashlib,re
p=pathlib.Path(__file__).parent;m=json.load(open('games/melee/state/knowledge_v2/semantic-sweep-20260908/manifest.json'));root=pathlib.Path(m['checkout_root']);out={'revision':m['head_revision'],'report_sha256':m['report_sha256'],'objects':[]}
for rel in ['build/GALE01/src/melee/db/dbitem.o','build/GALE01/obj/melee/db/dbitem.o']:
 b=(root/rel).read_bytes();h=struct.unpack_from('>16sHHIIIIIHHHHHH',b);ss=[struct.unpack_from('>IIIIIIIIII',b,h[6]+i*h[11]) for i in range(h[12])];ns=ss[h[13]];names=b[ns[4]:ns[4]+ns[5]]
 def st(x,o):return x[o:x.find(b'\0',o)].decode()
 sec=[dict(index=i,name=st(names,s[0]),type=s[1],flags=s[2],offset=s[4],size=s[5],link=s[6],info=s[7],entsize=s[9]) for i,s in enumerate(ss)]
 sym=[]
 for s in sec:
  if s['type']==2:
   z=sec[s['link']];strings=b[z['offset']:z['offset']+z['size']]
   for off in range(s['offset'],s['offset']+s['size'],s['entsize']):
    n,v,size,info,other,idx=struct.unpack_from('>IIIBBH',b,off);sym.append(dict(name=st(strings,n),value=v,size=size,section=sec[idx]['name'] if idx<len(sec) else idx))
 sections=[]
 for s in sec:
  if s['name'] in ['.data','.sdata','.sdata2','.bss','.sbss']:
   data=b[s['offset']:s['offset']+s['size']] if s['type']!=8 else b'';d={**s,'sha256':hashlib.sha256(data).hexdigest() if s['type']!=8 else None,'symbols':[a for a in sym if a['section']==s['name'] and a['name']],'relocations':[]}
   if s['name']=='.sdata2':d['hex']=data.hex()
   for rs in sec:
    if rs['type']==4 and rs['info']==s['index']:
     for off in range(rs['offset'],rs['offset']+rs['size'],rs['entsize']):
      addr,info,add=struct.unpack_from('>IIi',b,off);d['relocations'].append({'offset':addr,'type':info&255,'target':sym[info>>8],'addend':add})
   sections.append(d)
 out['objects'].append({'path':rel,'sha256':hashlib.sha256(b).hexdigest(),'sections':sections})

(p/'compiled-evidence.json').write_text(json.dumps(out,indent=2)+'\n')
for o in out['objects']:
 print(o['path'],o['sha256'])
 for s in o['sections']:print(s['name'],s['size'],s['flags'],len(s['relocations']),s['symbols'])
