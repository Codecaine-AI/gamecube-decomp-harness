# Native Semantic Pilot Contracts

Status: assignments proposed; immutable manifest and artifact helpers ready. Four TU leads started.

The pilot contains 16 TUs at cycle revision `c302741689bd67c361cd7faadb221df3193992c3`, tree-equivalent to upstream `05a1394faea2aac458e4bdd030621d8a5631ae62`. All coordinator, TU, librarian and reviewer agents use `gpt-6-astra` with medium reasoning. Child spawns explicitly set those options and `fork_turns: none`.

## Ownership and Scheduling

Run at most four TU agents concurrently. Each TU agent may run at most four librarian children concurrently and must reuse its children for additional clusters. Librarians may not spawn. Finish all research children before reassigning a TU slot. The campaign coordinator owns assignment and coverage records; root owns manifest construction and shared-KB application.

Each TU owns its paired headers. Every other shared header needs one manifest owner before proposals can be promoted. A TU may read foreign headers and propose family followups, but may not claim them as its reviewed owned files. Camera owns camera-specific shared types only if the frozen manifest says so. Generic fighter, item and baselib type claims remain coordinator family followups until explicitly assigned.

## Librarian Return Contract

1. Identify campaign, TU, cluster, pinned revision, input file hashes and render metadata. Record every canonical and rendered range actually read, including complete assigned headers. Continue reading until assigned files or ranges are exhausted. Record empty and failed renders explicitly.
2. Account for every assigned target, including targets already carrying useful canonical names. Explain behavior, relevant inputs/state writes/callbacks, and uncertainty. Existing naming or semantic facts receive an explicit retain, supersede, reject or unresolved disposition, with fact IDs and versions when available.
3. Support each proposed claim with canonical path and precise line ranges at the pinned revision. Rendered names are reading aids. Archived assertions require independent canonical support for current behavior. Record contradictory evidence and distinguish attested names from inferred names.
4. Write structured findings and proposed changes to the assigned artifact directory. Use the helper schema exactly once supplied. Never write the shared KB, change canonical source names, start matching, publish Git changes or launch UI servers.
5. Return counts, read exceptions, cross-file dependencies and unresolved questions. No false completion if a source/header range or target is missing.

## TU Synthesis Contract

1. Read manifest, owned source and headers, rendered views and target/fact inventory. Partition coherent clusters that collectively cover every owned line and target. Assign at most four librarians concurrently with disjoint claim ownership.
2. Reconcile overlapping findings, proposed-name collisions and contradictions. Prefer upstream canonical names. A hypothesis identical to a canonical name is redundant; a different inherited hypothesis needs a fresh decision based on canonical behavior.
3. Produce functionality documentation describing purpose, entry points, state/data flow, dependencies and invariants; a naming table with canonical/alias/proposed names and dispositions; structured proposals; coverage and unresolved/family records. Link immutable canonical and rendered snapshots.
4. Submit promoted names and cross-file conclusions for independent review. Keep rejected and deferred proposals with reasons. Drafts stay drafts until reviewed application and final rendering agree.
5. Report covered versus expected files, ranges, symbols and facts, plus research duration and proposal/rejection counts. Distinguish complete local review from pending family decisions.

## Independent Review Contract

Re-read canonical evidence for each promoted name and cross-file claim. Check source revision, line bounds, ownership, semantic support, collision risk and canonical-name precedence. Accept, reject or defer each proposal with a reason. A reviewer cannot approve their own proposal. Root applies accepted proposals through the validated helper, retains before/after history and regenerates final renders. Missing evidence or review is a pending state, never an implicit approval.

## Existing Relationship Review

Review every outgoing baseline link for owned subjects, with its exact ID, full stored record, disposition, and canonical evidence. Read `baseline-links/<task-id>.json` in the campaign directory; absence means no links owned by that task. The 231 links without a manifest source-subject owner remain a family reconciliation task. Proposed and retained `implements`, `exhibits`, and `uses` relationships require semantic support independently of fact values or names.

Record dispositions in `link-dispositions.json`. Preserve contradictions and unresolved edges explicitly. Fact promotion alone does not complete this gate. Existing promoted TUs need a supplemental relationship review; do not repeat source research already supported by receipts and evidence. Any removal or reclassification requires a separately reviewed, reversible reconciliation procedure with the original record archived.
