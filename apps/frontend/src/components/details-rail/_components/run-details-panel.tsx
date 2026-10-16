import { Download, RefreshCw } from "@/icons";

import { Button, UNVERIFIED_TONE } from "@/components/primitives";
import { asArray, asObject, clock, delta, num, shortId, text } from "@/lib/format";
import { UNVERIFIED_MATCH_LABEL, unverifiedRunTargets } from "@/lib/verification";

import type { RunDetailsControls } from "../_lib/types";

export function RunDetailsPanel({ loadRunDetails, loadingRunDetails, runDetails }: RunDetailsControls) {
  const summary = asObject(runDetails?.summary);
  const timeline = asArray(runDetails?.timeline).map(asObject);
  const unverified = unverifiedRunTargets(summary);
  const facts: Array<[string, unknown, string?]> = [
    ["worker states", summary.workerStates],
    ["score+", summary.positiveAttempts],
    ["exact%", summary.exactMatches],
    // Steering-gated games only: run targets at 100% the gate could not verify (not done).
    ...(unverified === null ? [] : [[UNVERIFIED_MATCH_LABEL, unverified, UNVERIFIED_TONE] as [string, unknown, string]]),
    ["files+", summary.improvedFiles],
    ["sessions", summary.piSessions],
    ["events", summary.events],
    ["claims", summary.targetClaims],
    ["epoch targets", summary.epochTargets],
    ["targets", summary.targets],
  ];

  function download() {
    if (!runDetails) return;
    const blob = new Blob([JSON.stringify(runDetails, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `decomp-run-${shortId(runDetails.runId)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-2">
        <Button className="min-h-6 px-2 py-0.5" icon={<RefreshCw size={13} />} onClick={loadRunDetails} type="button">
          {loadingRunDetails ? "Loading" : "Refresh"}
        </Button>
        <Button className="min-h-6 px-2 py-0.5" disabled={!runDetails} icon={<Download size={13} />} onClick={download} type="button">
          JSON
        </Button>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-dim">{runDetails?.generatedAt ? `loaded ${clock(runDetails.generatedAt)}` : ""}</span>
      </div>
      {runDetails ? (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            {facts.map(([label, value, tone = "text-up"]) => (
              <div className="rounded-none border border-line bg-card px-2 py-1" key={label}>
                <strong className={`block overflow-hidden text-ellipsis whitespace-nowrap text-[15px] ${tone}`}>{num(value)}</strong>
                <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim">{label}</span>
              </div>
            ))}
          </div>
          <div className="grid max-h-[520px] gap-1.5 overflow-auto">
            {timeline.map((item) => (
              <article className={`rounded-none border border-l-[3px] border-line bg-card p-2 ${text(item.kind) === "worker_state" ? "border-l-cyan" : text(item.kind) === "event" ? "border-l-warn" : text(item.kind) === "pi_session" ? "border-l-up" : "border-l-purple"}`} key={`${text(item.kind)}-${text(item.id)}-${text(item.at)}`}>
                <div className="flex justify-between gap-2 text-[11px] text-dim">
                  <span>{text(item.kind)}</span>
                  <span>{clock(item.at)}</span>
                </div>
                <strong className="mt-1 block overflow-hidden text-ellipsis whitespace-nowrap" title={text(item.title)}>{text(item.title) || text(item.id, "-")}</strong>
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-dim" title={text(item.path)}>{text(item.path)}</div>
                <div className="text-dim">
                  {text(item.detail)}
                  {Number(item.delta || 0) > 0 ? ` / delta ${delta(item.delta)}` : ""}
                  {Number(item.exactMatches || 0) > 0 ? ` / exact ${num(item.exactMatches)}` : ""}
                </div>
              </article>
            ))}
            {timeline.length === 0 ? <div className="text-dim">No timeline entries</div> : null}
          </div>
        </>
      ) : (
        <div className="text-dim">Not loaded</div>
      )}
    </>
  );
}
