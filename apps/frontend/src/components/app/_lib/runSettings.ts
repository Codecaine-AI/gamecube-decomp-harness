import type { DashboardRun, FormState } from "@/lib/format";
import { DEFAULT_WORKER_TIMEOUT_SECONDS } from "@/lib/workerConfig";

const RUN_SETTINGS_KEY = "runSettings.v1";
const THINKING_LEVEL_SETTINGS_VERSION = 3;
// Bump to invalidate saved maxWorkers/model/syncIngestConcurrency when their defaults change.
const RUN_SETTINGS_VERSION = 6;
const DEFAULT_THINKING_LEVEL = "low";

export const RUN_MODEL_OPTIONS = ["gpt-5.6-sol", "gpt-5.6-terra"] as const;

export function schedulingForWorkers(workers: number) {
  const maxWorkers = Number.isFinite(workers) && workers > 0 ? Math.trunc(workers) : 16;
  return {
    maxWorkers,
  };
}

const HYDRATABLE_RUN_STATUSES = new Set(["ready", "active", "paused"]);

export function runConfigurationFormPatch(run: DashboardRun | null | undefined): Partial<FormState> | null {
  if (!run || !HYDRATABLE_RUN_STATUSES.has(String(run.status))) return null;
  const snapshot = run.inputs?.configuration_snapshot;
  if (!snapshot) return null;

  const patch: Partial<FormState> = {};
  if (typeof snapshot.desired_workers === "number" && snapshot.desired_workers > 0) {
    patch.maxWorkers = Math.trunc(snapshot.desired_workers);
  }
  if (typeof snapshot.sandbox_profile === "string" && snapshot.sandbox_profile) patch.sandboxProfile = snapshot.sandbox_profile;
  if (typeof snapshot.model === "string" && snapshot.model) patch.model = snapshot.model;
  if (typeof snapshot.provider === "string" && snapshot.provider) patch.provider = snapshot.provider;
  if (typeof snapshot.thinking_level === "string" && snapshot.thinking_level) patch.thinkingLevel = snapshot.thinking_level;
  if (typeof snapshot.agent_timeout_seconds === "number" && snapshot.agent_timeout_seconds > 0) {
    patch.agentTimeoutSeconds = Math.trunc(snapshot.agent_timeout_seconds);
  }
  return patch;
}

type SavedRunSettings = Pick<
  FormState,
  | "maxWorkers"
  | "provider"
  | "model"
  | "sandboxProfile"
  | "thinkingLevel"
  | "agentTimeoutSeconds"
  | "syncIngestConcurrency"
  | "syncProvider"
  | "syncModel"
  | "syncThinking"
> & {
  thinkingLevelVersion?: number;
  settingsVersion?: number;
};

function loadRunSettings(): Partial<SavedRunSettings> {
  try {
    const raw = localStorage.getItem(RUN_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const settings: Partial<SavedRunSettings> = {};
    // Saved values written before the current settings version predate the
    // 12-worker/gpt-5.6-sol/16-way sync-ingest defaults; drop them so the new
    // defaults win until the user saves again.
    const currentVersion = parsed.settingsVersion === RUN_SETTINGS_VERSION;
    if (currentVersion && typeof parsed.maxWorkers === "number" && parsed.maxWorkers > 0) settings.maxWorkers = Math.trunc(parsed.maxWorkers);
    if (parsed.provider === "codex-lb") settings.provider = parsed.provider;
    if (currentVersion && (parsed.model === "gpt-5.6-sol" || parsed.model === "gpt-5.6-terra")) settings.model = parsed.model;
    if (currentVersion && (parsed.sandboxProfile === "2-core" || parsed.sandboxProfile === "4-core")) settings.sandboxProfile = parsed.sandboxProfile;
    if (typeof parsed.thinkingLevel === "string" && parsed.thinkingLevel) {
      settings.thinkingLevel =
        parsed.thinkingLevelVersion !== THINKING_LEVEL_SETTINGS_VERSION
          ? DEFAULT_THINKING_LEVEL
          : parsed.thinkingLevel;
    }
    if (typeof parsed.agentTimeoutSeconds === "number" && parsed.agentTimeoutSeconds > 0) settings.agentTimeoutSeconds = Math.trunc(parsed.agentTimeoutSeconds);
    if (currentVersion && typeof parsed.syncIngestConcurrency === "number" && parsed.syncIngestConcurrency > 0) {
      settings.syncIngestConcurrency = Math.trunc(parsed.syncIngestConcurrency);
    }
    if (typeof parsed.syncProvider === "string" && parsed.syncProvider) settings.syncProvider = parsed.syncProvider;
    if (typeof parsed.syncModel === "string" && parsed.syncModel) settings.syncModel = parsed.syncModel;
    if (typeof parsed.syncThinking === "string" && parsed.syncThinking) settings.syncThinking = parsed.syncThinking;
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
      sandboxProfile: form.sandboxProfile,
      thinkingLevel: form.thinkingLevel,
      thinkingLevelVersion: THINKING_LEVEL_SETTINGS_VERSION,
      settingsVersion: RUN_SETTINGS_VERSION,
      agentTimeoutSeconds: form.agentTimeoutSeconds,
      syncIngestConcurrency: form.syncIngestConcurrency,
      syncProvider: form.syncProvider,
      syncModel: form.syncModel,
      syncThinking: form.syncThinking,
    };
    localStorage.setItem(RUN_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this cycle if storage is unavailable.
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
  gameId: "",
  usePathOverrides: false,
  repoRoot: "",
  stateDir: "",
  graphDbPath: "",
  processName: "",
  ...schedulingForWorkers(12),
  goalValue: 100,
  provider: "codex-lb",
  model: "gpt-5.6-sol",
  sandboxProfile: "2-core",
  thinkingLevel: DEFAULT_THINKING_LEVEL,
  agentTimeoutSeconds: DEFAULT_WORKER_TIMEOUT_SECONDS,
  // Sync knowledge-agent defaults mirror the job-runner's pi defaults.
  syncIngestConcurrency: 16,
  syncProvider: "codex-lb",
  syncModel: "gpt-5.6-sol",
  syncThinking: "medium",
};
