"""Extract proposed names from the audit snapshot without writing the KB.

Produces an auditable proposal CSV, a compact function-symbol manifest, and a
sample symbols footer. Prefix/suffix checks flag review work, not correctness.
"""

import collections
import csv
import json
import pathlib
import re
import sqlite3

ROOT = pathlib.Path(__file__).parent
IDENT = r'[A-Za-z_][A-Za-z0-9_]*'
TOKEN = rf'(?P<quote>[`\"\']?)(?P<name>{IDENT})(?P=quote)(?![A-Za-z0-9_])'
ADJECTIVE = r'(?:plausible|likely|original|original-style|original-role|local-style|semantic|descriptive|recovered|recovered-style|fully|role|role-bearing|role-based|role-specific|convention-aligned|convention-consistent|convention-preserving|convention-based|conservative|inferred|developer|most|more|behaviorally|accurate|strongest|authored)'
VERB = r'(?:is|was|would(?: likely)? be|could be)(?: (?:most|plausibly|likely|probably))*'
RULES = [
    ('identifier', re.compile(rf'^{TOKEN}\s*\.?$')),
    ('name_statement', re.compile(rf'^(?:(?:A|An|The)\s+)?(?:{ADJECTIVE}\s+){{0,9}}name\s*(?::|{VERB})\s*{TOKEN}(?=$|[.,;:]|\s)', re.I)),
    ('likely_prefix', re.compile(rf'^(?:Likely|Probably|Possibly|Plausibly)\s+{TOKEN}(?=$|[.,;:]|\s)', re.I)),
    ('function_named', re.compile(rf'^The original (?:function(?: name)?|name|static-function name)\s+(?:was|is)\s+(?:plausibly|likely)\s+(?:named\s+)?{TOKEN}(?=$|[.,;]|\s)', re.I)),
    ('leading_name', re.compile(rf'^{TOKEN}\s+(?:is|remains|would be)\s+(?:a|the)\s+(?:{ADJECTIVE}\s+){{1,9}}(?:name|original-name inference)\b', re.I)),
]
KEYWORDS = set('auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while inline restrict _Bool _Complex _Imaginary'.split())
NON_NAMES = set('a an the unknown none null name original likely plausible function routine something probably'.split())
ALTERNATIVES = re.compile(r'\b(?:or|alternatively|alternative|alternatives)\b|\s/\s', re.I)
CALLBACK_SUFFIXES = {'Anim', 'IASA', 'Phys', 'Coll', 'OnLoad', 'OnDeath', 'OnInit'}


def extract(value):
    for rule, pattern in RULES:
        match = pattern.match(value.strip())
        if match:
            candidate = match.group('name')
            if candidate in KEYWORDS or candidate.lower() in NON_NAMES:
                return '', 'invalid_candidate'
            # Reject truncated paths, member access, calls, and compound names.
            tail = value.strip()[match.end('name') + len(match.group('quote')):]
            if re.match(r'(?:\.[A-Za-z_]|::|[/(\-])', tail):
                return '', 'compound_candidate'
            return candidate, rule
    return '', 'unrecognized'


def prefix(name):
    return name.split('_', 1)[0] if '_' in name else ''


def suffix(name):
    return name.rsplit('_', 1)[-1] if '_' in name else ''


