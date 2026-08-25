import { Archive, Play } from "@/icons";
import { type FormState, text } from "@/lib/format";
import { workerTimeoutMinutes, workerTimeoutSecondsFromMinutes } from "@/lib/workerConfig";
import { Button, Field, PanelSection, PanelTitle, SelectField } from "@/components/primitives";
import { RUN_CONTROL_ACTIONS } from "@/components/app/_lib/projectedRunControls";
import {
  resolverConcurrencyOptions,
  resolverConcurrencyTooltip,
  schedulingForWorkers,
  workerCountOptions,
} from "@/pages/workspace/_lib/model";
import type { DashboardAction, CycleView } from "@/pages/workspace/_lib/types";

export function RunControls({ busy, form, onAction, setForm, view }: { busy: boolean; form: FormState; onAction: (action: DashboardAction) => void; setForm: (updates: Partial<FormState>) => void; view: CycleView }) {
  const timeoutMinutes = workerTimeoutMinutes(form.agentTimeoutSeconds);
  const startBlocked = view.mode === "pr" ? "PR Mode work is unresolved for this active cycle." : view.process.running ? "Workers are already running." : view.syncing ? "Sync is in progress." : view.operationActive ? `${view.operationLabel} is in progress.` : "";
  return (
    <PanelSection>
      <PanelTitle>Run Controls</PanelTitle>
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={busy || !view.canStartWorkers} icon={<Play size={14} />} onClick={() => onAction("startWork")} title={view.canStartWorkers ? "Init/resume this run and start workers." : startBlocked} tone={view.canStartWorkers ? "primary" : undefined} type="button">
          {view.runStatus === "paused" ? "Resume" : "Start"}
        </Button>
        <Button disabled={busy || !view.process.running} icon={<Archive size={14} />} onClick={() => onAction(RUN_CONTROL_ACTIONS.hardStop)} title={view.process.running ? "Stop workers gracefully, then cancel any still running after 30 seconds." : "No process is running."} tone="warning" type="button">
          Stop
        </Button>
      </div>
      {view.mode === "pr" ? <p className="mb-0 mt-2 text-xs text-warn">Run start is gated because this active cycle is in PR Mode.</p> : null}
      <details className="control-disclosure" open>
        <summary>{`Setup - ${text(form.provider, "codex-lb")} - ${form.maxWorkers} workers - timeout ${timeoutMinutes}m`}</summary>
        <div className="grid grid-cols-1 gap-2">
          <SelectField label="Num workers" onChange={(event) => setForm(schedulingForWorkers(Number(event.currentTarget.value)))} options={[...workerCountOptions]} value={form.maxWorkers} />
          <SelectField label="Resolvers" onChange={(event) => setForm({ integrationResolverConcurrency: Number(event.currentTarget.value) })} options={[...resolverConcurrencyOptions]} title={resolverConcurrencyTooltip} value={form.integrationResolverConcurrency} />
          <Field label="Timeout (min)" min={1} onChange={(event) => setForm({ agentTimeoutSeconds: workerTimeoutSecondsFromMinutes(event.currentTarget.value) })} step={1} type="number" value={timeoutMinutes} />
        </div>
      </details>
    </PanelSection>
  );
}
