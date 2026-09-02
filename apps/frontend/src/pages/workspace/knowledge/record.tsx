import { EmptyState, PanelTitle } from "@/components/primitives";

import type { KnowledgeRecordResponse, SubjectIdentity } from "./api";

const FACT_ORDER = [
  "purpose",
  "inferred_name",
  "inferred_type",
  "data_flow",
  "state_behavior",
  "game_mapping",
] as const;

interface RecordViewProps {
  error?: string | null;
  loading?: boolean;
  onSelectSubject: (subject: SubjectIdentity) => void;
  record: KnowledgeRecordResponse | null;
}

function subjectLabel(subject: SubjectIdentity): string {
  return subject.subjectKind === "target"
    ? subject.stableKey
    : subject.locator;
}

function confidenceTone(confidence: number): string {
  if (confidence >= 0.9) {
    return "border-status-success-border bg-status-success-fill text-status-success";
  }
  if (confidence >= 0.7) {
    return "border-status-warning-border bg-status-warning-fill text-status-warning";
  }
  return "border-destructive/40 bg-destructive/10 text-destructive";
}

function statusNumber(status: Record<string, unknown> | null, key: string): number | null {
  const value = status?.[key];
  return typeof value === "number" ? value : null;
}

function statusBoolean(status: Record<string, unknown> | null, key: string): boolean | null {
  const value = status?.[key];
  return typeof value === "boolean" ? value : null;
}

function KindPill({ kind }: { kind: string }) {
  return (
    <span className="inline-flex border border-line2 bg-raised px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-dim">
      {kind.replaceAll("_", " ")}
    </span>
  );
}

function FactCard({ fact, type }: { fact: KnowledgeRecordResponse["facts"][string]; type: string }) {
  if (!fact) return null;
  const value = type === "inferred_name" ? `guess: ${fact.value}` : fact.value;

  return (
    <article className="border border-line bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">
          {type.replaceAll("_", " ")}
        </div>
        <span className={`shrink-0 border px-1.5 py-0.5 font-mono text-[10px] ${confidenceTone(fact.confidence)}`}>
          {Math.round(fact.confidence * 100)}%
        </span>
      </div>
      <div className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-5 text-fg">{value}</div>
      {fact.rationale ? <p className="m-0 mt-2 text-xs leading-5 text-dim">{fact.rationale}</p> : null}
      {fact.evidence.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Evidence">
          {fact.evidence.map((evidence) => (
            <button
              className="max-w-full border border-line bg-panel px-1.5 py-1 text-left text-[10px] text-soft hover:border-line2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-up"
              key={evidence.id}
              onClick={() => { void navigator.clipboard?.writeText(evidence.locator); }}
              title={`${evidence.why}\nClick to copy locator`}
              type="button"
            >
              <span className="font-bold uppercase text-dim">{evidence.kind}</span>{" "}
              <span className="break-all font-mono">{evidence.locator}</span>
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function LinkSection({
  direction,
  links,
  onSelectSubject,
}: {
  direction: "incoming" | "outgoing";
  links: KnowledgeRecordResponse["links"];
  onSelectSubject: (subject: SubjectIdentity) => void;
}) {
  const visible = links.filter((link) => link.direction === direction);
  return (
    <section>
      <PanelTitle>{direction}</PanelTitle>
      {visible.length === 0 ? (
        <EmptyState className="py-3 text-xs">No {direction} links.</EmptyState>
      ) : (
        <div className="grid gap-1.5">
          {visible.map((link) => (
            <button
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border border-line bg-card p-2.5 text-left hover:border-line2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-up"
              key={link.id}
              onClick={() => onSelectSubject(link.other)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block break-all text-xs font-semibold text-fg">{subjectLabel(link.other)}</span>
                {link.why ? <span className="mt-1 block text-[11px] leading-4 text-dim">{link.why}</span> : null}
              </span>
              <span className="flex flex-col items-end gap-1">
                <KindPill kind={link.role} />
                <span className="text-[9px] uppercase tracking-[0.08em] text-dim">{link.other.kind}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Ledger({ ledger }: { ledger: KnowledgeRecordResponse["ledger"] }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <PanelTitle className="mb-0">Ledger</PanelTitle>
        <span className="text-[10px] uppercase tracking-[0.08em] text-dim">{ledger.total_count} total</span>
      </div>
      {ledger.entries.length === 0 ? (
        <EmptyState className="py-3 text-xs">No ledger entries for this record.</EmptyState>
      ) : (
        <div className="grid gap-1.5">
          {ledger.entries.map((entry) => (
            <article className="border border-line bg-card p-2.5" key={`${entry.type}:${entry.id}`}>
              <div className="flex items-center justify-between gap-2">
                <KindPill kind={entry.type} />
                <time className="text-[10px] text-dim" dateTime={entry.timestamp}>{entry.timestamp}</time>
              </div>
              {entry.type === "pull_request" ? (
                <div className="mt-2 text-xs text-soft"><span className="font-mono text-fg">{entry.prRef}</span> · {entry.summary}</div>
              ) : entry.type === "submission" ? (
                <div className="mt-2 text-xs text-soft">
                  <span className="font-mono text-fg">Score {entry.score}</span> · {entry.description}
                </div>
              ) : (
                <div className="mt-2 text-xs text-soft">{entry.summary}</div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function KnowledgeRecordView({ error, loading = false, onSelectSubject, record }: RecordViewProps) {
  if (loading) return <EmptyState className="m-4">Loading knowledge record…</EmptyState>;
  if (error) return <EmptyState className="m-4 text-down">Could not load record: {error}</EmptyState>;
  if (!record?.subject) return <EmptyState className="m-4">Select a unit, target, concept, or pattern.</EmptyState>;

  const { subject, target_status: targetStatus } = record;
  const matchPct = statusNumber(targetStatus, "match_pct");
  const linked = statusBoolean(targetStatus, "linked");
  return (
    <div className="min-w-0 overflow-y-auto p-4">
      <header className="border border-line bg-panel p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="break-all font-mono text-sm font-semibold text-fg">{subjectLabel(subject)}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <KindPill kind={subject.kind} />
              {matchPct != null ? <span className="text-[11px] text-soft">{matchPct.toFixed(2)}% match</span> : null}
              {linked != null ? <span className="text-[11px] text-soft">{linked ? "linked" : "not linked"}</span> : null}
            </div>
          </div>
          {record.indexed_at ? <time className="shrink-0 text-[10px] text-dim" dateTime={record.indexed_at}>Indexed {record.indexed_at}</time> : null}
        </div>
      </header>

      <section className="mt-4">
        <PanelTitle>Facts</PanelTitle>
        <div className="grid gap-2">
          {FACT_ORDER.map((type) => <FactCard fact={record.facts[type]} key={type} type={type} />)}
          {FACT_ORDER.every((type) => !record.facts[type]) ? <EmptyState>No facts recorded for this subject.</EmptyState> : null}
        </div>
      </section>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <LinkSection direction="outgoing" links={record.links} onSelectSubject={onSelectSubject} />
        <LinkSection direction="incoming" links={record.links} onSelectSubject={onSelectSubject} />
      </div>

      <div className="mt-4"><Ledger ledger={record.ledger} /></div>
    </div>
  );
}
