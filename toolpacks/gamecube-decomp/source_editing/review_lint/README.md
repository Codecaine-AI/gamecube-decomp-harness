# Review Lint Tool Suite

This suite keeps decomp-specific review guardrails in an explicit tool API. It
can scan a file or text snippet for:

- type-erasing pointer casts such as `(void*)`, `(u8*)`, and `(char*)`;
- `M2C_FIELD(...)` residue;
- functions containing multiple distinct `Item*` or `Fighter*` variables,
  which often signals an inlined helper that should be split or reused.

Use this before returning source edits or when PR review needs a quick
decomp-specific anti-pattern check.

## Diff-Aware QA Ship Gate: `api/scan_diff.py`

`scan_diff.py` is the deterministic layer of the QA ship gate
(`docs/10-system-design/60-score-and-pr-handoff.md`). It scans
the ADDED lines of a unified diff — never pre-existing upstream code — for
maintainer-rejected patterns. Input modes:

- `--repo <melee-root> [--base <ref>]`: diff `merge-base(ref, HEAD)..HEAD`
  (default base `origin/master`); `--include-worktree` diffs the worktree
  instead of HEAD; `--path <pathspec>` (repeatable) restricts the diff.
- `--repo <melee-root> --diff-file <patch>`: scan a pre-computed unified diff
  (the worker-side L1 lint and per-slice pre-ship review use this).
- `--surface worker|pr_gate` (optional, also accepted by `scan.py`): resolve
  per-surface severities for rules whose slice manifest declares a
  `"surfaces"` map. Omitted = base severities on every surface (fully
  backward compatible). The TS invoker passes `worker` from the worker-side
  L1 lint and `pr_gate` from all PR-side gates.

Stdout is always the JSON document
(`{tool, operation, status, repo, base, findings, counts}`); the
human-readable summary goes to stderr. The rule engine lives in
`api/_qa_rules.py` (shared with `scan.py`); the rule implementations live in
per-family vertical slices under
`projects/melee/knowledge/sources/injectable/decomp_standards/standards/<family>/rules.py`
(env override `REVIEW_LINT_STANDARDS_DIR`), each validated against its
`slice.json` manifest and assembled into the registry in a canonical rule
order. Slices may also export `POST_SCAN_HOOKS` (post-scan escalations such
as the extern ownership analysis); the splits.txt ownership helper is in
`api/check_extern_ownership.py`.

### Rules

Every rule is a hard error except the two explicitly-justified advisory rules
(`type_erasing_cast` and the `spNN` stack-slot subcase of
`m2c_residue_names`), which stay warnings and carry `"llm_review": true` in
their finding detail so downstream consumers route them to LLM review.

