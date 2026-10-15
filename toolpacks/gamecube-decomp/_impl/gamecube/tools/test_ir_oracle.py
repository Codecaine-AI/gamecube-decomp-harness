"""Tests for ir_oracle.py: canonical IR fingerprints.

Hand-written IR snippets pin each invariance (a steering-shaped difference
must not change the fingerprint) and each sensitivity (a behaviour change
must). The integration tests compile a real SMS unit and need clang plus a
checkout (IR_ORACLE_SMS_REPO, default the sb-up7f sandbox); they never write
into that checkout.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ir_oracle as o  # noqa: E402

HEADER = """
target datalayout = "E-m:e-p:32:32-Fn32-i64:64-n32"
target triple = "powerpc-unknown-unknown-eabi"
%struct.S = type { i32, i16, i16, ptr }
@g = dso_local global i32 0, align 4
@h = dso_local global i32 0, align 4
@.str = private unnamed_addr constant [4 x i8] c"abc\\00", align 1
declare void @f(ptr)
declare void @k(i32)
declare i32 @r()
"""


def fp(body: str, name: str = "t", header: str = HEADER) -> str:
    return o.fingerprint(o.parse_ir(header + body))[name]


def same(a: str, b: str, name: str = "t") -> bool:
    return fp(a, name) == fp(b, name)


# --------------------------------------------------------------------------
# invariances
# --------------------------------------------------------------------------


def test_value_renaming_and_metadata_ignored():
    a = """
define dso_local i32 @t(ptr noundef %0) #0 {
  %2 = getelementptr inbounds nuw i8, ptr %0, i32 4
  %3 = load i32, ptr %2, align 4, !tbaa !5
  ret i32 %3
}"""
    b = """
define i32 @t(ptr %p) {
entry:
  %q = getelementptr inbounds i8, ptr %p, i32 4
  %v = load i32, ptr %q, align 2
  ret i32 %v
}"""
    assert same(a, b)


def test_independent_load_reorder():
    a = """
define i32 @t(ptr %0) {
  %2 = load i32, ptr @g
  %3 = load i32, ptr %0
  %4 = sub i32 %2, %3
  ret i32 %4
}"""
    b = """
define i32 @t(ptr %0) {
  %2 = load i32, ptr %0
  %3 = load i32, ptr @g
  %4 = sub i32 %3, %2
  ret i32 %4
}"""
    assert same(a, b)


def test_commutative_operand_order():
    a = """
define float @t(float %0, float %1) {
  %3 = fmul float %0, %1
  %4 = fadd float %3, 1.0
  ret float %4
}"""
    b = """
define float @t(float %0, float %1) {
  %3 = fmul float %1, %0
  %4 = fadd float 1.0, %3
  ret float %4
}"""
    assert same(a, b)


@pytest.mark.parametrize(
    "x,y",
    [
        ("icmp slt i32 %0, %1", "icmp sgt i32 %1, %0"),
        ("icmp ule i32 %0, %1", "icmp uge i32 %1, %0"),
        ("fcmp olt float %2, %3", "fcmp ogt float %3, %2"),
        ("icmp eq i32 %0, %1", "icmp eq i32 %1, %0"),
    ],
)
def test_compare_predicate_swap(x, y):
    tmpl = """
define i1 @t(i32 %0, i32 %1, float %2, float %3) {{
  %5 = {}
  ret i1 %5
}}"""
    assert same(tmpl.format(x), tmpl.format(y))


def test_branch_on_inverted_compare():
    a = """
define void @t(float %0, float %1) {
  %3 = fcmp olt float %0, %1
  br i1 %3, label %4, label %5
4:
  call void @k(i32 1)
  br label %5
5:
  ret void
}"""
    b = """
define void @t(float %0, float %1) {
  %3 = fcmp uge float %0, %1
  br i1 %3, label %5, label %4
4:
  call void @k(i32 1)
  br label %5
5:
  ret void
}"""
    assert same(a, b)


def test_block_order_permutation():
    a = """
