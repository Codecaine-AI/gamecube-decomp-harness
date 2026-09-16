import sqlite3,json,collections,pathlib,concurrent.futures,statistics,html
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'analysis/reports/melee-match-tokens-2026-09-11';OUT.mkdir(exist_ok=True)
c=sqlite3.connect(f'file:{ROOT}/games/melee/state/orchestrator.sqlite?mode=ro',uri=True);c.row_factory=sqlite3.Row
D=lambda q:[dict(r) for r in c.execute(q)]
a=json.load(open(ROOT/'analysis/reports/melee-contributions-2026-09-07/analysis.json'))
records=[r for r in a['runner'] if r['after']==100 and r['before']<100 and not r['symbol'].startswith('.') and r['symbol'] not in ['extab','extabindex']]
check={r['id']:r for r in D('select id,target_claim_id from worker_checkpoints')};attempt={r['id']:r for r in D('select id,lease_id from attempts')}
first={};aliases={}
for r in a['runner']:aliases[(r['unit'],r['symbol'])]=r['identity']
for r in sorted(records,key=lambda r:r['time']):first.setdefault(r['identity'],r)
for r in first.values():r['winning_claim']=check[r['id']]['target_claim_id'] if r['id'] in check else attempt[r['id']]['lease_id']
sessions=D("""select s.*,coalesce(et.unit,t.unit) unit,coalesce(et.symbol,t.symbol) symbol,coalesce(tc.claimed_at,q.leased_at,s.created_at) started from pi_sessions s left join target_claims tc on tc.id=s.target_claim_id left join epoch_targets et on et.id=tc.epoch_target_id left join leases l on l.id=s.lease_id left join queue q on q.id=l.queue_id left join targets t on t.id=q.target_id where s.role='worker'""")
selected=[]
for s in sessions:
 ident=aliases.get((s['unit'],s['symbol']));s['identity']=ident;s['claim']=s['target_claim_id'] or s['lease_id']
 if ident in first and (s['started']<=first[ident]['time'] or s['claim']==first[ident]['winning_claim']):selected.append(s)
print('selected',len(selected),'all workers',len(sessions),flush=True)
FIELDS=['input','output','cacheRead','cacheWrite','totalTokens']
def parse(s):
 p=pathlib.Path(s['session_file']) if s['session_file'] else None
 if p and not p.is_file():
  alt=ROOT/'.pi-sessions/worker'/p.name
  if alt.is_file():p=alt
 totals=dict.fromkeys(FIELDS,0);msgs=missing=bad=0;seen=set();models=set()
 if p and p.is_file():
  with p.open() as f:
   for line in f:
    try:e=json.loads(line)
    except ValueError:bad+=1;continue
    m=e.get('message',{})
    if m.get('role')!='assistant':continue
    mid=e.get('id')
    if mid and mid in seen:continue
    seen.add(mid);u=m.get('usage');models.add(m.get('model','unknown'))
    if not u:missing+=1;continue
    msgs+=1
    for k in FIELDS:totals[k]+=u.get(k,0) or 0
  state='usage' if msgs else 'no_usage'
 else:state='missing_file'
 return dict(session_id=s['session_id'],identity=s['identity'],claim=s['claim'],session_file=str(p) if p else None,created_at=s['created_at'],started=s['started'],coverage=state,messages_with_usage=msgs,messages_without_usage=missing,malformed_lines=bad,models=sorted(models),**totals)
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
 parsed=list(ex.map(parse,selected))
print('parsed',collections.Counter(r['coverage'] for r in parsed),flush=True)
json.dump(parsed,open(OUT/'sessions.json','w'),indent=2)
# Deduplicate physical transcripts before summing. Distinct sessions sharing a file count once.
def aggregate(ss):
 unique={s['session_file'] or s['session_id']:s for s in ss};ss=list(unique.values())
 result={k:sum(s[k] for s in ss) for k in FIELDS}
 result.update(sessions=len(ss),sessions_with_usage=sum(s['coverage']=='usage' for s in ss),missing_files=sum(s['coverage']=='missing_file' for s in ss),no_usage=sum(s['coverage']=='no_usage' for s in ss),messages_without_usage=sum(s['messages_without_usage'] for s in ss),malformed_lines=sum(s['malformed_lines'] for s in ss))
 result['complete']=bool(ss) and result['sessions_with_usage']==len(ss) and not result['messages_without_usage'] and not result['malformed_lines']
 result['uncached_plus_output']=result['input']+result['output']+result['cacheWrite']
 return result
