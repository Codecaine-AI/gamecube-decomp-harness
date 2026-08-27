import { useEffect, useState } from "react";
import { formatElapsed } from "@/components/details-rail/_lib/time";
import { STEP_GLYPHS, type BoundaryStepRow } from "../_lib/boundary-model";

export function StepRow({ row }: { row: BoundaryStepRow }) {
  const [expanded, setExpanded] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (row.state !== "running") return;
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, [row.state]);
  const glyph = STEP_GLYPHS[row.state];
  const duration = row.state === "running" ? formatElapsed(row.startedAt) : row.duration;
  return (
    <div className="border-t border-line first:border-t-0">
      <button className={`grid w-full grid-cols-[14px_minmax(0,1fr)_auto] items-baseline gap-2 px-2.5 py-2 text-left text-xs ${row.expandable ? "cursor-pointer hover:bg-raised" : "cursor-default"}`} disabled={!row.expandable} onClick={() => setExpanded((value) => !value)} type="button">
        <span className={glyph.className}>{glyph.glyph}</span>
        <span className={`min-w-0 ${row.state === "pending" || row.state === "skipped" ? "text-dim" : "text-soft"}`}>
          <span className="text-fg">{row.label}</span>{row.detail ? <span className="text-dim"> · {row.detail}</span> : null}
        </span>
        <span className="whitespace-nowrap text-dim">{duration}{row.expandable ? (expanded ? " ▴" : " ▾") : ""}</span>
      </button>
      {expanded ? <StepExpansion row={row} /> : null}
    </div>
  );
}

function StepExpansion({ row }: { row: BoundaryStepRow }) {
  if (!row.expansion) return <div className="border-t border-line bg-card px-8 py-2 text-xs text-dim">No structured details were reported.</div>;
  return <div className="grid gap-2 border-t border-line bg-card px-8 py-2 text-xs">
    {row.expansion.facts.map(([label, value]) => <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-2" key={label}><span className="text-dim">{label}</span><span className="break-all text-soft">{value}</span></div>)}
    {row.expansion.sections.map((section) => <div className="border border-line bg-panel" key={section.label}><div className="border-b border-line px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">{section.label}</div><ul className="m-0 grid gap-1 p-2 text-soft">{section.values.map((value, index) => <li className="list-none break-words" key={`${index}-${value}`}>{value}</li>)}{section.remaining ? <li className="list-none text-dim">…and {section.remaining} more</li> : null}</ul></div>)}
  </div>;
}
