import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { loadLocalEnv } from "./local.js";

/**
 * Loads the machine-wide Codecaine env file (model-node credentials such as
 * `TYPESAFE_API_KEY`). Never overrides a value that is already set, a missing
 * file is a no-op, and values are never logged. `CODECAINE_ENV_FILE` points
 * at another file. Returns the loaded path, if any.
 */
export function loadCodecaineEnv(): string[] {
  const file = process.env.CODECAINE_ENV_FILE?.trim() || join(homedir(), ".config/codecaine/env");
  return loadLocalEnv({ root: dirname(file), filenames: [basename(file)] });
}
