#!/usr/bin/env python3
"""Focused regression tests for lazy checkdiff diagnostics and scoring."""

from __future__ import annotations

import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest import mock


TOOLS = Path(__file__).resolve().parents[3] / "_impl" / "gamecube" / "tools"
sys.path.insert(0, str(TOOLS))

import checkdiff  # noqa: E402


def diff_result(func_name: str, percent: float, returncode: int = 0) -> subprocess.CompletedProcess[str]:
    payload = {
        "left": {
            "symbols": [
                {
                    "name": func_name,
                    "match_percent": percent,
                }
            ]
        }
    }
    return subprocess.CompletedProcess([], returncode, stdout=json.dumps(payload), stderr="")


class BuildUnitTest(unittest.TestCase):
    def test_clean_compile_skips_include_diagnosis(self) -> None:
        compiled = SimpleNamespace(obj=Path("candidate.o"))
        with (
            mock.patch.object(checkdiff, "direct_compile", return_value=compiled) as direct_compile,
            mock.patch.object(checkdiff.subprocess, "run") as run,
        ):
            self.assertIs(checkdiff.build_unit("melee/lb/lbtime"), compiled)

        direct_compile.assert_called_once_with("melee/lb/lbtime")
        run.assert_not_called()

    def test_non_symbol_compile_failure_is_replayed_without_diagnosis(self) -> None:
        def fail_compile(_obj_path: str):
            print("expression syntax error")
            print("direct compile failed:", file=sys.stderr)
            return None

        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.object(checkdiff, "direct_compile", side_effect=fail_compile),
            mock.patch.object(checkdiff.subprocess, "run") as run,
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            self.assertIsNone(checkdiff.build_unit("melee/lb/lbtime"))

        run.assert_not_called()
        self.assertEqual(stdout.getvalue(), "expression syntax error\n")
        self.assertEqual(stderr.getvalue(), "direct compile failed:\n")

    def test_missing_prototype_runs_diagnosis_then_retries(self) -> None:
        compiled = SimpleNamespace(obj=Path("candidate.o"))
        compile_calls = 0

        def compile_after_diagnosis(_obj_path: str):
            nonlocal compile_calls
            compile_calls += 1
            if compile_calls == 1:
                print("function has no prototype")
                print("direct compile failed:", file=sys.stderr)
                return None
            return compiled

        fixer_result = subprocess.CompletedProcess(
            [], 0, stdout=b"No undeclared functions detected by clang.\n", stderr=b""
        )
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.object(checkdiff, "direct_compile", side_effect=compile_after_diagnosis),
            mock.patch.object(checkdiff.subprocess, "run", return_value=fixer_result) as run,
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            self.assertIs(checkdiff.build_unit("melee/lb/lbtime"), compiled)

        self.assertEqual(compile_calls, 2)
        run.assert_called_once()
        self.assertEqual(stdout.getvalue(), "")
        self.assertEqual(stderr.getvalue(), "")

    def test_fixer_noop_keeps_only_retry_compile_diagnostics(self) -> None:
        def missing_symbol(_obj_path: str):
            print("undefined identifier 'CodexMissingSymbol'")
            print("direct compile failed:", file=sys.stderr)
            return None

        fixer_result = subprocess.CompletedProcess(
            [], 0, stdout=b"No undeclared functions detected by clang.\n", stderr=b""
        )
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.object(checkdiff, "direct_compile", side_effect=missing_symbol),
            mock.patch.object(checkdiff.subprocess, "run", return_value=fixer_result),
            contextlib.redirect_stdout(stdout),
            contextlib.redirect_stderr(stderr),
        ):
            self.assertIsNone(checkdiff.build_unit("melee/lb/lbtime"))

        self.assertEqual(stdout.getvalue(), "undefined identifier 'CodexMissingSymbol'\n")
        self.assertEqual(stderr.getvalue(), "direct compile failed:\n")
        self.assertNotIn("No undeclared functions", stdout.getvalue())

    def test_actual_mwcc_missing_symbol_patterns_are_recognized(self) -> None:
        for diagnostic in (
            "function has no prototype",
            "undefined identifier 'value'",
            "illegal forward label or undefined symbol (value) in constant expression",
        ):
            with self.subTest(diagnostic=diagnostic):
                self.assertTrue(checkdiff.needs_include_diagnosis(diagnostic))
        self.assertFalse(checkdiff.needs_include_diagnosis("expression syntax error"))


