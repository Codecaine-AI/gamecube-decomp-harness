#!/usr/bin/env python3
"""Render the extended pi agent tool-analysis HTML report from stats JSON.

Usage: python3 analysis/scripts/render-pi-agent-tool-report.py /tmp/pi-tool-stats.json analysis/reports/out.html
"""
import json
import statistics
import sys
from collections import Counter

stats = json.load(open(sys.argv[1]))
OUT = sys.argv[2]

leases = stats["leases"]
term = [L for L in leases if L["outcome"] != "in_flight"]
r2 = [L for L in term if L["run"] == "run2"]
r1 = [L for L in term if L["run"] == "run1"]

SUCC = ("confirmed_exact", "confirmed_improved")


def fmt_pct(x, dec=1):
    return f"{100*x:.{dec}f}%"


def bar(p, color="#16a34a"):
    return (f'<div class="bar"><div class="bar-fill" style="width:{100*p:.1f}%;'
            f'background:{color}"></div><span>{100*p:.1f}%</span></div>')


def median(xs):
    return statistics.median(xs) if xs else 0


# ---------- funnel ----------
ORDER = ["confirmed_exact", "confirmed_improved", "exact_rejected",
         "improved_rejected", "no_change", "error", "aborted"]
LABELS = {
    "confirmed_exact": ('<span class="pill ok">confirmed exact</span>', ""),
    "confirmed_improved": ('<span class="pill ok" style="background:#ccfbf1;color:#115e59">confirmed improved</span>', ""),
    "exact_rejected": ('<span class="pill warn">exact, rejected at gates</span>', ""),
    "improved_rejected": ('<span class="pill warn">improved, rejected</span>', ""),
    "no_change": ('<span class="pill neutral">no change</span>', ""),
    "error": ('<span class="pill bad">error</span>', ""),
    "aborted": ('<span class="pill bad" style="background:#f1f5f9;color:#64748b">aborted</span>', ""),
}

funnel_rows = []
for o in ORDER:
    c1 = sum(1 for L in r1 if L["outcome"] == o)
    c2 = sum(1 for L in r2 if L["outcome"] == o)
    d1 = [L["duration_min"] for L in r1 if L["outcome"] == o]
    d2 = [L["duration_min"] for L in r2 if L["outcome"] == o]
    funnel_rows.append(
        f"<tr><td>{LABELS[o][0]}</td>"
        f'<td class="num">{c1}</td><td class="num">{median(d1):.0f} min</td>'
        f'<td class="num">{c2}</td><td class="num">{median(d2):.0f} min</td>'
        f'<td class="num">{c2-c1:+d}</td></tr>')

n1_work = sum(1 for L in r1 if L["outcome"] != "aborted")
n2_work = sum(1 for L in r2 if L["outcome"] != "aborted")
s1 = sum(1 for L in r1 if L["outcome"] in SUCC)
s2 = sum(1 for L in r2 if L["outcome"] in SUCC)

# ---------- improvement magnitude (run2 confirmed improved) ----------
deltas = sorted(L["after"] - L["before"] for L in r2
                if L["outcome"] == "confirmed_improved" and L.get("before") is not None)
n_d = len(deltas)
tiny = sum(1 for x in deltas if x < 0.5)
sub01 = sum(1 for x in deltas if x < 0.1)
big = sum(1 for x in deltas if x >= 5)

# ---------- durations ----------
def dur_row(label, xs):
    if not xs:
        return ""
    xs = sorted(xs)
    p = lambda q: xs[min(len(xs)-1, round(q*(len(xs)-1)))]
    within60 = sum(1 for x in xs if x <= 60) / len(xs)
    hours = sum(xs) / 60
    return (f"<tr><td>{label}</td><td class='num'>{len(xs)}</td>"
            f"<td class='num'>{median(xs):.0f}</td><td class='num'>{p(.75):.0f}</td>"
            f"<td class='num'>{p(.9):.0f}</td><td class='num'>{max(xs):.0f}</td>"
            f"<td class='num'>{100*within60:.0f}%</td>"
            f"<td class='num'>{hours:.0f} h</td></tr>")

dur_rows = []
for o in ORDER:
    xs = [L["duration_min"] for L in r2 if L["outcome"] == o]
    lbl = LABELS[o][0]
    dur_rows.append(dur_row(lbl, xs))

