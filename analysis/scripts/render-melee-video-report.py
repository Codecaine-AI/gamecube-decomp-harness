"""Produce CI-first video facts from the September 7 frozen GitHub/CI snapshot."""
import collections,json,pathlib,re,html,markdown
ROOT=pathlib.Path(__file__).resolve().parents[2];O=ROOT/'analysis/reports/melee-contributions-2026-09-07'
a=json.load(open(O/'analysis.json'));own=sorted([p for p in a['prs'] if p['author']=='fjooord' and p['merged']],key=lambda p:p['number']);era=json.load(open(O/'ci-era-counts.json'))
sha=json.load(open(O/'current-master.json'))['sha'];rep=json.load(open(O/'ci-reports'/f'{sha}.json'));total=int(rep['measures']['total_code']);fm={}
for u in rep['units']:
 for f in u.get('functions') or []:
  addr=f.get('metadata',{}).get('virtual_address')
  if addr:fm[u['name'].split('/')[0]+':'+str(addr)]=(int(f['size']),u['name'],f['name'])
def isfunction(r):return not r['symbol'].startswith('.') and r['symbol'] not in ['extab','extabindex']
conflicts=json.load(open(O/'positive-runner-artifact-audit.json'))['conflicts']
valid_runner=[r for r in a['runner'] if r not in conflicts]
sets=dict(direct_exact={r['identity'] for r in a['ledger'] if r['kind']=='new matches'},direct_improved={r['identity'] for r in a['ledger'] if r['after']>r['before']},runner_exact={r['identity'] for r in valid_runner if r['after']==100 and isfunction(r)},runner_improved={r['identity'] for r in valid_runner if r['after']>r['before'] and isfunction(r)})
sets['combined_exact']=sets['direct_exact']|sets['runner_exact'];sets['involved']=sets['direct_improved']|sets['runner_improved']
coverage={}
for name,ids in sets.items():
 mapped=ids&fm.keys();nbytes=sum(fm[x][0] for x in mapped)
 coverage[name]=dict(functions=len(ids),current_functions_mapped=len(mapped),code_bytes=nbytes,code_percent=nbytes/total*100,current_units=len({fm[x][1] for x in mapped}))
bot=collections.Counter()
for p in own:bot.update(p['counts'])
code=sum(p['metrics'].get('Matched code',{}).get('delta_bytes',0) for p in own);pp=sum(p['metrics'].get('Matched code',{}).get('delta_pp',0) for p in own);gap=100-70.15
allnew=sum(r.get('new matches',0) for r in era);allim=sum(r.get('improvements in unmatched items',0) for r in era)
section_ids={r['identity'] for r in a['runner'] if r['after']==100 and not isfunction(r)}
facts=dict(snapshot='2026-09-07',revision_date='2026-09-08',first_pr=2581,joined='2026-06-05T14:12:13Z',join_matched_code_pct=70.15,gap_percentage_points=gap,merged_prs=len(own),ci_match_events=bot['new matches'],ci_improvement_events=bot['improvements in unmatched items'],ci_positive_events=bot['new matches']+bot['improvements in unmatched items'],ci_code_bytes=code,ci_code_delta_pp_rounded_sum=round(pp,2),equivalent_fraction_of_join_gap_pct=pp/gap*100,byte_normalized_equivalent_gap_pct=(code/total*100)/gap*100,era_merged_prs=len(era),era_prs_with_bot_report=sum(r.get('has_report',False) for r in era),era_match_events=allnew,era_improvement_events=allim,share_of_era_match_events_pct=bot['new matches']/allnew*100,share_of_era_improvement_events_pct=bot['improvements in unmatched items']/allim*100,runner_exact_sections=len(section_ids),coverage=coverage)
(O/'video-facts.json').write_text(json.dumps(facts,indent=2))
rows=[];series=collections.defaultdict(lambda:collections.Counter())
for p in own:
 count=p['counts'];m=p['metrics'].get('Matched code',{});rows.append(dict(pr=p['number'],title=p['title'],new_matches=count.get('new matches',0),improvements=count.get('improvements in unmatched items',0),code_bytes=m.get('delta_bytes',0),code_pp=m.get('delta_pp',0),url=p['url'],has_counts=bool(count)))
 group='June opening PRs' if p['number']<=2636 else 'June subsystem series' if p['number']<=2692 else 'June/July 14-part series' if p['number']<=2733 else 'July subsystem series' if p['number']<=2895 else 'August/September sessions'
 series[group].update(dict(prs=1,new_matches=count.get('new matches',0),improvements=count.get('improvements in unmatched items',0),code_bytes=m.get('delta_bytes',0)))
