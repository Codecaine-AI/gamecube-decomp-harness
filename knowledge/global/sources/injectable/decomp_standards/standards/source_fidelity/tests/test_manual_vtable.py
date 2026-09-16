from conftest import make_hunk, run

KILLER = """
void* __vt__21TNerveKillerExplosion[] = {
\t0,
\t0,
\t(void*)__dt__21TNerveKillerExplosionFv,
\t0,
};

static void* killer_vtable_padding[16] = { 0 };
"""


def test_vtable_array_slots_and_padding():
    found = run("manual_vtable", make_hunk(KILLER))
    forms = [f["detail"]["form"] for f in found]
    assert forms == ["vtable_array", "vtable_padding"]
    assert found[0]["detail"]["slots"] == 1
    assert all(f["severity"] == "error" for f in found)


def test_ordinary_void_casts_are_fine():
    src = "\tvoid* p = (void*)mData;\n\tvoid* table[] = { (void*)&sInfo, 0 };\n"
    assert run("manual_vtable", make_hunk(src)) == []


def test_slot_outside_vtable_is_flagged():
    src = "\tvoid* fn = (void*)__dt__7TKillerFv;\n"
    found = run("manual_vtable", make_hunk(src))
    assert [f["detail"]["form"] for f in found] == ["mangled_slot"]
