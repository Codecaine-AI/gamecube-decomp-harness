import type { ReactNode } from "react";

import { asArray, asObject, clock, text, type JsonObject } from "@/lib/format";

import { compactValue, traceEventLabel, traceEventTone, traceScoreText } from "../../_lib/worker-reports";

export function MetaItem({ label, value, valueClassName = "" }: { label: string; value: ReactNode; valueClassName?: string }) {
  return (
    <div className="min-w-0">
      <span className="mr-1 text-faint">{label}</span>
      <span className={`break-words text-soft ${valueClassName}`}>{value}</span>
    </div>
  );
}

export function TraceSection({
  activity,
  emptyText,
  showEmpty = true,
}: {
  activity: JsonObject;
  emptyText: string;
  showEmpty?: boolean;
}) {
  const events = asArray(activity.recentEvents).map(asObject);
  if (events.length === 0) {
    if (!showEmpty) return null;
    return <div className="mt-2 border-t border-line pt-2 text-[11px] text-faint">{emptyText}</div>;
  }
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase text-dim" title="Runner-owned claim timeline from activity.jsonl: attempts, gate decisions, validation results, repairs.">
          Trace
        </span>
        <span className="text-[10px] text-faint">{text(activity.source) === "return_gates" ? "from return gates" : `${events.length} events`}</span>
      </div>
      <div className="grid gap-1 border-l-2 border-line pl-2.5">
        {events.map((event, index) => {
          const scoreText = traceScoreText(event);
          return (
            <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 text-xs leading-5" key={`${text(event.createdAt)}-${index}`}>
              <span className="whitespace-nowrap pt-px text-[10px] text-faint" title={text(event.createdAt)}>{clock(event.createdAt)}</span>
              <span className="min-w-0">
                <span className={`mr-1.5 font-semibold ${traceEventTone(text(event.eventType))}`}>{traceEventLabel(event)}</span>
                <span className="[overflow-wrap:anywhere] text-soft">{text(event.summary, text(event.raw))}</span>
                {scoreText ? <span className="ml-1.5 whitespace-nowrap text-dim">{scoreText}</span> : null}
                {!text(event.summary) && text(event.raw) ? <pre className="mt-1 max-h-24 overflow-auto border border-line bg-inset p-1 text-[10px] leading-4 text-dim">{text(event.raw)}</pre> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function toolStatusTone(status: string): string {
  if (status === "ok") return "text-up";
  if (status === "tool_error" || status === "threw") return "text-warn";
  return "text-dim";
}

function durationLabel(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${Math.round(parsed)}ms` : "";
}

function toolEventDetail(event: JsonObject): string {
  const error = text(event.errorSummary) || text(event.errorKind);
  if (error) return error;
  const params = compactValue(event.params);
  if (params && params !== "{}") return params;
  return text(event.raw);
}

export function ToolTraceSection({
  activity,
  emptyText,
  showEmpty = true,
}: {
  activity: JsonObject;
  emptyText: string;
  showEmpty?: boolean;
}) {
  const events = asArray(activity.recentToolEvents).map(asObject);
  if (events.length === 0) {
    if (!showEmpty) return null;
    return <div className="mt-2 border-t border-line pt-2 text-[11px] text-faint">{emptyText}</div>;
  }
  const count = Number(activity.toolEventCount);
  return (
    <div className="mt-2 border-t border-line pt-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase text-dim" title="Recent Pi custom tool JSONL records from tool_events.jsonl for this worker state.">
          Pi / Tools
        </span>
        <span className="text-[10px] text-faint">{Number.isFinite(count) && count > events.length ? `${events.length}/${count} lines` : `${events.length} lines`}</span>
      </div>
      <div className="grid gap-1 border-l-2 border-line pl-2.5">
        {events.map((event, index) => {
          const status = text(event.status, "unknown");
          const detail = toolEventDetail(event);
          const raw = text(event.raw);
          const rawFallback = raw && (!text(event.tool) || !detail);
          return (
            <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 text-xs leading-5" key={`${text(event.createdAt)}-${text(event.tool)}-${index}`}>
              <span className="whitespace-nowrap pt-px text-[10px] text-faint" title={text(event.createdAt)}>{clock(event.createdAt)}</span>
              <span className="min-w-0">
                <span className={`mr-1.5 font-semibold ${toolStatusTone(status)}`}>{text(event.tool, "tool")}</span>
                <span className="mr-1.5 text-dim">{status.replace(/_/g, " ")}</span>
                {durationLabel(event.durationMs) ? <span className="mr-1.5 text-faint">{durationLabel(event.durationMs)}</span> : null}
                {detail ? <span className="[overflow-wrap:anywhere] text-soft">{detail}</span> : null}
                {rawFallback ? <pre className="mt-1 max-h-24 overflow-auto border border-line bg-inset p-1 text-[10px] leading-4 text-dim">{raw}</pre> : null}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
