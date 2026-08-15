import { ArrowRight } from "@/icons";
import { asObject, text, type JsonObject } from "@/lib/format";
import { activeRuntime, activityAttemptLabel, activityScoreCompact, baselineScoreCompact, latestActivity } from "@/lib/workerActivity";

export function ActiveRows({ rows }: { rows: JsonObject[] }) {
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
        return (
          <tr className={`row-rhythm-1 ${alt}`} key={`${text(file.claimId)}-${text(file.symbol)}`}>
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
