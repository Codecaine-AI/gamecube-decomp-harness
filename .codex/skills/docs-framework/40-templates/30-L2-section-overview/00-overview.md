---
covers: Templates for L2 Section Overviews — domain-level documentation with multiple archetypes.
type: overview
concepts: [templates, L2, section, overview, archetypes]
---

# L2 Section Overview Templates

Templates for L2 Section Overviews — the `00-overview.md` files within each major documentation section. These provide substantive mental models of a domain, not just navigation.

---

## Choosing an Archetype

Read the descriptions below and pick the template that best fits the code you're documenting. If none fit perfectly, use **10-generic.md** as a starting point or blend elements from multiple archetypes.

| Archetype | Use When Documenting... |
|-----------|-------------------------|
| **10-generic.md** | General sections that don't fit other patterns |
| **20-service-system.md** | Backend services, microservices, APIs with request flows |
| **30-domain-module.md** | Bounded contexts with business rules (Auth, Billing, Orders) |
| **40-library-package.md** | Reusable utilities, SDKs, shared code with public APIs |
| **50-data-layer.md** | Database models, repositories, persistence logic |
| **60-infrastructure.md** | DevOps, deployment, CI/CD, environments |
| **70-pipeline-workflow.md** | ETL, event processing, job queues, multi-stage flows |

## File Tree

```
30-L2-section-overview/
├── 00-overview.md           (this file)
├── 10-generic.md            Basic section overview
├── 20-service-system.md     Services with APIs and flows
├── 30-domain-module.md      Business logic domains
├── 40-library-package.md    Reusable code with public API
├── 50-data-layer.md         Models and persistence
├── 60-infrastructure.md     Deployment and operations
└── 70-pipeline-workflow.md  Processing chains
```

## Archetypes

### [10-generic.md](10-generic.md)
**Basic section overview.** File tree, scope, and child descriptions. Use when the domain doesn't fit other archetypes or when starting a new section you'll refine later.

### [20-service-system.md](20-service-system.md)
**Services with request flows, components, and APIs.** Includes conversation/request flow diagrams, component architecture, API endpoints, and directory structure. Best for backend services, microservices, or any system with clear request/response patterns.

### [30-domain-module.md](30-domain-module.md)
**Bounded contexts with business rules.** Includes core concepts, state transitions, business rules, and key types. Best for domains like Authentication, Payments, Orders — areas with complex business logic.

### [40-library-package.md](40-library-package.md)
**Reusable code with public API surface.** Includes API overview, usage patterns, extension points, and examples. Best for shared utilities, SDKs, or any code designed for reuse.

### [50-data-layer.md](50-data-layer.md)
**Models, relationships, and persistence.** Includes entity relationships, query patterns, migrations, and constraints. Best for database models, repositories, or data access layers.

### [60-infrastructure.md](60-infrastructure.md)
**Deployment, environments, and operations.** Includes environment topology, deployment pipeline, monitoring, and scaling. Best for DevOps, CI/CD, or infrastructure-as-code documentation.

### [70-pipeline-workflow.md](70-pipeline-workflow.md)
**Multi-stage processing flows.** Includes pipeline stages, data transformations, error handling, and retry logic. Best for ETL, event processing, job queues, or any multi-step data flow.

---

## Philosophy: The Overview as Abstract

Think of L2 overviews like **chapter abstracts** or **paper abstracts**. (See [10-philosophy.md](../../00-reference/10-philosophy.md#the-overview-as-abstract) for the full philosophy.)

Before reading a chapter, you read the abstract. It gives you:
- The problem being addressed
- The approach taken
- Key components or findings
- What you'll learn by reading further

After reading it, you have a mental model. The details you encounter later slot into a framework you already hold.

**L2 overviews serve the same purpose.** After reading an L2 overview, you should be able to:

1. Explain the domain to a colleague
2. Understand what you'll find if you go deeper
3. Know the key concepts and their relationships
4. Decide whether this is the section you need

**Navigation is a side effect, not the goal.** The goal is comprehension at that level. Child documents exist for depth, not for initial understanding.

This is why the archetypes below include flows, components, and concepts — not just file lists. A file list is a table of contents. An overview is an abstract.
