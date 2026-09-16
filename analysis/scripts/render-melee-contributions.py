"""Render the contribution audit from its frozen evidence snapshot. No network or DB writes."""
import collections,html,json,pathlib,re
ROOT=pathlib.Path(__file__).resolve().parents[2]
O=ROOT/'analysis/reports/melee-contributions-2026-09-07'
a=json.load(open(O/'analysis.json'));own=sorted([p for p in a['prs'] if p['author']=='fjooord' and p['merged']],key=lambda p:p['number']);owned={p['number'] for p in own};ledger=a['ledger'];new=[r for r in ledger if r['kind']=='new matches'];runner=[r for r in a['runner'] if r['after']==100 and not r['symbol'].startswith('.') and r['symbol'] not in ['extab','extabindex']]
mi={r['identity'] for r in new};ri={r['identity'] for r in runner};allids=mi|ri
assert len(own)==57 and len(mi)==551 and len(allids)==665
prrows=[]
for p in own:
 rows=[r for r in ledger if r['pr']==p['number']];f=[r for r in rows if r['kind']=='new matches'];im=[r for r in rows if r['kind']=='improvements in unmatched items']
 code=int(p.get('ci_metrics',{}).get('matched_code',p['metrics'].get('Matched code',{}).get('delta_bytes',0)))
 prrows.append(dict(PR=f"#{p['number']}",Title=p['title'],Merged=p['merged'][:10],Functions=len(f),Improvements=len(im),CodeBytes=code,Files=len(p['merge_files']),Evidence='Full CI pair' if p['ci_pair'] else 'Visible bot rows; artifact expired',URL=p['url']))
filemap=collections.defaultdict(lambda:dict(prs=set(),exact=set(),improved=set(),code=0,pp=0,best='',unit=''))
def source(r):
 if r.get('source_path'):return r['source_path']
 u=r['unit'].removeprefix('main/')
 return ('extern/dolphin/src/' if u.startswith('dolphin/') else 'src/')+u+'.c'
for p in own:
 for f in p['merge_files']:
  if f.endswith('.c'):filemap[f]['prs'].add(p['number'])
for r in ledger:
 if r['after']>r['before']:
  f=filemap[source(r)];f['prs'].add(r['pr']);f['improved'].add(r['identity']);f['unit']=r['unit']
  if r['after']==100:f['exact'].add(r['identity'])
for r in a['ci_units']:
 f=filemap[source(r)];f['code']+=r['matched_code_delta']
 if r['delta_pp']>f['pp']:f['pp']=r['delta_pp'];f['best']=f"{r['before']:.2f}% → {r['after']:.2f}% in #{r['pr']}"
files=[dict(File=k,PRs=', '.join('#'+str(p) for p in sorted(v['prs'])),ExactFunctions=len(v['exact']),ImprovedFunctions=len(v['improved']),NetExactBytesFrom44CI=v['code'],LargestWholeFileGain=v['best'] or 'No complete CI comparison',GainPP=round(v['pp'],2)) for k,v in filemap.items()]
files.sort(key=lambda r:r['NetExactBytesFrom44CI'],reverse=True)
funcs=[]
for identity in allids:
 ms=sorted([r for r in new if r['identity']==identity],key=lambda r:r['pr']);rs=sorted([r for r in runner if r['identity']==identity],key=lambda r:r['time'] or '');r=ms[-1] if ms else rs[-1]
 funcs.append(dict(Function=r['symbol'],File=source(r),Identity=identity,Origin='Merged + Harness' if ms and rs else 'Merged PR' if ms else 'Harness discovery',MergedPRs=', '.join('#'+str(x) for x in sorted({r['pr'] for r in ms})),FirstRunnerExact=rs[0]['time'] if rs else '',Evidence=ms[0]['url'] if ms else rs[0]['artifact_path'],RunnerEvidence=rs[0]['artifact_path'] if rs else ''))
