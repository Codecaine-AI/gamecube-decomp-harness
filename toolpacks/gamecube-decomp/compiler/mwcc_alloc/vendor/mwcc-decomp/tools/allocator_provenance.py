#!/usr/bin/env python3
"""Flatten MWCC allocator captures into solver-facing provenance facts."""

import argparse
import json
import struct
from pathlib import Path

from allocator_snapshot import (
    OBJECT_VIRTUAL_REGISTER_ALLOCATOR_DETAILS,
    TARGET_NINJI_SHA256,
    TARGET_SHA256,
    validate_coloring_snapshot,
    validate_snapshot,
)


VIRTUAL_REGISTER_CATALOG_BY_HASH = {
    TARGET_SHA256: Path("config/GC_1_2_5/virtual_register_sites.json"),
    TARGET_NINJI_SHA256: Path("config/GC_1_2_5n/virtual_register_sites.json"),
}


REGISTER_CLASS_BY_KIND = {0: "gpr", 1: "fpr", 9: "vr"}
REGISTER_CLASS_BY_ID = {0: "gpr", 1: "fpr", 9: "vr"}
REGISTER_CLASS_ORDER = {"gpr": 0, "fpr": 1, "vr": 2}


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def load_opcode_catalog(path: Path) -> dict[int, dict]:
    catalog = load_json(path)
    if catalog.get("format") != "mwcc-pcode-opcodes-v1":
        raise ValueError(f"unsupported opcode catalog: {path}")
    if catalog.get("target_sha256") != TARGET_SHA256:
        raise ValueError(f"opcode catalog targets another compiler: {path}")
    return {entry["opcode"]: entry for entry in catalog["opcodes"]}


def load_virtual_register_catalog(path: Path, target_sha256: str) -> dict:
    catalog = load_json(path)
    if catalog.get("format") != "mwcc-virtual-register-sites-v1":
        raise ValueError(f"unsupported virtual-register site catalog: {path}")
    if catalog.get("target_sha256") != target_sha256:
        raise ValueError(f"virtual-register site catalog targets another compiler: {path}")
    return {site["address"]: site for site in catalog["sites"]}


def register_id(reg_class: str, register: int) -> str:
    return f"{reg_class}:{register}"


def decode_raw_operand(operand: dict) -> dict:
    raw = bytes.fromhex(operand["raw"])
    if len(raw) != 0x0C:
        raise ValueError(f"PCode operand is not 12 bytes: {operand['raw']}")
    return {
        "value_signed": struct.unpack_from("<i", raw, 2)[0],
        "value_unsigned": struct.unpack_from("<I", raw, 2)[0],
        "object": f"0x{struct.unpack_from('<I', raw, 6)[0]:08x}",
    }


def normalize_descriptor(descriptor: dict | None) -> dict:
    if descriptor is None:
        return {
            "mnemonic": None,
            "operand_format": None,
            "descriptor_flags": None,
            "encoding": None,
            "operand_schema": None,
        }
    flags = descriptor.get("flags")
    if isinstance(flags, str):
        flags = int(flags, 0)
    return {
        "mnemonic": descriptor.get("mnemonic"),
        "operand_format": descriptor.get("operand_format"),
        "descriptor_flags": flags,
        "encoding": descriptor.get("encoding"),
        "operand_schema": descriptor.get("operand_schema"),
    }


def add_register_occurrence(registers: dict, operand: dict) -> None:
    reg_class = operand.get("register_class")
    if reg_class is None:
        return
    register = operand["register"]
    key = (reg_class, register)
    record = registers.setdefault(
        key,
        {
            "id": register_id(reg_class, register),
            "class": reg_class,
            "register": register,
            "is_virtual": register >= 32,
            "definitions": [],
            "uses": [],
            "last_uses": [],
            "occurrences": [],
        },
    )
    operand_id = operand["id"]
    record["occurrences"].append(operand_id)
    if operand["is_definition"]:
        record["definitions"].append(operand_id)
    if operand["is_use"]:
        record["uses"].append(operand_id)
    if operand["is_last_use"]:
        record["last_uses"].append(operand_id)


