---
covers: Template for documenting deployment, environments, and infrastructure.
concepts: [L2, infrastructure, deployment, devops, environments, monitoring]
---

# Infrastructure Overview Template

Template for documenting infrastructure concerns — deployment pipelines, environments, monitoring, and operations. Emphasizes topology, pipelines, and operational procedures.

---

## When to Use

- DevOps documentation
- Deployment pipelines (CI/CD)
- Environment configuration
- Infrastructure as code
- Monitoring and alerting

## Template

<template>

    ---
    covers: [Infrastructure area] — [one sentence describing what it manages]
    type: overview
    concepts: [infrastructure, deployment, environments]
    ---

    # [Infrastructure Area]

    [One sentence: what infrastructure this covers and its purpose.]

    ---

    ## Overview

    [1-2 paragraphs on the infrastructure philosophy. Cloud provider? Container orchestration? Key operational principles?]

    ## Environment Topology

    ```
    ┌─────────────────────────────────────────────────────────────────┐
    │                         PRODUCTION                              │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
    │  │   Service   │  │   Service   │  │  Database   │            │
    │  │   Replica   │  │   Replica   │  │  Primary    │            │
    │  └─────────────┘  └─────────────┘  └──────┬──────┘            │
    │                                           │                    │
    │                                    ┌──────▼──────┐            │
    │                                    │  Database   │            │
    │                                    │  Replica    │            │
    │                                    └─────────────┘            │
    └─────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │                          STAGING                                │
    │  [Similar but smaller topology]                                 │
    └─────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────────────┐
    │                        DEVELOPMENT                              │
    │  [Local or minimal cloud setup]                                 │
    └─────────────────────────────────────────────────────────────────┘
    ```

    ## Environments

    | Environment | Purpose | URL | Notes |
    |-------------|---------|-----|-------|
    | Production | Live traffic | `https://app.example.com` | Auto-scaled |
    | Staging | Pre-prod testing | `https://staging.example.com` | Mirrors prod |
    | Development | Local dev | `http://localhost:8000` | Docker Compose |

    ## Deployment Pipeline

    ```
    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │  Push   │───►│  Build  │───►│  Test   │───►│ Deploy  │───►│ Verify  │
    │         │    │         │    │         │    │ Staging │    │         │
    └─────────┘    └─────────┘    └─────────┘    └────┬────┘    └─────────┘
                                                      │
                                           ┌──────────▼──────────┐
                                           │   Manual Approval   │
                                           └──────────┬──────────┘
                                                      │
                                               ┌──────▼──────┐
                                               │   Deploy    │
                                               │   Prod      │
                                               └─────────────┘
    ```

    **Pipeline Stages:**
    1. **Build**: [What happens]
    2. **Test**: [What's tested]
    3. **Deploy Staging**: [How it works]
    4. **Verify**: [What verification happens]
    5. **Deploy Prod**: [Release process]

    ## Key Configuration

    ### Environment Variables

    | Variable | Environment | Description |
    |----------|-------------|-------------|
    | `DATABASE_URL` | All | Database connection string |
    | `API_KEY` | Prod/Staging | External service API key |

    ### Secrets Management

    [How secrets are stored and accessed — e.g., AWS Secrets Manager, Vault, etc.]

    ## Monitoring & Alerting

    ### Key Metrics

    | Metric | Warning | Critical | Dashboard |
    |--------|---------|----------|-----------|
    | Response time P95 | > 500ms | > 1s | [Link] |
    | Error rate | > 1% | > 5% | [Link] |

    ### Alerting

    - Alerts go to: [Channel/PagerDuty/etc.]
    - Runbooks: [Link to runbooks]

    ## Operational Procedures

    ### Deploying a Hotfix

    1. [Step 1]
    2. [Step 2]
    3. [Step 3]

    ### Rolling Back

    1. [Step 1]
    2. [Step 2]

    ## File Tree

    ```
    docs/20-implementation/XX-infra/
    ├── 00-overview.md          (this file)
    ├── 10-[environments].md    Environment details
    ├── 20-[pipeline].md        CI/CD documentation
    └── 30-[runbooks].md        Operational procedures
    ```

    ## Contents

    ### [10-environments.md](10-environments.md)
    [What this document covers]

</template>

## Usage Guidelines

### Environment Topology
Show the actual infrastructure layout. Include key components and their relationships.

### Deployment Pipeline
Diagram the pipeline with stages. Include approval gates and manual steps.

### Monitoring
Document what's monitored and alerting thresholds. Link to dashboards.

### Operational Procedures
Include step-by-step runbooks for common operations (deploy, rollback, incident response).
