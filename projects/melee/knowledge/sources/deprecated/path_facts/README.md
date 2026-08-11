# Path-Scoped Melee Decomp Facts

This source owns bounded path facts for worker/writer packets. It is intentionally
separate from global standards:

- global standards may be loaded by every worker and QA flow;
- path facts resolve only by target path and are injected only when relevant;
- facts are hints with provenance, not a replacement for graph/source evidence;
- stale or conflicting facts lose to current source, headers, assembly,
  objdiff/checkdiff, and regression output.

APIs are kept for status checks, proposal review, and path resolution. Workers
should normally use `resolve_for_path` for the target path rather than browsing
path facts as a general search corpus.

```bash
python3 projects/melee/knowledge/sources/injectable/path_facts/api/status.py --json
python3 projects/melee/knowledge/sources/injectable/path_facts/api/search.py --query GET_ITEM --limit 10 --json
python3 projects/melee/knowledge/sources/injectable/path_facts/api/resolve_for_path.py --path src/melee/it/items/itlinkarrow.c --json
python3 projects/melee/knowledge/sources/injectable/path_facts/api/proposals.py --json
```
