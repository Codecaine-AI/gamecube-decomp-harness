#!/usr/bin/env python3
"""Analyze pi worker sessions: outcomes, tool usage, durations.

Joins orchestrator.sqlite (events = canonical outcomes, pi_sessions = transcript
paths) with the .pi-sessions/worker JSONL transcripts. Emits a stats JSON used
to build reports/pi-agent-tool-analysis-*.html.

Usage: python3 scripts/analyze-pi-agent-tools.py [out.json]
"""
import json
import re
import sqlite3
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "projects/melee/state/orchestrator.sqlite"

RUNS = {
    "302fb981-45d8-43e5-94e1-462b52668ded": "run1",
    "caa0dfd7-16c0-4e75-abc8-e5b4403c15d6": "run2",
}


def parse_ts(ts):
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def parse_transcript(path):
    """Return (duration_min, tool_counts, advertised_tools, n_assistant_msgs)."""
    first = last = None
    tools = Counter()
    advertised = set()
    n_assistant = 0
    try:
        fh = open(path, encoding="utf-8")
    except OSError:
        return None
    with fh:
        for line in fh:
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts = e.get("timestamp")
            if ts:
                if first is None:
                    first = ts
                last = ts
            if e.get("type") != "message":
                continue
            msg = e.get("message", {})
            role = msg.get("role")
            content = msg.get("content")
            if not isinstance(content, list):
                continue
            if role == "user" and not advertised:
                for c in content:
                    if isinstance(c, dict) and c.get("type") == "text":
                        txt = c.get("text", "")
                        if "<available_tools" in txt:
                            m = re.search(
                                r"<available_tools[^>]*>(.*?)</available_tools>",
                                txt, re.S)
                            if m:
                                advertised.update(
                                    re.findall(r'<tool name="([^"]+)"', m.group(1)))
            if role == "assistant":
                n_assistant += 1
                for c in content:
                    if isinstance(c, dict) and c.get("type") == "toolCall":
                        tools[c.get("name") or "?"] += 1
    if first is None:
        return None
    dur = (parse_ts(last) - parse_ts(first)).total_seconds() / 60.0
    return dur, tools, advertised, n_assistant


def classify(ev):
    """Map a terminal worker_* event to an outcome class."""
    if ev is None:
        return "in_flight"
    et = ev["event_type"]
    result = ev.get("result")
    rv_status = ev.get("rv_status")
    rv_exact = ev.get("rv_exact")
    rv_improved = ev.get("rv_improved")
    if et in ("worker_finished", "score_candidate") and result == "exact" and rv_status == "passed":
        return "confirmed_exact"
    if et in ("worker_finished", "score_candidate") and result == "improved" and rv_status == "passed":
        return "confirmed_improved"
    if rv_exact:
        return "exact_rejected"
    if rv_improved and rv_status not in (None, "skipped"):
        return "improved_rejected"
    if et in ("worker_error", "worker_provider_error"):
        return "error"
    return "no_change"


def pct(xs, q):
    if not xs:
        return None
    xs = sorted(xs)
    idx = min(len(xs) - 1, int(round(q * (len(xs) - 1))))
    return xs[idx]


def dur_stats(xs):
    if not xs:
        return None
    return {
        "n": len(xs),
        "median": round(statistics.median(xs), 1),
        "mean": round(statistics.mean(xs), 1),
        "p75": round(pct(xs, 0.75), 1),
        "p90": round(pct(xs, 0.90), 1),
        "max": round(max(xs), 1),
    }


