#!/usr/bin/env python3
"""Compile one already-reviewed patch; restore it on failure or matching loss.

A retained candidate still requires human/parent inspection of strict diagnostics
and emitted sizes. This runner never declares a source proposal accepted.
"""
import json
from pathlib import Path
import subprocess
import sys

tag, patch_name, *units = sys.argv[1:]
root = Path('/Users/Ford/sms-symbol-order-20260915')
artifacts = Path(__file__).resolve().parents[1] / 'artifacts'
patch = artifacts / patch_name
verify = Path(__file__).with_name('verify_batch.py')
before = json.loads((root / 'build/GMSJ01/report.json').read_text())
subprocess.run(['git', 'apply', '--check', str(patch)], cwd=root, check=True)
subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
result = subprocess.run([sys.executable, str(verify), tag, *units])
summary = json.loads((artifacts / f'{tag}-verification.json').read_text()) if result.returncode == 0 else None
reject = result.returncode != 0 or bool(summary['comparison_to_before']['regressions'])
if reject:
    subprocess.run(['git', 'apply', '-R', str(patch)], cwd=root, check=True)
    subprocess.run([sys.executable, str(verify), tag + '-restored', *units], check=True)
    restored = json.loads((root / 'build/GMSJ01/report.json').read_text())
    assert restored == before, 'Restoration differs from pre-trial report; stop and inspect'
    print(tag, 'REVERTED: build failure or matching regression', flush=True)
else:
    print(tag, 'RETAINED FOR REVIEW: inspect strict diagnostics and sizes', flush=True)
(artifacts / f'{tag}-trial.json').write_text(json.dumps(dict(tag=tag, patch=patch_name,
    disposition='reverted' if reject else 'pending review'), indent=2) + '\n')
