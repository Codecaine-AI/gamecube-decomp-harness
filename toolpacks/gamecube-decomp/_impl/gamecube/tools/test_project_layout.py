from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

from project_layout import get_project_layout


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


class ProjectLayoutTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.root = Path(self.tempdir.name).resolve()

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def test_melee_metadata_preserves_legacy_paths_and_aliases(self) -> None:
        unit = {
            "name": "main/melee/lb/lbtime",
            "base_path": "build/GALE01/src/melee/lb/lbtime.o",
            "target_path": "build/GALE01/obj/melee/lb/lbtime.o",
            "metadata": {"source_path": "src/melee/lb/lbtime.c"},
        }
        write_json(self.root / "objdiff.json", {"units": [unit]})
        write_json(
            self.root / "build/GALE01/report.json",
            {"units": [{"name": unit["name"], "functions": [{"name": "lbTime_8000B028"}]}]},
        )
        context = self.root / "tools/m2ctx/m2ctx.py"
        context.parent.mkdir(parents=True)
        context.touch()

        layout = get_project_layout(self.root)

        self.assertIs(layout, get_project_layout(self.root))
        self.assertEqual(layout.version, "GALE01")
        self.assertEqual(layout.report_path, self.root / "build/GALE01/report.json")
        self.assertEqual(layout.asm_root, self.root / "build/GALE01/asm")
        self.assertEqual(layout.obj_root, self.root / "build/GALE01/obj")
        self.assertEqual(layout.context_script, context)
        self.assertEqual(layout.unit_for_function("lbTime_8000B028"), "main/melee/lb/lbtime")
        self.assertEqual(layout.operational_unit_for_function("lbTime_8000B028"), "melee/lb/lbtime")
        self.assertEqual(layout.source_path_for_unit("main/melee/lb/lbtime"), Path("src/melee/lb/lbtime.c"))
        self.assertEqual(layout.source_path_for_unit("melee/lb/lbtime"), Path("src/melee/lb/lbtime.c"))
        self.assertEqual(layout.object_path_for_unit("src/melee/lb/lbtime.c"), Path(unit["base_path"]))
        self.assertEqual(
            layout.target_object_path_for_unit(self.root / unit["target_path"]),
            Path(unit["target_path"]),
        )

    def test_sms_metadata_uses_authored_cpp_and_object_paths(self) -> None:
        unit = {
            "name": "mario/MarioUtil/MtxUtil",
            "base_path": "build/GMSJ01/src/MarioUtil/MtxUtil.o",
            "target_path": "build/GMSJ01/obj/MarioUtil/MtxUtil.o",
            "metadata": {"source_path": "src/MarioUtil/MtxUtil.cpp"},
        }
        write_json(self.root / "objdiff.json", {"units": [unit]})
        write_json(
            self.root / "build/GMSJ01/report.json",
            {
                "units": [
                    {
                        "name": unit["name"],
                        "functions": [
                            {
                                "name": "SMS_MakeMtx__Fv",
                                "metadata": {"demangled_name": "SMS_MakeMtx()"},
                            }
                        ],
                    }
                ]
            },
        )
        context = self.root / "tools/decompctx.py"
        context.parent.mkdir(parents=True)
        context.touch()

        layout = get_project_layout(self.root)

        self.assertEqual(layout.version, "GMSJ01")
        self.assertEqual(layout.context_script, context)
        self.assertEqual(layout.unit_for_function("SMS_MakeMtx__Fv"), "mario/MarioUtil/MtxUtil")
        self.assertEqual(layout.operational_unit_for_function("SMS_MakeMtx__Fv"), "MarioUtil/MtxUtil")
        self.assertEqual(layout.source_name_for_function("SMS_MakeMtx__Fv"), "SMS_MakeMtx")
        self.assertEqual(layout.source_path_for_unit("mario/MarioUtil/MtxUtil"), Path("src/MarioUtil/MtxUtil.cpp"))
        self.assertEqual(layout.source_path_for_unit("MarioUtil/MtxUtil"), Path("src/MarioUtil/MtxUtil.cpp"))
        self.assertEqual(
            layout.object_path_for_unit("src/MarioUtil/MtxUtil.cpp"),
            Path("build/GMSJ01/src/MarioUtil/MtxUtil.o"),
        )
        self.assertEqual(
            layout.target_object_path_for_unit(unit["base_path"]),
            Path("build/GMSJ01/obj/MarioUtil/MtxUtil.o"),
        )

    def test_report_only_fallback_detects_version_and_derives_paths(self) -> None:
        report = self.root / "build/GMSP01/report.json"
        write_json(
            report,
            {
                "units": [
                    {
                        "name": "mario/Map/MapCollision",
                        "metadata": {"source_path": "src/Map/MapCollision.cpp"},
                        "functions": [{"name": "MapCollision::init()"}],
                    },
                    {
                        "name": "main/melee/ft/fighter",
                        "functions": [{"name": "Fighter_Unk"}],
                    },
                ]
            },
        )

        layout = get_project_layout(self.root)

        self.assertEqual(layout.version, "GMSP01")
        self.assertEqual(layout.report_path, report)
        self.assertEqual(layout.unit_for_function("MapCollision::init()"), "mario/Map/MapCollision")
        self.assertEqual(layout.source_name_for_function("Fighter_Unk"), "Fighter_Unk")
        self.assertEqual(layout.source_path_for_unit("Map/MapCollision"), Path("src/Map/MapCollision.cpp"))
        self.assertEqual(
            layout.object_path_for_unit("mario/Map/MapCollision"),
            Path("build/GMSP01/src/Map/MapCollision.o"),
        )
        self.assertEqual(
            layout.target_object_path_for_unit("src/Map/MapCollision.cpp"),
            Path("build/GMSP01/obj/Map/MapCollision.o"),
        )
        self.assertEqual(layout.source_path_for_unit("main/melee/ft/fighter"), Path("src/melee/ft/fighter.c"))

    def test_environment_report_binding_and_metadata_light_fallback(self) -> None:
        previous = os.environ.get("ORCH_GAME_REPORT_PATH")
        os.environ["ORCH_GAME_REPORT_PATH"] = "build/GZLE01/report.json"
        try:
            layout = get_project_layout(self.root)
        finally:
            if previous is None:
                os.environ.pop("ORCH_GAME_REPORT_PATH", None)
            else:
                os.environ["ORCH_GAME_REPORT_PATH"] = previous

        self.assertEqual(layout.version, "GZLE01")
        self.assertEqual(
            layout.source_path_for_unit("zelda/main"), Path("src/zelda/main.c")
        )
        self.assertEqual(
            layout.object_path_for_unit("zelda/main"),
            Path("build/GZLE01/src/zelda/main.o"),
        )
        self.assertEqual(
            layout.target_object_path_for_unit("src/zelda/main.cpp"),
            Path("build/GZLE01/obj/zelda/main.o"),
        )

    def test_absolute_metadata_paths_and_external_report_labels_are_safe(self) -> None:
        unit = {
            "name": "mario/MarioUtil/MtxUtil",
            "base_path": str(self.root / "build/GMSJ01/src/MarioUtil/MtxUtil.o"),
            "target_path": str(self.root / "build/GMSJ01/obj/MarioUtil/MtxUtil.o"),
            "metadata": {
                "source_path": str(self.root / "src/MarioUtil/MtxUtil.cpp")
            },
        }
        write_json(self.root / "objdiff.json", {"units": [unit]})
        external_report = self.root.parent / "build/GMSJ01/report.json"

        layout = get_project_layout(self.root, external_report)

        self.assertEqual(
            layout.object_path_for_unit(unit["name"]),
            Path("build/GMSJ01/src/MarioUtil/MtxUtil.o"),
        )
        self.assertEqual(layout.path_label(external_report), external_report)


if __name__ == "__main__":
    unittest.main()
