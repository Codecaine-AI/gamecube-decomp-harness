"""SMS source-fidelity rules: the game-specific layer above the global
source_fidelity family. Covers header ownership of placeholder classes, the
PCH dummy-string convention, the upstream AGENTS.md fabricated-marker rule,
MSL intrinsic bypasses and the dummy(Vec*) emission helper."""
import importlib.util
import os
import re
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


base = _baseline()
clean, partial, VENDOR_PATHS = base.clean, base.partial, base.VENDOR_PATHS
GAME_SOURCES = ['src/*.cpp', 'src/*.c']
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
ACCESSOR = re.compile(r'\bget(?P<field>Unk[0-9A-Fa-f]+)\s*\(\s*\)')
FIELD = re.compile(r'(?<=[.>])(?P<field>unk[0-9A-Fa-f]+)\b(?!\s*\()')
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
                    findings.append(full_finding(rule, path, number, text, f'class {name} has no header declaration; the map places its symbols in this unit ({", ".join(sorted(inside))}). Move the declaration to include/ and mark it fabricated.', severity='warning', class_name=name, symbols=sorted(inside), requires_human_review=True))
                elif owned:
                    owners = sorted({unit_for_address(units, loc[1]) or '<no unit>' for loc in owned.values()})
                    findings.append(full_finding(rule, path, number, text, f'class {name} belongs to {", ".join(owners)} per {SYMBOLS_PATH} ({", ".join(sorted(owned))}); do not define it in {path}.', class_name=name, owner_units=owners, symbols=sorted(owned)))
                else:
                    findings.append(full_finding(rule, path, number, text, f'class {name} has no header declaration and no map symbol; move it to include/ and mark it fabricated.', severity='warning', class_name=name, requires_human_review=True))
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


def marker_finding(number, text, lines, message, above=2, **detail):
    marked = has_marker(lines, number, above)
    found = partial(number, text, message + (' Marked as fabricated/TODO: keep the marker and record the evidence.' if marked else ' Add a // fabricated or // TODO comment on the line or within two lines above, and record why.'), marker=marked, **detail)
    if marked:
        found['severity'] = 'warning'
    return found


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
                findings.append(marker_finding(number, text, lines, f'#pragma {pragma["name"]} is a temporary fakematch under the upstream marker rule.', pragma=pragma['name']))
            continue
        name = static_inline_name(lines, number) if STATIC_INLINE.match(text) else None
        if not name:
            continue
        if isinstance(full, str):
            if call_site_count(full, name) == 1:
                findings.append(marker_finding(number, text, lines, f'static inline {name} has a single call site; a fabricated helper needs the upstream marker.', helper=name, call_sites=1))
        else:
            _PENDING_INLINE.setdefault(path, []).append((number, text, name, dict(lines)))
    return findings


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
                found = marker_finding(number, text, lines, f'static inline {name} has a single call site; a fabricated helper needs the upstream marker.', helper=name, call_sites=1, post_text_source='repo_fallback')
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
                found = marker_finding(first_line, lines.get(first_line, ''), lines, f'Added block of {MIN_DUPLICATE_STATEMENTS}+ statements duplicates a body from include/; recognize the inline instead of expanding it by hand.', above=4, kind='duplicated_inline_body')
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
    removed = [normalized(text) for text in hunk.get('removed', [])]
    for number, text in hunk.get('added', []):
        cleaned = clean(text)
        for match in INTRINSIC_CALL.finditer(cleaned):
            if match['name'] in INTRINSICS:
                findings.append(partial(number, text, f'{match["name"]} bypasses the public MSL wrapper ({INTRINSICS[match["name"]]}); use the wrapper unless the binary proves the intrinsic call.', intrinsic=match['name'], wrapper=INTRINSICS[match['name']], requires_human_review=True))
        added_norm = normalized(text)
        to_field = ACCESSOR.sub(lambda m: m['field'][0].lower() + m['field'][1:], added_norm)
        to_accessor = FIELD.sub(lambda m: 'get' + m['field'][0].upper() + m['field'][1:] + '()', added_norm)
        if ACCESSOR.search(added_norm) and to_field != added_norm and to_field in removed:
            findings.append(partial(number, text, 'Field access flipped to an accessor with no other change; accessor/field toggles need binary evidence, not frame-size gains.', flip='field_to_accessor', requires_human_review=True))
        elif FIELD.search(added_norm) and to_accessor != added_norm and to_accessor in removed:
            findings.append(partial(number, text, 'Accessor flipped to direct field access with no other change; accessor/field toggles need binary evidence, not frame-size gains.', flip='accessor_to_field', requires_human_review=True))
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


RULES = [
    {'rule_id': 'sms_local_class_needs_owner', 'standard_id': 'global_standard:sms-authored-evidence', 'severity': 'error', 'applies_to': GAME_SOURCES, 'check': base.no_hunk_check, 'message': 'File-scope classes in a .cpp need a header owner.'},
    {'rule_id': 'sms_pch_string_convention', 'standard_id': 'global_standard:sms-pch-string-convention', 'severity': 'error', 'applies_to': GAME_SOURCES, 'check': check_pch_strings, 'message': 'Include the PCH dummy-string headers instead of copying them.'},
    {'rule_id': 'sms_fabricated_marker', 'standard_id': 'global_standard:sms-fabricated-marker', 'severity': 'error', 'applies_to': GAME_SOURCES, 'check': check_fabricated_marker, 'message': 'Fabricated pragmas, helpers and expanded inlines need the upstream marker.'},
    {'rule_id': 'sms_intrinsic_bypass', 'standard_id': 'global_standard:sms-authored-evidence', 'severity': 'warning', 'applies_to': GAME_SOURCES, 'check': check_intrinsic_bypass, 'message': 'MSL intrinsic bypasses and accessor/field flips need binary evidence.'},
    {'rule_id': 'sms_dummy_vec_helper', 'standard_id': 'global_standard:sms-pch-string-convention', 'severity': 'warning', 'applies_to': GAME_SOURCES, 'check': check_dummy_vec_helper, 'message': 'dummy(Vec*) needs its emitted-symbol comment.'},
]
POST_SCAN_HOOKS = [check_local_class_owner, check_fabricated_marker_post]
