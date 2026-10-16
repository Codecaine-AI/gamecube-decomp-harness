# Addendum: decompile in order (SMS)

Source: SMS maintainer Mrkol closed doldecomp/sms#347 and #348 unmerged (2026-10-15): "Please leave MarNameRefGen alone, people will fill it in eventually when the relevant stuff is properly decompiled. This is doing things out of order" and "don't jump the fence please". The PRs filled in `src/System/MarNameRefGen_*.cpp` (name → `new TClass` factories) and added headers declaring enemy classes (Koopa, KoopaJr, Killer, FruitsBoat, Kukku, ...) whose own units are not decompiled.

## Rule
Do not fill in code that depends on classes whose implementation units are not yet decompiled, and do not add or expand headers for undecompiled classes just to make a caller build. MarNameRefGen is the canonical case.

## Definitions (shared module `toolpacks/gamecube-decomp/_impl/gamecube/tools/unit_progress.py`)
- Unit progress: `build/<ver>/report.json` per unit `measures.fuzzy_match_percent` and `matched_code_percent`; `objdiff.json` / report `metadata.source_path` says whether the unit has a source file. A unit with no source path, or no measures, has progress 0 (asm only).
- Class owner unit: from `mario.MAP` (read at the base rev for the gate; repo checkout for lints): the object file holding the class's vtable symbol `__vt__<len><Class>`; if none, the object holding most of the class's member functions (`.text` rows and call-tree rows, demangled). Object file → unit through `objdiff.json` unit names/source paths. Templates and classes with no map rows → owner unknown.
- `decompiled(unit)`: has source and `fuzzy_match_percent >= ORDER_MATCH_MIN` (default 90).
- `mostly_unmatched(unit)`: no source, or `fuzzy_match_percent < MOSTLY_UNMATCHED_BELOW` (default 50).
- Both thresholds are module constants, overridable per call; documented in the standard.

## 1. Gate: ordering check (steering_check.py, `decide`, SMS only via the steering gate)
- Denylisted paths: `src/System/MarNameRefGen*.cpp` (list kept in `unit_progress.ORDER_GATED_PATHS`, SMS game policy).
- For each changed denylisted file: collect the classes referenced by ADDED lines (`new TX`, `TX::`, `TX(`, `<Header>` includes added for a class header). Every referenced class must have a known owner unit that is `decompiled`. Otherwise → violation `{kind: "out_of_order", file, line, class, owner_unit, owner_progress, reason}`.
- Unknown owner or missing report.json → `unresolved` (analysis incomplete), never pass.
- Attempt kind: `rule_violation` (same mechanism as the UNUSED rule; violations listed alongside). `apply` reverts out-of-order hunks in denylisted files (S* excludes them).

## 2. Lints (sms_fidelity, programmatic, error on worker and pr_gate)
- `sms_out_of_order_fill`: an added line in `src/System/MarNameRefGen*.cpp` that references a class whose owner unit is not `decompiled` (or unknown).
- `sms_undecompiled_class_decl`: a hunk in `include/**` that adds a class declaration or member declarations (data members, member function declarations, inline bodies) for a class whose owner unit is `mostly_unmatched`; also a new header file whose classes are all owned by mostly-unmatched units. Upstream declarations already present are not flagged (only added lines).
- Both read map/objdiff/report from the merge base or repo checkout; no report or map → skip (Melee and unbuilt checkouts are unaffected). Messages quote the maintainer and say: leave it until the class's own unit is decompiled.

## 3. Standards and prompt
- Standard `global_standard:sms-decompile-in-order` (sms_fidelity) with the ruling, thresholds, do/do_not, examples (MarNameRefGen_BossEnemy factory line `return new TKoopa;`, a header added for `TKillerManager`), qa_rule_ids both lints; ids in order.json.
- Worker prompt `<steering_policy>`: one bullet ("Decompile in order: don't fill in MarNameRefGen*.cpp or other code that needs classes whose units are not decompiled, and don't add or expand headers for undecompiled classes to make a caller build; the gate and lint reject it").

## 4. Review lessons in the knowledge store
- `games/sms/knowledge/sources/injectable/steering_lessons/review_rulings.jsonl`: `{id, date, pr, reviewer, ruling, quote, rule, enforced_by: [rule ids / gate checks], examples}` for (a) UNUSED-reconstruction (#342) and (b) decompile-in-order (#347/#348).
- The seed CLI admits rulings as `pattern` entities (`review-ruling:<id>`) with a fact carrying the ruling; run with `--apply` against the SMS knowledge store.

## Tests
unit_progress (fixture map/objdiff/report: vtable owner, majority owner, unknown, thresholds); gate (denylisted file referencing decompiled vs undecompiled class, unknown owner → unresolved, apply removes); lints (both rules, non-SMS skip, no report skip, upstream declarations not flagged); TS certificate handles `out_of_order` violations; prompt bullet; seed of rulings.
