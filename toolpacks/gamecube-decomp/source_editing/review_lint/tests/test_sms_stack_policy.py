"""SMS stack-frame policy lints (maintainer ruling 2026-10-13, doldecomp/sms
#330/#331), checked end to end through scan_diff.py with the real review cases:
agent comments, PAD_STACK, alignment tricks, operand flips, accessor/inline
evidence, marker-blind global rules and the SMS rewrite of global advice, plus
the D1/D2 drop: invented helpers (sms_invented_helper) and odd-looking code
(sms_nonsense_code), with the #189 cases.
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



def write_patch(temp, files):
    """files: {path: hunk body with +/-/space prefixes}. Writes the patch and the post tree."""
    patch, post = Path(temp) / 'change.patch', Path(temp) / 'post'
    chunks = []
    for path, body in files.items():
        old = sum(1 for l in body.splitlines() if not l.startswith('+'))
        new = sum(1 for l in body.splitlines() if not l.startswith('-'))
        chunks.append(f'diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n@@ -1,{old} +1,{new} @@\n' + body)
        (post / path).parent.mkdir(parents=True, exist_ok=True)
        (post / path).write_text(''.join(l[1:] + '\n' for l in body.splitlines() if not l.startswith('-')))
    patch.write_text(''.join(chunks))
    return patch, post


def scan_repo(files, repo_files=None, surface='worker', game='sms', symbols='', mario_map=''):
    """Scan a multi-file patch against a fixture game repo with symbols.txt and mario.MAP."""
    with tempfile.TemporaryDirectory() as temp:
        repo = Path(temp) / 'repo'
        for rel, text in {**(repo_files or {}), 'config/GMSJ01/symbols.txt': symbols, 'orig/GMSJ01/files/mario.MAP': mario_map}.items():
            (repo / rel).parent.mkdir(parents=True, exist_ok=True)
            (repo / rel).write_text(text)
        patch, post = write_patch(temp, files)
        env = {**game_env(game), 'ORCH_GAME_REPO_ROOT': str(repo)}
        command = [sys.executable, str(SCANNER), '--repo', str(repo), '--post-tree', str(post), '--diff-file', str(patch), '--json', '--surface', surface]
        result = subprocess.run(command, env=env, text=True, capture_output=True)
        assert result.stdout.strip(), result.stderr
        return json.loads(result.stdout)['findings']


def rule_rows(findings, rule):
    return [(f['file'], f['line'], f['severity']) for f in findings if f['rule_id'] == rule]


MARIO_HEADER = 'class TMario {\npublic:\n\tvoid checkCurrentPlane();\n\tvoid checkFoo();\n\tBOOL onYoshi() const;\n};\n'
PLANE_DISTANCE = ('+static inline f32 planeDistance(const TBGCheckData* wall, Vec pos)\n+{\n'
                  '+\tf32 dot = wall->mNormal.x * pos.x + wall->mNormal.y * pos.y\n+\t          + wall->mNormal.z * pos.z;\n'
                  '+\treturn wall->mPlaneDistance + dot;\n+}\n+\n'
                  ' void TMario::checkCurrentPlane()\n {\n'
                  '+\tf32 dist1 = planeDistance(record.mResultWalls[0], mPosition);\n'
                  '+\tf32 dist2 = planeDistance(wall2, mPosition);\n'
                  '+\tuse(dist1, dist2);\n }\n')


class InventedHelperTest(unittest.TestCase):
    """D1: a function the diff adds needs an upstream declaration or a map entry."""
    REPO = {'include/Player/MarioMain.hpp': MARIO_HEADER, 'src/Player/MarioMove.cpp': '#include <Player/MarioMain.hpp>\n'}

    def test_mario_move_plane_distance_is_error_on_both_surfaces(self):
        body = ' #include <Player/MarioMain.hpp>\n' + PLANE_DISTANCE
        for surface in ('worker', 'pr_gate'):
            found = scan_repo({'src/Player/MarioMove.cpp': body}, self.REPO, surface, symbols='checkCurrentPlane__6TMarioFv = .text:0x8012F9D4; // type:function\n')
            self.assertEqual(rule_rows(found, 'sms_invented_helper'), [('src/Player/MarioMove.cpp', 2, 'error')])
            self.assertIn('leave the function nonmatching', [f for f in found if f['rule_id'] == 'sms_invented_helper'][0]['message'])

    def test_mario_physics_can_hang_and_manta_water_hit_count(self):
        can_hang = ('+static inline BOOL canHang(TMario* mario)\n+{\n+\treturn mario->getHeldObject() == nullptr && !mario->onYoshi();\n+}\n+\n'
                    ' int TMario::checkGroundAtJumping(const Vec& target, int param_2)\n {\n'
                    '-\tBOOL canHang = (mHeldObject == nullptr && !onYoshi());\n-\tif (canHang && mRoofPlane->isFence())\n'
                    '+\tif ((param_2 & 0x2) && canHang(this) && mRoofPlane->isFence())\n \t\treturn 1;\n-\tBOOL canHang = (mHeldObject == nullptr && !onYoshi());\n-\tif (canHang == 1) {\n+\tif (mRoofPlane != nullptr\n+\t    && canHang(this) == 1) {\n \t\treturn 2;\n \t}\n \treturn 0;\n }\n')
        manta = ('+static inline int getWaterHitCount(TBossManta* manta)\n+{\n+\tconst int hitCounts[6] = { 16, 8, 4, 2, 1, 1 };\n+\treturn hitCounts[manta->mGeneration];\n+}\n+\n'
                 ' void TBossManta::hitWater()\n {\n-\tconst int hitCounts[6] = { 16, 8, 4, 2, 1, 1 };\n-\tif (unk19C < hitCounts[mGeneration]) {\n+\tif (unk19C < getWaterHitCount(this)) {\n \t\tunk1A0 = 0x1E;\n \t}\n'
                 '-\tconst int hitCounts2[6] = { 16, 8, 4, 2, 1, 1 };\n-\tif (unk19C == hitCounts2[mGeneration]) {\n+\tif (getWaterHitCount(this) == unk19C) {\n \t\tdie();\n \t}\n }\n')
        found = scan_repo({'src/Player/MarioPhysics.cpp': can_hang, 'src/Enemy/bossManta.cpp': manta})
        self.assertEqual(rule_rows(found, 'sms_invented_helper'), [('src/Enemy/bossManta.cpp', 1, 'error'), ('src/Player/MarioPhysics.cpp', 1, 'error')])

    def test_helper_named_in_mario_map_or_symbols_is_not_flagged(self):
        body = ' #include <Player/MarioMain.hpp>\n' + PLANE_DISTANCE
        unused = '  UNUSED   000030 ........ planeDistance__FPC12TBGCheckData3Vec Player.a MarioMove.cpp\n'
        self.assertEqual(rule_rows(scan_repo({'src/Player/MarioMove.cpp': body}, self.REPO, mario_map=unused), 'sms_invented_helper'), [])
        symbol = 'planeDistance__FPC12TBGCheckData3Vec = .text:0x8012F000; // type:function size:0x30\n'
        self.assertEqual(rule_rows(scan_repo({'src/Player/MarioMove.cpp': body}, self.REPO, symbols=symbol), 'sms_invented_helper'), [])

    def test_definition_of_an_already_declared_method_is_not_flagged(self):
        body = ' #include <Player/MarioMain.hpp>\n \n+void TMario::checkFoo()\n+{\n+\tcheckCurrentPlane();\n+}\n'
        self.assertEqual(rule_rows(scan_repo({'src/Player/MarioMove.cpp': body}, self.REPO), 'sms_invented_helper'), [])
        # Declared by the class even when the .cpp does not include the header directly.
        body = ' #include "MarioMoveLocal.hpp"\n \n+void TMario::checkFoo()\n+{\n+}\n'
        self.assertEqual(rule_rows(scan_repo({'src/Player/MarioMove.cpp': body}, self.REPO), 'sms_invented_helper'), [])

    def test_member_declared_by_the_same_diff_is_invented(self):
        header = ' class TMario {\n public:\n \tvoid checkCurrentPlane();\n+\tf32 planeDistance(const TBGCheckData* wall);\n };\n'
        source = ' #include <Player/MarioMain.hpp>\n \n+f32 TMario::planeDistance(const TBGCheckData* wall)\n+{\n+\treturn wall->mPlaneDistance;\n+}\n'
        found = scan_repo({'include/Player/MarioMain.hpp': header, 'src/Player/MarioMove.cpp': source}, self.REPO)
        self.assertEqual(rule_rows(found, 'sms_invented_helper'), [('src/Player/MarioMove.cpp', 3, 'error')])

    def test_new_header_inline_without_evidence_is_invented(self):
        body = ' class TSunMgr {\n public:\n+\tconst Vec& getPos() const { return mPosition; }\n \tVec mPosition;\n };\n'
        self.assertEqual(rule_rows(scan_repo({'include/Camera/SunMgr.hpp': body}), 'sms_invented_helper'), [('include/Camera/SunMgr.hpp', 3, 'error')])
        mapped = 'getPos__7TSunMgrCFv = .text:0x80001000; // type:function\n'
        self.assertEqual(rule_rows(scan_repo({'include/Camera/SunMgr.hpp': body}, symbols=mapped), 'sms_invented_helper'), [])

    def test_single_use_static_inline_reports_once(self):
        body = added('static inline f32 twice(f32 a) { return a * 2.0f; }\nf32 TFoo::f(f32 b)\n{\n\treturn twice(b);\n}')
        found = scan_repo({'src/Camera/foo.cpp': body}, symbols='f__4TFooFf = .text:0x80001000; // type:function\n')
        self.assertEqual(rule_rows(found, 'sms_fabricated_marker'), [('src/Camera/foo.cpp', 1, 'error')])
        self.assertEqual(rule_rows(found, 'sms_invented_helper'), [])

    def test_no_symbols_means_no_evidence_and_no_finding(self):
        body = ' #include <Player/MarioMain.hpp>\n' + PLANE_DISTANCE
        self.assertEqual(rule_rows(scan('src/Player/MarioMove.cpp', body), 'sms_invented_helper'), [])

    def test_static_helper_defined_elsewhere_upstream_is_not_flagged(self):
        """unitVecTo: upstream CameraJetCoaster.cpp already defines `static void unitVecTo(...)`."""
        repo = {'src/Camera/CameraJetCoaster.cpp': 'static void unitVecTo(const JGeometry::TVec3<f32>& from,\n                      const JGeometry::TVec3<f32>& to, JGeometry::TVec3<f32>* out)\n{\n}\n',
                'src/Enemy/pakkun.cpp': 'void f()\n{\n\tf32 dist = 0.0f;\n\tuse(dist);\n}\n'}
        body = ('+static inline void unitVecTo(const JGeometry::TVec3<f32>& from,\n+                             const JGeometry::TVec3<f32>& to, JGeometry::TVec3<f32>* out)\n+{\n+}\n'
                '+static inline f32 dist(const Vec& a, const Vec& b)\n+{\n+\treturn a.x - b.x;\n+}\n'
                ' void CLBFoo(Vec* a, Vec* b, JGeometry::TVec3<f32>* out)\n {\n+\tunitVecTo(*a, *b, out);\n+\tunitVecTo(*b, *a, out);\n+\tuse(dist(*a, *b), dist(*b, *a));\n }\n')
        found = scan_repo({'src/Camera/cameralib.cpp': body}, repo)
        # dist only appears upstream as a local variable: still invented.
        self.assertEqual(rule_rows(found, 'sms_invented_helper'), [('src/Camera/cameralib.cpp', 5, 'error')])

    def test_ref_mode_uses_the_merge_base_tree_and_unused_map_symbols(self):
        """Ref mode (sms-lint.sh): evidence is read at the merge base, not the post-change worktree."""
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp) / 'repo'
            files = {'config/GMSJ01/symbols.txt': 'CLBFoo__FP3VecP3Vec = .text:0x80001000; // type:function\n',
                     'orig/GMSJ01/files/mario.MAP': '  UNUSED   000154 ........ CLBCalcNearClipAngle__FPQ29JGeometry8TVec3<f>P6S16Vecsf Camera.a cameralib.cpp\n',
                     'include/Camera/cameralib.hpp': 'void CLBCalcNearClipAngle(JGeometry::TVec3<f32>* a, S16Vec* b, s16 c, f32 d);\nvoid CLBFoo(Vec* a, Vec* b);\n',
                     'src/Camera/CameraJetCoaster.cpp': 'static void unitVecTo(const Vec& from, const Vec& to, Vec* out)\n{\n}\n',
                     'src/Camera/cameralib.cpp': '#include <Camera/cameralib.hpp>\n\nvoid CLBFoo(Vec* a, Vec* b)\n{\n}\n'}
            for rel, text in files.items():
                (repo / rel).parent.mkdir(parents=True, exist_ok=True)
                (repo / rel).write_text(text)
            git = lambda *args: subprocess.run(['git', '-C', str(repo), '-c', 'user.name=t', '-c', 'user.email=t@t', *args], check=True, capture_output=True, text=True).stdout.strip()
            git('init', '-q')
            git('add', '-A')
            git('commit', '-qm', 'base')
            base_ref = git('rev-parse', 'HEAD')
            # The change also declares RotatePair in the header: the post-change header is not evidence.
            (repo / 'include/Camera/cameralib.hpp').write_text(files['include/Camera/cameralib.hpp'] + 'void RotatePair(f32 angle, f32& a, f32& b);\n')
            (repo / 'src/Camera/cameralib.cpp').write_text('#include <Camera/cameralib.hpp>\n\n'
                'static inline void unitVecTo(const Vec& from, const Vec& to, Vec* out)\n{\n}\n\n'
                'void RotatePair(f32 angle, f32& a, f32& b)\n{\n\ta = angle * b;\n}\n\n'
                'void CLBCalcNearClipAngle(JGeometry::TVec3<f32>* a, S16Vec* b, s16 c, f32 d)\n{\n}\n\n'
                'void CLBFoo(Vec* a, Vec* b)\n{\n\tunitVecTo(*a, *b, a);\n\tunitVecTo(*b, *a, b);\n\tf32 x, y;\n\tRotatePair(1.0f, x, y);\n\tRotatePair(2.0f, y, x);\n}\n')
            git('commit', '-qam', 'change')
            env = {**game_env('sms'), 'ORCH_GAME_REPO_ROOT': str(repo)}
            result = subprocess.run([sys.executable, str(SCANNER), '--repo', str(repo), '--base', base_ref, '--json', '--surface', 'pr_gate'], env=env, text=True, capture_output=True)
            found = json.loads(result.stdout)['findings']
            self.assertEqual(rule_rows(found, 'sms_invented_helper'), [('src/Camera/cameralib.cpp', 7, 'error')])

    def test_melee_is_unaffected(self):
        body = added('static inline f32 twice(f32 a)\n{\n\treturn a * 2.0f;\n}\nvoid fn_80000000(f32 b)\n{\n\tuse(twice(b), twice(b));\n\tif (b != 0 || b != 0) { }\n}')
        found = scan_repo({'src/melee/ft/ftcommon.c': body}, game='melee')
        self.assertEqual([f['rule_id'] for f in found if f['rule_id'].startswith('sms_')], [])


def nonsense(body, path='src/Camera/foo.cpp', surface='worker'):
    return [(f['line'], f['severity'], f['detail']['kind']) for f in scan(path, body, surface) if f['rule_id'] == 'sms_nonsense_code']


def in_function(lines):
    return ' void TFoo::f()\n {\n' + lines + ' }\n'


class NonsenseCodeTest(unittest.TestCase):
    """D2: code a human would not write, on added lines only."""

    def test_console_str_repeated_test_is_error_on_both_surfaces(self):
        body = in_function('+\tint& point = unk34[i][iVar9].x;\n+\tif (point != 0 || point != 0) {\n \t\ttrailAlpha = 0.7f * trailAlpha;\n \t}\n')
        for surface in ('worker', 'pr_gate'):
            self.assertEqual(nonsense(body, 'src/GC2D/ConsoleStr.cpp', surface), [(4, 'error', 'repeated_operand')])

    def test_repeated_call_operand_and_identical_comparison(self):
        body = in_function('+\tif (actor->isActorType(0x40000040) || actor->isActorType(0x40000040))\n+\t\treturn;\n+\tbool same = mA == mA;\n')
        self.assertEqual(nonsense(body), [(3, 'error', 'repeated_operand'), (5, 'error', 'repeated_operand')])

    def test_mtx_util_double_negation(self):
        body = in_function('-\tf32 s = m[0][0] + m[1][1] + m[2][2] + 1.0f;\n+\tf32 s = (m[0][0] + m[1][1]) - -m[2][2] + 1.0f;\n+\tf32 t = -(-x);\n')
        self.assertEqual(nonsense(body, 'src/MarioUtil/MtxUtil.cpp'), [(3, 'error', 'double_negation'), (4, 'error', 'double_negation')])

    def test_menu_dir_negated_inequality_conjunction(self):
        body = in_function('+\tif (!(i != 17 && i != 18)) {\n \t\tcall();\n \t}\n')
        self.assertEqual(nonsense(body), [(3, 'error', 'negated_inequalities')])

    def test_map_obj_init_empty_if_and_multiline_else(self):
        body = in_function(' \tmMActor = newActor;\n+\tif (param_2 != nullptr) { }\n+\tif (flag) {\n+\t\tcall();\n+\t} else {\n+\t}\n')
        self.assertEqual(nonsense(body, 'src/MoveBG/MapObjInit.cpp'), [(4, 'error', 'empty_branch'), (7, 'error', 'empty_branch')])

    def test_case_that_only_breaks_is_warning(self):
        body = in_function(' \tswitch (mode) {\n+\tcase 3:\n+\t\tbreak;\n+\tcase 4: break;\n \tdefault:\n \t\treset();\n \t}\n')
        self.assertEqual(nonsense(body), [(4, 'warning', 'empty_case'), (6, 'warning', 'empty_case')])

    def test_bosseel_dead_store(self):
        body = in_function(' \tTMsRange<f32> unused(1.0f, 1.5f);\n-\tunused.rand();\n+\tf32 scale = unused.rand();\n \n-\tf32 scale = mOwner->getTearsParams()->mTearsDropScaleRange.rand();\n+\tscale = mOwner->getTearsParams()->mTearsDropScaleRange.rand();\n \tmScaling.set(scale, scale, scale);\n')
        self.assertEqual(nonsense(body, 'src/Enemy/bosseel.cpp'), [(4, 'error', 'dead_store')])

    def test_repeated_assignment_and_self_assignment(self):
        body = in_function('+\temitMtx = 1;\n \tprepare();\n+\temitMtx = 1;\n+\tmSpeed = mSpeed;\n')
        self.assertEqual(nonsense(body), [(5, 'error', 'repeated_assignment'), (6, 'error', 'self_assignment')])

    def test_non_examples_are_not_flagged(self):
        lines = ('+\tASSERT(x == x);\n'                  # macro-heavy line
                 '+\tx = x - 1;\n'                       # reads the variable
                 '+\tbool b = !!x;\n'                    # plain double logical not
                 '+\ty = a;\n+\ty = y * b;\n'            # split assignment reading y
                 '+\tif (x) {\n+\t\tcall();\n+\t}\n'      # non-empty body
                 '+\tif (a) {\n+\t\tz = 0;\n+\t} else {\n+\t\tz = 0;\n+\t}\n'  # same store in both branches
                 '+\tfoo();\n+\tfoo();\n'                # repeated calls
                 '+\tw = 0;\n+\tread(&w);\n+\tw = 0;\n'  # written through a pointer in between
                 '+\tscale = mOwner->mScaling.x;\n+\tsetHit(scale);\n+\tscale = mOwner->mScaling.x;\n'  # re-read after a call
                 '+\tVec& r = a;\n+\tr = b;\n'          # a reference store writes through
                 '+\tf32 d = x - 1 == 0 ? 1 : 0;\n'
                 '+\tswitch (k) {\n+\tcase 1:\n+\tcase 2:\n+\t\tbreak;\n+\tdefault:\n+\t\tbreak;\n+\t}\n'  # grouped labels, default
                 + '+\tif (p != q && p != r) {\n+\t\tcall();\n+\t}\n')  # un-negated inequalities
        self.assertEqual(nonsense(in_function(lines)), [])

    def test_upstream_lines_are_not_flagged(self):
        body = in_function(' \tif (param_2 != nullptr) { }\n \tx = 1;\n \tx = 2;\n+\tcall();\n')
        self.assertEqual(nonsense(body), [])

    def test_melee_is_unaffected(self):
        body = added('void fn_80000000(int b)\n{\n\tif (b != 0 || b != 0) { }\n\tb = b;\n}')
        found = scan('src/melee/ft/ftcommon.c', body, game='melee')
        self.assertEqual([f['rule_id'] for f in found if f['rule_id'].startswith('sms_')], [])


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
