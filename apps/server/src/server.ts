export { closeKernelRuntimeForTests, fetchServer, serveServer } from "@server/infrastructure/http/server";
import { resolve } from "node:path";
import { resolveProject } from "@server/core/project-registry";
import { serveServer } from "@server/infrastructure/http/server";
import { configureGlobalCompileJobserver, GLOBAL_COMPILE_SLOTS_ENV } from "@server/infrastructure/shell/global-compile-jobserver";

async function main(): Promise<void> {
  let localEnvPath: string | undefined;
  if (process.env[GLOBAL_COMPILE_SLOTS_ENV] === undefined) {
    try {
      localEnvPath = resolveProject({ orchestratorRoot: resolve(import.meta.dir, "../../.."), useDefaultProject: true }).localEnvPath;
    } catch {
      // The server can still run with explicit path overrides when no default project resolves.
    }
  }
  await configureGlobalCompileJobserver({ localEnvPath });
  serveServer();
}

if (import.meta.main) await main();
