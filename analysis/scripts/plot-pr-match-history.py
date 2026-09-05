"""Plot archived Melee PR bot reports. Run with uv run --with matplotlib."""
import csv
import json
import re
from datetime import datetime, timedelta
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "games/melee/knowledge/sources/code_context/past_prs/data/prs"
OUT = ROOT / "analysis/reports/melee-match-history"
OUT.mkdir(parents=True, exist_ok=True)
live_path = OUT / "live-pr-metadata.json"
live = {p["number"]: p for p in json.loads(live_path.read_text())} if live_path.exists() else {}
pattern = re.compile(r"\*\*Matched code\*\*:\s*([\d.]+)%")
prs, rows, coverage = [], [], []
for path in sorted(CORPUS.glob("pr-*/raw/pr.json")):
    pr = json.loads(path.read_text())
    if pr["number"] in live:
        current = live[pr["number"]]
        pr.update(merged_at=current["mergedAt"], created_at=current["createdAt"], title=current["title"])
    prs.append(pr)
    comments = json.loads(path.with_name("issue_comments.json").read_text())
    candidates = [c for c in comments if c.get("user", {}).get("login") == "decomp-dev[bot]"
                  and "Report for GALE01" in (c.get("body") or "")
                  and pattern.search(c.get("body") or "")]
    status = "unmerged" if not pr.get("merged_at") else "no_matched_code_report"
    if pr.get("merged_at") and candidates:
        c = max(candidates, key=lambda c: c.get("updated_at") or c["created_at"])
        rows.append(dict(pr=pr["number"], title=pr["title"], author=pr["user"]["login"],
                         merged_at=pr["merged_at"], matched_code_pct=float(pattern.search(c["body"])[1]),
                         report_updated_at=c.get("updated_at"), source_url=c["html_url"]))
        status = "plotted"
    coverage.append(dict(pr=pr["number"], created_at=pr["created_at"], merged_at=pr.get("merged_at"), status=status))

rows.sort(key=lambda r: r["merged_at"])
assert len({r["pr"] for r in rows}) == len(rows)
assert all(0 <= r["matched_code_pct"] <= 100 for r in rows)
missing_live = set(live) - {p["number"] for p in prs}
assert not missing_live, f"Missing live PR references: {sorted(missing_live)}"
first = min((p for p in prs if p["user"]["login"].lower() == "fjooord"), key=lambda p: p["created_at"])
parse = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
join = parse(first["created_at"])
first_report = next(r for r in rows if r["pr"] == first["number"])
latest = rows[-1]
before = [r for r in rows if parse(r["merged_at"]) < join][-1]
stats = dict(archived_prs=len(prs), merged_prs=sum(bool(p.get("merged_at")) for p in prs),
             live_prs=len(live), archived_prs_not_in_live_listing=sorted({p['number'] for p in prs} - set(live)),
             plotted_prs=len(rows), first_pr=first["number"], first_pr_created_at=first["created_at"],
             first_pr_url=first["html_url"], first_report=rows[0], last_report_before_join=before,
             first_personal_pr_report=first_report, latest_report=latest,
             percentage_point_change=round(latest["matched_code_pct"]-before["matched_code_pct"], 2))
stats["methodology"] = {
    "metric": "GALE01 Matched code as reported by decomp-dev[bot], including partial matches",
    "selection": "Latest archived bot comment containing the metric per merged PR; no imputation for missing metrics",
    "time_axis": "Merge date from live PR metadata when available",
    "join_marker": "Creation date of fjooord's earliest PR",
    "limits": "PR branch reports are not exact mainline snapshots; branch bases can be stale. Changes after joining include all contributors.",
}
for name, data in [("points", rows), ("coverage", coverage)]:
    with (OUT / f"{name}.csv").open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(data[0]))
        writer.writeheader()
        writer.writerows(data)
(OUT / "summary.json").write_text(json.dumps(stats, indent=2)+"\n")

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "axes.spines.top": False,
                     "axes.spines.right": False, "axes.spines.left": False, "axes.spines.bottom": False})
fig, axes = plt.subplots(2, 1, figsize=(14, 9), gridspec_kw={"height_ratios": [1.6, 1]})
fig.patch.set_facecolor("#f8fafc")
fig.suptitle("Melee match percentage over time", x=.075, ha="left", fontsize=23, weight="bold", y=.975)
fig.text(.075, .928, f"{len(prs):,} archived PRs reviewed  •  {len(rows):,} merged PRs with a Matched code report", color="#475569")
xs = [parse(r["merged_at"]) for r in rows]
ys = [r["matched_code_pct"] for r in rows]
for ax in axes:
    ax.set_facecolor("#f8fafc")
    ax.plot(xs, ys, color="#2563eb", linewidth=1.3, alpha=.75, zorder=2)
    ax.scatter(xs, ys, s=9, color="#2563eb", alpha=.55, zorder=3)
    own = [r for r in rows if r["author"].lower() == "fjooord"]
    ax.scatter([parse(r["merged_at"]) for r in own], [r["matched_code_pct"] for r in own],
               s=30, color="#d97706", edgecolor="white", linewidth=.6, zorder=4, label="Your merged PR reports")
    ax.axvline(join, color="#b45309", linestyle="--", linewidth=1.7)
    ax.axvspan(join, xs[-1], color="#f59e0b", alpha=.065)
    ax.set_ylabel("Matched code (%)")
    ax.grid(axis="y", color="#dbe2ea", linewidth=.7)
    ax.tick_params(length=0, pad=8)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
axes[0].set_ylim(0, 104)
axes[0].set_xlim(xs[0]-timedelta(days=8), xs[-1]+timedelta(days=18))
axes[0].text(join-timedelta(days=7), 5, "Your first PR\nJune 5, 2026 · #2581", ha="right", color="#92400e", weight="bold")
axes[0].annotate(f"{ys[-1]:.2f}%", (xs[-1], ys[-1]), xytext=(-6, 12), textcoords="offset points", ha="right", weight="bold", color="#1d4ed8")
axes[0].legend(loc="upper left", frameon=False)
axes[1].set_xlim(join-timedelta(days=16), xs[-1]+timedelta(days=4))
axes[1].set_ylim(65, 100)
axes[1].set_title("Closer view · your first PR through the latest archived merge", loc="left", fontsize=13, pad=15)
axes[1].xaxis.set_major_locator(mdates.MonthLocator())
axes[1].text(join+timedelta(days=2), 66.5, f"First PR report: {first_report['matched_code_pct']:.2f}%", color="#92400e")
fig.text(.075, .062, "Each point is a PR's reported code match percentage, positioned at its merge date. Reports can use stale branch bases.", fontsize=10, color="#475569")
fig.text(.075, .038, "Comparable bot reports begin in May 2025. Earlier PRs have no plotted value. Matched code includes partial matches.", fontsize=10, color="#475569")
fig.text(.075, .014, "The join marker shows timing; project progress after joining includes every contributor. Source links and coverage are in the accompanying CSVs.", fontsize=10, color="#475569")
fig.subplots_adjust(left=.075, right=.97, top=.88, bottom=.14, hspace=.42)
fig.savefig(OUT / "melee-match-history.png", dpi=180, facecolor=fig.get_facecolor())
fig.savefig(OUT / "melee-match-history.svg", facecolor=fig.get_facecolor())
print(json.dumps(stats, indent=2))
