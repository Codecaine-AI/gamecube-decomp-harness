import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface BuildFixerResult {
  exitCode: number | null;
  timedOut: boolean;
  output: string;
}

export const BUILD_FIXER_TIMEOUT_MS = 5 * 60_000;

export interface CapturedBuildFixerPatch {
  patchSize: number;
  hunkCount: number;
}

/** Captures Git's patch bytes without passing them through a text-normalizing command helper. */
export async function captureBuildFixerPatch(input: {
  worktreeDir: string;
  patchPath: string;
}): Promise<CapturedBuildFixerPatch> {
  const pathspec = [".", ":(exclude)build", ":(exclude,glob)**/build/**"];
  const proc = Bun.spawn([
    "git", "-C", input.worktreeDir, "diff", "--no-color", "--binary", "HEAD", "--", ...pathspec,
  ], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(), new Response(proc.stderr).text(), proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`boundary build-fixer raw diff capture failed: ${stderr.trim() || `git exited ${exitCode}`}`);
  }

  const captured = new Uint8Array(stdout);
  let patch = captured;
  if (captured.length > 0 && captured[captured.length - 1] !== 0x0a) {
    patch = new Uint8Array(captured.length + 1);
    patch.set(captured);
    patch[patch.length - 1] = 0x0a;
  }
  await mkdir(dirname(input.patchPath), { recursive: true });
  await writeFile(input.patchPath, patch);

  const hunkCount = (new TextDecoder().decode(patch).match(/^@@ /gm) ?? []).length;
  console.info(`[epoch] captured boundary build-fixer patch: ${patch.byteLength} bytes, ${hunkCount} hunk(s)`);

  const check = Bun.spawn([
    "git", "-C", input.worktreeDir, "apply", "--check", "--reverse", input.patchPath,
  ], { stdout: "pipe", stderr: "pipe" });
  const [checkStdout, checkStderr, checkExitCode] = await Promise.all([
    new Response(check.stdout).text(), new Response(check.stderr).text(), check.exited,
  ]);
  if (checkExitCode !== 0) {
    const detail = [checkStderr.trim(), checkStdout.trim()].filter(Boolean).join("\n");
    throw new Error(
      `boundary build-fixer captured patch failed reverse validation in epoch worktree ` +
      `(${patch.byteLength} bytes, ${hunkCount} hunk(s)): ${detail || `git exited ${checkExitCode}`}`,
    );
  }
  return { patchSize: patch.byteLength, hunkCount };
}

/** Runs one bounded Codex edit attempt in the supplied worktree. */
export async function runCodexBuildFixer(input: {
  worktreeDir: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<BuildFixerResult> {
  const proc = Bun.spawn([
    "codex", "exec", "-m", "gpt-5.6-sol", "-c", 'model_reasoning_effort="low"',
    "--enable", "fast_mode", "-s", "workspace-write", input.prompt,
  ], { cwd: input.worktreeDir, stdout: "pipe", stderr: "pipe" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout("timeout"), input.timeoutMs ?? BUILD_FIXER_TIMEOUT_MS);
  });
  const timedOut = await Promise.race([proc.exited.then(() => false), timeout]) === "timeout";
  if (timedOut) proc.kill();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  if (timer) clearTimeout(timer);
  return {
    exitCode: timedOut ? null : exitCode,
    timedOut,
    output: [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(-12_000),
  };
}
