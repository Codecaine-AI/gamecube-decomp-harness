import json
import sys
from pathlib import Path

import gdb


TOOLS_DIR = Path(__file__).resolve().parents[1]
REPOSITORY_DIR = TOOLS_DIR.parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from allocator_snapshot import (
    FIRST_VIRTUAL_REGISTER,
    OBJECT_VIRTUAL_REGISTER_ALLOCATOR_DETAILS,
    REACHING_DEFINITION_INDEX_LIMIT,
    REACHING_DEFINITION_TABLE_ADDRESS,
    TARGET_NINJI_SHA256,
    TARGET_SHA256,
    SnapshotError,
    SnapshotReader,
    function_identity,
    virtual_register_boundary,
)
from stack_frame_trace import TRACE_FORMAT as STACK_FRAME_TRACE_FORMAT


ALLOCATE_REGISTERS_ADDRESS = 0x004CDEF0
SELECT_COLORS_ADDRESS = 0x004CE2D0
CODEGEN_GENERATOR_ADDRESS = 0x004351C0
INITIAL_PCODE_ADDRESS = 0x00435B04
OPTIMIZED_PCODE_ADDRESS = 0x00435B39
POST_SCHEDULER_PCODE_ADDRESS = 0x00435BAF
FORWARD_PEEPHOLE_PCODE_ADDRESS = 0x00435BFD
# Post-register-allocation stages. Each address is the point where
# CodeGen_Generator's conditional dump block for that stage reconverges, so the
# breakpoint is reached whether or not the compiler's own dumping is enabled.
# The stage names are the compiler's, taken from the labels it passes to the
# dump routine at 0x004c4bd0.
REGISTER_COLORING_PCODE_ADDRESS = 0x00435C26
EPILOGUE_PROLOGUE_PCODE_ADDRESS = 0x00435CDC
MERGED_EPILOGUE_PCODE_ADDRESS = 0x00435D1A
PEEPHOLE_OPTIMIZATION_PCODE_ADDRESS = 0x00435D43
FINAL_PCODE_ADDRESS = 0x00435DB6
CODE_MOTION_INSTRUCTION_ADDRESS = 0x00524E04
CODE_MOTION_DECISION_POINTS = {
    0x00524E40: "00526d80",
    0x00524E55: "00526b50",
    0x00524E6D: "005266e0",
    0x00524EB2: "00526500",
    0x00524EEA: "00525fc0",
}
CODE_MOTION_ACCEPT_ADDRESS = 0x00524EF1
CODE_MOTION_FINISH_ADDRESS = 0x00524F05
CODE_MOTION_RETURN_ADDRESS = 0x00525066
PCODE_EMIT_ADDRESS = 0x004A25D0
PCODE_CREATE_ADDRESS = 0x004A2620
PCODE_BUILDER_RETURN_ADDRESS = 0x004A2B6D
PCODE_ARENA_ALLOCATOR_RETURN_ADDRESS = 0x00441FD5
PCODE_CLONE_ADDRESS = 0x0049D270
PCODE_CLONE_RETURN_ADDRESS = 0x0049D2EC
CURRENT_CODEGEN_ITEM_ADDRESS = 0x00587130
VIRTUAL_REGISTER_ALLOCATORS = {
    0x004C1F60: ("vr", "single"),
    0x004C2040: ("fpr", "single"),
    0x004C2120: ("gpr", "pair"),
    0x004C2280: ("gpr", "single"),
}
PCODE_WRAPPERS = {
    PCODE_EMIT_ADDRESS: "emit",
    PCODE_CREATE_ADDRESS: "create",
}
REGISTER_CLASS_NAMES = {0: "gpr", 1: "fpr", 9: "vr"}
CAPTURE_TARGETS = {
    "stock": ("GC/1.2.5", TARGET_SHA256),
    "ninji": ("GC/1.2.5n", TARGET_NINJI_SHA256),
}
VIRTUAL_REGISTER_SITE_CATALOGS = {
    "stock": "GC_1_2_5",
    "ninji": "GC_1_2_5n",
}
VIRTUAL_REGISTER_COUNTER_RESET_ADDRESS = 0x004C23C0
# The only rule the registrar at 0x004c6320 installs for opcode 0x3f (ADDI).
PEEPHOLE_ADDI_RULE_ADDRESS = 0x004C8D90
STACK_OBJECT_ALLOCATOR_ADDRESS = 0x004AC4A0
STACK_OBJECT_ALIGNMENT_RETURN_ADDRESS = 0x004AC4AE
STACK_OBJECT_ALLOCATOR_RETURN_ADDRESS = 0x004AC4D8
STACK_FRAME_FINALIZE_ADDRESS = 0x004AC240
STACK_FRAME_FINALIZE_RETURN_ADDRESS = 0x004AC496
STACK_OBJECT_CURSOR_ADDRESS = 0x00587C80
LOCAL_HOME_LIST_HEAD = 0x00587FB8
LOCAL_HOMING_LOOP_ADDRESS = 0x00436CDD
LOCAL_OBJECT_INSERTION_SITES = {
    0x0047769F: ("004775c0", 0x10, "ebx"),
    0x0047AFBB: ("0047aa20", 0x50, None),
    0x0049018C: ("00490130", 0x08, "ebx"),
    0x004C0EB0: ("004c0d10", 0x20, None),
}
STACK_FRAME_CHECKPOINT_ADDRESSES = (
    0x004AC2C3,
    0x004AC300,
    0x004AC324,
    0x004AC33F,
    0x004AC392,
    0x004AC3D5,
    0x004AC403,
    0x004AC474,
    0x004AC48B,
)
STACK_FRAME_STATE_FIELDS = {
    "object_slot_cursor": (0x00587C80, "u32"),
    "secondary_cursor_0058712c": (0x0058712C, "u32"),
    "frame_alignment_00587e40": (0x00587E40, "u32"),
    "frame_size_0058825c": (0x0058825C, "u32"),
    "final_frame_size_005871b4": (0x005871B4, "u32"),
    "linkage_size_005880cc": (0x005880CC, "u32"),
    "vector_save_span": (0x005883EA, "u16"),
    "fpr_save_span": (0x00588438, "u16"),
    "gpr_save_span": (0x0058843A, "u16"),
    "region_0058764c": (0x0058764C, "u32"),
    "region_005880d8": (0x005880D8, "u32"),
    "region_005876a8": (0x005876A8, "u32"),
    "padding_00587188": (0x00587188, "u32"),
    "region_00587634": (0x00587634, "u32"),
    "padding_00587158": (0x00587158, "u32"),
    "region_00587638": (0x00587638, "u32"),
    "padding_00587fcc": (0x00587FCC, "u32"),
}


def load_virtual_register_sites(target):
    version = VIRTUAL_REGISTER_SITE_CATALOGS[target]
    path = REPOSITORY_DIR / "config" / version / "virtual_register_sites.json"
    with path.open(encoding="utf-8") as stream:
        catalog = json.load(stream)
    if catalog.get("format") != "mwcc-virtual-register-sites-v1":
        raise gdb.GdbError(f"unsupported virtual-register site catalog: {path}")
    if catalog.get("target_sha256") != CAPTURE_TARGETS[target][1]:
        raise gdb.GdbError(f"virtual-register site catalog hash mismatch: {path}")
    return [
        {
            **site,
            "address": int(site["address"], 0),
            "counter_address": int(site["counter_address"], 0),
        }
        for site in catalog["sites"]
    ]