def flatten_pcode(snapshot: dict, opcode_catalog: dict[int, dict]) -> dict:
    validate_snapshot(snapshot)
    blocks = []
    instructions = []
    operands = []
    registers = {}
    sequence = 0

    for block_order, block in enumerate(snapshot["blocks"]):
        block_id = f"b{block['index']}"
        blocks.append(
            {
                "id": block_id,
                "index": block["index"],
                "order": block_order,
                "address": block["address"],
                "successors": [f"b{index}" for index in block["successors"]],
                "execution_weight": block["execution_weight"],
                "flags": block["flags"],
            }
        )
        for block_instruction_index, instruction in enumerate(
            block["instructions"]
        ):
            instruction_id = f"{block_id}:i{block_instruction_index}"
            descriptor = instruction.get("opcode_descriptor")
            if descriptor is None:
                descriptor = opcode_catalog.get(instruction["opcode"])
            instruction_record = {
                "id": instruction_id,
                "block": block_id,
                "block_instruction_index": block_instruction_index,
                "sequence": sequence,
                "address": instruction["address"],
                "opcode": instruction["opcode"],
                "flags": instruction["flags"],
                "operand_count": len(instruction["operands"]),
                **normalize_descriptor(descriptor),
            }
            instructions.append(instruction_record)

            for operand_index, operand in enumerate(instruction["operands"]):
                operand_id = f"{instruction_id}:o{operand_index}"
                reg_class = REGISTER_CLASS_BY_KIND.get(operand["kind"])
                flags = operand["flags"]
                operand_record = {
                    "id": operand_id,
                    "instruction": instruction_id,
                    "index": operand_index,
                    "kind": operand["kind"],
                    "flags": flags,
                    "register_class": reg_class,
                    "register": operand["reg"] if reg_class is not None else None,
                    "is_use": (flags & 1) != 0,
                    "is_definition": (flags & 2) != 0,
                    "is_last_use": (flags & 4) != 0,
                    "raw": operand["raw"],
                    **decode_raw_operand(operand),
                }
                operands.append(operand_record)
                add_register_occurrence(registers, operand_record)
            sequence += 1

    register_records = sorted(
        registers.values(),
        key=lambda item: (REGISTER_CLASS_ORDER[item["class"]], item["register"]),
    )
    return {
        "blocks": blocks,
        "instructions": instructions,
        "operands": operands,
        "registers": register_records,
    }


def check_coloring_identity(allocator: dict, coloring: dict) -> None:
    validate_coloring_snapshot(coloring)
    if coloring.get("target_sha256") != allocator.get("target_sha256"):
        raise ValueError("allocator and coloring snapshots target different compilers")
    allocator_index = allocator.get("capture_index")
    coloring_index = coloring.get("capture_index")
    if (
        allocator_index is not None
        and coloring_index is not None
        and allocator_index != coloring_index
    ):
        raise ValueError(
            f"capture index mismatch: allocator {allocator_index}, "
            f"coloring {coloring_index}"
        )


