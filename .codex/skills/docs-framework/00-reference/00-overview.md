---
covers: Background theory and philosophy — why this framework exists and how it's architected.
type: overview
concepts: [reference, philosophy, architecture, progressive-disclosure, shared-bridge]
---

# Reference

Background theory and philosophy.

This section explains the "why" behind the framework:
- The problem it solves (context, not intelligence)
- The vision it pursues (documentation as the durable artifact)
- The architectural model that enables it (progressive disclosure)

---

## Contents

### [10-philosophy.md](10-philosophy.md)
The problem and the vision. Why documentation is the source of truth:
- The context problem (agents start fresh every invocation)
- The mental model (car repair manuals, Factorio's modular systems)
- Code as lossy projection of intent
- Documentation as the durable artifact; code as current projection

### [20-architecture.md](20-architecture.md)
How we build it. The shared communication bridge between humans and agents:
- Progressive disclosure as the core organizing principle
- What makes it work (vertical slices, clear boundaries, overviews at every level)
- The implementation (three zones, six layers, navigation pattern)
