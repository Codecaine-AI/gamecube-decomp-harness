# Phase 1 Tool-Usage Statistics

Run `4a45af8a-9f8c-499b-b375-c0d8e93fc8fd`. 1,627 workers are in the manifest; 1,489 have `tool_events.jsonl` and 138 do not.

## Method

Each worker is one observation. Means and medians include workers with a present but empty event file as zero-call workers. Missing event files also remain in the cohort denominator and have zero calls. Duration and time-to-first-build omit workers without valid timestamps or build events.

`build_invocations` counts `direct_compile_tu`, `checkdiff_run`, and `checkdiff_summary`. Both checkdiff tools compile internally, so this is a call-level proxy for edit-build-diff loop count, not a compiler-process count. The event stream has no general file-edit tool. `source_mutation_preview` is read-only preview work, so an edit-based ratio would be misleading and is reported as unavailable.

Tool groups overlap when a call has two roles. In particular, checkdiff calls count in both build and diff groups.

## Cohort Comparison

Cells show mean / median per worker.

| Cohort | Workers | With events | Calls | Tools | Errors | Duration min | Build proxy | First build min |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| all workers | 1,627 | 1,489 | 132.5 / 53.0 | 13.8 / 16.0 | 2.2 / 1.0 | 72.4 / 28.7 | 67.1 / 25.0 | 0.1 / 0.0 |
| exact | 107 | 107 | 116.4 / 65.0 | 14.4 / 17.0 | 2.0 / 1.0 | 57.1 / 24.7 | 61.9 / 35.0 | 0.7 / 0.0 |
| near_miss | 521 | 478 | 165.4 / 81.0 | 14.1 / 17.0 | 2.6 / 1.0 | 93.9 / 42.3 | 87.4 / 41.0 | 0.0 / 0.0 |
| progressed | 502 | 502 | 94.9 / 61.0 | 16.0 / 18.0 | 1.6 / 1.0 | 48.2 / 27.0 | 48.2 / 30.0 | 0.1 / 0.0 |
| no_progress | 497 | 402 | 139.5 / 37.0 | 11.2 / 10.0 | 2.3 / 0.0 | 81.1 / 14.5 | 66.1 / 16.0 | 0.1 / 0.0 |

### Tool-Group Calls and Sequence Ratios

Cells show mean / median per worker. Ratios omit workers with zero build invocations.

| Cohort | Diff | Dedicated compile | Permuter/mutation | Knowledge/search | Diagnostics | Diff/build | Permuter/build |
|---|---:|---:|---:|---:|---:|---:|---:|
| all workers | 61.4 / 23.0 | 8.4 / 3.0 | 7.9 / 3.0 | 24.7 / 9.0 | 13.0 / 5.0 | 0.92 / 0.94 | 0.14 / 0.11 |
| exact | 56.1 / 29.0 | 6.7 / 4.0 | 5.1 / 2.0 | 22.0 / 11.0 | 9.7 / 4.0 | 0.81 / 0.88 | 0.06 / 0.05 |
| near_miss | 80.8 / 35.0 | 9.4 / 4.0 | 8.8 / 4.0 | 30.8 / 13.0 | 15.2 / 6.0 | 0.92 / 0.95 | 0.11 / 0.09 |
| progressed | 43.3 / 26.0 | 7.1 / 4.0 | 6.6 / 4.0 | 16.5 / 9.0 | 9.2 / 5.0 | 0.89 / 0.91 | 0.17 / 0.13 |
| no_progress | 60.4 / 16.0 | 9.1 / 0.0 | 8.7 / 2.0 | 27.1 / 6.0 | 15.3 / 5.0 | 0.98 / 1.00 | 0.18 / 0.12 |

### Sequence-Level Read

Near misses made 165.4 calls on average versus 116.4 for exact workers. Their median observed event span was 42.3 minutes versus 24.7 minutes.

The median diff/build ratio was 0.95 for near misses and 0.88 for exact workers. The median permuter/build ratio was 0.09 versus 0.05. These differences are descriptive. Cohort mix, target difficulty, epoch, and missing event files all confound them.

## Per-Epoch Cohort Statistics

Cells show mean / median per worker. Full aggregates for every metric and tool-prevalence values for every epoch appear in `phase1_stats.json`.

