export type JsonObject = Record<string, unknown>;

export interface UiConfig {
  defaultRepoRoot: string;
  defaultStateDir: string;
  dashboardStreamIntervalMs: number;
  hotReload: boolean;
  port: number;
}

export interface FormState {
  repoRoot: string;
  stateDir: string;
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
  dryRunAgents: boolean;
  refreshPrLibrary: boolean;
  resetReportBaseline: boolean;
}

export interface Dashboard {
  repoRoot: string;
  stateDir: string;
  status: JsonObject;
  initial: JsonObject;
  current: JsonObject;
  trustedReport: JsonObject;
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
}

export interface RunDetails {
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
}
