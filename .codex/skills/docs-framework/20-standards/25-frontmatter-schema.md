---
covers: YAML frontmatter specification for progressive disclosure navigation.
type: standard
concepts: [frontmatter, yaml, progressive-disclosure, scan-skim-read]
---

# Frontmatter Schema

Frontmatter enables three-phase navigation: SCAN the `covers` field to decide relevance, SKIM the opening paragraph for context, READ full content only when needed. This reduces token usage and speeds up codebase exploration.

---

## Schema

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `covers` | string | One-sentence description of what this file addresses. Used for SCAN phase. |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `concepts` | string[] | Machine-readable topic tags for indexing. Short keywords only (< 30 chars each). |
| `depends-on` | string[] | Relative paths to prerequisite documentation. |
| `design_refs` | string[] | Relative paths to related System Design docs. For cross-layer navigation from Implementation to Design. |
| `type` | string | Only for 00-overview.md files. Value: `overview` or `standard` |

## Validation Rules

1. **`covers`**: Required, non-empty string, single sentence preferred
2. **`concepts`**: If present, must be array of strings, each ≤ 30 characters
3. **`depends-on`**: If present, paths must be relative to the skill/docs root
4. **`design_refs`**: If present, paths must point to files within `10-system-design/`
5. **Circular dependency**: Any cycle in `depends-on` graph is an error

## Examples

### Standard Documentation Node
```yaml
---
covers: How to link from documentation to code files using one-way, specific references.
concepts: [code-linking, references, file-line-format]
depends-on: [20-standards/40-doc-linking.md]
---
```

### Overview File
```yaml
---
covers: The structural rules that make the documentation system navigable.
type: overview
---
```

### Implementation Doc with Design References
```yaml
---
covers: How the session service manages lifecycle transitions and state persistence.
concepts: [session, lifecycle, state-machine]
design_refs: [10-system-design/10-session-flow.md, 10-system-design/20-data-models.md]
---
```

### Minimal (covers only)
```yaml
---
covers: Decision-making heuristics that apply across the system.
---
```

## Document Structure Convention

After frontmatter, structure your document with an opening paragraph and detail boundary:

```markdown
---
covers: The algorithm for traversing documentation efficiently.
concepts: [traversal, navigation, progressive-disclosure]
---

# Title

Opening paragraph(s) serve as the SKIM layer. 2-4 sentences that
elaborate on covers. Agent should be able to answer most queries here.

---

## Detailed Section
[Full content begins after the horizontal rule]
```

### The Three Phases

| Phase | What | Tokens | Purpose |
|-------|------|--------|---------|
| **Frontmatter** | `covers`, `concepts`, `depends-on`, `design_refs` | ~50 | SCAN: Is this relevant? |
| **Opening** | Paragraphs before first `---` | ~100-200 | SKIM: Enough context? |
| **Content** | Everything after `---` | Variable | READ: Full details |

### Writing Guidelines

**For `covers`:**
- One complete sentence
- Describe WHAT the file contains, not WHEN to read it
- Be specific enough to differentiate from sibling files

**For `concepts`:**
- Short tags (1-3 words each)
- Keywords an agent might search for
- Don't duplicate words already in `covers`

**For `depends-on`:**
- Only direct prerequisites (not transitive)
- Use relative paths from docs root
- Prefer fewer dependencies over more

**For `design_refs`:**
- Only in Implementation layer docs pointing to System Design docs
- Use relative paths from docs root (e.g., `10-system-design/10-session-flow.md`)
- Links the "how it's built" to the "why it's designed this way"

**For opening paragraph:**
- Expand on `covers` with 2-4 sentences
- Answer: "What will I learn and why does it matter?"
- Should stand alone without reading full content
