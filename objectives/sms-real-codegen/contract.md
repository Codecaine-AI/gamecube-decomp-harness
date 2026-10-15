# Implementation contract (shared by all slices)

Read `plan.md` first. This file fixes the interfaces so slices can be built in parallel. Do not change an interface here without telling the coordinator.

All toolpack Python lives in `toolpacks/gamecube-decomp/_impl/gamecube/tools/` (call it TOOLS). Stdlib only, Python ≥ 3.8 compatible syntax where cheap (sandbox image is Bookworm Python 3.11; host is 3.12). Style: match `stack_check.py` / `stack_compare.py`.

## 1. Config and env
- `games/<id>/game.json` → `matching.steeringGate: "off" | "shadow" | "enforce"`. Default `off`. SMS committed value is decided after validation; slices use `"shadow"` in `games/sms/game.json` for now.
- TS: `apps/server/src/core/game-registry/resolver.ts` exports `STEERING_GATE_MODES`, `type SteeringGateMode`; `GameMatchingConfig.steeringGate?: SteeringGateMode`; resolved default `"off"`.
- TS: `apps/server/src/core/tools/steering-gate.ts` exports `STEERING_GATE_ENV = "ORCH_STEERING_GATE"`, `gameSteeringGate(game): SteeringGateMode`, `steeringGateActive(mode): boolean` (`mode !== "off"`), `steeringGateEnforced(mode): boolean`.
- Env `ORCH_GAME_HOST_REPO_ROOT`: host game checkout, exported by `tools/resolver.ts` for host-executed tools (from `globals.repoRoot`, never the sandbox path).
- Python `TOOLS/game_policy.py`: add `steering_gate() -> str` (env, then `ORCH_GAME_DIR/game.json`, default `"off"`) and `steering_gate_active() -> bool`.

## 2. Python modules (TOOLS)

### 2.1 `ir_oracle.py` (exists, spike)
`find_clang()`, `oracle_argv(repo, source_rel, ...)`, `compile_ir(repo, source_rel, override_text=None, overrides: dict[path,str]|None, ...) -> IRResult(ok, ir_text, errors)`, `parse_ir(text) -> Module`, `fingerprint(module) -> dict[str,str]`, `unit_fingerprint(repo, source_rel, override_text=None) -> (ok, fps, errors)`, `compare_fps(a, b)`. The gate may extend it (multi-file overrides, flags override, unsupported-construct reporting) but keeps these names.

### 2.2 `steering_shapes.py` (owned by the toolpack-gate slice; imported by lints exactly like `agent_comments`)
```python
STEERING_SHAPES = ("temp_alias","accessor_swap","ternary_if","operand_order","statement_permutation",
                   "decl_reorder","type_spelling","float_form","compound_assign_split","bool_form")
DIRECTIVE_SHAPES = ("codegen_directive",)
REAL_SHAPES = ("literal_change","member_change","callee_change","call_added","call_removed",
               "condition_change","type_change","control_flow_change","definition_added_removed",
               "initializer_change")
def classify_group(removed: list[str], added: list[str], *, context: str | None = None,
                   typedefs: dict[str, str] | None = None) -> dict:
    """{'shapes': [...steering/directive/'cosmetic'/'other'...], 'real_shapes': [...], 'details': {...}}"""
def accessor_swap(old: str, new: str) -> dict | None   # moved from sms_fidelity/rules.py, same return shape as today
def temp_alias(removed: list[str], added: list[str], context: str | None = None) -> list[dict]
def form_rewrites(removed: list[str], added: list[str], typedefs=None) -> list[dict]  # ternary_if/statement_permutation/decl_reorder/type_spelling/float_form/compound_assign_split/bool_form
def codegen_directives(added: list[str]) -> list[dict]
def load_typedefs(repo: Path, roots=("include","libs")) -> dict[str, str]  # name -> canonical spelling (s32->int etc.)
```
Each finding dict: `{'shape': str, 'line': int|None, 'before': str|None, 'after': str|None, 'detail': str}`.

### 2.3 `steering_check.py` (gate CLI; toolpack-gate slice)
All subcommands take `--json`; exit 0 = analysis produced (verdicts are data), 2 = tool failure.
- `edits --repo R --base-ref REV [--paths src include libs] [--out FILE]`
  → `{"tool":"steering_check","version":1,"base_rev","head_rev","base_tree","edits_hash","files":[{"path","base_exists","cand_exists","base_text","cand_text"}],"generated":{"root","files":[{"path","sha256","text"|null}]},"units":[{"unit","source","object","target","flags":[...]}],"header_units":{"<header path>":["unit",...]}}`
