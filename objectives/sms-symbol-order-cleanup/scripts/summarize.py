#!/usr/bin/env python3
"""Compare saved strict inventories and create a review ledger without exemptions."""
import csv, json
from pathlib import Path
from compare_matching import compare_matching
root=Path(__file__).resolve().parents[1];a=root/'artifacts'
b={x['unit']:x for x in json.loads((a/'baseline-strict/results.json').read_text())}
f={x['unit']:x for x in json.loads((a/'final-strict/results.json').read_text())}
assert b.keys()==f.keys()
empty={x['unit'] for x in json.loads((a/'empty-source-baseline.json').read_text())}
regressions=[];fixed=[];improved=[];rows=[]
def named_failures(path):
 result={'missing':set(),'binding':set()};active=None
 for line in path.read_text().splitlines():
  if line.startswith('['):
   active='missing' if line.startswith('[FAIL]') and 'MISSING' in line else ('binding' if line.startswith('[FAIL]') and 'wrong linkage' in line else None)
  elif active and line.startswith('  - '):result[active].add(line[4:].removesuffix(' (UNUSED)').strip())
 return result
for u in sorted(b):
 old,new=b[u],f[u]
 assert all(old['fingerprint'][k]==new['fingerprint'][k] for k in ('head','validator','map','nm'))
 if new['missing']>old['missing'] or new['binding']>old['binding'] or (new['order'] and not old['order']) or (new['state']=='error' and old['state']!='error'):regressions.append(u)
 old_names=named_failures(a/'baseline-strict'/old['log']);new_names=named_failures(a/'final-strict'/new['log'])
 if any(new_names[k]-old_names[k] for k in old_names) and u not in regressions:regressions.append(u)
 if old['state']=='fail' and new['state']=='pass':category='fixed';note='Strict pass; matching checked with no per-function or section regressions';fixed.append(u)
 elif new['state']=='error':category='uncertain';note='No resolvable .text map TU; inspect raw diagnostic; not counted as pass'
 elif new['state']=='fail':
  category='remaining';note='Needs source/map/compiler audit before edits'
  if new['restricted']:note='Read-only SDK, runtime, middleware or THPPlayer per SMS AGENTS.md'
  elif u in empty:note='Empty source; genuine unfinished decompilation; no placeholder bodies added'
  if u=='mario/MarioUtil/ShadowUtil':category='uncertain';note='12 generated local-class name mismatches; bodies exist; see shadowutil-generated-name-audit.json'
  if u in ('mario/Map/MapMirror','mario/MoveBG/MapObjLib'):category='uncertain';note='Order involves compiler-emitted JGeometry set<f>; first-use/inlining context unresolved; middleware edits prohibited'
  if new['missing']<old['missing'] or new['binding']<old['binding'] or (old['order'] and not new['order']):
   category='improved';note='Evidence-backed partial fix; remaining strict diagnostics retained';improved.append(u)
 else:category='pass';note='No strict failure; warnings may remain in raw log'
 rows.append(dict(unit=u,source=new['source'],scope='restricted' if new['restricted'] else 'game',assessment=category,note=note,baseline_state=old['state'],final_state=new['state'],missing_before=old['missing'],missing_after=new['missing'],order_before=int(old['order']),order_after=int(new['order']),linkage_before=old['binding'],linkage_after=new['binding'],baseline_log='baseline-strict/'+old['log'],final_log='final-strict/'+new['log']))
with (a/'case-ledger.csv').open('w',newline='') as fp:
 w=csv.DictWriter(fp,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
baseline=json.loads((a/'baseline-report.json').read_text());final=json.loads((a/'final-report.json').read_text())
matching_comparison=compare_matching(baseline,final)
summary=dict(baseline=json.loads((a/'baseline-strict/summary.json').read_text()),final=json.loads((a/'final-strict/summary.json').read_text()),fixed_units=fixed,partially_improved_units=improved,strict_regressions=regressions,entire_matching_report_identical=baseline==final,matching_comparison=matching_comparison,matching=final['measures'],dol_sha1='9f5a8caf56f5356aeac9d3ed28bf8de976a03625')
(a/'comparison.json').write_text(json.dumps(summary,indent=2)+'\n')
assert not regressions
assert not matching_comparison['regressions']
print(f'{len(fixed)} units fixed, {len(improved)} partially improved; no strict or matching regressions; {len(rows)} ledger rows')
