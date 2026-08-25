import { useEffect, useRef, useState } from "react";
import { ChevronLeft, RefreshCw } from "@/icons";

import { Button, InfoRows, PanelSection, PanelTitle } from "@/components/primitives";
import { fetchWorkerStateTrace } from "@/lib/api";
import {
  asArray,
  asObject,
  ago,
  delta,
  num,
  pct,
  shortId,
  text,
  type Dashboard,
  type FormState,
  type JsonObject,
  type RunDetails,
} from "@/lib/format";
import { activeRuntime } from "@/lib/workerActivity";
import type { CycleFocus } from "@/routing";
import type { WorkspaceNav } from "@/pages/workspace/_lib/types";
import {
  mergeActiveWorkerState,
  workerStateKey,
} from "@/components/details-rail/_components/worker-reports";
import {
  MetaItem,
  ToolTraceSection,
  TraceSection,
} from "@/components/details-rail/_components/worker-reports/shared";
import {
  attemptNumber,
  attemptScoreText,
  compactValue,
  modelAttemptBuildLabel,
  reasonLines,
  reportBorderClass,
  reportFinishLabel,
  reportOutcomeDescription,
  reportResult,
  reportScoreDelta,
  reportStopReason,
  runnerAttemptBuildLabel,
  runnerAttemptScoreText,
  statusText,
  stopReasonLabel,
  workerStateStatusLabel,
} from "@/components/details-rail/_lib/worker-reports";

export interface AttemptDetailPageProps {
  cycleFocus: CycleFocus;
  dashboard: Dashboard | null;
  form: FormState;
  loadRunDetails: () => void;
  loadingRunDetails: boolean;
  nav: WorkspaceNav;
  runDetails: RunDetails | null;
  workerStateId: string;
}

function findWorkerState(records: JsonObject[], workerStateId: string): JsonObject | null {
  return records.find((record) => workerStateKey(record) === workerStateId) ?? null;
}

function AttemptPlaceholder({
  loadRunDetails,
  loadingRunDetails,
  workerStateId,
}: Pick<AttemptDetailPageProps, "loadRunDetails" | "loadingRunDetails" | "workerStateId">) {
  return (
    <PanelSection>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <PanelTitle className="mb-0">Attempt {shortId(workerStateId)} — not in the loaded window yet</PanelTitle>
        <Button
          disabled={loadingRunDetails}
          icon={<RefreshCw size={13} />}
          onClick={loadRunDetails}
          type="button"
        >
          {loadingRunDetails ? "Loading" : "Load all worker states"}
        </Button>
      </div>
      <InfoRows
        rows={[
          ["Outcome", "-"],
          ["Result", "-"],
          ["Worker", "-"],
          ["Epoch", "-"],
        ]}
      />
    </PanelSection>
  );
}

