import { asArray, asObject, delta, duration, durationBetween, num, pct, scoreOrPercent, scorePairLooksPercent, signedWhole, text, until } from "../lib/format";
import type { Dashboard, JsonObject } from "../types";
import { Button, StackCell } from "./primitives";

const pageSize = 10;

function trustedReport(dashboard: Dashboard | null): JsonObject {
  return asObject(dashboard?.trustedReport);
}

function trustedCounts(dashboard: Dashboard | null): JsonObject {
  return asObject(trustedReport(dashboard).counts);
}

function trustedReady(dashboard: Dashboard | null): boolean {
  return trustedReport(dashboard).status === "ready";
}

function workerImprovementRows(dashboard: Dashboard | null): JsonObject[] {
  return (dashboard?.improvements || []).map(asObject);
}

function workerScore(row: JsonObject, key: "oldScore" | "newScore"): string {
  return scoreOrPercent(row[key], scorePairLooksPercent(row.oldScore, row.newScore, row.totalDelta));
}

function isWorkerMatch(row: JsonObject): boolean {
  return Number(row.exactMatches || 0) > 0;
}

function reportRows(dashboard: Dashboard | null, kind: "matches" | "improvements"): JsonObject[] {
  const report = trustedReport(dashboard);
  if (trustedReady(dashboard)) return asArray(kind === "matches" ? report.newMatches : report.improvements).map(asObject);
  return workerImprovementRows(dashboard)
    .filter((row) => kind === "matches" ? isWorkerMatch(row) : !isWorkerMatch(row))
    .map((row) => ({
      ...row,
      unitName: text(row.sourcePath) || text(row.unit),
      itemName: text(row.symbol, "-"),
      scoreLabel: workerScore(row, "newScore"),
      deltaLabel: `${delta(row.totalDelta)} pp`,
      deltaTitle: `${workerScore(row, "oldScore")} -> ${workerScore(row, "newScore")} (${delta(row.totalDelta)} percentage points)`,
      source: "worker_report",
    }));
}

function reportCounts(dashboard: Dashboard | null): JsonObject {
  if (trustedReady(dashboard)) return trustedCounts(dashboard);
  const rows = workerImprovementRows(dashboard);
  return {
    newMatches: rows.filter(isWorkerMatch).length,
    improvements: rows.filter((row) => !isWorkerMatch(row)).length,
  };
}

function reportSourceLabel(dashboard: Dashboard | null): string {
  return trustedReady(dashboard) ? "report bytes" : "worker % scores";
}

function deltaColumnLabel(dashboard: Dashboard | null): string {
  return trustedReady(dashboard) ? "Bytes +/-" : "Score +/-";
}

function deltaColumnTitle(dashboard: Dashboard | null): string {
  return trustedReady(dashboard)
    ? "Byte movement from report_changes.json"
    : "Worker score movement in percentage points";
}

function improvedEmptyText(dashboard: Dashboard | null, mode: ImprovedMode): string {
  const report = trustedReport(dashboard);
  if (!trustedReady(dashboard) && workerImprovementRows(dashboard).length > 0) {
    return mode === "improvements" ? "No non-matching score gains yet" : "No matching score gains yet";
  }
  if (report.status === "stale") return text(report.staleReason, "Report is stale for this run");
  if (report.status === "parse_error") return text(report.error, "Could not parse report_changes.json");
  if (!trustedReady(dashboard)) return "No report_changes.json or worker score gains yet";
  return mode === "improvements" ? "No non-matches during this run" : "No matches during this run";
}

function elapsedSince(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return duration(Date.now() - date.getTime());
}

function activeRuntime(startValue: unknown, ttlValue: unknown) {
  const elapsed = elapsedSince(startValue);
  const remaining = until(ttlValue);
  const max = durationBetween(startValue, ttlValue);
  let secondary = "timeout unknown";
  if (remaining !== "expired" && remaining !== "-") secondary = `${remaining} left`;
  else if (remaining === "expired") secondary = "expired";
  else if (max !== "-") secondary = "timeout set";
  return {
    primary: elapsed,
    secondary,
    title: `Elapsed: ${elapsed}; Remaining: ${secondary}; Timeout: ${max}`,
  };
}

