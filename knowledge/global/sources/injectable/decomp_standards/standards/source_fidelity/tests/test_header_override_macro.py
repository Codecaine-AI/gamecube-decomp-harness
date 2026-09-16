from conftest import make_hunk, run


def test_guard_predefine():
    found = run("header_override_macro", make_hunk("#define SYSTEM_DUMMY_STRINGS_HPP\n#include <System/DummyStrings.hpp>\n"))
    assert [f["detail"]["form"] for f in found] == ["guard_predefine"]
    assert found[0]["severity"] == "error"


def test_rename_around_include():
    src = "#define TFoo TFooShadow\n#include <Enemy/Foo.hpp>\n#undef TFoo\n"
    found = run("header_override_macro", make_hunk(src))
    assert [f["detail"]["form"] for f in found] == ["include_rename"]


def test_declaration_shadow():
    src = "#define inv_sqrt inv_sqrt(f32); static f32 inv_sqrt_inline\n#include <JSystem/JGeometry/JGUtil.hpp>\n#undef inv_sqrt\n"
    found = run("header_override_macro", make_hunk(src))
    assert [f["detail"]["form"] for f in found] == ["declaration_shadow"]


def test_ordinary_defines_are_fine():
    src = "#include <Foo.hpp>\n#define COUNT 4\n#define SQR(x) ((x) * (x))\n#define ALIAS OTHER\n"
    assert run("header_override_macro", make_hunk(src)) == []


def test_alias_without_undef_is_fine():
    assert run("header_override_macro", make_hunk("#define TFoo TBar\n#include <x.hpp>\n")) == []
