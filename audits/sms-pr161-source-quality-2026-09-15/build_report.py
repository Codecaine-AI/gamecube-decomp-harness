"""Produce the audit report from reviewed findings and preserved checkpoint records."""
import json
import pathlib
import re
import shutil
from count_occurrences import build_counts

ROOT = pathlib.Path(__file__).resolve().parent
SNAPSHOT = pathlib.Path((ROOT / 'snapshot-path.txt').read_text().strip())
PR = json.loads((ROOT / 'pr.json').read_text())
CHECKPOINTS = json.loads((ROOT / 'checkpoints.json').read_text())
NOTES = json.loads((ROOT / 'worker-notes.json').read_text())
HEAD = PR['headRefOid']
URL = f'https://github.com/doldecomp/sms/blob/{HEAD}/'
FINDINGS = []

def add(id, title, file, start, end, category, certainty, commits, why, attribution, lint, related=()):
    checkpoints = [next(c for c in CHECKPOINTS if c['commit'].startswith(prefix)) for prefix in commits]
    lines = (SNAPSHOT / file).read_text().splitlines()
    FINDINGS.append(dict(id=id, title=title, file=file, start_line=start, end_line=end,
        source_url=f'{URL}{file}#L{start}-L{end}', category=category, certainty=certainty,
        snippet='\n'.join(lines[start-1:end]), checkpoints=checkpoints,
        why=why, score_attribution=attribution, lint_candidate=lint, related=list(related)))

add('F01', 'Return a Reference to a Destroyed Local', 'src/Player/Tongue.cpp', 27, 32,
    'partial function', 'Definite source defect', ['ff29c11c'],
    'scaleVector takes vector by value and returns const TVec3<f32>& to that parameter. The parameter dies when the helper returns. emit then reads the dangling reference when assigning mInitialVelocity at line 106. Inlining and a favorable instruction sequence do not make this valid C++. The pre-existing similarly broken JGeometry operators are not evidence that another dangling-reference helper is correct.',
    'The worker explicitly reports choosing the reference-return helper to remove the extra return object and 12 copy instructions. The retained checkpoint patch adds this helper and replaces its one call-site expression. That change raises the score by 6.08911 points, but it remains partial at 99.73267%.',
    'Hard error for returning a pointer or reference to an automatic local or by-value parameter.')

add('F02', 'Invent Class Layouts and Allocate the Wrong Size', 'src/System/MarNameRefGen_Enemy.cpp', 86, 104,
    'data section', 'Definite target-layout defect', ['5f9576f2', 'a0a91afb'],
    'The new DECL_ENEMY/DECL_MANAGER macros and nearby local classes define concrete types with just a guessed base and constructor. The factory uses new on them. Saved target/candidate instructions independently show TFruitsBoat allocating 0x178 versus 0x150 bytes, TFruitsBoatManager 0x58 versus 0x54, and TAnimalBird 0x184 versus 0x154. Those are wrong allocation operands, with an under-allocation risk when the real constructors access their members. This is more than a missing method or an uncertain name.',
    'The placeholder declarations arrived with the .rodata worker, which raised that section from 70.84811% to 100%. A later function checkpoint improved 96.27693% to 98.132034% while preserving the wrong sizes. Its notes explicitly identify incomplete local declarations and incorrect sizeof values. The later constructor fixes are not themselves the complaint. See allocation-evidence.json for extracted instruction windows.',
    'Require layout evidence for newly defined source-local classes used in new. Compare sizeof-derived allocation operands with target allocation sizes; a blanket ban on all small classes would produce false positives.',
    [('src/System/MarNameRefGen_Enemy.cpp', 31), ('src/System/MarNameRefGen_Enemy.cpp', 227)])

add('F03', 'Index Across Scalar Members as if They Were an Array', 'src/Player/MarioDraw.cpp', 475, 484,
    'partial function', 'Definite C++ object-bounds defect', ['d22ecee7', 'e0aee8f3'],
    'unk points to the scalar s16 member unkFC. The new unk[2] reads the separately declared unk100 member through out-of-bounds pointer arithmetic. Mario.hpp declares unkFC, unkFE, and unk100 as separate scalar members. Their physical adjacency explains the desired assembly but does not make them an array. A recovered array layout would need evidence and a change in the owning declaration.',
    'The introducing checkpoint combines several changes, 94.66879% to 98.47771%. Worker ablation isolates the pointer-relative field access at 95.05733% to 96.59872%; adding the s16 truncation then reaches 98.47771%. A later checkpoint reaches 98.64331%. The truncation itself is plausible and is not flagged.',
    'Flag arithmetic or indexing on pointers to individual scalar members when it crosses the member boundary.',
    [('include/Player/Mario.hpp', 1572)])