| Rule id | Severity | Detects |
| --- | --- | --- |
| `extern_in_c` | error | ANY added `extern` declaration in a `.c` file: object externs of any type and function externs, file-scope or block-scope (`extern "C"` blocks and macro definition/continuation lines are skipped). The post-scan ownership analysis picks the repair message: address inside the TU's own `splits.txt` ranges → "this TU owns the data; define it here in binary order" (float-typed `.sdata2`-band symbols also carry the isolated `sdata2_order` helper detail); definition elsewhere in the same TU → "forward declaration: reorder/restructure instead" (function externs note the MWCC inline-decision hazard); otherwise → "cross-TU reference: declare it in the owning header and include it". Function externs carry `global_standard:matching-tactics-need-evidence`; data externs keep `global_standard:literals-and-data-ownership`. Excluded in the SDK-like dirs (see path excludes below). Replaces the former `extern_literal_anchor`, `function_extern_visibility`, `self_tu_extern`, `new_data_anchor`, and `same_tu_function_extern` rules. |
| `string_literal_to_symbol` | error | A string-literal call argument replaced by a data symbol or `ident + 0xNN` offset expression within the same hunk. |
| `numeric_literal_to_symbol` | error | A numeric literal such as `0.0F`, `1.0F`, or `-F32_MAX` replaced by an address-style data symbol within the same hunk. |
| `address_named_static_data` | error | Added `static`/global data definitions with address-style names such as `lbl_804DA60C` or `grSmoke_804D0000`. Exact moved pre-existing lines are downgraded to warnings by the moved-vs-invented pass. |
| `packed_string_blob` | error | Hand-packed `static char name[0xNN] =` blobs concatenating string literals with `\0` padding, or `#define NAME (lbl_8XXXXXXX + 0xNN)` pointer-offset macros. |
| `copied_jobj_inline` | error | Local copies of `jobj.h` inline helper bodies in source TUs instead of calls to canonical `HSD_JObj*` helpers. |
| `stage_ground_var_owner` | error | Stage TUs that add `gv.<member>` accesses for another stage family's GroundVars arm instead of the owning stage arm. |
| `unrolled_assert` | error | Open-coded `__assert`/`__assert_msg` call sites in `src/melee/**`/`src/sysdolphin/**` where the source idiom is `HSD_ASSERT*` (macro definitions and continuation lines are skipped). |
| `fake_assert_macro` | error | Added local `#define` macros whose body contains `__assert`, `__assert_msg`, or `OSReport`, or whose name ends in `_ASSERT`, `_ASSERTMSG`, or `_ASSERTREPORT`. |
| `assert_idiom_downgrade` | error | A hunk removes `HSD_ASSERT*` and adds raw `__assert`/`OSReport` code in the same file. |
| `register_keyword` | error | Added `register <type> <ident>` steering (SDK dirs excluded). |
| `inline_asm` | error | Added inline assembly (`asm {`, `asm volatile`, or `asm(...)`) (SDK dirs excluded). |
| `m2c_residue_names` | error / warning | Added `temp_rNN`/`var_rNN`/`phi_fNN`-style locals are errors; typed `spNN` locals stay warnings and route to LLM review (`llm_review` detail flag). |
| `m2c_goto_label` | error | Added `goto block_NN`/`block_NN:` labels AND any other added gotos are errors. |
| `m2c_field_use` | error | Added `M2C_FIELD(...)` bridge-code uses. |
| `pointer_offset_arithmetic` | error | Added raw byte-pointer offset arithmetic such as `((u8*) obj) + 0x14`, which should become a typed field, correct union arm, helper, or temporary struct. |
| `define_alias` | error | Added identifier/expression `#define` aliases and local `_ABS`/`_MIN`/`_MAX`/`_CLAMP` macro clones. |
| `novel_pragma` | error | Added `#pragma` directives outside the upstream-established set (`push`, `pop`, `dont_inline`, `auto_inline`, `force_active`, `fp_contract`, `global_optimizer`, `pool_data`, `clang diagnostic`). |
| `codegen_pragma` | error | Added established-but-suspicious codegen pragmas (`dont_inline`, `auto_inline`, `global_optimizer`, `pool_data`) in normal source. |
| `volatile_local_tactic` | error | Added indented local `volatile` declarations in normal source (SDK dirs excluded). |
| `type_erasing_cast` | warning (LLM review) | Added `(void*)`, `(u8*)`, or `(char*)` casts. Advisory: stays a warning and carries the `llm_review` detail flag. |
| `banned_pattern:<id>` | error | Regex detectors loaded from `projects/melee/knowledge/sources/injectable/banned_patterns/data/banned.jsonl` (env override `REVIEW_LINT_BANNED_DIR`). |
| `resubmission_tombstone` | error | An added hunk whose normalized token-shingle Jaccard similarity to a previously rejected hunk meets the tombstone's threshold (default 0.7; hunks under 12 tokens are never checked). The finding cites the original rejection comment URL. |

Every finding carries a `standard_id` so agent-facing errors cite the
standard the worker already saw in its prompt. Data/literal ownership findings
also carry structured repair details (`repair_hint` and, when applicable,
`data_ordering_repair`) so worker repair loops can distinguish "restore the
literal" from "use an isolated .sdata2 ordering helper after the literal is
restored."

