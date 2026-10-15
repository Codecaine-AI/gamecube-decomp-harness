"""signatures: ABI-exact identity between source definitions and CodeWarrior symbols."""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import signatures as sg  # noqa: E402

DOLPHIN_TYPES = """
typedef signed char s8;
typedef unsigned char u8;
typedef signed short s16;
typedef unsigned short u16;
typedef signed long s32;
typedef unsigned long u32;
typedef float f32;
typedef int BOOL;
typedef unsigned long size_t;
typedef enum _GXTexFmt { GX_TF_I4, GX_TF_I8 } GXTexFmt;
typedef struct _GXRenderModeObj { u32 viTVmode; } GXRenderModeObj;
typedef struct { f32 x, y, z; } Vec, *VecPtr;
typedef f32 Mtx[3][4];
"""


def index(*texts: str) -> sg.TypeIndex:
    return sg.TypeIndex.from_texts({f"h{k}.h": t for k, t in enumerate(texts)})


def sig(src: str, idx: sg.TypeIndex | None = None, name: str | None = None) -> sg.SourceSignature:
    sigs = sg.source_signatures(src, idx or index(DOLPHIN_TYPES), "unit.cpp")
    if name is not None:
        sigs = [s for s in sigs if s.qualified == name]
    assert len(sigs) == 1, [s.qualified for s in sigs]
    return sigs[0]


def need_demangler() -> None:
    if not sg._demangler():
        pytest.skip("m2c demangler not vendored")


# --------------------------------------------------------------------------
# Canonical types
# --------------------------------------------------------------------------


@pytest.mark.parametrize("text, expected", [
    ("int", "int"),
    ("long", "long"),
    ("long int", "long"),
    ("int long", "long"),
    ("unsigned", "unsigned int"),
    ("signed", "int"),
    ("signed int", "int"),
    ("long unsigned int", "unsigned long"),
    ("unsigned long long", "unsigned long long"),
    ("signed char", "signed char"),
    ("char", "char"),
    ("const int x", "int"),
    ("int const", "int"),
    ("const char *s", "char const *"),
    ("char const* s", "char const *"),
    ("char * const p", "char *"),
    ("const char * const * p", "char const * const *"),
    ("int a[3]", "int *"),
    ("int a[3][4]", "int [4] *"),
    ("void (*cb)(int, long)", "void (int, long) *"),
    ("const int& r = 3", "int const &"),
])
def test_canonical_builtins_cv_and_declarators(text, expected):
    assert sg.canonical_type(text) == (expected,)


def test_typedefs_resolve_only_through_the_index():
    idx = index(DOLPHIN_TYPES)
    assert sg.canonical_type("s32", index=idx) == ("long",)
    assert sg.canonical_type("BOOL", index=idx) == ("int",)
    assert sg.canonical_type("const u8 *", index=idx) == ("unsigned char const *",)
    assert sg.canonical_type("Mtx m", index=idx) == ("float [4] *",)
    assert sg.canonical_type("GXTexFmt", index=idx) == ("_GXTexFmt",)
    assert sg.canonical_type("const GXRenderModeObj*", index=idx) == ("_GXRenderModeObj const *",)
    assert sg.canonical_type("VecPtr", index=idx) == ("Vec *",)
    # no hard-coded table: without the repo typedef, s32 stays an unknown name
    assert sg.canonical_type("s32") == ("s32",)


def test_unknown_names_list_every_candidate_scope():
    assert sg.canonical_type("TX *", scope="A::B") == ("A::B::TX *", "A::TX *", "TX *")
    assert sg.canonical_type("TRect &", usings=("JDrama",)) == ("JDrama::TRect &", "TRect &")


# --------------------------------------------------------------------------
# Demangled side
# --------------------------------------------------------------------------


