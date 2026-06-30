import { asObject, type FormState, type UiConfig } from "@/lib/format";
import { RefreshCw, RotateCcw } from "@/icons";
import { Button, CheckboxField, Field, InfoRows, List, PageHeader, PanelHeader, PanelSection, PanelTitle, SelectField } from "@/components/primitives";
import { DEFAULT_TOOL_CONCURRENCY, normalizeToolConcurrency, suggestedToolConcurrency, toolConcurrencyRows } from "@/lib/workerConfig";
import { processName } from "@/pages/workspace/_lib/model";
import type { SessionView, WorkspaceNav } from "@/pages/workspace/_lib/types";

export function SettingsPage({ config, form, nav, setForm, view }: { config: UiConfig | null; form: FormState; nav: WorkspaceNav; setForm: (updates: Partial<FormState>) => void; view: SessionView }) {
  const projects = config?.availableProjects ?? [];
  const defaults = asObject(config?.projectDefaults);
  const validation = asObject(defaults.validation);
  const pr = asObject(defaults.pr);
  const toolDefaults = asObject(defaults.toolConcurrency);
  const configuredToolConcurrency = normalizeToolConcurrency(toolDefaults.configured, DEFAULT_TOOL_CONCURRENCY);
  const codeToolConcurrency = normalizeToolConcurrency(toolDefaults.defaults, DEFAULT_TOOL_CONCURRENCY);
  const toolEnv = asObject(toolDefaults.env);
  const toolConcurrency = normalizeToolConcurrency(form.toolConcurrency, configuredToolConcurrency);
  const setToolConcurrency = (key: keyof FormState["toolConcurrency"], value: unknown, max: number) => {
    const parsed = Math.trunc(Number(value));
    setForm({
      toolConcurrency: {
        ...toolConcurrency,
        [key]: Math.max(1, Math.min(max, Number.isFinite(parsed) ? parsed : toolConcurrency[key])),
      },
    });
  };
  return (
    <>
      <PageHeader kicker={view.project?.displayName ?? "No project selected"} title="Settings" />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-[minmax(320px,0.75fr)_minmax(0,1fr)]">
          <PanelSection>
            <PanelTitle>Project Selection</PanelTitle>
            <SelectField
              label="Project"
              onChange={(event) => {
                const project = projects.find((item) => item.id === event.currentTarget.value);
                setForm({
                  projectId: event.currentTarget.value,
                  usePathOverrides: false,
                  repoRoot: project?.repoRoot ?? form.repoRoot,
                  stateDir: project?.stateDir ?? form.stateDir,
                  graphDbPath: project?.graphDbPath ?? form.graphDbPath,
                  processName: project?.processName ?? form.processName,
                });
              }}
              options={projects.length ? projects.map((project) => project.id) : [form.projectId || ""]}
              value={form.projectId}
            />
            <CheckboxField checked={form.usePathOverrides} label="Use custom paths" onChange={(event) => setForm({ usePathOverrides: event.currentTarget.checked })} />
            <Field disabled={!form.usePathOverrides} label="Repo root" onChange={(event) => setForm({ repoRoot: event.currentTarget.value })} spellCheck={false} value={form.repoRoot} />
            <Field disabled={!form.usePathOverrides} label="State dir" onChange={(event) => setForm({ stateDir: event.currentTarget.value })} spellCheck={false} value={form.stateDir} />
            <Field disabled={!form.usePathOverrides} label="Graph DB" onChange={(event) => setForm({ graphDbPath: event.currentTarget.value })} spellCheck={false} value={form.graphDbPath} />
            <p className="mb-0 mt-2 text-xs text-dim">
              Standards and durable project knowledge live in the <button className="text-accent underline-offset-2 hover:underline" onClick={() => nav.goToSection("standards")} type="button">Standards</button> page, not here.
            </p>
          </PanelSection>
          <PanelSection>
            <PanelTitle>Path Health</PanelTitle>
            <InfoRows
              rows={[
                ["Repo", form.repoRoot || view.project?.repoRoot || "-", view.project?.repoRootExists === false ? "text-down" : "text-soft"],
                ["State", form.stateDir || view.project?.stateDir || "-", view.project?.stateDirExists === false ? "text-down" : "text-soft"],
                ["Graph", form.graphDbPath || view.project?.graphDbPath || "-", view.project?.graphDbExists === false ? "text-down" : "text-soft"],
                ["Process", processName(form.processName || view.project?.processName)],
                ["Base ref", view.project?.baseRef ?? "-"],
              ]}
            />
          </PanelSection>
        </div>
        <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-2">
          <PanelSection>
            <PanelTitle>Validation Defaults</PanelTitle>
            <List values={Object.entries(validation).map(([key, value]) => `${key}: ${String(value)}`)} empty="No validation defaults configured." />
          </PanelSection>
          <PanelSection>
            <PanelTitle>PR Defaults</PanelTitle>
            <List values={Object.entries(pr).map(([key, value]) => `${key}: ${String(value)}`)} empty="No PR defaults configured." />
          </PanelSection>
        </div>
        <PanelSection>
          <PanelHeader
            title="Tool Concurrency"
            right={
              <div className="flex flex-wrap gap-2">
                <Button icon={<RefreshCw size={13} />} onClick={() => setForm({ toolConcurrency: suggestedToolConcurrency(form.maxWorkers) })} title="Fit tool slots to the selected worker count." type="button">
                  Fit Workers
                </Button>
                <Button icon={<RotateCcw size={13} />} onClick={() => setForm({ toolConcurrency: configuredToolConcurrency })} title="Reset to the effective project defaults." type="button">
                  Defaults
                </Button>
              </div>
            }
          />
          <div className="mt-3 grid grid-cols-1 gap-4 @[860px]:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
            <div className="grid grid-cols-1 gap-2 @[560px]:grid-cols-2 @[1080px]:grid-cols-4">
              {toolConcurrencyRows.map((row) => (
                <Field
                  className="mb-0"
                  key={row.key}
                  label={row.label}
                  max={row.max}
                  min={1}
                  onChange={(event) => setToolConcurrency(row.key, event.currentTarget.value, row.max)}
                  step={1}
                  title={String(toolEnv[row.key] ?? "")}
                  type="number"
                  value={toolConcurrency[row.key]}
                />
              ))}
            </div>
            <InfoRows
              rows={toolConcurrencyRows.map((row) => [
                row.label,
                `${codeToolConcurrency[row.key]} default / ${String(toolEnv[row.key] ?? "-")}`,
                toolConcurrency[row.key] === configuredToolConcurrency[row.key] ? "text-soft" : "text-warn",
              ])}
            />
          </div>
        </PanelSection>
      </div>
    </>
  );
}
