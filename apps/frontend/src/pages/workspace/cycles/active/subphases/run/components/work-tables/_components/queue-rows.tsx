import { StackCell } from "@/components/primitives";
import { num, pct, text, type JsonObject } from "@/lib/format";

export function EpochRows({ rows }: { rows: JsonObject[] }) {
  return (
    <>
      {rows.map((file) => (
        <tr className="row-rhythm-2" key={`${text(file.epochTargetId)}-${text(file.symbol)}`}>
          <td title={text(file.sourcePath) || text(file.unit) || text(file.symbol)}>
            <StackCell primary={text(file.symbol, "-")} secondary={text(file.sourcePath) || text(file.unit)} />
          </td>
          <td className="w-[92px] text-right">{pct(file.fuzzy)}</td>
          <td className="w-32 text-right" title={text(file.reason) || text(file.targetStatus) || text(file.epochTargetStatus)}>
            <StackCell primary={text(file.targetStatus) || text(file.epochTargetStatus, "-")} secondary={`priority ${num(file.priority)}`} />
          </td>
        </tr>
      ))}
    </>
  );
}