def flatten_coloring(allocator: dict, snapshots: list[dict]) -> dict:
    nodes = []
    edges = []
    simplify_order = []
    coalesces = []
    coalescing_groups = []
    coalescing_windows = []
    object_bindings = []

    for snapshot_index, snapshot in enumerate(snapshots):
        check_coloring_identity(allocator, snapshot)
        reg_class = REGISTER_CLASS_BY_ID[snapshot["register_class"]]
        phase = snapshot.get("phase", f"snapshot_{snapshot_index}")
        attempt = snapshot.get("attempt")
        node_by_register = {
            node["virtual_register"]: node for node in snapshot["nodes"]
        }
        parents = snapshot.get("coalesced_registers")

        if parents is not None:
            def root_of(register):
                while parents[register] != register:
                    register = parents[register]
                return register

            for register, parent in enumerate(parents):
                if register == parent:
                    continue
                coalesces.append(
                    {
                        "phase": phase,
                        "attempt": attempt,
                        "register": register_id(reg_class, register),
                        "parent": register_id(reg_class, parent),
                        "root": register_id(reg_class, root_of(register)),
                        "source": "gCoalescedRegisters",
                    }
                )
            for group in snapshot.get("coalescing_groups", []):
                member_costs = []
                for member in group["members"]:
                    node = node_by_register.get(member)
                    member_costs.append(
                        {
                            "register": register_id(reg_class, member),
                            "spill_cost": (
                                node.get("spill_cost") if node is not None else None
                            ),
                        }
                    )
                root = group["root"]
                root_node = node_by_register.get(root)
                coalescing_groups.append(
                    {
                        "phase": phase,
                        "attempt": attempt,
                        "root": register_id(reg_class, root),
                        "members": [
                            register_id(reg_class, member)
                            for member in group["members"]
                        ],
                        "root_spill_cost": (
                            root_node.get("spill_cost")
                            if root_node is not None
                            else None
                        ),
                        "member_spill_costs": member_costs,
                    }
                )
        coalesce_range = snapshot.get("coalesce_range")
        if coalesce_range is not None:
            coalescing_windows.append(
                {
                    "phase": phase,
                    "attempt": attempt,
                    "register_class": reg_class,
                    "first": coalesce_range["first"],
                    "last": coalesce_range["last"],
                }
            )

        for node in snapshot["nodes"]:
            register = node["virtual_register"]
            node_id = register_id(reg_class, register)
            flags = node["flags"]
            color_or_parent = node["physical_register"]
            node_record = {
                "phase": phase,
                "attempt": attempt,
                "register": node_id,
                "address": node["address"],
                "object": node["object"],
                "spill_cost": node["spill_cost"],
                "degree": node["degree"],
                "color_or_parent": color_or_parent,
                "flags": flags,
                "is_spilled": (flags & 0x01) != 0,
                "is_simplified": (flags & 0x02) != 0,
                "is_coalesced": (flags & 0x04) != 0,
                "is_coalesce_target": (flags & 0x08) != 0,
                "is_second_of_pair": (flags & 0x10) != 0,
                "is_first_of_pair": (flags & 0x20) != 0,
                "neighbors": [
                    register_id(reg_class, neighbor)
                    for neighbor in node["neighbors"]
                ],
            }
            nodes.append(node_record)
            if parents is None and flags & 0x04:
                coalesces.append(
                    {
                        "phase": phase,
                        "attempt": attempt,
                        "register": node_id,
                        "parent": register_id(reg_class, color_or_parent),
                    }
                )
            if node["object"] != "0x00000000":
                object_bindings.append(
                    {
                        "phase": phase,
                        "attempt": attempt,
                        "register": node_id,
                        "object": node["object"],
                    }
                )

        seen_edges = set()
        for register, node in node_by_register.items():
            for neighbor in node["neighbors"]:
                edge = tuple(sorted((register, neighbor)))
                if edge in seen_edges:
                    continue
                seen_edges.add(edge)
                edges.append(
                    {
                        "phase": phase,
                        "attempt": attempt,
                        "left": register_id(reg_class, edge[0]),
                        "right": register_id(reg_class, edge[1]),
                    }
                )

        for position, register in enumerate(snapshot["simplify_order"]):
            simplify_order.append(
                {
                    "phase": phase,
                    "attempt": attempt,
                    "position": position,
                    "register": register_id(reg_class, register),
                }
            )

    return {
        "coloring_nodes": nodes,
        "interference_edges": edges,
        "simplify_order": simplify_order,
        "coalesces": coalesces,
        "coalescing_groups": coalescing_groups,
        "coalescing_windows": coalescing_windows,
        "object_bindings": object_bindings,
    }


