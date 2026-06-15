#!/usr/bin/env python3
"""Render the extended pi agent tool-analysis HTML report from stats JSON.

Usage: python3 scripts/render-pi-agent-tool-report.py /tmp/pi-tool-stats.json reports/out.html
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


def lift_bar(lift):
    cap = 0.5
    width = min(abs(lift) / cap, 1) * 50
    if lift >= 0:
        fill = f'<div class="lift-fill pos" style="left:50%;width:{width:.1f}%"></div>'
    else:
        fill = f'<div class="lift-fill neg" style="left:{50-width:.1f}%;width:{width:.1f}%"></div>'
    return f'<div class="liftbar">{fill}<span>{100*lift:+.0f} pts</span></div>'


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

s1 = sum(1 for L in r1 if L["outcome"] in SUCC)
s2 = sum(1 for L in r2 if L["outcome"] in SUCC)
r2_exact = [L for L in r2 if L["outcome"] == "confirmed_exact"]
r2_impr = [L for L in r2 if L["outcome"] == "confirmed_improved"]

# ---------- improvement magnitude (all terminal xhigh confirmed improved) ----------
deltas = sorted(L["after"] - L["before"] for L in term
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
    xs = [L["duration_min"] for L in term if L["outcome"] == o]
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

kill_by_t = {k["T_min"]: k for k in stats["kill_table"]}
k75 = kill_by_t[75]
k90 = kill_by_t[90]
freed75 = k75["fail_hours_saved"] + k75["succ_hours_at_risk"]
freed90 = k90["fail_hours_saved"] + k90["succ_hours_at_risk"]
exact_over_90 = sum(1 for x in exact_durs if x > 90)

# ---------- tools (all terminal xhigh leases) ----------
tool_scope = term
tool_exact = [L for L in tool_scope if L["outcome"] == "confirmed_exact"]
tool_nc = [L for L in tool_scope if L["outcome"] == "no_change"]
scope_tools = sorted({t for L in tool_scope for t in L["tools"]})

tool_stats = {}
for t in scope_tools:
    users = [L for L in tool_scope if t in L["tools"]]
    total = sum(L["tools"].get(t, 0) for L in tool_scope)
    a_ex = sum(1 for L in tool_exact if t in L["tools"]) / (len(tool_exact) or 1)
    a_nc = sum(1 for L in tool_nc if t in L["tools"]) / (len(tool_nc) or 1)
    p_use = sum(1 for L in users if L["outcome"] in SUCC) / len(users) if users else 0
    non = [L for L in tool_scope if t not in L["tools"]]
    p_non = sum(1 for L in non if L["outcome"] in SUCC) / len(non) if non else 0
    tool_stats[t] = dict(total=total, n_users=len(users), a_ex=a_ex,
                         a_nc=a_nc, p_use=p_use, p_non=p_non)

PRIMARY_SURFACE_TOOLS = [
    "bash", "edit", "read", "checkdiff_run", "direct_compile_tu", "m2c_decompile",
]
INJECTED_CONTEXT_TOOLS = ["path_facts_resolve", "past_prs_search"]
AUTO_CLOSE_TOOLS = ["checkdiff_summary", "review_lint_scan"]
AUTOMATIC_CONTEXT_TOOLS = INJECTED_CONTEXT_TOOLS + AUTO_CLOSE_TOOLS
SPECIALIST_TOOLS = [
    "source_permuter_replay", "source_permuter_run",
    "mwcc_debug_diagnose_stack", "mwcc_debug_diagnose_regflow",
]
CORE_TOOLS = set(PRIMARY_SURFACE_TOOLS + AUTOMATIC_CONTEXT_TOOLS)


def optional_action(t):
    if t in never or t in near_never:
        return "Hide / prune"
    if t == "source_permuter_replay":
        return "Promote"
    if t in ("source_permuter_run", "mwcc_debug_diagnose_stack",
             "mwcc_debug_diagnose_regflow"):
        return "Keep visible"
    if t in ("objdiff_score_candidate", "external_mirrors_search",
             "external_symbol_lookup", "discord_knowledge_search",
             "code_graph_search", "ghidra_lookup", "mismatch_db_search",
             "mwcc_debug_lookup", "mwcc_debug_dump_function",
             "source_mutation_preview", "opseq_similar_functions",
             "mwcc_debug_diagnose_inlines", "type_oracle_lookup", "write"):
        return "Pull back"
    s = tool_stats[t]
    lift = s["p_use"] - s["p_non"]
    if lift > 0.12:
        return "Promote"
    if lift < -0.08 or s["a_nc"] > s["a_ex"] + 0.15:
        return "Pull back"
    return "Measure"


# shelfware lists
advertised = set().union(*(set(v) for v in stats["advertised_tools"].values()))
never = sorted(advertised - set(scope_tools))
near_never = sorted((t for t in scope_tools if t in advertised
                     and tool_stats[t]["n_users"] <= 10 and tool_stats[t]["total"] < 20),
                    key=lambda t: tool_stats[t]["total"])

optional_candidates = [t for t in scope_tools
                       if t not in CORE_TOOLS and tool_stats[t]["total"] >= 10]
pull_back_tools = sorted(
    [t for t in optional_candidates if optional_action(t) == "Pull back"],
    key=lambda t: -tool_stats[t]["total"])

# ---------- compact inventory recommendation ----------
def code_list(tools):
    return " ".join(f"<code>{t}</code>" for t in tools)


def group_evidence(tools):
    present = [t for t in tools if t in tool_stats]
    if not present:
        return "not observed"
    calls = sum(tool_stats[t]["total"] for t in present)
    users = sum(1 for L in tool_scope if any(t in L["tools"] for t in present))
    exact_cov = sum(1 for L in tool_exact if any(t in L["tools"] for t in present)) / (len(tool_exact) or 1)
    nc_cov = sum(1 for L in tool_nc if any(t in L["tools"] for t in present)) / (len(tool_nc) or 1)
    return (f"{calls:,} calls; used in {users}/{len(tool_scope)} leases; "
            f"{fmt_pct(exact_cov,0)} exact / {fmt_pct(nc_cov,0)} no-change coverage")


hide_tools = sorted(set(never) | set(near_never))
secondary_tools = sorted(
    (set(pull_back_tools)
     | {t for t in optional_candidates if optional_action(t) == "Measure"})
    - set(hide_tools)
    - set(SPECIALIST_TOOLS),
    key=lambda t: (-tool_stats.get(t, {}).get("total", 0), t))


def surface_row(tier, tools, use, recommendation):
    return (
        f"<tr><td><b>{tier}</b></td><td class='mono toolset'>{code_list(tools)}</td>"
        f"<td>{use}</td><td class='small muted'>{group_evidence(tools)}</td>"
        f"<td>{recommendation}</td></tr>")


surface_rows = "".join([
    surface_row(
        "Primary surface",
        PRIMARY_SURFACE_TOOLS,
        "The normal inspect-edit-compile-score loop.",
        "Keep callable. This is the smallest safe hot path: file IO/editing plus one decompiler seed and compile/score feedback."),
    surface_row(
        "Injected context",
        INJECTED_CONTEXT_TOOLS,
        "Path facts and prior-art context that should arrive before the agent starts choosing tools.",
        "Inject once at lease start or keep as background retrieval; high adoption makes it poor choice-surface signal."),
    surface_row(
        "Automatic close gates",
        AUTO_CLOSE_TOOLS,
        "Summary and lint review that should happen when the candidate is ready to return.",
        "Keep the capability, but move it out of the main chooser: run as close gates or one-shot ready checks."),
    surface_row(
        "Easy specialists",
        SPECIALIST_TOOLS,
        "Use when the primary loop stalls or when the target shape clearly calls for permutation/debug help.",
        "Keep discoverable, but not mixed into the default path."),
    surface_row(
        "Secondary / on-demand",
        secondary_tools,
        "Knowledge lookups, mirrors, diagnostics, candidate scoring, and exploratory helpers.",
        "Pull behind secondary access for one 90-minute sweep; re-promote only when targeted requests prove value."),
    surface_row(
        "Hide / prune",
        hide_tools,
        "Never or nearly never used surfaces.",
        "Remove from the advertised inventory for the next sweep."),
])


def inventory_cell(title, tools, note):
    lis = "".join(f"<li><code>{t}</code></li>" for t in tools) or "<li>none</li>"
    return f"<td><b>{title}</b><p class='small muted'>{note}</p><ul class='tight'>{lis}</ul></td>"


inventory_columns = (
    "<tr>"
    + inventory_cell("Primary", PRIMARY_SURFACE_TOOLS,
                     f"{len(PRIMARY_SURFACE_TOOLS)} tools the agent should normally call.")
    + inventory_cell("Automatic / injected", AUTOMATIC_CONTEXT_TOOLS,
                     "Required capability, not default choice clutter.")
    + inventory_cell("Easy specialists", SPECIALIST_TOOLS,
                     "Reach for these after the basic loop stalls.")
    + inventory_cell("Secondary / hide", secondary_tools + hide_tools,
                     f"{len(secondary_tools)} secondary + {len(hide_tools)} prune candidates.")
    + "</tr>")


def lift_tier(t):
    if t in hide_tools:
        return "Hide / prune"
    if t in SPECIALIST_TOOLS:
        return "Easy specialist"
    return "Secondary"


def lift_tier_order(t):
    return {
        "Easy specialist": 0,
        "Secondary": 1,
        "Hide / prune": 2,
    }[lift_tier(t)]


lift_tools = sorted(
    [t for t in scope_tools if t not in CORE_TOOLS and tool_stats[t]["total"] >= 10],
    key=lambda t: (lift_tier_order(t), -tool_stats[t]["total"], t))
lift_rows = []
for t in lift_tools:
    s = tool_stats[t]
    lift = s["p_use"] - s["p_non"]
    lift_rows.append(
        f"<tr><td><span class='tag'>{lift_tier(t)}</span></td>"
        f"<td class='mono'>{t}</td>"
        f"<td>{bar(s['a_ex'])}</td>"
        f"<td>{bar(s['a_nc'], '#94a3b8')}</td>"
        f"<td class='num'>{fmt_pct(s['p_use'],0)}</td>"
        f"<td>{lift_bar(lift)}</td>"
        f"<td class='num'>{s['total']}</td>"
        f"<td class='num'>{s['n_users']}</td></tr>")

# ---------- confirmed exact details ----------
exact_detail_rows = []
all_exact = [L for L in term if L["outcome"] == "confirmed_exact"]
for L in sorted(all_exact, key=lambda L: L["duration_min"]):
    top_tools = ", ".join(t for t, _ in Counter(L["tools"]).most_common(6))
    exact_detail_rows.append(
        f"<tr><td class='num'>{L['run'].replace('run', '')}</td>"
        f"<td class='mono'>{L['symbol']}<div class='muted small'>{(L['unit'] or '').replace('main/','')}</div></td>"
        f"<td class='num'>{L['size'] or '–'}</td>"
        f"<td class='num'>{L['start_fuzzy']:.1f}%</td>"
        f"<td class='num'>{L['duration_min']:.0f} min</td>"
        f"<td class='num'>{L['total_calls']}</td>"
        f"<td class='small mono'>{top_tools}</td></tr>")

# ---------- gate-loss breakdown ----------
gate = Counter()
for x in stats["exact_rejected_details"]:
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

n_term = len(term)
n_succ = len(succ_durs)
n_in_flight = len(leases) - len(term)
hours_total = sum(L["duration_min"] for L in term) / 60
hours_nc = sum(L["duration_min"] for L in term
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
.toolset code {{ display: inline-block; margin: 0 4px 4px 0; }}
.bar {{ position: relative; background: #f1f5f9; border-radius: 3px; height: 16px; min-width: 90px; }}
.bar-fill {{ height: 100%; border-radius: 3px; }}
.bar span {{ position: absolute; right: 5px; top: 0; font-size: 11px; line-height: 16px; color: #334155; font-variant-numeric: tabular-nums; }}
.liftbar {{ position: relative; height: 18px; min-width: 120px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }}
.liftbar:before {{ content: ""; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: #94a3b8; }}
.lift-fill {{ position: absolute; top: 0; bottom: 0; opacity: .85; }}
.lift-fill.pos {{ background: #16a34a; }}
.lift-fill.neg {{ background: #dc2626; }}
.liftbar span {{ position: absolute; left: 0; right: 0; text-align: center; font-size: 11px; line-height: 18px; color: #0f172a; font-variant-numeric: tabular-nums; }}
.pill {{ display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 600; }}
.pill.ok {{ background: #dcfce7; color: #166534; }}
.pill.warn {{ background: #fef9c3; color: #854d0e; }}
.pill.bad {{ background: #fee2e2; color: #991b1b; }}
.pill.neutral {{ background: #e2e8f0; color: #475569; }}
.tag {{ display: inline-block; min-width: 72px; padding: 1px 7px; border-radius: 4px; background: #eef2ff; color: #3730a3; font-size: 11px; font-weight: 600; text-align: center; }}
.note {{ background: #fff; border: 1px solid #e2e8f0; border-left: 3px solid #94a3b8; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #475569; margin: 14px 0; }}
.note.action {{ border-left-color: #16a34a; }}
ul.tight {{ margin: 8px 0; padding-left: 20px; }} ul.tight li {{ margin: 4px 0; }}
.muted {{ color: #64748b; }}
.small {{ font-size: 12px; }}
.cols2 {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
.inventory td {{ width: 25%; }}
@media (max-width: 800px) {{ .cols2 {{ grid-template-columns: 1fr; }} .inventory td {{ display: block; width: 100%; }} }}
</style></head><body>
<header class="page"><div class="wrap" style="padding:0 24px">
<h1>Pi Worker Agents — Confirmed Outcomes, Durations &amp; Tool Effectiveness</h1>
<div class="sub">Extends <code>pi-agent-tool-analysis-2026-06-11.html</code> · Runs <code>302fb981</code> (Jun 10–11) + <code>caa0dfd7</code> (Jun 11–12, idle refresh) · codex-lb / gpt-5.5 ·
{len(term)} terminal leases ({len(r1)} + {len(r2)}) · <b>xhigh thinking only</b> (run-1 medium leases excluded — all workers run xhigh now) · outcomes from terminal worker/report events with runner-validation as the canonical gate</div>
</div></header>
<div class="wrap">

<h2>Headline numbers</h2>
<div class="cards">
<div class="card"><div class="v pos">{n_succ}</div><div class="l">runner-confirmed successes ({len(exact_durs)} exact + {len(impr_durs)} improved) across both runs</div></div>
<div class="card"><div class="v pos">{s2}</div><div class="l">of those landed in run 2 alone ({sum(1 for L in r2_exact)} exact + {len(r2_impr)} improved) — {fmt_pct(s2/len(r2),0)} of its leases</div></div>
<div class="card"><div class="v">{median(succ_durs):.0f} min</div><div class="l">median wall-clock for a confirmed success · 90% finish within {sorted(succ_durs)[round(.9*(len(succ_durs)-1))]:.0f} min</div></div>
<div class="card"><div class="v neg">{fmt_pct(k90['p_success_given_over'],0)}</div><div class="l">chance a lease still running at 90 min ever confirms — vs {fmt_pct(p_base,0)} for a fresh attempt</div></div>
</div>

<h2>1 · Run-over-run funnel — what changed since the last report</h2>
<table><tr><th>Outcome</th><th class="num">Run 1 (302fb981)</th><th class="num">median dur</th><th class="num">Run 2 (caa0dfd7)</th><th class="num">median dur</th><th class="num">Δ</th></tr>
{''.join(funnel_rows)}
</table>
<div class="note">Run 2 performs in a different league. The <b>empty-return abort plague is gone</b> ({sum(1 for L in r1 if L['outcome']=='aborted')} → {sum(1 for L in r2 if L['outcome']=='aborted')}), recovering what was ~60 worker-hours of dead air in run 1. With the same thinking level (xhigh) across the board, run 2 confirmed <b>{s2} successes out of {len(r2)} terminal leases ({fmt_pct(s2/len(r2),0)})</b> vs run 1's {s1}/{len(r1)} ({fmt_pct(s1/len(r1),0)}). The new loss bucket to watch is <b>exact-but-rejected ({sum(1 for L in r2 if L['outcome']=='exact_rejected')} in run 2)</b> — section 5.</div>

<h2>2 · What counts as a "true" improvement</h2>
<p class="small muted">Everything labeled <i>confirmed</i> below passed runner-owned same-unit validation (the canonical gate) — not just the worker's local score claim.</p>
<div class="cards">
<div class="card"><div class="v">{n_d}</div><div class="l">xhigh confirmed improvements with before/after scores</div></div>
<div class="card"><div class="v">{median(deltas):.2f} pts</div><div class="l">median score gain per confirmed improvement</div></div>
<div class="card"><div class="v">{tiny}</div><div class="l">gained &lt; 0.5 pts ({sub01} of them &lt; 0.1 pts)</div></div>
<div class="card"><div class="v pos">{big}</div><div class="l">gained ≥ 5 pts (real understanding wins)</div></div>
</div>
<div class="note">Under the matches-only shipping policy, improvements stay local as branch delta — so their value is as <b>stepping stones toward exact</b>. A third of confirmed improvements ({tiny}/{n_d}) move the score by less than half a point. They're real (runner-validated) but cheap signal: the leases that matter most are the {big} with ≥5-pt gains and the {len(exact_durs)} exacts. When judging tool effectiveness below, "success" = confirmed exact <i>or</i> confirmed improved, but the exact-only adoption column is the sharper lens.</div>

<h2>3 · How long confirmed work actually runs</h2>
<table><tr><th>Xhigh outcome</th><th class="num">Leases</th><th class="num">Median (min)</th><th class="num">p75</th><th class="num">p90</th><th class="num">Max</th><th class="num">≤ 60 min</th><th class="num">Total worker-time</th></tr>
{''.join(dur_rows)}
</table>
<div class="note"><b>Confirmed exacts are fast: median {median(exact_durs):.0f} min, {fmt_pct(sum(1 for x in exact_durs if x<=60)/len(exact_durs),0)} done inside an hour</b>. Confirmed improvements run a little longer (median {median(impr_durs):.0f} min). The long tail belongs mostly to leases that never confirm: no-change leases burned {sum(L['duration_min'] for L in term if L['outcome']=='no_change')/60:.0f} h with a {sorted(L['duration_min'] for L in term if L['outcome']=='no_change')[round(0.9*(len([L for L in term if L['outcome']=='no_change'])-1))]:.0f}-min p90, and the <i>improved-rejected</i> cohort medians ~90 min — long grinds that then fail gates. Of {hours_total:.0f} total xhigh worker-hours, {fmt_pct(hours_nc/hours_total,0)} went to leases that confirmed nothing.</div>

<h2>4 · Kill threshold — when to stop a running lease</h2>
<p class="small muted">For each candidate timeout T: how many confirmed successes finish within T, the odds a lease still running at T ever confirms, and what killing at T frees up. {n_term} terminal leases, both runs.</p>
<table><tr><th class="num">T (min)</th><th class="num">Successes kept</th><th class="num">Lost</th><th>P(confirm | still running at T)</th><th class="num">Failed-lease hours saved</th><th class="num">Total hours freed</th><th class="num">Net successes if hours re-spent*</th></tr>
{''.join(kill_rows)}
</table>
<div class="note action"><b>Recommendation: use a 90-minute nominal cutoff for the next pruning sweep.</b> A lease still alive at 90 min has a {fmt_pct(k90['p_success_given_over'],0)} chance of ever confirming — a fresh lease off the queue runs at {fmt_pct(p_base,0)}. Killing at 90 min keeps {k90['succ_kept']}/{k90['succ_total']} ({fmt_pct(k90['succ_kept']/k90['succ_total'],0)}) of confirmed successes and frees ~{freed90:.0f} worker-hours per ~700 leases. 75 min is the yield-optimized setting (keeps {fmt_pct(k75['succ_kept']/k75['succ_total'],0)}, frees {freed75:.0f} h), but it puts more legitimate work at risk. A strict 90-minute hard kill would currently interrupt {exact_over_90} confirmed exact at the edge of the sample, so use a drain grace or set <code>--agent-timeout-seconds 5700</code> if the implementation kills exactly on the second.<br><br>
The knob already exists: <code>--agent-timeout-seconds</code> bounds each live Pi session and currently defaults to <i>no timeout</i> (<code>apps/cli/src/cli/usage.ts:42</code>). For a nominal 90-minute limit, set <code>--agent-timeout-seconds 5400</code>. *Net column assumes freed hours are re-spent on fresh leases at the {fmt_pct(p_base,0)} base rate and {mean_succ_dur:.0f}-min mean success duration.</div>

<h2>5 · Where exacts are being lost ({sum(gate.values())} xhigh leases)</h2>
<ul class="tight">{gate_li}</ul>
<div class="note">The QA lint gate (L2 fail-closed) is now the single biggest killer of locally-exact results. These targets land in <code>needs_rework</code> and requeue at repair priority, so they aren't gone — but each one costs a full extra lease. The banned-pattern findings are concentrated and worth a worker-prompt line per top pattern, same play as the string-literal fix that worked after the last report.</div>

<h2>6 · Minimum tool surface — grouped by access tier</h2>
<p class="small muted">Tool scope: all {len(tool_scope)} terminal xhigh leases across both included runs. This table separates required capability from agent-facing default choice, which is the useful distinction for shrinking the surface.</p>
<table><tr><th>Access tier</th><th>Tools</th><th>Use</th><th>Evidence</th><th>Recommendation</th></tr>
{surface_rows}
</table>
<div class="note action"><b>Practical read.</b> The normal hot path can be {len(PRIMARY_SURFACE_TOOLS)} tools. Keep <code>checkdiff_run</code> and <code>direct_compile_tu</code> in the loop because they are the compile/score feedback. Keep <code>checkdiff_summary</code> and <code>review_lint_scan</code> as capabilities, but make them automatic close gates or one-shot "ready to return" checks instead of default tools the agent repeatedly chooses. If the implementation can merge compile, score, summary, and lint into one verifier wrapper, that is the cleanest future reduction.</div>

<h2>7 · Concise inventory for the next 90-minute sweep</h2>
<table class="inventory">{inventory_columns}</table>
<div class="note">Recommended experiment: advertise only the primary surface by default, inject/auto-run the context and closing gates, keep the specialist group available behind an explicit stalled/debug path, and put the secondary/hide column behind on-demand access. That tests whether removing choice clutter reduces no-change hours without taking away real capability. The immediate visible surface drops from {len(advertised)} advertised tools to {len(PRIMARY_SURFACE_TOOLS)} default tools, with {len(AUTOMATIC_CONTEXT_TOOLS)} automatic/injected capabilities and {len(SPECIALIST_TOOLS)} easy specialists still available.</div>

<h3>Optional-surface lift detail</h3>
<p class="small muted">Core/default tools are intentionally excluded here. Lift is <code>P(confirm | used)</code> minus <code>P(confirm | not used)</code>; it is useful for exposure experiments, not causal proof.</p>
<table><tr><th>Tier</th><th>Tool</th><th>% of exact</th><th>% of no-change</th><th class="num">P(confirm | used)</th><th>Lift</th><th class="num">Calls</th><th class="num">Leases</th></tr>
{''.join(lift_rows)}
</table>

<h2>8 · All {len(all_exact)} xhigh confirmed exacts, fastest first</h2>
<table><tr><th class="num">Run</th><th>Symbol</th><th class="num">Size (B)</th><th class="num">Start</th><th class="num">Duration</th><th class="num">Tool calls</th><th>Most-used tools</th></tr>
{''.join(exact_detail_rows)}
</table>

<div class="note"><b>Method &amp; caveats.</b> Outcomes from <code>events</code> (latest terminal worker/report event per lease: <code>worker_*</code>, <code>needs_fact</code>, or <code>score_candidate</code>; <code>runner_validation</code> canonical) joined to <code>pi_sessions</code> and the worker JSONL transcripts in <code>.pi-sessions/worker/</code> for durations and tool calls; repair sessions are summed into their lease. Medium-thinking leases (run 1 only) are excluded everywhere — the fleet is all-xhigh now. "Confirmed" = result accepted by runner validation (<code>result</code> exact/improved + <code>passed</code>). At refresh time, {n_in_flight} in-flight leases were excluded. Tool lift is correlational, not causal; the kill-threshold table is the survival-style read (P(confirm | still running at T)) and is robust to that. Generated by <code>scripts/analyze-pi-agent-tools.py</code> + <code>scripts/render-pi-agent-tool-report.py</code>.</div>

</div></body></html>"""

open(OUT, "w").write(html)
print(f"wrote {OUT} ({len(html)} bytes)")
