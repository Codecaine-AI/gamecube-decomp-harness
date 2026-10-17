/**
 * Objdiff reports reduced in the worker sandbox.
 *
 * Unit reports (`objdiff-cli diff -u <unit> --format json-pretty`) can be
 * megabytes of instruction rows. One sandbox exec runs objdiff with the report
 * written to a sandbox file (kept there as the full artifact) and prints a
 * bounded JSON result:
 *  - `rows`: what the score snapshot and scoped checks read. Per side (`left`,
 *    `right`), the `sections` and `symbols` rows reduced to `name`, `size`,
 *    `match_percent`, `fuzzy_match_percent`, and for symbols an empty
 *    `instructions` list when the row had one (`scoredSideRows` counts a symbol
 *    as a function only then). Values are copied as-is.
 *  - `first_diff`: the target row's first-diff reduction (`firstDiffFromObjdiffReport`):
 *    per found side its raw `match_percent`, the first FIRST_DIFF_ROW_LIMIT diff
 *    rows with their raw address/size values, the per-kind counts and the total.
 *    The host only formats those raw values with the same JavaScript rules.
 *
 * `ORCH_UNIT_REPORT_PLACEMENT` (default `sandbox`) covers every worker report
 * reduction (these, the banned-idiom context and symbols.txt queries). `host`
 * is the explicit opt-in to today's full transfer and host parse; nothing falls
 * back to it automatically: a sandbox job that does not answer is a failed job.
 */
import { createHash } from "node:crypto";
import type { WorkspaceExec } from "@server/infrastructure/shell";

export const UNIT_REPORT_PLACEMENT_ENV = "ORCH_UNIT_REPORT_PLACEMENT";
const SUMMARY_SCHEMA = "worker-unit-report-summary-v2";
const UNIT_REPORT_TIMEOUT_MS = 30 * 60_000;

/** Must equal change-validation.ts FIRST_DIFF_ROW_LIMIT. */
export const SANDBOX_FIRST_DIFF_ROW_LIMIT = 40;

/**
 * argv: mode (`rows` | `first_diff`), report path, JSON objdiff command
 * (without `-o`), symbol (first_diff). Prints one JSON object: the objdiff exit
 * code, stdout and stderr, the report path, `report_error` when the report is
 * not valid JSON (NaN/Infinity literals are rejected as JSON.parse rejects
 * them), `is_object`, and the mode's bounded result.
 */
