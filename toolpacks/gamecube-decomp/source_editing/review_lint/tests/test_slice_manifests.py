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


def _game_scoped_records() -> list[dict]:
    """Slices composed from a game-specific root ahead of the global set.

    When the game hosts the global set itself (Melee) every slice is scope
    "game" but there is only one root, so nothing is game-specific.
    """

    if len(_qa_rules.standards_dirs()) < 2:
        return []
    return [record for record in _qa_rules.RULE_SLICES if record["scope"] == "game"]


def test_slices_discovered():
    game_families = {record["family"] for record in _game_scoped_records()}
    families = [record["family"] for record in _qa_rules.RULE_SLICES]
    canonical = [family for family in families if family not in game_families]
    assert canonical == _qa_rules.CANONICAL_FAMILY_ORDER
    # Game-scoped families (e.g. sms_baseline, sms_fidelity) come first and
    # are not part of the canonical global order.
    assert families[: len(game_families)] == sorted(
        families[: len(game_families)], key=families.index
    )
    assert set(families[: len(game_families)]) == game_families


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
    game_rule_ids = {
        rule["rule_id"]
        for record in _game_scoped_records()
        if record["module"] is not None
        for rule in getattr(record["module"], "RULES", [])
    }
    assembled = [rule["rule_id"] for rule in _qa_rules.RULES]
    canonical = [rule_id for rule_id in assembled if rule_id not in game_rule_ids]
    assert canonical == _qa_rules.CANONICAL_RULE_ORDER
    # Game-scoped rules are unranked and sort after the canonical list by id.
    trailing = assembled[len(canonical):]
    assert set(trailing) == game_rule_ids
    assert trailing == sorted(trailing)


def test_order_manifest_covers_all_records():
    order: dict[str, list[str]] = {"standards": [], "examples": [], "families": []}
    for _scope, root in _qa_rules.standards_dirs():
        payload = json.loads((root / "order.json").read_text(encoding="utf-8"))
        for key in order:
            order[key].extend(payload.get(key, []))
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
