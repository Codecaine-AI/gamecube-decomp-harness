from conftest import make_hunk, run


def test_type_widening_pair():
    hunk = make_hunk("\t\tMtx44 transform;\n\t\ts32 count = 0;\n", removed="\t\tMtx transform;\n\t\ts16 count = 0;\n")
    found = run("storage_widening", hunk)
    assert [f["detail"]["name"] for f in found] == ["transform", "count"]
    assert all(f["severity"] == "warning" for f in found)


def test_buffer_growth_and_snprintf():
    hunk = make_hunk("\tchar buf[96];\n\tsnprintf(buf, 64, \"%s\", name);\n", removed="\tchar buf[64];\n")
    found = run("storage_widening", hunk)
    assert [f["detail"]["form"] for f in found] == ["widened_declaration", "oversized_snprintf_buffer"]


def test_unrelated_changes_and_sizeof_are_fine():
    hunk = make_hunk("\tMtx44 ortho;\n\tchar buf[64];\n\tsnprintf(buf, sizeof(buf), \"%d\", i);\n\tsnprintf(other, 256, \"%s\", n);\n", removed="\tMtx44 m;\n")
    assert run("storage_widening", hunk) == []
