"""SMS source-fidelity rules: the game-specific layer above the global
source_fidelity family. Covers header ownership of placeholder classes, the
PCH dummy-string convention, fabricated scaffolding (pragmas, single-use
helpers, hand-expanded inlines), MSL intrinsic bypasses, the dummy(Vec*)
emission helper, agent-written comments and accessor/inline evidence, plus
the D1/D2 drop (user decision 2026-10-13): invented helpers with no upstream
declaration or map entry (sms_invented_helper) and odd-looking code kept only
for codegen (sms_nonsense_code), and the #342 ruling that UNUSED functions get
a body only when they were inlined (sms_unused_reconstruction), and the #347/#348
decompile-in-order ruling (sms_out_of_order_fill, sms_undecompiled_class_decl).

SMS maintainer rulings (2026-10-13, doldecomp/sms #330/#331): agent comments
(TODO, fakematch, fabricated, frame notes) are rejected, and a marker comment
never downgrades or exempts a finding, SMS or global. The post-scan hook
``apply_sms_policy_to_global_findings`` keeps global marker/evidence advice
from reaching SMS workers."""
import bisect
import importlib.util
import os
import re
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path


def _baseline():
    """Share helpers with the sms_baseline slice (same module name the engine uses)."""
    name = '_review_lint_slice_sms_baseline'
    path = Path(__file__).resolve().parent.parent / 'sms_baseline' / 'rules.py'
    module = sys.modules.get(name)
    if module is None or Path(getattr(module, '__file__', '') or '/nonexistent').resolve() != path.resolve():
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[name] = module
        spec.loader.exec_module(module)
    return module


def _toolpack_module(stem):
    """A shared toolpack module (toolpacks/.../tools/<stem>.py), loaded by path."""
    name = '_gcdh_' + stem
    if name in sys.modules:
        return sys.modules[name]
    for parent in Path(__file__).resolve().parents:
        path = parent / f'toolpacks/gamecube-decomp/_impl/gamecube/tools/{stem}.py'
        if path.is_file():
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
            return module
    raise RuntimeError(f'review_lint: {stem}.py not found above ' + str(Path(__file__).resolve()))


def _agent_comments():
    """The shared agent-comment vocabulary (toolpacks/.../tools/agent_comments.py)."""
    return _toolpack_module('agent_comments')


def _unit_progress():
    """The shared unit progress / class owner module (toolpacks/.../tools/unit_progress.py)."""
    return _toolpack_module('unit_progress')


def _steering_shapes():
    """The shared steering shape classifier (toolpacks/.../tools/steering_shapes.py)."""
    return _toolpack_module('steering_shapes')


base = _baseline()
agent_comments = _agent_comments()
steering_shapes = _steering_shapes()
clean, partial, VENDOR_PATHS = base.clean, base.partial, base.VENDOR_PATHS
GAME_SOURCES = ['src/*.cpp', 'src/*.c']
# Steering gate (objectives/sms-real-codegen/plan.md): a same-behaviour rewrite
# that moves codegen is a probe for the real construct, never the fix.
STEERING_PROBE = (' This edit is a steering probe: it shows what codegen the original needs, not the fix.'
                  ' Run `steering_check.py check`, read its hypotheses, find the real construct with'
                  ' `real_code_evidence`, write that, and remove the steering edit.')
SYMBOLS_PATH = 'config/GMSJ01/symbols.txt'
SPLITS_PATH = 'config/GMSJ01/splits.txt'
MARKER = re.compile(r'(?://|/\*).*\b(?:fabricated|fake(?:match)?|TODO)\b', re.I)
FILE_SCOPE_CLASS = re.compile(r'^(?:class|struct)\s+(?P<name>[A-Za-z_]\w*)\s*(?::|\{|$)')
MAP_LINE = re.compile(r'^(?P<name>[^\s=@]+)\s*=\s*\.(?P<section>\w+):0x(?P<address>[0-9A-Fa-f]+);')
SPLIT_UNIT = re.compile(r'^(?P<unit>\S.*?):\s*$')
SPLIT_RANGE = re.compile(r'^\s+\.(?P<section>\w+)\s+start:0x(?P<start>[0-9A-Fa-f]+)\s+end:0x(?P<end>[0-9A-Fa-f]+)')

PCH_HEADERS = {'SYSTEM_DUMMY_STRINGS_HPP': 'System/DummyStrings.hpp', 'M3DUTIL_INFECTIOUS_STRINGS_HPP': 'M3DUtil/InfectiousStrings.hpp'}
PCH_NAMES = {'dummyMactorStringValue1': 'System/DummyStrings.hpp', 'SMS_NO_MEMORY_MESSAGE': 'System/DummyStrings.hpp', 'MtxCalcTypeName': 'M3DUtil/InfectiousStrings.hpp'}
PCH_LITERALS = {
    '"\\0\\0\\0\\0\\0\\0\\0\\0\\0\\0\\0"': 'System/DummyStrings.hpp',
    '"メモリが足りません\\n"': 'System/DummyStrings.hpp',
    '"MActorMtxCalcType_Basic クラシックスケールＯＮ"': 'M3DUtil/InfectiousStrings.hpp',
    '"MActorMtxCalcType_Softimage クラシックスケールＯＦＦ"': 'M3DUtil/InfectiousStrings.hpp',
    '"MActorMtxCalcType_MotionBlend モーションブレンド"': 'M3DUtil/InfectiousStrings.hpp',
    '"MActorMtxCalcType_User ユーザー定義"': 'M3DUtil/InfectiousStrings.hpp',
}
STRING_LITERAL = re.compile(r'"(?:\\.|[^"\\])*"')
CHAR_DEFINITION = re.compile(r'^(?:static\s+)?(?:const\s+)?char\s*(?:\*|\s)\s*(?:const\s+)?(?P<name>[A-Za-z_]\w*)\s*(?:\[[^\]]*\])?\s*=')
GUARD_PREDEFINE = re.compile(r'^\s*#\s*define\s+(?P<guard>SYSTEM_DUMMY_STRINGS_HPP|M3DUTIL_INFECTIOUS_STRINGS_HPP)\b')

PRAGMA = re.compile(r'^\s*#\s*pragma\s+(?P<name>dont_inline|inline_depth|force_active)\b\s*(?P<arg>[^\s/]*)')
STATIC_INLINE = re.compile(r'^\s*(?:static\s+inline|inline\s+static)\b(?P<rest>.*)$')
FUNCTION_NAME_BEFORE_PAREN = re.compile(r'(?P<name>[A-Za-z_]\w*)\s*\(')
MIN_DUPLICATE_STATEMENTS = 6
NON_STATEMENT = re.compile(r'^\s*(?:static\b|virtual\b|public:|private:|protected:|#|class\b|struct\b|enum\b|typedef\b|template\b|extern\b|inline\b)')

INTRINSICS = {'__fabsf': 'fabsf', '__fabs': 'fabs', '__frsqrte': 'sqrtf/sqrt (math.h inline)', '__fres': 'a plain division or sqrtf (math.h inline)', '__fsqrt': 'sqrt', '__fsqrts': 'sqrtf', '__fnabs': '-fabs', '__abs': 'abs', '__labs': 'labs', '__fsel': 'a conditional expression', '__fmadd': 'ordinary arithmetic', '__fmadds': 'ordinary arithmetic', '__fmsub': 'ordinary arithmetic', '__fmsubs': 'ordinary arithmetic', '__fnmadd': 'ordinary arithmetic', '__fnmsub': 'ordinary arithmetic', '__frsp': 'a float cast'}
INTRINSIC_CALL = re.compile(r'(?<![\w.>])(?P<name>__[a-z]\w*)\s*\(')
DUMMY_VEC = re.compile(r'^\s*static\s+void\s+dummy\s*\(\s*Vec\s*\*\s*\w*')
DUMMY_VEC_COMMENT = re.compile(r'//\s*dummy:\s*emits\s+\S')


def is_game_source(path):
    return bool(path) and any(fnmatch(path, p) for p in GAME_SOURCES) and not any(fnmatch(path, p) for p in VENDOR_PATHS)


def post_lines_map(hunk):
    """{line: text} for every post-image line the hunk (or post file) exposes."""
    full = hunk.get('post_file_text')
    if isinstance(full, str):
        return {index + 1: text for index, text in enumerate(full.split('\n'))}
    lines = {number: text for number, text, _ in hunk.get('post_lines', [])}
    lines.update({number: text for number, text in hunk.get('added', [])})
    return lines


def has_marker(lines, number, above=2):
    return any(MARKER.search(lines.get(number - offset, '')) for offset in range(0, above + 1))


def full_finding(rule, path, line, excerpt, message, severity=None, **detail):
    finding = {'file': path, 'line': line, 'excerpt': excerpt.strip()[:240], 'rule_id': rule['rule_id'], 'standard_id': rule['standard_id'], 'severity': severity or rule['severity'], 'message': message}
    if detail:
        finding['detail'] = detail
    return finding


# --- sms_local_class_needs_owner ------------------------------------------

def parse_symbols(repo):
    symbols = {}
    path = Path(repo) / SYMBOLS_PATH
    if not path.is_file():
        return symbols
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        match = MAP_LINE.match(line)
        if match:
            symbols[match['name']] = (match['section'], int(match['address'], 16))
    return symbols


def parse_splits(repo):
    units, current = {}, None
    path = Path(repo) / SPLITS_PATH
    if not path.is_file():
        return units
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        unit = SPLIT_UNIT.match(line)
        if unit and not line.startswith(('\t', ' ')):
            current = unit['unit'] if unit['unit'] != 'Sections' else None
            if current:
                units.setdefault(current, [])
            continue
        span = SPLIT_RANGE.match(line)
        if span and current:
            units[current].append((span['section'], int(span['start'], 16), int(span['end'], 16)))
    return units


def unit_for_address(units, address):
    for unit, spans in units.items():
        if any(start <= address < end for _, start, end in spans):
            return unit
    return None


def class_symbols(symbols, name):
    prefixes = tuple(f'{kind}{len(name)}{name}' for kind in ('__vt__', '__dt__', '__ct__'))
    return {symbol: location for symbol, location in symbols.items() if symbol.startswith(prefixes)}


_HEADER_CACHE = {}


def header_text(repo):
    root = Path(repo) / 'include'
    key = str(root)
    if key not in _HEADER_CACHE:
        parts = []
        if root.is_dir():
            for path in sorted(root.rglob('*')):
                if path.suffix in ('.h', '.hpp') and path.is_file():
                    parts.append(path.read_text(encoding='utf-8', errors='replace'))
        _HEADER_CACHE.clear()
        _HEADER_CACHE[key] = '\n'.join(parts)
    return _HEADER_CACHE[key]


def header_declares(repo, name):
    return re.search(r'\b(?:class|struct)\s+' + re.escape(name) + r'\b', header_text(repo)) is not None


def check_local_class_owner(findings, repo, mode, file_diffs, merge_base):
    rule = next(r for r in RULES if r['rule_id'] == 'sms_local_class_needs_owner')
    symbols = units = None
    for record in file_diffs:
        path = record['file']
        if not is_game_source(path) or not path.endswith('.cpp'):
            continue
        for hunk in record['hunks']:
            for number, text in hunk['added']:
                match = FILE_SCOPE_CLASS.match(clean(text))
                if not match or header_declares(repo, match['name']):
                    continue
                name = match['name']
                if symbols is None:
                    symbols, units = parse_symbols(repo), parse_splits(repo)
                owned = class_symbols(symbols, name)
                this_unit = path[len('src/'):] if path.startswith('src/') else path
                inside = {s: loc for s, loc in owned.items() if unit_for_address({this_unit: units.get(this_unit, [])}, loc[1])}
                if inside:
                    findings.append(full_finding(rule, path, number, text, f'class {name} has no header declaration; the map places its symbols in this unit ({", ".join(sorted(inside))}). Move the declaration to include/ (the header for this unit), with no marker comment.', severity='warning', class_name=name, symbols=sorted(inside), requires_human_review=True))
                elif owned:
                    owners = sorted({unit_for_address(units, loc[1]) or '<no unit>' for loc in owned.values()})
                    findings.append(full_finding(rule, path, number, text, f'class {name} belongs to {", ".join(owners)} per {SYMBOLS_PATH} ({", ".join(sorted(owned))}); do not define it in {path}.', class_name=name, owner_units=owners, symbols=sorted(owned)))
                else:
                    findings.append(full_finding(rule, path, number, text, f'class {name} has no header declaration and no map symbol; move it to include/ with evidence for its shape (map, sibling decomp), with no marker comment.', severity='warning', class_name=name, requires_human_review=True))
    return findings


# --- sms_pch_string_convention --------------------------------------------

