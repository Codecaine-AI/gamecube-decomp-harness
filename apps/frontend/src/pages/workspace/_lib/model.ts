import { asArray, asObject, numberValue, shortId, text, type Dashboard, type FormState, type JsonObject, type UiConfig } from "@/lib/format";
import { processView } from "@/lib/processView";
import type { PrFlowRecord, SessionView } from "./types";

function isLocalBranchPrRecord(record: PrFlowRecord): boolean {
  return record.sourceDetail === "local_branch_discovery" || /^codex\/split-\d{2}-/.test(record.branch);
}

export function isDraftBatchCandidate(record: PrFlowRecord): boolean {
  return record.status === "planned" && Boolean(record.branch) && (record.localStatus === "ready" || (record.localStatus === "local_only" && isLocalBranchPrRecord(record)));
}

export function processName(value: unknown): string {
  const raw = text(value, "melee-live").trim() || "melee-live";
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "melee-live";
}

export function schedulingForWorkers(
  workers: number,
): Pick<
  FormState,
  | "maxWorkers"
> {
  const maxWorkers = Math.max(1, Math.trunc(workers));
  return {
    maxWorkers,
  };
}

export const workerCountOptions = [1, 2, 4, 8, 16, 20, 32, 64] as const;

export const epochSizeOptions = [4, 8, 16, 32, 64, 128, 256, 512, 1024] as const;

export const candidateWindowOptions = [32, 64, 128, 256, 512, 1024] as const;

export const candidateRerankOptions = [
  { label: "Priority", value: "priority" },
  { label: "OPSEC hot lane", value: "opseq_hot_lane" },
] as const;

export const resolverConcurrencyOptions = [1, 2, 4, 8] as const;

export const candidateWindowTooltip =
  "How many top-ranked board candidates the scheduler rechecks when building an epoch. Keep it at or above the epoch size; larger windows let the OPSEC/opseq rerank pull likely matches into smaller batches after each rebuild.";

export const candidateRerankTooltip = "Priority uses the normal board score. OPSEC hot lane adds a matched-opseq analog bonus so likely exact matches can rise from deeper in the candidate window.";

export const resolverConcurrencyTooltip =
  "How many integration resolver agents may run at once. Same-file conflicts stay serialized; different-file conflicts can resolve in parallel.";

export function statusClass(value: unknown): string {
  const status = text(value);
  if (status === "passed" || status === "pr_ready" || status === "passing" || status === "merged" || status === "ready") return "text-up";
  if (status === "failed" || status === "blocked" || status === "qa_repair_blocked" || status === "failing" || status === "changes_requested" || status === "dirty") return "text-down";
  if (status === "local_only" || status === "remote_only" || status === "published" || status === "open" || status === "draft" || status === "pending" || status === "planned_mock" || status === "warning" || status === "not_prepared" || status === "preparing" || status === "repairing" || status === "branch_pushed") return "text-warn";
  return "text-dim";
}

export function prettyStatus(value: unknown, fallback = "-"): string {
  const raw = text(value, fallback);
  return raw.replace(/_/g, " ");
}

export function compactFilePath(path: string): string {
  return path.replace(/^src\/melee\//, "").replace(/^src\//, "");
}

export function fileCountLabel(count: number): string {
  return count === 1 ? "1 file" : `${count.toLocaleString()} files`;
}

export function hasKeys(value: JsonObject): boolean {
  return Object.keys(value).length > 0;
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^(1|true|yes)$/i.test(value)) return true;
    if (/^(0|false|no)$/i.test(value)) return false;
  }
  return fallback;
}

function artifactStatus(value: JsonObject, keys: string[]): boolean {
  return keys.some((key) => Boolean(value[key]));
}

function operationLooksPrMode(name: string): boolean {
  return /pr|qa|handoff|reconcile|split|draft|open/i.test(name);
}

function sessionIdForRun(runId: string): string {
  return runId ? `run:${runId}` : "legacy";
}