@pytest.mark.parametrize("mangled, expected", [
    ("__ct__Q27JGadget20TVector_pointer_voidFRCQ27JGadget14TAllocator<Pv>",
     ("JGadget::TVector_pointer_void::TVector_pointer_void", ("JGadget::TAllocator<void *> const &",))),
    ("__ct__10JUTConsoleFUiUib", ("JUTConsole::JUTConsole", ("unsigned int", "unsigned int", "bool"))),
    ("__ct__Q26JDrama9TViewportFRCQ26JDrama5TRectPCc",
     ("JDrama::TViewport::TViewport", ("JDrama::TRect const &", "char const *"))),
    ("__ct__10JUTTextureFii9_GXTexFmt", ("JUTTexture::JUTTexture", ("int", "int", "_GXTexFmt"))),
    ("emitEffect__21TMareEventDepressWallFi", ("TMareEventDepressWall::emitEffect", ("int",))),
    ("__dt__10JUTConsoleFv", ("JUTConsole::~JUTConsole", ())),
    ("__eq__1XCFRC1X", ("X::operator==", ("X const &",))),
    ("f__FUcScUsUlxUx", ("f", ("unsigned char", "signed char", "unsigned short", "unsigned long", "long long",
                              "unsigned long long"))),
    ("f__FPA4_f", ("f", ("float [4] *",))),
    ("f__FPFi_v", ("f", ("void (int) *",))),
])
def test_demangled_signature(mangled, expected):
    need_demangler()
    assert sg.demangled_signature(mangled) == expected


def test_demangled_signature_unparsable_is_none():
    need_demangler()
    assert sg.demangled_signature("OSReport") is None
    assert sg.demangled_is_const("get__3FooCFv") is True
    assert sg.demangled_is_const("get__3FooFv") is False


# --------------------------------------------------------------------------
# Matching
# --------------------------------------------------------------------------


def test_int_and_long_are_distinct():
    need_demangler()
    s = sig("void f(int a) { }")
    assert sg.matches(s, "f__Fi") is True
    assert sg.matches(s, "f__Fl") is False


def test_s32_resolves_to_long_through_the_index_typedef():
    need_demangler()
    s = sig("void f(s32 a, u32 b) { }")
    assert s.params == (("long",), ("unsigned long",))
    assert sg.matches(s, "f__FlUl") is True
    assert sg.matches(s, "f__FiUi") is False


def test_unsigned_alone_is_unsigned_int():
    need_demangler()
    s = sig("void f(unsigned a) { }")
    assert sg.matches(s, "f__FUi") is True
    assert sg.matches(s, "f__FUl") is False


def test_pointee_const_kept_top_level_const_dropped():
    need_demangler()
    s = sig("void f(const char* s, const int n) { }")
    assert sg.matches(s, "f__FPCci") is True
    assert sg.matches(s, "f__FPci") is False


def test_namespaced_types_never_cross_namespaces():
    need_demangler()
    idx = index("namespace A { struct TX; } namespace B { struct TX; }")
    s = sig("namespace A { void f(TX* p) { } }", idx)
    assert s.qualified == "A::f"
    assert sg.matches(s, "f__1AFPQ21A2TX") is True
    assert sg.matches(s, "f__1AFPQ21B2TX") is False


def test_unknown_name_matches_only_an_equal_spelling():
    need_demangler()
    s = sig("namespace A { void f(TX* p) { } }", sg.TypeIndex.from_texts({}))
    assert s.params == (("A::TX *", "TX *"),)
    assert sg.matches(s, "f__1AFPQ21A2TX") is True
    assert sg.matches(s, "f__1AFP2TX") is True
    # TX is declared nowhere: it may be `typedef B::TX TX;` in a header we cannot see -> undecidable, never True
    assert sg.matches(s, "f__1AFPQ21B2TX") is None
    # with A::TX declared, A::TX* vs B::TX* is a provable mismatch
    known = sig("namespace A { void f(TX* p) { } }", sg.TypeIndex.from_texts({"a.h": "namespace A { class TX {}; }\n"}))
    assert sg.matches(known, "f__1AFPQ21B2TX") is False and sg.matches(known, "f__1AFPQ21A2TX") is True


def test_template_arguments_are_part_of_the_type():
    need_demangler()
    idx = index("template <class T> class Box { };")
    s = sig("void f(Box<int>* b) { }", idx)
    assert s.params == (("Box<int> *",),)
    assert sg.matches(s, "f__FP6Box<i>") is True
    assert sg.matches(s, "f__FP6Box<f>") is False


def test_default_template_arguments_are_spelled_out():
    need_demangler()
    idx = index("namespace J { class TObj; template <class T, class U = TObj> class TList : public U { }; }")
    s = sig("namespace J { void f(TList<TObj>* l) { } }", idx)
    assert s.params == (("J::TList<J::TObj, J::TObj> *",),)


