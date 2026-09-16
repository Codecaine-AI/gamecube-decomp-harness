import { resolveGame } from "../../apps/server/src/core/game-registry/resolver.ts";
import { gameConfigurationRevision } from "../../apps/server/src/core/game-registry/config-revision.ts";
import { openState } from "../../apps/server/src/core/orchestrator-state/index.ts";
import { getHarnessState, transitionHarnessState } from "../../apps/server/src/core/harness-state/state.ts";

const ROOT = "/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness";
const argOf = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const NEW_HEAD = argOf("--new") ?? "219e9aa03bf212f6585d9c4ee5ed3349405356c4";
const PRIOR_HEAD = argOf("--prior") ?? "ab1683147415d6491c9d56d57dd19eafe6bafe30";
const REASON = argOf("--reason") ?? "branch setup/sms-registration rewritten by the source-fidelity lint cleanup (62 reverts + 1 restore), rebuilt in a Daytona sandbox, force-pushed to origin";
const REPORT = argOf("--report") ?? "evidence/report-after-lint-cleanup.json";
const SNAPSHOT = argOf("--snapshot") ?? "sms-sandbox-20260914-72a4b712";
const dryRun = process.argv.includes("--dry-run");

const game = resolveGame({ gameId: "sms", orchestratorRoot: ROOT });
if (!game) throw new Error("sms game not resolved");
const config = gameConfigurationRevision(game);
const store = openState(game.stateDir);
try {
  const state = getHarnessState(store.db, "sms");
  if (!state) throw new Error("no harness state");
  console.log("before:", { revision: state.identity.revision, head: state.source.head.slice(0, 8), config: state.source.configuration_revision.slice(0, 8), readiness: state.readiness, desired: state.execution.desired, workflow: state.execution.workflow });
  if (state.source.head !== PRIOR_HEAD) throw new Error(`accepted head is ${state.source.head}, expected ${PRIOR_HEAD}; aborting`);
  console.log("current configuration revision:", config.slice(0, 8), config === state.source.configuration_revision ? "(unchanged)" : "(changed by sandbox.json)");
  if (dryRun) { console.log("dry run: no change"); process.exit(0); }
  const evidenceDir = `${ROOT}/audits/sms-worktree-source-quality-2026-09-16`;
  const next = transitionHarnessState(store.db, {
    gameId: "sms",
    expectedRevision: state.identity.revision,
    commandId: `operator-head-adoption:${NEW_HEAD}`,
    patch: {
      source: { head: NEW_HEAD, configuration_revision: config },
      // the Daytona rebuild is the build evidence; sandbox stays pending until validate-sandbox passes
      // build evidence comes from the Daytona rebuild; the sandbox gate only resets when the configuration changed
      readiness: config === state.source.configuration_revision
        ? { build: "ready", evidence: "ready", sources: "ready", sandbox: state.readiness.sandbox }
        : { build: "ready", evidence: "ready", sources: "ready", sandbox: "pending" },
    },
    boundary: {
      eventId: `operator-head-adoption:${NEW_HEAD}`,
      kind: "remote_application",
      outcome: "operator_head_adopted",
      runId: state.history.run_id ?? null,
      epochId: state.history.epoch_id ?? null,
      evidence: {
        reason: REASON,
        report: `${evidenceDir}/${REPORT}`,
        rebuild: `${evidenceDir}/REBUILD.md`,
        ledger: `${evidenceDir}/evidence/lint-reverts-2026-09-16.json`,
        build_sandbox: argOf("--sandbox") ?? "n/a",
        snapshot: SNAPSHOT,
        configuration_prior: state.source.configuration_revision,
        configuration_accepted: config,
      },
    },
  });
  console.log("after:", { revision: next.identity.revision, head: next.source.head.slice(0, 8), config: next.source.configuration_revision.slice(0, 8), readiness: next.readiness, desired: next.execution.desired, workflow: next.execution.workflow });
} finally { store.db.close(); }
