import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[5]
SCANNER = ROOT / 'toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py'

class SmsBaselineTest(unittest.TestCase):
    def scan(self, path, added, surface=None):
        return self.scan_hunk(path, ''.join(f'+{l}\n' for l in added.split('\n')), surface, post_tree=False)

    def scan_hunk(self, path, body, surface=None, post_tree=True):
        """body: raw hunk lines with their +/-/space prefixes. post_tree writes the
        post-change file (context + added lines) and hands it to the scan, as the
        worker gate does."""
        with tempfile.TemporaryDirectory() as temp:
            patch = Path(temp) / 'change.patch'
            old = sum(1 for l in body.splitlines() if not l.startswith('+'))
            new = sum(1 for l in body.splitlines() if not l.startswith('-'))
            patch.write_text(f'diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -1,{old} +1,{new} @@\n' + body)
            tree = []
            if post_tree:
                post = Path(temp) / 'post' / path
                post.parent.mkdir(parents=True)
                post.write_text(''.join(l[1:] + '\n' for l in body.splitlines() if not l.startswith('-')))
                tree = ['--post-tree', str(post.parents[len(Path(path).parts) - 1])]
            env = {**os.environ, 'ORCH_GAME_ID':'sms', 'ORCH_GAME_DIR':str(ROOT/'games/sms'), 'ORCH_GAME_KNOWLEDGE_ROOT':str(ROOT/'games/sms/knowledge')}
            command = ['python3',str(SCANNER),'--repo',str(ROOT),'--diff-file',str(patch),'--gate','--json'] + (['--surface', surface] if surface else []) + tree
            result = subprocess.run(command,env=env,text=True,capture_output=True)
            self.assertTrue(result.stdout.strip(), result.stderr)
            return result.returncode, json.loads(result.stdout)

    def test_cpp_dummy_padding_is_rejected(self):
        code, payload = self.scan('src/Enemy/example.cpp','    volatile char trash[0x10];')
        self.assertEqual(code, 1)
        # Global (knowledge/global) rules compose with the SMS slice, so the
        # volatile local is also caught by the global codegen-tactics rule.
        self.assertEqual([r['rule_id'] for r in payload['findings']],['sms_dummy_stack_padding', 'sms_symbol_map_validation', 'volatile_local_tactic'])

    def test_root_cpp_padding_is_rejected(self):
        code, payload = self.scan('src/main.cpp','char trash[4];')
        self.assertEqual(code,1)
        self.assertIn('sms_dummy_stack_padding',[r['rule_id'] for r in payload['findings']])

    def test_vendor_header_edit_is_rejected(self):
        code, payload = self.scan('include/JSystem/example.hpp','int changed;')
        self.assertEqual(code, 1)
        self.assertEqual([r['rule_id'] for r in payload['findings']],['sms_vendor_edit'])

    def test_global_rules_compose_with_sms_rules(self):
        code, payload = self.scan('src/Enemy/example.cpp','#pragma dont_inline on // TODO: temporary matching scope')
        self.assertEqual(code, 2)
        # sms_fabricated_marker owns pragma marking; the global codegen_pragma finding on the same line is suppressed.
        self.assertEqual([r['rule_id'] for r in payload['findings']], ['sms_fabricated_marker', 'sms_symbol_map_validation'])
        self.assertEqual([r['severity'] for r in payload['findings'] if r['rule_id'] == 'sms_fabricated_marker'], ['warning'])
        code, payload = self.scan('src/Enemy/example.cpp','    float f31 = value;')
        self.assertEqual(code, 0)
        self.assertEqual([(r['rule_id'], r['severity']) for r in payload['findings']], [('sms_symbol_map_validation', 'info')])

    def test_map_validation_skipped_on_worker_surface_and_reminder_on_pr_gate(self):
        # Worker gate always scans in diff mode; the runner's symbol_validation
        # micro gate owns map parity there, so the map rule must emit nothing.
        code, payload = self.scan('src/Enemy/example.cpp', '    float f31 = value;', surface='worker')
        self.assertEqual(code, 0, payload)
        self.assertEqual([r['rule_id'] for r in payload['findings']], [])
        # pr_gate keeps an informational reminder; the harness symbol-check task
        # is the enforcing path, so the rule no longer fails closed.
        code, payload = self.scan('src/Enemy/example.cpp', '    float f31 = value;', surface='pr_gate')
        self.assertEqual(code, 0)
        self.assertEqual([(r['rule_id'], r['severity']) for r in payload['findings']], [('sms_symbol_map_validation', 'info')])
        self.assertIn('symbol_validation gate', payload['findings'][0]['message'])
        self.assertIn('check-changed-symbol-order.py --baseline-dir', payload['findings'][0]['detail']['command'])

    def test_marked_codegen_pragma_is_warning_on_worker_surface(self):
        code, payload = self.scan('src/Enemy/example.cpp', '// TODO: fakematch\n#pragma dont_inline on', surface='worker')
        self.assertEqual(code, 2, payload)
        self.assertEqual([(r['rule_id'], r['severity']) for r in payload['findings']], [('sms_fabricated_marker', 'warning')])
        code, payload = self.scan('src/Enemy/example.cpp', '#pragma dont_inline on', surface='worker')
        self.assertEqual(code, 1)
        self.assertEqual([(r['rule_id'], r['severity']) for r in payload['findings']], [('sms_fabricated_marker', 'error')])
        # The closing pragma is accepted by the SMS rule, so the global finding on it is dropped too.
        code, payload = self.scan('src/Enemy/example.cpp', '// TODO: fakematch\n#pragma dont_inline on\nvoid f() { }\n#pragma dont_inline off', surface='worker')
        self.assertEqual(code, 2, payload)
        self.assertEqual([(r['rule_id'], r['line'], r['severity']) for r in payload['findings']], [('sms_fabricated_marker', 2, 'warning')])

    def test_pch_guard_predefine_reports_once_under_sms(self):
        code, payload = self.scan('src/Enemy/example.cpp', '#define SYSTEM_DUMMY_STRINGS_HPP\n#include <M3DUtil/InfectiousStrings.hpp>', surface='worker')
        self.assertEqual(code, 1)
        self.assertEqual([(r['rule_id'], r['line']) for r in payload['findings']], [('sms_pch_string_convention', 1)])

    MEMBER_RENAME = ' class TFoo {\n public:\n-\ts16 unkFC;\n+\ts16 mPitch;\n\ts16 mYaw;\n };\n'

    def test_member_rename_warns_on_worker_and_fails_pr_gate(self):
        code, payload = self.scan_hunk('include/Enemy/example.hpp', self.MEMBER_RENAME, surface='worker')
        self.assertEqual(code, 2, payload)
        renames = [r for r in payload['findings'] if r['rule_id'] == 'sms_name_change_requires_review']
        self.assertEqual([(r['severity'], r['line'], r['detail']['old_name'], r['detail']['new_name'], r['detail']['requires_human_review']) for r in renames], [('warning', 3, 'unkFC', 'mPitch', True)])
        code, payload = self.scan_hunk('include/Enemy/example.hpp', self.MEMBER_RENAME, surface='pr_gate')
        self.assertEqual(code, 1, payload)
        self.assertEqual([r['severity'] for r in payload['findings'] if r['rule_id'] == 'sms_name_change_requires_review'], ['error'])

    def test_new_local_with_shared_shape_is_not_a_rename(self):
        body = ' void TFoo::move() {\n-\tf32 y = newPos.y;\n+\tf32 z = newPos.z;\n\tsetZ(z);\n }\n'
        code, payload = self.scan_hunk('src/Enemy/example.cpp', body, surface='worker')
        self.assertEqual([r['rule_id'] for r in payload['findings']], [], payload)

    def test_vendor_cpp_is_excluded_from_global_tactic_rules(self):
        code, payload = self.scan('src/JSystem/JKernel/example.cpp','    volatile u32 pad;')
        self.assertEqual([r['rule_id'] for r in payload['findings']], ['sms_vendor_edit'])



