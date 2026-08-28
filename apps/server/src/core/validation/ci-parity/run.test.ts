import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCiParityGate, runPreCommitAutofix, runPreCommitGate, type CiParityCommandRunner } from "./run.js";

const BUILD_WORKFLOW = String.raw`
jobs:
  build-ninja:
    steps:
      - name: Build
        shell: bash
        run: |
          config_args=$(printf '%s ' \
            '--compilers /compilers' \
            '--max-errors 0' \
            '--verbose' \
            '--version \${{matrix.version}}' \
            '--no-always-apply' \
            '--sym off')
          case '\${{matrix.mode}}' in
            'link')
              config_args=$(printf '%s ' \
                '--map' \
                '--require-protos' \
                '--reloc-diffs none' \
                "$config_args")
              python configure.py $config_args
              ninja "$root/config.json"
              ninja
              ninja diff
              python .github/scripts/check_complete.py "$root/report.json"
              ;;
            'test')
              config_args=$(printf '%s ' \
                '--linkable' \
                "$config_args")
              python configure.py $config_args
              ninja
              ;;
            'diff')
              ;;
            'clang')
              ;;
          esac
`.replaceAll("\\${{", "${{");

let tempDirs: string[] = [];

function makeWorktree(workflow = BUILD_WORKFLOW): string {
  const root = mkdtempSync(join(tmpdir(), "ci-parity-"));
  tempDirs.push(root);
  mkdirSync(resolve(root, ".github/workflows"), { recursive: true });
  writeFileSync(resolve(root, ".github/workflows/build.yml"), workflow);
  writeFileSync(resolve(root, "configure.py"), "# fixture\n");
  return root;
}

