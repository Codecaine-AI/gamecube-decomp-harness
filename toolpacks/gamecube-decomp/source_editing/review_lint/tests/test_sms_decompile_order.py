"""SMS decompile-in-order lints (doldecomp/sms #347/#348, objectives/sms-real-codegen/order-scope-plan.md
sections 1, 3 and 5), end to end through scan_diff.py against a fixture git checkout with target ELF
objects, objdiff.json and mario.MAP, so readiness.py decides at a real revision:
- sms_out_of_order_fill: MarNameRefGen may reference only classes whose `construct` state is ready or shared;
- sms_undecompiled_class_decl: declarations need `declare` ready (owner implementation started);
- unresolved identity is a finding with its reason, except TU-local helpers;
- no objects/map/revision (unbuilt checkout, Melee) skips."""
import json
import os
import struct
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_sms_stack_policy import SCANNER, game_env, write_patch  # noqa: E402

FILL, DECL = 'sms_out_of_order_fill', 'sms_undecompiled_class_decl'
REFGEN = 'src/System/MarNameRefGen_BossEnemy.cpp'
BLR = 0x4E800020


def build_elf(functions, weak=()):
    """ELF32 big-endian relocatable with one .text symbol per function (GLOBAL, or WEAK when named in `weak`)."""
    text = struct.pack('>I', BLR) * len(functions)
    shstr = b'\0.text\0.symtab\0.strtab\0.shstrtab\0'
    strtab, syms = b'\0', [struct.pack('>IIIBBH', 0, 0, 0, 0, 0, 0)]
    for index, name in enumerate(functions):
        offset = len(strtab)
        strtab += name.encode() + b'\0'
        bind = 2 if name in weak else 1
        syms.append(struct.pack('>IIIBBH', offset, 4 * index, 4, (bind << 4) | 2, 0, 1))
    symtab = b''.join(syms)
    blobs, offsets, body = [text, symtab, strtab, shstr], [], b''
    for blob in blobs:
        offsets.append(52 + len(body))
        body += blob + b'\0' * (-len(blob) % 4)
    specs = [('.text', 1, 0x6, 0, 0, 4, 0), ('.symtab', 2, 0, 3, 1, 4, 16), ('.strtab', 3, 0, 0, 0, 1, 0), ('.shstrtab', 3, 0, 0, 0, 1, 0)]
    sections = [b'\0' * 40] + [struct.pack('>10I', shstr.index(name.encode() + b'\0'), typ, flags, 0, offset, len(blob), link, info, align, ent)
                               for (name, typ, flags, link, info, align, ent), blob, offset in zip(specs, blobs, offsets)]
    ehdr = b'\x7fELF\x01\x02\x01' + b'\0' * 9 + struct.pack('>HHIIIIIHHHHHH', 1, 20, 1, 0, 0, 52 + len(body), 0, 52, 0, 0, 40, len(sections), 4)
    return ehdr + body + b''.join(sections)


