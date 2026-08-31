export type JsonObject = Record<string, unknown>;

export interface GameSummary {
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
  defaultGameId: string;
  selectedGame: GameSummary | null;
  availableGames: GameSummary[];
  gameDefaults: JsonObject | null;
  dashboardStreamIntervalMs: number;
  hotReload: boolean;
  port: number;
}

export interface FormState {
  gameId: string;
  usePathOverrides: boolean;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  processName: string;
  maxWorkers: number;
  agentTimeoutSeconds: number;
  goalValue: number;
  provider: string;
  model: string;
  sandboxProfile: string;
  thinkingLevel: string;
  /** Sync knowledge-agent overrides: sent with every sync command body and
   * consumed by the sync runtime's librarian/intake subprocesses. */
  syncIngestConcurrency: number;
  syncProvider: string;
  syncModel: string;
  syncThinking: string;
}

export type ScoreTierRowState = "in_branch" | "in_upstream";
export type ScoreTierComparisonStatus = "vs_upstream" | "baseline_unavailable";

export interface ScoreTierWin extends JsonObject {
  kind?: "function" | "section";
  symbol: string;
  unit: string;
  state?: ScoreTierRowState;
  score?: number | null;
  oldScore?: number | null;
  newScore?: number | null;
  delta?: number | null;
  bytesDelta?: number | null;
}

export interface ScoreTierTimelinePoint {
  savePointId: string;
  commitSha: string;
  score: number | null;
  kind: "baseline" | "epoch_finish" | "pr_sync" | "legacy";
  label: string;
  createdAt: string;
  measures?: JsonObject;
}

export interface DashboardScoreTiers {
  baseline: {
    score: number | null;
    anchorRevision: string | null;
    savePointId: string | null;
    measures?: JsonObject;
  };
  confirmed: {
    score: number | null;
    delta: number | null;
    savePointId: string | null;
    anchorRevision?: string | null;
    comparisonStatus?: ScoreTierComparisonStatus;
    matches: ScoreTierWin[];
    improvements: ScoreTierWin[];
    breakages: ScoreTierWin[];
  };
  tentative: {
    matches: ScoreTierWin[];
    improvements: ScoreTierWin[];
  };
  timeline: ScoreTierTimelinePoint[];
}

export interface RunConfigurationSnapshot extends JsonObject {
  desired_workers?: number;
  sandbox_profile?: string;
  model?: string;
  provider?: string;
  thinking_level?: string;
  agent_timeout_seconds?: number;
}

export interface DashboardRun extends JsonObject {
  id?: string;
  status?: string;
  inputs?: ({
    configuration_snapshot?: RunConfigurationSnapshot;
  } & JsonObject) | null;
}

export interface DashboardStatus extends JsonObject {
  run?: DashboardRun | null;
}

export type BoundaryStepState = "pending" | "running" | "done" | "warning" | "failed" | "skipped";

export interface BoundaryStep {
  key: string;
  state: BoundaryStepState;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  detail: string | null;
  error: string | null;
  payload: Record<string, unknown> | null;
}

export interface BoundaryAttempt {
  attempt: number;
  reconciled: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  steps: BoundaryStep[];
  error: string | null;
  failedStep: string | null;
  artifactDir: string | null;
}

export interface BoundaryView {
  epochId: string;
  ordinal: number;
  epochStatus: string;
  boundaryStatus: string | null;
  admittedCount: number;
  finishedCount: number;
  active: boolean;
  attempts: BoundaryAttempt[];
  error: string | null;
  retry: {
    attemptCount: number;
    maxAttempts: number | null;
    nextAttemptAt: string | null;
    exhausted: boolean;
  } | null;
  savePointId: string | null;
  matchedCodePercent: number | null;
  nextEpoch: { ordinal: number; admitted: number } | null;
}

export interface DashboardBoundary {
  current: BoundaryView | null;
  recent: BoundaryView[];
}

export interface Dashboard {
  game: GameSummary | null;
  harnessState?: JsonObject | null;
  cycle?: JsonObject | null;
  gameWarnings?: string[];
  repoRoot: string;
  stateDir: string;
  graphDbPath?: string;
  usePathOverrides?: boolean;
  status: DashboardStatus;
  initial: JsonObject;
  current: JsonObject;
  trustedReport: JsonObject;
  checkpoint?: JsonObject | null;
  handoff?: JsonObject | null;
  runSummary: JsonObject;
  improvements: JsonObject[];
  improvedFiles: JsonObject[];
  activeFiles: JsonObject[];
  epochTargets: JsonObject[];
  workerStates: JsonObject[];
  progressWorkerStates: JsonObject[];
  touchedFiles: JsonObject[];
  events: JsonObject[];
  process: JsonObject;
  campaign?: JsonObject | null;
  epochs?: JsonObject[];
  /** Closed worker states since the last epoch checkpoint vs the checkpoint interval. */
  checkpointProgress?: JsonObject | null;
  prs?: JsonObject | null;
  scoreTiers?: DashboardScoreTiers;
  boundary?: DashboardBoundary | null;
}

/** Durable knowledge-job progress nested at `Dashboard.harnessState.sync.knowledge_jobs`. */
export interface DashboardSyncKnowledgeJobsSummary {
  jobs_total: number;
  jobs_succeeded: number;
  jobs_failed: number;
  jobs_processing: number;
  prs: DashboardSyncKnowledgeJobGroupSummary;
  discord: DashboardSyncKnowledgeJobGroupSummary;
}

