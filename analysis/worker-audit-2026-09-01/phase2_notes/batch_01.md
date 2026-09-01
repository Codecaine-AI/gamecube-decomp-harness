# Worker-Audit Phase 2, Batch 01

## Coverage

- 80 workers: 34 near_miss and 46 no_progress.
- 3 workers had usable self-summaries, all near_miss.
- 72 had no direct worker_*.txt file; 5 had only an upstream timeout/provider-error summary.
- This batch contains no exact or progressed workers.

## Technique Counts by Cohort

| Technique | exact | near_miss | progressed | no_progress |
|---|---:|---:|---:|---:|
| asm-diff-instruction-level | 0 | 3 | 0 | 0 |
| declaration-order-experiments | 0 | 3 | 0 | 0 |
| permuter | 0 | 2 | 0 | 0 |
| source-shape-experiments | 0 | 2 | 0 | 0 |
| type-shape-experiments | 0 | 2 | 0 | 0 |
| version-history-lookup | 0 | 2 | 0 | 0 |
| aliasing-experiments | 0 | 1 | 0 | 0 |
| compiler-allocation-dump | 0 | 1 | 0 | 0 |
| compiler-debug-tools | 0 | 1 | 0 | 0 |
| data-layout-experiments | 0 | 1 | 0 | 0 |
| expression-shape-experiments | 0 | 1 | 0 | 0 |
| float-expression-experiments | 0 | 1 | 0 | 0 |
| register-allocation-reasoning | 0 | 1 | 0 | 0 |
| stack-layout-reasoning | 0 | 1 | 0 | 0 |
| stack-padding-experiments | 0 | 1 | 0 | 0 |

## Exact-Worker Accounts

No exact workers occur in batch 01, so there are no exact-worker accounts to rank.

## Most Common Stall Reason by Cohort

- exact: unavailable; no workers in cohort.
- near_miss: three-way tie at one each: stack slot and string relocation mismatches; register allocation in loop and float paths; saved-register allocation swap.
- progressed: unavailable; no workers in cohort.
- no_progress: unavailable; none of the 46 workers supplied usable summary evidence.

## Surprises

Only 3 of 80 workers supplied usable accounts. The strongest diagnosis was ws_id 362a671e-c9a7-4c5d-bf4a-100b26558603, which isolated 23 diff sites to one r30/r31 coloring swap and backed it with allocator data, yet a 160-candidate permuter run could not change it.

ws_id 1476a3be-a464-4afb-8509-0bfe77a57750 found a tiny declaration-order win: moving Ground* before check_pos corrected one stack slot and improved 99.68269% to 99.68819%. ws_id 64158164-a047-4108-9310-d354c8b21a9f tested history, stack padding, aggregate shapes, data layout, and 200 permuter candidates, but every probe either regressed or left the 99.94177% mismatch unchanged.
