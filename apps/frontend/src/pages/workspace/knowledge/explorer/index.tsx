import { useEffect, useState } from "react";

import { EmptyState } from "@/components/primitives";

import { fetchKnowledgeDriftWarnings, fetchKnowledgeRecord, fetchKnowledgeSummary, type KnowledgeDriftWarning, type KnowledgeRecordResponse, type KnowledgeSummary, type SubjectIdentity } from "../api";
import { KnowledgeRecordView } from "../record";
import { KnowledgeTree } from "../tree";

function CountBreakdown({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? <span className="block truncate text-[10px] text-dim" title={entries.map(([key, value]) => `${key}: ${value}`).join(", ")}>{entries.map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`).join(" · ")}</span> : null;
}

function SummaryStrip({ onShowDriftWarnings, summary }: { onShowDriftWarnings: () => void; summary: KnowledgeSummary }) {
  const items = [
    { label: "Stamped targets", value: `${summary.targets.stamped} / ${summary.targets.total}` },
    { label: "Facts", value: String(summary.facts.total), counts: summary.facts.by_type },
    { label: "Entities", value: String(summary.entities.total), counts: summary.entities.by_kind },
    { label: "Links", value: String(summary.links.total) },
  ];
  return <section className="grid shrink-0 grid-cols-2 border-b border-line bg-panel lg:grid-cols-5" aria-label="Knowledge summary">{items.map((item) => <div className="min-w-0 border-r border-line px-3 py-2" key={item.label}><div className="text-[9px] font-bold uppercase tracking-[0.1em] text-dim">{item.label}</div><div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-fg">{item.value}</div>{item.counts ? <CountBreakdown counts={item.counts} /> : null}</div>)}<button className={`min-w-0 px-3 py-2 text-left hover:bg-raised ${summary.drift.warned_tasks > 0 ? "bg-status-warning-fill text-status-warning" : "text-fg"}`} onClick={onShowDriftWarnings} type="button"><span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-dim">Drift warnings</span><span className="mt-0.5 block font-mono text-sm font-semibold tabular-nums">{summary.drift.warned_tasks}</span><span className="block truncate text-[10px] text-dim">{summary.drift.released_pending} pending retry</span></button></section>;
}

function warningLabel(warning: KnowledgeDriftWarning): string {
  return warning.subject.subjectKind === "target"
    ? warning.subject.symbol ?? warning.subject.stableKey
    : warning.subject.locator;
}

export function KnowledgeExplorer({ game }: { game?: string }) {
  const [summary, setSummary] = useState<KnowledgeSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubjectIdentity | null>(null);
  const [record, setRecord] = useState<KnowledgeRecordResponse | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [revealUnit, setRevealUnit] = useState<string | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [warnings, setWarnings] = useState<KnowledgeDriftWarning[] | null>(null);
  const [warningsError, setWarningsError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setSummary(null);
    setSummaryError(null);
    setShowWarnings(false);
    setWarnings(null);
    setWarningsError(null);
    void fetchKnowledgeSummary(game).then((value) => { if (current) setSummary(value); }, (error: unknown) => { if (current) setSummaryError(error instanceof Error ? error.message : String(error)); });
    return () => { current = false; };
  }, [game]);

  useEffect(() => {
    if (!selected) { setRecord(null); setRecordError(null); return; }
    let current = true;
    setRecord(null);
    setRecordLoading(true);
    setRecordError(null);
    const query = selected.subjectKind === "target" ? { target_stable_key: selected.stableKey } as const : { entity_locator: selected.locator } as const;
    void fetchKnowledgeRecord(game, query).then((value) => { if (current) setRecord(value); }, (error: unknown) => { if (current) setRecordError(error instanceof Error ? error.message : String(error)); }).finally(() => { if (current) setRecordLoading(false); });
    return () => { current = false; };
  }, [game, selected]);

  function selectSubject(subject: SubjectIdentity) {
    setSelected(subject);
    if (subject.subjectKind === "target") setRevealUnit(subject.unit);
  }

  function toggleWarnings() {
    const next = !showWarnings;
    setShowWarnings(next);
    if (!next || warnings !== null) return;
    setWarningsError(null);
    void fetchKnowledgeDriftWarnings(game).then((value) => setWarnings(value.warnings), (error: unknown) => {
      setWarningsError(error instanceof Error ? error.message : String(error));
    });
  }

  return <div className="flex min-h-0 flex-1 flex-col bg-background">
    {summary ? <SummaryStrip onShowDriftWarnings={toggleWarnings} summary={summary} /> : summaryError ? <EmptyState className="m-3 shrink-0 text-left">Summary unavailable: {summaryError}</EmptyState> : <EmptyState className="m-3 shrink-0 text-left">Loading knowledge summary...</EmptyState>}
    {showWarnings ? <section className="shrink-0 border-b border-status-warning-border bg-status-warning-fill px-3 py-2" aria-label="Drift warning subjects"><div className="mb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-status-warning">Drift warning subjects</div>{warningsError ? <div className="text-[11px] text-status-warning">Could not load warnings: {warningsError}</div> : warnings === null ? <div className="text-[11px] text-dim">Loading warnings...</div> : warnings.length === 0 ? <div className="text-[11px] text-dim">No drift warnings.</div> : <div className="flex flex-wrap gap-1.5">{warnings.map((warning) => <button className="border border-status-warning-border bg-panel px-2 py-1 font-mono text-[11px] text-status-warning hover:bg-raised" key={warning.task_id} onClick={() => selectSubject(warning.subject)} title={warning.task_id} type="button">{warningLabel(warning)}</button>)}</div>}</section> : null}
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,34%)_minmax(0,1fr)] overflow-hidden">
      <aside className="min-h-0 overflow-hidden border-r border-line bg-card" aria-label="Knowledge records"><KnowledgeTree game={game} onSelectSubject={selectSubject} revealUnit={revealUnit} selectedSubject={selected} /></aside>
      <main className="min-h-0 overflow-y-auto bg-background p-4"><KnowledgeRecordView error={recordError} loading={recordLoading} onSelectSubject={selectSubject} record={record} /></main>
    </div>
  </div>;
}
