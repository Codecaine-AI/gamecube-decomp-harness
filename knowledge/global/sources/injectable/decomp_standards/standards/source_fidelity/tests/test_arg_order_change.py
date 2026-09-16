from conftest import make_hunk, run


def test_permuted_arguments():
    hunk = make_hunk("\tsetPollution(mMax, mCount);\n", removed="\tsetPollution(mCount, mMax);\n")
    found = run("arg_order_change", hunk)
    assert [f["severity"] for f in found] == ["warning"]
    assert found[0]["detail"]["before"] == ["mCount", "mMax"]


def test_nested_calls_and_commutative_are_fine():
    hunk = make_hunk("\tf(g(b, a), c);\n\tx = MAX(b, a);\n", removed="\tf(g(b, a), c);\n\tx = MAX(a, b);\n")
    assert run("arg_order_change", hunk) == []


def test_changed_argument_set_is_fine():
    hunk = make_hunk("\tsetPollution(mMax, other);\n", removed="\tsetPollution(mCount, mMax);\n")
    assert run("arg_order_change", hunk) == []
