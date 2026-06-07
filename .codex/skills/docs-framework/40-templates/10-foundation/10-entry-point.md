---
covers: Template for the Foundation zone entry point (00-overview.md).
concepts: [foundation, overview, entry-point]
---

# Foundation Entry Point Template

Template for `docs/00-foundation/00-overview.md`. This is the only required file in Foundation—it introduces whatever structure you've chosen to capture your understanding.

---

## Template

```markdown
---
covers: [One sentence describing what understanding is captured here]
type: overview
---

# Foundation

[2-3 sentences explaining what this section captures. What will someone understand after reading Foundation?]

Read Foundation before diving into Implementation. This context ensures changes align with what we're trying to build, not just how it's currently implemented.

---

## Contents

### [10-first-doc.md](10-first-doc.md)
[What this document captures and why it matters]

### [20-second-doc.md](20-second-doc.md)
[What this document captures and why it matters]

### [30-third-doc.md](30-third-doc.md)
[What this document captures and why it matters]
```

---

## Guidance

### Adapt to Your Structure
The contents section should list whatever documents you've created. There's no fixed set—list what exists and explain what each captures.

### Keep It Brief
Foundation overview should be readable in under a minute. It's a navigation aid, not a summary of everything.

### Examples by Pattern

**Problem-focused projects:**
```markdown
## Contents

### [10-problem.md](10-problem.md)
The pain point we're solving and who experiences it.

### [20-landscape.md](20-landscape.md)
What exists today and why it falls short.

### [30-approach.md](30-approach.md)
How we're tackling this differently.
```

**Vision-focused projects:**
```markdown
## Contents

### [10-vision.md](10-vision.md)
Where we're heading and what success looks like.

### [20-constraints.md](20-constraints.md)
What shapes and limits our path forward.

### [30-direction.md](30-direction.md)
How we'll move toward the vision.
```

**Simple projects (single document):**
```markdown
## Contents

### [10-foundation.md](10-foundation.md)
Complete understanding of what we're building and why.
```
