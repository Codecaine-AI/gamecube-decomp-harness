# Graph-first knowledge tool cleanup

## Overview

Make the resource graph the canonical worker surface for computed decomp evidence while retaining opseq, callgraph, and Ghidra as graph-input generators.

## Problem Statement

The repository currently mixes graph-backed knowledge, direct source-specific lookup APIs, dead recipes and sweep helpers, and parked deprecated corpora. Some evidence is already stored in the graph but is not queryable through worker-facing graph operations; other evidence, especially Ghidra exports, is not ingested at all. This makes it unsafe to remove duplicate APIs and obscures the intended architecture.

## Goals

### High-Level Goals

- Make graph queries the complete worker-facing route for opseq analogs, call relationships, data references, and Ghidra corroboration.
- Reduce the toolkit to active tools and graph-input generators.
- Make implementation documentation agree with the graph-first system design.

### Mid-Level Goals

- Extend file cards and add structured related-function and all-source graph search operations.
- Ingest Ghidra xref exports as graph evidence.
- Remove direct opseq, callgraph, and Ghidra worker lookup surfaces only after graph parity exists.
- Remove dead recipes, sweep operations, deprecated source implementations, and their registrations.

### Detailed Goals

- Preserve provenance and evidence references on every graph-derived result.
- Keep extraction and graph ingestion independently testable.
- Leave active validation, compiler, source-editing, data-conversion, and m2c capabilities intact.

## Non-Goals

- Adding embeddings or a generic vector database.
- Replacing SmashWiki keyword search, standards injection, or ledger search.
- Reworking the extraction algorithms used by opseq, callgraph, or Ghidra.
- Deleting evidence that has not yet reached graph-query parity.

## Success Criteria

- [ ] A worker can retrieve opseq analogs, callers, callees, data references, and Ghidra corroboration through graph-backed tools.
- [ ] Graph text search can search all active graph chunks without being restricted to `code_graph`.
- [ ] Direct duplicate lookup tools are absent from worker profiles and prompts.
- [ ] Recipes, sweep operations, and deprecated source code/registrations are removed.
- [ ] Focused server and Python tests pass and docs describe the present architecture.

## Context & Background

The system-design layer defines the graph as the per-target spine. Opseq and callgraph already generate graph records. Ghidra has an xref exporter but no graph builder. Tactic retrieval remains an incomplete attempt-ledger view, so mismatch cleanup must preserve behavior until graph-backed tactic parity is established.

## Design

### Computed evidence becomes graph attachment

```ascii
opseq extractor ───────▶ ANALOGOUS_TO / analog profiles ─┐
callgraph extractor ───▶ CALLS / REFERENCES_DATA ─────────┼─▶ file card + related-function query
Ghidra exporter ───────▶ corroborating xref facts/edges ──┘

active graph chunks ───▶ all-source lexical graph search
```

### Toolkit layout

Dead recipes and operator sweep helpers are removed. Computed evidence generators remain registered only where maintenance needs them. M2c remains an active analysis capability. Deprecated knowledge archives leave the working tree rather than remaining callable archaeology surfaces.

## Notes

- The repository already contains a large in-progress knowledge migration. Preserve unrelated user edits and integrate with current files rather than resetting them.
- `mismatch_db` removal is contingent on completing tactic-query parity; do not manufacture parity by relabeling static mismatch patterns.