funcs.sort(key=lambda r:(r['File'],r['Function']))
db=[];dbp=next(p for p in a['prs'] if p['number']==3259)
for r in dbp['rows']:
 if r['function'] and r['kind']=='new matches':
  prior=[x for x in a['runner'] if x['identity']==r['identity'] and x['time'] and x['time']<dbp['created']];exact=[x for x in prior if x['after']==100];best=max(prior,key=lambda x:x['after'],default={});first=min(exact,key=lambda x:x['time']) if exact else best
  db.append(dict(Function=r['symbol'],BeforeDB=first.get('time',''),HarnessScore=best.get('after'),Finding='Earlier passed exact match' if exact else 'Earlier partial improvement only',Evidence=first.get('artifact_path','')))
assert sum(r['Finding']=='Earlier passed exact match' for r in db)==24
credits=[];creditnums={2828,2841,3231,3274,3267,3363,3359,3367,3369,3371,3373,3377,3380}
for n in sorted(creditnums):
 p=json.load(open(O/'evidence'/str(n)/'pr.json'));assert p['merged_at'];body=p.get('body') or ''
 sentences=[s.strip() for s in body.splitlines() if re.search(r'fjooord|#3358|#3223|#2782|pull/(3358|3223|2782)|credit',s,re.I)]
 credits.append(dict(PR='#'+str(n),Author=p['user']['login'],Title=p['title'],Merged=p['merged_at'][:10],Credit=' '.join(sentences),URL=p['html_url']))
external=[dict(PR='#'+str(r['pr']),Author=r['author'],Function=r['symbol'],RunnerExact=r['runner_time'],PROpened=r['created'],URL=r['url'],RunnerEvidence=r['runner_evidence']) for r in sorted(a['external_overlap'],key=lambda r:(r['pr'],r['symbol']))]
net=sum(p['CodeBytes'] for p in prrows);massive={r['unit'] for r in a['ci_units'] if r['matched_code_delta']>=1000};unitimproved={r['unit'] for r in ledger if r['after']>r['before']};improved={r['identity'] for r in ledger if r['after']>r['before']}
summary=dict(merged_prs=len(own),merged_distinct_exact_functions=len(mi),runner_distinct_exact_functions=len(ri),combined_distinct_exact_functions=len(allids),runner_only_distinct=len(ri-mi),both=len(ri&mi),source_files_touched=len({f for p in own for f in p['merge_files'] if f.endswith('.c')}),files_with_measured_function_improvement=len(unitimproved),functions_with_measured_improvement=len(improved),files_gaining_1000_exact_bytes_in_one_merge=len(massive),ci_pairs=44,bot_only_prs=13,bot_match_events=654,bot_improvement_events=1318,net_accounted_matched_code_bytes=net,net_accounted_matched_data_bytes=50432,db_prior_exact_functions=24,credited_external_merged_prs=len(credits),external_prior_exact_functions=len({r['identity'] for r in a['external_overlap']}))
(O/'summary.json').write_text(json.dumps(summary,indent=2))
views={'PRs':prrows,'Functions':funcs,'Files':files,'Credited PRs':credits,'DB overlap':db,'Other overlaps':external}
(O/'ledgers.json').write_text(json.dumps(views,indent=2))
def table(rows,keys):
 return '\n'.join(['| '+' | '.join(keys)+' |','| '+' | '.join('---' for _ in keys)+' |']+['| '+' | '.join(str(r.get(k,'')).replace('|','/').replace('\n',' ') for k in keys)+' |' for r in rows])