function RunnerAttempts({ attempts }: { attempts: JsonObject[] }) {
  if (attempts.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-dim"
        title="Deterministic build and score evidence recorded by the runner for each validation attempt."
      >
        Runner Validation
      </div>
      <div className="grid gap-1.5">
        {attempts.map((attempt, index) => {
          const build = runnerAttemptBuildLabel(attempt);
          const attemptDelta = Number(attempt.delta ?? 0);
          const attemptIndex = attemptNumber(attempt.attemptIndex, NaN);
          return (
            <div
              className="grid grid-cols-[88px_minmax(0,1fr)_minmax(140px,190px)] gap-3 border border-line bg-inset px-2.5 py-2 text-xs max-[640px]:grid-cols-1"
              key={`${text(attempt.artifactPath)}-${index}`}
            >
              <span className={build.className}>{build.label}</span>
              <span className="min-w-0 [overflow-wrap:anywhere] text-soft" title={text(attempt.artifactPath)}>
                {Number.isFinite(attemptIndex) ? `attempt ${attemptIndex} · ` : ""}
                {text(attempt.status, "-").replace(/_/g, " ")}
              </span>
              <span className={`text-right max-[640px]:text-left ${attemptDelta > 0 ? "text-up" : "text-dim"}`}>
                {runnerAttemptScoreText(attempt)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModelAttempts({ attempts }: { attempts: JsonObject[] }) {
  if (attempts.length === 0) return null;
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div
        className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-dim"
        title="Model-authored checkpoint notes. Score numbers here are claims, not runner evidence."
      >
        Model Attempts
      </div>
      <div className="grid gap-1.5">
        {attempts.map((attempt, index) => {
          const build = modelAttemptBuildLabel(attempt);
          const attemptDelta = Number(attempt.delta ?? 0);
          return (
            <div
              className="grid grid-cols-[88px_minmax(0,1fr)_minmax(140px,190px)] gap-3 border border-line bg-inset px-2.5 py-2 text-xs max-[640px]:grid-cols-1"
              key={`${text(attempt.artifactPath)}-${index}`}
            >
              <span className={build.className} title={build.title}>{build.label}</span>
              <span className="min-w-0 [overflow-wrap:anywhere] text-soft">
                {text(attempt.description, text(attempt.artifactPath, "attempt"))}
              </span>
              <span className={`text-right max-[640px]:text-left ${attemptDelta > 0 ? "text-up" : "text-dim"}`}>
                {attemptScoreText(attempt)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AttemptDetailPage(props: AttemptDetailPageProps) {
  const [trace, setTrace] = useState<JsonObject>({});
  const [traceError, setTraceError] = useState("");
  const [loadingTrace, setLoadingTrace] = useState(false);
  const loadAttemptedFor = useRef("");
  const activeClaim = (props.dashboard?.activeFiles ?? [])
    .map(asObject)
    .find((claim) => text(claim.workerStateId) === props.workerStateId) ?? null;
  const recentReport = findWorkerState((props.dashboard?.workerStates ?? []).map(asObject), props.workerStateId);
  const fullReport = findWorkerState(asArray(props.runDetails?.workerStates).map(asObject), props.workerStateId);
  const report = fullReport ?? recentReport;
  const record = activeClaim ? mergeActiveWorkerState(activeClaim, report) : report;
  const runId = text(asObject(props.dashboard?.status?.run).id, text(props.runDetails?.runId));

  useEffect(() => {
    if (record || props.loadingRunDetails || loadAttemptedFor.current === props.workerStateId) return;
    loadAttemptedFor.current = props.workerStateId;
    props.loadRunDetails();
  }, [props.workerStateId, props.loadingRunDetails, props.loadRunDetails, record]);

  useEffect(() => {
    setTrace({});
    setTraceError("");
    if (!activeClaim || !runId || !props.workerStateId) {
      setLoadingTrace(false);
      return;
    }
    let cancelled = false;
    setLoadingTrace(true);
    fetchWorkerStateTrace(props.form, runId, props.workerStateId)
      .then((nextTrace) => {
        if (!cancelled) setTrace(nextTrace);
      })
      .catch((error) => {
        if (!cancelled) setTraceError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingTrace(false);
      });
    return () => {
      cancelled = true;
    };
  }, [Boolean(activeClaim), props.form, props.workerStateId, runId]);

  if (!record) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<ChevronLeft size={13} />} onClick={() => props.nav.goToCycle(props.cycleFocus, "run")} type="button">
            Back to Run
          </Button>
          <h3 className="m-0 text-lg font-bold text-fg">Attempt {shortId(props.workerStateId)}</h3>
        </div>
        <AttemptPlaceholder {...props} />
      </div>
    );
  }

  const target = asObject(record.target);
  const active = Boolean(activeClaim);
  const loadedReport = Boolean(report);
  const activity = Object.keys(trace).length > 0 ? trace : asObject(record.activity);
  const attempts = asArray(record.attempts).map(asObject);
  const runnerAttempts = asArray(record.runnerAttempts).map(asObject);
  const writeSet = asArray(record.writeSet).map((item) => text(item)).filter(Boolean);
  const reasons = reasonLines(record);
  const reportDelta = reportScoreDelta(record);
  const title = text(target.symbol) || text(record.symbol) || text(target.sourcePath) || text(record.sourcePath) || `Attempt ${shortId(props.workerStateId)}`;
  const sourcePath = text(target.sourcePath) || text(record.sourcePath) || text(target.unit);
  const outcomeLabel = loadedReport ? reportFinishLabel(record) : "active";
  const outcomeTitle = loadedReport ? reportOutcomeDescription(record) : "Active claim without a runner checkpoint report yet.";
  const result = loadedReport ? reportResult(record) : null;
  const stopReason = loadedReport && result ? reportStopReason(record, result) : null;
  const neededFact = compactValue(record.neededFact);
  const nextRecommendation = text(record.nextRecommendation);
  const runtime = activeRuntime(record.claimedAt || record.heartbeatAt, record.ttl);
  const validationStatus = text(record.validationStatus, text(asObject(record.runnerValidation).status, "-"));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={<ChevronLeft size={13} />} onClick={() => props.nav.goToCycle(props.cycleFocus, "run")} type="button">
          Back to Run
        </Button>
        <div className="min-w-0">
          <h3 className="m-0 overflow-hidden text-ellipsis text-lg font-bold text-fg" title={title}>{title}</h3>
          {sourcePath ? <div className="mt-0.5 break-all text-xs text-path" title={sourcePath}>{sourcePath}</div> : null}
        </div>
      </div>

      <article className={`border border-l-[3px] border-line ${loadedReport ? reportBorderClass(record) : "border-l-up"} bg-card p-4`}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <PanelTitle className="mb-0">Attempt Detail</PanelTitle>
            <div className="mt-1 text-[11px] text-dim">
              {active ? `active claim · claimed ${ago(record.claimedAt)}` : `${workerStateStatusLabel(record.lifecycleStatus)} · ${ago(record.createdAt)}`}
            </div>
          </div>
          <span className="status-tag" title={outcomeTitle}><span className="lamp" />{outcomeLabel}</span>
        </div>

        <div className="grid grid-cols-3 gap-x-5 gap-y-2 border border-line bg-inset p-3 text-xs @[920px]:grid-cols-4 max-[640px]:grid-cols-2 max-[420px]:grid-cols-1">
          <MetaItem label="outcome" value={outcomeLabel} />
          <MetaItem label="result" value={result ? result.replace(/_/g, " ") : "-"} />
          <MetaItem label="stop" value={stopReason ? stopReasonLabel(stopReason) : "-"} />
          <MetaItem label="delta" value={loadedReport ? delta(reportDelta) : "-"} valueClassName={reportDelta > 0 ? "text-up" : ""} />
          <MetaItem label="worker" value={shortId(record.workerId)} />
          <MetaItem label="claim" value={shortId(record.claimId)} />
          <MetaItem label="state" value={shortId(record.workerStateId)} />
          <MetaItem label="epoch" value={num(record.epochOrdinal)} />
          <MetaItem label="epoch target" value={text(record.epochTargetStatus, "-")} />
          <MetaItem label="gate" value={loadedReport ? statusText(record) : "-"} />
          <MetaItem label="validation" value={validationStatus.replace(/_/g, " ")} />
          <MetaItem label="attempts" value={num(attempts.length)} />
          <MetaItem label="fuzzy" value={pct(record.fuzzy ?? target.fuzzy)} />
          <MetaItem label="priority" value={num(record.priority)} />
          {active ? <MetaItem label="heartbeat" value={ago(record.heartbeatAt)} /> : null}
          {active ? <MetaItem label="elapsed" value={`${runtime.primary} · ${runtime.secondary}`} /> : null}
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-soft">{text(record.summary, text(record.reason, "No summary recorded."))}</p>
        {neededFact ? <div className="mt-3 border border-warn/40 bg-warn/5 p-3 text-xs leading-5 text-warn">needed fact: {neededFact}</div> : null}
        {nextRecommendation ? <div className="mt-3 border border-line bg-inset p-3 text-xs leading-5 text-soft">next: {nextRecommendation}</div> : null}

        <RunnerAttempts attempts={runnerAttempts} />
        <ModelAttempts attempts={attempts} />

        {loadingTrace ? <div className="mt-4 border-t border-line pt-3 text-[11px] text-faint">Loading worker trace...</div> : null}
        {traceError ? <div className="mt-4 border-t border-line pt-3 text-[11px] text-warn">Trace unavailable: {traceError}</div> : null}
        <TraceSection activity={activity} emptyText={active ? "Waiting for runner activity for this active claim." : "No runner trace was recorded for this attempt."} />
        <ToolTraceSection activity={activity} emptyText={active ? "No Pi/tool JSONL lines for this active claim yet." : "No Pi/tool JSONL lines were recorded for this attempt."} />

        {writeSet.length > 0 ? (
          <div className="mt-4 border-t border-line pt-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-dim">Write Set</div>
            <div className="flex flex-wrap gap-1.5">
              {writeSet.map((path) => (
                <span className="max-w-full break-all border border-line bg-inset px-2 py-1 text-[11px] text-dim" key={path} title={path}>{path}</span>
              ))}
            </div>
          </div>
        ) : null}
        {text(record.worktreePath) ? <div className="mt-3 border border-line bg-inset p-2.5 text-xs leading-5 text-path [overflow-wrap:anywhere]">worktree: {text(record.worktreePath)}</div> : null}
        {text(record.reason) ? <div className="mt-3 border border-line bg-inset p-2.5 text-xs leading-5 text-soft">reason: {text(record.reason)}</div> : null}
        {reasons.length > 0 ? <div className="mt-4 border-t border-line pt-3 text-xs leading-5 text-warn">{reasons.join(" / ")}</div> : null}
      </article>
    </div>
  );
}
