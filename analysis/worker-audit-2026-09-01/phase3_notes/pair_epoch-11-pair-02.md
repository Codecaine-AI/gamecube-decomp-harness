## Verdict

The exact worker closed its gap by turning the target into a byte-for-byte reconstruction problem: it extracted the reference `.data`, mapped symbol offsets and sizes, emitted explicit `u8` initializers, and verified the whole section by hash. The near-miss worker correctly diagnosed a compiler-shape problem, but then spent many iterations perturbing helpers, declarations, scopes, and expression order without reducing the remaining coupled register-allocation problem to a similarly decisive test. This is a meaningful process difference, though only partial explanation of the outcome because raw data admits direct transcription while a function's register allocation does not.

## Exact worker: how the gap was closed

- Diff-reading style: it reasoned from section bytes and symbol boundaries, not instruction diffs. Early exploration considered types, but the retained solution was direct reconstruction. Its reasoning says, "**Extracting and verifying .data section bytes**" and later "**Planning automated u8 array generation**."
- The decisive move: it used `objcopy -j .data` on target and candidate objects, found that seven zero-filled arrays covered the mismatch, read their offsets and sizes from symbols/splits, generated initializers from the target binary, and independently parsed the new source to confirm every array was `PASS`. Rebuilding then made all 1,856 `.data` bytes exact; matching SHA-256 hashes confirmed it.
- Tool rhythm: one broad inspect/search phase, one binary-section comparison phase, one generated edit, then compile and verification. There was effectively one decisive edit/build/diff loop. Pivotal tools were shell ELF/binutils commands, `objdiff-cli`, `direct_compile_tu`, and past-PR/ledger searches used for orientation. No permuter was used.

## Near-miss worker: why it stalled

- It got stuck on coupled callee-saved allocation and spill placement: the target retained separate `x1A88` bases in `r28/r29` with `stage_info` in `r22`, while the candidate coalesced a base; three `sqrtf` spill offsets also differed. It tried helper signatures and ownership of scratch locals, declaration and statement order, branch-local scopes, delayed pointer initialization, accessor helpers, named temporaries, `PAD_STACK`, allocator snapshots, historical commits, and two permuter runs.
- It never turned the remaining register-role mismatch into a small controlled matrix of one-variable source-shape experiments with an explicit register-role table and checkpointed scores. The exact worker's playbook suggests first isolating the exact differing region and proving each representation against the artifact, rather than repeatedly refactoring several coupled inputs.
- The stall was diagnosable from its own diff. It explicitly reported: "Residual differences are the coupled x1A88/stage_info callee-saved register allocation and three sqrt spill-slot offsets." It did not ignore that evidence, but its experiments often changed frame size, helper layout, and allocation together, producing large regressions that were reverted. The permuter also ran against a stale extracted baseline, so its 1,000 candidates could not test the retained 99.52608% shape.
- Loop quality: mixed. Assembly/register analysis and regression reverts were systematic, but the long edit/checkdiff sequence became increasingly shotgun because many edits altered multiple allocation pressures at once and several repeated already-disproven helper/local-shape ideas.

## Transferable technique

- For data-section targets, extract the target section bytes, map every mismatching byte range to symbol offsets and declared sizes, then generate explicit initializers before attempting semantic type reconstruction.
- After a candidate data edit, verify both per-symbol byte ranges and the entire section hash; do not rely on match percentage alone.
- When a near-exact function differs mainly by registers, write down target and candidate roles for each callee-saved register, then test one lifetime or source-shape change per build while preserving a known-best checkpoint.
- Do not run a permuter until its extracted baseline reproduces the current best score; a stale baseline makes the search result irrelevant.

## Flags

- exact_loop: systematic
- control_loop: mixed
- outcome_explained_by_process: partial
- techniques: asm-diff-instruction-level, register-allocation-reasoning, permuter, past-pr-lookup, type-shape-experiments, stack-frame-reasoning, checkpoint-restore, inline-hypothesis
