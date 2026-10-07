import { ModelRuntime } from "@agent-kernel/kernel/pi-sdk";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadLocalEnv } from "@server/infrastructure/env";

export interface ProviderProbeResult {
  success: boolean;
  error?: string;
}

/** One tool-free request using the same Pi auth/model configuration as workers. */
export async function probeWorkerProvider(
  options: { provider: string; model: string; timeoutMs?: number; signal?: AbortSignal },
  deps: { createRuntime?: typeof ModelRuntime.create } = {},
): Promise<ProviderProbeResult> {
  loadLocalEnv();
  const configured = process.env.PI_CODING_AGENT_DIR;
  const agentDir = configured === "~" ? homedir()
    : configured?.startsWith("~/") ? join(homedir(), configured.slice(2))
    : configured || join(homedir(), ".pi", "agent");
  const timeoutMs = options.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const request = (async () => {
      const runtime = await (deps.createRuntime ?? ModelRuntime.create)({
        authPath: join(agentDir, "auth.json"),
        modelsPath: join(agentDir, "models.json"),
        allowModelNetwork: false,
      });
      const model = runtime.getModel(options.provider, options.model);
      if (!model) throw new Error(`Pi model not found: ${options.provider}/${options.model}`);
      const response = await runtime.completeSimple(model, {
        messages: [{ role: "user", content: "Reply OK.", timestamp: Date.now() }],
      }, { maxTokens: 16, maxRetries: 0, timeoutMs, signal });
      return response.stopReason === "error" || response.stopReason === "aborted"
        ? { success: false, error: response.errorMessage ?? `Provider probe ${response.stopReason}` }
        : { success: true };
    })();
    return await Promise.race([
      request,
      new Promise<ProviderProbeResult>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve({ success: false, error: `Provider probe timed out after ${timeoutMs}ms` });
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