succ_durs = sorted(L["duration_min"] for L in term if L["outcome"] in SUCC)
exact_durs = sorted(L["duration_min"] for L in term if L["outcome"] == "confirmed_exact")
impr_durs = sorted(L["duration_min"] for L in term if L["outcome"] == "confirmed_improved")

# ---------- kill table ----------
kill_rows = []
mean_succ_dur = statistics.mean(succ_durs)
p_base = len([L for L in term if L["outcome"] in SUCC]) / len(term)
for k in stats["kill_table"]:
    T = k["T_min"]
    if T not in (30, 40, 50, 60, 75, 90, 120):
        continue
    kept_pct = k["succ_kept"] / k["succ_total"]
    freed = k["fail_hours_saved"] + k["succ_hours_at_risk"]
    new_attempts = freed * 60 / mean_succ_dur
    ev = new_attempts * p_base - k["succ_lost"]
    pso = k["p_success_given_over"]
    kill_rows.append(
        f"<tr><td class='num'><b>{T}</b></td>"
        f"<td class='num'>{k['succ_kept']} / {k['succ_total']} ({fmt_pct(kept_pct,0)})</td>"
        f"<td class='num'>{k['succ_lost']}</td>"
        f"<td>{bar(pso, '#dc2626' if pso < p_base else '#f59e0b')}</td>"
        f"<td class='num'>{k['fail_hours_saved']:.0f} h</td>"
        f"<td class='num'>{freed:.0f} h</td>"
        f"<td class='num'>{ev:+.0f}</td></tr>")

# ---------- tools (run2 only) ----------
r2_succ = [L for L in r2 if L["outcome"] in SUCC]
r2_exact = [L for L in r2 if L["outcome"] == "confirmed_exact"]
r2_impr = [L for L in r2 if L["outcome"] == "confirmed_improved"]
r2_nc = [L for L in r2 if L["outcome"] == "no_change"]
r2_tools = sorted({t for L in r2 for t in L["tools"]})
p_base_r2 = len(r2_succ) / len(r2)

tool_rows = []
tool_stats = {}
for t in r2_tools:
    users = [L for L in r2 if t in L["tools"]]
    total = sum(L["tools"].get(t, 0) for L in r2)
    a_ex = sum(1 for L in r2_exact if t in L["tools"]) / (len(r2_exact) or 1)
    a_im = sum(1 for L in r2_impr if t in L["tools"]) / (len(r2_impr) or 1)
    a_nc = sum(1 for L in r2_nc if t in L["tools"]) / (len(r2_nc) or 1)
    p_use = sum(1 for L in users if L["outcome"] in SUCC) / len(users) if users else 0
    non = [L for L in r2 if t not in L["tools"]]
    p_non = sum(1 for L in non if L["outcome"] in SUCC) / len(non) if non else 0
    tool_stats[t] = dict(total=total, n_users=len(users), a_ex=a_ex, a_im=a_im,
                         a_nc=a_nc, p_use=p_use, p_non=p_non)

for t in sorted(r2_tools, key=lambda t: -tool_stats[t]["total"]):
    s = tool_stats[t]
    if s["total"] < 10:
        continue
    lift = s["p_use"] - s["p_non"]
    lift_cls = "pos" if lift > 0.08 else ("neg" if lift < -0.02 else "")
    tool_rows.append(
        f"<tr><td class='mono'>{t}</td>"
        f"<td>{bar(s['a_ex'])}</td><td>{bar(s['a_im'], '#0d9488')}</td>"
        f"<td>{bar(s['a_nc'], '#94a3b8')}</td>"
        f"<td class='num'>{fmt_pct(s['p_use'],0)}</td>"
        f"<td class='num'><span class='{lift_cls}' style='font-weight:600;"
        f"color:{'#16a34a' if lift>0.08 else ('#dc2626' if lift<-0.02 else '#64748b')}'>"
        f"{100*lift:+.0f} pts</span></td>"
        f"<td class='num'>{s['total']}</td><td class='num'>{s['n_users']}</td></tr>")

# shelfware lists
advertised = set(stats["advertised_tools"].get("run2", []))
never = sorted(advertised - set(r2_tools))
near_never = sorted((t for t in r2_tools if t in advertised
                     and tool_stats[t]["n_users"] <= 10 and tool_stats[t]["total"] < 20),
                    key=lambda t: tool_stats[t]["total"])