- `reduce --oracle-repo H --input EDITS.json [--cache-dir D] [--budget-seconds 120] [--max-groups 64] [--out FILE]`
  → `{"tool","version","edits_hash","oracle":{"available","clang","clang_version","flags_hash","prelude_hash","context":{"base_tree_ok","generated_ok","detail"}},"analysis":"complete"|"incomplete","incomplete_reasons":[...],"groups":[{"id","file","edit_ids":[...],"shapes":[...],"real_shapes":[...],"status":"removable"|"real"|"unresolved","reason","evidence":null|{...},"base_lines":[...],"cand_lines":[...]}],"units":[{"unit","ok","functions":[...],"errors":[...]}]}`
  `--oracle-repo` with `--input` from a sandbox: host materializes `base_rev` via `git -C H archive` into `--cache-dir/<base_rev>/` (once), writes generated files, verifies `git -C H rev-parse base_rev^{tree}` == `base_tree`.
- `mwcc --repo R --base-ref REV --edits-hash X --revert-edits e1,e2,... [--functions F,...] [--attribute GROUPS.json] [--jobs N<=3] [--out FILE]`
  → `{"tool","version","edits_hash","functions":[{"unit","name","base":{"status","match_percent"},"candidate":{...},"real_only":{...},"sstar_vs_candidate":"identical"|"stack_only"|"code"|"only_a"|"only_b","target_relocs":[...],"candidate_relocs":[...],"attribution":[{"group","delta"}]}],"errors":[...]}`
  Recomputes edits from `git show REV:path` vs working tree; refuses (exit 2) if the hash differs.
- `decide --reduce REDUCE.json --mwcc MWCC.json [--evidence-repo H] [--approvals FILE] [--lessons FILE] [--out FILE]`
  → `{"attempt":"pass"|"steering_located"|"unresolved","reasons":[...],"functions":[{"unit","name","decision":"pass"|"steering_located"|"unresolved","semantic":"clean"|"steering"|"unresolved","analysis":"complete"|"incomplete","audit_label":"real"|"mixed"|"steering"|"unresolved","match":{"base","candidate","real_only"}}],"removable_noncosmetic":[group ids],"probes":[PROBE...]}`
- `check --repo R --base-ref REV [--oracle-repo R] [--functions ...] [--out FILE]` = edits + reduce + mwcc + decide in one process; output `{"edits":…,"reduce":…,"mwcc":…,"decision":…}` (texts omitted from `edits` unless `--full`).
- `apply --report CHECK.json [--dry-run]` writes S* (backfill only).
- `fingerprint --repo R --unit U [--source-file F]` debug.

### 2.4 Probe JSON (`steering_diagnose.py build_probe(...)`)
```json
{"function":"T::f","unit":"Enemy/x","match":{"base":99.1,"candidate":100.0,"real_only":99.7},
 "steering_edits":[{"file":"src/Enemy/x.cpp","line":120,"shapes":["temp_alias"],"before":"…","after":"…","delta":0.3}],
 "unresolved":[{"file":"…","line":1,"shapes":["other"],"reason":"…"}],
 "hypotheses":[{"cause":"missing inline function","why":"…","how_to_check":"real_code_evidence inlines --type T --member m"}],
 "evidence":{"map_callees":[…],"emitted_inlines":[…],"unused":[…],"header_inlines":[…],"sibling_uses":[…],"jsystem_hits":[…]},
 "lessons":[{"id":"…","steering":"…","real_cause":"…"}]}
```
Serialized size ≤ 3 KB (truncate lists).

### 2.5 `evidence_search.py` (evidence slice)
Library functions (used by diagnose) and CLI subcommands of the same names, all read-only, `--repo` = game checkout (default `$ORCH_GAME_HOST_REPO_ROOT`, then `$ORCH_GAME_REPO_ROOT`), `--version GMSJ01` default from repo:
- `map_calls(repo, symbol) -> {"symbol","object","size","callees":[{"name","kind","object"}]}`
- `map_unit(repo, unit) -> {"unit","functions":[{"name","kind":"global|weak|local","unused":bool,"size"}]}`
- `inlines(repo, type_name, member=None) -> [{"name","file","line","body"}]`
- `usage(repo, inline_name, unit=None) -> [{"function","unit","match_percent"}]`
- `jsystem(query, game="all", limit=20, refs_root=None) -> {"available":bool,"hits":[{"game","file","line","text"}],"fetch_hint"?}`; refs root default `$ORCH_GAME_STATE_DIR/refs/jsystem`.
CLI: `python3 evidence_search.py <map-calls|map-unit|inlines|usage|jsystem> ... --json`.

