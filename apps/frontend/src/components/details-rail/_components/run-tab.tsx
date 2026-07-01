import { asObject } from "@/lib/format";

import { WorkerStates } from "./worker-reports";
import type { RunTabProps } from "../_lib/types";

export function RunTab({ dashboard, form, loadRunDetails, loadingRunDetails, runDetails }: RunTabProps) {
  const run = asObject(dashboard?.status?.run);
  if (!run.id) {
    return <div className="p-3 text-dim">No active run</div>;
  }

  return (
    <WorkerStates dashboard={dashboard} form={form} loadRunDetails={loadRunDetails} loadingRunDetails={loadingRunDetails} runDetails={runDetails} />
  );
}