never_li = "".join(f"<li><code>{t}</code></li>" for t in never)
near_li = "".join(
    f"<li><code>{t}</code> — {tool_stats[t]['total']} calls across "
    f"{tool_stats[t]['n_users']} leases</li>" for t in near_never)

# ---------- confirmed exact details (run2) ----------
exact_detail_rows = []
for L in sorted(r2_exact, key=lambda L: L["duration_min"]):
    top_tools = ", ".join(t for t, _ in Counter(L["tools"]).most_common(6))
    exact_detail_rows.append(
        f"<tr><td class='mono'>{L['symbol']}<div class='muted small'>{(L['unit'] or '').replace('main/','')}</div></td>"
        f"<td class='num'>{L['size'] or '–'}</td>"
        f"<td class='num'>{L['start_fuzzy']:.1f}%</td>"
        f"<td class='num'>{L['duration_min']:.0f} min</td>"
        f"<td class='num'>{L['total_calls']}</td>"
        f"<td class='small mono'>{top_tools}</td></tr>")

# ---------- gate-loss breakdown (run2) ----------
gate = Counter()
for x in stats["exact_rejected_details"]:
    if x["run"] != "run2":
        continue
    rs = "; ".join(x["rv_reasons"])
    if "qa lint" in rs and "regression" not in rs:
        gate["QA lint maintainer-rejected patterns"] += 1
    elif "regression" in rs:
        gate["same-unit score regressions (some + lint)"] += 1
    elif "did not reach exact" in rs:
        gate["did not reproduce in runner validation"] += 1
    else:
        gate["post-return gate after passing runner validation"] += 1
gate_li = "".join(f"<li><b>{v}</b> — {k}</li>" for k, v in gate.most_common())

def tc(t):
    return tool_stats.get(t, {}).get("total", "–")


def tn(t):
    return tool_stats.get(t, {}).get("n_users", "–")


n_term = len(term)
n_succ = len(succ_durs)
hours_total_r2 = sum(L["duration_min"] for L in r2) / 60
hours_nc_r2 = sum(L["duration_min"] for L in r2
                  if L["outcome"] not in SUCC) / 60

