#!/usr/bin/env python3
"""Run run_unused_one.sh for every row of unused_jobs.tsv, at most 3 at a time."""
import subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
HERE = Path(__file__).resolve().parent
rows = [l.split("\t") for l in (HERE / "unused_jobs.tsv").read_text().splitlines() if l.strip()]
def run(r):
    p = subprocess.run([str(HERE / "run_unused_one.sh"), r[0], r[1], r[2]], capture_output=True, text=True)
    print(p.stdout.strip() or p.stderr.strip(), flush=True)
with ThreadPoolExecutor(max_workers=3) as ex:
    list(ex.map(run, rows))
print("ALLDONE", flush=True)
