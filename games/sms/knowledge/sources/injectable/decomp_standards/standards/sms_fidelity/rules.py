"""SMS source-fidelity rules: the game-specific layer above the global
source_fidelity family. Covers header ownership of placeholder classes, the
PCH dummy-string convention, fabricated scaffolding (pragmas, single-use
helpers, hand-expanded inlines), MSL intrinsic bypasses, the dummy(Vec*)
emission helper, agent-written comments and accessor/inline evidence.

SMS maintainer rulings (2026-10-13, doldecomp/sms #330/#331): agent comments
(TODO, fakematch, fabricated, frame notes) are rejected, and a marker comment
never downgrades or exempts a finding, SMS or global. The post-scan hook
``apply_sms_policy_to_global_findings`` keeps global marker/evidence advice
from reaching SMS workers."""
import difflib
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


def _agent_comments():
    """The shared agent-comment vocabulary (toolpacks/.../tools/agent_comments.py)."""
    name = '_gcdh_agent_comments'
    if name in sys.modules:
        return sys.modules[name]
    for parent in Path(__file__).resolve().parents:
        path = parent / 'toolpacks/gamecube-decomp/_impl/gamecube/tools/agent_comments.py'
        if path.is_file():
            spec = importlib.util.spec_from_file_location(name, path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
            return module
    raise RuntimeError('review_lint: agent_comments.py not found above ' + str(Path(__file__).resolve()))


base = _baseline()
agent_comments = _agent_comments()
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
TOKEN = re.compile(r'[A-Za-z_]\w*|\d[\w.]*|->|::|<<=|>>=|<=|>=|==|!=|&&|\|\||\+\+|--|[-+*/%&|^]=|\S')
MEMBER_CHAIN = re.compile(r'(?:this->)?[A-Za-z_]\w*(?:\[[^\[\]]*\])?')
ACCESSOR_CALL = re.compile(r'(?:this->)?(?P<name>[A-Za-z_]\w*)\([^()]*\)')
MERGE_GAP = 3  # equal tokens allowed between two edits that form one swap (`m[i]` -> `get(i)`)
INLINE_HOP = re.compile(r'(?P<lead>->|\.)?(?P<name>[A-Za-z_]\w*)\([^()]*\)(?P<trail>->|\.)?')
HEADER_INLINE = re.compile(r'^\s*(?:(?:static|inline|virtual|explicit|friend)\s+)*(?:[A-Za-z_][\w:<>,*&\s]*?[\s*&])?(?P<name>~?[A-Za-z_]\w*)\s*\([^;{}]*\)\s*(?:const\s*)?(?P<brace>\{)?\s*(?:.*\})?\s*$')
NOT_FUNCTIONS = {'if', 'for', 'while', 'switch', 'return', 'sizeof', 'do', 'else', 'case', 'catch'}
EVIDENCE_REQUEST = ' Keep it only with evidence that this accessor or inline exists in the original source: an upstream header, the symbol map (mario.MAP / symbols.txt) or a sibling decomp that uses it at this call site. A frame-size, stack-layout or match-percent gain is not evidence; without evidence revert to the upstream expression.'


def member_like(name, tokens, index, call_name):
    stem = name[1:] if re.match(r'm[A-Z_]', name) else name.lstrip('_')
    return (index > 0 and tokens[index - 1] in ('->', '.')) or bool(re.match(r'(?:m[A-Z_]|unk|_)', name)) or call_name.lower() == 'get' + stem.lower()


def field_name(text):
    return re.match(r'(?:this->)?([A-Za-z_]\w*)', text).group(1)


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


def accessor_swap(old, new):
    """(kind, before, after) when new differs from old only by an accessor or inline hop."""
    opcodes = difflib.SequenceMatcher(a=old, b=new, autojunk=False).get_opcodes()
    edits = [index for index, op in enumerate(opcodes) if op[0] != 'equal']
    if not edits:
        return None
    first, last = edits[0], edits[-1]
    if any(opcodes[index][0] == 'equal' and opcodes[index][2] - opcodes[index][1] > MERGE_GAP for index in range(first, last)):
        return None
    tag, i1, j1 = opcodes[first][0], opcodes[first][1], opcodes[first][3]
    i2, j2 = opcodes[last][2], opcodes[last][4]
    if first != last:
        tag = 'replace'
        while i2 > i1 and j2 > j1 and old[i2 - 1] == new[j2 - 1]:
            i2, j2 = i2 - 1, j2 - 1
        while i1 < i2 and j1 < j2 and old[i1] == new[j1]:
            i1, j1 = i1 + 1, j1 + 1
    before, after = ''.join(old[i1:i2]), ''.join(new[j1:j2])
    if tag == 'replace':
        call = ACCESSOR_CALL.fullmatch(after)
        field = MEMBER_CHAIN.fullmatch(before)
        if call and field and member_like(field_name(before), old, i1, call['name']):
            return 'field_to_accessor', before, after
        call = ACCESSOR_CALL.fullmatch(before)
        field = MEMBER_CHAIN.fullmatch(after)
        if call and field and member_like(field_name(after), new, j1, call['name']):
            return 'accessor_to_field', before, after
        return None
    hop = INLINE_HOP.fullmatch(after if tag == 'insert' else before)
    if hop and bool(hop['lead']) != bool(hop['trail']):
        return ('inline_hop_added' if tag == 'insert' else 'inline_hop_removed'), before, after
    return None


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
    {'rule_id': 'sms_accessor_evidence', 'standard_id': 'global_standard:sms-accessor-evidence', 'severity': 'warning', 'llm_review': True, 'applies_to': ['src/*.cpp', 'src/*.c', 'include/**'], 'check': check_accessor_evidence, 'message': 'Accessor and inline swaps need evidence that the accessor exists in the original.'},
]
POST_SCAN_HOOKS = [apply_sms_policy_to_global_findings, check_local_class_owner, check_fabricated_marker_post]
