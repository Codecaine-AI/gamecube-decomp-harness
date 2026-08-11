import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { boardMeasuresFromReportSummary } from "./dashboard-artifacts.js";
import { computeReportReuseKey, forceReportRun } from "./run.js";

let tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "report-run-"));
  tempDirs.push(dir);
  return dir;
}

function writeExecutable(path: string, source: string): void {
  writeFileSync(path, source);
  chmodSync(path, 0o755);
}

function runGit(repoRoot: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("forceReportRun", () => {
  test("configures an unconfigured checkout before invoking ninja", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const binDir = resolve(root, "bin");
    const logPath = resolve(root, "commands.log");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "configure.py"), "# fixture\n");
    writeExecutable(
      resolve(binDir, "python3"),
      `#!/bin/sh
echo "python3 $*" >> "$REPORT_RUN_TEST_LOG"
touch build.ninja
`,
    );
    writeExecutable(
      resolve(binDir, "ninja"),
      `#!/bin/sh
echo "ninja $*" >> "$REPORT_RUN_TEST_LOG"
mkdir -p build/GALE01
if [ "$1" = "build/GALE01/report.json" ]; then
  printf '%s\\n' '{"measures":{"fuzzy_match_percent":98.5,"matched_code_percent":76.25,"matched_data_percent":81.5,"matched_functions_percent":95,"total_functions":200,"matched_functions":190,"total_units":20,"complete_units":17,"total_code":"1000","matched_code":"762","total_data":"400","matched_data":"326"}}' > build/GALE01/report.json
  exit 0
fi
if [ "$1" = "changes_all" ]; then
  printf '{"ok":true}\\n' > build/GALE01/report_changes.json
  exit 0
fi
exit 1
`,
    );

    const originalPath = Bun.env.PATH;
    const originalLog = Bun.env.REPORT_RUN_TEST_LOG;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    Bun.env.REPORT_RUN_TEST_LOG = logPath;
    try {
      const result = await forceReportRun(repoRoot, { resetBaseline: true });

      expect(result.steps.map((step) => step.name)).toEqual(["configure", "generate report", "generate report changes"]);
      expect(existsSync(resolve(repoRoot, "build.ninja"))).toBe(true);
      expect(existsSync(result.baselinePath)).toBe(true);
      expect(result.summary).toMatchObject({
        fuzzyMatchPercent: 98.5,
        matchedCodePercent: 76.25,
        matchedDataPercent: 81.5,
        matchedFunctionsPercent: 95,
        unmatchedTargets: 10,
        incompleteUnits: 3,
      });
      expect(boardMeasuresFromReportSummary(result.summary).unmatched_targets).toBe(10);
      expect(readFileSync(logPath, "utf8").trim().split("\n")).toEqual([
        "python3 configure.py --require-protos",
        "ninja build/GALE01/report.json",
        "ninja changes_all",
      ]);
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
      if (originalLog === undefined) delete Bun.env.REPORT_RUN_TEST_LOG;
      else Bun.env.REPORT_RUN_TEST_LOG = originalLog;
    }
  });

  test("prefers a state-managed wibo wrapper for fresh configure", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const stateDir = resolve(root, "state");
    const binDir = resolve(root, "bin");
    const logPath = resolve(root, "commands.log");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(resolve(stateDir, "tools"), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(stateDir, "tools", "wibo"), "wibo\n");
    chmodSync(resolve(stateDir, "tools", "wibo"), 0o755);
    writeFileSync(resolve(repoRoot, "configure.py"), "# fixture\n");
    writeExecutable(
      resolve(binDir, "python3"),
      `#!/bin/sh
echo "python3 $*" >> "$REPORT_RUN_TEST_LOG"
touch build.ninja
`,
    );
    writeExecutable(
      resolve(binDir, "ninja"),
      `#!/bin/sh
echo "ninja $*" >> "$REPORT_RUN_TEST_LOG"
mkdir -p build/GALE01
printf '%s\\n' '{"measures":{}}' > build/GALE01/report.json
printf '{"ok":true}\\n' > build/GALE01/report_changes.json
`,
    );

    const originalPath = Bun.env.PATH;
    const originalLog = Bun.env.REPORT_RUN_TEST_LOG;
    const originalStateDir = Bun.env.ORCH_PROJECT_STATE_DIR;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    Bun.env.REPORT_RUN_TEST_LOG = logPath;
    Bun.env.ORCH_PROJECT_STATE_DIR = stateDir;
    try {
      await forceReportRun(repoRoot);

      expect(readFileSync(logPath, "utf8").trim().split("\n")[0]).toBe("python3 configure.py --require-protos --wrapper build/tools/wibo");
      expect(readFileSync(resolve(repoRoot, "build", "tools", "wibo"), "utf8")).toBe("wibo\n");
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
      if (originalLog === undefined) delete Bun.env.REPORT_RUN_TEST_LOG;
      else Bun.env.REPORT_RUN_TEST_LOG = originalLog;
      if (originalStateDir === undefined) delete Bun.env.ORCH_PROJECT_STATE_DIR;
      else Bun.env.ORCH_PROJECT_STATE_DIR = originalStateDir;
    }
  });

  test("replaces a host-local wrapper with the platform-specific artifact for a cross-platform target", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const stateDir = resolve(root, "state");
    const binDir = resolve(root, "bin");
    const logPath = resolve(root, "commands.log");
    mkdirSync(resolve(repoRoot, "build/tools"), { recursive: true });
    mkdirSync(resolve(stateDir, "tools"), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "build/tools/wibo"), "host-local wrapper\n");
    writeFileSync(resolve(stateDir, "tools/wibo"), "legacy host wrapper\n");
    writeFileSync(resolve(stateDir, "tools/wibo-linux-x86_64"), "linux wrapper\n");
    writeFileSync(resolve(repoRoot, "configure.py"), "# fixture\n");
    writeExecutable(
      resolve(binDir, "python3"),
      `#!/bin/sh
echo "python3 $*" >> "$REPORT_RUN_TEST_LOG"
touch build.ninja
`,
    );
    writeExecutable(
      resolve(binDir, "ninja"),
      `#!/bin/sh
mkdir -p build/GALE01
printf '%s\\n' '{"measures":{}}' > build/GALE01/report.json
printf '{"ok":true}\\n' > build/GALE01/report_changes.json
`,
    );

    const originalPath = Bun.env.PATH;
    const originalLog = Bun.env.REPORT_RUN_TEST_LOG;
    const originalStateDir = Bun.env.ORCH_PROJECT_STATE_DIR;
    const originalToolPlatform = Bun.env.ORCH_TOOL_PLATFORM;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    Bun.env.REPORT_RUN_TEST_LOG = logPath;
    Bun.env.ORCH_PROJECT_STATE_DIR = stateDir;
    Bun.env.ORCH_TOOL_PLATFORM = "linux-x86_64";
    try {
      await forceReportRun(repoRoot);

      expect(readFileSync(logPath, "utf8").trim()).toBe("python3 configure.py --require-protos --wrapper build/tools/wibo");
      expect(readFileSync(resolve(repoRoot, "build/tools/wibo"), "utf8")).toBe("linux wrapper\n");
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
      if (originalLog === undefined) delete Bun.env.REPORT_RUN_TEST_LOG;
      else Bun.env.REPORT_RUN_TEST_LOG = originalLog;
      if (originalStateDir === undefined) delete Bun.env.ORCH_PROJECT_STATE_DIR;
      else Bun.env.ORCH_PROJECT_STATE_DIR = originalStateDir;
      if (originalToolPlatform === undefined) delete Bun.env.ORCH_TOOL_PLATFORM;
      else Bun.env.ORCH_TOOL_PLATFORM = originalToolPlatform;
    }
  });

  test("reuses report.json when HEAD and report inputs have the same key", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const binDir = resolve(root, "bin");
    const logPath = resolve(root, "commands.log");
    mkdirSync(resolve(repoRoot, "config/GALE01"), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "build.ninja"), "# stable ninja graph\n");
    writeFileSync(resolve(repoRoot, "config/GALE01/config.yml"), "object_base: build/GALE01\n");
    runGit(repoRoot, ["init", "-q"]);
    runGit(repoRoot, ["add", "build.ninja", "config/GALE01/config.yml"]);
    runGit(repoRoot, ["-c", "user.name=Report Test", "-c", "user.email=report@example.invalid", "commit", "-qm", "fixture"]);
    writeExecutable(
      resolve(binDir, "ninja"),
      `#!/bin/sh
echo "ninja $*" >> "$REPORT_RUN_TEST_LOG"
mkdir -p build/GALE01
if [ "$1" = "build/GALE01/report.json" ]; then
  printf '%s\\n' '{"measures":{"matched_code_percent":75}}' > build/GALE01/report.json
fi
if [ "$1" = "changes_all" ]; then
  printf '{"ok":true}\\n' > build/GALE01/report_changes.json
fi
`,
    );

    const originalPath = Bun.env.PATH;
    const originalLog = Bun.env.REPORT_RUN_TEST_LOG;
    const originalReuse = Bun.env.ORCH_REPORT_REUSE;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    Bun.env.REPORT_RUN_TEST_LOG = logPath;
    Bun.env.ORCH_REPORT_REUSE = "1";
    try {
      const first = await forceReportRun(repoRoot);
      const second = await forceReportRun(repoRoot);

      expect(first.reusedReport).toBe(false);
      expect(second.reusedReport).toBe(true);
      expect(second.steps.map((step) => step.name)).toEqual(["generate report changes"]);
      expect(readFileSync(logPath, "utf8").trim().split("\n")).toEqual([
        "ninja build/GALE01/report.json",
        "ninja changes_all",
        "ninja changes_all",
      ]);
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
      if (originalLog === undefined) delete Bun.env.REPORT_RUN_TEST_LOG;
      else Bun.env.REPORT_RUN_TEST_LOG = originalLog;
      if (originalReuse === undefined) delete Bun.env.ORCH_REPORT_REUSE;
      else Bun.env.ORCH_REPORT_REUSE = originalReuse;
    }
  });
});

describe("computeReportReuseKey", () => {
  test("is stable and changes with HEAD, build.ninja, or DOL config", () => {
    const input = {
      buildNinja: "rule report\n",
      dolConfig: "object_base: build/GALE01\n",
      headCommit: "0123456789abcdef",
    };
    const key = computeReportReuseKey(input);

    expect(computeReportReuseKey({ ...input })).toBe(key);
    expect(computeReportReuseKey({ ...input, headCommit: "fedcba9876543210" })).not.toBe(key);
    expect(computeReportReuseKey({ ...input, buildNinja: `${input.buildNinja}# changed\n` })).not.toBe(key);
    expect(computeReportReuseKey({ ...input, dolConfig: `${input.dolConfig}quick_analysis: true\n` })).not.toBe(key);
  });
});
