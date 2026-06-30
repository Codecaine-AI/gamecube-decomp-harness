import {
  asObject,
  duration,
  durationBetween,
  pct,
  until,
  type JsonObject,
} from "@/lib/format";

export function activityScoreText(score: JsonObject): string {
  const before = Number(score.before);
  const after = Number(score.after);
  if (!Number.isFinite(before) && !Number.isFinite(after)) return "";
  return `${pct(score.before)} -> ${pct(score.after)}${score.exact === true ? " (exact)" : ""}`;
}

function compactScoreNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactScoreValue(value: unknown, missingLabel = "n/a"): string {
  const parsed = compactScoreNumber(value);
  return parsed === null
    ? missingLabel
    : (Math.floor(parsed * 100) / 100).toFixed(2);
}

export function activityScoreCompact(score: JsonObject): {
  after: string;
  before: string;
  improved: boolean;
  text: string;
} {
  const before = compactScoreNumber(score.before);
  const after = compactScoreNumber(score.after);
  if (before === null && after === null) {
    return { after: "", before: "", improved: false, text: "" };
  }
  const beforeText = compactScoreValue(score.before);
  const afterText = compactScoreValue(score.after);
  const exactText = score.exact === true ? " (exact)" : "";
  return {
    after: afterText,
    before: beforeText,
    improved: before !== null && after !== null && after > before,
    text: `${beforeText} to ${afterText}${exactText}`,
  };
}

// Compact live status for an active claim: operators mainly need the attempt
// number plus the latest deterministic score check. Detailed state and tool
// traces stay in the hover title and the report's Trace section.
export function activityAttemptLabel(
  activity: JsonObject,
  lastEvent: JsonObject,
): string {
  const activityAttempt = Number(activity.attemptIndex);
  const eventAttempt = Number(lastEvent.attemptIndex);
  const attemptIndex = Number.isFinite(activityAttempt)
    ? activityAttempt
    : eventAttempt;
  return `attempt ${Number.isFinite(attemptIndex) ? attemptIndex + 1 : 1}`;
}

export function latestActivity(file: JsonObject): {
  activity: JsonObject;
  lastEvent: JsonObject;
} {
  const activity = asObject(file.activity);
  return {
    activity,
    lastEvent: asObject(activity.lastEvent),
  };
}

function elapsedSince(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return duration(Date.now() - date.getTime());
}

export function activeRuntime(startValue: unknown, ttlValue: unknown) {
  const elapsed = elapsedSince(startValue);
  const remaining = until(ttlValue);
  const max = durationBetween(startValue, ttlValue);
  let secondary = "timeout unknown";
  if (remaining !== "expired" && remaining !== "-") secondary = `${remaining} left`;
  else if (remaining === "expired") secondary = "expired";
  else if (max !== "-") secondary = "timeout set";
  return {
    primary: elapsed,
    secondary,
    title: `Elapsed: ${elapsed}; Remaining: ${secondary}; Timeout: ${max}`,
  };
}