const UNIT_REPORT_JOB_PY = [
  "import json, math, os, subprocess, sys",
  "mode, report_path, command = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])",
  "symbol = sys.argv[4] if len(sys.argv) > 4 else ''",
  "LIMIT = " + String(SANDBOX_FIRST_DIFF_ROW_LIMIT),
  "os.makedirs(os.path.dirname(report_path) or '.', exist_ok=True)",
  "try:",
  "    os.remove(report_path)",
  "except OSError:",
  "    pass",
  "run = subprocess.run(command + ['-o', report_path], capture_output=True)",
  "def reject(token):",
  "    raise ValueError('invalid JSON literal ' + token)",
  // A raw value passed through for the host to format: non-finite floats (an
  // overflowing literal such as 1e400) become a marker the host turns back into
  // the same JavaScript number.
  "def raw(value):",
  "    if isinstance(value, float) and not math.isfinite(value):",
  "        return {'$nonfinite': 'Infinity' if value > 0 else '-Infinity'}",
  "    if isinstance(value, list):",
  "        return [raw(item) for item in value]",
  "    if isinstance(value, dict):",
  "        return {key: raw(item) for key, item in value.items()}",
  "    return value",
  "def row(value, symbol_row):",
  "    if not isinstance(value, dict):",
  "        return {}",
  "    out = {key: raw(value[key]) for key in ('name', 'size', 'match_percent', 'fuzzy_match_percent') if key in value}",
  "    if symbol_row and isinstance(value.get('instructions'), list):",
  "        out['instructions'] = []",
  "    return out",
  "def side(value):",
  "    if not isinstance(value, dict):",
  "        return {}",
  "    out = {}",
  "    if isinstance(value.get('sections'), list):",
  "        out['sections'] = [row(item, False) for item in value['sections']]",
  "    if isinstance(value.get('symbols'), list):",
  "        out['symbols'] = [row(item, True) for item in value['symbols']]",
  "    return out",
  "def as_dict(value):",
  "    return value if isinstance(value, dict) else {}",
  "def as_list(value):",
  "    return value if isinstance(value, list) else []",
  "def first_diff(report):",
  "    targets, rows, counts, total = [], [], {}, 0",
  "    for side_name in ('left', 'right'):",
  "        current = as_dict(report.get(side_name))",
  "        target = None",
  "        for collection in (current.get('symbols'), current.get('sections')):",
  "            for value in as_list(collection):",
  "                candidate = as_dict(value)",
  "                if isinstance(candidate.get('name'), str) and candidate['name'] == symbol:",
  "                    target = candidate",
  "                    break",
  "            if target is not None:",
  "                break",
  "        if target is None:",
  "            continue",
  "        targets.append({'side': side_name, 'match_percent': raw(target.get('match_percent'))})",
  "        found = []",
  "        for value in as_list(target.get('instructions')):",
  "            entry = as_dict(value)",
  "            instruction = as_dict(entry.get('instruction'))",
  "            explicit = entry.get('diff_kind') if isinstance(entry.get('diff_kind'), str) else ''",
  "            arg_diff = 'arg_diff' in entry and entry['arg_diff'] is not None and entry['arg_diff'] is not False",
  "            kind = explicit if explicit and explicit != 'DIFF_NONE' else ('DIFF_ARG_MISMATCH' if arg_diff else '')",
  "            if not kind:",
  "                continue",
  "            item = {'side': side_name, 'kind': kind, 'text': instruction.get('formatted') if isinstance(instruction.get('formatted'), str) else ''}",
  "            if 'address' in instruction:",
  "                item['address'] = raw(instruction['address'])",
  "            found.append(item)",
  "        for value in as_list(target.get('data_diff')):",
  "            entry = as_dict(value)",
  "            item = {'side': side_name, 'data': True, 'kind': entry.get('kind') if isinstance(entry.get('kind'), str) else 'DIFF'}",
  "            if 'size' in entry:",
  "                item['size'] = raw(entry['size'])",
  "            found.append(item)",
  "        for item in found:",
  "            counts[item['kind']] = counts.get(item['kind'], 0) + 1",
  "            total += 1",
  "            if len(rows) < LIMIT:",
  "                rows.append(item)",
  "    return {'targets': targets, 'rows': rows, 'counts': counts, 'total': total}",
  "out = {",
  "    'schema': '" + SUMMARY_SCHEMA + "',",
  "    'exit_code': run.returncode,",
  "    'stdout': run.stdout.decode('utf-8', 'replace'),",
  "    'stderr': run.stderr.decode('utf-8', 'replace'),",
  "    'report_path': report_path,",
  "}",
  "if run.returncode == 0:",
  "    parsed = None",
  "    try:",
  "        parsed = json.loads(open(report_path, 'rb').read(), parse_constant=reject)",
  "    except (OSError, ValueError) as error:",
  "        out['report_error'] = str(error)",
  "    out['is_object'] = isinstance(parsed, dict)",
  "    if isinstance(parsed, dict):",
  "        if mode == 'rows':",
  "            out['report'] = {'left': side(parsed.get('left')), 'right': side(parsed.get('right'))}",
  "        else:",
  "            out['first_diff'] = first_diff(parsed)",
  "print(json.dumps(out))",
].join("\n");

export function unitReportPlacement(env: Record<string, string | undefined> = process.env): "sandbox" | "host" {
  const raw = env[UNIT_REPORT_PLACEMENT_ENV]?.trim() || "sandbox";
  if (raw === "sandbox" || raw === "host") return raw;
  throw new Error(`Invalid ${UNIT_REPORT_PLACEMENT_ENV}: ${raw}`);
}

/** Workspace-relative sandbox directory for one worker's report artifacts (keyed by its host output dir). */
export function sandboxAttemptArtifactDir(hostOutputDir: string): string {
  return `build/worker-attempts/${createHash("sha256").update(hostOutputDir).digest("hex").slice(0, 12)}`;
}

