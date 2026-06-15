import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PiPromptBundle, PiRunResult, RuntimeAgentRole } from "@decomp-orchestrator/core/types";
import { loadLocalEnv } from "@decomp-orchestrator/core/env";
import { buildAgentTools, type AgentToolProfileInput, type AgentToolRuntimeContext } from "../tools/index.js";

export interface PiRunOptions {
  role: RuntimeAgentRole;
  cwd: string;
  prompt: PiPromptBundle;
  outputDir: string;
  dryRun: boolean;
  provider?: string;
  model?: string;
  thinkingLevel?: string;
  timeoutMs?: number;
  sessionDir?: string;
  toolProfile?: AgentToolProfileInput;
  toolContext?: Partial<Omit<AgentToolRuntimeContext, "role" | "cwd">>;
  /** Pi built-in tool names to disable for this session (e.g. ["write"]). */
  excludeBuiltinTools?: string[];
}

export const DEFAULT_PI_PROVIDER = "codex-lb";
export const DEFAULT_PI_MODEL = "gpt-5.5";
export const DEFAULT_PI_THINKING_LEVEL = "medium";
export const DEFAULT_PI_SESSION_DIR_NAME = ".pi-sessions";

function packageRoot(): string {
  return fileURLToPath(new URL("../../../..", import.meta.url));
}

export function defaultPiSessionRoot(): string {
  return resolve(packageRoot(), DEFAULT_PI_SESSION_DIR_NAME);
}

export function defaultPiSessionDir(role: RuntimeAgentRole): string {
  return resolve(defaultPiSessionRoot(), role);
}