def test_using_namespace_makes_unqualified_names_match():
    need_demangler()
    known = index("namespace JDrama { struct TRect { }; class TViewport { TViewport(const TRect&, const char*); }; }")
    src = "using namespace JDrama;\nTViewport::TViewport(const TRect& r, const char* name) { }\n"
    mangled = "__ct__Q26JDrama9TViewportFRCQ26JDrama5TRectPCc"
    s = sig(src, known)
    assert s.qualified == "JDrama::TViewport::TViewport"
    assert sg.matches(s, mangled) is True
    # even without the header, TRect may be JDrama::TRect
    assert sg.matches(sig("using namespace JDrama;\nvoid g(const TRect& r) { }", sg.TypeIndex.from_texts({})),
                      "g__FRCQ26JDrama5TRect") is True


def test_class_member_typedef_resolves_in_class_scope():
    need_demangler()
    idx = index("""
namespace JGadget {
template <typename T> class TAllocator { };
template <typename T, typename A = TAllocator<T> > class TVector { typedef T value_type; };
class TVector_pointer_void : public TVector<void*> {
    typedef void* value_type;
    TVector_pointer_void(const TAllocator<value_type>& = TAllocator<value_type>());
};
}""")
    src = "using namespace JGadget;\n" \
          "TVector_pointer_void::TVector_pointer_void(const TAllocator<value_type>& alloc) { }\n"
    s = sig(src, idx)
    assert s.params == (("JGadget::TAllocator<void *> const &",),)
    assert sg.matches(s, "__ct__Q27JGadget20TVector_pointer_voidFRCQ27JGadget14TAllocator<Pv>") is True


def test_typedefd_enum_resolves_to_its_tag():
    need_demangler()
    s = sig("JUTTexture::JUTTexture(int w, int h, GXTexFmt fmt) { }")
    assert s.params == (("int",), ("int",), ("_GXTexFmt",))
    assert sg.matches(s, "__ct__10JUTTextureFii9_GXTexFmt") is True
    assert sg.matches(s, "__ct__10JUTTextureFiii") is False


def test_template_parameters_are_undecidable():
    need_demangler()
    s = sig("template <class T> void f(T x) { }")
    assert s.templated and s.params == (None,)
    assert sg.matches(s, "f<i>__Fi") is None
    assert sg.matches(s, "f<i>__Fii") is False  # parameter count still decides
    assert sg.matches(s, "g__Fi") is False


def test_dependent_base_member_is_undecidable():
    need_demangler()
    idx = index("template <class T> struct Base { typedef T type; };\n"
                "struct D : Base<int> { void f(type x); };")
    s = sig("void D::f(type x) { }", idx)
    assert s.params == (None,)
    assert sg.matches(s, "f__1DFi") is None


def test_conflicting_typedefs_never_give_true():
    need_demangler()
    idx = sg.TypeIndex.from_texts({"a.h": "typedef int s32;", "b.h": "typedef long s32;"})
    s = sig("void f(s32 x) { }", idx)
    assert set(s.params[0]) == {"int", "long"}
    assert sg.matches(s, "f__Fl") is None
    assert sg.matches(s, "f__Ff") is False


def test_unparsable_parameters_are_none():
    need_demangler()
    s = sig("void f(int C::*member) { }")
    assert s.params is None
    assert sg.matches(s, "f__FM1CFi") is None  # demangler cannot parse it either
    assert sg.matches(s, "f__Fi") is None
    assert sg.matches(s, "g__Fi") is False


def test_nested_namespaces_and_qualified_definitions():
    need_demangler()
    idx = index("namespace A { namespace B { class C { void f(int); void g(int); }; } }")
    src = "namespace A { namespace B {\nvoid C::f(int x) { }\n} }\nvoid A::B::C::g(int x) { }\n"
    sigs = {s.qualified: s for s in sg.source_signatures(src, idx, "unit.cpp")}
    assert set(sigs) == {"A::B::C::f", "A::B::C::g"}
    assert sg.matches(sigs["A::B::C::f"], "f__Q31A1B1CFi") is True
    assert sg.matches(sigs["A::B::C::g"], "g__Q31A1B1CFi") is True
    assert sg.matches(sigs["A::B::C::f"], "f__Q21B1CFi") is False


