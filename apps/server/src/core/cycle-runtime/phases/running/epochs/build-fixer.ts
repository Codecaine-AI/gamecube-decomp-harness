export interface BuildFixerResult {
  exitCode: number | null;
  timedOut: boolean;
  output: string;
}

export const BUILD_FIXER_TIMEOUT_MS = 5 * 60_000;

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
