# Calculate Melee GitHub Contribution

Use this run book to calculate how many Melee code and data bytes a GitHub account matched or improved through accepted pull requests.

The output has three measures:

1. **Exactly matched bytes.** Full function or data-section sizes that crossed to 100% match.
2. **Improved but still unmatched bytes.** Fuzzy-equivalent progress on items the account never later matched exactly.
3. **Non-overlapping impact.** Exact bytes plus the remaining fuzzy-equivalent bytes.

The reference output is [Melee Contribution Report for `fjooord`](../Reports/melee-fjooord-contribution-2026-08-26.md).

## 1. Set the Scope

```bash
ACCOUNT="fjooord"
MELEE_REPO="doldecomp/melee"
MELEE_CHECKOUT="games/melee/checkout"
```

List other identities before calculating. Check GitHub CLI authentication, global Git identity, Melee commit identities, and any suspected accounts:

```bash
gh auth status
git config --global --get-regexp '^user\.'
git -C "$MELEE_CHECKOUT" log origin/master --format='%an%x09%ae' \
  | sort | uniq -c | sort -nr
gh api "users/<suspected-account>" --jq '{login,id,name,type}'
```

Organizations cannot author pull requests. Include another identity only when it is a GitHub user account and ownership is known.

## 2. Fetch Every Accepted PR

```bash
gh pr list \
  --repo "$MELEE_REPO" \
  --author "$ACCOUNT" \
  --state merged \
  --limit 1000 \
  --json number,title,url,createdAt,mergedAt,mergeCommit,headRefOid,baseRefOid,statusCheckRollup \
  > "/tmp/${ACCOUNT}-melee-merged-prs.json"

jq '{count:length,first:(sort_by(.mergedAt)|first),last:(sort_by(.mergedAt)|last)}' \
  "/tmp/${ACCOUNT}-melee-merged-prs.json"
```

Repeat the query for each confirmed user account. Concatenate the arrays and deduplicate by PR number before continuing.

Do not use `involves:ACCOUNT`. That qualifier also returns PRs the account merely commented on or reviewed.

## 3. Resolve the Actual Merge Baseline

For each PR, use the accepted merge commit and its first parent:

```bash
MERGE_SHA="<mergeCommit.oid>"
PARENT_SHA="$(git -C "$MELEE_CHECKOUT" rev-parse "${MERGE_SHA}^1")"
```

Do not sum the numbers printed in PR comments. decomp.dev can compare a PR against a cached base that differs from the commit's actual parent. The merge-versus-first-parent comparison measures what entered `master` at that merge and avoids overlap between concurrent PR branches.

## 4. Download decomp.dev Reports

Fetch the flattened GALE01 report for both revisions:

```bash
curl -fsSL --compressed \
  "https://decomp.dev/doldecomp/melee/GALE01/${PARENT_SHA}.json?mode=report" \
  > "/tmp/${PARENT_SHA}.report.json"

curl -fsSL --compressed \
  "https://decomp.dev/doldecomp/melee/GALE01/${MERGE_SHA}.json?mode=report" \
  > "/tmp/${MERGE_SHA}.report.json"
```

Cache by SHA. Adjacent PRs often share a parent or merge revision, so one report can satisfy several comparisons.

Fetch the current denominator from GitHub's current `master`, not from a stale local build:

```bash
CURRENT_SHA="$(gh api repos/doldecomp/melee/commits/master --jq .sha)"
curl -fsSL --compressed \
  "https://decomp.dev/doldecomp/melee/GALE01/${CURRENT_SHA}.json?mode=measures" \
  > "/tmp/${CURRENT_SHA}.measures.json"
```

Use `total_code` for code percentages, `total_data` for data percentages, and their sum for combined percentages.

## 5. Calculate Exact Bytes

For every PR:

```text
matched_code_delta = merge.measures.matched_code - parent.measures.matched_code
matched_data_delta = merge.measures.matched_data - parent.measures.matched_data
```

Sum signed deltas across all accepted PRs. Keep negative deltas. They represent an exact match broken by that merge and prevent overstatement.

These totals are authoritative for exact coverage. Do not reconstruct exact bytes by adding function table rows because section changes and item pairing can make that less reliable than the report-level measures.

## 6. Calculate Fuzzy-Equivalent Bytes

Pair report items using the same rules as decomp.dev:

- Pair units by unit name.
- Pair functions by function name or `metadata.virtual_address`.
- Pair data sections by section name within a unit.
- Ignore the `.text` section because functions already represent code.
- Quantize fuzzy percentages to float32 before calculating bytes.

For each paired item:

```text
before_equivalent = floor(float32(before_fuzzy) / 100 * before_size)
after_equivalent  = floor(float32(after_fuzzy)  / 100 * after_size)
equivalent_delta  = after_equivalent - before_equivalent
```

Classify the transition:

```text
after fuzzy == 100   -> new exact match
before fuzzy == 100  -> broken exact match
after > before       -> unmatched improvement
before > after       -> unmatched regression
```

Use signed deltas. A regression must reduce the total.

## 7. Remove Double Counting

Build a stable identity for each item:

- Function key: category plus virtual address.
- Data key: category plus unit name plus section name.

Collect every key that entered or left exact-match status in one of the account's PRs. Exclude all fuzzy events for those keys. The exact-match measure already credits or debits their full size.

```text
remaining_fuzzy_net = sum fuzzy deltas for keys with no exact transition
non_overlapping_impact = exact_matched_bytes + remaining_fuzzy_net
```

Apply the calculation separately to code and data, then combine them.

Report a secondary stable-size result when useful. It excludes fuzzy comparisons where item size changed between parent and merge because those ranges are not directly comparable. Keep the all-events result as the conservative headline.

## 8. Calculate Percentages

```text
code_impact_percent = code_impact_bytes / current_total_code * 100
data_impact_percent = data_impact_bytes / current_total_data * 100
combined_impact_percent = combined_impact_bytes
                          / (current_total_code + current_total_data) * 100
```

Keep exact and fuzzy percentages separate in the output, then show their non-overlapping sum.

## 9. Verify CI Coverage

Count final check conclusions from the PR JSON:

```bash
jq '[.[] | .statusCheckRollup[] | (.conclusion // .state // "UNKNOWN")]
    | group_by(.)
    | map({conclusion:.[0], count:length})' \
  "/tmp/${ACCOUNT}-melee-merged-prs.json"
```

Inspect any conclusion other than `SUCCESS`, `SKIPPED`, or `NEUTRAL`. Expected deployment skips do not invalidate an accepted PR. A failed final build or diff check needs an explanation in the report.

## 10. Record the Snapshot

The report must include:

- Account names and how they were verified
- First and last accepted PR dates
- Current `master` SHA
- Code and data denominators
- Exact, fuzzy, and non-overlapping byte totals
- Percentages for code, data, and combined bytes
- CI conclusion counts
- Size-change adjustments and other caveats

Store dated reports under `ref/Reports/`. Link each report to this run book so a later calculation can reproduce or update it.