def snapshot_reader(session=None):
    inferior = gdb.selected_inferior()
    compiler, target_sha256 = CAPTURE_TARGETS["stock"]
    if session is not None:
        compiler = session.compiler
        target_sha256 = session.target_sha256
    return SnapshotReader(
        lambda address, size: bytes(inferior.read_memory(address, size)),
        compiler,
        target_sha256,
    )


def write_snapshot(output, snapshot):
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as stream:
        json.dump(snapshot, stream, indent=2)
        stream.write("\n")


def optional_raw(reader, address, size):
    if address == 0:
        return None
    try:
        return reader.raw(address, size).hex()
    except gdb.MemoryError:
        return None


def optional_c_string(reader, address):
    if address == 0:
        return None
    try:
        return reader.c_string(address)
    except (gdb.MemoryError, SnapshotError, ValueError):
        return None


def optional_function_identity(reader, function_pointer):
    try:
        return function_identity(reader, function_pointer)
    except (gdb.MemoryError, SnapshotError, ValueError):
        return {
            "function_object": f"0x{function_pointer:08x}",
            "canonical_object": None,
            "alias_objects": [],
            "kind": None,
            "name_record": None,
            "name": None,
            "status": "unreadable",
        }


def optional_compiler_object(reader, address):
    if address == 0:
        return None
    try:
        type_address = reader.u32(address + 0x0E)
        opaque_value_0a = reader.u32(address + 0x0A)
        info_26 = reader.u32(address + 0x26)
        info_2e = reader.u32(address + 0x2E)
        result = {
            "address": f"0x{address:08x}",
            "header": reader.raw(address, 0x32).hex(),
            "object_tag_00": reader.u8(address),
            "kind_02": reader.u8(address + 0x02),
            "opaque_value_0a": f"0x{opaque_value_0a:08x}",
            "opaque_name": optional_c_string(reader, opaque_value_0a + 0x0A),
            "opaque_value_0a_data": optional_raw(
                reader, opaque_value_0a, 0x40
            ),
            "type_address": f"0x{type_address:08x}",
            "flags_12": reader.u32(address + 0x12),
            "stack_offset_2a": reader.u32(address + 0x2A),
            "register_info_26": optional_register_info(reader, info_26),
            "register_info_2e": optional_register_info(reader, info_2e),
            "type": None,
        }
        if type_address != 0:
            result["type"] = {
                "header": reader.raw(type_address, 0x0F).hex(),
                "kind_00": reader.u8(type_address),
                "size_02": reader.u32(type_address + 0x02),
                "flags_0a": reader.u32(type_address + 0x0A),
                "subtype_0e": reader.u8(type_address + 0x0E),
            }
        return result
    except gdb.MemoryError:
        return None


def stack_frame_state(reader):
    result = {}
    for name, (address, value_type) in STACK_FRAME_STATE_FIELDS.items():
        result[name] = getattr(reader, value_type)(address)
    return result


def optional_register_info(reader, address):
    if address == 0:
        return None
    try:
        return {
            "address": f"0x{address:08x}",
            "header": reader.raw(address, 0x2C).hex(),
            "physical_register_24": reader.s16(address + 0x24),
            "secondary_register_26": reader.s16(address + 0x26),
            "is_fpr_28": reader.u8(address + 0x28),
            "is_vector_2a": reader.u8(address + 0x2A),
        }
    except gdb.MemoryError:
        return None


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
            internal=True,
        )
        self.session = session
        self.function_index = session.function_index
        self.function_identity = session.function_identity
        self.attempt = attempt
        self.reg_class = reg_class

    def stop(self):
        if not self.session.capture_current:
            return False
        reader = snapshot_reader(self.session)
        snapshot = reader.coloring_snapshot(
            self.reg_class,
            0,
            int(gdb.parse_and_eval("$pc")),
        )
        snapshot["capture_index"] = self.function_index
        snapshot["function_identity"] = self.function_identity
        snapshot["attempt"] = self.attempt
        snapshot["phase"] = "after"
        output = self.session.coloring_path(
            self.function_index, self.reg_class, self.attempt, "after"
        )
        write_snapshot(output, snapshot)
        self.enabled = False
        return False


class ColoringBreakpoint(gdb.Breakpoint):
    def __init__(self, session):
        super().__init__(
            f"*0x{SELECT_COLORS_ADDRESS:08x}",
            internal=True,
        )
        self.session = session

    def stop(self):
        if not self.session.capture_current:
            return False
        reader = snapshot_reader(self.session)
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        reg_class = reader.u32(stack_pointer + 4)
        if reg_class not in REGISTER_CLASS_NAMES:
            return False

        simplify_stack = reader.u32(stack_pointer + 8)
        return_address = reader.u32(stack_pointer)
        attempt = self.session.coloring_attempts.get(reg_class, 0) + 1
        self.session.coloring_attempts[reg_class] = attempt
        snapshot = reader.coloring_snapshot(
            reg_class, simplify_stack, int(gdb.parse_and_eval("$pc"))
        )
        self.session.annotate(snapshot)
        snapshot["attempt"] = attempt
        snapshot["phase"] = "before"
        output = self.session.coloring_path(
            self.session.function_index, reg_class, attempt, "before"
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
            internal=True,
        )
        self.session = session

    def stop(self):
        reader = snapshot_reader(self.session)
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        function_pointer = reader.u32(stack_pointer + 4)
        if not self.session.active:
            self.session.begin_function(function_pointer)
        if not self.session.capture_current:
            return False
        self.session.coloring_attempts = {}
        snapshot = reader.snapshot(
            function_pointer, int(gdb.parse_and_eval("$pc"))
        )
        self.session.annotate(snapshot)
        self.session.record_virtual_register_boundary("allocator", snapshot)
        output = self.session.output / (
            f"allocator-{self.session.function_index:04d}.json"
        )
        write_snapshot(output, snapshot)
        self.session.write_creation_trace("allocator", snapshot)
        instruction_count = sum(
            len(block["instructions"]) for block in snapshot["blocks"]
        )
        gdb.write(
            f"Captured allocator {self.session.function_index}: "
            f"{len(snapshot['blocks'])} blocks, {instruction_count} instructions\n"
        )
        return False


class CodeGenBreakpoint(gdb.Breakpoint):
    def __init__(self, session):
        super().__init__(
            f"*0x{CODEGEN_GENERATOR_ADDRESS:08x}",
            internal=True,
        )
        self.session = session

    def stop(self):
        reader = snapshot_reader(self.session)
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        function_pointer = reader.u32(stack_pointer + 8)
        self.session.begin_function(function_pointer)
        return False


