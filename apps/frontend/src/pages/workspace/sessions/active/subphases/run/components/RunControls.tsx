import { Archive, Pause, Play, RefreshCw } from "@/icons";
import { type FormState, text } from "@/lib/format";
import { workerTimeoutMinutes, workerTimeoutSecondsFromMinutes } from "@/lib/workerConfig";
import { Button, Field, PanelSection, PanelTitle, SelectField } from "@/components/primitives";
import {
  candidateRerankOptions,
  candidateRerankTooltip,
  candidateWindowOptions,
  candidateWindowTooltip,
  epochSizeOptions,
  resolverConcurrencyOptions,
  resolverConcurrencyTooltip,
  schedulingForWorkers,
  workerCountOptions,
} from "@/pages/workspace/_lib/model";
import type { DashboardAction, SessionView } from "@/pages/workspace/_lib/types";

export function RunControls({ busy, form, onAction, setForm, view }: { busy: boolean; form: FormState; onAction: (action: DashboardAction) => void; setForm: (updates: Partial<FormState>) => void; view: SessionView }) {
  const timeoutMinutes = workerTimeoutMinutes(form.agentTimeoutSeconds);
  const startBlocked = view.mode === "pr" ? "PR Mode work is unresolved for this active session." : view.process.running ? "Workers are already running." : view.syncing ? "Sync is in progress." : view.operationActive ? `${view.operationLabel} is in progress.` : "";
  return (
    <PanelSection>
      <PanelTitle>Run Controls</PanelTitle>
      <div className="grid grid-cols-3 gap-2">
        <Button disabled={busy || !view.canStartWorkers} icon={<Play size={14} />} onClick={() => onAction("startWork")} title={view.canStartWorkers ? "Init/resume this run and start workers." : startBlocked} tone={view.canStartWorkers ? "primary" : undefined} type="button">
          {view.runStatus === "paused" ? "Resume" : "Start"}
        </Button>
        <Button disabled={busy || !view.process.running || view.process.draining} icon={view.process.draining ? <RefreshCw size={14} /> : <Pause size={14} />} onClick={() => onAction("pausePr")} title={view.process.running ? "Drain workers and enter PR handoff." : "Workers are not running."} tone="warning" type="button">
          {view.process.draining ? "Draining" : "Drain"}
        </Button>
        <Button disabled={busy || !view.process.running} icon={<Archive size={14} />} onClick={() => onAction("forceStop")} title={view.process.running ? "Kill workers immediately and recover active claims for rescheduling." : "No process is running."} tone="danger" type="button">
          Kill
        </Button>
      </div>
      {view.mode === "pr" ? <p className="mb-0 mt-2 text-xs text-warn">Run start is gated because this active session is in PR Mode.</p> : null}
      <details className="control-disclosure" open>
        <summary>{`Setup - ${text(form.provider, "codex-lb")} - ${form.maxWorkers} workers - epoch ${text(form.epochSize)} / window ${text(form.candidateWindow)} - timeout ${timeoutMinutes}m`}</summary>
        <div className="grid grid-cols-1 gap-2">
          <SelectField label="Num workers" onChange={(event) => setForm(schedulingForWorkers(Number(event.currentTarget.value)))} options={[...workerCountOptions]} value={form.maxWorkers} />
          <SelectField label="Epoch size" onChange={(event) => setForm({ epochSize: event.currentTarget.value })} options={[...epochSizeOptions]} value={form.epochSize} />
          <SelectField label="Candidate window" onChange={(event) => setForm({ candidateWindow: event.currentTarget.value })} options={[...candidateWindowOptions]} title={candidateWindowTooltip} value={form.candidateWindow} />
          <SelectField label="Rerank" onChange={(event) => setForm({ candidateRerank: event.currentTarget.value })} options={[...candidateRerankOptions]} title={candidateRerankTooltip} value={form.candidateRerank} />
          <SelectField label="Resolvers" onChange={(event) => setForm({ integrationResolverConcurrency: Number(event.currentTarget.value) })} options={[...resolverConcurrencyOptions]} title={resolverConcurrencyTooltip} value={form.integrationResolverConcurrency} />
          <Field label="Timeout (min)" min={1} onChange={(event) => setForm({ agentTimeoutSeconds: workerTimeoutSecondsFromMinutes(event.currentTarget.value) })} step={1} type="number" value={timeoutMinutes} />
        </div>
      </details>
    </PanelSection>
  );
}
