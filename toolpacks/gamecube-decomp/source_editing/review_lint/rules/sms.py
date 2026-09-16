"""SMS project rules. Map validation uses existing builds and never rebuilds them."""
import json
import os
import re
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path

VENDOR_PATHS = [f'{root}/{library}/**' for root in ('src', 'include') for library in ('JSystem', 'dolphin', 'PowerPC_EABI_Support', 'MSL', 'MetroTRK', 'TRK_MINNOW_DOLPHIN', 'THPPlayer')]
# Named padding arrays are prohibited with or without volatile and regardless of
# element type. Anonymous-looking unused arrays receive a review finding below.
ARRAY = re.compile(r'\b(?P<type>(?:(?:volatile|const|unsigned|signed|long|short)\s+)*[A-Za-z_]\w*(?:::\w+)*)\s+(?P<name>[A-Za-z_]\w*)\s*\[[^\]]+\]\s*(?:;|=)')
PAD_NAME = re.compile(r'(?:trash|padding|pad\d*|sp_pad|stack_pad|stackPadding|stack_padding|dummy)(?:\w*)$', re.I)
COMMENT_STRING = re.compile(r'/\*.*?\*/|//[^\n]*|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', re.S)
DECL = re.compile(r'^\s*(?P<type>(?:(?:static|extern|inline|virtual|const|volatile|unsigned|signed|struct|class|enum)\s+)*[A-Za-z_]\w*(?:::\w+)*(?:\s*<[^;={}]+>)?(?:\s*[*&])*)\s+(?P<name>(?:[A-Za-z_]\w*::)*[~]?[A-Za-z_]\w*)(?=\s*(?:\(|\[|=|;|:|\{))')
TYPE_NAME = re.compile(r'^\s*(?:class|struct|enum(?:\s+class)?)\s+(?P<name>[A-Za-z_]\w*)\b')
MAP_NAME = re.compile(r'^\s*(?P<name>[A-Za-z_]\w*)\s*=\s*(?P<location>\.\w+:0x[0-9a-fA-F]+)')


def clean(text):
    return COMMENT_STRING.sub(lambda m: '\n' * m.group().count('\n') or ' ', text)


def partial(line, text, message, **detail):
    result = {'line': line, 'excerpt': text.strip(), 'message': message}
    if detail:
        result['detail'] = detail
    return result


def check_vendor_edit(hunk):
    if not any(fnmatch(hunk.get('file') or '', p) for p in VENDOR_PATHS):
        return []
    added, removed = hunk.get('added', []), hunk.get('removed', [])
    if not added and not removed:
        return []
    return [partial(added[0][0] if added else 1, added[0][1] if added else str(removed[0]), 'SMS autonomous attempts may edit game code only; vendor and middleware changes require human supervision.')]


def inside_function(text, offset):
    prefix = text[:offset]
    starts = list(re.finditer(r'\b[~\w:]+\s*\([^;{}]*\)\s*(?:const\s*)?\{', prefix))
    if not starts:
        return False
    body = prefix[starts[-1].end()-1:]
    return body.count('{') > body.count('}')


# --- unused-local-storage analysis -----------------------------------------
# Any added local (scalar, aggregate, reference, array, static local) whose
# identifier is never referenced again inside its enclosing function is dummy
# storage. Partially used aggregates (one component of a multi-field local)
# are warnings. Discarded constructor-expression statements are errors.
POST_TREE_ENV = 'REVIEW_LINT_POST_TREE'
STATEMENT_KEYWORDS = {'return', 'delete', 'throw', 'case', 'goto', 'else', 'new', 'typedef', 'using', 'extern', 'friend', 'sizeof', 'break', 'continue', 'if', 'for', 'while', 'switch', 'do', 'default', 'public', 'private', 'protected', 'operator', 'template', 'namespace', 'asm', 'true', 'false', 'nullptr'}
QUALIFIERS = r'(?:(?:const|volatile|static|register|unsigned|signed|struct|union|class|enum)\s+)*'
LOCAL_DECL = re.compile(r'^\s*' + QUALIFIERS + r'(?P<type>[A-Za-z_]\w*(?:::[A-Za-z_]\w*)*(?:\s*<[^;{}()]*>)?(?:::[A-Za-z_]\w*)*)(?:\s*(?P<ptr>[*&]+(?:\s*const)?)\s*|\s+)(?P<name>[A-Za-z_]\w*)\s*(?P<dims>(?:\[[^\]]*\]\s*)*)(?P<tail>;|=[^=]|\((?!\s*\))|,|$)')
AGGREGATE_TYPES = {'Vec', 'Mtx', 'Mtx44', 'Mtx33', 'ROMtx', 'Quaternion', 'TVec3', 'TVec2', 'TBox3', 'TBox', 'S16Color', 'TColor', 'GXColor', 'JUTColor', 'J3DTexMtxInfo', 'TSize'}
COMPONENT_FIELDS = {'x', 'y', 'z', 'w', 'r', 'g', 'b', 'a'}
DISCARDED_CTOR = re.compile(r'^\s*(?P<type>(?:[A-Za-z_]\w*::)*(?P<last>[A-Za-z_]\w*)(?P<targs>\s*<[^;]*>)?)\s*\((?P<args>[^;]*)\)\s*;\s*$')


