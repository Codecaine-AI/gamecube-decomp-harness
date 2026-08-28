import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { runCommand } from "@server/infrastructure/shell/index.js";
import { actionableFailureOutput } from "../failure-output.js";
import { localizeConfigureArgs, parseCiBuildMatrix } from "./workflow.js";

export interface CiParityStep {
  name: string;
  command: string[];
  exitCode: number;
  durationMs: number;
  outputTail: string;
}

export interface CiParityResult {
  status: "clean" | "failed" | "error";
  modes: string[];
  steps: CiParityStep[];
  reasons: string[];
}

export interface CiParityCommandRunner {
  (
    cwd: string,
    command: string[],
    options?: { env?: Record<string, string | undefined> },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface PreCommitAutofixResult {
  status: "finished" | "skipped";
  reformattedFiles: string[];
  warnings: string[];
  steps: CiParityStep[];
}

const defaultCommandRunner: CiParityCommandRunner = (cwd, command, options) => runCommand(cwd, command, options);

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function outputTail(result: { stdout: string; stderr: string }): string {
  const separator = result.stdout && result.stderr && !result.stdout.endsWith("\n") ? "\n" : "";
  return `${result.stdout}${separator}${result.stderr}`.slice(-4_000);
}

async function runStep(input: {
  cwd: string;
  name: string;
  command: string[];
  steps: CiParityStep[];
  runCommand: CiParityCommandRunner;
  options?: { env?: Record<string, string | undefined> };
}): Promise<{ exitCode: number; stdout: string; stderr: string } | null> {
  const startedAt = performance.now();
  try {
    const result = await input.runCommand(input.cwd, input.command, input.options);
    input.steps.push({
      name: input.name,
      command: input.command,
      exitCode: result.exitCode,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      outputTail: outputTail(result),
    });
    return result;
  } catch (error) {
    input.steps.push({
      name: input.name,
      command: input.command,
      exitCode: -1,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      outputTail: error instanceof Error ? error.message.slice(-4_000) : String(error).slice(-4_000),
    });
    return null;
  }
}

function failedStepReason(name: string, result: { stdout: string; stderr: string }): string {
  const detail = actionableFailureOutput(result);
  return detail ? `${name} failed: ${detail}` : `${name} failed`;
}

function spawnedStepError(name: string, steps: CiParityStep[]): string {
  const detail = steps.at(-1)?.outputTail;
  return detail ? `${name} could not run: ${detail}` : `${name} could not run`;
}

export async function runCiParityGate(input: {
  worktreeDir: string;
  sha: string;
  modes?: string[];
  runCommand?: CiParityCommandRunner;
}): Promise<CiParityResult> {
  const modes = input.modes ?? ["link", "test"];
  const result: CiParityResult = { status: "clean", modes, steps: [], reasons: [] };
  const commandRunner = input.runCommand ?? defaultCommandRunner;

  const head = await runStep({
    cwd: input.worktreeDir,
    name: "git rev-parse HEAD",
    command: ["git", "-C", input.worktreeDir, "rev-parse", "HEAD"],
    steps: result.steps,
    runCommand: commandRunner,
  });
  if (!head) {
    result.status = "error";
    result.reasons.push(spawnedStepError("git rev-parse HEAD", result.steps));
    return result;
  }
  if (head.exitCode !== 0) {
    result.status = "error";
    result.reasons.push(failedStepReason("git rev-parse HEAD", head));
    return result;
  }
  if (head.stdout.trim() !== input.sha) {
    const gitSwitch = await runStep({
      cwd: input.worktreeDir,
      name: "git switch detached SHA",
      command: ["git", "-C", input.worktreeDir, "switch", "--discard-changes", "--detach", input.sha],
      steps: result.steps,
      runCommand: commandRunner,
    });
    if (!gitSwitch) {
      result.status = "error";
      result.reasons.push(spawnedStepError("git switch", result.steps));
      return result;
    }
    if (gitSwitch.exitCode !== 0) {
      result.status = "error";
      result.reasons.push(failedStepReason("git switch", gitSwitch));
      return result;
    }
  }

  let matrix: ReturnType<typeof parseCiBuildMatrix>;
  try {
    const workflowText = await readFile(resolve(input.worktreeDir, ".github/workflows/build.yml"), "utf8");
    matrix = parseCiBuildMatrix(workflowText);
  } catch (error) {
    result.status = "error";
    result.reasons.push(error instanceof Error ? error.message : String(error));
    return result;
  }

  const configurePath = resolve(input.worktreeDir, "configure.py");
  if (!(await pathExists(configurePath))) {
    result.status = "error";
    result.reasons.push(`configure.py was not found in ${input.worktreeDir}`);
    return result;
  }

  const wrapperPath = await pathExists(resolve(input.worktreeDir, "build/tools/wibo"))
    ? "build/tools/wibo"
    : null;

  for (const mode of modes) {
    const modeArgs = matrix.modes[mode];
    if (!modeArgs) {
      result.status = "error";
      result.reasons.push(`CI workflow does not define the ${mode} mode`);
      continue;
    }
    const configureArgs = [
      ...localizeConfigureArgs([...modeArgs, ...matrix.baseArgs], { wrapperPath }),
      "--build-dir",
      `build-ci/${mode}`,
    ];
    const configure = await runStep({
      cwd: input.worktreeDir,
      name: `configure ${mode}`,
      command: ["python3", "configure.py", ...configureArgs],
      steps: result.steps,
      runCommand: commandRunner,
    });
    if (!configure) {
      result.status = "error";
      result.reasons.push(spawnedStepError(`configure ${mode}`, result.steps));
      continue;
    }
    if (configure.exitCode !== 0) {
      if (result.status === "clean") result.status = "failed";
      result.reasons.push(failedStepReason(`configure ${mode}`, configure));
      continue;
    }

    const ninja = await runStep({
      cwd: input.worktreeDir,
      name: `ninja ${mode}`,
      command: ["ninja"],
      steps: result.steps,
      runCommand: commandRunner,
    });
    if (!ninja) {
      result.status = "error";
      result.reasons.push(spawnedStepError(`ninja ${mode}`, result.steps));
      continue;
    }
    if (ninja.exitCode !== 0) {
      if (result.status === "clean") result.status = "failed";
      result.reasons.push(failedStepReason(`ninja ${mode}`, ninja));
      continue;
    }

    if (mode !== "link") continue;

    const diff = await runStep({
      cwd: input.worktreeDir,
      name: "ninja diff",
      command: ["ninja", "diff"],
      steps: result.steps,
      runCommand: commandRunner,
    });
    if (!diff) {
      result.status = "error";
      result.reasons.push(spawnedStepError("ninja diff", result.steps));
      continue;
    }
    const hasErrorLine = `${diff.stdout}\n${diff.stderr}`.split(/\r?\n/).some((line) => line.includes("ERROR"));
    if (diff.exitCode !== 0 || hasErrorLine) {
      if (result.status === "clean") result.status = "failed";
      if (diff.exitCode !== 0) result.reasons.push(failedStepReason("ninja diff", diff));
      if (hasErrorLine) result.reasons.push("ninja diff reported ERROR lines");
      continue;
    }

    const reportPath = resolve(input.worktreeDir, "build-ci/link/GALE01/report.json");
    if (!(await pathExists(reportPath))) {
      result.reasons.push("check_complete skipped: build-ci/link/GALE01/report.json does not exist");
      continue;
    }
    const checkComplete = await runStep({
      cwd: input.worktreeDir,
      name: "check_complete link",
      command: ["python3", ".github/scripts/check_complete.py", "build-ci/link/GALE01/report.json"],
      steps: result.steps,
      runCommand: commandRunner,
    });
    if (!checkComplete) {
      result.status = "error";
      result.reasons.push(spawnedStepError("check_complete link", result.steps));
      continue;
    }
    if (checkComplete.exitCode !== 0) {
      if (result.status === "clean") result.status = "failed";
      result.reasons.push(failedStepReason("check_complete link", checkComplete));
    }
  }

  return result;
}

export async function runPreCommitGate(input: {
  worktreeDir: string;
  cacheDir: string;
  runCommand?: CiParityCommandRunner;
}): Promise<CiParityResult> {
  const result: CiParityResult = { status: "clean", modes: ["pre-commit"], steps: [], reasons: [] };
  const commandRunner = input.runCommand ?? defaultCommandRunner;

  const probe = await runStep({
    cwd: input.worktreeDir,
    name: "pre-commit version",
    command: ["pre-commit", "--version"],
    steps: result.steps,
    runCommand: commandRunner,
  });
  if (!probe || probe.exitCode !== 0) {
    result.status = "error";
    result.reasons.push("pre-commit is not installed; install it (pip install pre-commit) or pass --no-pre-commit-gate");
    return result;
  }

  if (!(await pathExists(resolve(input.worktreeDir, "compile_commands.json")))) {
    if (!(await pathExists(resolve(input.worktreeDir, "configure.py")))) {
      result.status = "error";
      result.reasons.push(`configure.py was not found in ${input.worktreeDir}`);
      return result;
    }
    const configure = await runStep({
      cwd: input.worktreeDir,
      name: "configure compile database",
      command: ["python3", "configure.py"],
      steps: result.steps,
      runCommand: commandRunner,
    });
    if (!configure) {
      result.status = "error";
      result.reasons.push(spawnedStepError("configure compile database", result.steps));
      return result;
    }
    if (configure.exitCode !== 0) {
      result.status = "failed";
      result.reasons.push(failedStepReason("configure compile database", configure));
      return result;
    }
  }

  const preCommit = await runStep({
    cwd: input.worktreeDir,
    name: "pre-commit run",
    command: ["pre-commit", "run", "--show-diff-on-failure", "--color=never", "--all-files"],
    steps: result.steps,
    runCommand: commandRunner,
    options: { env: { PRE_COMMIT_HOME: input.cacheDir } },
  });
  if (!preCommit) {
    result.status = "error";
    result.reasons.push(spawnedStepError("pre-commit run", result.steps));
    return result;
  }
  if (preCommit.exitCode === 0) return result;

  result.status = "failed";
  result.reasons.push(failedStepReason("pre-commit", preCommit));
  const reset = await runStep({
    cwd: input.worktreeDir,
    name: "reset pre-commit changes",
    command: ["git", "-C", input.worktreeDir, "checkout", "--", "."],
    steps: result.steps,
    runCommand: commandRunner,
  });
  if (!reset) result.reasons.push(spawnedStepError("reset pre-commit changes", result.steps));
  else if (reset.exitCode !== 0) result.reasons.push(failedStepReason("reset pre-commit changes", reset));
  return result;
}

async function changedFileDigests(worktreeDir: string, names: string[]): Promise<Map<string, string | null>> {
  const digests = new Map<string, string | null>();
  for (const name of names) {
    try {
      digests.set(name, Bun.hash(await readFile(resolve(worktreeDir, name))).toString(16));
    } catch {
      digests.set(name, null);
    }
  }
  return digests;
}

function changedNames(result: { stdout: string }): string[] {
  return result.stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
}

/** Run the same pinned pre-commit hooks as CI parity, preserving any hook edits. */
export async function runPreCommitAutofix(input: {
  worktreeDir: string;
  cacheDir: string;
  runCommand?: CiParityCommandRunner;
}): Promise<PreCommitAutofixResult> {
  const steps: CiParityStep[] = [];
  const commandRunner = input.runCommand ?? defaultCommandRunner;
  const probe = await runStep({ cwd: input.worktreeDir, name: "pre-commit version", command: ["pre-commit", "--version"], steps, runCommand: commandRunner });
  if (!probe || probe.exitCode !== 0) {
    return { status: "skipped", reformattedFiles: [], warnings: ["pre-commit is unavailable"], steps };
  }
  const beforeStep = await runStep({ cwd: input.worktreeDir, name: "list changed files before pre-commit", command: ["git", "-C", input.worktreeDir, "diff", "--name-only", "HEAD"], steps, runCommand: commandRunner });
  const beforeNames = beforeStep?.exitCode === 0 ? changedNames(beforeStep) : [];
  const beforeDigests = await changedFileDigests(input.worktreeDir, beforeNames);
  const preCommit = await runStep({
    cwd: input.worktreeDir, name: "pre-commit autofix",
    command: ["pre-commit", "run", "--show-diff-on-failure", "--color=never", "--all-files"],
    steps, runCommand: commandRunner, options: { env: { PRE_COMMIT_HOME: input.cacheDir } },
  });
  const warnings: string[] = [];
  if (!preCommit) warnings.push(spawnedStepError("pre-commit autofix", steps));
  else if (preCommit.exitCode !== 0) warnings.push(failedStepReason("pre-commit autofix", preCommit));
  const afterStep = await runStep({ cwd: input.worktreeDir, name: "list changed files after pre-commit", command: ["git", "-C", input.worktreeDir, "diff", "--name-only", "HEAD"], steps, runCommand: commandRunner });
  const afterNames = afterStep?.exitCode === 0 ? changedNames(afterStep) : beforeNames;
  const candidates = [...new Set([...beforeNames, ...afterNames])].sort();
  const afterDigests = await changedFileDigests(input.worktreeDir, candidates);
  return {
    status: "finished",
    reformattedFiles: candidates.filter((name) => beforeDigests.get(name) !== afterDigests.get(name)),
    warnings,
    steps,
  };
}