function prRecordMatchesSession(record: JsonObject, runId: string, activeBranches: Set<string>): boolean {
  if (!runId) return true;
  const recordRunId = text(record.runId);
  if (recordRunId) return recordRunId === runId;
  const sessionId = text(record.sessionId);
  if (sessionId && sessionId !== "legacy") return sessionId === sessionIdForRun(runId);
  const branch = text(record.branch);
  if (branch && activeBranches.has(branch)) return true;
  const status = text(record.status, "planned");
  return !Number.isFinite(numberValue(record.prNumber, NaN)) && ["planned", "planned_mock", "blocked"].includes(status);
}

function derivedPrRecords(dashboard: Dashboard | null, hasMeleePrFixture: boolean): PrFlowRecord[] {
  const prs = asObject(dashboard?.prs);
  const records = asArray(prs.records).map(asObject);
  const runId = text(asObject(asObject(dashboard?.status).run).id);
  const splitPlan = asObject(asObject(dashboard?.handoff).splitPlan);
  const activeBranches = new Set(asArray(splitPlan.slices).map((slice) => text(asObject(slice).branchName)).filter(Boolean));
  if (records.length > 0) {
    return records.filter((record) => prRecordMatchesSession(record, runId, activeBranches)).map((record): PrFlowRecord => {
      const local = asObject(record.local);
      const validation = asObject(record.validation);
      const sourcePlan = asObject(record.sourcePlan);
      return {
        branch: text(record.branch),
        ci: text(record.ci),
        comments: numberValue(record.comments, 0),
        displayName: text(record.displayName, text(record.sliceId, text(record.branch, "-"))),
        files: asArray(record.files).map((file) => text(file)).filter(Boolean),
        localBranch: text(local.branch),
        localStatus: text(local.status, "not_prepared"),
        localWorktreePath: text(local.worktreePath),
        prepStartedAt: text(local.prepStartedAt),
        prNumber: numberValue(record.prNumber, NaN),
        repairNote: text(validation.repairNote),
        reviewSubState: text(asObject(record.review).subState),
        source: "pr_records",
        sourceDetail: text(sourcePlan.source),
        status: text(record.status, "planned"),
        title: text(record.title),
        url: text(record.url),
        validationStatus: text(validation.status, "not_run"),
      };
    });
  }

  const slices = asArray(splitPlan.slices).map(asObject).filter((slice) => text(slice.lane) === "match");
  if (slices.length > 0) {
    return slices.map((slice): PrFlowRecord => ({
      branch: text(slice.branchName),
      ci: "",
      comments: 0,
      displayName: text(slice.displayName, text(slice.id, "planned slice")),
      files: asArray(slice.pathspecs).map((file) => text(file)).filter(Boolean),
      localBranch: "",
      localStatus: "not_prepared",
      localWorktreePath: "",
      prepStartedAt: "",
      prNumber: NaN,
      repairNote: "",
      reviewSubState: "",
      source: "split_plan",
      sourceDetail: "split_plan",
      status: "planned",
      title: text(slice.title),
      url: "",
      validationStatus: "not_run",
    }));
  }

  if (!hasMeleePrFixture) return [];
  return [
    {
      branch: "planned/mock/melee-match-slice-a",
      ci: "",
      comments: 0,
      displayName: "Planned match slice A",
      files: ["18 routed warning-only candidate files"],
      localBranch: "",
      localStatus: "not_prepared",
      localWorktreePath: "",
      prepStartedAt: "",
      prNumber: NaN,
      repairNote: "",
      reviewSubState: "",
      source: "current_objective_fixture",
      sourceDetail: "current_objective_fixture",
      status: "planned_mock",
      title: "Mock PR slice from routed QA handoff state",
      url: "",
      validationStatus: "not_run",
    },
    {
      branch: "planned/mock/melee-match-slice-b",
      ci: "",
      comments: 0,
      displayName: "Planned match slice B",
      files: ["ship set isolation required before draft opening"],
      localBranch: "",
      localStatus: "blocked",
      localWorktreePath: "",
      prepStartedAt: "",
      prNumber: NaN,
      repairNote: "",
      reviewSubState: "",
      source: "current_objective_fixture",
      sourceDetail: "current_objective_fixture",
      status: "blocked",
      title: "Blocked until PR promotion gate is clean",
      url: "",
      validationStatus: "failed",
    },
  ];
}

