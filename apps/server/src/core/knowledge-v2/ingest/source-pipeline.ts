import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SOURCE_STAGES = ["acquisition", "import", "search_index", "curation"] as const;
export type SourceStage = typeof SOURCE_STAGES[number];
export interface SourceDefinition {
  identity: { game_id: string; source_id: string; kind: "pr" | "discord" | "wiki"; upstream: string };
  configuration: {
    enabled: boolean;
    adapter: string;
    adapter_version: string;
    scope: Record<string, unknown>;
    credential_ref?: string | null;
    refresh: "each_sync" | "explicit";
    required_stage: SourceStage | null;
    reason?: string;
  };
}
export interface SourceCapture {
  acquisition_origin?: "local_mirror" | "upstream";
  upstream_refreshed?: boolean;
  manifest: string;
  content_hashes: Record<string, string>;
  revisions: string[];
  cursor: Record<string, unknown>;
}
export interface SourceStageState {
  status: "pending" | "running" | "complete" | "failed" | "unavailable";
  counts?: Record<string, number>;
  reason?: string;
}
export interface SourceState {
  identity: SourceDefinition["identity"];
  configuration_hash: string;
  operation_id: string;
  capture?: SourceCapture;
  stages: Record<SourceStage, SourceStageState>;
  readiness: "pending" | "ready" | "disabled" | "unavailable" | "blocked";
  reason?: string;
}
export interface SourceStageResult {
  status: "complete" | "pending" | "unavailable";
  counts?: Record<string, number>;
  reason?: string;
  capture?: SourceCapture;
}
export interface SourceStageContext {
  source: SourceDefinition;
  capture?: SourceCapture;
  /** Adapters must use this key to deduplicate side effects after interrupted publication. */
  idempotencyKey: string;
  /** Persist partial acquisition without claiming its remaining pages are complete. */
  checkpoint(capture: SourceCapture): void;
}
export type SourceAdapter = Partial<Record<SourceStage, (context: SourceStageContext) => Promise<SourceStageResult>>>;
export interface SourcePipelineOptions {
  gameId: string;
  stateRoot: string;
  operationId: string;
  sources: SourceDefinition[];
  mode: "bootstrap" | "sync";
  adapters: Record<string, SourceAdapter>;
  /** Explicitly refresh selected sources during an incremental Sync. */
  refreshSourceIds?: string[];
  runCuration?: boolean;
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function hash(value: unknown): string { return createHash("sha256").update(stable(value)).digest("hex"); }
function identifier(value: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) throw new Error(`Invalid source/game identifier: ${value}`);
}
export function validateSourceDefinitions(gameId: string, sources: SourceDefinition[]): void {
  identifier(gameId);
  const ids = new Set<string>();
  for (const source of sources) {
    identifier(source.identity.source_id);
    if (source.identity.game_id !== gameId) throw new Error(`Source ${source.identity.source_id} belongs to ${source.identity.game_id}, not ${gameId}`);
    if (ids.has(source.identity.source_id)) throw new Error(`Duplicate source ${source.identity.source_id}`);
    ids.add(source.identity.source_id);
    if (!["pr", "discord", "wiki"].includes(source.identity.kind) || !source.identity.upstream?.trim()) throw new Error("Source kind and upstream are required");
    const config = source.configuration;
    if (typeof config.enabled !== "boolean" || !config.adapter?.trim() || !config.adapter_version?.trim()) throw new Error("Source adapter and version are required");
    if (!config.scope || typeof config.scope !== "object" || Array.isArray(config.scope)) throw new Error("Source scope must be an object");
    if (!["each_sync", "explicit"].includes(config.refresh)) throw new Error("Invalid source refresh policy");
    if (config.required_stage !== null && !SOURCE_STAGES.includes(config.required_stage)) throw new Error("Invalid required source stage");
    if (!config.enabled && !config.reason?.trim()) throw new Error(`Disabled source ${source.identity.source_id} requires a reason`);
  }
}
function initial(source: SourceDefinition, operationId: string): SourceState {
  return {
    identity: source.identity, configuration_hash: hash(source), operation_id: operationId,
    stages: Object.fromEntries(SOURCE_STAGES.map(stage => [stage, { status: "pending" }])) as SourceState["stages"],
    readiness: source.configuration.enabled ? "pending" : "disabled",
    ...(!source.configuration.enabled ? { reason: source.configuration.reason } : {}),
  };
}
function readiness(source: SourceDefinition, state: SourceState): void {
  if (!source.configuration.enabled) { state.readiness = "disabled"; state.reason = source.configuration.reason; return; }
  const gate = source.configuration.required_stage;
  const required = gate === null ? [] : SOURCE_STAGES.slice(0, SOURCE_STAGES.indexOf(gate) + 1);
  const failure = required.find(stage => ["failed", "unavailable"].includes(state.stages[stage].status));
  if (failure) { state.readiness = "blocked"; state.reason = `${failure}: ${state.stages[failure].reason}`; return; }
  if (gate !== null && required.every(stage => state.stages[stage].status === "complete")) { state.readiness = "ready"; delete state.reason; return; }
  const unavailable = SOURCE_STAGES.find(stage => state.stages[stage].status === "unavailable");
  if (unavailable) { state.readiness = "unavailable"; state.reason = state.stages[unavailable].reason; return; }
  state.readiness = required.every(stage => state.stages[stage].status === "complete") ? "ready" : "pending";
  delete state.reason;
}
function publish(path: string, state: SourceState): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(state, null, 2));
  renameSync(`${path}.tmp`, path);
}

