#!/usr/bin/env python3
"""Rank and compare the lowering sites that create live virtual registers."""

import argparse
import json
from collections import Counter
from pathlib import Path


def load_json(path: Path) -> dict:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def group_key(event: dict) -> tuple[str, str, str]:
    return (
        event["register_class"],
        event["allocation_kind"],
        event["allocator_address"],
    )


def summarize_origins(provenance: dict) -> dict:
    events = {
        event["id"]: event
        for event in provenance.get("virtual_register_creations", [])
    }
    registers = {item["id"]: item for item in provenance["registers"]}
    operands = {item["id"]: item for item in provenance["operands"]}
    instructions = {item["id"]: item for item in provenance["instructions"]}
    groups = {}

    for event in events.values():
        key = group_key(event)
        group = groups.setdefault(
            key,
            {
                "register_class": key[0],
                "allocation_kind": key[1],
                "allocator_address": key[2],
                "allocator_function": event.get("allocator_function"),
                "allocator_operation": event.get("allocator_operation"),
                "allocator_operation_category": event.get(
                    "allocator_operation_category"
                ),
                "allocator_evidence": event.get("allocator_evidence"),
                "allocator_evidence_source": event.get(
                    "allocator_evidence_source"
                ),
                "allocated_count": 0,
                "live_registers": [],
                "definition_mnemonics": Counter(),
            },
        )
        group["allocated_count"] += 1

    for link in provenance.get("register_created_by", []):
        event = events[link["creation"]]
        group = groups[group_key(event)]
        register_id = link["register"]
        group["live_registers"].append(register_id)
        mnemonics = set()
        for operand_id in registers[register_id]["definitions"]:
            instruction_id = operands[operand_id]["instruction"]
            mnemonic = instructions[instruction_id].get("mnemonic")
            mnemonics.add(mnemonic or f"opcode_{instructions[instruction_id]['opcode']}")
        group["definition_mnemonics"].update(mnemonics)

    result = []
    for group in groups.values():
        live_registers = sorted(
            set(group.pop("live_registers")),
            key=lambda value: int(value.split(":", 1)[1]),
        )
        definitions = dict(
            sorted(
                group.pop("definition_mnemonics").items(),
                key=lambda item: (-item[1], item[0]),
            )
        )
        result.append(
            {
                **group,
                "live_count": len(live_registers),
                "dead_count": group["allocated_count"] - len(live_registers),
                "first_live_register": live_registers[0] if live_registers else None,
                "last_live_register": live_registers[-1] if live_registers else None,
                "definition_mnemonics": definitions,
            }
        )
    result.sort(
        key=lambda item: (
            -item["live_count"],
            -item["allocated_count"],
            item["register_class"],
            item["allocator_address"],
        )
    )
    return {
        "format": "mwcc-register-origin-summary-v1",
        "capture_index": provenance.get("capture_index"),
        "function_pointer": provenance.get("function_pointer"),
        "groups": result,
    }


def compare_summaries(left: dict, right: dict) -> dict:
    def index(summary: dict) -> dict:
        return {
            (
                item["register_class"],
                item["allocation_kind"],
                item["allocator_address"],
            ): item
            for item in summary["groups"]
        }

    left_groups = index(left)
    right_groups = index(right)
    changes = []
    for key in sorted(set(left_groups) | set(right_groups)):
        left_group = left_groups.get(key)
        right_group = right_groups.get(key)
        left_allocated = left_group["allocated_count"] if left_group else 0
        right_allocated = right_group["allocated_count"] if right_group else 0
        left_live = left_group["live_count"] if left_group else 0
        right_live = right_group["live_count"] if right_group else 0
        if left_allocated == right_allocated and left_live == right_live:
            continue
        representative = right_group or left_group
        changes.append(
            {
                "register_class": key[0],
                "allocation_kind": key[1],
                "allocator_address": key[2],
                "allocator_function": representative.get("allocator_function"),
                "allocator_operation": representative.get("allocator_operation"),
                "allocator_operation_category": representative.get(
                    "allocator_operation_category"
                ),
                "allocator_evidence": representative.get("allocator_evidence"),
                "allocated_left": left_allocated,
                "allocated_right": right_allocated,
                "allocated_delta": right_allocated - left_allocated,
                "live_left": left_live,
                "live_right": right_live,
                "live_delta": right_live - left_live,
            }
        )
    changes.sort(
        key=lambda item: (
            -abs(item["live_delta"]),
            -abs(item["allocated_delta"]),
            item["register_class"],
            item["allocator_address"],
        )
    )
    return {
        "format": "mwcc-register-origin-comparison-v1",
        "left_capture_index": left.get("capture_index"),
        "right_capture_index": right.get("capture_index"),
        "changes": changes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rank live virtual registers by their lowering origin"
    )
    parser.add_argument("provenance", type=Path)
    parser.add_argument("--compare", type=Path)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    result = summarize_origins(load_json(args.provenance))
    if args.compare:
        right = summarize_origins(load_json(args.compare))
        result = compare_summaries(result, right)
        records = result["changes"]
    else:
        records = result["groups"]
    if args.limit is not None:
        del records[args.limit :]

    text = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
