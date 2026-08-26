import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/primitives";
import { MetaItem } from "@/components/details-rail/_components/worker-reports/shared";
import { activeWorkerClaims, mergeActiveWorkerState, workerStateKey } from "@/components/details-rail/_components/worker-reports";
import { ALL_EPOCHS, CURRENT_EPOCH, currentEpochId, epochOptionsFor, reportsForEpoch } from "@/components/details-rail/_components/worker-reports/epoch-selector";
import { reportBorderClass, reportCountsForReports, reportFinishLabel, reportOutcome, reportOutcomeDescription, reportScoreDelta, visibleReportFilters, type WorkerStateFilter } from "@/components/details-rail/_lib/worker-reports";
import { ChevronLeft, ChevronRight, RefreshCw, X } from "@/icons";
import { fetchKernelStatus, fetchKernelTraceSessionDetail, fetchKernelTraceSessions } from "@/lib/api";
import { ago, asArray, asObject, delta, num, numberValue, shortId, text, type Dashboard, type JsonObject, type RunDetails } from "@/lib/format";
import type { CyclesPageProps } from "@/pages/workspace/cycles/_lib/types";
import { AttemptInspector } from "@/pages/workspace/cycles/active/details/attempt";
import type { CycleFocus } from "@/routing";

type SelectedAgent = { kind: "worker" | "session"; id: string } | null;
type TraceSession = Awaited<ReturnType<typeof fetchKernelTraceSessions>>["trace_sessions"][number];

function loadedWorkerStates(dashboard: Dashboard | null, runDetails: RunDetails | null) {
  const recent = (dashboard?.workerStates ?? []).map(asObject);
  const full = asArray(runDetails?.workerStates).map(asObject);
  return { loadedAll: full.length > 0, workerStates: full.length > 0 ? full : recent };
}

function targetTitle(report: JsonObject) {
  const target = asObject(report.target);
  return {
    sourcePath: text(report.sourcePath, text(target.sourcePath, text(report.unit, text(target.unit)))),
    symbol: text(report.symbol, text(target.symbol, "worker state")),
  };
}

function AttemptRow({ active, onSelect, report, selected }: { active?: boolean; onSelect: (id: string) => void; report: JsonObject; selected: boolean }) {
  const id = workerStateKey(report);
  const target = targetTitle(report);
  const fuzzy = numberValue(report.fuzzy ?? asObject(report.target).fuzzy, NaN);
  const outcome = active ? "running" : reportFinishLabel(report);
  return (
    <button aria-pressed={selected} className={`grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 border border-l-[3px] border-line ${active ? "border-l-up" : reportBorderClass(report)} ${selected ? "bg-raised" : "bg-card hover:bg-raised"} px-2 py-1.5 text-left disabled:cursor-default`} disabled={!id} onClick={() => id && onSelect(id)} title={id ? "Inspect agent" : "Worker state id unavailable"} type="button">
      <span className="min-w-0"><span className="block truncate text-[11px] font-semibold text-fg">{target.symbol}</span><span className="block truncate text-[10px] text-path">{target.sourcePath || "-"}</span></span>
      <span className="grid justify-items-end gap-0.5 text-[10px] text-dim"><span className={active ? "text-up" : "text-soft"} title={active ? "Active worker state" : reportOutcomeDescription(report)}>{outcome}</span><span className={!active && reportScoreDelta(report) > 0 ? "text-up" : "text-dim"}>{active ? (Number.isFinite(fuzzy) ? `${fuzzy.toFixed(3)}%` : "-") : delta(reportScoreDelta(report))}</span><span>{ago(active ? report.heartbeatAt ?? report.claimedAt : report.createdAt)}</span></span>
    </button>
  );
}

