#!/usr/bin/env python3
"""Bounded offline analysis of pinned MWCC captures. Never executes a compiler."""
from __future__ import annotations

import argparse
import json
import os
import tempfile
import uuid
from pathlib import Path
import re
import signal
import struct
import sys

sys.dont_write_bytecode = True
BASE = Path(__file__).resolve().parent
VENDOR = next((p for p in (BASE.parent / 'vendor/mwcc-decomp', BASE / 'vendor/mwcc-decomp') if p.is_dir()), BASE.parent / 'vendor/mwcc-decomp')
sys.path.insert(0, str(VENDOR / 'tools'))
FORMAT = 'mwcc-alloc-analysis-v1'
LIMITATIONS = ['Offline allocator models describe captured graphs. Source changes can change the graph; verify every proposed change with a real compile and checkdiff.', 'Solver results require baseline replay agreement and are hypotheses, not proof that a source edit can realize them.']
MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 128 * 1024 * 1024
MAX_INLINE = 8192
MAX_ARTIFACT = 128 * 1024 * 1024
SOURCE_RANK_REPLAYS = 256


class InvalidArguments(ValueError):
    pass


class Parser(argparse.ArgumentParser):
    def error(self, message):
        raise InvalidArguments(message)


def parser():
    p = Parser(description=__doc__)
    p.add_argument('--repo-root', required=True)
    p.add_argument('--mode', required=True, choices=['provenance', 'explain', 'inverse', 'source-rank', 'stack', 'origins'])
    p.add_argument('--input', required=True)
    for name in ['after', 'provenance', 'creations', 'register', 'output']:
        p.add_argument('--' + name)
    p.add_argument('--coloring', action='append', default=[])
    p.add_argument('--target', action='append', default=[])
    p.add_argument('--fixed-object', action='append', default=[])
    p.add_argument('--function-index', type=int)
    p.add_argument('--degree-search', type=int)
    p.add_argument('--json', action='store_true')
    return p


def bounded_path(root, value, directory=False, output=False):
    if not value or '\x00' in value or '\\' in value:
        raise InvalidArguments('paths must be nonempty and use forward slashes')
    path = Path(value)
    path = (root / path).resolve()
    if not path.is_relative_to(root):
        raise InvalidArguments('path must remain inside --repo-root: ' + value)
    if output:
        if path.exists() and not path.is_file():
            raise InvalidArguments('--output must name a file')
    elif directory:
        if not path.is_dir():
            raise InvalidArguments('capture directory does not exist: ' + value)
    elif not path.is_file():
        raise InvalidArguments('input file does not exist: ' + value)
    return path