html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pi Worker Agents — Confirmed Outcomes, Durations &amp; Tool Effectiveness (extended)</title><style>
:root {{ color-scheme: light; }}
* {{ box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  margin: 0; background: #f1f5f9; color: #0f172a; line-height: 1.5; }}
.wrap {{ max-width: 1100px; margin: 0 auto; padding: 32px 24px 80px; }}
header.page {{ background: #fff; border-bottom: 1px solid #e2e8f0; padding: 28px 24px; }}
header.page h1 {{ margin: 0 0 4px; font-size: 22px; font-weight: 650; color: #0f172a; }}
header.page .sub {{ color: #64748b; font-size: 13.5px; }}
h2 {{ font-size: 16px; font-weight: 650; color: #334155; margin: 36px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }}
h3 {{ font-size: 13.5px; font-weight: 600; color: #475569; margin: 20px 0 8px; }}
.cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 16px 0; }}
.card {{ background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; }}
.card .v {{ font-size: 24px; font-weight: 650; }}
.card .v.pos {{ color: #16a34a; }}
.card .v.neg {{ color: #dc2626; }}
.card .l {{ font-size: 12px; color: #64748b; margin-top: 2px; }}
table {{ width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 13px; }}
th {{ text-align: left; font-weight: 600; color: #475569; background: #f8fafc; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; }}
td {{ padding: 7px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }}
tr:last-child td {{ border-bottom: none; }}
td.num, th.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
code, .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }}
.bar {{ position: relative; background: #f1f5f9; border-radius: 3px; height: 16px; min-width: 90px; }}
.bar-fill {{ height: 100%; border-radius: 3px; }}
.bar span {{ position: absolute; right: 5px; top: 0; font-size: 11px; line-height: 16px; color: #334155; font-variant-numeric: tabular-nums; }}
.pill {{ display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; }}
.pill.ok {{ background: #dcfce7; color: #166534; }}
.pill.warn {{ background: #fef9c3; color: #854d0e; }}
.pill.bad {{ background: #fee2e2; color: #991b1b; }}
.pill.neutral {{ background: #e2e8f0; color: #475569; }}
.note {{ background: #fff; border: 1px solid #e2e8f0; border-left: 3px solid #94a3b8; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #475569; margin: 14px 0; }}
.note.action {{ border-left-color: #16a34a; }}
ul.tight {{ margin: 8px 0; padding-left: 20px; }} ul.tight li {{ margin: 4px 0; }}
.muted {{ color: #64748b; }}
.small {{ font-size: 12px; }}
.cols2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
@media (max-width: 800px) {{ .cols2 {{ grid-template-columns: 1fr; }} }}
</style></head><body>
<header class="page"><div class="wrap" style="padding:0 24px">
<h1>Pi Worker Agents — Confirmed Outcomes, Durations &amp; Tool Effectiveness</h1>
<div class="sub">Extends <code>pi-agent-tool-analysis-2026-06-11.html</code> · Runs <code>302fb981</code> (Jun 10–11) + <code>caa0dfd7</code> (Jun 11–12, active) · codex-lb / gpt-5.5 ·
{len(term)} terminal leases ({len(r1)} + {len(r2)}) · <b>xhigh thinking only</b> (run-1 medium leases excluded — all workers run xhigh now) · outcomes from worker events with runner-validation as the canonical gate</div>
</div></header>
<div class="wrap">

<h2>Headline numbers</h2>
<div class="cards">
<div class="card"><div class="v pos">{n_succ}</div><div class="l">runner-confirmed successes ({len(exact_durs)} exact + {len(impr_durs)} improved) across both runs</div></div>
<div class="card"><div class="v pos">{s2}</div><div class="l">of those landed in run 2 alone ({sum(1 for L in r2_exact)} exact + {len(r2_impr)} improved) — {fmt_pct(s2/len(r2),0)} of its leases</div></div>
<div class="card"><div class="v">{median(succ_durs):.0f} min</div><div class="l">median wall-clock for a confirmed success · 90% finish within {sorted(succ_durs)[round(.9*(len(succ_durs)-1))]:.0f} min</div></div>
<div class="card"><div class="v neg">{fmt_pct(stats['kill_table'][6]['p_success_given_over'],0)}</div><div class="l">chance a lease still running at 75 min ever confirms — vs {fmt_pct(p_base,0)} for a fresh attempt</div></div>
</div>

<h2>1 · Run-over-run funnel — what changed since the last report</h2>
<table><tr><th>Outcome</th><th class="num">Run 1 (302fb981)</th><th class="num">median dur</th><th class="num">Run 2 (caa0dfd7)</th><th class="num">median dur</th><th class="num">Δ</th></tr>
{''.join(funnel_rows)}
</table>
<div class="note">Run 2 performs in a different league. The <b>empty-return abort plague is gone</b> ({sum(1 for L in r1 if L['outcome']=='aborted')} → {sum(1 for L in r2 if L['outcome']=='aborted')}), recovering what was ~60 worker-hours of dead air in run 1. With the same thinking level (xhigh) across the board, run 2 confirmed <b>{s2} successes out of {len(r2)} terminal leases ({fmt_pct(s2/len(r2),0)})</b> vs run 1's {s1}/{len(r1)} ({fmt_pct(s1/len(r1),0)}). The new loss bucket to watch is <b>exact-but-rejected ({sum(1 for L in r2 if L['outcome']=='exact_rejected')} in run 2)</b> — section 5.</div>

<h2>2 · What counts as a "true" improvement</h2>
<p class="small muted">Everything labeled <i>confirmed</i> below passed runner-owned same-unit validation (the canonical gate) — not just the worker's local score claim.</p>
<div class="cards">
<div class="card"><div class="v">{n_d}</div><div class="l">run-2 confirmed improvements with before/after scores</div></div>
<div class="card"><div class="v">{median(deltas):.2f} pts</div><div class="l">median score gain per confirmed improvement</div></div>
<div class="card"><div class="v">{tiny}</div><div class="l">gained &lt; 0.5 pts ({sub01} of them &lt; 0.1 pts)</div></div>
<div class="card"><div class="v pos">{big}</div><div class="l">gained ≥ 5 pts (real understanding wins)</div></div>
</div>
<div class="note">Under the matches-only shipping policy, improvements stay local as branch delta — so their value is as <b>stepping stones toward exact</b>. A third of confirmed improvements ({tiny}/{n_d}) move the score by less than half a point. They're real (runner-validated) but cheap signal: the leases that matter most are the {big} with ≥5-pt gains and the {len(r2_exact)} exacts. When judging tool effectiveness below, "success" = confirmed exact <i>or</i> confirmed improved, but the exact-only adoption column is the sharper lens.</div>

<h2>3 · How long confirmed work actually runs</h2>
<table><tr><th>Run-2 outcome</th><th class="num">Leases</th><th class="num">Median (min)</th><th class="num">p75</th><th class="num">p90</th><th class="num">Max</th><th class="num">≤ 60 min</th><th class="num">Total worker-time</th></tr>
{''.join(dur_rows)}
</table>
<div class="note"><b>Confirmed exacts are fast: median {median(exact_durs):.0f} min, {fmt_pct(sum(1 for x in exact_durs if x<=60)/len(exact_durs),0)} done inside an hour</b> (combined runs). Confirmed improvements run a little longer (median {median(impr_durs):.0f} min). The long tail belongs almost entirely to leases that never confirm: run-2 no-change leases burned {sum(L['duration_min'] for L in r2 if L['outcome']=='no_change')/60:.0f} h with a {sorted(L['duration_min'] for L in r2 if L['outcome']=='no_change')[round(0.9*(len([L for L in r2 if L['outcome']=='no_change'])-1))]:.0f}-min p90, and the <i>improved-rejected</i> cohort medians ~90 min — long grinds that then fail gates. Of {hours_total_r2:.0f} total run-2 worker-hours, {fmt_pct(hours_nc_r2/hours_total_r2,0)} went to leases that confirmed nothing.</div>

<h2>4 · Kill threshold — when to stop a running lease</h2>
<p class="small muted">For each candidate timeout T: how many confirmed successes finish within T, the odds a lease still running at T ever confirms, and what killing at T frees up. {n_term} terminal leases, both runs.</p>
<table><tr><th class="num">T (min)</th><th class="num">Successes kept</th><th class="num">Lost</th><th>P(confirm | still running at T)</th><th class="num">Failed-lease hours saved</th><th class="num">Total hours freed</th><th class="num">Net successes if hours re-spent*</th></tr>
{''.join(kill_rows)}
</table>
<div class="note action"><b>Recommendation: kill at 75 minutes.</b> A lease still alive at 75 min has a {fmt_pct(stats['kill_table'][6]['p_success_given_over'],0)} chance of ever confirming — a fresh lease off the queue runs at {fmt_pct(p_base,0)}. Killing at 75 min keeps {stats['kill_table'][6]['succ_kept']}/{stats['kill_table'][6]['succ_total']} ({fmt_pct(stats['kill_table'][6]['succ_kept']/stats['kill_table'][6]['succ_total'],0)}) of confirmed successes and frees ~{stats['kill_table'][6]['fail_hours_saved']+stats['kill_table'][6]['succ_hours_at_risk']:.0f} worker-hours per ~600 leases. 60 min is the aggressive setting (keeps 90%, frees {stats['kill_table'][5]['fail_hours_saved']+stats['kill_table'][5]['succ_hours_at_risk']:.0f} h) — net expected yield is about the same; 75 min is safer against medium-size targets that legitimately need the time.<br><br>
The knob already exists: <code>--agent-timeout-seconds</code> bounds each live Pi session and currently defaults to <i>no timeout</i> (<code>apps/cli/src/cli/usage.ts:42</code>). Set <code>--agent-timeout-seconds 4500</code> on worker launch. *Net column assumes freed hours are re-spent on fresh leases at the {fmt_pct(p_base,0)} base rate and {mean_succ_dur:.0f}-min mean success duration.</div>

<h2>5 · Where exacts are being lost ({sum(gate.values())} in run 2)</h2>
<ul class="tight">{gate_li}</ul>
<div class="note">The QA lint gate (L2 fail-closed) is now the single biggest killer of locally-exact results. These targets land in <code>needs_rework</code> and requeue at repair priority, so they aren't gone — but each one costs a full extra lease. The banned-pattern findings are concentrated and worth a worker-prompt line per top pattern, same play as the string-literal fix that worked after the last report.</div>

<h2>6 · Tool effectiveness — run 2 only (current tool inventory, ≥10 calls)</h2>
<p class="small muted">Adoption = % of leases in that outcome class that called the tool at least once. Lift = P(confirm | lease used tool) − P(confirm | lease didn't). Correlational: closing-phase tools are reached <i>because</i> sessions are succeeding — but a negative lift on a heavily-called tool is still a red flag.</p>
<table><tr><th>Tool</th><th>% of exact</th><th>% of improved</th><th>% of no-change</th><th class="num">P(confirm | used)</th><th class="num">Lift</th><th class="num">Calls</th><th class="num">Leases</th></tr>
{''.join(tool_rows)}
</table>

<h2>7 · Tool cleanup — what to remove, watch, and keep</h2>
<div class="cols2">
<div>
<h3>Remove from the worker inventory ({len(never)+len(near_never)} tools)</h3>
<p class="small muted">Never or nearly never called in {len(r2)} run-2 leases, no success lift where called.</p>
<h3 class="small">Never called</h3><ul class="tight">{never_li}</ul>
<h3 class="small">Nearly never called</h3><ul class="tight">{near_li}</ul>
</div>
<div>
<h3>Watch list — used but no measurable lift</h3>
<ul class="tight">
<li><code>objdiff_score_candidate</code> — {tc('objdiff_score_candidate')} calls, <b>negative lift</b>; sessions that lean on it are disproportionately stuck ones re-scoring without new ideas</li>
<li><code>external_mirrors_search</code> — {tc('external_mirrors_search')} calls, negative lift</li>
<li><code>external_symbol_lookup</code> — {tc('external_symbol_lookup')} calls, flat</li>
<li><code>mwcc_debug_diagnose_inlines</code> — {tc('mwcc_debug_diagnose_inlines')} calls, flat</li>
<li><code>type_oracle_lookup</code> — {tc('type_oracle_lookup')} calls, flat (was already flagged last report)</li>
</ul>
<h3>Keep / promote</h3>
<ul class="tight">
<li><b>Closing discipline still separates winners:</b> <code>checkdiff_summary</code> and <code>review_lint_scan</code> — ~100% adoption in confirmed leases vs ~60% in no-change</li>
<li><code>source_permuter_replay</code> — strongest positive lift in the fleet; underused (only {tn('source_permuter_replay')} leases). Worth a prompt nudge after a permuter hit</li>
<li><code>mwcc_debug_diagnose_stack</code> — clear positive lift among the diagnostics family</li>
<li>Core loop unchanged: <code>checkdiff_run</code>, <code>edit</code>, <code>bash</code>, <code>direct_compile_tu</code>, <code>read</code>, <code>m2c_decompile</code>, <code>past_prs_search</code>, <code>path_facts_resolve</code></li>
</ul>
</div>
</div>
<div class="note action">Cutting the remove-list takes the advertised inventory from {len(advertised)} to {len(advertised)-len(never)-len(near_never)} tools. The reference-data families (PowerPC docs, SSBM data sheets) have now been shelfware across <b>two full runs</b> with different target mixes — agents answer those questions through <code>checkdiff_run</code> output and <code>ghidra_lookup</code>. Safe to pull; re-pitch later as injected context rather than tools if needed.</div>

<h2>8 · All {len(r2_exact)} run-2 confirmed exacts, fastest first</h2>
<table><tr><th>Symbol</th><th class="num">Size (B)</th><th class="num">Start</th><th class="num">Duration</th><th class="num">Tool calls</th><th>Most-used tools</th></tr>
{''.join(exact_detail_rows)}
</table>

<div class="note"><b>Method &amp; caveats.</b> Outcomes from <code>events</code> (latest <code>worker_*</code> event per lease; <code>runner_validation</code> canonical) joined to <code>pi_sessions</code> and the worker JSONL transcripts in <code>.pi-sessions/worker/</code> for durations and tool calls; repair sessions are summed into their lease. Missing legacy transcript paths from the old checkout are remapped by filename into the repo-local worker transcript directory. Medium-thinking leases (run 1 only) are excluded everywhere — the fleet is all-xhigh now. "Confirmed" = result accepted by runner validation (<code>worker_finished</code> + <code>passed</code>). Run 2 was still active when sampled ({len(leases)-len(term)} in-flight leases excluded). Tool lift is correlational, not causal; the kill-threshold table is the survival-style read (P(confirm | still running at T)) and is robust to that. Generated by <code>analysis/scripts/analyze-pi-agent-tools.py</code> + <code>analysis/scripts/render-pi-agent-tool-report.py</code>.</div>

</div></body></html>"""

open(OUT, "w").write(html)
print(f"wrote {OUT} ({len(html)} bytes)")