add('F04', 'Disable a Header and Substitute a Different TTakeActor', 'src/System/MarNameRefGen_MapObj.cpp', 1, 14,
    'data section', 'Definite conflicting class/linkage implementation', ['e98abb82'],
    'The file defines STRATEGIC_TAKE_ACTOR_HPP before includes, suppresses the real header, and supplies its own TTakeActor definition. It changes the canonical inline destructor into an out-of-line definition at line 80. Different translation units now see different definitions of the same class. The PR description also acknowledges that the introduced destructor is global where the map expects weak linkage.',
    'The .data checkpoint moves from 56.64557% to 100%, bundled with the dummy destructor calls in F08. An earlier worker response correctly identifies the owning-header repair but records that widening was denied. The local replacement then bypasses that ownership boundary. Section parity does not resolve the class-definition or symbol-linkage defect.',
    'Hard error for a source file predefining another project header\'s guard. Check duplicate externally linked class definitions and destructor linkage against the map.',
    [('include/Strategic/TakeActor.hpp', 14), ('src/System/MarNameRefGen_MapObj.cpp', 80)])

add('F05', 'Macro-Rename a Library Class to Insert a Conflicting Copy', 'src/System/MarDirectorSetupObjects.cpp', 8, 10,
    'data section', 'Definite conflicting class definition', ['31f53f27'],
    'The macro changes the header\'s JDrama::TOrthoProj name to TOrthoProjWithDefaultName. A local JDrama::TOrthoProj is then recreated at lines 48-71 with a different constructor string. The target does support the blur-camera label, but this implementation leaves incompatible definitions of TOrthoProj across translation units. Recovering the correct constructor interface belongs in the owner.',
    'The .rodata score rises from 98.82237% to 100%. Earlier worker evidence precisely identifies the string mismatch and says header widening was denied because the header does not declare .rodata. That is evidence of the scope restriction encouraging a local workaround, not evidence that the workaround resembles original source.',
    'Flag macros that rename known project/library types around includes, especially when a replacement class with the old name follows.',
    [('src/System/MarDirectorSetupObjects.cpp', 48), ('include/JSystem/JDrama/JDRCamera.hpp', 112)])

add('F06', 'Replace the Pollution Header with a Different Local Class', 'src/System/MarNameRefGen_Map.cpp', 18, 31,
    'data section', 'Definite conflicting class definition', ['c4d25c4a'],
    'The canonical TPollutionTest header is replaced with a local definition that adds a name-taking constructor. Other translation units still use the header definition with an implicit default constructor. The recovered Japanese label may be correct; maintaining two different definitions of the same externally linked class is wrong.',
    'The checkpoint targets .rodata, 96.875% to 100%. The worker also reports getNameRef_Map reaching a strict 100% function match. This example therefore includes a reported exact function even though its acceptance target was a section.',
    'Compare new source-local definitions against owning headers. Flag replacement of an owner include with a conflicting class body.',
    [('include/Map/PollutionEvent.hpp', 6)])

add('F07', 'Discard strcmp Results to Emit Constructor Labels', 'src/System/MarNameRefGen_MapObj.cpp', 155, 158,
    'data section', 'Definite inert work for data emission', ['22b3c3bc'],
    'Fifteen newly active placeholder branches compare the input with a factory key, call strcmp again against a constructor label, discard that result, and return nullptr. The second comparison does no useful work and does not instantiate the missing object. Examples include MapObjFlag, BigWindmill, LeafBoat, and TelesaSlot. This encodes missing string bytes through fake work instead of recovering the missing factory implementations.',
    'The .rodata checkpoint reaches 100% from 93.27765%. Its patch also restores ordinary infectious strings and adds the vector filler in F08. The section-wide gain is shared; it is not fifteen independently measured improvements.',
    'Flag discarded results of pure comparison functions such as strcmp. Escalate when a new factory branch contains such a call and returns null.')

