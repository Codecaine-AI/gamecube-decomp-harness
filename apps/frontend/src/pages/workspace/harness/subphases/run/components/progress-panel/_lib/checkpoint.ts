import { asObject, text, whole, type Dashboard } from "@/lib/format";
import { strictNumber } from "./numbers";

export function checkpointCountdown(dashboard: Dashboard | null): string {
  const epoch = asObject(asObject(dashboard?.status).schedulerEpoch);
  if (epoch.epochId) {
    const remaining = strictNumber(epoch.remaining);
    const admitted = strictNumber(epoch.admitted);
    const available = strictNumber(epoch.available);
    const claimed = strictNumber(epoch.claimed);
    if (Number.isFinite(remaining) && Number.isFinite(admitted)) {
      return `epoch ${whole(admitted - remaining)}/${whole(admitted)} · ${whole(available)} available · ${whole(claimed)} claimed`;
    }
  }
  const progress = asObject(dashboard?.checkpointProgress);
  if (progress.building === true) {
    const sinceMs = Date.parse(text(progress.buildingSince));
    const minutes = Number.isFinite(sinceMs) ? Math.max(0, Math.round((Date.now() - sinceMs) / 60_000)) : NaN;
    return Number.isFinite(minutes) ? `checkpoint building… ${minutes}m` : "checkpoint building…";
  }
  const remaining = strictNumber(progress.remaining);
  const interval = strictNumber(progress.interval);
  if (!Number.isFinite(remaining) || !Number.isFinite(interval)) return "";
  if (remaining <= 0) return "checkpoint due";
  return `checkpoint in ~${whole(remaining)} ${remaining === 1 ? "worker state" : "worker states"}`;
}
