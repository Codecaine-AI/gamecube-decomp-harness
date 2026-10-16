import { LabelWithUnverified, StackCell } from "@/components/primitives";
import { pct, text, type JsonObject } from "@/lib/format";
import { queueRowStatus } from "../_lib/queue";

export function EpochRows({ rows }: { rows: JsonObject[] }) {
  return (
    <>
      {rows.map((file) => {
        // Readiness rows (deferred, blocked) show what they wait on instead of the path.
        const waitingOn = text(file.readinessStatus) ? text(file.reason) : "";
        return (
          <tr className="row-rhythm-2" key={`${text(file.epochTargetId)}-${text(file.symbol)}`}>
            <td title={[text(file.sourcePath) || text(file.unit) || text(file.symbol), waitingOn].filter(Boolean).join("\n")}>
              <StackCell
                primary={<LabelWithUnverified label={text(file.symbol, "-")} row={file} />}
                secondary={waitingOn || text(file.sourcePath) || text(file.unit)}
              />
            </td>
            <td className="w-[92px] text-right">{pct(file.fuzzy)}</td>
            <td className="w-32 text-right" title={text(file.reason) || text(file.targetStatus) || text(file.epochTargetStatus)}>
              <StackCell primary={queueRowStatus(file)} />
            </td>
          </tr>
        );
      })}
    </>
  );
}
