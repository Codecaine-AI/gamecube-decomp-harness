"""`api/unused_test.py` forwards to `steering_check.py unused-test`."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

API = Path(__file__).resolve().parents[1] / "api" / "unused_test.py"
spec = importlib.util.spec_from_file_location("unused_test_api", API)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class UnusedTestApiTest(unittest.TestCase):
    def test_timeout_becomes_the_compile_timeout_and_the_rest_reaches_unused_test(self):
        with mock.patch.dict(os.environ, {}, clear=False), mock.patch.object(api.steering_check, "main", return_value=0) as main:
            self.assertEqual(api.main(["--repo", "/r", "--timeout-seconds", "45", "--file", "src/a.cpp", "--function", "T::f", "--json"]), 0)
            self.assertEqual(os.environ["ORCH_MWCC_COMPILE_TIMEOUT"], "45")
        main.assert_called_once_with(["unused-test", "--repo", "/r", "--file", "src/a.cpp", "--function", "T::f", "--json"])

    def test_a_repo_without_the_revision_reports_a_json_error(self):
        with tempfile.TemporaryDirectory() as directory:
            result = subprocess.run([sys.executable, str(API), "--repo", directory, "--file", "src/a.cpp", "--function", "f", "--json"],
                                    capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 2)
        self.assertIn("unknown revision", json.loads(result.stdout)["error"])


BUILD_NINJA = """\
build build/GMSJ01/src/a.o: mwcc_extab src/a.cpp
  mw_version = GC/1.2.5
  cflags = -O4,p -c
  extab_padding = 0
"""
# Fake MWCC runner: `<runner> mwcceppc.exe <flags> -c src -o out` writes `out`.
FAKE_RUNNER = """#!/bin/sh
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then printf 'OBJ' > "$2"; fi
  shift
done
"""
# Fake dtk: `dtk extab clean --padding P in out` copies in to out.
FAKE_DTK = """#!/bin/sh
cp "$5" "$6"
"""


def _executable(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


def _tree(root):
    """Every path under root (ignored files included) with its size and mtime."""
    out = {}
    for directory, _dirs, files in os.walk(root):
        rel = os.path.relpath(directory, root)
        out[rel + "/"] = None
        for name in files:
            info = os.lstat(os.path.join(directory, name))
            out[os.path.join(rel, name)] = (info.st_size, info.st_mtime_ns)
    return out


class CheckoutUntouchedTest(unittest.TestCase):
    """r2-C item 2: a cold ninja_compile cache must not land in the checkout."""

    def test_a_run_leaves_the_checkout_tree_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            repo = base / "checkout"
            (repo / "src").mkdir(parents=True)
            (repo / "src/a.cpp").write_text("void f() { }\n")
            (repo / "build.ninja").write_text(BUILD_NINJA)
            (repo / ".gitignore").write_text("build/\n")
            _executable(repo / "build/tools/dtk", FAKE_DTK)
            (repo / "build/compilers/GC/1.2.5").mkdir(parents=True)
            (repo / "build/compilers/GC/1.2.5/mwcceppc.exe").write_text("")
            git = ["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t"]
            subprocess.run([*git, "init", "-q"], check=True)
            subprocess.run([*git, "add", "."], check=True)
            subprocess.run([*git, "commit", "-q", "-m", "base"], check=True)
            (repo / "src/a.cpp").write_text("void f() { g(); }\n")
            runner = base / "bin/fake-wibo"
            _executable(runner, FAKE_RUNNER)
            objdiff = base / "bin/objdiff-cli"
            _executable(objdiff, "#!/bin/sh\nexit 1\n")
            tmp = base / "tmp"
            tmp.mkdir()
            env = {k: v for k, v in os.environ.items()
                   if k not in ("NINJA_COMPILE_CACHE_DIR", "ORCH_GAME_STATE_DIR", "ORCH_GAME_REPO_ROOT")}
            env.update({"MWCC_WIBO": str(runner), "OBJDIFF_CLI": str(objdiff), "TMPDIR": str(tmp)})

            before = _tree(repo)
            result = subprocess.run([sys.executable, str(API), "--repo", str(repo), "--file", "src/a.cpp", "--function", "f", "--json"],
                                    capture_output=True, text=True, timeout=120, env=env, cwd=str(repo))
            self.assertEqual(_tree(repo), before, result.stdout + result.stderr)

            # The run reached both cache writers, outside the checkout.
            [cache] = list((tmp / "ninja-compile-cache").iterdir())
            self.assertTrue(list(cache.glob("build-edge-index-*.json")), result.stdout + result.stderr)
            self.assertTrue(list(cache.glob("clean-objects/*/*.o")), result.stdout + result.stderr)
            self.assertFalse((repo / "build/.ninja_compile_cache").exists())

    def test_an_explicit_cache_dir_is_kept(self):
        with mock.patch.dict(os.environ, {"NINJA_COMPILE_CACHE_DIR": "/elsewhere"}), \
                mock.patch.object(api.steering_check, "main", return_value=0):
            api.main(["--repo", "/r", "--file", "a.cpp", "--function", "f"])
            self.assertEqual(os.environ["NINJA_COMPILE_CACHE_DIR"], "/elsewhere")
        self.assertNotEqual(api.cache_dir_for(["--repo", "/a"]), api.cache_dir_for(["--repo", "/b"]))
        self.assertTrue(str(api.cache_dir_for(["--repo", "/a"])).startswith(tempfile.gettempdir()))


if __name__ == "__main__":
    unittest.main()
