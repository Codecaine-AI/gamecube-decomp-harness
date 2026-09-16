# Ground Flags and Callback1 Consumer Supplement

Two Game & Watch data-flow records retain unsupported callback1 dispatch claims. The supplemental proposal replaces those claims with table membership and constant-false behavior. Runtime callback1 dispatch remains unresolved.

Ground consumes flags_b2 for auxiliary cameras, flags_b1 for fog and flags_b0 for lights. Fog and light scans use archive map count. A zero callback row does not terminate these scans. Accepted proposal statements about flags being ignored are scoped to Ground_SetupStageCallbacks and remain valid.

Reviewed 3,321 baseline facts across 27 existing grt packets; exact-record-review.json accounts for all 264 callback1/flag keyword hits. accepted-proposal-review.json preserves matching operations with original file and record hashes. Existing unresolved dispositions remain unresolved. Unrelated flag facts are not re-reviewed here. No Ground factory followup records are proposed again.

Original packets remain unchanged. Native proposal validation is dry-run only. Independent review is required before root applies anything.
