---
covers: Template for documenting backend services, microservices, or systems with request flows.
concepts: [L2, service, system, API, components, flow]
---

# Service/System Overview Template

Template for documenting backend services, microservices, or any system with clear request/response patterns. Emphasizes flow diagrams, components, and API endpoints.

---

## When to Use

- Backend services with API endpoints
- Microservices
- Systems with clear request → processing → response flows
- Any code that handles external requests

## Template

<template>

    ---
    covers: [Service name] — [one sentence describing what it does and who uses it]
    type: overview
    concepts: [service-name, api, components]
    ---

    # [Service Name]

    [One sentence: what this service does and its primary value. Who calls it? What problem does it solve?]

    ---

    ## Product Context

    [1-2 paragraphs on the business context. What user needs does this serve? How does it fit into the larger product?]

    ## Request Flow

    [ASCII or Mermaid diagram showing the happy path from request to response]

    ```
    ┌─────────────────────────────────────────────────────────────────┐
    │  1. REQUEST ARRIVES                                             │
    │     POST /api/v1/[endpoint]                                     │
    │     Request: { ... }                                            │
    └──────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  2. PROCESSING                                                  │
    │     - Validation                                                │
    │     - Business logic                                            │
    │     - Persistence                                               │
    └──────────────────────────────┬──────────────────────────────────┘
                                   │
                                   ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │  3. RESPONSE                                                    │
    │     Response: { ... }                                           │
    └─────────────────────────────────────────────────────────────────┘
    ```

    ## Architecture

    ### Component Diagram

    ```
    ┌─────────────────────────────────────────────────────────────────┐
    │                           API Layer                             │
    │                    [Endpoints and routing]                      │
    └──────────────────────────────┬──────────────────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
    ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │   [Component A]  │ │   [Component B]  │ │   [Component C]  │
    │                  │ │                  │ │                  │
    │   [Description]  │ │   [Description]  │ │   [Description]  │
    └──────────────────┘ └──────────────────┘ └──────────────────┘
    ```

    ### Core Principle
    [One key architectural principle, e.g., "Explicit state, no globals" or "All context flows through parameters"]

    ## Components

    ### [Component A]
    **Location**: `path/to/component.py`

    [2-3 sentences on what this component does and its key responsibilities.]

    ### [Component B]
    **Location**: `path/to/component.py`

    [2-3 sentences on what this component does and its key responsibilities.]

    ## API Endpoints

    | Endpoint | Method | Purpose |
    |----------|--------|---------|
    | `/api/v1/[resource]` | POST | [What it does] |
    | `/api/v1/[resource]` | GET | [What it does] |

    ## Directory Structure

    ```
    service_name/
    ├── __init__.py
    ├── api/                    API routes and request handling
    │   └── routes.py
    ├── core/                   Business logic
    │   ├── service.py
    │   └── models.py
    └── infrastructure/         External integrations
        └── database.py
    ```

    ## File Tree

    ```
    docs/20-implementation/XX-section/
    ├── 00-overview.md          (this file)
    ├── 10-[topic].md           [Description]
    └── 20-[topic].md           [Description]
    ```

    ## Contents

    ### [10-topic.md](10-topic.md)
    [What this document covers]

</template>

## Usage Guidelines

### Request Flow
Show the happy path. Use ASCII diagrams for portability. Include actual endpoint paths and request/response shapes when helpful.

### Component Diagram
Show how major pieces connect. Name actual classes/modules. Include brief descriptions inline.

### Components Section
Each component gets:
- **Location**: Actual file path
- **Description**: What it does, key responsibilities

### Directory Structure
Show the actual code directory layout. Brief inline descriptions.
