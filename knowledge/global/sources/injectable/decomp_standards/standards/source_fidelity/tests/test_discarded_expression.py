from conftest import make_hunk, run


def test_void_literal_and_string_and_pure_call_and_member():
    src = """
void TFoo::run()
{
\t(void)1.0f;
\t(void)4503601774854144.0;
\t"<TSilhouette>";
\t(void)"<TStageEnemyInfo>";
\tstrcmp(name, "旗");
\t(void)mParams.unk4;
}
"""
    found = run("discarded_expression", make_hunk(src))
    assert [f["detail"]["form"] for f in found] == [
        "void_literal", "void_literal", "string_statement", "void_literal", "pure_call", "void_member",
    ]
    assert all(f["severity"] == "error" for f in found)


def test_order_helper_with_todo_is_exempt():
    src = """
/// @todo .sdata2 order hack
static void order_sdata2(void)
{
\t(void)-1.0f;
\t(void)S32_TO_F32;
}
"""
    assert run("discarded_expression", make_hunk(src)) == []


def test_order_helper_without_todo_is_flagged():
    src = "static void order_sdata2(void)\n{\n\t(void)-1.0f;\n}\n"
    assert len(run("discarded_expression", make_hunk(src))) == 1


def test_used_results_and_void_casts_of_calls_are_fine():
    src = """
\tif (strcmp(name, "Silhouette") == 0)
\t\treturn new TSilhouette("<TSilhouette>");
\t(void)doWork();
\t(void)param;
\tconst char* s = "label";
"""
    assert run("discarded_expression", make_hunk(src)) == []
