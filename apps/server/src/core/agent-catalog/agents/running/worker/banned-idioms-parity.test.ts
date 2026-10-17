/**
 * Parity between the two banned-idiom lint implementations:
 *  - TypeScript: `loadBannedIdiomContext` (change-validation.ts) + `lintBannedIdioms` (micro-gates.ts),
 *    the host lint behind ORCH_UNIT_REPORT_PLACEMENT=host;
 *  - Python: `context_for` + `lint` in `BANNED_IDIOMS_PY` (banned-idioms-sandbox.ts), the default sandbox lint.
 * Every case of the shared corpus (__fixtures__/banned-idioms/corpus.json) runs through both, per target
 * function; any difference in gate, status or reasons fails. Cases are either an explicit context (the
 * micro-gates unit cases) or a checkout (post files, pre-attempt `base/` files, symbols.txt): the
 * change-validation and sandbox test attempts plus real SMS worker and Melee upstream diffs.
 *
 * `expected.json` records the TypeScript verdicts for the Python-only pytest
 * (`python3 -m pytest .../__fixtures__/banned-idioms`). This test fails when it is stale; regenerate it with
 * `UPDATE_BANNED_IDIOM_PARITY=1 bun test banned-idioms-parity`.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import { BANNED_IDIOMS_PY } from "./banned-idioms-sandbox.js";
import { loadBannedIdiomContext, type WorkerChangeBaseline } from "./change-validation.js";
import { lintBannedIdioms, type BannedIdiomContext, type WorkerMicroGateResult } from "./micro-gates.js";

const CORPUS_DIR = resolve(import.meta.dir, "__fixtures__/banned-idioms");
const DEFAULT_TARGETS: Array<string | null> = [null, ".data", "target"];

interface ContextCase {
  name: string;
  mode: "context";
  diff: string;
  context: { baselineSources?: Record<string, string>; postChangeSources?: Record<string, string>; symbolsTxt?: string };
  targets: Array<string | null> | null;
}
interface CheckoutCase {
  name: string;
  mode: "checkout";
  dir: string;
  basePaths: string[];
  symbolsPath: string;
  targets: Array<string | null> | null;
}
type ParityCase = ContextCase | CheckoutCase;

const corpus = JSON.parse(readFileSync(join(CORPUS_DIR, "corpus.json"), "utf8")) as { cases: ParityCase[] };

function caseDiff(entry: ParityCase): string {
  return entry.mode === "context" ? entry.diff : readFileSync(join(CORPUS_DIR, "cases", entry.dir, "diff.patch"), "utf8");
}

/** The checkout's post files answer `exec` (cat) for the host context loader. */
function checkoutExec(postDir: string): WorkspaceExec {
  const exec: WorkspaceExec["exec"] = async (command) => {
    const result = Bun.spawnSync(command, { cwd: postDir, stdout: "pipe", stderr: "pipe" });
    return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  };
  return { exec } as WorkspaceExec;
}

function toMap(record: Record<string, string> | undefined): Map<string, string> | undefined {
  return record ? new Map(Object.entries(record)) : undefined;
}

async function typescriptVerdict(entry: ParityCase, target: string | null): Promise<WorkerMicroGateResult> {
  const diff = caseDiff(entry);
  if (entry.mode === "context") {
    const context: BannedIdiomContext = {
      ...(entry.context.baselineSources ? { baselineSources: toMap(entry.context.baselineSources) } : {}),
      ...(entry.context.postChangeSources ? { postChangeSources: toMap(entry.context.postChangeSources) } : {}),
      ...(entry.context.symbolsTxt !== undefined ? { symbolsTxt: entry.context.symbolsTxt } : {}),
      ...(target !== null ? { targetFunction: target } : {}),
    };
    return lintBannedIdioms(diff, context);
  }
  const caseDir = join(CORPUS_DIR, "cases", entry.dir);
  const baseline = {
    status: "snapshot_unavailable",
    reasons: [],
    snapshot: null,
    firstDiff: null,
    sourceSnapshotDir: join(caseDir, "base"),
    sourceSnapshotPaths: entry.basePaths,
  } as WorkerChangeBaseline;
  const context = await loadBannedIdiomContext(diff, baseline, checkoutExec(join(caseDir, "post")), entry.symbolsPath, target ?? undefined);
  return lintBannedIdioms(diff, context);
}

