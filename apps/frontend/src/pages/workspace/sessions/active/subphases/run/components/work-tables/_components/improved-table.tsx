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
import type { ImprovedMode, ImprovedResultMode, WorkTablesProps } from "../_lib/types";
import { num, type Dashboard, type JsonObject } from "@/lib/format";

interface ImprovedTableProps {
  dashboard: Dashboard | null;
  mode: ImprovedMode;
  page: number;
  setMode: (mode: ImprovedMode) => void;
  setPage: WorkTablesProps["setImprovedPage"];
}

function scorePart(value: unknown): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
}

function ScoreCell({ entry }: { entry: JsonObject }) {
  const before = scorePart(entry.fromPercent);
  const after = scorePart(entry.toPercent);
  if (!before || !after) return <>{rowScore(entry)}</>;

  const improvement = Number(entry.toPercent) - Number(entry.fromPercent);
  const improvementLabel = Number.isFinite(improvement) ? `${improvement >= 0 ? "+" : ""}${improvement.toFixed(2)}` : "";
  const improvementTone = improvement > 0 ? "text-up" : improvement < 0 ? "text-down" : "text-dim";

  return (
    <span className="inline-grid grid-cols-[6ch_14px_6ch_7ch] items-center gap-1 tabular-nums">
      <span className="text-right text-soft">{before}</span>
      <ArrowRight className="justify-self-center text-faint" size={11} />
      <span className="text-right text-fg">{after}</span>
      <span className={`text-right text-[10px] ${improvementTone}`}>{improvementLabel}</span>
    </span>
  );
}

function scoreTitle(entry: JsonObject): string {
  const before = scorePart(entry.fromPercent);
  const after = scorePart(entry.toPercent);
  if (!before || !after) return rowScore(entry);
  const improvement = Number(entry.toPercent) - Number(entry.fromPercent);
  const improvementLabel = Number.isFinite(improvement) ? `${improvement >= 0 ? "+" : ""}${improvement.toFixed(2)}` : "";
  return `${before} -> ${after}${improvementLabel ? ` (${improvementLabel})` : ""}`;
}

function bytesTitle(entry: JsonObject): string {
  const bytes = Number(entry.bytesDelta);
  if (!Number.isFinite(bytes)) return rowDelta(entry);
  return `${bytes >= 0 ? "+" : ""}${Math.round(bytes)}b`;
}

function itemTitle(entry: JsonObject): string {
  return `${rowItem(entry)}\nScore: ${scoreTitle(entry)}\nBytes: ${bytesTitle(entry)}`;
}

export function ImprovedTable({ dashboard, mode, page, setMode, setPage }: ImprovedTableProps) {
  const [resultMode, setResultMode] = useState<ImprovedResultMode>("matches");
  const rows = reportRows(dashboard, mode, resultMode);
  const pages = Math.max(1, Math.ceil(rows.length / improvedPageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = rows.slice(safePage * improvedPageSize, safePage * improvedPageSize + improvedPageSize);
  const placeholderCount = improvedPageSize - visible.length - (visible.length === 0 ? 1 : 0);
  const matchCount = mode === "confirmed" ? confirmedMatchRows(dashboard).length : tentativeMatchRows(dashboard).length;
  const improvementCount = mode === "confirmed" ? confirmedImprovementRows(dashboard).length : tentativeImprovementRows(dashboard).length;

  function selectMode(nextMode: ImprovedMode) {
    setMode(nextMode);
    setPage(0);
  }

  function selectResultMode(nextMode: ImprovedResultMode) {
    setResultMode(nextMode);
    setPage(0);
  }

  return (
    <section className="h-full border-b border-line p-3 min-[1180px]:border-r min-[1180px]:border-b-0">
      <div className="mb-2 grid gap-2 min-[760px]:grid-cols-[minmax(0,1fr)_auto] min-[760px]:items-start">
        <div className="grid gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Confirmed and tentative worker results">
            <TabButton active={mode === "confirmed"} onClick={() => selectMode("confirmed")}>
              Confirmed ({num(confirmedRows(dashboard).length)})
            </TabButton>
            <TabButton active={mode === "tentative"} onClick={() => selectMode("tentative")}>
              Tentative ({num(tentativeRows(dashboard).length)})
            </TabButton>
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label={`${mode === "confirmed" ? "Confirmed" : "Tentative"} matches and improvements`}>
            <TabButton active={resultMode === "matches"} onClick={() => selectResultMode("matches")}>
              Matches ({num(matchCount)})
            </TabButton>
            <TabButton active={resultMode === "improvements"} onClick={() => selectResultMode("improvements")}>
              Improvements ({num(improvementCount)})
            </TabButton>
          </div>
        </div>
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
      <div className="overflow-auto rounded-none border border-line">
        <table>
          <colgroup>
            <col className="w-1/3" />
            <col className="w-1/3" />
            <col className="w-1/3" />
          </colgroup>
          <thead>
            <tr>
              <th className="text-left">Symbol</th>
              <th className="text-center">Score</th>
              <th className="text-right" title={deltaColumnTitle(mode)}>{deltaColumnLabel(mode)}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry, index) => (
              <tr className="row-rhythm-1" key={`${rowPath(entry)}-${rowItem(entry)}-${index}`}>
                <td title={itemTitle(entry)}>{rowItem(entry)}</td>
                <td className="text-center"><ScoreCell entry={entry} /></td>
                <td className={`text-right ${rowDeltaClass(entry)}`} title={rowDeltaTitle(entry)}>{rowDelta(entry)}</td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr className="row-rhythm-1">
                <td className="text-dim" colSpan={3}>{improvedEmptyText(dashboard, mode, resultMode)}</td>
              </tr>
            ) : null}
            <PlaceholderRows columns={3} count={placeholderCount} rhythm="match" />
          </tbody>
        </table>
      </div>
    </section>
  );
}
