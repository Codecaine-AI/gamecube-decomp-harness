import { useEffect, useState } from "react";

import { asArray, asObject, text, type Dashboard } from "@/lib/format";

import { formatElapsed } from "../_lib/time";

const operationStepGlyph: Record<string, { className: string; glyph: string }> = {
  done: { className: "text-up", glyph: "✓" },
  running: { className: "text-fg", glyph: "▸" },
  failed: { className: "text-down", glyph: "✕" },
  skipped: { className: "text-dim", glyph: "–" },
  pending: { className: "text-dim", glyph: "·" },
};

export function OperationActivity({ dashboard }: { dashboard: Dashboard | null }) {
  const operation = asObject(asObject(dashboard?.process).operation);
  const sync = asObject(asObject(dashboard?.harnessState).sync);
  const syncStatus = text(sync.status);
  const syncRunning = ["requested", "ingesting", "reconciling", "validating", "validated", "publishing"].includes(syncStatus);
  const running = text(operation.status) === "running";
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);
  if (!operation.name) {
    if (syncRunning) {
      const syncId = text(sync.workflow_id);
      return (
        <div className="mb-3 border border-line bg-card px-2.5 py-2 text-xs text-fg">
          Sync {syncStatus} in progress{syncId ? ` · ${syncId}` : ""}
        </div>
      );
    }
    return <div className="mb-3 border border-line bg-card px-2.5 py-2 text-xs text-dim">No sync, handoff, or QA operation has run since the UI server started.</div>;
  }

  const steps = asArray(operation.steps).map(asObject);
  const status = text(operation.status);
  const elapsed = formatElapsed(operation.startedAt, running ? undefined : operation.endedAt);

  return (
    <div className="mb-3 border border-line bg-card px-2.5 py-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-soft">{text(operation.label, "Activity")}</span>
        <span className={`text-xs ${status === "failed" ? "text-down" : status === "done" ? "text-up" : "text-fg"}`}>
          {running ? `running · ${elapsed}` : `${status} · ${elapsed}`}
        </span>
      </div>
      <div className="grid gap-1">
        {steps.map((step) => {
          const stepStatus = text(step.status, "pending");
          const tone = operationStepGlyph[stepStatus] ?? operationStepGlyph.pending;
          const stepElapsed = step.startedAt ? formatElapsed(step.startedAt, stepStatus === "running" ? undefined : step.endedAt) : "";
          return (
            <div className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-2 text-xs" key={text(step.name)}>
              <span className={tone.className}>{tone.glyph}</span>
              <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${stepStatus === "running" ? "text-fg" : stepStatus === "pending" || stepStatus === "skipped" ? "text-dim" : "text-soft"}`}>
                {text(step.name)}
                {step.detail ? <span className="text-dim"> — {text(step.detail)}</span> : null}
              </span>
              <span className="whitespace-nowrap text-dim">{stepElapsed}</span>
            </div>
          );
        })}
      </div>
      {status === "failed" && operation.error ? (
        <p className="mt-2 mb-0 break-words text-xs text-down" title={text(operation.error)}>
          {text(operation.error).slice(0, 400)}
        </p>
      ) : null}
      {status === "failed" && operation.next ? (
        <p className="mt-1.5 mb-0 break-words text-xs text-soft">
          <span className="font-semibold uppercase tracking-[0.08em] text-dim">Next </span>
          {text(operation.next)}
        </p>
      ) : null}
    </div>
  );
}