/** No acquisition is implicit: the configured, versioned adapter owns every stage. */
export async function runSourcePipeline(options: SourcePipelineOptions): Promise<{ ready: boolean; sources: SourceState[] }> {
  validateSourceDefinitions(options.gameId, options.sources);
  if (!options.operationId.trim()) throw new Error("Source operation ID is required");
  const root = join(options.stateRoot, "sources", options.gameId);
  mkdirSync(root, { recursive: true });
  const lock = join(root, ".lock");
  // Exclusive creation avoids concurrent writers racing durable checkpoints. A crashed
  // owner can be recovered only after the supervising process verifies it has stopped.
  writeFileSync(lock, JSON.stringify({ pid: process.pid, operationId: options.operationId }), { flag: "wx" });
  try {
    const states: SourceState[] = [];
    for (const source of options.sources) {
      const directory = join(root, source.identity.source_id);
      mkdirSync(directory, { recursive: true });
      const latestPath = join(directory, "latest.json");
      const previous = existsSync(latestPath) ? JSON.parse(readFileSync(latestPath, "utf8")) as SourceState : undefined;
      const refresh = options.mode === "bootstrap" || source.configuration.refresh === "each_sync" || options.refreshSourceIds?.includes(source.identity.source_id);
      const configHash = hash(source);
      if (!refresh && previous?.configuration_hash === configHash) { states.push(previous); continue; }
      const path = join(directory, `${hash([configHash, options.operationId])}.json`);
      const state = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as SourceState : initial(source, options.operationId);
      const save = () => { readiness(source, state); publish(path, state); publish(latestPath, state); };
      save();
      if (source.configuration.enabled) {
        const adapter = options.adapters[`${source.configuration.adapter}@${source.configuration.adapter_version}`];
        for (const stage of SOURCE_STAGES) {
          if (stage === "curation" && !options.runCuration && source.configuration.required_stage !== "curation") break;
          if (state.stages[stage].status === "complete") continue;
          const run = adapter?.[stage];
          if (!run) { state.stages[stage] = { status: "unavailable", reason: `No ${stage} adapter for ${source.configuration.adapter}@${source.configuration.adapter_version}` }; save(); break; }
          state.stages[stage] = { status: "running" }; save();
          try {
            const result = await run({ source, capture: state.capture ?? previous?.capture, idempotencyKey: hash([source.identity, configHash, options.operationId, stage]), checkpoint(capture) {
              if (stage !== "acquisition") throw new Error("Only acquisition can checkpoint a capture");
              state.capture = capture; save();
            } });
            if (!["complete", "pending", "unavailable"].includes(result.status)) throw new Error("Invalid source stage result");
            if (result.status === "unavailable" && !result.reason?.trim()) throw new Error("Unavailable source stage requires a reason");
            if (result.capture) state.capture = result.capture;
            if (stage === "acquisition" && result.status === "complete" && !state.capture?.manifest) throw new Error("Acquisition requires a capture manifest");
            state.stages[stage] = { status: result.status, counts: result.counts, reason: result.reason };
            if (stage === "acquisition" && result.status === "complete" && previous?.configuration_hash === configHash && previous.capture?.manifest === state.capture?.manifest) {
              for (const downstream of SOURCE_STAGES.slice(1)) {
                if (previous.stages[downstream].status === "complete") state.stages[downstream] = previous.stages[downstream];
              }
            }
          } catch (error) {
            state.stages[stage] = { status: "failed", reason: error instanceof Error ? error.message : String(error) };
          }
          save();
          if (state.stages[stage].status !== "complete") break;
        }
      }
      states.push(state);
    }
    return { ready: states.every((state, index) => !options.sources[index]!.configuration.enabled || options.sources[index]!.configuration.required_stage === null || state.readiness === "ready"), sources: states };
  } finally { rmSync(lock); }
}

/** Recovery is explicit and verifies both the recorded owner and that it is dead. */
export function recoverSourcePipelineLock(input: { stateRoot: string; gameId: string; expectedPid: number; expectedOperationId: string }): void {
  identifier(input.gameId);
  const path = join(input.stateRoot, "sources", input.gameId, ".lock");
  const text = readFileSync(path, "utf8");
  const lock = JSON.parse(text) as { pid: number; operationId: string };
  if (lock.pid !== input.expectedPid || lock.operationId !== input.expectedOperationId) throw new Error("Source lock ownership changed");
  if (!Number.isInteger(lock.pid) || lock.pid <= 0) throw new Error("Source lock has no valid owner PID");
  try { process.kill(lock.pid, 0); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    if (readFileSync(path, "utf8") !== text) throw new Error("Source lock ownership changed");
    rmSync(path);
    return;
  }
  throw new Error(`Source lock owner ${lock.pid} is still running`);
}
