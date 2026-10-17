import { useEffect, useState } from "react";
import { AgentCatalogViewer } from "@agent-kernel/viewer-ui";
import {
  PromptStyleSidebar,
  PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH,
  clampPromptStyleSidebarWidth,
  usePromptStyleSettings,
} from "@codecaine-ai/prompt-kit/ui/style";
import {
  fetchKernelAgents,
  type KernelAgentsPayload,
  type KernelCompilerDeltaVariant,
  type KernelPreviousAttemptVariant,
} from "@/lib/api";
import type { FormState } from "@/lib/format";
import { RUN_MODEL_OPTIONS } from "@/components/app/_lib/runSettings";
import type { AppRoute } from "@/routing";

// The server renders the worker sample for the selected game's stack frame
// policy and, with an active steering gate, the chosen previous_attempt variant.
type AgentsPreviewPayload = KernelAgentsPayload & {
  stackFramePolicy?: "match_frame" | "stop_at_frame";
};

const STACK_FRAME_POLICY_LABELS = {
  match_frame: "Stack frame: match exactly",
  stop_at_frame: "Stack frame: match up to frame size",
} as const;

const PREVIOUS_ATTEMPT_OPTIONS: ReadonlyArray<{ id: KernelPreviousAttemptVariant; label: string; title: string }> = [
  { id: "rollback", label: "Rollback", title: "Worker sample: previous attempt rolled back by the steering gate" },
  { id: "unverified_match", label: "100% but unverified", title: "Worker sample: function at 100% the steering gate could not verify" },
  { id: "none", label: "None", title: "Worker sample: no previous attempt; pending evidence reviews render on their own" },
];

const COMPILER_DELTA_OPTIONS: ReadonlyArray<{ id: KernelCompilerDeltaVariant; label: string; title: string }> = [
  { id: "present", label: "Present", title: "Worker sample: steering_probe with a compiler_delta" },
  { id: "unavailable", label: "Unavailable", title: "Worker sample: steering_probe with compiler_delta marked unavailable" },
  { id: "absent", label: "Absent", title: "Worker sample: steering_probe without compiler_delta" },
];

// The previous_attempt selector styles only with design-system tokens; each
// falls back to this app's local token until the app loads the design system.
const PREVIOUS_ATTEMPT_STYLES = {
  group: [
    "flex shrink-0 overflow-hidden border",
    "rounded-[var(--ds-radius-base,var(--radius))]",
    "border-[var(--ds-color-border-default,var(--color-border))]",
    "text-[length:var(--ds-font-size-ui-2xs,var(--text-xs))]",
  ].join(" "),
  cell: [
    "border-r last:border-r-0",
    "border-[var(--ds-color-border-default,var(--color-border))]",
    "px-[var(--ds-space-2,calc(var(--spacing)*2))]",
    "py-[var(--ds-space-1,var(--spacing))]",
  ].join(" "),
  muted: "text-[var(--ds-color-text-muted,var(--color-muted-foreground))]",
  idle: [
    "text-[var(--ds-color-text-muted,var(--color-muted-foreground))]",
    "hover:text-[var(--ds-color-text-body,var(--color-foreground))]",
  ].join(" "),
  active: [
    "bg-[var(--ds-color-status-warning-soft,var(--color-status-warning-fill))]",
    "text-[var(--ds-color-status-warning-text,var(--color-status-warning))]",
  ].join(" "),
} as const;

function previewTargetFromLocation(): string {
  try {
    return new URLSearchParams(window.location.search).get("target") ?? "";
  } catch {
    return "";
  }
}

function replacePreviewTargetInUrl(target: string): void {
  try {
    const url = new URL(window.location.href);
    if (target) url.searchParams.set("target", target);
    else url.searchParams.delete("target");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Preview selection still works if URL mutation is unavailable.
  }
}

