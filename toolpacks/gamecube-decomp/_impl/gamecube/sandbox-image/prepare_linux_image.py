#!/usr/bin/env python3
"""Prepare Linux build artifacts from explicit game-owned image inputs.

Runs only inside an image build. An empty configuration preserves the legacy
prebuilt-image flow. The caller still has to validate host/sandbox parity.

After the build, an optional `type_index` recipe bakes the project-wide
type-layout index (see build_type_index below), before the verification
commands run.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

TOOLPACK = Path('/opt/toolpacks/gamecube-decomp')
TYPE_INDEX_RUNNER = TOOLPACK / 'research/type_layout_lookup/runners/build_type_index.py'
TYPE_INDEX_OUT = Path('/opt/tool-data/type_layout_lookup')


def write_umbrella(root, spec):
    """One `#include` per header under spec['root'] matching spec['glob'], sorted for determinism."""
    base = root / spec['root']
    headers = sorted(p.relative_to(base).as_posix() for p in base.glob(spec['glob']) if p.is_file())
    if not headers:
        raise SystemExit(f'type_index: no headers match {spec["root"]}/{spec["glob"]}')
    output = root / spec['output']
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(''.join(f'#include "{header}"\n' for header in headers), encoding='utf-8')
    print(f'type_index: umbrella {spec["output"]} includes {len(headers)} headers')


def build_type_index(root, recipe, run, runner=TYPE_INDEX_RUNNER, out=TYPE_INDEX_OUT):
    """Bake indexes/type_layout_index.json under `out` from the game's recipe.

    recipe: {"umbrella": {"output", "root", "glob"} (optional), "ctx_command": [argv],
    "ctx": <checkout-relative ctx path>, "lang": "c"|"c++", "project": <id>}.
    Fails the image build when the runner fails or the index has no records;
    clang partial-error counts are reported, not fatal.
    """
    if recipe.get('umbrella'):
        write_umbrella(root, recipe['umbrella'])
    run(*recipe['ctx_command'])
    ctx = root / recipe['ctx']
    if not ctx.is_file() or ctx.stat().st_size == 0:
        raise SystemExit(f'type_index: context {recipe["ctx"]} was not written')
    clang = os.environ.get('ORCH_IR_ORACLE_CLANG', 'clang')
    result = subprocess.run([sys.executable, str(runner), '--ctx', str(ctx), '--lang', recipe.get('lang', 'c'),
                             '--skip-casts', '--project', recipe['project'], '--clang', clang, '--out', str(out)],
                            cwd=root, check=False, stdout=subprocess.PIPE, text=True)
    try:
        payload = json.loads(result.stdout)
    except ValueError:
        payload = {}
    if result.returncode != 0 or payload.get('status') != 'ok':
        raise SystemExit(f'type_index: build_type_index failed ({result.returncode}): {result.stdout.strip()[-2000:]}')
    if not payload.get('record_count'):
        raise SystemExit(f'type_index: {payload.get("index_path")} has no records')
    # The runner writes through mkstemp (0600); the sandbox user reads the image copy.
    index = Path(payload['index_path'])
    if index.is_file():
        index.chmod(0o644)
    print(f'type_index: {payload["record_count"]} records -> {payload["index_path"]} (dump {payload.get("dump")})')
    return payload


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
    if config.get('type_index'):
        build_type_index(root, config['type_index'], run)
    for command in config.get('verification_commands', []):
        run(*command)


if __name__ == '__main__':
    main()