def validate_args(args):
    root = Path(args.repo_root).resolve()
    if not root.is_dir():
        raise InvalidArguments('--repo-root must exist')
    allowed = {
        'provenance': {'coloring', 'creations'}, 'explain': {'register'},
        'inverse': {'after', 'target', 'provenance', 'degree_search'},
        'source-rank': {'function_index', 'target', 'fixed_object'},
        'stack': {'after', 'provenance'}, 'origins': {'after'},
    }[args.mode]
    for field in ['after', 'provenance', 'creations', 'register', 'coloring', 'target', 'function_index', 'degree_search', 'fixed_object']:
        if getattr(args, field) not in (None, []) and field not in allowed:
            raise InvalidArguments('--' + field.replace('_', '-') + ' is not supported for ' + args.mode)
    if args.mode == 'explain' and not args.register:
        raise InvalidArguments('explain requires --register')
    if args.register and (not re.fullmatch(r'(gpr|fpr|vr):[0-9]+', args.register) or int(args.register.split(':')[1]) > 65535):
        raise InvalidArguments('--register must be gpr:N, fpr:N, or vr:N with N <= 65535')
    if args.mode in ('inverse', 'source-rank') and not args.target:
        raise InvalidArguments(args.mode + ' requires --target')
    if args.mode == 'inverse' and not args.after:
        raise InvalidArguments('inverse requires --after for baseline replay validation')
    if args.mode == 'source-rank' and args.function_index is None:
        raise InvalidArguments('source-rank requires --function-index')
    if args.function_index is not None and not 1 <= args.function_index <= 100000:
        raise InvalidArguments('--function-index must be between 1 and 100000')
    if args.degree_search is not None and not 0 <= args.degree_search <= 8:
        raise InvalidArguments('--degree-search must be between 0 and 8')
    if len(args.target) > 16 or len(args.coloring) > 64:
        raise InvalidArguments('at most 16 targets and 64 coloring inputs are allowed')
    if len(args.fixed_object) > 64 or any(not re.fullmatch(r'v[0-9]{1,5}', value) or int(value[1:]) > 65535 for value in args.fixed_object):
        raise InvalidArguments('--fixed-object requires v0..v65535, at most 64 values')
    if len(set(args.fixed_object)) != len(args.fixed_object):
        raise InvalidArguments('--fixed-object values must be unique')
    targets = {}
    for value in args.target:
        if not re.fullmatch(r'[0-9]{1,5}=[0-9]{1,2}', value):
            raise InvalidArguments('--target must use numeric vreg=physical')
        vreg, physical = map(int, value.split('='))
        if vreg > 65535 or physical > 31 or vreg in targets:
            raise InvalidArguments('targets must be unique; vreg <=65535 and physical <=31')
        targets[vreg] = physical
    paths = {'input': bounded_path(root, args.input, directory=args.mode == 'source-rank')}
    for field in ['after', 'provenance', 'creations', 'output']:
        value = getattr(args, field)
        if value is not None:
            paths[field] = bounded_path(root, value, output=field == 'output')
    paths['coloring'] = [bounded_path(root, value) for value in args.coloring]
    if args.mode == 'source-rank':
        prefix = f'{args.function_index:04d}'
        for key, filename in [('before', f'coloring-{prefix}-gpr-01-before.json'), ('after', f'coloring-{prefix}-gpr-01-after.json'), ('pcode', f'pcode-{prefix}-scheduled.json')]:
            paths[key] = bounded_path(root, str(paths['input'] / filename))
    inputs = [p for key,p in paths.items() if key not in ('output', 'input', 'coloring')] + paths['coloring']
    if args.mode != 'source-rank':
        inputs.append(paths['input'])
    if 'output' in paths and paths['output'] in inputs:
        raise InvalidArguments('--output must not overwrite an input')
    total = 0
    for path in inputs:
        size = path.stat().st_size
        if size > MAX_FILE:
            raise InvalidArguments('input exceeds 32 MiB: ' + str(path))
        total += size
    if total > MAX_TOTAL:
        raise InvalidArguments('inputs exceed 128 MiB')
    return root, paths, targets


def load(path):
    with path.open(encoding='utf-8') as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValueError('input JSON must be an object')
    return value


def provenance(value):
    if value.get('format') != 'mwcc-allocator-provenance-v1':
        raise ValueError('expected mwcc-allocator-provenance-v1')
    for name in ('registers', 'operands', 'instructions'):
        if not isinstance(value.get(name), list):
            raise ValueError('provenance requires ' + name + ' list')
    return value


def validate_join_identity(snapshots):
    """Reject conflicting function evidence while allowing older unnamed captures."""
    observed = {}
    for snapshot in snapshots:
        identity = snapshot.get('function_identity') or {}
        if not isinstance(identity, dict):
            raise ValueError('function_identity must be an object')
        values = {key:snapshot.get(key) for key in ('target_sha256', 'compiler', 'capture_index')}
        values['function_name'] = identity.get('name')
        pointer = snapshot.get('function_pointer')
        object_pointer = identity.get('function_object')
        def address(value):
            return int(value, 0) if isinstance(value, str) else int(value)
        if pointer is not None and object_pointer is not None and address(pointer) != address(object_pointer):
            raise ValueError('function identity mismatch: function_pointer and function_object disagree')
        values['function_pointer'] = pointer if pointer is not None else object_pointer
        values['canonical_object'] = identity.get('canonical_object')
        for key, value in values.items():
            if value is None or value == '':
                continue
            if key in ('function_pointer', 'canonical_object'):
                value = address(value)
            if key in observed and observed[key] != value:
                raise ValueError('function identity mismatch in provenance join: ' + key)
            observed[key] = value


