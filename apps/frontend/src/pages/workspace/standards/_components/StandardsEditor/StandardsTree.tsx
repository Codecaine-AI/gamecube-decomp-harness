import { ChevronDown, ChevronRight, Plus } from "@/icons";
import { Button } from "@/components/primitives";
import { num, type StandardRecord } from "@/lib/format";
import { familyLabel, prettySlug, type StandardsFamilyGroup } from "../shared/standards-model";

export function StandardsTree({
  collapsedFamilies,
  groups,
  onNewRecord,
  onSelectRecord,
  onToggleFamily,
  records,
  selectedId,
  sourcePath,
}: {
  collapsedFamilies: Set<string>;
  groups: StandardsFamilyGroup[];
  onNewRecord: () => void;
  onSelectRecord: (id: string) => void;
  onToggleFamily: (family: string) => void;
  records: StandardRecord[];
  selectedId: string;
  sourcePath?: string;
}) {
  return (
    <aside className="flex min-h-0 flex-col bg-inset">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-dim" title={sourcePath}>
          Standards<span className="ml-1 text-faint tabular-nums">{num(records.length)}</span>
        </span>
        <Button icon={<Plus size={13} />} onClick={onNewRecord} title="Draft a new standard record." type="button">
          New
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <div className="px-3 py-3 text-xs text-dim">No standards found.</div>
        ) : (
          groups.map((group, index) => {
            const collapsed = collapsedFamilies.has(group.family);
            return (
              <div className={`overflow-hidden border border-line2 bg-card shadow-[0_1px_0_rgba(255,255,255,0.03)] ${index === 0 ? "" : "mt-2"}`} key={group.family}>
                <button
                  className={`flex w-full items-center gap-1.5 border-l-2 border-l-transparent bg-raised px-2.5 py-2 text-left hover:bg-card ${collapsed || group.items.length === 0 ? "" : "border-b border-line"}`}
                  onClick={() => onToggleFamily(group.family)}
                  type="button"
                >
                  {collapsed ? <ChevronRight className="shrink-0 text-dim" size={12} /> : <ChevronDown className="shrink-0 text-dim" size={12} />}
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-soft" title={group.family}>
                    {familyLabel(group.family === "unassigned" ? undefined : group.family)}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-faint">{num(group.items.length)}</span>
                </button>
                {!collapsed && group.items.length > 0
                  ? group.items.map((record, itemIndex) => {
                      const isLast = itemIndex === group.items.length - 1;
                      return (
                        <button
                          className={`flex w-full items-center border-l-2 py-1.5 pl-[30px] pr-2 text-left hover:bg-raised/80 ${selectedId === record.id ? "border-l-accent bg-panel" : "border-l-transparent bg-inset/60"} ${isLast ? "" : "border-b border-line"}`}
                          key={record.id}
                          onClick={() => onSelectRecord(record.id)}
                          type="button"
                        >
                          <span
                            className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] ${selectedId === record.id ? "font-bold text-fg" : "text-soft"}`}
                            title={record.title || prettySlug(record.id)}
                          >
                            {prettySlug(record.id)}
                          </span>
                          <span className="ml-2 shrink-0 border border-line px-1 text-[10px] font-bold tabular-nums text-faint" title="Code examples">
                            {num(record.exampleCount ?? 0)}
                          </span>
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
