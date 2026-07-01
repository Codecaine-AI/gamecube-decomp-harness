import { useEffect, useState } from "react";

import { Archive, Hammer, Pause, Play, RefreshCw } from "@/icons";
import { Button, EmptyState, Field, InfoRows, Pill, SelectField } from "@/components/primitives";
import { asArray, asObject, clock, numberValue, shortId, text, type JsonObject } from "@/lib/format";
import { processView } from "@/lib/processView";
import { normalizeToolConcurrency, suggestedToolConcurrency, toolConcurrencyRows, workerTimeoutMinutes, workerTimeoutSecondsFromMinutes } from "@/lib/workerConfig";
import {
  candidateRerankOptions,
  candidateRerankTooltip,
  candidateWindowOptions,
  candidateWindowTooltip,
  epochSizeOptions,
  resolverConcurrencyOptions,
  resolverConcurrencyTooltip,
  schedulingForWorkers,
  workerCountOptions,
} from "@/pages/workspace/_lib/model";

import { formatElapsed } from "../_lib/time";
import type { ProcessTabProps } from "../_lib/types";

const subphaseSentences: Record<string, string> = {
  baseline: "We are building the baseline right now.",
  candidate_list: "We are building the candidate list right now.",
  checkpoint: "We are writing a checkpoint right now.",
  config: "We are configuring the session right now.",
  epoch_build: "We are building the epoch right now.",
  final_build: "We are running the final build right now.",
  graph_rebuild: "We are rebuilding graph context right now.",
  intake: "We are processing intake right now.",
  knowledge_refresh: "We are refreshing knowledge right now.",
  prepare_prs: "We are preparing PR branches right now.",
  processing_prs: "We are processing merged PRs right now.",
  publish: "We are publishing PRs right now.",
  qa: "We are running QA right now.",
  qa_fixes: "We are resolving QA fixes right now.",
  review: "We are reviewing PR feedback right now.",
  split: "We are planning PR slices right now.",
  sync_intake: "We are syncing and collecting intake right now.",
  workers: "Workers are running right now.",
};

function prettyLabel(value: unknown, fallback = "-"): string {
  const raw = text(value, fallback);
  return raw ? raw.replace(/[_-]+/g, " ") : fallback;
}

function recordValue(record: JsonObject, camelKey: string, snakeKey: string = camelKey): unknown {
  return record[camelKey] ?? record[snakeKey];
}

function commandLine(record: JsonObject): string {
  const command = asArray(record.command).map((item) => String(item)).filter(Boolean);
  return command.join(" ");
}

function processName(dashboard: ProcessTabProps["dashboard"]): string {
  const project = asObject(dashboard?.project);
  return text(project.processName, "melee-live");
}

function processSentence(dashboard: ProcessTabProps["dashboard"], running: boolean, draining: boolean): string {
  const proc = asObject(dashboard?.process);
  const operation = asObject(proc.operation);
  const operationStatus = text(operation.status);
  if (operationStatus === "running") return `${text(operation.label, "Operation")} is running right now.`;
  if (draining) return "Workers are draining; no new workers will start.";

  const session = asObject(dashboard?.projectSession);
  const phase = text(session.phase);
  const subphase = text(session.activeSubphase);
  if (running && subphaseSentences[subphase]) return subphaseSentences[subphase];

  if (running && phase) {
    const phaseLabel = prettyLabel(phase, "process");
    const subphaseLabel = subphase ? ` / ${prettyLabel(subphase)}` : "";
    return `The ${phaseLabel}${subphaseLabel} process is running right now.`;
  }

  const state = text(proc.state, "idle");
  if (state === "stopping") return "The managed process is stopping right now.";
  if (running) return "The managed process is running right now.";
  return "No managed process is running right now.";
}

