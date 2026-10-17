import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import { captureWorkerChangeBaseline, validateWidenedChange, validateWorkerChange, type WorkerChangeValidation } from "./change-validation.js";
import { UNIT_REPORT_PLACEMENT_ENV, sandboxAttemptArtifactDir } from "./unit-report-summary.js";

/** Stand-in objdiff-cli: copies fixtures/<phase>/<unit>.json to `-o` (stdout for /dev/stdout). */
const FAKE_OBJDIFF = `#!/usr/bin/env python3
import os, sys
args = sys.argv[1:]
unit, out = args[args.index('-u') + 1], args[args.index('-o') + 1]
phase = open('fixtures/phase').read().strip()
data = open(os.path.join('fixtures', phase, unit.replace('/', '_') + '.json'), 'rb').read()
if out == '/dev/stdout':
    sys.stdout.buffer.write(data)
else:
    open(out, 'wb').write(data)
`;

/** Written into the fixture as the literal 1e400 (JSON.stringify cannot express it). */
const INF = "__INF__";
const instructions = [{ instruction: { address: 0, formatted: "li r3, 0" }, diff_kind: "DIFF_REPLACE" }];

/** Several units whose reports exercise every branch the snapshot reads. */
const UNITS: Array<{ unit: string; symbol: string; before: unknown; after: unknown }> = [
  {
    unit: "main/alpha",
    symbol: "fn_a",
    before: {
      left: {
        sections: [{ name: ".text", size: "64", match_percent: 50, extra: 1 }, { name: ".data", size: 8, match_percent: 100 }],
        symbols: [
          { name: "fn_a", size: 32, match_percent: 50, instructions },
          { name: "fn_b", size: 32, fuzzy_match_percent: "75.5", instructions: [] },
          { name: "data_x", size: 4, match_percent: 100 },
        ],
      },
      right: { sections: [], symbols: [{ name: "fn_a", instructions: [] }] },
    },
    after: {
      left: {
        sections: [{ name: ".text", size: "64", match_percent: 81.25 }, { name: ".data", size: 8, match_percent: 87.5 }],
        symbols: [
          { name: "fn_a", size: 32, match_percent: 100, instructions: [] },
          { name: "fn_b", size: 32, fuzzy_match_percent: "70.1234567891", match_percent: null, instructions },
          { name: "data_x", size: 4, match_percent: 100 },
        ],
      },
      right: { symbols: [{ name: "fn_a", match_percent: 1, instructions }] },
    },
  },
  {
    unit: "main/beta",
    symbol: ".data",
    before: {
      left: { sections: [{ name: ".data", size: 16, match_percent: 25 }] },
      right: { sections: [{ name: ".data", size: 16, match_percent: 40 }, { name: ".rodata", size: 4, match_percent: 100 }] },
    },
    after: {
      left: { sections: [{ name: ".data", size: 16, match_percent: 99 }] },
      right: { sections: [{ name: ".data", size: 16, match_percent: 100 }, { name: ".rodata", size: 4, match_percent: 50 }] },
    },
  },
  {
    unit: "main/gamma",
    symbol: "fn_c",
    before: {
      left: {
        sections: [5, null, "x", { size: 3, match_percent: 10 }, { name: ".text", size: INF, match_percent: 60 }],
        symbols: [
          { name: "fn_c", size: 12, match_percent: 60.000000000000014, instructions: [] },
          { name: "fn_weird", size: "abc", match_percent: true, fuzzy_match_percent: "  42 ", instructions: [] },
          { name: 7, size: 1, match_percent: 1, instructions: [] },
        ],
      },
      right: "not a side",
    },
    after: {
      left: {
        sections: [{ name: ".text", size: INF, match_percent: INF }],
        symbols: [
          { name: "fn_c", size: 12, match_percent: 61, instructions: [] },
          { name: "fn_weird", size: "abc", match_percent: "abc", fuzzy_match_percent: "41", instructions: {} },
        ],
      },
    },
  },
  {
    unit: "main/delta",
    symbol: "fn_d",
    before: { left: { symbols: [{ name: "fn_d", size: 4, match_percent: 10, instructions: [] }] } },
    after: [{ left: {} }],
  },
];

