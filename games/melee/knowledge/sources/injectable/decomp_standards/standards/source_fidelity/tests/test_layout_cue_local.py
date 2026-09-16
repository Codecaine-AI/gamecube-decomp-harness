from conftest import make_hunk, run


def test_union_one_element_self_and_literal_local():
    src = """
void TFoo::run()
{
\tunion {
\t\tu64 align;
\t\tchar data[32];
\t} buf;
\tf32 tmp[1];
\tTDemoCannon* self = this;
\tf32 half = 0.5f;
\tself->mScale = half * mBase;
}
"""
    found = run("layout_cue_local", make_hunk(src))
    forms = [f["detail"]["form"] for f in found]
    assert forms == [
        "u64/char alignment union",
        "single-element array",
        "`T* self = this` alias",
        "literal-initialized local used once",
    ]
    assert all(f["severity"] == "info" for f in found)


def test_literal_local_used_twice_and_file_scope_are_fine():
    src = "void f()\n{\n\tf32 half = 0.5f;\n\ta = half * b;\n\tc = half * d;\n\tf32 arr[4];\n}\nstatic TFoo* sSelf = nullptr;\n"
    assert run("layout_cue_local", make_hunk(src)) == []
