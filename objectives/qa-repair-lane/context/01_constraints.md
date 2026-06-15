<constraints>
    <hard_rules>
        - The deterministic scanner is authoritative for known hardened rules.
          A repair item cannot become clean while `scan_diff --gate` still
          reports hard findings for its candidate delta.
        - Lower match is acceptable when the alternative is preserving a
          maintainer-rejected tactic. Route this as `clean_lower_score`, not as
          failure or hidden exactness.
        - The queue must be durable and resumable under
          `state_dir/qa_repairs/<run-id>/<timestamp>/`.
        - Agents may propose and edit, but runner-owned validation assigns the
          final item status.
        - Prompt-template or injected-context changes require Agent Viewer
          preview updates in `apps/agent-viewer/src/server.ts` and
          `apps/agent-viewer/src/components/AgentViewer.tsx`. If an existing
          viewer serves `apps/agent-viewer/dist`, rebuild the bundle; do not
          start a server unless asked.
    </hard_rules>

    <forbidden_shortcuts>
        - Do not mark an item clean from agent JSON alone.
        - Do not bury the queue in Markdown only; machine JSON is required.
        - Do not overload worker leases for whole-checkout QA repair.
        - Do not turn `pr-preship-review` into a patcher.
        - Do not silently drop warning/error files from PR planning. Dropped or
          demoted files need reasons in artifacts.
        - Do not revert unrelated dirty worktree changes.
    </forbidden_shortcuts>

    <validity_gates>
        - Queue gate: every hard finding in candidate files appears in exactly
          one queue item or is recorded as ignored with a reason.
        - Repair gate: a post-repair scan and validation transcript exist for
          every item marked `clean_same_match` or `clean_lower_score`.
        - Handoff gate: the final split plan consumes only clean survivors from
          the QA repair lane.
        - Viewer gate: the `qa-repair` prompt preview renders sample context
          without raw `{{PLACEHOLDER}}` text.
    </validity_gates>

    <risk_budget>
        - False positives may happen, but they must become `false_positive`
          queue outcomes plus a fixture/rule-refinement follow-up.
        - Live Pi repair can be expensive; dry-run command paths and mocked
          tests must exercise the artifact/validation flow without live calls.
        - Dashboard integration can start with solid state and artifact links;
          do not expand into a broad UI redesign.
    </risk_budget>
</constraints>
