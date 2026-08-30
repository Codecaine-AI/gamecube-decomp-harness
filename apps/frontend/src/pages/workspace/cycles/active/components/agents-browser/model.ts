import type {
  KernelContainerSummary,
  KernelTraceSessionDetail,
  KernelTraceSessionSummary,
} from "@agent-kernel/viewer-core";

import { reportsForEpoch } from "@/components/details-rail/_components/worker-reports/epoch-selector";
import { workerStateKey } from "@/components/details-rail/_components/worker-reports";
import { reportCountsForReports, reportOutcome, visibleReportFilters, type WorkerStateFilter } from "@/components/details-rail/_lib/worker-reports";
import { asObject, text, type JsonObject } from "@/lib/format";

const MELEE_APP_SESSION_NAMESPACE = "0dbd5814-75c3-4dc8-9b3b-0f6277cc2b08";

function bytesFromHex(value: string): Uint8Array {
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

function hexFromBytes(value: Uint8Array): string {
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha1(value: Uint8Array): Promise<Uint8Array> {
  const buffer = new ArrayBuffer(value.byteLength);
  new Uint8Array(buffer).set(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-1", buffer));
}

async function stableUuid(namespace: string, name: string): Promise<string> {
  const namespaceBytes = bytesFromHex(namespace.replace(/-/g, ""));
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(namespaceBytes.length + nameBytes.length);
  input.set(namespaceBytes);
  input.set(nameBytes, namespaceBytes.length);
  const bytes = (await sha1(input)).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = hexFromBytes(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function cleanSegment(value: string): Promise<string> {
  const raw = value.trim();
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const digest = hexFromBytes(await sha1(new TextEncoder().encode(raw))).slice(0, 10);
  return `${normalized || "id"}-${digest}`;
}

export async function workerTraceContainerId(input: {
  claimId: string;
  epochId: string;
  gameId: string;
  runId: string;
  sessionId: string;
}): Promise<string> {
  const [appSessionId, runId, epochId, claimId] = await Promise.all([
    stableUuid(MELEE_APP_SESSION_NAMESPACE, `game:${input.gameId}\nsession:${input.sessionId}`),
    cleanSegment(input.runId),
    cleanSegment(input.epochId),
    cleanSegment(input.claimId),
  ]);
  return `melee:${appSessionId}:session:run:${runId}:epoch:${epochId}:worker:${claimId}`;
}

export function buildAgentListModel(
  allReports: JsonObject[],
  selectedEpoch: string,
  outcomeFilter: WorkerStateFilter,
  activeIds: ReadonlySet<string>,
) {
  const epochReports = reportsForEpoch(allReports, selectedEpoch);
  const counts = reportCountsForReports(epochReports);
  const reports = epochReports
    .filter((report) => outcomeFilter === "all" || (
      activeIds.has(workerStateKey(report))
        ? outcomeFilter === "running"
        : reportOutcome(report) === outcomeFilter
    ));

  return {
    counts,
    filters: visibleReportFilters(counts, outcomeFilter),
    reports,
  };
}

export function traceSessionMatchesContext(
  session: KernelTraceSessionSummary,
  gameId: string,
  cycleId: string,
): boolean {
  const metadata = asObject(session.metadata);
  const sessionGameId = text(metadata.gameId, text(metadata.game_id));
  if (gameId && sessionGameId !== gameId) return false;
  if (!cycleId) return true;
  return [
    metadata.sessionId,
    metadata.session_id,
    metadata.cycleUuid,
    metadata.cycle_uuid,
    metadata.appSessionSlug,
    metadata.app_session_slug,
  ].some((value) => text(value) === cycleId);
}

function hasWorkerStatePath(container: KernelContainerSummary, workerStateId: string): boolean {
  if (!workerStateId || !container.workingDir) return false;
  const segments = container.workingDir.split(/[\\/]+/);
  return segments.some((segment, index) => segment === "worker_state" && segments[index + 1] === workerStateId);
}

export function findWorkerTraceContainer(
  detail: KernelTraceSessionDetail,
  report: JsonObject,
  workerStateId: string,
  runId: string,
): KernelContainerSummary | null {
  const containers = detail.containers ?? (detail.container ? [detail.container] : []);
  const workers = containers.filter((container) => container.kind === "worker");
  const exactPath = workers.find((container) => hasWorkerStatePath(container, workerStateId));
  if (exactPath) return exactPath;

  const claimId = text(report.claimId, text(asObject(report.activeClaim).claimId));
  if (!claimId) return null;
  return workers.find((container) => {
    const metadata = asObject(container.metadata);
    const containerRunId = text(metadata.runId, text(metadata.run_id));
    if (runId && containerRunId && containerRunId !== runId) return false;
    return text(metadata.claimId, text(metadata.claim_id)) === claimId;
  }) ?? null;
}

export function findEpochTraceContainer(
  detail: KernelTraceSessionDetail,
  epochId: string,
  runId: string,
): KernelContainerSummary | null {
  if (!epochId) return null;
  const containers = detail.containers ?? (detail.container ? [detail.container] : []);
  return containers.find((container) => {
    if (container.kind !== "epoch") return false;
    const metadata = asObject(container.metadata);
    const containerRunId = text(metadata.runId, text(metadata.run_id));
    if (runId && containerRunId !== runId) return false;
    return text(metadata.epochId, text(metadata.epoch_id)) === epochId;
  }) ?? null;
}
