import { remoteBuildsEnabled } from "@server/core/validation/build/execution.js";
export { closeKernelRuntimeForTests, fetchServer, serveServer } from "@server/infrastructure/http/server";
import { resolve } from "node:path";
import { resolveGame } from "@server/core/game-registry";
import { reconcileSyncStartup, serveServer } from "@server/infrastructure/http/server";
import { configureGlobalCompileJobserver, GLOBAL_COMPILE_SLOTS_ENV } from "@server/infrastructure/shell/global-compile-jobserver";
import { loadLocalEnv } from "@server/infrastructure/env";

async function main(): Promise<void> {
  // Sync validation and sandbox checks call Daytona in-process, so the server needs the same env as the job runner.
  loadLocalEnv();
  let localEnvPath: string | undefined;
  if (process.env[GLOBAL_COMPILE_SLOTS_ENV] === undefined) {
    try {
      localEnvPath = resolveGame({ orchestratorRoot: resolve(import.meta.dir, "../../.."), useDefaultGame: true }).localEnvPath;
    } catch {
      // The server can still run with explicit path overrides when no default game resolves.
    }
  }
  if (!remoteBuildsEnabled()) await configureGlobalCompileJobserver({ localEnvPath });
  await reconcileSyncStartup();
  serveServer();
}

if (import.meta.main) await main();