# unit -> (source path or None, target functions, weak functions, source text at the base revision)
UNITS = {
    'mario/Enemy/Koopa': ('src/Enemy/Koopa.cpp', ['__ct__6TKoopaFPCc', 'bind__6TKoopaFv'], (), '#include <Enemy/Koopa.hpp>\n'),
    'mario/Enemy/tinkoopa': ('src/Enemy/tinkoopa.cpp', ['__ct__9TTinKoopaFPCc', 'bind__9TTinKoopaFv'], (),
                             'TTinKoopa::TTinKoopa(const char* name) { }\nvoid TTinKoopa::bind() { }\n'),
    'mario/Enemy/killer': ('src/Enemy/killer.cpp', ['__ct__14TKillerManagerFPCc', 'load__14TKillerManagerFv', '__ct__7TKillerFPCc', 'bind__7TKillerFv'], (), '\n'),
    # Started (a trivial member defined) but its constructor is not: declare ready, construct not ready.
    'mario/Enemy/started': ('src/Enemy/started.cpp', ['__ct__8TStartedFPCc', 'bind__8TStartedFv'], (), 'void TStarted::bind() { }\n'),
    # Constructor only weak (inline in the original): construction needs no owner code.
    'mario/Enemy/shared': ('src/Enemy/shared.cpp', ['__ct__7TSharedFv', 'bind__7TSharedFv'], ('__ct__7TSharedFv',), '\n'),
    'mario/MapObj/mapobjplane': ('src/MapObj/mapobjplane.cpp', ['__ct__12TMapObjPlaneFPCc'], (), 'TMapObjPlane::TMapObjPlane(const char*) { }\n'),
    'mario/Enemy/ambig1': ('src/Enemy/ambig1.cpp', ['f__6TAmbigFv'], (), 'void TAmbig::f() { }\n'),
    'mario/Enemy/ambig2': ('src/Enemy/ambig2.cpp', ['g__6TAmbigFv'], (), 'void TAmbig::g() { }\n'),
    'mario/JSystem/JDrama': ('src/JSystem/JDrama.cpp', ['__ct__Q26JDrama8TNameRefFv', 'GetValue__6JDramaFPCc'], (),
                             'namespace JDrama {\nTNameRef::TNameRef() { }\n}\n'),
    'mario/System/MarNameRefGen': ('src/System/MarNameRefGen.cpp', ['__ct__14TMarNameRefGenFv', 'getNameRef__14TMarNameRefGenCFPCc'], (),
                                   'TMarNameRefGen::TMarNameRefGen() { }\nJDrama::TNameRef* TMarNameRefGen::getNameRef(const char*) const { return 0; }\n'),
    'mario/System/MarNameRefGen_BossEnemy': (REFGEN, ['getNameRef_BossEnemy__14TMarNameRefGenCFPCc'], (),
                                             'JDrama::TNameRef* TMarNameRefGen::getNameRef_BossEnemy(const char* name) const\n{\n\treturn nullptr;\n}\n'),
}


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), '-c', 'user.name=t', '-c', 'user.email=t@t', *args], check=True, capture_output=True, text=True).stdout.strip()


def make_repo(root, units=UNITS, built=True, extra=None):
    """A git checkout: sources committed; objdiff.json, target objects and the map on disk (untracked, as in SMS)."""
    repo = Path(root) / 'repo'
    repo.mkdir()
    (repo / '.gitignore').write_text('build/\norig/\nobjdiff.json\n')
    for source, _, _, text in units.values():
        (repo / source).parent.mkdir(parents=True, exist_ok=True)
        (repo / source).write_text(text)
    for rel, text in (extra or {}).items():
        (repo / rel).parent.mkdir(parents=True, exist_ok=True)
        (repo / rel).write_text(text)
    (repo / 'config/GMSJ01').mkdir(parents=True)
    (repo / 'config/GMSJ01/symbols.txt').write_text('')
    git(repo, 'init', '-q')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-qm', 'base')
    if built:
        rows = []
        for name, (source, functions, weak, _) in units.items():
            target = f'build/GMSJ01/obj/{name.split("/", 1)[1]}.o'
            (repo / target).parent.mkdir(parents=True, exist_ok=True)
            (repo / target).write_bytes(build_elf(functions, weak))
            rows.append({'name': name, 'target_path': target, 'metadata': {'source_path': source} if source else {}})
        (repo / 'objdiff.json').write_text(json.dumps({'units': rows}))
        (repo / 'orig/GMSJ01/files').mkdir(parents=True)
        (repo / 'orig/GMSJ01/files/mario.MAP').write_text('Link map of __start\n')
    return repo


def run_scan(repo, args, root, game='sms'):
    env = {**game_env(game), 'ORCH_GAME_REPO_ROOT': str(repo), 'ORCH_READINESS_CACHE': str(Path(root) / 'cache')}
    result = subprocess.run([sys.executable, str(SCANNER), '--repo', str(repo), *args, '--json'], env=env, text=True, capture_output=True)
    assert result.stdout.strip(), result.stderr
    return json.loads(result.stdout)['findings']


def scan_order(files, surface='worker', built=True, game='sms', extra=None):
    with tempfile.TemporaryDirectory() as root:
        repo = make_repo(root, built=built, extra=extra)
        patch, post = write_patch(root, files)
        return run_scan(repo, ['--post-tree', str(post), '--diff-file', str(patch), '--surface', surface], root, game)


def rows(findings, rule):
    return [(f['file'], f['line'], f['detail']['class'], f['detail']['state']) for f in findings if f['rule_id'] == rule]