define void @t(i1 %0) {
  br i1 %0, label %2, label %3
2:
  call void @k(i32 1)
  br label %4
3:
  call void @k(i32 2)
  br label %4
4:
  ret void
}"""
    b = """
define void @t(i1 %0) {
  br i1 %0, label %2, label %3
4:
  ret void
3:
  call void @k(i32 2)
  br label %4
2:
  call void @k(i32 1)
  br label %4
}"""
    assert same(a, b)


def test_phi_incoming_order():
    a = """
define i32 @t(i1 %0) {
  br i1 %0, label %2, label %3
2:
  br label %3
3:
  %4 = phi i32 [ 1, %1 ], [ 2, %2 ]
  ret i32 %4
}"""
    b = a.replace("[ 1, %1 ], [ 2, %2 ]", "[ 2, %2 ], [ 1, %1 ]")
    assert same(a, b)


def test_loop_phi_does_not_recurse_and_is_stable():
    a = """
define i32 @t(i32 %0) {
  br label %2
2:
  %3 = phi i32 [ 0, %1 ], [ %4, %2 ]
  %4 = add i32 %3, 1
  %5 = icmp eq i32 %4, %0
  br i1 %5, label %6, label %2
6:
  ret i32 %4
}"""
    b = a.replace("%4 = add i32 %3, 1", "%4 = add i32 1, %3")
    assert same(a, b)


def test_cold_split_naming():
    body = """
define void @t() {{
  call void @t.cold.{n}()
  ret void
}}
define internal void @t.cold.{n}() {{
  call void @k(i32 7)
  ret void
}}
define internal void @t.cold.{m}() {{
  call void @k(i32 9)
  ret void
}}"""
    a = body.format(n=1, m=2)
    b = body.format(n=2, m=1)
    fa, fb = o.fingerprint(o.parse_ir(HEADER + a)), o.fingerprint(o.parse_ir(HEADER + b))
    assert fa["t"] == fb["t"]
    assert not any(".cold." in k for k in fa)


def test_private_string_named_by_content():
    a = """
define ptr @t() {
  ret ptr @.str
}"""
    b = HEADER.replace("@.str =", "@.str.7 =") + a.replace("@.str", "@.str.7")
    assert fp(a) == o.fingerprint(o.parse_ir(b))["t"]


def test_struct_gep_equals_byte_gep():
    a = """
define i16 @t(ptr %0) {
  %2 = getelementptr inbounds %struct.S, ptr %0, i32 0, i32 2
  %3 = load i16, ptr %2
  ret i16 %3
}"""
    b = """
define i16 @t(ptr %0) {
  %2 = getelementptr inbounds nuw i8, ptr %0, i32 6
  %3 = load i16, ptr %2
  ret i16 %3
}"""
    assert same(a, b)


def test_gep_chain_folds():
    a = """
define i32 @t(ptr %0) {
  %2 = getelementptr i8, ptr %0, i32 4
  %3 = getelementptr i8, ptr %2, i32 8
  %4 = load i32, ptr %3
  ret i32 %4
}"""
    b = """
define i32 @t(ptr %0) {
  %2 = getelementptr i8, ptr %0, i32 12
  %3 = load i32, ptr %2
  ret i32 %3
}"""
    assert same(a, b)


def test_disjoint_store_reorder():
    a = """
define void @t(ptr %0) {
  %2 = getelementptr i8, ptr %0, i32 4
  store i32 1, ptr %0
  store i32 2, ptr %2
  ret void
}"""
    b = """
define void @t(ptr %0) {
  %2 = getelementptr i8, ptr %0, i32 4
  store i32 2, ptr %2
  store i32 1, ptr %0
  ret void
}"""
    assert same(a, b)


def test_load_hoisted_across_pure_blocks():
    a = """
define void @t(ptr %0, i1 %1) {
  %3 = load i32, ptr %0
  br i1 %1, label %4, label %5
4:
  br label %5
5:
  call void @k(i32 %3)
  ret void
}"""
    b = """
