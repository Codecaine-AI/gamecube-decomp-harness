/**
 * The worker banned-idiom lint (micro-gates.ts `lintBannedIdioms`, with the
 * context `loadBannedIdiomContext` reads) run whole in the worker sandbox: one
 * python exec reads the diff request, the post-attempt sources, the
 * pre-attempt sandbox snapshot and symbols.txt there, and returns only the
 * gate verdict and its reasons.
 *
 * The script is a faithful port of the TypeScript: every regular expression
 * uses JavaScript's `\s`/`\S` set, ASCII `\w`/`\b`, `.` without line
 * terminators and `\Z` for a non-multiline `$`; lines split as
 * `split(/\r?\n/)`; `trim` uses JavaScript's whitespace set; replacement
 * templates follow String.prototype.replace; sources are decoded as UTF-8 with
 * replacement, as the exec transport decodes them. `ORCH_UNIT_REPORT_PLACEMENT=host`
 * is the explicit opt-in to the host lint.
 *
 * Twin implementation: `lintBannedIdioms` (micro-gates.ts) with
 * `loadBannedIdiomContext` (change-validation.ts). Change both together; the
 * parity test banned-idioms-parity.test.ts (and its pytest twin
 * __fixtures__/banned-idioms/test_banned_idioms_parity.py) fails on any
 * difference over the shared corpus in __fixtures__/banned-idioms/.
 */
import type { WorkspaceExec } from "@server/infrastructure/shell";
import { uploadThroughExec } from "@server/core/validation/steering/steering-check.js";
import type { WorkerMicroGateResult } from "./micro-gates.js";

const BANNED_IDIOMS_TIMEOUT_MS = 120_000;

