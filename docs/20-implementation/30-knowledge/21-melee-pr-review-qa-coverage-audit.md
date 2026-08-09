---
covers: Coverage audit and counted evidence for Melee PR review QA standards
concepts: [past-prs, qa-coverage, review-standards, provenance]
code-ref: projects/melee/knowledge/sources/code_context/past_prs/data
---

# Melee PR Review QA Coverage Audit

Date: 2026-06-07

Latest refresh: 2026-06-07T14:54:10Z. The corpus was refreshed against GitHub
before the final coverage pass and includes PRs through #2606.

This is the provenance companion to
[Melee PR Review QA Standards](20-melee-pr-review-qa-standards.md). Keep the
standards document focused on actionable QA rules; keep corpus coverage, counts,
and batch evidence here.

## Corpus And Counting Method

The local corpus contains:

| Source | Count |
| --- | ---: |
| PR directories/postmortems inspected | 2,518 |
| Raw inline review comments | 1,093 |
| Raw issue comments | 1,447 total, 463 human after bot filtering |
| Raw review records | 1,158 total, 170 human bodies after bot filtering |

Counts below are approximate evidence counts, not strict lint counts.

- `Evidence PRs` means unique PRs where the standard appears in human comments
  or in postmortem `review_feedback`, `decomp_lessons`, or `smart_moves`.
- `Raw human hits` means direct human comment/review bodies matching the same
  standard. Bot reports were excluded from this column.
- Keyword mining was used to avoid missing the long tail, but the standards were
  manually checked against the full batch ledger below. The short list of PRs
  cited in the standards document are examples, not the limit of the review.

## Counted Standards

| Standard family | Evidence PRs | Raw human hits | QA action |
| --- | ---: | ---: | --- |
| Truthful headers, prototypes, and include style | 1,218 | 24 | Fix `UNK_RET`/`UNK_PARAMS`, add prototypes, and use local include style. |
| Verification and regression accounting | 1,048 | 117 | Require exact build/objdiff/regression evidence for claimed matches. |
| Naming: semantic only when evidenced | 922 | 22 | Use semantic names when proven; keep address-style names when not. |
| Readable source over fake/generated matches | 617 | 26 | Prefer likely original C; flag slop, gotos-only output, and low-quality AI code. |
| Data sections and TU ownership | 596 | 21 | Respect `.sdata`, `.sdata2`, `.sbss`, symbol metadata, and split ownership. |
| Typed fields/accessors over raw pointer math | 580 | 76 | Prefer real fields, union arms, temporary structs, and `GET_*` macros. |
| Stack/local/register tactics require evidence | 524 | 18 | Use `PAD_STACK`, local order, and lifetime changes only with objdiff proof. |
| Avoid pragma/register/asm hacks | 485 | 23 | Avoid new pragmas, `register`, and inline asm; scope and justify exceptions. |
| Canonical control flow and expression macros | 483 | 33 | Try switches, ternaries, `ABS`, `MIN`, `MAX`, and `CLAMP` when natural. |
| Reviewability, formatting, and mechanical-change hygiene | 240 | 42 | Keep style, rename, and workflow churn reproducible and easy to review. |
| Use `HSD_ASSERT`/`OSReport` forms | 192 | 15 | Prefer project assert/report macros over raw assert strings. |
| Header inlines, especially `jobj.h` | 133 | 21 | Map expanded header asserts back to existing inlines/helpers. |
| `M2C_FIELD` as bridge, not destination | 97 | 26 | Use it over raw offsets only temporarily; prefer real fields/types. |
| Natural loop recovery | 64 | 13 | Repeated generated blocks are often `for`/`while` loops. |
| C89, stubs, and generated leftovers | 48 | 8 | Remove `NOT_IMPLEMENTED`, C99 loop declarations, and template/speculative text. |
| Struct copies and contiguous fields | 27 | 0 | Try struct assignment/whole-`Vec3` copies for contiguous field copies. |
| Keep literals inline; avoid fake data anchors | 21 | 6 | Do not invent static literals/globals solely to force data order. |

## Full Coverage Audit

Every local PR slice was included in the coverage pass.

| Coverage check | Result |
| --- | ---: |
| Raw PR directories processed | 2,518 / 2,518 |
| Postmortems processed | 2,518 / 2,518 |
| Missing raw PR directories | 0 |
| Missing postmortems | 0 |
| PRs with at least one standards signal | 2,319 |
| PRs without a standards-category signal | 199 |
| PRs with raw human discussion | 458 |
| PRs with raw human discussion and a standards signal | 432 |
| PRs without raw human discussion but with postmortem standards signal | 1,887 |

The 199 PRs without a standards-category signal were not skipped. They were
accounted for and checked as a quiet/non-informative set. Most are early
assembly-splitting or data-labeling PRs, small build/tooling/documentation
updates, closed/unmerged PRs with no captured diff, dependency bumps, or tiny
administrative cleanups. Only 26 of those 199 had any raw human discussion, and
manual spot checks of that subset showed general project/tooling conversation
rather than reusable source-review rules.

