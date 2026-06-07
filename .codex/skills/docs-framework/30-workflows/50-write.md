---
covers: Write or update documentation across layers — Design (system-agnostic) or Implementation (code-specific).
concepts: [write, draft, update, L2, L3, generation, notes, design, implementation, layer]
---

# Docs Write Workflow

Write or update documentation for a source path or system concept. This workflow is **layer-aware** — it produces different documentation depending on the target layer.

| Layer | Target | Tone | Output Location |
|-------|--------|------|-----------------|
| **Design** | System concepts, behaviors, flow | Code-agnostic — no language, framework, or file references | `docs/10-system-design/` |
| **Implementation** | Source code sections | Code-specific — files, patterns, language details | `docs/20-implementation/` |

**Layer detection**: If `source_path` is `design` or targets `docs/10-system-design/`, use the Design layer workflow (Section A below). Otherwise, use the Implementation layer workflow (Section B).

Notes and diffs are drafting inputs only; the final docs should describe the current system as it exists now.

---

## Section A: Design Layer Writing

Write or update system-agnostic Design documentation. Input is typically a design interview report (`docs/.drafts/design.interview.md`) or equivalent notes about system behavior.

### A.1 Inputs

| Input | Source | Required |
|-------|--------|----------|
| `area` | Argument 1 (e.g., `design`, `design/session-flow`) | Yes |
| `notes_file` | Argument 2 (default: `docs/.drafts/design.interview.md`) | Yes (for new docs), Optional (for updates) |

### A.2 Gather Context

| Source | Location | Purpose |
|--------|----------|---------|
| Notes file | Interview report or design notes | System behaviors, flow, contracts to document |
| Foundation docs | `docs/00-foundation/` | Intent and vision — Design must align with Foundation |
| Existing Design docs | `docs/10-system-design/` | What's already documented at the Design level |

**Do NOT read source code for Design docs.** If you find yourself referencing a file path, class name, or language feature, you've drifted into Implementation territory.

### A.3 Write Design Docs

Design docs describe **how the system works** without saying **how it's built**. Follow these principles:

- **System terms only**: "The session processor validates input before advancing phase" — not "the `SessionProcessor` class calls `validate()`"
- **Behavioral descriptions**: What the system does, what guarantees it provides, what states it moves through
- **Data shapes as concepts**: "A session carries: an identifier, a phase indicator, and an ordered list of checkpoints" — not TypeScript interfaces
- **Contracts at boundaries**: What crosses between components, what each side guarantees

Structure follows the system's natural organization, not code structure. Group by concept (session flow, data model, event system) not by directory.

```markdown
---
covers: [System concept this covers]
concepts: [relevant, system, concepts]
---

# [Concept Name]

[What this system component/behavior is and why it exists — in system terms]

## Behavior

[How it works: lifecycle, states, transitions, decision points]

## Data Shape

[What data this component works with — conceptual structure, not type definitions]

## Contracts

[What this component guarantees to others, what it expects from others]

## Boundaries

[What this component owns vs. delegates]
```

### A.4 Validate

- No code references, file paths, class names, or language-specific terms
- Aligns with Foundation intent
- Could be implemented in any language from these docs alone
- Covers the system behaviors identified in the interview

---

## Section B: Implementation Layer Writing

Write or update code-specific documentation for a source path. This is the primary workflow for most documentation tasks.

### B.1 Inputs

| Input | Source | Required |
|-------|--------|----------|
| `source_path` | Argument 1 | Yes |
| `notes_file` | Argument 2 | Yes (for initial docs), Optional (for minor updates) |

**Notes file** can be:
- Interview notes from `/docs:interview-codebase`
- Implementation notes after building a feature
- A spec document you implemented against
- Any markdown describing what was built/changed

Use notes to extract present-state facts, responsibilities, boundaries, and invariants. Do not mirror the notes' "we changed X" phrasing into final documentation.

---

### B.2 Validate Inputs

