import { num } from "@/lib/format";
import type { PrFlowRecord, CycleView } from "@/pages/workspace/_lib/types";

export const PR_STAGES = [
  { id: "planned", label: "Planned", hint: "Waiting in split plan" },
  { id: "preparing", label: "Preparing", hint: "Verifying / QA repair" },
  { id: "prepared", label: "Prepared", hint: "Draft-ready (local clean)" },
  { id: "draft", label: "Draft", hint: "Our manual review" },
  { id: "review", label: "In Review", hint: "Upstream review" },
  { id: "done", label: "Done", hint: "Merged / closed" },
] as const;

export type PrStageId = (typeof PR_STAGES)[number]["id"];

export function prStage(record: PrFlowRecord): PrStageId {
  const { status } = record;
  if (status === "merged" || status === "closed") return "done";
  if (status === "open" || status === "changes_requested") return "review";
  if (status === "draft" || status === "branch_pushed" || Number.isFinite(record.prNumber)) return "draft";
  if (record.localStatus === "preparing" || record.validationStatus === "repairing") return "preparing";
  if (record.localStatus === "ready" || record.localStatus === "local_only" || record.localStatus === "dirty") return "prepared";
  return "planned";
}

export function prSubStatus(record: PrFlowRecord): { label: string; tone: string } {
  const stage = prStage(record);
  if (stage === "preparing") {
    if (record.status === "blocked" || record.localStatus === "blocked") return { label: "blocked", tone: "text-down" };
    if (record.validationStatus === "repairing") return { label: "QA repair", tone: "text-warn" };
    if (record.localStatus === "preparing") return { label: "verifying", tone: "text-warn" };
    return { label: "in flight", tone: "text-warn" };
  }
  if (stage === "prepared") {
    if (record.localStatus === "dirty") return { label: "uncommitted changes", tone: "text-down" };
    if (record.localStatus === "local_only") return { label: "local branch", tone: "text-warn" };
    return { label: "ready", tone: "text-up" };
  }
  if (stage === "draft") return { label: "opened", tone: "text-accent" };
  if (stage === "review") {
    const sub = record.reviewSubState;
    if (sub === "changes_requested") return { label: "changes requested", tone: "text-down" };
    if (sub === "new_comments") return { label: "new comments", tone: "text-warn" };
    if (sub === "fixing") return { label: "fixing", tone: "text-warn" };
    return { label: "awaiting", tone: "text-dim" };
  }
  if (stage === "done") return { label: record.status, tone: record.status === "merged" ? "text-up" : "text-faint" };
  return { label: "", tone: "text-dim" };
}

export function prLampTone(record: PrFlowRecord): string {
  const stage = prStage(record);
  if (stage === "planned") return "lamp-idle";
  if (stage === "preparing") return "lamp-flight";
  if (stage === "prepared") return "lamp-ready";
  if (stage === "done") return record.status === "merged" ? "lamp-ready" : "lamp-idle";
  if (record.reviewSubState === "changes_requested" || record.reviewSubState === "new_comments") return "lamp-attention";
  return "lamp-neutral";
}

export function prLockReason(view: CycleView): string {
  return view.canOpenPrs
    ? ""
    : view.process.running
      ? "Drain workers first."
      : view.syncing
        ? "Sync is in progress."
        : view.operationActive
          ? `${view.operationLabel} is in progress.`
          : view.activeClaims > 0
            ? `Waiting on ${num(view.activeClaims)} draining claim(s).`
            : "";
}