def main():
    rows = list(csv.DictReader((ROOT / 'naming-facts.csv').open()))
    snapshot = json.loads((ROOT / 'summary.json').read_text())
    db = sqlite3.connect(pathlib.Path(snapshot['database']).as_uri() + '?mode=ro', uri=True)
    canonical = collections.defaultdict(set)
    for unit, symbol in db.execute("SELECT unit,symbol FROM target WHERE identity_status='current'"):
        canonical[unit].add(symbol)
    db.close()
    proposals = []
    for row in rows:
        candidate, rule = extract(row['value'])
        flags = []
        if not candidate:
            flags.append(rule)
        if row['target_status'] != 'current' and row['entity_status'] != 'active':
            flags.append('inactive_subject')
        if row['target_kind'] != 'function':
            flags.append('needs_non_function_binding')
        if candidate and ALTERNATIVES.search(row['value']):
            flags.append('alternatives_language')
        if candidate == row['symbol']:
            flags.append('already_canonical')
        elif candidate and candidate in canonical[row['unit']]:
            flags.append('existing_symbol_in_unit')
        old_prefix, new_prefix = prefix(row['symbol']), prefix(candidate)
        if candidate and old_prefix and old_prefix not in {'fn', 'func', 'lbl'} and old_prefix != new_prefix:
            flags.append('prefix_changed')
        old_suffix, new_suffix = suffix(row['symbol']), suffix(candidate)
        if candidate and old_suffix in CALLBACK_SUFFIXES and old_suffix != new_suffix:
            flags.append('callback_suffix_changed')
        if candidate and re.search(r'[0-9A-Fa-f]{8}$|(?:^|_)Unk(?:\d|_|$)', candidate):
            flags.append('still_placeholder_like')
        proposals.append({
            'fact_id': row['id'], 'fact_updated_at': row['updated_at'],
            'subject': row['stable_key'] or row['locator'], 'unit': row['unit'],
            'canonical': row['symbol'], 'candidate': candidate,
            'rule': rule, 'canonical_prefix': old_prefix, 'candidate_prefix': new_prefix,
            'canonical_suffix': old_suffix, 'candidate_suffix': new_suffix,
            'confidence': row['confidence'], 'flags': flags,
            'original_value': row['value'], 'original_rationale': row['rationale'],
            'evidence_count': row['evidence_count'],
        })
    groups = collections.defaultdict(list)
    for row in proposals:
        if row['candidate']:
            groups[row['unit'], row['candidate']].append(row)
    for group in groups.values():
        if len(group) > 1:
            for row in group:
                row['flags'].append('duplicate_candidate_in_unit')
    for row in proposals:
        row['lane'] = 'review' if row['flags'] else 'format_only_candidate'
        row['flags'] = ';'.join(row['flags'])
    with (ROOT / 'normalization-proposals.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(proposals[0]))
        writer.writeheader()
        writer.writerows(proposals)
    manifest = collections.defaultdict(list)
    for row in proposals:
        if row['candidate'] and 'needs_non_function_binding' not in row['flags']:
            manifest[row['unit']].append({key: row[key] for key in (
                'subject', 'canonical', 'candidate', 'confidence', 'fact_id', 'fact_updated_at', 'lane', 'flags')})
    (ROOT / 'symbol-manifest.json').write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + '\n')
    stats = {
        'input_snapshot_utc': snapshot['snapshot_utc'],
        'total': len(proposals),
        'extracted': sum(bool(row['candidate']) for row in proposals),
        'not_extracted': sum(not row['candidate'] for row in proposals),
        'lanes': dict(collections.Counter(row['lane'] for row in proposals)),
        'rules': dict(collections.Counter(row['rule'] for row in proposals)),
        'flags': dict(collections.Counter(flag for row in proposals for flag in row['flags'].split(';') if flag)),
        'candidate_prefixes': collections.Counter(row['candidate_prefix'] for row in proposals if row['candidate_prefix']).most_common(25),
        'candidate_suffixes': collections.Counter(row['candidate_suffix'] for row in proposals if row['candidate_suffix']).most_common(25),
        'prefix_changes': [
            {'from': old, 'to': new, 'count': count}
            for (old, new), count in collections.Counter(
                (row['canonical_prefix'], row['candidate_prefix'])
                for row in proposals if 'prefix_changed' in row['flags']
            ).most_common(30)
        ],
        'method': 'Regex extraction only. Flags are conservative review heuristics. Names and confidence are not semantically verified. Canonical collision checks read the current database, while input facts come from the saved snapshot. No KB writes.',
    }
    (ROOT / 'normalization-summary.json').write_text(json.dumps(stats, indent=2) + '\n')
    unit = 'main/melee/ft/kinds/ftLink/ftlinkspecialn'
    footer = ['Symbols with naming proposals', f'Unit: {unit}',
              'Aliases are hypotheses. Edit and cite canonical symbols. Confidence is the existing KB score.',
              'This is the naming subset of the unit, not a source-reference inventory.', '']
    for row in sorted(manifest.get(unit, []), key=lambda row: row['canonical']):
        footer.append(f"{row['canonical']} -> {row['candidate']} | confidence {row['confidence']} | {row['lane']}" + (f" | {row['flags']}" if row['flags'] else ''))
    (ROOT / 'sample-symbols-footer.txt').write_text('\n'.join(footer) + '\n')
    print(json.dumps({key: value for key, value in stats.items() if key not in {'candidate_prefixes', 'candidate_suffixes'}}, indent=2))


if __name__ == '__main__':
    main()
