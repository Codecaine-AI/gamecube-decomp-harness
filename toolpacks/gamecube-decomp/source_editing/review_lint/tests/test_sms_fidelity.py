"""Per-rule tests for the SMS game-specific review_lint slices
(sms_baseline unused-local-storage extension and the sms_fidelity family)."""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
STANDARDS = ROOT / 'games/sms/knowledge/sources/injectable/decomp_standards/standards'
SCANNER = ROOT / 'toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py'


def load(family):
    name = f'_review_lint_slice_{family}'
    path = STANDARDS / family / 'rules.py'
    module = sys.modules.get(name)
    if module is not None and getattr(module, '__file__', None) == str(path):
        return module
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


baseline = load('sms_baseline')
fidelity = load('sms_fidelity')
FILE = 'src/Enemy/example.cpp'


def hunk(source, removed='', full=True, path=FILE):
    lines = source.split('\n')
    return {'file': path, 'added': list(enumerate(lines, 1)), 'removed': removed.split('\n') if removed else [],
            'post_lines': [(number, text, True) for number, text in enumerate(lines, 1)],
            'post_file_text': source if full else None}


def ids(findings, key='kind'):
    return [f.get('detail', {}).get(key) for f in findings]


class UnusedLocalStorageTest(unittest.TestCase):
    def analyze(self, body, full=True):
        source = 'void TFoo::bar()\n{\n' + body + '\n}\n'
        found = baseline.check_dummy_padding(hunk(source, full=full))
        return [(f['line'] - 2, f.get('severity', 'error'), f['detail'].get('kind'), f['detail'].get('name')) for f in found]

    def test_unreferenced_locals_of_every_shape_are_errors(self):
        body = '\tMtx44 transform;\n\tJGeometry::TVec3<f32> position;\n\tSDLModelData* modelData;\n\tconst JGeometry::TVec3<f32>& ref = getPos();\n\tu32 timing[2];\n\tint a, b;\n\tuse(a);'
        found = self.analyze(body)
        self.assertEqual([(line, kind, name) for line, sev, kind, name in found],
                         [(1, 'unused_local', 'transform'), (2, 'unused_local', 'position'), (3, 'unused_local', 'modelData'), (4, 'unused_local', 'ref'), (5, 'unused_local', 'timing'), (6, 'unused_local', 'b')])
        self.assertTrue(all(sev == 'error' for _, sev, _, _ in found))

    def test_partial_aggregate_use_is_warning(self):
        found = self.analyze('\tJGeometry::TVec3<f32> pos;\n\tpos.y = 1.0f;\n\tuse(pos.y);\n\tVec full;\n\tfull.x = 1.0f;\n\tconsume(&full);')
        self.assertEqual(found, [(1, 'warning', 'partial_aggregate', 'pos')])

    def test_discarded_constructor_is_error(self):
        found = self.analyze('\tJGeometry::TVec3<f32>();\n\tVec();\n\tTNerveThing(1, 2);\n\tstatic_cast<TPosition3f&>(unk220).setQT(mQuat, mPosition);\n\tSMS_InitPacket(getModel(), 0);')
        self.assertEqual([(l, k) for l, s, k, n in found], [(1, 'discarded_constructor'), (2, 'discarded_constructor'), (3, 'discarded_constructor')])

    def test_references_of_every_kind_count(self):
        body = ('\tVec out;\n\tfill(&out);\n\tMtx m;\n\tPSMTXIdentity(m);\n\tint i;\n\tfor (i = 0; i < 3; ++i) { }\n'
                '\tTFoo* self = this;\n\tself->go();\n\tf32 v = 1.0f;\n\tJUT_ASSERT(v > 0.0f);\n\tconst TVec3& p = getP();\n\treturn use(p);')
        self.assertEqual(self.analyze(body), [])

    def test_continuation_lines_and_member_access_are_not_declarations(self):
        body = ('\tf32 r = compute(a,\n\t    radius * JMASCos(theta));\n\tuse(r);\n\tfoo(x,\n\t    JGeometry::TVec3<f32>(0.0f, 1.0f, 0.0f));\n\tmPosition.x = 1.0f;\n\tTBar::sValue = 2;\n\treturn;')
        self.assertEqual(self.analyze(body), [])

    def test_unused_call_result_is_warning(self):
        found = self.analyze('\tJAISound* sound = startSound(1);\n\tint iVar1 = iVar2 / 180 + (iVar2 >> 15);')
        self.assertEqual(found, [(1, 'warning', 'unused_call_result', 'sound'), (2, 'error', 'unused_local', 'iVar1')])

    def test_union_members_and_one_line_functions_are_skipped(self):
        source = 'class TX {\npublic:\n\tTX* getObj(int i) { return (TX*)TObjManager::getObj(i); }\n};\nvoid f()\n{\n\tunion {\n\t\tu64 alignment;\n\t\tchar data[0x100];\n\t} buf;\n\tuse(buf.data);\n}\n'
        self.assertEqual(baseline.check_dummy_padding(hunk(source)), [])

    def test_only_added_lines_are_reported(self):
        source = 'void f()\n{\n\tMtx old;\n\tMtx fresh;\n}\n'
        h = hunk(source)
        h['added'] = [(4, '\tMtx fresh;')]
        self.assertEqual([f['detail']['name'] for f in baseline.check_dummy_padding(h)], ['fresh'])

    def test_named_padding_still_error_without_post_text(self):
        found = baseline.check_dummy_padding(hunk('\tvolatile char trash[0x10];', full=False))
        self.assertEqual(len(found), 1)
        self.assertNotIn('kind', found[0].get('detail', {}))

    def test_fallback_reads_post_file_from_repo(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'src/Enemy').mkdir(parents=True)
            (root / FILE).write_text('#include <x.hpp>\nvoid f()\n{\n\tMtx44 transform;\n\tuse(1);\n}\n')
            h = hunk('\tMtx44 transform;', full=False)
            h['added'] = [(4, '\tMtx44 transform;')]
            baseline.check_dummy_padding(h)
            findings = baseline.check_unused_locals_fallback([], root, 'diff', [{'file': FILE, 'hunks': [h]}], None)
            self.assertEqual([(f['rule_id'], f['line'], f['severity']) for f in findings], [('sms_dummy_stack_padding', 4, 'error')])
            self.assertEqual(findings[0]['detail']['post_text_source'], 'repo_fallback')
            # drifted line numbers realign on unique text
            h['added'] = [(9, '\tMtx44 transform;')]
            findings = baseline.check_unused_locals_fallback([], root, 'diff', [{'file': FILE, 'hunks': [h]}], None)
            self.assertEqual([f['line'] for f in findings], [9])


