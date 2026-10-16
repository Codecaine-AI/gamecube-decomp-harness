#!/usr/bin/env python3
"""Agreement of steering_shapes.classify_group with the temp-hack audit.

For every audited function (objectives/sms-pr189-split/audit/temp-audit/NN.json)
the PR head is diffed against upstream base 7fed828b in the read-only sb-up7f
checkout, the statement-complete groups inside the function body are
classified as one group, and the shape families are compared with the audit's
change kinds:

  temp -> temp_alias, inline_swap -> accessor_swap,
  form -> any form shape (ternary_if, operand_order, statement_permutation,
          decl_reorder, type_spelling, float_form, compound_assign_split, bool_form),
  real -> any real shape.

Reports per-change recall (the audit kind's family is among the classifier's
families), per-function exact family-set agreement and the steering-vs-real
verdict proxy. Read-only: it never writes to the audit or the sandbox.

  python3 objectives/sms-real-codegen/validation/shape_agreement.py [--json OUT] [--verbose]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'toolpacks/gamecube-decomp/_impl/gamecube/tools'))
import steering_shapes as ss  # noqa: E402

HARNESS = Path('/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness')
AUDIT = HARNESS / 'objectives/sms-pr189-split/audit/temp-audit'
REPO = HARNESS / 'games/sms/workspace/sb-up7f'
BASE = '7fed828b'

FAMILY = {'temp_alias': 'temp', 'accessor_swap': 'inline_swap'}
FAMILY.update({shape: 'form' for shape in ('ternary_if', 'operand_order', 'statement_permutation', 'decl_reorder',
                                            'type_spelling', 'float_form', 'compound_assign_split', 'bool_form')})


def git_show(ref, path):
    result = subprocess.run(['git', '-C', str(REPO), 'show', f'{ref}:{path}'], capture_output=True, text=True)
    return result.stdout if result.returncode == 0 else None


def function_range(text, name):
    """(first line, last line) 1-based of a function definition, or None."""
    clean = ss.strip_comments(text)
    clean = re.sub(r'"(?:\\.|[^"\\\n])*"', lambda m: '"' + ' ' * (len(m.group()) - 2) + '"', clean)
    bare = re.sub(r'\(.*\)$', '', name)
    params = re.search(r'\((.*)\)$', name)
    parts = bare.split('::')
    patterns = []
    if len(parts) >= 2:
        owner, method = parts[-2], parts[-1]
        patterns.append(re.escape(owner) + r'(?:<[^>]*>)?\s*::\s*' + re.escape(method) + r'\s*\(')
        if method == 'execute':
            patterns.append(r'DEFINE_NERVE\s*\(\s*' + re.escape(owner) + r'\s*,')
    else:
        patterns.append(r'(?<![\w:.>])' + re.escape(bare) + r'\s*\(')
    candidates = []
    for pattern in patterns:
        for match in re.finditer(pattern, clean):
            start = match.start()
            depth, index = 0, clean.index('(', start)
            # skip to the end of the parameter list
            while index < len(clean):
                if clean[index] == '(':
                    depth += 1
                elif clean[index] == ')':
                    depth -= 1
                    if depth == 0:
                        break
                index += 1
            tail = clean[index + 1:index + 200]
            brace = re.match(r'[^;{}]*\{', tail)
            if not brace:
                continue
            open_index = index + 1 + brace.end() - 1
            depth = 0
            for close in range(open_index, len(clean)):
                if clean[close] == '{':
                    depth += 1
                elif clean[close] == '}':
                    depth -= 1
                    if depth == 0:
                        signature = clean[start:index + 1]
                        candidates.append((clean.count('\n', 0, start) + 1, clean.count('\n', 0, close) + 1, signature))
                        break
    if not candidates:
        return None
    if params:
        wanted = re.sub(r'\s+', '', params.group(1))
        for first, last, signature in candidates:
            got = re.sub(r'\s+', '', signature[signature.find('(') + 1:-1])
            if wanted and all(word in got for word in re.findall(r'\w+', wanted)):
                return first, last
    return candidates[0][0], candidates[0][1]


def families(result):
    found = {FAMILY[s] for s in result['shapes'] if s in FAMILY}
    if result['real_shapes']:
        found.add('real')
    if 'other' in result['shapes']:
        found.add('other')
    if 'codegen_directive' in result['shapes']:
        found.add('directive')
    return found


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--json', help='write per-function results here')
    parser.add_argument('--verbose', action='store_true')
    parser.add_argument('--whole-body', action='store_true', help='classify the whole function body instead of the changed statements')
    parser.add_argument('--dump', help='print the group and findings of functions matching this text')
    args = parser.parse_args(argv)
    typedefs = ss.load_typedefs(REPO)
    rows = []
    per_kind = Counter()
    per_kind_hit = Counter()
    for path in sorted(AUDIT.glob('*.json')):
        audit = json.loads(path.read_text())
        head = audit['head']
        for function in audit['functions']:
            row = {'pr': audit['pr'], 'function': function['name'], 'file': function['file'], 'verdict': function['verdict'],
                   'audit_kinds': sorted({c['kind'] for c in function['changes']})}
            base_text, head_text = git_show(BASE, function['file']), git_show(head, function['file'])
            post = function_range(head_text or '', function['name']) if head_text else None
            pre = function_range(base_text or '', function['name']) if base_text else None
            removed, added = [], []
            if base_text is not None and head_text is not None and (post or pre):
                for group in ss.statement_groups(base_text, head_text):
                    in_post = post and group['cand_start'] <= post[1] and max(group['cand_end'], group['cand_start']) >= post[0]
                    in_pre = pre and group['base_start'] <= pre[1] and max(group['base_end'], group['base_start']) >= pre[0]
                    if in_post or in_pre:
                        removed.extend(group['removed'])
                        added.extend(group['added'])
            if args.whole_body and pre and post and (removed or added):
                # The whole function on both sides: unchanged statements align as equal
                # and give the edits their loop/branch structure.
                removed = base_text.split('\n')[pre[0] - 1:pre[1]]
                added = head_text.split('\n')[post[0] - 1:post[1]]
            row['located'] = bool(post or pre)
            row['changed_lines'] = len(removed) + len(added)
            context = '\n'.join(head_text.split('\n')[post[0] - 1:post[1]]) if post else None
            result = ss.classify_group(removed, added, context=context, typedefs=typedefs) if (removed or added) else {'shapes': [], 'real_shapes': [], 'details': {'findings': []}}
            if args.dump and args.dump in function['name']:
                row['removed'], row['added'] = removed, added
                row['findings'] = result['details']['findings']
            row['shapes'] = result['shapes']
            row['real_shapes'] = result['real_shapes']
            got = families(result)
            row['families'] = sorted(got)
            for kind in row['audit_kinds']:
                per_kind[kind] += 1
                if kind in got:
                    per_kind_hit[kind] += 1
            want = set(row['audit_kinds'])
            row['exact_family_match'] = want == (got - {'directive'})
            row['proxy'] = 'real' if 'real' in got else 'steering'
            row['audit_proxy'] = 'steering' if function['verdict'] == 'steering' else 'real'
            rows.append(row)
    changes = sum(per_kind.values())
    hits = sum(per_kind_hit.values())
    exact = sum(1 for r in rows if r['exact_family_match'])
    proxy = sum(1 for r in rows if r['proxy'] == r['audit_proxy'])
    unchanged = [r for r in rows if not r['changed_lines']]
    print(f'functions: {len(rows)} ({len(unchanged)} with no change inside the body; not located: {sum(1 for r in rows if not r["located"])})')
    print(f'per-kind recall: {hits}/{changes} = {hits / changes:.0%}')
    for kind in ('temp', 'inline_swap', 'form', 'real'):
        print(f'  {kind:12s} {per_kind_hit[kind]}/{per_kind[kind]}')
    print(f'exact family-set agreement: {exact}/{len(rows)} = {exact / len(rows):.0%}')
    print(f'verdict proxy (any real shape vs audit real/mixed): {proxy}/{len(rows)} = {proxy / len(rows):.0%}')
    confusion = Counter((r['audit_proxy'], r['proxy']) for r in rows)
    print('  confusion (audit, classifier):', dict(confusion))
    seen = [r for r in rows if r['changed_lines']]
    seen_changes = sum(len(r['audit_kinds']) for r in seen)
    seen_hits = sum(1 for r in seen for k in r['audit_kinds'] if k in r['families'])
    seen_exact = sum(1 for r in seen if r['exact_family_match'])
    seen_proxy = sum(1 for r in seen if r['proxy'] == r['audit_proxy'])
    print(f'functions with an in-body change ({len(seen)}): recall {seen_hits}/{seen_changes} = {seen_hits / seen_changes:.0%}, '
          f'exact {seen_exact}/{len(seen)} = {seen_exact / len(seen):.0%}, proxy {seen_proxy}/{len(seen)} = {seen_proxy / len(seen):.0%}')
    extra = Counter(f for r in rows for f in set(r['families']) - set(r['audit_kinds']))
    print('extra families vs audit:', dict(extra))
    if args.dump:
        for r in rows:
            if args.dump in r['function']:
                print(json.dumps(r, indent=1))
    if args.verbose:
        for r in rows:
            mark = 'ok ' if r['exact_family_match'] else 'XX '
            print(mark, r['pr'], r['function'], 'audit=', r['audit_kinds'], 'got=', r['shapes'], r['real_shapes'])
    if args.json:
        Path(args.json).write_text(json.dumps({'per_kind': dict(per_kind), 'per_kind_hit': dict(per_kind_hit),
                                               'exact': exact, 'proxy': proxy, 'functions': rows}, indent=1))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
