import { useState } from "react";
import { Button } from "@/components/primitives";
import { ActiveRows } from "./active-rows";
import { PlaceholderRows } from "./placeholder-rows";
import { EpochRows } from "./queue-rows";
import { TabButton } from "./tab-button";
import { activeWorkPageSize, epochWorkPageSize } from "../_lib/constants";
import type { WorkMode } from "../_lib/types";
import { num, type Dashboard } from "@/lib/format";

export function WorkStatusTable({ dashboard, mode, setMode }: { dashboard: Dashboard | null; mode: WorkMode; setMode: (mode: WorkMode) => void }) {
  const [page, setPage] = useState(0);
  const activeFiles = dashboard?.activeFiles || [];
  const epochFiles = (dashboard?.epochTargets || []).filter((target) => target.epochStatus === "active" && target.epochTargetStatus === "admitted");
  const activeMode = mode === "active";
  const pageSize = activeMode ? activeWorkPageSize : epochWorkPageSize;
  const allRows = mode === "epoch" ? epochFiles : activeFiles;
  const pages = Math.max(1, Math.ceil(allRows.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const rows = allRows.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const emptyText = mode === "epoch" ? "No admitted epoch targets right now" : "No active claims right now";
  const columns = activeMode ? 4 : 3;
  const placeholderCount = pageSize - rows.length - (rows.length === 0 ? 1 : 0);

  function selectMode(nextMode: WorkMode) {
    setMode(nextMode);
    setPage(0);
  }

  return (
    <section className="h-full p-3">
      <div className="mb-2 grid min-h-7 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <h2 className="min-w-0 truncate text-[13px] font-semibold uppercase tracking-[0.08em] text-soft">
          Current Epoch
        </h2>
        <div className="flex min-h-7 items-center gap-2">
          <Button className="min-w-12 px-2 py-0.5" disabled={safePage === 0} onClick={() => setPage(Math.max(0, safePage - 1))} type="button">
            Prev
          </Button>
          <span className="min-w-12 text-center leading-7 text-dim">{safePage + 1}/{pages}</span>
          <Button className="min-w-12 px-2 py-0.5" disabled={safePage >= pages - 1 || allRows.length === 0} onClick={() => setPage(safePage + 1)} type="button">
            Next
          </Button>
        </div>
      </div>
      <div className="overflow-hidden border border-line bg-inset">
        <div className="grid min-h-9 grid-cols-2 border-b border-line bg-inset" role="tablist" aria-label="Current epoch work status">
          <TabButton active={mode === "active"} className="flex w-full min-w-0 items-center justify-center border-0 border-r border-line" onClick={() => selectMode("active")}>
            Active ({num(activeFiles.length)})
          </TabButton>
          <TabButton active={mode === "epoch"} className="flex w-full min-w-0 items-center justify-center border-0" onClick={() => selectMode("epoch")}>
            Queue ({num(epochFiles.length)})
          </TabButton>
        </div>
        <div className="overflow-auto">
          <table className={activeMode ? "active-table" : ""}>
            <thead>
              {activeMode ? (
                <tr>
                  <th>Symbol</th>
                  <th className="w-20 text-right">Attempt</th>
                  <th className="w-[150px] text-right">Score</th>
                  <th className="w-24 text-right" title="Elapsed worker claim time. Hover a row value for remaining time.">Elapsed</th>
                </tr>
              ) : (
                <tr>
                  <th>Symbol</th>
                  <th className="w-[92px] text-right">Fuzzy</th>
                  <th className="w-32 text-right" title="Epoch target status. The second line shows priority.">Status</th>
                </tr>
              )}
            </thead>
            <tbody>
              {activeMode ? <ActiveRows rows={rows} /> : <EpochRows rows={rows} />}
              {rows.length === 0 ? (
                <tr className={activeMode ? "row-rhythm-1" : "row-rhythm-2"}>
                  <td className="text-dim" colSpan={columns}>{emptyText}</td>
                </tr>
              ) : null}
              <PlaceholderRows columns={columns} count={placeholderCount} rhythm={activeMode ? "match" : "queue"} startIndex={rows.length || 1} />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