add('F08', 'Add an Uncalled Dummy to Force Constants and Vtables', 'src/System/MarNameRefGen_MapObj.cpp', 82, 91,
    'data section', 'Definite artificial emission scaffold', ['22b3c3bc', 'e98abb82'],
    'This static function has no callers. It stores a zero vector and immediately overwrites it with a one vector, then calls three unrelated destructors. The vector writes first appeared in the .rodata patch; the destructor calls were added for .data emission. There is no recovered game operation that owns this collection of work. Its explicit purpose is retaining constants and virtual tables.',
    'The associated .rodata gain is 93.27765% to 100%, and the later .data gain is 56.64557% to 100%. Both scores are shared with other edits, including F07 and F04. Count this as a distinct source pattern, not additional independent score gain.',
    'Flag newly added unreferenced static functions with overwritten stores or unrelated destructor calls. Confirm that they are not real registration or linker-retention hooks.')

add('F09', 'Create an Unused Array to Reproduce Missing Factory Strings', 'src/System/MarNameRefGen_BossEnemy.cpp', 24, 40,
    'data section', 'High confidence artificial source reconstruction', ['da9c92da', 'dceb7ac9'],
    'bossEnemyNames is an ordered array of literals with no references beyond its declaration. Many corresponding factory branches remain commented out. The worker explicitly calls this reconstruction of the complete ordered .rodata string pool. The byte order is supported; the invented unused pointer-array owner is not. A genuine named target table with references would be a different case.',
    'The .rodata checkpoint moves 42.724747% to 100%; worker evidence reports .text only 23.682926% at that stage. A later getNameRef_BossEnemy function checkpoint moves 16.026905% to 32.881912%. Those two kinds of score must not be conflated.',
    'Review newly introduced unreferenced literal arrays used to fill missing strings, checking target symbols, relocations, and real consumers first.')

add('F10', 'Put a Discarded String Literal in an Empty Function', 'src/System/MarDirectorEvent.cpp', 30, 33,
    'data section', 'Definite inert work for data emission', ['f17196c5'],
    'getTalkMsgID remains an empty implementation apart from a discarded literal spelling ニコママ. The worker explicitly says it preserved the empty generated code and added only the missing .rodata string. This recovers bytes without implementing the operation that would have used those bytes.',
    'The section reaches 100% from 98.595505%. This is not evidence that getTalkMsgID was reconstructed or matched.',
    'Flag standalone discarded literals in function bodies, with narrow exceptions for documented compiler or assertion idioms.')

add('F11', 'Cast an Ordinary Flag to Volatile to Force Reloads', 'src/System/MarDirectorEvent.cpp', 248, 253,
    'partial function', 'High confidence compiler workaround', ['21a5d157'],
    'Seven flag-check/update pairs cast &unk4C to volatile u16*. The worker states this prevents common-subexpression elimination and reproduces repeated loads and scheduling. The field is an ordinary director flag, and no hardware or asynchronous-access contract was identified. This is a code-generation constraint substituted for an explanation of the original accessors or inline boundaries.',
    'The function improves 74.16393% to 99.81967%. The checkpoint also fixes selector 12 to take the default 0xF path; that jump-table-supported semantic correction is legitimate. Do not assign the entire gain to volatile or revert the selector fix with it.',
    'Flag newly introduced volatile casts on ordinary game-object members unless an access contract justifies them.')

add('F12', 'Use a Volatile Base-Class View for One Holder Test', 'src/Player/MarioAccess.cpp', 134, 140,
    'exact function', 'High confidence compiler workaround', ['d97a5091'],
    'Only the null-check reads Mario through volatile TTakeActor*. The later holder dereference remains ordinary. Worker ablation says the nonvolatile cast keeps the old score, while adding volatile forces the independent load and reaches 100%. No independent reason for this asymmetric volatile access was found. It is strong evidence of forcing the observed reload rather than reconstructing its source cause.',
    'This is an actual exact-function checkpoint, 93.833336% to 100%. It is included because the mechanism is explicit, not because exact matches are generally suspect.',
    'Use the volatile-cast rule from F11; require a reason beyond a favorable instruction diff.')

