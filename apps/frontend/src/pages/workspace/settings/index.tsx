import { asObject, type FormState, type UiConfig } from "@/lib/format";
import { CheckboxField, Field, InfoRows, List, PageHeader, PanelSection, PanelTitle, SelectField } from "@/components/primitives";
import { processName } from "@/pages/workspace/_lib/model";
import type { CycleView, WorkspaceNav } from "@/pages/workspace/_lib/types";

export function SettingsPage({ config, form, nav, setForm, view }: { config: UiConfig | null; form: FormState; nav: WorkspaceNav; setForm: (updates: Partial<FormState>) => void; view: CycleView }) {
  const games = config?.availableGames ?? [];
  const defaults = asObject(config?.gameDefaults);
  const validation = asObject(defaults.validation);
  const pr = asObject(defaults.pr);
  return (
    <>
      <PageHeader kicker={view.game?.displayName ?? "No game selected"} title="Settings" />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-[minmax(320px,0.75fr)_minmax(0,1fr)]">
          <PanelSection>
            <PanelTitle>Game Selection</PanelTitle>
            <SelectField
              label="Game"
              onChange={(event) => {
                const game = games.find((item) => item.id === event.currentTarget.value);
                setForm({
                  gameId: event.currentTarget.value,
                  usePathOverrides: false,
                  repoRoot: game?.repoRoot ?? form.repoRoot,
                  stateDir: game?.stateDir ?? form.stateDir,
                  graphDbPath: game?.graphDbPath ?? form.graphDbPath,
                  processName: game?.processName ?? form.processName,
                });
              }}
              options={games.length ? games.map((game) => game.id) : [form.gameId || ""]}
              value={form.gameId}
            />
            <CheckboxField checked={form.usePathOverrides} label="Use custom paths" onChange={(event) => setForm({ usePathOverrides: event.currentTarget.checked })} />
            <Field disabled={!form.usePathOverrides} label="Repo root" onChange={(event) => setForm({ repoRoot: event.currentTarget.value })} spellCheck={false} value={form.repoRoot} />
            <Field disabled={!form.usePathOverrides} label="State dir" onChange={(event) => setForm({ stateDir: event.currentTarget.value })} spellCheck={false} value={form.stateDir} />
            <Field disabled={!form.usePathOverrides} label="Graph DB" onChange={(event) => setForm({ graphDbPath: event.currentTarget.value })} spellCheck={false} value={form.graphDbPath} />
            <p className="mb-0 mt-2 text-xs text-dim">
              Standards and durable game knowledge live in the <button className="text-accent underline-offset-2 hover:underline" onClick={() => nav.goToSection("standards")} type="button">Standards</button> page, not here.
            </p>
          </PanelSection>
          <PanelSection>
            <PanelTitle>Path Health</PanelTitle>
            <InfoRows
              rows={[
                ["Repo", form.repoRoot || view.game?.repoRoot || "-", view.game?.repoRootExists === false ? "text-down" : "text-soft"],
                ["State", form.stateDir || view.game?.stateDir || "-", view.game?.stateDirExists === false ? "text-down" : "text-soft"],
                ["Graph", form.graphDbPath || view.game?.graphDbPath || "-", view.game?.graphDbExists === false ? "text-down" : "text-soft"],
                ["Process", processName(form.processName || view.game?.processName)],
                ["Base ref", view.game?.baseRef ?? "-"],
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
      </div>
    </>
  );
}
