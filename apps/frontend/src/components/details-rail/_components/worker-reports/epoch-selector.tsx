import { asObject, num, numberValue, shortId, text, type JsonObject } from "@/lib/format";

export type EpochOption = { count: number; id: string; label: string; ordinal: number };

export const ALL_EPOCHS = "all";
export const CURRENT_EPOCH = "";

const UNKNOWN_EPOCH = "unknown";

function epochKey(record: JsonObject): string {
  return text(record.epochId) || text(asObject(record.activeClaim).epochId) || UNKNOWN_EPOCH;
}

function epochOrdinal(record: JsonObject): number {
  return numberValue(record.epochOrdinal ?? asObject(record.activeClaim).epochOrdinal, NaN);
}

function epochLabel(id: string, ordinal: number): string {
  if (id === UNKNOWN_EPOCH) return "Unknown Epoch";
  return Number.isFinite(ordinal) ? `Epoch ${ordinal}` : `Epoch ${shortId(id)}`;
}

export function epochOptionsFor(reports: JsonObject[], knownEpochRecords: JsonObject[] = []): EpochOption[] {
  const byId = new Map<string, EpochOption>();
  function add(record: JsonObject, count: number) {
    const id = epochKey(record);
    const existing = byId.get(id);
    const ordinal = epochOrdinal(record);
    if (existing) {
      existing.count += count;
      if (!Number.isFinite(existing.ordinal) && Number.isFinite(ordinal)) {
        existing.ordinal = ordinal;
        existing.label = epochLabel(id, ordinal);
      }
      return;
    }
    byId.set(id, { id, count, ordinal, label: epochLabel(id, ordinal) });
  }
  for (const record of knownEpochRecords) add(record, 0);
  for (const report of reports) add(report, 1);
  const options = [...byId.values()].sort((left, right) => {
    if (left.id === UNKNOWN_EPOCH) return 1;
    if (right.id === UNKNOWN_EPOCH) return -1;
    if (Number.isFinite(left.ordinal) && Number.isFinite(right.ordinal)) return right.ordinal - left.ordinal;
    if (Number.isFinite(left.ordinal)) return -1;
    if (Number.isFinite(right.ordinal)) return 1;
    return right.id.localeCompare(left.id);
  });
  return [{ id: ALL_EPOCHS, count: reports.length, ordinal: NaN, label: "All Epochs" }, ...options];
}

export function reportsForEpoch(reports: JsonObject[], selectedEpoch: string): JsonObject[] {
  if (selectedEpoch === ALL_EPOCHS) return reports;
  return reports.filter((report) => epochKey(report) === selectedEpoch);
}

export function currentEpochId(options: EpochOption[]): string {
  return options.find((option) => option.id !== ALL_EPOCHS)?.id ?? ALL_EPOCHS;
}

function sliderEpochOptions(options: EpochOption[]): EpochOption[] {
  return options
    .filter((option) => option.id !== ALL_EPOCHS)
    .sort((left, right) => {
      if (left.id === UNKNOWN_EPOCH) return -1;
      if (right.id === UNKNOWN_EPOCH) return 1;
      if (Number.isFinite(left.ordinal) && Number.isFinite(right.ordinal)) return left.ordinal - right.ordinal;
      return left.id.localeCompare(right.id);
    });
}

export function EpochSelector({
  onSelect,
  options,
  selectedEpoch,
}: {
  onSelect: (epochId: string) => void;
  options: EpochOption[];
  selectedEpoch: string;
}) {
  const epochs = sliderEpochOptions(options);
  if (epochs.length <= 1) return null;
  const currentId = currentEpochId(options);
  const selectedIsAll = selectedEpoch === ALL_EPOCHS;
  const selectedId = selectedIsAll ? currentId : selectedEpoch;
  const selectedIndex = Math.max(0, epochs.findIndex((option) => option.id === selectedId));
  const selectedOption = selectedIsAll ? options.find((option) => option.id === ALL_EPOCHS) : epochs[selectedIndex];
  const oldest = epochs[0];
  const newest = epochs[epochs.length - 1];
  return (
    <div className="grid gap-2 border-b border-line px-2 pb-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">Epoch</span>
          <span className="text-xs text-soft">
            {selectedIsAll ? "All Epochs" : selectedOption?.label ?? "Current Epoch"}
            <span className="ml-1 text-faint">{num(selectedOption?.count)} states</span>
            {!selectedIsAll && selectedOption?.id === currentId ? <span className="ml-1 text-up">current</span> : null}
          </span>
        </div>
        <button
          aria-pressed={selectedIsAll}
          className={`min-h-7 shrink-0 rounded-none border px-2 py-1 text-xs ${
            selectedIsAll ? "border-line2 bg-raised text-fg" : "border-line bg-card text-dim hover:border-line2 hover:text-soft"
          }`}
          onClick={() => onSelect(ALL_EPOCHS)}
          type="button"
        >
          All <span className="text-faint">{num(options.find((option) => option.id === ALL_EPOCHS)?.count)}</span>
        </button>
      </div>
      <div className="relative min-h-7 px-1">
        <div aria-hidden className="pointer-events-none absolute left-2 right-2 top-1/2 z-20 h-3 -translate-y-1/2">
          <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-line2/80" />
          {epochs.map((option, index) => {
            const left = epochs.length > 1 ? (index / (epochs.length - 1)) * 100 : 0;
            const selected = !selectedIsAll && index === selectedIndex;
            const current = option.id === currentId;
            return (
              <span
                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 ${
                  selected
                    ? "h-3.5 w-[2px] bg-fg"
                    : current
                      ? "h-3 w-[2px] bg-up/80"
                      : "h-2 w-px bg-line2/80"
                }`}
                key={option.id}
                style={{ left: `${left}%` }}
              />
            );
          })}
        </div>
        <input
          aria-label="Select worker report epoch"
          className="epoch-range relative z-10 w-full"
          max={epochs.length - 1}
          min={0}
          onChange={(event) => onSelect(epochs[Number(event.currentTarget.value)]?.id ?? currentId)}
          step={1}
          type="range"
          value={selectedIndex}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.08em] text-faint">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{oldest?.label ?? "Oldest"}</span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right">{newest?.label ?? "Current"}</span>
      </div>
    </div>
  );
}