| Epoch | Cohort | Workers | Calls | Errors | Duration min | Build proxy | Diff calls | Permuter calls | First build min |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | exact | 2 | 119.5 / 119.5 | 3.5 / 3.5 | 56.5 / 56.5 | 54.5 / 54.5 | 42.5 / 42.5 | 8.0 / 8.0 | 0.3 / 0.3 |
| 1 | near_miss | 45 | 219.9 / 171.0 | 4.0 / 3.0 | 104.2 / 56.5 | 95.0 / 73.0 | 68.2 / 51.0 | 17.8 / 12.0 | 0.0 / 0.0 |
| 1 | progressed | 70 | 78.1 / 64.5 | 1.2 / 1.0 | 32.6 / 27.2 | 34.6 / 26.5 | 24.5 / 19.0 | 6.8 / 5.0 | 0.0 / 0.0 |
| 1 | no_progress | 59 | 273.1 / 159.0 | 5.2 / 2.0 | 131.8 / 78.0 | 112.1 / 57.0 | 82.1 / 50.0 | 22.9 / 12.0 | 0.0 / 0.0 |
| 2 | no_progress | 2 | 167.5 / 167.5 | 1.5 / 1.5 | 37.8 / 37.8 | 79.5 / 79.5 | 57.0 / 57.0 | 8.0 / 8.0 | 0.0 / 0.0 |
| 3 | exact | 8 | 11.6 / 12.0 | 0.1 / 0.0 | 2.8 / 2.6 | 5.5 / 5.5 | 5.4 / 5.5 | 0.0 / 0.0 | 0.0 / 0.0 |
| 3 | near_miss | 44 | 30.6 / 33.5 | 0.5 / 0.0 | 9.1 / 9.2 | 14.9 / 16.0 | 14.2 / 15.5 | 1.6 / 2.0 | 0.0 / 0.0 |
| 3 | progressed | 50 | 18.2 / 16.0 | 0.4 / 0.0 | 4.5 / 3.5 | 7.7 / 7.0 | 7.2 / 6.0 | 0.9 / 1.0 | 0.0 / 0.0 |
| 3 | no_progress | 79 | 35.0 / 37.0 | 0.7 / 0.0 | 9.7 / 9.8 | 15.6 / 16.0 | 15.0 / 15.0 | 2.0 / 2.0 | 0.0 / 0.0 |
| 4 | near_miss | 1 | 27.0 / 27.0 | 1.0 / 1.0 | 8.9 / 8.9 | 15.0 / 15.0 | 13.0 / 13.0 | 0.0 / 0.0 | 0.0 / 0.0 |
| 4 | no_progress | 3 | 22.3 / 21.0 | 0.3 / 0.0 | 9.1 / 9.2 | 8.0 / 8.0 | 7.0 / 6.0 | 1.7 / 2.0 | 0.0 / 0.0 |
| 5 | near_miss | 40 | 34.8 / 34.5 | 0.3 / 0.0 | 14.6 / 11.5 | 17.3 / 16.0 | 16.9 / 16.0 | 1.9 / 2.0 | 0.0 / 0.0 |
| 5 | progressed | 48 | 21.2 / 18.0 | 0.2 / 0.0 | 9.6 / 6.1 | 8.7 / 7.0 | 8.4 / 7.0 | 1.2 / 1.0 | 0.0 / 0.0 |
| 5 | no_progress | 78 | 36.8 / 35.5 | 0.8 / 0.0 | 14.6 / 10.6 | 16.8 / 16.5 | 15.8 / 16.0 | 2.2 / 2.0 | 0.0 / 0.0 |
| 6 | exact | 7 | 78.6 / 80.0 | 1.6 / 1.0 | 37.8 / 33.9 | 39.7 / 36.0 | 36.9 / 31.0 | 2.4 / 2.0 | 0.0 / 0.0 |
| 6 | near_miss | 39 | 164.9 / 78.0 | 2.1 / 1.0 | 80.9 / 34.0 | 86.1 / 44.0 | 81.4 / 36.0 | 8.8 / 3.0 | 0.0 / 0.0 |
| 6 | progressed | 74 | 82.6 / 59.0 | 1.2 / 1.0 | 36.6 / 23.2 | 41.9 / 29.5 | 39.3 / 27.0 | 5.4 / 3.0 | 0.0 / 0.0 |
| 6 | no_progress | 43 | 88.6 / 36.0 | 1.0 / 0.0 | 36.4 / 9.9 | 45.2 / 17.0 | 43.7 / 17.0 | 5.4 / 3.0 | 0.0 / 0.0 |
| 7 | exact | 19 | 98.4 / 77.0 | 1.7 / 2.0 | 39.0 / 30.3 | 54.5 / 44.0 | 48.6 / 37.0 | 4.4 / 3.0 | 0.0 / 0.0 |
| 7 | near_miss | 41 | 246.0 / 168.0 | 4.3 / 3.0 | 111.1 / 77.7 | 126.6 / 92.0 | 118.3 / 73.0 | 12.0 / 7.0 | 0.0 / 0.0 |
| 7 | progressed | 79 | 125.5 / 76.0 | 2.3 / 1.0 | 62.0 / 32.4 | 64.7 / 43.0 | 59.4 / 38.0 | 9.0 / 6.0 | 0.0 / 0.0 |
| 7 | no_progress | 18 | 545.6 / 568.0 | 8.2 / 7.0 | 232.5 / 221.6 | 281.0 / 280.0 | 272.6 / 280.0 | 24.6 / 24.5 | 0.0 / 0.0 |
| 8 | exact | 14 | 246.7 / 87.5 | 3.7 / 2.0 | 109.7 / 38.1 | 128.6 / 51.5 | 117.9 / 48.5 | 12.9 / 5.0 | 0.0 / 0.0 |
| 8 | near_miss | 51 | 409.8 / 227.0 | 5.9 / 4.0 | 206.6 / 127.0 | 221.1 / 117.0 | 209.3 / 111.0 | 19.8 / 13.0 | 0.0 / 0.0 |
| 8 | progressed | 52 | 172.9 / 88.5 | 2.9 / 2.0 | 87.7 / 45.0 | 89.5 / 47.5 | 83.3 / 42.0 | 12.2 / 7.5 | 0.0 / 0.0 |
| 8 | no_progress | 19 | 657.1 / 519.0 | 9.6 / 7.0 | 300.8 / 252.4 | 340.7 / 246.0 | 318.2 / 226.0 | 36.6 / 33.0 | 0.0 / 0.0 |
| 9 | exact | 13 | 249.8 / 141.0 | 3.7 / 2.0 | 139.8 / 105.6 | 142.3 / 83.0 | 136.2 / 76.0 | 11.3 / 6.0 | 0.0 / 0.0 |
| 9 | near_miss | 48 | 240.9 / 146.0 | 4.0 / 2.5 | 146.3 / 83.9 | 132.5 / 87.5 | 123.8 / 76.5 | 12.2 / 6.5 | 0.0 / 0.0 |
| 9 | progressed | 45 | 141.4 / 85.0 | 2.3 / 2.0 | 88.3 / 72.7 | 75.0 / 45.0 | 68.3 / 38.0 | 9.0 / 6.0 | 0.0 / 0.0 |
| 9 | no_progress | 14 | 305.6 / 258.0 | 4.4 / 4.0 | 208.0 / 181.6 | 144.1 / 130.5 | 137.7 / 126.0 | 18.7 / 20.5 | 0.0 / 0.0 |
| 10 | exact | 9 | 117.6 / 94.0 | 2.7 / 2.0 | 61.1 / 32.4 | 61.1 / 57.0 | 54.0 / 46.0 | 4.4 / 2.0 | 0.0 / 0.0 |
| 10 | near_miss | 47 | 166.8 / 114.0 | 2.4 / 2.0 | 90.2 / 56.2 | 88.4 / 60.0 | 84.3 / 52.0 | 9.2 / 7.0 | 0.0 / 0.0 |
| 10 | progressed | 32 | 121.7 / 99.5 | 2.1 / 1.5 | 56.4 / 44.5 | 67.2 / 54.0 | 59.9 / 55.0 | 7.7 / 6.5 | 0.0 / 0.0 |
| 10 | no_progress | 18 | 320.5 / 258.0 | 4.8 / 3.5 | 175.3 / 155.9 | 159.7 / 125.5 | 154.9 / 125.0 | 20.2 / 16.0 | 0.0 / 0.0 |
| 11 | exact | 27 | 38.9 / 17.0 | 1.0 / 1.0 | 19.3 / 10.4 | 17.3 / 5.0 | 13.2 / 3.0 | 0.9 / 0.0 | 2.6 / 2.1 |
| 11 | near_miss | 42 | 173.3 / 163.0 | 3.0 / 3.0 | 90.5 / 77.5 | 96.0 / 100.0 | 90.9 / 90.5 | 8.9 / 9.0 | 0.1 / 0.0 |
| 11 | progressed | 23 | 77.8 / 59.0 | 1.3 / 1.0 | 36.2 / 27.4 | 38.3 / 33.0 | 34.5 / 29.0 | 6.2 / 5.0 | 0.4 / 0.0 |
| 11 | no_progress | 32 | 162.2 / 177.5 | 2.7 / 3.0 | 100.0 / 103.9 | 72.8 / 65.5 | 73.4 / 59.0 | 9.2 / 9.0 | 0.9 / 0.0 |
| 12 | exact | 8 | 111.2 / 119.0 | 2.0 / 2.0 | 67.3 / 66.5 | 60.8 / 73.5 | 54.1 / 68.0 | 5.4 / 6.0 | 0.4 / 0.0 |
| 12 | near_miss | 36 | 251.4 / 245.5 | 3.2 / 2.5 | 170.9 / 140.2 | 150.1 / 137.5 | 144.2 / 125.0 | 11.6 / 12.0 | 0.0 / 0.0 |
| 12 | progressed | 22 | 141.2 / 95.0 | 2.5 / 1.5 | 109.9 / 52.6 | 76.6 / 51.5 | 70.0 / 44.5 | 8.0 / 5.0 | 0.3 / 0.0 |
| 12 | no_progress | 28 | 197.5 / 211.0 | 4.1 / 4.0 | 137.3 / 130.3 | 98.3 / 115.0 | 95.0 / 110.5 | 11.5 / 11.0 | 0.7 / 0.0 |
| 13 | near_miss | 18 | 13.9 / 15.0 | 0.7 / 1.0 | 3.8 / 4.6 | 3.6 / 3.0 | 2.2 / 2.0 | 0.3 / 0.0 | 0.0 / 0.0 |
| 13 | progressed | 7 | 12.7 / 14.0 | 0.6 / 1.0 | 3.3 / 4.0 | 2.3 / 2.0 | 1.7 / 1.0 | 0.1 / 0.0 | 0.0 / 0.0 |
| 13 | no_progress | 21 | 13.3 / 13.0 | 0.3 / 0.0 | 3.8 / 4.3 | 2.1 / 2.0 | 1.8 / 2.0 | 0.5 / 0.0 | 0.0 / 0.0 |
| unknown | near_miss | 69 | 2.0 / 0.0 | 0.1 / 0.0 | 0.4 / 0.0 | 0.8 / 0.0 | 0.7 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |
| unknown | no_progress | 83 | 0.3 / 0.0 | 0.0 / 0.0 | 2.5 / 2.5 | 0.2 / 0.0 | 0.1 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 |

