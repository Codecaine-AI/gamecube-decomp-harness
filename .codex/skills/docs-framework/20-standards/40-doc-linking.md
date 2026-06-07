---
covers: How documentation files link to other documentation files within docs/.
concepts: [linking, anchor-text, navigation, cross-reference]
---

# Documentation Linking

How to link between documentation files. Declarative anchor text that describes what the link provides, top-down navigation patterns (parent to children), and formatting guidelines for relative and external links.

---

## Core Principles

### 1. Declarative Anchor Text

Never use generic link text. Always describe what the link provides:

❌ **Bad**:
```markdown
For more information, [click here](20-caching.md).
See [this document](../auth/oauth.md) for details.
```

✅ **Good**:
```markdown
The [caching strategy](20-caching.md) defines TTL and invalidation rules.
OAuth implementation in [auth/oauth.md](../auth/oauth.md) handles provider callbacks.
```

### 2. Top-Down Linking

Links flow **DOWN** from parent to children:

```markdown
## Child Nodes
- [10-authentication.md](10-authentication.md) - Authentication patterns
- [20-authorization.md](20-authorization.md) - Permission system
```

This simplifies maintenance—no need to keep cross-cutting links in sync.

### 3. Relationship Context

Include brief context about what the linked doc provides:

```markdown
The repository pattern is defined in [20-repository-pattern.md](20-repository-pattern.md),
which implements our data persistence boundary.

See [30-migrations.md](30-migrations.md) for schema evolution process.
```

---

## Link Patterns

### Definition Links

When linking to where something is defined:

```markdown
The [User model](10-models/10-user-model.md) defines entity structure.
Authentication uses [JWT tokens](30-auth/10-jwt-strategy.md) for session management.
```

### Implementation Links

When linking to how something works:

```markdown
Rate limiting is described in [middleware docs](../40-api/20-middleware/10-rate-limit.md).
The [workflow engine](10-core/10-workflow/20-engine.md) orchestrates task execution.
```

### Reference Links

When linking for additional context:

```markdown
Based on [domain-driven design principles](10-core/05-architecture-decisions.md).
Following [12-factor app methodology](60-infrastructure/10-deployment-philosophy.md).
```

---

## Navigation Blocks

### Overview Files

Every `00-overview.md` should list children with descriptions:

```markdown
## Child Nodes

### [10-models.md](10-models.md)
Entity definitions and validation rules. Covers data structure and relationships.

### [20-repository-pattern.md](20-repository-pattern.md)
Persistence abstraction layer. Defines data access methods and transactions.

### [30-migrations.md](30-migrations.md)
Schema evolution strategy. Explains versioning and rollback procedures.
```

### Cross-Layer Links

**L1 → L2** (Project to sections):
```markdown
- [10-core/](10-core/00-overview.md) - Business logic and workflow engine
- [20-data/](20-data/00-overview.md) - Persistence and data modeling
```

**L2 → L3** (Section to concepts):
```markdown
- [10-input-validation.md](10-input-validation.md) - Request sanitization
- [20-model-validation.md](20-model-validation.md) - Business rule enforcement
```

---

## Link Formatting

### Relative Paths

Within docs/, use relative paths:

```markdown
[../20-data/10-models.md](../20-data/10-models.md)
[30-subsection/10-topic.md](30-subsection/10-topic.md)
```

### External Links

For outside resources:

```markdown
Following [OWASP guidelines](https://owasp.org/www-project-cheat-sheets/).
Uses [PostgreSQL JSON operators](https://www.postgresql.org/docs/current/functions-json.html).
```

---

## Anti-Patterns

### ❌ Orphan Links
```markdown
[user-model.md](user-model.md)  # No context about what this is
```

### ❌ Missing Context
```markdown
For details, see [auth.md](auth.md).  # What details?
```

### ❌ Circular Dependencies
```markdown
File A: "See File B for complete explanation"
File B: "See File A for complete explanation"
```

### ❌ Upward Navigation
```markdown
- **Parent**: [Project Overview](../00-overview.md)
```
Links flow DOWN to children, not UP to parents.

### ❌ Cross-Cutting Sibling Links
```markdown
- [../other-section/some-file.md](../other-section/some-file.md)
```
Navigate via parent overviews instead.