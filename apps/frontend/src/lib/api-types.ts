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
  integrationResolverConcurrency: number;
  agentTimeoutSeconds: number;
  goalValue: number;
  provider: string;
  model: string;
  thinkingLevel: string;
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
  status: JsonObject;
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
  | "pr_campaign"
  | "pr_series"
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
  | "integration-resolver"
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
