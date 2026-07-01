# Opseq Tests

`test_opseq_v2.py` builds a tiny temp `build/GALE01/asm` fixture and writes all
tool output under `ORCH_TOOL_SHARED_DATA_ROOT`, so it does not populate project
shared tool-data.

Run:

```sh
python3 toolpacks/gamecube-decomp/research/opseq/tests/test_opseq_v2.py
```

The smoke path verifies full sequence persistence, deterministic fingerprint and
neighbor artifacts, symbol lookup through precomputed neighbors, raw opcode
query scoring, and status index counts.
