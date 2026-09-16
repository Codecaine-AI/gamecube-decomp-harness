#!/usr/bin/env python3
"""Serial verification for a reviewed source proposal in the isolated SMS clone."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from compare_matching import compare_matching

tag, *units = sys.argv[1:]
root = Path('/Users/Ford/sms-symbol-order-20260915')
artifacts = Path(__file__).resolve().parents[1] / 'artifacts'
env = dict(os.environ, WINEPREFIX=str(root / '.wine-audit'), WINEDEBUG='-all',
           NM=str(root / 'build/binutils/powerpc-eabi-nm'))
before = json.loads((root / 'build/GMSJ01/report.json').read_text())
with (artifacts / f'{tag}-changes.log').open('w') as log:
    result = subprocess.run(['ninja', '-j4', 'changes_all'], cwd=root, env=env,
                            stdout=log, stderr=subprocess.STDOUT)
if result.returncode:
    print(f'Build failed; inspect {tag}-changes.log', flush=True)
    sys.exit(result.returncode)
report_path = root / 'build/GMSJ01/report.json'
after = json.loads(report_path.read_text())
shutil.copy2(report_path, artifacts / f'{tag}-report.json')
shutil.copy2(root / 'build/GMSJ01/report_changes.json', artifacts / f'{tag}-report_changes.json')
strict = {}
for unit in units:
    log_path = artifacts / f'{tag}-{unit.replace("/", "__")}-strict.log'
    with log_path.open('w') as log:
        result = subprocess.run(['python3', 'tools/validate-symbol-order.py', '-u', unit],
                                cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
    strict[unit] = dict(exit_code=result.returncode, log=log_path.name)
    print(unit, 'strict exit', result.returncode, flush=True)
baseline = json.loads((artifacts / 'baseline-report.json').read_text())
summary = dict(tag=tag, strict=strict, identical_to_before=before == after,
               identical_to_upstream_baseline=baseline == after,
               comparison_to_before=compare_matching(before, after),
               comparison_to_baseline=compare_matching(baseline, after),
               measures_before=before['measures'], measures_after=after['measures'])
(artifacts / f'{tag}-verification.json').write_text(json.dumps(summary, indent=2) + '\n')
print('Matching report identical to before:', before == after, flush=True)
print('Matching report identical to upstream baseline:', baseline == after, flush=True)
print('Changed function/section scores:', summary['comparison_to_before'], flush=True)