Coverage by PR-number band:

| PR range | PRs in corpus | With raw human discussion | With standards signal | Quiet/non-informative |
| --- | ---: | ---: | ---: | ---: |
| 1-499 | 490 | 56 | 434 | 56 |
| 500-999 | 465 | 121 | 412 | 53 |
| 1000-1499 | 473 | 46 | 417 | 56 |
| 1500-1999 | 489 | 67 | 476 | 13 |
| 2000-2499 | 499 | 149 | 493 | 6 |
| 2500-2606 | 102 | 19 | 87 | 15 |

## Full Batch Reading Ledger

The coverage pass read every PR in 100-PR batches, using PR summaries,
`review_feedback`, `decomp_lessons`, `smart_moves`, raw inline review comments,
raw issue comments, and raw review bodies. The `notable PRs` column lists
standard-rich examples from the batch; it is not the only material read.

| PR range | Human discussion | Standards signal | Quiet | Top signals | Notable PRs read |
| --- | ---: | ---: | ---: | --- | --- |
| 2-102 | 6 | 88 | 12 | naming, verification, fake/generated, pragmas, data/TU | #19, #29, #56, #11, #28 |
| 103-202 | 2 | 92 | 8 | naming, fake/generated, data/TU, verification, headers | #163, #182, #194, #140, #146 |
| 203-302 | 15 | 86 | 14 | naming, headers, control, verification, fake/generated | #242, #240, #235, #293, #280 |
| 303-402 | 15 | 95 | 5 | headers, naming, fake/generated, verification, data/TU | #341, #344, #316, #401, #402 |
| 403-509 | 21 | 83 | 17 | naming, headers, verification, fake/generated, control | #504, #460, #483, #475, #457 |
| 510-637 | 44 | 84 | 16 | naming, headers, verification, pragmas, fake/generated | #581, #528, #556, #574, #554 |
| 638-740 | 52 | 90 | 10 | headers, verification, naming, pragmas, fake/generated | #667, #654, #653, #671, #686 |
| 741-842 | 10 | 81 | 19 | naming, fake/generated, headers, typed fields, verification | #743, #755, #746, #753, #827 |
| 843-943 | 7 | 95 | 5 | headers, naming, typed fields, control, data/TU | #941, #926, #913, #925, #859 |
| 944-1045 | 6 | 92 | 8 | headers, naming, typed fields, control, pragmas | #1038, #984, #1005, #1044, #972 |
| 1046-1154 | 6 | 85 | 15 | verification, data/TU, headers, naming, pragmas | #1071, #1124, #1151, #1105, #1117 |
| 1155-1262 | 11 | 86 | 14 | verification, headers, naming, control, pragmas | #1192, #1227, #1218, #1161, #1173 |
| 1263-1364 | 5 | 86 | 14 | headers, verification, stack/locals, typed fields, naming | #1299, #1317, #1292, #1291, #1335 |
| 1365-1469 | 16 | 93 | 7 | headers, verification, naming, control, stack/locals | #1431, #1438, #1402, #1384, #1456 |
| 1470-1574 | 15 | 95 | 5 | headers, verification, naming, data/TU, typed fields | #1569, #1478, #1513, #1491, #1517 |
| 1575-1674 | 19 | 98 | 2 | headers, verification, fake/generated, naming, typed fields | #1665, #1599, #1649, #1651, #1659 |
| 1675-1775 | 15 | 97 | 3 | headers, verification, naming, fake/generated, stack/locals | #1762, #1694, #1769, #1689, #1737 |
| 1776-1882 | 11 | 99 | 1 | headers, verification, stack/locals, fake/generated, naming | #1810, #1834, #1869, #1781, #1790 |
| 1883-1982 | 11 | 97 | 3 | headers, verification, fake/generated, typed fields, stack/locals | #1924, #1922, #1962, #1912, #1982 |
| 1983-2082 | 47 | 100 | 0 | headers, verification, typed fields, naming, fake/generated | #2045, #2072, #2065, #2028, #2053 |
| 2083-2182 | 35 | 99 | 1 | headers, verification, naming, typed fields, stack/locals | #2143, #2138, #2130, #2160, #2154 |
| 2183-2283 | 28 | 98 | 2 | verification, headers, data/TU, stack/locals, typed fields | #2187, #2217, #2241, #2200, #2232 |
| 2284-2383 | 22 | 98 | 2 | verification, headers, stack/locals, naming, typed fields | #2373, #2349, #2357, #2329, #2292 |
| 2384-2483 | 15 | 99 | 1 | verification, headers, data/TU, stack/locals, naming | #2433, #2409, #2469, #2398, #2439 |
| 2484-2588 | 23 | 98 | 2 | verification, stack/locals, pragmas, data/TU, headers | #2581, #2583, #2564, #2532, #2498 |
| 2589-2606 | 1 | 5 | 13 | verification, data/TU, naming, control, headers | #2592, #2591, #2590, #2593, #2589 |