class ObjdiffTest(unittest.TestCase):
    def test_run_diff_is_strict_by_default(self) -> None:
        completed = subprocess.CompletedProcess([], 0, stdout="{}", stderr="")
        with (
            mock.patch.object(checkdiff, "objdiff_cli", return_value="objdiff-cli"),
            mock.patch.object(checkdiff.subprocess, "run", return_value=completed) as run,
        ):
            checkdiff.run_diff("melee/lb/lbtime", Path("candidate.o"), "lbTime_8000AEC8", capture=True)

        command = run.call_args.args[0]
        self.assertNotIn("functionRelocDiffs=data_value", command)

    def test_relaxed_diff_is_explicit(self) -> None:
        completed = subprocess.CompletedProcess([], 0, stdout="{}", stderr="")
        with (
            mock.patch.object(checkdiff, "objdiff_cli", return_value="objdiff-cli"),
            mock.patch.object(checkdiff.subprocess, "run", return_value=completed) as run,
        ):
            checkdiff.run_diff(
                "melee/lb/lbtime",
                Path("candidate.o"),
                "lbTime_8000AEC8",
                capture=True,
                strict=False,
            )

        command = run.call_args.args[0]
        self.assertIn("functionRelocDiffs=data_value", command)

    def test_exact_single_check_runs_objdiff_once(self) -> None:
        compiled = SimpleNamespace(obj=Path("candidate.o"))
        result = diff_result("lbTime_8000AEC8", 100.0)
        stdout = io.StringIO()
        with (
            mock.patch.object(checkdiff, "find_unit_for_function", return_value="melee/lb/lbtime"),
            mock.patch.object(checkdiff, "build_unit", return_value=compiled),
            mock.patch.object(checkdiff, "run_diff", return_value=result) as run_diff,
            contextlib.redirect_stdout(stdout),
        ):
            self.assertEqual(checkdiff.check_single("lbTime_8000AEC8", full_diff=False), 0)

        run_diff.assert_called_once_with(
            "melee/lb/lbtime", Path("candidate.o"), "lbTime_8000AEC8", capture=True
        )
        self.assertEqual(stdout.getvalue(), "lbTime_8000AEC8: PASS (100.00000%)\n")

    def test_mismatch_preserves_relocation_only_diagnostic(self) -> None:
        compiled = SimpleNamespace(obj=Path("candidate.o"))
        results = [
            diff_result("lbTime_8000AEC8", 90.0),
            diff_result("lbTime_8000AEC8", 100.0),
        ]
        stdout = io.StringIO()
        with (
            mock.patch.object(checkdiff, "find_unit_for_function", return_value="melee/lb/lbtime"),
            mock.patch.object(checkdiff, "build_unit", return_value=compiled),
            mock.patch.object(checkdiff, "run_diff", side_effect=results) as run_diff,
            contextlib.redirect_stdout(stdout),
        ):
            self.assertEqual(checkdiff.check_single("lbTime_8000AEC8", full_diff=False), 1)

        self.assertEqual(run_diff.call_count, 2)
        self.assertFalse(run_diff.call_args_list[1].kwargs["strict"])
        self.assertEqual(
            stdout.getvalue(),
            "lbTime_8000AEC8: FAIL (90.00000% official; instructions match but "
            "relocation/data references still differ, so the official score is below exact)\n",
        )

    def test_summary_mismatch_keeps_relaxed_relocation_classification(self) -> None:
        compiled = SimpleNamespace(obj=Path("candidate.o"))
        results = [
            diff_result("lbTime_8000AEC8", 90.0),
            diff_result("lbTime_8000AEC8", 100.0),
        ]
        stdout = io.StringIO()
        with (
            mock.patch.object(
                checkdiff,
                "resolve_functions",
                return_value={"melee/lb/lbtime": ["lbTime_8000AEC8"]},
            ),
            mock.patch.object(
                checkdiff,
                "build_units",
                return_value={"melee/lb/lbtime": compiled},
            ),
            mock.patch.object(checkdiff, "run_diff", side_effect=results) as run_diff,
            contextlib.redirect_stdout(stdout),
        ):
            self.assertEqual(checkdiff.check_multiple(["lbTime_8000AEC8"]), 1)

        self.assertEqual(run_diff.call_count, 2)
        self.assertFalse(run_diff.call_args_list[1].kwargs["strict"])
        self.assertIn("instructions match but relocation/data references still differ", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
