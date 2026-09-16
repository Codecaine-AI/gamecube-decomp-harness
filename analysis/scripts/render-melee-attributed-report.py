"""Count all personal merges plus PR 3259 under the user's attribution convention."""
import json,pathlib,collections,markdown,html
ROOT=pathlib.Path(__file__).resolve().parents[2];O=ROOT/'analysis/reports/melee-contributions-2026-09-07'
a=json.load(open(O/'analysis.json'));db=json.load(open(O/'db-full-function-deltas.json'));conflicts=json.load(open(O/'positive-runner-artifact-audit.json'))['conflicts'];runner=[r for r in a['runner'] if r not in conflicts];rows=a['ledger']+db
sha=json.load(open(O/'current-master.json'))['sha'];cur=json.load(open(O/'ci-reports'/f'{sha}.json'));baseline=json.load(open(O/'join-baseline-report.json'))
def fmap(report):
 return {u['name'].split('/')[0]+':'+str(f['metadata']['virtual_address']):(u,f) for u in report['units'] for f in u.get('functions') or [] if f.get('metadata',{}).get('virtual_address')}
fm=fmap(cur);bm=fmap(baseline);total=int(cur['measures']['total_code']);start=baseline['measures'];remaining={k for k,(u,f) in bm.items() if f.get('fuzzy_match_percent',0)<100}
sets={}
sets['credited_exact']={r['identity'] for r in rows if r['after']==100 and r['before']<100 and r['identity'] in fm}
sets['credited_positive']={r['identity'] for r in rows if r['after']>r['before'] and r['identity'] in fm}
sets['all_exact']=sets['credited_exact']|{r['identity'] for r in runner if r['after']==100 and r['before']<100 and r['identity'] in fm}
sets['all_positive']=sets['credited_positive']|{r['identity'] for r in runner if r['after']>r['before'] and r['identity'] in fm}
sets['credited_drastic']={r['identity'] for r in rows if r['after']-r['before']>=10 and r['identity'] in fm}
sets['all_drastic']={r['identity'] for r in rows+runner if r['after']-r['before']>=10 and r['identity'] in fm}
metrics={}
for key,ids in sets.items():
 code=sum(int(fm[k][1]['size']) for k in ids);cohort=ids&remaining;cohortbytes=sum(int(bm[k][1]['size']) for k in cohort)
 metrics[key]=dict(functions=len(ids),current_bytes=code,percent_of_code=code/total*100,current_units=len({fm[k][0]['name'] for k in ids}),in_join_unmatched_cohort=len(cohort),percent_of_join_remaining_functions=len(cohort)/len(remaining)*100,join_cohort_bytes=cohortbytes,already_exact_at_join=len((ids&bm.keys())-remaining),not_resolved_in_join_report=len(ids-bm.keys()))
net=442828+25380;data=50432+88;unmatchedbytes=int(start['total_code'])-int(start['matched_code'])
paths=set(json.load(open(O/'attributed-merged-paths.json')));runnerpaths={r['source_path'] for r in runner if r.get('source_path')};allpaths=paths|runnerpaths
summary=dict(attribution='All fjooord merged PRs plus all of PR 3259, as requested by the user; this convention is not a finding of exclusive authorship.',join_commit='dae3629c2850c8c3bd371d91a7e26a29cb19cc64',join_date='2026-06-05T14:12:13Z',join_measures=start,join_unmatched_functions=len(remaining),join_unmatched_code_bytes=unmatchedbytes,ci_new_match_events=682,ci_improvement_events=1421,ci_positive_events=2103,ci_matched_code_byte_gain=net,ci_gain_share_of_final_code=net/total*100,ci_gain_equivalent_share_of_join_gap=net/unmatchedbytes*100,ci_matched_data_byte_gain=data,credited_merged_paths=len(paths),credited_merged_c_paths=sum(x.endswith('.c') for x in paths),credited_merged_header_paths=sum(x.endswith('.h') for x in paths),all_contributed_paths=len(allpaths),all_contributed_c_paths=sum(x.endswith('.c') for x in allpaths),scope_metrics=metrics)
(O/'attributed-summary.json').write_text(json.dumps(summary,indent=2))
# Preserve every named function and literal source path in the broad contribution scope.
fl=[]
for k in sorted(sets['all_positive']):
 u,f=fm[k];ev=[r for r in rows if r['identity']==k and r['after']>r['before']];rr=[r for r in runner if r['identity']==k and r['after']>r['before']]
 fl.append(dict(identity=k,symbol=f['name'],current_unit=u['name'],current_source_path=u.get('metadata',{}).get('source_path',''),compiled_bytes=int(f['size']),join_score=bm[k][1].get('fuzzy_match_percent',0) if k in bm else None,credited_prs=sorted({r['pr'] for r in ev}),exact_credited=k in sets['credited_exact'],exact_harness_or_credited=k in sets['all_exact'],large_improvement_credited=k in sets['credited_drastic'],large_improvement_any=k in sets['all_drastic'],runner_evidence=sorted({r['artifact_path'] for r in rr if r.get('artifact_path')})))