import importlib.util
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('sms_rules', SCANNER.parent.parent/'rules/sms.py')
sms = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sms)

class SmsRuleTest(unittest.TestCase):
    def hunk(self, added, removed='', full=None):
        return {'file':'src/Enemy/example.cpp', 'added':list(enumerate(added.splitlines(),1)), 'removed':removed.splitlines(), 'post_file_text':full}

    def test_padding_variants(self):
        for source in ['char trash[4];','u32 stackPadding[4];','float dummy[4];','char\n trash[4];','volatile int innocuous[4];']:
            with self.subTest(source=source):
                self.assertTrue(sms.check_dummy_padding(self.hunk(source)))

    def test_real_arrays_and_comments(self):
        source = 'void f() {\nchar buffer[4];\nconsume(buffer);\n}'
        self.assertFalse(sms.check_dummy_padding(self.hunk(source, full=source)))
        self.assertFalse(sms.check_dummy_padding(self.hunk('// char trash[4];\nconst char* s = "char trash[4];";')))

    def test_unused_generic_local_array(self):
        source = 'void f() {\nchar unrelated[4];\n}'
        self.assertTrue(sms.check_dummy_padding(self.hunk(source, full=source)))

    def test_rename_candidates(self):
        for old,new in [('int oldName;','int newName;'),('void f(int oldName);','void f(int newName);'),('void T::oldName() {}','void T::newName() {}'),('class Old {};','class New {};'),('oldName = .text:0x80001000;','newName = .text:0x80001000;')]:
            with self.subTest(old=old):
                findings=sms.check_name_changes(self.hunk(new+' // approved by me',old))
                self.assertTrue(findings)
                self.assertTrue(findings[0]['detail']['requires_human_review'])

    def test_alias_requires_review(self):
        self.assertTrue(sms.check_name_changes(self.hunk('#define oldName newName')))
        self.assertFalse(sms.check_name_changes(self.hunk('#define LIMIT 4')))
        # The include-shim shape (alias target declared in the same hunk) belongs to the global define_alias rule.
        self.assertFalse(sms.check_name_changes(self.hunk('#define oldName newName\nextern void newName();')))
        self.assertFalse(sms.check_name_changes(self.hunk('#define TOrthoProj TOrthoProjWithDefaultName\n#include <JSystem/JDrama/JDRCamera.hpp>\n#undef TOrthoProj')))

    def rename(self, old, new, full):
        return sms.check_name_changes(self.hunk(new, old, full=full))

    def test_ordinary_new_locals_are_not_renames(self):
        cases = [('\tf32 y = newPos.y;', '\tf32 z = newPos.z;', 'use(z);'),
                 ('\tvoid* buffer = JKRGetResource("a.bmd");', '\tvoid* resource = JKRGetResource("b.bmd");', 'use(resource);'),
                 ('\ts16 speed = *gpMarioSpeed;', '\ts16 angle = *gpMarioAngleY;', 'use(angle);'),
                 ('\tMtx endMtx;', '\tMtx startMtx;', 'use(startMtx);'),
                 ('\ts32 q;', '\ts32 r;', 'r = 1;')]
        for old, new, use in cases:
            with self.subTest(new=new):
                full = 'void TFoo::update() {\n\tif (mFlag) {\n\t\tbegin();\n\t}\n' + new + '\n\t' + use + '\n}\n'
                hunk = {'file': 'src/Enemy/example.cpp', 'added': [(5, new)], 'removed': [old], 'post_file_text': full}
                self.assertEqual(sms.check_name_changes(hunk), [])
                # Indentation fallback without the post-change file.
                self.assertEqual(self.rename(old, new, None), [])

    def test_renamed_loop_variable_is_not_a_rename(self):
        full = 'void TFoo::update() {\n\ts32 idx;\n\tfor (idx = 0; idx < 4; idx++) {\n\t\tstep(idx);\n\t}\n}\n'
        hunk = {'file': 'src/Enemy/example.cpp', 'added': [(2, '\ts32 idx;'), (3, '\tfor (idx = 0; idx < 4; idx++) {'), (4, '\t\tstep(idx);')], 'removed': ['\ts32 i;', '\tfor (i = 0; i < 4; i++) {', '\t\tstep(i);'], 'post_file_text': full}
        self.assertEqual(sms.check_name_changes(hunk), [])

    def test_renamed_function_definition_is_flagged(self):
        full = '#include "Enemy/example.hpp"\n\nvoid TFoo::setPitch(s16 pitch) {\n\tmPitch = pitch;\n}\n'
        hunk = {'file': 'src/Enemy/example.cpp', 'added': [(3, 'void TFoo::setPitch(s16 pitch) {')], 'removed': ['void TFoo::unk1C(s16 pitch) {'], 'post_file_text': full}
        findings = sms.check_name_changes(hunk)
        self.assertEqual([(f['line'], f['detail']['old_name'], f['detail']['new_name']) for f in findings], [(3, 'TFoo::unk1C', 'TFoo::setPitch')])
        self.assertTrue(findings[0]['detail']['requires_human_review'])

    def test_renamed_member_and_static_are_flagged(self):
        full = 'class TFoo {\npublic:\n\tvoid init() { mPitch = 0; }\n\ts16 mPitch;\n};\n'
        hunk = {'file': 'include/Enemy/example.hpp', 'added': [(4, '\ts16 mPitch;')], 'removed': ['\ts16 unkFC;'], 'post_file_text': full}
        self.assertEqual([f['detail']['old_name'] for f in sms.check_name_changes(hunk)], ['unkFC'])
        full = '#include "x.hpp"\n\nstatic s32 sPitchTable[4];\n\nvoid f() {\n\tuse(sPitchTable);\n}\n'
        hunk = {'file': 'src/Enemy/example.cpp', 'added': [(3, 'static s32 sPitchTable[4];')], 'removed': ['static s32 lbl_803F0000[4];'], 'post_file_text': full}
        self.assertEqual([f['detail']['old_name'] for f in sms.check_name_changes(hunk)], ['lbl_803F0000'])

    def test_old_name_surviving_in_post_file_is_not_a_rename(self):
        full = 'class TFoo {\n\ts16 mPitch;\n\ts16 unkFC;\n};\n'
        hunk = {'file': 'include/Enemy/example.hpp', 'added': [(2, '\ts16 mPitch;')], 'removed': ['\ts16 unkFC;'], 'post_file_text': full}
        self.assertEqual(sms.check_name_changes(hunk), [])

    def test_suppress_global_overlaps(self):
        def f(rule, line, **detail):
            return {'file': 'src/Enemy/example.cpp', 'line': line, 'rule_id': rule, 'severity': 'error', 'detail': detail}
        findings = [f('codegen_pragma', 1), f('sms_fabricated_marker', 1, pragma='dont_inline'), f('novel_pragma', 2), f('sms_fabricated_marker', 2, pragma='inline_depth'),
                    f('codegen_pragma', 3), f('header_override_macro', 4), f('sms_pch_string_convention', 4, guard='SYSTEM_DUMMY_STRINGS_HPP'),
                    f('discarded_expression', 5), f('sms_dummy_stack_padding', 5, kind='discarded_constructor'),
                    f('codegen_pragma', 6), f('sms_fabricated_marker', 6, helper='dot'), f('discarded_expression', 7), f('sms_dummy_stack_padding', 7, kind='unused_local'),
                    f('header_override_macro', 8), f('sms_pch_string_convention', 8, name='MtxCalcTypeName')]
        diffs = [{'file': 'src/Enemy/example.cpp', 'hunks': [{'added': [(3, '#pragma dont_inline off'), (9, '#pragma dont_inline off')]}]}, {'file': 'src/JSystem/x.cpp', 'hunks': [{'added': [(3, '#pragma dont_inline off')]}]}]
        kept = sms.suppress_global_overlaps(findings, '.', 'diff', diffs, None)
        self.assertEqual([(x['rule_id'], x['line']) for x in kept], [('sms_fabricated_marker', 1), ('sms_fabricated_marker', 2), ('sms_pch_string_convention', 4), ('sms_dummy_stack_padding', 5),
                                                                    ('codegen_pragma', 6), ('sms_fabricated_marker', 6), ('discarded_expression', 7), ('sms_dummy_stack_padding', 7), ('header_override_macro', 8), ('sms_pch_string_convention', 8)])
        vendor = [f('codegen_pragma', 3)]
        vendor[0]['file'] = 'src/JSystem/x.cpp'
        self.assertEqual(sms.suppress_global_overlaps(vendor, '.', 'diff', diffs, None), vendor)

    def test_same_name_changed_value_is_allowed(self):
        self.assertFalse(sms.check_name_changes(self.hunk('int value = 2;','int value = 1;')))

    def map_check(self, root, mode='worktree'):
        return sms.check_maps([],root,mode,[{'file':'src/Enemy/example.cpp'},{'file':'src/Enemy/example.cpp'},{'file':'src/JSystem/vendor.cpp'},{'file':'include/Enemy/example.hpp'}],None)

    def test_map_reminder_never_runs_the_validator(self):
        with tempfile.TemporaryDirectory() as temp:
            for mode in ('diff', 'head', 'worktree'):
                with self.subTest(mode=mode), patch.object(sms.subprocess, 'run', side_effect=AssertionError('the retired error path must not run the validator')):
                    result = self.map_check(temp, mode)
                    self.assertEqual([(r['file'], r['severity']) for r in result], [('src/Enemy/example.cpp', 'info')])
                    self.assertEqual(result[0]['detail']['mode'], mode)
                    self.assertIn('symbol-check task', result[0]['detail']['enforced_by'])

if __name__ == '__main__': unittest.main()
