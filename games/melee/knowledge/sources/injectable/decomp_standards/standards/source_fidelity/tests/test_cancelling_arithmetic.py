from conftest import make_hunk, run


def test_forms_and_severity():
    src = "\tf32 a = (v.dot(n) - -unk90) * -2.0f;\n\tf32 b = x + -y;\n\tf32 c = x - 0.0f;\n\tf32 d = (p->x - p->x);\n"
    found = run("cancelling_arithmetic", make_hunk(src))
    assert len(found) == 4
    assert all(f["severity"] == "info" and f["detail"]["llm_review"] for f in found)


def test_decrement_negative_literal_and_comments_are_fine():
    src = "\ti--;\n\tx = --y;\n\tf32 z = -1.0f;\n\tf32 w = a - b;\n\t// x - -y in a comment\n\tf32 q = x - 0.5f;\n"
    assert run("cancelling_arithmetic", make_hunk(src)) == []


def test_surface_keeps_info(monkeypatch):
    found = run("cancelling_arithmetic", make_hunk("\tf32 c = x - 0.0f;\n"), surface="pr_gate")
    assert found[0]["severity"] == "info"