### 2.6 Data files
- Lessons: `games/sms/knowledge/sources/injectable/steering_lessons/lessons.jsonl`, one JSON per line: `{"id","function","pr","steering":{"shapes":[...],"summary","example"},"real_cause":{"kind","summary","evidence"},"outcome":"real"|"mixed"|"loop_confirmed","reviewed_by"}`.
- Approvals: `games/sms/knowledge/sources/injectable/steering_lessons/evidence_approvals.jsonl`: `{"symbol","function","provenance","approved_by","edits_example"}` (starts empty, with a README line in a sibling `README.md`).
- JSystem refs lock: `TOOLS/refs.lock.json` `{"tp":{"repo":"https://github.com/zeldaret/tp","commit":"c8fa8c9e2aab72cf4e5db0e5d1c84a9ea6ee6eb0","paths":["libs/JSystem"]},"tww":{"repo":"https://github.com/zeldaret/tww","commit":"8b93b372dc8e841f12ddfb7e0215626f62b05417","paths":["include/JSystem","src/JSystem"]}}`; fetch script `TOOLS/fetch_jsystem_refs.sh [dest]`.

## 3. TS server API (server-core slice creates; others import)
`apps/server/src/core/validation/steering/steering-check.ts`:
```ts
export const STEERING_CHECK_TOOLPACK_PATH = "_impl/gamecube/tools/steering_check.py";
export const STEERING_GATE_BUDGET_MS = 240_000;
export type SteeringDecisionKind = "pass" | "steering_located" | "unresolved";
export interface SteeringFunctionDecision { unit: string; name: string; decision: SteeringDecisionKind; semantic: "clean"|"steering"|"unresolved"; analysis: "complete"|"incomplete"; audit_label: string; match: { base: number|null; candidate: number|null; real_only: number|null } }
export interface SteeringProbe { function: string; unit: string; [k: string]: unknown }
export interface SteeringDecision { attempt: SteeringDecisionKind; reasons: string[]; functions: SteeringFunctionDecision[]; removable_noncosmetic: string[]; probes: SteeringProbe[] }
export interface WorkerSteeringResult { mode: SteeringGateMode; decision: SteeringDecision | null; error: string | null; artifactPath: string | null; durationMs: number }
export type SteeringRunner = (args: string[], where: "sandbox" | "host") => Promise<CommandResult>;
export function runWorkerSteeringGate(params: { baseRev: string; functions: string[]; hostRepoRoot: string; cacheDir: string; outputDir: string; attemptIndex: number; mode: SteeringGateMode; runner: SteeringRunner; budgetMs?: number }): Promise<WorkerSteeringResult>; // edits(sandbox) -> reduce(host) -> mwcc(sandbox) -> decide(host); never throws
export function parseSteeringDecision(json: unknown): SteeringDecision | null;
export const STEERING_LOCATED_INSTRUCTION: string;
export function steeringRejectionReason(result: WorkerSteeringResult): string | null; // null when pass/shadow
```
`apps/server/src/core/harness-runtime/run-state/steering.ts`:
```ts
recordSteeringObservation(db, row): void; latestSteeringProbe(db, {gameId, unit, symbol, functionSourceSha?}): SteeringProbe | null;
recordSteeringBackfill(db, row): void; recordSteeringCoverage(db, row): void; steeringCoverageFor(db, gameId, unit): {baselineRev, clean, analyzedRev}|null;
recordSteeringBackfillRun(db, {gameId, baselineRev, clean}): void; latestCleanSteeringBackfillRun(db, gameId): {baselineRev, recordedAt}|null;
```
All tolerate missing tables (return null/empty) like `stack-only-functions.ts`.

## 4. Prompt text (prompt slice uses verbatim, may tighten wording)
Section tag `<steering_policy>`; bullets:
1. Steering is a source rewrite that behaves exactly like the code it replaces (single-use temps and aliases, split expressions, reordered declarations or statements, accessor↔field swaps, if↔ternary, operand order, `int`↔`s32`, `* 0.5f`↔`/ 2.0f`). It only moves register choice, instruction order or the stack frame.
2. A steering match is never done. The steering gate reverts every behaviour-identical edit, rebuilds, and only counts what survives. Edits it cannot certify are rejected too.
3. Use steering as a probe: find the smallest same-behaviour edit that moves the codegen, then find what the original source really had. Likely causes: a missing inline function, the wrong inline, a wrong type or signedness, an inline whose body is wrong.
4. Read `<steering_probe>` when present: it lists the steering edits, the match without them, hypotheses, and evidence.
5. Search for real evidence with `real_code_evidence`: `map-calls` (what the original calls), `map-unit` (inline and weak functions emitted in this unit), `inlines` (header inlines for a type or member), `usage` (matching functions that use an inline), `jsystem` (Twilight Princess and Wind Waker JSystem sources).
6. Write the real construct, remove every steering edit, and keep real fixes in their own statements; a hunk mixing a real fix with steering is rejected as unresolved.

Repair instruction (`STEERING_LOCATED_INSTRUCTION`): "The steering gate rejected this attempt: the match depends on edits that behave exactly like the code they replace. Use them as a probe. Keep only behaviour-changing fixes, find the real construct the original used (see steering_probe), and remove the steering edits."
