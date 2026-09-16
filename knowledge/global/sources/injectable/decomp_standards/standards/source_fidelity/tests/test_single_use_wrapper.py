from conftest import make_hunk, run

WRAPPER = "static inline f32 dotProduct(const TVec3f& a, const TVec3f& b)\n{\n\treturn a.x * b.x + a.y * b.y + a.z * b.z;\n}\n"


def test_single_use_one_expression_wrapper():
    post = WRAPPER + "\nf32 TFoo::calc()\n{\n\treturn dotProduct(mA, mB);\n}\n"
    found = run("single_use_wrapper", make_hunk(WRAPPER, post=post, start=1))
    assert [f["severity"] for f in found] == ["warning"]
    assert found[0]["detail"]["name"] == "dotProduct"


def test_marker_two_calls_or_multi_statement_are_fine():
    marked = "// fabricated: stack shape\n" + WRAPPER + "\nf32 f() { return dotProduct(a, b); }\n"
    assert run("single_use_wrapper", make_hunk(marked, post=marked, start=1)) == []
    twice = WRAPPER + "\nf32 f() { return dotProduct(a, b) + dotProduct(c, d); }\n"
    assert run("single_use_wrapper", make_hunk(WRAPPER, post=twice, start=1)) == []
    multi = "static inline f32 h(f32 v)\n{\n\tf32 t = v * 2.0f;\n\treturn t + 1.0f;\n}\nf32 f() { return h(1.0f); }\n"
    assert run("single_use_wrapper", make_hunk(multi, post=multi, start=1)) == []
