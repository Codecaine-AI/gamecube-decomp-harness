from conftest import make_hunk, make_repo, run

HEADERS = {
    "include/Enemy/Killer.hpp": "class TKiller : public TSmallEnemy {\npublic:\n\tTKiller();\n};\nclass TFlyEnemy\n{\n};\n",
    "include/Enemy/Other.hpp": "struct TOnlyForward;\n",
}


def test_shadowing_class_definitions(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, HEADERS))
    src = "class TKiller {\npublic:\n\tu8 unk0[0x1A0];\n};\n\nclass TFlyEnemy\n{\n};\n"
    found = run("local_class_shadows_header", make_hunk(src, file="src/Enemy/killer.cpp"))
    assert sorted(f["detail"]["class_name"] for f in found) == ["TFlyEnemy", "TKiller"]
    assert all(f["severity"] == "error" for f in found)


def test_forward_declaration_and_unknown_and_indented_are_fine(tmp_path, forced_root):
    forced_root(make_repo(tmp_path, HEADERS))
    src = "class TKiller;\nclass TBrandNew {\n};\nstruct TOnlyForward {\n\tint x;\n};\nvoid f()\n{\n\tclass TKiller {\n\t};\n}\n"
    assert run("local_class_shadows_header", make_hunk(src)) == []


def test_without_repo_root_defers(monkeypatch):
    monkeypatch.delenv("REVIEW_LINT_REPO_ROOT", raising=False)
    monkeypatch.delenv("REVIEW_LINT_POST_TREE", raising=False)
    assert run("local_class_shadows_header", make_hunk("class TKiller {\n};\n")) == []


def test_post_scan_hook_runs_with_repo(tmp_path):
    from conftest import rules

    root = make_repo(tmp_path, HEADERS)
    hunk = make_hunk("class TKiller {\n};\n", file="src/Enemy/killer.cpp")
    hunk.pop("post_file_text")
    file_diffs = [{"file": "src/Enemy/killer.cpp", "hunks": [hunk]}]
    findings = rules.resolve_repo_aware_rules([], root, "diff", file_diffs, None)
    assert [f["rule_id"] for f in findings] == ["local_class_shadows_header"]
    assert findings[0]["file"] == "src/Enemy/killer.cpp"