rows=[]
for ident,r in first.items():
 ss=[s for s in parsed if s['identity']==ident];win=[s for s in ss if s['claim']==r['winning_claim']]
 rows.append(dict(identity=ident,symbol=r['symbol'],unit=r['unit'],first_exact_at=r['time'],winning_claim=r['winning_claim'],validation_artifact=r['artifact_path'],winning=aggregate(win),through_first_match=aggregate(ss)))
rows.sort(key=lambda r:r['winning']['totalTokens'],reverse=True)
summary={'targets':len(rows),'selected_sessions':len(selected),'dedup_sessions':len({s['session_file'] or s['session_id'] for s in parsed}),'date_range':[min(s['started'] for s in selected),max(s['created_at'] for s in selected)]}
for scope in ['winning','through_first_match']:
 complete=[r[scope] for r in rows if r[scope]['complete']];observed=[r[scope] for r in rows if r[scope]['sessions_with_usage']]
 summary[scope]={'complete_targets':len(complete),'targets_with_usage':len(observed),'observed_totals':{k:sum(r[scope][k] for r in rows) for k in FIELDS},'mean_complete':{k:statistics.mean(r[k] for r in complete) for k in FIELDS+['uncached_plus_output']} if complete else {},'median_complete_total':statistics.median(r['totalTokens'] for r in complete) if complete else None}
json.dump({'summary':summary,'targets':rows},open(OUT/'targets.json','w'),indent=2)
print(json.dumps(summary,indent=2))
# The contribution audit supplies address-based identities, preserving renamed symbols.
# Confirm the exact-match evidence itself, not only the mutable database rows.
for row in rows:
    evidence=json.load(open(row['validation_artifact']))
    assert evidence['status']=='passed' and evidence['target']['after']==100 and evidence['target']['exact'], row['symbol']
for row in rows:
    for scope in ['winning','through_first_match']:
        values=row[scope]
        assert values['totalTokens']==sum(values[k] for k in ['input','output','cacheRead','cacheWrite']), row['symbol']
num=lambda n:f'{n:,}'
trs=[]
for row in rows:
    w=row['winning'];all_=row['through_first_match']
    cells=[html.escape(row['symbol']),html.escape(row['unit']),num(w['totalTokens']),num(w['input']),num(w['output']),num(w['cacheRead']),num(all_['totalTokens']),num(all_['uncached_plus_output']),str(w['missing_files']),str(all_['missing_files']),row['first_exact_at'][:10]]
    trs.append('<tr>'+''.join('<td>'+v+'</td>' for v in cells)+'</tr>')
