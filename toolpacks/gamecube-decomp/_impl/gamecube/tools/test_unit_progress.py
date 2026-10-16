"""unit_progress: unit progress, stub units and class owner units (order rule)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

import unit_progress as up  # noqa: E402
from test_steering_pipeline import toy_elf  # noqa: E402

MAP = """\
Link map of __start
  1] __start (func,global) found in os.a __start.c
   2] __vt__6TKoopa (object,global) found in Enemy.a Koopa.cpp
   2] __ct__6TKoopaFPCc (func,global) found in Enemy.a Koopa.cpp
   2] __vt__Q26JDrama8TNameRef (object,global) found in JSystem.a JDRNameRef.cpp
   2] __vt__9TViewObjX (object,weak) found in Enemy.a tinkoopa.cpp
   2] isEnd___8TTinBodyCFv (func,global) found in Enemy.a tinkoopa.cpp
   2] __dt__8TTinBodyFv (func,global) found in Enemy.a tinkoopa.cpp
   2] GetValue__6JDramaFPCc (func,global) found in JSystem.a JDRNameRef.cpp
   2] Other__6JDramaFv (func,global) found in JSystem.a JDRNameRef.cpp
   2] __ct__6TSplitFv (func,weak) found in Enemy.a a.cpp
   2] inlineHelper__8TTinBodyFv (func,weak) found in MSound.a MSound.cpp
   2] inlineHelper2__8TTinBodyFv (func,weak) found in MSound.a MSound.cpp
   2] inlineHelper3__8TTinBodyFv (func,weak) found in MSound.a MSound.cpp
   2] split__6TSplitFv (func,global) found in Enemy.a a.cpp
   2] split2__6TSplitFv (func,global) found in Enemy.a b.cpp

.text section layout
  Starting        Virtual
  address  Size   address
  -----------------------
  00000000 000010 80003100  4 move__8TTinBodyFv \tEnemy.a tinkoopa.cpp
  00000010 000010 80003110  4 __vt__9TViewObjX \tEnemy.a tinkoopa.cpp
  UNUSED   000020 ........ stripped__8TTinBodyFv Enemy.a tinkoopa.cpp
  00000020 000010 80003120  4 calc__9TViewObjXFv \tEnemy.a tinkoopa.cpp
  00000030 000010 80003130  4 calc2__9TViewObjXFv \tMap.a map.cpp
  00000040 000010 80003140  4 calc3__9TViewObjXFv \tMap.a map.cpp
  00000050 000010 80003150  4 run__10TVec3<f32>Fv \tMap.a map.cpp