def check_pch_strings(hunk):
    findings = []
    if not is_game_source(hunk.get('file')):
        return findings
    for number, text in hunk.get('added', []):
        guard = GUARD_PREDEFINE.match(text)
        if guard:
            findings.append(partial(number, text, f'Predefining the {PCH_HEADERS[guard["guard"]]} guard suppresses the PCH header; include the header instead of overriding it.', guard=guard['guard'], header=PCH_HEADERS[guard['guard']]))
            continue
        definition = CHAR_DEFINITION.match(clean(text).replace('\n', ' '))
        if not definition:
            continue
        name = definition['name']
        literals = [lit for lit in STRING_LITERAL.findall(text) if lit in PCH_LITERALS]
        header = PCH_NAMES.get(name) or (PCH_LITERALS[literals[0]] if literals else None)
        if header:
            findings.append(partial(number, text, f'{name} duplicates the PCH dummy-string convention; include <{header}> instead of redefining it.', name=name, header=header))
    return findings


# --- sms_fabricated_marker --------------------------------------------------

_PENDING_INLINE = {}


def static_inline_name(lines, number):
    match = STATIC_INLINE.match(lines.get(number, ''))
    if not match:
        return None
    for candidate in (match['rest'], lines.get(number + 1, '')):
        cleaned = clean(candidate)
        found = FUNCTION_NAME_BEFORE_PAREN.search(cleaned)
        if found:
            return found['name']
    return None


def call_site_count(full_text, name):
    cleaned = clean(full_text)
    return len(re.findall(r'(?<![\w.>:])' + re.escape(name) + r'\s*\(', cleaned)) - 1


NO_MARKER_EXEMPTION = ' Remove it: in SMS a // fabricated, // fake or // TODO comment does not make scaffolding acceptable. Recognize the real inline from headers, the map or a sibling decomp, or leave the function nonmatching with no comment.'


def marker_finding(number, text, lines, message, above=2, **detail):
    """A fabricated-scaffolding finding; an adjacent marker comment is recorded, never an exemption."""
    return partial(number, text, message + NO_MARKER_EXEMPTION, marker=has_marker(lines, number, above), **detail)


def check_fabricated_marker(hunk):
    findings = []
    path = hunk.get('file')
    if not is_game_source(path):
        return findings
    lines = post_lines_map(hunk)
    full = hunk.get('post_file_text')
    for number, text in hunk.get('added', []):
        pragma = PRAGMA.match(text)
        if pragma:
            if pragma['name'] == 'force_active':
                if pragma['arg'] != 'off':
                    findings.append(partial(number, text, '#pragma force_active keeps unreferenced objects alive; it is never accepted in game code. Reference the data from source or drop it.', pragma='force_active'))
            elif pragma['name'] == 'dont_inline' and pragma['arg'] == 'off':
                continue
            else:
                findings.append(marker_finding(number, text, lines, f'#pragma {pragma["name"]} steers inlining to force codegen or the frame; it is banned in SMS autonomous output.', pragma=pragma['name']))
            continue
        name = static_inline_name(lines, number) if STATIC_INLINE.match(text) else None
        if not name:
            continue
        if isinstance(full, str):
            if call_site_count(full, name) == 1:
                findings.append(marker_finding(number, text, lines, f'static inline {name} has a single call site: a fabricated helper.', helper=name, call_sites=1))
        else:
            _PENDING_INLINE.setdefault(path, []).append((number, text, name, dict(lines)))
    findings.extend(marker_blind_global_findings(hunk))
    return findings


# --- marker-blind rerun of marker-aware global rules -----------------------
# Global rules downgrade (codegen_pragma, novel_pragma) or skip
# (single_use_wrapper, the order_* helper case of discarded_expression) a
# finding when a TODO/fabricated/fake marker sits nearby. SMS ignores markers:
# the global checks re-run on a copy of the hunk with marker comments removed,
# and apply_sms_policy_to_global_findings keeps the marker-blind result.
MARKER_AWARE_GLOBAL_RULES = ('codegen_pragma', 'novel_pragma', 'single_use_wrapper', 'discarded_expression')
MARKER_TEXT = re.compile(agent_comments.AGENT_COMMENT_RE.pattern + r'|\bfake\b|@todo', re.IGNORECASE)
BLOCK_COMMENT = re.compile(r'/\*.*?\*/')
LINE_COMMENT = re.compile(r'//.*$')


def has_marker_comment(line):
    return any(MARKER_TEXT.search(text) for text in agent_comments.comment_texts(line)) or bool(re.match(r'^\s*\*', line) and MARKER_TEXT.search(line))


def strip_marker_comments(line):
    """Drop comments that carry a marker; code and other comments stay."""
    line = BLOCK_COMMENT.sub(lambda m: '' if MARKER_TEXT.search(m.group()) else m.group(), line)
    tail = LINE_COMMENT.search(line)
    if tail and MARKER_TEXT.search(tail.group()):
        line = line[:tail.start()].rstrip()
    if re.match(r'^\s*\*', line) and MARKER_TEXT.search(line):
        return ''
    return line


def marker_blind_global_findings(hunk):
    qa = sys.modules.get('_qa_rules')
    texts = [text for _, text in hunk.get('added', [])] + [text for _, text, _ in hunk.get('post_lines') or []]
    if qa is None or not any(has_marker_comment(text) for text in texts):
        return []
    full = hunk.get('post_file_text')
    stripped = {**hunk,
                'added': [(n, strip_marker_comments(t)) for n, t in hunk.get('added', [])],
                'post_lines': [(n, strip_marker_comments(t), a) for n, t, a in hunk.get('post_lines') or []],
                'post_file_text': '\n'.join(strip_marker_comments(t) for t in full.split('\n')) if isinstance(full, str) else full}
    original = dict(hunk.get('added', []))
    original.update({n: t for n, t, _ in hunk.get('post_lines') or []})
    found = []
    for rule in getattr(qa, 'RULES', []):
        if rule['rule_id'] not in MARKER_AWARE_GLOBAL_RULES or rule.get('check') is None:
            continue
        if not qa.path_matches(hunk.get('file'), rule.get('applies_to') or qa.DEFAULT_APPLIES_TO) or qa.path_excluded(hunk.get('file'), rule.get('excludes') or []):
            continue
        for item in rule['check'](stripped):
            item = dict(item)
            item.update({'rule_id': rule['rule_id'], 'standard_id': item.get('standard_id', rule.get('standard_id')),
                         'severity': item.get('severity', rule['severity']), 'surfaces': rule.get('surfaces'),
                         'detail': {**(item.get('detail') or {}), 'marker_blind': True}})
            if item['line'] in original:
                item['excerpt'] = original[item['line']].strip()
            found.append(item)
    return found


def normalized_statements(lines):
    """[(line, normalized)] for statement-like lines only."""
    result = []
    for number, text in lines:
        cleaned = clean(text).strip()
        if not cleaned or cleaned in ('{', '}', '};') or NON_STATEMENT.match(cleaned) or not re.search(r'[;{}]$', cleaned):
            continue
        if not text.startswith(('\t', ' ')):
            continue
        result.append((number, re.sub(r'\s+', ' ', cleaned)))
    return result


_HEADER_WINDOWS = {}


def header_statement_windows(repo):
    key = str(Path(repo) / 'include')
    if key in _HEADER_WINDOWS:
        return _HEADER_WINDOWS[key]
    windows = set()
    root = Path(repo) / 'include'
    if root.is_dir():
        for path in sorted(root.rglob('*.hpp')) + sorted(root.rglob('*.h')):
            rel = path.relative_to(Path(repo)).as_posix()
            if any(fnmatch(rel, p) for p in VENDOR_PATHS):
                continue
            text = path.read_text(encoding='utf-8', errors='replace')
            cleaned = clean(text)
            lines = text.split('\n')
            for open_index, close_index in base.function_spans(cleaned):
                first = cleaned[:open_index].count('\n') + 1
                last = cleaned[:close_index].count('\n') + 1
                body = [(number, lines[number - 1]) for number in range(first + 1, last) if number <= len(lines)]
                statements = [normalized for _, normalized in normalized_statements(body)]
                for index in range(len(statements) - MIN_DUPLICATE_STATEMENTS + 1):
                    windows.add(tuple(statements[index:index + MIN_DUPLICATE_STATEMENTS]))
    _HEADER_WINDOWS.clear()
    _HEADER_WINDOWS[key] = windows
    return windows


def duplicated_body_blocks(hunk, windows):
    """Yield (first_line, matched_count) for added runs duplicating a header body."""
    runs, current = [], []
    for number, text in hunk['added']:
        if current and number != current[-1][0] + 1:
            runs.append(current)
            current = []
        current.append((number, text))
    if current:
        runs.append(current)
    for run in runs:
        statements = normalized_statements(run)
        for index in range(len(statements) - MIN_DUPLICATE_STATEMENTS + 1):
            window = tuple(normalized for _, normalized in statements[index:index + MIN_DUPLICATE_STATEMENTS])
            if window in windows:
                yield statements[index][0], run
                break


def check_fabricated_marker_post(findings, repo, mode, file_diffs, merge_base):
    rule = next(r for r in RULES if r['rule_id'] == 'sms_fabricated_marker')
    windows = None
    for record in file_diffs:
        path = record['file']
        if not is_game_source(path):
            continue
        post_text = None
        for number, text, name, lines in _PENDING_INLINE.pop(path, []):
            if post_text is None:
                post_text = base.read_post_file(repo, path) or ''
            if post_text and call_site_count(post_text, name) == 1:
                found = marker_finding(number, text, lines, f'static inline {name} has a single call site: a fabricated helper.', helper=name, call_sites=1, post_text_source='repo_fallback')
                findings.append(full_finding(rule, path, number, text, found['message'], severity=found.get('severity'), **found['detail']))
        for hunk in record['hunks']:
            if len(hunk['added']) < MIN_DUPLICATE_STATEMENTS:
                continue
            if windows is None:
                windows = header_statement_windows(repo)
            if not windows:
                break
            lines = {n: t for n, t, _ in hunk.get('post_lines', [])}
            for first_line, run in duplicated_body_blocks(hunk, windows):
                found = marker_finding(first_line, lines.get(first_line, ''), lines, f'Added block of {MIN_DUPLICATE_STATEMENTS}+ statements duplicates a body from include/: call the inline instead of expanding it by hand.', above=4, kind='duplicated_inline_body')
                findings.append(full_finding(rule, path, first_line, lines.get(first_line, ''), found['message'], severity=found.get('severity'), **found['detail']))
    _PENDING_INLINE.clear()
    return findings


# --- sms_intrinsic_bypass ---------------------------------------------------

def normalized(text):
    return re.sub(r'\s+', '', clean(text))


def check_intrinsic_bypass(hunk):
    findings = []
    if not is_game_source(hunk.get('file')):
        return findings
    for number, text in hunk.get('added', []):
        cleaned = clean(text)
        for match in INTRINSIC_CALL.finditer(cleaned):
            if match['name'] in INTRINSICS:
                findings.append(partial(number, text, f'{match["name"]} bypasses the public MSL wrapper ({INTRINSICS[match["name"]]}); use the wrapper unless the binary proves the intrinsic call.', intrinsic=match['name'], wrapper=INTRINSICS[match['name']], requires_human_review=True))
    return findings


# --- sms_dummy_vec_helper ---------------------------------------------------

def check_dummy_vec_helper(hunk):
    findings = []
    if not is_game_source(hunk.get('file')):
        return findings
    lines = post_lines_map(hunk)
    for number, text in hunk.get('added', []):
        if not DUMMY_VEC.match(text):
            continue
        if any(DUMMY_VEC_COMMENT.search(lines.get(number + offset, '')) for offset in (-1, 0, 1)):
            continue
        findings.append(partial(number, text, 'static void dummy(Vec*) is accepted only as the upstream .rodata emission idiom: add "// dummy: emits <symbols>" on the adjacent line naming the anonymous objects it produces.', requires_human_review=True))
    return findings


# --- sms_agent_comment ------------------------------------------------------
# Vocabulary shared with `stack_check.py strip-comments` via agent_comments.py.

def comment_texts_by_line(rows):
    """{number: [comment text]} for rows [(number, text, added)], following /* */ across lines."""
    result, in_block, previous = {}, False, None
    for number, text, _ in rows:
        if previous is not None and number != previous + 1:
            in_block = False
        previous = number
        texts, line = [], text
        if in_block:
            end = line.find('*/')
            if end < 0:
                texts.append(line)
                line = ''
            else:
                texts.append(line[:end])
                line = line[end + 2:]
                in_block = False
        texts.extend(agent_comments.comment_texts(line))
        opener = line.rfind('/*')
        if opener >= 0 and line.find('*/', opener) < 0 and '//' not in line[:opener]:
            in_block = True
            texts.append(line[opener + 2:])
        result[number] = texts
    return result


