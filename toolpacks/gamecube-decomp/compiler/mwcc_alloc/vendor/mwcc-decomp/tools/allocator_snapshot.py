#!/usr/bin/env python3

import argparse
import json
import struct
from pathlib import Path
from typing import Callable


TARGET_SHA256 = "0443b5c02b1aa7b575b61e0e24c4d5ad6bed8fd54cc42de5a2204a5216001914"
TARGET_NINJI_SHA256 = (
    "ccf4b465cec73b5aae9c5c5543dcf8cda8a62aba246f89e2e0b200d742f2e55c"
)
SUPPORTED_TARGETS = {
    TARGET_SHA256: "GC/1.2.5",
    TARGET_NINJI_SHA256: "GC/1.2.5n",
}
PCODE_BLOCKS_ADDRESS = 0x00587C74
PCODE_OPCODE_DESCRIPTORS_ADDRESS = 0x005654B0
PCODE_MAX_OPCODE = 0x01D1
INTERFERENCE_GRAPH_ADDRESS = 0x00587E3C
COALESCED_REGISTERS_ADDRESS = 0x0058308C
# Pointer to the post-allocation reaching-definition array. Every rule handler
# registered at 0x005813B0 reads it as `table[instruction.definition_index]`,
# where entry zero is skipped, so the useful entries start at pointer + 4.
REACHING_DEFINITION_TABLE_ADDRESS = 0x00581AF8
REACHING_DEFINITION_INDEX_LIMIT = 0x10000
VIRTUAL_REGISTER_COUNT_ADDRESSES = {
    "gpr": 0x0058846E,
    "fpr": 0x0058846C,
    "vr": 0x0058849A,
}
INITIAL_OBJECT_REGISTER_LAST_ADDRESSES = {
    "gpr": 0x0058845A,
    "fpr": 0x0058845C,
    "vr": 0x0058842C,
}
COALESCE_RANGE_ADDRESSES = {
    0: (0x005882DA, 0x005882E2),
    1: (0x005882DC, 0x005882E0),
    9: (0x00588464, 0x0058846A),
}
FIRST_VIRTUAL_REGISTER = 32
OBJECT_VIRTUAL_REGISTER_ALLOCATOR_DETAILS = {
    0x004C1F60: {
        "function": "Registers_AllocateVR",
        "operation": "allocate and bind one object-backed vector register",
    },
    0x004C2040: {
        "function": "Registers_AllocateFPR",
        "operation": "allocate and bind one object-backed floating-point register",
    },
    0x004C2120: {
        "function": "Registers_AllocateGPRPair",
        "operation": "allocate and bind an object-backed GPR pair",
    },
    0x004C2280: {
        "function": "Registers_AllocateGPR",
        "operation": "allocate and bind one object-backed GPR",
    },
}
for allocator_detail in OBJECT_VIRTUAL_REGISTER_ALLOCATOR_DETAILS.values():
    allocator_detail.update(
        {
            "operation_category": "object_allocation",
            "evidence": "confirmed",
            "evidence_source": "typed reconstruction and target disassembly",
        }
    )

PCODE_FORMAT_OPERANDS = {
    "?": {"kinds": [], "role": "unsupported"},
    "t": {"kinds": [], "role": "unsupported"},
    "b": {"kinds": [0], "role": "gpr_or_zero", "access_is_contextual": True},
    "r": {"kinds": [0], "role": "gpr"},
    "f": {"kinds": [1], "role": "fpr"},
    "S": {"kinds": [2], "role": "special_register"},
    "C": {"kinds": [2], "role": "special_register_1"},
    "L": {"kinds": [2], "role": "special_register_2"},
    "X": {"kinds": [2], "role": "special_register_0"},
    "c": {"kinds": [3], "role": "condition_register"},
    "Y": {"kinds": [3], "role": "all_condition_registers", "expands_to": 8},
    "Z": {"kinds": [3], "role": "condition_register_0"},
    "i": {"kinds": [4], "role": "immediate"},
    "m": {
        "kinds": [4, 5],
        "role": "memory_or_immediate",
        "access_is_contextual": True,
    },
    "M": {
        "kinds": [4, 5],
        "role": "memory_or_immediate",
        "access_is_contextual": True,
    },
    "l": {
        "kinds": [5, 6],
        "role": "object_or_direct_label",
        "access_is_contextual": True,
    },
    "v": {"kinds": [9], "role": "vector_register"},
    "V": {"kinds": [0], "role": "gpr_list", "expands_to": "dynamic"},
    "p": {"kinds": [10], "role": "marker"},
}


