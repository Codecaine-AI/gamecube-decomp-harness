"""Validate all Terra batch results and build a reversible cleanup proposal.

This script never opens or writes the live knowledge database. A normalized
name is an extraction from a standing claim, not a verified semantic rename.
"""

import collections
import csv
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).parent
DECISIONS = {'normalize', 'keep', 'ambiguous', 'not_symbol', 'no_name', 'already_canonical', 'needs_review'}


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def main():
    source = list(csv.DictReader((ROOT / 'normalization-proposals.csv').open()))
    by_id = {row['fact_id']: row for row in source}
    assert len(by_id) == len(source), 'Duplicate source facts'
    reviews = {}
    batch_counts = {}
    for kind in ('extract', 'audit'):
        for number in range(1, 5):
            name = f'{kind}-{number}'
            inputs = read_jsonl(ROOT / 'batches' / f'{name}.jsonl')
            outputs = read_jsonl(ROOT / 'batches' / f'{name}.results.jsonl')
            expected = {row['fact_id'] for row in inputs}
            actual = [row['fact_id'] for row in outputs]
            assert len(actual) == len(set(actual)), f'{name}: duplicate results'
            assert set(actual) == expected, f'{name}: missing or unexpected results'
            for result in outputs:
                fact_id = result['fact_id']
                assert fact_id not in reviews, f'{name}: repeated fact across batches'
                assert result['decision'] in DECISIONS, (name, result)
                assert isinstance(result['reason'], str) and result['reason'].strip(), (name, result)
                candidate = result['candidate']
                original = by_id[fact_id]
                if candidate:
                    assert re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', candidate), (name, result)
                    # Accept only complete identifier occurrences, never newly invented spelling.
                    pattern = rf'(?<![A-Za-z0-9_]){re.escape(candidate)}(?![A-Za-z0-9_])'
                    assert re.search(pattern, original['original_value'] + '\n' + original['original_rationale']), (name, result)
                if result['decision'] in {'normalize', 'keep'}:
                    assert candidate, (name, result)
                assert isinstance(result['alternatives'], list), (name, result)
                reviews[fact_id] = {**result, 'batch': name}
            batch_counts[name] = dict(collections.Counter(row['decision'] for row in outputs))
    expected_reviews = {row['fact_id'] for row in source if row['lane'] == 'review'}
    assert set(reviews) == expected_reviews, 'Review queue coverage differs from source'
    plan = []
    for original in source:
        review = reviews.get(original['fact_id'])
        candidate = review['candidate'] if review else original['candidate']
        decision = review['decision'] if review else 'normalize'
        if decision == 'keep':
            decision = 'normalize'
        if candidate == original['canonical'] and candidate:
            decision = 'already_canonical'
        accepted = decision == 'normalize'
        flags = original['flags'].split(';')
        binding = 'non_function_binding_required' if 'needs_non_function_binding' in flags else 'function_binding_required'
        if 'inactive_subject' in flags:
            binding = 'inactive_subject'
        record = {
            'fact_id': original['fact_id'], 'subject': original['subject'], 'unit': original['unit'],
            'expected_updated_at': original['fact_updated_at'],
            'original_value': original['original_value'], 'original_rationale': original['original_rationale'],
            'confidence': original['confidence'], 'evidence_count': original['evidence_count'],
            'canonical': original['canonical'], 'candidate': candidate,
            'decision': decision,
            'review_source': review['batch'] if review else 'regex_no_flags',
            'reason': review['reason'] if review else f"Recognized {original['rule']} form; no lexical audit flags.",
            'alternatives': review['alternatives'] if review else [],
            'original_flags': original['flags'], 'binding_status': binding,
            'proposed_value': candidate if accepted else None,
            'proposed_rationale': (
                original['original_rationale'] + '\n\nPrior naming claim preserved during format normalization: '
                + original['original_value']
                if accepted and candidate != original['original_value'] else original['original_rationale']
            ),
        }
        plan.append(record)
    by_scope = collections.defaultdict(list)
    for row in plan:
        if row['decision'] == 'normalize':
            by_scope[row['unit'], row['candidate']].append(row)
    for group in by_scope.values():
        if len(group) > 1:
            for row in group:
                row['binding_status'] += ';duplicate_candidate_in_unit'
    def write_jsonl(name, records):
        (ROOT / name).write_text(''.join(json.dumps(row) + '\n' for row in records))
    write_jsonl('cleanup-plan.jsonl', plan)
    pending = [row for row in plan if row['decision'] != 'normalize']
    write_jsonl('remaining-review.jsonl', pending)
    with (ROOT / 'cleaned-names.csv').open('w', newline='') as stream:
        fields = ['subject', 'canonical', 'candidate', 'decision', 'confidence', 'review_source', 'binding_status', 'reason', 'fact_id']
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(plan)
    unit = 'main/melee/ft/kinds/ftLink/ftlinkspecialn'
    footer = ['Symbols with naming proposals', f'Unit: {unit}',
              'Reading aliases only. Edit canonical symbols. Confidence is the existing KB score.',
              'This lists naming facts for the unit, not every source reference.', '']
    for row in sorted((row for row in plan if row['unit'] == unit), key=lambda row: row['canonical']):
        footer.append(f"{row['canonical']} -> {row['candidate'] or '[unresolved]'} | confidence {row['confidence']} | {row['decision']}")
    (ROOT / 'reviewed-symbols-footer.txt').write_text('\n'.join(footer) + '\n')
    summary = {
        'facts': len(plan), 'agent_reviewed': len(reviews),
        'regex_without_flags': len(plan) - len(reviews),
        'decisions': dict(collections.Counter(row['decision'] for row in plan)),
        'normalization_changes': sum(row['decision'] == 'normalize' and row['candidate'] != row['original_value'] for row in plan),
        'already_identifier_format': sum(row['decision'] == 'normalize' and row['candidate'] == row['original_value'] for row in plan),
        'batch_counts': batch_counts,
        'limits': 'Formatting proposals only. No database writes, source renames, evidence freshness verification, or semantic validation. Original text and fact version are preserved. Data-section names require separate bindings. Recheck scope collisions before rendering.',
    }
    (ROOT / 'cleanup-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
