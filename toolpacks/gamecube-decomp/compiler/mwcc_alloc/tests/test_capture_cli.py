import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest


SUITE_DIR = Path(__file__).resolve().parents[1]
CAPTURE_PATH = SUITE_DIR / "sandbox" / "mwcc_alloc_capture.py"


def load_capture_module():
    spec = importlib.util.spec_from_file_location("mwcc_alloc_capture", CAPTURE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def build_big_endian_powerpc_elf(path):
    """Write an ELF32 symtab whose function entries are deliberately unsorted."""
    names = ("late", "init_fn", "early", "undefined", "object", "middle")
    string_table = bytearray(b"\0")
    name_offsets = {}
    for name in names:
        name_offsets[name] = len(string_table)
        string_table.extend(name.encode("ascii") + b"\0")

    symbol_rows = [
        (0, 0, 0, 0, 0, 0),
        (name_offsets["late"], 0x30, 4, 0x12, 0, 1),
        (name_offsets["init_fn"], 0, 4, 0x12, 0, 2),
        (name_offsets["early"], 4, 4, 0x12, 0, 1),
        (name_offsets["undefined"], 0, 0, 0x12, 0, 0),
        (name_offsets["object"], 8, 4, 0x11, 0, 1),
        (name_offsets["middle"], 0x10, 4, 0x12, 0, 1),
    ]
    symbol_table = b"".join(
        struct.pack(">IIIBBH", *row) for row in symbol_rows
    )

    elf_header_size = 52
    section_header_size = 40
    section_count = 5
    section_headers_offset = elf_header_size
    data_offset = elf_header_size + section_header_size * section_count
    text_offset = data_offset
    init_offset = text_offset + 0x40
    strings_offset = init_offset + 0x10
    symbols_offset = (strings_offset + len(string_table) + 3) & ~3

    ident = b"\x7fELF" + bytes((1, 2, 1, 0)) + b"\0" * 8
    elf_header = struct.pack(
        ">16sHHIIIIIHHHHHH",
        ident,
        1,
        20,
        1,
        0,
        0,
        section_headers_offset,
        0,
        elf_header_size,
        0,
        0,
        section_header_size,
        section_count,
        0,
    )

    def section_header(
        section_type, offset=0, size=0, flags=0, link=0, info=0, alignment=1,
        entry_size=0,
    ):
        return struct.pack(
            ">IIIIIIIIII",
            0,
            section_type,
            flags,
            0,
            offset,
            size,
            link,
            info,
            alignment,
            entry_size,
        )

    section_headers = b"".join(
        (
            section_header(0, alignment=0),
            section_header(1, text_offset, 0x40, flags=0x6, alignment=4),
            section_header(1, init_offset, 0x10, flags=0x6, alignment=4),
            section_header(3, strings_offset, len(string_table)),
            section_header(
                2,
                symbols_offset,
                len(symbol_table),
                link=3,
                info=1,
                alignment=4,
                entry_size=16,
            ),
        )
    )
    padding = b"\0" * (symbols_offset - strings_offset - len(string_table))
    payload = b"".join(
        (
            elf_header,
            section_headers,
            b"\0" * 0x40,
            b"\0" * 0x10,
            bytes(string_table),
            padding,
            symbol_table,
        )
    )
    path.write_bytes(payload)


class CaptureCliTests(unittest.TestCase):
    def run_cli(self, *arguments, env=None):
        return subprocess.run(
            [sys.executable, str(CAPTURE_PATH), *arguments],
            check=False,
            capture_output=True,
            text=True,
            env=env,
        )

    def assert_argument_rejected(self, *arguments):
        result = self.run_cli(*arguments)
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload.get("status"), "invalid_arguments", payload)

    def test_bad_unit_paths_are_rejected(self):
        for unit in ("/tmp/x.c", "src/../x.c", "src\\x.c"):
            with self.subTest(unit=unit):
                self.assert_argument_rejected(
                    "--unit", unit, "--function", "f", "--json"
                )

    def test_nul_in_unit_is_rejected_by_normalizer(self):
        capture = load_capture_module()
        with self.assertRaises(capture.ArgumentError):
            capture.normalize_unit("src/bad\0name.c")

    def test_bad_function_symbols_are_rejected(self):
        for symbol in ("9bad", "bad-name", "two words"):
            with self.subTest(symbol=symbol):
                self.assert_argument_rejected(
                    "--unit", "src/x.c", "--function", symbol, "--json"
                )

    def test_bad_capture_kind_is_rejected(self):
        self.assert_argument_rejected(
            "--unit",
            "src/x.c",
            "--function",
            "f",
            "--capture",
            "graph",
            "--json",
        )

    def test_missing_debug_tools_short_circuits_with_json(self):
        with tempfile.TemporaryDirectory() as empty_path:
            env = os.environ.copy()
            env["PATH"] = empty_path
            result = self.run_cli(
                "--repo-root",
                empty_path,
                "--unit",
                "src/x.c",
                "--function",
                "f",
                "--json",
                env=env,
            )
        self.assertEqual(result.returncode, 0, result.stderr)
        payload = json.loads(result.stdout)
        self.assertEqual(payload["status"], "debug_tools_not_provisioned")
        self.assertEqual(
            set(payload["missing"]), {"gdb-multiarch", "qemu-i386"}
        )
        self.assertIn("Do not retry", payload["guidance"])

    def test_function_index_helper_orders_defined_function_symbols(self):
        capture = load_capture_module()

        with tempfile.TemporaryDirectory() as temp_dir:
            elf_path = Path(temp_dir) / "fixture.o"
            build_big_endian_powerpc_elf(elf_path)
            functions = capture.read_elf_functions(elf_path)

        self.assertEqual(
            functions,
            ["early", "middle", "late", "init_fn"],
        )


if __name__ == "__main__":
    unittest.main()
