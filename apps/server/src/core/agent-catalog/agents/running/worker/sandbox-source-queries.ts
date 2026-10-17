/**
 * Bounded source and symbols.txt queries run in the worker sandbox, so the
 * micro-gates never transfer or parse whole files on the host.
 *
 * Both scripts reproduce the host parse exactly: lines split as
 * `split(/\r?\n/)` does, and symbols.txt entries matched with
 * `parseSymbolsTxt`'s two regular expressions, using JavaScript's `\s` set and
 * ASCII word boundaries. `ORCH_UNIT_REPORT_PLACEMENT=host` (unit-report-summary.ts)
 * is the explicit opt-in to the old host reads.
 */
import type { WorkspaceExec } from "@server/infrastructure/shell";

const QUERY_TIMEOUT_MS = 120_000;

/** Python helpers shared by both scripts: JavaScript `\s`, `split(/\r?\n/)`, and the symbols.txt line regexes. */
const PY_COMMON = [
  "import json, re, sys",
  "WS = '\\t\\n\\x0b\\x0c\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'",
  "NAME_RE = re.compile('^[' + WS + ']*([A-Za-z_$.@][^' + WS + '=]*)[' + WS + ']*=', re.ASCII)",
  "SCOPE_RE = re.compile('\\\\bscope[' + WS + ']*:[' + WS + ']*global\\\\b', re.ASCII)",
  "def js_lines(text):",
  "    parts = text.split('\\n')",
  "    return [part[:-1] if index < len(parts) - 1 and part.endswith('\\r') else part for index, part in enumerate(parts)]",
  "def read_text(path):",
  "    return open(path, 'rb').read().decode('utf-8', 'replace')",
  "def symbol_hits(text, names):",
  "    wanted, present, globals_ = set(names), set(), set()",
  "    for line in js_lines(text):",
  "        match = NAME_RE.search(line)",
  "        if not match or match.group(1) not in wanted:",
  "            continue",
  "        present.add(match.group(1))",
  "        if SCOPE_RE.search(line):",
  "            globals_.add(match.group(1))",
  "    return sorted(present), sorted(globals_)",
];

/** argv: symbols.txt path, JSON names. Prints {"all": [...], "globals": [...]} for the queried names; a read error prints cat's message and exits 1. */
const SYMBOLS_QUERY_PY = [
  ...PY_COMMON,
  "path, names = sys.argv[1], json.loads(sys.argv[2])",
  "try:",
  "    text = read_text(path)",
  "except OSError as error:",
  "    sys.stderr.write('cat: %s: %s\\n' % (path, error.strerror or error))",
  "    sys.exit(1)",
  "present, globals_ = symbol_hits(text, names)",
  "print(json.dumps({'all': present, 'globals': globals_}))",
].join("\n");

export type SymbolsQueryResult =
  | { all: ReadonlySet<string>; globals: ReadonlySet<string>; error: null }
  | { all: null; globals: null; error: string };

/** Which of `names` symbols.txt defines (and which as `scope:global`), answered in the sandbox. */
export async function querySymbolsTxtInSandbox(workspaceExec: WorkspaceExec, symbolsTxtPath: string, names: string[]): Promise<SymbolsQueryResult> {
  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await workspaceExec.exec(["python3", "-c", SYMBOLS_QUERY_PY, symbolsTxtPath, JSON.stringify(names)], { timeoutMs: QUERY_TIMEOUT_MS });
  } catch (error) {
    return { all: null, globals: null, error: error instanceof Error ? error.message : String(error) };
  }
  if (result.exitCode !== 0) {
    return { all: null, globals: null, error: result.stderr.trim() || `symbols.txt query of ${symbolsTxtPath} exited with code ${result.exitCode}` };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { all?: unknown; globals?: unknown };
    if (!Array.isArray(parsed.all) || !Array.isArray(parsed.globals)) throw new Error("malformed answer");
    return { all: new Set(parsed.all.map(String)), globals: new Set(parsed.globals.map(String)), error: null };
  } catch {
    return { all: null, globals: null, error: `symbols.txt query of ${symbolsTxtPath} returned no answer: ${result.stdout.trim().slice(0, 200)}` };
  }
}

/**
 * argv: JSON source paths. Prints {"units": {source: name | null}} from the
 * workspace objdiff.json with `objdiffUnitNameForSource`'s rules (first unit
 * whose normalised `metadata.source_path` matches; `name` when it is a string,
 * else the path without `src/`; "" becomes null), or {"units": null} when the
 * file is unreadable or not valid JSON (NaN/Infinity literals rejected as
 * JSON.parse rejects them).
 */
