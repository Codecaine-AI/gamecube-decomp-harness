import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GlobalArgs } from './runtime-options';

/** Game-owned defaults apply only to kg2-backfill; explicit CLI flags win. */
export function applyBackfillConfig(gameDir: string, globals: GlobalArgs, args: Map<string, string | true>, argv: string[]): void {
  const path = resolve(gameDir, 'config/backfill.json');
  if (!existsSync(path)) return;
  const config = JSON.parse(readFileSync(path, 'utf8'));
  if (config.schemaVersion !== 1) throw new Error(`Unsupported backfill config: ${path}`);
  for (const [key, flag] of [['provider','--provider'],['model','--model'],['thinkingLevel','--thinking-level']] as const) {
    if (config[key] === undefined) continue;
    if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(`Invalid backfill ${key}`);
    if (!argv.includes(flag)) globals[key] = config[key];
  }
  for (const [key, flag] of [['concurrency','--concurrency'],['limit','--limit'],['agentTimeoutSeconds','--agent-timeout-seconds']] as const) {
    if (config[key] === undefined) continue;
    if (!Number.isSafeInteger(config[key]) || config[key] < 1) throw new Error(`Invalid backfill ${key}`);
    if (key === 'agentTimeoutSeconds') {
      if (!argv.includes(flag)) globals.agentTimeoutSeconds = config[key];
    } else if (!args.has(flag)) args.set(flag, String(config[key]));
  }
}
