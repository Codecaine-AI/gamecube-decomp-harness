import { useEffect, useState } from "react";

import { Archive, Pause, RefreshCw } from "@/icons";
import { Button, EmptyState, InfoRows, Pill } from "@/components/primitives";
import { asArray, asObject, clock, numberValue, shortId, text, type JsonObject } from "@/lib/format";
import { processView } from "@/lib/processView";

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

export function ProcessTab({ busy, dashboard, onAction }: ProcessTabProps) {
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
  const activeClaims = numberValue(status.activeClaims, 0);
  const saved = view.saved.slice(0, 5);

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
            {draining ? "Draining" : "Finish Epoch"}
          </Button>
          <Button disabled={busy || !running} icon={<Archive size={13} />} onClick={() => onAction("forceStop")} title={running ? "Kill workers and recover active claims." : "No process is running."} tone="danger" type="button">
            Kill
          </Button>
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
