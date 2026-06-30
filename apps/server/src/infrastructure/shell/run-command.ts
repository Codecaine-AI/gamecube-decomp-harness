export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunCommandOptions {
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
}

export async function runCommand(repoRoot: string, command: string[], options: RunCommandOptions = {}): Promise<CommandResult> {
  let timedOut = false;
  const proc = Bun.spawn(command, {
    cwd: repoRoot,
    env: options.env ? { ...Bun.env, ...options.env } : Bun.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const timeout =
    options.timeoutMs && options.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          proc.kill(9);
        }, options.timeoutMs)
      : null;
  const stdoutPromise = new Response(proc.stdout).text();
  const stderrPromise = new Response(proc.stderr).text();
  try {
    const [stdout, stderr, exitCode] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);
    if (!timedOut) return { exitCode, stdout, stderr };
    const timeoutSeconds = Math.round((options.timeoutMs ?? 0) / 1000);
    return {
      exitCode: exitCode === 0 ? 124 : exitCode,
      stdout,
      stderr: `${stderr}${stderr.endsWith("\n") || !stderr ? "" : "\n"}Command timed out after ${timeoutSeconds}s: ${command.join(" ")}`,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Like runCommand, but emits each output chunk as it arrives while still
 * collecting the full result. Long builds stay observable (the dashboard
 * streams child stderr live) instead of going silent until exit.
 */
export async function runCommandStreaming(
  repoRoot: string,
  command: string[],
  onOutput: (chunk: string, stream: "stdout" | "stderr") => void,
): Promise<CommandResult> {
  const proc = Bun.spawn(command, {
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  const collect = async (stream: ReadableStream<Uint8Array>, name: "stdout" | "stderr"): Promise<string> => {
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    for await (const chunk of stream) {
      const value = decoder.decode(chunk, { stream: true });
      if (!value) continue;
      chunks.push(value);
      onOutput(value, name);
    }
    const tail = decoder.decode();
    if (tail) {
      chunks.push(tail);
      onOutput(tail, name);
    }
    return chunks.join("");
  };
  const [stdout, stderr, exitCode] = await Promise.all([collect(proc.stdout, "stdout"), collect(proc.stderr, "stderr"), proc.exited]);
  return { exitCode, stdout, stderr };
}
