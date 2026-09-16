from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock


TOOLS = Path(__file__).resolve().parent
DECOMP = TOOLS / "decomp.py"


def load_decomp(root: Path, name: str):
    elf_file = types.ModuleType("elftools.elf.elffile")
    elf_file.ELFFile = object
    sections = types.ModuleType("elftools.elf.sections")
    sections.SymbolTableSection = object
    modules = {
        "elftools": types.ModuleType("elftools"),
        "elftools.elf": types.ModuleType("elftools.elf"),
        "elftools.elf.elffile": elf_file,
        "elftools.elf.sections": sections,
    }
    spec = importlib.util.spec_from_file_location(name, DECOMP)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    with (
        mock.patch.dict(sys.modules, modules),
        mock.patch.dict(os.environ, {"ORCH_GAME_REPO_ROOT": str(root)}, clear=False),
    ):
        spec.loader.exec_module(module)
    return module


class DecompLayoutTest(unittest.TestCase):
    def test_sms_decompctx_uses_cpp_source_and_build_include_flags(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "tools/decompctx.py"
            script.parent.mkdir(parents=True)
            script.touch()
            unit = {
                "name": "mario/MarioUtil/MtxUtil",
                "base_path": "build/GMSJ01/src/MarioUtil/MtxUtil.o",
                "target_path": "build/GMSJ01/obj/MarioUtil/MtxUtil.o",
                "metadata": {"source_path": "src/MarioUtil/MtxUtil.cpp"},
            }
            (root / "objdiff.json").write_text(json.dumps({"units": [unit]}))
            report = root / "build/GMSJ01/report.json"
            report.parent.mkdir(parents=True)
            report.write_text(json.dumps({"units": []}))
            (root / "build.ninja").write_text(
                "build build/GMSJ01/src/MarioUtil/MtxUtil.ctx: decompctx "
                "src/MarioUtil/MtxUtil.cpp | tools/decompctx.py\n"
                "  includes = -I include -I build/GMSJ01/include\n"
            )

            module = load_decomp(root, "decomp_sms_layout_test")
            commands: list[tuple[list[str], str | None]] = []
            module.run_cmd = lambda command, **kwargs: commands.append(
                (command, kwargs.get("cwd"))
            ) or ""
            module.gen_ctx(Path("src/MarioUtil/MtxUtil.cpp"))

            self.assertEqual(
                commands,
                [
                    (
                        [
                            "python",
                            str(script.resolve()),
                            "src/MarioUtil/MtxUtil.cpp",
                            "-o",
                            "build/ctx.c",
                            "-I",
                            "include",
                            "-I",
                            "build/GMSJ01/include",
                        ],
                        str(root.resolve()),
                    )
                ],
            )

    def test_melee_m2ctx_command_is_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "tools/m2ctx/m2ctx.py"
            script.parent.mkdir(parents=True)
            script.touch()
            report = root / "build/GALE01/report.json"
            report.parent.mkdir(parents=True)
            report.write_text(json.dumps({"units": []}))

            module = load_decomp(root, "decomp_melee_layout_test")
            commands: list[tuple[list[str], str | None]] = []
            module.run_cmd = lambda command, **kwargs: commands.append(
                (command, kwargs.get("cwd"))
            ) or ""
            module.gen_ctx()

            self.assertEqual(
                commands,
                [
                    (
                        [
                            "python",
                            str(script.resolve()),
                            "--quiet",
                            "--preprocessor",
                        ],
                        str(root.resolve()),
                    )
                ],
            )


if __name__ == "__main__":
    unittest.main()
