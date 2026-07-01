# Review Lint API

Worker-facing commands:

- `python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/status.py --json`
- `python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/scan.py --file <path> --json`
- `python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/scan.py --text '<source snippet>' --json`
- `python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py --repo <melee-root> --base origin/master --gate --json`
- `python3 toolpacks/gamecube-decomp/source_editing/review_lint/api/sdata2_order_helper.py --repo-root <melee-root> --source <path> [--symbol <label>] --json`

Use `--rule all`, `--rule type_erasing_casts`, or
`--rule inline_pointer_vars` to narrow the scan.

`sdata2_order_helper.py` previews an isolated helper for `.sdata2` float/double
ordering. It writes source only with `--apply`; add `--validate` after applying
to direct-compile the TU and compare `.sdata2` order against the reference
object. Repeat `--symbol` to keep the helper scoped to the address-style labels
from QA findings; omit it only for an explicit full-TU ordering helper.
