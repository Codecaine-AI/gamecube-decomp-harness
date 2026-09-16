# Findings

Reviewed all 17 subjects and 29 facts. Details and canonical citations are in functionality.md; exact fact versions and decisions are in coverage.json.

Main corrections distinguish numeric saturation from error-sentinel semantics, preserve high bits on successful masked arithmetic, bound claims around INT_MIN, and replace unverified external gameplay labels with numeric caller behavior. No code, shared types or KB records were changed.

Independent-review repair supersedes the unsigned-adder state wording and TU data-flow summary. Final decisions are 12 retain, 17 supersede, with 27 proposed writes.