const OBJDIFF_UNIT_NAMES_PY = [
  "import json, sys",
  "sources = json.loads(sys.argv[1])",
  "def normalize(path):",
  "    path = path.replace('\\\\', '/')",
  "    return path[2:] if path.startswith('./') else path",
  "def reject(token):",
  "    raise ValueError(token)",
  "try:",
  "    config = json.loads(open('objdiff.json', 'rb').read().decode('utf-8', 'replace'), parse_constant=reject)",
  "except (OSError, ValueError):",
  "    print(json.dumps({'units': None}))",
  "    sys.exit(0)",
  "units = config.get('units') if isinstance(config, dict) and isinstance(config.get('units'), list) else []",
  "found = {}",
  "for source in sources:",
  "    wanted, name = normalize(source), None",
  "    for value in units:",
  "        if not isinstance(value, dict):",
  "            continue",
  "        metadata = value.get('metadata') if isinstance(value.get('metadata'), dict) else {}",
  "        candidate = normalize(metadata.get('source_path') if isinstance(metadata.get('source_path'), str) else '')",
  "        if candidate == wanted:",
  "            name = value.get('name') if isinstance(value.get('name'), str) else (candidate[4:] if candidate.startswith('src/') else candidate)",
  "            name = name or None",
  "            break",
  "    found[source] = name",
  "print(json.dumps({'units': found}))",
].join("\n");

/** Source path → objdiff unit name, resolved in the sandbox; null entries for unmatched sources, null overall when objdiff.json is unusable or the query failed. */
export async function objdiffUnitNamesInSandbox(workspaceExec: WorkspaceExec, sourcePaths: string[]): Promise<Record<string, string | null> | null> {
  try {
    const result = await workspaceExec.exec(["python3", "-c", OBJDIFF_UNIT_NAMES_PY, JSON.stringify(sourcePaths)], { timeoutMs: QUERY_TIMEOUT_MS });
    if (result.exitCode !== 0) return null;
    const units = (JSON.parse(result.stdout) as { units?: unknown }).units;
    if (!units || typeof units !== "object") return null;
    return Object.fromEntries(Object.entries(units).map(([source, name]) => [source, typeof name === "string" ? name : null]));
  } catch {
    return null;
  }
}

/**
 * `resolveConfigUnitsFromHunks` in the sandbox: the metadata diff against the
 * claim base, its hunk addresses (`configHunkAddresses`), and the TU ranges of
 * the current and base splits.txt (`parseSplitUnitRanges`), all with
 * JavaScript's `\s`/`\S`, `.` and ASCII `\w`/`\b`. argv: base rev, metadata
 * path, splits path. Prints {"units": [...]} (unsorted; the host sorts).
 */
const CONFIG_UNITS_PY = [
  "import json, re, subprocess, sys",
  "base, metadata, splits = sys.argv[1], sys.argv[2], sys.argv[3]",
  "WS = '\\t\\n\\x0b\\x0c\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'",
  "DOT = '[^\\n\\r\\u2028\\u2029]'",
  "UNIT_RE = re.compile('^([^' + WS + ']' + DOT + '*?):[' + WS + ']*\\\\Z', re.ASCII)",
  "SECTION_RE = re.compile('^[' + WS + ']+\\\\.\\\\w+[' + WS + ']+' + DOT + '*?start:0x([0-9a-f]+)[' + WS + ']+end:0x([0-9a-f]+)', re.ASCII | re.IGNORECASE)",
  "ADDRESS_RE = re.compile('0x([0-9a-f]{8})\\\\b', re.ASCII | re.IGNORECASE)",
  "SOURCE_RE = re.compile('\\\\.(?:c|cc|cpp|cxx)\\\\Z', re.IGNORECASE)",
  "TRIM = '\\t\\n\\x0b\\x0c\\r \\u00a0\\u1680\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'",
  "def js_lines(text):",
  "    parts = text.split('\\n')",
  "    return [part[:-1] if index < len(parts) - 1 and part.endswith('\\r') else part for index, part in enumerate(parts)]",
  "def source_for_unit(unit):",
  "    path = unit.strip(TRIM).replace('\\\\', '/')",
  "    if path.startswith('./'):",
  "        path = path[2:]",
  "    if path.endswith('.o'):",
  "        path = path[:-2] + '.c'",
  "    if not SOURCE_RE.search(path):",
  "        return None",
  "    return path if path.startswith('src/') else 'src/' + path",
  "def ranges(text):",
  "    out, source = [], None",
  "    for line in js_lines(text):",
  "        unit = UNIT_RE.match(line)",
  "        if unit:",
  "            source = None if unit.group(1) == 'Sections' else source_for_unit(unit.group(1))",
  "            continue",
  "        if not source:",
  "            continue",
  "        section = SECTION_RE.match(line)",
  "        if not section:",
  "            continue",
  "        start, end = float(int(section.group(1), 16)), float(int(section.group(2), 16))",
  "        if end >= start:",
  "            out.append((source, start, end))",
  "    return out",
  "def run(command):",
  "    return subprocess.run(command, capture_output=True)",
  "diff = run(['git', 'diff', '--unified=0', base, '--', metadata])",
  "if diff.returncode != 0:",
  "    print(json.dumps({'units': []}))",
  "    sys.exit(0)",
  "addresses = set()",
  "for line in js_lines(diff.stdout.decode('utf-8', 'replace')):",
  "    if (not line.startswith('+') and not line.startswith('-')) or line.startswith('+++') or line.startswith('---'):",
  "        continue",
  "    for match in ADDRESS_RE.finditer(line):",
  "        addresses.add(int(match.group(1), 16))",
  "if not addresses:",
  "    print(json.dumps({'units': []}))",
  "    sys.exit(0)",
  "try:",
  "    current = open(splits, 'rb').read().decode('utf-8', 'replace')",
  "except OSError:",
  "    current = ''",
  "shown = run(['git', 'show', base + ':' + splits])",
  "all_ranges = ranges(current) + (ranges(shown.stdout.decode('utf-8', 'replace')) if shown.returncode == 0 else [])",
  "units = {source for address in addresses for (source, start, end) in all_ranges if start <= address <= end}",
  "print(json.dumps({'units': sorted(units)}))",
].join("\n");

