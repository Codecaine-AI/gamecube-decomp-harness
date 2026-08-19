# Assembly Window Search Tests

Run the stdlib-only suite from the repository root:

```sh
python3 -m unittest discover -s toolpacks/gamecube-decomp/research/asm_window_search/tests -p 'test_*.py'
```

The tests cover objdump normalization and relocations, hashed dense/sparse
determinism, window tail flushing, the packed sparse format, end-to-end donor
ranking and match filtering, and the missing-index status contract. Fixtures
and indexes stay inside temporary directories.