FACTORY = (' JDrama::TNameRef* TMarNameRefGen::getNameRef_BossEnemy(const char* name) const\n {\n'
           '+\tif (strcmp(name, "Koopa") == 0)\n+\t\treturn new TKoopa("Koopa");\n'
           '+\tif (strcmp(name, "TinKoopa") == 0)\n+\t\treturn new TTinKoopa("TinKoopa");\n'
           '+\tif (strcmp(name, "MapObjPlane") == 0)\n+\t\treturn new TMapObjPlane("x");\n'
           '+\tif (strcmp(name, "Shared") == 0)\n+\t\treturn new TShared;\n'
           '+\tif (strcmp(name, "Started") == 0)\n+\t\treturn new TStarted("s");\n'
           '+\tif (strcmp(name, "Mystery") == 0)\n+\t\treturn new TMystery;\n'
           '+\tJDrama::TNameRef* ref = JDrama::GetValue(name);\n'
           '+\treturn TMarNameRefGen::getNameRef(name);\n }\n')


class OutOfOrderFillTest(unittest.TestCase):
    def test_factory_follows_construct_readiness_on_both_surfaces(self):
        for surface in ('worker', 'pr_gate'):
            found = scan_order({REFGEN: FACTORY}, surface)
            # Ready (tinkoopa, mapobjplane at 89.7% but its constructor exists), shared (weak-only ctor),
            # namespaces (JDrama::TNameRef*, JDrama::GetValue) and the file's own class pass.
            self.assertEqual([(line, cls, state) for _, line, cls, state in rows(found, FILL)],
                             [(4, 'TKoopa', 'not_ready'), (12, 'TStarted', 'not_ready'), (14, 'TMystery', 'unresolved')])
            self.assertEqual({f['severity'] for f in found if f['rule_id'] == FILL}, {'error'})
            koopa, started, mystery = [f for f in found if f['rule_id'] == FILL]
            self.assertEqual(koopa['standard_id'], 'global_standard:sms-decompile-in-order')
            self.assertEqual((koopa['detail']['owner_unit'], koopa['detail']['reference']), ('mario/Enemy/Koopa', 'new'))
            self.assertIn('Please leave MarNameRefGen alone', koopa['message'])
            self.assertIn("Leave it until the class's own unit is decompiled.", koopa['message'])
            self.assertIn('constructor is not defined', started['detail']['reason'])  # a defined trivial member does not make it constructible
            self.assertIn('not a class in the link map', mystery['detail']['reason'])

    def test_includes_are_not_findings(self):
        """#347/#348 adjudication: an added include of a blank-unit header declares nothing (as edit_scope)."""
        body = (' #include <Enemy/TinKoopa.hpp>\n+#include <Enemy/Koopa.hpp>\n+#include <Enemy/Killer.hpp>\n+#include "Enemy/Mystery.hpp"\n'
                ' #include <System/MarNameRefGen.hpp>\n')
        self.assertEqual(rows(scan_order({REFGEN: body}), FILL), [])

    def test_ambiguous_owner_and_alias(self):
        body = ' {\n+\treturn new TAmbig;\n+\ttypedef TKoopa TBowser;\n+\treturn new TBowser("b");\n }\n'
        found = scan_order({REFGEN: body})
        self.assertEqual([(line, cls, state) for _, line, cls, state in rows(found, FILL)],
                         [(2, 'TAmbig', 'unresolved'), (4, 'TBowser', 'unresolved')])
        self.assertIn('ambiguous', [f for f in found if f['rule_id'] == FILL][0]['detail']['reason'])

    def test_comments_context_and_other_files_are_not_flagged(self):
        body = ' \treturn new TKoopa;\n+\t// TODO:\n+\t// if ( strcmp( name, "Koopa" ) == 0 )\n+\t//     return new TKoopa("Koopa");\n'
        self.assertEqual(rows(scan_order({REFGEN: body}), FILL), [])
        # The fill rule is MarNameRefGen-only; other units are the gate's and the edit-scope fence's business.
        self.assertEqual(rows(scan_order({'src/Enemy/tinkoopa.cpp': ' void TTinKoopa::bind() { }\n+void f()\n+{\n+\tnew TKoopa("k");\n+}\n'}), FILL), [])

    def test_readiness_is_read_at_the_merge_base(self):
        """A change that defines TKoopa's constructor and fills the factory in one go is still out of order at its base."""
        with tempfile.TemporaryDirectory() as root:
            repo = make_repo(root)
            base_ref = git(repo, 'rev-parse', 'HEAD')
            (repo / 'src/Enemy/Koopa.cpp').write_text('TKoopa::TKoopa(const char* name) { }\n')
            (repo / REFGEN).write_text(UNITS['mario/System/MarNameRefGen_BossEnemy'][3].replace('\treturn nullptr;', '\treturn new TKoopa("Koopa");'))
            git(repo, 'commit', '-qam', 'change')
            found = run_scan(repo, ['--base', base_ref, '--surface', 'pr_gate'], root)
            self.assertEqual([(line, cls) for _, line, cls, _ in rows(found, FILL)], [(3, 'TKoopa')])
            self.assertEqual([f['detail']['readiness_rev'] for f in found if f['rule_id'] == FILL], [base_ref])