def decode_operand_format(operand_format: str) -> dict:
    access_flags = 1
    operands = []
    for code in operand_format:
        if code in "#,":
            continue
        if code == "=":
            access_flags = 2
            continue
        if code == "+":
            access_flags = 3
            continue
        operand = PCODE_FORMAT_OPERANDS.get(code)
        if operand is None:
            raise SnapshotError(f"unknown PCode operand format code {code!r}")
        decoded = {
            "code": code,
            "default_access_flags": access_flags,
            "default_access": {1: "use", 2: "definition", 3: "use_definition"}[
                access_flags
            ],
            **operand,
        }
        operands.append(decoded)
        access_flags = 1
    return {
        "dynamic_operand_count": operand_format.startswith("#"),
        "operands": operands,
    }


class SnapshotError(ValueError):
    pass


def coalescing_groups(parents: list[int]) -> list[dict]:
    """Resolve a coalescing parent map into its non-singleton groups."""
    members_by_root = {}
    for register in range(len(parents)):
        root = register
        seen = set()
        while True:
            if root < 0 or root >= len(parents):
                raise SnapshotError(
                    f"invalid coalescing parent register {root}"
                )
            parent = parents[root]
            if parent == root:
                break
            if root in seen:
                raise SnapshotError(
                    f"coalescing parent cycle involving register {root}"
                )
            seen.add(root)
            root = parent
        members_by_root.setdefault(root, []).append(register)
    return [
        {"root": root, "members": members}
        for root, members in sorted(members_by_root.items())
        if len(members) > 1
    ]


def virtual_register_boundary(
    phase: str,
    counts: dict[str, int],
    previous_counts: dict[str, int] | None = None,
) -> dict:
    """Describe the half-open virtual-register ranges minted since a stage."""
    previous = previous_counts or {
        register_class: FIRST_VIRTUAL_REGISTER for register_class in counts
    }
    allocated_ranges = {}
    for register_class, count in counts.items():
        first = previous[register_class]
        if count < first:
            raise SnapshotError(
                f"{register_class} counter moved backward from {first} to {count}"
            )
        allocated_ranges[register_class] = {
            "first": first,
            "last_exclusive": count,
            "count": count - first,
        }
    return {
        "phase": phase,
        "counts": dict(counts),
        "allocated_since_previous": allocated_ranges,
    }


