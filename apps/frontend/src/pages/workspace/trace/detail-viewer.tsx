import { useMemo } from "react";
import { buildTraceSpans, type KernelTraceSessionDetail } from "@agent-kernel/viewer-core";
import { KernelTraceViewer } from "@agent-kernel/viewer-shell";

function rootedContainers(detail: KernelTraceSessionDetail) {
  const containers = detail.containers ?? (detail.container ? [detail.container] : []);
  const rootId = detail.container?.id;
  if (!rootId) return containers;
  return containers.map((container) => (
    container.id === rootId && container.parentContainerId
      ? { ...container, parentContainerId: null }
      : container
  ));
}

export function TraceDetailViewer({
  detail,
  initialTraceLevel = 2,
}: {
  detail: KernelTraceSessionDetail;
  initialTraceLevel?: number;
}) {
  const spans = useMemo(
    () =>
      buildTraceSpans(
        detail.events,
        detail.pi_sessions,
        detail.agent_runs,
        // A container trace keeps its database parent even though that parent
        // is outside the returned subtree. Root it for the viewer so the
        // selected agent does not disappear from the rendered forest.
        rootedContainers(detail),
      ),
    [detail],
  );
  const usageContext = useMemo(
    () => ({ runs: detail.agent_runs, container: detail.container ?? null }),
    [detail],
  );

  return (
    <div className="kernel-reference-workspace h-full min-h-0 bg-background font-sans text-foreground">
      <KernelTraceViewer
        className="flex h-full min-h-0 flex-col"
        initialTraceLevel={initialTraceLevel}
        spans={spans}
        usageContext={usageContext}
      />
    </div>
  );
}
