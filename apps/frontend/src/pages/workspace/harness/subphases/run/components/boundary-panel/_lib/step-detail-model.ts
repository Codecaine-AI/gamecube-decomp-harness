import type {
  BoundaryStepDetail,
  BoundaryStepDetailArtifact,
  BoundaryStepDetailEvent,
} from "@/lib/boundary-step-detail-types";
import { clock } from "@/lib/format";

export function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return "—";

  const size = Math.max(0, value);
  const units = ["B", "KB", "MB", "GB"];
  let amount = size;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }

  const formatted = unit === 0
    ? Math.round(amount).toString()
    : amount.toFixed(amount >= 10 || Number.isInteger(amount) ? 0 : 1);
  return `${formatted} ${units[unit]}`;
}

export function eventSummary(event: BoundaryStepDetailEvent): string {
  const parts = [clock(event.created_at), event.event_type];
  if (typeof event.payload.status === "string" && event.payload.status) {
    parts.push(event.payload.status);
  }
  if (typeof event.payload.message === "string" && event.payload.message) {
    parts.push(event.payload.message.split(/\r?\n/, 1)[0]);
  }
  return parts.join(" · ");
}

export function artifactPreview(
  artifact: BoundaryStepDetailArtifact,
): { label: string; text: string | null } {
  const truncated = artifact.truncated ? " · (truncated)" : "";
  return {
    label: `${artifact.name} · ${formatBytes(artifact.sizeBytes)}${truncated}`,
    text: artifact.text,
  };
}

export function detailSections(detail: BoundaryStepDetail): {
  hasError: boolean;
  eventCount: number;
  artifactCount: number;
  logLineCount: number;
  truncatedLog: boolean;
} {
  return {
    hasError: detail.error !== null,
    eventCount: detail.events.length,
    artifactCount: detail.artifacts.length,
    logLineCount: detail.stderrLog?.lines.length ?? 0,
    truncatedLog: detail.stderrLog?.truncated ?? false,
  };
}
