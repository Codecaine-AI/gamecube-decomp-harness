import { openState, statusSnapshot } from "../../state/index.js";
import type { GlobalArgs } from "../args.js";

export async function status(globals: GlobalArgs): Promise<void> {
  console.log(JSON.stringify(statusSnapshot(openState(globals.stateDir)), null, 2));
}
