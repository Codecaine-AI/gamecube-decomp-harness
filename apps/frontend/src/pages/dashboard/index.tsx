import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/api";
import type { HarnessStateReadModel } from "@/pages/workspace/_lib/types";
import { ChevronRight, Plus, RefreshCw } from "@/icons";
import { type Dashboard, type FormState, type GameSummary, type UiConfig } from "@/lib/format";
import { type AppRoute } from "@/routing";
import { Button, PageHeader, PanelSection } from "@/components/primitives";

export interface GameDashboardProps {
  busy: boolean;
  config: UiConfig | null;
  dashboard: Dashboard | null;
  errorMessage: string;
  form: FormState;
  onAction: (action: "refresh") => void;
  onDismissError: () => void;
  onNavigate: (route: AppRoute) => void;
}

interface GameCardSummary {
  game: GameSummary;
}

export function DashboardPage(props: GameDashboardProps) {
  const available = props.config?.availableGames ?? [];
  const cards: GameCardSummary[] = available.map((game) => ({ game }));
  // Fall back to the payload game if no games are registered.
  const fallback = props.dashboard?.game;
  if (cards.length === 0 && fallback) {
    cards.push({ game: fallback });
  }

  return (
    <section className="flex min-w-0 flex-col overflow-hidden bg-panel">
      {props.errorMessage ? (
        <div className="flex w-full shrink-0 items-start gap-2.5 border-b border-down/40 bg-down/10 px-3 py-1.5 text-xs text-down">
          <span className="min-w-0 flex-1 whitespace-normal break-words">{props.errorMessage}</span>
          <button className="shrink-0 text-down/80 hover:text-down" onClick={props.onDismissError} type="button">dismiss</button>
        </div>
      ) : null}
      <PageHeader kicker="Decomp Orchestrator" title="Games" />
      <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 min-h-0 flex-1 overflow-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 text-sm text-soft">
            Open a game to reach its workspace: overview, harness, standards, and settings.
          </p>
          <Button icon={<RefreshCw size={14} />} disabled={props.busy} onClick={() => props.onAction("refresh")} type="button">Refresh</Button>
        </div>
        <div className="grid gap-4">
          {cards.map((card) => (
            <GameCard
              key={card.game.id}
              summary={card}
              onOpen={() => props.onNavigate({ kind: "workspace", section: "overview", gameId: card.game.id })}
            />
          ))}
          <AddGameCard />
        </div>
      </div>
    </section>
  );
}

function GameCard({ onOpen, summary }: { onOpen: () => void; summary: GameCardSummary }) {
  const { game } = summary;
  const [harness, setHarness] = useState<HarnessStateReadModel | null>(null);
  const [status, setStatus] = useState("Loading state…");
  useEffect(() => {
    let current = true;
    const refresh = () => fetchJson<{ harness: HarnessStateReadModel }>(`/api/harness?gameId=${encodeURIComponent(game.id)}`)
      .then(data => { if (current) { setHarness(data.harness); setStatus(data.harness.execution.status); } })
      .catch(error => { if (current) { setHarness(null); setStatus(error.message); } });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 10000);
    return () => { current = false; clearInterval(timer); };
  }, [game.id]);
  return (
    <PanelSection>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.16em] text-dim">{game.kind || "game"}</div>
          <h3 className="m-0 mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-bold text-fg">{game.displayName}</h3>
        </div>
        <span className="shrink-0 text-[11px] uppercase text-dim">{status}</span>
      </div>
      <dl className="m-0 mt-3 grid gap-1.5">
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
          <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Harness</dt>
          <dd className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-soft">{harness?.identity.harness_id ?? status}</dd>
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
          <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Head</dt>
          <dd className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-soft" title={harness?.source.head ?? undefined}>{harness?.source.head?.slice(0, 8) ?? "-"}</dd>
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
          <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Gate</dt>
          <dd className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-soft">{harness ? Object.entries(harness.readiness).filter(([, value]) => value !== "ready").map(([key, value]) => `${key}: ${value}`).join(", ") || "Ready" : status}</dd>
        </div>
        <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
          <dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Process</dt>
          <dd className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-dim">{game.processName}</dd>
        </div>
      </dl>
      <div className="mt-4">
        <Button className="w-full" icon={<ChevronRight size={13} />} onClick={onOpen} tone="primary" type="button">Open Game</Button>
      </div>
    </PanelSection>
  );
}

function AddGameCard() {
  return (
    <button
      className="flex min-h-[180px] flex-col items-center justify-center gap-3 border border-dashed border-line2 bg-card p-4 text-center text-dim hover:border-faint hover:text-soft"
      title="Multiple-game descriptors are not editable from the UI yet."
      type="button"
    >
      <Plus size={20} />
      <span className="text-xs font-bold uppercase tracking-[0.12em]">Add Game</span>
      <span className="max-w-[16rem] text-[11px] leading-snug text-faint">
        Register a game descriptor under <code>games/</code> to add it here. The dashboard lists every configured game automatically.
      </span>
    </button>
  );
}