add('F13', 'Add an Unused Matrix Solely to Enlarge the Frame', 'src/Player/MarioEffect.cpp', 179, 183,
    'exact function', 'High confidence unexplained stack padding', ['15b37315'],
    'The new Mtx mtx is never read, written, or passed anywhere in perform. Worker evidence says its only effect is reserving 0x30 bytes, changing the frame from 0x50 to 0x80. An earlier attempt explicitly identifies this as unexplained padding and declines to add it; a later attempt adds precisely that local. A nearby matrix callback is not evidence for an unused matrix in this function.',
    '99.972824% to 100%, a gain of 0.027176 points. The worker reports that only five prologue/epilogue displacement rows changed. The exact bytes establish the layout effect, not the historical existence of this unused object.',
    'Flag new unused automatic aggregates. A stack-only improvement should require evidence of a real local, inline-owned object, or documented original unused declaration.')

add('F14', 'Add an Unused Vector Solely to Move Stack Slots', 'src/MarioUtil/LightUtil.cpp', 119, 127,
    'exact function', 'High confidence unexplained stack padding', ['3d33a213'],
    'Vec pos is unused in TLightCommon::perform. The worker says its 12-byte slot moves GXLightObj and rounds the frame from 0x70 to 0x80, changing no non-stack instruction. The neighboring setLight uses a Vec for an actual transform; this function accesses coordinates directly and never uses pos. Copying that neighboring declaration does not establish the missing source operation.',
    '99.85714% to 100%. This is the earliest strong finding in GitHub path order, in changed file 8 of 79. It is a concrete early-PR example, but there is no evidence identifying which hunk the reviewer actually saw.',
    'Use the unused-aggregate rule from F13. Do not flag the used Vec locals in neighboring functions.')

add('F15', 'Enlarge a 3x4 Matrix to 4x4 for a Small Partial Gain', 'src/Player/WaterGun.cpp', 134, 138,
    'partial function', 'High confidence disguised stack padding', ['d967bc83'],
    'NozzleCtrl changes Mtx to Mtx44 while both consumers remain 3x4 matrix operations. The added fourth row has no semantic consumer. The worker chooses this type because it supplies 16 extra bytes and recovers the frame size, while admitting that the actual matrix address is still wrong, target r1+0x28 versus candidate r1+0x14. Matching total frame size is not evidence that the original matrix had another row.',
    '99.46512% to 99.60465%, only 0.13953 points, still partial. This is a particularly direct example of the user\'s concern: accepting a larger, unexplained source object because a few operands become closer.',
    'Flag aggregate widening whose added elements are unused, especially when all consuming APIs still use the smaller shape. Pair with stack-delta evidence.')

add('F16', 'Invent a Negation Helper for Only One Operand', 'src/MarioUtil/MathUtil.cpp', 134, 134,
    'partial function', 'High confidence synthetic inline boundary', ['8cace3de'],
    'matanNegate does only return -param_1. matan invokes it for negative param_2 while leaving analogous param_1 negation direct. The worker records that a permuter identified this boundary, applying it to both operands regressed, and the retained asymmetric form changes floating-point register allocation. No semantic or reusable abstraction explains the helper.',
    '99.20119% to 99.61539%, still partial. This is evidence of a retained allocation cue, not proof that unary-negation helpers can never be authentic.',
    'Review new single-use trivial wrappers, especially asymmetric use across equivalent operations and gains confined to register assignment. Use a review warning rather than a universal hard error.',
    [('src/MarioUtil/MathUtil.cpp', 156)])

add('F17', 'Route a Fixed sqrt Through a Pointer to Defeat Inlining', 'src/System/EventWatcher.cpp', 192, 198,
    'partial function', 'High confidence synthetic call boundary', ['4921c34f', 'b6edca6f', 'fef76b4e', 'ffc9885e'],
    'Two distance checks replace diff.length() with a local function pointer fixed to JGeometry::TUtil<f32>::sqrt. There is no runtime choice of function. The introducing worker explicitly says this prevents MWCC from inlining the reciprocal-square-root refinement. The target direct call is real evidence of a missing call boundary; this redundant pointer is an unsupported way of forcing that boundary.',
    'The first same-actors checkpoint moves 93.26398% to 97.58074% using the pointer; later changes reach 99.77019%. The other actors checkpoint moves 86.95111% to 98.977776%, with the pointer step reported at 93.49333%; later changes reach 99.844444%. Later gains include other edits and are not all pointer effects.',
    'Review immediately called function pointers whose target is fixed and whose only documented purpose is suppressing inlining. Genuine callbacks and dispatch tables should pass.',
    [('src/System/EventWatcher.cpp', 227)])

