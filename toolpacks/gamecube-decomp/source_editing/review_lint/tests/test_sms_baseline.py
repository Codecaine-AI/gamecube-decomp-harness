import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[5]
SCANNER = ROOT / 'toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py'

class SmsBaselineTest(unittest.TestCase):
    def scan(self, path, added):
        with tempfile.TemporaryDirectory() as temp:
            patch = Path(temp) / 'change.patch'
            patch.write_text(f'diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -0,0 +1,1 @@\n+{added}\n')
            env = {**os.environ, 'ORCH_GAME_ID':'sms', 'ORCH_GAME_DIR':str(ROOT/'games/sms'), 'ORCH_GAME_KNOWLEDGE_ROOT':str(ROOT/'games/sms/knowledge')}
            result = subprocess.run(['python3',str(SCANNER),'--repo',str(ROOT),'--diff-file',str(patch),'--gate','--json'],env=env,text=True,capture_output=True)
            self.assertTrue(result.stdout.strip(), result.stderr)
            return result.returncode, json.loads(result.stdout)

    def test_cpp_dummy_padding_is_rejected(self):
        code, payload = self.scan('src/Enemy/example.cpp','    volatile char trash[0x10];')
        self.assertEqual(code, 1)
        # Global (Melee-hosted) rules compose with the SMS slice, so the
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
        self.assertEqual(code, 1)
        self.assertEqual([r['rule_id'] for r in payload['findings']], ['codegen_pragma', 'sms_fabricated_marker', 'sms_symbol_map_validation'])
        self.assertEqual([r['severity'] for r in payload['findings'] if r['rule_id'] == 'sms_fabricated_marker'], ['warning'])
        code, payload = self.scan('src/Enemy/example.cpp','    float f31 = value;')
        self.assertEqual(code, 1)
        self.assertEqual([r['rule_id'] for r in payload['findings']], ['sms_symbol_map_validation'])

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

    def test_head_map_rejects_dirty_checkout(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(sms.subprocess,'run',return_value=subprocess.CompletedProcess([],0,' M src/Enemy/example.cpp','')):
            self.assertIn('clean checkout',self.map_check(temp,'head')[0]['message'])

    def test_same_name_changed_value_is_allowed(self):
        self.assertFalse(sms.check_name_changes(self.hunk('int value = 2;','int value = 1;')))

    def map_check(self, root, mode='worktree'):
        return sms.check_maps([],root,mode,[{'file':'src/Enemy/example.cpp'},{'file':'src/Enemy/example.cpp'}],None)

    def test_map_proof_missing(self):
        with tempfile.TemporaryDirectory() as temp:
            self.assertIn('Materialize',self.map_check(temp,'diff')[0]['message'])
            self.assertIn('no built decomp unit',self.map_check(temp)[0]['message'])

    def fixture(self, root):
        (root/'objdiff.json').write_text(json.dumps({'units':[{'name':'Enemy/example','base_path':'build/example.o','metadata':{'source_path':'src/Enemy/example.cpp'}}]}))
        (root/'build').mkdir()
        (root/'build/example.o').touch()

    def test_map_failures_and_success(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            self.fixture(root)
            for status in [0,1,2]:
                with self.subTest(status=status), patch.object(sms.subprocess,'run',side_effect=[subprocess.CompletedProcess([],0,'ninja: no work to do.',''),subprocess.CompletedProcess([],status,'UNUSED size warning','details')]) as run:
                    result=self.map_check(root)
                    self.assertEqual(len(result),1)
                    self.assertEqual(result[0]['severity'],'info' if status==0 else 'error')
                    self.assertIn('UNUSED size warning',result[0]['detail']['output'])
                    self.assertEqual(run.call_count,2)
            with patch.object(sms.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'[1/1] compile','')):
                self.assertIn('stale',self.map_check(root)[0]['message'])
            with patch.object(sms.subprocess,'run',side_effect=subprocess.TimeoutExpired('ninja',30)):
                self.assertEqual(self.map_check(root)[0]['severity'],'error')
            (root/'build/example.o').unlink()
            self.assertIn('missing',self.map_check(root)[0]['message'])

if __name__ == '__main__': unittest.main()