### Path Excludes (SDK-like code)

Rules may declare an `"excludes"` glob list in their slice manifest (mirrored
in the slice `rules.py` entry). A hunk whose file matches any exclude glob is
skipped for that rule even when `applies_to` matches. This is the single
mechanism for carving vendor-convention code out of a rule's scope; do not
narrow `applies_to` for the same purpose. `extern_in_c`,
`volatile_local_tactic`, `inline_asm`, and `register_keyword` exclude the
SDK-like directories where upstream vendor conventions differ:
`src/dolphin/**`, `src/MSL/**`, `src/MetroTRK/**`, `src/Runtime/**`.

### Per-Surface Severity and LLM Review Routing

Slice manifest rule entries accept two optional keys:

- `"surfaces": {"worker": "error"|"warning", "pr_gate": ...}` — per-surface
  severity overrides, resolved only when the caller passes `--surface`;
  absent surfaces fall back to the base severity.
- `"llm_review": true` — the finding is advisory and must be routed to LLM
  review; the flag is propagated into the finding's `detail` dict.

Exactly two advisory cases are flagged `llm_review` today: the
`type_erasing_cast` rule and the `spNN` stack-slot-name subcase of
`m2c_residue_names` (declared in the slice `rules.py` partial because it is a
subcase, not the whole rule).

### `.sdata2` Order Helper

`api/sdata2_order_helper.py` is the explicit repair tool for the common case
where an exact text match was achieved by replacing numeric literals with
address-named `.sdata2` symbols. The correct repair sequence is:

1. Restore the numeric literal in normal function logic.
2. If the remaining mismatch is only `.sdata2` float/double order, preview the
   helper:

   ```sh
   python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/sdata2_order_helper.py \
     --repo-root <melee-root> --source src/melee/path/file.c --symbol lbl_804D0000 --json
   ```

3. Apply and validate only when that helper is the intended source edit:

   ```sh
   python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/sdata2_order_helper.py \
     --repo-root <melee-root> --source src/melee/path/file.c --symbol lbl_804D0000 --apply --validate --json
   ```

The helper reads the reference object under `build/GALE01/obj/<unit>.o`,
renders/replaces a narrow `sdata2_order` function, and with `--validate`
direct-compiles the TU to compare the current `.sdata2` float/double sequence
back to the reference. Repeat `--symbol` to keep the helper scoped to the
specific address-style labels from QA findings; omit it only when a full-TU
ordering helper is explicitly intended. It is read-only unless `--apply` is
present.

### Extern Ownership Analysis

Every added extern in a `.c` file is an `extern_in_c` error; the ownership
analysis (splits.txt ranges via `api/check_extern_ownership.py`, in-TU
definition checks, and the `symbol_existed_in_base` diff/base inference) only
selects the repair message — TU-owned data (the rejected gm_1832/grkongo
style from PRs #2656/#2657), same-TU forward declaration (the formerly
accepted ftcoll style from PR #2655, no longer allowed), or a cross-TU
reference that belongs in the owning header.

### Moved vs. Invented Residue

For `extern_in_c`, `unrolled_assert`, and the hardened rules above, an error
finding is downgraded to a warning when the exact added line already existed
verbatim in the base version of the same file. The melee tree still carries
~655 legacy externs in `.c` files, so code moved within a file must not
hard-fail; this keeps moved pre-existing residue visible without treating it
as newly invented gate-blocking code.

### Exit Codes (`--gate`)

- `0`: clean.
- `1`: at least one error finding (hard fail).
- `2`: warnings only.

Without `--gate` the exit code is `0` unless the tool itself fails (`3` for a
missing repo or diff file). Consumers share one invoker,
`apps/server/src/core/validation/qa/scan-diff.ts`: the L2 ship gate in `regression-check`
(fails closed on tool errors and requires zero errors plus zero warnings), the
worker-side L1 lint in `change-validation` (treats warnings as repair targets
but fails open on tool errors), and `pr-preship-review` (per-slice lint
evidence for the adversarial reviewer).
