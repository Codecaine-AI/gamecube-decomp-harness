import { describe, expect, test } from "bun:test";
import type { Dashboard } from "@/lib/format";
import { queueRows, queueRowStatus } from "./queue";

describe("queue rows", () => {
  test("lists admitted targets, then readiness-blocked targets with their waiting-on label", () => {
    const dashboard = {
      epochTargets: [
        { epochTargetId: "t1", symbol: "ready_fn", epochStatus: "active", epochTargetStatus: "admitted", targetStatus: "admitted" },
        {
          epochTargetId: "t2", symbol: "deferred_fn", epochStatus: "active", epochTargetStatus: "admitted", targetStatus: "admitted",
          readinessStatus: "deferred", reason: "waiting on: TKoopa (Enemy/Koopa, not decompiled)",
        },
        { epochTargetId: "t3", symbol: "done_fn", epochStatus: "active", epochTargetStatus: "finished" },
      ],
      blockedTargets: [{
        key: "main/System/MarNameRefGen_Enemy::getNameRef", unit: "main/System/MarNameRefGen_Enemy", symbol: "getNameRef",
        sourcePath: "src/System/MarNameRefGen_Enemy.cpp", size: 64, fuzzy: 12, readinessStatus: "blocked", blockedReason: "not_ready",
        unmet: [{ class: "TKoopa", owner_unit: "main/Enemy/Koopa", kind: "construct" }], unresolved: [],
        label: "waiting on: TKoopa (Enemy/Koopa, not decompiled)",
      }],
    } as unknown as Dashboard;
    const rows = queueRows(dashboard);
    expect(rows.map((row) => row.symbol)).toEqual(["ready_fn", "deferred_fn", "getNameRef"]);
    expect(rows.map(queueRowStatus)).toEqual(["admitted", "deferred", "blocked"]);
    expect(rows[2]?.reason).toBe("waiting on: TKoopa (Enemy/Koopa, not decompiled)");
  });

  test("games without ordering show only admitted targets", () => {
    const dashboard = { epochTargets: [{ symbol: "fn", epochStatus: "active", epochTargetStatus: "admitted" }] } as unknown as Dashboard;
    expect(queueRows(dashboard).map(queueRowStatus)).toEqual(["admitted"]);
  });

  test("unverified targets keep their 100% unverified state in the queue, admitted or readiness-blocked", () => {
    const unverified = { verification: "unverified_match", verification_label: "100% unverified", verification_reasons: ["no steering located"] };
    const dashboard = {
      epochTargets: [
        { epochTargetId: "t1", symbol: "update", epochStatus: "active", epochTargetStatus: "admitted", ...unverified },
        { epochTargetId: "t2", symbol: "draw", epochStatus: "active", epochTargetStatus: "admitted" },
      ],
      blockedTargets: [{
        key: "u::blocked", unit: "u", symbol: "blocked", sourcePath: "src/u.cpp", size: 4, fuzzy: 100, readinessStatus: "blocked",
        blockedReason: "not_ready", unmet: [], unresolved: [], label: "waiting on: X", ...unverified,
      }],
    } as unknown as Dashboard;
    const rows = queueRows(dashboard);
    expect(rows.map((row) => row.verification ?? null)).toEqual(["unverified_match", null, "unverified_match"]);
    expect(rows[2]?.verification_reasons).toEqual(["no steering located"]);
    expect(rows.map(queueRowStatus)).toEqual(["admitted", "admitted", "blocked"]);
  });
});
