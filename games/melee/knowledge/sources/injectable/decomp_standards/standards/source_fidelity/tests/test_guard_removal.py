from conftest import make_hunk, run


def test_dropped_and_term():
    hunk = make_hunk("\tif (mActor->isVisible()) {\n", removed="\tif (mActor != nullptr && mActor->isVisible()) {\n")
    found = run("guard_removal", hunk)
    assert [f["severity"] for f in found] == ["warning"]
    assert found[0]["detail"]["removed_terms"] == ["mActor!=nullptr"]


def test_term_moved_to_another_added_line_is_fine():
    hunk = make_hunk("\tif (mActor == nullptr)\n\t\treturn;\n\tif (mActor->isVisible()) {\n", removed="\tif (mActor != nullptr && mActor->isVisible()) {\n")
    assert run("guard_removal", hunk) == []


def test_unrelated_removed_condition_is_fine():
    hunk = make_hunk("\tsetSpeed(1.0f);\n", removed="\tif (a && b) {\n")
    assert run("guard_removal", hunk) == []


def test_renamed_or_rewritten_terms_are_fine():
    hunk = make_hunk("\tif (check && !(mFludd->unk1CEC == 0.0f)) {\n", removed="\tif (finished && !(mFludd->unk1CEC == 0.0f)) {\n")
    assert run("guard_removal", hunk) == []
    hunk = make_hunk("\t} else if (unk0->getSplineRail()->unk4 && mPrevIdx == 0) {\n", removed="\t} else if (unk0->unk14->unk4 && mPrevIdx == 0) {\n")
    assert run("guard_removal", hunk) == []


def test_rewritten_term_across_wrapped_lines_is_fine():
    hunk = make_hunk("\tif (unk0->getSplineRail()->unk4\n\t    && mPrevIdx == unk0->unk8 - 1) {\n", removed="\tif (unk0->unk14->unk4 && mPrevIdx == unk0->unk8 - 1) {\n")
    assert run("guard_removal", hunk) == []
