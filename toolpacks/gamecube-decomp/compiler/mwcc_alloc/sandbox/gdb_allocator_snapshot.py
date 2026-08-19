# Vendored from https://github.com/MarkMcCaskey/decomp-scripts at commit
# 88f0abe02080a1d3f19df3aebf551dc5fb226442 under the MIT License.
# Copyright (c) 2026 Mark McCaskey.
# Original path: mwcc/gdb_allocator_snapshot.py
# Local modifications:
# - Read compiler identity from MWCC_ALLOC_TARGET_SHA256 and
#   MWCC_ALLOC_COMPILER_LABEL.
# - Let MWCC_ALLOC_ONLY_INDEX limit auto-capture writes to one function index.

import json
import os
import sys
from pathlib import Path

import gdb


TOOLS_DIR = Path(__file__).resolve().parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from allocator_snapshot import SnapshotReader, TARGET_SHA256


ALLOCATE_REGISTERS_ADDRESS = 0x004CDEF0
SELECT_COLORS_ADDRESS = 0x004CE2D0


def snapshot_reader():
    inferior = gdb.selected_inferior()
    return SnapshotReader(
        lambda address, size: bytes(inferior.read_memory(address, size)),
        target_sha256=os.environ.get("MWCC_ALLOC_TARGET_SHA256", TARGET_SHA256),
        compiler_label=os.environ.get("MWCC_ALLOC_COMPILER_LABEL", "GC/1.2.5"),
    )


def write_snapshot(output, snapshot):
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as stream:
        json.dump(snapshot, stream, indent=2)
        stream.write("\n")


class MwccAllocatorSnapshot(gdb.Command):
    """Write a GC/1.2.5 pre-coloring PCode snapshot: mwcc-snapshot PATH"""

    def __init__(self):
        super().__init__("mwcc-snapshot", gdb.COMMAND_DATA)

    def invoke(self, argument, from_tty):
        del from_tty
        output = Path(argument.strip())
        if not output.name:
            raise gdb.GdbError("usage: mwcc-snapshot PATH")

        reader = snapshot_reader()
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        function_pointer = reader.u32(stack_pointer + 4)
        program_counter = int(gdb.parse_and_eval("$pc"))
        snapshot = reader.snapshot(function_pointer, program_counter)
        write_snapshot(output, snapshot)
        gdb.write(f"Wrote {output} with {len(snapshot['blocks'])} blocks\n")


class MwccColoringSnapshot(gdb.Command):
    """Write a GC/1.2.5 coloring graph snapshot: mwcc-coloring-snapshot PATH"""

    def __init__(self):
        super().__init__("mwcc-coloring-snapshot", gdb.COMMAND_DATA)

    def invoke(self, argument, from_tty):
        del from_tty
        output = Path(argument.strip())
        if not output.name:
            raise gdb.GdbError("usage: mwcc-coloring-snapshot PATH")

        reader = snapshot_reader()
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        reg_class = reader.u32(stack_pointer + 4)
        simplify_stack = reader.u32(stack_pointer + 8)
        program_counter = int(gdb.parse_and_eval("$pc"))
        snapshot = reader.coloring_snapshot(
            reg_class, simplify_stack, program_counter
        )
        write_snapshot(output, snapshot)
        gdb.write(f"Wrote {output} with {len(snapshot['nodes'])} nodes\n")


class ColoringReturnBreakpoint(gdb.Breakpoint):
    def __init__(self, session, attempt, reg_class, return_address):
        super().__init__(
            f"*0x{return_address:08x}",
            type=gdb.BP_HARDWARE_BREAKPOINT,
            internal=True,
        )
        self.session = session
        self.function_index = session.function_index
        self.attempt = attempt
        self.reg_class = reg_class

    def stop(self):
        reader = snapshot_reader()
        snapshot = reader.coloring_snapshot(
            self.reg_class,
            0,
            int(gdb.parse_and_eval("$pc")),
        )
        snapshot["capture_index"] = self.session.function_index
        snapshot["attempt"] = self.attempt
        snapshot["phase"] = "after"
        output = self.session.coloring_path(
            self.function_index, self.attempt, "after"
        )
        write_snapshot(output, snapshot)
        self.enabled = False
        return False