def comment_key(text):
    return re.sub(r'\s+', ' ', text).strip().lower()


def check_agent_comment(hunk):
    path = hunk.get('file') or ''
    if any(fnmatch(path, p) for p in VENDOR_PATHS):
        return []
    added = hunk.get('added', [])
    rows = hunk.get('post_lines') or [(number, text, True) for number, text in added]
    texts = comment_texts_by_line(rows)
    # A comment the hunk only carries over (the removed side already had it)
    # is upstream text, not an agent note.
    carried = {comment_key(t) for line in hunk.get('removed', []) for t in agent_comments.comment_texts(line)}
    findings = []
    for number, text in added:
        hits = [t for t in texts.get(number, agent_comments.comment_texts(text)) if agent_comments.is_agent_comment_text(t) and comment_key(t) not in carried]
        if hits:
            findings.append(partial(number, text, f'Agent-written comment in SMS source ("{hits[0].strip()[:80]}"). SMS maintainers reject TODO, nonmatching, fakematch, fabricated, frame or stack notes and objdiff notes: they are useless and go out of date. Delete the comment; a nonmatching function stays nonmatching without a note.', comment=hits[0].strip()[:120]))
    return findings


# --- sms_accessor_evidence --------------------------------------------------
# Generalizes the old getUnkNN()/unkNN flip: any direct member access swapped
# for a no-argument accessor (or back), any call routed through an extra
# inline (`a()` -> `b()->a()`, or back), and any new inline body in a game
# header. Text cannot tell a real accessor from a fabricated one, so these go
# to llm_review asking for evidence that the accessor exists in the original.
# The swap detector lives in steering_shapes.py (shared with the steering gate).
TOKEN = steering_shapes.TOKEN
accessor_swap = steering_shapes.accessor_swap
member_like = steering_shapes.member_like
field_name = steering_shapes.field_name
HEADER_INLINE = re.compile(r'^\s*(?:(?:static|inline|virtual|explicit|friend)\s+)*(?:[A-Za-z_][\w:<>,*&\s]*?[\s*&])?(?P<name>~?[A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?(?P<brace>\{)?\s*(?:.*\})?\s*$')
NOT_FUNCTIONS = {'if', 'for', 'while', 'switch', 'return', 'sizeof', 'do', 'else', 'case', 'catch'}
EVIDENCE_REQUEST = ' Keep it only with evidence that this accessor or inline exists in the original source: an upstream header, the symbol map (mario.MAP / symbols.txt) or a sibling decomp that uses it at this call site. A frame-size, stack-layout or match-percent gain is not evidence; without evidence revert to the upstream expression.' + STEERING_PROBE


def statements(rows):
    """[(first line, tokens)] joining lines until a statement ends (clang-format reflows)."""
    result, tokens, start = [], [], None
    for number, text in rows:
        cleaned = clean(text).strip()
        line_tokens = TOKEN.findall(cleaned)
        if line_tokens and start is None:
            start = number
        tokens.extend(line_tokens)
        if tokens and (not cleaned or cleaned.startswith('#') or cleaned[-1] in ';{}:'):
            result.append((start, tokens))
            tokens, start = [], None
    if tokens:
        result.append((start, tokens))
    return result


def new_header_inlines(hunk):
    path = hunk.get('file') or ''
    if not fnmatch(path, 'include/**'):
        return []
    removed = clean('\n'.join(hunk.get('removed', [])))
    added = hunk.get('added', [])
    following = {number: text for number, text in added}
    following.update({number: text for number, text, _ in hunk.get('post_lines') or []})
    findings = []
    for number, text in added:
        cleaned = clean(text)
        match = HEADER_INLINE.match(cleaned)
        if not match or cleaned.lstrip().startswith('#') or match['name'].lstrip('~') in NOT_FUNCTIONS:
            continue
        if not match['brace'] and not clean(following.get(number + 1, '')).strip().startswith('{'):
            continue
        if re.search(r'\b' + re.escape(match['name']) + r'\s*\(', removed):
            continue  # an existing inline was edited, not introduced
        findings.append(partial(number, text, f'New inline body {match["name"]}() in a game header.' + EVIDENCE_REQUEST, flip='new_header_inline', name=match['name'], requires_human_review=True))
    return findings


def check_accessor_evidence(hunk):
    path = hunk.get('file') or ''
    if any(fnmatch(path, p) for p in VENDOR_PATHS):
        return []
    removed = [tokens for _, tokens in statements(list(enumerate(hunk.get('removed', []), 1)))]
    added_text = dict(hunk.get('added', []))
    findings = []
    for number, new in statements(hunk.get('added', [])):
        text = added_text.get(number, '')
        if any(new == old for old in removed):
            continue
        for old in removed:
            swap = accessor_swap(old, new)
            if swap:
                kind, before, after = swap
                label = {'field_to_accessor': f'Member access `{before}` replaced by accessor `{after}`', 'accessor_to_field': f'Accessor `{before}` replaced by member access `{after}`', 'inline_hop_added': f'Call routed through an extra inline `{after.strip("->.")}`', 'inline_hop_removed': f'Inline hop `{before.strip("->.")}` removed from a call'}[kind]
                findings.append(partial(number, text, f'{label} with no other change to the statement.' + EVIDENCE_REQUEST, flip=kind, before=before, after=after, requires_human_review=True))
                break
    return findings + new_header_inlines(hunk)


# --- sms_single_use_temp / sms_form_rewrite / sms_codegen_directive ------------
# Steering shapes (steering_shapes.py, plan section 2.2/4): a temp or alias that
# only re-spells an expression, a same-behaviour rewrite of a statement, and an
# added codegen directive. The first two are llm_review warnings asking whether
# the added code behaves differently from the removed code; directives are
# errors. The edit group is the hunk widened to whole statements, from the
# pre/post file texts when the scanner has them, else from the hunk context.
STEERING_SOURCES = ['src/*.cpp', 'src/*.c', 'include/**']
FORM_LABELS = {
    'ternary_if': 'if/else and ?: (or an early return) swapped',
    'statement_permutation': 'statements reordered',
    'decl_reorder': 'declarations moved or split from their initializer',
    'type_spelling': 'type spelled differently (same canonical type)',
    'float_form': 'arithmetic or literal rewritten with the same value',
    'compound_assign_split': 'compound assignment split or joined',
    'bool_form': 'boolean test spelled differently',
}
_STEERING_GROUPS = {}
_STEERING_REPORTED = set()


def _steering_typedefs():
    if 'typedefs' not in _STEERING_GROUPS:
        roots = [Path(p) for p in (os.environ.get('ORCH_GAME_REPO_ROOT'), os.environ.get('ORCH_GAME_HOST_REPO_ROOT')) if p]
        table = None
        for root in roots:
            if (root / 'include').is_dir():
                table = steering_shapes.load_typedefs(root)
                break
        _STEERING_GROUPS['typedefs'] = table
    return _STEERING_GROUPS['typedefs']


def steering_groups(hunk):
    """[(group, line_numbers)] for the hunk: line_numbers maps 1-based indices of
    group['added'] to post-file line numbers (None for lines outside the post file)."""
    added_numbers = [number for number, _ in hunk.get('added', [])]
    pre, post = hunk.get('pre_file_text'), hunk.get('post_file_text')
    if isinstance(pre, str) and isinstance(post, str) and added_numbers:
        key = (hunk.get('file'), hash(pre), hash(post))
        groups = _STEERING_GROUPS.get(key)
        if groups is None:
            groups = steering_shapes.statement_groups(pre, post)
            _STEERING_GROUPS[key] = groups
        low, high = min(added_numbers), max(added_numbers)
        result = []
        for group in groups:
            if group['cand_start'] <= high and group['cand_end'] >= low:
                result.append((group, [group['cand_start'] + i for i in range(len(group['added']))]))
        if result:
            return result
    rows = hunk.get('post_lines') or [(number, text, True) for number, text in hunk.get('added', [])]
    added_rows = [i for i, row in enumerate(rows) if row[2]]
    if not added_rows and not hunk.get('removed'):
        return []
    first = added_rows[0] if added_rows else len(rows)
    last = added_rows[-1] if added_rows else len(rows) - 1
    lead = [text for _, text, _ in rows[:first]]
    trail = [text for _, text, _ in rows[last + 1:]]
    middle = rows[first:last + 1]
    group = {'removed': lead + list(hunk.get('removed', [])) + trail,
             'added': lead + [text for _, text, _ in middle] + trail}
    numbers = [number for number, _, _ in rows[:first]] + [number for number, _, _ in middle] + [number for number, _, _ in rows[last + 1:]]
    return [(group, numbers)]


def steering_findings(hunk, shapes):
    """[(post line, shape finding)] for the given shapes, once per scan."""
    path = hunk.get('file') or ''
    if any(fnmatch(path, p) for p in VENDOR_PATHS):
        return []
    added = {number for number, _ in hunk.get('added', [])}
    if not added:
        return []
    result = []
    for group, numbers in steering_groups(hunk):
        try:
            found = steering_shapes.classify_group(group['removed'], group['added'], typedefs=_steering_typedefs())
        except Exception:  # a classifier failure must never break the scan
            continue
        for item in found['details']['findings']:
            if item['shape'] not in shapes:
                continue
            line = numbers[item['line'] - 1] if item.get('line') and item['line'] <= len(numbers) else None
            if line not in added:
                in_group = sorted(n for n in numbers if n in added)
                line = in_group[0] if in_group else min(added)
            key = (path, line, item['shape'], item.get('before'), item.get('after'))
            if key in _STEERING_REPORTED:
                continue
            _STEERING_REPORTED.add(key)
            result.append((line, item))
    return result


def _excerpt(hunk, line):
    return dict(hunk.get('added', [])).get(line, '')


def check_single_use_temp(hunk):
    findings = []
    for line, item in steering_findings(hunk, {'temp_alias'}):
        name, before = item.get('name'), (item.get('before') or '')[:120]
        if item.get('direction') == 'inlined':
            what = f'Upstream local `{name}` folded back into its use (`{before}`)'
        else:
            what = f'Local `{name}` only re-spells `{before}` ({item.get("uses", 1)} use{"" if item.get("uses", 1) == 1 else "s"})'
        findings.append(partial(line, _excerpt(hunk, line), what + ': same behaviour, different codegen.' + STEERING_PROBE,
                                llm_question='behaviour_change', shape='temp_alias', name=name, direction=item.get('direction'),
                                before=item.get('before'), after=item.get('after')))
    return findings


def check_form_rewrite(hunk):
    findings = []
    for line, item in steering_findings(hunk, set(FORM_LABELS)):
        label = FORM_LABELS[item['shape']]
        findings.append(partial(line, _excerpt(hunk, line), f'Same-behaviour rewrite ({label}): `{(item.get("before") or "")[:100]}` -> `{(item.get("after") or "")[:100]}`.' + STEERING_PROBE,
                                llm_question='behaviour_change', shape=item['shape'], before=item.get('before'), after=item.get('after')))
    return findings


def check_codegen_directive(hunk):
    path = hunk.get('file') or ''
    if any(fnmatch(path, p) for p in VENDOR_PATHS):
        return []
    added = hunk.get('added', [])
    findings = []
    for item in steering_shapes.codegen_directives([text for _, text in added], hunk.get('removed', [])):
        if re.match(r'#pragma\s+(?:pop\b|\w+\s+(?:off|reset)\b)', item['detail']):
            continue  # the closer of a pragma pair; the opener carries the finding
        number, text = added[item['line'] - 1]
        findings.append(partial(number, text, f'Added `{item["detail"]}` is a codegen directive: SMS source does not add volatile, register or #pragma to steer the compiler. Remove it; leave the function nonmatching if clean source does not match.' + STEERING_PROBE,
                                shape='codegen_directive', directive=item['detail']))
    return findings


# Rules that already reject a directive on the same line with a more specific
# message; sms_codegen_directive only covers what none of them reports.
DIRECTIVE_OWNERS = {'volatile_local_tactic', 'register_keyword', 'inline_asm', 'novel_pragma', 'codegen_pragma',
                    'sms_dummy_stack_padding', 'sms_fabricated_marker', 'sms_alignment_trick', 'sms_pad_stack_macro'}


def drop_owned_directives(findings, repo, mode, file_diffs, merge_base):
    """Post-scan: one error per directive line (the more specific rule wins)."""
    owned = {(f.get('file'), f.get('line')) for f in findings if f.get('rule_id') in DIRECTIVE_OWNERS and f.get('severity') == 'error'}
    return [f for f in findings if not (f.get('rule_id') == 'sms_codegen_directive' and (f.get('file'), f.get('line')) in owned)]


