#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["pyelftools", "pcpp"]
# ///
"""
Decompile a function or translation unit with the vendored m2c fork.

Vendored from the melee tree's tools/decomp.py and rewired for this tool suite:
  - the project checkout is resolved via ORCH_GAME_REPO_ROOT,
    matching the other tool-local helper scripts;
  - m2c is the vendored fork at <tool impl>/m2c, injected onto
    PYTHONPATH for the m2c subprocess (no install step, no venv dependency);
  - m2ctx still runs from the melee tree (it is pure stdlib and self-locating).

Usage (run in place, like the other tools/ scripts):

  ORCH_GAME_REPO_ROOT=~/melee python toolpacks/gamecube-decomp/_impl/gamecube/tools/decomp.py <function|tu> [m2c args...]

The PEP 723 block above declares the hard deps so `uv run` provisions
them automatically: pyelftools (function -> obj/asm lookup) and pcpp
(used by the melee tree's m2ctx.py --preprocessor when generating
ctx.c). The clipboard (--copy) and colorize (-c) extras remain optional
and degrade gracefully if absent.
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from sys import stderr
from typing import Optional, cast

from elftools.elf.elffile import ELFFile
from elftools.elf.sections import SymbolTableSection

# Project checkout root: explicit override, then Claude Code's project dir,
# then assume this script lives at <melee>/tools/ (matches checkdiff.py etc.).
from project_root import resolve_root

ROOT = resolve_root()
# The vendored m2c fork lives at the implementation root, next to this tools/ dir.
M2C_ROOT = Path(__file__).resolve().parents[1] / "m2c"
DTK_ROOT = ROOT / "build/GALE01"
OBJ_ROOT = DTK_ROOT / "obj"
ASM_ROOT = DTK_ROOT / "asm"
SRC_ROOT = ROOT / "src"
CTX_FILE = ROOT / "build/ctx.c"
M2CTX_SCRIPT = ROOT / "tools/m2ctx/m2ctx.py"
PLACEHOLDER = r"^/// #{name}$(?:\r?\n)?"


def has_function(obj_path: Path, function_name: str) -> bool:
    with open(obj_path, "rb") as f:
        elf_file = ELFFile(f)
        symbol_table = elf_file.get_section_by_name(".symtab")

        if isinstance(symbol_table, SymbolTableSection):
            for symbol in symbol_table.iter_symbols():
                if (
                    symbol["st_info"]["type"] == "STT_FUNC"
                    and symbol.name == function_name
                ):
                    return True
    return False


def find_obj(root: Path, function_name: str) -> Optional[Path]:
    for p in root.rglob("*.o"):
        if has_function(p, function_name):
            return p.relative_to(root)
    return None


def resolve_path(p: Path) -> str:
    return str(p.resolve())


def run_cmd(
    cmd: list[str],
    stdin: str | None = None,
    env: dict[str, str] | None = None,
    cwd: str | None = None,
) -> str:
    if cmd[0] == "python":
        executable = sys.executable
    else:
        executable = None
    result = subprocess.run(
        cmd,
        stdin=stdin,
        capture_output=True,
        executable=executable,
        env=env,
        cwd=cwd,
    )
    if result.returncode != 0:
        print(" ".join(cmd), file=sys.stderr)
        print(result.stdout.decode(), file=sys.stderr)
        print(result.stderr.decode(), file=sys.stderr)
        sys.exit(1)
    else:
        return result.stdout.decode()


def gen_ctx() -> None:
    # m2ctx's pcpp resolves its -i include dirs (src, src/melee, ...)
    # relative to cwd; the upstream decomp.py relied on being run from the
    # melee root. We run from the tool implementation, so pin cwd to <melee>.
    _ = run_cmd(
        [
            "python",
            resolve_path(M2CTX_SCRIPT),
            "--quiet",
            "--preprocessor",
        ],
        cwd=str(ROOT),
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Decomp a function or translation unit using m2c"
    )

    _ = parser.add_argument(
        "m2c_input",
        type=str,
        help="name of a function (i.e. it_8026B9A8) or translation unit (i.e. melee/it/items/itheiho)",
    )
    _ = parser.add_argument(
        dest="m2c_args",
        nargs=argparse.REMAINDER,
        help="additional arguments to be passed to m2c",
    )
    _ = parser.add_argument(
        "--no-context",
        action="store_false",
        dest="ctx",
        help=f"do not generate {CTX_FILE.name}",
    )
    _ = parser.add_argument(
        "--no-copy",
        action="store_false",
        dest="copy",
        help="do not copy the output to the clipboard",
    )
    _ = parser.add_argument(
        "-q",
        "--no-print",
        action="store_false",
        dest="print",
        help="do not print the output",
    )
    _ = parser.add_argument(
        "-c",
        "--colorize",
        action="store_true",
        dest="color",
        help="colorize the output (requires pygments)",
    )
    _ = parser.add_argument(
        "-w",
        "--write",
        action="store_true",
        help="insert the output into the corresponding src file (function input only)",
    )
    _ = parser.add_argument(
        "-f",
        "--format",
        action="store_true",
        help="run clang-format on the output",
    )

    args = parser.parse_args()

    asm_file = None
    m2c_args = []
    m2c_input = cast(bool, args.m2c_input)
    is_function = True

    if (obj_file := find_obj(OBJ_ROOT, m2c_input)) is not None:
        asm_file = ASM_ROOT / cast(Path, obj_file).with_suffix(".s")
        m2c_args = ["--function", m2c_input]
    else:
        if args.write:
            print(
                f"--write currently unimplemented with translation unit input",
                file=stderr,
            )
            sys.exit(1)
        is_function = False
        asm_file = ASM_ROOT / Path(m2c_input).with_suffix(".s")

    if asm_file.exists() is True:
        m2c_cmd: list[str] = [
            "python",
            "-m",
            "m2c.main",
            *args.m2c_args,
            "--knr",
            "--pointer",
            "left",
            "--target",
            "ppc-mwcc-c",
            "--context",
            resolve_path(CTX_FILE),
            *m2c_args,
            resolve_path(asm_file),
        ]

        if cast(bool, args.ctx):
            gen_ctx()

        # Run the tool-local m2c fork: prepend it to PYTHONPATH so
        # `-m m2c.main` (and its bundled m2c_pycparser) resolve to
        # <tool impl>/m2c regardless of which interpreter was selected. No
        # install, no melee .venv dependency.
        m2c_env = dict(os.environ)
        m2c_env["PYTHONPATH"] = os.pathsep.join(
            [str(M2C_ROOT)] + ([p] if (p := os.environ.get("PYTHONPATH")) else [])
        )
        output = run_cmd(m2c_cmd, env=m2c_env, cwd=str(ROOT))
        if cast(bool, args.copy):
            try:
                import pyperclip

                pyperclip.copy(output)
            except ModuleNotFoundError:
                print("Failed to import pyperclip; could not copy", file=stderr)

        if cast(bool, args.format):
            if shutil.which("clang-format") is None:
                print("clang-format not found; leaving m2c output unformatted", file=stderr)
            else:
                proc = subprocess.Popen(
                    ["clang-format", "-"],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
                out, err = proc.communicate(output.encode())

                output = out.decode()

                if proc.returncode != 0:
                    print(output, file=sys.stderr)
                    print(err.decode(), file=sys.stderr)
                    exit(1)

        if cast(bool, args.print):
            colorized = output
            if cast(bool, args.color):
                try:
                    import colorama

                    colorama.just_fix_windows_console()
                except ModuleNotFoundError:
                    pass
                try:
                    from pygments import highlight
                    from pygments.formatters import TerminalFormatter
                    from pygments.lexers import CLexer

                    colorized = highlight(output, CLexer(), TerminalFormatter())
                except ModuleNotFoundError:
                    print("Failed to import pygments; could not colorize", file=stderr)
            print(colorized, file=sys.stdout)

        if is_function and cast(bool, args.write):
            function = cast(str, args.m2c_input)
            src_file = SRC_ROOT / obj_file.with_suffix(".c")

            if not src_file.exists():
                src_file.parent.mkdir(parents=True, exist_ok=True)
                src_file.touch(exist_ok=True)

            text = src_file.read_text()

            placeholder = re.compile(
                PLACEHOLDER.format(name=re.escape(function)),
                re.MULTILINE,
            )

            result, count = re.subn(placeholder, output, text, count=1)
            if count < 1:
                result = result + f"\n{output}"

            _ = src_file.write_text(result)
    else:
        print(
            f"If a function was intended, then no function with the name <{m2c_input}> was found.",
            file=stderr,
        )
        print(
            f"If a TU was intended, then the expected asm file does not exist at path {asm_file}",
            file=stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