```
If source_path not provided:
  → Ask: "Which source path should I document?"

If notes_file not provided AND no existing docs:
  → Ask: "Please provide a notes file with context about what to document"

If notes_file not provided AND existing docs exist:
  → Proceed with code analysis only (minor update mode)
```

### B.3 Gather Context

Read these sources:

| Source | Location | Purpose |
|--------|----------|---------|
| Notes file | `[notes_file]` argument | Change context and domain insight to convert into current-state documentation |
| Source code | `[source_path]/` | Current implementation |
| Existing docs | `docs/20-implementation/[section]/` | What's already documented |
| L1 overview | `docs/20-implementation/00-overview.md` | Parent context |

### B.4 Normalize Notes Into Present-State Facts

Before drafting, translate implementation notes into statements about the system as it exists now:

- Extract current responsibilities, boundaries, interfaces, invariants, and terminology
- Verify those statements against the code
- Discard update-history phrasing in final doc prose
- Keep historical detail only when the document is explicitly about migrations, versions, or decision history

**Default writing rule:** Final documentation should read as if it were written fresh against today's codebase. Prefer "The API validates session tokens at request boundaries" over "We now validate session tokens at request boundaries instead of in the controller."

Avoid this change-log voice in final docs unless history is the subject:
- "now"
- "no longer"
- "previously"
- "used to"
- "changed from"
- "replaced"
- "after refactor"
- "we switched"

### B.5 Analyze & Generate Change Plan

Compare sources to identify what needs to be created or updated:

```
Documentation Write Plan for [source_path]
══════════════════════════════════════════

Context Sources:
- Notes file: ✅ [notes_file] (loaded)
- Source files: ✅ [N] files in [source_path]/
- Existing docs: ✅ [N] files in docs/20-implementation/[section]/
           OR: ❌ No existing docs (will create new section)

Planned Changes:
┌─────────────────────────┬────────┬─────────────────────────────┐
│ File                    │ Action │ Reason                      │
├─────────────────────────┼────────┼─────────────────────────────┤
│ 00-overview.md          │ CREATE │ New section                 │
│ 10-[concept].md         │ CREATE │ From notes                  │
│ 20-[concept].md         │ UPDATE │ New functionality added     │
└─────────────────────────┴────────┴─────────────────────────────┘

Proceed? (y/n)
```

**Guidelines for identifying changes:**
- New section with no existing docs → CREATE L2 overview + L3 nodes
- Existing section + notes about new functionality → CREATE new L3 nodes, UPDATE L2 overview
- Existing section + notes about changes → UPDATE affected L3 nodes and L2 overview
- File tree changes → UPDATE L2 overview file tree section

### B.6 Load Templates

Read the appropriate templates:

| Template | Location | Used For |
|----------|----------|----------|
| Section overview | `40-templates/30-L2-section-overview/` | L2 docs (choose appropriate archetype) |
| Doc node | `40-templates/40-L3-concept/10-generic.md` | L3 docs |

### B.7 Write L2 Overview

Create or update `docs/20-implementation/[section]/00-overview.md`:

```markdown
---
covers: [What this section encompasses - from notes]
concepts: [key, concepts, from, notes]
code-ref: [source_path]
---

# [Section Name]: Overview (L2)

[Brief description of what this section covers]

## File Tree

```
[source_path]/
├── [actual file structure]
├── [from the source directory]
└── [keep it accurate]
```

## Section Scope

### What This Section Owns
[From notes: responsibilities and boundaries]

### What This Section Does NOT Own
[From notes: explicit boundaries, what belongs elsewhere]

## Architecture
[From notes: key patterns, data flow, design decisions]

## Child Nodes

### [10-concept-name.md](10-concept-name.md)
[Description of what this node covers]

### [20-concept-name.md](20-concept-name.md)
[Description of what this node covers]
```

**If updating existing L2:**
- Preserve existing content not contradicted by notes
- Update file tree to match current source structure
- Add new child node links
- Update architecture section if notes indicate changes
- Rewrite outdated or change-log phrasing into present-state prose

