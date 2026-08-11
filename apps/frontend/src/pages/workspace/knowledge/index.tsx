import { useEffect, useMemo, useState, type MouseEvent } from "react";

import { ChevronDown, ChevronRight, ExternalLink, ListTree, X } from "@/icons";
import {
  fetchKnowledgeLearningDetail,
  fetchKnowledgeLearnings,
  type KnowledgeLearning,
  type KnowledgeLearningDetail,
  type KnowledgeLearningEvidence,
} from "@/lib/api";
import type { FormState } from "@/lib/format";

const PAGE_SIZE = 100;
const MAX_LEARNINGS = 1000;
const EMPTY_COUNTS = {
  by_scope: {} as Record<string, number>,
  by_origin: {} as Record<string, number>,
  by_status: {} as Record<string, number>,
};

function prettyLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function subjectAnchor(learning: KnowledgeLearning): string {
  return learning.subject.symbol ?? learning.subject.file ?? learning.subject.area ?? "general";
}

function confidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

function detailElementId(id: string): string {
  return `knowledge-detail-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function wikiHref(evidence: KnowledgeLearningEvidence): string | null {
  const wikiType = evidence.type === "wiki_section" || evidence.type.toLowerCase().includes("wiki");
  if (!wikiType) return null;

  const fragmentIndex = evidence.ref.indexOf("#");
  const pageTitle = (fragmentIndex === -1 ? evidence.ref : evidence.ref.slice(0, fragmentIndex)).trim();
  const fragment = fragmentIndex === -1 ? "" : evidence.ref.slice(fragmentIndex + 1);
  if (!pageTitle || /[\\/]/.test(pageTitle) || /\.[a-z0-9]{1,8}$/i.test(pageTitle)) return null;

  const normalizedTitle = pageTitle.replace(/ /g, "_");
  const normalizedFragment = fragment ? `#${encodeURIComponent(fragment)}` : "";
  return `https://www.ssbwiki.com/${encodeURI(normalizedTitle)}${normalizedFragment}`;
}

function prHref(ref: string): string | null {
  const match = /^pr-(\d+)$/.exec(ref);
  return match ? `https://github.com/doldecomp/melee/pull/${match[1]}` : null;
}

function looksLikeCodeReference(ref: string): boolean {
  const value = ref.trim();
  return (
    /[\\/]/.test(value) ||
    /\.[a-z0-9]{1,8}(?::\d+)?(?:#.*)?$/i.test(value) ||
    /::/.test(value) ||
    /^[A-Za-z_][A-Za-z0-9_$]*(?:\([^)]*\))?$/.test(value) ||
    /^[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)+$/.test(value)
  );
}