function ProcessRecord({ current, record }: { current?: boolean; record: JsonObject }) {
  const state = text(record.viewState, text(record.state, record.alive === true ? "running" : "saved"));
  const pid = recordValue(record, "pid");
  const startedAt = recordValue(record, "startedAt", "started_at");
  return (
    <article className={`border ${current ? "border-line2 bg-raised" : "border-line bg-card"} p-2`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-fg" title={text(record.name, "-")}>
            {text(record.name, "-")}
          </div>
          <div className="mt-0.5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim" title={text(record.path)}>
            {pid ? `pid ${String(pid)}` : "no pid"}
            {startedAt ? ` / ${clock(startedAt)}` : ""}
          </div>
        </div>
        <Pill state={state} />
      </div>
    </article>
  );
}

export function ProcessTab({ busy, dashboard, form, onAction, setForm }: ProcessTabProps) {
  const [, setTick] = useState(0);
  const selectedName = processName(dashboard);
  const view = processView(dashboard, selectedName);
  const proc = view.display;
  const running = view.running;
  const draining = view.draining;
  const startedAt = recordValue(proc, "startedAt", "started_at");
  const endedAt = recordValue(proc, "endedAt", "ended_at");
  const elapsed = startedAt ? formatElapsed(startedAt, running ? undefined : endedAt) : "";
  const command = commandLine(proc) || commandLine(view.proc);
  const status = asObject(dashboard?.status);
  const session = asObject(dashboard?.projectSession);
  const run = asObject(status.run);
  const checkpoint = asObject(dashboard?.checkpointProgress);
  const schedulerEpoch = asObject(status.schedulerEpoch);
  const activeClaims = numberValue(status.activeClaims, 0);
  const saved = view.saved.slice(0, 5);
  const hasRun = Boolean(text(run.id));
  const hasActiveEpoch = Boolean(text(schedulerEpoch.epochId));
  const checkpointBuilding = checkpoint.building === true;
  const timeoutMinutes = workerTimeoutMinutes(form.agentTimeoutSeconds);
  const toolConcurrency = normalizeToolConcurrency(form.toolConcurrency);
  const setToolConcurrency = (key: keyof typeof toolConcurrency, value: unknown, max: number) => {
    const parsed = Math.trunc(Number(value));
    setForm({
      toolConcurrency: {
        ...toolConcurrency,
        [key]: Math.max(1, Math.min(max, Number.isFinite(parsed) ? parsed : toolConcurrency[key])),
      },
    });
  };

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  return (
    <section className="grid gap-3 p-3">
      <div className="border border-line bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Current Process</div>
            <p className="mb-0 mt-1 text-sm font-semibold leading-5 text-fg">{processSentence(dashboard, running, draining)}</p>
          </div>
          <Pill state={view.pillState} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Button disabled={busy || !running || draining} icon={draining ? <RefreshCw size={13} /> : <Pause size={13} />} onClick={() => onAction("stop")} title={running ? "Stop scheduling and exit after in-flight workers finish." : "No process is running."} tone="warning" type="button">
            {draining ? "Draining" : "Drain"}
          </Button>
          <Button disabled={busy || !running} icon={<Archive size={13} />} onClick={() => onAction("forceStop")} title={running ? "Kill workers immediately and recover active claims for rescheduling." : "No process is running."} tone="danger" type="button">
            Kill
          </Button>
          <Button disabled={busy || running || !hasRun} icon={<Play size={13} />} onClick={() => onAction("start")} title={!hasRun ? "No active run to start." : running ? "Workers are already running." : "Start workers with the current run config."} tone={!running && hasRun ? "primary" : undefined} type="button">
            Start
          </Button>
        </div>
        <div className="mt-1.5">
          <Button disabled={busy || !running || !hasActiveEpoch || checkpointBuilding} icon={<Hammer size={13} />} onClick={() => onAction("finishEpoch")} title={!running ? "No process is running." : !hasActiveEpoch ? "No active epoch to finish." : checkpointBuilding ? "An epoch checkpoint is already building." : "Treat the current epoch as drained and run the baseline/rebuild checkpoint now."} tone="warning" type="button">
            Finish Epoch
          </Button>
        </div>
        <div className="mt-1.5">
          <Button disabled={busy} icon={<RefreshCw size={13} />} onClick={() => onAction("refresh")} type="button">
            Refresh
          </Button>
        </div>
      </div>

      <InfoRows
        rows={[
          ["Name", text(recordValue(proc, "name"), selectedName)],
          ["PID", recordValue(proc, "pid") ? String(recordValue(proc, "pid")) : "-"],
          ["State", prettyLabel(view.pillState)],
          ["Elapsed", elapsed || "-"],
          ["Session", text(session.sessionUuid, text(session.id)) ? `Session ${shortId(text(session.sessionUuid, text(session.id)))}` : text(run.id) ? `Run ${shortId(run.id)}` : "-"],
          ["Phase", [prettyLabel(session.phase, ""), prettyLabel(session.activeSubphase, "")].filter(Boolean).join(" / ") || "-"],
          ["Claims", String(activeClaims)],
          ["Checkpoint", checkpoint.building === true ? "building" : text(checkpoint.status, text(checkpoint.nextCheckpoint, "-"))],
        ]}
      />

      <div className="border border-line bg-card p-3">
        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Start Config</div>
        <div className="grid grid-cols-2 gap-2">
          <SelectField className="mb-0" label="Workers" onChange={(event) => setForm(schedulingForWorkers(Number(event.currentTarget.value)))} options={[...workerCountOptions]} value={form.maxWorkers} />
          <SelectField className="mb-0" label="Epoch" onChange={(event) => setForm({ epochSize: event.currentTarget.value })} options={[...epochSizeOptions]} value={form.epochSize} />
          <SelectField className="mb-0" label="Window" onChange={(event) => setForm({ candidateWindow: event.currentTarget.value })} options={[...candidateWindowOptions]} title={candidateWindowTooltip} value={form.candidateWindow} />
          <SelectField className="mb-0" label="Rerank" onChange={(event) => setForm({ candidateRerank: event.currentTarget.value })} options={[...candidateRerankOptions]} title={candidateRerankTooltip} value={form.candidateRerank} />
          <SelectField className="mb-0" label="Resolvers" onChange={(event) => setForm({ integrationResolverConcurrency: Number(event.currentTarget.value) })} options={[...resolverConcurrencyOptions]} title={resolverConcurrencyTooltip} value={form.integrationResolverConcurrency} />
          <Field className="mb-0" label="Timeout min" min={1} onChange={(event) => setForm({ agentTimeoutSeconds: workerTimeoutSecondsFromMinutes(event.currentTarget.value) })} step={1} type="number" value={timeoutMinutes} />
          <SelectField className="mb-0" label="Thinking" onChange={(event) => setForm({ thinkingLevel: event.currentTarget.value })} options={["xhigh", "high", "medium", "low"]} value={form.thinkingLevel} />
          <Field className="mb-0" label="Provider" onChange={(event) => setForm({ provider: event.currentTarget.value })} spellCheck={false} value={form.provider} />
          <Field className="mb-0" label="Model" onChange={(event) => setForm({ model: event.currentTarget.value })} spellCheck={false} value={form.model} />
        </div>
        <details className="control-disclosure mt-3">
          <summary>Tool slots</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {toolConcurrencyRows.map((row) => (
              <Field
                className="mb-0"
                key={row.key}
                label={row.label}
                max={row.max}
                min={1}
                onChange={(event) => setToolConcurrency(row.key, event.currentTarget.value, row.max)}
                step={1}
                type="number"
                value={toolConcurrency[row.key]}
              />
            ))}
          </div>
          <div className="mt-2">
            <Button icon={<RefreshCw size={13} />} onClick={() => setForm({ toolConcurrency: suggestedToolConcurrency(form.maxWorkers) })} title="Fit tool slots to the selected worker count." type="button">
              Fit Tools
            </Button>
          </div>
        </details>
      </div>

      {command ? (
        <div className="border border-line bg-inset p-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Command</div>
          <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-soft">{command}</pre>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Saved Processes</div>
        {saved.length > 0 ? (
          saved.map((record) => (
            <ProcessRecord current={text(record.name) === text(recordValue(proc, "name")) && recordValue(record, "pid") === recordValue(proc, "pid")} key={`${text(record.name)}-${String(recordValue(record, "pid") ?? "")}-${text(record.path)}`} record={record} />
          ))
        ) : (
          <EmptyState className="p-3 text-xs">No saved process records</EmptyState>
        )}
      </div>
    </section>
  );
}