/** Every job through the Python module in one process: explicit-context jobs call `lint`, checkout jobs `context_for` then `lint`. */
function pythonVerdicts(jobs: Array<Record<string, unknown>>): WorkerMicroGateResult[] {
  const dir = mkdtempSync(join(tmpdir(), "banned-idiom-parity-"));
  writeFileSync(join(dir, "banned_idioms.py"), BANNED_IDIOMS_PY);
  writeFileSync(join(dir, "jobs.json"), JSON.stringify(jobs));
  const driver = [
    "import json, os, sys",
    "sys.path.insert(0, sys.argv[1])",
    "import banned_idioms",
    "out = []",
    "for job in json.load(open(sys.argv[2], encoding='utf-8')):",
    "    if job['mode'] == 'context':",
    "        context = dict(job['context'])",
    "        context.setdefault('baselineSources', {})",
    "        context.setdefault('postChangeSources', {})",
    "        context['targetFunction'] = job['target']",
    "        out.append(banned_idioms.lint(job['diff'], context))",
    "    else:",
    "        os.chdir(job['postDir'])",
    "        out.append(banned_idioms.lint(job['request']['diff'], banned_idioms.context_for(job['request'])))",
    "print(json.dumps(out))",
  ].join("\n");
  const result = Bun.spawnSync(["python3", "-I", "-c", driver, dir, join(dir, "jobs.json")], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return JSON.parse(result.stdout.toString()) as WorkerMicroGateResult[];
}

function pythonJob(entry: ParityCase, target: string | null): Record<string, unknown> {
  const diff = caseDiff(entry);
  if (entry.mode === "context") return { mode: "context", diff, context: entry.context, target };
  const caseDir = join(CORPUS_DIR, "cases", entry.dir);
  return {
    mode: "checkout",
    postDir: join(caseDir, "post"),
    request: { diff, targetFunction: target ?? undefined, snapshotDir: join(caseDir, "base"), snapshotPaths: entry.basePaths, symbolsPath: entry.symbolsPath },
  };
}

describe("banned-idiom lint parity: TypeScript host lint vs sandbox Python", () => {
  test("every corpus case gives the same gate, status and reasons on every target", async () => {
    const jobs: Array<{ key: string; entry: ParityCase; target: string | null }> = [];
    for (const entry of corpus.cases) {
      for (const target of entry.targets ?? DEFAULT_TARGETS) jobs.push({ key: `${entry.name} :: ${target ?? "(no target)"}`, entry, target });
    }
    const python = pythonVerdicts(jobs.map((job) => pythonJob(job.entry, job.target)));
    const expected: Record<string, WorkerMicroGateResult> = {};
    for (const [index, job] of jobs.entries()) {
      const typescript = await typescriptVerdict(job.entry, job.target);
      expected[job.key] = typescript;
      expect({ case: job.key, verdict: python[index] }).toEqual({ case: job.key, verdict: typescript });
    }
    // The corpus exercises findings, not just clean passes, including every checkout mode case kind.
    const failing = Object.values(expected).filter((verdict) => verdict.status === "failed").length;
    expect(failing).toBeGreaterThan(40);
    expect(Object.keys(expected).some((key) => key.startsWith("real diff"))).toBe(true);

    const expectedPath = join(CORPUS_DIR, "expected.json");
    const serialized = `${JSON.stringify(expected, null, 2)}\n`;
    if (process.env.UPDATE_BANNED_IDIOM_PARITY === "1") writeFileSync(expectedPath, serialized);
    expect(readFileSync(expectedPath, "utf8")).toBe(serialized);
  });
});
