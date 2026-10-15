"""SMS steering lints (objectives/sms-real-codegen/plan.md section 4), end to
end through scan_diff.py: single-use temps and same-behaviour rewrites are
llm_review warnings asking the behaviour question, added codegen directives are
errors, accessor evidence points at the steering gate, real fixes stay quiet,
and Melee is unaffected."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_sms_stack_policy import ROOT, SCANNER, game_env, rows, scan  # noqa: E402

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


def added(text):
    return ''.join(f'+{line}\n' for line in text.split('\n'))


if __name__ == '__main__':
    unittest.main()