/** Undo the `$nonfinite` markers of a raw value passed through the sandbox job. */
export function decodeSandboxRaw(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeSandboxRaw);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 1 && keys[0] === "$nonfinite") return record.$nonfinite === "-Infinity" ? -Infinity : Infinity;
    return Object.fromEntries(keys.map((key) => [key, decodeSandboxRaw(record[key])]));
  }
  return value;
}

export interface SandboxFirstDiffData {
  targets: Array<{ side: "left" | "right"; match_percent: unknown }>;
  rows: Array<{ side: "left" | "right"; kind: string; text?: string; address?: unknown; data?: true; size?: unknown }>;
  counts: Record<string, number>;
  total: number;
}

interface SandboxReportJobResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Sandbox path of the full objdiff report. */
  reportPath: string;
  /** Set when objdiff succeeded but its output is not valid JSON. */
  reportError: string | null;
  /** Whether the report is a JSON object (false when objdiff failed or reportError is set). */
  isObject: boolean;
}

export type SandboxUnitReportSummary = SandboxReportJobResult & {
  /** Reduced report; null unless objdiff succeeded with a JSON object. */
  report: Record<string, unknown> | null;
};

export type SandboxFirstDiffResult = SandboxReportJobResult & { firstDiff: SandboxFirstDiffData | null };

/** The job could not run or did not answer; never replaced by a host computation. */
export interface SandboxReportJobFailure {
  failed: true;
  exitCode: number;
  error: string;
}

async function runReportJob(
  workspaceExec: WorkspaceExec,
  args: string[],
  reportPath: string,
): Promise<{ parsed: Record<string, unknown>; base: SandboxReportJobResult } | SandboxReportJobFailure> {
  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await workspaceExec.exec(["python3", "-c", UNIT_REPORT_JOB_PY, ...args], { timeoutMs: UNIT_REPORT_TIMEOUT_MS });
  } catch (error) {
    return { failed: true, exitCode: 127, error: `sandbox report job failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  if (result.exitCode !== 0 || !parsed || parsed.schema !== SUMMARY_SCHEMA || typeof parsed.exit_code !== "number") {
    return {
      failed: true,
      exitCode: result.exitCode === 0 ? -1 : result.exitCode,
      error: `sandbox report job did not answer (exit ${result.exitCode}): ${result.stderr.trim().slice(0, 400) || "no summary"}`,
    };
  }
  return {
    parsed,
    base: {
      exitCode: parsed.exit_code,
      stdout: typeof parsed.stdout === "string" ? parsed.stdout : "",
      stderr: typeof parsed.stderr === "string" ? parsed.stderr : "",
      reportPath,
      reportError: typeof parsed.report_error === "string" ? parsed.report_error : null,
      isObject: parsed.is_object === true,
    },
  };
}

/** Run a unit diff in the sandbox and return the rows summary (the full report stays at `reportPath`). */
export async function summarizeUnitReportInSandbox(
  workspaceExec: WorkspaceExec,
  params: { command: string[]; reportPath: string },
): Promise<SandboxUnitReportSummary | SandboxReportJobFailure> {
  const job = await runReportJob(workspaceExec, ["rows", params.reportPath, JSON.stringify(params.command)], params.reportPath);
  if ("failed" in job) return job;
  const report = decodeSandboxRaw(job.parsed.report);
  return { ...job.base, report: report && typeof report === "object" && !Array.isArray(report) ? report as Record<string, unknown> : null };
}

/** Run a symbol diff in the sandbox and return its bounded first-diff reduction. */
export async function firstDiffInSandbox(
  workspaceExec: WorkspaceExec,
  params: { command: string[]; reportPath: string; symbol: string },
): Promise<SandboxFirstDiffResult | SandboxReportJobFailure> {
  const job = await runReportJob(workspaceExec, ["first_diff", params.reportPath, JSON.stringify(params.command), params.symbol], params.reportPath);
  if ("failed" in job) return job;
  const firstDiff = job.parsed.first_diff;
  return { ...job.base, firstDiff: firstDiff && typeof firstDiff === "object" ? firstDiff as SandboxFirstDiffData : null };
}