export type ImprovedMode = "matches" | "improvements";
export type WorkMode = "active" | "queue";

interface WorkTablesProps {
  dashboard: Dashboard | null;
  improvedMode: ImprovedMode;
  improvedPage: number;
  setImprovedMode: (mode: ImprovedMode) => void;
  setImprovedPage: (page: number | ((page: number) => number)) => void;
  setWorkMode: (mode: WorkMode) => void;
  workMode: WorkMode;
}

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={`min-h-7 rounded-[5px] border px-2 py-1 ${active ? "border-[#2a7d38] bg-[#152018] text-[#45e05e]" : "border-[#292d2b] bg-[#171918] text-[#969b97]"}`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}

function rowPath(entry: JsonObject): string {
  return text(entry.unitName) || text(entry.sourcePath) || text(entry.unit, "-");
}

function rowItem(entry: JsonObject): string {
  const exactMatches = Number(entry.exactMatches || 0);
  const suffix = text(entry.source) === "worker_report" && exactMatches > 1 ? ` (${num(exactMatches)} exact)` : "";
  return `${text(entry.itemName) || text(entry.symbol, "-")}${suffix}`;
}

function rowScore(entry: JsonObject): string {
  return text(entry.scoreLabel) || pct(entry.toPercent);
}

function rowDelta(entry: JsonObject): string {
  return text(entry.deltaLabel) || `${signedWhole(entry.bytesDelta)}b`;
}

function rowDeltaTitle(entry: JsonObject): string {
  return text(entry.deltaTitle) || `${pct(entry.fromPercent)} -> ${pct(entry.toPercent)}`;
}