"""


def fixture(tmp_path: Path) -> up.Progress:
    units = {
        "mario/Enemy/Koopa": ("src/Enemy/Koopa.cpp", None),
        "mario/Enemy/tinkoopa": ("src/Enemy/tinkoopa.cpp", 98.5),
        "mario/Map/map": ("src/Map/map.cpp", 89.7),
        "mario/JSystem/JDrama/JDRNameRef": ("src/JSystem/JDrama/JDRNameRef.cpp", 100.0),
        "mario/Enemy/half": ("src/Enemy/half.cpp", 49.9),
        "mario/MSound/MSound": ("src/MSound/MSound.cpp", 70.0),
    }
    objdiff = {"units": []}
    report = {"units": []}
    for name, (src, fuzzy) in units.items():
        stem = name.split("/", 1)[1]
        objdiff["units"].append({"name": name, "base_path": f"build/V/src/{stem}.o", "target_path": f"build/V/obj/{stem}.o",
                                 "metadata": {"source_path": src}})
        report["units"].append({"name": name, "metadata": {"source_path": src},
                                "measures": {} if fuzzy is None else {"fuzzy_match_percent": fuzzy}})
        for kind, empty in (("src", name.endswith("Koopa")), ("obj", False)):
            p = tmp_path / f"build/V/{kind}/{stem}.o"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(toy_elf("" if empty else "void f()\n{\n    a();\n}\n"))
    (tmp_path / "build/V/report.json").write_text(json.dumps(report))
    (tmp_path / "objdiff.json").write_text(json.dumps(objdiff))
    (tmp_path / "orig/V/files").mkdir(parents=True)
    (tmp_path / "orig/V/files/game.MAP").write_text(MAP.replace("\\t", "\t"))
    prog = up.load(tmp_path, "V")
    assert prog is not None and prog.classes is not None
    return prog


def test_class_of_handles_overlapping_underscores() -> None:
    assert up.class_of("isCurBckAlreadyEnd___22TBossHanachanPartsBaseCFv") == "TBossHanachanPartsBase"
    assert up.class_of("getAnmOffDist___8TBaseNPCFv") == "TBaseNPC"
    assert up.class_of("__ct__6TKoopaFPCc") == "TKoopa"
    assert up.class_of("__vt__Q26JDrama8TNameRef") == "JDrama::TNameRef"
    assert up.class_of("func__Q210JKRExpHeap9CMemBlockFPv") == "JKRExpHeap::CMemBlock"
    assert up.class_of("main") is None and up.class_of("OSReport") is None


def test_vtable_owner_and_stub_unit(tmp_path: Path) -> None:
    prog = fixture(tmp_path)
    koopa = prog.describe("TKoopa")
    assert koopa["owner_unit"] == "mario/Enemy/Koopa" and koopa["stub"] is True
    assert koopa["decompiled"] is False and koopa["mostly_unmatched"] is True
    assert prog.describe("JDrama::TNameRef")["decompiled"] is True
    assert prog.describe("TNameRef")["owner_unit"] == "mario/JSystem/JDrama/JDRNameRef"  # unique tail


def test_majority_owner_ignores_weak_members(tmp_path: Path) -> None:
    prog = fixture(tmp_path)
    # TTinBody: 2 tree + 1 .text + 1 UNUSED in tinkoopa; 3 weak inlines in MSound do not count
    assert prog.describe("TTinBody")["owner_unit"] == "mario/Enemy/tinkoopa"
    # TViewObjX: only a weak vtable; members 1 in tinkoopa vs 2 in map -> map
    assert prog.describe("TViewObjX")["owner_unit"] == "mario/Map/map"


def test_unknown_owners(tmp_path: Path) -> None:
    prog = fixture(tmp_path)
    assert prog.describe("TSplit")["known"] is False  # tie between two objects
    assert prog.owner_unit("TVec3<f32>") is None  # templates
    assert prog.owner_unit("TNotInMap") is None
    assert up.decompiled(None) is False and up.mostly_unmatched(None) is False


def test_thresholds(tmp_path: Path) -> None:
    prog = fixture(tmp_path)
    tin, half, mapu = prog.unit("mario/Enemy/tinkoopa"), prog.unit("mario/Enemy/half"), prog.unit("mario/Map/map")
    assert up.ORDER_MATCH_MIN == 50.0 and up.MOSTLY_UNMATCHED_BELOW == 50.0
    assert up.decompiled(mapu) and not up.decompiled(mapu, min_percent=90.0)  # 89.7% (TMapObjPlane-like)
    assert up.decompiled(tin, 90.0) and not up.mostly_unmatched(tin)
    assert half.stub is False and up.mostly_unmatched(half) and not up.decompiled(half)
    assert prog.unit("src/Enemy/tinkoopa.cpp") is tin


def test_stub_without_objects_falls_back_to_measures() -> None:
    assert up.UnitInfo("u", "src/u.cpp", None, None).stub is True
    assert up.UnitInfo("u", "src/u.cpp", 40.0, None).stub is True
    assert up.UnitInfo("u", "src/u.cpp", 60.0, None).stub is False
    assert up.UnitInfo("u", None, 99.0, None).progress == 0.0


def test_no_report_means_unavailable(tmp_path: Path) -> None:
    assert up.load(tmp_path, "V") is None


def test_order_gated_paths() -> None:
    assert up.is_order_gated("src/System/MarNameRefGen_BossEnemy.cpp")
    assert up.is_order_gated("src/System/MarNameRefGen.cpp")
    assert not up.is_order_gated("src/System/MarDirector.cpp")


def test_namespaces_are_not_classes(tmp_path: Path) -> None:
    prog = fixture(tmp_path)
    # free functions under JDrama:: mangle like members, but JDrama has no vtable/ctor/dtor/RTTI
    assert up.class_of("GetValue__6JDramaFPCc") == "JDrama"
    assert prog.classes.namespace_like("JDrama") and prog.owner_unit("JDrama") is None
    assert not prog.classes.namespace_like("TTinBody")
