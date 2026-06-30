import { Pencil } from "@/icons";
import { Button } from "@/components/primitives";
import type { StandardExampleRecord, StandardRecord } from "@/lib/format";
import { ExampleCodeBlock } from "../shared/ExampleCodeBlock";
import { MetadataChip } from "../shared/MetadataChip";
import { DescriptionBullets, StandardSummaryList } from "../shared/lists";
import {
  familyLabel,
  prettySlug,
  shortStandardId,
  statusTone,
} from "../shared/standards-model";

export function StandardDetail({
  examples,
  onEdit,
  record,
}: {
  examples: StandardExampleRecord[];
  onEdit: () => void;
  record: StandardRecord;
}) {
  const rows: Array<{
    label: string;
    value?: string;
    tone?: string;
    title?: string;
  }> = [
    { label: "Status", value: record.status, tone: statusTone(record.status) },
    {
      label: "Family",
      value: record.family ? familyLabel(record.family) : undefined,
      title: record.family ?? undefined,
    },
    { label: "Disposition", value: record.disposition },
    { label: "Severity", value: record.severity },
    { label: "QA", value: record.qaEnforcement },
    {
      label: "Worker",
      value: record.workerFacing === false ? "not injected" : "injected",
    },
    { label: "Retired Into", value: record.retiredInto ?? undefined },
    { label: "Examples", value: String(examples.length) },
  ].filter((row) => row.value);

  return (
    <div className="p-5 lg:p-6">
      <div className="flex items-start justify-between gap-3">
        <h3
          className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[18px] font-bold leading-snug text-fg"
          title={record.title || shortStandardId(record.id)}
        >
          {record.title || shortStandardId(record.id)}
        </h3>
        <Button
          className="shrink-0"
          icon={<Pencil size={13} />}
          onClick={onEdit}
          type="button"
        >
          Edit
        </Button>
      </div>
      <div className="mt-5 grid gap-5">
        <section className="grid gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-dim">
            Description
          </div>
          <StandardSummaryList items={record.summary} />
        </section>

        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-dim">
              Code Examples
            </div>
            <div className="flex flex-wrap gap-1.5">
              {rows.map((row) => (
                <MetadataChip
                  key={row.label}
                  label={row.label}
                  value={row.value}
                />
              ))}
            </div>
          </div>
          {examples.length === 0 ? (
            <div className="border border-line bg-card px-3 py-4 text-[13px] text-faint">
              No code examples recorded for this standard.
            </div>
          ) : (
            examples.map((example, index) => {
              const isCanonical =
                example.id === record.canonicalExample?.id || index === 0;
              return (
                <article
                  className="overflow-hidden border border-line bg-card"
                  key={example.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-raised px-3 py-2">
                    <div
                      className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] font-bold text-fg"
                      title={example.id}
                    >
                      {prettySlug(example.id)}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {isCanonical ? (
                        <MetadataChip label="context" value="canonical" />
                      ) : null}
                      <MetadataChip value={example.severity} />
                      {example.qaRuleId ? (
                        <MetadataChip label="rule" value={example.qaRuleId} />
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 p-3 xl:grid-cols-2">
                    <ExampleCodeBlock label="Bad" value={example.badPattern} />
                    <ExampleCodeBlock
                      label="Good"
                      value={example.preferredShape}
                    />
                  </div>
                  <div className="border-t border-line px-3 py-3">
                    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">
                      Why
                    </div>
                    <DescriptionBullets items={example.description} />
                  </div>
                </article>
              );
            })
          )}
        </section>

        {record.qaRuleIds?.length ? (
          <section className="grid gap-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-dim">
              Metadata
            </div>
            <div className="flex flex-wrap gap-1.5">
              {record.qaRuleIds?.map((ruleId) => (
                <MetadataChip key={ruleId} label="rule" value={ruleId} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