def brace_blocks(text, start, end):
    """Yield (open, close) offsets of top-level brace blocks in text[start:end]."""
    depth, open_index = 0, None
    for index in range(start, end):
        char = text[index]
        if char == '{':
            if depth == 0:
                open_index = index
            depth += 1
        elif char == '}' and depth:
            depth -= 1
            if depth == 0 and open_index is not None:
                yield open_index, index
                open_index = None


def looks_like_function(text, open_index):
    prefix = text[:open_index].rstrip()
    return bool(re.search(r'\)\s*(?:const)?$', prefix))


def function_spans(text, start=0, end=None):
    """Return [(open, close)] for every function body, descending into classes/namespaces."""
    spans = []
    for open_index, close_index in brace_blocks(text, start, len(text) if end is None else end):
        if looks_like_function(text, open_index):
            spans.append((open_index, close_index))
        else:
            spans.extend(function_spans(text, open_index + 1, close_index))
    return spans


def split_declarators(rest):
    """Split 'a = f(x, y), b[2], c' at top-level commas."""
    parts, depth, current = [], 0, []
    for char in rest:
        if char in '([{':
            depth += 1
        elif char in ')]}':
            depth -= 1
        if char == ',' and depth == 0:
            parts.append(''.join(current))
            current = []
        else:
            current.append(char)
    parts.append(''.join(current))
    return parts


def local_declarations(line):
    """Return [(name, type_base, dims)] declared by one cleaned function-body line."""
    stripped = line.strip()
    if not stripped or stripped.startswith('#') or stripped.startswith('}'):
        return []
    first = re.match(r'[A-Za-z_]\w*', stripped)
    if not first or first.group() in STATEMENT_KEYWORDS:
        return []
    match = LOCAL_DECL.match(line)
    if not match:
        return []
    base = match['type'].split('<', 1)[0].split('::')[-1]
    reference = '&' in (match['ptr'] or '')
    names = [(match['name'], base, match['dims'].strip(), reference)]
    if ',' in line:
        for declarator in split_declarators(line[match.start('name'):].split(';', 1)[0])[1:8]:
            extra = re.match(r'\s*[*&]*\s*(?P<name>[A-Za-z_]\w*)\s*(?P<dims>(?:\[[^\]]*\]\s*)*)', declarator)
            if extra and extra['name'] not in STATEMENT_KEYWORDS:
                names.append((extra['name'], base, extra['dims'].strip(), reference))
    return names


def reference_sites(body, name):
    """Return the tail text after each non-member-access reference to name."""
    return [body[match.end():match.end() + 48] for match in re.finditer(r'(?<![\w.>:])' + re.escape(name) + r'\b', body)]


def partial_component(sites, base, dims):
    """Return the single component/field name when every reference touches only it."""
    if not sites:
        return None
    aggregate = base in AGGREGATE_TYPES or bool(dims and dims not in ('[1]', '[ 1 ]'))
    components = set()
    for tail in sites:
        member = re.match(r'\s*\.\s*([A-Za-z_]\w*)\b(?!\s*\()', tail)
        index = re.match(r'\s*\[\s*([^\]]+?)\s*\]', tail)
        if member:
            components.add('.' + member.group(1))
        elif index and re.fullmatch(r'\d+', index.group(1)):
            components.add('[' + index.group(1) + ']')
        else:
            return None
    if len(components) != 1:
        return None
    component = next(iter(components))
    if not aggregate and component.lstrip('.') not in COMPONENT_FIELDS and not component.startswith('['):
        return None
    return component


CAST_KEYWORDS = {'static_cast', 'reinterpret_cast', 'const_cast', 'dynamic_cast', 'sizeof', 'typeid'}
STATEMENT_END = re.compile(r'(?:[;{}):]|\belse|\bdo)\s*$')
NESTED_AGGREGATE = re.compile(r'\b(?:union|struct|class)\s*(?:[A-Za-z_]\w*\s*)?\{')


