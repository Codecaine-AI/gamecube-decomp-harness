import { createHash } from "node:crypto";
import type { UnverifiedMatchRecord } from "./unverified-matches.js";

/**
 * Where an "100% but unverified" target's full gate report sits in the worker
 * sandbox (plan 3.6, contract "full_report_locator"). Provisioning writes the
 * file and the packet names it; both compute the path independently from the
 * record, so they agree without sharing state. The unverified-match row has
 * no observation id, so the id is derived from unit, symbol and analyzed rev.
 */
export const UNVERIFIED_REPORTS_DIR = "build/steering/reports";

export function unverifiedReportId(record: Pick<UnverifiedMatchRecord, "unit" | "symbol" | "analyzedRev">): string {
  const digest = createHash("sha256").update(`${record.unit}::${record.symbol}::${record.analyzedRev}`).digest("hex");
  return `unverified-${digest.slice(0, 16)}`;
}

/** Checkout-relative path of the target's full gate report in the sandbox. */
export function unverifiedReportLocator(record: Pick<UnverifiedMatchRecord, "unit" | "symbol" | "analyzedRev">): string {
  return `${UNVERIFIED_REPORTS_DIR}/${unverifiedReportId(record)}.json`;
}
