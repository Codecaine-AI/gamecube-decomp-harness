export type JsonObject = Record<string, unknown>;

export interface ProjectSummary {
  id: string;
  displayName: string;
  kind: string;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  processName: string;
  baseRef: string;
  descriptorPath: string;
  localOverridePath?: string;
  repoRootExists: boolean;
  stateDirExists: boolean;
  graphDbExists: boolean;
}

export interface UiConfig {
  defaultRepoRoot: string;
  defaultStateDir: string;
  defaultGraphDbPath: string;
  defaultProjectId: string;
  selectedProject: ProjectSummary | null;
  availableProjects: ProjectSummary[];
  projectDefaults: JsonObject | null;
  dashboardStreamIntervalMs: number;
  hotReload: boolean;
  port: number;
}

export interface FormState {
  projectId: string;
  usePathOverrides: boolean;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  processName: string;
  maxWorkers: number;
  idleSleepMs: number;
  candidateLimit: number;
  queueTargetSize: number;
  queueLowWatermark: number;
  candidateWindow: number;
  goalValue: number;
  provider: string;
  model: string;
  thinkingLevel: string;
  workerThinkingLevel: string;
}

export interface Dashboard {
  project: ProjectSummary | null;
  projectWarnings?: string[];
  repoRoot: string;
  stateDir: string;
  graphDbPath?: string;
  usePathOverrides?: boolean;
  status: JsonObject;
  initial: JsonObject;
  current: JsonObject;
  trustedReport: JsonObject;
  /** Current report vs the production (upstream) baseline; survives session baseline resets. */
  productionReport?: JsonObject | null;
  checkpoint?: JsonObject | null;
  handoff?: JsonObject | null;
  runSummary: JsonObject;
  improvements: JsonObject[];
  improvedFiles: JsonObject[];
  activeFiles: JsonObject[];
  queueTargets: JsonObject[];
  reports: JsonObject[];
  progressReports: JsonObject[];
  touchedFiles: JsonObject[];
  events: JsonObject[];
  process: JsonObject;
  campaign?: JsonObject | null;
  epochs?: JsonObject[];
  /** Completed leases since the last epoch checkpoint vs the checkpoint interval. */
  checkpointProgress?: JsonObject | null;
  prs?: JsonObject | null;
}

export interface RunDetails {
  project?: ProjectSummary | null;
  stateDir: string;
  runId: string;
  generatedAt?: string;
  summary?: JsonObject;
  timeline?: JsonObject[];
  reports?: JsonObject[];
  events?: JsonObject[];
  sessions?: JsonObject[];
  directorCycles?: JsonObject[];
  leases?: JsonObject[];
  queueTargets?: JsonObject[];
  improvements?: JsonObject[];
  improvedFiles?: JsonObject[];
  knowledgeIntake?: JsonObject;
}

export type PromptPreviewAgentId = "director" | "worker" | "pr-review" | "knowledge-curator" | "qa-repair";
export type PromptPreviewSource = "latest" | "sample";

export interface PromptPreviewStats {
  tokens: number;
  unresolvedPlaceholders: string[];
}

export interface PromptPreview {
  agent: PromptPreviewAgentId;
  requestedSource: PromptPreviewSource;
  contextSource: PromptPreviewSource;
  generatedAt: string;
  project: ProjectSummary | null;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  systemPrompt: string;
  userPrompt: string;
  systemTemplatePath: string;
  userTemplatePath: string;
  systemStats: PromptPreviewStats;
  userStats: PromptPreviewStats;
  context: JsonObject;
  warnings: string[];
}
