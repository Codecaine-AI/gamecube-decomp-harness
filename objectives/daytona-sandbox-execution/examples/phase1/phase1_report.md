# Daytona phase-1 proof of concept

**Verdict: PASS.** PASS — both fresh-cache objects were byte-identical to their precomputed expected SHA-256 values.

## Four unknowns

1. **MWCC under wibo on the real runner:** PASS — both fresh-cache objects were byte-identical to their precomputed expected SHA-256 values.
   - lbmemory expected: `a32ab60a54091e66f5c9f2891baa166bfd518b1ce3fd48d14e116823a4cceee5`
   - lbmemory actual: `a32ab60a54091e66f5c9f2891baa166bfd518b1ce3fd48d14e116823a4cceee5`
   - runtime expected: `df6bb9cbeca083768b9e3147a92bede8b1c91931438d3022ff931620067808fe`
   - runtime actual: `df6bb9cbeca083768b9e3147a92bede8b1c91931438d3022ff931620067808fe`
2. **Image size vs 10 GiB cap:** 5,868,625,900 bytes, 54.656% of 10,737,418,240 bytes. Headroom: 4,868,792,340 bytes.
3. **Exec RTT (20 sequential echoes):** min 49.528 ms, p50 69.678 ms, max 83.291 ms.
4. **Stop → start → first successful exec:** three trials are below.

| Trial | Stop ms | Start ms | First exec ms | Stopped → successful exec ms |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 740.683 | 778.29 | 81.143 | 859.467 |
| 2 | 711.912 | 734.568 | 49.702 | 784.297 |
| 3 | 739.89 | 800.191 | 50.873 | 851.076 |

## Snapshot and sandbox

- Snapshot: `melee-sandbox-poc-20260818`
- Snapshot push: 909.07 seconds
- Requested class: 2 vCPU / 4 GiB RAM / 10 GiB disk
- Granted class: 2 vCPU / 4 GiB RAM / 10 GiB disk
- Baked revision: `1e28b4203bf5b53d9399e90c22bd287de0d64657`
- Claim revision: `f123f2cc224e5f68e2c01d070bb7e9e5d6db34b7`
- Runner uname: `Linux 0fd42398-6a1d-4967-b20d-4ba4f5ec614d 6.8.0-100-generic #100-Ubuntu SMP PREEMPT_DYNAMIC Tue Jan 13 16:40:06 UTC 2026 x86_64 GNU/Linux`
- Runner CPU: `AMD EPYC 9354P 32-Core Processor`

## Objdiff and evidence

- READY seen: true
- Two-field response seen: true
- Response: `675674 05a2692e7c8fbcf505de568af257b7e8204dfb2b4b05d6c77400586e0e9973ed`
- The persistent score protocol was completed in creation 3 using the already-downloaded rebuilt object; the byte-identity gate was not rerun.
- Downloaded evidence: `claim.diff`, `objdiff_score.txt`, and `lbmemory.o` when the gate passed.
- Full timings, SHA sets, command outputs, and cleanup assertion: `poc_timings.json`.

## Platform surprises

- Snapshot-based SDK creation has no resources field; the 2/4/10 resource class is set during snapshot registration and inherited.
- ttlMinutes is the wall-clock orphan guard; autoDeleteInterval only counts continuously stopped time.
- The host CLI is v0.204.0 while the API and stable SDK are v0.205.0; the requested mismatch warning was ignored.
- Attempt 1 completed the RTT test but SDK bulk uploadFiles timed out at 300 seconds; attempt 2 uses the SDK's single-file streaming transfer methods.
- `objdiff-cli score` is a persistent stdin protocol: it prints READY first, then emits the two-field score only after receiving the rebuilt candidate object path.

## Cleanup

- Sandbox creations attempted: 3 (the configured maximum; all three were deleted)
- TTL set at creation: 120 minutes
- SDK label sweep empty: true
- Independent CLI label query empty: true
- Remaining labelled sandboxes: []