def flatten_creation_trace(
    allocator: dict,
    trace: dict | None,
    instructions: list[dict],
    registers: list[dict],
    virtual_register_sites: dict[str, dict],
) -> dict:
    if trace is None:
        return {
            "pcode_creations": [],
            "creation_operands": [],
            "codegen_items": [],
            "created_by": [],
            "pcode_clones": [],
            "derived_from": [],
            "virtual_register_creations": [],
            "register_created_by": [],
            "virtual_register_boundaries": [],
            "creation_coverage": None,
        }
    if trace.get("format") != "mwcc-pcode-creation-trace-v1":
        raise ValueError("unsupported PCode creation trace")
    if trace.get("target_sha256") != allocator.get("target_sha256"):
        raise ValueError("allocator and creation trace target different compilers")
    allocator_index = allocator.get("capture_index")
    trace_index = trace.get("capture_index")
    if (
        allocator_index is not None
        and trace_index is not None
        and allocator_index != trace_index
    ):
        raise ValueError(
            f"capture index mismatch: allocator {allocator_index}, "
            f"creation trace {trace_index}"
        )

    creations = []
    creation_operands = []
    codegen_items = []
    codegen_item_ids = {}
    creation_by_address = {}
    for event in trace["events"]:
        creation_id = f"c{event['sequence']}"
        instruction = event["instruction"]
        address = instruction["address"]
        descriptor = instruction.get("opcode_descriptor")
        codegen_item_address = event.get("codegen_item_address")
        codegen_item_id = None
        if codegen_item_address not in (None, "0x00000000"):
            codegen_item_id = codegen_item_ids.get(codegen_item_address)
            if codegen_item_id is None:
                codegen_item_id = f"cg{len(codegen_items)}"
                codegen_item_ids[codegen_item_address] = codegen_item_id
                codegen_items.append(
                    {
                        "id": codegen_item_id,
                        "capture_address": codegen_item_address,
                        "header": event.get("codegen_item_header"),
                        "fields": event.get("codegen_item_fields"),
                        "expression": event.get("codegen_expression_fields"),
                        "pointer_0a_data": event.get(
                            "codegen_pointer_0a_data"
                        ),
                        "pointer_0e_data": event.get(
                            "codegen_pointer_0e_data"
                        ),
                    }
                )
        creations.append(
            {
                "id": creation_id,
                "sequence": event["sequence"],
                "epoch": event["epoch"],
                "wrapper": event["wrapper"],
                "wrapper_address": event["wrapper_address"],
                "call_address": event["call_address"],
                "caller_return_address": event["caller_return_address"],
                "codegen_item": codegen_item_id,
                "codegen_item_address": codegen_item_address,
                "instruction_address": address,
                "opcode": instruction["opcode"],
                "flags_at_creation": instruction["flags"],
                **normalize_descriptor(descriptor),
            }
        )
        creation_by_address[address] = creation_id
        for index, operand in enumerate(instruction["operands"]):
            creation_operands.append(
                {
                    "id": f"{creation_id}:o{index}",
                    "creation": creation_id,
                    "index": index,
                    "kind": operand["kind"],
                    "flags": operand["flags"],
                    "raw": operand["raw"],
                    "compiler_object": operand.get("compiler_object"),
                    **decode_raw_operand(operand),
                }
            )

    instruction_by_address = {
        instruction["address"]: instruction for instruction in instructions
    }
    allocation_by_address = {
        allocation["address"]: allocation
        for allocation in trace.get("unwrapped_instruction_allocations", [])
    }
    clones = []
    derived_from = []
    clone_by_address = {}
    for event in trace.get("clone_events", []):
        clone_id = f"cl{event['sequence']}"
        source = event["source_instruction"]
        destination = event["destination_instruction"]
        destination_address = event["destination_address"]
        allocation = allocation_by_address.get(destination_address)
        clones.append(
            {
                "id": clone_id,
                "sequence": event["sequence"],
                "epoch": event["epoch"],
                "call_address": event["call_address"],
                "caller_return_address": event["caller_return_address"],
                "source_instruction_address": event["source_address"],
                "destination_instruction_address": destination_address,
                "opcode": destination["opcode"],
                "mnemonic": (destination.get("opcode_descriptor") or {}).get(
                    "mnemonic"
                ),
                "allocation_call_address": (
                    allocation.get("call_address") if allocation else None
                ),
                "allocation_size": (
                    allocation.get("requested_size") if allocation else None
                ),
                "source_operands": [
                    operand["raw"] for operand in source["operands"]
                ],
                "destination_operands": [
                    operand["raw"] for operand in destination["operands"]
                ],
            }
        )
        clone_by_address[destination_address] = clone_id
        live_destination = instruction_by_address.get(destination_address)
        if live_destination is None:
            continue
        live_source = instruction_by_address.get(event["source_address"])
        derived_from.append(
            {
                "instruction": live_destination["id"],
                "source_instruction": (
                    live_source["id"] if live_source is not None else None
                ),
                "source_address": event["source_address"],
                "clone": clone_id,
            }
        )

    created_by = []
    unlinked_instructions = []
    for instruction in instructions:
        creation_id = creation_by_address.get(instruction["address"])
        if creation_id is None:
            if instruction["address"] in clone_by_address:
                continue
            unlinked_instructions.append(instruction["id"])
            continue
        created_by.append(
            {
                "instruction": instruction["id"],
                "creation": creation_id,
            }
        )
    live_addresses = {instruction["address"] for instruction in instructions}
    dead_creations = [
        creation["id"]
        for creation in creations
        if creation["instruction_address"] not in live_addresses
    ]
    register_ids = {register["id"] for register in registers}
    virtual_register_creations = []
    register_created_by = []
    for event in trace.get("virtual_register_events", []):
        event_id = f"vrc{event['sequence']}"
        site = virtual_register_sites.get(event["allocator_address"], {})
        if not site:
            site = OBJECT_VIRTUAL_REGISTER_ALLOCATOR_DETAILS.get(
                int(event["allocator_address"], 0), {}
            )
        object_after = event.get("object_after")
        register_info = None
        if object_after is not None:
            info_field = (
                "register_info_26"
                if object_after["kind_02"] == 1
                else "register_info_2e"
            )
            register_info = object_after.get(info_field)
        primary_register = (
            register_info.get("physical_register_24")
            if register_info is not None
            else event.get("primary_register")
        )
        secondary_register = (
            register_info.get("secondary_register_26")
            if register_info is not None
            and event["allocation_kind"] == "pair"
            else event.get("secondary_register")
        )
        virtual_register_creations.append(
            {
                "id": event_id,
                "sequence": event["sequence"],
                "epoch": event["epoch"],
                "register_class": event["register_class"],
                "allocation_kind": event["allocation_kind"],
                "allocator_address": event["allocator_address"],
                "allocator_write_return_address": event.get(
                    "allocator_write_return_address"
                ),
                "allocator_address_is_post_write": event.get(
                    "allocator_address_is_post_write", False
                ),
                "allocator_function": (
                    event.get("allocator_function") or site.get("function")
                ),
                "allocator_operation": (
                    event.get("allocator_operation") or site.get("operation")
                ),
                "allocator_operation_category": (
                    event.get("allocator_operation_category")
                    or site.get("operation_category")
                ),
                "allocator_evidence": (
                    event.get("allocator_evidence") or site.get("evidence")
                ),
                "allocator_evidence_source": (
                    event.get("allocator_evidence_source")
                    or site.get("evidence_source")
                ),
                "call_address": event["call_address"],
                "caller_return_address": event["caller_return_address"],
                "codegen_item_address": event.get("codegen_item_address"),
                "object_address": event["object_address"],
                "object_before": event.get("object_before"),
                "object_after": object_after,
                "primary_register": primary_register,
                "secondary_register": secondary_register,
            }
        )
        for role, register in (
            ("primary", primary_register),
            ("secondary", secondary_register),
        ):
            if register is None:
                continue
            target = register_id(event["register_class"], register)
            if target in register_ids:
                register_created_by.append(
                    {
                        "register": target,
                        "creation": event_id,
                        "role": role,
                    }
                )
    return {
        "pcode_creations": creations,
        "creation_operands": creation_operands,
        "codegen_items": codegen_items,
        "created_by": created_by,
        "pcode_clones": clones,
        "derived_from": derived_from,
        "virtual_register_creations": virtual_register_creations,
        "register_created_by": register_created_by,
        "virtual_register_boundaries": trace.get(
            "virtual_register_boundaries", []
        ),
        "creation_coverage": {
            "live_instruction_count": len(instructions),
            "linked_live_instruction_count": len(created_by) + len(derived_from),
            "normal_creation_live_instruction_count": len(created_by),
            "clone_creation_live_instruction_count": len(derived_from),
            "unlinked_live_instructions": unlinked_instructions,
            "creation_count": len(creations),
            "dead_creations": dead_creations,
        },
    }


