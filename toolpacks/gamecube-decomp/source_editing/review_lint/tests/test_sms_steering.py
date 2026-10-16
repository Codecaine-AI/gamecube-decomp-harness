"""SMS steering lints (objectives/sms-real-codegen/plan.md section 4), end to
end through scan_diff.py: single-use temps and same-behaviour rewrites are
llm_review warnings asking the behaviour question, added codegen directives are
errors, accessor evidence points at the steering gate, real fixes stay quiet,
UNUSED map functions that gain a body are llm_review warnings (doldecomp/sms
#342), and Melee is unaffected."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_sms_stack_policy import ROOT, SCANNER, game_env, rows, rule_rows, scan, scan_repo  # noqa: E402

STEERING_SHAPES = ROOT / 'toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_shapes.py'
STEERING_RULES = ('sms_single_use_temp', 'sms_form_rewrite', 'sms_codegen_directive')


def steering(findings):
    return [f for f in findings if f['rule_id'] in STEERING_RULES]


def scan_files(path, pre, post, game='sms'):
    """Scan with both trees, so the lint sees the whole statement on each side."""
    with tempfile.TemporaryDirectory() as temp:
        trees = {}
        for name, text in (('pre', pre), ('post', post)):
            tree = Path(temp) / name
            (tree / path).parent.mkdir(parents=True)
            (tree / path).write_text(text)
            trees[name] = tree
        diff = subprocess.run(['git', 'diff', '--no-index', '--unified=5', str(trees['pre'] / path), str(trees['post'] / path)], text=True, capture_output=True).stdout
        diff = diff.replace(str(trees['pre'] / path).lstrip('/'), path).replace(str(trees['post'] / path).lstrip('/'), path)
        patch = Path(temp) / 'change.patch'
        patch.write_text(diff)
        command = [sys.executable, str(SCANNER), '--repo', str(ROOT), '--pre-tree', str(trees['pre']), '--post-tree', str(trees['post']),
                   '--diff-file', str(patch), '--gate', '--json', '--surface', 'worker']
        result = subprocess.run(command, env=game_env(game), text=True, capture_output=True)
        assert result.stdout.strip(), result.stderr
        return json.loads(result.stdout)['findings']


class SingleUseTempTest(unittest.TestCase):
    def test_330_temp_is_llm_review_warning(self):
        body = '-\tm_value = param_3->mRotation.x;\n+\ts16 tmp = param_3->mRotation.x;\n+\tm_value = tmp;\n'
        (found,) = steering(scan('src/MoveBG/foo.cpp', body))
        self.assertEqual((found['rule_id'], found['line'], found['severity']), ('sms_single_use_temp', 1, 'warning'))
        self.assertTrue(found['detail']['llm_review'])
        self.assertEqual(found['detail']['llm_question'], 'behaviour_change')
        self.assertEqual(found['standard_id'], 'global_standard:sms-no-steering')
        for text in ('steering probe', 'steering_check.py check', 'real_code_evidence'):
            self.assertIn(text, found['message'])

    def test_hanasambo_split_temp_with_whole_statements(self):
        pre = ('void f()\n{\n\tif (self->getDistToMarioSquared()\n\t    < self->unk198->mSLAttackDist.get()\n'
               '\t          * self->unk198->mSLAttackDist.get())\n\t\tpush();\n}\n')
        post = ('void f()\n{\n\tf32 attackDist = self->unk198->mSLAttackDist.get();\n\tattackDist *= self->unk198->mSLAttackDist.get();\n'
                '\tif (self->getDistToMarioSquared() < attackDist)\n\t\tpush();\n}\n')
        found = steering(scan_files('src/Enemy/hanasambo.cpp', pre, post))
        self.assertEqual([(f['rule_id'], f['line']) for f in found], [('sms_single_use_temp', 3)])
        self.assertEqual(found[0]['detail']['name'], 'attackDist')


class FormRewriteTest(unittest.TestCase):
    def test_if_else_to_ternary_is_llm_review_warning(self):
        body = '-\tif (x)\n-\t\ty = 1;\n-\telse\n-\t\ty = 2;\n+\ty = x ? 1 : 2;\n'
        (found,) = steering(scan('src/Enemy/foo.cpp', body))
        self.assertEqual((found['rule_id'], found['severity'], found['detail']['shape']), ('sms_form_rewrite', 'warning', 'ternary_if'))
        self.assertTrue(found['detail']['llm_review'])
        self.assertEqual(found['detail']['llm_question'], 'behaviour_change')

    def test_float_form_and_type_spelling(self):
        found = steering(scan('src/Enemy/foo.cpp', '-\ty = x * 0.5f;\n+\ty = x / 2.0f;\n-\tint alpha = 0;\n+\ts32 alpha = 0;\n'))
        self.assertEqual(sorted(f['detail']['shape'] for f in found), ['float_form', 'type_spelling'])

    def test_operand_order_is_left_to_sms_operand_flip(self):
        self.assertEqual(steering(scan('src/Enemy/foo.cpp', '-\ty = a + b;\n+\ty = b + a;\n')), [])


class CodegenDirectiveTest(unittest.TestCase):
    def test_register_and_volatile_member_are_errors(self):
        found = steering(scan('include/Enemy/foo.hpp', added('struct TFoo {\n\tvolatile u32 mFlags;\n};')))
        self.assertEqual([(f['rule_id'], f['line'], f['severity']) for f in found], [('sms_codegen_directive', 2, 'error')])
        self.assertIn('steering_check.py check', found[0]['message'])

    def test_one_error_per_line_when_a_specific_rule_owns_it(self):
        found = scan('src/Enemy/example.cpp', added('void f()\n{\n\tregister int i = 0;\n}'))
        self.assertNotIn('sms_codegen_directive', [f['rule_id'] for f in found if f['line'] == 3])
        self.assertIn('error', [f['severity'] for f in found if f['line'] == 3])

    def test_existing_directive_carried_over_is_not_flagged(self):
        body = '-\tvolatile u32* fifo = (volatile u32*)0xCC008000;\n+\tvolatile u32* fifo = (volatile u32*)0xCC008000; \n'
        self.assertEqual([f for f in steering(scan('src/System/foo.cpp', body)) if f['rule_id'] == 'sms_codegen_directive'], [])


class RealFixTest(unittest.TestCase):
    def test_kuri_land_control_flow_fix_has_no_steering_finding(self):
        pre = ('bool execute()\n{\n\tif (self->isBckAnm(4) && self->checkCurAnmEnd(0))\n\t\treturn true;\n\n'
               '\tif (!self->isAirborne())\n\t\tself->setBckAnm(4);\n\treturn false;\n}\n')
        post = ('bool execute()\n{\n\tif (self->isBckAnm(4)) {\n\t\tif (self->checkCurAnmEnd(0))\n\t\t\treturn true;\n'
                '\t} else if (!self->isAirborne())\n\t\tself->setBckAnm(4);\n\treturn false;\n}\n')
        self.assertEqual(steering(scan_files('src/Enemy/namekuri.cpp', pre, post)), [])

    def test_callee_fix_has_no_steering_finding(self):
        body = '-\tidx = getModelData()->getMaterialName()->getIndex(n);\n+\tidx = getModelData()->getJointName()->getIndex(n);\n'
        self.assertEqual(steering(scan('src/Enemy/amenbo.cpp', body)), [])


class AccessorEvidenceSteeringTest(unittest.TestCase):
    def test_message_points_at_the_steering_gate(self):
        body = '-\tmAnmData->createSampleModelData(mModel->getModelData());\n+\tmAnmData->createSampleModelData(getModel()->getModelData());\n'
        (found,) = [f for f in scan('src/M3DUtil/MActor.cpp', body) if f['rule_id'] == 'sms_accessor_evidence']
        self.assertEqual(found['severity'], 'warning')
        self.assertIn('steering_check.py check', found['message'])
        self.assertIn('symbol map', found['message'])

    def test_rules_use_the_shared_classifier(self):
        from test_sms_fidelity import fidelity
        self.assertEqual(Path(fidelity.steering_shapes.__file__).resolve(), STEERING_SHAPES.resolve())
        self.assertIs(fidelity.accessor_swap, fidelity.steering_shapes.accessor_swap)


class MeleeUnaffectedTest(unittest.TestCase):
    def test_melee_scan_has_no_steering_findings(self):
        body = '-\tm_value = param_3->mRotation.x;\n+\ts16 tmp = param_3->mRotation.x;\n+\tm_value = tmp;\n-\ty = x * 0.5f;\n+\ty = x / 2.0f;\n'
        found = scan('src/melee/ft/ftcoll.c', body, game='melee')
        self.assertEqual(rows(found, prefix='sms_'), [])


# mario.MAP rows from sb-up7f (orig/GMSJ01/files/mario.MAP), trimmed to the units under test.
UNUSED_MAP = (
    '  001f10e0 0000a4 801f66e0  4 __ct__21TMareEventDepressWallFPCc \tMap.a MapEventMare.cpp\n'
    '  001f18ec 0000b8 801f6eec  4 startEvent__21TMareEventDepressWallFv \tMap.a MapEventMare.cpp\n'
    '  UNUSED   0000c0 ........ emitEffect__21TMareEventDepressWallFi Map.a MapEventMare.cpp\n'
    '  UNUSED   000070 ........ startToRise__21TMareEventDepressWallFv Map.a MapEventMare.cpp\n'
    '  UNUSED   0000e8 ........ finishEvent__21TMareEventDepressWallFv Map.a MapEventMare.cpp\n'
    '  001f2468 00008c 801f7a68  4 __ct__13TMareWallRockFv \tMap.a MapEventMare.cpp\n'
    '  UNUSED   000084 ........ __ct__13TMareWallRockFPCc Map.a MapEventMare.cpp\n'
    '  UNUSED   000120 ........ rolling__9TChuuHanaFv Enemy.a chuuhana.cpp\n')
EMIT_EFFECT = ('-void TMareEventDepressWall::emitEffect(int) { }\n'
               '+void TMareEventDepressWall::emitEffect(int idx)\n+{\n'
               '+\tif (JPABaseEmitter* em = gpMarioParticleManager->emit(MAP_MAP_MS_MARE_BLOCKUP, &unk34[idx], 1, &unk34[idx]))\n'
               '+\t\tem->setGlobalScale(unk38[idx]);\n+}\n')
MARE = 'src/Map/MapEventMare.cpp'
UNUSED_RULE = 'sms_unused_reconstruction'


class UnusedReconstructionTest(unittest.TestCase):
    """#342: an UNUSED (dead-stripped) function gets a body only when it was inlined."""

    def test_emit_effect_stub_to_body_is_llm_review_warning_on_both_surfaces(self):
        for surface in ('worker', 'pr_gate'):
            found = scan_repo({MARE: EMIT_EFFECT}, surface=surface, mario_map=UNUSED_MAP)
            self.assertEqual(rule_rows(found, UNUSED_RULE), [(MARE, 1, 'warning')])
            (finding,) = [f for f in found if f['rule_id'] == UNUSED_RULE]
            self.assertEqual(finding['standard_id'], 'global_standard:sms-unused-functions')
            self.assertTrue(finding['detail']['llm_review'])
            self.assertEqual({k: finding['detail'][k] for k in ('function', 'mangled', 'map_size', 'change')},
                             {'function': 'TMareEventDepressWall::emitEffect', 'mangled': 'emitEffect__21TMareEventDepressWallFi', 'map_size': 0xc0, 'change': 'stub_to_body'})
            self.assertIn('UNUSED functions may only be reconstructed when they were inlined into other functions in the same TU.', finding['message'])
            self.assertIn('emptying it changes another function in the target', finding['message'])
            self.assertIn('python3 toolpacks/gamecube-decomp/_impl/gamecube/tools/steering_check.py unused-test --repo . --file src/Map/MapEventMare.cpp --function TMareEventDepressWall::emitEffect', finding['message'])

    def test_same_change_on_a_live_function_is_not_flagged(self):
        body = '-void TMareEventDepressWall::startEvent() { }\n+void TMareEventDepressWall::startEvent()\n+{\n+\tunk10 = 0;\n+\tinit1stEvent();\n+}\n'
        self.assertEqual(rule_rows(scan_repo({MARE: body}, mario_map=UNUSED_MAP), UNUSED_RULE), [])

    def test_trivial_stub_edits_and_existing_bodies_are_not_flagged(self):
        stubs = ('-void TMareEventDepressWall::startToRise() { }\n+void TMareEventDepressWall::startToRise() { return; }\n'
                 ' \n-void TMareEventDepressWall::finishEvent() { }\n+void TMareEventDepressWall::finishEvent()\n+{\n+\treturn;\n+}\n')
        self.assertEqual(rule_rows(scan_repo({MARE: stubs}, mario_map=UNUSED_MAP), UNUSED_RULE), [])
        # Upstream already had a body: editing it is not a reconstruction.
        edited = (' void TMareEventDepressWall::emitEffect(int idx)\n {\n-\tem->setRate(unk3C[idx]);\n+\tem->setRate(unk40[idx]);\n }\n')
        self.assertEqual(rule_rows(scan_repo({MARE: edited}, mario_map=UNUSED_MAP), UNUSED_RULE), [])

    def test_new_unused_definition_is_flagged_at_its_name(self):
        body = (' void TMareEventDepressWall::startEvent() { }\n \n'
                '+void TMareEventDepressWall::finishEvent()\n+{\n+\tunk10 = 0;\n+}\n')
        found = scan_repo({MARE: body}, mario_map=UNUSED_MAP)
        self.assertEqual(rule_rows(found, UNUSED_RULE), [(MARE, 3, 'warning')])
        self.assertEqual([f['detail']['change'] for f in found if f['rule_id'] == UNUSED_RULE], ['new_definition'])

    def test_overloads_are_matched_by_signature(self):
        body = ('-TMareWallRock::TMareWallRock() { }\n+TMareWallRock::TMareWallRock()\n+{\n+\tunk10 = 0;\n+}\n \n'
                '-TMareWallRock::TMareWallRock(const char* name) { }\n+TMareWallRock::TMareWallRock(const char* name)\n+{\n+\tunk10 = 1;\n+}\n')
        found = scan_repo({MARE: body}, mario_map=UNUSED_MAP)
        self.assertEqual(rule_rows(found, UNUSED_RULE), [(MARE, 6, 'warning')])
        (finding,) = [f for f in found if f['rule_id'] == UNUSED_RULE]
        self.assertEqual((finding['detail']['mangled'], finding['detail']['signature_match']), ('__ct__13TMareWallRockFPCc', 'exact'))

    def test_upstream_body_of_another_overload_does_not_exempt(self):
        """Codex review: a non-trivial upstream `T::f(float)` must not exempt a new UNUSED `T::f(int)`."""
        overloads = UNUSED_MAP + ('  UNUSED   000040 ........ setRate__21TMareEventDepressWallFi Map.a MapEventMare.cpp\n'
                                  '  001f2000 000040 801f2000  4 setRate__21TMareEventDepressWallFf \tMap.a MapEventMare.cpp\n')
        body = (' void TMareEventDepressWall::setRate(float rate)\n {\n \tunk3C[0] = rate;\n }\n \n'
                '+void TMareEventDepressWall::setRate(int rate)\n+{\n+\tunk3C[1] = rate;\n+}\n')
        found = scan_repo({MARE: body}, mario_map=overloads)
        self.assertEqual(rule_rows(found, UNUSED_RULE), [(MARE, 6, 'warning')])
        self.assertEqual([f['detail']['mangled'] for f in found if f['rule_id'] == UNUSED_RULE], ['setRate__21TMareEventDepressWallFi'])
        # Editing the live float overload is not a reconstruction.
        edited = ' void TMareEventDepressWall::setRate(float rate)\n {\n-\tunk3C[0] = rate;\n+\tunk3C[0] = rate * 2.0f;\n }\n'
        self.assertEqual(rule_rows(scan_repo({MARE: edited}, mario_map=overloads), UNUSED_RULE), [])

    def test_only_the_gates_trivial_stubs_count_as_stubs(self):
        """`return ++x;`, `return f();` and `return *p;` are bodies, not stubs (same rule as the steering gate)."""
        unused = ''.join(f'  UNUSED   000010 ........ {name}__21TMareEventDepressWallFv Map.a MapEventMare.cpp\n' for name in ('a', 'b', 'c', 'd'))
        body = ('-int TMareEventDepressWall::a() { return 0; }\n+int TMareEventDepressWall::a() { return ++mCount; }\n'
                '-int TMareEventDepressWall::b() { return 0; }\n+int TMareEventDepressWall::b() { return compute(); }\n'
                '-int TMareEventDepressWall::c() { return 0; }\n+int TMareEventDepressWall::c() { return *mPtr; }\n'
                '-int TMareEventDepressWall::d() { return 0; }\n+int TMareEventDepressWall::d() { return -1; }\n')
        found = scan_repo({MARE: body}, mario_map=UNUSED_MAP + unused)
        self.assertEqual([f['detail']['function'] for f in found if f['rule_id'] == UNUSED_RULE],
                         ['TMareEventDepressWall::a', 'TMareEventDepressWall::b', 'TMareEventDepressWall::c'])

    def test_typedef_spelling_never_suppresses_the_warning(self):
        """Signature identity is the shared signatures.py: a typedef'd parameter spelling resolves exactly,
        and an unknown typedef leaves the identity undecidable, which is still flagged."""
        body = ' typedef int MareIndex;\n-void TMareEventDepressWall::emitEffect(int) { }\n+void TMareEventDepressWall::emitEffect(MareIndex idx)\n+{\n+\tunk38[idx] = 1.0f;\n+}\n'
        found = [f for f in scan_repo({MARE: body}, mario_map=UNUSED_MAP) if f['rule_id'] == UNUSED_RULE]
        self.assertEqual([(f['line'], f['detail']['signature_match']) for f in found], [(2, 'exact')])
        # s32 comes from a header this diff-mode scan cannot read: undecidable, still flagged.
        unknown = EMIT_EFFECT.replace('emitEffect(int idx)', 'emitEffect(s32 idx)')
        found = [f for f in scan_repo({MARE: unknown}, mario_map=UNUSED_MAP) if f['rule_id'] == UNUSED_RULE]
        self.assertEqual([(f['line'], f['detail']['signature_match']) for f in found], [(1, 'unresolved')])
        # A typedef to another type is provably another overload, not the UNUSED emitEffect(int).
        other = ' typedef float MareRate;\n+void TMareEventDepressWall::emitEffect(MareRate rate)\n+{\n+\tunk38[0] = rate;\n+}\n'
        self.assertEqual(rule_rows(scan_repo({MARE: other}, mario_map=UNUSED_MAP), UNUSED_RULE), [])

    def test_typedef_from_a_header_resolves_at_the_merge_base(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp) / 'repo'
            (repo / 'src/Map').mkdir(parents=True)
            (repo / 'include').mkdir()
            (repo / 'config/GMSJ01').mkdir(parents=True)
            (repo / 'config/GMSJ01/symbols.txt').write_text('')
            (repo / '.gitignore').write_text('orig/\n')
            (repo / 'include/types.h').write_text('typedef int s32;\n')
            (repo / MARE).write_text('#include <types.h>\n\nvoid TMareEventDepressWall::emitEffect(s32) { }\n')
            git = lambda *args: subprocess.run(['git', '-C', str(repo), '-c', 'user.name=t', '-c', 'user.email=t@t', *args], check=True, capture_output=True, text=True).stdout.strip()
            git('init', '-q')
            git('add', '-A')
            git('commit', '-qm', 'base')
            base_ref = git('rev-parse', 'HEAD')
            (repo / 'orig/GMSJ01/files').mkdir(parents=True)
            (repo / 'orig/GMSJ01/files/mario.MAP').write_text(UNUSED_MAP)
            (repo / MARE).write_text('#include <types.h>\n\nvoid TMareEventDepressWall::emitEffect(s32 idx)\n{\n\tunk38[idx] = 1.0f;\n}\n')
            git('commit', '-qam', 'change')
            env = {**game_env('sms'), 'ORCH_GAME_REPO_ROOT': str(repo), 'ORCH_SIGNATURES_CACHE': str(Path(temp) / 'sig')}
            result = subprocess.run([sys.executable, str(SCANNER), '--repo', str(repo), '--base', base_ref, '--json', '--surface', 'pr_gate'], env=env, text=True, capture_output=True)
            found = [f for f in json.loads(result.stdout)['findings'] if f['rule_id'] == UNUSED_RULE]
            self.assertEqual([(f['line'], f['detail']['change'], f['detail']['signature_match']) for f in found], [(3, 'stub_to_body', 'exact')])

    def test_rolling_in_ref_mode_reads_the_merge_base_and_the_untracked_map(self):
        """TChuuHana::rolling (#342): reviewers removed it because the PR did not show its inline evidence; the lint asks for it."""
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp) / 'repo'
            (repo / 'src/Enemy').mkdir(parents=True)
            (repo / 'config/GMSJ01').mkdir(parents=True)
            (repo / 'config/GMSJ01/symbols.txt').write_text('')
            (repo / '.gitignore').write_text('orig/\n')
            (repo / 'src/Enemy/chuuhana.cpp').write_text('void TChuuHana::rolling() { }\n\nvoid TChuuHana::rollStart()\n{\n\tunk210 = 0.0f;\n}\n')
            git = lambda *args: subprocess.run(['git', '-C', str(repo), '-c', 'user.name=t', '-c', 'user.email=t@t', *args], check=True, capture_output=True, text=True).stdout.strip()
            git('init', '-q')
            git('add', '-A')
            git('commit', '-qm', 'base')
            base_ref = git('rev-parse', 'HEAD')
            (repo / 'orig/GMSJ01/files').mkdir(parents=True)
            (repo / 'orig/GMSJ01/files/mario.MAP').write_text(UNUSED_MAP)
            (repo / 'src/Enemy/chuuhana.cpp').write_text('void TChuuHana::rolling()\n{\n\tunk210 += unk1B8;\n\tif (unk210 > 360.0f)\n\t\tunk210 -= 360.0f;\n}\n\n'
                                                         'void TChuuHana::rollStart()\n{\n\tunk210 = 0.0f;\n}\n')
            git('commit', '-qam', 'change')
            env = {**game_env('sms'), 'ORCH_GAME_REPO_ROOT': str(repo)}
            result = subprocess.run([sys.executable, str(SCANNER), '--repo', str(repo), '--base', base_ref, '--json', '--surface', 'pr_gate'], env=env, text=True, capture_output=True)
            found = [f for f in json.loads(result.stdout)['findings'] if f['rule_id'] == UNUSED_RULE]
            self.assertEqual([(f['file'], f['line'], f['severity']) for f in found], [('src/Enemy/chuuhana.cpp', 1, 'warning')])
            self.assertIn('--function TChuuHana::rolling', found[0]['message'])

    def test_no_map_means_no_finding(self):
        self.assertEqual(rule_rows(scan_repo({MARE: EMIT_EFFECT}), UNUSED_RULE), [])
        self.assertEqual(rule_rows(scan(MARE, EMIT_EFFECT), UNUSED_RULE), [])

    def test_melee_is_unaffected(self):
        body = '-void fn_80000000(void) { }\n+void fn_80000000(void)\n+{\n+\tfn_80000100();\n+}\n'
        found = scan_repo({'src/melee/ft/ftcommon.c': body}, game='melee', mario_map='  UNUSED   000020 ........ fn_80000000 ft.a ftcommon.c\n')
        self.assertEqual([f['rule_id'] for f in found if f['rule_id'].startswith('sms_')], [])


def added(text):
    return ''.join(f'+{line}\n' for line in text.split('\n'))


if __name__ == '__main__':
    unittest.main()