class LocalObjectInsertionBreakpoint(gdb.Breakpoint):
    """Record one prepend to the local-object list at 0x587fb8.

    Source and front-end insertions precede CodeGen_Generator, so they are
    buffered until CodeGen identifies the function being compiled. The
    optimizer insertion at 0x004c0eb0 can occur after that boundary and is
    appended directly to the active function's trace.
    """

    def __init__(self, session, address, site):
        super().__init__(f"*0x{address:08x}", internal=True)
        self.session = session
        self.address = address
        self.routine, self.return_address_offset, self.source_register = site

    def stop(self):
        reader = snapshot_reader(self.session)
        node = int(gdb.parse_and_eval("$eax")) & 0xFFFFFFFF
        try:
            object_address = reader.u32(node + 4)
            previous_head = reader.u32(LOCAL_HOME_LIST_HEAD)
            stack_pointer = int(gdb.parse_and_eval("$esp"))
            caller_return_address = reader.u32(
                stack_pointer + self.return_address_offset
            )
        except gdb.MemoryError:
            return False
        source_object_address = None
        source_object = None
        if self.source_register is not None:
            source_object_address = (
                int(gdb.parse_and_eval(f"${self.source_register}"))
                & 0xFFFFFFFF
            )
            source_object = optional_compiler_object(
                reader, source_object_address
            )
        inline_context = None
        if caller_return_address in (0x00512A81, 0x00512BEF):
            inline_descriptor = reader.u32(stack_pointer + 0x4C)
            inline_function_object = reader.u32(stack_pointer + 0x48)
            if caller_return_address == 0x00512A81:
                item_descriptor = int(gdb.parse_and_eval("$ebp"))
                item_index = reader.u32(stack_pointer)
            else:
                item_descriptor = reader.u32(stack_pointer)
                item_index = reader.u32(stack_pointer + 0x2C)
            inline_context = {
                "inline_routine": "00512a00",
                "inline_caller_return_address": (
                    f"0x{reader.u32(stack_pointer + 0x44):08x}"
                ),
                "inline_function_object": (
                    f"0x{inline_function_object:08x}"
                ),
                "inline_function_identity": optional_function_identity(
                    reader, inline_function_object
                ),
                "inline_descriptor": f"0x{inline_descriptor:08x}",
                "inline_descriptor_data": optional_raw(
                    reader, inline_descriptor, 0x20
                ),
                "formal_count": reader.u16(inline_descriptor),
                "local_count": reader.u16(inline_descriptor + 0x06),
                "item_count": reader.u16(inline_descriptor + 0x0C),
                "source_line_end": reader.u32(inline_descriptor + 0x16),
                "source_line_start": reader.u32(inline_descriptor + 0x1C),
                "inline_actuals": (
                    f"0x{reader.u32(stack_pointer + 0x50):08x}"
                ),
                "item_index": item_index,
                "item_descriptor": f"0x{item_descriptor:08x}",
                "item_descriptor_data": optional_raw(
                    reader, item_descriptor, 0x10
                ),
            }
        frames = []
        frame = gdb.newest_frame()
        while frame is not None and len(frames) < 12:
            try:
                pc = int(frame.pc()) & 0xFFFFFFFF
            except gdb.error:
                break
            frames.append(
                {
                    "program_counter": f"0x{pc:08x}",
                    "name": frame.name(),
                }
            )
            frame = frame.older()
        event = {
            "insertion_address": f"0x{self.address:08x}",
            "insertion_routine": self.routine,
            "caller_return_address": f"0x{caller_return_address:08x}",
            "node": f"0x{node:08x}",
            "previous_head": f"0x{previous_head:08x}",
            "object_address": f"0x{object_address:08x}",
            "object": optional_compiler_object(reader, object_address),
            "source_object_address": (
                f"0x{source_object_address:08x}"
                if source_object_address is not None
                else None
            ),
            "source_object": source_object,
            "inline_context": inline_context,
            "call_stack": frames,
        }
        if self.address == 0x004C0EB0 and self.session.capture_current:
            event["sequence"] = len(self.session.local_object_insertions)
            self.session.local_object_insertions.append(event)
        else:
            self.session.pending_local_object_insertions.append(event)
        return False


class LocalHomeListBreakpoint(gdb.Breakpoint):
    """Walk the local-object list at 0x587fb8 when the codegen home-reservation
    loop starts, recording every local's committed-register state. A local is
    homed (gets a reserved stack spill slot) iff its register-info
    physical_register (offset 0x24) is 0; a committed register (!= 0) skips the
    home. Comparing homed vs committed locals reveals the source property that
    controls the reserved frame band (e.g. Ground_801C20E0 desc/found)."""

    def __init__(self, session):
        super().__init__(
            f"*0x{LOCAL_HOMING_LOOP_ADDRESS:08x}",
            internal=True,
        )
        self.session = session

    def stop(self):
        if not self.session.capture_current:
            return False
        reader = snapshot_reader(self.session)
        entries = []
        try:
            node = reader.u32(LOCAL_HOME_LIST_HEAD)
        except gdb.MemoryError:
            node = 0
        seen = set()
        while node and node not in seen:
            seen.add(node)
            try:
                object_address = reader.u32(node + 4)
                next_node = reader.u32(node)
            except gdb.MemoryError:
                break
            entries.append(
                {
                    "node": f"0x{node:08x}",
                    "object_address": f"0x{object_address:08x}",
                    "object": optional_compiler_object(reader, object_address),
                }
            )
            node = next_node
        if entries:
            self.session.local_home_list = entries
            self.session.write_home_list_trace()
        return False


class PCodeStageBreakpoint(gdb.Breakpoint):
    def __init__(self, session, address, phase, next_epoch):
        super().__init__(f"*0x{address:08x}", internal=True)
        self.session = session
        self.phase = phase
        self.next_epoch = next_epoch

    def stop(self):
        if not self.session.capture_current:
            return False
        if self.phase == "optimized":
            self.session.pcode_allocation_breakpoint.enabled = False
            self.session.pcode_clone_breakpoint.enabled = False
            self.session.pcode_clone_return_breakpoint.enabled = False
        self.session.write_pcode_stage(
            self.phase,
            int(gdb.parse_and_eval("$pc")),
        )
        self.session.creation_epoch = self.next_epoch
        if self.phase == "initial":
            self.session.pcode_allocation_breakpoint.enabled = True
            self.session.pcode_clone_breakpoint.enabled = True
            self.session.pcode_clone_return_breakpoint.enabled = True
        return False


class PCodeAllocationReturnBreakpoint(gdb.Breakpoint):
    """Record arena allocations made while the backend optimizer runs."""

    def __init__(self, session):
        super().__init__(
            f"*0x{PCODE_ARENA_ALLOCATOR_RETURN_ADDRESS:08x}",
            internal=True,
        )
        self.session = session
        self.enabled = False

    def stop(self):
        if (
            not self.session.capture_current
            or self.session.creation_epoch != "backend_optimization"
        ):
            return False
        reader = snapshot_reader(self.session)
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        return_address = reader.u32(stack_pointer)
        call_address = return_address - 5
        if reader.u8(call_address) != 0xE8:
            call_address = None
        self.session.optimizer_allocations.append(
            {
                "sequence": len(self.session.optimizer_allocations),
                "epoch": self.session.creation_epoch,
                "address": f"0x{int(gdb.parse_and_eval('$eax')):08x}",
                "requested_size": reader.u32(stack_pointer + 4),
                "caller_return_address": f"0x{return_address:08x}",
                "call_address": (
                    f"0x{call_address:08x}" if call_address is not None else None
                ),
            }
        )
        return False


class PCodeCloneBreakpoint(gdb.Breakpoint):
    """Capture the parent and caller when the optimizer clones PCode."""

    def __init__(self, session):
        super().__init__(f"*0x{PCODE_CLONE_ADDRESS:08x}", internal=True)
        self.session = session
        self.enabled = False

    def stop(self):
        if (
            not self.session.capture_current
            or self.session.creation_epoch != "backend_optimization"
        ):
            return False
        reader = snapshot_reader(self.session)
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        return_address = reader.u32(stack_pointer)
        call_address = return_address - 5
        if reader.u8(call_address) != 0xE8:
            call_address = None
        self.session.pending_clones.append(
            {
                "epoch": self.session.creation_epoch,
                "source_address": f"0x{reader.u32(stack_pointer + 4):08x}",
                "caller_return_address": f"0x{return_address:08x}",
                "call_address": (
                    f"0x{call_address:08x}" if call_address is not None else None
                ),
            }
        )
        return False