### B.8 Propose L3 Nodes

Present proposed nodes to user:

```
Based on the notes, I'll create/update these L3 documentation nodes:

┌────┬─────────────────────────┬────────┬────────────────────────────┐
│ #  │ File                    │ Action │ Covers                     │
├────┼─────────────────────────┼────────┼────────────────────────────┤
│ 1  │ 10-session-lifecycle.md │ CREATE │ Session creation, storage  │
│ 2  │ 20-token-handling.md    │ UPDATE │ Added refresh flow         │
│ 3  │ 30-mfa.md               │ CREATE │ New MFA functionality      │
└────┴─────────────────────────┴────────┴────────────────────────────┘

Approve this structure? (Or suggest changes)
```

**Guidelines for L3 nodes:**
- One concept per file (atomic)
- Don't create a doc for every source file
- Group related functionality into concepts
- Use 10, 20, 30 numbering (gaps for future additions)

### B.9 Write L3 Nodes

For each approved node, create or update the file:

```markdown
---
covers: [Specific scope - from notes]
concepts: [relevant, concepts]
code-ref: [specific files this covers]
---

# [Concept Name]

## Context
[What this concept is, why it exists, and why it matters in the current system]

## Architecture

### [Subheading based on content]
[Explanation of how it works at a conceptual level]
[Focus on the current design rationale, trade-offs, and patterns]

### [Another subheading if needed]
[More architectural explanation]

## Key Rules
- [Rule or invariant from notes]
- [Another important constraint]
- [Gotcha or edge case to know about]

## Code References

| File | Purpose |
|------|---------|
| `[path/to/file.ext]` | [What this file does] |
| `[path/to/other.ext]` | [What this file does] |

## Related
- [Link to related L3 node if applicable](./XX-related.md)
- [Link to another section if cross-cutting](../YY-section/00-overview.md)
```

**If updating existing L3:**
- Preserve existing content not contradicted by notes
- Add new sections for new functionality
- Update code references if files changed
- Rewrite historical/update phrasing into current-state statements
- Remove stale descriptions; if a deprecated path still exists, document its current status as part of the live contract

### B.10 Update L1 Overview

Ensure `docs/20-implementation/00-overview.md` links to the new/updated section:

- Add section to child nodes list if new
- Update description if section scope changed

### B.11 Validate Links

After writing all files:

1. **Check internal doc links** - All `[text](path)` links resolve
2. **Check code references** - Referenced files exist in source
3. **Check parent links** - L2 overview links to all L3 nodes
4. **Check L1 links** - L1 overview links to this L2

Report any issues found.

### B.12 Summary

Output completion summary:

```
Documentation Write Complete!

Section: [section-name]
Source: [source_path]
══════════════════════════════════════

Created:
- docs/20-implementation/[section]/00-overview.md (L2)
- docs/20-implementation/[section]/30-mfa.md (L3)

Updated:
- docs/20-implementation/[section]/20-token-handling.md (L3)
- docs/20-implementation/00-overview.md (L1 - added section link)

Link Validation:
- ✅ All internal links valid
- ✅ All code references exist

Notes file used:
- [notes_file]

Next Steps:
1. Review the generated documentation
2. Edit as needed to refine language and accuracy
3. Run /docs:annotate [source_path] to add L4/L5 to source files
4. Run /docs:audit to verify structure
```

---

## Quality Checklist

Before marking write complete, verify:

- [ ] L2 overview has accurate file tree
- [ ] L2 overview links to all L3 nodes
- [ ] Each L3 node has frontmatter with `covers` and `code-ref`
- [ ] Code references use correct paths
- [ ] No generic placeholder text remains
- [ ] Key insights from notes are captured
- [ ] Cross-references to related sections included
- [ ] L1 overview updated if needed

---

## Output

- Created/updated documentation files
- Link validation results
- Clear summary of what was done
- Next steps for follow-up actions