### Per-Epoch Lookup, Specialist, and Ratio Metrics

Cells show mean / median per worker.

| Epoch | Cohort | Graph-related | Past PRs | Knowledge/search | Diagnostics | Lint/review | Diff/build | Permuter/build |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | exact | 4.0 / 4.0 | 14.5 / 14.5 | 18.5 / 18.5 | 15.0 / 15.0 | 4.5 / 4.5 | 0.76 / 0.76 | 0.15 / 0.15 |
| 1 | near_miss | 6.7 / 5.0 | 20.8 / 17.0 | 37.2 / 30.0 | 24.3 / 18.0 | 11.8 / 8.0 | 0.73 / 0.74 | 0.18 / 0.18 |
| 1 | progressed | 2.2 / 2.0 | 6.3 / 5.0 | 12.0 / 9.0 | 8.3 / 6.0 | 4.9 / 4.0 | 0.74 / 0.72 | 0.22 / 0.18 |
| 1 | no_progress | 8.4 / 5.0 | 23.9 / 13.0 | 49.1 / 33.0 | 32.0 / 19.0 | 13.3 / 8.0 | 0.76 / 0.73 | 0.21 / 0.18 |
| 2 | no_progress | 5.0 / 5.0 | 14.5 / 14.5 | 25.0 / 25.0 | 20.0 / 20.0 | 11.0 / 11.0 | 0.71 / 0.71 | 0.10 / 0.10 |
| 3 | exact | 1.1 / 1.0 | 0.5 / 0.5 | 1.4 / 1.0 | 0.4 / 0.0 | 2.8 / 2.0 | 0.99 / 1.00 | 0.00 / 0.00 |
| 3 | near_miss | 3.3 / 3.5 | 0.6 / 0.0 | 5.5 / 5.0 | 3.4 / 3.0 | 1.2 / 1.0 | 0.94 / 1.00 | 0.10 / 0.09 |
| 3 | progressed | 1.9 / 2.0 | 0.8 / 1.0 | 2.7 / 2.0 | 2.7 / 3.0 | 1.5 / 1.0 | 0.94 / 1.00 | 0.15 / 0.11 |
| 3 | no_progress | 4.1 / 4.0 | 1.2 / 1.0 | 6.3 / 6.0 | 4.4 / 5.0 | 1.0 / 0.0 | 0.96 / 1.00 | 0.13 / 0.12 |
| 4 | near_miss | 3.0 / 3.0 | 4.0 / 4.0 | 4.0 / 4.0 | 0.0 / 0.0 | 1.0 / 1.0 | 0.87 / 0.87 | 0.00 / 0.00 |
| 4 | no_progress | 1.7 / 0.0 | 3.7 / 5.0 | 5.3 / 5.0 | 1.3 / 0.0 | 0.3 / 0.0 | 0.83 / 0.75 | 0.17 / 0.25 |
| 5 | near_miss | 3.8 / 3.0 | 0.7 / 0.0 | 6.1 / 6.0 | 4.2 / 4.0 | 0.8 / 0.5 | 0.97 / 1.00 | 0.11 / 0.12 |
| 5 | progressed | 2.3 / 2.0 | 1.0 / 1.0 | 3.2 / 3.0 | 3.0 / 3.0 | 1.8 / 2.0 | 0.96 / 1.00 | 0.16 / 0.13 |
| 5 | no_progress | 4.4 / 4.5 | 1.2 / 1.0 | 6.5 / 6.0 | 4.9 / 5.0 | 0.6 / 0.0 | 0.93 / 1.00 | 0.12 / 0.12 |
| 6 | exact | 2.6 / 2.0 | 3.0 / 3.0 | 16.1 / 17.0 | 9.0 / 8.0 | 4.0 / 4.0 | 0.86 / 0.86 | 0.04 / 0.03 |
| 6 | near_miss | 5.8 / 4.0 | 10.7 / 4.0 | 32.3 / 11.0 | 15.9 / 6.0 | 4.2 / 3.0 | 0.95 / 0.96 | 0.11 / 0.10 |
| 6 | progressed | 2.9 / 2.0 | 4.8 / 3.0 | 14.5 / 10.0 | 7.7 / 5.0 | 3.6 / 2.0 | 0.93 / 0.93 | 0.17 / 0.12 |
| 6 | no_progress | 5.3 / 4.0 | 4.5 / 1.0 | 15.9 / 6.0 | 10.4 / 5.0 | 1.4 / 0.0 | 0.97 / 1.00 | 0.17 / 0.14 |
| 7 | exact | 2.5 / 2.0 | 6.2 / 4.0 | 17.7 / 12.0 | 7.2 / 5.0 | 5.6 / 5.0 | 0.87 / 0.88 | 0.07 / 0.06 |
| 7 | near_miss | 6.7 / 5.0 | 16.6 / 11.0 | 50.4 / 26.0 | 21.2 / 13.0 | 7.0 / 5.0 | 0.91 / 0.92 | 0.09 / 0.09 |
| 7 | progressed | 3.1 / 2.0 | 7.3 / 4.0 | 22.3 / 12.0 | 11.3 / 7.0 | 4.6 / 3.0 | 0.91 / 0.91 | 0.17 / 0.14 |
| 7 | no_progress | 15.1 / 15.0 | 36.9 / 34.0 | 112.0 / 107.0 | 56.4 / 58.0 | 9.4 / 9.0 | 1.07 / 0.96 | 0.10 / 0.10 |
| 8 | exact | 6.6 / 2.0 | 16.6 / 4.5 | 48.2 / 12.5 | 23.6 / 6.0 | 9.4 / 5.0 | 0.86 / 0.91 | 0.13 / 0.09 |
| 8 | near_miss | 10.7 / 6.0 | 26.2 / 14.0 | 79.1 / 44.0 | 36.8 / 18.0 | 9.5 / 8.0 | 0.92 / 0.93 | 0.09 / 0.08 |
| 8 | progressed | 4.4 / 2.0 | 9.2 / 5.0 | 31.8 / 15.0 | 16.8 / 8.0 | 5.4 / 3.5 | 0.92 / 0.89 | 0.16 / 0.13 |
| 8 | no_progress | 17.3 / 14.0 | 45.7 / 34.0 | 130.9 / 114.0 | 66.9 / 68.0 | 11.9 / 7.0 | 0.91 / 0.93 | 0.14 / 0.12 |
| 9 | exact | 5.9 / 4.0 | 14.5 / 9.0 | 43.5 / 25.0 | 21.0 / 13.0 | 8.3 / 9.0 | 0.91 / 0.95 | 0.09 / 0.08 |
| 9 | near_miss | 6.2 / 4.0 | 13.8 / 7.0 | 44.6 / 22.5 | 21.4 / 13.0 | 7.1 / 5.0 | 0.92 / 0.94 | 0.10 / 0.09 |
| 9 | progressed | 3.5 / 2.0 | 8.2 / 5.0 | 24.4 / 16.0 | 13.3 / 10.0 | 5.2 / 3.0 | 0.89 / 0.89 | 0.17 / 0.11 |
| 9 | no_progress | 8.8 / 6.0 | 24.1 / 15.5 | 65.3 / 45.0 | 35.0 / 25.5 | 5.6 / 4.5 | 1.07 / 0.95 | 0.24 / 0.15 |
| 10 | exact | 3.0 / 2.0 | 7.9 / 4.0 | 25.4 / 15.0 | 10.4 / 4.0 | 5.0 / 5.0 | 0.88 / 0.88 | 0.06 / 0.05 |
| 10 | near_miss | 4.5 / 5.0 | 10.5 / 7.0 | 30.4 / 25.0 | 14.9 / 10.0 | 5.7 / 4.0 | 0.95 / 0.95 | 0.16 / 0.11 |
| 10 | progressed | 2.6 / 2.0 | 5.8 / 4.0 | 20.8 / 15.5 | 10.6 / 7.5 | 3.8 / 3.0 | 0.90 / 0.92 | 0.16 / 0.12 |
| 10 | no_progress | 8.3 / 7.0 | 21.4 / 18.0 | 62.3 / 53.5 | 34.8 / 30.0 | 6.1 / 4.0 | 1.20 / 0.98 | 0.20 / 0.13 |
| 11 | exact | 0.6 / 0.0 | 4.0 / 3.0 | 8.5 / 5.0 | 1.7 / 0.0 | 5.4 / 4.0 | 0.62 / 0.67 | 0.01 / 0.00 |
| 11 | near_miss | 4.3 / 5.0 | 9.9 / 8.5 | 30.9 / 27.5 | 14.7 / 14.5 | 5.2 / 4.0 | 1.04 / 0.95 | 0.16 / 0.09 |
| 11 | progressed | 1.9 / 2.0 | 4.4 / 4.0 | 13.7 / 12.0 | 7.2 / 6.0 | 4.2 / 3.0 | 0.89 / 0.88 | 0.17 / 0.14 |
| 11 | no_progress | 4.3 / 5.0 | 10.7 / 11.0 | 34.2 / 39.5 | 16.0 / 18.0 | 7.4 / 5.0 | 1.29 / 0.98 | 0.30 / 0.08 |
| 12 | exact | 2.4 / 2.5 | 6.9 / 7.0 | 20.1 / 15.5 | 7.9 / 7.5 | 6.0 / 5.0 | 0.76 / 0.88 | 0.08 / 0.07 |
| 12 | near_miss | 5.6 / 5.0 | 13.3 / 12.0 | 42.2 / 39.5 | 21.2 / 19.0 | 5.3 / 5.0 | 0.95 / 0.97 | 0.09 / 0.08 |
| 12 | progressed | 3.1 / 2.0 | 8.1 / 5.0 | 25.1 / 13.5 | 12.6 / 7.5 | 6.0 / 4.5 | 0.91 / 0.89 | 0.11 / 0.08 |
| 12 | no_progress | 4.8 / 5.0 | 12.4 / 12.0 | 39.1 / 40.5 | 18.9 / 20.0 | 6.9 / 5.5 | 1.07 / 0.94 | 0.16 / 0.11 |
| 13 | near_miss | 1.0 / 1.0 | 1.9 / 1.5 | 4.9 / 5.0 | 2.2 / 2.0 | 0.0 / 0.0 | 0.64 / 0.59 | 0.08 / 0.00 |
| 13 | progressed | 1.0 / 1.0 | 1.7 / 2.0 | 4.7 / 5.0 | 2.4 / 3.0 | 0.0 / 0.0 | 0.89 / 1.00 | 0.07 / 0.00 |
| 13 | no_progress | 1.0 / 1.0 | 1.9 / 2.0 | 5.1 / 5.0 | 2.3 / 2.0 | 0.1 / 0.0 | 1.01 / 1.00 | 0.38 / 0.00 |
| unknown | near_miss | 0.4 / 0.0 | 0.0 / 0.0 | 0.4 / 0.0 | 0.0 / 0.0 | 0.3 / 0.0 | 0.96 / 1.00 | 0.00 / 0.00 |
| unknown | no_progress | 0.0 / 0.0 | 0.0 / 0.0 | 0.1 / 0.0 | 0.0 / 0.0 | 0.0 / 0.0 | 0.68 / 0.68 | 0.00 / 0.00 |