class PCodeCloneReturnBreakpoint(gdb.Breakpoint):
    def __init__(self, session):
        super().__init__(f"*0x{PCODE_CLONE_RETURN_ADDRESS:08x}", internal=True)
        self.session = session
        self.enabled = False

    def stop(self):
        if not self.session.capture_current or not self.session.pending_clones:
            return False
        reader = snapshot_reader(self.session)
        clone = self.session.pending_clones.pop()
        destination = int(gdb.parse_and_eval("$eax"))
        source = int(clone["source_address"], 0)
        clone["sequence"] = len(self.session.clone_events)
        clone["destination_address"] = f"0x{destination:08x}"
        clone["source_instruction"] = reader.instruction(source)
        clone["destination_instruction"] = reader.instruction(destination)
        if (
            clone["source_instruction"]["opcode"]
            != clone["destination_instruction"]["opcode"]
        ):
            raise gdb.GdbError("PCode clone changed opcode during copy")
        self.session.clone_events.append(clone)
        return False


class VirtualRegisterReturnBreakpoint(gdb.Breakpoint):
    def __init__(self, session, event, return_address):
        super().__init__(f"*0x{return_address:08x}", internal=True)
        self.session = session
        self.event = event

    def stop(self):
        if not self.session.capture_current:
            self.enabled = False
            return False
        reader = snapshot_reader(self.session)
        self.event["sequence"] = len(self.session.virtual_register_events)
        self.event["object_after"] = optional_compiler_object(
            reader, int(self.event["object_address"], 0)
        )
        self.session.virtual_register_events.append(self.event)
        self.enabled = False
        return False


class VirtualRegisterAllocatorBreakpoint(gdb.Breakpoint):
    def __init__(self, session, address):
        super().__init__(f"*0x{address:08x}", internal=True)
        self.session = session
        self.address = address

    def stop(self):
        if not self.session.capture_current:
            return False
        reader = snapshot_reader(self.session)
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        return_address = reader.u32(stack_pointer)
        call_address = return_address - 5
        if reader.u8(call_address) != 0xE8:
            call_address = None
        object_address = reader.u32(stack_pointer + 4)
        reg_class, allocation_kind = VIRTUAL_REGISTER_ALLOCATORS[self.address]
        detail = OBJECT_VIRTUAL_REGISTER_ALLOCATOR_DETAILS[self.address]
        event = {
            "epoch": self.session.creation_epoch,
            "allocator_address": f"0x{self.address:08x}",
            "register_class": reg_class,
            "allocation_kind": allocation_kind,
            "allocator_function": detail["function"],
            "allocator_operation": detail["operation"],
            "allocator_operation_category": detail["operation_category"],
            "allocator_evidence": detail["evidence"],
            "allocator_evidence_source": detail["evidence_source"],
            "caller_return_address": f"0x{return_address:08x}",
            "call_address": (
                f"0x{call_address:08x}" if call_address is not None else None
            ),
            "object_address": f"0x{object_address:08x}",
            "object_before": optional_compiler_object(reader, object_address),
            "codegen_item_address": (
                f"0x{reader.u32(CURRENT_CODEGEN_ITEM_ADDRESS):08x}"
            ),
        }
        VirtualRegisterReturnBreakpoint(self.session, event, return_address)
        return False


class DirectVirtualRegisterBreakpoint(gdb.Breakpoint):
    """Capture a verified direct virtual-register counter increment."""

    def __init__(self, session, site):
        super().__init__(f"*0x{site['address']:08x}", internal=True)
        self.session = session
        self.site = site

    def stop(self):
        if self.site["allocation_kind"] == "object_allocator_internal":
            return False
        reader = snapshot_reader(self.session)
        event = {
            "epoch": self.session.creation_epoch,
            "allocator_address": f"0x{self.site['address']:08x}",
            "allocator_write_return_address": None,
            "allocator_address_is_post_write": False,
            "register_class": self.site["register_class"],
            "allocation_kind": "temporary",
            "allocator_function": self.site.get("function"),
            "allocator_operation": self.site.get("operation"),
            "allocator_operation_category": self.site.get(
                "operation_category"
            ),
            "allocator_evidence": self.site.get("evidence"),
            "allocator_evidence_source": self.site.get("evidence_source"),
            "caller_return_address": None,
            "call_address": None,
            "object_address": "0x00000000",
            "object_before": None,
            "object_after": None,
            "codegen_item_address": (
                f"0x{reader.u32(CURRENT_CODEGEN_ITEM_ADDRESS):08x}"
            ),
            "primary_register": reader.s16(self.site["counter_address"]),
            "secondary_register": None,
        }
        if not self.session.capture_current:
            self.session.pending_frontend_virtual_register_events.append(event)
        else:
            event["sequence"] = len(self.session.virtual_register_events)
            self.session.virtual_register_events.append(event)
        return False


class VirtualRegisterCounterResetBreakpoint(gdb.Breakpoint):
    """Delimit pre-CodeGen allocation events at the register-counter reset."""

    def __init__(self, session):
        super().__init__(
            f"*0x{VIRTUAL_REGISTER_COUNTER_RESET_ADDRESS:08x}", internal=True
        )
        self.session = session

    def stop(self):
        self.session.pending_frontend_virtual_register_events = []
        if self.session.capture_current:
            self.session.virtual_register_events = []
        return False


class PCodeWrapperBreakpoint(gdb.Breakpoint):
    def __init__(self, session, address):
        super().__init__(f"*0x{address:08x}", internal=True)
        self.session = session
        self.address = address

    def stop(self):
        if not self.session.capture_current:
            return False
        reader = snapshot_reader(self.session)
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        return_address = reader.u32(stack_pointer)
        call_address = return_address - 5
        if reader.u8(call_address) != 0xE8:
            call_address = None
        codegen_item = reader.u32(CURRENT_CODEGEN_ITEM_ADDRESS)
        item_fields = None
        expression_fields = None
        pointer_0a_data = None
        pointer_0e_data = None
        if codegen_item:
            item_kind = reader.u8(codegen_item + 0x04)
            pointer_0a = reader.u32(codegen_item + 0x0A)
            pointer_0e = reader.u32(codegen_item + 0x0E)
            item_fields = {
                "kind_04": item_kind,
                "byte_05": reader.u8(codegen_item + 0x05),
                "flags_06": reader.u8(codegen_item + 0x06),
                "byte_07": reader.u8(codegen_item + 0x07),
                "value_08": reader.u16(codegen_item + 0x08),
                "pointer_0a": f"0x{pointer_0a:08x}",
                "pointer_0e": f"0x{pointer_0e:08x}",
                "pointer_16": f"0x{reader.u32(codegen_item + 0x16):08x}",
            }
            pointer_0a_data = optional_raw(reader, pointer_0a, 0x20)
            pointer_0e_data = optional_raw(reader, pointer_0e, 0x20)
            if 4 <= item_kind <= 0x0F and pointer_0a:
                expression_kind = reader.u8(pointer_0a)
                expression_fields = {
                    "kind_00": expression_kind,
                    "value_0a": f"0x{reader.u32(pointer_0a + 0x0A):08x}",
                    "value_0e": f"0x{reader.u32(pointer_0a + 0x0E):08x}",
                    "value_12": f"0x{reader.u32(pointer_0a + 0x12):08x}",
                }
                if expression_kind == 0x38:
                    expression_fields["object_0a"] = optional_compiler_object(
                        reader, reader.u32(pointer_0a + 0x0A)
                    )
        self.session.pending_creations.append(
            {
                "epoch": self.session.creation_epoch,
                "wrapper": PCODE_WRAPPERS[self.address],
                "wrapper_address": f"0x{self.address:08x}",
                "caller_return_address": f"0x{return_address:08x}",
                "call_address": (
                    f"0x{call_address:08x}" if call_address is not None else None
                ),
                "opcode_argument": reader.s16(stack_pointer + 4),
                "codegen_item_address": f"0x{codegen_item:08x}",
                "codegen_item_header": (
                    reader.raw(codegen_item, 0x1A).hex() if codegen_item else None
                ),
                "codegen_item_fields": item_fields,
                "codegen_expression_fields": expression_fields,
                "codegen_pointer_0a_data": pointer_0a_data,
                "codegen_pointer_0e_data": pointer_0e_data,
            }
        )
        return False


