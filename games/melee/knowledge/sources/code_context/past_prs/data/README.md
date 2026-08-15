# Past PR Data

Current canonical locations:

- `prs/pr-NNNN/raw` contains fetched GitHub JSON streams and `diff.diff`.
- `prs/pr-NNNN/extracted` contains deterministic per-PR text, changed-file, and
  diff-line slices rebuilt from the raw files.
- `prs/pr-NNNN/postmortem` contains the structured PR knowledge record.
- `aggregate` contains corpus-wide rollups rebuilt from PR slices.
- `library` contains search-facing indexes, known fixes, and run summaries.
- Top-level files such as `prs.json`, `manifest.json`, `summary.json`,
  `fetch_metadata.json`, `pr_counts.json`, and `vertical_slice_index.json`
  describe the active corpus.

The graph rebuild consumes `aggregate` plus `library`, then emits file-to-PR
graph edges and search records.