# --- sms_invented_helper ------------------------------------------------------
# D1 (user decision 2026-10-13, objectives/sms-pr189-split/d1d2-worker-brief.md):
# a function definition the diff adds is an invented helper when its name is
# not declared in the pre-change file, not declared in the pre-change text of
# the headers it includes (or its own header, or, for Class::name, the class
# body anywhere in include/), and not named by symbols.txt or mario.MAP. It is
# rejected even when it gains codegen: restore the upstream call sites and
# leave the function nonmatching. Without a symbols.txt (no map evidence) the
# rule emits nothing. Map evidence comes from ORCH_GAME_REPO_ROOT, then --repo.
INVENTED_SOURCES = ['src/*.cpp', 'src/*.c', 'include/**']
INCLUDE = re.compile(r'^\s*#\s*include\s*[<"](?P<path>[^>"]+)[>"]', re.M)
SCOPE_BLOCK = re.compile(r'\b(?P<kind>class|struct|union|namespace)\s+(?P<name>[A-Za-z_]\w*)\b[^;{}()]*$')
NON_DECLARING_WORDS = {'return', 'else', 'case', 'new', 'delete', 'throw', 'goto', 'do', 'sizeof', 'typeid', 'co_return', 'if', 'while', 'for', 'switch'}
HEADER_WINDOW = 1500  # characters of declaration text before a body worth parsing
CONTROL_WORDS = {'if', 'for', 'while', 'switch', 'catch', 'sizeof', 'return', 'else', 'do'}
_INVENTED_PENDING = {}
_HEADER_CORPUS = {}
_GIT_BLOBS = {}
_TREE_GREP = {}


def is_lint_path(path):
    return bool(path) and any(fnmatch(path, p) for p in INVENTED_SOURCES) and not any(fnmatch(path, p) for p in VENDOR_PATHS)


def collect_invented_helper_context(hunk):
    """Per hunk: remember the file's texts; check_invented_helper_post needs repo and merge_base."""
    path = hunk.get('file')
    if is_lint_path(path):
        entry = _INVENTED_PENDING.setdefault(path, {'post': hunk.get('post_file_text'), 'pre': hunk.get('pre_file_text'), 'hunks': []})
        entry['hunks'].append(hunk)
    return []


def reconstruct_pre(post_text, hunks):
    """Pre-change text from the post text: drop added lines, put removed lines back at their hunk."""
    lines = post_text.split('\n')
    added = {number for hunk in hunks for number, _ in hunk.get('added', [])}
    inserts = {}
    for hunk in hunks:
        if not hunk.get('removed'):
            continue
        anchor = hunk['added'][0][0] if hunk.get('added') else (hunk['post_lines'][-1][0] + 1 if hunk.get('post_lines') else len(lines) + 1)
        inserts.setdefault(anchor, []).extend(hunk['removed'])
    out = []
    for number, text in enumerate(lines, 1):
        out.extend(inserts.pop(number, []))
        if number not in added:
            out.append(text)
    for rest in inserts.values():
        out.extend(rest)
    return '\n'.join(out)


def sparse_post_text(hunks):
    rows = {number: text for hunk in hunks for number, text, _ in hunk.get('post_lines', [])}
    rows.update({number: text for hunk in hunks for number, text in hunk.get('added', [])})
    return '\n'.join(rows.get(number, '') for number in range(1, max(rows, default=0) + 1))


def git_blob(repo, ref, rel_path):
    key = (str(repo), ref, rel_path)
    if key not in _GIT_BLOBS:
        result = subprocess.run(['git', '-C', str(repo), 'show', f'{ref}:{rel_path}'], capture_output=True, text=True, errors='replace')
        _GIT_BLOBS[key] = result.stdout if result.returncode == 0 else None
    return _GIT_BLOBS[key]


class PreTexts:
    """Pre-change text of any repo file: merge-base blob, the scanned hunks, or the worktree."""

    def __init__(self, repo, file_diffs, merge_base, pending):
        self.repo, self.merge_base, self.pending = Path(repo), merge_base, pending
        self.diffed = {record['file']: record['hunks'] for record in file_diffs}
        self.cache = {}

    def get(self, rel_path):
        if rel_path in self.cache:
            return self.cache[rel_path]
        text = None
        entry = self.pending.get(rel_path)
        if entry and isinstance(entry.get('pre'), str):
            text = entry['pre']
        elif self.merge_base:
            text = git_blob(self.repo, self.merge_base, rel_path)
        else:
            path = self.repo / rel_path
            text = path.read_text(encoding='utf-8', errors='replace') if path.is_file() else None
            if text is not None and rel_path in self.diffed:
                text = reconstruct_pre(text, self.diffed[rel_path])
        self.cache[rel_path] = text
        return text

    def exists(self, rel_path):
        return (self.repo / rel_path).is_file() or (self.merge_base is not None and self.get(rel_path) is not None)

    def tree_declarations(self, name):
        """[(path, cleaned line)] declaring-candidate lines for name anywhere in src/ and include/:
        `git grep` at the merge base, else over the files on disk minus the diffed ones."""
        key = (str(self.repo), self.merge_base, name)
        if key not in _TREE_GREP:
            if self.merge_base:
                command = ['git', '-C', str(self.repo), 'grep', '-I', '-n', '-w', '-e', name, self.merge_base, '--', 'src', 'include']
            else:
                command = ['git', '-C', str(self.repo), 'grep', '--no-index', '-I', '-n', '-w', '-e', name, '--', 'src', 'include']
            try:
                result = subprocess.run(command, capture_output=True, text=True, errors='replace', timeout=60)
            except (OSError, subprocess.SubprocessError):
                result = None
            rows = []
            for line in (result.stdout.splitlines() if result is not None and result.returncode == 0 else []):
                if self.merge_base and line.startswith(self.merge_base + ':'):
                    line = line[len(self.merge_base) + 1:]
                parts = line.split(':', 2)
                if len(parts) == 3 and (self.merge_base or parts[0] not in self.diffed):
                    rows.append((parts[0], clean(parts[2])))
            _TREE_GREP[key] = rows
        return _TREE_GREP[key]

    def corpus(self):
        """Cleaned pre-change text of every header under include/."""
        key = (str(self.repo), self.merge_base)
        if key not in _HEADER_CORPUS:
            names = []
            if self.merge_base:
                listed = subprocess.run(['git', '-C', str(self.repo), 'ls-tree', '-r', '--name-only', self.merge_base, '--', 'include'], capture_output=True, text=True)
                names = [name for name in listed.stdout.splitlines() if name.endswith(('.h', '.hpp'))] if listed.returncode == 0 else []
            if not names and (self.repo / 'include').is_dir():
                names = sorted(path.relative_to(self.repo).as_posix() for path in (self.repo / 'include').rglob('*') if path.suffix in ('.h', '.hpp') and path.is_file())
            texts = []
            if self.merge_base and names:
                batch = subprocess.run(['git', '-C', str(self.repo), 'cat-file', '--batch'], input=''.join(f'{self.merge_base}:{name}\n' for name in names).encode(), capture_output=True)
                data, offset = batch.stdout, 0
                while offset < len(data):
                    end = data.find(b'\n', offset)
                    header = data[offset:end].split()
                    offset = end + 1
                    if len(header) == 3 and header[1] == b'blob':
                        size = int(header[2])
                        texts.append(data[offset:offset + size].decode('utf-8', 'replace'))
                        offset += size + 1
            else:
                texts = [self.get(name) or '' for name in names]
            _HEADER_CORPUS.clear()
            _HEADER_CORPUS[key] = clean('\n'.join(texts))
        return _HEADER_CORPUS[key]


def declares(cleaned, name, scope=None, qualified_only=False):
    """True when cleaned text declares or defines `name(`: a type-like word right
    before it (`f32 name(`, `TFoo* name(`), or `Scope::name(` when scope is given.
    qualified_only accepts only the `Scope::name(` form."""
    for match in re.finditer(r'(?<![\w.$>])(?P<qual>(?:[A-Za-z_]\w*(?:<[^<>;{}()]*>)?\s*::\s*)*)' + re.escape(name) + r'\s*\(', cleaned):
        qual = re.sub(r'<[^<>]*>|\s', '', match['qual'])
        if qual:
            if scope and qual.rstrip(':').split('::')[-1] == scope:
                return True
            continue
        if qualified_only:
            continue
        before = cleaned[max(0, match.start() - 200):match.start()].rstrip()
        word = re.search(r'([A-Za-z_]\w*)\s*(?:<[^<>;{}()]*>)?\s*[*&]*\s*$', before)
        if word and word.group(1) not in NON_DECLARING_WORDS and not re.search(r'(?:->|\.)\s*$', before[:word.start()]):
            return True
    return False


def scope_bodies(cleaned, scope):
    """Bodies of `class|struct|union|namespace scope { ... }` blocks in cleaned text."""
    for match in re.finditer(r'\b(?:class|struct|union|namespace)\s+' + re.escape(scope) + r'\b[^;{}()]*\{', cleaned):
        depth, start = 0, match.end() - 1
        for index in range(start, len(cleaned)):
            depth += (cleaned[index] == '{') - (cleaned[index] == '}')
            if depth == 0:
                yield cleaned[start:index]
                break


def enclosing_scopes(cleaned, offset):
    """Names of the class/struct/namespace blocks enclosing offset, outermost first."""
    stack = []
    for index, char in enumerate(cleaned[:offset]):
        if char == '{':
            line_start = max(cleaned.rfind(';', 0, index), cleaned.rfind('{', 0, index), cleaned.rfind('}', 0, index)) + 1
            scope = SCOPE_BLOCK.search(cleaned[line_start:index].replace('\n', ' '))
            stack.append(scope['name'] if scope and scope['kind'] != 'union' else None)
        elif char == '}' and stack:
            stack.pop()
    return [name for name in stack if name]


def matching_open(text, close_index):
    depth = 0
    for index in range(close_index, -1, -1):
        depth += (text[index] == ')') - (text[index] == '(')
        if depth == 0:
            return index
    return None


def added_definitions(post_text, added_lines):
    """[(line, name, qualifiers, enclosing scopes)] for function definitions whose name line is added."""
    cleaned = clean(post_text)
    newlines = [index for index, char in enumerate(cleaned) if char == '\n']
    result = []
    for open_index, _ in base.function_spans(cleaned):
        window = max(0, open_index - HEADER_WINDOW)
        first_line, last_line = bisect.bisect_left(newlines, window) + 1, bisect.bisect_left(newlines, open_index) + 1
        if not any(line in added_lines for line in range(first_line, last_line + 1)):
            continue  # no added line near this header: not an added definition
        head = cleaned[window:open_index].rstrip()
        head = head[:-5].rstrip() if head.endswith('const') else head
        if not head.endswith(')'):
            continue
        close = len(head) - 1
        while True:
            start = matching_open(head, close)
            if start is None:
                break
            prefix = head[:start]
            initializer = re.search(r'(?:(?<!:):(?!:)|,)\s*[A-Za-z_]\w*(?:<[^<>]*>)?\s*$', prefix)
            if initializer and re.search(r'\)\s*$', prefix[:initializer.start()]):
                close = len(prefix[:initializer.start()].rstrip()) - 1
                continue
            break
        if start is None:
            continue
        name_match = re.search(r'(?P<qual>(?:[A-Za-z_]\w*(?:<[^<>]*>)?\s*::\s*)*)(?P<name>~?[A-Za-z_]\w*)\s*$', head[:start])
        if not name_match or name_match['name'] in CONTROL_WORDS or re.fullmatch(r'[A-Z][A-Z0-9_]+', name_match['name']):
            continue
        statement_start = max(head.rfind(';', 0, name_match.start()), head.rfind('{', 0, name_match.start()), head.rfind('}', 0, name_match.start())) + 1
        before = '\n'.join(line for line in head[statement_start:name_match.start()].split('\n') if not line.strip().startswith('#')).strip()
        qualifiers = [re.sub(r'<.*', '', part.strip()) for part in name_match['qual'].split('::') if part.strip()]
        if re.search(r'\boperator\s*$', before) or (not qualifiers and not before):
            continue  # operators, macro invocations and in-class constructors
        line = cleaned.count('\n', 0, window + name_match.start('name')) + 1
        if line in added_lines:
            result.append((line, name_match['name'], qualifiers, enclosing_scopes(cleaned, window + name_match.start())))
    return result