add('F18', 'Replace Simple Two-Value Tests with Goto Networks', 'src/System/MenuDir.cpp', 128, 139,
    'partial function', 'High confidence synthetic branch topology', ['4c5790f9', '3debd20b'],
    'The two-value movie tests in rsetup and direct become shared-label goto networks. Worker evidence says this is specifically to stop MWCC folding adjacent-value OR tests into range checks. The labels do not express cleanup, error recovery, or another independent operation; they preserve a selected comparison topology while the source cause remains unresolved. This is a review finding about these documented rewrites, not a ban on goto.',
    'rsetup moves 99.255615% to 99.770294% across bundled changes. The intermediate 99.502594% to 99.645940% step includes both goto topology and a legitimate failed-construction return fix, so it is not an isolated goto delta. direct moves 96.06272% to 96.728226%; its notes isolate the explicit dispatch step at 96.30139% to 96.72823%. Preserve real error-return, first-run, and audio fixes.',
    'Review new forward-label networks replacing simple boolean tests when the stated benefit is preventing a compiler fold. This needs context and should not be a generic hard error.',
    [('src/System/MenuDir.cpp', 276)])

add('F19', 'Spell Addition as Subtraction of a Negation', 'src/MarioUtil/MtxUtil.cpp', 15, 18,
    'exact function', 'High confidence algebraic code-generation cue', ['84db8d32'],
    'The trace expression changes a+b+c into (a+b)- -c. The worker explicitly says it preserves the chosen left/right floating-point operand order while optimizing back to fadds. No algorithmic need explains this spelling; it exists to influence compiler operand ordering. Floating-point transformations require care, so this finding is the unsupported source spelling, not a blanket claim that all algebraic forms are interchangeable.',
    '99.92857% to 100%. Saved worker evidence identifies the previous residual as fadds f0,f4,f0 versus target fadds f0,f0,f4, and says no other source region changed.',
    'Review newly introduced subtraction-of-negation and other cancelling arithmetic used only to influence register or operand order.')

EXCLUSIONS = [
    ('src/MarioUtil/DrawUtil.cpp', 'Duplicate t/t2 vector temporaries in clash', 'The notes show allocation experiments, but target assembly also contains additional vector-object copies and the existing JGeometry return interfaces are suspect. There is insufficient evidence to call the named copies highly likely wrong. Retained as an unresolved source-boundary question, outside the 19 findings.'),
    ('src/System/MarDirectorDirect.cpp', 'tmp/uVar11/uVar4 copy chain', 'Syntax-level search and a partial gain are recorded. The existing temporaries and changed scopes leave a plausible lifetime explanation. This is weaker than a dead aggregate or a new unary wrapper and is excluded from the strong count.'),
    ('src/Player/MarioParticle.cpp', 'Expanded SMS_LoadParticle calls', 'The duplicated branches predate the PR. Expanding an existing fabricated inline helper and recovering a flag-pointer lifetime can be a valid source-boundary correction. Exact matching alone does not settle provenance, but the evidence does not establish a strong defect.'),
    ('src/M3DUtil/MActorData.cpp', 'Loop-index lifetime change', 'Ordinary C++ with a small gain is not enough to establish artificial reconstruction.'),
    ('src/MarioUtil/DrawUtil.cpp', 'TSilhouette::loadAfter split arrays', 'Saved objdiff leaves one constant-relocation mismatch. No strong wrong-source claim follows from the remaining partial percentage.'),
    ('src/NPC/NpcNerve.cpp', 'Local doThing helper', 'It uses GraphWait fields where the previous helper used GraphWander fields. That is meaningful semantic evidence; ownership placement can be reviewed separately.'),
    ('src/System/Application.cpp', 'Explicit destructor before heap cleanup', 'The destructor flag and later mHeap->freeAll provide a plausible arena-ownership explanation.'),
    ('src/MarioUtil/PacketUtil.cpp', '8388638.0f conversion constant', 'The same constant occurs in existing JSystem/JRenderer.cpp. Its unusual appearance alone is not evidence of an invented score cue.'),
    ('src/NPC/NpcCallback.cpp', 'Subtraction/cast rewrite', 'Existing fabricated JGeometry operators make the apparent expression reversal insufficient to prove a new semantic error.'),
]

