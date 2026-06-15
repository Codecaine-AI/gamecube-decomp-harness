# QA Rule Hardening — Standards vs. Full Session Delta (2026-06-12)

Deep comparison of the 16 global decomp standards against the current full
session delta (origin/master...HEAD, 121 files, ~27k diff lines — the content
of draft PR 2672). Goal: find violation classes the agents commit that the
gate rules do not catch, and turn them into hard, gateable feedback.

Method: every standard swept against added lines of the delta with targeted
patterns, calibrated against origin/master norms (a pattern with zero upstream
occurrences in `src/` is unambiguous residue). Scan artifact for the already-
covered rules: `reports/qa-scan-full-session-delta-2026-06-12.json`
(139 errors / 35 files).

## Coverage matrix (standard → enforcement today)

| Standard | Gate (`scan_diff`) | Worker tool (`scan.py`) | Runner TS lint |
| --- | --- | --- | --- |
| assert-report-macros | `unrolled_assert` | same | — |
| literals-and-data-ownership | `extern_literal_anchor`, `new_data_anchor` | partial | address-externs |
| no-string-literal-symbol-regression | `string_literal_to_symbol`, `packed_string_blob` | partial | removed-string-lines |
| data-sections-and-tu-splits | `self_tu_extern` | — | — |
| no-define-alias-global-renames | — | — | TS only (`no-define-alias-global-renames`) |
| typed-fields-over-pointer-math | — | M2C_FIELD + casts (tool only) | — |
| avoid-pragmas-register-asm | — | — | — |
| canonical-control-flow-and-macros | — | — | — |
| conservative-naming | — | — | — |
| header-inlines | indirectly via unrolled_assert | — | — |
| natural-loops, infer-authored-style, text-before-data, matching-tactics-need-evidence, truthful-headers, verification-ledger | not hard-gateable (judgment) | — | — |

## New violation classes found in the delta

### 1. Macro-laundered asserts (worst find — actively evades the detector)
Agents define local clones of the assert macros, so the `__assert` call sits
inside a `#define` body where the line-based detector misses call sites:

- `src/melee/gr/grvenom.c`: `#define VENOM_JOBJ_ASSERTMSG(line, cond, msg)`
- `src/melee/lb/lbbgflash.c`: `#define fake_HSD_ASSERTMSG(line, cond, msg)` (literally named "fake")
- `src/melee/mn/mndiagram.c`: `#define MNDIAGRAM_JOBJ_ASSERT(line, cond)`

Standard: assert-report-macros + header-inlines (these should be the jobj.h
inline helpers).

### 2. Assert idiom downgrades (22 removals across 11 files)
Hunks that **remove** `HSD_ASSERT*` and add open-coded replacements:

- `src/melee/mn/mnnamenew.c`: `HSD_ASSERTREPORT(...)` → `OSReport(layout->assert_msg); __assert(layout->assert_file, ...)`
- `src/melee/cm/camera.c`: 4× `HSD_ASSERTMSG` → `__assert(cm_803BCBD0, ...)` — assert strings anchored to **data labels**, combining two banned patterns
- `src/melee/gm/gmresult.c`: 5× removed; `HSD_ASSERTREPORT` unrolled into `OSReport` + promoted `static char lbl_803D6974[] = "Error : ..."` strings
- also: mnname.c, grrcruise.c, gmstaffroll.c, grgreens.c, grinishie1.c

### 3. register / inline asm in src/ (zero upstream)
- `src/melee/gr/grvenom.c`: `register s32 flag;`
- (`extern/dolphin/THPDec.c` has 11 `register` + `asm {}` — but that file
  exists upstream and SDK code legitimately uses asm; rules must scope to
  `src/` only.)

### 4. m2c residue names — 435 added hits in src/ (zero upstream)
`temp_f28`, `var_r30`, `phi_r5`-style locals retained in code. Top offenders:
grkongo.c (106), gm_1601.c (87), ftCo_0A01.c (50), groldkongo.c (50). Plus 19
`sp24`-style typed locals. Standard: conservative-naming.

### 5. m2c goto/label residue — 64 added gotos in src/ (zero upstream)
`goto block_30;`, `goto cpuattack_false_3;` etc. — m2c block-structure
residue. Standard: canonical-control-flow-and-macros.

### 6. Define-alias to expressions (gate has no define rule at all)
- `src/melee/gm/gm_18A5.c`: `#define tm ((TmData*) arg0)`
- `src/melee/gr/grinishie1.c`: `#define block_idx_table grI1_803E49A8.block_table`
- open-coded macro clone: `#define FTCO_800A9CB4_ABS(x)` (canonical macro is `ABS`)

