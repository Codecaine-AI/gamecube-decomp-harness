import { Ban, Flag, Play, RefreshCw, RotateCcw, Square, Zap } from "lucide-react";
import { asArray, asObject, clock, num, shortId, text } from "../lib/format";
import type { Dashboard, FormState } from "../types";
import { Button, CheckboxField, Field, PanelSection, PanelTitle, Pill, SelectField } from "./primitives";

interface SidebarProps {
  busy: boolean;
  dashboard: Dashboard | null;
  form: FormState;
  onAction: (action: "refresh" | "init" | "fresh" | "report" | "start" | "stop" | "forceStop") => void;
  setForm: (updates: Partial<FormState>) => void;
  streamState: string;
}

const powers = [16, 32, 64, 128, 256, 512, 1024];

function processName(value: unknown): string {
  const raw = text(value, "melee-live").trim() || "melee-live";
  return raw.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "melee-live";
}

function useProcessView(dashboard: Dashboard | null, selectedName: string) {
  const proc = asObject(dashboard?.process);
  const saved = asArray(proc.knownProcesses).map(asObject);
  const selected = saved.find((item) => text(item.name) === selectedName) || saved.find((item) => item.alive === true) || {};
  const display = proc.pid ? proc : selected;
  const detached = !proc.pid && display.alive === true;
  const liveState = proc.state === "running" || proc.state === "stopping" || proc.state === "draining";
  const running = Boolean(liveState || detached);
  const savedState = text(display.state);
  const pillState = proc.state && proc.state !== "idle" ? text(proc.state) : detached && savedState ? savedState : detached ? "detached" : savedState || "idle";
  return { detached, display, pillState, proc, running, saved };
}