/** argv: path of the JSON request {diff, targetFunction, snapshotDir, snapshotPaths, symbolsPath}. Prints the gate result. */
export const BANNED_IDIOMS_PY = String.raw`# Port of lintBannedIdioms (micro-gates.ts) + loadBannedIdiomContext (change-validation.ts).
# Keep in step with them: banned-idioms-parity.test.ts and __fixtures__/banned-idioms/test_banned_idioms_parity.py check parity.
import json, os, re, sys

A = re.ASCII
WS = '\t\n\x0b\x0c\r    -     　﻿'
S = '[' + WS + ']'
NS = '[^' + WS + ']'
DOT = '[^\n\r  ]'
TRIM = '\t\n\x0b\x0c\r                  　﻿'
TERM = '[\n\r  ]'
ID = '[A-Za-z_][A-Za-z0-9_]*'

def rx(pattern, flags=0):
    return re.compile(pattern, A | flags)

def js_lines(text):
    parts = text.split('\n')
    return [part[:-1] if index < len(parts) - 1 and part.endswith('\r') else part for index, part in enumerate(parts)]

def js_slice(text, start, end):
    if end < 0:
        end = max(len(text) + end, 0)
    return text[start:end]

def js_replace_template(template, match, whole):
    out, index = [], 0
    while index < len(template):
        char = template[index]
        if char == '$' and index + 1 < len(template):
            nxt = template[index + 1]
            if nxt == '$':
                out.append('$'); index += 2; continue
            if nxt == '&':
                out.append(match.group(0)); index += 2; continue
            if nxt == chr(96):
                out.append(whole[:match.start()]); index += 2; continue
            if nxt == "'":
                out.append(whole[match.end():]); index += 2; continue
        out.append(char)
        index += 1
    return ''.join(out)

def js_replace_first(pattern, text, template):
    match = pattern.search(text)
    if not match:
        return text
    return text[:match.start()] + js_replace_template(template, match, text) + text[match.end():]

BLOCK_COMMENT = rx(r'/\*' + DOT + r'*?(?:\*/|\Z)')
LINE_COMMENT = rx(r'//' + DOT + r'*\Z')
DQ = rx(r'"(?:\\' + DOT + r'|[^"\\])*"')
SQ = rx(r"'(?:\\" + DOT + r"|[^'\\])*'")

def strip_line(source):
    source = BLOCK_COMMENT.sub(' ', source)
    source = LINE_COMMENT.sub(' ', source, count=1)
    source = DQ.sub(' ', source)
    return SQ.sub(' ', source)

LINTED = rx(r'\.(?:c|h|cpp|hpp|cc|hh)\Z', re.IGNORECASE)
DIFF_FILE = rx(r'^diff --git a/(' + DOT + r'+?) b/(' + DOT + r'+)\Z')
STATIC_START = rx(r'^' + S + r'*static\b')
STATIC_PREFIX = rx(r'^' + S + r'*static' + S + r'+')
OBJECT_TERMINATOR = rx(r'[=\[;]')
NAME_AT_END = rx(r'(' + ID + r')' + S + r'*\Z')
IDENTIFIER = rx(ID)
STATIC_FUNCTION = rx(r'^' + S + r'*static\b[^=;(]*\b(' + ID + r')' + S + r'*\(')
SECTION_ORDER_HACK = rx(r'order|force' + DOT + r'*order|order' + DOT + r'*sdata|sdata' + DOT + r'*order', re.IGNORECASE)
SECTION_EMITTER = rx(r'dummy|order|force|pad|filler', re.IGNORECASE)
STATIC_DEFINITION = rx(r'^' + S + r'*static\b[^=;]*\b(' + ID + r')' + S + r'*\([^;]*\Z')
SHORT_LONG = rx(r'\b(?:short|long)\b')
KR_FUNCTION = rx(r'^' + S + r'*(?:static' + S + r'+)?' + ID + r'(?:' + S + r'+' + ID + r')*' + S + r'*\**' + S + r'*' + ID + S + r'*\(' + S + r'*' + ID + r'(?:' + S + r'*,' + S + r'*' + ID + r')*' + S + r'*\)' + S + r'*\Z')
CONTROL_KEYWORDS = {'if', 'for', 'while', 'switch', 'return', 'else', 'do', 'goto', 'case'}
TYPE_KEYWORDS = {'void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned', 'struct', 'union', 'enum'}

def declaration_name(line):
    paren = line.find('(')
    terminator = OBJECT_TERMINATOR.search(line)
    terminator = terminator.start() if terminator else -1
    end = paren if paren >= 0 and (terminator < 0 or paren < terminator) else terminator
    if end < 0:
        return None
    prefix = line[:end].strip(TRIM)
    match = NAME_AT_END.search(prefix)
    if not match:
        return None
    before = prefix[:match.start()].rstrip(TRIM)
    if before.endswith('.') or before.endswith('->'):
        return None
    identifiers = IDENTIFIER.findall(prefix)
    if len(identifiers) < 2:
        return None
    if len(identifiers) == 2 and identifiers[0] in ('struct', 'union', 'enum'):
        return None
    return match.group(1)

def static_declaration_name(line):
    if not STATIC_START.search(line):
        return None
    return declaration_name(js_replace_first(STATIC_PREFIX, line, ''))

def starts_non_space(line):
    return bool(line) and re.match(NS, line) is not None

def is_non_static_declaration_of(line, name):
    if not starts_non_space(line) or re.match(r'static\b', line, A):
        return False
    return declaration_name(line) == name

def baseline_declares_non_static(source, name):
    if not source:
        return False
    return any(starts_non_space(line) and is_non_static_declaration_of(strip_line(line), name) for line in js_lines(source))

def finding_reason(pattern, line):
    return '%s: "%s"' % (pattern, line.strip(TRIM).replace('"', '\\"'))

def is_kr_style_header(body):
    if not KR_FUNCTION.search(body) or re.search(r'[;{=]', body):
        return False
    open_index = body.find('(')
    before_paren = js_slice(body, 0, open_index)
    identifiers = IDENTIFIER.findall(before_paren)
    params = [part.strip(TRIM) for part in js_slice(body, open_index + 1, body.rfind(')')).split(',')]
    return len(identifiers) >= 2 and identifiers[0] not in CONTROL_KEYWORDS and all(param not in TYPE_KEYWORDS for param in params)

HAS_BRACE = rx(r'[{}]')
CALL_THEN_SEMI = rx(r'\([^)]*\)' + S + r'*;')
TYPEDEF_EXTERN = rx(r'^(?:typedef|extern)\b')
TRAILING_ATTRIBUTE = rx(S + r'+(__attribute__' + S + r'*\(\(' + DOT + r'*\)\)|__declspec' + S + r'*\(' + DOT + r'*\))' + S + r'*\Z')
DECLARATOR = rx(r'\b(' + ID + r')' + S + r'*(\[[^\]]*\])?' + S + r'*\Z')
WHITESPACE_RUN = rx(S + r'+')

def declaration_from_line(line):
    if ';' not in line or HAS_BRACE.search(line) or CALL_THEN_SEMI.search(line):
        return None
    declaration = line[:line.find(';')].split('=')[0].strip(TRIM)
    if not declaration or TYPEDEF_EXTERN.search(declaration):
        return None
    attribute_match = TRAILING_ATTRIBUTE.search(declaration)
    trailing = attribute_match.group(1) if attribute_match else ''
    declarator = declaration[:declaration.rfind(trailing)].strip(TRIM) if trailing else declaration
    match = DECLARATOR.search(declarator)
    if not match or not match.group(1):
        return None
    name = match.group(1)
    array = WHITESPACE_RUN.sub('', match.group(2)) if match.group(2) is not None else ''
    shape_re = rx(r'\b' + re.escape(name) + r'\b' + S + r'*(?:\[[^\]]*\])?' + S + r'*\Z')
    shape = WHITESPACE_RUN.sub(' ', js_replace_first(shape_re, declarator, '@' + array)).strip(TRIM)
    if trailing:
        shape += ' ' + WHITESPACE_RUN.sub(' ', trailing)
    return {'name': name, 'shape': shape}

def brace_delta(line):
    return line.count('{') - line.count('}')

def file_scope_declarations(source):
    declarations, depth = {}, 0
    for raw in js_lines(source):
        line = strip_line(raw)
        if depth == 0:
            declaration = declaration_from_line(line)
            if declaration:
                declarations[declaration['name']] = declaration
        depth += brace_delta(line)
    return declarations

HEADER = rx(r'^' + S + r'*(?:(?:static|inline)' + S + r'+)*(?:' + ID + S + r'+)+\**' + S + r'*(' + ID + r')' + S + r'*\([^;{}]*\)' + S + r'*\{')
HEADER_NO_BRACE = rx(r'^' + S + r'*(?:(?:static|inline)' + S + r'+)*(?:' + ID + S + r'+)+\**' + S + r'*(' + ID + r')' + S + r'*\([^;{}]*\)' + S + r'*\Z')
OPENING_BRACE = rx(r'^' + S + r'*\{')

def functions_referencing(source, symbol):
    references = []
    symbol_re = rx(r'\b' + re.escape(symbol) + r'\b')
    current, pending, depth = None, None, 0
    for raw in js_lines(source):
        line = strip_line(raw)
        if depth == 0:
            header = HEADER.search(line)
            current = header.group(1) if header and header.group(1) not in CONTROL_KEYWORDS else None
            without = HEADER_NO_BRACE.search(line)
            if without and without.group(1) not in CONTROL_KEYWORDS:
                pending = without.group(1)
            if not current and pending and OPENING_BRACE.search(line):
                current = pending
        if current and symbol_re.search(line) and current not in references:
            references.append(current)
        depth += brace_delta(line)
        if depth == 0 and not pending:
            current = None
        if current and depth > 0:
            pending = None
        if current and depth == 0 and '}' in line:
            current = None
    return references

ARRAY_PART = rx(r'@(\[[^\]]*\])')
ATTRIBUTE_WORD = rx(r'__(?:attribute|declspec)__?\b')
LEADING_CONST = rx(r'^const' + S + r'+')

def object_has_qualifier(shape, qualifier):
    before_name = js_slice(shape, 0, shape.find('@'))
    if qualifier == 'const' and '*' in before_name and rx(r'^const\b').search(before_name):
        return rx(r'\*[^*]*\bconst\b').search(before_name) is not None
    return rx(r'\b' + qualifier + r'\b').search(before_name) is not None

def describe_declaration_change(before, after):
    before_match, after_match = ARRAY_PART.search(before), ARRAY_PART.search(after)
    before_array = before_match.group(1) if before_match else ''
    after_array = after_match.group(1) if after_match else ''
    if before_array != after_array:
        return "array size changed from '%s' to '%s'" % (before_array or 'scalar', after_array or 'scalar')
    for qualifier in ('volatile', 'const', 'register'):
        before_has, after_has = object_has_qualifier(before, qualifier), object_has_qualifier(after, qualifier)
        if before_has != after_has:
            return '%s %s' % (qualifier, 'added' if after_has else 'removed')
    if ATTRIBUTE_WORD.search(before) or ATTRIBUTE_WORD.search(after):
        return 'alignment/section attribute changed from "%s" to "%s"' % (before, after)
    def without_pointee_const(shape):
        return js_replace_first(LEADING_CONST, shape, '') if '*' in shape else shape
    if without_pointee_const(before) == without_pointee_const(after):
        return None
    return 'declared type changed from "%s" to "%s"' % (before, after)

def shared_global_qualifier_changes(added, removed, baseline_source, post_source, target_function):
    if not baseline_source or not post_source:
        return []
    before_globals = file_scope_declarations(baseline_source)
    after_globals = file_scope_declarations(post_source)
    added_names = list(dict.fromkeys(d['name'] for d in (declaration_from_line(e['stripped']) for e in added) if d))
    removed_names = set(d['name'] for d in (declaration_from_line(e['stripped']) for e in removed) if d)
    reasons = []
    for name in [n for n in added_names if n in removed_names]:
        before, after = before_globals.get(name), after_globals.get(name)
        if not before or not after or before['shape'] == after['shape']:
            continue
        change = describe_declaration_change(before['shape'], after['shape'])
        if not change:
            continue
        readers = [fn for fn in functions_referencing(post_source, name) if not target_function or fn != target_function]
        if (len(readers) == 0) if target_function else (len(readers) < 2):
            continue
        reasons.append("qualifier_changed_on_shared_global: '%s' %s; shared global referenced by %d other functions; changing its qualifiers alters their codegen" % (name, change, len(readers)))
    return reasons

SYMBOL_NAME = rx(r'^' + S + r'*([A-Za-z_$.@][^' + WS + r'=]*)' + S + r'*=')
SCOPE_GLOBAL = rx(r'\bscope' + S + r'*:' + S + r'*global\b')

def symbols_globals(text):
    out = set()
    for line in js_lines(text or ''):
        match = SYMBOL_NAME.search(line)
        if match and SCOPE_GLOBAL.search(line):
            out.add(match.group(1))
    return out

def lint(diff_text, context):
    if not diff_text.strip(TRIM):
        return {'gate': 'banned_idioms', 'status': 'skipped', 'reasons': ['empty write_set diff']}
    target_function = context.get('targetFunction')
    is_section_target = bool(target_function) and target_function.startswith('.')
    lines_by_path, removed_by_path, current = {}, {}, ''
    for line in js_lines(diff_text):
        file_match = DIFF_FILE.search(line)
        if file_match:
            current = file_match.group(2) if LINTED.search(file_match.group(2)) else ''
            continue
        if not current or (not line.startswith('+') and not line.startswith('-')) or line.startswith('+++') or line.startswith('---'):
            continue
        body = line[1:]
        target = lines_by_path if line.startswith('+') else removed_by_path
        target.setdefault(current, []).append({'body': body, 'stripped': strip_line(body)})
    reasons = []
    global_symbols = symbols_globals(context.get('symbolsTxt'))
    baselines, posts = context['baselineSources'], context['postChangeSources']
    for path, entries in lines_by_path.items():
        removed = removed_by_path.get(path, [])
        if not is_section_target:
            reasons.extend(shared_global_qualifier_changes(entries, removed, baselines.get(path), posts.get(path), target_function))
        definitions = []
        for entry in entries:
            static_name = static_declaration_name(entry['stripped'])
            if static_name:
                was_non_static = any(is_non_static_declaration_of(line['stripped'], static_name) for line in removed) or baseline_declares_non_static(baselines.get(path), static_name)
                reason = 'symbols.txt global' if static_name in global_symbols else ('previously non-static' if was_non_static else None)
                if reason and not is_section_target:
                    reasons.append("static_added_to_global_symbol: '%s' gains static but is %s: \"%s\"" % (static_name, reason, entry['body'].strip(TRIM).replace('"', '\\"')))
            static_function = STATIC_FUNCTION.search(entry['stripped'])
            if static_function and static_function.group(1) and SECTION_ORDER_HACK.search(static_function.group(1)):
                reasons.append(finding_reason('section-order-hack', entry['body']))
            definition = STATIC_DEFINITION.search(entry['stripped'])
            if definition and definition.group(1):
                definitions.append(dict(entry, name=definition.group(1)))
            if SHORT_LONG.search(entry['stripped']):
                reasons.append(finding_reason('bare-short-or-long', entry['body']))
            if is_kr_style_header(entry['stripped']):
                reasons.append(finding_reason('kr-style-declaration', entry['body']))
        for definition in definitions:
            name = re.escape(definition['name'])
            declaration_shape = rx(r'^' + S + r'*static\b[^=;]*\b' + name + S + r'*\(')
            name_pattern = rx(r'\b' + name + r'\b')
            post = posts.get(path)
            candidates = [e['stripped'] for e in entries] if post is None else [strip_line(line) for line in js_lines(post)]
            in_file = any(not declaration_shape.search(line) and name_pattern.search(line) for line in candidates)
            in_other = any(other != path and any(name_pattern.search(e['stripped']) for e in other_entries) for other, other_entries in lines_by_path.items())
            section_emitter = is_section_target and SECTION_EMITTER.search(definition['name']) is not None
            if not (in_file or in_other) or section_emitter:
                reasons.append(finding_reason('unused-static-function', definition['body']))
    return {'gate': 'banned_idioms', 'status': 'failed' if reasons else 'passed', 'reasons': reasons}

NEEDS_STATIC = rx(r'^\+' + S + r'*static\b')
ADDED_STATEMENT = rx(r'^\+[^+]' + DOT + r'*;')
REMOVED_STATEMENT = rx(r'^-[^-]' + DOT + r'*;')
CHANGED_PATH = rx(r'(?:\A|(?<=' + TERM + r'))diff --git a/' + DOT + r'+? b/(' + DOT + r'+)(?=' + TERM + r'|\Z)')
C_OR_H = rx(r'\.(?:c|h)\Z', re.IGNORECASE)

def read_text(path):
    try:
        return open(path, 'rb').read().decode('utf-8', 'replace')
    except OSError:
        return None

def context_for(request):
    diff_text = request['diff']
    context = {'baselineSources': {}, 'postChangeSources': {}, 'targetFunction': request.get('targetFunction'), 'symbolsTxt': None}
    lines = js_lines(diff_text)
    needs = any(NEEDS_STATIC.search(l) for l in lines) or (any(ADDED_STATEMENT.search(l) for l in lines) and any(REMOVED_STATEMENT.search(l) for l in lines))
    if not needs:
        return context
    changed = [p for p in dict.fromkeys(m.group(1) for m in CHANGED_PATH.finditer(diff_text)) if C_OR_H.search(p)]
    snapshot_dir, snapshot_paths = request.get('snapshotDir'), set(request.get('snapshotPaths') or [])
    for path in changed:
        if snapshot_dir and path in snapshot_paths:
            text = read_text(os.path.join(snapshot_dir, path))
            if text is not None:
                context['baselineSources'][path] = text
        text = read_text(path)
        if text is not None:
            context['postChangeSources'][path] = text
    context['symbolsTxt'] = read_text(request['symbolsPath'])
    return context

if __name__ == '__main__':
    request = json.loads(open(sys.argv[1], 'rb').read().decode('utf-8'))
    print(json.dumps(lint(request['diff'], context_for(request))))
`;

