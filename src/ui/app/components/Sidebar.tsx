import { Ban, ChevronLeft, ChevronRight, FileCheck, Flag, GitBranch, GitPullRequest, Pause, Play, RefreshCw, RotateCcw, ShieldCheck, Square, Undo2, Zap } from "lucide-react";
import { asArray, asObject, clock, num, shortId, text } from "../lib/format";
import type { Dashboard, FormState } from "../types";
import { Button, CheckboxField, Field, PanelSection, PanelTitle, Pill, SelectField } from "./primitives";

interface SidebarProps {
  busy: boolean;
  collapsed: boolean;
  dashboard: Dashboard | null;
  form: FormState;
  onAction: (action: "refresh" | "init" | "fresh" | "report" | "start" | "stop" | "forceStop" | "pausePr" | "resumePr" | "checkpoint" | "qa" | "splitPlan" | "preparePr") => void;
  onCollapsedChange: (collapsed: boolean) => void;
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

function statusClass(value: unknown): string {
  const status = text(value);
  if (status === "passed" || status === "pr_ready") return "text-[#45e05e]";
  if (status === "failed" || status === "blocked") return "text-[#ff8f8f]";
  if (status === "local_only" || status === "open") return "text-[#d7a64b]";
  return "text-[#969b97]";
}

function ArtifactRow({ label, path, status }: { label: string; path?: unknown; status?: unknown }) {
  return (
    <div className="grid min-h-7 grid-cols-[72px_74px_minmax(0,1fr)] items-center gap-2 border-t border-[#292d2b] bg-[#151715] px-2 py-1 first:border-t-0">
      <span className="text-[11px] uppercase text-[#969b97]">{label}</span>
      <span className={`${statusClass(status)} overflow-hidden text-ellipsis whitespace-nowrap`}>{text(status, "-")}</span>
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#969b97]" title={text(path)}>
        {text(path, "-")}
      </span>
    </div>
  );
}

function HandoffPanel({
  busy,
  dashboard,
  form,
  onAction,
  running,
  setForm,
}: Pick<SidebarProps, "busy" | "dashboard" | "form" | "onAction" | "setForm"> & { running: boolean }) {
  const run = asObject(dashboard?.status?.run);
  const status = asObject(dashboard?.status);
  const activeLeases = Number(status.activeLeases || 0);
  const handoff = asObject(dashboard?.handoff);
  const checkpoint = asObject(handoff.checkpoint || dashboard?.checkpoint);
  const checkpointCounts = asObject(checkpoint.counts);
  const qa = asObject(handoff.qa);
  const qaPromotion = asObject(qa.prPromotion);
  const splitPlan = asObject(handoff.splitPlan);
  const runStatus = text(run.status);
  const runPaused = runStatus === "paused";
  const runActive = runStatus === "active";
  const hasRun = Boolean(run.id);
  const handoffReady = hasRun && activeLeases === 0;
  const qaReady = handoffReady && !running;

  return (
    <PanelSection>
      <PanelTitle>PR Handoff</PanelTitle>
      <div className="mb-2 overflow-hidden rounded-md border border-[#292d2b]">
        <ArtifactRow label="Run" path={run.id ? `active leases ${num(activeLeases)}` : ""} status={text(run.status, "none")} />
        <ArtifactRow label="Checkpoint" path={checkpoint.prCandidatesPath} status={checkpoint.id ? `${num(checkpointCounts.pr_candidate)} PR` : ""} />
        <ArtifactRow label="QA" path={qa.prReportPath || qa.summaryPath} status={text(qaPromotion.status, text(qa.status))} />
        <ArtifactRow label="Plan" path={splitPlan.outputPath} status={splitPlan.status} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="QA target" onChange={(event) => setForm({ qaTarget: event.currentTarget.value })} spellCheck={false} value={form.qaTarget} />
        <Field label="QA rows" min={0} onChange={(event) => setForm({ qaReportMaxRows: Number(event.currentTarget.value) })} type="number" value={form.qaReportMaxRows} />
      </div>
      <CheckboxField checked={form.requirePrPromotion} label="Require PR promotion" onChange={(event) => setForm({ requirePrPromotion: event.currentTarget.checked })} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label="Base ref" onChange={(event) => setForm({ prBaseRef: event.currentTarget.value })} spellCheck={false} value={form.prBaseRef} />
        <SelectField label="Group" onChange={(event) => setForm({ prGroupMode: event.currentTarget.value })} options={["melee-subsystem", "top-dir"]} value={form.prGroupMode} />
        <Field label="Max files" min={1} onChange={(event) => setForm({ prMaxFilesPerPr: Number(event.currentTarget.value) })} type="number" value={form.prMaxFilesPerPr} />
        <Field label="Branch prefix" onChange={(event) => setForm({ prBranchPrefix: event.currentTarget.value })} spellCheck={false} value={form.prBranchPrefix} />
      </div>
      <Field label="Title prefix" onChange={(event) => setForm({ prTitlePrefix: event.currentTarget.value })} spellCheck={false} value={form.prTitlePrefix} />
      <CheckboxField checked={form.prIncludeUntracked} label="Include untracked" onChange={(event) => setForm({ prIncludeUntracked: event.currentTarget.checked })} />
      <CheckboxField checked={form.prCommittedOnly} label="Committed only" onChange={(event) => setForm({ prCommittedOnly: event.currentTarget.checked })} />
      <CheckboxField checked={form.pauseBeforeHandoff} label="Pause before prepare" onChange={(event) => setForm({ pauseBeforeHandoff: event.currentTarget.checked })} />

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <Button disabled={!hasRun || !runActive || busy} icon={<Pause size={14} />} onClick={() => onAction("pausePr")} tone="warning" type="button">
          Pause Intake
        </Button>
        <Button disabled={!hasRun || !runPaused || busy} icon={<Undo2 size={14} />} onClick={() => onAction("resumePr")} type="button">
          Resume
        </Button>
        <Button disabled={!handoffReady || busy} icon={<FileCheck size={14} />} onClick={() => onAction("checkpoint")} type="button">
          Checkpoint
        </Button>
        <Button disabled={!qaReady || busy} icon={<ShieldCheck size={14} />} onClick={() => onAction("qa")} type="button">
          Run QA
        </Button>
        <Button disabled={!qaReady || busy} icon={<GitBranch size={14} />} onClick={() => onAction("splitPlan")} type="button">
          Plan PRs
        </Button>
        <Button disabled={!handoffReady || busy} icon={<GitPullRequest size={14} />} onClick={() => onAction("preparePr")} tone="primary" type="button">
          Prepare
        </Button>
      </div>
    </PanelSection>
  );
}

export function Sidebar({ busy, collapsed, dashboard, form, onAction, onCollapsedChange, setForm, streamState }: SidebarProps) {
  const run = asObject(dashboard?.status?.run);
  const selectedName = processName(form.processName);
  const { pillState, running } = useProcessView(dashboard, selectedName);
  const actionBusy = busy;

  if (collapsed) {
    return (
      <aside className="sidebar-rail sidebar-rail-collapsed grid min-w-0 border-r border-[#363a38] bg-[#1d1f1e] overflow-hidden max-[780px]:block">
        <div className="sidebar-rail-tab z-10 flex h-full flex-col items-center justify-start gap-2 border-b border-[#292d2b] bg-[#181a19] px-2 py-1.5 max-[780px]:h-[42px] max-[780px]:flex-row">
          <Button
            aria-expanded={false}
            className="h-7 min-w-7 px-0"
            icon={<ChevronRight size={14} />}
            onClick={() => onCollapsedChange(false)}
            title="Show controls"
            type="button"
          >
            <span className="sr-only">Show</span>
          </Button>
          <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-bold uppercase text-[#c0c5c1] max-[780px]:[writing-mode:initial] max-[780px]:rotate-0">
            Controls
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar-rail sidebar-rail-open min-w-0 overflow-auto border-r border-[#363a38] bg-[#1d1f1e]">
      <div className="sidebar-rail-content">
        <PanelSection className="sticky top-0 z-10 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5 bg-[#181a19]">
          <Button
            aria-expanded
            className="h-7 min-w-7 px-0"
            icon={<ChevronLeft size={14} />}
            onClick={() => onCollapsedChange(true)}
            title="Hide controls"
            type="button"
          >
            <span className="sr-only">Hide</span>
          </Button>
          <div className="min-w-0">
            <div className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-[#969b97]">Decomp Orchestrator</div>
            <h1 className="m-0 overflow-hidden text-ellipsis whitespace-nowrap text-lg font-semibold tracking-normal">{run.id ? `Run ${shortId(run.id)}` : "No run"}</h1>
          </div>
          <div className="grid justify-items-end gap-1">
            <Pill state={pillState} />
            <div className="text-right text-[11px] uppercase text-[#969b97]">{streamState}</div>
          </div>
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
        <CheckboxField checked={form.checkpointBeforeFresh} label="Checkpoint before fresh" onChange={(event) => setForm({ checkpointBeforeFresh: event.currentTarget.checked })} />
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

      <HandoffPanel busy={busy} dashboard={dashboard} form={form} onAction={onAction} running={running} setForm={setForm} />

      <ProcessPanel dashboard={dashboard} form={form} setForm={setForm} />
      </div>
    </aside>
  );
}