define void @t(ptr %0, i1 %1) {
  br i1 %1, label %3, label %4
3:
  br label %4
4:
  %5 = load i32, ptr %0
  call void @k(i32 %5)
  ret void
}"""
    assert same(a, b)


def test_non_semantic_attributes_ignored():
    a = """
define dso_local noundef range(i32 0, 2) i32 @t(ptr noundef nonnull align 4 captures(none) dereferenceable(8) %0) local_unnamed_addr #1 {
  %2 = load i32, ptr %0, align 4, !tbaa !3
  %3 = add i32 %2, 1
  tail call void @f(ptr noundef nonnull %0) #4
  ret i32 %3
}
attributes #1 = { mustprogress nounwind willreturn memory(read) "frame-pointer"="none" }
attributes #4 = { nounwind }"""
    b = """
define i32 @t(ptr %0) {
  %2 = load i32, ptr %0
  %3 = add i32 %2, 1
  call void @f(ptr %0)
  ret i32 %3
}"""
    assert same(a, b)


FLAG_BASE = """
define i32 @t(i32 %0, float %1) {
  %3 = add i32 %0, 1
  %4 = fadd float %1, 1.0
  %5 = fptosi float %4 to i32
  %6 = mul i32 %3, %5
  call void @k(i32 %6)
  ret i32 %6
}"""


@pytest.mark.parametrize("old,new", [
    ("add i32 %0, 1", "add nsw i32 %0, 1"),
    ("add i32 %0, 1", "add nuw i32 %0, 1"),
    ("mul i32 %3, %5", "mul nsw nuw i32 %3, %5"),
    ("fadd float %1, 1.0", "fadd fast float %1, 1.0"),
    ("fadd float %1, 1.0", "fadd nnan float %1, 1.0"),
    ("call void @k(i32 %6)", "call fastcc void @k(i32 %6)"),
    ("call void @k(i32 %6)", "call void @k(i32 signext %6)"),
])
def test_semantic_flags_matter(old, new):
    assert old in FLAG_BASE
    assert not same(FLAG_BASE, FLAG_BASE.replace(old, new))


def test_exact_and_cmp_flags_matter():
    a = """
define i1 @t(i32 %0, float %1) {
  %3 = sdiv i32 %0, 4
  %4 = icmp slt i32 %3, 7
  ret i1 %4
}"""
    assert not same(a, a.replace("sdiv i32", "sdiv exact i32"))
    b = """
define i1 @t(float %0) {
  %2 = fcmp olt float %0, 1.0
  ret i1 %2
}"""
    assert not same(b, b.replace("fcmp olt", "fcmp fast olt"))


def test_call_site_noreturn_group_and_definition_cc_matter():
    a = """
define void @t() {
  call void @k(i32 1) #2
  ret void
}
attributes #2 = { nounwind }"""
    b = a.replace("attributes #2 = { nounwind }", "attributes #2 = { noreturn nounwind }")
    assert not same(a, b)
    c = a.replace("define void @t()", "define internal fastcc void @t()")
    assert not same(a, c)
    # memory/unwind summaries the optimizer infers are not semantic flags
    d = a.replace("attributes #2 = { nounwind }", "attributes #2 = { nounwind memory(none) willreturn }")
    assert same(a, d)


def test_lifetime_and_assume_ignored():
    a = """
define void @t(ptr %0) {
  %2 = alloca i32
  call void @llvm.lifetime.start.p0(i64 4, ptr %2)
  call void @f(ptr %2)
  call void @llvm.lifetime.end.p0(i64 4, ptr %2)
  ret void
}"""
    b = """
define void @t(ptr %0) {
  %2 = alloca i32
  call void @f(ptr %2)
  ret void
}"""
    assert same(a, b)


