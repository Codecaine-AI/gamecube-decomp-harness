# Naming Decisions

Retain ftCo_TurnRun_CheckInputFromRunBrake and ftCo_TurnRun_CheckInput as hypotheses for C9CEC and C9D40. Current canonical callers support the distinguishing context/frame behavior. Frozen-KB queries found one exact owner each; canonical-source exact-name search found no collision. No names are promoted to source symbols.

Canonical Enter/Anim/IASA/Phys/Coll, .sdata2 and source identity remain unchanged. Eight parameters are covered: seven gobj pointers and entry anim_start float, with matching header names. Shared inline getAccelAndTarget is foreign evidence. The walk.middle_anim_frame spelling aliases saved entry-facing and is documented, but shared type/source edits are out of scope. x197C is only used as a sound-call guard here; its broader role is not inferred.

Rendered aliases remain reading aids; all factual decisions rely on canonical bodies/offsets. Per-page mappings and frozen fact versions remain in coverage.json and campaign pages.
