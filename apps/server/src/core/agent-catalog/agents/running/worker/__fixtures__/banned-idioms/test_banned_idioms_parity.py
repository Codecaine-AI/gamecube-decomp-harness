"""Python side of the banned-idiom lint parity check.

Runs `BANNED_IDIOMS_PY` (extracted from ../../banned-idioms-sandbox.ts) over the
shared corpus (corpus.json) and compares every verdict with expected.json, the
TypeScript host lint's verdicts (`loadBannedIdiomContext` + `lintBannedIdioms`)
recorded by ../../banned-idioms-parity.test.ts, which also fails when
expected.json is stale.

Run: python3 -m pytest apps/server/src/core/agent-catalog/agents/running/worker/__fixtures__/banned-idioms
"""

import importlib.util
import json
import os
import re
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
TS_SOURCE = HERE.parent.parent / "banned-idioms-sandbox.ts"
DEFAULT_TARGETS = [None, ".data", "target"]


def load_module(tmp_path_factory):
    source = TS_SOURCE.read_text(encoding="utf-8")
    match = re.search(r"BANNED_IDIOMS_PY = String\.raw`(.*?)`;", source, re.S)
    assert match, "BANNED_IDIOMS_PY not found in banned-idioms-sandbox.ts"
    path = tmp_path_factory.mktemp("banned") / "banned_idioms.py"
    path.write_text(match.group(1), encoding="utf-8")
    spec = importlib.util.spec_from_file_location("banned_idioms", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def banned(tmp_path_factory):
    return load_module(tmp_path_factory)


def jobs():
    corpus = json.loads((HERE / "corpus.json").read_text(encoding="utf-8"))
    for case in corpus["cases"]:
        for target in case["targets"] if case["targets"] is not None else DEFAULT_TARGETS:
            yield "%s :: %s" % (case["name"], target if target is not None else "(no target)"), case, target


EXPECTED = json.loads((HERE / "expected.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("key,case,target", list(jobs()), ids=lambda value: value if isinstance(value, str) else "")
def test_python_lint_matches_typescript(banned, key, case, target, monkeypatch):
    if case["mode"] == "context":
        context = dict(case["context"])
        context.setdefault("baselineSources", {})
        context.setdefault("postChangeSources", {})
        context["targetFunction"] = target
        verdict = banned.lint(case["diff"], context)
    else:
        case_dir = HERE / "cases" / case["dir"]
        diff = (case_dir / "diff.patch").read_bytes().decode("utf-8")
        monkeypatch.chdir(case_dir / "post")
        request = {"diff": diff, "targetFunction": target, "snapshotDir": str(case_dir / "base"), "snapshotPaths": case["basePaths"], "symbolsPath": case["symbolsPath"]}
        verdict = banned.lint(diff, banned.context_for(request))
    assert verdict == EXPECTED[key]