## Overall Tool Prevalence by Cohort

Percent of all workers in the cohort with at least one call. Missing event files stay in the denominator.

| Tool | Exact % | Near miss % | Progressed % | No progress % |
|---|---:|---:|---:|---:|
| `checkdiff_run` | 86.0 | 91.6 | 99.6 | 80.5 |
| `ledger_search` | 98.1 | 83.1 | 86.1 | 71.4 |
| `past_prs_search` | 96.3 | 75.8 | 91.0 | 64.0 |
| `direct_compile_tu` | 87.9 | 68.9 | 80.7 | 48.9 |
| `knowledge_graph_search` | 81.3 | 63.3 | 73.1 | 42.3 |
| `graph_related_functions` | 78.5 | 91.0 | 99.2 | 78.5 |
| `review_lint_scan` | 100.0 | 74.1 | 98.4 | 52.3 |
| `source_mutation_preview` | 60.7 | 64.7 | 75.7 | 44.9 |
| `mwcc_debug_lookup` | 68.2 | 75.8 | 75.7 | 49.7 |
| `source_permuter_run` | 57.0 | 74.5 | 88.2 | 65.4 |
| `mwcc_debug_diagnose_regflow` | 67.3 | 80.6 | 95.2 | 73.0 |
| `mwcc_alloc_snapshot` | 56.1 | 58.7 | 59.0 | 45.5 |
| `checkdiff_summary` | 94.4 | 63.9 | 86.5 | 37.6 |
| `asm_window_search` | 66.4 | 66.2 | 78.5 | 54.9 |
| `code_graph_search` | 78.5 | 59.5 | 67.9 | 39.8 |
| `objdiff_score_candidate` | 24.3 | 30.3 | 30.1 | 29.2 |
| `m2c_decompile` | 52.3 | 58.0 | 74.7 | 43.1 |
| `mwcc_debug_diagnose_stack` | 29.0 | 49.7 | 84.5 | 48.9 |
| `mwcc_debug_dump_function` | 43.9 | 50.5 | 30.1 | 43.7 |
| `mwcc_debug_diagnose_inlines` | 32.7 | 39.3 | 42.8 | 32.2 |
| `type_layout_lookup` | 18.7 | 25.3 | 19.9 | 22.7 |
| `type_oracle_lookup` | 9.3 | 17.1 | 18.1 | 13.9 |
| `mwcc_alloc_compare` | 15.0 | 20.2 | 9.8 | 11.7 |
| `source_permuter_replay` | 13.1 | 13.4 | 26.3 | 13.3 |
| `review_lint_sdata2_order_helper` | 20.6 | 9.2 | 5.2 | 3.6 |
| `code_graph_file_card` | 7.5 | 6.7 | 4.4 | 5.2 |

