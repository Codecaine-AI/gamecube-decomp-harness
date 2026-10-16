# Order-and-scope plan reviews

## Round 1
Correctness (Codex): BLOCKING (1) unit readiness != class readiness; unknown owner != shared; TDirectionCalc false block. (2) fence bypass via declaration placement (target .cpp, shared headers, typedef/rename), mixed headers, enclosing class needs whole file, BossHanachan.hpp ownership. (3) readiness from stale artifacts / HEAD recheck; self-authorizing; incremental attempts; serialize integration. (4) pure-diff fence can't enforce UNUSED; any caller change != inlined. (5) circular validation, whole-function blocking blocks partial factory work, starvation, shadow wording, human data doesn't support 50% threshold.
Integration (Codex): BLOCKING (1) sync tick transaction vs async Python loader. (2) zero-admitted epoch == settlement; need blocked-only state. (3) scope conflict parks run until operator; need defined rejection lifecycle. (4) micro-gate before steering can't classify UNUSED; tool_unavailable non-failing; ordering vs steering mode. (5) publish refusal must bind pushed SHA, recovery treats skips as done. Non-blocking: settlement current-board artifact, shadow wording, resolver absence, widening readiness plumbing, trailers ok (%s), defer live seeding and generic history tool.
Responses: plan v2 section 11.

## Round 2
Correctness: R1 #1 PARTIALLY, #2 RESOLVED, #3 PARTIALLY, #4 RESOLVED, #5 RESOLVED. BLOCKING: arbitrary header inline ctor grants readiness (bogus overload / earlier accepted bogus ctor). Non-blocking: one trivial member = started not construct-ready; local helpers fail closed; TDirectionCalc is declaration-only at 84bca82f; deferral/parking limits; adversarial expectations.
Integration: No blocking findings (all five RESOLVED/PARTIALLY non-blocking): blocked-only needs a discriminated admission result (no existing boundary-free path); rejection via resolve-integration primitives without the live guard; scope_refused status + SHA push + both boundary branches.
Responses: plan v3 section 12.

## Round 3
Correctness: round-2 blocker RESOLVED (header text never grants readiness; started vs construct_ready). No blocking findings.

# Implementation review: UNUSED rule + order rule v1
BLOCKING: (1) overload matched by param count (gate + lint); (2) `return ++X;`/`f()`/`*p` treated as trivial stubs; (3) include-discovered unknown classes dropped; (4) TS violation schema rejects real out_of_order output, repair instruction not by kind; (5) backfill ignores unknown order_checks for clean coverage; (6) mixed new header suppresses not-ready class findings; (7) namespaces treated as classes (JDrama). Non-blocking: ordering prompt bullet.
Responses: routed to owners (Python gate: 1,2,3,7; TS: 4,5; lint: 1,6,7 + stub rule); ordering bullet in the <order_and_scope> section.