(O/'video-ci-ledger.json').write_text(json.dumps(rows,indent=2))
def table(head,rows):return '\n'.join(['| '+' | '.join(head)+' |','| '+' | '.join('---' for _ in head)+' |']+['| '+' | '.join(str(x).replace('|','/') for x in row)+' |' for row in rows])
ci_table=table(['PR','New matches','Improvements','Matched code bytes','Title'],[[f"[#{r['pr']}]({r['url']})",r['new_matches'] if r['has_counts'] else 'No report',r['improvements'] if r['has_counts'] else 'No report',f"+{r['code_bytes']:,}",r['title']] for r in rows])
series_table=table(['Series','Merged PRs','New matches','Improvements','Code-byte gain'],[[n,v['prs'],v['new_matches'],v['improvements'],f"+{v['code_bytes']:,}"] for n,v in series.items()])
text=f'''# What I Contributed to Melee: Video Research Report

Prepared September 8, 2026 from the September 7 evidence snapshot. These numbers describe your work through the 100% milestone. The appendix lists the CI messages for all 57 merged personal PRs.

## The Video's Main Claim

> I joined Melee when the project was around 70% matched. Over the next three months, I merged 57 PRs. Their CI reports recorded 654 new matches and 1,318 improvements to things that were still unmatched, with about 443,000 additional bytes of matched code. That reported code gain is equivalent to roughly 38% of the gap that remained when I joined. Other contributors also built on the Harness's work, including 24 functions it had already matched before they were merged through another person's PR.

On-screen footnote: **CI match counts include function and data-section events. The 38% figure compares reported code gains with the starting gap; it is not a unique-function or exclusive-authorship percentage.**

This is the strongest compact version supported by the CI messages. The 654 and 1,318 are exact sums of the available final bot summaries, not estimates assembled from truncated tables.

## Your Four Questions

### 1. How Much of the Remaining Matching Did I Directly Do?

Your merged PRs report **654 new-match events** and **+442,828 matched-code bytes**. Summing the rounded CI percentage deltas gives **+11.42 percentage points**.

The last available merged bot report before your first PR showed **70.15% matched code**, in [#2579](https://github.com/doldecomp/melee/pull/2579#issuecomment-4625896935). You opened [#2581](https://github.com/doldecomp/melee/pull/2581) on June 5, 2026 at 14:12 UTC. That leaves a **29.85-percentage-point starting gap**.

**11.42 ÷ 29.85 = {pp/gap*100:.2f}%**, approximately **38% of the starting gap**. Using the exact reported byte sum and today's code size gives **{facts['byte_normalized_equivalent_gap_pct']:.2f}%**, also about 38%.

Use the wording "my PRs' reported gains were equivalent to about 38% of the remaining gap." An unqualified "I did 38% of all remaining functions" would be wrong. The original 70% measures code bytes, and functions vary greatly in size. CI also changed its comparison rules during this period, and PR comparisons do not always use the immediate merge parent.

The reconstructed function ledger separately documents **at least 551 distinct function completions in your personal merged PRs**. This is more specific than the CI event count, but older truncated reports prevent it from being a complete lifetime tally. We do not have a reliable count of unmatched functions at your join date, so we cannot calculate your exact share of those original functions.

### 2. How Many Things Was I Involved In?

The CI messages on your merged PRs contain **1,972 positive events**: **654 new matches + 1,318 unmatched-item improvements**. A function can improve in one PR and become exact in another. These are useful measures of work delivered, but not 1,972 unique objects.

Across the available merged PR reports after your join date, all authors together have **2,238 unmatched-item improvement events**. Yours account for **{facts['share_of_era_improvement_events_pct']:.2f}%**, about **59%**. This is a share of reported improvement events, not a share of the codebase or a measure of difficulty. The comparison covers 751 merged PRs, of which 677 have a usable bot report. All 751 have local comment records; a missing bot report is not treated as proof of zero work.

All authors' reports also contain **6,637 new-match events**. Your 654 are **{facts['share_of_era_match_events_pct']:.2f}% of those events**. This is a different denominator from the 38% code-gap estimate. Project-wide events include repeat matches and rematches after stricter comparisons, so 6,637 is not the number of unique unmatched functions you started with.

Your personal merged changes touched **200 C files and 242 paths overall**. The measured merged-function ledger covers **998 distinct functions with positive movement**. Including passed Harness improvements brings the supported involvement set to **{coverage['involved']['functions']:,} distinct functions**. This broader set includes discoveries that may not have shipped unchanged.

There are also **13 merged implementation PRs explicitly crediting or describing reuse of your work**, listed in the [detailed attribution report](report.html). That is useful evidence for "other people built on this," without claiming all of those authors' subsequent work as yours.

### 3. What Is the Harness's Exact Number of Matches Found?

The surviving validated records and merged evidence answer different questions:

{table(['Question','Documented count'],[['Distinct functions with artifact-verified passed exact Harness results',430],['Distinct data/exception sections with passed exact Harness results',24],['Distinct functions completed in your merged PR evidence','At least 551'],['Distinct exact functions across personal merges and validated Harness discoveries','At least 665'],['Harness exact functions outside the documented personal merge set',114]])}

The merged and runner sets share **316 functions**: **551 + 430 − 316 = 665**. The 24 matches in #3259 are already inside this combined set; adding them again would double-count them.

**430 is the exact count of unique functions in the surviving verified runner records used in this audit. It is not a proven lifetime total for every Harness version and run.** The earliest positive runner record in this dataset is June 10, after your June 5 start. Early contributions are recovered through merged PR reports instead. The complete lifetime number is not recoverable from these sources alone, and the report does not turn a lower bound into an exact lifetime claim.

Correction to the first report: its **689-function** total accidentally included **24 data-section matches**. The correct combined figure is **665 functions**, with data sections tracked separately. The former 454 runner "functions" likewise means **430 functions + 24 sections**. The old report and ledgers have been corrected.

### 4. What Portion of the Codebase Did My Work Reach?

To answer this, count the compiled byte sizes of the actual functions with measured contributions, not the full size of every file you edited.

{table(['Scope','Distinct functions','Bytes in those functions','Share of final code'],[['Functions improved or matched in your merged evidence',coverage['direct_improved']['functions'],f"{coverage['direct_improved']['code_bytes']:,}",f"{coverage['direct_improved']['code_percent']:.2f}%"],['Same, plus validated Harness improvements',coverage['involved']['functions'],f"{coverage['involved']['code_bytes']:,}",f"{coverage['involved']['code_percent']:.2f}%"],['Functions matched in your merged evidence',551,f"{coverage['direct_exact']['code_bytes']:,}",f"{coverage['direct_exact']['code_percent']:.2f}%"],['Functions matched across merged and Harness evidence',665,f"{coverage['combined_exact']['code_bytes']:,}",f"{coverage['combined_exact']['code_percent']:.2f}%"]])}

The broader involvement set reaches **{coverage['involved']['current_units']} current translation units**, **{coverage['involved']['current_units']/1130*100:.2f}% of the final 1,130 units**. This maps old function addresses to the final CI report so file moves do not inflate the byte total. {coverage['involved']['current_functions_mapped']} of {coverage['involved']['functions']} involved function identities resolve to final addresses; unresolved records contribute zero bytes, keeping byte coverage conservative.

Video wording: **"My merged improvements touched functions representing about {coverage['direct_improved']['code_percent']:.0f}% of the game's compiled code. Including the Harness's validated discoveries and improvements, that reaches about {coverage['involved']['code_percent']:.0f}%."**

That describes where your work contributed. It does not mean you wrote every instruction in those functions. A small final fix to a large function counts that function's whole size as involvement, while the CI code-gain measure counts the bytes newly qualifying as exact.

## The #3259 Contribution, Without Guesswork

[dberweger2017's #3259](https://github.com/doldecomp/melee/pull/3259) opened August 30 and merged before your #3223. Its CI message contains **28 new matches**, comprising **26 functions and 2 exception-table sections**, and **103 other improvements**.

**24 of its 26 functions have earlier passed exact Harness artifacts.** The other two have earlier partial Harness results. The artifacts for all 24 exact matches were opened, checked, and preserved in `evidence/db-runner/`. Your own comment on #3259 raised the overlap with #3223.

Use: **"Twenty-four functions merged through that PR were already matched by my Harness before the PR opened."**

The evidence establishes prior discovery, not the author's intent or how their code was obtained. It does not support saying 30–40 exact functions were taken. The 103 improvement events are not all assigned to you merely because the files overlap. Other attribution and overlap ledgers remain available in [the detailed report](report.html).

## How the CI Totals Built Up

{series_table}

Some of the largest individual deliveries were **#2877**, with 86 new matches and 67 improvements; **#2880**, with 72 and 48; and **#3223**, with 62 and 70. Your early **#2583** alone recorded 35 new matches and 117 improvements.

## Numbers to Put on Screen

{table(['Caption','Number','What it means'],[['Merged PRs','57','Your account, merged only'],['CI new matches','654','Function and section match events'],['CI improvements','1,318','Reported positive events in unmatched items'],['Direct matched-code gain','442,828 bytes','Sum of final personal-PR bot deltas'],['Equivalent share of starting gap','About 38%','Reported code gain divided by the 70.15%→100% gap'],['Share of reported improvement events','About 59%','1,318 of 2,238 events in available merged CI reports'],['Function-level involvement','About 29% of code bytes','Includes validated Harness improvements; not sole authorship'],['Earlier Harness matches in #3259','24 functions','Artifact-verified local precedence']])}

These measures overlap. Do not add 654 matches, 665 unique functions, 24 #3259 matches, and contributions through credited PRs into one total.

## Every Personal Merged PR's CI Message

This table uses the final `decomp-dev[bot]` summaries, exactly the metric requested. "No report" for #2628 and #2630 means no numerical bot report was available; the zero byte contribution in the sum is unmeasured, not a finding that the PR did nothing. Unlike the older technical report, this appendix does not replace bot totals with reconstructed CI merge-parent counts.

{ci_table}

**Totals: 654 new matches; 1,318 improvements; +442,828 matched-code bytes; +50,432 matched-data bytes.** Four unmatched-item regressions are also reported. No broken-match event appears in the final bot summaries on your personal PRs; the separate merge-parent reconstruction found one, illustrating why those two counting methods must remain separate.

## Evidence and Limits for Publication

The snapshot ends at the September 7 100% milestone, not at the latest commit after this report was written. The final downloaded report verifies all **19,828 functions**, **3,882,032 code bytes**, and **1,211,168 data bytes** matched. Its aggregate fuzzy field is 99.999954%, while its exact-match and completion measures are 100%.

The starting 70.15% is the last available merged PR bot report before your first PR, not a rebuilt exact-time mainline baseline. Your first PR's own bot comparison implies a 70.29% baseline, because other work landed between these observations. Either baseline rounds the gap-share estimate to about 38%.

[#2785](https://github.com/doldecomp/melee/pull/2785) switched the project to stricter data-value diffing and reported a **0.62-point decrease and 53 broken-match events**. Other changes also rematched previously matched work. This is why cumulative CI events and byte gains do not establish a disjoint ownership split of the original remaining code.

The 13 credited external PRs establish reuse; uncredited function overlap establishes only precedence. These categories are kept separate. This report makes no claim that all community progress after June 5 came from the Harness.

Machine-readable evidence: [video-facts.json](video-facts.json), [all 57 CI rows](video-ci-ledger.json), [era-wide CI event counts](ci-era-counts.json), [corrected detailed ledgers](ledgers.json), and [technical report](report.html). Original PR metadata, comments, downloaded build reports, and validation artifacts are preserved beside them. All 3,974 retained positive runner records were checked against their artifact files for this revision. Six conflicting records were excluded from the involvement calculation; repeated valid results preserve the same distinct-function coverage.
'''
(O/'video-report.md').write_text(text)
body=markdown.markdown(text,extensions=['tables','toc']);body=body.replace('<table>','<div class="tablewrap"><table>').replace('</table>','</table></div>')
style='''body{margin:0;background:#f3f6fa;color:#172d44;font:17px/1.65 system-ui,sans-serif}main{max-width:1080px;margin:auto;padding:32px}h1{font-size:42px;line-height:1.15}h2{margin-top:48px;border-top:1px solid #cad5e2;padding-top:22px}h3{margin-top:30px}a{color:#225bc4}blockquote{margin:24px 0;padding:18px 25px;background:#e3edfc;border-left:5px solid #225bc4;font-size:20px}table{border-collapse:collapse;width:100%;font-size:14px;background:white}td,th{padding:10px 12px;border-bottom:1px solid #d9e1ec;text-align:left;vertical-align:top}th{background:#dae5f4}tr:nth-child(even){background:#f9fbfd}.tablewrap{overflow-x:auto}code{overflow-wrap:anywhere}nav{background:#152f49;padding:16px 32px;color:white}nav a{color:white;margin-right:24px}@media(max-width:700px){main{padding:18px}h1{font-size:30px}blockquote{font-size:18px}}@media print{nav{display:none}main{max-width:none;padding:0}body{background:white}h2,h3{break-after:avoid}tr{break-inside:avoid}}'''
(O/'video-report.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Melee Video Facts · fjooord</title><style>'+style+'</style><nav><a href="video-report.md">Markdown</a><a href="video-facts.json">Numbers</a><a href="report.html">Searchable evidence</a></nav><main>'+body+'</main></html>')
print(json.dumps(facts,indent=2))