def test_in_class_definitions():
    need_demangler()
    src = "namespace N {\nclass K {\npublic:\n  void g(long v) { }\n  int h() const { return 0; }\n};\n}\n"
    sigs = {s.qualified: s for s in sg.source_signatures(src, index(), "unit.cpp")}
    assert sg.matches(sigs["N::K::g"], "g__Q21N1KFl") is True
    assert sigs["N::K::g"].line == 4
    assert sg.matches(sigs["N::K::h"], "h__Q21N1KCFv") is True
    assert sg.matches(sigs["N::K::h"], "h__Q21N1KFv") is False  # const overloads are distinct symbols


def test_operators_destructors_and_void():
    need_demangler()
    src = """
struct X { bool operator==(const X& o) const; ~X(); void* operator new(size_t n); operator bool() const; };
bool X::operator==(const X& o) const { return true; }
X::~X() { }
void* X::operator new(size_t n) { return 0; }
X::operator bool() const { return true; }
void f(void) { }
"""
    sigs = {s.qualified: s for s in sg.source_signatures(src, index(DOLPHIN_TYPES), "unit.cpp")}
    assert sg.matches(sigs["X::operator=="], "__eq__1XCFRC1X") is True
    assert sg.matches(sigs["X::~X"], "__dt__1XFv") is True
    assert sg.matches(sigs["X::operator new"], "__nw__1XFUl") is True
    assert sg.matches(sigs["X::operator bool"], "__opb__1XCFv") is True
    assert sigs["f"].params == ()
    assert sg.matches(sigs["f"], "f__Fv") is True
    assert sg.matches(sigs["f"], "f__Fi") is False


def test_anonymous_namespace_and_c_linkage():
    need_demangler()
    idx = index("namespace JDrama { struct TRect { }; }")
    src = "namespace {\nvoid fill(const JDrama::TRect& r) { }\n}\n" \
          "extern \"C\" {\nvoid OSReport(const char* fmt, ...) { }\n}\n"
    sigs = {s.qualified: s for s in sg.source_signatures(src, idx, "unit.cpp")}
    assert sg.matches(sigs["@unnamed@::fill"], "fill__9@unnamed@FRCQ26JDrama5TRect") is True
    assert sigs["OSReport"].c_linkage
    assert sg.matches(sigs["OSReport"], "OSReport") is True
    assert sg.matches(sigs["OSReport"], "OSPanic") is False
    assert sg.matches(sigs["OSReport"], "OSReport__FPCce") is False


def test_comments_strings_and_offsets():
    src = '// void f(int) { }\nconst char* s = "{ void g() { }";\n/* { */ void h(int x) { /* } */ }\n'
    s = sig(src)
    assert s.qualified == "h"
    assert src[s.open] == "{" and src[s.close] == "}" and s.line == 3
    assert src[s.start:].startswith("void h")


def test_with_texts_overlays_changed_files():
    base = sg.TypeIndex.from_texts({"t.h": "typedef int s32;"})
    over = base.with_texts({"t.h": "typedef long s32;"})
    assert sg.canonical_type("s32", index=base) == ("int",)
    assert sg.canonical_type("s32", index=over) == ("long",)
    assert sg.canonical_type("s32", index=base.with_texts({"u.h": "struct Other;"})) == ("int",)


# --------------------------------------------------------------------------
# git-backed index
# --------------------------------------------------------------------------


def git(repo: Path, *args: str) -> str:
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True).stdout


def test_from_git_reads_one_revision_and_caches(tmp_path, monkeypatch):
    repo = tmp_path / "repo"
    (repo / "include").mkdir(parents=True)
    git(tmp_path, "init", "-q", str(repo))
    (repo / "include" / "types.h").write_text("typedef signed long s32;\n")
    (repo / "notes.txt").write_text("typedef int s32;\n")
    git(repo, "add", "-A")
    git(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "one")
    (repo / "include" / "types.h").write_text("typedef int s32;\n")  # uncommitted: not at HEAD
    cache = tmp_path / "cache"
    sg._MEMO.clear()
    idx = sg.TypeIndex.from_git(repo, "HEAD", cache_dir=cache)
    assert sg.canonical_type("s32", index=idx) == ("long",)
    assert list(cache.glob("typeindex-*.json"))
    sg._MEMO.clear()
    monkeypatch.setattr(sg, "_git_texts", lambda *a, **k: pytest.fail("cache miss"))
    again = sg.TypeIndex.from_git(repo, "HEAD", cache_dir=cache)
    assert sg.canonical_type("s32", index=again) == ("long",)
    assert sg.TypeIndex.from_git(repo, "HEAD", cache_dir=cache) is again  # in-process memo


