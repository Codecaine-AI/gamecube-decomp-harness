"""SMS stack-frame policy lints (maintainer ruling 2026-10-13, doldecomp/sms
#330/#331), checked end to end through scan_diff.py with the real review cases:
agent comments, PAD_STACK, alignment tricks, operand flips, accessor/inline
evidence, marker-blind global rules and the SMS rewrite of global advice.
Melee is scanned too, to show the policy stays per game."""
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
TESTS = Path(__file__).resolve().parent
SCANNER = ROOT / 'toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py'
STANDARDS = ROOT / 'games/sms/knowledge/sources/injectable/decomp_standards/standards'
AGENT_COMMENTS = ROOT / 'toolpacks/gamecube-decomp/_impl/gamecube/tools/agent_comments.py'


def game_env(game):
    return {**os.environ, 'ORCH_GAME_ID': game, 'ORCH_GAME_DIR': str(ROOT / 'games' / game), 'ORCH_GAME_KNOWLEDGE_ROOT': str(ROOT / 'games' / game / 'knowledge')}


def scan(path, body, surface='worker', game='sms'):
    """body: hunk lines with +/-/space prefixes. The post file (context + added) is the post tree."""
    with tempfile.TemporaryDirectory() as temp:
        patch = Path(temp) / 'change.patch'
        old = sum(1 for l in body.splitlines() if not l.startswith('+'))
        new = sum(1 for l in body.splitlines() if not l.startswith('-'))
        patch.write_text(f'diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -1,{old} +1,{new} @@\n' + body)
        post = Path(temp) / 'post'
        (post / path).parent.mkdir(parents=True)
        (post / path).write_text(''.join(l[1:] + '\n' for l in body.splitlines() if not l.startswith('-')))
        command = [sys.executable, str(SCANNER), '--repo', str(ROOT), '--post-tree', str(post), '--diff-file', str(patch), '--gate', '--json', '--surface', surface]
        result = subprocess.run(command, env=game_env(game), text=True, capture_output=True)
        assert result.stdout.strip(), result.stderr
        return json.loads(result.stdout)['findings']


def added(text):
    return ''.join(f'+{line}\n' for line in text.split('\n'))


def rows(findings, prefix='sms_'):
    return [(f['rule_id'], f['line'], f['severity']) for f in findings if f['rule_id'].startswith(prefix) and f['rule_id'] != 'sms_symbol_map_validation']


class AgentCommentTest(unittest.TestCase):
    LENSFLARE = (' void TLensFlare::perform(u32 cue, JDrama::TGraphics*)\n {\n \tif (cue & CUE_CALC_ANIM) {\n'
                 '+\t\t// TODO: nonmatching camera/vector inline boundaries and stack frame.\n'
                 ' \t\tVec sunWorldPos = gpSunModel->unk198;\n'
                 ' \t\t// TODO: a mystery is happening here with the args, but it\'s definitely\n \t}\n }\n')

    def test_lensflare_todo_is_error_on_both_surfaces(self):
        for surface in ('worker', 'pr_gate'):
            found = scan('src/Camera/lensflare.cpp', self.LENSFLARE, surface)
            # Only the added note; the upstream TODO in context is not the agent's.
            self.assertEqual([r for r in rows(found) if r[0] == 'sms_agent_comment'], [('sms_agent_comment', 4, 'error')])

    def test_block_comments_and_carried_comments(self):
        body = '+/* frame-only mismatch:\n+   retail is 0xb0 */\n+f32 x; /* 0x10 */\n-int y; // TODO: upstream note\n+int y2; // TODO: upstream note\n'
        found = scan('src/Camera/sunmgr.cpp', body)
        self.assertEqual([r for r in rows(found) if r[0] == 'sms_agent_comment'], [('sms_agent_comment', 1, 'error')])

    def test_header_padding_member_and_offset_comment_are_not_flagged(self):
        body = added('struct TFoo {\n\t/* 0x10 */ f32 mScale;\n\tu8 _pad[3]; // padding\n};')
        self.assertEqual(rows(scan('include/Camera/foo.hpp', body)), [])

    def test_rule_uses_the_shared_vocabulary_module(self):
        sys.path.insert(0, str(TESTS))
        from test_sms_fidelity import fidelity
        self.assertEqual(Path(fidelity.agent_comments.__file__).resolve(), AGENT_COMMENTS.resolve())


