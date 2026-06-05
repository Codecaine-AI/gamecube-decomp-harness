import { DEFAULT_PI_MODEL, DEFAULT_PI_PROVIDER, DEFAULT_PI_THINKING_LEVEL, DEFAULT_STATE_DIR_NAME } from "./defaults.js";

export function usage(): string {
  return [
    "Usage:",
    "  decomp-orchestrator [global flags] init-run [--goal-kind kind] [--goal-value n] [--desired-workers n] [--candidate-limit n]",
    "  decomp-orchestrator [global flags] tick [--run-id id] [--candidate-limit n]",
    "  decomp-orchestrator [global flags] worker [--run-id id] [--worker-id id] [--report-type type] [--base-rev rev] [--ttl-seconds n]",
    "  decomp-orchestrator [global flags] trigger-agent [--run-id id] [--max-workers n] [--idle-sleep-ms n] [--max-iterations n] [--max-idle-iterations n]",
    "  decomp-orchestrator [global flags] bootstrap [same flags as trigger-agent]",
    "  decomp-orchestrator [global flags] recover-leases [--run-id id] [--force] [--lease-id id] [--reason text]",
    "  decomp-orchestrator [global flags] regression-check [--run-id id] [--target changes_all] [--report-title title] [--report-max-rows n]",
    "  decomp-orchestrator [global flags] status",
    "",
    "Global flags:",
    "  --repo-root <path>          default: current working directory",
    `  --state-dir <path>         default: <repo-root>/${DEFAULT_STATE_DIR_NAME}`,
    "  --dry-run-agents           do not call Pi SDK; write prompts as outputs",
    `  --provider <name>          default: ${DEFAULT_PI_PROVIDER}`,
    `  --model <name>             default: ${DEFAULT_PI_MODEL}`,
    `  --thinking-level <level>   default: ${DEFAULT_PI_THINKING_LEVEL}`,
    "  --agent-timeout-seconds n  bound each live Pi session; default: no timeout",
  ].join("\n");
}
