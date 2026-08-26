import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { uiLog } from "@server/infrastructure/logging/ui-log";

export type JsonObject = Record<string, unknown>;

export const PR_RECORDS_SCHEMA_VERSION = "cycle_pr_records_v2";
export const PR_RECORD_SCHEMA_VERSION = "cycle_pr_record_v2";
export const DEFAULT_PR_BATCH_LIMIT = 3;

export interface PrRecordContext {
  baseSha?: string;
  cycleId?: string;
  runId?: string;
  sourcePlan?: JsonObject;
}

export interface PrRecordsServiceDeps {
  latestChildDirectory: (root: string) => string;
  latestPrSplitPlanSummary: (stateDir: string, runId: string) => JsonObject | null;
  latestRunId: (stateDir: string) => string;
  cycleUuidForRun: (stateDir: string, runId: string) => string;
  localPrepOperationRunning: () => boolean;
}

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function intValue(value: unknown, fallback: number, min = 0): number {
  const parsed = Math.trunc(numberValue(value, fallback));
  return Math.max(min, parsed);
}

function readJsonObject(path: string): JsonObject {
  try {
    if (!path || !existsSync(path)) return {};
    return asObject(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return {};
  }
}

export function prRecordsPath(stateDir: string): string {
  return resolve(stateDir, "pr_handoff", "pr_records.json");
}

export function readPrRecordsArtifact(stateDir: string): JsonObject {
  return readJsonObject(prRecordsPath(stateDir));
}

export function prHandoffArtifactPath(stateDir: string, savedPath: string, filename: string): string {
  if (savedPath && existsSync(savedPath)) return savedPath;
  return resolve(stateDir, "pr_handoff", filename);
}

function prBranchPathSlug(branch: string): string {
  return branch.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96) || "slice";
}

