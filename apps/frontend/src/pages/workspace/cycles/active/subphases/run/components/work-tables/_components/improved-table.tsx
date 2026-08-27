import { useState } from "react";
import { Button } from "@/components/primitives";
import { ArrowRight } from "@/icons";
import { PlaceholderRows } from "./placeholder-rows";
import { TabButton } from "./tab-button";
import { improvedPageSize } from "../_lib/constants";
import {
  confirmedImprovementRows,
  confirmedBreakageRows,
  confirmedMatchRows,
  confirmedRows,
  deltaColumnLabel,
  deltaColumnTitle,
  improvedEmptyText,
  reportRows,
  rowDelta,
  rowDeltaClass,
  rowDeltaTitle,
  rowItem,
  rowPath,
  rowScore,
  rowUpstreamState,
  tentativeImprovementRows,
  tentativeMatchRows,
  tentativeRows,
} from "../_lib/improvements";
import type { ImprovedMode, ImprovedResultMode } from "../_lib/types";
import {
  num,
  scoreOrPercent,
  scorePairLooksPercent,
  signedWhole,
  text,
  type Dashboard,
  type JsonObject,
} from "@/lib/format";

interface ImprovedTableProps {
  dashboard: Dashboard | null;
  mode: ImprovedMode;
  onSelectAttempt?: (workerStateId: string) => void;
}

function scorePart(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
}

function displayScore(value: unknown, percent: boolean): string {
  return percent && Number(value) === 100 ? "100%" : scoreOrPercent(value, percent);
}

interface ScoreDeltaParts {
  after: string;
  before: string;
  delta: string;
  tone: string;
}

function scoreDeltaParts(entry: JsonObject): ScoreDeltaParts | null {
  const before = scorePart(entry.fromPercent);
  const after = scorePart(entry.toPercent);
  if (before && after) {
    const improvement = Number(entry.toPercent) - Number(entry.fromPercent);
    const deltaLabel = Number.isFinite(improvement) ? `${improvement >= 0 ? "+" : ""}${improvement.toFixed(2)}` : "";
    const tone = improvement > 0 ? "text-up" : improvement < 0 ? "text-down" : "text-dim";
    return { after, before, delta: deltaLabel, tone };
  }

  const oldScore = Number(entry.oldScore);
  const newScore = Number(entry.newScore);
  if (!Number.isFinite(oldScore) || !Number.isFinite(newScore)) return null;
  const percent = scorePairLooksPercent(entry.oldScore, entry.newScore, entry.totalDelta);
  return {
    after: displayScore(entry.newScore, percent),
    before: displayScore(entry.oldScore, percent),
    delta: entry.bytesDelta == null ? rowDelta(entry) : `${signedWhole(entry.bytesDelta)}b`,
    tone: rowDeltaClass(entry),
  };
}

function ScoreCell({ entry }: { entry: JsonObject }) {
  const parts = scoreDeltaParts(entry);
  if (!parts) return <span className="text-up">{rowScore(entry)}</span>;
  const wideScore = parts.before.includes("%") || parts.after.includes("%") || parts.delta.includes(" ");
  const gridColumns = wideScore
    ? "grid-cols-[8ch_12px_8ch_9ch]"
    : "grid-cols-[6ch_12px_6ch_7ch]";

  return (
    <span className={`inline-grid max-w-full ${gridColumns} items-center gap-0.5 tabular-nums`}>
      <span className="text-right text-soft">{parts.before}</span>
      <ArrowRight className="justify-self-center text-faint" size={11} />
      <span className="text-right text-up">{parts.after}</span>
      <span className={`pl-1 text-left text-[10px] ${parts.tone}`}>{parts.delta}</span>
    </span>
  );
}

function BreakageScoreCell({ entry }: { entry: JsonObject }) {
  const parts = scoreDeltaParts(entry);
  if (!parts) return <span className="text-down">{rowScore(entry)}</span>;
  return (
    <span className="inline-grid max-w-full grid-cols-[8ch_12px_8ch_9ch] items-center gap-0.5 tabular-nums">
      <span className="text-right text-soft">{parts.before}</span>
      <ArrowRight className="justify-self-center text-faint" size={11} />
      <span className="text-right text-down">{parts.after}</span>
      <span className="pl-1 text-left text-[10px] text-down">{parts.delta}</span>
    </span>
  );
}

function scoreTitle(entry: JsonObject): string {
  const parts = scoreDeltaParts(entry);
  if (!parts) return rowScore(entry);
  return `${parts.before} -> ${parts.after}${parts.delta ? ` (${parts.delta})` : ""}`;
}

function itemTitle(entry: JsonObject, mode: ImprovedMode): string {
  const state = mode === "confirmed" ? `\nUpstream state: ${rowUpstreamState(entry)}` : "";
  return `${rowItem(entry)}\nScore: ${scoreTitle(entry)}${state}`;
}

