import { ArrowRight } from "@/icons";
import { asObject, text, type JsonObject } from "@/lib/format";
import { activeRuntime, activityAttemptLabel, activityScoreCompact, baselineScoreCompact, latestActivity } from "@/lib/workerActivity";

export function ActiveRows({
  onSelectAttempt,
  rows,
}: {
  onSelectAttempt?: (workerStateId: string) => void;
  rows: JsonObject[];
}) {
  return (
    <>
      {rows.map((file, index) => {
        const timing = activeRuntime(file.claimedAt || file.heartbeatAt, file.ttl);
        const alt = index % 2 === 1 ? "entry-alt" : "";
        const { activity, lastEvent } = latestActivity(file);
        const score = activityScoreCompact(asObject(activity.lastScore));
        const target = asObject(file.target);
        const baselineScore = baselineScoreCompact(asObject(file.baseline), file.fuzzy ?? target.fuzzy);
        const displayScore = score.text ? score : baselineScore;
        const fileTitle = text(file.sourcePath) || text(file.unit) || text(file.symbol);
        const eventSummary = text(lastEvent.summary, "Waiting for runner activity");
        const scoreTitle = displayScore.text ? `${eventSummary} - ${displayScore.text}` : eventSummary;
        const workerStateId = text(file.workerStateId);
        const selectable = Boolean(workerStateId && onSelectAttempt);

        function selectAttempt() {
          if (workerStateId) onSelectAttempt?.(workerStateId);
        }

        return (
          <tr
            aria-label={selectable ? `Open attempt detail for ${text(file.symbol, "worker")}` : undefined}
            className={`row-rhythm-1 ${alt} ${selectable ? "cursor-pointer hover:bg-raised" : ""}`}
            key={`${text(file.claimId)}-${text(file.symbol)}`}
            onClick={selectable ? selectAttempt : undefined}
            onKeyDown={selectable ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectAttempt();
              }
            } : undefined}
            role={selectable ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            title={selectable ? "Open attempt detail" : undefined}
          >
            <td className="max-w-0" title={fileTitle}>
              <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-fg">{text(file.symbol, "-")}</span>
            </td>
            <td className="w-20 text-right text-dim" title={eventSummary}>{activityAttemptLabel(activity, lastEvent)}</td>
            <td className={`w-[150px] text-right ${displayScore.improved ? "text-up" : "text-soft"}`} title={scoreTitle}>
              {displayScore.text ? (
                <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
                  <span>{displayScore.before}</span>
                  <ArrowRight className="text-dim" size={12} />
                  <span>{displayScore.after}</span>
                </span>
              ) : (
                "waiting"
              )}
            </td>
            <td className="w-24 text-right text-dim" title={timing.secondary}>{timing.primary}</td>
          </tr>
        );
      })}
    </>
  );
}
