import type { FormState } from "@/lib/format";
import { DEFAULT_TOOL_CONCURRENCY, DEFAULT_WORKER_TIMEOUT_SECONDS, normalizeToolConcurrency } from "@/lib/workerConfig";

const RUN_SETTINGS_KEY = "runSettings.v1";

export function schedulingForWorkers(workers: number) {
  const maxWorkers = Number.isFinite(workers) && workers > 0 ? Math.trunc(workers) : 16;
  return {
    maxWorkers,
  };
}

type SavedRunSettings = Pick<
  FormState,
  | "maxWorkers"
  | "provider"
  | "model"
  | "thinkingLevel"
  | "epochSize"
  | "agentTimeoutSeconds"
  | "toolConcurrency"
>;

function loadRunSettings(): Partial<SavedRunSettings> {
  try {
    const raw = localStorage.getItem(RUN_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const settings: Partial<SavedRunSettings> = {};
    if (typeof parsed.maxWorkers === "number" && parsed.maxWorkers > 0) settings.maxWorkers = Math.trunc(parsed.maxWorkers);
    if (typeof parsed.provider === "string" && parsed.provider) settings.provider = parsed.provider;
    if (typeof parsed.model === "string" && parsed.model) settings.model = parsed.model;
    if (typeof parsed.thinkingLevel === "string" && parsed.thinkingLevel) settings.thinkingLevel = parsed.thinkingLevel;
    if (typeof parsed.epochSize === "string" && parsed.epochSize) settings.epochSize = parsed.epochSize;
    if (typeof parsed.agentTimeoutSeconds === "number" && parsed.agentTimeoutSeconds > 0) settings.agentTimeoutSeconds = Math.trunc(parsed.agentTimeoutSeconds);
    if (parsed.toolConcurrency && typeof parsed.toolConcurrency === "object") settings.toolConcurrency = normalizeToolConcurrency(parsed.toolConcurrency);
    return settings;
  } catch {
    return {};
  }
}

export function saveRunSettings(form: FormState) {
  try {
    const settings: SavedRunSettings = {
      maxWorkers: form.maxWorkers,
      provider: form.provider,
      model: form.model,
      thinkingLevel: form.thinkingLevel,
      epochSize: form.epochSize,
      agentTimeoutSeconds: form.agentTimeoutSeconds,
      toolConcurrency: normalizeToolConcurrency(form.toolConcurrency),
    };
    localStorage.setItem(RUN_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this session if storage is unavailable.
  }
}

export function initialForm(): FormState {
  const saved = loadRunSettings();
  const merged = { ...defaultForm, ...saved };
  return {
    ...merged,
    ...schedulingForWorkers(merged.maxWorkers),
    agentTimeoutSeconds: saved.agentTimeoutSeconds ?? merged.agentTimeoutSeconds,
  };
}

const defaultForm: FormState = {
  projectId: "",
  usePathOverrides: false,
  repoRoot: "",
  stateDir: "",
  graphDbPath: "",
  processName: "melee-live",
  ...schedulingForWorkers(16),
  epochSize: "64",
  goalValue: 100,
  provider: "codex-lb",
  model: "gpt-5.5",
  thinkingLevel: "medium",
  agentTimeoutSeconds: DEFAULT_WORKER_TIMEOUT_SECONDS,
  toolConcurrency: DEFAULT_TOOL_CONCURRENCY,
};