## Largest Exact vs Near-Miss Prevalence Gaps

The gap is exact prevalence minus near-miss prevalence in percentage points. These are associations, not causal estimates.

| Tool | Exact % | Near miss % | Gap pp | Absolute gap pp |
|---|---:|---:|---:|---:|
| `checkdiff_summary` | 94.4 | 63.9 | 30.5 | 30.5 |
| `review_lint_scan` | 100.0 | 74.1 | 25.9 | 25.9 |
| `mwcc_debug_diagnose_stack` | 29.0 | 49.7 | -20.7 | 20.7 |
| `past_prs_search` | 96.3 | 75.8 | 20.4 | 20.4 |
| `code_graph_search` | 78.5 | 59.5 | 19.0 | 19.0 |
| `direct_compile_tu` | 87.9 | 68.9 | 18.9 | 18.9 |
| `knowledge_graph_search` | 81.3 | 63.3 | 18.0 | 18.0 |
| `source_permuter_run` | 57.0 | 74.5 | -17.5 | 17.5 |
| `ledger_search` | 98.1 | 83.1 | 15.0 | 15.0 |
| `mwcc_debug_diagnose_regflow` | 67.3 | 80.6 | -13.3 | 13.3 |
| `graph_related_functions` | 78.5 | 91.0 | -12.5 | 12.5 |
| `review_lint_sdata2_order_helper` | 20.6 | 9.2 | 11.3 | 11.3 |
| `type_oracle_lookup` | 9.3 | 17.1 | -7.7 | 7.7 |
| `mwcc_debug_lookup` | 68.2 | 75.8 | -7.6 | 7.6 |
| `type_layout_lookup` | 18.7 | 25.3 | -6.6 | 6.6 |

