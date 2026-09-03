import { useEffect, useState } from "react";

import { Archive, RefreshCw } from "@/icons";
import { Button, EmptyState, InfoRows, Pill } from "@/components/primitives";
import { asArray, asObject, clock, numberValue, shortId, text, type Dashboard, type JsonObject } from "@/lib/format";
import { processView } from "@/lib/processView";
import { RUN_CONTROL_ACTIONS } from "@/components/app/_lib/projectedRunControls";
import type { CycleView, DashboardAction } from "@/pages/workspace/_lib/types";

import { formatElapsed } from "../_lib/time";
import { StateSection } from "./state-section";

// Keyed by cycle.activeSubphase. The prepare-era subphases are retired with
// the babysit/prepare flow; the generic phase/subphase fallback below covers
// anything unlisted. Sync workflow statuses do not flow through this field,
// so they get no entries here.
const subphaseSentences: Record<string, string> = {
  baseline: "We are building the baseline right now.",
  candidate_list: "We are building the candidate list right now.",
  checkpoint: "We are writing a checkpoint right now.",
  epoch_build: "We are building the epoch right now.",
  final_build: "We are running the final build right now.",
  graph_rebuild: "We are rebuilding graph context right now.",
  intake: "We are processing intake right now.",
  publish: "We are publishing PRs right now.",
  qa: "We are running QA right now.",
  qa_fixes: "We are resolving QA fixes right now.",
  review: "We are reviewing PR feedback right now.",
  split: "We are planning PR slices right now.",
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

function processName(dashboard: Dashboard | null): string {
  const game = asObject(dashboard?.game);
  return text(game.processName, "process");
}

/**
 * One sentence naming the single thing that is running right now. Only one
 * operation runs at a time (a sync, a run's workers, or a PR operation), so
 * this is the rail's source of truth for "what is happening".
 */
function nowSentence(dashboard: Dashboard | null, view: CycleView, running: boolean): string {
  const sync = view.harnessState?.sync;
  const syncStatus = text(sync?.status);
  if (sync && syncStatus && !["published", "cancelled"].includes(syncStatus)) {
    return `Sync is ${syncStatus.replace(/_/g, " ")} right now.`;
  }
  const proc = asObject(dashboard?.process);
  const operation = asObject(proc.operation);
  if (text(operation.status) === "running") return `${text(operation.label, "Operation")} is running right now.`;
  const cycle = asObject(dashboard?.cycle);
  const phase = text(cycle.phase);
  const subphase = text(cycle.activeSubphase);
  if (running && subphaseSentences[subphase]) return subphaseSentences[subphase];
  if (running && phase) {
    const phaseLabel = prettyLabel(phase, "process");
    const subphaseLabel = subphase ? ` / ${prettyLabel(subphase)}` : "";
    return `The ${phaseLabel}${subphaseLabel} process is running right now.`;
  }
  const state = text(proc.state, "idle");
  if (state === "stopping") return "The managed process is stopping right now.";
  if (running) return "The managed process is running right now.";
  return "Idle. Nothing is running right now.";
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

function Disclosure({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <details className="group border border-line bg-card">
      <summary className="cursor-pointer select-none list-none px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-dim hover:text-soft">
        {label}
      </summary>
      <div className="border-t border-line">{children}</div>
    </details>
  );
}

/**
 * The rail's always-visible header panel: what is running right now, the
 * managed process behind it, and the only universal controls (stop, refresh).
 * Starting things belongs to each workflow's Actions subtab.
 */
export function NowPanel({
  busy,
  dashboard,
  onAction,
  view,
}: {
  busy: boolean;
  dashboard: Dashboard | null;
  onAction: (action: DashboardAction) => void;
  view: CycleView;
}) {
  const [, setTick] = useState(0);
  const selectedName = processName(dashboard);
  const procView = processView(dashboard, selectedName);
  const proc = procView.display;
  const running = procView.running;
  const startedAt = recordValue(proc, "startedAt", "started_at");
  const endedAt = recordValue(proc, "endedAt", "ended_at");
  const elapsed = startedAt ? formatElapsed(startedAt, running ? undefined : endedAt) : "";
  const command = commandLine(proc) || commandLine(procView.proc);
  const status = asObject(dashboard?.status);
  const cycle = asObject(dashboard?.cycle);
  const checkpoint = asObject(dashboard?.checkpointProgress);
  const activeClaims = numberValue(status.activeClaims, 0);
  const saved = procView.saved.slice(0, 5);
  const pid = recordValue(proc, "pid");
  const syncActive = Boolean(view.harnessState?.sync && !["published", "cancelled"].includes(text(view.harnessState.sync.status)));
  const anythingRunning = running || syncActive;

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);

  return (
    <section className="grid gap-2 border-b border-line2 bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Now</div>
          <p className="mb-0 mt-1 text-sm font-semibold leading-5 text-fg">{nowSentence(dashboard, view, running)}</p>
          <div className="mt-1 text-[11px] text-dim">
            {running
              ? `${selectedName}${pid ? ` · pid ${String(pid)}` : ""}${elapsed ? ` · ${elapsed}` : ""}`
              : anythingRunning
                ? "Runs inside the server process."
                : "Start a sync or run from its tab below."}
          </div>
        </div>
        <Pill state={syncActive && !running ? "running" : procView.pillState} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button disabled={busy || !running} icon={<Archive size={13} />} onClick={() => onAction(RUN_CONTROL_ACTIONS.hardStop)} title={running ? "Stop workers gracefully, then cancel any still running after 30 seconds." : "No process is running."} tone="warning" type="button">
          Stop
        </Button>
        <Button disabled={busy} icon={<RefreshCw size={13} />} onClick={() => onAction("refresh")} type="button">
          Refresh
        </Button>
      </div>
      <Disclosure label="State">
        <StateSection dashboard={dashboard} view={view} />
      </Disclosure>
      <Disclosure label="Process">
        <div className="grid gap-2 p-2">
          <InfoRows
            rows={[
              ["Name", text(recordValue(proc, "name"), selectedName)],
              ["PID", pid ? String(pid) : "-"],
              ["State", prettyLabel(procView.pillState)],
              ["Elapsed", elapsed || "-"],
              ["Cycle", text(cycle.cycleUuid, text(cycle.id)) ? `Cycle ${shortId(text(cycle.cycleUuid, text(cycle.id)))}` : "-"],
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
                <ProcessRecord current={text(record.name) === text(recordValue(proc, "name")) && recordValue(record, "pid") === pid} key={`${text(record.name)}-${String(recordValue(record, "pid") ?? "")}-${text(record.path)}`} record={record} />
              ))
            ) : (
              <EmptyState className="p-3 text-xs">No saved process records</EmptyState>
            )}
          </div>
        </div>
      </Disclosure>
    </section>
  );
}