/** Units whose split ranges a metadata edit touches, resolved in the sandbox; null when the query did not answer. */
export async function configUnitsInSandbox(workspaceExec: WorkspaceExec, params: { baseRev: string; metadataPath: string; splitsPath: string }): Promise<string[] | null> {
  try {
    const result = await workspaceExec.exec(["python3", "-c", CONFIG_UNITS_PY, params.baseRev, params.metadataPath, params.splitsPath], { timeoutMs: QUERY_TIMEOUT_MS });
    if (result.exitCode !== 0) return null;
    const units = (JSON.parse(result.stdout) as { units?: unknown }).units;
    return Array.isArray(units) ? units.map(String).sort() : null;
  } catch {
    return null;
  }
}

/**
 * `objdiffReportConfigArgs` in the sandbox: the first `objdiff_report_args = …`
 * line of build.ninja (JavaScript `/^objdiff_report_args\s*=\s*(.+)$/m`, so
 * `^`/`$` at any line terminator and `\s` spanning them), its tokens split on
 * `\s+`, and every `--config`/`-c` value. Prints {"args": [...]}; an
 * unreadable build.ninja gives no args, as on the host.
 */
const OBJDIFF_REPORT_ARGS_PY = [
  "import json, re",
  "WS = '\\t\\n\\x0b\\x0c\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'",
  "TRIM = '\\t\\n\\x0b\\x0c\\r \\u00a0\\u1680\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff'",
  "TERM = '[\\n\\r\\u2028\\u2029]'",
  "LINE_RE = re.compile('(?:\\\\A|(?<=' + TERM + '))objdiff_report_args[' + WS + ']*=[' + WS + ']*([^\\n\\r\\u2028\\u2029]+)(?=' + TERM + '|\\\\Z)', re.ASCII)",
  "args = []",
  "try:",
  "    ninja = open('build.ninja', 'rb').read().decode('utf-8', 'replace')",
  "except OSError:",
  "    ninja = None",
  "if ninja is not None:",
  "    match = LINE_RE.search(ninja)",
  "    tokens = [token for token in re.split('[' + WS + ']+', match.group(1).strip(TRIM)) if token] if match else []",
  "    for index in range(len(tokens) - 1):",
  "        if tokens[index] in ('--config', '-c'):",
  "            args.extend(['--config', tokens[index + 1]])",
  "print(json.dumps({'args': args}))",
].join("\n");

/** The objdiff `--config` arguments from the sandbox build.ninja; null when the query did not answer. */
export async function objdiffReportArgsInSandbox(workspaceExec: WorkspaceExec): Promise<string[] | null> {
  try {
    const result = await workspaceExec.exec(["python3", "-c", OBJDIFF_REPORT_ARGS_PY], { timeoutMs: QUERY_TIMEOUT_MS });
    if (result.exitCode !== 0) return null;
    const args = (JSON.parse(result.stdout) as { args?: unknown }).args;
    return Array.isArray(args) ? args.map(String) : null;
  } catch {
    return null;
  }
}