async function writeOutput(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

// The provider expects "xhigh"; "x-high"/"x_high" variants make it error and fall
// back to a different model, so normalize here where every agent's config flows through.
function normalizeThinkingLevel(level: string): string {
  const normalized = level.trim().toLowerCase();
  return normalized === "x-high" || normalized === "x_high" ? "xhigh" : normalized;
}

function piConfig(options: PiRunOptions): { provider: string; model: string; thinkingLevel: string } {
  return {
    provider: options.provider ?? DEFAULT_PI_PROVIDER,
    model: options.model ?? DEFAULT_PI_MODEL,
    thinkingLevel: normalizeThinkingLevel(options.thinkingLevel ?? DEFAULT_PI_THINKING_LEVEL),
  };
}

function dryRunTranscript(
  options: PiRunOptions,
  paths: { systemPromptPath: string; userPromptPath: string },
  customTools: Array<{ name: string }>,
): string {
  const config = piConfig(options);
  return [
    `[dry-run ${options.role} Pi agent]`,
    `cwd: ${options.cwd}`,
    `provider: ${config.provider}`,
    `model: ${config.model}`,
    `thinking: ${config.thinkingLevel}`,
    `session_dir: ${options.sessionDir ?? defaultPiSessionDir(options.role)}`,
    `system_template: ${options.prompt.systemTemplatePath}`,
    `user_template: ${options.prompt.userTemplatePath}`,
    `system_prompt_artifact: ${paths.systemPromptPath}`,
    `user_prompt_artifact: ${paths.userPromptPath}`,
    `custom_tools: ${customTools.map((tool) => tool.name).join(", ") || "(none)"}`,
    "",
    "=== SYSTEM PROMPT ===",
    options.prompt.systemPrompt,
    "",
    "=== INITIAL USER PROMPT ===",
    options.prompt.userPrompt,
  ].join("\n");
}

function textFromContentPart(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const record = part as Record<string, unknown>;
  if (record.type === "text" && typeof record.text === "string") return record.text;
  if (record.type === "output_text" && typeof record.text === "string") return record.text;
  return "";
}

function textFromMessage(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const record = message as Record<string, unknown>;
  if (record.role && record.role !== "assistant") return "";
  const content = record.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(textFromContentPart).join("");
  return "";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined, message: string): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runPiAgent(options: PiRunOptions): Promise<PiRunResult> {
  loadLocalEnv();
  const sessionId = randomUUID();
  const outputPath = resolve(options.outputDir, `${options.role}_${sessionId}.txt`);
  const systemPromptPath = resolve(options.outputDir, `${options.role}_${sessionId}.system.md`);
  const userPromptPath = resolve(options.outputDir, `${options.role}_${sessionId}.user.md`);
  const toolContext: AgentToolRuntimeContext = {
    role: options.role,
    cwd: options.cwd,
    repoRoot: options.cwd,
    ...options.toolContext,
  };
  const customTools = buildAgentTools(toolContext, options.toolProfile);
  await writeOutput(systemPromptPath, options.prompt.systemPrompt);
  await writeOutput(userPromptPath, options.prompt.userPrompt);

  if (options.dryRun) {
    const rawText = dryRunTranscript(options, { systemPromptPath, userPromptPath }, customTools);
    await writeOutput(outputPath, rawText);
    return {
      sessionId,
      sessionDir: options.sessionDir ?? defaultPiSessionDir(options.role),
      outputPath,
      systemPromptPath,
      userPromptPath,
      rawText,
      dryRun: true,
    };
  }

  const pi = (await import("@earendil-works/pi-coding-agent")) as Record<string, any>;
  const config = piConfig(options);
  const sessionDir = options.sessionDir ?? defaultPiSessionDir(options.role);
  await mkdir(sessionDir, { recursive: true });
  const authStorage = pi.AuthStorage?.create?.();
  const modelRegistry = pi.ModelRegistry?.create?.(authStorage);
  const model = modelRegistry?.find?.(config.provider, config.model);
  if (!model) {
    throw new Error(`Pi model not found: ${config.provider}/${config.model}`);
  }
  const sessionManager = pi.SessionManager?.create?.(options.cwd, sessionDir);
  if (!sessionManager) {
    throw new Error("Pi SessionManager.create is unavailable; cannot persist session files");
  }
  let resourceLoader: any;
  if (typeof pi.DefaultResourceLoader === "function") {
    resourceLoader = new pi.DefaultResourceLoader({
      cwd: options.cwd,
      agentDir: typeof pi.getAgentDir === "function" ? pi.getAgentDir() : options.cwd,
      systemPromptOverride: () => options.prompt.systemPrompt,
      appendSystemPromptOverride: () => [],
    });
    await resourceLoader.reload?.();
  }
  const previousCwd = process.cwd();
  let rawText = "";
  let finalAssistantText = "";
  let session: any;
  let unsubscribe: (() => void) | undefined;

  try {
    process.chdir(options.cwd);
    const created = await pi.createAgentSession({
      cwd: options.cwd,
      authStorage,
      model,
      modelRegistry,
      thinkingLevel: config.thinkingLevel,
      sessionManager,
      resourceLoader,
      customTools,
      ...(options.excludeBuiltinTools?.length ? { excludeTools: options.excludeBuiltinTools } : {}),
    });
    session = created.session;

    let lastAssistantStopReason: string | undefined;
    let lastAssistantErrorMessage: string | undefined;
    unsubscribe = session.subscribe((event: any) => {
      if (event?.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
        rawText += event.assistantMessageEvent.delta;
      }
      if (event?.type === "message_end" || event?.type === "turn_end") {
        const text = textFromMessage(event.message);
        if (text) finalAssistantText = text;
        const record = event.message as Record<string, unknown> | undefined;
        if (record?.role === "assistant") {
          lastAssistantStopReason = typeof record.stopReason === "string" ? record.stopReason : undefined;
          lastAssistantErrorMessage = typeof record.errorMessage === "string" ? record.errorMessage : undefined;
        }
      }
    });
    await withTimeout(
      session.prompt(options.prompt.userPrompt),
      options.timeoutMs,
      `${options.role} Pi session timed out after ${Math.round((options.timeoutMs ?? 0) / 1000)}s`,
    );
    const outputText = finalAssistantText || rawText;
    await writeOutput(outputPath, outputText);
    const providerError =
      lastAssistantStopReason === "error" ? lastAssistantErrorMessage ?? "provider ended the session with an error and no message" : undefined;
    return {
      sessionId: String(session.sessionId ?? sessionId),
      sessionFile: typeof session.sessionFile === "string" ? session.sessionFile : undefined,
      sessionDir,
      outputPath,
      systemPromptPath,
      userPromptPath,
      rawText: outputText,
      dryRun: false,
      providerError,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const outputText = finalAssistantText || rawText;
    const failureText = outputText ? `${outputText}\n\n[Pi session failed]\n${message}\n` : `[Pi session failed]\n${message}\n`;
    await writeOutput(outputPath, failureText);
    return {
      sessionId: String(session?.sessionId ?? sessionId),
      sessionFile: typeof session?.sessionFile === "string" ? session.sessionFile : undefined,
      sessionDir,
      outputPath,
      systemPromptPath,
      userPromptPath,
      rawText: failureText,
      dryRun: false,
      failed: true,
      error: message,
    };
  } finally {
    unsubscribe?.();
    session?.dispose?.();
    process.chdir(previousCwd);
  }
}