function ProcessPanel({
  dashboard,
  form,
  setForm,
}: Pick<SidebarProps, "dashboard" | "form" | "setForm">) {
  const selectedName = processName(form.processName);
  const { display, pillState, saved } = useProcessView(dashboard, selectedName);
  const facts: Array<[string, unknown]> = [
    ["Name", display.name || selectedName || "-"],
    ["State", pillState],
    ["PID", display.pid || "-"],
    ["Group", display.processGroup || "-"],
    ["Started", display.startedAt ? clock(display.startedAt) : "-"],
    ["Ended", display.endedAt ? clock(display.endedAt) : "-"],
    ["Exit", display.exitCode ?? display.signal ?? "-"],
    ["Kill", display.killCommand || "-"],
    ["PID file", display.pidFilePath || "-"],
  ];

  return (
    <PanelSection>
      <PanelTitle>Process</PanelTitle>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-1">
        {facts.map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-[#969b97]">{label}</dt>
            <dd className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" title={String(value ?? "")}>
              {String(value ?? "")}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 text-[11px] uppercase text-[#969b97]">Saved Processes</div>
      <div className="mt-1.5 grid gap-1.5">
        {saved.slice(0, 8).map((item) => (
          <button
            className={`grid min-h-7 w-full grid-cols-[minmax(0,1fr)_64px_68px] items-center gap-2 rounded-[5px] border px-2 py-1 text-left ${
              text(item.name) === selectedName ? "border-[#2a7d38]" : "border-[#363a38]"
            } bg-[#151715]`}
            key={text(item.name)}
            onClick={() => setForm({ processName: text(item.name, "melee-live") })}
            type="button"
          >
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#e2e5e2]">{text(item.name, "-")}</span>
            <span className={`text-right ${item.alive ? "text-[#45e05e]" : "text-[#969b97]"}`}>{item.alive ? "alive" : text(item.state, "saved")}</span>
            <span className="text-right">{String(item.pid || "-")}</span>
          </button>
        ))}
        {saved.length === 0 ? <div className="pt-1 text-[#969b97]">No saved process files</div> : null}
      </div>
    </PanelSection>
  );
}

export function Sidebar({ busy, dashboard, form, onAction, setForm, streamState }: SidebarProps) {
  const run = asObject(dashboard?.status?.run);
  const selectedName = processName(form.processName);
  const { pillState, running } = useProcessView(dashboard, selectedName);
  const actionBusy = busy;

  return (
    <aside className="min-w-0 overflow-auto border-r border-[#363a38] bg-[#1d1f1e]">
      <PanelSection className="sticky top-0 z-10 grid grid-cols-[1fr_auto] items-center gap-x-2.5 bg-[#181a19]">
        <div className="text-xs text-[#969b97]">Decomp Orchestrator</div>
        <Pill state={pillState} />
        <h1 className="m-0 text-lg font-semibold tracking-normal">{run.id ? `Run ${shortId(run.id)}` : "No run"}</h1>
        <div className="text-right text-[11px] uppercase text-[#969b97]">{streamState}</div>
      </PanelSection>

      <PanelSection>
        <PanelTitle>Project</PanelTitle>
        <Field label="Repo root" onChange={(event) => setForm({ repoRoot: event.currentTarget.value })} spellCheck={false} value={form.repoRoot} />
        <Field label="State dir" onChange={(event) => setForm({ stateDir: event.currentTarget.value })} spellCheck={false} value={form.stateDir} />
      </PanelSection>

      <PanelSection>
        <PanelTitle>Run</PanelTitle>
        <Field label="Process name" onChange={(event) => setForm({ processName: event.currentTarget.value })} spellCheck={false} value={form.processName} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Workers" min={1} onChange={(event) => setForm({ maxWorkers: Number(event.currentTarget.value) })} type="number" value={form.maxWorkers} />
          <Field label="Idle ms" min={100} onChange={(event) => setForm({ idleSleepMs: Number(event.currentTarget.value) })} type="number" value={form.idleSleepMs} />
          <SelectField label="Candidate limit" onChange={(event) => setForm({ candidateLimit: Number(event.currentTarget.value) })} options={powers} value={form.candidateLimit} />
          <SelectField label="Queue target" onChange={(event) => setForm({ queueTargetSize: Number(event.currentTarget.value) })} options={powers} value={form.queueTargetSize} />
          <SelectField label="Refill mark" onChange={(event) => setForm({ queueLowWatermark: Number(event.currentTarget.value) })} options={[8, 16, 32, 64, 128]} value={form.queueLowWatermark} />
          <SelectField label="Candidate window" onChange={(event) => setForm({ candidateWindow: Number(event.currentTarget.value) })} options={[64, 128, 256, 512, 1024, 2048]} value={form.candidateWindow} />
          <Field label="Goal value" min={0} onChange={(event) => setForm({ goalValue: Number(event.currentTarget.value) })} step={0.01} type="number" value={form.goalValue} />
        </div>
        <Field label="Provider" onChange={(event) => setForm({ provider: event.currentTarget.value })} spellCheck={false} value={form.provider} />
        <Field label="Model" onChange={(event) => setForm({ model: event.currentTarget.value })} spellCheck={false} value={form.model} />
        <div className="grid grid-cols-2 gap-2">
          <SelectField label="Director thinking" onChange={(event) => setForm({ thinkingLevel: event.currentTarget.value })} options={["medium", "low", "high", "x-high"]} value={form.thinkingLevel} />
          <SelectField label="Worker thinking" onChange={(event) => setForm({ workerThinkingLevel: event.currentTarget.value })} options={["medium", "low", "high", "x-high"]} value={form.workerThinkingLevel} />
        </div>
        <CheckboxField checked={form.dryRunAgents} label="Dry-run agents" onChange={(event) => setForm({ dryRunAgents: event.currentTarget.checked })} />
        <CheckboxField checked={form.refreshPrLibrary} label="Refresh PR library" onChange={(event) => setForm({ refreshPrLibrary: event.currentTarget.checked })} />
        <CheckboxField checked={form.resetReportBaseline} label="Reset report baseline" onChange={(event) => setForm({ resetReportBaseline: event.currentTarget.checked })} />
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <Button icon={<RefreshCw size={14} />} onClick={() => onAction("refresh")} type="button">
            Refresh
          </Button>
          <Button disabled={running || actionBusy} icon={<Flag size={14} />} onClick={() => onAction("init")} type="button">
            Init Run
          </Button>
          <Button className="col-span-2" disabled={running || actionBusy} icon={<RotateCcw size={14} />} onClick={() => onAction("fresh")} tone="warning" type="button">
            Fresh Run
          </Button>
          <Button className="col-span-2" disabled={actionBusy} icon={<Zap size={14} />} onClick={() => onAction("report")} type="button">
            Report Now
          </Button>
          <Button disabled={running || actionBusy} icon={<Play size={14} />} onClick={() => onAction("start")} tone="primary" type="button">
            Start
          </Button>
          <Button disabled={!running || actionBusy || pillState === "draining"} icon={<Square size={14} />} onClick={() => onAction("stop")} tone="warning" type="button">
            Stop
          </Button>
          <Button className="col-span-2" disabled={!running || actionBusy} icon={<Ban size={14} />} onClick={() => onAction("forceStop")} tone="danger" type="button">
            Force Stop
          </Button>
        </div>
      </PanelSection>

      <ProcessPanel dashboard={dashboard} form={form} setForm={setForm} />
    </aside>
  );
}