class SnapshotReader:
    def __init__(
        self,
        read_memory: Callable[[int, int], bytes],
        compiler: str = "GC/1.2.5",
        target_sha256: str = TARGET_SHA256,
    ):
        if SUPPORTED_TARGETS.get(target_sha256) != compiler:
            raise SnapshotError("unsupported compiler snapshot identity")
        self.read_memory = read_memory
        self.compiler = compiler
        self.target_sha256 = target_sha256
        self._opcode_descriptors = {}

    def _read(self, address: int, size: int) -> bytes:
        if size == 0:
            return b""
        data = bytes(self.read_memory(address, size))
        if len(data) != size:
            raise SnapshotError(
                f"short read at 0x{address:08x}: expected {size}, got {len(data)}"
            )
        return data

    def u8(self, address: int) -> int:
        return self._read(address, 1)[0]

    def raw(self, address: int, size: int) -> bytes:
        return self._read(address, size)

    def s16(self, address: int) -> int:
        return struct.unpack("<h", self._read(address, 2))[0]

    def u16(self, address: int) -> int:
        return struct.unpack("<H", self._read(address, 2))[0]

    def u32(self, address: int) -> int:
        return struct.unpack("<I", self._read(address, 4))[0]

    def s32(self, address: int) -> int:
        return struct.unpack("<i", self._read(address, 4))[0]

    def c_string(self, address: int, max_length: int = 4096) -> str:
        if address == 0:
            return ""
        data = bytearray()
        while len(data) < max_length:
            chunk = self._read(address + len(data), min(64, max_length - len(data)))
            terminator = chunk.find(b"\0")
            if terminator >= 0:
                data.extend(chunk[:terminator])
                return data.decode("ascii", errors="replace")
            data.extend(chunk)
        raise SnapshotError(f"unterminated string at 0x{address:08x}")

    def opcode_descriptor(self, opcode: int) -> dict:
        if opcode < 0 or opcode > PCODE_MAX_OPCODE:
            raise SnapshotError(f"invalid PCode opcode 0x{opcode:x}")
        cached = self._opcode_descriptors.get(opcode)
        if cached is not None:
            return cached
        raw = self._read(PCODE_OPCODE_DESCRIPTORS_ADDRESS + opcode * 0x10, 0x10)
        mnemonic_address, format_address = struct.unpack_from("<II", raw)
        descriptor = {
            "mnemonic": self.c_string(mnemonic_address),
            "operand_format": self.c_string(format_address),
            "fixed_operand_count": raw[8],
            "unknown_09": raw[9],
            "flags": struct.unpack_from("<H", raw, 0x0A)[0],
            "encoding": f"0x{struct.unpack_from('<I', raw, 0x0C)[0]:08x}",
        }
        descriptor["operand_schema"] = decode_operand_format(
            descriptor["operand_format"]
        )
        self._opcode_descriptors[opcode] = descriptor
        return descriptor

    def operand(self, address: int) -> dict:
        raw = self._read(address, 0x0C)
        return {
            "kind": raw[0],
            "flags": raw[1],
            "reg": struct.unpack_from("<h", raw, 2)[0],
            "value_signed": struct.unpack_from("<i", raw, 2)[0],
            "value_unsigned": struct.unpack_from("<I", raw, 2)[0],
            "object": f"0x{struct.unpack_from('<I', raw, 6)[0]:08x}",
            "raw": raw.hex(),
        }

    def instruction(self, address: int) -> dict:
        header = self._read(address, 0x1C)
        opcode = struct.unpack_from("<h", header, 0x14)[0]
        operand_count = struct.unpack_from("<h", header, 0x1A)[0]
        if operand_count < 0 or operand_count > 4096:
            raise SnapshotError(
                f"invalid operand count {operand_count} at 0x{address:08x}"
            )
        return {
            "address": f"0x{address:08x}",
            "next": struct.unpack_from("<I", header, 0)[0],
            "previous": struct.unpack_from("<I", header, 4)[0],
            "block": struct.unpack_from("<I", header, 8)[0],
            # Index into the reaching-definition array read by the
            # post-allocation rules; see REACHING_DEFINITION_TABLE_ADDRESS.
            "definition_index": struct.unpack_from("<I", header, 0x10)[0],
            "opcode": opcode,
            "opcode_descriptor": self.opcode_descriptor(opcode),
            "flags": struct.unpack_from("<I", header, 0x16)[0],
            "operands": [
                self.operand(address + 0x1C + index * 0x0C)
                for index in range(operand_count)
            ],
        }

    def instruction_list(self, address: int) -> list[dict]:
        instructions = []
        seen = set()
        while address != 0:
            if address in seen:
                raise SnapshotError(f"instruction-list cycle at 0x{address:08x}")
            if len(seen) >= 100000:
                raise SnapshotError("instruction-list limit exceeded")
            seen.add(address)
            instruction = self.instruction(address)
            instructions.append(instruction)
            address = instruction["next"]
        return instructions

    def successor_indices(self, address: int) -> list[int]:
        successors = []
        seen = set()
        while address != 0:
            if address in seen:
                raise SnapshotError(f"block-link cycle at 0x{address:08x}")
            seen.add(address)
            block_address = self.u32(address + 4)
            successors.append(self.s32(block_address + 0x1C))
            address = self.u32(address)
        return successors

    def block(self, address: int) -> dict:
        header = self._read(address, 0x30)
        instruction_address = struct.unpack_from("<I", header, 0x14)[0]
        return {
            "address": f"0x{address:08x}",
            "next": struct.unpack_from("<I", header, 0)[0],
            "index": struct.unpack_from("<i", header, 0x1C)[0],
            "successors": self.successor_indices(
                struct.unpack_from("<I", header, 0x10)[0]
            ),
            "execution_weight": struct.unpack_from("<i", header, 0x28)[0],
            "flags": struct.unpack_from("<H", header, 0x2E)[0],
            "instructions": self.instruction_list(instruction_address),
        }

    def blocks(self) -> list[dict]:
        blocks = []
        address = self.u32(PCODE_BLOCKS_ADDRESS)
        seen = set()
        while address != 0:
            if address in seen:
                raise SnapshotError(f"block-list cycle at 0x{address:08x}")
            if len(seen) >= 100000:
                raise SnapshotError("block-list limit exceeded")
            seen.add(address)
            block = self.block(address)
            blocks.append(block)
            address = block["next"]
        return blocks

    def interference_node(self, address: int) -> dict:
        header = self._read(address, 0x16)
        neighbor_count = struct.unpack_from("<h", header, 0x14)[0]
        if neighbor_count < 0 or neighbor_count > 32767:
            raise SnapshotError(
                f"invalid neighbor count {neighbor_count} at 0x{address:08x}"
            )
        neighbor_data = self._read(address + 0x16, neighbor_count * 2)
        return {
            "address": f"0x{address:08x}",
            "next": struct.unpack_from("<I", header, 0)[0],
            "object": f"0x{struct.unpack_from('<I', header, 4)[0]:08x}",
            "spill_cost": struct.unpack_from("<i", header, 8)[0],
            "virtual_register": struct.unpack_from("<h", header, 0x0C)[0],
            "degree": struct.unpack_from("<h", header, 0x0E)[0],
            "physical_register": struct.unpack_from("<h", header, 0x10)[0],
            "flags": header[0x12],
            "neighbors": [
                struct.unpack_from("<h", neighbor_data, index * 2)[0]
                for index in range(neighbor_count)
            ],
        }

    def coloring_snapshot(
        self, reg_class: int, simplify_stack: int, program_counter: int = 0
    ) -> dict:
        count_name = {0: "gpr", 1: "fpr", 9: "vr"}.get(reg_class)
        if count_name is None:
            raise SnapshotError(f"unsupported register class {reg_class}")
        register_count = self.s16(VIRTUAL_REGISTER_COUNT_ADDRESSES[count_name])
        coalesced_address = self.u32(COALESCED_REGISTERS_ADDRESS)
        coalesced_registers = None
        if coalesced_address != 0:
            coalesced_registers = [
                self.s16(coalesced_address + register * 2)
                for register in range(register_count)
            ]
        range_first_address, range_last_address = COALESCE_RANGE_ADDRESSES[
            reg_class
        ]
        graph_address = self.u32(INTERFERENCE_GRAPH_ADDRESS)
        nodes = []
        nodes_by_address = {}
        for reg in range(register_count):
            node_address = self.u32(graph_address + reg * 4)
            if node_address == 0:
                continue
            node = self.interference_node(node_address)
            nodes.append(node)
            nodes_by_address[node_address] = node

        simplify_order = []
        seen = set()
        while simplify_stack != 0:
            if simplify_stack in seen:
                raise SnapshotError(
                    f"simplify-stack cycle at 0x{simplify_stack:08x}"
                )
            seen.add(simplify_stack)
            node = nodes_by_address.get(simplify_stack)
            if node is None:
                raise SnapshotError(
                    f"simplify-stack node 0x{simplify_stack:08x} is not in graph"
                )
            simplify_order.append(node["virtual_register"])
            simplify_stack = node["next"]

        snapshot = {
            "format": "mwcc-coloring-snapshot-v1",
            "compiler": self.compiler,
            "target_sha256": self.target_sha256,
            "program_counter": f"0x{program_counter:08x}",
            "register_class": reg_class,
            "register_count": register_count,
            "coalesced_registers_address": f"0x{coalesced_address:08x}",
            "coalesced_registers": coalesced_registers,
            "coalescing_groups": (
                coalescing_groups(coalesced_registers)
                if coalesced_registers is not None
                else []
            ),
            "coalesce_range": {
                "first": self.s16(range_first_address),
                "last": self.s16(range_last_address),
            },
            "simplify_order": simplify_order,
            "nodes": nodes,
        }
        validate_coloring_snapshot(snapshot)
        return snapshot

    def reaching_definitions(self, blocks: list[dict]) -> dict | None:
        """Resolve every live instruction's reaching-definition table entry.

        The post-allocation rules registered at 0x005813B0 read their candidate
        predecessor as `table[instruction.definition_index]`, so the table is
        what decides whether a rule sees a foldable pair at all. It is a heap
        array whose entry zero is skipped.
        """

        try:
            table = self.u32(REACHING_DEFINITION_TABLE_ADDRESS)
        except SnapshotError:
            return None
        if table == 0:
            return None
        # The array is sized by the pass that fills it, so a stage captured
        # before that pass runs carries stale indices that address unmapped
        # memory. Record what reads cleanly and report the rest rather than
        # aborting the capture.
        entries = {}
        unreadable = 0
        for block in blocks:
            for instruction in block["instructions"]:
                index = instruction["definition_index"]
                if index == 0 or index in entries:
                    continue
                if not 0 < index < REACHING_DEFINITION_INDEX_LIMIT:
                    unreadable += 1
                    continue
                try:
                    definition = self.u32(table + 4 + index * 4)
                except Exception:
                    unreadable += 1
                    continue
                entries[index] = f"0x{definition:08x}"
        return {
            "table_address": f"0x{table:08x}",
            "unreadable_indices": unreadable,
            "entries": {str(index): entries[index] for index in sorted(entries)},
        }

    def snapshot(self, function_pointer: int = 0, program_counter: int = 0) -> dict:
        blocks = self.blocks()
        snapshot = {
            "format": "mwcc-allocator-snapshot-v1",
            "compiler": self.compiler,
            "target_sha256": self.target_sha256,
            "function_pointer": f"0x{function_pointer:08x}",
            "program_counter": f"0x{program_counter:08x}",
            "virtual_register_counts": {
                name: self.s16(address)
                for name, address in VIRTUAL_REGISTER_COUNT_ADDRESSES.items()
            },
            "initial_object_register_last": {
                name: self.s16(address)
                for name, address in INITIAL_OBJECT_REGISTER_LAST_ADDRESSES.items()
            },
            "blocks": blocks,
            "reaching_definitions": self.reaching_definitions(blocks),
        }
        validate_snapshot(snapshot)
        return snapshot


