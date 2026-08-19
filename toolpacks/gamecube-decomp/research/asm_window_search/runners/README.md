# Assembly Window Search Runner

The runner needs a built melee checkout with
`build/GALE01/**/obj/**/*.o` target objects and a
`powerpc-eabi-objdump`. It checks `DSEARCH_OBJDUMP`, then
`<repo-root>/build/binutils/powerpc-eabi-objdump`, then `PATH`.

```sh
python3 toolpacks/gamecube-decomp/research/asm_window_search/runners/build_asm_window_index.py --repo-root <built_melee_checkout>
```

By default it loads `<repo-root>/build/GALE01/report.json` when present and
writes to `ORCH_TOOL_SHARED_DATA_ROOT`, or
`games/melee/shared/tool-data/asm_window_search` otherwise. Use `--report` for
a local report or URL, `--objdump` for an explicit binary, and `--out` for an
explicit storage root. Missing report data is allowed; the manifest records a
warning and function match percentages remain null.

The runner writes all four index files through same-directory temporary files
and renames the manifest last. Rerun it after target objects or the progress
report change.