class PCodeBuilderReturnBreakpoint(gdb.Breakpoint):
    def __init__(self, session):
        super().__init__(
            f"*0x{PCODE_BUILDER_RETURN_ADDRESS:08x}",
            internal=True,
        )
        self.session = session

    def stop(self):
        if not self.session.capture_current or not self.session.pending_creations:
            return False
        pending = self.session.pending_creations.pop()
        instruction_pointer = int(gdb.parse_and_eval("$eax"))
        reader = snapshot_reader(self.session)
        instruction = reader.instruction(instruction_pointer)
        for operand in instruction["operands"]:
            object_address = int(operand["object"], 0)
            operand["compiler_object"] = optional_compiler_object(
                reader, object_address
            )
        if instruction["opcode"] != pending["opcode_argument"]:
            raise gdb.GdbError(
                "PCode creation opcode changed between wrapper and builder"
            )
        pending["sequence"] = len(self.session.creation_events)
        pending["builder_return_address"] = (
            f"0x{PCODE_BUILDER_RETURN_ADDRESS:08x}"
        )
        pending["instruction"] = instruction
        self.session.creation_events.append(pending)
        return False


class CodeMotionInstructionBreakpoint(gdb.Breakpoint):
    """Start a trace row for one instruction considered by loop motion."""

    def __init__(self, session):
        super().__init__(
            f"*0x{CODE_MOTION_INSTRUCTION_ADDRESS:08x}", internal=True
        )
        self.session = session

    def stop(self):
        if not self.session.capture_current:
            return False
        self.session.finish_code_motion_event()
        reader = snapshot_reader(self.session)
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        instruction_address = int(gdb.parse_and_eval("$ebx"))
        node_address = reader.u32(stack_pointer + 0x24)
        instruction = reader.instruction(instruction_address)
        block_address = reader.u32(instruction_address + 0x08)
        for operand in instruction["operands"]:
            object_address = int(operand["object"], 0)
            operand["compiler_object"] = optional_compiler_object(
                reader, object_address
            )
            operand["object_raw_80"] = optional_raw(reader, object_address, 0x80)
        self.session.pending_code_motion_event = {
            "sequence": len(self.session.code_motion_events),
            "instruction": instruction,
            "block": {
                "address": f"0x{block_address:08x}",
                "index": reader.s32(block_address + 0x1C),
                "execution_weight": reader.s32(block_address + 0x28),
            },
            "node": {
                "address": f"0x{node_address:08x}",
                "instruction_count": reader.s32(node_address + 0x38),
            },
            "predicate_results": {},
            "moved": False,
        }
        return False


class CodeMotionPredicateBreakpoint(gdb.Breakpoint):
    """Record one fixed call-site result in COpt_00524d90's short circuit."""

    def __init__(self, session, address, predicate):
        super().__init__(f"*0x{address:08x}", internal=True)
        self.session = session
        self.predicate = predicate

    def stop(self):
        event = self.session.pending_code_motion_event
        if self.session.capture_current and event is not None:
            event["predicate_results"][self.predicate] = int(
                gdb.parse_and_eval("$eax")
            )
        return False


class CodeMotionAcceptBreakpoint(gdb.Breakpoint):
    def __init__(self, session):
        super().__init__(f"*0x{CODE_MOTION_ACCEPT_ADDRESS:08x}", internal=True)
        self.session = session

    def stop(self):
        event = self.session.pending_code_motion_event
        if self.session.capture_current and event is not None:
            event["moved"] = True
            event["decision_path"] = (
                "fallback"
                if "00525fc0" in event["predicate_results"]
                else "direct"
            )
        return False


class CodeMotionFinishBreakpoint(gdb.Breakpoint):
    def __init__(self, session, address):
        super().__init__(f"*0x{address:08x}", internal=True)
        self.session = session

    def stop(self):
        if self.session.capture_current:
            self.session.finish_code_motion_event()
        return False


class PeepholeRuleEntryBreakpoint(gdb.Breakpoint):
    """Record the inputs of one post-allocation ADDI combine invocation.

    The dispatcher at `0x004c7a30` walks a block backwards and calls each rule
    registered for the current opcode with `(instruction, gpr_live, fpr_live,
    live_3, live_9)`. Only the rule's inputs are recorded here: its reaching
    definition comes from a table that `0x004cc180` builds inside the pass, so
    it cannot be read from a stage breakpoint, and every remaining precondition
    is a function of the captured instruction stream. `replay_trace` in
    `tools/post_allocation_peephole.py` decides the outcome from these inputs,
    which keeps the capture to one stop per candidate.
    """

    def __init__(self, session):
        super().__init__(f"*0x{PEEPHOLE_ADDI_RULE_ADDRESS:08x}", internal=True)
        self.session = session

    def stop(self):
        if not self.session.capture_current:
            return False
        reader = snapshot_reader(self.session)
        stack = int(gdb.parse_and_eval("$esp"))
        candidate_address = reader.u32(stack + 4)
        candidate = reader.instruction(candidate_address)
        table = reader.u32(REACHING_DEFINITION_TABLE_ADDRESS)
        definition = None
        index = candidate["definition_index"]
        if table and 0 < index < REACHING_DEFINITION_INDEX_LIMIT:
            definition_address = reader.u32(table + 4 + index * 4)
            if definition_address:
                definition = reader.instruction(definition_address)
        self.session.peephole_events.append(
            {
                "sequence": len(self.session.peephole_events),
                "candidate": candidate,
                "live_registers": f"0x{reader.u32(stack + 8):08x}",
                "reaching_definition": definition,
            }
        )
        return False