def discarded_constructor(text):
    """Return the constructor type when a line is a bare `Type(args);` statement."""
    match = DISCARDED_CTOR.match(text)
    if not match or match['last'] in CAST_KEYWORDS:
        return None
    if not (match['targs'] or match['last'] in AGGREGATE_TYPES or re.match(r'T[A-Z][a-z]', match['last'])):
        return None
    depth = 0
    for char in match['args']:
        depth += (char == '(') - (char == ')')
        if depth < 0:
            return None
    return match['type'].strip() if depth == 0 else None


def continuation_line(lines, index):
    """True when line index continues an unterminated previous statement."""
    for previous in range(index - 1, -1, -1):
        text = lines[previous].strip()
        if not text or text.startswith('#'):
            continue
        return not STATEMENT_END.search(text)
    return False


def nested_aggregate_lines(cleaned, open_index, close_index):
    """Line numbers inside union/struct/class blocks nested in a function body."""
    excluded = set()
    body = cleaned[open_index + 1:close_index]
    for match in NESTED_AGGREGATE.finditer(body):
        start = open_index + 1 + match.end() - 1
        depth = 0
        for index in range(start, close_index):
            depth += (cleaned[index] == '{') - (cleaned[index] == '}')
            if depth == 0:
                excluded.update(range(cleaned[:start].count('\n') + 1, cleaned[:index].count('\n') + 2))
                break
    return excluded


def statement_text(lines, index, limit=4):
    parts = []
    for offset in range(limit):
        if index + offset >= len(lines):
            break
        parts.append(lines[index + offset])
        if ';' in lines[index + offset]:
            break
    return ' '.join(parts)


def unused_local_findings(full_text, added_lines, line_map=None):
    """Analyze a post-change file; report unused/partially used added locals.

    added_lines: set of post-file line numbers that are new in the diff.
    line_map: optional {post_line: reported_line} for fallback alignment.
    """
    findings = []
    cleaned = clean(full_text)
    lines = cleaned.split('\n')
    raw_lines = full_text.split('\n')
    seen = set()
    for open_index, close_index in function_spans(cleaned):
        body = cleaned[open_index:close_index + 1]
        first_line = cleaned[:open_index].count('\n') + 1
        last_line = cleaned[:close_index].count('\n') + 1
        if last_line - first_line < 2:
            continue
        excluded = nested_aggregate_lines(cleaned, open_index, close_index)
        for number in range(first_line + 1, last_line):
            if number not in added_lines or number > len(lines) or number in excluded:
                continue
            text = lines[number - 1]
            if continuation_line(lines, number - 1):
                continue
            excerpt = raw_lines[number - 1] if number <= len(raw_lines) else text
            reported = (line_map or {}).get(number, number)
            ctor = discarded_constructor(text)
            if ctor:
                findings.append(partial(reported, excerpt, f'Discarded constructor expression {ctor}(...) is unused local storage; remove it and leave the frame nonmatching.', name=ctor, kind='discarded_constructor'))
                continue
            for name, base, dims, reference in local_declarations(text):
                key = (open_index, name)
                if key in seen:
                    continue
                seen.add(key)
                sites = reference_sites(body, name)[1:]
                if not sites:
                    if PAD_NAME.fullmatch(name):
                        continue  # already reported as named padding
                    statement = statement_text(lines, number - 1)
                    initializer = statement.split('=', 1)[1] if re.search(r'\b' + re.escape(name) + r'\b[^=;(]*=[^=]', statement) else ''
                    if not reference and re.search(r'\w\s*\(', initializer):
                        found = partial(reported, excerpt, f'Unused call result: {name} stores a call result and is never referenced again. Drop the local or use the value; do not keep it to shape the frame.', name=name, kind='unused_call_result', requires_human_review=True)
                        found['severity'] = 'warning'
                        findings.append(found)
                        continue
                    findings.append(partial(reported, excerpt, f'Unused local storage: {name} is declared and never referenced in its function. Remove it; do not shape the frame with dummy locals.', name=name, kind='unused_local'))
                    continue
                component = partial_component(sites, base, dims)
                if component:
                    found = partial(reported, excerpt, f'Partially used aggregate local: only {name}{component} is ever referenced. Confirm the local is authored storage, not frame shaping.', name=name, component=component, kind='partial_aggregate', requires_human_review=True)
                    found['severity'] = 'warning'
                    findings.append(found)
    return findings


_ANALYZED_HUNKS = set()  # id() of hunk['added'] lists already analyzed with post_file_text