EVIDENCE = ROOT / 'evidence'
EVIDENCE.mkdir(exist_ok=True)
COUNTS = build_counts(FINDINGS, ROOT, SNAPSHOT, CHECKPOINTS, URL)
for finding in FINDINGS:
    commits = {c['commit'] for c in finding['checkpoints']}
    note_records = [n for n in NOTES if n['commit'] in commits]
    raw_records = []
    seen = {n['path'] for n in note_records}
    for c in finding['checkpoints']:
        for path in sorted(pathlib.Path(c['workerDirectory']).glob('worker_*.txt')):
            if str(path) not in seen:
                raw_records.append({'commit': c['commit'], 'path': str(path), 'text': path.read_text()})
        patch = pathlib.Path(c['patchPath'])
        if patch.exists():
            shutil.copyfile(patch, EVIDENCE / f"{c['commit'][:8]}.diff")
    (EVIDENCE / f"{finding['id']}.json").write_text(json.dumps({'finding': finding, 'worker_notes': note_records, 'other_worker_responses': raw_records}, indent=2, ensure_ascii=False) + '\n')

allocation_checkpoint = next(c for c in CHECKPOINTS if c['commit'].startswith('a0a91afb'))
diff = json.loads(pathlib.Path(allocation_checkpoint['diffPath']).read_text())
allocation_evidence = {'checkpoint': allocation_checkpoint['commit'], 'source_diff': allocation_checkpoint['diffPath'], 'windows': {}}
for side, label in [('left', 'target'), ('right', 'candidate')]:
    symbol = next(s for s in diff[side]['symbols'] if s['name'].startswith('getNameRef_Enemy'))
    instructions = symbol['instructions']
    windows = []
    for i, item in enumerate(instructions):
        if '__nw__' not in item.get('instruction', {}).get('formatted', ''):
            continue
        window = [x.get('instruction', {}).get('formatted', '') for x in instructions[max(0, i-1):i+9]]
        if any(re.search(r'__ct__\d+(TFruitsBoat|TAnimalBird)', x) for x in window):
            windows.append(window)
    allocation_evidence['windows'][label] = windows
(EVIDENCE / 'allocation-evidence.json').write_text(json.dumps(allocation_evidence, indent=2) + '\n')

(ROOT / 'findings.json').write_text(json.dumps({'pr': 161, 'repository': 'doldecomp/sms', 'head': HEAD, 'score_source': 'historical runner checkpoints, not a fresh PR-head build', 'findings': FINDINGS, 'excluded_candidates': EXCLUSIONS}, indent=2, ensure_ascii=False) + '\n')

def target_label(c):
    t = c['target']
    kind = 'section' if t['symbol'].startswith('.') else 'function'
    return f"{kind} `{t['symbol']}`: **{t['before']}% → {t['after']}%**"