export function createPrRecordsService(deps: PrRecordsServiceDeps): {
  activeCyclePrBlockers: (stateDir: string, runId?: string) => string[];
  buildPrRecordsView: (stateDir: string, runId: string) => JsonObject;
  deriveReviewSubState: (prev: JsonObject, githubStatus: string, reviewDecision: string, comments: number) => JsonObject;
  normalizePrRecord: (record: JsonObject, context?: PrRecordContext) => JsonObject;
  normalizePrRecordsPayload: (payload: JsonObject, context?: PrRecordContext) => JsonObject;
  prBranchPathSlug: (branch: string) => string;
  prHandoffArtifactPath: (stateDir: string, savedPath: string, filename: string) => string;
  prRecordContext: (stateDir: string, runId?: string) => PrRecordContext;
  prRecordMatchesRun: (record: JsonObject, runId: string, activeBranches?: Set<string>) => boolean;
  prWorkspacePath: (stateDir: string, runId: string, branch: string) => string;
  readPrRecords: (stateDir: string) => JsonObject;
  updatePrRecord: (stateDir: string, branch: string, update: (record: JsonObject) => JsonObject) => JsonObject | null;
  writePrRecords: (stateDir: string, payload: JsonObject) => JsonObject;
} {
  function readPrRecords(stateDir: string): JsonObject {
    return readPrRecordsArtifact(stateDir);
  }

  function prRecordContext(stateDir: string, runId = ""): PrRecordContext {
    const baselineStatus = readJsonObject(resolve(stateDir, "pr_handoff", "baseline_status.json"));
    const shipStatus = readJsonObject(resolve(stateDir, "pr_handoff", "ship_status.json"));
    const plan = runId ? deps.latestPrSplitPlanSummary(stateDir, runId) : null;
    const planObject = asObject(plan);
    const cycleId = deps.cycleUuidForRun(stateDir, runId);
    return {
      runId,
      ...(cycleId ? { cycleId } : {}),
      baseSha: stringValue(baselineStatus.baseSha, stringValue(shipStatus.baseSha)),
      sourcePlan: Object.keys(planObject).length
        ? {
            runId,
            summaryPath: stringValue(planObject.summaryPath),
            outputPath: stringValue(planObject.outputPath),
            createdAt: stringValue(planObject.createdAt),
          }
        : undefined,
    };
  }

  function normalizePrRecord(record: JsonObject, context: PrRecordContext = {}): JsonObject {
    const local = asObject(record.local);
    const validation = asObject(record.validation);
    const batch = asObject(record.batch);
    const github = asObject(record.github);
    const review = asObject(record.review);
    const sourcePlan = asObject(record.sourcePlan);
    const prNumber = numberValue(record.prNumber, NaN);
    const comments = numberValue(record.comments, 0);
    const status = stringValue(record.status, "planned");
    const branch = stringValue(record.branch);
    const runId = stringValue(record.runId, context.runId ?? "");
    const cycleId = stringValue(record.cycleId, context.cycleId ?? "");
    const baseSha = stringValue(record.baseSha, context.baseSha ?? "");
    return {
      ...record,
      schemaVersion: stringValue(record.schemaVersion, PR_RECORD_SCHEMA_VERSION),
      runId,
      ...(cycleId ? { cycleId } : {}),
      ...(baseSha ? { baseSha } : {}),
      sourcePlan: {
        ...sourcePlan,
        ...asObject(context.sourcePlan),
      },
      local: {
        status: stringValue(local.status, "not_prepared"),
        branch: stringValue(local.branch, branch),
        worktreePath: stringValue(local.worktreePath),
        commitSha: stringValue(local.commitSha),
        preparedAt: stringValue(local.preparedAt),
        prepStartedAt: stringValue(local.prepStartedAt),
        error: stringValue(local.error),
        ...local,
      },
      validation: {
        status: stringValue(validation.status, "not_run"),
        checkedAt: stringValue(validation.checkedAt),
        summaryPath: stringValue(validation.summaryPath),
        reportPath: stringValue(validation.reportPath),
        newMatches: numberValue(validation.newMatches, 0),
        regressions: numberValue(validation.regressions, 0),
        issuesCheck: stringValue(validation.issuesCheck),
        repairNote: stringValue(validation.repairNote),
        ...validation,
      },
      batch: {
        state: stringValue(batch.state, "unbatched"),
        ordinal: numberValue(batch.ordinal, NaN),
        selectedAt: stringValue(batch.selectedAt),
        publishedAt: stringValue(batch.publishedAt),
        ...batch,
      },
      github: {
        status,
        prNumber: Number.isFinite(prNumber) ? prNumber : null,
        url: stringValue(record.url),
        ci: stringValue(record.ci),
        comments,
        author: stringValue(record.author),
        updatedAt: stringValue(record.updatedAt),
        ...github,
      },
      review: {
        subState: stringValue(review.subState, ""),
        lastSeenComments: numberValue(review.lastSeenComments, comments),
        subStateSetAt: stringValue(review.subStateSetAt),
        lastReviewerSeenAt: stringValue(review.lastReviewerSeenAt),
        lastOurActionAt: stringValue(review.lastOurActionAt),
        ...review,
      },
    };
  }

  function normalizePrRecordsPayload(payload: JsonObject, context: PrRecordContext = {}): JsonObject {
    return {
      ...payload,
      schemaVersion: stringValue(payload.schemaVersion, PR_RECORDS_SCHEMA_VERSION),
      batchLimit: intValue(payload.batchLimit, DEFAULT_PR_BATCH_LIMIT, 1),
      records: asArray(payload.records).map((record) => normalizePrRecord(asObject(record), context)),
    };
  }

  function writePrRecords(stateDir: string, payload: JsonObject): JsonObject {
    const normalized = normalizePrRecordsPayload(payload);
    mkdirSync(dirname(prRecordsPath(stateDir)), { recursive: true });
    writeFileSync(prRecordsPath(stateDir), JSON.stringify(normalized, null, 2), "utf8");
    return normalized;
  }

  function recoverInFlightPrepState(stateDir: string, payload: JsonObject): JsonObject {
    if (deps.localPrepOperationRunning()) return payload;
    const records = asArray(payload.records).map(asObject);
    let recovered = 0;
    const next = records.map((record) => {
      const local = asObject(record.local);
      if (stringValue(local.status) === "preparing") {
        recovered += 1;
        return { ...record, local: { ...local, status: "not_prepared", prepStartedAt: "", error: "Previous local preparation did not complete; retry." } };
      }
      return record;
    });
    if (recovered === 0) return payload;
    uiLog("ui", `recovered ${recovered} stale in-flight local preparation record(s)`);
    return writePrRecords(stateDir, { ...payload, records: next, syncedAt: stringValue(payload.syncedAt) || new Date().toISOString() });
  }

  function latestQaRepairArtifactDir(stateDir: string, runId: string): string {
    const candidates: string[] = [];
    if (runId) candidates.push(deps.latestChildDirectory(resolve(stateDir, "qa_repairs", runId)));
    for (const root of [resolve(stateDir, "qa-repair-campaign", "qa_repairs"), resolve(stateDir, "qa-repair-lane", "qa_repairs")]) {
      const campaign = deps.latestChildDirectory(root);
      if (campaign) candidates.push(deps.latestChildDirectory(campaign));
    }
    let best = "";
    let bestAt = "";
    for (const dir of candidates) {
      if (!dir) continue;
      const queue = readJsonObject(resolve(dir, "queue.json"));
      const createdAt = stringValue(queue.created_at, stringValue(queue.createdAt, ""));
      const effectiveAt = createdAt || dir.split(/[\\/]/).pop() || "";
      if (!best || effectiveAt > bestAt) {
        best = dir;
        bestAt = effectiveAt;
      }
    }
    return best;
  }

  function latestQaRepairFileStatuses(stateDir: string, runId: string): Map<string, string> {
    const dir = latestQaRepairArtifactDir(stateDir, runId);
    const result = new Map<string, string>();
    if (!dir) return result;
    for (const candidate of asArray(readJsonObject(resolve(dir, "queue.json")).candidate_files).map(asObject)) {
      const sourcePath = stringValue(candidate.sourcePath);
      if (sourcePath) result.set(sourcePath, stringValue(candidate.status, "needs_qa_repair"));
    }
    const dropped = asObject(readJsonObject(resolve(dir, "ship_status.json")).droppedFiles);
    for (const path of Object.keys(dropped)) {
      if (path && !result.has(path)) result.set(path, "qa_repair_blocked");
    }
    return result;
  }

  function enrichRecordsWithQaRepair(records: JsonObject[], stateDir: string, runId: string): JsonObject[] {
    const repairStatuses = latestQaRepairFileStatuses(stateDir, runId);
    if (repairStatuses.size === 0) return records;
    return records.map((record) => {
      const validation = asObject(record.validation);
      const localStatus = stringValue(asObject(record.local).status);
      if (stringValue(record.status, "planned") !== "planned") return record;
      if (["ready", "preparing", "blocked", "dirty"].includes(localStatus)) return record;
      const validationStatus = stringValue(validation.status, "not_run");
      if (validationStatus !== "not_run" && validationStatus !== "") return record;
      const files = asArray(record.files).map((path) => stringValue(path)).filter(Boolean);
      const pending = files.filter((file) => repairStatuses.has(file));
      if (pending.length === 0) return record;
      return {
        ...record,
        validation: { ...validation, status: "repairing", repairNote: `QA repair pending on ${pending.length}/${files.length} file(s)`, repairFileCount: pending.length },
      };
    });
  }

  function deriveReviewSubState(prev: JsonObject, githubStatus: string, reviewDecision: string, comments: number): JsonObject {
    const subStateSetAt = stringValue(prev.subStateSetAt);
    const prevSubState = stringValue(prev.subState);
    const lastSeenComments = numberValue(prev.lastSeenComments, comments);
    if (githubStatus === "merged" || githubStatus === "closed" || githubStatus === "draft") {
      return { ...prev, subState: "" };
    }
    if (reviewDecision === "CHANGES_REQUESTED") {
      return { ...prev, subState: "changes_requested", lastSeenComments: comments, subStateSetAt: subStateSetAt || new Date().toISOString() };
    }
    const commentsIncreased = comments > lastSeenComments;
    if (commentsIncreased) {
      return { ...prev, subState: "new_comments", lastSeenComments: comments, subStateSetAt: subStateSetAt || new Date().toISOString() };
    }
    if (prevSubState === "fixing") return prev;
    return { ...prev, subState: "awaiting", subStateSetAt: subStateSetAt || new Date().toISOString() };
  }

  function buildPrRecordsView(stateDir: string, runId: string): JsonObject {
    const context = prRecordContext(stateDir, runId);
    const recovered = recoverInFlightPrepState(stateDir, normalizePrRecordsPayload(readPrRecords(stateDir), context));
    const enriched = enrichRecordsWithQaRepair(asArray(recovered.records).map(asObject), stateDir, runId);
    return { ...recovered, records: enriched };
  }

  function updatePrRecord(stateDir: string, branch: string, update: (record: JsonObject) => JsonObject): JsonObject | null {
    const payload = normalizePrRecordsPayload(readPrRecords(stateDir));
    const records = asArray(payload.records).map(asObject);
    const index = records.findIndex((candidate) => stringValue(candidate.branch) === branch);
    if (index < 0) return null;
    records[index] = normalizePrRecord(update(records[index]));
    return writePrRecords(stateDir, { ...payload, records, syncedAt: new Date().toISOString() });
  }

  function prWorkspacePath(stateDir: string, runId: string, branch: string): string {
    return resolve(stateDir, "pr_workspaces", runId || "manual", prBranchPathSlug(branch));
  }

  function prRecordMatchesRun(record: JsonObject, runId: string, activeBranches: Set<string> = new Set()): boolean {
    if (!runId) return true;
    const recordRunId = stringValue(record.runId);
    if (recordRunId) return recordRunId === runId;
    const branch = stringValue(record.branch);
    if (branch && activeBranches.has(branch)) return true;
    const status = stringValue(record.status, "planned");
    return !Number.isFinite(numberValue(record.prNumber, NaN)) && ["planned", "planned_mock", "blocked"].includes(status);
  }

  function activeCyclePrBlockers(stateDir: string, runId = deps.latestRunId(stateDir)): string[] {
    const payload = normalizePrRecordsPayload(readPrRecords(stateDir));
    const activeBranches = new Set(asArray(deps.latestPrSplitPlanSummary(stateDir, runId)?.slices).map((slice) => stringValue(asObject(slice).branchName)).filter(Boolean));
    const activeStatuses = new Set(["planned", "planned_mock", "branch_pushed", "draft", "open", "changes_requested", "blocked"]);
    const localBlocking = new Set(["ready", "blocked", "dirty"]);
    const blockers: string[] = [];
    for (const record of asArray(payload.records).map(asObject)) {
      if (!prRecordMatchesRun(record, runId, activeBranches)) continue;
      const status = stringValue(record.status, "planned");
      const localStatus = stringValue(asObject(record.local).status, "not_prepared");
      if (status === "merged" || status === "closed") continue;
      if (!activeStatuses.has(status) && !localBlocking.has(localStatus)) continue;
      const label = stringValue(record.displayName, stringValue(record.sliceId, stringValue(record.branch, "PR slice")));
      blockers.push(`${label}: ${status}${localStatus !== "not_prepared" ? ` / local ${localStatus}` : ""}`);
    }
    return blockers;
  }

  return {
    activeCyclePrBlockers,
    buildPrRecordsView,
    deriveReviewSubState,
    normalizePrRecord,
    normalizePrRecordsPayload,
    prBranchPathSlug,
    prHandoffArtifactPath,
    prRecordContext,
    prRecordMatchesRun,
    prWorkspacePath,
    readPrRecords,
    updatePrRecord,
    writePrRecords,
  };
}
