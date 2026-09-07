"""Read-only naming inventory. Heuristic flags are review queues, not verdicts."""

import argparse
import collections
import csv
import datetime
import json
import pathlib
import re
import sqlite3


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=pathlib.Path, default=pathlib.Path('games/melee/knowledge/knowledge.sqlite'))
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path(__file__).parent)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(args.database.resolve().as_uri() + '?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    db.execute('BEGIN')
    rows = [dict(row) for row in db.execute('''
        SELECT f.*, t.symbol, t.stable_key, t.unit, t.kind target_kind,
          t.identity_status target_status, e.kind entity_kind, e.locator,
          e.identity_status entity_status
        FROM fact f LEFT JOIN target t ON t.id=f.target_id
        LEFT JOIN entity e ON e.id=f.entity_id ORDER BY f.id
    ''')]
    evidence = collections.Counter(row['fact_id'] for row in db.execute('SELECT fact_id FROM evidence'))
    targets = [dict(row) for row in db.execute("SELECT symbol, unit, kind FROM target WHERE identity_status='current'")]
    entities = [dict(row) for row in db.execute('SELECT kind, count(*) n FROM entity GROUP BY kind')]
    db.close()
    identifier = re.compile(r'[A-Za-z_][A-Za-z0-9_]*')
    wrapped = re.compile(r'[`\"\']([A-Za-z_][A-Za-z0-9_]*)[`\"\']\.?')
    name_language = re.compile(r'\b(?:inferred[ _-]name|proposed[ _-]name|suggested[ _-]name|possible[ _-]name|plausible[ _-]name|semantic[ _-]name|original[ _-](?:style[ _-])?name|likely[ _-]name|(?:name|rename)[ds]?\s+(?:is|as|to|was|would|could|should))\b', re.I)
    placeholder = re.compile(r'(?:^|_)(?:fn|func|lbl)_[0-9a-f]{8}$|[0-9a-f]{8}$', re.I)
    by_symbol = collections.defaultdict(list)
    for target in targets:
        by_symbol[target['symbol']].append(target)
    names = []
    for row in rows:
        if row['type'] != 'inferred_name':
            continue
        value = row['value']
        stripped = value.strip()
        match = wrapped.fullmatch(stripped)
        if identifier.fullmatch(value):
            shape, candidate = 'bare_identifier', value
        elif identifier.fullmatch(stripped):
            shape, candidate = 'whitespace_wrapped_identifier', stripped
        elif match:
            shape, candidate = 'quoted_identifier', match.group(1)
        else:
            shape, candidate = 'prose_or_other', ''
        flags = []
        status = row['target_status'] or row['entity_status']
        if status not in ('current', 'active'):
            flags.append('inactive_subject')
        if candidate and candidate == row['symbol']:
            flags.append('equals_canonical_symbol')
        if re.search(r'\b(?:or|alternatively)\b', value, re.I):
            flags.append('possible_alternatives_review')
        if candidate and candidate != row['symbol'] and candidate in by_symbol:
            flags.append('candidate_is_existing_symbol_review_scope')
        if not evidence[row['id']]:
            flags.append('no_evidence')
        names.append({**row, 'shape': shape, 'candidate': candidate,
                      'evidence_count': evidence[row['id']], 'flags': ';'.join(flags)})
    hidden = [{**row, 'matched_in': ';'.join(field for field in ('value', 'rationale') if name_language.search(row[field]))}
              for row in rows if row['type'] != 'inferred_name'
              and any(name_language.search(row[field]) for field in ('value', 'rationale'))]

    def write_csv(name, records):
        if not records:
            return
        with (args.output / name).open('w', newline='') as stream:
            writer = csv.DictWriter(stream, fieldnames=list(records[0]))
            writer.writeheader()
            writer.writerows(records)

    write_csv('naming-facts.csv', names)
    write_csv('other-facts-name-language.csv', hidden)
    candidates = collections.Counter(row['candidate'] for row in names if row['candidate'])
    metrics = {
        'snapshot_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'database': str(args.database.resolve()),
        'method': 'One read-only SQLite transaction. Identifier shape is lexical only; flags and prose searches require review. No evidence freshness or semantic correctness check.',
        'total_facts': len(rows),
        'facts_by_type': dict(collections.Counter(row['type'] for row in rows)),
        'naming_facts': len(names),
        'name_shapes': dict(collections.Counter(row['shape'] for row in names)),
        'name_subjects': dict(collections.Counter(f"{row['entity_kind'] or row['target_kind']}:{row['entity_status'] or row['target_status']}" for row in names)),
        'entity_totals': {row['kind']: row['n'] for row in entities},
        'flags': dict(collections.Counter(flag for row in names for flag in row['flags'].split(';') if flag)),
        'other_facts_with_name_language': len(hidden),
        'other_name_language_by_type': dict(collections.Counter(row['type'] for row in hidden)),
        'current_function_targets': sum(row['kind'] == 'function' for row in targets),
        'current_data_targets': sum(row['kind'] == 'data' for row in targets),
        'current_function_names_with_address_suffix': sum(row['target_status'] == 'current' and row['target_kind'] == 'function' and bool(placeholder.search(row['symbol'])) for row in names),
        'repeated_candidate_spellings': {candidate: count for candidate, count in candidates.items() if count > 1},
    }
    (args.output / 'summary.json').write_text(json.dumps(metrics, indent=2) + '\n')
    print(json.dumps(metrics, indent=2))


if __name__ == '__main__':
    main()