/** First-diff rows of every shape firstDiffFromObjdiffReport handles, more than the 40-row cap. */
function diffInstructions(count: number): unknown[] {
  const shapes: unknown[] = [
    { instruction: { address: 4, formatted: "lwz r3, 0(r4)" }, diff_kind: "DIFF_REPLACE" },
    { instruction: { address: "0x10", formatted: "b 0x20" }, diff_kind: "DIFF_NONE", arg_diff: [1] },
    { instruction: { address: null, formatted: 7 }, arg_diff: 0 },
    { instruction: { formatted: "nop" }, diff_kind: "DIFF_INSERT" },
    { instruction: { address: 1.5, formatted: "li" }, arg_diff: false },
    { instruction: { address: INF, formatted: "x" }, diff_kind: "DIFF_DELETE" },
    { instruction: "not a record", diff_kind: "DIFF_OP_MISMATCH" },
    "not an entry",
    { instruction: { address: 8, formatted: "same" }, diff_kind: "DIFF_NONE" },
    { instruction: { address: [1, 2], formatted: "array address" }, diff_kind: 5, arg_diff: "yes" },
  ];
  return Array.from({ length: count }, (_, index) => shapes[index % shapes.length]);
}

const FIRST_DIFF_UNIT = {
  unit: "main/epsilon",
  symbol: "fn_e",
  report: {
    left: {
      sections: [{ name: ".text", size: 64, match_percent: 40 }],
      symbols: [
        { name: "fn_other", size: 8, match_percent: 10, instructions: [{ instruction: { formatted: "MARKER_UNSEEN" }, diff_kind: "DIFF_REPLACE" }] },
        { name: "fn_e", size: 32, match_percent: "40.5", instructions: diffInstructions(30), data_diff: [{ kind: "DIFF_DATA", size: 4 }, { size: null }, {}, { kind: "", size: INF }, 3] },
      ],
    },
    right: {
      sections: [{ name: "fn_e", size: 1, match_percent: 2 }],
      symbols: [{ name: "fn_e", size: 32, match_percent: null, instructions: diffInstructions(25) }],
    },
  },
};

/** Commands run for real in the checkout, except ninja (succeeds); every stdout the host receives is recorded. */
function localSandbox(repo: string, received: string[] = []): WorkspaceExec {
  const exec: WorkspaceExec["exec"] = async (command, options) => {
    if (command[0] === "ninja") return { exitCode: 0, stdout: "", stderr: "" };
    const result = Bun.spawnSync(command, { cwd: repo, env: { ...process.env, ...options?.env }, stdout: "pipe", stderr: "pipe" });
    received.push(result.stdout.toString());
    return { exitCode: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() };
  };
  return { exec } as WorkspaceExec;
}

function fixtureRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "unit-report-repo-"));
  mkdirSync(join(repo, "build/tools"), { recursive: true });
  writeFileSync(join(repo, "build/tools/objdiff-cli"), FAKE_OBJDIFF);
  chmodSync(join(repo, "build/tools/objdiff-cli"), 0o755);
  writeFixtures(repo, "before");
  writeFixtures(repo, "after");
  for (const phase of ["before", "after"]) {
    writeFileSync(join(repo, "fixtures", phase, "main_epsilon.json"), JSON.stringify(FIRST_DIFF_UNIT.report, null, 2).replaceAll(`"${INF}"`, "1e400"));
  }
  const units = [...UNITS, FIRST_DIFF_UNIT].map((entry) => ({ name: entry.unit, metadata: { source_path: `src/${entry.unit}.c` } }));
  writeFileSync(join(repo, "objdiff.json"), JSON.stringify({ units }));
  return repo;
}