def validate_snapshot(snapshot: dict) -> None:
    if snapshot.get("format") != "mwcc-allocator-snapshot-v1":
        raise SnapshotError("unsupported snapshot format")
    target_sha256 = snapshot.get("target_sha256")
    if SUPPORTED_TARGETS.get(target_sha256) != snapshot.get("compiler"):
        raise SnapshotError("snapshot does not identify a verified compiler target")

    blocks = snapshot.get("blocks")
    if not isinstance(blocks, list):
        raise SnapshotError("blocks must be a list")
    indices = [block.get("index") for block in blocks]
    if len(indices) != len(set(indices)):
        raise SnapshotError("block indices must be unique")
    index_set = set(indices)
    for block in blocks:
        if not set(block.get("successors", ())).issubset(index_set):
            raise SnapshotError(f"block {block.get('index')} has an unknown successor")
        for instruction in block.get("instructions", ()):
            if not isinstance(instruction.get("operands"), list):
                raise SnapshotError("instruction operands must be a list")
    boundary = snapshot.get("virtual_register_boundary")
    if boundary is not None:
        if boundary.get("counts") != snapshot.get("virtual_register_counts"):
            raise SnapshotError("counter boundary does not match snapshot counts")
        for register_class, item in boundary.get(
            "allocated_since_previous", {}
        ).items():
            if item["last_exclusive"] - item["first"] != item["count"]:
                raise SnapshotError(
                    f"invalid {register_class} virtual-register boundary"
                )