export interface DashboardSyncKnowledgeJobGroupSummary {
  jobs_total: number;
  jobs_succeeded: number;
  jobs_failed: number;
  jobs_processing: number;
}

export interface DashboardSyncDiscordSummary {
  corpus?: {
    batches_done: number;
    messages_indexed: number;
    through_month: string | null;
  };
  refresh: {
    status: "running" | "ok" | "failed";
    detail: string | null;
    at: string | null;
    messages_pulled: number | null;
  } | null;
  staged: {
    batches: number;
    messages: number;
    days: number;
    channels: number;
  } | null;
}

export type GameEventActor =
  | "operator"
  | "runner"
  | "agent"
  | "guardian"
  | "external_observer";

export type GameEventSubjectKind =
  | "game"
  | "run"
  | "sync_workflow"
  | "sync_push"
  | "cycle"
  | "knowledge_job"
  | "game_knowledge";

export type GameEventJsonPrimitive = boolean | null | number | string;
export type GameEventJsonValue =
  | GameEventJsonPrimitive
  | GameEventJsonObject
  | GameEventJsonValue[];
export interface GameEventJsonObject {
  [key: string]: GameEventJsonValue;
}

export interface GameEventDto {
  event_id: string;
  sequence: number;
  event_type: string;
  schema_version: number;
  game_id: string;
  subject_kind: GameEventSubjectKind;
  subject_id: string;
  correlation_id: string;
  causation_id: string;
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  actor: GameEventActor;
  occurred_at: string;
  payload_summary: GameEventJsonObject;
}

export interface GameEventQueryPage {
  events: GameEventDto[];
  has_more: boolean;
  next_after_sequence: number | null;
}

export interface GameEventCauseEvent {
  kind: "event";
  event_id: string;
  sequence: number;
  event_type: string;
  correlation_id: string;
  subject_kind: GameEventSubjectKind;
  subject_id: string;
}

export interface GameEventCauseCommand {
  kind: "command";
  command_id: string;
}

export type GameEventCause = GameEventCauseEvent | GameEventCauseCommand;

export interface ReconstructedGameEvent extends GameEventDto {
  caused_by: GameEventCause;
}

export interface KernelTraceDeepLinkDto {
  app_session_id: string;
  container_id: string;
  kernel_event_id: string;
  href: string;
}

/** A server-projected event-to-kernel-trace join. The trace target comes only from href. */
export interface GameEventKernelTraceProjection extends KernelTraceDeepLinkDto {
  event_id: string;
}

export interface GameEventReconstructionPage {
  game_id: string;
  correlation_id: string;
  events: ReconstructedGameEvent[];
  has_more: boolean;
  next_after_sequence: number | null;
  kernel_traces: GameEventKernelTraceProjection[];
}

export interface RunDetails {
  game?: GameSummary | null;
  stateDir: string;
  runId: string;
  generatedAt?: string;
  summary?: JsonObject;
  timeline?: JsonObject[];
  workerStates?: JsonObject[];
  events?: JsonObject[];
  sessions?: JsonObject[];
  directorCycles?: JsonObject[];
  targetClaims?: JsonObject[];
  epochTargets?: JsonObject[];
  improvements?: JsonObject[];
  improvedFiles?: JsonObject[];
  knowledgeIntake?: JsonObject;
}

export interface WorkerStateTrace extends JsonObject {
  runId: string;
  workerStateId: string;
}

export type PromptPreviewAgentId =
  | "worker"
  | "pr-reviewer"
  | "pr-splitter"
  | "librarian"
  | "reconcile"
  | "qa-repair";
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
  game: GameSummary | null;
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

/** A durable decomp standard record loaded from the decomp_standards source. */
export interface StandardRecord {
  id: string;
  title: string;
  summary: string[];
  status: string;
  family?: string;
  disposition?: string;
  severity?: string;
  qaEnforcement?: string;
  workerFacing?: boolean;
  retiredInto?: string;
  qaRuleIds?: string[];
  examplePolicy?: string;
  preferredRepairs?: string[];
  exampleCount?: number;
  canonicalExample?: StandardExampleRecord;
  do: string[];
  doNot: string[];
  evidenceRefs: string[];
}

/** A targeted repair/review example tied to a standard and optional QA rule. */
export interface StandardExampleRecord {
  id: string;
  standardId: string;
  qaRuleId?: string | null;
  severity: string;
  badPattern: string;
  preferredShape: string;
  description: string[];
  evidenceRef?: string;
}

/** Source/tool inventory surfaced by the Knowledge Base. */
export interface KnowledgeInventory {
  globalSources: string[];
  gameSources: string[];
  roots?: {
    gameKnowledgeRoot?: string;
    sourcesRoot?: string;
    resourceGraphRoot?: string;
    graphDbPath?: string;
  };
  validation: JsonObject;
  pr: JsonObject;
}

/** Payload returned by GET /api/standards for the Knowledge Base surface. */
export interface StandardsPayload {
  game: GameSummary | null;
  sourcePath: string;
  examplesPath?: string;
  records: StandardRecord[];
  examples: StandardExampleRecord[];
  /** Rendered <decomp_standards> XML as worker/QA prompts see it. */
  effectiveXml: string;
  /** The structured context object the knowledge package exposes. */
  context: JsonObject;
  inventory: KnowledgeInventory;
  warnings: string[];
}
