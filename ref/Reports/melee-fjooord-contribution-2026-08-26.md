# Melee Contribution Report for `fjooord`

Use **447,448 bytes**, or **11.526% of all analyzed code**, as the main code contribution figure.

This report measures the bytes matched and improved by GitHub account `fjooord` across 55 pull requests merged into `doldecomp/melee`. It covers June 5 through July 18, 2026. The calculation compares every merge commit with its first parent on `master`, then removes overlap between fuzzy improvements and items that a later `fjooord` PR matched exactly.

Report date: 2026-08-26  
Project revision: [`861a69b7b866685018e416625b4ea9e2f64f0bf6`](https://github.com/doldecomp/melee/commit/861a69b7b866685018e416625b4ea9e2f64f0bf6)  
Calculation procedure: [Calculate Melee GitHub Contribution](../Run%20Books/calculate-melee-github-contribution.md)

## Executive Result

| Category | Analyzed Bytes | Exactly Matched | Improved but Still Unmatched | Total Non-Overlapping Impact | Percent Improved |
|---|---:|---:|---:|---:|---:|
| Code | 3,882,032 | 383,040 | 64,408 | **447,448** | **11.526%** |
| Data | 1,211,181 | 25,460 | 7,861 | **33,321** | **2.751%** |
| Code and data | 5,093,213 | 408,500 | 72,269 | **480,769** | **9.439%** |

The code result answers the main question: `fjooord` improved **447,448 of 3,882,032 analyzed code bytes**, or **11.526% of the codebase's executable code**.

The combined result includes data sections. It shows **480,769 of 5,093,213 analyzed code-and-data bytes**, or **9.439% of the analyzed executable**.

## What Each Number Means

### Exactly Matched

Exactly matched bytes count an entire function or data section only when it reaches a 100% match. The 55 accepted PRs produced these net changes:

| Exact Metric | Bytes | Share of Its Category |
|---|---:|---:|
| Matched code | 383,040 | 9.867% of all code |
| Matched data | 25,460 | 2.102% of all data |
| Matched code and data | **408,500** | **8.020% of the analyzed executable** |

The PRs added a net 522 exactly matched functions. They caused 594 exact item transitions across functions and data sections. One 280-byte function was temporarily broken by a merge-base interaction and was later restored upstream. The net byte totals already include that loss.

### Improved but Still Unmatched

For items that never reached 100% in a later `fjooord` PR, fuzzy progress is converted into equivalent improved bytes:

`equivalent bytes = floor(fuzzy percent / 100 * item size)`

Only the change in equivalent bytes is credited. Earlier fuzzy work on an item that a later `fjooord` PR matched exactly is excluded because the exact-match total already credits the full item.

| Fuzzy Metric | Positive | Regressed | Net Improved | Share of Its Category |
|---|---:|---:|---:|---:|
| Code | 64,463 | -55 | **64,408** | 1.659% of all code |
| Data | 12,190 | -4,329 | **7,861** | 0.649% of all data |
| Code and data | 76,653 | -4,384 | **72,269** | 1.419% of the analyzed executable |

This is the conservative result. A data-section resplit in PR [#2894](https://github.com/doldecomp/melee/pull/2894) accounts for most of the reported data regression. If size-changing sections are excluded because their before and after byte ranges are not comparable, the adjusted combined result becomes **485,069 bytes**, or **9.524%**. The headline stays conservative at 480,769 bytes.

## Scale of the Contribution

Melee's matched code rose from 2,728,820 bytes at the start of the first `fjooord` PR to 3,233,580 bytes after the last accepted `fjooord` PR. That was a project-wide increase of 504,760 matched code bytes.

`fjooord` supplied 383,040 of those bytes:

- **75.886% of all matched-code progress during the active PR period**
- **33.215% of the code that remained unmatched when the work began**
- **10.853% of the code that is matched on current `master`**

The 11.526% codebase figure is not a share of work during one period. It is the measured portion of the entire 3,882,032-byte code target that these PRs either matched exactly or moved closer to a match without later receiving exact-match credit from the same account.

## Largest Exact-Match PRs

| PR | Area | Exact Code and Data Bytes |
|---|---|---:|
| [#2877](https://github.com/doldecomp/melee/pull/2877) | GM game modes | 63,424 |
| [#2880](https://github.com/doldecomp/melee/pull/2880) | GR stages | 54,460 |
| [#2583](https://github.com/doldecomp/melee/pull/2583) | Multiple source files | 27,684 |
| [#2851](https://github.com/doldecomp/melee/pull/2851) | MN menus | 20,588 |
| [#2879](https://github.com/doldecomp/melee/pull/2879) | TY trophies | 17,944 |

## PR and CI Coverage

- GitHub returned 55 merged PRs authored by `fjooord`.
- The earliest was [#2581](https://github.com/doldecomp/melee/pull/2581), merged June 5, 2026.
- The latest was [#2877](https://github.com/doldecomp/melee/pull/2877), merged July 18, 2026.
- Their final rollups contained 391 successful checks, 109 expected skips, and no failures.
- Account `ford-bubba-ai`, the other personal identity found in local Git configuration, has no Melee PRs or Melee commits.

The raw decomp.dev PR comments are not summed directly. Three comments used a cached base that differed from the actual parent at merge time. Comparing each accepted merge with its real first parent prevents stale-base overlap from changing the contribution total.

## Scope and Limits

The denominator is the GALE01 executable's analyzed code and data, not the full GameCube disc image. The disc also contains audio, video, textures, and other assets that the matching report does not measure.

GitHub identity is the other boundary. This report includes work authored by `fjooord`. It cannot discover a differently named account unless the account, commit email, or local Git configuration connects it to the same owner.

Fuzzy equivalent bytes measure movement toward a match. They are not literal byte-for-byte equality. Exact matched bytes are the stronger result and remain separately reported.