class StackFrameTacticsTest(unittest.TestCase):
    def test_lensglow_alignment_union_is_error(self):
        body = (' TLensGlow::TLensGlow(bool param_1, const char* name)\n {\n'
                '+\tunion {\n+\t\tu64 alignment;\n+\t\tchar data[0x100];\n+\t} buf;\n'
                '+\tsnprintf(buf.data, sizeof(buf.data), "%s/%s", base, "glow.bmd");\n }\n')
        for surface in ('worker', 'pr_gate'):
            self.assertIn(('sms_alignment_trick', 3, 'error'), rows(scan('src/Camera/lensglow.cpp', body, surface)))

    def test_aligned_local_is_error_and_aligned_file_data_is_not(self):
        body = added('static u8 sBuffer[0x20] ATTRIBUTE_ALIGN(32);\nvoid f()\n{\n\tu8 tmp[0x20] ATTRIBUTE_ALIGN(32);\n\tuse(tmp);\n}')
        self.assertEqual([r for r in rows(scan('src/Camera/foo.cpp', body)) if r[0] == 'sms_alignment_trick'], [('sms_alignment_trick', 4, 'error')])

    def test_unused_union_local_is_dummy_storage(self):
        body = added('void f()\n{\n\tunion {\n\t\tf32 a;\n\t\tu32 b;\n\t} unused;\n\tcall();\n}')
        self.assertIn(('sms_dummy_stack_padding', 3, 'error'), rows(scan('src/Camera/foo.cpp', body)))

    def test_pad_stack_is_error_in_sms(self):
        body = added('void f()\n{\n\tPAD_STACK(8);\n\tcall();\n}')
        for surface in ('worker', 'pr_gate'):
            self.assertIn(('sms_pad_stack_macro', 3, 'error'), rows(scan('src/Camera/foo.cpp', body, surface)))

    def test_mactor_operand_flip_is_info_pointing_at_stack_check(self):
        body = ' void MActor::frameUpdate()\n {\n-\tif (mCurFrame >= 0) {\n+\tif (0 <= mCurFrame) {\n \t\tupdate();\n \t}\n }\n'
        for surface in ('worker', 'pr_gate'):
            found = scan('src/M3DUtil/MActor.cpp', body, surface)
            self.assertEqual(rows(found), [('sms_operand_flip', 3, 'info')])
            self.assertIn('stack_check.py hunks', [f for f in found if f['rule_id'] == 'sms_operand_flip'][0]['message'])

    def test_real_comparison_change_is_not_a_flip(self):
        body = '-\tif (mCurFrame >= 0) {\n+\tif (1 <= mCurFrame) {\n'
        self.assertEqual(rows(scan('src/M3DUtil/MActor.cpp', body)), [])


class AccessorEvidenceTest(unittest.TestCase):
    def advisory(self, path, body):
        found = [f for f in scan(path, body) if f['rule_id'] == 'sms_accessor_evidence']
        for f in found:
            self.assertEqual(f['severity'], 'warning')
            self.assertTrue(f['detail']['llm_review'])
            self.assertIn('symbol map', f['message'])
        return [(f['line'], f['detail']['flip']) for f in found]

    def test_mactor_model_accessor_swap(self):
        body = '-\tmAnmData->createSampleModelData(mModel->getModelData());\n+\tmAnmData->createSampleModelData(getModel()->getModelData());\n'
        self.assertEqual(self.advisory('src/M3DUtil/MActor.cpp', body), [(1, 'field_to_accessor')])

    def test_samplectrlnode_inline_hop(self):
        body = ('-\t\tunk18[i].mAttnFn    = material->getColorChan(i)->getAttnFn();\n'
                '+\t\tunk18[i].mAttnFn\n+\t\t    = material->getColorBlock()->getColorChan(i)->getAttnFn();\n')
        self.assertEqual(self.advisory('src/M3DUtil/SampleCtrlNode.cpp', body), [(1, 'inline_hop_added')])

    def test_indexed_member_to_accessor(self):
        body = '-\tif (!mAnmByType[type])\n+\tif (!getUnk28(type))\n'
        self.assertEqual(self.advisory('src/M3DUtil/MActor.cpp', body), [(1, 'field_to_accessor')])

    def test_sunmgr_get_position_is_advisory_not_error(self):
        body = '-\tVec sunPos = mPosition;\n+\tVec sunPos = getPosition();\n'
        found = scan('src/Camera/sunmgr.cpp', body)
        self.assertEqual(rows(found), [('sms_accessor_evidence', 1, 'warning')])
        self.assertNotIn('error', [f['severity'] for f in found])

    def test_new_header_inline_needs_evidence(self):
        body = ' class TSunMgr {\n public:\n+\tconst Vec& getPosition() const { return mPosition; }\n \tVec mPosition;\n };\n'
        self.assertEqual(self.advisory('include/Camera/SunMgr.hpp', body), [(3, 'new_header_inline')])