class UndecompiledClassDeclTest(unittest.TestCase):
    def test_killer_manager_header_and_member_expansion_are_errors_on_both_surfaces(self):
        body = (' class TKiller : public TFlyEnemy {\n public:\n \tTKiller(const char* name);\n+\tvoid newThing();\n };\n'
                '+\n+class TKillerManager : public TSmallEnemyManager {\n+public:\n+\tTKillerManager(const char* name);\n+};\n')
        for surface in ('worker', 'pr_gate'):
            found = scan_order({'include/Enemy/Killer.hpp': body}, surface)
            self.assertEqual([(line, cls, state) for _, line, cls, state in rows(found, DECL)],
                             [(4, 'TKiller', 'not_ready'), (7, 'TKillerManager', 'not_ready')])
            self.assertEqual({f['severity'] for f in found if f['rule_id'] == DECL}, {'error'})
            self.assertIn("don't jump the fence please", next(f for f in found if f['rule_id'] == DECL)['message'])

    def test_bogus_header_inline_constructor_grants_nothing(self):
        """Adversarial: an inline constructor in the header for a stub class is a declaration for an
        unstarted class, and the factory that uses it is still out of order."""
        header = ' class TKoopa : public TBossEnemy {\n public:\n+\tTKoopa(const char* name) { }\n };\n'
        factory = ' {\n+\treturn new TKoopa("Koopa");\n }\n'
        found = scan_order({'include/Enemy/Koopa.hpp': header, REFGEN: factory})
        self.assertEqual(rows(found, DECL), [('include/Enemy/Koopa.hpp', 3, 'TKoopa', 'not_ready')])
        self.assertEqual(rows(found, FILL), [(REFGEN, 2, 'TKoopa', 'not_ready')])

    def test_out_of_class_inline_definition_and_class_layout_in_a_cpp(self):
        header = ' #include <Enemy/Enemy.hpp>\n+inline void TKoopa::roar() { }\n'
        layout = ' #include <System/MarNameRefGen.hpp>\n+class TKoopa : public TBossEnemy {\n+public:\n+\tTKoopa(const char*);\n+};\n'
        found = scan_order({'include/Enemy/KoopaInline.hpp': header, REFGEN: layout})
        self.assertEqual(sorted(rows(found, DECL)), [('include/Enemy/KoopaInline.hpp', 2, 'TKoopa', 'not_ready'), (REFGEN, 2, 'TKoopa', 'not_ready')])

    def test_ready_started_shared_upstream_forward_and_tu_local_are_not_flagged(self):
        files = {
            # Only context lines touch TKiller's upstream declarations; a reflow is not an addition.
            'include/Enemy/Killer.hpp': ' class TKiller : public TFlyEnemy {\n public:\n \tTKiller(const char* name);\n-\tint unk;\n+\tint unk; \n };\n',
            'include/Enemy/TinKoopa.hpp': ' class TTinKoopa : public TSpineEnemy {\n public:\n+\tvoid extra();\n+\tTKoopa* mKoopa;\n };\n',
            # Started (bind defined) is enough to declare.
            'include/Enemy/Started.hpp': ' class TStarted {\n public:\n+\tvoid more();\n };\n',
            'include/Enemy/Fwd.hpp': ' #include <dolphin.h>\n+class TKoopa;\n+class TKillerManager;\n',
            # TU-local helper: a map-absent struct defined only in this .cpp.
            'src/Enemy/tinkoopa.cpp': ' void TTinKoopa::bind() { }\n+struct TTinKoopaLocalHelper {\n+\tint a;\n+\tvoid run();\n+};\n+void TTinKoopaLocalHelper::run() { }\n',
            # Function bodies calling foreign statics are not declarations.
            'src/MapObj/mapobjplane.cpp': ' TMapObjPlane::TMapObjPlane(const char*) { }\n+void TMapObjPlane::poke()\n+{\n+\tTKoopa::sInstance = 0;\n+}\n',
        }
        self.assertEqual(rows(scan_order(files), DECL), [])

    def test_namespace_qualified_free_functions_are_not_class_declarations(self):
        """Codex review: `void JDrama::helperFn(int) {}` defines a namespace member, not a JDrama class member.
        JDrama is a namespace at the readiness revision (src/JSystem/JDrama.cpp) and has a mangled free function."""
        files = {
            'include/JSystem/JDrama/JDRHelper.hpp': ' #include <dolphin.h>\n+inline void JDrama::helperFn(int) { }\n',
            'src/MapObj/mapobjplane.cpp': ' TMapObjPlane::TMapObjPlane(const char*) { }\n+void JDrama::GetValue(const char* name)\n+{\n+}\n',
            # Declared as a namespace only in this file.
            'src/Enemy/tinkoopa.cpp': ' void TTinKoopa::bind() { }\n+namespace Local { void f(); }\n+void Local::f() { }\n',
        }
        self.assertEqual(rows(scan_order(files), DECL), [])
        # A real class qualifier still is a declaration.
        self.assertEqual(rows(scan_order({'include/Enemy/KoopaInline.hpp': ' #include <dolphin.h>\n+inline void TKoopa::roar() { }\n'}), DECL),
                         [('include/Enemy/KoopaInline.hpp', 2, 'TKoopa', 'not_ready')])

    def test_unresolved_header_class_is_a_finding_with_its_reason(self):
        found = scan_order({'include/Enemy/Mystery.hpp': '+struct TMysteryParams {\n+\tint a;\n+};\n'})
        self.assertEqual(rows(found, DECL), [('include/Enemy/Mystery.hpp', 1, 'TMysteryParams', 'unresolved')])
        self.assertIn('not a class in the link map', found[[f['rule_id'] for f in found].index(DECL)]['detail']['reason'])

    def test_mixed_new_header_reports_each_not_ready_class(self):
        header = ('+#ifndef ENEMY_KOOPA_HPP\n+#define ENEMY_KOOPA_HPP\n+\n+class TKoopa : public TBossEnemy {\n+public:\n+\tTKoopa(const char*);\n+};\n'
                  '+class TTinKoopa {\n+\tvoid f();\n+};\n+class TKillerManager {\n+\tvoid g();\n+};\n+#endif\n')
        found = scan_order({'include/Enemy/Koopa.hpp': header})
        self.assertEqual([(line, cls) for _, line, cls, _ in rows(found, DECL)], [(4, 'TKoopa'), (11, 'TKillerManager')])
        self.assertTrue(all(f['detail']['new_header'] for f in found if f['rule_id'] == DECL))


class SkipTest(unittest.TestCase):
    def test_unbuilt_checkout_has_no_finding(self):
        killer = '+class TKillerManager : public TEnemyManager {\n+\tTKillerManager(const char* name);\n+};\n'
        found = scan_order({REFGEN: FACTORY, 'include/Enemy/Killer.hpp': ' #include <Enemy/WalkerEnemy.hpp>\n' + killer}, built=False)
        self.assertEqual([f for f in found if f['rule_id'] in (FILL, DECL)], [])

    def test_melee_is_unaffected(self):
        files = {'src/melee/ft/ftcommon.c': '+void fn_80000000(void)\n+{\n+\tTKoopa* k = new TKoopa;\n+}\n',
                 'include/melee/ft/ftcommon.h': '+class TKoopa {\n+\tvoid f();\n+};\n'}
        found = scan_order(files, game='melee')
        self.assertEqual([f['rule_id'] for f in found if f['rule_id'].startswith('sms_')], [])


if __name__ == '__main__':
    unittest.main()