function FacetGroup({
  counts,
  label,
  onSelect,
  selected,
}: {
  counts: Record<string, number>;
  label: string;
  onSelect: (value: string | null) => void;
  selected: string | null;
}) {
  const entries = Object.entries(counts).sort(([left], [right]) => left.localeCompare(right));

  return (
    <section>
      <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</h2>
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([value, count]) => {
          const active = selected === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(active ? null : value)}
              className={`rounded-[2px] border px-2 py-1 font-mono text-[10px] tracking-[0.04em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border ${
                active
                  ? "border-status-info-border bg-status-info-fill text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              {prettyLabel(value)} <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SubjectChip({ label, onClick }: { label: string; onClick: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="max-w-full rounded-[2px] border border-border bg-muted px-2 py-1 font-mono text-[10px] text-accent transition-colors hover:border-status-info-border hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
      title={`Filter by ${label}`}
    >
      <span className="block overflow-hidden text-ellipsis whitespace-nowrap">{label}</span>
    </button>
  );
}

function Badge({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "info" | "warning" | "success" | "destructive" }) {
  const toneClass =
    tone === "info"
      ? "border-status-info-border bg-status-info-fill text-status-info"
      : tone === "warning"
        ? "border-status-warning-border bg-status-warning-fill text-status-warning"
        : tone === "success"
          ? "border-status-success-border bg-status-success-fill text-status-success"
          : tone === "destructive"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : "border-status-neutral-border bg-status-neutral-fill text-status-neutral";
  return (
    <span className={`rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold uppercase ${toneClass}`}>
      {prettyLabel(children)}
    </span>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const normalized = status?.toLowerCase() ?? "";
  const tone = /accepted|approved|verified|complete|current|active/.test(normalized)
    ? "success"
    : /proposed|pending|review/.test(normalized)
      ? "warning"
      : /rejected|invalid|failed|deprecated/.test(normalized)
        ? "destructive"
        : "neutral";
  return <Badge tone={tone}>{status ?? "unspecified"}</Badge>;
}

function Confidence({ value }: { value: number }) {
  const percent = confidencePercent(value);
  return (
    <div className="w-full min-w-[96px]" role="progressbar" aria-label={`Confidence ${percent}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="mb-1 flex items-center justify-between gap-2 font-mono text-[10px] text-muted-foreground">
        <span>confidence</span>
        <span className="text-foreground">{percent}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function EvidenceReference({ evidence }: { evidence: KnowledgeLearningEvidence }) {
  const wikiUrl = wikiHref(evidence);
  const pullRequestUrl = prHref(evidence.ref);
  const sharedClass = "inline-flex max-w-full items-center gap-1.5 rounded-[2px] border px-2 py-1 font-mono text-[11px] [overflow-wrap:anywhere]";

  if (wikiUrl) {
    return (
      <a
        href={wikiUrl}
        target="_blank"
        rel="noreferrer"
        className={`${sharedClass} border-status-info-border bg-status-info-fill text-status-info hover:text-foreground`}
        aria-label={`${evidence.ref} on SmashWiki (opens in a new tab)`}
      >
        <span className="text-[9px] uppercase opacity-70">{evidence.type}</span>
        <span>{evidence.ref}</span>
        <ExternalLink size={11} />
      </a>
    );
  }

  if (pullRequestUrl) {
    return (
      <a
        href={pullRequestUrl}
        target="_blank"
        rel="noreferrer"
        className={`${sharedClass} border-border bg-muted text-accent hover:border-status-info-border hover:text-foreground`}
        aria-label={`${evidence.ref} on GitHub (opens in a new tab)`}
      >
        <span className="text-[9px] uppercase text-muted-foreground">{evidence.type}</span>
        <span>{evidence.ref}</span>
        <ExternalLink size={11} />
      </a>
    );
  }

  if (looksLikeCodeReference(evidence.ref)) {
    return (
      <code className={`${sharedClass} border-border bg-muted text-foreground`}>
        <span className="text-[9px] uppercase text-muted-foreground">{evidence.type}</span>
        {evidence.ref}
      </code>
    );
  }

  return (
    <span className={`${sharedClass} border-border/70 bg-background text-muted-foreground`}>
      {evidence.type}:{evidence.ref}
    </span>
  );
}

function LearningDetailPanel({ expanded, learning }: { expanded: boolean; learning: KnowledgeLearning }) {
  const [detail, setDetail] = useState<KnowledgeLearningDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    if (!expanded || detail) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextDetail = await fetchKnowledgeLearningDetail(learning.id);
        if (!cancelled) setDetail(nextDetail);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [detail, expanded, learning.id, retryNonce]);

  if (!expanded) return null;

  const current = detail?.learning ?? learning;
  const priorVersions = detail?.versions.slice(0, -1) ?? [];

  return (
    <div id={detailElementId(learning.id)} className="border-t border-border bg-background/60 px-4 py-4" onClick={(event) => event.stopPropagation()}>
      {loading && !detail ? (
        <span className="inline-flex rounded-[2px] border border-border px-2 py-1 text-xs text-muted-foreground">Loading detail</span>
      ) : null}

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          <span className="min-w-0 [overflow-wrap:anywhere]">{error}</span>
          <button
            type="button"
            onClick={() => setRetryNonce((currentNonce) => currentNonce + 1)}
            className="shrink-0 rounded-[2px] border border-destructive/40 px-2 py-1 font-mono text-[10px] uppercase hover:bg-destructive/10"
          >
            Retry
          </button>
        </div>
      ) : null}

      {detail ? (
        <div>
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground [overflow-wrap:anywhere]">{current.statement}</p>

          <dl className="mt-4 grid grid-cols-[92px_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-border pt-3 font-mono text-[11px]">
            <dt className="text-muted-foreground">produced by</dt>
            <dd className="text-foreground [overflow-wrap:anywhere]">{current.produced_by ?? "—"}</dd>
            <dt className="text-muted-foreground">created at</dt>
            <dd className="text-foreground [overflow-wrap:anywhere]">{current.created_at ?? "—"}</dd>
            <dt className="text-muted-foreground">id</dt>
            <dd className="text-foreground [overflow-wrap:anywhere]">{current.id}</dd>
          </dl>

          <section className="mt-5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Evidence</h3>
            {current.evidence.length ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {current.evidence.map((evidence, index) => (
                  <li key={`${evidence.type}:${evidence.ref}:${index}`} className="max-w-full">
                    <EvidenceReference evidence={evidence} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No evidence recorded.</p>
            )}
          </section>

          {priorVersions.length ? (
            <section className="mt-5">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Prior versions</h3>
              <div className="mt-2 grid gap-2">
                {priorVersions.map((version, index) => (
                  <article key={`${version.id}:${version.created_at ?? index}:${index}`} className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={version.status} />
                      <span className="font-mono text-[10px] text-muted-foreground">{confidencePercent(version.confidence)}% confidence</span>
                    </div>
                    <p className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">{version.statement}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function LearningRow({
  expanded,
  learning,
  onPinSubject,
  onToggle,
}: {
  expanded: boolean;
  learning: KnowledgeLearning;
  onPinSubject: (subject: string) => void;
  onToggle: (id: string) => void;
}) {
  const anchor = subjectAnchor(learning);
  const detailId = detailElementId(learning.id);

  return (
    <article
      className={`border-b border-border/70 transition-colors last:border-b-0 ${
        expanded ? "bg-status-info-fill/30 text-foreground" : "hover:bg-muted/35"
      }`}
      onClick={() => onToggle(learning.id)}
    >
      <div className="grid min-w-0 grid-cols-[24px_minmax(0,1fr)_minmax(140px,190px)] items-start gap-2 px-3 py-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailId}
          aria-label={`${expanded ? "Collapse" : "Expand"} learning ${learning.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(learning.id);
          }}
          className="mt-0.5 rounded-[2px] p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        <div className="min-w-0">
          <p className={`${expanded ? "" : "line-clamp-3"} text-[13px] leading-5 text-foreground [overflow-wrap:anywhere]`}>
            {learning.statement}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={learning.origin === "human_extracted" ? "info" : "warning"}>{learning.origin}</Badge>
            <Badge>{learning.subject.scope}</Badge>
            <StatusBadge status={learning.status} />
          </div>
        </div>

        <div className="grid min-w-0 justify-items-stretch gap-2">
          <SubjectChip
            label={anchor}
            onClick={(event) => {
              event.stopPropagation();
              onPinSubject(anchor);
            }}
          />
          <Confidence value={learning.confidence} />
        </div>
      </div>

      <LearningDetailPanel expanded={expanded} learning={learning} />
    </article>
  );
}

function LearningRows({
  expandedIds,
  learnings,
  onPinSubject,
  onToggle,
}: {
  expandedIds: Set<string>;
  learnings: KnowledgeLearning[];
  onPinSubject: (subject: string) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <>
      {learnings.map((learning) => (
        <LearningRow
          key={learning.id}
          learning={learning}
          expanded={expandedIds.has(learning.id)}
          onPinSubject={onPinSubject}
          onToggle={onToggle}
        />
      ))}
    </>
  );
}

export function KnowledgePage({ form }: { form: FormState }) {
  void form;
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof fetchKnowledgeLearnings>> | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [scope, setScope] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [groupBySubject, setGroupBySubject] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setLimit(PAGE_SIZE);
      setExpandedIds(new Set());
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextPayload = await fetchKnowledgeLearnings({
          q: debouncedSearch || undefined,
          scope: scope ?? undefined,
          origin: origin ?? undefined,
          status: status ?? undefined,
          subject: subject ?? undefined,
          limit,
        });
        if (!cancelled) setPayload(nextPayload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, limit, origin, scope, status, subject]);

  const learnings = useMemo(() => payload?.learnings ?? [], [payload]);
  const groups = useMemo(() => {
    const bySubject = new Map<string, KnowledgeLearning[]>();
    for (const learning of learnings) {
      const key = subjectAnchor(learning);
      const group = bySubject.get(key);
      if (group) group.push(learning);
      else bySubject.set(key, [learning]);
    }
    return [...bySubject.entries()]
      .map(([key, groupLearnings]) => ({ key, learnings: groupLearnings }))
      .sort((left, right) => right.learnings.length - left.learnings.length || left.key.localeCompare(right.key));
  }, [learnings]);

  const counts = payload?.counts ?? EMPTY_COUNTS;
  const total = payload?.total ?? 0;

  function updateFacet(setter: (value: string | null) => void, value: string | null) {
    setter(value);
    setLimit(PAGE_SIZE);
    setExpandedIds(new Set());
  }

  function pinSubject(nextSubject: string) {
    setSubject(nextSubject);
    setLimit(PAGE_SIZE);
    setExpandedIds(new Set());
  }

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="kernel-reference-workspace min-h-0 flex-1 overflow-auto bg-background p-4 font-sans text-foreground">
      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid h-[calc(100vh-2rem)] min-h-[620px] grid-cols-[260px_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card">
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-border">
          <header className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold leading-tight">Knowledge</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {total} {total === 1 ? "learning" : "learnings"}
                </p>
              </div>
              {loading ? (
                <span className="shrink-0 rounded-[2px] border border-border px-2 py-1 text-xs text-muted-foreground">
                  Loading
                </span>
              ) : null}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <label className="block">
              <span className="sr-only">Search learnings</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search learnings..."
                className="w-full font-mono text-xs placeholder:text-muted-foreground"
              />
            </label>

            <div className="mt-5 grid gap-5">
              <FacetGroup counts={counts.by_scope} label="Scope" selected={scope} onSelect={(value) => updateFacet(setScope, value)} />
              <FacetGroup counts={counts.by_origin} label="Origin" selected={origin} onSelect={(value) => updateFacet(setOrigin, value)} />
              <FacetGroup counts={counts.by_status} label="Status" selected={status} onSelect={(value) => updateFacet(setStatus, value)} />
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <button
                type="button"
                aria-pressed={groupBySubject}
                onClick={() => setGroupBySubject((grouped) => !grouped)}
                className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-1 font-mono text-[10px] tracking-[0.04em] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border ${
                  groupBySubject
                    ? "border-status-info-border bg-status-info-fill text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                <ListTree size={12} />
                Group by subject
              </button>

              {subject ? (
                <div className="mt-4">
                  <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Subject</h2>
                  <button
                    type="button"
                    onClick={() => updateFacet(setSubject, null)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-[2px] border border-status-info-border bg-status-info-fill px-2 py-1 font-mono text-[10px] text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-status-info-border"
                    aria-label={`Clear subject filter ${subject}`}
                    title="Clear subject filter"
                  >
                    <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{subject}</span>
                    <X size={11} />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <main className="min-h-0 min-w-0 overflow-y-auto bg-background">
          {!payload && loading ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Loading learnings...</div>
          ) : !payload && error ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">Knowledge is unavailable.</div>
          ) : learnings.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">No learnings match these filters.</div>
          ) : (
            <div className="p-4">
              {groupBySubject ? (
                <div className="grid gap-3">
                  {groups.map((group) => (
                    <section key={group.key} className="overflow-hidden rounded-lg border border-border bg-card">
                      <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/35 px-3 py-2">
                        <SubjectChip
                          label={group.key}
                          onClick={(event) => {
                            event.stopPropagation();
                            pinSubject(group.key);
                          }}
                        />
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {group.learnings.length} {group.learnings.length === 1 ? "learning" : "learnings"}
                        </span>
                      </header>
                      <LearningRows
                        learnings={group.learnings}
                        expandedIds={expandedIds}
                        onPinSubject={pinSubject}
                        onToggle={toggleExpanded}
                      />
                    </section>
                  ))}
                </div>
              ) : (
                <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label="Knowledge learnings">
                  <LearningRows learnings={learnings} expandedIds={expandedIds} onPinSubject={pinSubject} onToggle={toggleExpanded} />
                </section>
              )}

              {learnings.length < total ? (
                <div className="flex justify-center border-t border-border/70 pt-4 mt-4">
                  <button
                    type="button"
                    disabled={limit >= MAX_LEARNINGS || loading}
                    onClick={() => setLimit((current) => Math.min(MAX_LEARNINGS, current + PAGE_SIZE))}
                    className="rounded-[2px] border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    title={limit >= MAX_LEARNINGS ? "The API limit is 1,000 learnings" : undefined}
                  >
                    {loading ? "Loading..." : "Load more"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </main>
      </section>
    </div>
  );
}
