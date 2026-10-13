"""Stack frame policy gating in mwcc_diagnose and src_mutate.

`match_frame` (Melee) keeps today's padding / declaration-swap suggestions and
mutation passes; `stop_at_frame` (SMS) drops them. src_mutate needs
tree-sitter, so its tests skip without it.
"""

from __future__ import annotations

import contextlib
import io
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

TOOLS_DIR = Path(__file__).resolve().parent
os.environ.setdefault("ORCH_GAME_REPO_ROOT", tempfile.gettempdir())

from collections import Counter  # noqa: E402

import mwcc_diagnose  # noqa: E402

try:
    import src_mutate
except ImportError:  # tree-sitter is not installed
    src_mutate = None

PAD_SOURCE = """\
void fn(void) {
    int a;
    int b;
    PAD_STACK(8);
    a = 0 <= b;
}
"""


def captured(func, *args, **kwargs) -> str:
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        func(*args, **kwargs)
    return out.getvalue()


class DiagnoseStackPolicyTest(unittest.TestCase):
    def setUp(self) -> None:
        self.source_locals = mwcc_diagnose.parse_source_locals_from_body(PAD_SOURCE, 1)

    def test_match_frame_keeps_padding_suggestion(self) -> None:
        suggestions = mwcc_diagnose.stack_fix_suggestions(0x30, 0x38, Path("/missing.c"), "fn", [], self.source_locals)
        self.assertEqual(suggestions, ["reduce stack padding by 8 bytes (try `PAD_STACK(0)` instead of `PAD_STACK(8)`)"])
        text = captured(mwcc_diagnose.print_compact_stack_diagnosis, [], suggestions, self.source_locals)
        self.assertIn("Suggested stack fixes:", text)
        self.assertIn("PAD_STACK(0)", text)
        self.assertNotIn("stop_at_frame", text)

    def test_stop_at_frame_prints_policy_instead_of_fixes(self) -> None:
        text = captured(
            mwcc_diagnose.print_compact_stack_diagnosis,
            [],
            ["try `PAD_STACK(0)`", "try swapping the declaration order of `a` and `b`"],
            self.source_locals,
            True,
        )
        self.assertIn("Stack frame policy (stop_at_frame)", text)
        self.assertIn("is done under this policy", text)
        self.assertNotIn("Suggested stack fixes", text)
        self.assertNotIn("try `PAD_STACK", text)
        self.assertNotIn("try swapping", text)

    def test_guidance_follows_policy(self) -> None:
        summary = mock.Mock(counts={"stack": 2, "frame": 1})
        mismatch = mock.Mock(delta=8)
        args = (summary, 0x30, 0x38, [mismatch], Counter({8: 2}), ["indexed", "conversion"])
        melee = captured(mwcc_diagnose.print_guidance, *args)
        self.assertIn("PAD_STACK-sized gap", melee)
        self.assertIn("compare array declaration order", melee)
        sms = captured(mwcc_diagnose.print_guidance, *args, True)
        self.assertIn("Stack frame policy (stop_at_frame)", sms)
        self.assertIn("int/float conversion stack temp", sms)
        self.assertNotIn("PAD_STACK", sms)
        self.assertNotIn("declaration order", sms.replace("reorder declarations", ""))

    def test_diagnose_reads_policy_from_env(self) -> None:
        with mock.patch.dict(os.environ, {"ORCH_STACK_FRAME_POLICY": "stop_at_frame"}):
            self.assertTrue(mwcc_diagnose.stops_at_frame())
        with mock.patch.dict(os.environ, {"ORCH_STACK_FRAME_POLICY": "match_frame"}):
            self.assertFalse(mwcc_diagnose.stops_at_frame())


@unittest.skipIf(src_mutate is None, "tree-sitter is not installed")
class SrcMutatePolicyTest(unittest.TestCase):
    def pass_names(self, policy: str) -> list[str]:
        with mock.patch.dict(os.environ, {"ORCH_STACK_FRAME_POLICY": policy}):
            return [name for name, _func, _weight in src_mutate.Mutator("fn").passes]

    def test_match_frame_keeps_every_pass(self) -> None:
        self.assertEqual(self.pass_names("match_frame"), [name for name, _f, _w in src_mutate.PASSES])

    def test_stop_at_frame_drops_padding_only(self) -> None:
        names = self.pass_names("stop_at_frame")
        self.assertNotIn("pad_var_decl", names)
        self.assertIn("commutative", names)
        self.assertIn("reorder_decls", names)
        self.assertEqual(len(names), len(src_mutate.PASSES) - 1)

    def test_stop_at_frame_rejects_named_padding_pass(self) -> None:
        import random

        with mock.patch.dict(os.environ, {"ORCH_STACK_FRAME_POLICY": "stop_at_frame"}):
            mutator = src_mutate.Mutator("fn")
        with self.assertRaises(SystemExit) as raised:
            mutator.step_named_result(PAD_SOURCE.encode(), "pad_var_decl", random.Random(1))
        self.assertIn("stop_at_frame", str(raised.exception.code))

    def run_preview(self, policy: str, pass_name: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "fn.c"
            source.write_text(PAD_SOURCE)
            env = {**os.environ, "ORCH_STACK_FRAME_POLICY": policy}
            return subprocess.run(
                [sys.executable, str(TOOLS_DIR / "src_mutate.py"), str(source), "fn", "--pass", pass_name, "--no-types"],
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )

    def test_preview_labels_frame_sensitive_passes_under_stop_at_frame(self) -> None:
        sms = self.run_preview("stop_at_frame", "commutative")
        self.assertEqual(sms.returncode, 0, sms.stderr)
        self.assertIn("b >= 0", sms.stdout)
        self.assertIn("stack frame policy (stop_at_frame)", sms.stderr)
        self.assertIn("commutative", sms.stderr)

        melee = self.run_preview("match_frame", "commutative")
        # Same mutation; only the temp file path in the diff header differs.
        self.assertEqual(melee.stdout.splitlines()[2:], sms.stdout.splitlines()[2:])
        self.assertNotIn("stack frame policy", melee.stderr)


if __name__ == "__main__":
    unittest.main()