# Order-and-scope implementation review round 1
## Validation (pre-review)
edit_scope 45/45 adjudicated violations caught, 0 ok hunks rejected, 0 ready-class false blocks; merged rejections: #343 BossHanachan.hpp (adjudicated violation) + 7 UNUSED bodies without evidence (all stub-test inlined). Bugs: pr_gate lint never scans include/; lint flags includes; edit_scope pr default policy empty; class rows report class head line.
## Correctness (Codex)
BLOCKING: (1) multiline/placement `new` bypass + precedent by tail name; (2) readiness signature match drops namespace/template/constness; (3) unknown #if treated active; (4) invented ctor satisfies PR prerequisite; (5) UNUSED certification fails open without map; (6) gate overload fallback by param count (earlier #1); (7) worker rejects unused_unverified before steering can certify; (8) evidence bound to claim base breaks at integration; publication gets no unused checks; (9) lint treats namespace-qualified functions as class declarations (earlier #7). Earlier #2-#6 fixed.
Responses: Python 1-6 + unit_inputs_sha256 binding; TS 7-8 (post-steering UNUSED check, content-hash evidence, publication collects certificates); lint 9; validation bugs routed.
## Integration (Codex)
BLOCKING: (1) UNUSED bootstrap blocked before steering (= correctness 7); (2) readiness loader validates only rev (wrong repo/version/map/policy accepted; missing functions ready); (3) publication drops UNUSED certificates (= correctness 8); (4) integration never validates edits_hash. Non-blocking: settlement current-board readiness stale after Sync. Verified OK: rejection atomicity/restart, blocked-only admission, refusal/recovery, SHA-bound push, config merge, prompts/preview/HEAD fixtures, rulings seed, epoch_targets.reason unused elsewhere, Melee policy revision unchanged, shadow widening not denying.
Responses: (2) + non-blocking → scheduler agent; (4) covered by unit_inputs_sha256 binding (TS + Python).
Round-1 responses landed: Python (expression-level reference scan + placement new + canonical precedent; exact signatures via shared signatures.py; preprocess.py evaluates #if, undecidable never evidence; prerequisite via readiness rules; link map required → unresolved; gate overload identity exact, self-caller excluded; unit_inputs_sha256 binding + cross-language vector; policy required; changed-line reporting); TS (UNUSED deferred pre-steering then post-steering certification; integration evidence by unit content, stale → reject + re-certify; publication collects integrated certificates per branch; pr_gate lint scans include/libs for SMS; policy on every caller); scheduler (full readiness identity, functions missing from index = unknown, post-Sync readiness artifact); lint (namespace-qualified functions; includes not findings; shared signatures). Validation re-run: 44/44, 0 FP with evidence, 0 false blocks, 14+14 TODO match.

# Order-and-scope implementation review round 2
Integration: R1 #1 RESOLVED, #2 RESOLVED, #3 RESOLVED, #4 PARTIALLY, non-blocking RESOLVED. PR-gate lint wiring OK; Melee byte-identical (config fingerprint, prompts/context, tool ids/env, knowledge, snapshot). BLOCKING: unit_inputs omits unchanged included headers → certificate survives later header changes. Response: unit_inputs = full dependency set (ninja deps / include closure, inconclusive if unknown) + unit_flags_sha256; regression tests.
Correctness: R1 #2,#5,#6,#7,#9 RESOLVED; #1,#4,#8 PARTIALLY; #3 NOT RESOLVED. BLOCKING: (1) preprocess blanks inactive lines → offset shift bypasses UNUSED and order fences; (2) unknown branch history lost across #elif; (3) wrong integer semantics/precedence in #if evaluation; (4) certificates omit unchanged dependencies (= integration finding). Response: offset-preserving blanking; undecidable-group tracking; C integer evaluator; full dependency set + flags hash.

# Order-and-scope implementation review round 3
Correctness: offsets RESOLVED; #elif history RESOLVED; C evaluation PARTIALLY (macro replacement evaluated independently; unsigned semantics); dependencies PARTIALLY (macro includes ignored). New BLOCKING: macro updates in undecidable branches applied as certain. Response: token-level expansion before parsing, unsupported (function-like macros, unsigned, casts, sizeof) → undecidable; macros touched in undecidable branches become UNKNOWN; non-literal/unresolvable includes → dependency discovery inconclusive unless ninja deps exist.

# Order-and-scope implementation review round 4
Correctness: (b) macro state RESOLVED; (c) includes RESOLVED; (a) PARTIALLY: unsuffixed hex `0xffffffffffffffff == -1` (unsigned) evaluates false → reference-mode bypass. Response (structural): reference mode no longer evaluates #if at all (all branches scanned; only added lines count); evidence mode undecidable for any literal/value outside signed 32-bit or needing unsigned/long semantics.
Integration round 3: No blocking findings.

# Order-and-scope implementation review round 5
Correctness: round-4 unsigned-#if RESOLVED (construction → order_gated, uncertified body → unused_unverified). New BLOCKING: evidence mode read directives inside block comments (`/* #define ENABLED 1 */` made a base body "active", exempting an UNUSED reconstruction). Response: evidence mode follows C translation phases (splices joined with offset map, comments/literal contents masked, then directives); `# /*c*/ define`, `#` + spaces, splices in directives handled; `%:`/`??=` directives, other trigraphs, unterminated comment/literal → undecidable from that point. Readiness definition and precedent scans receive comment-masked text.

# Order-and-scope implementation review round 6
Correctness: comment repro RESOLVED. New BLOCKING: `// ??/` (trigraph backslash in a line comment) splices the next line, commenting out a base `#define`; trigraphs were detected after masking. Response: `undecidable_file(raw)` on raw text before any phase: any trigraph, digraph, raw string, backslash-whitespace-newline / backslash at EOF, or bare CR makes the whole file undecidable (never evidence). SMS tree at 84bca82f: 1/1513 files trips it (libs/JSystem/src/JKernel/JKRArchivePub.cpp, `// '????'`) → JKRArchive declare not_ready (fail-closed residual; construct stays ready via JKRArchivePri.cpp).

# Order-and-scope implementation review round 7
Correctness: trigraph repro RESOLVED. No blocking findings.
Final validation (validate_order.py --force, adjudication sha256 ec57956e… verified): edit_scope 44/44 #347/#348 violations rejected, 7 merged UNUSED bodies rejected without evidence (0 with evidence), 0 false order blocks; readiness blocked 2 (14+14), deferred 14.