SMS_REPO = Path("/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/sb-up84")
SMS_REV = "84bca82f"
SMS_CTORS = [
    ("libs/JSystem/src/JGadget/std-vector.cpp", "__ct__Q27JGadget20TVector_pointer_voidFRCQ27JGadget14TAllocator<Pv>"),
    ("libs/JSystem/src/JUtility/JUTConsole.cpp", "__ct__10JUTConsoleFUiUib"),
    ("libs/JSystem/src/JDrama/JDRViewport.cpp", "__ct__Q26JDrama9TViewportFRCQ26JDrama5TRectPCc"),
    ("libs/JSystem/src/JUtility/JUTTexture.cpp", "__ct__10JUTTextureFii9_GXTexFmt"),
    ("libs/JSystem/src/JKernel/JKRHeap.cpp", "__ct__7JKRHeapFPvUlP7JKRHeapb"),
    ("src/NPC/NpcBase.cpp", "__ct__8TBaseNPCFUlPCc"),
]


def _sms_available() -> bool:
    if not (SMS_REPO / ".git").exists():
        return False
    return subprocess.run(["git", "-C", str(SMS_REPO), "cat-file", "-e", f"{SMS_REV}^{{commit}}"],
                          capture_output=True).returncode == 0


@pytest.mark.skipif(not _sms_available(), reason="SMS checkout at 84bca82f not present")
def test_real_sms_constructors_match(tmp_path):
    need_demangler()
    sg._MEMO.clear()
    t0 = time.perf_counter()
    idx = sg.TypeIndex.from_git(SMS_REPO, SMS_REV, cache_dir=tmp_path)
    cold = time.perf_counter() - t0
    sg._MEMO.clear()
    t0 = time.perf_counter()
    idx = sg.TypeIndex.from_git(SMS_REPO, SMS_REV, cache_dir=tmp_path)
    warm = time.perf_counter() - t0
    print(f"from_git cold {cold:.2f}s warm {warm:.3f}s")
    assert cold < 5 and warm < 0.5
    for path, mangled in SMS_CTORS:
        text = git(SMS_REPO, "show", f"{SMS_REV}:{path}")
        qual = sg.demangled_signature(mangled)[0]
        found = [s for s in sg.source_signatures(text, idx, path) if s.qualified == qual]
        assert found, (path, qual)
        assert any(sg.matches(s, mangled) is True for s in found), (path, [(s.params, s.line) for s in found])


def test_unknown_type_names_are_undecidable_not_different():
    # a name declared nowhere in the index may be a typedef of anything: never a provable mismatch
    TypeIndex, source_signatures, matches = sg.TypeIndex, sg.source_signatures, sg.matches
    need_demangler()
    idx = TypeIndex.from_texts({})
    [g] = source_signatures("void T::f(MyInt a) { use(a); }\n", idx)
    assert g.sure == ("unknown",)
    assert matches(g, "f__1TFi") is None  # MyInt may be `typedef int MyInt`
    assert matches(g, "f__1TF5MyInt") is True  # spelled exactly like the mangled class: that class
    assert matches(g, "f__1TFif") is False  # a different parameter count is still provable
    [h] = source_signatures("void T::f(const Box<Unknown>* b) { }\n", TypeIndex.from_texts({"b.h": "template <class X> class Box {};\n"}))
    assert matches(h, "f__1TFPC8Box<i>") is None
    # once the index declares the name, the comparison is exact again
    known = TypeIndex.from_texts({"t.h": "typedef int MyInt;\n"})
    [k] = source_signatures("void T::f(MyInt a) { }\n", known)
    assert matches(k, "f__1TFi") is True and matches(k, "f__1TFl") is False
