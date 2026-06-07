# Debugging and Research Analysis Acceleration

This reference is for local debugging tools, one-off data analysis scripts,
sweeps, audits, and research runners. It is not a default instruction for
production pipeline code. The target runtime may not be a Mac and may not have
a GPU, so workstation-specific acceleration must stay optional, local-scoped,
and easy to bypass.

## Defaults

- Use bounded parallelism for independent shard-local, config-local, or
  artifact-local jobs.
- Use vectorized NumPy, matrix multiplication, batched scoring, and count-only
  reductions for data analysis before writing Python row loops.
- Before adding GPU code, check for an algorithmic fix. For sparse or heavily
  filtered boolean sweeps, a count-only NumPy rewrite can beat GPU code by
  avoiding large mostly-zero matrices.
- Benchmark real saved shard shapes before committing to an acceleration path.
  Capture shape, chunk size, CPU thread settings, data residency, and whether
  outputs were copied back to CPU.

## Local Mac MLX Path

Use Apple Silicon MLX for large local analysis and debugging jobs when the
machine supports it. Keep it out of production/challenge pipeline code unless
the user explicitly asks for that dependency.

Expected useful setup:

- Apple M2 Max or similar Apple Silicon machine.
- Native arm64 Python 3.10+.
- macOS 14+.
- `mlx` installed in an analysis/debug venv.
- Avoid Rosetta/x86 Python and older repo venvs that cannot load MLX.

Hardware check:

```bash
uname -m
sysctl -n machdep.cpu.brand_string
python - <<'PY'
import platform
print(platform.machine(), platform.processor())
try:
    import mlx.core as mx
    print(mx.default_device(), mx.metal.is_available())
except Exception as exc:
    print(type(exc).__name__, exc)
PY
```

Use MLX for:

- large KNN/candidate-retrieval blocks over `knn_struct` or similar dense
  feature matrices;
- large pairwise cosine/similarity tiles;
- top-k selection that can stay on the GPU;
- repeated local research sweeps where the same large arrays are reused.

Avoid MLX for:

- production/challenge pipeline code that must run unchanged off Mac;
- small matrices or small config chunks where launch/copy overhead dominates;
- sparse or heavily filtered boolean sweeps;
- graph/DSU/bridge/articulation logic where control flow dominates.

## MLX Usage Rules From Official Docs

- MLX is lazy: operations build a graph and do not run until `mx.eval`, array
  printing, NumPy conversion, saving, or memory access. Warm up benchmarks and
  put `mx.eval(...)` around the exact outputs being timed.
- Batch enough work into each evaluation. Avoid calling `mx.eval` after every
  tiny operation, but also avoid letting a long loop build an enormous graph.
- Keep large arrays resident as MLX arrays across blocks. Do not convert NumPy
  arrays to MLX and copy results back for every small operation.
- Move large feature matrices to MLX once, run matmul/top-k/counts there, and
  copy back compact outputs such as top-k indices, scores, or aggregate counts.
- Use `mx.compile` for repeated pure array functions that fuse many elementwise
  operations or reductions. Do not compile anonymous functions inside loops.
  Stable shapes and dtypes avoid recompilation.
- MLX uses Apple Silicon unified memory, so arrays are not manually moved
  between CPU and GPU. Choose the device/stream for the operation instead; large
  dense matmuls usually belong on `mx.gpu`, while tiny overhead-bound work may
  be better on `mx.cpu`.
- Track memory during long benchmark runs with `mx.get_active_memory()`,
  `mx.get_peak_memory()`, `mx.get_cache_memory()`, and `mx.clear_cache()` when
  comparing variants.
- Add a CPU fallback or keep the MLX script explicitly local-only.
- Make tie behavior explicit when comparing top-k results. GPU and CPU paths
  may order equal scores differently even when scores match.

Useful official references:

- MLX install requirements: <https://ml-explore.github.io/mlx/build/html/install.html>
- Lazy evaluation and timing: <https://ml-explore.github.io/mlx/build/html/usage/lazy_evaluation.html>
- Unified memory and streams: <https://ml-explore.github.io/mlx/build/html/usage/unified_memory.html>
- Compilation: <https://ml-explore.github.io/mlx/build/html/usage/compile.html>
- NumPy conversion: <https://ml-explore.github.io/mlx/build/html/usage/numpy.html>
- Memory management: <https://ml-explore.github.io/mlx/build/html/python/memory_management.html>

## High-Leverage Patterns

- Dense retrieval: keep a large `N x D` feature bank in MLX, process query
  blocks as `B x D @ N x D.T`, run top-k on the MLX result, and copy back only
  the `B x k` indices/scores.
- Pairwise similarity: tile both sides so the temporary `B x N` score matrix
  fits memory. Reduce inside the tile when possible instead of materializing a
  full pairwise matrix.
- Count/scoring sweeps: express predicates as vectorized array ops, reduce to
  counts or compact summaries on-device, and avoid returning full boolean
  grids unless they are the actual artifact.
- Fused scoring functions: wrap repeated pure elementwise scoring kernels with
  `mx.compile` after the baseline is correct.
- Remote GPU/VPS path: use it only when transfer volume is much smaller than
  compute. Sending giant matrices over an API often loses to local MLX unless
  the remote service keeps the large resident matrix loaded and accepts compact
  query blocks. If using MLX on Linux GPU, install the CUDA package documented
  by MLX and benchmark it against the provider's standard CuPy/PyTorch stack.

Recent local debugging benchmark on this repo:

- Matrix: `80,000 x 5,120` `knn_struct`.
- Block: `512 x 5,120`.
- Work: `512 x 5120 @ 80000 x 5120.T`, then `k=16` top-k.
- NumPy single-thread matmul + top-k: about `806 ms`.
- MLX resident matmul + top-k: about `65 ms`.
- NumPy with 8 CPU threads matmul + top-k: about `576 ms`.
- MLX remained about `9x-12x` faster for this retrieval-style analysis block.

Counterexample from a local debugging sweep:

- A saturation mask sweep had `1,035,250` edge rows and `2,111` configs, but
  each chunk filtered to a tiny universe.
- Current full boolean matrix path took about `1.70s` for one full shard pass.
- Count-only NumPy took about `0.064s`.
- Count-only MLX took about `0.084s`.
- The best fix there was algorithmic/vectorized NumPy, not GPU.
