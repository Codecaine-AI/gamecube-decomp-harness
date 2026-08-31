import { useEffect, useMemo, useState } from "react";
import { ensurePromptNodeIds } from "@codecaine-ai/prompt-kit";
import { PromptInlineLab, type LabContextPreview } from "@codecaine-ai/prompt-kit/ui/lab";
import {
  PromptStyleSidebar,
  PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH,
  clampPromptStyleSidebarWidth,
  usePromptStyleSettings,
} from "@codecaine-ai/prompt-kit/ui/style";
import {
  fetchKernelAgents,
  type KernelAgentDefinition,
  type KernelAgentGroup,
  type KernelAgentsPayload,
} from "@/lib/api";
import type { FormState } from "@/lib/format";

const AGENT_GROUPS: Array<{ id: KernelAgentGroup; label: string }> = [
  { id: "running", label: "Running" },
  { id: "knowledge", label: "Knowledge" },
  { id: "pr", label: "Pull requests" },
];

function contextPreview(agent: KernelAgentDefinition): LabContextPreview | undefined {
  if (!agent.context) return undefined;
  return {
    modulePath: agent.context.modulePath,
    renderedContext: agent.context.renderedContext,
    inputs: agent.context.inputs.map((input) => ({
      loaderKind: input.loaderKind,
      inputRef: input.inputRef,
      status: input.status,
      bytes: input.bytes,
    })),
  };
}

export function AgentsPage({ form }: { form: FormState }) {
  const [payload, setPayload] = useState<KernelAgentsPayload | null>(null);
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleWidth, setStyleWidth] = useState(PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH);
  const {
    settings: styleSettings,
    update: updateStyleSettings,
    reset: resetStyleSettings,
  } = usePromptStyleSettings();
  const agents = payload?.agents ?? [];
  const selectedAgent = agents.find((agent) => agent.name === selectedAgentName) ?? null;
  const selectedPrompt = useMemo(
    () => (selectedAgent?.prompt ? ensurePromptNodeIds(selectedAgent.prompt) : null),
    [selectedAgent?.prompt],
  );
  const selectedContext = useMemo(
    () => (selectedAgent ? contextPreview(selectedAgent) : undefined),
    [selectedAgent],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const nextPayload = await fetchKernelAgents(form);
        if (cancelled) return;
        setPayload(nextPayload);
        setSelectedAgentName((current) =>
          current && nextPayload.agents.some((agent) => agent.name === current)
            ? current
            : nextPayload.agents[0]?.name ?? null,
        );
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
  }, [form.graphDbPath, form.gameId, form.repoRoot, form.stateDir, form.usePathOverrides]);

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
      <section className="grid h-[calc(100vh-2rem)] min-h-[620px] min-w-[860px] grid-cols-[260px_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card">
        <aside className="flex min-h-0 min-w-0 flex-col border-r border-border">
          <header className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold leading-tight">Agents</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {agents.length} {agents.length === 1 ? "agent" : "agents"}
                </p>
              </div>
              {loading ? (
                <span className="shrink-0 rounded-[2px] border border-border px-2 py-1 text-xs text-muted-foreground">
                  Loading
                </span>
              ) : null}
            </div>
          </header>

          <nav aria-label="Agent catalog" className="min-h-0 flex-1 overflow-y-auto py-2">
            {!loading && agents.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No agents available.</p>
            ) : null}
            {AGENT_GROUPS.map((group) => {
              const groupAgents = agents.filter((agent) => agent.group === group.id);
              if (groupAgents.length === 0) return null;
              return (
                <section key={group.id} className="pb-3">
                  <h2 className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {group.label}
                  </h2>
                  <div>
                    {groupAgents.map((agent) => {
                      const selected = agent.name === selectedAgentName;
                      return (
                        <button
                          key={agent.name}
                          type="button"
                          aria-current={selected ? "page" : undefined}
                          onClick={() => setSelectedAgentName(agent.name)}
                          className={`relative w-full border-y border-transparent px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-status-info-border ${
                            selected
                              ? "border-border bg-muted text-foreground"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          }`}
                        >
                          {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
                          <span className="block truncate font-mono text-xs font-semibold">{agent.name}</span>
                          <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                            {agent.model}{agent.tools.length === 0 ? " · no tools" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </nav>
        </aside>

        <main className="flex min-h-0 min-w-0 overflow-hidden">
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {selectedAgent ? (
              <div className="flex h-full min-h-0 flex-col">
                {selectedAgent.warnings.length ? (
                  <div className="shrink-0 border-b border-status-warning-border bg-status-warning-fill px-3.5 py-2 text-xs text-status-warning">
                    {selectedAgent.warnings.join(" ")}
                  </div>
                ) : null}
                <div className="relative min-h-0 flex-1 overflow-hidden">
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
                  {selectedPrompt ? (
                    <PromptInlineLab
                      key={selectedAgent.name}
                      prompt={selectedPrompt}
                      context={selectedContext}
                      manifest={{
                        name: selectedAgent.name,
                        model: selectedAgent.model,
                        description: selectedAgent.description,
                        modelAliases: [],
                        editable: false,
                      }}
                      styleSettings={styleSettings}
                      className="h-full"
                    />
                  ) : (
                    <div className="flex h-full min-h-0 flex-col bg-background p-5 font-mono">
                      <div className="mb-4 shrink-0 rounded-[3px] border border-status-warning-border bg-status-warning-fill px-3 py-2 text-xs text-status-warning">
                        structured prompt unavailable
                      </div>
                      <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-[3px] border border-border bg-card p-4 text-xs leading-5 text-foreground">
                        {selectedAgent.renderedPrompt?.content ?? selectedAgent.body}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
                {loading ? "Loading agents" : "Select an agent"}
              </div>
            )}
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