(O/'attributed-function-ledger.json').write_text(json.dumps(fl,indent=2));(O/'all-contributed-paths.json').write_text(json.dumps([dict(path=p,merged=p in paths,validated_runner_target=p in runnerpaths) for p in sorted(allpaths)],indent=2))
def tab(head,body):return '\n'.join(['| '+' | '.join(head)+' |','| '+' | '.join('---' for _ in head)+' |']+['| '+' | '.join(str(x) for x in row)+' |' for row in body])
x=metrics['credited_exact'];xp=metrics['credited_positive'];xx=metrics['all_exact'];ap=metrics['all_positive'];dr=metrics['credited_drastic'];ad=metrics['all_drastic']
t=f'''# Melee: My Matching and Contribution Footprint

Attribution requested by the author: all 57 merged fjooord PRs **plus all of #3259**, including its matches and improvements. Historical outcome snapshot: September 7, 2026. This report and the historical rebuild were prepared September 8.

## The Direct Answer

**Your credited PRs report +{net:,} matched-code bytes, equivalent to {net/total*100:.2f}% of the entire compiled codebase.** This includes your original 654 CI match events and all 28 additional match events from #3259, for **682 new-match events**, plus **1,421 improvement events**.

The available function-level evidence identifies **at least {x['functions']} distinct functions completed by those credited PRs**, containing **{x['current_bytes']:,} bytes, or {x['percent_of_code']:.2f}% of the final codebase**. The CI byte gain and deduplicated function footprint answer slightly different questions; use the CI figure for the headline, and the function ledger for a list of identifiable completions.

## What Was Left When I Joined?

I rebuilt commit **dae3629c2850c8c3bd371d91a7e26a29cb19cc64**, the last first-parent mainline commit before you opened #2581 on June 5 at 14:12 UTC. This is the merge of #2579, the source of the historical 70.15% figure.

{tab(['Join-date baseline','Rebuilt result'],[['Total function symbols',f"{int(start['total_functions']):,}"],['Already exact',f"{int(start['matched_functions']):,}"],['Still unmatched',f"{len(remaining):,}"],['Code matched',f"{start['matched_code_percent']:.5f}%"],['Code bytes still unmatched',f"{unmatchedbytes:,}"],['Total code bytes',f"{int(start['total_code']):,}"]])}

Here "symbols" means **function symbols**, excluding data symbols, section names, and undefined references. That gives a usable starting denominator for function matching. The 70% figure is byte-weighted and does not imply that 30% of function names remained.

The baseline was rebuilt with its historical configure.py, original compiler set, and matching configuration. It uses the comparison rules from that revision, before the project enabled stricter data-value relocation comparison. The original reference executable stayed local. The baseline report is saved as [join-baseline-report.json](join-baseline-report.json).

## Starting From Those Remaining Symbols

{tab(['Contribution measure','All documented functions','Members of the original unmatched set','Share of original remaining functions'],[['Completed in your credited merged PRs',x['functions'],x['in_join_unmatched_cohort'],f"{x['percent_of_join_remaining_functions']:.2f}%"],['Completed in credited PRs or validated Harness discoveries',xx['functions'],xx['in_join_unmatched_cohort'],f"{xx['percent_of_join_remaining_functions']:.2f}%"],['Improved or completed in credited PRs',xp['functions'],xp['in_join_unmatched_cohort'],f"{xp['percent_of_join_remaining_functions']:.2f}%"],['Improved or completed, including validated Harness work',ap['functions'],ap['in_join_unmatched_cohort'],f"{ap['percent_of_join_remaining_functions']:.2f}%"]])}

**Your credited merged work completed at least {x['percent_of_join_remaining_functions']:.1f}% of the original remaining functions and contributed to at least {xp['percent_of_join_remaining_functions']:.1f}% through matches or improvements. Including validated Harness results, those figures become {xx['percent_of_join_remaining_functions']:.1f}% completed and {ap['percent_of_join_remaining_functions']:.1f}% contributed to.**

The second column includes all documented contributions. The third answers the stricter question: "Which of the functions still unmatched when I arrived did I help?" It joins functions by module and virtual address rather than by changing names or filenames.

Of the {x['functions']} credited completions, **{x['already_exact_at_join']} were already exact under the older join-date rules** and **{x['not_resolved_in_join_report']} do not resolve to an address in that historical report**. Later stricter comparisons or regressions can require rematching a previously exact function. Those are still contributions, but they are excluded from the original-unmatched-cohort percentage.

The reported **{net:,}-byte gain** is equivalent to **{net/unmatchedbytes*100:.2f}% of the code-byte gap at your arrival**. It is cumulative reported gain, not a claim of disjoint ownership of the original remaining bytes. Your identified completed members of the original unmatched set contain **{x['join_cohort_bytes']:,} original bytes**, or **{x['join_cohort_bytes']/unmatchedbytes*100:.2f}% of that starting unmatched-code footprint**.

## Improvements Count as Contributions

Your credited PRs record **1,421 partial-improvement events**, alongside **682 new-match events**, for **2,103 positive CI events**. A function can contribute several events over time; they are not 2,103 distinct functions.

At least **{xp['functions']:,} distinct functions** have positive movement in the credited merged evidence. Their full compiled sizes sum to **{xp['current_bytes']:,} bytes**, or **{xp['percent_of_code']:.2f}% of the entire final codebase**. Including validated Harness work yields **{ap['functions']:,} distinct functions**, **{ap['current_bytes']:,} bytes**, and **{ap['percent_of_code']:.2f}% of the codebase**.

This uses your definition: any measured positive contribution counts. It counts the full size of each affected function once, without assuming you wrote all of it. It does not count untouched neighbors in a source file as matching work merely because another function in that file changed.

### What Counts as Drastically Improved?

A **gain of at least 10 percentage points in a function's similarity score in one recorded comparison** is the main threshold. Under that definition:

{tab(['Scope','Functions with large gains','Current files containing them'],[['Credited merged PRs',dr['functions'],dr['current_units']],['Credited PRs plus validated Harness work',ad['functions'],ad['current_units']]])}

This counts a 65%→80% improvement and a 75%→100% completion. It excludes a 99.9%→100% final fix from the "drastic" category while still counting it as a match. **164 functions** in the credited merged evidence have a ≥10-point improvement that still left them below 100% in that comparison; some were completed later.

A separate file-level measure remains useful: **88 files gained at least 1,000 exact-matching code bytes in a single personal merge**, based on the 44 available personal before/after CI pairs. That is a conservative minimum for the expanded credited scope; do not substitute it for the function-similarity threshold.

## Everything Touched

{tab(['Recorded scope','Count'],[['Credited merged C source paths',sum(p.endswith('.c') for p in paths)],['Credited merged header paths',sum(p.endswith('.h') for p in paths)],['Credited merged supporting paths',sum(not p.endswith(('.c','.h')) for p in paths)],['All credited merged paths',len(paths)],['Additional C paths with validated Harness target work',sum(p.endswith('.c') for p in runnerpaths-paths)],['Merged or validated-Harness contribution paths',len(allpaths)]])}

The broad function involvement set maps to **{ap['current_units']} current translation units**, **{ap['current_units']/int(cur['measures']['total_units'])*100:.2f}% of the final {int(cur['measures']['total_units']):,} units**. Literal historical paths and current translation units are different inventories because files were renamed or split.

Open the [searchable inventory of every contributed function and path](attributed-inventory.html). Raw paths are listed in [all-contributed-paths.json](all-contributed-paths.json). Every function is listed in [attributed-function-ledger.json](attributed-function-ledger.json), including its join-date score, final address, compiled size, credited PRs, match status, large-improvement flag, and runner evidence.

This scope counts merged edits, supporting headers/configuration, and validated Harness contributions. It does not label files merely read by an agent as changed contributions. Unsuccessful experiments without a merged edit or validated positive result are outside this inventory.

## What #3259 Adds Under Your Attribution

{tab(['CI result','Your 57 merged PRs','#3259','Credited total'],[['New-match events',654,28,682],['Partial-improvement events',1318,103,1421],['Matched-code byte gain','442,828','25,380',f'{net:,}'],['Matched-data byte gain','50,432','88',f'{data:,}']])}

The complete #3259 before/after reports contain **26 function completions, 101 partial function improvements, and section changes**. Its 26 completions contain exactly **25,380 code bytes**. None duplicates a function completion in the documented personal merge ledger, so the direct identified count rises from 551 to **577**.

Twenty-four were already exact in your Harness before #3259 opened. The remaining two have earlier partial Harness evidence. This report follows your instruction to count the **entire PR** under your contribution scope. That is an attribution convention; the audit independently proves earlier exact discovery for 24, not exclusive authorship of every edit.

## Suggested Video Narration

> When I joined, Melee was about {start['matched_code_percent']:.0f}% matched by code size, with {len(remaining):,} function symbols still unmatched. My 57 merged PRs, together with the work I'm counting from #3259, produced 682 CI-reported matches and 1,421 improvements. Those PRs reported about 468,000 additional matched-code bytes, roughly 12% of the entire codebase.
>
> At the individual-function level, the evidence identifies at least {x['functions']} completions, including {x['in_join_unmatched_cohort']} functions from the original unmatched set. I made large improvements of ten percentage points or more to {dr['functions']} functions. Counting all validated Harness contributions, my work reached {ap['functions']:,} functions spanning about {ap['percent_of_code']:.0f}% of the compiled codebase. That includes contributions to {ap['in_join_unmatched_cohort']:,} of the original {len(remaining):,} unmatched functions, about {ap['percent_of_join_remaining_functions']:.0f}% of what was left.

For an on-screen footnote: **CI counts include function and section events; contributions include improvements and shared work. #3259 is included under my stated attribution. Unique-function counts are documented lower bounds.**

## Verification and Remaining Limits

The historical baseline is a fresh rebuild, replacing the previous report's missing starting-symbol denominator. The original source files and current worktree were not edited. The temporary build is `/tmp/melee-join-baseline-dae3629`; its logs are preserved with this report.

CI records survive for all 57 personal PRs and #3259, but 13 early personal PRs lack full downloadable before/after reports. Their truncated bot tables limit the named-function inventory. Therefore 682 and 1,421 are exact event sums from available CI summaries, while the unique-function counts are lower bounds. #2628 and #2630 contain merged work without a numerical bot report.

The project-wide final denominator is **{total:,} compiled code bytes**, not C source lines and not code plus data. Your credited data-matching gain is separately **{data:,} bytes**, **{data/int(cur['measures']['total_data'])*100:.2f}% of final data bytes**. Nothing is silently counted twice across the match, improvement, and touched-function sets.

The earlier reports remain linked for full PR context: [CI-first video report](video-report.html), [searchable technical report](report.html). Use this expanded report's figures when including all of #3259.
'''
(O/'attributed-report.md').write_text(t)
body=markdown.markdown(t,extensions=['tables','toc']);body=body.replace('<table>','<div class="tablewrap"><table>').replace('</table>','</table></div>')
style='body{margin:0;background:#f4f7fa;color:#172d44;font:17px/1.65 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:32px}h1{font-size:40px;line-height:1.18}h2{margin-top:44px;border-top:1px solid #cbd7e4;padding-top:24px}h3{margin-top:26px}a{color:#215fbc}blockquote{background:#e4edfb;border-left:5px solid #215fbc;padding:16px 24px;margin:24px 0;font-size:19px}table{border-collapse:collapse;width:100%;background:white;font-size:14px}td,th{padding:10px;border-bottom:1px solid #d8e0e9;text-align:left;vertical-align:top}th{background:#dfE9f6}.tablewrap{overflow-x:auto}code{overflow-wrap:anywhere}@media(max-width:700px){main{padding:18px}h1{font-size:30px}}@media print{main{padding:0}body{background:white}h2,h3{break-after:avoid}tr{break-inside:avoid}}'
(O/'attributed-report.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Melee: Complete Contribution Scope</title><style>'+style+'</style><main>'+body+'</main></html>')
print(json.dumps(summary,indent=2))

