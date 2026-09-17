/**
 * Operator runbook: accept a changed game configuration (sandbox.json snapshot,
 * build.json validation keys) for the current accepted head without a Sync.
 *
 * Build, evidence and source readiness stay as they are: the head did not
 * change. The sandbox gate goes back to pending so `validate-sandbox` has to
 * prove the new snapshot before Run admission.
 *
 *   bun runbooks/source-fidelity/adopt-configuration.ts --game sms --reason "..." [--dry-run]
 */
import { resolveGame } from "../../apps/server/src/core/game-registry/resolver.ts";
import { gameConfigurationRevision } from "../../apps/server/src/core/game-registry/config-revision.ts";
import { openState } from "../../apps/server/src/core/orchestrator-state/index.ts";
import { getHarnessState, transitionHarnessState } from "../../apps/server/src/core/harness-state/state.ts";

const argOf = (key: string) => { const index = process.argv.indexOf(key); return index >= 0 ? process.argv[index + 1] : undefined; };
const gameId = argOf("--game") ?? "sms";
const reason = argOf("--reason") ?? "game configuration changed";
const dryRun = process.argv.includes("--dry-run");

const game = resolveGame({ gameId });
const config = gameConfigurationRevision(game);
const store = openState(game.stateDir);
try {
  const state = getHarnessState(store.db, gameId);
  if (!state?.source.head) throw new Error(`harness ${gameId} has no accepted head; run the initial Sync instead`);
  console.log("before:", { revision: state.identity.revision, head: state.source.head.slice(0, 8), config: state.source.configuration_revision.slice(0, 8), readiness: state.readiness, workflow: state.execution.workflow });
  if (state.source.configuration_revision === config) { console.log("configuration revision unchanged:", config.slice(0, 8)); process.exit(0); }
  if (state.execution.workflow !== "none") throw new Error(`harness workflow is ${state.execution.workflow}; settle it before adopting configuration`);
  console.log("configuration revision:", state.source.configuration_revision.slice(0, 8), "->", config.slice(0, 8));
  if (dryRun) { console.log("dry run: no change"); process.exit(0); }
  const next = transitionHarnessState(store.db, {
    gameId,
    expectedRevision: state.identity.revision,
    commandId: `operator-configuration-adoption:${config}`,
    patch: {
      source: { configuration_revision: config },
      readiness: { build: state.readiness.build, evidence: state.readiness.evidence, sources: state.readiness.sources, sandbox: "pending" },
    },
    boundary: {
      eventId: `operator-configuration-adoption:${config}`,
      kind: "remote_application",
      outcome: "operator_configuration_adopted",
      runId: state.history.run_id ?? null,
      epochId: state.history.epoch_id ?? null,
      evidence: { reason, configuration_prior: state.source.configuration_revision, configuration_accepted: config, sandbox: game.sandbox },
    },
  });
  console.log("after:", { revision: next.identity.revision, config: next.source.configuration_revision.slice(0, 8), readiness: next.readiness });
} finally { store.db.close(); }