md=f'''# Melee Contribution Report: fjooord and the GameCube Decomp Harness

Evidence snapshot: September 7, 2026. Corrected September 8: the earlier 689-function figure included 24 data-section matches. The corrected function total is 665. See `video-report.html` for the CI-first video report. Repository: doldecomp/melee. Account: fjooord.

## The Results

| Measure | Documented result |
| --- | ---: |
| Your merged PRs | **57** |
| Distinct functions reaching exact match in your merged PR evidence | **At least 551** |
| Distinct functions with passed exact Harness results | **430** |
| Distinct exact functions across those two groups, deduplicated | **At least 665** |
| Additional Harness discoveries outside the documented personal merge set | **114** |

The 551 and 430 groups share 316 functions. They must not be added without deduplication. Counts refer to functions, not data sections, workers, attempts, or entire files. A Harness discovery is a historical passed result; it does not establish that its patch was accepted upstream unchanged.

Your work touched **200 C source files**, plus headers and supporting files, **242 distinct paths in total**. At least **998 distinct functions across 178 translation units** improved in the available merged evidence. This includes functions that reached exact match.

## How Many Files Improved Substantially?

**88 files gained at least 1,000 bytes of exact-matching code in one of your merges.** This is the main substantial-improvement measure in this report. It measures formerly unmatched function bytes becoming exact, not source-code lines or fuzzy similarity bytes. The 1,000-byte threshold is an explicit reporting choice.

Complete CI pairs also show **3 files gaining at least 10 percentage points of whole-unit fuzzy similarity in a single merge**. These are different measures: a file can already be 99% similar yet contain thousands of bytes in functions that are not exact.

| File | Whole-unit similarity before | After | PR |
| --- | ---: | ---: | --- |
| lbaudio_ax.c | 70.92% | 96.66% | [#2731](https://github.com/doldecomp/melee/pull/2731) |
| texpdag.c | 82.81% | 95.87% | [#2732](https://github.com/doldecomp/melee/pull/2732) |
| tydisplay.c | 86.55% | 99.34% | [#2879](https://github.com/doldecomp/melee/pull/2879) |

The full file ledger includes the source path, relevant PRs, distinct exact and improved functions, net exact-code byte movement from the 44 complete CI pairs, and largest observed whole-file similarity increase. Early PRs without surviving CI artifacts are not included in those whole-file byte totals.

## Code and Data Impact

The available comparisons account for **+{net:,} net exact-matching code bytes** and **+50,432 net exact-matching data bytes** across your merges. The code figure is equivalent to about **{net/3882032*100:.2f} percentage points** of today's 3,882,032-byte code total. This combines actual merge-parent CI deltas for 44 PRs with the final bot's reported deltas for older PRs. It is an evidence-based accounting total with mixed baseline quality, not a causal share of all project progress.

The bot summaries across your merged PRs separately report **654 new match events** and **1,318 improvements in unmatched items**. Those totals include data and exception-table sections, repeated improvements, and bot baselines that can differ from the actual merge parent. They are not counts of distinct functions. CI reconstruction recovers 556 named function match events across the combined CI and older visible-bot ledger, corresponding to 551 distinct functions.

## The #3259 Overlap

[#3259](https://github.com/doldecomp/melee/pull/3259), authored by **dberweger2017**, opened **August 30 at 11:24:27 UTC** and merged at **13:44:43 UTC**. Your [#3223](https://github.com/doldecomp/melee/pull/3223) opened **August 27 at 03:01:04 UTC** and merged **September 1 at 08:44:20 UTC**.

Its bot report lists **26 function matches, 2 exception-table matches, and 103 unmatched-item improvements**. Of the 26 functions, **24 already had passed exact Harness results before #3259 opened**. All 24 referenced runner artifacts were opened and confirmed passed at 100%, then copied into this report. The remaining two, `gm_80182578` and `mnInfo_80252758`, have earlier partial improvements in the runner evidence, not earlier passed exact matches.

This supports the concrete attribution statement: **24 functions merged through #3259 had already been found exact by your Harness.** It does not, by itself, prove how the author obtained the code or establish a 30–40-function count. The other PR by that author, [#3271](https://github.com/doldecomp/melee/pull/3271), reports two partial Big Blue improvements and no new exact matches.

Your comment on #3259 explicitly raised overlap with #3223. The report preserves that comment in `evidence/3259/comments.json`. The 24 functions remain in the Harness contribution set even though the merge occurred under another account.

{table(db,['Function','BeforeDB','HarnessScore','Finding'])}

Timestamps above are UTC. `BeforeDB` is the earliest surviving passed exact runner timestamp, or the best earlier partial attempt for the two non-exact rows. This establishes local result precedence. It does not establish the date each function first appeared publicly in your PR.

## Work Explicitly Credited in Other Merged PRs

**13 merged implementation PRs explicitly credit or describe reuse of your work.** This is a separate contribution category. Some authors finished matches, resolved layout, or linked files after using your source. Their entire PR match count is not automatically attributed to you.

{table(credits,['PR','Author','Title','Credit'])}

[#2785](https://github.com/doldecomp/melee/pull/2785) separately credits the #2782 discussion for changing the project to stricter data-value diffing. It is a workflow contribution and is excluded from the implementation-PR count. Closed follow-ups such as #2833, #3372, and #3376 are also excluded from merged totals.

A wider comparison of named bot matches against earlier passed Harness results finds **{len({r['identity'] for r in a['external_overlap']})} distinct functions across {len({r['pr'] for r in a['external_overlap']})} other authors' merged PRs**. These are overlap candidates, not proof of reuse. Repeated matches, independent discoveries, and changes to matching rules can produce overlap. The searchable ledger includes the PR, function, local validation time, PR opening time, and evidence path. Do not add this category to 665; it overlaps the Harness set already counted.

## Every Merged PR

`Functions` counts named function match events. `Improvements` counts named partial function improvement events. Both use full CI comparisons when available and visible bot rows otherwise. Older visible-row counts are lower bounds. `CodeBytes` is the net change in exact-matching code bytes. `Files` counts actual merge paths where available, with archived PR diffs as fallback.

{table(prrows,['PR','Title','Merged','Functions','Improvements','CodeBytes','Files','Evidence'])}

The account has 70 PRs in the live snapshot: 57 merged and 13 closed without merge. Split-parent and WIP PRs are excluded from merge totals so their child PRs are not counted twice.

## Largest File Contributions

Net exact-code byte gains below cover the 44 surviving before/after CI pairs. They sum changes across your merges, including negative changes; they do not include expired early artifacts.

{table(files[:20],['File','ExactFunctions','ImprovedFunctions','NetExactBytesFrom44CI','LargestWholeFileGain'])}

## Current Project Milestone

The downloaded CI report for master `{json.load(open(O/'current-master.json'))['sha']}` confirms **19,828 of 19,828 functions exact**, **3,882,032 of 3,882,032 code bytes matched**, **1,211,168 of 1,211,168 data bytes matched**, and **1,130 of 1,130 units complete**. These are project totals, not personal contribution totals. The report's aggregate fuzzy similarity field is 99.999954%; the exact-match and completion measures above are 100%.

## Evidence and Counting Rules

1. All 57 personal merged PRs were checked against live GitHub metadata and comments. The full live PR inventory contains 3,312 PRs. The wider reference scan used local PR slices plus refreshed recent PRs and explicitly credited PRs.
2. Full CI build reports survive for 44 personal merge commits and their immediate first parents. Functions are compared by module and virtual address, allowing names and translation units to change. Symbol/address aliases deduplicate the PR and Harness sets.
3. For 13 older PRs the artifacts expired. Their final bot reports remain the evidence. #2583 hides five new-match rows; several older improvement tables are truncated. #2628 and #2630 have no numerical match report. This is why the distinct merged and combined function counts are lower bounds. PR-body supplemental rows are retained in raw analysis but do not override CI or bot evidence.
4. Harness counts require a score increase to 100, plus passed runner hard gates, or a compiled legacy attempt with passed status. Repeated attempts are deduplicated. Tentative records with failed gates are excluded. The artifact audit confirmed 503 exact attempt records. One older database-only exact record contradicted its artifact and was excluded; a later valid result preserves that function in the count. Passed discoveries may still have been rejected later during integration or review; they are not automatically counted as merged contributions. Epoch report deltas are retained as supporting evidence, not used to claim worker authorship.
5. The comparisons expose one broken function match and four partial function regressions among the 44 CI pairs. They are retained in `analysis.json`, including the broken match in #2685. Historical progress is not assumed to be monotonic. No historical rebuild was performed, no run was started, and no PR or source checkout was modified.

## Files to Use

Open `report.html` for searchable tables of every PR, all **665 documented exact functions**, all file records, the **26-function #3259 audit**, explicit credits, and other overlap candidates. `ledgers.json` contains those tables for reuse. `summary.json` contains headline metrics. `analysis.json` retains full function movements, runner records, CI comparisons, and supporting epoch observations. `ci-pairs.json` maps PRs to the compared commits; `ci-reports/*.meta.json` records download status and artifact URLs. `evidence/` preserves live PR metadata and comments.
'''
(O/'report.md').write_text(md)
# The HTML is standalone. Markdown is converted by the companion rendering command.
(O/'dashboard-data.json').write_text(json.dumps(views))
print(json.dumps(summary,indent=2))
