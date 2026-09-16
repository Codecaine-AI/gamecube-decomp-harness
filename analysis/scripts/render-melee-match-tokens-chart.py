#!/usr/bin/env python3
"""Render a shareable chart from the frozen per-target token audit.
Run: uv run --with matplotlib --with numpy analysis/scripts/render-melee-match-tokens-chart.py
"""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FixedLocator, FixedFormatter, MaxNLocator
from matplotlib.patches import FancyBboxPatch

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis/reports/melee-match-tokens-2026-09-11'
data = json.loads((OUT / 'targets.json').read_text())
rows = data['targets']
w = np.array([r['winning']['totalTokens'] for r in rows], dtype=float)
a = np.array([r['through_first_match']['totalTokens'] for r in rows], dtype=float)
assert len(rows) == 430 and np.all(w > 0) and np.all(a >= w)
fmt = lambda x: f'{x / 1e6:.2f}M'
bg, ink, muted, grid = '#F5F7FA', '#17263C', '#566477', '#DEE4EB'
teal, orange = '#087E8B', '#B76323'
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 12, 'text.color': ink,
                     'axes.labelcolor': muted, 'xtick.color': muted, 'ytick.color': muted,
                     'svg.fonttype': 'none'})
fig = plt.figure(figsize=(16, 10), facecolor=bg)
fig.text(.055, .947, 'How Many Tokens Did a Full Match Take?', fontsize=29, weight='bold')
fig.text(.055, .908, 'Melee decompilation  |  430 verified function matches  |  Worker records: June 10 to September 6, 2026', fontsize=12, color=muted)
metrics = [('430', 'VERIFIED FULL MATCHES', 'Distinct function targets'),
           (fmt(w.mean()), 'MEAN: SUCCESSFUL EXECUTION', '589,369 excluding cached input'),
           (fmt(np.median(w)), 'MEDIAN: SUCCESSFUL EXECUTION', 'Half of recorded totals are below this'),
           (fmt(a.mean()), 'MEAN: INCLUDING EARLIER ATTEMPTS', '3.54M excluding cached input')]
for i, (value, label, note) in enumerate(metrics):
    x = .055 + i * .229
    fig.add_artist(FancyBboxPatch((x, .752), .214, .121, boxstyle='round,pad=0.009,rounding_size=0.009',
                   transform=fig.transFigure, facecolor='white', edgecolor=grid, linewidth=.8, zorder=0))
    fig.text(x + .009, .838, value, fontsize=29, weight='bold', color=teal if i in (1,2) else orange if i==3 else ink)
    fig.text(x + .009, .802, label, fontsize=8.3, weight='bold', color=muted)
    fig.text(x + .009, .777, note, fontsize=8.7, color=muted)

bins = np.geomspace(3e5, 1.5e9, 23)
axes = [fig.add_axes([.075, .30, .405, .345]), fig.add_axes([.555, .30, .405, .345])]
for ax, vals, color, title, sub, complete in zip(axes, [w,a], [teal,orange],
      ['Successful Worker Execution', 'Including Earlier Attempts'],
      ['All sessions in the claim that first produced a verified match', 'Earlier claims on the same target + the successful claim'], [387,256]):
    ax.set_facecolor('white')
    counts, _, _ = ax.hist(vals, bins=bins, color=color, alpha=.85, edgecolor=bg, linewidth=1)
    assert int(counts.sum()) == len(rows)
    ax.set_xscale('log'); ax.set_xlim(bins[0],bins[-1]); ax.set_ylim(0,72)
    ax.xaxis.set_major_locator(FixedLocator([3e5,1e6,1e7,1e8,1e9]))
    ax.xaxis.set_major_formatter(FixedFormatter(['0.3M','1M','10M','100M','1B']))
    ax.minorticks_off(); ax.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=5))
    ax.set_axisbelow(True); ax.grid(axis='y',color=grid,linewidth=.8)
    for side in ['top','right','left']:ax.spines[side].set_visible(False)
    ax.spines['bottom'].set_color(grid);ax.tick_params(length=0,pad=9)
    ax.set_xlabel('Recorded tokens per target · logarithmic scale', fontsize=11, labelpad=13)
    ax.set_ylabel('Number of targets', fontsize=11, labelpad=10)
    median, mean = np.median(vals), vals.mean()
    ax.axvline(median, color=ink, linewidth=1.6, linestyle='--')
    ax.axvline(mean, color=color, linewidth=2, linestyle=':')
    ax.text(median / 1.16, 69, f'Median\n{fmt(median)}', ha='right', va='top', fontsize=10, color=ink,
            bbox=dict(facecolor='white',alpha=.92,edgecolor='none',pad=3))
    ax.text(mean * 1.16, 69, f'Mean\n{fmt(mean)}', ha='left', va='top', fontsize=10, color=color,
            bbox=dict(facecolor='white',alpha=.92,edgecolor='none',pad=3))
    pos=ax.get_position()
    fig.text(pos.x0, .701, title, fontsize=17, weight='bold', color=color)
    fig.text(pos.x0, .675, sub, fontsize=9.4, color=muted)
    fig.text(pos.x0, .219, f'Trace coverage complete for {complete} / 430 targets', fontsize=10.5, weight='bold', color=muted)

fig.text(.055, .16, 'A few expensive targets raise the average. The distribution is not a normal bell curve.', fontsize=13, weight='bold')
fig.text(.055, .121, 'All 430 targets are shown. Missing traces make recorded totals, means, and medians lower bounds.', fontsize=11, color=muted)
fig.text(.055, .092, 'Tokens include repeatedly cached input; these are API usage counts, not dollar costs. Only workers on targets that matched are included.', fontsize=10, color=muted)
fig.text(.055, .064, 'Successful execution includes continuations and claim wrap-up. Unmatched targets and non-worker agents are excluded.', fontsize=10, color=muted)
fig.text(.055, .027, 'Source: saved worker JSONL usage + passed runner validation  |  Melee match-token audit  |  September 11, 2026', fontsize=9, color=muted)
for ext in ['png','svg']:
    fig.savefig(OUT / f'match-token-distribution.{ext}', dpi=160, facecolor=bg)
plt.close(fig)
# Embed the image in the existing report, preserving its table and search control.
p = OUT / 'report.html'
s = p.read_text()
start, end = '<!-- token-distribution-image -->', '<!-- /token-distribution-image -->'
block = start + '<figure style="margin:24px 0"><a href="match-token-distribution.png"><img src="match-token-distribution.png" alt="Token distributions across 430 matched Melee targets. Mean successful execution: 16.09 million tokens; including earlier attempts: 95.93 million. Recorded totals are lower bounds." style="width:100%;max-width:1400px;height:auto;border-radius:10px"></a><figcaption><a href="match-token-distribution.png">Download shareable PNG</a> · <a href="match-token-distribution.svg">Vector version</a></figcaption></figure>' + end
if start in s:
    s = s[:s.index(start)] + block + s[s.index(end)+len(end):]
else:
    marker = '<input id="search"'
    assert marker in s
    s = s.replace(marker, block + marker, 1)
p.write_text(s)
print(OUT / 'match-token-distribution.png')
print('430 targets accounted for in each histogram; PNG and SVG saved; image embedded in report.')