function writeFixtures(repo: string, phase: "before" | "after"): void {
  for (const entry of UNITS) {
    mkdirSync(join(repo, "fixtures", phase), { recursive: true });
    writeFileSync(join(repo, "fixtures", phase, `${entry.unit.replace("/", "_")}.json`), JSON.stringify(entry[phase], null, 2).replaceAll(`"${INF}"`, "1e400"));
  }
}

function comparable(validation: Record<string, unknown>): Record<string, unknown> {
  const { status, reasons, target, regressions, improvements } = validation;
  return { status, reasons, target, regressions, improvements };
}

describe("per-attempt unit report summarised in the sandbox", () => {
  const saved = process.env[UNIT_REPORT_PLACEMENT_ENV];
  afterEach(() => {
    if (saved === undefined) delete process.env[UNIT_REPORT_PLACEMENT_ENV];
    else process.env[UNIT_REPORT_PLACEMENT_ENV] = saved;
  });

  test("validation and snapshots equal today's full-report parse on several units", async () => {
    const repo = fixtureRepo();
    const workspaceExec = localSandbox(repo);

    for (const entry of UNITS) {
      const target = { unit: entry.unit, symbol: entry.symbol, source_path: `src/${entry.unit}.c` };
      const outputDir = mkdtempSync(join(tmpdir(), "unit-report-out-"));
      writeFileSync(join(repo, "fixtures/phase"), "before");
      const baseline = await captureWorkerChangeBaseline({ repoRoot: repo, outputDir, target, workspaceExec });
      expect(baseline.snapshot).not.toBeNull();
      writeFileSync(join(repo, "fixtures/phase"), "after");
      const run = async (placement: "sandbox" | "host", attemptIndex: number) => {
        process.env[UNIT_REPORT_PLACEMENT_ENV] = placement;
        const result = await validateWorkerChange({
          repoRoot: repo, hostRepoRoot: repo, outputDir, attemptIndex, baseline, target,
          dryRun: false, shouldRun: true, claimedExact: false, workspaceExec,
        });
        const snapshotPath = resolve(outputDir, `attempt-${attemptIndex}.unit_snapshot.json`);
        const snapshot = existsSync(snapshotPath) ? { ...JSON.parse(readFileSync(snapshotPath, "utf8")), capturedAt: null } : null;
        return { result: result as unknown as Record<string, unknown>, snapshot };
      };
      const sandbox = await run("sandbox", 0);
      const host = await run("host", 1);

      expect(comparable(sandbox.result)).toEqual(comparable(host.result));
      expect(sandbox.snapshot).toEqual(host.snapshot);
      if (entry.unit === "main/delta") {
        expect(sandbox.result.status).toBe("snapshot_unavailable");
        continue;
      }
      expect(sandbox.snapshot).not.toBeNull();
      expect(sandbox.result.target).toBeDefined();
      if (entry.unit === "main/alpha") expect((sandbox.result.regressions as unknown[]).length).toBeGreaterThan(0);

      // The full report stays in the sandbox; the host artifact names it and holds only the summary.
      const sandboxReport = `${repo}/${sandboxAttemptArtifactDir(outputDir)}/attempt-0.unit_diff.json`;
      expect(sandbox.result.sandboxReportPath).toBe(sandboxReport);
      expect(host.result.sandboxReportPath).toBeUndefined();
      expect(readFileSync(sandboxReport, "utf8")).toBe(readFileSync(join(repo, "fixtures/after", `${entry.unit.replace("/", "_")}.json`), "utf8"));
      const summary = JSON.parse(readFileSync(String(sandbox.result.diffPath), "utf8")) as { sandbox_report_path: string; report: unknown };
      expect(summary.sandbox_report_path).toBe(sandboxReport);
      expect(JSON.stringify(summary.report)).not.toContain("formatted");
    }
  });

  test("baseline capture: first diff and snapshot equal today's host parse; only bounded results reach the host", async () => {
    const repo = fixtureRepo();
    writeFileSync(join(repo, "fixtures/phase"), "before");
    for (const entry of [...UNITS, FIRST_DIFF_UNIT]) {
      const target = { unit: entry.unit, symbol: entry.symbol, source_path: `src/${entry.unit}.c` };
      const capture = async (placement: "sandbox" | "host") => {
        process.env[UNIT_REPORT_PLACEMENT_ENV] = placement;
        const received: string[] = [];
        const outputDir = mkdtempSync(join(tmpdir(), "unit-report-baseline-"));
        const baseline = await captureWorkerChangeBaseline({ repoRoot: repo, outputDir, target, workspaceExec: localSandbox(repo, received) });
        return {
          outputDir,
          received,
          view: {
            status: baseline.status,
            reasons: baseline.reasons,
            firstDiff: baseline.firstDiff,
            snapshot: baseline.snapshot ? { ...baseline.snapshot, capturedAt: null } : null,
          },
        };
      };
      const sandbox = await capture("sandbox");
      const host = await capture("host");
      expect(sandbox.view).toEqual(host.view);
      if (entry === FIRST_DIFF_UNIT) {
        expect(sandbox.view.firstDiff?.status).toBe("available");
        expect(sandbox.view.firstDiff?.truncated).toBe(true);
        expect(sandbox.view.firstDiff?.rows).toHaveLength(40);
        // Today's host path received the whole report, including other symbols' rows.
        expect(host.received.some((stdout) => stdout.includes("MARKER_UNSEEN"))).toBe(true);
      }
      // Sandbox: no full report crosses to the host, and none is written there.
      expect(sandbox.received.some((stdout) => stdout.includes("MARKER_UNSEEN") || stdout.includes("\"instructions\": [\n"))).toBe(false);
      expect(existsSync(join(sandbox.outputDir, "pre_worker_unit_diff.json"))).toBe(false);
      if (entry.unit !== "main/delta" || existsSync(join(sandbox.outputDir, "pre_worker_unit_diff.summary.json"))) {
        expect(existsSync(join(repo, sandboxAttemptArtifactDir(sandbox.outputDir), "pre_worker_unit_diff.json"))).toBe(true);
      }
    }
  });

  test("scoped widened checks equal today's host parse", async () => {
    const repo = fixtureRepo();
    writeFileSync(join(repo, "fixtures/phase"), "after");
    const entries = [...UNITS, FIRST_DIFF_UNIT].map((entry) => ({ path: `src/${entry.unit}.c`, category: "foreign-source" }));
    const scoped = async (placement: "sandbox" | "host") => {
      process.env[UNIT_REPORT_PLACEMENT_ENV] = placement;
      const received: string[] = [];
      const outputDir = mkdtempSync(join(tmpdir(), "unit-report-scoped-"));
      const result = await validateWidenedChange({
        validation: { status: "passed", reasons: [], qaLint: null } as unknown as WorkerChangeValidation,
        repoRoot: repo,
        outputDir,
        attemptIndex: 0,
        targetSourcePath: "src/main/target.c",
        writeSetEntries: entries as never,
        baseRev: "HEAD",
        runStateDir: outputDir,
        workspaceExec: localSandbox(repo, received),
      });
      const checks = (result as unknown as { scopedChecks: { status: string; reasons: string[]; units: Array<Record<string, unknown>> } }).scopedChecks;
      return { received, view: { ...checks, evidencePath: null, units: checks.units.map(({ reportPath: _reportPath, ...unit }) => unit) } };
    };
    const sandbox = await scoped("sandbox");
    const host = await scoped("host");
    expect(sandbox.view).toEqual(host.view);
    expect(sandbox.view.units.some((unit) => unit.status === "failed" && (unit.reasons as string[]).some((reason) => reason.includes("mismatch")))).toBe(true);
    expect(sandbox.received.some((stdout) => stdout.includes("MARKER_UNSEEN"))).toBe(false);
    expect(host.received.some((stdout) => stdout.includes("MARKER_UNSEEN"))).toBe(true);
  });
});
