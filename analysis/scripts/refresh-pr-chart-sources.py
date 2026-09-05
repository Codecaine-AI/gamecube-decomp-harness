"""Refresh PR metadata and fetch missing reference slices for the history chart."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
data = root / "games/melee/knowledge/sources/code_context/past_prs/data"
out = root / "analysis/reports/melee-match-history"
out.mkdir(parents=True, exist_ok=True)
raw = subprocess.check_output([
    "gh", "pr", "list", "--repo", "doldecomp/melee", "--state", "all", "--limit", "10000",
    "--json", "number,title,url,author,createdAt,mergedAt,state,updatedAt"], text=True)
prs = json.loads(raw)
(out / "live-pr-metadata.json").write_text(raw)
missing = [p["number"] for p in prs if not (data / f"prs/pr-{p['number']}/raw/pr.json").exists()]
print(f"Live PRs: {len(prs)}. Missing local slices: {len(missing)}.", flush=True)
if missing:
    command = ["python3", str(data.parent / "commands/fetch_recent_pr_dump.py"),
               "--dump-root", str(data), "--postmortem-mode", "off", "--no-organize", "--fetch-jobs", "12"]
    for number in missing:
        command.extend(["--pr", str(number)])
    subprocess.run(command, check=True)