def validate_coloring_snapshot(snapshot: dict) -> None:
    if snapshot.get("format") != "mwcc-coloring-snapshot-v1":
        raise SnapshotError("unsupported coloring snapshot format")
    target_sha256 = snapshot.get("target_sha256")
    if SUPPORTED_TARGETS.get(target_sha256) != snapshot.get("compiler"):
        raise SnapshotError("snapshot does not identify a verified compiler target")
    nodes = snapshot.get("nodes")
    if not isinstance(nodes, list):
        raise SnapshotError("nodes must be a list")
    registers = {node.get("virtual_register") for node in nodes}
    if len(registers) != len(nodes):
        raise SnapshotError("virtual-register nodes must be unique")
    for node in nodes:
        if not set(node.get("neighbors", ())).issubset(registers):
            raise SnapshotError(
                f"register {node.get('virtual_register')} has an unknown neighbor"
            )
    if not set(snapshot.get("simplify_order", ())).issubset(registers):
        raise SnapshotError("simplify order contains an unknown register")
    parents = snapshot.get("coalesced_registers")
    if parents is not None:
        if len(parents) != snapshot.get("register_count"):
            raise SnapshotError(
                "coalescing parent map length does not match register count"
            )
        if any(parent < 0 or parent >= len(parents) for parent in parents):
            raise SnapshotError("coalescing parent map contains an invalid register")
        expected_groups = coalescing_groups(parents)
        if snapshot.get("coalescing_groups", expected_groups) != expected_groups:
            raise SnapshotError("coalescing groups do not match parent map")


