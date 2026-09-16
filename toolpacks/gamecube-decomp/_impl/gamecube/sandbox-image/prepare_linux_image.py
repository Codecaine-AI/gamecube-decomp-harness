#!/usr/bin/env python3
"""Prepare Linux build artifacts from explicit game-owned image inputs.

Runs only inside an image build. An empty configuration preserves the legacy
prebuilt-image flow. The caller still has to validate host/sandbox parity.
"""
import json
import subprocess
import sys
from pathlib import Path


def main():
    root = Path(sys.argv[1]).resolve()
    config = json.loads(Path(sys.argv[2]).read_text())
    if not config:
        return
    def run(*args):
        subprocess.run(args, cwd=root, check=True)
    packages = config.get('pip_packages', [])
    if packages:
        run(sys.executable, '-m', 'pip', 'install', '--break-system-packages', *packages)
    for tool in config['linux_tools']:
        run(sys.executable, 'tools/download_tool.py', tool['name'], tool['output'], '--tag', tool['tag'])
    run(sys.executable, 'configure.py', *config['configure_args'])
    run('ninja', '-j2', *config['build_targets'])
    for command in config.get('verification_commands', []):
        run(*command)


if __name__ == '__main__':
    main()
