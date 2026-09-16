#!/usr/bin/env python3
"""Run the unmodified SMS strict validator, checkpointing each object by SHA256."""
import argparse, concurrent.futures, hashlib, json, os, re, subprocess, time
from collections import Counter
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--checkout',type=Path,default=Path('/Users/Ford/sms-symbol-order-20260915'))
p.add_argument('--output',type=Path,required=True)
p.add_argument('--wait-for-objects',action='store_true')
a=p.parse_args(); root=a.checkout.resolve(); out=a.output.resolve(); out.mkdir(parents=True,exist_ok=True)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None
def write(p,v):
 t=p.with_suffix(p.suffix+'.tmp');t.write_text(json.dumps(v,indent=2)+'\n');t.replace(p)
units=json.loads((root/'objdiff.json').read_text())['units']
tracked=set(subprocess.check_output(['git','ls-files'],cwd=root,text=True).splitlines())
units=[u for u in units if u.get('metadata',{}).get('source_path') in tracked]
common={'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(), 'validator':sha(root/'tools/validate-symbol-order.py'),'map':sha(root/'orig/GMSJ01/files/mario.MAP'),'nm':sha(root/'build/binutils/powerpc-eabi-nm')}
start=time.time(); results=[]
write(out/'manifest.json',dict(common,checkout=str(root),units=len(units),started_at=start,command=' '.join(os.sys.argv)))
configured={u['metadata']['source_path'] for u in units}
write(out/'unconfigured.json',sorted(t for t in tracked if t.startswith('src/') and Path(t).suffix in ('.c','.cpp','.s','.S') and t not in configured))
def run(u):
 name=u['name'];key=name.replace('/','__'); dest=out/(key+'.json');obj=root/u.get('base_path','MISSING_OBJECT')
 if a.wait_for_objects:
  deadline=time.monotonic()+1200
  while True:
   log=root/'.ninja_log'
   completed={line.split('\t')[3] for line in log.read_text().splitlines() if len(line.split('\t'))==5} if log.exists() else set()
   if obj.is_file() and (u.get('base_path') in completed or time.time()-obj.stat().st_mtime>5):break
   if time.monotonic()>deadline:raise TimeoutError(f'Build did not complete {obj}; resume after fixing build')
   time.sleep(2)
 fp=dict(common,object=sha(obj),unit=u)
 if dest.exists():
  old=json.loads(dest.read_text())
  if old.get('fingerprint')==fp:return old
 env=dict(os.environ,NM=str(root/'build/binutils/powerpc-eabi-nm'))
 cmd=['python3','tools/validate-symbol-order.py','-u',name]
 r=subprocess.run(cmd,cwd=root,env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
 log=r.stdout;(out/(key+'.log')).write_text(log)
 missing=re.search(r'\[FAIL\] (\d+) map symbol\(s\) MISSING',log)
 binding=re.search(r'\[FAIL\] (\d+) symbol\(s\) with wrong linkage',log)
 order='[FAIL] Non-weak symbol ORDER' in log
 state='pass' if r.returncode==0 else ('fail' if 'RESULT: FAIL' in log else 'error')
 v=dict(unit=name,source=u['metadata']['source_path'],restricted=('game' not in u['metadata'].get('progress_categories',[]) or u['metadata']['source_path'].startswith('src/THPPlayer/')),state=state,exit_code=r.returncode,missing=int(missing[1]) if missing else 0,order=order,binding=int(binding[1]) if binding else 0,log=key+'.log',fingerprint=fp)
 write(dest,v);return v
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for r in pool.map(run,units):
  results.append(r)
  write(out/'status.json',dict(state='running',completed=len(results),total=len(units),elapsed_seconds=round(time.time()-start,1),last_unit=r['unit'],updated_at=time.time()))
  if len(results)%50==0:print(f'{len(results)}/{len(units)}',flush=True)
write(out/'results.json',results)
summ={'units':len(results),'states':dict(Counter(r['state'] for r in results)),'missing_symbols':sum(r['missing'] for r in results),'order_files':sum(r['order'] for r in results),'binding_symbols':sum(r['binding'] for r in results),'missing_files':sum(r['missing']>0 for r in results),'binding_files':sum(r['binding']>0 for r in results)}
for restricted in (False,True):
 rs=[r for r in results if r['restricted']==restricted];summ['restricted' if restricted else 'game']={'units':len(rs),'states':dict(Counter(r['state'] for r in rs)),'missing_symbols':sum(r['missing'] for r in rs),'order_files':sum(r['order'] for r in rs),'binding_symbols':sum(r['binding'] for r in rs)}
write(out/'summary.json',summ);write(out/'status.json',dict(state='complete',completed=len(results),total=len(units),elapsed_seconds=time.time()-start,updated_at=time.time()))
print(json.dumps(summ,indent=2))