export function ImprovedTable({ dashboard, mode, onSelectAttempt }: ImprovedTableProps) {
  const [page, setPage] = useState(0);
  const [resultMode, setResultMode] = useState<ImprovedResultMode>("matches");
  const rows = reportRows(dashboard, mode, resultMode);
  const pages = Math.max(1, Math.ceil(rows.length / improvedPageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = rows.slice(safePage * improvedPageSize, safePage * improvedPageSize + improvedPageSize);
  const placeholderCount = improvedPageSize - visible.length - (visible.length === 0 ? 1 : 0);
  const totalCount = mode === "confirmed" ? confirmedRows(dashboard).length : tentativeRows(dashboard).length;
  const matchCount = mode === "confirmed" ? confirmedMatchRows(dashboard).length : tentativeMatchRows(dashboard).length;
  const improvementCount = mode === "confirmed" ? confirmedImprovementRows(dashboard).length : tentativeImprovementRows(dashboard).length;
  const breakageCount = mode === "confirmed" ? confirmedBreakageRows(dashboard).length : 0;
  const title = mode === "confirmed" ? "Confirmed" : "Tentative";
  const tentativeMode = mode === "tentative";
  const baselineUnavailable = mode === "confirmed" && dashboard?.scoreTiers?.confirmed.comparisonStatus === "baseline_unavailable";
  const symbolColumnWidth = mode === "confirmed" ? "w-[27%]" : "w-1/3";
  const scoreColumnWidth = mode === "confirmed" ? "w-[50%]" : "w-1/3";
  const stateColumnWidth = mode === "confirmed" ? "w-[23%]" : "w-1/3";
  const columns = tentativeMode ? 2 : 3;

  function selectResultMode(nextMode: ImprovedResultMode) {
    setResultMode(nextMode);
    setPage(0);
  }

  return (
    <section className="h-full border-b border-line p-3 min-[1180px]:border-r min-[1180px]:border-b-0">
      <div className="mb-2 grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h2 className="min-w-0 truncate text-[13px] font-semibold uppercase tracking-[0.08em] text-soft">
          {title} ({num(totalCount)})
        </h2>
        <div className="flex min-h-7 items-center justify-end gap-2">
          <Button className="min-w-12 px-2 py-0.5" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} type="button">
            Prev
          </Button>
          <span className="min-w-12 text-center leading-7 text-dim">{safePage + 1}/{pages}</span>
          <Button className="min-w-12 px-2 py-0.5" disabled={safePage >= pages - 1 || rows.length === 0} onClick={() => setPage((current) => current + 1)} type="button">
            Next
          </Button>
        </div>
      </div>
      <div className="overflow-hidden border border-line bg-inset">
        {baselineUnavailable ? (
          <div className="border-b border-down/40 bg-down/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-down">
            Upstream baseline unavailable
          </div>
        ) : null}
        <div className={`grid min-h-9 ${tentativeMode ? "grid-cols-2" : "grid-cols-3"} border-b border-line bg-inset`} role="tablist" aria-label={`${title} result groups`}>
          <TabButton active={resultMode === "matches"} className="flex w-full min-w-0 items-center justify-center border-0 border-r border-line" onClick={() => selectResultMode("matches")}>
            Matches ({num(matchCount)})
          </TabButton>
          <TabButton active={resultMode === "improvements"} className="flex w-full min-w-0 items-center justify-center border-0" onClick={() => selectResultMode("improvements")}>
            Improvements ({num(improvementCount)})
          </TabButton>
          {!tentativeMode ? (
            <TabButton active={resultMode === "breakages"} className="flex w-full min-w-0 items-center justify-center border-0 border-l border-line text-down" onClick={() => selectResultMode("breakages")}>
              Breakages ({num(breakageCount)})
            </TabButton>
          ) : null}
        </div>
        <div className="overflow-auto">
          <table>
            <colgroup>
              {tentativeMode ? (
                <>
                  <col className="w-[30%]" />
                  <col className="w-[70%]" />
                </>
              ) : (
                <>
                  <col className={symbolColumnWidth} />
                  <col className={scoreColumnWidth} />
                  <col className={stateColumnWidth} />
                </>
              )}
            </colgroup>
            <thead>
              <tr>
                <th className="text-left">Symbol</th>
                {tentativeMode ? (
                  <th className="text-center" title={deltaColumnTitle(mode)}>{deltaColumnLabel(mode)}</th>
                ) : (
                  <>
                    <th className="text-center" title={deltaColumnTitle(mode)}>{deltaColumnLabel(mode)}</th>
                    <th className="text-right">Vs Upstream</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((entry, index) => {
                const workerStateId = tentativeMode ? text(entry.workerStateId) : "";
                const selectable = Boolean(workerStateId && onSelectAttempt);

                function selectAttempt() {
                  if (workerStateId) onSelectAttempt?.(workerStateId);
                }

                return (
                  <tr
                    aria-label={selectable ? `Open attempt detail for ${rowItem(entry)}` : undefined}
                    className={`row-rhythm-1 ${selectable ? "cursor-pointer hover:bg-raised" : ""}`}
                    key={`${rowPath(entry)}-${rowItem(entry)}-${index}`}
                    onClick={selectable ? selectAttempt : undefined}
                    onKeyDown={selectable ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectAttempt();
                      }
                    } : undefined}
                    role={selectable ? "button" : undefined}
                    tabIndex={selectable ? 0 : undefined}
                    title={selectable ? "Open attempt detail" : undefined}
                  >
                    <td title={itemTitle(entry, mode)}>{rowItem(entry)}</td>
                    {tentativeMode ? (
                      <td className="text-center" title={rowDeltaTitle(entry)}><ScoreCell entry={entry} /></td>
                    ) : (
                      <>
                        <td className="text-center">{resultMode === "breakages" ? <BreakageScoreCell entry={entry} /> : <ScoreCell entry={entry} />}</td>
                        <td className={`text-right ${resultMode === "breakages" ? "text-down" : "text-soft"}`}>{rowUpstreamState(entry)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr className="row-rhythm-1">
                  <td className="text-dim" colSpan={columns}>{improvedEmptyText(dashboard, mode, resultMode)}</td>
                </tr>
              ) : null}
              <PlaceholderRows columns={columns} count={placeholderCount} rhythm="match" />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
