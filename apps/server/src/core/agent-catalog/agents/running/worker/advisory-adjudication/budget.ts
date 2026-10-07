// The enforce inline budget (plan §6.6): at most inline.maxMs, and never into
// the inline.reserveMs kept before the claim deadline for checkpoint
// persistence, the return-gate file and continuation (the child is killed
// within seconds of that deadline). A claim with no finite deadline (NaN TTL)
// gets inline.maxMs. Below inline.minMs no node call is made: the caller
// fails closed exactly like an unavailable reviewer (insufficient-time).
import type { AdvisoryAdjudicationConfig } from "./config.js";

export type InlineBudget = { ok: true; ms: number } | { ok: false; reason: "insufficient-time" };

export function inlineBudget({
  claimDeadlineMs,
  nowMs,
  config,
}: {
  claimDeadlineMs: number | null;
  nowMs: number;
  config: Pick<AdvisoryAdjudicationConfig, "inline">;
}): InlineBudget {
  const { maxMs, reserveMs, minMs } = config.inline;
  const ms =
    claimDeadlineMs === null || !Number.isFinite(claimDeadlineMs)
      ? maxMs
      : Math.min(maxMs, Math.floor(claimDeadlineMs - nowMs - reserveMs));
  // A non-finite clock yields NaN, which fails the comparison: fail closed.
  return ms >= minMs ? { ok: true, ms } : { ok: false, reason: "insufficient-time" };
}