function EpochWorkers({ dashboard, loadRunDetails, loadingRunDetails, onSelect, onSelectEpoch, query, runDetails, selected }: Pick<CyclesPageProps, "dashboard" | "loadRunDetails" | "loadingRunDetails" | "runDetails"> & { onSelect: (id: string) => void; onSelectEpoch: (id: string) => void; query: string; selected: SelectedAgent }) {
  const [selectedEpoch, setSelectedEpoch] = useState(CURRENT_EPOCH);
  const [outcomeFilter, setOutcomeFilter] = useState<WorkerStateFilter>("all");
  const { loadedAll, workerStates } = loadedWorkerStates(dashboard, runDetails);
  const claims = activeWorkerClaims(dashboard, runDetails);
  const activeIds = new Set(claims.map((claim) => text(claim.workerStateId)).filter(Boolean));
  const statesById = new Map(workerStates.map((state) => [workerStateKey(state), state]));
  const activeReports = claims.map((claim) => mergeActiveWorkerState(claim, statesById.get(text(claim.workerStateId)) ?? null));
  const completed = workerStates.filter((state) => !activeIds.has(workerStateKey(state)));
  const allReports = [...activeReports, ...completed];
  const counts = reportCountsForReports(allReports);
  const filters = visibleReportFilters(counts, outcomeFilter);
  const normalized = query.trim().toLowerCase();
  const searched = allReports.filter((report) => {
    const target = targetTitle(report);
    return !normalized || [target.symbol, target.sourcePath, workerStateKey(report), reportFinishLabel(report)].some((value) => value.toLowerCase().includes(normalized));
  }).filter((report) => outcomeFilter === "all" || (activeIds.has(workerStateKey(report)) ? outcomeFilter === "running" : reportOutcome(report) === outcomeFilter));
  const knownEpochs = [...asArray(dashboard?.epochTargets).map(asObject), ...asArray(runDetails?.epochTargets).map(asObject)];
  const options = epochOptionsFor(allReports, knownEpochs);
  const currentId = currentEpochId(options);
  const safeEpoch = selectedEpoch === CURRENT_EPOCH ? currentId : selectedEpoch === ALL_EPOCHS || options.some((option) => option.id === selectedEpoch) ? selectedEpoch : currentId;
  const epochs = options.filter((option) => option.id !== ALL_EPOCHS);
  const selectedIndex = Math.max(0, epochs.findIndex((option) => option.id === safeEpoch));
  const selectedOption = safeEpoch === ALL_EPOCHS ? options.find((option) => option.id === ALL_EPOCHS) : epochs[selectedIndex];
  const visible = reportsForEpoch(searched, safeEpoch);
  const older = safeEpoch !== ALL_EPOCHS ? epochs[selectedIndex + 1] : undefined;
  const newer = safeEpoch !== ALL_EPOCHS ? epochs[selectedIndex - 1] : undefined;
  function selectEpoch(id: string) { setSelectedEpoch(id); if (id !== ALL_EPOCHS && !loadedAll && !loadingRunDetails) loadRunDetails(); }

  return <section className="grid gap-2"><div className="flex items-center justify-between gap-2"><h3 className="m-0 text-[10px] font-bold uppercase tracking-[0.12em] text-soft">Epoch workers</h3><Button className="min-h-6 px-2 py-0.5" disabled={loadingRunDetails} icon={<RefreshCw size={13} />} onClick={loadRunDetails} type="button">{loadingRunDetails ? "Loading" : loadedAll ? "Refresh All" : "Load All"}</Button></div>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><select aria-label="Worker outcome" className="min-w-0 border border-line bg-card px-2 py-1 font-mono text-[10px] text-soft" onChange={(event) => setOutcomeFilter(event.target.value as WorkerStateFilter)} value={outcomeFilter}>{filters.map((filter) => <option key={filter.id} value={filter.id}>{filter.label} · {counts[filter.id]}</option>)}</select><button aria-pressed={safeEpoch === ALL_EPOCHS} className="border border-line bg-card px-2 text-[10px] text-dim hover:bg-raised" onClick={() => selectEpoch(ALL_EPOCHS)} type="button">All</button></div>
    <div className="grid grid-cols-[28px_minmax(0,1fr)_28px] items-center gap-1.5 border border-line bg-card p-1.5"><button className="inline-flex h-7 w-7 items-center justify-center border border-line text-dim disabled:opacity-40" disabled={!older} onClick={() => older && selectEpoch(older.id)} title="Previous epoch" type="button"><ChevronLeft size={13} /></button><button className="truncate text-[11px] text-soft hover:text-fg disabled:cursor-default" disabled={safeEpoch === ALL_EPOCHS || !selectedOption} onClick={() => selectedOption && selectedOption.id !== ALL_EPOCHS && onSelectEpoch(selectedOption.id)} type="button">{safeEpoch === ALL_EPOCHS ? "All epochs" : selectedOption?.label ?? "No epochs"} · {num(selectedOption?.count)} states{safeEpoch !== ALL_EPOCHS && selectedOption?.id === currentId ? <span className="ml-1 text-up">current</span> : null}</button><button className="inline-flex h-7 w-7 items-center justify-center border border-line text-dim disabled:opacity-40" disabled={!newer} onClick={() => newer && selectEpoch(newer.id)} title="Next epoch" type="button"><ChevronRight size={13} /></button></div>
    <div className="grid gap-1.5">{visible.map((report) => <AttemptRow active={activeIds.has(workerStateKey(report))} key={workerStateKey(report) || text(report.claimId)} onSelect={onSelect} report={report} selected={selected?.kind === "worker" && selected.id === workerStateKey(report)} />)}{visible.length === 0 ? <div className="border border-dashed border-line2 bg-card p-3 text-xs text-dim">No matching worker states.</div> : null}</div></section>;
}

function SessionDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchKernelTraceSessionDetail>> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { let cancelled = false; setDetail(null); setError(""); fetchKernelTraceSessionDetail(id).then((value) => { if (!cancelled) setDetail(value); }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)); }); return () => { cancelled = true; }; }, [id]);
  if (error) return <div className="border border-warn/40 bg-card p-3 text-xs text-warn">Session detail unavailable: {error}</div>;
  if (!detail) return <div className="text-xs text-dim">Loading session detail...</div>;
  const root = asObject(detail);
  const session = asObject(root.trace_session ?? root.traceSession ?? root.session);
  const meta = Object.keys(session).length ? session : root;
  const piSessions = asArray(root.pi_sessions ?? root.piSessions).map(asObject);
  return <div className="grid gap-4"><article className="border border-line bg-card p-4"><h3 className="mb-3 text-sm font-bold text-fg">{text(meta.label, text(meta.kind, "Kernel session"))}</h3><div className="grid grid-cols-2 gap-x-5 gap-y-2 border border-line bg-inset p-3 text-xs @[900px]:grid-cols-4"><MetaItem label="id" value={text(meta.id, id)} /><MetaItem label="kind" value={text(meta.kind, "-")} /><MetaItem label="status" value={text(meta.status, "-")} /><MetaItem label="phase" value={text(meta.phase, "-")} /><MetaItem label="topic" value={text(meta.topic, "-")} /><MetaItem label="created" value={ago(meta.createdAt ?? meta.created_at)} /><MetaItem label="updated" value={ago(meta.updatedAt ?? meta.updated_at)} /><MetaItem label="events" value={num(meta.eventCount ?? root.eventCount ?? asArray(root.events).length)} /><MetaItem label="pi sessions" value={num(meta.piSessionCount ?? piSessions.length)} /></div>{piSessions.length ? <div className="mt-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-dim">Pi sessions</div><div className="grid gap-1.5">{piSessions.map((item) => <div className="flex justify-between border border-line bg-inset px-2.5 py-2 text-[11px]" key={text(item.id)}><span className="text-soft">{shortId(item.id)}</span><span className="text-dim">{num(item.eventCount ?? item.event_count)} events</span></div>)}</div></div> : null}</article><p className="m-0 text-[10px] text-dim">Full event stream lives on the Trace page.</p></div>;
}

