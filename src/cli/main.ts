import { parse } from "./args.js";
import { initRun, recoverLeases, regressionCheck, status, tick, triggerAgent, worker } from "./commands/index.js";
import { usage } from "./usage.js";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { command, globals, args } = parse(argv);
  if (command === "init-run") await initRun(globals, args);
  else if (command === "tick") await tick(globals, args);
  else if (command === "worker") await worker(globals, args);
  else if (command === "trigger-agent" || command === "bootstrap") await triggerAgent(globals, args);
  else if (command === "recover-leases") await recoverLeases(globals, args);
  else if (command === "regression-check") await regressionCheck(globals, args);
  else if (command === "status") await status(globals);
  else throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}