lines = [
    '# SMS PR #161 Source-Quality Audit', '',
    '**19 strong findings across 16 changed files. All 79 changed files and all 6,693 diff lines were reviewed.**', '',
    'Every finding now includes an occurrence count. [Full count table and occurrence locations](COUNTS.md). The largest group is 54 wrong-size allocation sites across 45 newly declared local classes. Counts use explicit units and should not be summed.', '',
    'Read F01, F02, F07, and F15 first. They show a dangling reference, wrong object allocation sizes, discarded comparisons that fill string data, and an enlarged matrix retained for a small partial gain.', '',
    f'PR: https://github.com/doldecomp/sms/pull/161  \nAudited head: `{HEAD}`  \nOriginal integration snapshot: `aea424cd6277b94a3073776c102615d20aca161f`  \nAudit date: 2026-09-15', '',
    '## What the Evidence Supports', '',
    'The user\'s concern is supported. Several accepted changes improve numerical similarity while introducing invalid C++, inconsistent class definitions, or code whose documented purpose is manipulating emission, stack space, inlining, or register assignment.', '',
    '| Acceptance target | Findings | Meaning |',
    '| --- | ---: | --- |',
    '| Partial function improvement | 7 | The function still does not match after the recorded gain. |',
    '| Data section | 8 | A .rodata or .data score reaches 100%; that is not a whole-function match. F06 additionally has a worker-reported exact factory function. |',
    '| Exact function | 4 | Strong source-artificiality evidence despite a recorded 100% function result. |', '',
    'These are 19 distinct source patterns, not 19 independent score gains. Some findings share a checkpoint; gains must not be summed. “Definite” means the source or target-layout defect is directly demonstrable. “High confidence” means the artificial mechanism is supported by the retained source and worker evidence; it does not prove what the unavailable original source contained.', '',
    'The earliest strong finding in path order is F14 in LightUtil.cpp, file 8 of 79. MtxUtil.cpp follows with F19 in file 10. The first few files also contain ordinary edits that do not meet the requested confidence threshold. The reviewer\'s “first 1%” is informal; this audit cannot identify their exact examples.', '',
    '## Scope and Verification', '',
    'Reviewed the complete saved PR diff, the exact detached head, relevant owning headers, and 226 indexed integration checkpoints. For strong candidates, inspected introducing patches, runner scores, worker explanations, and selected saved objdiff instruction windows. The under-allocation examples were independently extracted from saved target/candidate instructions.', '',
    'All scores below are historical runner-checkpoint results, not newly measured scores for the final combined PR. A checkpoint can include multiple edits. Where worker ablation isolates one change, that is stated; otherwise the score remains attributed to the bundle. Worker claims are evidence of intent, not independent proof of correctness.', '',
    'The remote head was rechecked and still matched the audited SHA. The isolated checkout is clean. Comparison with the original integration snapshot found formatting-only source follow-ups: line wrapping, one split string literal, and declaration-macro semicolon placement preserving the expanded declarations. No new compilation, runtime tests, or full PR-head regression run was performed. The live SMS checkout, workers, runtime, and PR were not modified.', '',
    '## Findings', '',
    '| ID | Finding | Occurrences | Acceptance target | Certainty |',
    '| --- | --- | --- | --- | --- |',
]
for f in FINDINGS:
    count = COUNTS[f['id']]
    lines.append(f"| [{f['id']}](#{f['id'].lower()}) | {f['title']} | {count['count']} {count['unit']} | {f['category']} | {f['certainty']} |")
for f in FINDINGS:
    lines += ['', f"<a id=\"{f['id'].lower()}\"></a>", f"### {f['id']}: {f['title']}", '',
        f"[{f['file']}:{f['start_line']}]({f['source_url']})  \n{f['certainty']}. Acceptance category: {f['category']}.", '',
        f"**Occurrences: {COUNTS[f['id']]['count']} {COUNTS[f['id']]['unit']}.** {COUNTS[f['id']]['detail']} [All locations](COUNTS.md#{f['id'].lower()}).", '',
        '```cpp', f['snippet'], '```', '', f['why'], '', '**Recorded improvement**', '']
    for c in f['checkpoints']:
        lines.append(f"- `{c['commit'][:8]}` {target_label(c)}. [Retained patch](evidence/{c['commit'][:8]}.diff).")
    lines += ['', f['score_attribution'], '', f"**Possible lint:** {f['lint_candidate']}", '', f"[Worker and checkpoint evidence](evidence/{f['id']}.json)."]
    if f['related']:
        lines += ['', 'Related source: ' + '; '.join(f'[{p}:{n}]({URL}{p}#L{n})' for p, n in f['related']) + '.']

lines += ['', '## Candidates Deliberately Excluded', '',
    'The audit does not equate a small gain, an extra temporary, a full match, or unusual syntax with bad reconstruction. These candidates were investigated and did not meet the strong-finding threshold.', '',
    '| File | Candidate | Why it is outside the strong list |',
    '| --- | --- | --- |']
for file, candidate, reason in EXCLUSIONS:
    lines.append(f'| `{file}` | {candidate} | {reason} |')