class ColoringBreakpoint(gdb.Breakpoint):
    def __init__(self, session):
        super().__init__(
            f"*0x{SELECT_COLORS_ADDRESS:08x}",
            type=gdb.BP_HARDWARE_BREAKPOINT,
            internal=True,
        )
        self.session = session

    def stop(self):
        if not self.session.should_capture():
            return False

        reader = snapshot_reader()
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        reg_class = reader.u32(stack_pointer + 4)
        if reg_class != 0:
            return False

        simplify_stack = reader.u32(stack_pointer + 8)
        return_address = reader.u32(stack_pointer)
        self.session.gpr_attempt += 1
        attempt = self.session.gpr_attempt
        snapshot = reader.coloring_snapshot(
            reg_class, simplify_stack, int(gdb.parse_and_eval("$pc"))
        )
        snapshot["capture_index"] = self.session.function_index
        snapshot["attempt"] = attempt
        snapshot["phase"] = "before"
        output = self.session.coloring_path(
            self.session.function_index, attempt, "before"
        )
        write_snapshot(output, snapshot)
        ColoringReturnBreakpoint(
            self.session,
            attempt,
            reg_class,
            return_address,
        )
        return False


class AllocateBreakpoint(gdb.Breakpoint):
    def __init__(self, session):
        super().__init__(
            f"*0x{ALLOCATE_REGISTERS_ADDRESS:08x}",
            type=gdb.BP_HARDWARE_BREAKPOINT,
            internal=True,
        )
        self.session = session

    def stop(self):
        self.session.function_index += 1
        self.session.gpr_attempt = 0
        if not self.session.should_capture():
            return False

        reader = snapshot_reader()
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        function_pointer = reader.u32(stack_pointer + 4)
        snapshot = reader.snapshot(
            function_pointer, int(gdb.parse_and_eval("$pc"))
        )
        snapshot["capture_index"] = self.session.function_index
        output = self.session.output / (
            f"allocator-{self.session.function_index:04d}.json"
        )
        write_snapshot(output, snapshot)
        instruction_count = sum(
            len(block["instructions"]) for block in snapshot["blocks"]
        )
        gdb.write(
            f"Captured allocator {self.session.function_index}: "
            f"{len(snapshot['blocks'])} blocks, {instruction_count} instructions\n"
        )
        return False


class CaptureSession:
    def __init__(self, output):
        self.output = output
        self.function_index = 0
        self.gpr_attempt = 0
        only_index = os.environ.get("MWCC_ALLOC_ONLY_INDEX")
        self.only_index = int(only_index) if only_index is not None else None
        self.allocate_breakpoint = AllocateBreakpoint(self)
        self.coloring_breakpoint = ColoringBreakpoint(self)

    def should_capture(self):
        return self.only_index is None or self.function_index == self.only_index

    def coloring_path(self, function_index, attempt, phase):
        return self.output / (
            f"coloring-{function_index:04d}-gpr-{attempt:02d}-{phase}.json"
        )


class MwccAutoCapture(gdb.Command):
    """Capture every allocator pass: mwcc-auto-capture DIRECTORY"""

    def __init__(self):
        super().__init__("mwcc-auto-capture", gdb.COMMAND_DATA)
        self.session = None

    def invoke(self, argument, from_tty):
        del from_tty
        output = Path(argument.strip())
        if not output.name:
            raise gdb.GdbError("usage: mwcc-auto-capture DIRECTORY")
        output.mkdir(parents=True, exist_ok=True)
        self.session = CaptureSession(output)
        gdb.write(f"Capturing MWCC allocator passes in {output}\n")


MwccAllocatorSnapshot()
MwccColoringSnapshot()
MwccAutoCapture()
