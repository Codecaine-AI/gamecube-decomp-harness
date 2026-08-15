import { Fragment, type ReactNode } from "react";
import { asObject, num, text } from "@/lib/format";
import { hasKeys, prettyStatus, statusClass } from "@/pages/workspace/_lib/model";
import type { CycleView } from "@/pages/workspace/_lib/types";

export function PrPipelineStepper({ view }: { view: CycleView }) {
  const { checkpoint, qa, qaRepair, ship } = view.prSummary;
  const qaStatus = text(asObject(qa.prPromotion).status, text(qa.status));
  const qaRepairStatus = text(qaRepair.recommendation, text(qaRepair.status));
  const stages: Array<{ label: string; tone: string; value: ReactNode }> = [
    { label: "Checkpoint", tone: hasKeys(checkpoint) ? "text-up" : "text-dim", value: hasKeys(checkpoint) ? "available" : "none" },
    { label: "QA", tone: statusClass(qaStatus), value: prettyStatus(qaStatus, "not run") },
    { label: "QA Repair", tone: statusClass(qaRepairStatus), value: prettyStatus(qaRepairStatus, "not run") },
    { label: "Ship Set", tone: statusClass(ship.status), value: prettyStatus(ship.status, "not verified") },
    { label: "Draft PRs", tone: "text-soft", value: num(view.prRecords.length) },
  ];
  return (
    <div className="pipeline">
      {stages.map((stage, index) => (
        <Fragment key={stage.label}>
          <div className="pipeline-node">
            <span className="pipeline-node-label">{stage.label}</span>
            <span className={`pipeline-node-value ${stage.tone}`}>{stage.value}</span>
          </div>
          {index < stages.length - 1 ? <div aria-hidden="true" className="pipeline-connector" /> : null}
        </Fragment>
      ))}
    </div>
  );
}
