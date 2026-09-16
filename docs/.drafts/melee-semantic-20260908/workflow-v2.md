# Semantic sweep workflow v2

Authorized by the user after observed stage medians of 18.8 minutes for librarians, 17.3 for leads and 17.3 for reviewers. New jobs use `packet_contract: lean-v2`; running legacy jobs retain their original contracts and acceptance gates.

1. Librarians perform the exhaustive canonical and rendered source pass and examine every baseline fact and outgoing relationship. Retained IDs can be grouped under shared evidence and reasoning. The adapter reconstructs exact frozen versions and relationship records; no omitted IDs imply retention.
2. Leads receive an immutable compact handoff. They reconcile functionality, naming, proposed changes and explicit contradictions. They read source supporting each proposal and any overridden disposition. Unchanged reviewed research is inherited by hash rather than researched or printed again.
3. Independent reviewers read the exact proposed changes and functionality document, verify every proposed fact against their own source receipts, and explicitly account for all inherited non-retain claims. Acceptance describes proposed changes and examined contradictions; inherited relationship ledgers are not falsely labeled a fresh full independent relationship audit.
4. The scheduler expands compact results into existing proposal/ledger formats and runs the existing serialized staged-apply, final-render and live-promotion gates. The pinned source and baseline remain unchanged.

Checkpoints save only newly completed findings. Arrays append and other fields replace. Workers may finish with `use_checkpoint: true` to avoid emitting already saved ledgers again. A same-role retry receives saved notes and can restore the exact cached source/baseline/artifact responses. Restored evidence is checked against source and artifact hashes before delivery; notes alone never establish reading coverage. Old in-flight jobs have no checkpoints, so those attempts retain their old retry cost.

Completed legacy librarian and lead packets can enter the compact path only after the existing exhaustive gate is rerun and a frozen proof is recorded. Work lacking compatible proof falls back to its legacy gate; no unverified full-coverage assertion is invented.

Verification: fifteen gate fixtures cover explicit retention, exact baseline reconstruction, stale hashes, missing source and contradiction checks, role independence, and restored canonical/rendered pages. A local real-tool fixture verifies checkpoint merging and replay under a new job identity. A real Astra lead smoke job and live v2 jobs verify execution; throughput is not yet established.

Files are campaign-local helpers. No production agent catalog, canonical source, public symbols, UI server or matching run changed.

At 18:09 UTC, 62 live jobs use the new workflow and 11 have saved checkpoints. Provider stream interruptions still occur. No completed-stage speedup has been measured yet. Renderer coverage uses actual returned ranges, including on cache replay.