def test_switch_case_order():
    a = """
define void @t(i32 %0) {
  switch i32 %0, label %4 [
    i32 1, label %2
    i32 5, label %3
  ]
2:
  call void @k(i32 1)
  br label %4
3:
  call void @k(i32 5)
  br label %4
4:
  ret void
}"""
    b = a.replace("    i32 1, label %2\n    i32 5, label %3", "    i32 5, label %3\n    i32 1, label %2")
    assert same(a, b)


# --------------------------------------------------------------------------
# sensitivities
# --------------------------------------------------------------------------

LOAD_FIELD = """
define i32 @t(ptr %0) {
  %2 = getelementptr inbounds i8, ptr %0, i32 OFF
  %3 = load TY, ptr %2
  %4 = EXT
  ret i32 %4
}"""


def _field(off="4", ty="i32", ext="add i32 %3, 0"):
    return LOAD_FIELD.replace("OFF", off).replace("TY", ty).replace("EXT", ext)


def test_different_gep_offset():
    assert not same(_field("4"), _field("8"))


def test_load_width():
    assert not same(_field(ty="i32"), _field(ty="i16", ext="sext i16 %3 to i32"))


def test_different_constant():
    assert not same(_field(ext="add i32 %3, 1"), _field(ext="add i32 %3, 2"))


def test_non_commutative_operand_order():
    assert not same(_field(ext="sub i32 %3, 1"), _field(ext="sub i32 1, %3"))


def test_different_callee():
    a = """
define void @t() {
  call void @k(i32 1)
  ret void
}"""
    assert not same(a, a.replace("@k(", "@k2("))


def test_call_order():
    a = """
define void @t() {
  call void @k(i32 1)
  call void @k(i32 2)
  ret void
}"""
    b = """
define void @t() {
  call void @k(i32 2)
  call void @k(i32 1)
  ret void
}"""
    assert not same(a, b)


def test_store_reorder_across_call():
    a = """
define void @t(ptr %0) {
  store i32 1, ptr %0
  call void @k(i32 0)
  ret void
}"""
    b = """
define void @t(ptr %0) {
  call void @k(i32 0)
  store i32 1, ptr %0
  ret void
}"""
    assert not same(a, b)


def test_load_moved_across_call():
    a = """
define i32 @t() {
  %1 = load i32, ptr @g
  call void @k(i32 0)
  ret i32 %1
}"""
    b = """
define i32 @t() {
  call void @k(i32 0)
  %1 = load i32, ptr @g
  ret i32 %1
}"""
    assert not same(a, b)


def test_aliasing_store_order():
    a = """
define void @t(ptr %0, ptr %1) {
  store i32 1, ptr %0
  store i32 2, ptr %1
  ret void
}"""
    b = """
define void @t(ptr %0, ptr %1) {
  store i32 2, ptr %1
  store i32 1, ptr %0
  ret void
}"""
    assert not same(a, b)


def test_branch_targets_swapped():
    a = """
define void @t(i1 %0) {
  br i1 %0, label %2, label %3
2:
  call void @k(i32 1)
  ret void
3:
  call void @k(i32 2)
  ret void
}"""
    b = a.replace("label %2, label %3", "label %3, label %2")
    assert not same(a, b)


def test_extra_function_and_global_initializer():
    base = """
define void @t() {
  ret void
}"""
    fa = o.fingerprint(o.parse_ir(HEADER + base))
    fb = o.fingerprint(o.parse_ir(HEADER + base + "\ndefine void @u() {\n  ret void\n}"))
    assert set(fb) - set(fa) == {"u"}
    fc = o.fingerprint(o.parse_ir(HEADER.replace("@g = dso_local global i32 0", "@g = dso_local global i32 5") + base))
    assert fc["g"] != fa["g"] and fc["t"] == fa["t"]
    fd = o.fingerprint(o.parse_ir(HEADER.replace("@g = dso_local global", "@g = dso_local constant") + base))
    assert fd["g"] != fa["g"]
    fe = o.fingerprint(o.parse_ir(HEADER.replace("@g = dso_local global i32 0, align 4", '@g = dso_local global i32 0, section ".sdata", align 4') + base))
    assert fe["g"] != fa["g"]