def same_capture(before, after):
    for key in ('target_sha256', 'capture_index', 'function_pointer', 'register_class'):
        if before.get(key) != after.get(key):
            raise ValueError('capture identity mismatch: ' + key)
    if before.get('function_identity') != after.get('function_identity'):
        raise ValueError('function identity mismatch')
    if {n['virtual_register'] for n in before['nodes']} != {n['virtual_register'] for n in after['nodes']}:
        raise ValueError('before and after node sets differ')


def replay_ok(validation):
    return validation.get('checked', 0) > 0 and not validation.get('mismatches')


def analyze(args, paths, targets):
    import allocator_snapshot as snap
    if args.mode == 'provenance':
        import allocator_provenance as ap
        allocator = load(paths['input'])
        coloring = [load(p) for p in paths['coloring']]
        creations = load(paths['creations']) if 'creations' in paths else None
        validate_join_identity([allocator, *coloring, *([creations] if creations is not None else [])])
        catalog = ap.VIRTUAL_REGISTER_CATALOG_BY_HASH.get(allocator.get('target_sha256'))
        sites = ap.load_virtual_register_catalog(VENDOR / catalog, allocator['target_sha256']) if catalog else {}
        return ap.build_provenance(allocator, coloring, creation_trace=creations, virtual_register_sites=sites)
    if args.mode in ('explain', 'origins'):
        data = provenance(load(paths['input']))
        if args.mode == 'explain':
            from explain_register import explain_register
            return explain_register(data, args.register)
        from rank_register_origins import summarize_origins, compare_summaries
        result = summarize_origins(data)
        return compare_summaries(result, summarize_origins(provenance(load(paths['after'])))) if 'after' in paths else result
    if args.mode == 'stack':
        import stack_frame_trace as stack
        trace = load(paths['input'])
        prov = provenance(load(paths['provenance'])) if 'provenance' in paths else None
        return stack.compare_traces(trace, load(paths['after']), prov) if 'after' in paths else {'allocations': stack.enrich_allocations(trace, prov), 'report': stack.format_trace(trace, prov)}
    before = load(paths['before'] if args.mode == 'source-rank' else paths['input'])
    after = load(paths['after'])
    snap.validate_coloring_snapshot(before)
    snap.validate_coloring_snapshot(after)
    same_capture(before, after)
    if len(before['nodes']) > 4096:
        raise ValueError('solver supports at most 4096 nodes')
    nodes = {n['virtual_register'] for n in before['nodes']}
    if not set(targets).issubset(nodes):
        raise ValueError('target registers absent from snapshot')
    if args.mode == 'inverse':
        import inverse_coloring as inverse
        validation = inverse.validate_replay(before, after)
        if not replay_ok(validation):
            return {'baseline_replay_validation': validation, 'trusted': False}
        positions = {register: index for index, register in enumerate(before['simplify_order'])}
        if not set(targets).issubset(positions):
            raise ValueError('target registers absent from simplify order')
        prefix_size = max(positions[register] for register in targets) + 1
        if prefix_size > 8:
            return bounded_inverse_pairs(before, targets, validation, prefix_size)
        if args.degree_search is not None and (args.degree_search + 1) ** len(targets) > 100000:
            return {'baseline_replay_validation': validation, 'trusted': True, 'search_limit': 'degree search exceeds 100000 combinations'}
        result = inverse.inverse_order_search(before, targets, None, 100000)
        if args.degree_search is not None:
            result['degree_hypothesis'] = inverse.degree_hypothesis_search(before, targets, args.degree_search, 100000)
        if 'provenance' in paths:
            result['labels'] = inverse.provenance_labels(provenance(load(paths['provenance'])))
    else:
        import source_rank_solver as solver
        from coloring_model import replay_simplify, validate_colors
        pcode = load(paths['pcode'])
        snap.validate_snapshot(pcode)
        for key in ('target_sha256', 'capture_index', 'function_identity'):
            if before.get(key) != pcode.get(key):
                raise ValueError('scheduled PCode identity mismatch: ' + key)
        before_pointer = before.get('function_pointer') or (before.get('function_identity') or {}).get('function_object')
        pcode_pointer = pcode.get('function_pointer') or (pcode.get('function_identity') or {}).get('function_object')
        if before_pointer != pcode_pointer:
            raise ValueError('scheduled PCode identity mismatch: function_pointer')
        validation = validate_colors(before, after, replay_simplify(before)['colors'])
        if not replay_ok(validation):
            return {'baseline_replay_validation': validation, 'trusted': False}
        fixed = frozenset(int(v[1:]) for v in args.fixed_object)
        information = solver.classify(before, after, pcode)
        objects = {reg for reg, item in information.items() if item['kind'] == 'object'}
        if not fixed.issubset(objects):
            raise ValueError('--fixed-object contains a register that is not an object web')
        effective_fixed = fixed | ({32} & objects)
        removable = [reg for reg, item in information.items() if item['unused_object_slot'] and reg not in effective_fixed]
        subsets = 2 ** len(removable)
        if subsets > SOURCE_RANK_REPLAYS:
            return {'baseline_replay_validation': validation, 'trusted': True,
                    'search_limit': 'Removable-object subsets exceed the global 256-replay budget. Pin known object strata with --fixed-object to narrow the model.',
                    'removable_object_slots': removable, 'subset_count': subsets}
        per_subset = max(1, SOURCE_RANK_REPLAYS // subsets)
        result = solver.search_snapshots(before, after, pcode, targets, max_permutations=per_subset, samples=per_subset, fixed_objects=fixed)
        result['global_replay_budget'] = SOURCE_RANK_REPLAYS
        result['removal_subset_count'] = subsets
        if result.get('status') == 'unreachable':
            result['model_status'] = result['status']
            result['status'] = 'not_found'
            result['conclusion_proven'] = False
        if result.get('status') == 'not_found':
            result['search_limit'] = 'No witness found within the bounded source-rank model; this does not prove source impossibility.'
    result['baseline_replay_validation'] = validation
    result['trusted'] = True
    return result


def bounded_inverse_pairs(before, targets, validation, prefix_size):
    """Probe pair swaps when upstream's prefix permutation search is too large."""
    from inverse_coloring import replay_selection
    import itertools
    order = list(before['simplify_order'])
    positions = {register: index for index, register in enumerate(order)}
    baseline = replay_selection(before, order)
    target_regs = sorted(targets)
    pairs = list(itertools.combinations(target_regs, 2))
    pairs += [(target, other) for target in target_regs for other in order if target != other]
    seen = set()
    tested = 0
    best_score = sum(baseline.get(reg) == color for reg, color in targets.items())
    witness = None
    for left, right in pairs:
        pair = tuple(sorted((left, right)))
        if pair in seen:
            continue
        seen.add(pair)
        if tested >= 256:
            break
        candidate = list(order)
        a, b = positions[left], positions[right]
        candidate[a], candidate[b] = candidate[b], candidate[a]
        colors = replay_selection(before, candidate)
        tested += 1
        score = sum(colors.get(reg) == color for reg, color in targets.items())
        if score > best_score:
            best_score = score
            witness = {'swap': [left, right], 'order': candidate, 'target_colors': {reg: colors.get(reg) for reg in targets}, 'changed_colors': [{'register':reg, 'before':baseline.get(reg), 'after':color} for reg,color in sorted(colors.items()) if baseline.get(reg) != color]}
            if score == len(targets):
                break
    return {'baseline_replay_validation': validation, 'trusted': True,
            'search_limit': 'The full prefix search exceeds 100000 permutations. Only bounded pair transpositions were tested; absence of a witness does not prove impossibility.',
            'required_prefix_size': prefix_size, 'pair_transpositions_tested': tested,
            'best_score': best_score, 'target_count':len(targets), 'witness':witness,
            'source_realization': 'A graph-order witness does not prove that a source change can produce this order.'}


def bounded_summary(result):
    """Keep useful facts inline; full graph/PCode data lives in the artifact."""
    summary = {'inline_truncated': True, 'format': result.get('format')}
    for key in ('status', 'trusted', 'search_limit', 'best_score', 'target_count',
                'pair_transpositions_tested', 'permutations_tested', 'global_replay_budget'):
        if key in result:
            summary[key] = result[key]
    summary['counts'] = {key:len(value) for key,value in result.items() if isinstance(value, (list,dict))}
    validation = result.get('baseline_replay_validation')
    if isinstance(validation, dict):
        summary['baseline_replay_validation'] = {key:validation.get(key) for key in ('checked','matched')}
        summary['baseline_replay_validation']['mismatch_count'] = len(validation.get('mismatches', []))
    witness = result.get('witness')
    if isinstance(witness, dict):
        summary['witness'] = {key:value for key,value in witness.items() if key in ('swap','target_colors','colors','changed_colors')}
    if len(json.dumps(summary).encode('utf-8')) > MAX_INLINE:
        summary.pop('witness', None)
    if len(json.dumps(summary).encode('utf-8')) > MAX_INLINE:
        summary = {'inline_truncated': True, 'message': 'Read the analysis artifact for the complete result.'}
    return summary


def persist_result(root, paths, mode, result):
    requested = paths.get('output') or root / 'build/mwcc-alloc/analysis' / f'{mode}-{uuid.uuid4().hex}.json'
    output = bounded_path(root, str(requested), output=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='wb', dir=output.parent, prefix='.analysis-', delete=False) as stream:
            temporary = Path(stream.name)
            for chunk in json.JSONEncoder(ensure_ascii=True, separators=(',', ':')).iterencode(result):
                encoded = chunk.encode('utf-8')
                total += len(encoded)
                if total > MAX_ARTIFACT:
                    raise ValueError('analysis artifact exceeds the 128 MiB serialization limit')
                stream.write(encoded)
            stream.write(b'\n')
        os.replace(temporary, output)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
    return {'path': str(output.relative_to(root)), 'kind': 'analysis', 'bytes': total + 1}, result if total <= MAX_INLINE and len(json.dumps(result).encode('utf-8')) <= MAX_INLINE else bounded_summary(result)


def main(argv=None):
    mode = None
    def timeout(_signum, _frame):
        raise TimeoutError('offline analysis exceeded 45 seconds')
    previous = signal.signal(signal.SIGALRM, timeout)
    signal.alarm(45)
    try:
        args = parser().parse_args(argv)
        mode = args.mode
        root, paths, targets = validate_args(args)
        result = analyze(args, paths, targets)
        payload = {'status': 'search_limited' if 'search_limit' in result else 'ok' if result.get('trusted') is not False else 'baseline_replay_mismatch', 'mode': mode, 'format': FORMAT, 'limitations': LIMITATIONS}
        if args.mode == 'provenance' and 'creations' not in paths:
            payload['limitations'] = LIMITATIONS + ['No creation trace supplied; origin groups and source allocation sites are incomplete.']
        if args.mode == 'origins' and not provenance(load(paths['input'])).get('virtual_register_creations'):
            payload['limitations'] = LIMITATIONS + ['No virtual register creation events in the provenance input; empty groups do not prove that no origins exist.']
        artifact, inline = persist_result(root, paths, mode, result)
        payload['files'] = [artifact]
        payload['result'] = inline
    except InvalidArguments as error:
        payload = {'status': 'invalid_arguments', 'mode': mode, 'format': FORMAT, 'error': str(error)[:4000]}
    except TimeoutError as error:
        payload = {'status': 'timeout', 'mode': mode, 'format': FORMAT, 'error': str(error)[:4000]}
    except (ValueError, KeyError, IndexError, TypeError, AttributeError, OSError, RecursionError, OverflowError, struct.error) as error:
        payload = {'status': 'invalid_input', 'mode': mode, 'format': FORMAT, 'error': str(error)[:4000]}
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)
    print(json.dumps(payload, sort_keys=True))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