function commandKey(command: string[]): string {
  return command.join(" ");
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("runCiParityGate", () => {
  test("runs the complete link and test sequence with localized configure arguments", async () => {
    const worktreeDir = makeWorktree();
    mkdirSync(resolve(worktreeDir, "build/tools"), { recursive: true });
    writeFileSync(resolve(worktreeDir, "build/tools/wibo"), "wrapper\n");
    mkdirSync(resolve(worktreeDir, "build-ci/link/GALE01"), { recursive: true });
    writeFileSync(resolve(worktreeDir, "build-ci/link/GALE01/report.json"), "{}\n");
    const calls: string[][] = [];
    const runCommand: CiParityCommandRunner = async (_cwd, command) => {
      calls.push(command);
      if (command.at(-1) === "HEAD") return { exitCode: 0, stdout: "target-sha\n", stderr: "" };
      return { exitCode: 0, stdout: "ok\n", stderr: "" };
    };

    const result = await runCiParityGate({ worktreeDir, sha: "target-sha", runCommand });

    expect(result.status).toBe("clean");
    expect(result.modes).toEqual(["link", "test"]);
    expect(calls).toEqual([
      ["git", "-C", worktreeDir, "rev-parse", "HEAD"],
      [
        "python3", "configure.py",
        "--map", "--require-protos", "--reloc-diffs", "none",
        "--max-errors", "0", "--version", "GALE01", "--no-always-apply", "--sym", "off",
        "--wrapper", "build/tools/wibo", "--build-dir", "build-ci/link",
      ],
      ["ninja"],
      ["ninja", "diff"],
      ["python3", ".github/scripts/check_complete.py", "build-ci/link/GALE01/report.json"],
      [
        "python3", "configure.py", "--linkable",
        "--max-errors", "0", "--version", "GALE01", "--no-always-apply", "--sym", "off",
        "--wrapper", "build/tools/wibo", "--build-dir", "build-ci/test",
      ],
      ["ninja"],
    ]);
    expect(result.steps.map((step) => step.command)).toEqual(calls);
  });

  test("fails on ERROR output from ninja diff and still runs test mode", async () => {
    const worktreeDir = makeWorktree();
    const calls: string[][] = [];
    const runCommand: CiParityCommandRunner = async (_cwd, command) => {
      calls.push(command);
      if (command.at(-1) === "HEAD") return { exitCode: 0, stdout: "target-sha\n", stderr: "" };
      if (commandKey(command) === "ninja diff") {
        return { exitCode: 0, stdout: "unit output\nERROR mismatch found\n", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const result = await runCiParityGate({ worktreeDir, sha: "target-sha", runCommand });

    expect(result.status).toBe("failed");
    expect(result.reasons).toContain("ninja diff reported ERROR lines");
    expect(calls.some((command) => command.includes("build-ci/test"))).toBe(true);
  });

  test("records check_complete warnings without failing on its non-zero exit", async () => {
    const worktreeDir = makeWorktree();
    mkdirSync(resolve(worktreeDir, "build-ci/link/GALE01"), { recursive: true });
    writeFileSync(resolve(worktreeDir, "build-ci/link/GALE01/report.json"), "{}\n");
    const warning = "::warning::One or more units are complete but not linked!";
    const runCommand: CiParityCommandRunner = async (_cwd, command) => {
      if (command.at(-1) === "HEAD") return { exitCode: 0, stdout: "target-sha\n", stderr: "" };
      if (commandKey(command).includes("check_complete.py")) {
        return { exitCode: 1, stdout: `${warning}\n`, stderr: "check_complete diagnostic\n" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const result = await runCiParityGate({ worktreeDir, sha: "target-sha", modes: ["link"], runCommand });

    expect(result.status).toBe("clean");
    expect(result.reasons).toEqual([warning]);
    expect(result.warnings).toEqual([warning]);
    expect(result.steps.at(-1)).toMatchObject({ name: "check_complete link", exitCode: 1 });
  });

  test("reports actionable ninja diagnostics without MoltenVK noise", async () => {
    const worktreeDir = makeWorktree();
    const runCommand: CiParityCommandRunner = async (_cwd, command) => {
      if (command.at(-1) === "HEAD") return { exitCode: 0, stdout: "target-sha\n", stderr: "" };
      if (commandKey(command) === "ninja") {
        return {
          exitCode: 1,
          stdout: "FAILED: build/GALE01/src/melee/mn/mnnamenew.o\n# Error: object null_char redefined\n",
          stderr: "[mvk-info] noise\n  VK_EXT_load_store_op_none v1\n",
        };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const result = await runCiParityGate({ worktreeDir, sha: "target-sha", modes: ["link"], runCommand });

    expect(result.status).toBe("failed");
    expect(result.reasons[0]).toContain("FAILED: build/GALE01/src/melee/mn/mnnamenew.o");
    expect(result.reasons[0]).toContain("object null_char redefined");
    expect(result.reasons[0]).not.toContain("mvk-info");
    expect(result.reasons[0]).not.toContain("VK_EXT");
  });

  test("switches the worktree when HEAD differs", async () => {
    const worktreeDir = makeWorktree();
    const calls: string[][] = [];
    const runCommand: CiParityCommandRunner = async (_cwd, command) => {
      calls.push(command);
      if (command.at(-1) === "HEAD") return { exitCode: 0, stdout: "old-sha\n", stderr: "" };
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    await runCiParityGate({ worktreeDir, sha: "target-sha", modes: [], runCommand });

    expect(calls.slice(0, 2)).toEqual([
      ["git", "-C", worktreeDir, "rev-parse", "HEAD"],
      ["git", "-C", worktreeDir, "switch", "--discard-changes", "--detach", "target-sha"],
    ]);
  });

  test("returns error when workflow parsing fails", async () => {
    const worktreeDir = makeWorktree("jobs: {}\n");
    const runCommand: CiParityCommandRunner = async () => ({ exitCode: 0, stdout: "target-sha\n", stderr: "" });

    const result = await runCiParityGate({ worktreeDir, sha: "target-sha", runCommand });

    expect(result.status).toBe("error");
    expect(result.reasons.join(" ")).toContain("config_args");
  });
});

describe("runPreCommitGate", () => {
  test("returns a clear error when pre-commit is missing", async () => {
    const worktreeDir = makeWorktree();
    const runCommand: CiParityCommandRunner = async () => {
      throw new Error("Executable not found in $PATH: pre-commit");
    };

    const result = await runPreCommitGate({ worktreeDir, cacheDir: "/tmp/pre-commit-cache", runCommand });

    expect(result.status).toBe("error");
    expect(result.reasons).toEqual([
      "pre-commit is not installed; install it (pip install pre-commit) or pass --no-pre-commit-gate",
    ]);
  });

  test("resets hook edits after a failed pre-commit run", async () => {
    const worktreeDir = makeWorktree();
    writeFileSync(resolve(worktreeDir, "compile_commands.json"), "[]\n");
    const calls: Array<{ command: string[]; env?: Record<string, string | undefined> }> = [];
    const runCommand: CiParityCommandRunner = async (_cwd, command, options) => {
      calls.push({ command, env: options?.env });
      if (command[0] === "pre-commit" && command[1] === "run") {
        return { exitCode: 1, stdout: "hook changed files\n", stderr: "" };
      }
      return { exitCode: 0, stdout: "pre-commit 4.0\n", stderr: "" };
    };

    const result = await runPreCommitGate({ worktreeDir, cacheDir: "/tmp/pre-commit-cache", runCommand });

    expect(result.status).toBe("failed");
    expect(calls).toEqual([
      { command: ["pre-commit", "--version"], env: undefined },
      {
        command: ["pre-commit", "run", "--show-diff-on-failure", "--color=never", "--all-files"],
        env: { PRE_COMMIT_HOME: "/tmp/pre-commit-cache" },
      },
      { command: ["git", "-C", worktreeDir, "checkout", "--", "."], env: undefined },
    ]);
    expect(result.steps.map((step) => step.name)).toEqual([
      "pre-commit version",
      "pre-commit run",
      "reset pre-commit changes",
    ]);
  });
});

describe("runPreCommitAutofix", () => {
  test("skips when pre-commit is unavailable", async () => {
    const result = await runPreCommitAutofix({
      worktreeDir: makeWorktree(), cacheDir: "/tmp/pre-commit-cache",
      runCommand: async () => { throw new Error("Executable not found in $PATH: pre-commit"); },
    });
    expect(result).toMatchObject({ status: "skipped", reformattedFiles: [], warnings: ["pre-commit is unavailable"] });
  });

  test("preserves hook edits, counts reformatted files, and reports remaining failures as warnings", async () => {
    const worktreeDir = makeWorktree();
    writeFileSync(resolve(worktreeDir, "format.c"), "int value=1;\n");
    Bun.spawnSync(["git", "-C", worktreeDir, "init", "-b", "main"]);
    Bun.spawnSync(["git", "-C", worktreeDir, "config", "user.email", "test@example.com"]);
    Bun.spawnSync(["git", "-C", worktreeDir, "config", "user.name", "CI Test"]);
    Bun.spawnSync(["git", "-C", worktreeDir, "add", "."]);
    Bun.spawnSync(["git", "-C", worktreeDir, "commit", "-m", "initial"]);
    writeFileSync(resolve(worktreeDir, "format.c"), "int value=2;\n");
    const calls: Array<{ command: string[]; env?: Record<string, string | undefined> }> = [];
    const runCommand: CiParityCommandRunner = async (_cwd, command, options) => {
      calls.push({ command, env: options?.env });
      if (command[0] === "git") {
        const spawned = Bun.spawnSync(command, { stdout: "pipe", stderr: "pipe" });
        return { exitCode: spawned.exitCode, stdout: spawned.stdout.toString(), stderr: spawned.stderr.toString() };
      }
      if (command[1] === "run") {
        writeFileSync(resolve(worktreeDir, "format.c"), "int value = 2;\n");
        return { exitCode: 1, stdout: "clang-format modified files\nclang-tidy failed\n", stderr: "" };
      }
      return { exitCode: 0, stdout: "pre-commit 4.0\n", stderr: "" };
    };

    const result = await runPreCommitAutofix({ worktreeDir, cacheDir: "/tmp/pre-commit-cache", runCommand });

    expect(result.status).toBe("finished");
    expect(result.reformattedFiles).toEqual(["format.c"]);
    expect(result.warnings[0]).toContain("clang-tidy failed");
    expect(calls.find((call) => call.command[1] === "run")?.env).toEqual({ PRE_COMMIT_HOME: "/tmp/pre-commit-cache" });
  });
});