def test_private_string_content_matters():
    a = """
define ptr @t() {
  ret ptr @.str
}"""
    b = HEADER.replace('c"abc\\00"', 'c"abd\\00"') + a
    assert fp(a) != o.fingerprint(o.parse_ir(b))["t"]


def test_compare_fps_rows():
    assert o.compare_fps({"a": "1", "b": "2"}, {"a": "1", "b": "3", "c": "4"}) == {
        "a": "SAME", "b": "DIFF", "c": "ONLY_B"}


# --------------------------------------------------------------------------
# compile flags (no clang needed)
# --------------------------------------------------------------------------


def _fake_repo(tmp_path: Path, src: str, lang: list[str]) -> Path:
    import json

    (tmp_path / "src").mkdir()
    (tmp_path / src).write_text("int x;\n")
    entry = {
        "directory": str(tmp_path),
        "file": str(tmp_path / src),
        "arguments": ["clang", "-Iinclude", *lang, "-c", str(tmp_path / src), "-o", "build/x.o"],
    }
    (tmp_path / "compile_commands.json").write_text(json.dumps([entry]))
    return tmp_path


def test_oracle_argv_c_unit(tmp_path):
    repo = _fake_repo(tmp_path, "src/a.c", ["--language=c++", "--std=c++98"])
    argv = o.oracle_argv(repo, "src/a.c", clang="clang")
    assert "--language=c++" not in argv and "--std=c++98" not in argv
    assert argv[argv.index("-x") + 1] == "c" and "-std=gnu99" in argv
    assert "-c" not in argv and "build/x.o" not in argv
    assert argv[-1] == "src/a.c" and str(o.PRELUDE) in argv
    assert argv[argv.index("-o") + 1] == "-"


def test_oracle_argv_cpp_unit(tmp_path):
    repo = _fake_repo(tmp_path, "src/a.cpp", ["--language=c++", "--std=c++98"])
    argv = o.oracle_argv(repo, "src/a.cpp", clang="clang")
    assert "--language=c++" in argv and "--std=c++98" in argv and "-O2" in argv


# --------------------------------------------------------------------------
# integration: real SMS unit
# --------------------------------------------------------------------------

SMS_REPO = Path(
    os.environ.get(
        "IR_ORACLE_SMS_REPO",
        "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/games/sms/workspace/sb-up7f",
    )
)
needs_sms = pytest.mark.skipif(
    o.find_clang() is None or not (SMS_REPO / "compile_commands.json").exists(),
    reason="needs clang and an SMS checkout (IR_ORACLE_SMS_REPO)",
)
HANA = "src/Enemy/hanasambo.cpp"
HIDE = "_ZNK19TNerveHanaSamboHide7executeEP10TSpineBaseI10TLiveActorE"


@needs_sms
def test_sms_hanasambo_steering_and_mutation():
    text = (SMS_REPO / HANA).read_text()
    ok, base, errors = o.unit_fingerprint(SMS_REPO, HANA)
    assert ok, errors
    assert HIDE in base and "_ZN10TSamboHead13mBodyJntIndexE" in base
    # same text through the override path: identical (VFS keeps __FILE__)
    ok, again, _ = o.unit_fingerprint(SMS_REPO, HANA, text)
    assert ok and again == base
    # steering: a `*=` temp (PR 03 shape) keeps the fingerprint
    old = "self->unk198->mSLAppearDist.get()\n\t          * self->unk198->mSLAppearDist.get()"
    assert old in text
    steer = text.replace(
        "if (self->getDistToMarioSquared()\n\t    < " + old + ")",
        "f32 d = self->unk198->mSLAppearDist.get();\n\td *= self->unk198->mSLAppearDist.get();\n"
        "\tif (self->getDistToMarioSquared() < d)",
    )
    assert steer != text
    ok, fs, errors = o.unit_fingerprint(SMS_REPO, HANA, steer)
    assert ok, errors
    assert o.compare_fps(base, fs)[HIDE] == "SAME"
    # real: compare the other way round
    real = steer.replace("getDistToMarioSquared() < d", "getDistToMarioSquared() > d")
    ok, fr, _ = o.unit_fingerprint(SMS_REPO, HANA, real)
    assert ok and o.compare_fps(base, fr)[HIDE] == "DIFF"