def function_identity(reader, function_pointer: int) -> dict:
    """Decode the cached CMangler name used by target routine 0x004c2560.

    The target follows kind-6 aliases through ``+0x26``.  Kinds 1, 2, and 8
    carry a name record at ``+0x0a``; kinds 0, 3, and 4 cache a generated
    record at ``+0x32`` or ``+0x2e``.  Kind 5 generates a fresh record on each
    call, so a non-invasive capture cannot name it without executing target
    code.  A name record stores the emitted symbol string at ``+0x0a``.
    """
    original = function_pointer
    seen = set()
    aliases = []
    while function_pointer not in seen:
        seen.add(function_pointer)
        kind = reader.u8(function_pointer + 0x02)
        if kind != 6:
            break
        aliases.append(f"0x{function_pointer:08x}")
        function_pointer = reader.u32(function_pointer + 0x26)
        if function_pointer == 0:
            return {
                "function_object": f"0x{original:08x}",
                "canonical_object": None,
                "alias_objects": aliases,
                "kind": 6,
                "name_record": None,
                "name": None,
                "status": "null_alias",
            }
    else:
        return {
            "function_object": f"0x{original:08x}",
            "canonical_object": f"0x{function_pointer:08x}",
            "alias_objects": aliases,
            "kind": 6,
            "name_record": None,
            "name": None,
            "status": "alias_cycle",
        }

    name_fields = {0: 0x32, 1: 0x0A, 2: 0x0A, 3: 0x2E, 4: 0x2E, 8: 0x0A}
    name_field = name_fields.get(kind)
    if name_field is None:
        status = "uncached_generated_name" if kind == 5 else "unsupported_kind"
        name_record = 0
    else:
        name_record = reader.u32(function_pointer + name_field)
        status = "cached" if name_record else "cache_empty"
    return {
        "function_object": f"0x{original:08x}",
        "canonical_object": f"0x{function_pointer:08x}",
        "alias_objects": aliases,
        "kind": kind,
        "name_record": f"0x{name_record:08x}" if name_record else None,
        "name": reader.c_string(name_record + 0x0A) if name_record else None,
        "status": status,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate an allocator snapshot")
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    with args.snapshot.open(encoding="utf-8") as stream:
        snapshot = json.load(stream)
    if snapshot.get("format") == "mwcc-allocator-snapshot-v1":
        validate_snapshot(snapshot)
        print(f"Validated {len(snapshot['blocks'])} PCode blocks")
    else:
        validate_coloring_snapshot(snapshot)
        print(f"Validated {len(snapshot['nodes'])} interference nodes")


if __name__ == "__main__":
    main()