function ImprovedTable({ dashboard, mode, page, setMode, setPage }: Pick<WorkTablesProps, "dashboard" | "improvedMode" | "improvedPage" | "setImprovedMode" | "setImprovedPage"> & { mode: ImprovedMode; page: number; setMode: (mode: ImprovedMode) => void; setPage: WorkTablesProps["setImprovedPage"] }) {
  const counts = reportCounts(dashboard);
  const rows = reportRows(dashboard, mode);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const sourceLabel = reportSourceLabel(dashboard);

  return (
    <section className="h-full border-b border-[#292d2b] p-3 min-[1180px]:border-r min-[1180px]:border-b-0">
      <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Run matches and improvements">
          <TabButton active={mode === "matches"} onClick={() => { setMode("matches"); setPage(0); }}>
            Matches ({num(counts.newMatches)})
          </TabButton>
          <TabButton active={mode === "improvements"} onClick={() => { setMode("improvements"); setPage(0); }}>
            Non-matches ({num(counts.improvements)})
          </TabButton>
        </div>
        <div className="flex min-h-7 items-center gap-2">
          <span className="hidden max-w-36 overflow-hidden text-ellipsis whitespace-nowrap text-[#737873] min-[780px]:inline" title={sourceLabel}>{sourceLabel}</span>
          <Button className="min-w-12 px-2 py-0.5" disabled={safePage === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} type="button">
            Prev
          </Button>
          <span className="min-w-12 text-center leading-7 text-[#969b97]">{safePage + 1}/{pages}</span>
          <Button className="min-w-12 px-2 py-0.5" disabled={safePage >= pages - 1 || rows.length === 0} onClick={() => setPage((current) => current + 1)} type="button">
            Next
          </Button>
        </div>
      </div>
      <div className="overflow-auto rounded-md border border-[#292d2b]">
        <table>
          <thead>
            <tr>
              <th>Path</th>
              <th className="w-[210px] text-left">Item</th>
              <th className="w-24 text-right">Score</th>
              <th className="w-24 text-right" title={deltaColumnTitle(dashboard)}>{deltaColumnLabel(dashboard)}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry, index) => (
              <tr key={`${rowPath(entry)}-${rowItem(entry)}-${index}`}>
                <td className="text-[#b5d4e8]" title={rowPath(entry)}>{rowPath(entry)}</td>
                <td title={rowItem(entry)}>{rowItem(entry)}</td>
                <td className="text-right">{rowScore(entry)}</td>
                <td className="text-right" title={rowDeltaTitle(entry)}>{rowDelta(entry)}</td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td className="text-[#969b97]" colSpan={4}>{improvedEmptyText(dashboard, mode)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ActiveRows({ rows }: { rows: JsonObject[] }) {
  return (
    <>
      {rows.slice(0, 24).map((file) => {
        const timing = activeRuntime(file.leasedAt || file.heartbeatAt, file.ttl);
        return (
          <tr key={`${text(file.leaseId)}-${text(file.symbol)}`}>
            <td title={text(file.sourcePath) || text(file.unit) || text(file.symbol)}>
              <StackCell primary={text(file.symbol, "-")} secondary={text(file.sourcePath) || text(file.unit)} />
            </td>
            <td className="w-[92px] text-right">{pct(file.fuzzy)}</td>
            <td className="w-32 text-right" title={timing.title}>
              <StackCell primary={timing.primary} secondary={timing.secondary} />
            </td>
          </tr>
        );
      })}
    </>
  );
}

function QueueRows({ rows }: { rows: JsonObject[] }) {
  return (
    <>
      {rows.slice(0, 24).map((file) => (
        <tr key={`${text(file.queueId)}-${text(file.symbol)}`}>
          <td title={text(file.sourcePath) || text(file.unit) || text(file.symbol)}>
            <StackCell primary={text(file.symbol, "-")} secondary={text(file.sourcePath) || text(file.unit)} />
          </td>
          <td className="w-[92px] text-right">{pct(file.fuzzy)}</td>
          <td className="w-32 text-right" title={text(file.reason) || text(file.targetStatus) || text(file.queueStatus)}>
            <StackCell primary={text(file.targetStatus) || text(file.queueStatus, "-")} secondary={`priority ${num(file.priority)}`} />
          </td>
        </tr>
      ))}
    </>
  );
}

function WorkStatusTable({ dashboard, mode, setMode }: { dashboard: Dashboard | null; mode: WorkMode; setMode: (mode: WorkMode) => void }) {
  const activeFiles = dashboard?.activeFiles || [];
  const queueFiles = (dashboard?.queueTargets || []).filter((target) => target.queueStatus === "queued");
  const rows = mode === "queue" ? queueFiles : activeFiles;
  const emptyText = mode === "queue" ? "No queued files right now" : "No active leases right now";

  return (
    <section className="h-full p-3">
      <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Work status">
          <TabButton active={mode === "active"} onClick={() => setMode("active")}>Active</TabButton>
          <TabButton active={mode === "queue"} onClick={() => setMode("queue")}>Queue</TabButton>
        </div>
        <div className="text-[#969b97]">{mode === "queue" ? `${queueFiles.length} queued` : `${activeFiles.length} active`}</div>
      </div>
      <div className="overflow-auto rounded-md border border-[#292d2b]">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th className="w-[92px] text-right">Fuzzy</th>
              <th className="w-32 text-right" title={mode === "queue" ? "Queue target status. The second line shows queue priority." : "Elapsed worker lease time. The second line shows time left before timeout."}>
                {mode === "queue" ? "Status" : "Elapsed"}
              </th>
            </tr>
          </thead>
          <tbody>
            {mode === "queue" ? <QueueRows rows={rows} /> : <ActiveRows rows={rows} />}
            {rows.length === 0 ? (
              <tr>
                <td className="text-[#969b97]" colSpan={3}>{emptyText}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function WorkTables(props: WorkTablesProps) {
  return (
    <div className="grid items-start border-b border-[#292d2b] min-[1180px]:grid-cols-[minmax(560px,1.35fr)_minmax(340px,0.9fr)]">
      <ImprovedTable
        dashboard={props.dashboard}
        improvedMode={props.improvedMode}
        improvedPage={props.improvedPage}
        mode={props.improvedMode}
        page={props.improvedPage}
        setImprovedMode={props.setImprovedMode}
        setImprovedPage={props.setImprovedPage}
        setMode={props.setImprovedMode}
        setPage={props.setImprovedPage}
      />
      <WorkStatusTable dashboard={props.dashboard} mode={props.workMode} setMode={props.setWorkMode} />
    </div>
  );
}
