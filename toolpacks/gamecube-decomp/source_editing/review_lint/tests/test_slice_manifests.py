"""Consistency checks for the standards/<family>/ rule slices.

Asserts that every slice.json manifest, its rules.py module, the family's
standards records, and the engine's canonical rule ordering agree:

(a) every slice.json rule exists in its rules.py and vice versa;
(b) every standard's qa_rule_ids resolve to rules or post-scan escalations
    declared in the slice manifests ("banned_pattern:*" and
    "resubmission_tombstone" are engine-owned and always allowed);
(c) rule ids are globally unique across slices;
(d) the assembled RULES order matches the canonical order list.
"""

from __future__ import annotations

import json

import conftest  # noqa: F401  (inserts api/ into sys.path)
import _qa_rules

ENGINE_OWNED_QA_RULE_IDS = {"banned_pattern:*", "resubmission_tombstone"}


def _read_jsonl(path):
    records = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            records.append(json.loads(line))
    return records


def _declared_rule_ids() -> set[str]:
    declared: set[str] = set()
    for record in _qa_rules.RULE_SLICES:
        manifest = record["manifest"]
        declared.update(entry["rule_id"] for entry in manifest.get("rules", []))
        declared.update(entry["rule_id"] for entry in manifest.get("escalations", []))
    return declared


def test_slices_discovered():
    families = [record["family"] for record in _qa_rules.RULE_SLICES]
    assert families == _qa_rules.CANONICAL_FAMILY_ORDER


def test_manifest_rules_match_rules_py_both_directions():
    for record in _qa_rules.RULE_SLICES:
        manifest_entries = {
            entry["rule_id"]: entry for entry in record["manifest"].get("rules", [])
        }
        module = record["module"]
        module_rules = {
            rule["rule_id"]: rule for rule in getattr(module, "RULES", [])
        } if module is not None else {}
        assert set(manifest_entries) == set(module_rules), record["family"]
        for rule_id, entry in manifest_entries.items():
            rule = module_rules[rule_id]
            assert rule["severity"] == entry["severity"], rule_id
            assert rule["standard_id"] == entry["standard_id"], rule_id
            assert rule["applies_to"] == entry["applies_to"], rule_id


def test_standard_qa_rule_ids_resolve_to_declared_rules():
    declared = _declared_rule_ids() | ENGINE_OWNED_QA_RULE_IDS
    for record in _qa_rules.RULE_SLICES:
        standards_path = record["path"] / "standards.jsonl"
        standards = _read_jsonl(standards_path)
        manifest_standard_ids = record["manifest"].get("standards", [])
        assert [standard["id"] for standard in standards] == manifest_standard_ids, (
            record["family"]
        )
        for standard in standards:
            assert standard.get("family") == record["family"], standard["id"]
            for qa_rule_id in standard.get("qa_rule_ids") or []:
                assert qa_rule_id in declared, (
                    f"{standard['id']} references undeclared qa_rule_id {qa_rule_id}"
                )


def test_examples_route_to_owning_family_slice():
    for record in _qa_rules.RULE_SLICES:
        standard_ids = set(record["manifest"].get("standards", []))
        examples_path = record["path"] / "examples.jsonl"
        for example in _read_jsonl(examples_path):
            assert example["standard_id"] in standard_ids, (
                f"example {example['id']} in {record['family']} references "
                f"{example['standard_id']} owned by another family"
            )


def test_rule_ids_globally_unique():
    seen: dict[str, str] = {}
    for record in _qa_rules.RULE_SLICES:
        module = record["module"]
        for rule in getattr(module, "RULES", []) if module is not None else []:
            assert rule["rule_id"] not in seen, (
                f"rule {rule['rule_id']} declared by both "
                f"{seen[rule['rule_id']]} and {record['family']}"
            )
            seen[rule["rule_id"]] = record["family"]
    escalation_seen: dict[str, str] = {}
    for record in _qa_rules.RULE_SLICES:
        for entry in record["manifest"].get("escalations", []):
            assert entry["rule_id"] not in seen, entry["rule_id"]
            assert entry["rule_id"] not in escalation_seen, entry["rule_id"]
            escalation_seen[entry["rule_id"]] = record["family"]


def test_assembled_rules_match_canonical_order():
    assembled = [rule["rule_id"] for rule in _qa_rules.RULES]
    assert assembled == _qa_rules.CANONICAL_RULE_ORDER


def test_order_manifest_covers_all_records():
    order = json.loads(
        (_qa_rules.standards_dir() / "order.json").read_text(encoding="utf-8")
    )
    standard_ids: list[str] = []
    example_ids: list[str] = []
    for record in _qa_rules.RULE_SLICES:
        standard_ids.extend(
            row["id"] for row in _read_jsonl(record["path"] / "standards.jsonl")
        )
        example_ids.extend(
            row["id"] for row in _read_jsonl(record["path"] / "examples.jsonl")
        )
    assert sorted(order["standards"]) == sorted(standard_ids)
    assert sorted(order["examples"]) == sorted(example_ids)
    assert sorted(order["families"]) == sorted(
        record["family"] for record in _qa_rules.RULE_SLICES
    )
