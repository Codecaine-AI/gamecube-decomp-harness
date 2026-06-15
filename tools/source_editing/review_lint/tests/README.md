# Review Lint Tests

Tests cover the whole-file advisory scanner and the diff-aware hard gate. New
maintainer-rejected patterns should get both a small `_qa_rules.py` unit test
and, when practical, a `scan_diff.py --gate` fixture so CI exercises the same
path used by worker and PR handoff validation.