def include_paths(texts, rel_path, pre):
    """Repo paths of the headers this file includes, its own header, and their includes (one level)."""
    found = []

    def resolve(include, from_path):
        for candidate in (f'include/{include}', f'src/{include}', (Path(from_path).parent / include).as_posix()):
            if pre.exists(candidate):
                return candidate
        return None
    for text in texts:
        for match in INCLUDE.finditer(text or ''):
            path = resolve(match['path'], rel_path)
            if path and path not in found:
                found.append(path)
    stem = Path(rel_path)
    if stem.parts and stem.parts[0] == 'src':
        own_dir = pre.repo / 'include' / Path(*stem.parts[1:-1]) if len(stem.parts) > 2 else pre.repo / 'include'
        if own_dir.is_dir():
            for candidate in own_dir.iterdir():
                if candidate.stem.lower() == stem.stem.lower() and candidate.suffix in ('.h', '.hpp'):
                    own = candidate.relative_to(pre.repo).as_posix()
                    if own not in found:
                        found.append(own)
    for header in list(found):
        for match in INCLUDE.finditer(pre.get(header) or ''):
            path = resolve(match['path'], header)
            if path and path not in found:
                found.append(path)
    return found


def invented_helper_evidence(name, qualifiers, scopes, path, pre_cleaned, pre, header_cache, index):
    """The evidence that makes this definition real, or None."""
    scope_chain = qualifiers or scopes
    if map_has(index, name, scope_chain, path):
        return 'map'
    owner = scope_chain[-1] if scope_chain else None
    if owner and name.lstrip('~') == owner:
        bare = name
    else:
        bare = name.lstrip('~')
    if declares(pre_cleaned, bare, owner) or (owner and any(declares(body, bare) for body in scope_bodies(pre_cleaned, owner))):
        return 'file'
    for header in header_cache:
        text = header_cache[header]
        if declares(text, bare, owner) or (owner and any(declares(body, bare) for body in scope_bodies(text, owner))):
            return 'header:' + header
    if qualifiers and any(declares(body, bare) for body in scope_bodies(pre.corpus(), owner)):
        return 'class_header'
    if bare == name and not (owner and bare == owner):
        # Defined or declared anywhere else in the upstream tree (e.g. a static
        # helper another unit already has). Qualified definitions need Owner::name.
        for where, text in pre.tree_declarations(bare):
            if where != path and declares(text, bare, owner, qualified_only=bool(qualifiers)):
                return 'tree:' + where
    return None


def map_has(index, name, scopes, path):
    return base.map_has_function(index, name, tuple(scopes), c_linkage=path.endswith('.c'))


def check_invented_helper_post(findings, repo, mode, file_diffs, merge_base):
    rule = next(r for r in RULES if r['rule_id'] == 'sms_invented_helper')
    pending = dict(_INVENTED_PENDING)
    _INVENTED_PENDING.clear()
    if not pending:
        return findings
    roots = [Path(root) for root in (os.environ.get('ORCH_GAME_REPO_ROOT'), str(repo)) if root]
    index = base.map_function_index(roots)
    if index is None:
        return findings  # no symbols.txt: no map evidence to judge by
    fabricated = {(f.get('file'), f.get('line')) for f in findings if f.get('rule_id') == 'sms_fabricated_marker' and (f.get('detail') or {}).get('helper')}
    pre = PreTexts(repo, file_diffs, merge_base, pending)
    for path, entry in pending.items():
        hunks = entry['hunks']
        post = entry['post'] if isinstance(entry['post'], str) else base.read_post_file(repo, path)
        if post is None:
            post = sparse_post_text(hunks)
        added = {number for hunk in hunks for number, _ in hunk.get('added', [])}
        definitions = added_definitions(post, added)
        if not definitions:
            continue
        pre_text = pre.get(path)
        if pre_text is None:
            pre_text = reconstruct_pre(post, hunks)
        pre_cleaned = clean(pre_text)
        header_cache = {header: clean(pre.get(header) or '') for header in include_paths([pre_text, post], path, pre)}
        post_lines = post.split('\n')
        for line, name, qualifiers, scopes in definitions:
            if (path, line) in fabricated or (name == 'dummy' and not qualifiers):
                continue
            if invented_helper_evidence(name, qualifiers, scopes, path, pre_cleaned, pre, header_cache, index):
                continue
            label = '::'.join(qualifiers + [name]) if qualifiers else name
            text = post_lines[line - 1] if line <= len(post_lines) else label
            findings.append(full_finding(rule, path, line, text,
                f'Invented helper {label}: the diff adds this function, but no upstream header or pre-change source declares it and symbols.txt/mario.MAP do not name it. SMS drops invented helpers even when they gain codegen. Delete it, restore the upstream code at its call sites, and leave the function nonmatching with no comment.',
                helper=label, kind='invented_helper'))
    return findings


# --- sms_unused_reconstruction ----------------------------------------------
# SMS maintainer review of doldecomp/sms #342 (2026-10-15): "UNUSED functions
# may only be reconstructed when they were inlined into other functions in the
# same TU." A hunk that gives a non-trivial body to a function mario.MAP marks
# UNUSED for that source file (stub -> body, or a new definition) is flagged for
# review: the worker keeps it only with stub-test evidence shown with the change
# (the same-TU caller that gets worse when the body is emptied). The steering
# gate's unused-test is authoritative (objectives/sms-real-codegen/unused-rule.md).
# Candidate selection is the gate's own steering_check.unused_candidates:
# exact identity through the shared signatures.py (typedefs, namespaces and
# `using` resolved from a TypeIndex of the repo at the merge base, else HEAD,
# with the changed file overlaid), preprocess.py active text, and the gate's
# trivial-stub rule. An undecidable identity is still flagged (unresolved);
# a typedef spelling can never suppress the warning. Map rows are matched by
# file name. No map: no finding.
UNUSED_SOURCES = ['src/*.cpp', 'src/*.c']
UNUSED_RULE = 'UNUSED functions may only be reconstructed when they were inlined into other functions in the same TU.'
UNUSED_TEST = 'python3 toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py unused-test --repo . --file {file} --function {function}'
MAP_UNUSED_ROW = re.compile(r'^\s*UNUSED\s+(?P<size>[0-9a-fA-F]+)\s+\.+\s+(?P<name>[^\s@]\S*)\s+(?P<lib>\S+)\s+(?P<file>\S+)\s*$')
MAP_USED_ROW = re.compile(r'^\s*[0-9a-fA-F]{8}\s+[0-9a-fA-F]+\s+[0-9a-fA-F]{8}\s+\d+\s+(?P<name>[^\s@]\S*)\s+(?P<lib>\S+)\s+(?P<file>\S+)\s*$')
_UNUSED_PENDING = {}
_MAP_TEXTS = {}


def _steering_check():
    """The steering gate (toolpacks/.../tools/steering_check.py): shared definition parsing."""
    return _toolpack_module('steering_check')


def collect_unused_context(hunk):
    """Per hunk: remember the file's texts; check_unused_reconstruction_post needs repo and merge_base."""
    path = hunk.get('file')
    if is_game_source(path):
        entry = _UNUSED_PENDING.setdefault(path, {'post': hunk.get('post_file_text'), 'pre': hunk.get('pre_file_text'), 'hunks': []})
        entry['hunks'].append(hunk)
    return []


def unused_map_text(repo, merge_base):
    """mario.MAP text: the merge-base blob when tracked there, else ORCH_GAME_REPO_ROOT, else the repo. None without a map."""
    if merge_base:
        text = git_blob(repo, merge_base, base.MAP_REL_PATH)
        if text:
            return text
    for root in (os.environ.get('ORCH_GAME_REPO_ROOT'), str(repo)):
        if not root:
            continue
        path = Path(root) / base.MAP_REL_PATH
        if path.is_file():
            key = str(path)
            if key not in _MAP_TEXTS:
                try:
                    _MAP_TEXTS[key] = path.read_text(encoding='utf-8', errors='replace')
                except OSError:
                    _MAP_TEXTS[key] = None
            if _MAP_TEXTS[key]:
                return _MAP_TEXTS[key]
    return None


def map_symbol(mangled):
    """{mangled, qualified, params} for a map row (the gate's demangled_symbol; C names: the bare name)."""
    if '__' in mangled.lstrip('_'):
        symbol = _steering_check().demangled_symbol(mangled)
        if symbol['qualified'] == mangled:
            return None  # the demangler could not read it
        return symbol
    return {'mangled': mangled, 'qualified': mangled, 'params': None, 'function': mangled}


def unused_rows_by_file(map_text, basenames):
    """{basename: [symbol dict with size]} UNUSED map rows for the given files."""
    rows = {name: [] for name in basenames}
    for line in map_text.splitlines():
        match = MAP_UNUSED_ROW.match(line) if 'UNUSED' in line else None
        if not match or match['file'] not in rows:
            continue
        symbol = map_symbol(match['name'])
        if symbol is not None:
            rows[match['file']].append({**symbol, 'size': int(match['size'], 16)})
    return rows


def _signatures():
    """The shared exact signature identity module (toolpacks/.../tools/signatures.py)."""
    return _toolpack_module('signatures')


def _preprocess():
    """The shared preprocessor branch evaluation (toolpacks/.../tools/preprocess.py)."""
    return _toolpack_module('preprocess')


def repo_type_index(repo, rev, path, post):
    """(TypeIndex, complete): the repo's types at rev with the file overlaid; complete=False when the repo
    could not be read (no git checkout), so unknown type names may be typedefs we cannot see."""
    sigs = _signatures()
    try:
        return sigs.TypeIndex.from_git(Path(repo), rev).with_texts({path: post}), True
    except Exception:
        return sigs.TypeIndex.from_texts({path: post}), False


