import { beforeAll as beforeBuildTests, afterAll as afterBuildTests } from "bun:test";
// These fixtures exercise local tool behavior. Production defaults to Daytona.
let previousBuildMode: string | undefined;
beforeBuildTests(() => { previousBuildMode = process.env.ORCH_BUILD_EXECUTION; process.env.ORCH_BUILD_EXECUTION = "local"; });
afterBuildTests(() => { if (previousBuildMode === undefined) delete process.env.ORCH_BUILD_EXECUTION; else process.env.ORCH_BUILD_EXECUTION = previousBuildMode; });
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { boardMeasuresFromReportSummary } from "./dashboard-artifacts.js";
import { computeReportReuseKey, forceReportRun, reportRunOptionsForGame } from "./run.js";

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
  test("configures an SMS report without Melee's require-protos flag", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const binDir = resolve(root, "bin");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "configure.py"), "from pathlib import Path\nPath('build.ninja').write_text('# sms fixture\\n')\n");
    writeExecutable(resolve(binDir, "ninja"), `#!/bin/sh
mkdir -p build/GMSJ01
printf '%s\\n' '{"measures":{}}' > build/GMSJ01/report.json
`);

    const originalPath = Bun.env.PATH;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    try {
      const options = {
        ...reportRunOptionsForGame({ kind: "doldecomp-sms", validation: { reportPath: "build/GMSJ01/report.json" } }),
        generateChanges: false,
      };
      const result = await forceReportRun(repoRoot, options);

      expect(options.kind).toBe("doldecomp-sms");
      expect(result.steps[0]?.command).toEqual(["/bin/sh", "-c", "python3 configure.py"]);
      expect(result.steps[0]?.command.join(" ")).not.toContain("--require-protos");
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
    }
  });

  test("uses another game's report, config, baseline and ninja target with reuse enabled", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const binDir = resolve(root, "bin");
    mkdirSync(resolve(repoRoot, "config/GTEST01"), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "build.ninja"), "# alternate game fixture\n");
    writeFileSync(resolve(repoRoot, "config/GTEST01/config.yml"), "name: alternate\n");
    runGit(repoRoot, ["init"]);
    runGit(repoRoot, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "--allow-empty", "-m", "fixture"]);
    writeExecutable(resolve(binDir, "ninja"), `#!/bin/sh
case "$*" in
  '-k 0 out/GTEST01/progress.json')
    mkdir -p out/GTEST01
    printf '%s\\n' '{"measures":{"matched_code_percent":42}}' > out/GTEST01/progress.json ;;
  'test_changes') printf '%s\\n' '{}' > out/GTEST01/deltas.json ;;
  *) exit 9 ;;
esac
`);
    const originalPath = Bun.env.PATH;
    const originalReuse = Bun.env.ORCH_REPORT_REUSE;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    Bun.env.ORCH_REPORT_REUSE = "1";
    try {
      const options = { ...reportRunOptionsForGame({ validation: {
        reportPath: "out/GTEST01/progress.json", reportChangesPath: "out/GTEST01/deltas.json", qaTarget: "test_changes",
      } }), resetBaseline: true };
      const first = await forceReportRun(repoRoot, options);
      const second = await forceReportRun(repoRoot, options);
      expect(first.reportPath).toBe(resolve(repoRoot, "out/GTEST01/progress.json"));
      expect(first.baselinePath).toBe(resolve(repoRoot, "out/GTEST01/baseline.json"));
      expect(first.reportChangesPath).toBe(resolve(repoRoot, "out/GTEST01/deltas.json"));
      expect(first.summary?.matchedCodePercent).toBe(42);
      expect(first.steps.map((step) => step.command)).toEqual([["ninja", "-k", "0", "out/GTEST01/progress.json"], ["ninja", "test_changes"]]);
      expect(JSON.stringify(first)).not.toContain("GALE01");
      expect(second.reusedReport).toBe(true);
      expect(existsSync(resolve(repoRoot, "build/GALE01"))).toBe(false);
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH; else Bun.env.PATH = originalPath;
      if (originalReuse === undefined) delete Bun.env.ORCH_REPORT_REUSE; else Bun.env.ORCH_REPORT_REUSE = originalReuse;
    }
  });

  test("persists each invocation's step output in a distinct directory", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const binDir = resolve(root, "bin");
    const logDir = resolve(root, "artifacts");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "build.ninja"), "# fixture\n");
    writeExecutable(
      resolve(binDir, "ninja"),
      `#!/bin/sh
mkdir -p build/GALE01
printf '%s\n' 'report stdout'
printf '%s\n' 'report stderr' >&2
printf '%s\n' '{"measures":{}}' > build/GALE01/report.json
`,
    );

    const originalPath = Bun.env.PATH;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    try {
      const first = await forceReportRun(repoRoot, { generateChanges: false, logDir });
      const second = await forceReportRun(repoRoot, { generateChanges: false, logDir });
      const firstStep = first.steps[0];
      const secondStep = second.steps[0];
      const stdoutPath = firstStep.stdoutPath as string;
      const stderrPath = firstStep.stderrPath as string;

      expect(firstStep).toMatchObject({
        durationMs: expect.any(Number),
        name: "generate report",
        stdoutPath,
        stderrPath,
      });
      expect(stdoutPath).toStartWith(`${resolve(logDir, "build-steps")}/`);
      expect(stdoutPath).toEndWith("/0-generate-report.stdout.log");
      expect(stderrPath).toEndWith("/0-generate-report.stderr.log");
      expect(dirname(secondStep.stdoutPath as string)).not.toBe(dirname(stdoutPath));
      expect(readFileSync(stdoutPath, "utf8")).toBe("report stdout\n");
      expect(readFileSync(stderrPath, "utf8")).toBe("report stderr\n");
      expect(readFileSync(secondStep.stdoutPath as string, "utf8")).toBe("report stdout\n");
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
    }
  });

  test("times out a step with exit 124 and retains bounded output tails and logs", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const binDir = resolve(root, "bin");
    const logDir = resolve(root, "artifacts");
    const noisyStdout = `${"o".repeat(4_200)}stdout-tail-marker`;
    const noisyStderr = `${"e".repeat(4_200)}stderr-tail-marker`;
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "build.ninja"), "# fixture\n");
    writeExecutable(
      resolve(binDir, "ninja"),
      `#!/bin/sh
printf '%s\n' '${noisyStdout}'
printf '%s\n' '${noisyStderr}' >&2
sleep 5
`,
    );

    const originalPath = Bun.env.PATH;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    try {
      let failure: unknown;
      try {
        await forceReportRun(repoRoot, { generateChanges: false, logDir, timeoutMs: 250 });
      } catch (error) {
        failure = error;
      }
      const observed = failure as Error & {
        exitCode: number;
        logPaths: string[];
        stderrTail: string;
        stdoutTail: string;
      };
      const [stdoutPath, stderrPath] = observed.logPaths;

      expect(observed).toBeInstanceOf(Error);
      expect(observed.message).toStartWith("generate report failed (124):");
      expect(observed.exitCode).toBe(124);
      expect(observed.stdoutTail.length).toBeLessThanOrEqual(4_000);
      expect(observed.stdoutTail).toContain("stdout-tail-marker");
      expect(observed.stderrTail.length).toBeLessThanOrEqual(4_000);
      expect(observed.stderrTail).toContain("stderr-tail-marker");
      expect(observed.stderrTail).toContain("Command timed out");
      expect(observed.logPaths).toEqual([stdoutPath, stderrPath]);
      expect(Object.hasOwn(observed, "exitCode")).toBe(true);
      expect(Object.hasOwn(observed, "stdoutTail")).toBe(true);
      expect(Object.hasOwn(observed, "stderrTail")).toBe(true);
      expect(Object.hasOwn(observed, "logPaths")).toBe(true);
      expect(readFileSync(stdoutPath, "utf8")).toContain("stdout-tail-marker");
      expect(readFileSync(stderrPath, "utf8")).toContain("Command timed out");
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
    }
  });

  test("returns a successful build result when diagnostic logs cannot be persisted", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const binDir = resolve(root, "bin");
    const logDir = resolve(root, "not-a-directory");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "build.ninja"), "# fixture\n");
    writeFileSync(logDir, "blocks nested log directories\n");
    writeExecutable(
      resolve(binDir, "ninja"),
      `#!/bin/sh
mkdir -p build/GALE01
printf '%s\n' '{"measures":{"matched_code_percent":42}}' > build/GALE01/report.json
`,
    );

    const originalPath = Bun.env.PATH;
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    try {
      const result = await forceReportRun(repoRoot, { generateChanges: false, logDir });

      expect(result.summary?.matchedCodePercent).toBe(42);
      expect(result.steps[0]).toMatchObject({ exitCode: 0, name: "generate report" });
      expect(result.steps[0]?.stdoutPath).toBeUndefined();
      expect(result.steps[0]?.stderrPath).toBeUndefined();
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
    }
  });

  test("preserves a command failure when diagnostic logs cannot be persisted", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const binDir = resolve(root, "bin");
    const logDir = resolve(root, "not-a-directory");
    mkdirSync(repoRoot, { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "build.ninja"), "# fixture\n");
    writeFileSync(logDir, "blocks nested log directories\n");
    writeExecutable(
      resolve(binDir, "ninja"),
      `#!/bin/sh
printf '%s\n' 'original command failure' >&2
exit 23
`,
    );

    const originalPath = Bun.env.PATH;
    const consoleError = spyOn(console, "error").mockImplementation(() => {});
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    try {
      let failure: unknown;
      try {
        await forceReportRun(repoRoot, { generateChanges: false, logDir });
      } catch (error) {
        failure = error;
      }

      const observed = failure as Error & { exitCode: number; logPaths: string[] };
      expect(observed.message).toContain("generate report failed (23): original command failure");
      expect(observed.exitCode).toBe(23);
      expect(observed.logPaths).toEqual([]);
      expect(consoleError).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
    }
  });

  test("serializes concurrent runs for the same repo root", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const binDir = resolve(root, "bin");
    const logPath = resolve(root, "commands.log");
    const startedPath = resolve(root, "first-started");
    const releasePath = resolve(root, "release-first");
    mkdirSync(resolve(repoRoot, "build/GALE01"), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "build.ninja"), "# fixture\n");
    writeExecutable(
      resolve(binDir, "ninja"),
      `#!/bin/sh
set -eu
echo "start $*" >> "$REPORT_RUN_TEST_LOG"
if [ "\${3:-}" = "build/GALE01/report.json" ]; then
  if [ ! -e "$REPORT_RUN_TEST_STARTED" ]; then
    printf '%s\\n' '{"measures":{"matched_code_percent":99}}' > build/GALE01/report.json
    touch "$REPORT_RUN_TEST_STARTED"
    while [ ! -e "$REPORT_RUN_TEST_RELEASE" ]; do sleep 0.01; done
    grep -q '"matched_code_percent":99' build/GALE01/report.json
    printf '%s\\n' '{"measures":{"matched_code_percent":1}}' > build/GALE01/report.json
  else
    grep -q '"matched_code_percent":1' build/GALE01/baseline.json
    printf '%s\\n' '{"measures":{"matched_code_percent":2}}' > build/GALE01/report.json
  fi
fi
if [ "$1" = "changes_all" ]; then
  grep -q '"matched_code_percent":1' build/GALE01/baseline.json
  grep -q '"matched_code_percent":2' build/GALE01/report.json
  printf '{"ok":true}\\n' > build/GALE01/report_changes.json
fi
echo "finish $*" >> "$REPORT_RUN_TEST_LOG"
`,
    );

    const originalPath = Bun.env.PATH;
    const originalLog = Bun.env.REPORT_RUN_TEST_LOG;
    const originalStarted = Bun.env.REPORT_RUN_TEST_STARTED;
    const originalRelease = Bun.env.REPORT_RUN_TEST_RELEASE;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    Bun.env.REPORT_RUN_TEST_LOG = logPath;
    Bun.env.REPORT_RUN_TEST_STARTED = startedPath;
    Bun.env.REPORT_RUN_TEST_RELEASE = releasePath;
    try {
      const first = forceReportRun(repoRoot, { generateChanges: false, resetBaseline: true });
      const second = forceReportRun(repoRoot);

      for (let attempt = 0; attempt < 100 && !existsSync(startedPath); attempt += 1) await Bun.sleep(10);
      const firstStarted = existsSync(startedPath);
      const logBeforeRelease = existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n") : [];
      writeFileSync(releasePath, "release\n");

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstStarted).toBe(true);
      expect(logBeforeRelease).toEqual(["start -k 0 build/GALE01/report.json"]);
      expect(firstResult.summary?.matchedCodePercent).toBe(1);
      expect(secondResult.summary?.matchedCodePercent).toBe(2);
      expect(readFileSync(logPath, "utf8").trim().split("\n")).toEqual([
        "start -k 0 build/GALE01/report.json",
        "finish -k 0 build/GALE01/report.json",
        "start -k 0 build/GALE01/report.json",
        "finish -k 0 build/GALE01/report.json",
        "start changes_all",
        "finish changes_all",
      ]);
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
      if (originalLog === undefined) delete Bun.env.REPORT_RUN_TEST_LOG;
      else Bun.env.REPORT_RUN_TEST_LOG = originalLog;
      if (originalStarted === undefined) delete Bun.env.REPORT_RUN_TEST_STARTED;
      else Bun.env.REPORT_RUN_TEST_STARTED = originalStarted;
      if (originalRelease === undefined) delete Bun.env.REPORT_RUN_TEST_RELEASE;
      else Bun.env.REPORT_RUN_TEST_RELEASE = originalRelease;
    }
  });

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
if [ "\${3:-}" = "build/GALE01/report.json" ]; then
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
      // The Melee command probes `configure.py --help` for --require-protos
      // support first; the fake python3 advertises nothing, so no flag follows.
      expect(readFileSync(logPath, "utf8").trim().split("\n")).toEqual([
        "python3 configure.py --help",
        "python3 configure.py",
        "ninja -k 0 build/GALE01/report.json",
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
    mkdirSync(resolve(root, "tools"), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(root, "tools", "wibo"), "wibo\n");
    chmodSync(resolve(root, "tools", "wibo"), 0o755);
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
    const originalStateDir = Bun.env.ORCH_GAME_STATE_DIR;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    Bun.env.REPORT_RUN_TEST_LOG = logPath;
    Bun.env.ORCH_GAME_STATE_DIR = stateDir;
    try {
      await forceReportRun(repoRoot);

      expect(readFileSync(logPath, "utf8").trim().split("\n").slice(0, 2)).toEqual([
        "python3 configure.py --help",
        "python3 configure.py --wrapper build/tools/wibo",
      ]);
      expect(readFileSync(resolve(repoRoot, "build", "tools", "wibo"), "utf8")).toBe("wibo\n");
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
      if (originalLog === undefined) delete Bun.env.REPORT_RUN_TEST_LOG;
      else Bun.env.REPORT_RUN_TEST_LOG = originalLog;
      if (originalStateDir === undefined) delete Bun.env.ORCH_GAME_STATE_DIR;
      else Bun.env.ORCH_GAME_STATE_DIR = originalStateDir;
    }
  });

  test("replaces a host-local wrapper with the platform-specific artifact for a cross-platform target", async () => {
    const root = tempDir();
    const repoRoot = resolve(root, "repo");
    const stateDir = resolve(root, "state");
    const binDir = resolve(root, "bin");
    const logPath = resolve(root, "commands.log");
    mkdirSync(resolve(repoRoot, "build/tools"), { recursive: true });
    mkdirSync(resolve(root, "tools"), { recursive: true });
    mkdirSync(binDir, { recursive: true });
    writeFileSync(resolve(repoRoot, "build/tools/wibo"), "host-local wrapper\n");
    writeFileSync(resolve(root, "tools/wibo"), "legacy host wrapper\n");
    writeFileSync(resolve(root, "tools/wibo-linux-x86_64"), "linux wrapper\n");
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
    const originalStateDir = Bun.env.ORCH_GAME_STATE_DIR;
    const originalToolPlatform = Bun.env.ORCH_TOOL_PLATFORM;
    Bun.env.PATH = `${binDir}:/bin:/usr/bin`;
    Bun.env.REPORT_RUN_TEST_LOG = logPath;
    Bun.env.ORCH_GAME_STATE_DIR = stateDir;
    Bun.env.ORCH_TOOL_PLATFORM = "linux-x86_64";
    try {
      await forceReportRun(repoRoot);

      expect(readFileSync(logPath, "utf8").trim().split("\n")).toEqual([
        "python3 configure.py --help",
        "python3 configure.py --wrapper build/tools/wibo",
      ]);
      expect(readFileSync(resolve(repoRoot, "build/tools/wibo"), "utf8")).toBe("linux wrapper\n");
    } finally {
      if (originalPath === undefined) delete Bun.env.PATH;
      else Bun.env.PATH = originalPath;
      if (originalLog === undefined) delete Bun.env.REPORT_RUN_TEST_LOG;
      else Bun.env.REPORT_RUN_TEST_LOG = originalLog;
      if (originalStateDir === undefined) delete Bun.env.ORCH_GAME_STATE_DIR;
      else Bun.env.ORCH_GAME_STATE_DIR = originalStateDir;
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
if [ "\${3:-}" = "build/GALE01/report.json" ]; then
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
        "ninja -k 0 build/GALE01/report.json",
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
