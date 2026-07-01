import { useState } from "react";
import { Button } from "@/components/primitives";
import { ArrowRight } from "@/icons";
import { PlaceholderRows } from "./placeholder-rows";
import { TabButton } from "./tab-button";
import { improvedPageSize } from "../_lib/constants";
import {
  confirmedImprovementRows,
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
  tentativeImprovementRows,
  tentativeMatchRows,
  tentativeRows,
} from "../_lib/improvements";
import type { ImprovedMode, ImprovedResultMode } from "../_lib/types";
import {
  num,
  scoreOrPercent,
  scorePairLooksPercent,
  type Dashboard,
  type JsonObject,
} from "@/lib/format";

interface ImprovedTableProps {
  dashboard: Dashboard | null;
  mode: ImprovedMode;
}

function scorePart(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
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
    after: scoreOrPercent(entry.newScore, percent),
    before: scoreOrPercent(entry.oldScore, percent),
    delta: rowDelta(entry),
    tone: rowDeltaClass(entry),
  };
}

function ScoreCell({ entry }: { entry: JsonObject }) {
  const parts = scoreDeltaParts(entry);
  if (!parts) return <>{rowScore(entry)}</>;
  const wideScore = parts.before.includes("%") || parts.after.includes("%") || parts.delta.includes(" ");
  const gridColumns = wideScore
    ? "grid-cols-[8ch_14px_8ch_9ch]"
    : "grid-cols-[6ch_14px_6ch_7ch]";

  return (
    <span className={`inline-grid max-w-full ${gridColumns} items-center gap-1 tabular-nums`}>
      <span className="text-right text-soft">{parts.before}</span>
      <ArrowRight className="justify-self-center text-faint" size={11} />
      <span className="text-right text-fg">{parts.after}</span>
      <span className={`text-right text-[10px] ${parts.tone}`}>{parts.delta}</span>
    </span>
  );
}

function scoreTitle(entry: JsonObject): string {
  const parts = scoreDeltaParts(entry);
  if (!parts) return rowScore(entry);
  return `${parts.before} -> ${parts.after}${parts.delta ? ` (${parts.delta})` : ""}`;
}

function bytesTitle(entry: JsonObject): string {
  const bytes = Number(entry.bytesDelta);
  if (!Number.isFinite(bytes)) return rowDelta(entry);
  return `${bytes >= 0 ? "+" : ""}${Math.round(bytes)}b`;
}

function itemTitle(entry: JsonObject, mode: ImprovedMode): string {
  const deltaLabel = mode === "confirmed" ? "Bytes" : "Score delta";
  return `${rowItem(entry)}\nScore: ${scoreTitle(entry)}\n${deltaLabel}: ${bytesTitle(entry)}`;
}

export function ImprovedTable({ dashboard, mode }: ImprovedTableProps) {
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
  const title = mode === "confirmed" ? "Confirmed" : "Tentative";
  const tentativeMode = mode === "tentative";
  const symbolColumnWidth = mode === "confirmed" ? "w-[26%]" : "w-1/3";
  const scoreColumnWidth = mode === "confirmed" ? "w-[56%]" : "w-1/3";
  const deltaColumnWidth = mode === "confirmed" ? "w-[18%]" : "w-1/3";
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
        <div className="grid min-h-9 grid-cols-2 border-b border-line bg-inset" role="tablist" aria-label={`${title} matches and improvements`}>
          <TabButton active={resultMode === "matches"} className="flex w-full min-w-0 items-center justify-center border-0 border-r border-line" onClick={() => selectResultMode("matches")}>
            Matches ({num(matchCount)})
          </TabButton>
          <TabButton active={resultMode === "improvements"} className="flex w-full min-w-0 items-center justify-center border-0" onClick={() => selectResultMode("improvements")}>
            Improvements ({num(improvementCount)})
          </TabButton>
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
                  <col className={deltaColumnWidth} />
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
                    <th className="text-center">Score</th>
                    <th className="text-right" title={deltaColumnTitle(mode)}>{deltaColumnLabel(mode)}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((entry, index) => (
                <tr className="row-rhythm-1" key={`${rowPath(entry)}-${rowItem(entry)}-${index}`}>
                  <td title={itemTitle(entry, mode)}>{rowItem(entry)}</td>
                  {tentativeMode ? (
                    <td className="text-center" title={rowDeltaTitle(entry)}><ScoreCell entry={entry} /></td>
                  ) : (
                    <>
                      <td className="text-center"><ScoreCell entry={entry} /></td>
                      <td className={`text-right ${rowDeltaClass(entry)}`} title={rowDeltaTitle(entry)}>{rowDelta(entry)}</td>
                    </>
                  )}
                </tr>
              ))}
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
