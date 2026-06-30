import { ImprovedTable } from "./_components/improved-table";
import { WorkStatusTable } from "./_components/work-status-table";
import type { WorkTablesProps } from "./_lib/types";

export type { ImprovedMode, ImprovedResultMode, WorkMode, WorkTablesProps } from "./_lib/types";

export function WorkTables(props: WorkTablesProps) {
  return (
    <div className="grid items-start border-b border-line min-[1180px]:grid-cols-2">
      <ImprovedTable
        dashboard={props.dashboard}
        mode={props.improvedMode}
        page={props.improvedPage}
        setMode={props.setImprovedMode}
        setPage={props.setImprovedPage}
      />
      <WorkStatusTable dashboard={props.dashboard} mode={props.workMode} setMode={props.setWorkMode} />
    </div>
  );
}
