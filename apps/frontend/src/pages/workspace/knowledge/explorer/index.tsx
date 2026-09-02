import { useEffect, useState } from "react";

import { EmptyState } from "@/components/primitives";

import { fetchKnowledgeRecord, fetchKnowledgeSummary, type KnowledgeRecordResponse, type KnowledgeSummary, type SubjectIdentity } from "../api";
import { KnowledgeRecordView } from "../record";
import { KnowledgeTree } from "../tree";

function CountBreakdown({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));
  return entries.length ? <span className="block truncate text-[10px] text-dim" title={entries.map(([key, value]) => `${key}: ${value}`).join(", ")}>{entries.map(([key, value]) => `${key.replaceAll("_", " ")} ${value}`).join(" · ")}</span> : null;
}

function SummaryStrip({ summary }: { summary: KnowledgeSummary }) {
  const items = [
    { label: "Stamped targets", value: `${summary.targets.stamped} / ${summary.targets.total}` },
    { label: "Facts", value: String(summary.facts.total), counts: summary.facts.by_type },
    { label: "Entities", value: String(summary.entities.total), counts: summary.entities.by_kind },
    { label: "Links", value: String(summary.links.total) },
  ];
  return <section className="grid shrink-0 grid-cols-2 border-b border-line bg-panel lg:grid-cols-4" aria-label="Knowledge summary">{items.map((item) => <div className="min-w-0 border-r border-line px-3 py-2 last:border-r-0" key={item.label}><div className="text-[9px] font-bold uppercase tracking-[0.1em] text-dim">{item.label}</div><div className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-fg">{item.value}</div>{item.counts ? <CountBreakdown counts={item.counts} /> : null}</div>)}</section>;
}

export function KnowledgeExplorer({ game }: { game?: string }) {
  const [summary, setSummary] = useState<KnowledgeSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubjectIdentity | null>(null);
  const [record, setRecord] = useState<KnowledgeRecordResponse | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [revealUnit, setRevealUnit] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    setSummary(null);
    setSummaryError(null);
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

  return <div className="flex min-h-0 flex-1 flex-col bg-background">
    {summary ? <SummaryStrip summary={summary} /> : summaryError ? <EmptyState className="m-3 shrink-0 text-left">Summary unavailable: {summaryError}</EmptyState> : <EmptyState className="m-3 shrink-0 text-left">Loading knowledge summary...</EmptyState>}
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,34%)_minmax(0,1fr)] overflow-hidden">
      <aside className="min-h-0 overflow-hidden border-r border-line bg-card" aria-label="Knowledge records"><KnowledgeTree game={game} onSelectSubject={selectSubject} revealUnit={revealUnit} selectedSubject={selected} /></aside>
      <main className="min-h-0 overflow-y-auto bg-background p-4"><KnowledgeRecordView error={recordError} loading={recordLoading} onSelectSubject={selectSubject} record={record} /></main>
    </div>
  </div>;
}