def build_provenance(
    allocator: dict,
    coloring_snapshots: list[dict] | None = None,
    opcode_catalog: dict[int, dict] | None = None,
    creation_trace: dict | None = None,
    virtual_register_sites: dict[str, dict] | None = None,
) -> dict:
    validate_snapshot(allocator)
    coloring_snapshots = coloring_snapshots or []
    opcode_catalog = opcode_catalog or {}
    virtual_register_sites = virtual_register_sites or {}
    pcode = flatten_pcode(allocator, opcode_catalog)
    return {
        "format": "mwcc-allocator-provenance-v1",
        "compiler": allocator["compiler"],
        "target_sha256": allocator["target_sha256"],
        "capture_index": allocator.get("capture_index"),
        "function_pointer": allocator.get("function_pointer"),
        "function_identity": allocator.get("function_identity"),
        "virtual_register_counts": allocator["virtual_register_counts"],
        **pcode,
        **flatten_creation_trace(
            allocator,
            creation_trace,
            pcode["instructions"],
            pcode["registers"],
            virtual_register_sites,
        ),
        **flatten_coloring(allocator, coloring_snapshots),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Join MWCC PCode and coloring captures into provenance facts"
    )
    parser.add_argument("allocator", type=Path)
    parser.add_argument("--coloring", type=Path, action="append", default=[])
    parser.add_argument("--opcodes", type=Path)
    parser.add_argument("--creations", type=Path)
    parser.add_argument("--register-sites", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    allocator = load_json(args.allocator)
    coloring = [load_json(path) for path in args.coloring]
    opcode_path = args.opcodes
    if opcode_path is None:
        default_path = Path("build/GC_1_2_5/pcode-opcodes.json")
        if default_path.is_file():
            opcode_path = default_path
    catalog = load_opcode_catalog(opcode_path) if opcode_path else {}
    creation_trace = load_json(args.creations) if args.creations else None
    register_sites_path = args.register_sites
    if register_sites_path is None:
        candidate = VIRTUAL_REGISTER_CATALOG_BY_HASH.get(
            allocator.get("target_sha256")
        )
        if candidate is not None and candidate.is_file():
            register_sites_path = candidate
    register_sites = (
        load_virtual_register_catalog(
            register_sites_path, allocator["target_sha256"]
        )
        if register_sites_path
        else {}
    )
    result = build_provenance(
        allocator, coloring, catalog, creation_trace, register_sites
    )
    text = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
