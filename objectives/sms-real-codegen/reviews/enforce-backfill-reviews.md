# Enforce + sharded backfill: implementation reviews (Codex gpt-6.1-sol, medium)

Scope: SMS steeringGate + ordering.mode = enforce; sharded steering backfill (`--from-reports`, `--apply`, `--record`); rollback notes for the next worker (`<previous_attempt>`); checker fixes found by the dry backfill.

## Round 1
BLOCKING: (1) sharded certification ignored `decision.attempt` (link-map gaps could certify a clean run); (2) apply -> commit -> record overwrote rollback notes; (3) rule rollbacks (dead UNUSED, out_of_order) not attached to functions; (4) reports not checked against `--repo` before writes.
Responses: typed `attempt_issues` (only header-only "(no unit)" groups are notes); migration 014 append-only `steering_rollbacks` read first by previous_attempt; violations attached regardless of verdict; realpath repo identity before any write. Also from the dry run: short default temp root (MWCC under wibo truncated long include paths: 35/90 units silently failed), shadow-root include failures -> tool_error; `--apply` refuses a sandbox-generated build.ninja, `--rebuild none`, apply in a host clone with SHA-bound rows; timeouts everywhere (timeout -> unresolved); per-MWCC-compile timeout and MWCC step budget; edit_scope judges out-of-class definitions by the map location of their own symbol; UNUSED stub by return type; clear missing_map error.

## Round 2
R1 #1, #3, #4 RESOLVED; #2 PARTIALLY. BLOCKING: (1) own-unit exemption matched any definition on the line (same-line bypass); (2) rebuild/recheck failure after rewrite lost rollback events.
Responses: exemption bound to the exact definition (body-brace offset + exact signature); rollback events written right after each rewrite with a status (rewritten / rebuild_failed / recheck_failed / recheck_not_pass / reverified), partial shard runs keep earlier events.

## Round 3
Both RESOLVED. Schema-11 migration preserves rows; Melee unchanged. No blocking findings.
