import { createContext, useContext, type ReactNode } from "react";
import { ExternalLink, GitPullRequest, Hammer } from "@/icons";
import { num } from "@/lib/format";
import { Button } from "@/components/primitives";
import { compactFilePath, fileCountLabel, prettyStatus, statusClass } from "@/pages/workspace/_lib/model";
import type { PrFlowRecord } from "@/pages/workspace/_lib/types";
import { prLampTone, prStage, prSubStatus } from "./prStatus";

const PrCampaignAuthorityContext = createContext(false);

export function PrCampaignAuthorityProvider({
  authoritative,
  children,
}: {
  authoritative: boolean;
  children: ReactNode;
}) {
  return (
    <PrCampaignAuthorityContext.Provider value={authoritative}>
      {children}
    </PrCampaignAuthorityContext.Provider>
  );
}

export function PrStageCard({
  busy,
  lockReason,
  onOpenPr,
  onPrepareLocalPr,
  onSetReviewState,
  record,
}: {
  busy: boolean;
  lockReason: string;
  onOpenPr: (branch: string) => void;
  onPrepareLocalPr: (branch: string) => void;
  onSetReviewState: (branch: string, subState: string) => void;
  record: PrFlowRecord;
}) {
  const campaignAuthoritative = useContext(PrCampaignAuthorityContext);
  const stage = prStage(record);
  const sub = prSubStatus(record);
  const blocked = record.status === "blocked" || record.localStatus === "blocked";
  const hasPrNumber = Number.isFinite(record.prNumber);
  const sourceLabel =
    record.source === "current_objective_fixture"
      ? "mock"
      : record.source === "split_plan"
        ? "planned"
        : record.sourceDetail === "github_import"
          ? "imported"
          : record.sourceDetail === "local_branch_discovery"
            ? "local"
            : "tracked";
  const canPrepare = stage === "planned" && Boolean(record.branch) && record.localStatus === "not_prepared";
  const canOpen = !campaignAuthoritative && stage === "prepared" && Boolean(record.branch) && record.localStatus !== "dirty";
  const showValidation = record.validationStatus !== "not_run" || Boolean(record.ci);
  const inReview = stage === "review";
  const needsReviewAck = inReview && (record.reviewSubState === "new_comments" || record.reviewSubState === "changes_requested");
  return (
    <article className={`pr-card ${blocked ? "pr-card-blocked" : ""}`}>
      <div className="pr-card-head">
        <span aria-hidden="true" className={`pr-card-lamp ${prLampTone(record)}`} />
        <span className="pr-card-title" title={record.title || record.displayName}>
          {record.displayName}
        </span>
      </div>
      <div className="pr-card-meta">
        {hasPrNumber ? <span className="text-path">#{record.prNumber}</span> : <span className="text-faint">{sourceLabel}</span>}
        <span aria-hidden="true" className="text-faint">/</span>
        {sub.label ? <span className={sub.tone}>{sub.label}</span> : <span className="text-dim">{prettyStatus(record.status)}</span>}
        <span aria-hidden="true" className="text-faint">/</span>
        <span className="text-dim">{fileCountLabel(record.files.length)}</span>
      </div>
      {record.repairNote ? <div className="pr-card-note text-warn">{record.repairNote}</div> : null}
      {showValidation ? (
        <div className="pr-card-meta">
          <span className={statusClass(record.validationStatus)}>QA {prettyStatus(record.validationStatus, "not run")}</span>
          {record.ci ? (
            <>
              <span aria-hidden="true" className="text-faint">/</span>
              <span className={statusClass(record.ci)}>CI {prettyStatus(record.ci)}</span>
            </>
          ) : null}
        </div>
      ) : null}
      {record.comments > 0 ? <div className="pr-card-meta text-dim">{num(record.comments)} comment{record.comments === 1 ? "" : "s"}</div> : null}
      {blocked ? <div className="pr-card-blocked-note">Blocked - needs isolation</div> : null}
      {canPrepare || canOpen || record.url ? (
        <div className="pr-card-actions">
          {canPrepare ? (
            <Button disabled={busy || Boolean(lockReason)} icon={<Hammer size={13} />} onClick={() => onPrepareLocalPr(record.branch)} title={lockReason || "Verify this slice and prepare a persistent local PR worktree without publishing."} type="button">
              Prepare
            </Button>
          ) : null}
          {canOpen ? (
            <Button disabled={busy || Boolean(lockReason)} icon={<GitPullRequest size={13} />} onClick={() => onOpenPr(record.branch)} title={lockReason || "Verify this slice and open a draft PR."} tone="primary" type="button">
              Open Draft
            </Button>
          ) : null}
          {record.url ? (
            <a className="pr-card-link" href={record.url} rel="noreferrer" target="_blank" title={`Open PR ${hasPrNumber ? `#${record.prNumber}` : record.displayName} on GitHub`}>
              View PR <ExternalLink size={11} />
            </a>
          ) : null}
        </div>
      ) : null}
      {inReview ? (
        <div className="pr-card-actions">
          {needsReviewAck ? (
            <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "awaiting")} title="Mark these comments as seen." type="button">
              Ack
            </Button>
          ) : null}
          {record.reviewSubState !== "fixing" ? (
            <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "fixing")} title="Mark that you are addressing the review feedback." type="button">
              Fixing
            </Button>
          ) : (
            <Button disabled={busy} onClick={() => onSetReviewState(record.branch, "awaiting")} title="Clear the fixing flag." type="button">
              Clear Fixing
            </Button>
          )}
        </div>
      ) : null}
      {record.files.length > 0 ? (
        <details className="pr-card-files">
          <summary>{fileCountLabel(record.files.length)}</summary>
          <ul className="pr-card-file-list">
            {record.files.map((file) => (
              <li key={file} title={file}>{compactFilePath(file)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