## Vocabulary

26 raw tool names appeared in 215,634 calls.

| Tool | Calls |
|---|---:|
| `checkdiff_run` | 90,493 |
| `ledger_search` | 14,076 |
| `past_prs_search` | 13,938 |
| `direct_compile_tu` | 13,662 |
| `knowledge_graph_search` | 8,617 |
| `graph_related_functions` | 6,882 |
| `review_lint_scan` | 6,721 |
| `source_mutation_preview` | 6,548 |
| `mwcc_debug_lookup` | 5,991 |
| `source_permuter_run` | 5,700 |
| `mwcc_debug_diagnose_regflow` | 5,478 |
| `mwcc_alloc_snapshot` | 5,136 |
| `checkdiff_summary` | 5,052 |
| `asm_window_search` | 4,815 |
| `code_graph_search` | 4,292 |
| `objdiff_score_candidate` | 4,285 |
| `m2c_decompile` | 3,656 |
| `mwcc_debug_diagnose_stack` | 2,715 |
| `mwcc_debug_dump_function` | 2,081 |
| `mwcc_debug_diagnose_inlines` | 1,501 |
| `type_layout_lookup` | 1,238 |
| `type_oracle_lookup` | 1,001 |
| `mwcc_alloc_compare` | 593 |
| `source_permuter_replay` | 526 |
| `review_lint_sdata2_order_helper` | 521 |
| `code_graph_file_card` | 116 |

## Tool Groups

- `build_compile`: `checkdiff_run`, `checkdiff_summary`, `direct_compile_tu`
- `dedicated_compile`: `direct_compile_tu`
- `diff_checkdiff`: `checkdiff_run`, `checkdiff_summary`, `objdiff_score_candidate`
- `permuter_mutation`: `source_mutation_preview`, `source_permuter_replay`, `source_permuter_run`
- `graph_related_functions`: `graph_related_functions`
- `past_prs_search`: `past_prs_search`
- `knowledge_search`: `asm_window_search`, `code_graph_file_card`, `code_graph_search`, `knowledge_graph_search`, `ledger_search`, `mwcc_debug_lookup`, `type_layout_lookup`, `type_oracle_lookup`
- `diagnostics`: `m2c_decompile`, `mwcc_alloc_compare`, `mwcc_alloc_snapshot`, `mwcc_debug_diagnose_inlines`, `mwcc_debug_diagnose_regflow`, `mwcc_debug_diagnose_stack`, `mwcc_debug_dump_function`
- `lint_review`: `review_lint_scan`, `review_lint_sdata2_order_helper`
