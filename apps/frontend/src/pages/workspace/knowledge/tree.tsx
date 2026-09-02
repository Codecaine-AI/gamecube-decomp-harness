import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/primitives";
import { ChevronDown, ChevronRight, ListTree } from "@/icons";

import {
  fetchKnowledgeEntities,
  fetchKnowledgeSearch,
  fetchKnowledgeTree,
  fetchKnowledgeUnitTargets,
  type KnowledgeEntity,
  type KnowledgeSearchHit,
  type KnowledgeTreeNode,
  type KnowledgeUnitTargets,
  type SubjectIdentity,
} from "./api";

function badge(value: number, title: string) {
  return <span className="shrink-0 border border-line px-1 text-[9px] tabular-nums text-faint" title={title}>{value}</span>;
}

function subjectKey(subject: SubjectIdentity | null | undefined): string | null {
  if (!subject) return null;
  return subject.subjectKind === "target" ? `target:${subject.stableKey}` : `entity:${subject.locator}`;
}

function targetSubject(unit: string, target: KnowledgeUnitTargets["targets"][number]): SubjectIdentity {
  return {
    subjectKind: "target",
    id: target.target_id,
    kind: target.kind,
    stableKey: target.stable_key,
    unit,
    symbol: target.symbol,
    address: target.address,
    identityStatus: "",
  };
}

function entitySubject(entity: Pick<KnowledgeEntity, "id" | "kind" | "locator">): SubjectIdentity {
  return { subjectKind: "entity", id: entity.id, kind: entity.kind, locator: entity.locator, identityStatus: "" };
}