# Human-readable inventory complements the JSON manifests.
esc=lambda v:html.escape(str(v))
function_rows=[]
for r in fl:
 scope='Credited merge' if r['credited_prs'] else 'Validated Harness'
 exact='Credited completion' if r['exact_credited'] else 'Harness exact' if r['exact_harness_or_credited'] else 'Improvement'
 function_rows.append('<tr>'+''.join('<td>'+esc(v)+'</td>' for v in [r['symbol'],r['current_source_path'] or r['current_unit'],r['compiled_bytes'],round(r['join_score'],5) if r['join_score'] is not None else 'Unknown',scope,exact,', '.join('#'+str(n) for n in r['credited_prs']),'Yes' if r['large_improvement_credited'] else 'Harness' if r['large_improvement_any'] else ''])+'</tr>')
pathrows=['<tr><td>'+esc(p)+'</td><td>'+('Credited merge' if p in paths else 'Validated Harness target')+'</td></tr>' for p in sorted(allpaths)]
body='<h1>Every Contributed Function and Path</h1><p><a href="attributed-report.html">Read the contribution report</a></p><p>All 57 personal merged PRs plus all of #3259, with validated Harness contributions. Search uses any text in a row. Function sizes measure involvement, not sole authorship.</p><input id="q" aria-label="Search inventory" placeholder="Search function, file, PR, or scope" style="padding:12px;width:100%;box-sizing:border-box;font:inherit"><h2>Functions · '+str(len(fl))+'</h2><p id="functionCount"></p><div class="tablewrap"><table id="functions"><thead><tr>'+''.join('<th>'+esc(v)+'</th>' for v in ['Function','Current source','Bytes','Score at join','Contribution','Result','Credited PRs','≥10-point gain'])+'</tr></thead><tbody>'+''.join(function_rows)+'</tbody></table></div><h2>Historical File Paths · '+str(len(allpaths))+'</h2><p id="pathCount"></p><table id="paths"><thead><tr><th>Path</th><th>Scope</th></tr></thead><tbody>'+''.join(pathrows)+'</tbody></table>'
js="const q=document.querySelector('#q');function filter(){const query=q.value.toLowerCase();for(const [id,count] of [['functions','functionCount'],['paths','pathCount']]){let n=0;for(const row of document.querySelectorAll('#'+id+' tbody tr')){row.hidden=!row.textContent.toLowerCase().includes(query);if(!row.hidden)n++;}document.querySelector('#'+count).textContent=n+' records shown';}}q.addEventListener('input',filter);filter();"
(O/'attributed-inventory.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Melee Contribution Inventory</title><style>'+style+'</style><main>'+body+'</main><script>'+js+'</script></html>')
