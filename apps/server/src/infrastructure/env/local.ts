import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface LoadLocalEnvOptions {
  root?: string;
  filenames?: string[];
  override?: boolean;
}

const loadedEnvFiles = new Set<string>();

function packageRoot(): string {
  return fileURLToPath(new URL("../../../../..", import.meta.url));
}

function parseEnvLine(line: string): [string, string] | undefined {
  let trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return undefined;
  if (trimmed.startsWith("export ")) trimmed = trimmed.slice("export ".length).trim();
  const equals = trimmed.indexOf("=");
  if (equals <= 0) return undefined;

  const key = trimmed.slice(0, equals).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return undefined;

  let value = trimmed.slice(equals + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

export function loadLocalEnv(options: LoadLocalEnvOptions = {}): string[] {
  const root = resolve(options.root ?? packageRoot());
  const filenames = options.filenames ?? ["config/local.env"];
  const loaded: string[] = [];

  for (const filename of filenames) {
    const path = resolve(root, filename);
    if (loadedEnvFiles.has(path) || !existsSync(path)) continue;

    const text = readFileSync(path, "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      const resolvedValue =
        key === "PI_CODING_AGENT_DIR" && value && !isAbsolute(value)
          ? resolve(root, value)
          : value;
      if (options.override || process.env[key] === undefined) {
        process.env[key] = resolvedValue;
      }
    }
    loadedEnvFiles.add(path);
    loaded.push(path);
  }

  return loaded;
}