The TS runner lint catches identifier→identifier aliases, but the gate/ship
path has no define rule, and identifier→expression aliases are caught nowhere.

### 7. M2C_FIELD / type-erasing casts not in the gate
3 added `M2C_FIELD` uses (ftCo_ItemThrow.c, gm_1601.c ×2) and 155 added
`(void*/u8*/char*)` casts. The worker *tool* checks these; the enforced gate
does not.

### 8. New pragmas — 28 added, but upstream-calibrated
origin/master src/ already contains 227 `#pragma push`, 208 `dont_inline on`,
32 `auto_inline`, 4 `global_optimizer`, and `pool_data` (particle.c). Pragmas
are an established tactic — but `inline_depth(4)` (ftCo_Guard.c) has zero
upstream precedent, and PR 2659 review pushed back on new pragmas.

### 9. Recurring tombstone pattern
particle.c re-added `static char lbl_8040A540[0x268]` — the tombstone fired
(1 finding), proving the resubmission mechanism works.

## Proposed rule additions (all: added lines only, scoped to `src/`)

Shared in `tools/source_editing/review_lint/api/_qa_rules.py` so the worker
tool, the per-attempt gate, the ship gate, and the future epoch sweep all see
the same rules.

| Rule | Severity | Detection |
| --- | --- | --- |
| `fake_assert_macro` | error | added `#define` whose (multi-line) body contains `__assert`/`__assert_msg`/`OSReport`, or macro name matching `_ASSERT(MSG\|REPORT)?$` |
| `assert_idiom_downgrade` | error | same-file hunk set removes `HSD_ASSERT\w*(` and adds `__assert(`/`OSReport(` |
| `register_keyword` | error | added `register <type> <ident>` |
| `inline_asm` | error | added `asm {` / `asm volatile` / `asm(` |
| `m2c_residue_names` | error | added `\b(temp\|var\|phi)_[rf]\d+\b`; `sp[0-9A-F]{2,}` typed locals as warning |
| `m2c_goto_label` | error | added `goto block_\d+` or label `block_\d+:`; any other added `goto` → warning (zero upstream) |
| `m2c_field_use` | error | added `M2C_FIELD(` (promote from tool-only to gate) |
| `define_alias` | error | added `#define IDENT IDENT` (port of TS rule) and `#define ident (expr)` aliasing a variable/member; macro names ending `_ABS/_MIN/_MAX/_CLAMP` → warning (use canonical macros) |
| `novel_pragma` | warning | added `#pragma` whose directive is outside the upstream-established set {push, pop, dont_inline, auto_inline, force_active, fp_contract, global_optimizer, pool_data, clang diagnostic}; established ones stay unflagged |
| `type_erasing_cast` | warning | added `(void*/u8*/char*)` casts (155 hits — too noisy for error; many legit pointer walks) |

### Moved-vs-invented suppression (false-positive control)
camera.c shows the hazard: one `__assert(cm_803BCBD0...)` exists verbatim on
origin/master, so reorganized code re-flags. Add a shared suppression helper
(like `new_data_anchor` already has): if the added line exists verbatim in the
upstream version of the same file, downgrade error → warning. Apply to
`unrolled_assert` + all new rules.

### Severity profiles
`scan_diff` already exits 1 = errors / 2 = warnings-only, and gates fail on
errors. No profile mechanism needed initially — the table above is calibrated
so errors are zero-upstream-precedent patterns and warnings are
judgment/evidence tactics.

## Not hard-gateable (leave to review/preship agent)
natural-loops, infer-authored-source-style, text-before-data-matching,
matching-tactics-need-evidence (PAD_STACK ×81 and volatile ×36 in the delta
are legitimate evidence-backed tactics), truthful-headers (needs cross-file
analysis), verification-ledger (report-shape, enforced by the runner already).

## Implementation order
1. Add the 10 rules + moved-vs-invented suppression to `_qa_rules.py` with
   tests (`tests/test_qa_rules.py` pattern exists).
2. They flow automatically into: worker `review_lint_scan` tool, per-attempt
   QA gate, ship gate (`verifyShipSet`/`openPrForSlice`).
3. Epoch-time branch sweep (`scan_diff --gate` vs origin/master) + requeue
   wiring — implemented but NOT bulk-run until the current PR cleanup lands.
4. Backfill: re-scan the delta with the new rules to size the real cleanup
   list (expect ~500+ findings dominated by m2c residue names).