export function AgentsPage({
  form,
  onNavigate,
  route,
  setForm,
}: {
  form: FormState;
  onNavigate: (route: AppRoute) => void;
  route: Extract<AppRoute, { kind: "workspace" }>;
  setForm: (updates: Partial<FormState>) => void;
}) {
  const [payload, setPayload] = useState<AgentsPreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewTarget, setPreviewTarget] = useState(previewTargetFromLocation);
  const [previewTargetDraft, setPreviewTargetDraft] = useState(previewTargetFromLocation);
  const [previousAttempt, setPreviousAttempt] = useState<KernelPreviousAttemptVariant>("rollback");
  const [compilerDelta, setCompilerDelta] = useState<KernelCompilerDeltaVariant>("present");
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleWidth, setStyleWidth] = useState(PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH);
  const {
    settings: styleSettings,
    update: updateStyleSettings,
    reset: resetStyleSettings,
  } = usePromptStyleSettings();
  const agents = payload?.agents ?? [];
  const selectedAgent = agents.find((agent) => agent.name === route.agent) ?? agents[0] ?? null;
  const selectedAgentName = selectedAgent?.name ?? null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextPayload = await fetchKernelAgents(form, {
          ...(previewTarget ? { target: previewTarget } : {}),
          // Default (rollback) keeps the request unchanged for games without a steering gate.
          ...(previousAttempt !== "rollback" ? { previousAttempt } : {}),
          // Default (present) keeps the request unchanged unless a variant is chosen.
          ...(compilerDelta !== "present" ? { compilerDelta } : {}),
        });
        if (cancelled) return;
        setPayload(nextPayload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [form.graphDbPath, form.gameId, form.repoRoot, form.stateDir, form.usePathOverrides, previewTarget, previousAttempt, compilerDelta]);

  function applyPreviewTarget() {
    const target = previewTargetDraft.trim();
    setPreviewTargetDraft(target);
    replacePreviewTargetInUrl(target);
    setPreviewTarget(target);
  }

  function selectAgent(name: string) {
    onNavigate({
      kind: "workspace",
      section: "agents",
      agent: name,
      gameId: route.gameId,
    });
    replacePreviewTargetInUrl(previewTarget);
  }

  return (
    <div className="kernel-reference-workspace min-h-0 flex-1 overflow-auto bg-background p-4 font-sans text-foreground">
      {error ? (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      {payload?.warnings.length ? (
        <div className="mb-4 rounded-lg border border-status-warning-border bg-status-warning-fill px-3.5 py-3 text-sm text-status-warning">
          {payload.warnings.join(" ")}
        </div>
      ) : null}
      <section className="flex h-[calc(100vh-2rem)] min-h-[620px] min-w-[860px] flex-col overflow-hidden rounded-lg border border-border bg-card">
        <header className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate font-display text-lg font-bold leading-tight">Agents</h1>
            <span className="flex-1" />
            {payload?.stackFramePolicy ? (
              <span
                className="shrink-0 rounded-[2px] border border-border px-2 py-1 text-xs text-muted-foreground"
                title="Worker prompt variant for this game's matching.stackFramePolicy"
              >
                {STACK_FRAME_POLICY_LABELS[payload.stackFramePolicy]}
              </span>
            ) : null}
            {payload?.steeringGate && payload.steeringGate !== "off" ? (
              <div
                aria-label="Worker previous_attempt sample"
                className={PREVIOUS_ATTEMPT_STYLES.group}
                role="radiogroup"
                title="Which previous_attempt variant the worker sample renders"
              >
                <span className={`${PREVIOUS_ATTEMPT_STYLES.cell} ${PREVIOUS_ATTEMPT_STYLES.muted}`}>previous_attempt</span>
                {PREVIOUS_ATTEMPT_OPTIONS.map((option) => {
                  const active = (payload.previousAttempt ?? previousAttempt) === option.id;
                  return (
                    <button
                      aria-checked={active}
                      className={`${PREVIOUS_ATTEMPT_STYLES.cell} ${active ? PREVIOUS_ATTEMPT_STYLES.active : PREVIOUS_ATTEMPT_STYLES.idle}`}
                      key={option.id}
                      onClick={() => setPreviousAttempt(option.id)}
                      role="radio"
                      title={option.title}
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {payload?.steeringGate === "enforce" ? (
              <div
                aria-label="Worker compiler_delta sample"
                className={PREVIOUS_ATTEMPT_STYLES.group}
                role="radiogroup"
                title="Which compiler_delta variant the worker sample's steering_probe renders"
              >
                <span className={`${PREVIOUS_ATTEMPT_STYLES.cell} ${PREVIOUS_ATTEMPT_STYLES.muted}`}>compiler_delta</span>
                {COMPILER_DELTA_OPTIONS.map((option) => {
                  const active = (payload.compilerDelta ?? compilerDelta) === option.id;
                  return (
                    <button
                      aria-checked={active}
                      className={`${PREVIOUS_ATTEMPT_STYLES.cell} ${active ? PREVIOUS_ATTEMPT_STYLES.active : PREVIOUS_ATTEMPT_STYLES.idle}`}
                      key={option.id}
                      onClick={() => setCompilerDelta(option.id)}
                      role="radio"
                      title={option.title}
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {loading ? (
              <span className="shrink-0 rounded-[2px] border border-border px-2 py-1 text-xs text-muted-foreground">
                Loading
              </span>
            ) : null}
          </div>
        </header>

        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {selectedAgent?.warnings.length ? (
              <div className="shrink-0 border-b border-status-warning-border bg-status-warning-fill px-3.5 py-2 text-xs text-status-warning">
                {selectedAgent.warnings.join(" ")}
              </div>
            ) : null}
            <form
              className="flex shrink-0 items-end gap-2 border-b border-border px-3.5 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                applyPreviewTarget();
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  Preview target
                </span>
                <input
                  className="h-8 w-full rounded-[2px] border border-border bg-background px-2.5 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-status-info-border"
                  onChange={(event) => setPreviewTargetDraft(event.currentTarget.value)}
                  placeholder="unit:symbol"
                  spellCheck={false}
                  value={previewTargetDraft}
                />
              </label>
              <button
                className="h-8 shrink-0 rounded-[2px] border border-border bg-card px-3 text-xs font-medium text-foreground hover:border-muted-foreground"
                type="submit"
              >
                Apply
              </button>
              <p className="max-w-72 pb-0.5 text-[11px] leading-4 text-muted-foreground">
                Only affects the worker preview. Example: main/melee/mn/mnvibration:mnVibration_HandleInput
              </p>
            </form>
            <div className="relative flex min-h-0 flex-1 flex-col">
              <button
                type="button"
                aria-label="Toggle style sidebar"
                aria-pressed={styleOpen}
                onClick={() => setStyleOpen((open) => !open)}
                className={`absolute right-2 top-2 z-30 rounded-[2px] border px-2 py-0.5 font-mono text-[10px] lowercase tracking-[0.08em] transition-colors ${
                  styleOpen
                    ? "border-status-info-border bg-card text-foreground"
                    : "border-transparent bg-card/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                ◧ style
              </button>
              <AgentCatalogViewer
                agents={agents}
                selectedName={selectedAgentName}
                onSelectedNameChange={selectAgent}
                groupOrder={["running", "knowledge", "pr"]}
                groupLabels={{
                  running: "Running",
                  knowledge: "Knowledge",
                  pr: "Pull requests",
                }}
                toolsZone={(agent) =>
                  "renderedTools" in agent && typeof agent.renderedTools === "string"
                    ? { renderedTools: agent.renderedTools }
                    : undefined
                }
                configZone={{
                  model: form.model || null,
                  modelOptions: [...RUN_MODEL_OPTIONS],
                  onModelChange: (model) => setForm({ model }),
                }}
                useAgentDefinitions
                styleSettings={styleSettings}
                editable={false}
                emptyState={loading ? "Loading agents" : "No agents available."}
                className="min-h-0 flex-1"
              />
            </div>
          </div>

          <PromptStyleSidebar
            docked
            open={styleOpen}
            width={styleWidth}
            settings={styleSettings}
            onChange={updateStyleSettings}
            onReset={resetStyleSettings}
            onClose={() => setStyleOpen(false)}
            onWidthChange={(width) => setStyleWidth(clampPromptStyleSidebarWidth(width))}
          />
        </main>
      </section>
    </div>
  );
}