class StackObjectAllocatorBreakpoint(gdb.Breakpoint):
    """Begin one exact StackFrameEABI_004ac4a0 allocation event."""

    def __init__(self, session):
        super().__init__(f"*0x{STACK_OBJECT_ALLOCATOR_ADDRESS:08x}", internal=True)
        self.session = session

    def stop(self):
        if not self.session.capture_current:
            return False
        if self.session.pending_stack_object_allocation is not None:
            raise gdb.GdbError("nested stack-object allocation")
        reader = snapshot_reader(self.session)
        stack_pointer = int(gdb.parse_and_eval("$esp"))
        object_address = reader.u32(stack_pointer + 4)
        object_before = optional_compiler_object(reader, object_address)
        if object_before is None or object_before.get("type") is None:
            raise gdb.GdbError("stack-object allocation has no readable type")
        return_address = reader.u32(stack_pointer)
        call_address = return_address - 5
        if reader.u8(call_address) != 0xE8:
            call_address = None
        self.session.pending_stack_object_allocation = {
            "allocator_address": f"0x{STACK_OBJECT_ALLOCATOR_ADDRESS:08x}",
            "alignment_routine_address": "0x004aaa40",
            "caller_return_address": f"0x{return_address:08x}",
            "call_address": (
                f"0x{call_address:08x}" if call_address is not None else None
            ),
            "object_address": f"0x{object_address:08x}",
            "cursor_before": reader.u32(STACK_OBJECT_CURSOR_ADDRESS),
            "size": object_before["type"]["size_02"],
            "object_before": object_before,
        }
        return False


class StackObjectAlignmentBreakpoint(gdb.Breakpoint):
    """Capture 0x004aaa40's returned alignment before the slot write."""

    def __init__(self, session):
        super().__init__(
            f"*0x{STACK_OBJECT_ALIGNMENT_RETURN_ADDRESS:08x}", internal=True
        )
        self.session = session

    def stop(self):
        event = self.session.pending_stack_object_allocation
        if not self.session.capture_current or event is None:
            return False
        event["alignment"] = int(gdb.parse_and_eval("$eax")) & 0xFFFF
        return False


class StackObjectAllocatorReturnBreakpoint(gdb.Breakpoint):
    """Finish one object allocation after +0x2a and the cursor are updated."""

    def __init__(self, session):
        super().__init__(
            f"*0x{STACK_OBJECT_ALLOCATOR_RETURN_ADDRESS:08x}", internal=True
        )
        self.session = session

    def stop(self):
        event = self.session.pending_stack_object_allocation
        if not self.session.capture_current or event is None:
            return False
        if "alignment" not in event:
            raise gdb.GdbError("stack-object allocation missed alignment return")
        reader = snapshot_reader(self.session)
        object_address = int(event["object_address"], 0)
        event["sequence"] = len(self.session.stack_object_allocations)
        event["slot"] = reader.u32(object_address + 0x2A)
        event["cursor_after"] = reader.u32(STACK_OBJECT_CURSOR_ADDRESS)
        event["object_after"] = optional_compiler_object(reader, object_address)
        self.session.stack_object_allocations.append(event)
        self.session.pending_stack_object_allocation = None
        return False


class StackFrameCheckpointBreakpoint(gdb.Breakpoint):
    """Record exact global state at one 0x004ac240 control-flow point."""

    def __init__(self, session, address):
        super().__init__(f"*0x{address:08x}", internal=True)
        self.session = session
        self.address = address

    def stop(self):
        if not self.session.capture_current:
            return False
        reader = snapshot_reader(self.session)
        if self.address == STACK_FRAME_FINALIZE_ADDRESS:
            stack_pointer = int(gdb.parse_and_eval("$esp"))
            self.session.stack_frame_finalization = {
                "routine_address": f"0x{STACK_FRAME_FINALIZE_ADDRESS:08x}",
                "function_argument": f"0x{reader.u32(stack_pointer + 4):08x}",
                "checkpoints": [],
            }
        finalization = self.session.stack_frame_finalization
        if finalization is None:
            raise gdb.GdbError("stack-frame checkpoint preceded routine entry")
        finalization["checkpoints"].append(
            {
                "sequence": len(finalization["checkpoints"]),
                "program_counter": f"0x{self.address:08x}",
                "routine_offset": f"+0x{self.address - STACK_FRAME_FINALIZE_ADDRESS:x}",
                "state": stack_frame_state(reader),
            }
        )
        if self.address == STACK_FRAME_FINALIZE_RETURN_ADDRESS:
            self.session.write_stack_frame_trace()
        return False