headers=['Target','Unit','Winning total','Winning input','Winning output','Winning cached','Including earlier attempts','Earlier + winning, uncached + output','Missing winning traces','Missing all traces','First exact UTC']
method='''<h2>How to Read This</h2><p>430 distinct function targets with a score increase to 100% and passed runner validation. Each first-match artifact was reopened and checked. Address identities from the contribution audit deduplicate renamed functions. This counts discoveries, not merged PRs.</p>
<p><b>Winning</b> sums all worker sessions attached to the claim or legacy lease that produced the earliest surviving verified match, including continuations and end-of-claim wrap-up. <b>Including earlier attempts</b> adds worker claims for the same target started on or before that validation. It excludes subsequent claims, work on targets that never matched, and director, QA, librarian, and integration agents. Thus it is not total campaign spending divided by matches.</p>
<p>Token totals sum assistant-message usage: uncached input + output + cache reads + cache writes. Repeated cached context counts on each request. These are API token counts, not unique source tokens or dollar cost. Reasoning is not added separately to output. No cache writes were recorded.</p>
<p>Missing traces make observed totals lower bounds. Every target has some winning usage; 387 have complete winning trace coverage, and 256 have complete coverage including earlier attempts. Of 7,624 selected session records, 7,063 have usage and 561 have no surviving trace: 181 reference missing files, 306 are failed-launch records, and 74 are other failed records without a file path. Failed launches may have consumed no tokens, but are not assumed to have zero usage. No parsed assistant messages lack usage and no malformed lines were found.</p>
<p>Sessions are joined through claim → epoch target or lease → queue → target. Existing transcript paths and the legacy .pi-sessions/worker fallback are checked. Physical transcript paths are deduplicated; message IDs are deduplicated within each file. A 24-session winning claim was additionally checked for copied message IDs across its sessions; none repeated. Earlier-attempt mapping uses unit and symbol aliases in the surviving contribution evidence; unrecorded aliases or deleted runs cannot be recovered.</p>
<p>Sources: games/melee/state/orchestrator.sqlite, registered worker JSONL files, and analysis/reports/melee-contributions-2026-09-07/analysis.json. Selected execution records span June 10 through September 6, 2026. The live database has no additional qualifying checkpoint absent from the audit except one contradicted by its own saved validation, which is excluded.</p>'''
report='''<!doctype html><meta charset="utf-8"><title>Melee Tokens per Full Match</title><style>body{font:15px system-ui;margin:32px;color:#20242c;background:#fafafa}h1{font-size:28px}p{max-width:1100px;line-height:1.55}.cards{display:flex;gap:18px;flex-wrap:wrap}.card{padding:18px;background:white;border:1px solid #ddd;border-radius:8px}.card b{font-size:26px;display:block}input{padding:12px;width:450px;max-width:90%;margin:20px 0}table{border-collapse:collapse;background:white;font-size:13px}th,td{padding:9px 12px;border-bottom:1px solid #ddd;text-align:right;white-space:nowrap}th{position:sticky;top:0;background:#e9edf2}th:first-child,td:first-child,th:nth-child(2),td:nth-child(2){text-align:left}.scroll{overflow:auto;max-height:75vh}</style><h1>Melee Tokens per Full Match</h1><p>Observed minimums across 430 distinct matched targets. Prepared September 11, 2026.</p><div class="cards"><div class="card"><b>16.09M</b>Mean winning-execution tokens<br>589,369 excluding cache reads</div><div class="card"><b>95.93M</b>Mean including earlier attempts<br>3,540,666 excluding cache reads</div><div class="card"><b>430</b>Verified matched targets<br>All have some winning trace usage</div></div><p>The 387 targets with complete winning coverage average 14.26M total tokens, or 535,574 excluding cache reads. Their median is 6.20M total tokens. This subset has a different target mix from the full 430.</p><input id="search" placeholder="Filter by target or unit" aria-label="Filter targets"><span id="count">430 targets</span><div class="scroll"><table><thead><tr>'''+''.join('<th>'+h+'</th>' for h in headers)+'''</tr></thead><tbody>'''+''.join(trs)+'''</tbody></table></div>'''+method+'''<p><a href="targets.json">Per-target data and summary</a> · <a href="sessions.json">Per-session evidence</a></p><script>document.querySelector('#search').addEventListener('input',e=>{let n=0;for(const r of document.querySelectorAll('tbody tr')){r.hidden=!r.textContent.toLowerCase().includes(e.target.value.toLowerCase());if(!r.hidden)n++}document.querySelector('#count').textContent=n+' targets'});</script>'''
(OUT/'report.html').write_text(report)
(OUT/'method.md').write_text('Melee match token analysis\n\n'+__import__('re').sub('<[^>]+>','',method)+'\n\nRerun from repository root: python3 analysis/scripts/analyze-melee-match-tokens.py\n')
print('Report:',OUT/'report.html')
