from conftest import make_hunk, run


def test_mangled_global_definition():
    found = run("mangled_symbol_in_source", make_hunk("float mWaterLeakSpeed__14TCogwheelScale = 0.01f;\n"))
    assert [f["severity"] for f in found] == ["error"]
    assert found[0]["detail"]["symbol"] == "mWaterLeakSpeed__14TCogwheelScale"


def test_extern_c_with_mangled_is_one_finding():
    found = run("mangled_symbol_in_source", make_hunk('extern "C" float mRopeWidthX__9TCogwheel = 10.0f;\n'))
    assert len(found) == 1
    assert found[0]["detail"]["form"] == "extern_c_mangled"


def test_extern_c_block_declarations():
    src = 'extern "C" {\nvoid setRunAnm__11TSmallEnemyFv();\n\tvoid walkBehavior__12TWalkerEnemyFif();\nfloat mSpeed__7TKiller = 1.0f;\n}\n'
    found = run("mangled_symbol_in_source", make_hunk(src))
    assert [f["line"] for f in found] == [10, 13]
    assert found[0]["detail"]["mangled_prototypes"] == 2


def test_q_namespace_form():
    found = run("mangled_symbol_in_source", make_hunk("void getType__Q26JDrama6TActorCFv();\n"))
    assert len(found) == 1


def test_comments_local_and_c_files_are_fine():
    src = "// __ct__7TKillerFv is the constructor\nvoid TKiller::init()\n{\n\ts32 value__2 = 0;\n}\n"
    assert run("mangled_symbol_in_source", make_hunk(src)) == []
    assert run("mangled_symbol_in_source", make_hunk('extern "C" void f(void);\n', file="src/melee/ft/x.c")) == []
    assert run("mangled_symbol_in_source", make_hunk('extern "C" {\n', file="src/dolphin/os/x.cpp")) == []


def test_vt_arrays_left_to_manual_vtable():
    assert run("mangled_symbol_in_source", make_hunk("void* __vt__7TKiller[] = {\n")) == []