class CaptureSession:
    def __init__(
        self,
        output,
        target_index=None,
        target_name=None,
        trace_peephole=False,
        target="stock",
    ):
        self.output = output
        self.target_index = target_index
        self.target_name = target_name
        self.compiler, self.target_sha256 = CAPTURE_TARGETS[target]
        self.function_index = 0
        self.function_pointer = 0
        self.function_identity = None
        self.coloring_attempts = {}
        self.active = False
        self.capture_current = False
        self.creation_epoch = "initial_lowering"
        self.creation_events = []
        self.pending_creations = []
        self.optimizer_allocations = []
        self.clone_events = []
        self.pending_clones = []
        self.virtual_register_events = []
        self.pending_frontend_virtual_register_events = []
        self.virtual_register_boundaries = []
        self.previous_virtual_register_counts = {
            register_class: FIRST_VIRTUAL_REGISTER
            for register_class in REGISTER_CLASS_NAMES.values()
        }
        self.code_motion_events = []
        self.pending_code_motion_event = None
        self.peephole_events = []
        self.stack_object_allocations = []
        self.local_home_list = []
        self.local_object_insertions = []
        self.pending_local_object_insertions = []
        self.pending_stack_object_allocation = None
        self.stack_frame_finalization = None
        self.pcode_allocation_breakpoint = PCodeAllocationReturnBreakpoint(self)
        self.pcode_clone_breakpoint = PCodeCloneBreakpoint(self)
        self.pcode_clone_return_breakpoint = PCodeCloneReturnBreakpoint(self)
        self.virtual_register_breakpoints = [
            VirtualRegisterAllocatorBreakpoint(self, address)
            for address in VIRTUAL_REGISTER_ALLOCATORS
        ]
        self.direct_virtual_register_breakpoints = [
            DirectVirtualRegisterBreakpoint(self, site)
            for site in load_virtual_register_sites(target)
            if site["allocation_kind"] == "temporary"
        ]
        self.virtual_register_counter_reset_breakpoint = (
            VirtualRegisterCounterResetBreakpoint(self)
        )
        self.codegen_breakpoint = CodeGenBreakpoint(self)
        self.initial_pcode_breakpoint = PCodeStageBreakpoint(
            self,
            INITIAL_PCODE_ADDRESS,
            "initial",
            "backend_optimization",
        )
        self.optimized_pcode_breakpoint = PCodeStageBreakpoint(
            self,
            OPTIMIZED_PCODE_ADDRESS,
            "optimized",
            "post_optimization",
        )
        self.post_scheduler_pcode_breakpoint = PCodeStageBreakpoint(
            self,
            POST_SCHEDULER_PCODE_ADDRESS,
            "scheduled",
            "forward_peephole",
        )
        self.forward_peephole_pcode_breakpoint = PCodeStageBreakpoint(
            self,
            FORWARD_PEEPHOLE_PCODE_ADDRESS,
            "forward_peephole",
            "register_allocation",
        )
        self.post_allocation_pcode_breakpoints = [
            PCodeStageBreakpoint(self, address, phase, next_epoch)
            for address, phase, next_epoch in (
                (
                    REGISTER_COLORING_PCODE_ADDRESS,
                    "register_coloring",
                    "epilogue_prologue",
                ),
                (
                    EPILOGUE_PROLOGUE_PCODE_ADDRESS,
                    "epilogue_prologue",
                    "epilogue_merge",
                ),
                (
                    MERGED_EPILOGUE_PCODE_ADDRESS,
                    "epilogue_merge",
                    "post_allocation_peephole",
                ),
                (
                    PEEPHOLE_OPTIMIZATION_PCODE_ADDRESS,
                    "post_allocation_peephole",
                    "final_scheduling",
                ),
                (FINAL_PCODE_ADDRESS, "final", "final"),
            )
        ]
        self.pcode_wrapper_breakpoints = [
            PCodeWrapperBreakpoint(self, address) for address in PCODE_WRAPPERS
        ]
        self.pcode_builder_return_breakpoint = PCodeBuilderReturnBreakpoint(self)
        self.allocate_breakpoint = AllocateBreakpoint(self)
        self.coloring_breakpoint = ColoringBreakpoint(self)
        self.code_motion_instruction_breakpoint = CodeMotionInstructionBreakpoint(
            self
        )
        self.code_motion_predicate_breakpoints = [
            CodeMotionPredicateBreakpoint(self, address, predicate)
            for address, predicate in CODE_MOTION_DECISION_POINTS.items()
        ]
        self.code_motion_accept_breakpoint = CodeMotionAcceptBreakpoint(self)
        self.code_motion_finish_breakpoints = [
            CodeMotionFinishBreakpoint(self, address)
            for address in (
                CODE_MOTION_FINISH_ADDRESS,
                CODE_MOTION_RETURN_ADDRESS,
            )
        ]
        # Opt-in: the rule runs for every ADDI in every function of the
        # translation unit, and each stop is a gdbstub round trip, so tracing
        # it costs far more than the rest of the capture combined. It must also
        # be created here rather than from a stop handler, because GDB hangs
        # when a breakpoint is inserted while stopped inside one.
        self.peephole_entry_breakpoint = (
            PeepholeRuleEntryBreakpoint(self) if trace_peephole else None
        )
        self.stack_object_allocator_breakpoint = StackObjectAllocatorBreakpoint(
            self
        )
        self.stack_object_alignment_breakpoint = StackObjectAlignmentBreakpoint(
            self
        )
        self.stack_object_allocator_return_breakpoint = (
            StackObjectAllocatorReturnBreakpoint(self)
        )
        self.stack_frame_checkpoint_breakpoints = [
            StackFrameCheckpointBreakpoint(self, address)
            for address in (
                STACK_FRAME_FINALIZE_ADDRESS,
                *STACK_FRAME_CHECKPOINT_ADDRESSES,
                STACK_FRAME_FINALIZE_RETURN_ADDRESS,
            )
        ]
        self.local_home_list_breakpoint = LocalHomeListBreakpoint(self)
        self.local_object_insertion_breakpoints = [
            LocalObjectInsertionBreakpoint(self, address, site)
            for address, site in LOCAL_OBJECT_INSERTION_SITES.items()
        ]

    def begin_function(self, function_pointer):
        self.function_index += 1
        self.function_pointer = function_pointer
        self.function_identity = optional_function_identity(
            snapshot_reader(self), function_pointer
        )
        self.coloring_attempts = {}
        self.active = True
        self.capture_current = (
            (self.target_index is None or self.function_index == self.target_index)
            and (
                self.target_name is None
                or self.function_identity.get("name") == self.target_name
            )
        )
        if self.target_name is not None:
            observed = self.function_identity.get("name") or "<unresolved>"
            gdb.write(f"Observed function {self.function_index}: {observed}\n")
        self.creation_epoch = "initial_lowering"
        self.creation_events = []
        self.pending_creations = []
        self.optimizer_allocations = []
        self.clone_events = []
        self.pending_clones = []
        self.virtual_register_events = (
            self.pending_frontend_virtual_register_events
            if self.capture_current
            else []
        )
        self.pending_frontend_virtual_register_events = []
        self.virtual_register_boundaries = []
        self.previous_virtual_register_counts = {
            register_class: FIRST_VIRTUAL_REGISTER
            for register_class in REGISTER_CLASS_NAMES.values()
        }
        self.code_motion_events = []
        self.pending_code_motion_event = None
        self.peephole_events = []
        self.stack_object_allocations = []
        self.local_home_list = []
        self.local_object_insertions = (
            self.pending_local_object_insertions
            if self.capture_current
            else []
        )
        self.pending_local_object_insertions = []
        self.pending_stack_object_allocation = None
        self.stack_frame_finalization = None
        for sequence, event in enumerate(self.local_object_insertions):
            event["sequence"] = sequence
        for sequence, event in enumerate(self.virtual_register_events):
            event["sequence"] = sequence
        self.pcode_allocation_breakpoint.enabled = False
        self.pcode_clone_breakpoint.enabled = False
        self.pcode_clone_return_breakpoint.enabled = False

    def annotate(self, snapshot):
        snapshot["capture_index"] = self.function_index
        snapshot["function_identity"] = self.function_identity
        return snapshot

    def finish_code_motion_event(self):
        if self.pending_code_motion_event is None:
            return
        self.code_motion_events.append(self.pending_code_motion_event)
        self.pending_code_motion_event = None

    def record_virtual_register_boundary(self, phase, snapshot):
        boundary = virtual_register_boundary(
            phase,
            snapshot["virtual_register_counts"],
            self.previous_virtual_register_counts,
        )
        boundary["initial_object_register_last"] = snapshot[
            "initial_object_register_last"
        ]
        snapshot["virtual_register_boundary"] = boundary
        self.virtual_register_boundaries.append(boundary)
        self.previous_virtual_register_counts = dict(boundary["counts"])

    def write_pcode_stage(self, phase, program_counter):
        reader = snapshot_reader(self)
        snapshot = reader.snapshot(self.function_pointer, program_counter)
        self.annotate(snapshot)
        snapshot["phase"] = phase
        self.record_virtual_register_boundary(phase, snapshot)
        output = self.output / f"pcode-{self.function_index:04d}-{phase}.json"
        write_snapshot(output, snapshot)

        self.write_creation_trace(phase, snapshot)
        if phase == "optimized":
            self.finish_code_motion_event()
            trace = {
                "format": "mwcc-code-motion-trace-v1",
                "compiler": self.compiler,
                "target_sha256": self.target_sha256,
                "capture_index": self.function_index,
                "function_pointer": f"0x{self.function_pointer:08x}",
                "function_identity": self.function_identity,
                "events": self.code_motion_events,
            }
            write_snapshot(
                self.output
                / f"code-motion-{self.function_index:04d}.json",
                trace,
            )

        if phase == "post_allocation_peephole" and (
            self.peephole_entry_breakpoint is not None
        ):
            self.write_peephole_trace()

        instruction_count = sum(
            len(block["instructions"]) for block in snapshot["blocks"]
        )
        gdb.write(
            f"Captured {phase} PCode {self.function_index}: "
            f"{instruction_count} live instructions, "
            f"{len(self.creation_events)} creation events\n"
        )

    def write_peephole_trace(self):
        """Write every ADDI rule invocation seen for this function."""

        trace = {
            "format": "mwcc-peephole-trace-v1",
            "compiler": self.compiler,
            "target_sha256": self.target_sha256,
            "capture_index": self.function_index,
            "function_pointer": f"0x{self.function_pointer:08x}",
            "function_identity": self.function_identity,
            "rule_address": f"0x{PEEPHOLE_ADDI_RULE_ADDRESS:08x}",
            "events": self.peephole_events,
        }
        write_snapshot(
            self.output / f"peephole-{self.function_index:04d}.json", trace
        )
        gdb.write(
            f"Captured peephole trace {self.function_index}: "
            f"{len(self.peephole_events)} ADDI rule invocations\n"
        )

    def write_creation_trace(self, phase, snapshot=None):
        live_instructions = {}
        if snapshot is not None:
            live_instructions = {
                instruction["address"]: instruction
                for block in snapshot["blocks"]
                for instruction in block["instructions"]
            }
        wrapped_addresses = {
            event["instruction"]["address"] for event in self.creation_events
        }
        clone_by_destination = {
            clone["destination_address"]: clone for clone in self.clone_events
        }
        unwrapped_allocations = []
        for allocation in self.optimizer_allocations:
            instruction = live_instructions.get(allocation["address"])
            if instruction is None or allocation["address"] in wrapped_addresses:
                continue
            unwrapped_allocations.append(
                {
                    **allocation,
                    "first_observed_phase": phase,
                    "clone_sequence": (
                        clone_by_destination[allocation["address"]]["sequence"]
                        if allocation["address"] in clone_by_destination
                        else None
                    ),
                    "instruction": instruction,
                }
            )
        trace = {
            "format": "mwcc-pcode-creation-trace-v1",
            "compiler": self.compiler,
            "target_sha256": self.target_sha256,
            "capture_index": self.function_index,
            "function_pointer": f"0x{self.function_pointer:08x}",
            "function_identity": self.function_identity,
            "through_phase": phase,
            "events": self.creation_events,
            "clone_events": self.clone_events,
            "virtual_register_events": self.virtual_register_events,
            "virtual_register_boundaries": self.virtual_register_boundaries,
            "unwrapped_instruction_allocations": unwrapped_allocations,
            "optimizer_allocation_count": len(self.optimizer_allocations),
            "pending_event_count": len(self.pending_creations),
            "pending_clone_count": len(self.pending_clones),
        }
        trace_output = self.output / (
            f"pcode-creations-{self.function_index:04d}-{phase}.json"
        )
        write_snapshot(trace_output, trace)

    def write_stack_frame_trace(self):
        if self.pending_stack_object_allocation is not None:
            raise gdb.GdbError(
                "unfinished stack-object allocation at frame finalization"
            )
        trace = {
            "format": STACK_FRAME_TRACE_FORMAT,
            "compiler": self.compiler,
            "target_sha256": self.target_sha256,
            "capture_index": self.function_index,
            "function_pointer": f"0x{self.function_pointer:08x}",
            "function_identity": self.function_identity,
            "object_allocations": self.stack_object_allocations,
            "frame_finalization": self.stack_frame_finalization,
        }
        output = self.output / (
            f"stack-frame-{self.function_index:04d}.json"
        )
        write_snapshot(output, trace)
        self.write_local_object_trace()
        gdb.write(
            f"Captured stack frame {self.function_index}: "
            f"{len(self.stack_object_allocations)} object slots, "
            f"{len(self.stack_frame_finalization['checkpoints'])} checkpoints\n"
        )

    def write_local_object_trace(self):
        insertion_by_node = {
            event["node"]: event for event in self.local_object_insertions
        }
        insertion_by_object = {
            event["object_address"]: event
            for event in self.local_object_insertions
        }
        allocation_by_object = {
            event["object_address"]: event
            for event in self.stack_object_allocations
        }
        entries = []
        for sequence, entry in enumerate(self.local_home_list):
            object_address = entry["object_address"]
            insertion = insertion_by_node.get(entry["node"])
            if insertion is None:
                insertion = insertion_by_object.get(object_address)
            entries.append(
                {
                    **entry,
                    "sequence": sequence,
                    "insertion": insertion,
                    "stack_allocation": allocation_by_object.get(
                        object_address
                    ),
                }
            )
        trace = {
            "format": "mwcc-local-object-provenance-v1",
            "compiler": self.compiler,
            "target_sha256": self.target_sha256,
            "capture_index": self.function_index,
            "function_pointer": f"0x{self.function_pointer:08x}",
            "function_identity": self.function_identity,
            "insertion_sites": {
                f"0x{address:08x}": {
                    "routine": site[0],
                    "return_address_offset": site[1],
                    "source_register": site[2],
                }
                for address, site in LOCAL_OBJECT_INSERTION_SITES.items()
            },
            "insertions": self.local_object_insertions,
            "entries": entries,
            "frame_finalization": self.stack_frame_finalization,
        }
        output = self.output / (
            f"local-objects-{self.function_index:04d}.json"
        )
        write_snapshot(output, trace)
        gdb.write(
            f"Captured local-object provenance {self.function_index}: "
            f"{len(entries)} locals, "
            f"{len(self.local_object_insertions)} insertions\n"
        )

    def write_home_list_trace(self):
        trace = {
            "format": "mwcc-local-home-list-v1",
            "compiler": self.compiler,
            "target_sha256": self.target_sha256,
            "capture_index": self.function_index,
            "function_pointer": f"0x{self.function_pointer:08x}",
            "function_identity": self.function_identity,
            "entries": self.local_home_list,
        }
        output = self.output / f"home-list-{self.function_index:04d}.json"
        write_snapshot(output, trace)
        gdb.write(
            f"Captured home list {self.function_index}: "
            f"{len(self.local_home_list)} locals\n"
        )

    def coloring_path(self, function_index, reg_class, attempt, phase):
        return self.output / (
            f"coloring-{function_index:04d}-{REGISTER_CLASS_NAMES[reg_class]}-"
            f"{attempt:02d}-{phase}.json"
        )