class GlobalRulesUnderSmsTest(unittest.TestCase):
    def test_markers_do_not_downgrade_global_pragmas(self):
        body = added('// TODO: find a solution without the pragma\n#pragma push\n#pragma global_optimizer off\nbool f(int a)\n{\n\treturn a;\n}\n#pragma pop')
        found = scan('src/Camera/foo.cpp', body)
        pragma = [f for f in found if f['rule_id'] in ('codegen_pragma', 'novel_pragma') and f['line'] == 3]
        self.assertEqual([f['severity'] for f in pragma], ['error'])
        self.assertNotIn('visible debt', pragma[0]['message'])
        self.assertIn('marked or not', pragma[0]['message'])

    def test_marked_single_use_wrapper_still_fires(self):
        body = added('// fabricated: authored helper boundary\nstatic inline f32 twice(f32 a) { return a * 2.0f; }\nf32 f(f32 b)\n{\n\treturn twice(b);\n}')
        found = scan('src/Camera/foo.cpp', body)
        self.assertIn(('sms_fabricated_marker', 2, 'error'), rows(found))
        wrappers = [f for f in found if f['rule_id'] == 'single_use_wrapper']
        self.assertEqual(len(wrappers), 1)
        self.assertNotIn('mark it', wrappers[0]['message'])

    def test_layout_cue_local_loses_llm_review_in_sms(self):
        body = added('void TFoo::calc()\n{\n\tTFoo* self = this;\n\tself->mScale = 0.5f * mBase;\n}')
        found = [f for f in scan('src/Camera/foo.cpp', body) if f['rule_id'] == 'layout_cue_local']
        self.assertTrue(found)
        for f in found:
            self.assertEqual(f['severity'], 'info')
            self.assertNotIn('llm_review', f.get('detail', {}))
            self.assertIn('stack_check.py hunks', f['message'])
            self.assertNotIn('objdiff', f['message'])


class MeleeUnaffectedTest(unittest.TestCase):
    def test_pad_stack_and_comments_are_not_sms_findings_in_melee(self):
        body = added('void fn_80000000(void)\n{\n    PAD_STACK(8);\n    /// @todo nonmatching stack frame\n    call();\n}')
        found = scan('src/melee/ft/ftcommon.c', body, game='melee')
        self.assertEqual([f['rule_id'] for f in found if f['rule_id'].startswith('sms_')], [])
        self.assertNotIn('PAD_STACK', ' '.join(f['excerpt'] for f in found if f['severity'] == 'error'))


class SliceContractUnderSmsTest(unittest.TestCase):
    def test_slice_manifests_hold_with_the_sms_root(self):
        """test_slice_manifests runs against Melee by default; run it again with SMS slices composed."""
        result = subprocess.run([sys.executable, '-m', 'pytest', '-q', '-p', 'no:cacheprovider', str(TESTS / 'test_slice_manifests.py')], env=game_env('sms'), text=True, capture_output=True, cwd=ROOT)
        self.assertEqual(result.returncode, 0, result.stdout[-3000:] + result.stderr[-2000:])


if __name__ == '__main__':
    unittest.main()


def test_unused_static_local_backed_by_linker_map_is_not_padding(tmp_path, monkeypatch):
    """A dead-stripped `name$NNN` static listed in mario.MAP is real data, not stack padding."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('sms_rules_map', ROOT / 'toolpacks/gamecube-decomp/source_editing/review_lint/rules/sms.py')
    sms = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sms)
    repo = tmp_path / 'repo'
    (repo / 'config/GMSJ01').mkdir(parents=True)
    (repo / 'config/GMSJ01/symbols.txt').write_text('gpMarioOriginal = .sbss:0x80409490; // type:object size:0x4\n')
    (repo / 'orig/GMSJ01/files').mkdir(parents=True)
    (repo / 'orig/GMSJ01/files/mario.MAP').write_text('  UNUSED   00000c ........ anmlist$3030 Enemy.a hamukuri.cpp\n')
    monkeypatch.setenv('ORCH_GAME_REPO_ROOT', str(repo))
    sms._SYMBOL_NAMES.clear()
    text = 'void f()\n{\n\tg();\n\n\tstatic const char* anmlist[] = {\n\t\t"a",\n\t\tnullptr,\n\t};\n}\n'
    added = set(range(1, 10))
    names = [f['detail']['name'] for f in sms.unused_local_findings(text, added)]
    assert 'anmlist' not in names
    unmapped = text.replace('anmlist', 'bogus')
    assert 'bogus' in [f['detail']['name'] for f in sms.unused_local_findings(unmapped, added)]
