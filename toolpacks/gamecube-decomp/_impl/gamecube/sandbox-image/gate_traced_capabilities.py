#!/usr/bin/env python3
"""Enable only traced compilers backed by validation evidence for the exact binary.

Usage: gate_traced_capabilities.py OUT VERSIONS

OUT holds GC/<ver>/mwcceppc.exe, CAPABILITIES.json, requirements.json and
validation/: presence-<ver>.json from build.sh, and the full byte-identity
sweep reports of validate/byte_identity.py filed per game as
validation/byte-identity/<game>/<any>.json (the directory names the game; a
report elsewhere is not evidence). requirements.json, written by the bundle
from every game's worker-image.json, is
{"games": {<game>: {"required": [<ver>...], "stock_exclusions": {<ver>: [<unit>...]}}}}.

A version keeps its trace points only when all of these hold for the SHA-1 of
the staged exe:

1. CAPABILITIES.json's traced_sha1 for the version is that SHA-1;
2. presence-<ver>.json names it (compiler_sha1), the fixture compiled the
   same with tracing off, on and stock, and every claimed point fired;
3. every game that requires the version (any game, when none does) has a full
   sweep naming that SHA-1: selection "all" with nothing left unselected and
   the version not skipped;
4. every sweep naming that SHA-1, of any game, passes: units the stock compiler
   cannot build are all in that game's stock_exclusions for the version,
   compared = units - stock failures is positive, tracing off and tracing on
   were each identical on exactly the compared units, and there are no
   mismatches and no traced-compiler failures.

Any other version is disabled: CAPABILITIES.json keeps the entry but lists no
points, every point it claimed is unavailable with the reason, and
`disabled` holds the reason. The binary stays on disk; nothing advertises it.
CAPABILITIES.json is rewritten in place; one line per version goes to stdout.
"""
import hashlib
import json
import sys
from pathlib import Path

BYTE_IDENTITY_SCHEMA = 'mwcc-native-byte-identity-v1'
PRESENCE_SCHEMA = 'mwcc-native-event-presence-v1'


def sha1(path):
    return hashlib.sha1(path.read_bytes()).hexdigest()


def load_json(path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def byte_identity_reports(validation):
    """(game, file name, report) for every sweep filed under validation/byte-identity/<game>/."""
    reports = []
    root = validation / 'byte-identity'
    for path in sorted(root.glob('*/*.json')) if root.is_dir() else []:
        report = load_json(path)
        if isinstance(report, dict) and report.get('schema') == BYTE_IDENTITY_SCHEMA:
            reports.append((path.parent.name, path.name, report))
    return reports


def is_full(report, version):
    skipped = report.get('skipped') or {}
    return (bool((report.get('selection') or {}).get('all')) and not skipped.get('not_selected')
            and version not in (skipped.get('versions') or {}))


def sweep_problem(game, name, report, version, exclusions):
    """None when this game's sweep of the version passes, else why it does not."""
    where = f'{game}/{name}'
    totals = (report.get('totals') or {}).get(version) or {}
    units = int(totals.get('units') or 0)
    stock_failed = int(totals.get('stock_failed') or 0)
    rows = [r for r in report.get('units') or [] if r.get('version') == version]
    if len(rows) != units:
        return f'{where}: {units} units counted, {len(rows)} recorded'
    failed = {r.get('unit') for r in rows if r.get('status') == 'stock_failed'}
    if len(failed) != stock_failed:
        return f'{where}: {stock_failed} stock failures counted, {len(failed)} recorded'
    unlisted = sorted(failed - set(exclusions))
    if unlisted:
        return f'{where}: {len(unlisted)} unlisted stock failures (e.g. {unlisted[0]})'
    compared = units - stock_failed
    if compared <= 0:
        return f'{where}: no units compared'
    if int(totals.get('mismatched') or 0) or int(totals.get('traced_failed') or 0):
        return (f'{where}: byte identity failed ({int(totals.get("mismatched") or 0)} mismatched, '
                f'{int(totals.get("traced_failed") or 0)} traced failures)')
    off, on = int(totals.get('identical_off') or 0), int(totals.get('identical_on') or 0)
    if off != compared or on != compared:
        return f'{where}: {compared} compared but {off} identical off, {on} identical on'
    if any(not (r.get('ok_off') and r.get('ok_on')) for r in rows if r.get('status') != 'stock_failed'):
        return f'{where}: a compared unit is not identical with tracing off and on'
    return None


def reason_to_disable(version, entry, exe, validation, reports, games):
    """None when the version may stay enabled, else why it may not."""
    if not exe.is_file():
        return 'traced compiler not staged'
    digest = sha1(exe)
    if entry.get('traced_sha1') != digest:
        return f'traced_sha1 mismatch: staged {digest}, capabilities {entry.get("traced_sha1")}'
    presence = load_json(validation / f'presence-{version}.json')
    if not isinstance(presence, dict) or presence.get('schema') != PRESENCE_SCHEMA or presence.get('compiler_sha1') != digest:
        return f'no event-presence evidence for {digest}'
    if not presence.get('identity') or not all(presence['identity'].values()):
        return f'event-presence fixture compiled differently: {presence.get("identity")}'
    failed = [p for p in entry.get('points', []) if not (presence.get('points') or {}).get(p, {}).get('ok')]
    if failed:
        return f'event presence missing for {", ".join(failed)}'
    sweeps = [(game, name, r) for game, name, r in reports
              if (r.get('traced_sha1') or {}).get(version) == digest and version in (r.get('totals') or {})]
    for game, name, report in sweeps:
        exclusions = (((games.get(game) or {}).get('stock_exclusions') or {}).get(version)) or []
        problem = sweep_problem(game, name, report, version, exclusions)
        if problem:
            return problem
    needing = sorted(g for g, spec in games.items() if version in (spec.get('required') or []))
    covered = {game for game, _, report in sweeps if is_full(report, version)}
    if needing:
        missing = [g for g in needing if g not in covered]
        if missing:
            return f'no byte-identity evidence from {", ".join(missing)}'
    elif not covered:
        return 'no byte-identity evidence'
    return None


def main(argv):
    if len(argv) != 2:
        raise SystemExit(__doc__.splitlines()[2])
    out, versions = Path(argv[0]), [v for v in argv[1].split(',') if v]
    caps_path = out / 'CAPABILITIES.json'
    caps = json.loads(caps_path.read_text(encoding='utf-8'))
    validation = out / 'validation'
    reports = byte_identity_reports(validation)
    games = ((load_json(out / 'requirements.json') or {}).get('games')) or {}
    for version in versions:
        entry = caps.setdefault('versions', {}).setdefault(version, {'points': []})
        reason = reason_to_disable(version, entry, out / 'GC' / version / 'mwcceppc.exe', validation, reports, games)
        if reason is None:
            print(f'{version}: enabled ({", ".join(entry.get("points", [])) or "no points"})')
            continue
        unavailable = dict(entry.get('unavailable') or {})
        for point in entry.get('points', []):
            unavailable[point] = reason
        entry.update(points=[], unavailable=unavailable, disabled=reason)
        print(f'{version}: disabled ({reason})')
    caps_path.write_text(json.dumps(caps, indent=2) + '\n', encoding='utf-8')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