class LocalClassNeedsOwnerTest(unittest.TestCase):
    def repo(self, root, header=''):
        (root / 'include/Enemy').mkdir(parents=True)
        (root / 'include/Enemy/Owner.hpp').write_text(header)
        (root / 'config/GMSJ01').mkdir(parents=True)
        (root / 'config/GMSJ01/symbols.txt').write_text('__vt__7TKiller = .data:0x803DDF98; // type:object size:0x1C4 scope:global align:4\n__ct__6TKoopaFPCc = .text:0x80100000; // type:function\n@32@__dt__6TKoopaFv = .text:0x80100100; // thunk\n')
        (root / 'config/GMSJ01/splits.txt').write_text('Sections:\n\t.text       type:code align:8\n\nEnemy/killer.cpp:\n\t.text       start:0x802ED7BC end:0x802F0BD8\n\t.data       start:0x803DDED8 end:0x803DE398\n\nEnemy/Koopa.cpp:\n\t.text       start:0x80100000 end:0x80101000\n')
        fidelity._HEADER_CACHE.clear()

    def run_hook(self, root, path, added):
        diffs = [{'file': path, 'hunks': [{'file': path, 'added': list(enumerate(added, 1)), 'removed': [], 'post_lines': []}]}]
        return fidelity.check_local_class_owner([], root, 'diff', diffs, None)

    def test_class_owned_by_other_unit_is_error(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.repo(root)
            found = self.run_hook(root, 'src/MoveBG/MapObjCorona.cpp', ['class TKoopa : public JDrama::TNameRef {', 'public:', '};'])
            self.assertEqual([(f['rule_id'], f['severity'], f['line']) for f in found], [('sms_local_class_needs_owner', 'error', 1)])
            self.assertEqual(found[0]['standard_id'], 'global_standard:sms-authored-evidence')
            self.assertIn('belongs to Enemy/Koopa.cpp', found[0]['message'])

    def test_class_in_own_unit_or_without_symbol_is_warning(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.repo(root)
            found = self.run_hook(root, 'src/Enemy/killer.cpp', ['class TKiller {', 'struct TNoSymbol {'])
            self.assertEqual([(f['severity'], f['detail']['class_name']) for f in found], [('warning', 'TKiller'), ('warning', 'TNoSymbol')])
            self.assertIn('move the declaration to include/', found[0]['message'].lower().replace('move the declaration to include/', 'move the declaration to include/'))
            self.assertIn('no map symbol', found[1]['message'])

    def test_header_declared_forward_and_indented_classes_are_ignored(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.repo(root, header='class TKiller;\n')
            found = self.run_hook(root, 'src/Enemy/killer.cpp', ['class TKiller {', 'class TFwd;', '\tclass TNested {', 'class TFoo* ptr;'])
            self.assertEqual(found, [])


class PchStringConventionTest(unittest.TestCase):
    def test_named_copies_literal_copies_and_guard_predefines(self):
        source = ('#define SYSTEM_DUMMY_STRINGS_HPP\nstatic const char dummyMactorStringValue1[] = "\\0\\0\\0\\0\\0\\0\\0\\0\\0\\0\\0";\n'
                  'static const char* SMS_NO_MEMORY_MESSAGE   = "メモリが足りません\\n";\nstatic const char* MtxCalcTypeName[] = {\n'
                  'static const char unk2322[] = "メモリが足りません\\n";\nstatic const char* renamed = "MActorMtxCalcType_User ユーザー定義";\n'
                  'static const char cDirtyTexName[]  = "H_ma_rak_dummy";\n#include <M3DUtil/InfectiousStrings.hpp>')
        found = fidelity.check_pch_strings(hunk(source))
        self.assertEqual([f['line'] for f in found], [1, 2, 3, 4, 5, 6])
        self.assertEqual(found[0]['detail']['header'], 'System/DummyStrings.hpp')
        self.assertEqual(found[5]['detail']['header'], 'M3DUtil/InfectiousStrings.hpp')

    def test_vendor_and_header_paths_are_ignored(self):
        self.assertEqual(fidelity.check_pch_strings(hunk('#define SYSTEM_DUMMY_STRINGS_HPP', path='src/JSystem/x.cpp')), [])
        self.assertEqual(fidelity.check_pch_strings(hunk('static const char* MtxCalcTypeName[] = {', path='include/M3DUtil/InfectiousStrings.hpp')), [])


class FabricatedMarkerTest(unittest.TestCase):
    def test_pragmas_need_marker(self):
        found = fidelity.check_fabricated_marker(hunk('void a() { }\n\n#pragma dont_inline on\nvoid b() { }\n#pragma dont_inline off\n#pragma inline_depth(2)'))
        self.assertEqual([(f['line'], f.get('severity', 'error')) for f in found], [(3, 'error'), (6, 'error')])
        found = fidelity.check_fabricated_marker(hunk('// TODO: fakematch, inline not found\n#pragma dont_inline on\nvoid b() { } // fabricated\n#pragma inline_depth(2)'))
        self.assertEqual([(f['line'], f.get('severity', 'error')) for f in found], [(2, 'warning'), (4, 'warning')])

    def test_force_active_always_error(self):
        found = fidelity.check_fabricated_marker(hunk('// fabricated\n#pragma force_active on\nstatic const f32 z[3] = { 0 };\n#pragma force_active off'))
        self.assertEqual([(f['line'], f.get('severity', 'error')) for f in found], [(2, 'error')])

    def test_single_use_static_inline_needs_marker(self):
        source = 'static inline f32 dot(f32 a, f32 b)\n{\n\treturn a * b;\n}\nvoid f() { use(dot(1, 2)); }\n'
        found = fidelity.check_fabricated_marker(hunk(source))
        self.assertEqual([(f['line'], f.get('severity', 'error'), f['detail']['helper']) for f in found], [(1, 'error', 'dot')])
        self.assertEqual(fidelity.check_fabricated_marker(hunk('// fabricated helper\n' + source))[0]['severity'], 'warning')
        self.assertEqual(fidelity.check_fabricated_marker(hunk(source + 'void g() { use(dot(3, 4)); }\n')), [])
        multi = 'static inline TLiveManager*\ngetManagerByNameInline(const char* name)\n{\n\treturn 0;\n}\nvoid f() { getManagerByNameInline("x"); }\n'
        self.assertEqual([f['detail']['helper'] for f in fidelity.check_fabricated_marker(hunk(multi))], ['getManagerByNameInline'])

    def test_single_use_static_inline_fallback_via_repo(self):
        source = 'static inline f32 dot(f32 a, f32 b)\n{\n\treturn a * b;\n}\nvoid f() { use(dot(1, 2)); }\n'
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'src/Enemy').mkdir(parents=True)
            (root / FILE).write_text(source)
            h = hunk(source, full=False)
            self.assertEqual(fidelity.check_fabricated_marker(h), [])
            found = fidelity.check_fabricated_marker_post([], root, 'diff', [{'file': FILE, 'hunks': [h]}], None)
            self.assertEqual([(f['rule_id'], f['line'], f['severity']) for f in found], [('sms_fabricated_marker', 1, 'error')])

    def test_hand_expanded_inline_body_matches_header_inline(self):
        body = '\tmtx[0][0] = c;\n\tmtx[0][1] = -s;\n\tmtx[1][0] = s;\n\tmtx[1][1] = c;\n\tmtx[2][2] = 1.0f;\n\tmtx[3][3] = 1.0f;\n'
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'include/MoveBG').mkdir(parents=True)
            (root / 'include/MoveBG/Mtx.hpp').write_text('inline void makeRotZ(MtxPtr mtx, f32 c, f32 s)\n{\n' + body + '}\nclass TX {\n\tstatic f32 a;\n\tstatic f32 b;\n\tstatic f32 c;\n\tstatic f32 d;\n\tstatic f32 e;\n\tstatic f32 f;\n};\n')
            (root / 'src/Enemy').mkdir(parents=True)
            fidelity._HEADER_WINDOWS.clear()
            source = 'void TFoo::rot(MtxPtr mtx, f32 c, f32 s)\n{\n' + body + '}\n'
            h = hunk(source, full=False)
            found = fidelity.check_fabricated_marker_post([], root, 'diff', [{'file': FILE, 'hunks': [h]}], None)
            self.assertEqual([(f['line'], f['severity'], f['detail']['kind']) for f in found], [(3, 'error', 'duplicated_inline_body')])
            marked = hunk('// TODO: fakematch of makeRotZ\nvoid TFoo::rot(MtxPtr mtx, f32 c, f32 s)\n{\n' + body + '}\n', full=False)
            found = fidelity.check_fabricated_marker_post([], root, 'diff', [{'file': FILE, 'hunks': [marked]}], None)
            self.assertEqual([f['severity'] for f in found], ['warning'])
            # class member copies do not count as expanded inline bodies
            members = hunk('class TX {\n\tstatic f32 a;\n\tstatic f32 b;\n\tstatic f32 c;\n\tstatic f32 d;\n\tstatic f32 e;\n\tstatic f32 f;\n};\n', full=False)
            self.assertEqual(fidelity.check_fabricated_marker_post([], root, 'diff', [{'file': FILE, 'hunks': [members]}], None), [])


class IntrinsicBypassTest(unittest.TestCase):
    def test_intrinsics_with_wrappers(self):
        found = fidelity.check_intrinsic_bypass(hunk('\tif (__fabsf(mRotation.x) < 45.0f) {\n\tf64 estimate = __frsqrte(v.y);\n\tf32 r = __fres(x);\n\tif (fabsf(x) < 1.0f) { }\n\t__dt__7TKillerFv(this);'))
        self.assertEqual([f['detail']['intrinsic'] for f in found], ['__fabsf', '__frsqrte', '__fres'])
        self.assertTrue(all(f['detail']['requires_human_review'] for f in found))

    def test_accessor_field_flips(self):
        found = fidelity.check_intrinsic_bypass(hunk('\tTMapCollisionBase* base = mgr->getUnk8();', removed='\tTMapCollisionBase* base = mgr->unk8;'))
        self.assertEqual([f['detail']['flip'] for f in found], ['field_to_accessor'])
        found = fidelity.check_intrinsic_bypass(hunk('\tif (TMapCollisionBase* col = mgr->unk8)', removed='\tif (TMapCollisionBase* col = mgr->getUnk8())'))
        self.assertEqual([f['detail']['flip'] for f in found], ['accessor_to_field'])
        # a real change alongside the flip is not a pure toggle
        self.assertEqual(fidelity.check_intrinsic_bypass(hunk('\tint v = other->getUnk8() + 1;', removed='\tint v = mgr->unk8;')), [])


class DummyVecHelperTest(unittest.TestCase):
    def test_helper_needs_emission_comment(self):
        found = fidelity.check_dummy_vec_helper(hunk('static void dummy(Vec* v)\n{\n\t*v = (Vec) { 0.0f, 0.0f, 0.0f };\n}'))
        self.assertEqual([f['line'] for f in found], [1])
        self.assertEqual(fidelity.check_dummy_vec_helper(hunk('// dummy: emits lit_100, lit_101\nstatic void dummy(Vec* v)\n{\n}')), [])
        self.assertEqual(fidelity.check_dummy_vec_helper(hunk('static void dummy(Vec* v) // dummy: emits lit_100\n{\n}')), [])


class ScanDiffIntegrationTest(unittest.TestCase):
    def test_end_to_end_with_post_tree(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'src/Enemy').mkdir(parents=True)
            (root / 'include').mkdir()
            (root / 'config/GMSJ01').mkdir(parents=True)
            (root / 'config/GMSJ01/symbols.txt').write_text('')
            (root / 'config/GMSJ01/splits.txt').write_text('')
            source = '#define SYSTEM_DUMMY_STRINGS_HPP\nclass TOrphan {\n};\n#pragma dont_inline on\nvoid TFoo::bar()\n{\n\tMtx44 transform;\n\tif (__fabsf(x) < 1.0f) { }\n\tJGeometry::TVec3<f32>();\n}\n#pragma dont_inline off\nstatic void dummy(Vec* v) { }\n'
            (root / FILE).write_text(source)
            patch = root / 'change.patch'
            lines = source.split('\n')[:-1]
            patch.write_text(f'diff --git a/{FILE} b/{FILE}\n--- a/{FILE}\n+++ b/{FILE}\n@@ -0,0 +1,{len(lines)} @@\n' + ''.join(f'+{l}\n' for l in lines))
            env = {**os.environ, 'ORCH_GAME_ID': 'sms', 'ORCH_GAME_DIR': str(ROOT / 'games/sms'), 'ORCH_GAME_KNOWLEDGE_ROOT': str(ROOT / 'games/sms/knowledge')}
            result = subprocess.run([sys.executable, str(SCANNER), '--repo', str(root), '--post-tree', str(root), '--diff-file', str(patch), '--surface', 'worker', '--json'], env=env, text=True, capture_output=True)
            self.assertTrue(result.stdout.strip(), result.stderr)
            payload = json.loads(result.stdout)
            got = {(f['rule_id'], f['line'], f['severity']) for f in payload['findings'] if f['rule_id'].startswith('sms_')}
            for expected in [('sms_pch_string_convention', 1, 'error'), ('sms_local_class_needs_owner', 2, 'warning'), ('sms_fabricated_marker', 4, 'error'), ('sms_dummy_stack_padding', 7, 'error'), ('sms_intrinsic_bypass', 8, 'warning'), ('sms_dummy_stack_padding', 9, 'error'), ('sms_dummy_vec_helper', 12, 'warning')]:
                self.assertIn(expected, got)
            # SMS owns the construct on each of these lines; the global twin is suppressed.
            global_twins = {(f['rule_id'], f['line']) for f in payload['findings'] if f['rule_id'] in ('header_override_macro', 'codegen_pragma', 'novel_pragma', 'discarded_expression')}
            self.assertEqual(global_twins, set())


if __name__ == '__main__':
    unittest.main()