def main():
    db = sqlite3.connect(str(DB))

    # --- canonical outcome per lease from events ---
    lease_event = {}
    q = """SELECT run_id, event_type, payload_json, created_at FROM events
           WHERE event_type LIKE 'worker_%'
              OR event_type IN ('needs_fact', 'score_candidate')
           ORDER BY created_at"""
    for run_id, et, pj, created in db.execute(q):
        if run_id not in RUNS:
            continue
        p = json.loads(pj)
        lease_id = p.get("lease_id")
        if not lease_id:
            continue
        rv = p.get("runner_validation") or {}
        tgt = rv.get("target") or {}
        qa = rv.get("qaLint") or {}
        lease_event[lease_id] = {
            "run": RUNS[run_id],
            "event_type": et,
            "result": p.get("result"),
            "stop_reason": p.get("stop_reason"),
            "intended_report_type": p.get("intended_report_type"),
            "rv_status": rv.get("status"),
            "rv_reasons": rv.get("reasons") or [],
            "rv_exact": bool(tgt.get("exact")),
            "rv_improved": bool(tgt.get("improved")),
            "before": tgt.get("before"),
            "after": tgt.get("after"),
            "qa_lint_status": qa.get("status") if isinstance(qa, dict) else None,
            "symbol": (p.get("target") or {}).get("symbol"),
            "unit": (p.get("target") or {}).get("unit"),
            "size": (p.get("target") or {}).get("size"),
            "start_fuzzy": (p.get("target") or {}).get("fuzzy_match_percent"),
            "created_at": created,
        }

    # --- sessions per lease ---
    lease_sessions = defaultdict(list)
    q = """SELECT run_id, lease_id, session_file, thinking_level, status, created_at
           FROM pi_sessions WHERE role='worker' ORDER BY created_at"""
    for run_id, lease_id, sf, think, status, created in db.execute(q):
        if run_id not in RUNS or not lease_id:
            continue
        lease_sessions[lease_id].append({
            "run": RUNS[run_id],
            "file": sf,
            "thinking": (think or "").replace("x-high", "xhigh"),
            "status": status,
        })

    # --- parse transcripts, aggregate per lease ---
    advertised_by_run = defaultdict(set)
    leases = []
    for lease_id, sessions in lease_sessions.items():
        ev = lease_event.get(lease_id)
        total_dur = 0.0
        tools = Counter()
        n_sessions = 0
        thinking = Counter()
        for s in sessions:
            parsed = parse_transcript(s["file"]) if s["file"] else None
            if parsed is None:
                continue
            dur, tcounts, adv, _na = parsed
            advertised_by_run[s["run"]].update(adv)
            total_dur += dur
            tools.update(tcounts)
            n_sessions += 1
            thinking[s["thinking"]] += 1
        if n_sessions == 0:
            continue
        # xhigh-only: all workers run xhigh now, medium-thinking leases are
        # historical noise for tool/duration comparisons
        if thinking and thinking.most_common(1)[0][0] != "xhigh":
            continue
        run = sessions[0]["run"]
        outcome = classify(ev)
        total_calls = sum(tools.values())
        if outcome in ("error", "no_change", "in_flight") and total_calls == 0:
            outcome = "aborted"
        leases.append({
            "lease_id": lease_id,
            "run": run,
            "outcome": outcome,
            "n_sessions": n_sessions,
            "duration_min": round(total_dur, 1),
            "tools": dict(tools),
            "total_calls": total_calls,
            "thinking": thinking.most_common(1)[0][0] if thinking else None,
            **({k: ev[k] for k in (
                "symbol", "unit", "size", "start_fuzzy", "before", "after",
                "result", "rv_status", "rv_reasons", "qa_lint_status",
                "stop_reason", "event_type")} if ev else {}),
        })

    # --- aggregates ---
    out = {"leases": leases, "advertised_tools": {
        r: sorted(t) for r, t in advertised_by_run.items()}}

    funnel = defaultdict(lambda: defaultdict(int))
    for L in leases:
        funnel[L["run"]][L["outcome"]] += 1
        funnel["combined"][L["outcome"]] += 1
    out["funnel"] = {r: dict(v) for r, v in funnel.items()}

    # durations per outcome (combined and per run)
    durs = defaultdict(list)
    for L in leases:
        durs[(L["run"], L["outcome"])].append(L["duration_min"])
        durs[("combined", L["outcome"])].append(L["duration_min"])
    out["durations"] = {
        f"{r}|{o}": dur_stats(xs) for (r, o), xs in durs.items()}

    # kill-threshold table over terminal leases (exclude in_flight)
    term = [L for L in leases if L["outcome"] != "in_flight"]
    succ = [L for L in term if L["outcome"] in ("confirmed_exact", "confirmed_improved")]
    fail = [L for L in term if L["outcome"] not in ("confirmed_exact", "confirmed_improved")]
    thresholds = [15, 20, 30, 40, 50, 60, 75, 90, 120, 150]
    kill = []
    for T in thresholds:
        succ_kept = sum(1 for L in succ if L["duration_min"] <= T)
        succ_lost = len(succ) - succ_kept
        hours_saved = sum(max(0.0, L["duration_min"] - T) for L in fail) / 60.0
        hours_lost_succ = sum(max(0.0, L["duration_min"] - T) for L in succ) / 60.0
        over = [L for L in term if L["duration_min"] > T]
        over_succ = sum(1 for L in over if L in succ)
        kill.append({
            "T_min": T,
            "succ_kept": succ_kept,
            "succ_total": len(succ),
            "succ_lost": succ_lost,
            "fail_hours_saved": round(hours_saved, 1),
            "succ_hours_at_risk": round(hours_lost_succ, 1),
            "n_over": len(over),
            "succ_over": over_succ,
            "p_success_given_over": round(over_succ / len(over), 3) if over else None,
        })
    out["kill_table"] = kill
    out["overall_p_success"] = round(len(succ) / len(term), 3) if term else None

    # per-tool adoption/lift, combined runs, lease level
    classes = ["confirmed_exact", "confirmed_improved", "exact_rejected",
               "improved_rejected", "no_change", "error", "aborted"]
    by_class = {c: [L for L in term if L["outcome"] == c] for c in classes}
    all_tools = sorted({t for L in term for t in L["tools"]})
    tool_rows = []
    n_succ = len(succ) or 1
    n_nc = len(by_class["no_change"]) or 1
    for t in all_tools:
        row = {"tool": t, "total_calls": sum(L["tools"].get(t, 0) for L in term)}
        for c in classes:
            ls = by_class[c]
            row[f"adopt_{c}"] = round(
                sum(1 for L in ls if t in L["tools"]) / len(ls), 3) if ls else None
        used_succ = sum(1 for L in succ if t in L["tools"])
        used_nc = sum(1 for L in by_class["no_change"] if t in L["tools"])
        row["adopt_success"] = round(used_succ / n_succ, 3)
        row["adopt_no_change"] = round(used_nc / n_nc, 3)
        users = [L for L in term if t in L["tools"]]
        non = [L for L in term if t not in L["tools"]]
        p_u = (sum(1 for L in users if L in succ) / len(users)) if users else None
        p_n = (sum(1 for L in non if L in succ) / len(non)) if non else None
        row["p_success_if_used"] = round(p_u, 3) if p_u is not None else None
        row["p_success_if_not"] = round(p_n, 3) if p_n is not None else None
        row["n_leases_used"] = len(users)
        row["mean_calls_success"] = round(
            statistics.mean([L["tools"][t] for L in succ if t in L["tools"]]), 1
        ) if used_succ else None
        tool_rows.append(row)
    out["tools"] = tool_rows

    advertised_all = set().union(*(tools for tools in advertised_by_run.values()))
    used_all = {t for L in term for t in L["tools"]}
    out["never_called"] = sorted(t for t in advertised_all if t not in used_all)

    # confirmed exact details (for the per-symbol table)
    out["confirmed_exact_details"] = sorted(
        [{k: L.get(k) for k in ("run", "symbol", "unit", "size", "start_fuzzy",
                                 "duration_min", "n_sessions", "thinking",
                                 "total_calls")}
         for L in term if L["outcome"] == "confirmed_exact"],
        key=lambda d: (d["run"], -(d["start_fuzzy"] or 0)))

    # rejected-exact details (lost at gates)
    out["exact_rejected_details"] = [
        {k: L.get(k) for k in ("run", "symbol", "unit", "rv_status", "rv_reasons",
                                "qa_lint_status", "duration_min", "event_type")}
        for L in term if L["outcome"] == "exact_rejected"]

    json.dump(out, open(sys.argv[1], "w") if len(sys.argv) > 1 else sys.stdout,
              indent=1)


if __name__ == "__main__":
    main()