class MwccAutoCapture(gdb.Command):
    """Capture: mwcc-auto-capture DIR [INDEX|NAME] [stock|ninji] [peephole]"""

    def __init__(self):
        super().__init__("mwcc-auto-capture", gdb.COMMAND_DATA)
        self.session = None

    def invoke(self, argument, from_tty):
        del from_tty
        arguments = gdb.string_to_argv(argument)
        trace_peephole = bool(arguments) and arguments[-1] == "peephole"
        if trace_peephole:
            arguments = arguments[:-1]
        if len(arguments) not in (1, 2, 3):
            raise gdb.GdbError(
                "usage: mwcc-auto-capture DIRECTORY [FUNCTION_INDEX|NAME] "
                "[stock|ninji] [peephole]"
            )
        output = Path(arguments[0])
        target_index = None
        target_name = None
        if len(arguments) >= 2:
            try:
                target_index = int(arguments[1], 0)
            except ValueError:
                target_name = arguments[1]
        target = arguments[2] if len(arguments) == 3 else "stock"
        if target not in CAPTURE_TARGETS:
            raise gdb.GdbError("target must be stock or ninji")
        if target_index is not None and target_index <= 0:
            raise gdb.GdbError("FUNCTION_INDEX must be positive")
        output.mkdir(parents=True, exist_ok=True)
        self.session = CaptureSession(
            output,
            target_index=target_index,
            target_name=target_name,
            target=target,
            trace_peephole=trace_peephole,
        )
        if target_index is not None:
            selection = f"function {target_index}"
        elif target_name is not None:
            selection = f"function {target_name}"
        else:
            selection = "all functions"
        gdb.write(
            f"Capturing {target} MWCC passes for {selection} in {output}"
            f"{' with peephole trace' if trace_peephole else ''}\n"
        )


MwccAllocatorSnapshot()
MwccColoringSnapshot()
MwccAutoCapture()