lines += ['', '## Recommended Policy for Data-Section Work', '',
    '**Pause standalone section-target workers, including .rodata workers. Allow evidence-backed data repairs during function reconstruction, and require source-quality checks independently of score.** This is a proposed policy; this audit has not changed worker scheduling or acceptance behavior.', '',
    'Do not require a function to reach 100% before changing its data. Correct strings, constants, tables, and relocations can be necessary for the function to match. A .rodata section can also serve several functions, so there may be no single owning function whose completion provides a useful prerequisite.', '',
    '1. **Require a demonstrated purpose.** A constructor uses the string, an expression uses the constant, or code indexes the table. Target instructions, references, symbols, or layout evidence must support the relationship.',
    '2. **Reject artificial emission.** Discarded comparisons, unused string pools, dummy functions, unexplained padding, and invented class layouts cannot be justified solely by a section-score improvement.',
    '3. **Use section percentage as supporting evidence.** Reaching 100% for a section is insufficient on its own to accept a patch. Review source plausibility and affected code alongside section bytes and relocations.',
    '4. **Allow credible partial progress.** A function can remain below 100% after a legitimate data repair. Retain supported changes, document the remaining mismatch, and preserve regression checks.', '',
    'For example, `return new TFruitsBoat("フルーツ運搬船");` can be a legitimate repair before the factory function is exact if evidence supports the class layout, constructor call, and string. An invented undersized class added merely to make the branch compile fails that standard. Similarly, a real referenced table can be reconstructed while its users remain incomplete; an unused array invented to reproduce the same bytes fails the source-purpose check.', '',
    'An exact byte or instruction match establishes the generated output under that build configuration. It does not by itself establish that an unused object, synthetic helper, or substituted class is a credible reconstruction. Future independent section work should require evidence of the data\'s real owner and uses, with no fabricated source added solely to produce a favorable score.', '',
    '## What to Lint First', '',
    'These are proposals derived from the findings. No lint rule or acceptance policy was changed.', '',
    '1. **Invalid source:** returning references to automatic objects, crossing scalar-member bounds, conflicting class definitions, and target-inconsistent allocation sizes.',
    '2. **Inert emission tricks:** discarded strcmp results, standalone discarded literals, and uncalled functions that only force constants or vtables.',
    '3. **Invented stack storage:** new unused aggregates and larger aggregate types whose extra elements have no consumers. Require evidence of the missing source object.',
    '4. **Compiler constraints:** volatile casts, trivial one-use wrappers, fixed function pointers, goto topology, and cancelling arithmetic. Start with review warnings because authentic uses exist.',
    '5. **Acceptance context:** show whether the win is a function or a data section, preserve the residual, and require source plausibility independently of percentage gain.', '',
    'The current local comparator in [change-validation.ts](../../apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts#L850) accepts an improved or exact target if its regression checks pass. For a section target, it explicitly ignores regressions in functions whose previous score was below exact. Other runner gates also exist, so this is not a claim that the whole system checks only one number. It does explain why section improvements need their own source-quality review. This was verified against the current local source; the audit does not reconstruct every historical runner revision.', '',
    'The records also show an ownership problem: workers that correctly identified a necessary header repair were denied scope expansion and later used local class substitutions. A lint check should permit a justified owning-header repair rather than reward a workaround inside the original file.', '',
    '## Complete File Coverage', '',
    '“No strong finding” means every changed hunk was read and no sufficiently supported defect was identified for this audit. It is not a proof of correctness or a build approval. Excluded candidates are listed above. The large PacketUtil and factory rewrites were included in the full review.', '',
    '| # | Changed file | Audit disposition |', '| ---: | --- | --- |']
coverage = []
for i, entry in enumerate(PR['files'], 1):
    file = entry['path']
    ids = [f['id'] for f in FINDINGS if f['file'] == file]
    excluded = [c for p, c, _ in EXCLUSIONS if p == file]
    disposition = ', '.join(ids) if ids else 'No strong finding'
    if excluded:
        disposition += '; investigated exclusion above'
    lines.append(f'| {i} | [{file}]({URL}{file}) | {disposition} |')
    coverage.append({'file': file, 'all_changed_hunks_reviewed': True, 'finding_ids': ids, 'excluded_candidates': excluded})
lines += ['', '## Evidence Files', '',
    '- [findings.json](findings.json): structured findings, source locations, score records, and exclusions.',
    '- [coverage.json](coverage.json): all 79 file dispositions.',
    '- [checkpoints.json](checkpoints.json) and [worker-notes.json](worker-notes.json): indexed historical evidence.',
    '- [pr.diff](pr.diff), [pr.json](pr.json), and [pr-current.json](pr-current.json): saved PR snapshot and final metadata check.',
    '- [evidence/](evidence/): per-finding worker records, copied retained patches, and extracted allocation instructions.', '']
(ROOT / 'REPORT.md').write_text('\n'.join(lines))
(ROOT / 'coverage.json').write_text(json.dumps(coverage, indent=2) + '\n')
print(json.dumps({'findings': len(FINDINGS), 'finding_files': len({f['file'] for f in FINDINGS}), 'coverage': len(coverage), 'report': str(ROOT / 'REPORT.md')}, indent=2))