export interface BannedIdiomSandboxRequest {
  /** The attempt's write-set diff (what the host lint receives). */
  diff: string;
  targetFunction?: string;
  /** Workspace-relative pre-attempt snapshot (the QA twin) and the paths it holds. */
  snapshotDir: string | null;
  snapshotPaths: string[];
  symbolsPath: string;
}

/**
 * Run the banned-idiom lint in the sandbox. The request (diff included) is
 * uploaded to `requestPath`; a job that does not answer is `tool_unavailable`,
 * never a host lint.
 */
export async function lintBannedIdiomsInSandbox(
  workspaceExec: WorkspaceExec,
  request: BannedIdiomSandboxRequest,
  requestPath: string,
): Promise<WorkerMicroGateResult> {
  const gate = "banned_idioms" as const;
  const unavailable = (toolError: string): WorkerMicroGateResult => ({ gate, status: "tool_unavailable", reasons: [], toolError });
  try {
    await uploadThroughExec(workspaceExec, requestPath, JSON.stringify(request));
  } catch (error) {
    return unavailable(`banned-idiom request upload failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await workspaceExec.exec(["python3", "-c", BANNED_IDIOMS_PY, requestPath], { timeoutMs: BANNED_IDIOMS_TIMEOUT_MS });
  } catch (error) {
    return unavailable(`banned-idiom lint failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const parsed = JSON.parse(result.stdout) as { gate?: unknown; status?: unknown; reasons?: unknown };
    if (result.exitCode !== 0 || parsed.gate !== gate || (parsed.status !== "passed" && parsed.status !== "failed" && parsed.status !== "skipped") || !Array.isArray(parsed.reasons)) {
      throw new Error("malformed answer");
    }
    return { gate, status: parsed.status, reasons: parsed.reasons.map(String) };
  } catch {
    return unavailable(`banned-idiom lint did not answer (exit ${result.exitCode}): ${result.stderr.trim().slice(-400)}`);
  }
}