export function CycleAgentsBrowser(props: Pick<CyclesPageProps, "dashboard" | "form" | "loadRunDetails" | "loadingRunDetails" | "nav" | "runDetails" | "view"> & { cycleFocus: CycleFocus; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedAgent>(null);
  const [sessions, setSessions] = useState<TraceSession[]>([]);
  const [kernelUnavailable, setKernelUnavailable] = useState(false);
  const [loadingKernelSessions, setLoadingKernelSessions] = useState(true);
  useEffect(() => { let cancelled = false; (async () => { try { const status = await fetchKernelStatus(); if (!status.enabled) { if (!cancelled) setKernelUnavailable(true); return; } const response = await fetchKernelTraceSessions(); if (!cancelled) setSessions(response.trace_sessions); } catch { if (!cancelled) setKernelUnavailable(true); } finally { if (!cancelled) setLoadingKernelSessions(false); } })(); return () => { cancelled = true; }; }, []);
  const normalized = query.trim().toLowerCase();
  const visibleSessions = useMemo(() => sessions.filter((session) => !normalized || [session.label, session.kind, session.topic, session.id, session.status].some((value) => String(value ?? "").toLowerCase().includes(normalized))), [normalized, sessions]);
  return <div className="grid gap-4"><div className="flex gap-2"><input aria-label="Search agents" className="min-w-0 flex-1 border border-line bg-card px-3 py-2 font-mono text-[11px] text-fg placeholder:text-dim" onChange={(event) => setQuery(event.target.value)} placeholder="Search agents - symbol, path, id, outcome" value={query} /><Button icon={<X size={13} />} onClick={props.onClose} type="button">Close</Button></div><div className="grid min-h-0 grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-4 max-[780px]:grid-cols-1"><aside className="grid content-start gap-5 border border-line bg-panel p-3"><EpochWorkers {...props} onSelect={(id) => setSelected({ kind: "worker", id })} onSelectEpoch={(id) => props.nav.goToCycle(props.cycleFocus, "run", { kind: "epoch", id })} query={query} selected={selected} /><section className="grid gap-2"><h3 className="m-0 text-[10px] font-bold uppercase tracking-[0.12em] text-soft">Kernel sessions</h3>{kernelUnavailable ? <div className="text-[11px] text-dim">Kernel trace unavailable</div> : loadingKernelSessions ? <div className="text-[11px] text-dim">Loading sessions...</div> : sessions.length === 0 ? <div className="text-[11px] text-dim">No kernel sessions recorded.</div> : visibleSessions.length === 0 ? <div className="text-[11px] text-dim">No matching sessions.</div> : visibleSessions.map((session) => <button aria-pressed={selected?.kind === "session" && selected.id === session.id} className={`grid gap-1 border border-line p-2 text-left ${selected?.kind === "session" && selected.id === session.id ? "bg-raised" : "bg-card hover:bg-raised"}`} key={session.id} onClick={() => setSelected({ kind: "session", id: session.id })} type="button"><span className="truncate text-[11px] font-semibold text-fg">{session.label || session.kind}</span><span className="flex items-center justify-between gap-2 text-[10px] text-dim"><span className="truncate">{session.kind} · <span className="status-tag px-1 py-0">{session.status}</span></span><span>{num(session.eventCount)} events · {ago(session.latestEventAt)}</span></span></button>)}</section></aside><main className="min-w-0">{selected?.kind === "worker" ? <AttemptInspector dashboard={props.dashboard} form={props.form} loadRunDetails={props.loadRunDetails} loadingRunDetails={props.loadingRunDetails} runDetails={props.runDetails} workerStateId={selected.id} /> : selected?.kind === "session" ? <SessionDetail id={selected.id} /> : <div className="grid min-h-48 place-items-center border border-dashed border-line2 bg-card text-sm text-dim">Select an agent</div>}</main></div></div>;
}
