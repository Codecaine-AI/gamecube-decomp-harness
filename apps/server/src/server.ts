export { closeKernelRuntimeForTests, fetchServer, serveServer } from "@server/infrastructure/http/server";
import { resolve } from "node:path";
import { resolveGame } from "@server/core/game-registry";
import { reconcileSyncStartup, serveServer } from "@server/infrastructure/http/server";
import { configureGlobalCompileJobserver, GLOBAL_COMPILE_SLOTS_ENV } from "@server/infrastructure/shell/global-compile-jobserver";

async function main(): Promise<void> {
  let localEnvPath: string | undefined;
  if (process.env[GLOBAL_COMPILE_SLOTS_ENV] === undefined) {
    try {
      localEnvPath = resolveGame({ orchestratorRoot: resolve(import.meta.dir, "../../.."), useDefaultGame: true }).localEnvPath;
    } catch {
      // The server can still run with explicit path overrides when no default game resolves.
    }
  }
  await configureGlobalCompileJobserver({ localEnvPath });
  await reconcileSyncStartup();
  serveServer();
}

if (import.meta.main) await main();
