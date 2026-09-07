#!/usr/bin/env python3
"""Explain one virtual register from allocator-provenance facts."""

import argparse
import json
from pathlib import Path


def explain_register(provenance: dict, register_id: str) -> dict:
    register = next(
        (
            item
            for item in provenance["registers"]
            if item["id"] == register_id
        ),
        None,
    )
    if register is None:
        raise ValueError(f"unknown register {register_id}")

    operands = {item["id"]: item for item in provenance["operands"]}
    instructions = {
        item["id"]: item for item in provenance["instructions"]
    }
    creation_links = {
        item["instruction"]: item["creation"]
        for item in provenance.get("created_by", [])
    }
    creations = {
        item["id"]: item for item in provenance.get("pcode_creations", [])
    }
    derivation_links = {
        item["instruction"]: item
        for item in provenance.get("derived_from", [])
    }
    clones = {
        item["id"]: item for item in provenance.get("pcode_clones", [])
    }
    codegen_items = {
        item["id"]: item for item in provenance.get("codegen_items", [])
    }
    register_creation_links = [
        item
        for item in provenance.get("register_created_by", [])
        if item["register"] == register_id
    ]
    virtual_register_creations = {
        item["id"]: item
        for item in provenance.get("virtual_register_creations", [])
    }
    instruction_operands = {}
    for item in provenance["operands"]:
        instruction_operands.setdefault(item["instruction"], []).append(item)
    creation_operands = {}
    for item in provenance.get("creation_operands", []):
        creation_operands.setdefault(item["creation"], []).append(item)

    def site(operand_id: str, role: str) -> dict:
        operand = operands[operand_id]
        instruction = instructions[operand["instruction"]]
        creation_id = creation_links.get(instruction["id"])
        creation = creations.get(creation_id)
        derivation = derivation_links.get(instruction["id"])
        clone = clones.get(derivation.get("clone")) if derivation else None
        codegen_item = (
            codegen_items.get(creation.get("codegen_item")) if creation else None
        )
        return {
            "role": role,
            "operand": operand_id,
            "operand_index": operand["index"],
            "instruction": instruction["id"],
            "sequence": instruction["sequence"],
            "address": instruction["address"],
            "mnemonic": instruction["mnemonic"],
            "opcode": instruction["opcode"],
            "creation": creation_id,
            "origin_kind": (
                "normal_creation"
                if creation is not None
                else "optimizer_clone"
                if clone is not None
                else "unknown"
            ),
            "creation_epoch": creation["epoch"] if creation else None,
            "lowering_call_address": (
                creation["call_address"] if creation else None
            ),
            "lowering_wrapper": creation["wrapper"] if creation else None,
            "clone": clone.get("id") if clone else None,
            "clone_epoch": clone.get("epoch") if clone else None,
            "clone_call_address": clone.get("call_address") if clone else None,
            "derived_from_instruction": (
                derivation.get("source_instruction") if derivation else None
            ),
            "derived_from_address": (
                derivation.get("source_address") if derivation else None
            ),
            "codegen_item_address": (
                creation.get("codegen_item_address") if creation else None
            ),
            "codegen_item_header": (
                codegen_item.get("header") if codegen_item else None
            ),
            "codegen_item_fields": (
                codegen_item.get("fields") if codegen_item else None
            ),
            "codegen_expression": (
                codegen_item.get("expression") if codegen_item else None
            ),
            "codegen_pointer_0a_data": (
                codegen_item.get("pointer_0a_data") if codegen_item else None
            ),
            "codegen_pointer_0e_data": (
                codegen_item.get("pointer_0e_data") if codegen_item else None
            ),
            "instruction_operands": instruction_operands[instruction["id"]],
            "creation_operands": creation_operands.get(creation_id, []),
        }

    sites = [site(item, "definition") for item in register["definitions"]]
    sites.extend(site(item, "use") for item in register["uses"])

    graph_states = [
        item
        for item in provenance.get("coloring_nodes", [])
        if item["register"] == register_id
    ]
    simplify_positions = [
        {
            "phase": item["phase"],
            "attempt": item["attempt"],
            "position": item["position"],
        }
        for item in provenance.get("simplify_order", [])
        if item["register"] == register_id
    ]
    object_bindings = [
        item
        for item in provenance.get("object_bindings", [])
        if item["register"] == register_id
    ]
    coalesces = [
        item
        for item in provenance.get("coalesces", [])
        if register_id in (
            item.get("register"),
            item.get("parent"),
            item.get("root"),
        )
    ]
    coalescing_groups = [
        item
        for item in provenance.get("coalescing_groups", [])
        if register_id in item.get("members", [])
    ]
    coalescing_windows = [
        item
        for item in provenance.get("coalescing_windows", [])
        if item.get("register_class") == register["class"]
        and item.get("first") <= register["register"] <= item.get("last")
    ]
    counter_intervals = []
    initial_object_strata = []
    for boundary in provenance.get("virtual_register_boundaries", []):
        initial_object_last = boundary.get(
            "initial_object_register_last", {}
        ).get(register["class"])
        if (
            initial_object_last is not None
            and 32 <= register["register"] <= initial_object_last
            and not initial_object_strata
        ):
            initial_object_strata.append(
                {
                    "first": 32,
                    "last_exclusive": initial_object_last + 1,
                    "source_phase": boundary["phase"],
                }
            )
        interval = boundary.get("allocated_since_previous", {}).get(
            register["class"]
        )
        if interval is None:
            continue
        if interval["first"] <= register["register"] < interval["last_exclusive"]:
            counter_intervals.append(
                {
                    "phase": boundary["phase"],
                    **interval,
                }
            )

    return {
        "format": "mwcc-register-explanation-v1",
        "capture_index": provenance.get("capture_index"),
        "function_pointer": provenance.get("function_pointer"),
        "register": register,
        "sites": sites,
        "graph_states": graph_states,
        "simplify_positions": simplify_positions,
        "object_bindings": object_bindings,
        "coalesces": coalesces,
        "coalescing_groups": coalescing_groups,
        "coalescing_windows": coalescing_windows,
        "virtual_register_counter_intervals": counter_intervals,
        "initial_object_strata": initial_object_strata,
        "virtual_register_origins": [
            {
                **link,
                "event": virtual_register_creations.get(link["creation"]),
            }
            for link in register_creation_links
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Explain one virtual register from MWCC provenance facts"
    )
    parser.add_argument("provenance", type=Path)
    parser.add_argument("register", help="register ID such as gpr:38 or fpr:265")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    with args.provenance.open(encoding="utf-8") as stream:
        provenance = json.load(stream)
    explanation = explain_register(provenance, args.register)
    text = json.dumps(explanation, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