def added_line_alignment(post_text, additions):
    """Map diff line numbers onto the post file when it may have drifted."""
    lines = post_text.split('\n')
    mapping = {}
    for number, text in additions:
        if 0 < number <= len(lines) and lines[number - 1] == text:
            mapping[number] = number
            continue
        stripped = text.strip()
        if not stripped:
            continue
        matches = [index + 1 for index, line in enumerate(lines) if line.strip() == stripped]
        if len(matches) == 1:
            mapping[matches[0]] = number
    return mapping


def read_post_file(repo, rel_path):
    root = os.environ.get(POST_TREE_ENV) or str(repo)
    path = Path(root) / rel_path
    try:
        return path.read_text(encoding='utf-8', errors='replace') if path.is_file() else None
    except OSError:
        return None


def check_dummy_padding(hunk):
    findings = []
    additions = hunk.get('added', [])
    cleaned = clean('\n'.join(text for _, text in additions))
    for match in ARRAY.finditer(cleaned):
        name = match['name']
        index = cleaned[:match.start()].count('\n')
        line, text = additions[index]
        if PAD_NAME.fullmatch(name):
            findings.append(partial(line, text, 'Dummy stack padding may not be committed, with or without volatile. Leave the function nonmatching and investigate real inline behavior.', name=name))
        elif 'volatile' in match['type'].split():
            findings.append(partial(line, text, 'A new volatile array requires human review of its real purpose; it cannot be used to disguise stack padding.', name=name, requires_human_review=True))
    full_text = hunk.get('post_file_text')
    if isinstance(full_text, str):
        _ANALYZED_HUNKS.add(id(hunk.get('added')))
        findings.extend(unused_local_findings(full_text, {number for number, _ in additions}))
    return findings


def check_unused_locals_fallback(findings, repo, mode, file_diffs, merge_base):
    """Post-scan fallback: read the post-change file from --repo (or
    REVIEW_LINT_POST_TREE) when the engine supplied no post_file_text."""
    rule = next(r for r in RULES if r['rule_id'] == 'sms_dummy_stack_padding')
    for record in file_diffs:
        path = record['file']
        if any(id(h.get('added')) in _ANALYZED_HUNKS for h in record['hunks']) or not fnmatch(path, 'src/*.c*') or any(fnmatch(path, p) for p in VENDOR_PATHS):
            continue
        post_text = read_post_file(repo, path)
        if post_text is None:
            continue
        for hunk in record['hunks']:
            mapping = added_line_alignment(post_text, hunk['added'])
            if not mapping:
                continue
            for found in unused_local_findings(post_text, set(mapping), mapping):
                detail = {**found.get('detail', {}), 'post_text_source': 'repo_fallback'}
                findings.append({'file': path, 'line': found['line'], 'excerpt': found['excerpt'][:240], 'rule_id': rule['rule_id'], 'standard_id': rule['standard_id'], 'severity': found.get('severity', rule['severity']), 'message': found['message'], 'detail': detail})
    _ANALYZED_HUNKS.clear()
    return findings


def declarations(text):
    result = []
    for line in clean(text).splitlines():
        match = MAP_NAME.match(line)
        if match:
            result.append((match['name'], 'symbol:'+match['location']))
            continue
        match = TYPE_NAME.match(line) or DECL.match(line)
        if match and not re.match(r'^\s*(?:return|delete|throw|case|goto)\b', line):
            # Compare declaration prefixes and suffixes without their identifier.
            result.append((match['name'], re.sub(r'\s+', '', line[:match.start('name')]+line[match.end('name'):]).split('=')[0]))
        # Parameters have no terminal semicolon, so parse them in their own
        # declaration context. This is a conservative candidate check, not C++ AST proof.
        if '(' in line and ')' in line and DECL.match(line):
            params = line.split('(', 1)[1].split(')', 1)[0]
            for index, parameter in enumerate(params.split(',')):
                param = DECL.match(parameter.strip() + ';')
                if param:
                    result.append((param['name'], 'parameter:'+str(index)+':'+re.sub(r'\s+', '', parameter.strip()[:param.start('name')])))
    return result


def check_name_changes(hunk):
    old = declarations('\n'.join(hunk.get('removed', [])))
    new = declarations('\n'.join(text for _, text in hunk.get('added', [])))
    old_names, new_names = {n for n, _ in old}, {n for n, _ in new}
    candidates = [(a,b) for a,shape in old if a not in new_names for b,new_shape in new if b not in old_names and shape == new_shape]
    aliases = [partial(line, text, 'New identifier macro alias requires maintainer review; aliases cannot bypass the naming rule.', requires_human_review=True) for line,text in hunk.get('added', []) if re.match(r'^\s*#\s*define\s+[A-Za-z_]\w*\s+[A-Za-z_]\w*\s*$', clean(text))]
    return aliases + [partial(hunk['added'][0][0], hunk['added'][0][1], f'Declaration rename candidate {a} -> {b} requires maintainer review. Preserve the current name in autonomous output; propose the change separately for human integration.', old_name=a, new_name=b, requires_human_review=True) for a,b in sorted(set(candidates))]


