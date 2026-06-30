import { ChevronRight, Wrench } from "@/icons";
import { num, type StandardExampleRecord } from "@/lib/format";
import { ExampleCodeBlock } from "../shared/ExampleCodeBlock";
import { MetadataChip } from "../shared/MetadataChip";
import { DescriptionBullets } from "../shared/lists";

export function StandardRepairsColumn({
  examples,
  onClose,
  preferredRepairs,
}: {
  examples: StandardExampleRecord[];
  onClose?: () => void;
  preferredRepairs: string[];
}) {
  const hasRepairs = preferredRepairs.length > 0;
  const hasExamples = examples.length > 0;
  const total = preferredRepairs.length + examples.length;
  return (
    <aside className="flex h-full min-h-0 flex-col bg-inset">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Wrench className="shrink-0 text-dim" size={13} />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-dim">
            Repairs<span className="ml-1 text-faint tabular-nums">{num(total)}</span>
          </span>
        </div>
        {onClose ? (
          <button className="inline-flex h-6 w-6 items-center justify-center text-faint hover:text-fg" onClick={onClose} title="Collapse repairs" type="button">
            <ChevronRight size={14} />
          </button>
        ) : null}
      </div>
      {!hasRepairs && !hasExamples ? (
        <p className="m-0 px-3 py-4 text-xs text-faint">No repairs or examples recorded for this standard.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {hasRepairs ? (
            <section className="border-t border-line first:border-t-0">
              <div className="flex items-center justify-between bg-card px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-dim">Preferred Repairs</span>
                <span className="text-[10px] tabular-nums text-faint">{num(preferredRepairs.length)}</span>
              </div>
              <ul aria-label="Preferred repairs" className="preferred-repair-list">
                {preferredRepairs.map((item, index) => (
                  <li key={`${item.slice(0, 40)}-${index}`}>
                    <span aria-hidden="true" className="preferred-repair-bullet">
                      •
                    </span>
                    <span className="preferred-repair-text">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {hasExamples ? (
            <section className="border-t border-line first:border-t-0">
              <div className="flex items-center justify-between bg-card px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-dim">Examples</span>
                <span className="text-[10px] tabular-nums text-faint">{num(examples.length)}</span>
              </div>
              {examples.map((example, index) => (
                <div className="border-t border-line px-3 py-3 first:border-t-0" key={example.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {index === 0 ? <MetadataChip label="context" value="canonical" /> : null}
                    <MetadataChip value={example.severity} />
                    {example.qaRuleId ? <MetadataChip label="rule" value={example.qaRuleId} /> : null}
                  </div>
                  <ExampleCodeBlock label="Flag" value={example.badPattern} />
                  <ExampleCodeBlock label="Fix" value={example.preferredShape} />
                  <DescriptionBullets items={example.description} />
                </div>
              ))}
            </section>
          ) : null}
        </div>
      )}
    </aside>
  );
}