BUILTIN_TYPE_WORDS = {'void', 'bool', 'char', 'wchar_t', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', 'const', 'volatile'}


def has_unknown_type(sig, index):
    """True when a parameter names a type the (partial) index does not know: maybe a typedef we cannot see."""
    if sig is None or sig.params is None:
        return True
    for alternatives in sig.params:
        if alternatives is None:
            return True
        for spelling in alternatives:
            names = [word for word in re.findall(r'[A-Za-z_][\w:]*', re.sub(r'<.*>', '', spelling)) if word not in BUILTIN_TYPE_WORDS]
            if any(not index.is_type(name) for name in names):
                return True
    return False


def partial_index_candidates(pre, post, symbols, reported, index, path):
    """Without the repo's types an unknown parameter spelling may be a typedef of the UNUSED signature:
    same qualified name and parameter count with a non-trivial body counts as unresolved, never as a
    different overload, so a typedef spelling cannot suppress the warning."""
    gate = _steering_check()
    pre_defs = gate.function_defs(pre)
    by_open = {sig.open: sig for sig in _signatures().source_signatures(_preprocess().active_text(post, unknown='active'), index, path)}
    out = []
    for definition in gate.function_defs(post):
        if definition.trivial or definition.open in reported or not has_unknown_type(by_open.get(definition.open), index):
            continue  # fully known types were matched exactly by the gate: a different signature is another overload
        for symbol in symbols:
            if not gate._qual_eq(definition.qualified, symbol['qualified']):
                continue
            if symbol['params'] is not None and definition.params is not None and len(symbol['params']) != len(definition.params):
                continue
            count = len(definition.params) if definition.params is not None else None
            if any(not b.trivial and gate._qual_eq(b.qualified, definition.qualified) and (b.params is None or count is None or len(b.params) == count)
                   for b in pre_defs):
                continue  # an upstream body of that name and shape already exists
            out.append({'symbol': symbol, 'def': definition,
                        'unresolved': "its parameter types cannot be resolved without the repo's headers"})
            break
    return out


def has_upstream_definition(pre, symbol, index, path):
    """True when the base text defines this symbol (exact identity), as a stub here since bodies were excluded."""
    sigs = _signatures()
    active = _preprocess().active_text(pre or '', unknown='active')
    return any(sigs.matches(sig, symbol['mangled']) for sig in sigs.source_signatures(active, index, path))


def check_unused_reconstruction_post(findings, repo, mode, file_diffs, merge_base):
    rule = next(r for r in RULES if r['rule_id'] == 'sms_unused_reconstruction')
    pending = dict(_UNUSED_PENDING)
    _UNUSED_PENDING.clear()
    if not pending:
        return findings
    map_text = unused_map_text(repo, merge_base)
    if not map_text:
        return findings  # no mario.MAP (e.g. Melee): nothing to judge by
    gate = _steering_check()
    rows_by_file = unused_rows_by_file(map_text, {Path(path).name for path in pending})
    for path, entry in sorted(pending.items()):
        symbols = rows_by_file.get(Path(path).name)
        if not symbols:
            continue
        hunks = entry['hunks']
        post = entry['post'] if isinstance(entry['post'], str) else base.read_post_file(repo, path)
        if post is None:
            post = sparse_post_text(hunks)
        added = sorted({number for hunk in hunks for number, _ in hunk.get('added', [])})
        if not added:
            continue
        pre = entry['pre'] if isinstance(entry['pre'], str) else (git_blob(repo, merge_base, path) if merge_base else None)
        if pre is None:
            pre = reconstruct_pre(post, hunks)
        index, complete = repo_type_index(repo, merge_base or 'HEAD', path, post)
        post_lines = post.split('\n')
        rows = gate.unused_candidates(pre, post, symbols, index=index, path=path)
        if not complete:
            rows += partial_index_candidates(pre, post, symbols, {row['def'].open for row in rows}, index, path)
        for row in rows:
            symbol, definition = row['symbol'], row['def']
            last_line = post.count('\n', 0, definition.close) + 1
            touched = [line for line in added if definition.line <= line <= last_line]
            if not touched:
                continue
            upstream = has_upstream_definition(pre, symbol, index, path) or (not complete and any(
                gate._qual_eq(b.qualified, symbol['qualified']) for b in gate.function_defs(pre)))
            change = 'stub_to_body' if upstream else 'new_definition'
            match = 'unresolved' if row.get('unresolved') else 'exact'
            function, size = symbol['qualified'], symbol['size']
            line = definition.line if change == 'new_definition' else touched[0]
            command = UNUSED_TEST.format(file=path, function=function)
            where = 'turns the upstream stub into a body' if upstream else 'adds a new definition with a body'
            signature = '' if match == 'exact' else f' ({row["unresolved"]}; it is treated as the UNUSED one)'
            text = post_lines[line - 1] if line <= len(post_lines) else function
            findings.append(full_finding(rule, path, line, text,
                f'{function} {where}, but mario.MAP marks it UNUSED (dead-stripped, size 0x{size:x}) in {Path(path).name}{signature}. SMS maintainer rule: "{UNUSED_RULE}" '
                f'The body is allowed only if emptying it changes another function in the target. Check with `{command}`: '
                f'if no other function changes, restore the upstream stub (or drop the new definition); if it is inlined, show that evidence with the change (the same-TU caller and its match before/after emptying); reviewers remove reconstructions that do not show it (#342). The steering gate decides.',
                function=function, mangled=symbol['mangled'], map_size=size, change=change, signature_match=match, check_command=command, llm_review=True))
    return findings


# --- sms_out_of_order_fill / sms_undecompiled_class_decl -----------------------
# SMS maintainer Mrkol closed doldecomp/sms #347/#348 unmerged (2026-10-15):
# filling MarNameRefGen factories and adding class declarations for enemy
# classes whose own units are not decompiled is "doing things out of order".
# Readiness is the shared, revision-bound readiness.py (order-scope plan v3,
# section 1), read at the merge base when there is one (else HEAD):
# - order-gated files (MarNameRefGen*.cpp) may reference (`new TX`, `TX::`,
#   `TX(`) only classes whose `construct` state is ready or shared; an added
#   #include declares nothing and is not a finding (as edit_scope);
# - declarations (class heads, members, inline bodies, out-of-class member
#   definitions; headers and .cpp files) need the class's `declare` state
#   ready or shared (implementation started in the owner unit);
# - `unresolved` (ambiguous owner, owner without source, not in the map) is a
#   finding with its reason, except a TU-local helper: a map-absent class
#   defined only in the .cpp being changed.
# Namespaces are never classes: identity is readiness's canonical class name.
# No target objects, no map or no git revision (Melee, unbuilt checkout): skip.
ORDER_DECL_PATHS = ['include/**', 'src/*.cpp', 'src/*.c']
ORDER_GATED_PATHS = list(_unit_progress().ORDER_GATED_PATHS)  # src/System/MarNameRefGen*.cpp
ORDER_QUOTE = '"Please leave MarNameRefGen alone, people will fill it in eventually when the relevant stuff is properly decompiled. This is doing things out of order"'
FENCE_QUOTE = '"don\'t jump the fence please"'
ORDER_ADVICE = ' Leave it until the class\'s own unit is decompiled.'
QUALIFIED_REFERENCE = re.compile(r'(?P<new>\bnew\s+)?(?<![\w:.>])(?P<chain>[A-Za-z_]\w*(?:\s*::\s*~?[A-Za-z_]\w*)*)(?P<call>\s*\()?')
ADDED_INCLUDE = re.compile(r'^\s*#\s*include\s*[<"](?P<path>[^>"]+)[>"]')
CLASS_HEAD = re.compile(r'^\s*(?:template\s*<[^>]*>\s*)?(?:class|struct)\s+(?P<name>[A-Za-z_]\w*)\b(?P<rest>[^;]*)$')
OUT_OF_CLASS_MEMBER = re.compile(r'^\s*(?:[A-Za-z_][\w<>,*&\s]*?[\s*&])?(?P<cls>[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)\s*::\s*~?[A-Za-z_]\w*\s*\(')
SCOPE_HEAD = re.compile(r'\b(?P<kind>class|struct|union|namespace)\s+(?P<name>[A-Za-z_]\w*)\b[^;{}()]*$')
NOT_DECLARATIONS = {'', '{', '}', '};', 'public:', 'private:', 'protected:'}
NOT_CLASS_WORDS = {'return', 'new', 'delete', 'sizeof', 'if', 'for', 'while', 'switch', 'case', 'else', 'do', 'goto', 'const', 'static', 'void'}
_ORDER_PENDING = {}


def _readiness():
    """The shared class readiness module (toolpacks/.../tools/readiness.py)."""
    return _toolpack_module('readiness')


def collect_order_context(hunk):
    """Per hunk: remember MarNameRefGen, header and source hunks; the post-scan hook needs repo and merge_base."""
    path = hunk.get('file') or ''
    if any(fnmatch(path, p) for p in VENDOR_PATHS):
        return []
    entry = _ORDER_PENDING.setdefault(path, {'post': hunk.get('post_file_text'), 'pre': hunk.get('pre_file_text'), 'hunks': []})
    if not any(seen is hunk for seen in entry['hunks']):  # both order rules collect the same hunk object
        entry['hunks'].append(hunk)
    return []


def order_readiness(repo, merge_base):
    """readiness.Readiness at the merge base (else HEAD) for ORCH_GAME_REPO_ROOT, then --repo; None when unavailable."""
    module = _readiness()
    rev = merge_base or 'HEAD'
    for root in (os.environ.get('ORCH_GAME_REPO_ROOT'), str(repo)):
        if not root or not Path(root).is_dir():
            continue
        try:
            return module.load(root, rev, policy={'gatedPaths': ORDER_GATED_PATHS}, timeout=120)
        except module.ReadinessError:
            continue
    return None


def unresolved_reason(state, readiness):
    owner, provenance = state.get('owner_unit'), state.get('provenance')
    if provenance == 'absent':
        return 'it is not a class in the link map or the target objects (identity unresolved)'
    if provenance == 'ambiguous':
        return 'its owner unit is ambiguous in the target objects (identity unresolved)'
    if owner and not readiness.source_of(owner):
        return f'its owner unit {owner} has no source file (identity unresolved)'
    return 'its readiness is unresolved'


def not_ready_reason(state, readiness, level):
    owner = state.get('owner_unit')
    source = readiness.source_of(owner) if owner else None
    rev = str(readiness.rev)[:10]
    if level == 'construct':
        return f'its constructor is not defined in its owner unit {owner} ({source}) at {rev}: the class is not ready to construct'
    return f'its owner unit {owner} ({source}) defines none of its members at {rev}: its implementation has not started'


def fill_references(cleaned, readiness):
    """[(class, how)] a MarNameRefGen line references: `new TX`, `TX::`, `TX(`. Namespaces never count:
    a qualifier counts only when readiness knows it as a class, and a known class name used as a type
    (`JDrama::TNameRef* r`) is not a reference."""
    out = []
    for match in QUALIFIED_REFERENCE.finditer(cleaned):
        parts = [part.strip() for part in match['chain'].split('::')]
        if parts[0] in NOT_CLASS_WORDS:
            continue
        chain = '::'.join(parts)
        if match['new']:
            out.append((chain, 'new'))
        elif len(parts) >= 2:
            qualifier = '::'.join(parts[:-1])
            if not match['call'] and readiness.canonical(chain):
                continue  # Namespace::Class used as a type
            if readiness.canonical(qualifier):
                out.append((qualifier, 'call' if match['call'] else 'scoped'))
        elif match['call'] and readiness.canonical(chain):
            out.append((chain, 'call'))
    return out


def out_of_order_findings(rule, path, entry, readiness, post=None):
    findings, seen = [], set()
    active_lines = _preprocess().active_text(post, unknown='active').split('\n') if isinstance(post, str) else None
    own_unit = readiness.unit_for_source(path)  # TMarNameRefGen itself lives in the file's own unit
    for hunk in entry['hunks']:
        for number, text in hunk.get('added', []):
            if ADDED_INCLUDE.match(text):
                continue  # an include declares nothing; real use is `new TX`, `TX::`, `TX(` (as edit_scope)
            if active_lines is not None and number <= len(active_lines) and not active_lines[number - 1].strip():
                continue  # inside an inactive preprocessor branch (#if 0)
            references = fill_references(clean(text), readiness)
            for name, how in references:
                state = readiness.class_state(name)
                if state['construct'] in ('ready', 'shared') or (state.get('owner_unit') and state['owner_unit'] == own_unit):
                    continue
                if (state['class'], number) in seen:
                    continue
                seen.add((state['class'], number))
                reason = not_ready_reason(state, readiness, 'construct') if state['construct'] == 'not_ready' else unresolved_reason(state, readiness)
                findings.append(full_finding(rule, path, number, text,
                    f'{path} fills in a reference to {state["class"]}, but {reason}. SMS maintainer (doldecomp/sms #347): {ORDER_QUOTE}.'
                    f' Do not fill in MarNameRefGen or other code that constructs classes whose units are not decompiled.' + ORDER_ADVICE,
                    **{'class': state['class'], 'owner_unit': state.get('owner_unit'), 'provenance': state.get('provenance'),
                       'state': state['construct'], 'reference': how, 'reason': reason, 'readiness_rev': readiness.rev}))
    return findings


def scope_entries_by_line(cleaned):
    """{line: [(kind, name) | None]} block stack at the start of every line; None marks a function or other block."""
    stacks, stack, line = {1: []}, [], 1
    for index, char in enumerate(cleaned):
        if char == '{':
            line_start = max(cleaned.rfind(';', 0, index), cleaned.rfind('{', 0, index), cleaned.rfind('}', 0, index)) + 1
            head = SCOPE_HEAD.search(cleaned[line_start:index].replace('\n', ' '))
            stack.append((head['kind'], head['name']) if head else None)
        elif char == '}' and stack:
            stack.pop()
        elif char == '\n':
            line += 1
            stacks[line] = list(stack)
    return stacks


def class_chain(entries):
    """Qualified name of the innermost class in a block stack (namespaces qualify it), or None.
    None as well inside a function body or a union."""
    if any(entry is None or entry[0] == 'union' for entry in entries):
        return None
    names = [name for kind, name in entries]
    if not any(kind in ('class', 'struct') for kind, _ in entries):
        return None
    last = max(index for index, (kind, _) in enumerate(entries) if kind in ('class', 'struct'))
    return '::'.join(names[:last + 1])


def is_namespace_scope(name, readiness, post):
    """True when a qualifier names a namespace, not a class: readiness does not know it as a class and
    it is declared `namespace X` at the readiness revision or in this file (`void JDrama::helperFn(int)`)."""
    if readiness.canonical(name):
        return False
    last = name.split('::')[-1]
    is_namespace = getattr(readiness, 'is_namespace', None)
    if is_namespace is not None and name in getattr(readiness, 'owners', {}) and is_namespace(name):
        return True
    namespaces = readiness.namespaces() if hasattr(readiness, 'namespaces') else set()
    return last in namespaces or re.search(r'\bnamespace\s+' + re.escape(last) + r'\b', post) is not None


def defined_in(text, name):
    short = name.split('::')[-1]
    return re.search(r'^\s*(?:class|struct)\s+' + re.escape(short) + r'\b[^;]*$', text, re.M) is not None


def undecompiled_decl_findings(rule, path, entry, readiness, post, new_file):
    cleaned = clean(_preprocess().active_text(post, unknown='active'))  # inactive branches (#if 0) declare nothing
    cleaned_lines = cleaned.split('\n')
    stacks = scope_entries_by_line(cleaned)
    is_source = not fnmatch(path, 'include/**')
    own_unit = readiness.unit_for_source(path) if is_source else None
    # Upstream declarations the diff moves or reflows (removed elsewhere in the file) are not additions.
    upstream = {normalized(text) for hunk in entry['hunks'] for text in hunk.get('removed', [])}
    first_line = {}
    for number, text in sorted({(n, t) for hunk in entry['hunks'] for n, t in hunk.get('added', [])}):
        line = cleaned_lines[number - 1] if number <= len(cleaned_lines) else clean(text)
        stripped = line.strip()
        if stripped in NOT_DECLARATIONS or stripped.startswith('#') or normalized(line) in upstream:
            continue
        entries = stacks.get(number, [])
        head = CLASS_HEAD.match(line)
        name = None
        if head and ('{' in head['rest'] or ':' in head['rest'].replace('::', '') or not head['rest'].strip()):
            if all(e is not None and e[0] == 'namespace' or (e is not None and e[0] in ('class', 'struct')) for e in entries):
                name = '::'.join([n for _, n in entries] + [head['name']])
        elif entries and class_chain(entries):
            name = class_chain(entries)
        elif all(e is not None and e[0] == 'namespace' for e in entries):
            member = OUT_OF_CLASS_MEMBER.match(line)
            if member and member['cls'].split('::')[0] not in NOT_CLASS_WORDS:
                qualified = '::'.join([n for _, n in entries] + [member['cls']])
                # A namespace-qualified free function is not a member of a class.
                if not (is_namespace_scope(qualified, readiness, post) or is_namespace_scope(member['cls'], readiness, post)):
                    name = qualified
        if name and name not in first_line:
            first_line[name] = (number, text)
    findings = []
    for name, (number, text) in sorted(first_line.items(), key=lambda item: item[1][0]):
        state = readiness.class_state(name)
        if not readiness.canonical(name) and '::' in name:
            # Namespace::Class or Outer::Inner: try the class name readiness knows
            for start in range(1, name.count('::') + 1):
                tail = '::'.join(name.split('::')[start:])
                if readiness.canonical(tail):
                    state = readiness.class_state(tail)
                    break
        if state['declare'] in ('ready', 'shared') or (own_unit and state.get('owner_unit') == own_unit):
            continue
        if state['declare'] == 'unresolved' and state.get('provenance') == 'absent' and is_source and defined_in(post, name):
            continue  # TU-local helper: a map-absent class defined only in this .cpp
        reason = not_ready_reason(state, readiness, 'declare') if state['declare'] == 'not_ready' else unresolved_reason(state, readiness)
        findings.append(full_finding(rule, path, number, text,
            f'{path} adds declarations for {state["class"]}, but {reason}. SMS maintainer (doldecomp/sms #347/#348): {ORDER_QUOTE}; {FENCE_QUOTE}.'
            f' Do not add a class, members or a header for a class whose own unit is not decompiled to make a caller build (forward declarations are fine).' + ORDER_ADVICE,
            **{'class': state['class'], 'owner_unit': state.get('owner_unit'), 'provenance': state.get('provenance'),
               'state': state['declare'], 'reason': reason, 'new_header': new_file, 'readiness_rev': readiness.rev}))
    return findings


def check_decompile_order_post(findings, repo, mode, file_diffs, merge_base):
    pending = dict(_ORDER_PENDING)
    _ORDER_PENDING.clear()
    if not pending:
        return findings
    readiness = order_readiness(repo, merge_base)
    if readiness is None:
        return findings  # no target objects, map or revision (Melee, unbuilt checkout): nothing to judge by
    try:
        fill_rule = next(r for r in RULES if r['rule_id'] == 'sms_out_of_order_fill')
        decl_rule = next(r for r in RULES if r['rule_id'] == 'sms_undecompiled_class_decl')
        for path, entry in sorted(pending.items()):
            hunks = entry['hunks']
            post = entry['post'] if isinstance(entry['post'], str) else base.read_post_file(repo, path)
            if post is None:
                post = sparse_post_text(hunks)
            if any(fnmatch(path, p) for p in ORDER_GATED_PATHS):
                findings.extend(out_of_order_findings(fill_rule, path, entry, readiness, post))
            if any(fnmatch(path, p) for p in ORDER_DECL_PATHS):
                pre = entry['pre'] if isinstance(entry['pre'], str) else (git_blob(repo, merge_base, path) if merge_base else None)
                new_file = pre is None and all(not hunk.get('removed') and not hunk.get('context') for hunk in hunks)
                findings.extend(undecompiled_decl_findings(decl_rule, path, entry, readiness, post, new_file))
    except _readiness().ReadinessError:
        return findings  # readiness ran out of time or met malformed data mid-scan: the gate fails closed, the lint skips
    finally:
        readiness.close()
    return findings


# --- sms_nonsense_code ------------------------------------------------------
# D2 (user decision 2026-10-13): code a human would not write, kept only because
# it steers codegen. Added lines only. Lines with an ALL_CAPS macro call and
# preprocessor lines are skipped to keep false positives low.
MACRO_CALL = re.compile(r'\b[A-Z][A-Z0-9_]{2,}\s*\(')
DOUBLE_MINUS = re.compile(r'(?<![-+])-\s+-(?![-=>])\s*[\w(.]|(?<![-+])-\s*\(\s*-(?![-=>])\s*[\w.>\-\[\]]+\s*\)')
PLAIN_ASSIGN = re.compile(r'^\s*(?P<lhs>[A-Za-z_]\w*(?:(?:->|\.)[A-Za-z_]\w*|\[[^\[\]]*\])*)\s*=(?!=)\s*(?P<rhs>.+?)\s*;\s*$')
DECL_ASSIGN = re.compile(r'^\s*(?P<quals>(?:(?:const|static|volatile|unsigned|signed)\s+)*)[A-Za-z_][\w:]*(?:\s*<[^;{}()]*>)?(?:\s*(?P<ptr>[*&]+)\s*|\s+)(?P<lhs>[A-Za-z_]\w*)\s*=(?!=)\s*(?P<rhs>[^,;]+?)\s*;\s*$')
EMPTY_BRANCH_ONE_LINE = re.compile(r'(?:\bif\s*\(.*\)|\belse)\s*\{\s*\}')
OPEN_BRANCH = re.compile(r'(?:\bif\s*\(.*\)|\belse)\s*\{$')
CASE_LABEL = re.compile(r'^\s*(?:case\s+[^:]+|default)\s*:(?!:)\s*(?P<rest>.*)$')
STATEMENT_KEYWORDS = {'return', 'case', 'default', 'goto', 'break', 'continue', 'if', 'else', 'for', 'while', 'switch', 'do', 'delete', 'throw', 'new'}
MASKS = [('<<=', '\x07\x07\x06'), ('>>=', '\x08\x08\x06'), ('::', '\x05\x05'), ('==', '\x01\x01'), ('!=', '\x02\x02'), ('<=', '\x03\x03'), ('>=', '\x04\x04')]
NONSENSE_ADVICE = ' SMS drops code a human would not write, even when it changes codegen: restore the upstream form and leave the function nonmatching with no comment.'


def squash(text):
    return re.sub(r'\s+', '', text)


def mask(text):
    for op, token in MASKS:
        text = text.replace(op, token)
    return text


def unmask(text):
    for op, token in reversed(MASKS):
        text = text.replace(token, op)
    return text


def top_level_split(text, operators):
    """Split text at depth-0 occurrences of any operator (longest first)."""
    parts, depth, start, index = [], 0, 0, 0
    ordered = sorted(operators, key=len, reverse=True)
    while index < len(text):
        char = text[index]
        if char in '([{':
            depth += 1
        elif char in ')]}':
            depth -= 1
        elif depth == 0:
            op = next((op for op in ordered if text.startswith(op, index)), None)
            if op:
                parts.append(text[start:index])
                index += len(op)
                start = index
                continue
        index += 1
    parts.append(text[start:])
    return parts


def paren_groups(text):
    """The whole text plus the inside of every parenthesis pair."""
    groups, stack = [text], []
    for index, char in enumerate(text):
        if char == '(':
            stack.append(index)
        elif char == ')' and stack:
            groups.append(text[stack.pop() + 1:index])
    return groups


def operand_duplicates(statement):
    """[(operator, operand)] for identical operands of ||, && and ==/!= in a cleaned statement."""
    found = []
    for group in paren_groups(mask(statement)):
        for piece in top_level_split(group, [';', ',', '?', ':']):
            piece = re.sub(r'^\s*(?:return|case|else|do)\b', '', piece)
            side = top_level_split(piece, ['=', '\x06'])[-1]
            for op in ('||', '&&'):
                operands = [squash(item) for item in top_level_split(side, [op])]
                seen = set()
                for operand in operands if len(operands) > 1 else []:
                    if operand and operand in seen:
                        found.append((op, unmask(operand)))
                    seen.add(operand)
            for conjunct in top_level_split(side, ['||', '&&']):
                terms = [squash(term) for term in top_level_split(conjunct, ['\x01\x01', '\x02\x02'])]
                if len(terms) == 2 and terms[0] and terms[0] == terms[1]:
                    found.append(('==' if '\x01' in conjunct else '!=', unmask(terms[0])))
    return found


def negated_inequality_conjunction(statement):
    """`!(a != b && a != c)` in a cleaned statement, or None."""
    for match in re.finditer(r'!\s*\(', statement):
        depth = 0
        for index in range(match.end() - 1, len(statement)):
            depth += (statement[index] == '(') - (statement[index] == ')')
            if depth == 0:
                inner = mask(statement[match.end():index])
                conjuncts = top_level_split(inner, ['&&'])
                if len(conjuncts) > 1 and all('||' not in c and len(top_level_split(c, ['\x02\x02'])) == 2 for c in conjuncts):
                    return statement[match.start():index + 1]
                break
    return None


def logical_statements(rows):
    """Join consecutive added rows into statements: [(first line, cleaned text, first raw text)]."""
    result, current = [], []
    for number, text in rows:
        stripped = clean(text).strip()
        if current and number != current[-1][0] + 1:
            result.append(current)
            current = []
        if not stripped or stripped.startswith('#'):
            if current:
                result.append(current)
                current = []
            continue
        current.append((number, text, stripped))
        if re.search(r'[;{}:]$', stripped) or re.fullmatch(r'else|do', stripped):
            result.append(current)
            current = []
    if current:
        result.append(current)
    return [(group[0][0], ' '.join(item[2] for item in group), group[0][1]) for group in result]


def reads(expression, name):
    return re.search(r'(?<![\w.>])' + re.escape(name) + r'\b', expression) is not None


def assignment(text):
    """(lhs, rhs, is_declaration) of a one-line single assignment, or None.
    Reference and volatile declarations are not stores to a plain local."""
    first = re.match(r'\s*([A-Za-z_]\w*)', text)
    if not first or first.group(1) in STATEMENT_KEYWORDS:
        return None
    match = PLAIN_ASSIGN.match(text)
    if match:
        return match['lhs'], match['rhs'], False
    match = DECL_ASSIGN.match(text)
    if match and '&' not in (match['ptr'] or '') and 'volatile' not in match['quals']:
        return match['lhs'], match['rhs'], True
    return None


def write_pattern(lhs):
    target = r'\s*'.join(re.escape(char) for char in squash(lhs))
    return re.compile(r'(?<![\w.>])' + target + r'\s*(?:[-+*/%&|^]|<<|>>)?=(?!=)|(?:\+\+|--)\s*' + target + r'(?!\w)|(?<![\w.>])' + target + r'\s*(?:\+\+|--)|&\s*' + target + r'(?![\w.\[]|->)')


def check_nonsense_code(hunk):
    path = hunk.get('file')
    if not is_lint_path(path):
        return []
    findings, reported = [], set()

    def report(number, text, message, severity=None, **detail):
        if (number, detail.get('kind')) in reported:
            return
        reported.add((number, detail.get('kind')))
        found = partial(number, text, message + NONSENSE_ADVICE, **detail)
        if severity:
            found['severity'] = severity
        findings.append(found)

    added = dict(hunk.get('added', []))
    if not added:
        return []
    for first, statement, raw in logical_statements(sorted(added.items())):
        if MACRO_CALL.search(statement):
            continue
        for op, operand in operand_duplicates(statement):
            report(first, raw, f'Repeated identical operand `{operand}` of `{op}`: the second test is redundant.', kind='repeated_operand', operand=operand)
            break
        if DOUBLE_MINUS.search(statement):
            report(first, raw, 'Double negation (`a - -b` or `-(-x)`): write the plain arithmetic.', kind='double_negation')
        negated = negated_inequality_conjunction(statement)
        if negated:
            report(first, raw, f'Negated conjunction of inequalities `{squash(negated)}`: write the plain equality test.', kind='negated_inequalities')
        self_assign = PLAIN_ASSIGN.match(statement)
        if self_assign and squash(self_assign['lhs']) == squash(self_assign['rhs']):
            report(first, raw, f'Self-assignment `{squash(self_assign["lhs"])} = {squash(self_assign["rhs"])};` does nothing.', kind='self_assignment')
        if EMPTY_BRANCH_ONE_LINE.search(statement):
            report(first, raw, 'Empty if/else body added.', kind='empty_branch')
    # Statement-pair patterns over the post image near the added lines.
    full = hunk.get('post_file_text')
    if isinstance(full, str):
        rows = list(enumerate(full.split('\n'), 1))
    else:
        known = {number: text for number, text, _ in hunk.get('post_lines', [])}
        known.update(added)
        rows = sorted(known.items())
    known_lines = {number for number, _ in rows}
    low, high = min(added) - 60, max(added) + 2
    statements = [(number, text, clean(text).strip()) for number, text in rows if low <= number <= high]
    statements = [row for row in statements if row[2]]

    def contiguous(a, b):
        return all(n in known_lines for n in range(a, b + 1))

    for index, (number, text, stripped) in enumerate(statements):
        following = statements[index + 1] if index + 1 < len(statements) else None
        previous = statements[index - 1] if index else None
        if following and not contiguous(number, following[0]):
            following = None
        if MACRO_CALL.search(stripped) or stripped.startswith('#'):
            continue
        if following and number in added and following[0] in added and OPEN_BRANCH.search(stripped) and following[2].startswith('}'):
            report(number, text, 'Empty if/else body added.', kind='empty_branch')
        label = CASE_LABEL.match(stripped)
        if label and stripped.startswith('case') and number in added and not (previous and CASE_LABEL.match(previous[2]) and not CASE_LABEL.match(previous[2])['rest'].strip()):
            rest = label['rest'].strip()
            if rest == 'break;' or (not rest and following and following[0] in added and following[2] == 'break;'):
                report(number, text, 'Added `case` whose only statement is `break;`. If the switch has no default it is dead code; otherwise confirm the original has it.', severity='warning', kind='empty_case')
        current = assignment(stripped)
        if not current or not following or following[2].startswith('#') or MACRO_CALL.search(following[2]):
            continue
        lhs, rhs, _ = current
        nxt = assignment(following[2])
        if nxt and not nxt[2] and re.fullmatch(r'[A-Za-z_]\w*', lhs) and nxt[0] == lhs and not reads(nxt[1], lhs):
            if number in added or following[0] in added:
                if squash(rhs) == squash(nxt[1]):
                    report(following[0], following[1], f'Same assignment `{lhs} = {squash(rhs)};` repeated on the next line.', kind='repeated_assignment')
                else:
                    report(number, text, f'Dead store: `{lhs}` is written here and overwritten by the next statement before any read.', kind='dead_store')
            continue
        # Same assignment repeated later in the same block, with no write in between.
        if current[2] or re.search(r'\w\s*\(', rhs) or (previous and not re.search(r'[;{}]$', previous[2])):
            continue
        writes = write_pattern(lhs)
        depth, prior = 0, stripped
        for later in statements[index + 1:index + 41]:
            if not contiguous(number, later[0]):
                break
            depth += later[2].count('{') - later[2].count('}')
            if depth < 0 or CASE_LABEL.match(later[2]) or re.match(r'^[A-Za-z_]\w*\s*:(?!:)', later[2]) or re.search(r'\belse\b', later[2]) or later[2].startswith('#'):
                break
            again = assignment(later[2])
            if depth == 0 and again and not again[2] and squash(again[0]) == squash(lhs) and re.search(r'[;{}]$', prior):
                if squash(again[1]) == squash(rhs) and (number in added or later[0] in added):
                    report(later[0], later[1], f'Same assignment `{squash(lhs)} = {squash(rhs)};` repeated with no write to `{squash(lhs)}` in between.', kind='repeated_assignment')
                break
            if writes.search(later[2]) or ((not re.fullmatch(r'[A-Za-z_]\w*', lhs) or re.search(r'->|\.|\[|\*', rhs)) and re.search(r'\w\s*\(', later[2])):
                break  # written, or a call may write through the member/pointer or change the value read
            prior = later[2]
    return findings


# --- global findings under the SMS policy -------------------------------------
# Global messages that recommend `// fabricated`/TODO markers or retaining a
# tactic on objdiff evidence are rewritten for SMS workers. The two llm_review
# tactics (layout_cue_local, cancelling_arithmetic) lose llm_review in SMS: the
# adjudicator accepts "stack layout" as a reason, which SMS bans, so they
# become info pointing at the build-both-ways check.
SMS_GLOBAL_POLICY = {
    'codegen_pragma': 'SMS bans codegen pragmas in autonomous output, marked or not; remove it and find the real source shape, or leave the function nonmatching with no comment.',
    'novel_pragma': 'SMS bans new pragmas in autonomous output, marked or not; remove it and leave the function nonmatching with no comment if nothing else matches.',
    'single_use_wrapper': 'SMS rejects fabricated single-use helpers, marked or not; fold it back unless an upstream header, the map or a sibling decomp shows the inline exists.',
    'storage_widening': f'In SMS a declaration may change only when it changes non-stack codegen: build both ways with `{base.STACK_CHECK_HUNKS}`; if only the frame size and r1 offsets move, revert it.',
    'layout_cue_local': f'In SMS an extra local is allowed only when it changes non-stack codegen: build both ways with `{base.STACK_CHECK_HUNKS}`; if only the frame size and r1 offsets move, remove it. Stack layout is not a reason to keep it.',
    'cancelling_arithmetic': f'In SMS this is allowed only when it changes non-stack codegen: build both ways with `{base.STACK_CHECK_HUNKS}`; if only the frame size and r1 offsets move, remove it. Stack layout is not a reason to keep it.',
}
SMS_INFO_ONLY = {'layout_cue_local', 'cancelling_arithmetic'}


def first_sentence(message):
    match = re.match(r'(.+?[.!?])(?:\s|$)', message or '')
    return match.group(1) if match else (message or '')


def apply_sms_policy_to_global_findings(findings, repo, mode, file_diffs, merge_base):
    """Post-scan: marker-blind results win, global advice is rewritten for SMS."""
    def key(found):
        return (found.get('rule_id'), found.get('file'), found.get('line'))

    def is_blind(found):
        return bool((found.get('detail') or {}).get('marker_blind'))

    # One finding per (rule, file, line) where a marker-blind rerun ran: the
    # unchanged global finding when it already has the marker-blind severity
    # (no marker was involved), else the marker-blind finding.
    groups = {}
    for found in findings:
        groups.setdefault(key(found), []).append(found)
    keep = set()
    for group in groups.values():
        blind = [f for f in group if is_blind(f)]
        if not blind:
            keep.update(id(f) for f in group)
            continue
        same = [f for f in group if not is_blind(f) and f.get('severity') == blind[0].get('severity')]
        keep.add(id(same[0] if same else blind[0]))
    result = []
    for found in findings:
        if id(found) not in keep:
            continue
        if is_game_source(found.get('file')) and 'data_ordering_repair' in (found.get('detail') or {}):
            # SMS has no data-ordering helper: drop the global order_sdata2 repair hint.
            found = {**found, 'detail': {k: v for k, v in found['detail'].items() if k != 'data_ordering_repair'}}
        policy = SMS_GLOBAL_POLICY.get(found.get('rule_id'))
        if policy and is_game_source(found.get('file')):
            found = {**found, 'message': first_sentence(found.get('message')) + ' ' + policy}
            if found['rule_id'] in SMS_INFO_ONLY:
                detail = {k: v for k, v in (found.get('detail') or {}).items() if k != 'llm_review'}
                found = {**found, 'severity': 'info', 'detail': {**detail, 'verify_with': base.STACK_CHECK_HUNKS}}
        result.append(found)
    return base.suppress_global_overlaps(result, repo, mode, file_diffs, merge_base)


RULES = [
    {'rule_id': 'sms_local_class_needs_owner', 'standard_id': 'global_standard:sms-authored-evidence', 'severity': 'error', 'applies_to': GAME_SOURCES, 'check': base.no_hunk_check, 'message': 'File-scope classes in a .cpp need a header owner.'},
    {'rule_id': 'sms_pch_string_convention', 'standard_id': 'global_standard:sms-pch-string-convention', 'severity': 'error', 'applies_to': GAME_SOURCES, 'check': check_pch_strings, 'message': 'Include the PCH dummy-string headers instead of copying them.'},
    {'rule_id': 'sms_fabricated_marker', 'standard_id': 'global_standard:sms-fabricated-marker', 'severity': 'error', 'applies_to': GAME_SOURCES, 'check': check_fabricated_marker, 'message': 'Fabricated pragmas, helpers and expanded inlines are rejected; marker comments do not exempt them.'},
    {'rule_id': 'sms_intrinsic_bypass', 'standard_id': 'global_standard:sms-authored-evidence', 'severity': 'warning', 'applies_to': GAME_SOURCES, 'check': check_intrinsic_bypass, 'message': 'MSL intrinsic bypasses need binary evidence.'},
    {'rule_id': 'sms_dummy_vec_helper', 'standard_id': 'global_standard:sms-pch-string-convention', 'severity': 'warning', 'applies_to': GAME_SOURCES, 'check': check_dummy_vec_helper, 'message': 'dummy(Vec*) needs its emitted-symbol comment.'},
    {'rule_id': 'sms_agent_comment', 'standard_id': 'global_standard:sms-no-agent-comments', 'severity': 'error', 'applies_to': ['src/**', 'include/**'], 'check': check_agent_comment, 'message': 'Agent-written comments (TODO, nonmatching, fakematch, frame notes) are rejected in SMS.'},
    {'rule_id': 'sms_accessor_evidence', 'standard_id': 'global_standard:sms-accessor-evidence', 'severity': 'warning', 'llm_review': True, 'applies_to': ['src/*.cpp', 'src/*.c', 'include/**'], 'check': check_accessor_evidence, 'message': 'Accessor and inline swaps need evidence that the accessor exists in the original; otherwise they are steering probes for the steering gate.'},
    # Steering gate shapes (objectives/sms-real-codegen/plan.md section 4).
    {'rule_id': 'sms_single_use_temp', 'standard_id': 'global_standard:sms-no-steering', 'severity': 'warning', 'llm_review': True, 'applies_to': STEERING_SOURCES, 'check': check_single_use_temp, 'message': 'A temp or alias that only re-spells an expression is a steering probe, not a fix.'},
    {'rule_id': 'sms_form_rewrite', 'standard_id': 'global_standard:sms-no-steering', 'severity': 'warning', 'llm_review': True, 'applies_to': STEERING_SOURCES, 'check': check_form_rewrite, 'message': 'A same-behaviour rewrite (if/ternary, order, type spelling, literal form, compound assignment, boolean form) is a steering probe, not a fix.'},
    {'rule_id': 'sms_codegen_directive', 'standard_id': 'global_standard:sms-no-steering', 'severity': 'error', 'applies_to': ['src/**', 'include/**'], 'check': check_codegen_directive, 'message': 'Added volatile, register or #pragma steers codegen and is rejected in SMS.'},
    # D1/D2 (user decision 2026-10-13): invented helpers and odd-looking code are dropped in SMS.
    {'rule_id': 'sms_invented_helper', 'standard_id': 'global_standard:sms-fabricated-marker', 'severity': 'error', 'applies_to': INVENTED_SOURCES, 'check': collect_invented_helper_context, 'message': 'Functions the diff adds need an upstream declaration or a symbols.txt/mario.MAP entry; invented helpers are dropped.'},
    # SMS maintainer review of doldecomp/sms #342 (2026-10-15): UNUSED functions get a body only when inlined.
    {'rule_id': 'sms_unused_reconstruction', 'standard_id': 'global_standard:sms-unused-functions', 'severity': 'warning', 'llm_review': True, 'applies_to': UNUSED_SOURCES, 'check': collect_unused_context, 'message': 'UNUSED (dead-stripped) functions may only get a body when they were inlined into another function of the same TU; prove it with steering_check.py unused-test or keep the stub.'},
    # SMS maintainer ruling on doldecomp/sms #347/#348 (2026-10-15): decompile in order.
    {'rule_id': 'sms_out_of_order_fill', 'standard_id': 'global_standard:sms-decompile-in-order', 'severity': 'error', 'applies_to': ORDER_GATED_PATHS, 'check': collect_order_context, 'message': 'MarNameRefGen may only reference classes that are ready to construct (their own unit defines the constructor); leave it until they are.'},
    {'rule_id': 'sms_undecompiled_class_decl', 'standard_id': 'global_standard:sms-decompile-in-order', 'severity': 'error', 'applies_to': ORDER_DECL_PATHS, 'check': collect_order_context, 'message': 'Do not add a class, members or a header for a class whose own unit has not started; leave it until the unit is decompiled.'},
    {'rule_id': 'sms_nonsense_code', 'standard_id': 'global_standard:sms-plain-code', 'severity': 'error', 'applies_to': INVENTED_SOURCES, 'check': check_nonsense_code, 'message': 'Code a human would not write (repeated tests, double negations, empty branches, dead or repeated stores) is dropped.'},
]
POST_SCAN_HOOKS = [apply_sms_policy_to_global_findings, check_local_class_owner, check_fabricated_marker_post, check_invented_helper_post, check_unused_reconstruction_post, check_decompile_order_post, drop_owned_directives]
