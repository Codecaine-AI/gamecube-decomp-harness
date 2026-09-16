import { spawn } from "node:child_process";

import { sourceStorageRoot } from "@server/core/knowledge/paths.js";
import { uiLog } from "@server/infrastructure/logging/ui-log";

const DEFAULT_REFRESH_TIMEOUT_MS = 5 * 60 * 1_000;

function logOutput(stream: "stdout" | "stderr", output: string): void {
  for (const line of output.split(/\r?\n/)) {
    if (line.trim()) uiLog(stream, line);
  }
}

export async function refreshDiscordMirror(options: {
  timeoutMs?: number;
}): Promise<{ ok: boolean; detail: string }> {
  const cwd = sourceStorageRoot("discord_raw");
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS));

  try {
    return await new Promise((resolveResult) => {
      let settled = false;
      let timedOut = false;
      let stdout = "";
      let stderr = "";
      let child: ReturnType<typeof spawn>;

      const finish = (result: { ok: boolean; detail: string }): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        logOutput("stdout", stdout);
        logOutput("stderr", stderr);
        resolveResult(result);
      };

      try {
        child = spawn("python3", ["commands/sync_via_discord_cli.py"], {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        resolveResult({
          ok: false,
          detail: `Discord mirror refresh could not start: ${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr?.on("data", (chunk: string) => { stderr += chunk; });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.once("error", (error) => {
        finish({ ok: false, detail: `Discord mirror refresh failed: ${error.message}` });
      });
      child.once("close", (code, signal) => {
        if (timedOut) {
          finish({ ok: false, detail: `Discord mirror refresh timed out after ${timeoutMs}ms` });
          return;
        }
        if (code !== 0) {
          const reason = stderr.trim() || stdout.trim() || `signal ${signal ?? "unknown"}`;
          finish({ ok: false, detail: `Discord mirror refresh exited with code ${String(code)}: ${reason}` });
          return;
        }
        finish({ ok: true, detail: "Discord mirror refresh completed" });
      });
    });
  } catch (error) {
    return {
      ok: false,
      detail: `Discord mirror refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
