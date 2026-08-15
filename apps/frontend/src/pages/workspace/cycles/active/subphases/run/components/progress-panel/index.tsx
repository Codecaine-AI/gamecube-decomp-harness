import type { Dashboard } from "@/lib/format";
import { TimelineChart } from "./_components/timeline-chart";

export function ProgressPanel({
  dashboard,
}: {
  dashboard: Dashboard | null;
}) {
  return (
    <div className="overflow-hidden rounded-none border border-line bg-panel">
      <TimelineChart dashboard={dashboard} />
    </div>
  );
}