def no_hunk_check(hunk):
    return []


def check_maps(findings, repo, mode, file_diffs, merge_base):
    """Validate every changed game .cpp once, fail closed on skipped/stale inputs.

    Patch-only scans cannot prove compiled map parity. SIZE warnings are retained
    as informational evidence, matching upstream policy, never a fabricated match.
    """
    paths = sorted({r['file'] for r in file_diffs if r['file'].startswith('src/') and r['file'].endswith('.cpp') and not any(fnmatch(r['file'], p) for p in VENDOR_PATHS)})
    if not paths:
        return findings
    repo = Path(repo)
    try:
        units = json.loads((repo/'objdiff.json').read_text())['units']
        mapping = {u.get('metadata', {}).get('source_path'):u for u in units}
    except (OSError, ValueError, KeyError):
        mapping = {}
    for path in paths:
        detail = {'requires_build': True, 'validation': 'map presence, order, linkage and UNUSED size'}
        message, severity = '', 'error'
        unit = mapping.get(path)
        try:
            if mode == 'diff':
                raise ValueError('Materialize the patch and build its objects before map validation; patch-only scanning is not map evidence.')
            if mode == 'head':
                status = subprocess.run(['git','status','--porcelain','--untracked-files=normal'],cwd=repo,text=True,capture_output=True,timeout=30)
                if status.returncode or status.stdout.strip():
                    raise ValueError('HEAD-only map validation requires a clean checkout so its built objects represent the scanned commit. Use worktree scanning for local edits.')
            if not unit or not unit.get('base_path'):
                raise ValueError('Changed C++ file has no built decomp unit; map validation cannot be skipped.')
            obj = repo/unit['base_path']
            if not obj.is_file():
                raise ValueError('Build the changed translation unit before map validation; its object is missing.')
            dry = subprocess.run(['ninja','-n',unit['base_path']],cwd=repo,text=True,capture_output=True,timeout=30)
            if dry.returncode or 'no work to do' not in dry.stdout:
                raise ValueError('Build inputs are stale or the Ninja freshness check failed; rebuild before map validation.')
            command = [sys.executable,str(repo/'tools/validate-symbol-order.py'),'-u',unit['name']]
            checked = subprocess.run(command,cwd=repo,text=True,capture_output=True,timeout=120)
            detail.update(command=command, exit_code=checked.returncode, output=checked.stdout+'\n'+checked.stderr)
            if checked.returncode:
                raise ValueError('Upstream symbol-map validation failed or could not run; see the preserved validator output.')
            severity = 'info'
            message = 'Symbol-map validation passed. Review any UNUSED size warnings in the validator output; they do not prove a reconstructed body matches.'
        except (OSError, ValueError, subprocess.TimeoutExpired) as error:
            message = str(error)
        findings.append({'file':path, 'line':1, 'excerpt':path, 'rule_id':'sms_symbol_map_validation','standard_id':'global_standard:sms-map-symbols','severity':severity,'message':message,'detail':detail})
    return findings


RULES = [
    {'rule_id':'sms_vendor_edit','standard_id':'global_standard:sms-game-code-only','severity':'error','applies_to':['src/**','include/**'],'check':check_vendor_edit,'message':'Autonomous SMS changes must stay in game code.'},
    {'rule_id':'sms_dummy_stack_padding','standard_id':'global_standard:sms-temporary-tactics','severity':'error','applies_to':['src/*.cpp','src/*.c','include/**'],'check':check_dummy_padding,'message':'Dummy stack padding may not be committed.'},
    {'rule_id':'sms_name_change_requires_review','standard_id':'global_standard:sms-name-review','severity':'error','applies_to':['src/**','include/**','config/GMSJ01/symbols.txt'],'check':check_name_changes,'message':'Name changes require maintainer review.'},
    {'rule_id':'sms_symbol_map_validation','standard_id':'global_standard:sms-map-symbols','severity':'error','applies_to':['src/*.cpp'],'check':no_hunk_check,'message':'Changed C++ units require built symbol-map validation.'},
]
POST_SCAN_HOOKS = [check_unused_locals_fallback, check_maps]