export function deriveSessionView(dashboard: Dashboard | null, config: UiConfig | null, form: FormState): SessionView {
  const project =
    dashboard?.project ??
    config?.availableProjects.find((item) => item.id === form.projectId) ??
    config?.selectedProject ??
    null;
  const selectedProcessName = processName(form.processName || project?.processName);
  const process = processView(dashboard, selectedProcessName);
  const canonicalSession = asObject(dashboard?.projectSession);
  const canonicalGates = asObject(canonicalSession.gates);
  const canonicalPhases = asObject(canonicalSession.phases);
  const preparingPhase = asObject(canonicalPhases.preparing);
  const prepareSync = asObject(preparingPhase.sync);
  const prepareIntake = asObject(preparingPhase.intake);
  const prepareIntakeItems = asArray(prepareIntake.items).map(asObject);
  const prepareIntakeItemCounts = asObject(prepareIntake.itemCounts);
  const prepareKnowledge = asObject(preparingPhase.knowledge);
  const prepareBaseline = asObject(preparingPhase.baseline);
  const prepareMergedPrs = asArray(prepareSync.mergedPrs).map((value) => numberValue(value, NaN)).filter(Number.isFinite);
  const syncDone = text(prepareSync.status) === "complete" || Boolean(prepareSync.completedAt);
  const intakeDone = text(prepareIntake.status) === "complete" || Boolean(prepareIntake.completedAt);
  const knowledgeDone = text(prepareKnowledge.status) === "complete" || Boolean(prepareKnowledge.completedAt);
  const baselineDone = text(prepareBaseline.status) === "complete" || Boolean(prepareBaseline.completedAt);
  const prepareHeadSha = text(prepareSync.afterRef);
  const prepareBeforeSha = text(prepareSync.beforeRef);
  const prepareUpstreamChanged = prepareBeforeSha && prepareHeadSha ? prepareBeforeSha !== prepareHeadSha : null;
  const prepareUpstreamWorktreePath = text(prepareSync.upstreamWorktreePath, text(prepareSync.mainWorktreePath));
  const prepareSessionCurrentWorktreePath = text(prepareSync.sessionCurrentWorktreePath, text(prepareSync.sessionWorktreePath));
  const preparePrIndexDebt = asObject(
    intakeDone
      ? prepareIntake.prIndexDebtAfter
      : prepareIntake.prIndexDebtBefore || prepareSync.prIndexDebt,
  );
  const prIndexDebtKnown = text(preparePrIndexDebt.status) === "available";
  const pendingMergedPrIndexCount = prIndexDebtKnown
    ? numberValue(preparePrIndexDebt.pendingMergedAgentPrs, 0)
    : syncDone && !intakeDone
      ? prepareMergedPrs.length
      : 0;
  const pendingPrIndexCount = prIndexDebtKnown
    ? numberValue(preparePrIndexDebt.pendingAgentPrs, pendingMergedPrIndexCount)
    : pendingMergedPrIndexCount;
  const hasIntakeItemCounts = prepareIntakeItems.length > 0 || hasKeys(prepareIntakeItemCounts);
  const pendingIntakePrCount = hasIntakeItemCounts
    ? numberValue(prepareIntakeItemCounts.pending, prepareIntakeItems.filter((item) => text(item.status) === "pending").length)
    : pendingPrIndexCount;
  const runningIntakeItemCount = numberValue(prepareIntakeItemCounts.running, prepareIntakeItems.filter((item) => text(item.status) === "running").length);
  const completedIntakeItemCount = numberValue(prepareIntakeItemCounts.complete, prepareIntakeItems.filter((item) => text(item.status) === "complete").length);
  const failedIntakeItemCount = numberValue(prepareIntakeItemCounts.failed, prepareIntakeItems.filter((item) => text(item.status) === "failed").length);
  const retryableIntakeItemCount = numberValue(prepareIntakeItemCounts.retryable, prepareIntakeItems.filter((item) => text(item.status) === "failed" && item.retryable === true).length);
  const totalIntakeItemCount = numberValue(prepareIntakeItemCounts.total, prepareIntakeItems.length);
  const canonicalPhase = text(canonicalSession.phase);
  const canonicalSubphase = text(canonicalSession.activeSubphase);
  const canonicalStatus = text(canonicalSession.status);
  const canonicalSessionId = text(canonicalSession.sessionUuid, text(canonicalSession.id));
  const canonicalBlockers = asArray(canonicalSession.blockers)
    .map(asObject)
    .map((blocker) => text(blocker.message, text(blocker.code)))
    .filter(Boolean);
  const hasCanonicalSession = Boolean(canonicalSessionId && canonicalPhase);
  const status = asObject(dashboard?.status);
  const run = asObject(status.run);
  const runStatus = text(run.status);
  const runId = text(run.id);
  const completedLegacyRun = Boolean(runId) && runStatus === "complete" && !hasCanonicalSession;
  const activeClaims = numberValue(status.activeClaims, 0);
  const campaign = asObject(dashboard?.campaign);
  const head = asObject(campaign.head);
  const handoff = asObject(dashboard?.handoff);
  const checkpoint = asObject(handoff.checkpoint || dashboard?.checkpoint);
  const qa = asObject(handoff.qa);
  const qaRepair = asObject(handoff.qaRepair);
  const splitPlan = asObject(handoff.splitPlan);
  const ship = asObject(handoff.ship);
  const prs = asObject(dashboard?.prs);
  const rawPrRecords = asArray(prs.records).map(asObject);
  const operation = asObject(asObject(dashboard?.process).operation);
  const operationStatus = text(operation.status);
  const operationName = text(operation.name);
  const operationActive = operationStatus === "running" || asObject(dashboard?.process).freshRunActive === true;
  const syncing = asObject(dashboard?.process).projectSyncActive === true;
  const syncLocked = runStatus === "active";
  const handoffCanDerivePrMode = !hasCanonicalSession || canonicalPhase === "pr";
  const hasHandoffEvidence =
    !completedLegacyRun &&
    handoffCanDerivePrMode &&
    (artifactStatus(checkpoint, ["id", "checkpointPath", "prCandidatesPath"]) ||
      artifactStatus(qa, ["status", "summaryPath", "prReportPath"]) ||
      artifactStatus(qaRepair, ["status", "recommendation", "schema_version", "summaryPath", "shipStatusPath"]) ||
      artifactStatus(splitPlan, ["status", "summaryPath", "outputPath", "matchSlices"]) ||
      artifactStatus(ship, ["status", "patchPath"]) ||
      rawPrRecords.length > 0 ||
      operationLooksPrMode(operationName));
  const hasMeleePrFixture = project?.id === "melee" && !process.running && runStatus !== "active" && !completedLegacyRun && rawPrRecords.length === 0;
  const modeEvidence: string[] = [];
  if (hasCanonicalSession) modeEvidence.push(`canonical phase ${prettyStatus(canonicalPhase)}${canonicalSubphase ? ` / ${prettyStatus(canonicalSubphase)}` : ""}`);
  if (canonicalBlockers.length > 0) modeEvidence.push(`${canonicalBlockers.length.toLocaleString()} canonical blocker(s)`);
  if (process.running) modeEvidence.push(process.draining ? "process draining" : "worker process running");
  if (activeClaims > 0) modeEvidence.push(`${activeClaims.toLocaleString()} active claim(s)`);
  if (runStatus === "active") modeEvidence.push("run status active");
  if (hasHandoffEvidence) modeEvidence.push("handoff, QA, split, ship, or PR evidence exists");
  if (hasMeleePrFixture && !hasHandoffEvidence) modeEvidence.push("current Melee PR-flow planned/mock fixture");

  let mode: SessionView["mode"] = "none";
  if (canonicalPhase === "running") mode = "run";
  else if (canonicalPhase === "pr") mode = "pr";
  else if (canonicalPhase === "preparing" || canonicalPhase === "complete") mode = "none";
  else if (process.running || activeClaims > 0) mode = "run";
  else if (hasHandoffEvidence || hasMeleePrFixture) mode = "pr";
  else if (runStatus === "active" || (runId && !completedLegacyRun)) mode = "run";

  const hasActivePrSession = !completedLegacyRun && (canonicalPhase === "pr" || mode === "pr" || hasHandoffEvidence || hasMeleePrFixture);
  const prRecords = hasActivePrSession ? derivedPrRecords(dashboard, hasMeleePrFixture) : [];
  const prBlockedReasons: string[] = [];
  const shipStatus = text(ship.status);
  const qaStatus = text(asObject(qa.prPromotion).status, text(qa.status));
  const qaRepairStatus = text(qaRepair.recommendation, text(qaRepair.status));
  if (hasActivePrSession) {
    if (shipStatus && shipStatus !== "pr_ready") prBlockedReasons.push(`ship set ${prettyStatus(shipStatus)}`);
    if (qaStatus === "blocked" || qaStatus === "failed") prBlockedReasons.push(`QA ${prettyStatus(qaStatus)}`);
    if (qaRepairStatus && !["passed", "clean", "pr_ready"].includes(qaRepairStatus)) prBlockedReasons.push(`QA repair ${prettyStatus(qaRepairStatus)}`);
    if (canonicalPhase === "pr") prBlockedReasons.push(...canonicalBlockers);
    if (hasMeleePrFixture) prBlockedReasons.push("current PR repair campaign is routed-blocked; isolate ship set before draft opening");
  }

  const activePrStatuses = new Set(["planned", "planned_mock", "branch_pushed", "draft", "open", "changes_requested", "blocked"]);
  const unresolvedPrRecords = prRecords.filter((record) => activePrStatuses.has(record.status));
  const localPrRecords = prRecords.filter((record) => !["merged", "closed"].includes(record.status) && ["ready", "blocked", "dirty"].includes(record.localStatus));
  const newSessionReasons: string[] = [];
  if (hasCanonicalSession && canonicalStatus !== "complete") newSessionReasons.push(`canonical session is ${prettyStatus(canonicalPhase)}${canonicalSubphase ? ` / ${prettyStatus(canonicalSubphase)}` : ""}`);
  if (canonicalBlockers.length > 0) newSessionReasons.push(...canonicalBlockers);
  if (process.running) newSessionReasons.push("worker process is running or detached");
  if (activeClaims > 0) newSessionReasons.push(`${activeClaims.toLocaleString()} active claim(s) remain`);
  if (runStatus === "active") newSessionReasons.push("run status is active");
  if (hasActivePrSession && unresolvedPrRecords.length > 0) newSessionReasons.push(`${unresolvedPrRecords.length.toLocaleString()} PR slice(s) unresolved`);
  if (hasActivePrSession && localPrRecords.length > 0) newSessionReasons.push(`${localPrRecords.length.toLocaleString()} local PR workspace(s) unresolved`);
  if (hasActivePrSession && prBlockedReasons.length > 0) newSessionReasons.push(...prBlockedReasons);
  if (head.dirty === true) newSessionReasons.push("campaign head is dirty");

  const handoffIdle = Boolean(runId) && !completedLegacyRun && !process.running && activeClaims === 0 && !syncing && !operationActive;
  const handoffReason = !runId
    ? "No run yet."
    : completedLegacyRun
      ? "This legacy run is complete."
    : process.draining
      ? "Workers are draining."
    : process.running
        ? "Drain workers first."
        : syncing
          ? "Sync is in progress."
          : operationActive
            ? `${text(operation.label, "An operation")} is in progress.`
            : activeClaims > 0
              ? `Waiting on ${activeClaims.toLocaleString()} draining claim(s).`
              : "";

  const baseline = asObject(handoff.baseline);
  const baselineSha = text(canonicalSession.baseSha, text(baseline.baseSha, text(campaign.baseSha)));
  const branch = canonicalPhase === "preparing"
    ? text(prepareSync.sessionBranch, text(canonicalSession.baseRef, text(head.branch, text(campaign.branch, "-"))))
    : text(head.branch, text(campaign.branch, "-"));
  const fallbackSessionId = text(asObject(campaign.savePoint).commit_sha, `${project?.id ?? "project"}:no-run`);
  const activeRunId = completedLegacyRun && mode === "none" ? "" : runId;
  const activeSessionId = canonicalSessionId || activeRunId || (mode === "none" ? "" : fallbackSessionId);
  const activeSessionLabel = canonicalSessionId ? `Session ${shortId(canonicalSessionId)}` : activeRunId ? `Run ${shortId(activeRunId)}` : "No active session";
  const recommendedSub = canonicalPhase === "preparing" ? "prepare" : canonicalPhase === "pr" ? "pr" : canonicalPhase === "running" ? "run" : mode === "pr" ? "pr" : mode === "run" ? "run" : "done";
  const sessionStageStates: SessionView["sessionStageStates"] = {
    prepare: text(asObject(canonicalPhases.preparing).completed_at) ? "done" : "todo",
    run: text(asObject(canonicalPhases.running).completed_at) ? "done" : "todo",
    pr: text(asObject(canonicalPhases.pr).completed_at) ? "done" : "todo",
    done: text(canonicalSession.completedAt) || canonicalStatus === "complete" || canonicalPhase === "complete" || (completedLegacyRun && !hasCanonicalSession) ? "done" : "todo",
  };
  const canStartWorkers = hasCanonicalSession
    ? booleanValue(canonicalGates.can_start_workers)
    : mode === "run" && !process.running && !syncing && !operationActive;
  const canOpenPrs = hasCanonicalSession
    ? booleanValue(canonicalGates.can_publish_prs) || booleanValue(canonicalGates.can_prepare_prs)
    : mode !== "none" && !process.running && activeClaims === 0 && !syncing && !operationActive;
  const canCompleteRun =
    !hasCanonicalSession &&
    Boolean(runId) &&
    (runStatus === "active" || runStatus === "paused") &&
    !process.running &&
    activeClaims === 0 &&
    !syncing &&
    !operationActive;
  const modeLabel =
    canonicalPhase === "preparing"
      ? "Preparing"
      : canonicalPhase === "complete"
        ? "Complete"
        : mode === "pr"
          ? "PR Mode"
          : mode === "run"
            ? "Run Mode"
            : "No Active Session";

  return {
    activeSessionId,
    activeSessionLabel,
    activeClaims,
    baselineLabel: baselineSha ? baselineSha.slice(0, 10) : "not built",
    branchLabel: `${branch}${head.dirty === true ? " dirty" : ""}`,
    canCompleteRun,
    canOpenPrs,
    canStartWorkers,
    canonicalBlockers,
    canonicalGates,
    canonicalPhase,
    canonicalSubphase,
    handoffIdle,
    handoffReason,
    hasMeleePrFixture,
    mode,
    modeEvidence,
    modeLabel,
    newSessionBlocked: newSessionReasons.length > 0,
    newSessionReasons,
    operationActive,
    operationLabel: text(operation.label, "An operation"),
    prBlockedReasons,
    prRecords,
    prepareState: {
      baseline: prepareBaseline,
      baselineDone,
      headSha: prepareHeadSha,
      headShortSha: prepareHeadSha ? prepareHeadSha.slice(0, 10) : "",
      intake: prepareIntake,
      intakeDone,
      knowledge: prepareKnowledge,
      knowledgeDone,
      mergedPrs: prepareMergedPrs,
      prIndexDebt: preparePrIndexDebt,
      prIndexDebtKnown,
      pendingMergedPrIndexCount,
      pendingIntakePrCount,
      pendingPrIndexCount,
      runningIntakeItemCount,
      completedIntakeItemCount,
      failedIntakeItemCount,
      retryableIntakeItemCount,
      totalIntakeItemCount,
      readyToStartRun: hasCanonicalSession && canonicalPhase === "preparing" && baselineDone && !process.running && activeClaims === 0 && !syncing && !operationActive,
      sessionCurrentWorktreePath: prepareSessionCurrentWorktreePath,
      sync: prepareSync,
      syncDone,
      upstreamChanged: prepareUpstreamChanged,
      upstreamWorktreePath: prepareUpstreamWorktreePath,
    },
    prSummary: {
      checkpoint,
      qa,
      qaRepair,
      ship,
      splitPlan,
      upstreamOpen: numberValue(prs.upstreamOpen, NaN),
      warning: text(prs.warning),
    },
    process,
    project,
    recommendedSub,
    runStatus,
    sessionStageStates,
    syncLocked,
    syncing,
  };
}
