"""A throwaway game checkout whose MWCC runner is fixtures/native/fake_mwcc.py."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

SUITE = Path(__file__).resolve().parents[1]
FIXTURES = SUITE / "tests" / "fixtures" / "native"
FAKE_COMPILER = FIXTURES / "fake_mwcc.py"
UNIT = "src/game/actor.c"

HEADER = """\
#ifndef ACTOR_H
#define ACTOR_H
static inline int clamp_hp(int hp) {
    int limit = 99;
    return hp > limit ? limit : hp;
}
#endif
"""

SOURCE = """\
#include "actor.h"

int actor_update(int hp, int dmg) {
    int left = hp - dmg;
    int capped = clamp_hp(left);
    float scale = 1.5f;
    int result = capped * 2;
    return result;
}

int actor_idle(void) {
    int tick = 0;
    return tick;
}

void actor_nop(void) {
}
"""


def git(root: Path, *args: str) -> str:
    env = {**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t",
           "GIT_COMMITTER_EMAIL": "t@t"}
    return subprocess.run(["git", *args], cwd=root, check=True, capture_output=True, text=True, env=env).stdout


def make_repo(tmp: Path, points=("vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse")) -> Path:
    root = tmp / "checkout"
    (root / "src/game").mkdir(parents=True)
    (root / "include").mkdir()
    (root / "src/game/actor.c").write_text(SOURCE)
    (root / "include/actor.h").write_text(HEADER)
    (root / "build.ninja").write_text(
        "rule mwcc\n  command = mwcc\n"
        "build build/GTEST01/src/game/actor.o: mwcc src/game/actor.c\n"
        "  mw_version = GC/1.2.5\n  cflags = -O4,p -nosyspath -i include\n"
    )
    (root / ".gitignore").write_text("build/\n")
    stock = root / "build/compilers/GC/1.2.5/mwcceppc.exe"
    traced = root / "build/compilers-traced/GC/1.2.5/mwcceppc.exe"
    for path, payload in ((stock, b"stock 1.2.5"), (traced, b"traced 1.2.5")):
        path.parent.mkdir(parents=True)
        path.write_bytes(payload)
    caps = {"schema": "mwcc-native-capabilities-v1", "pin": "92f893f",
            "versions": {"1.2.5": {"stock_sha1": hashlib.sha1(b"stock 1.2.5").hexdigest(),
                                   "traced_sha1": hashlib.sha1(b"traced 1.2.5").hexdigest(),
                                   "points": list(points)}}}
    (root / "build/compilers-traced/CAPABILITIES.json").write_text(json.dumps(caps))
    runner = tmp / "runner"
    runner.write_text(f"#!/bin/sh\nexec {shutil.which('python3') or sys.executable} {FAKE_COMPILER} \"$@\"\n")
    runner.chmod(0o755)
    git(root, "init", "-q")
    git(root, "add", "-A")
    git(root, "commit", "-q", "-m", "base")
    return root


def fake_env(tmp: Path, root: Path) -> dict[str, str]:
    return {
        "MWCC_WIBO": str(tmp / "runner"),
        "ORCH_GAME_REPO_ROOT": str(root),
        "ORCH_MWCC_TRACED_ROOT": "",
        "FAKE_MWCC_LOG": str(tmp / "mwcc.log"),
        "PYTHONDONTWRITEBYTECODE": "1",
    }


def run_api(script: str, args: list[str], env: dict[str, str], timeout: int = 120) -> dict:
    result = subprocess.run([sys.executable, str(SUITE / "api" / script), *args, "--json"],
                            capture_output=True, text=True, env={**os.environ, **env}, timeout=timeout)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise AssertionError(f"{script} printed no JSON: {result.stdout[-2000:]} {result.stderr[-2000:]}") from error