@needs_sms
@pytest.mark.parametrize("unit", ["src/GC2D/hx_wiper.c", "src/Map/BathWaterManager.cpp"])
def test_sms_known_clang_failures_compile(unit):
    res = o.compile_ir(SMS_REPO, unit)
    assert res.ok, res.errors
    if unit.endswith("BathWaterManager.cpp"):
        assert res.patched_headers == ["include/Camera/cameralib.hpp"]


# --------------------------------------------------------------------------
# public compile helpers
# --------------------------------------------------------------------------


def test_flags_template_fallback(tmp_path, monkeypatch):
    monkeypatch.delenv("ORCH_IR_ORACLE_FLAGS", raising=False)
    repo = tmp_path / "repo"
    (repo / "config/GMSJ01").mkdir(parents=True)
    (repo / "config/GMSJ01/splits.txt").write_text("")
    (repo / "configure.py").write_text("")
    (repo / "src").mkdir()
    (repo / "src/new_unit.cpp").write_text("int f() { return 1; }\n")
    entry = o.template_entry(repo, "src/new_unit.cpp")
    assert entry and entry["template"] == "sms"
    argv = o.oracle_argv(repo, "src/new_unit.cpp", clang="clang")
    assert "--target=powerpc-eabi" in argv and "--language=c++" in argv and argv[-1] == "src/new_unit.cpp"
    assert not any("{repo}" in a or "{source}" in a for a in argv)
    c_argv = o.oracle_argv(repo, "src/x.c", clang="clang")  # default variant by suffix
    assert "c" in c_argv and "-std=gnu99" in c_argv
    other = tmp_path / "other"
    other.mkdir()
    assert o.template_entry(other, "src/a.cpp") is None  # no template detects this repo


def test_flags_template_roundtrip(tmp_path):
    repo = _fake_repo(tmp_path, "src/a.c", ["--language=c", "--std=c99"])
    data = o.flags_template(repo, "toy", ["src"])
    assert data["units"] == {"src/a.c": 0} and data["default"] == {".c": 0}
    assert "{source}" in data["variants"][0] and not any(str(repo) in a for a in data["variants"][0])


def test_unsupported_functions():
    ir = """
define void @a() {
  call void asm sideeffect "nop", ""()
  ret void
}
define void @b() #0 {
  ret void
}
define i32 @c(ptr %0) {
  %2 = call i32 @setjmp(ptr %0)
  ret i32 %2
}
define void @d(ptr %0) {
  call void @llvm.memcpy.p0.p0.i32(ptr %0, ptr %0, i32 4, i1 false)
  call void @llvm.lifetime.start.p0(i64 4, ptr %0)
  ret void
}
define void @e() {
  call void @llvm.experimental.weird()
  ret void
}
attributes #0 = { naked noinline }
"""
    assert o.unsupported_functions(ir) == {"a": "inline asm", "b": "naked", "c": "setjmp/longjmp",
                                           "e": "intrinsic @llvm.experimental.weird"}


@pytest.mark.skipif(o.find_clang() is None, reason="needs clang")
def test_bytes_override_is_byte_exact(tmp_path):
    repo = _fake_repo(tmp_path, "src/a.c", ["--language=c", "--std=c99"])
    raw = b"/* \x82\xa0 sjis */\nint g = 7;\nint f(void) { return g; }\n"
    res = o.compile_ir(repo, "src/a.c", override_text=raw)
    assert res.ok, res.errors
    assert "i32 7" in res.ir_text
    res2 = o.run_clang(o.oracle_argv(repo, "src/a.c"), repo, {(repo / "src/a.c").resolve(): raw})
    assert res2.ok and res2.ir_text == res.ir_text