function TargetRows({
  data,
  onSelectSubject,
  selectedKey,
}: {
  data: KnowledgeUnitTargets;
  onSelectSubject: (subject: SubjectIdentity) => void;
  selectedKey: string | null;
}) {
  return (
    <div className="border-t border-line bg-inset/60">
      {data.unit_entity ? (
        <button
          className={`flex w-full items-center gap-2 border-l-2 px-2 py-1.5 pl-8 text-left hover:bg-raised ${selectedKey === `entity:${data.unit_entity.locator}` ? "border-l-accent bg-panel" : "border-l-transparent"}`}
          onClick={() => onSelectSubject(entitySubject({ ...data.unit_entity!, kind: "translation_unit" }))}
          type="button"
        >
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-soft">Unit record</span>
          {badge(data.unit_entity.fact_count, "Facts")}
        </button>
      ) : null}
      {data.targets.map((target) => {
        const key = `target:${target.stable_key}`;
        return (
          <button
            className={`flex w-full items-start gap-2 border-l-2 px-2 py-1.5 pl-8 text-left hover:bg-raised ${selectedKey === key ? "border-l-accent bg-panel" : "border-l-transparent"}`}
            key={target.target_id}
            onClick={() => onSelectSubject(targetSubject(data.unit, target))}
            type="button"
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-mono text-[11px] text-soft" title={target.symbol ?? target.stable_key}>{target.symbol ?? target.stable_key}</span>
                {target.has_inferred_name ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Has inferred name" /> : null}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[9px] text-dim">
                <span className="status-tag">{target.kind.replace(/_/g, " ")}</span>
                <span className="tabular-nums">{target.match_pct === null ? "-" : `${target.match_pct}%`}</span>
              </span>
            </span>
            {badge(target.fact_count, "Facts")}
          </button>
        );
      })}
      {data.targets.length === 0 && !data.unit_entity ? <div className="px-8 py-2 text-[11px] text-dim">No records in this unit.</div> : null}
    </div>
  );
}

export function KnowledgeTree({
  game,
  onExpandedUnitsChange,
  onSelectSubject,
  revealUnit,
  selectedSubject,
}: {
  game?: string;
  onExpandedUnitsChange?: (units: Set<string>) => void;
  onSelectSubject: (subject: SubjectIdentity) => void;
  revealUnit?: string | null;
  selectedSubject?: SubjectIdentity | null;
}) {
  const [root, setRoot] = useState<KnowledgeTreeNode | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [units, setUnits] = useState<Record<string, KnowledgeUnitTargets | "loading" | "error">>({});
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<KnowledgeSearchHit[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showConcepts, setShowConcepts] = useState(false);
  const [entities, setEntities] = useState<KnowledgeEntity[] | null>(null);
  const [entitiesError, setEntitiesError] = useState<string | null>(null);
  const selectedKey = subjectKey(selectedSubject);

  useEffect(() => {
    let current = true;
    setRoot(null);
    setTreeError(null);
    setExpanded(new Set());
    setUnits({});
    setEntities(null);
    fetchKnowledgeTree(game).then((value) => current && setRoot(value.root)).catch((error: unknown) => current && setTreeError(error instanceof Error ? error.message : String(error)));
    return () => { current = false; };
  }, [game]);

  useEffect(() => {
    const query = search.trim();
    if (!query) {
      setHits(null);
      setSearchError(null);
      return;
    }
    let current = true;
    setHits(null);
    const timer = window.setTimeout(() => {
      setSearchError(null);
      fetchKnowledgeSearch(query, game).then((value) => current && setHits(value.hits)).catch((error: unknown) => {
        if (current) setSearchError(error instanceof Error ? error.message : String(error));
      });
    }, 300);
    return () => { current = false; window.clearTimeout(timer); };
  }, [game, search]);

  useEffect(() => {
    if (!showConcepts || entities !== null) return;
    let current = true;
    setEntitiesError(null);
    Promise.all([fetchKnowledgeEntities("game_concept", game, { limit: 500 }), fetchKnowledgeEntities("pattern", game, { limit: 500 })])
      .then(([concepts, patterns]) => current && setEntities([...concepts.entities, ...patterns.entities]))
      .catch((error: unknown) => current && setEntitiesError(error instanceof Error ? error.message : String(error)));
    return () => { current = false; };
  }, [entities, game, showConcepts]);

  const loadUnit = (unit: string) => {
    if (units[unit]) return;
    setUnits((value) => ({ ...value, [unit]: "loading" }));
    fetchKnowledgeUnitTargets(unit, game)
      .then((value) => setUnits((current) => ({ ...current, [unit]: value })))
      .catch(() => setUnits((current) => ({ ...current, [unit]: "error" })));
  };

  const setPathExpanded = (path: string) => {
    setExpanded((value) => {
      const next = new Set(value);
      const segments = path.split("/");
      for (let index = 1; index <= segments.length; index += 1) next.add(segments.slice(0, index).join("/"));
      onExpandedUnitsChange?.(next);
      return next;
    });
    loadUnit(path);
  };

  useEffect(() => {
    if (revealUnit) setPathExpanded(revealUnit);
    // setPathExpanded changes with cached unit data; only react to navigation requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealUnit]);

  const toggleNode = (node: KnowledgeTreeNode) => {
    setExpanded((value) => {
      const next = new Set(value);
      if (next.has(node.path)) next.delete(node.path);
      else next.add(node.path);
      onExpandedUnitsChange?.(next);
      return next;
    });
    if (node.kind === "unit" && !expanded.has(node.path)) loadUnit(node.path);
  };

  const rows = useMemo(() => root?.children ?? [], [root]);
  const renderNode = (node: KnowledgeTreeNode, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(node.path);
    const unitData = units[node.path];
    return (
      <div key={`${node.kind}:${node.path}`}>
        <button
          aria-expanded={isExpanded}
          className="flex w-full items-center gap-1.5 border-l-2 border-l-transparent py-1.5 pr-2 text-left text-soft hover:bg-raised hover:text-fg"
          onClick={() => toggleNode(node)}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          title={node.path}
          type="button"
        >
          {isExpanded ? <ChevronDown className="shrink-0 text-dim" size={12} /> : <ChevronRight className="shrink-0 text-dim" size={12} />}
          <span className={`min-w-0 flex-1 truncate text-[11px] ${node.kind === "unit" ? "font-mono" : "font-semibold"}`}>{node.name}</span>
          {node.kind === "unit" ? badge(node.target_count, "Targets") : null}
          {node.fact_count > 0 ? badge(node.fact_count, "Facts") : null}
        </button>
        {isExpanded && node.kind === "dir" ? node.children?.map((child) => renderNode(child, depth + 1)) : null}
        {isExpanded && node.kind === "unit" ? (
          unitData === "loading" || unitData === undefined ? <div className="px-8 py-2 text-[11px] text-dim">Loading records...</div>
            : unitData === "error" ? <EmptyState className="m-2 py-2 text-[11px]">Could not load unit records.</EmptyState>
              : <TargetRows data={unitData} onSelectSubject={onSelectSubject} selectedKey={selectedKey} />
        ) : null}
      </div>
    );
  };

  return (
    <aside className="flex min-h-0 flex-col border-r border-line bg-inset">
      <div className="shrink-0 border-b border-line p-2">
        <label className="block">
          <span className="sr-only">Search knowledge</span>
          <input className="w-full text-[12px]" onChange={(event) => setSearch(event.target.value)} placeholder="Search facts and subjects..." type="search" value={search} />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {search.trim() ? (
          <div className="p-2">
            {searchError ? <EmptyState className="text-[11px]">Search failed: {searchError}</EmptyState>
              : hits === null ? <EmptyState className="text-[11px]">Searching...</EmptyState>
                : hits.length === 0 ? <EmptyState className="text-[11px]">No matching knowledge.</EmptyState>
                  : hits.map((hit, index) => (
                    <button className="block w-full border-b border-line px-2 py-2 text-left last:border-b-0 hover:bg-raised" key={`${subjectKey(hit.subject)}:${hit.fact_type ?? "subject"}:${index}`} onClick={() => onSelectSubject(hit.subject)} type="button">
                      <span className="block truncate font-mono text-[11px] text-soft">{hit.subject.subjectKind === "target" ? hit.subject.stableKey : hit.subject.locator}</span>
                      <span className="mt-0.5 block line-clamp-2 text-[10px] text-dim">{hit.fact_type ? `${hit.fact_type.replace(/_/g, " ")}: ` : ""}{hit.snippet}</span>
                    </button>
                  ))}
          </div>
        ) : treeError ? <EmptyState className="m-2 text-[11px]">Could not load tree: {treeError}</EmptyState>
          : root === null ? <EmptyState className="m-2 text-[11px]">Loading knowledge tree...</EmptyState>
            : rows.length === 0 ? <EmptyState className="m-2 text-[11px]">No indexed units.</EmptyState>
              : <div className="py-1">{rows.map((node) => renderNode(node, 0))}</div>}
      </div>
      <div className="shrink-0 border-t border-line">
        <button aria-expanded={showConcepts} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-[0.1em] text-soft hover:bg-raised" onClick={() => setShowConcepts((value) => !value)} type="button">
          {showConcepts ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <ListTree size={12} />
          <span className="flex-1">Concepts &amp; patterns</span>
        </button>
        {showConcepts ? (
          <div className="max-h-52 overflow-y-auto border-t border-line py-1">
            {entitiesError ? <EmptyState className="m-2 py-2 text-[11px]">Could not load entities: {entitiesError}</EmptyState>
              : entities === null ? <div className="px-3 py-2 text-[11px] text-dim">Loading entities...</div>
                : entities.length === 0 ? <div className="px-3 py-2 text-[11px] text-dim">No concepts or patterns.</div>
                  : entities.map((entity) => (
                    <button className={`flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left hover:bg-raised ${selectedKey === `entity:${entity.locator}` ? "border-l-accent bg-panel" : "border-l-transparent"}`} key={entity.id} onClick={() => onSelectSubject(entitySubject(entity))} type="button">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-soft" title={entity.locator}>{entity.locator}</span>
                      <span className="text-[9px] uppercase text-dim">{entity.kind.replace(/_/g, " ")}</span>
                      {badge(entity.link_count, "Links")}
                    </button>
                  ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
