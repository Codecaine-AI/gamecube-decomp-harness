---
covers: Template for documenting ETL, event processing, or multi-stage workflows.
concepts: [L2, pipeline, workflow, ETL, events, processing]
---

# Pipeline/Workflow Overview Template

Template for documenting multi-stage processing flows — ETL pipelines, event processing, job queues, or any system with sequential data transformations. Emphasizes stages, data flow, and error handling.

---

## When to Use

- ETL pipelines
- Event processing systems
- Job queues and workers
- Multi-stage data transformations
- Batch processing workflows

## Template

<template>

    ---
    covers: [Pipeline name] — [one sentence describing what it processes]
    type: overview
    concepts: [pipeline, workflow, processing]
    ---

    # [Pipeline Name]

    [One sentence: what this pipeline processes and why. What goes in? What comes out?]

    ---

    ## Overview

    [1-2 paragraphs on the pipeline's purpose. What business need does it serve? What would break if it stopped running?]

    ## Pipeline Flow

    ```
    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
    │   SOURCE    │───►│   STAGE 1   │───►│   STAGE 2   │───►│   STAGE 3   │
    │             │    │  [Action]   │    │  [Action]   │    │  [Action]   │
    │  [Input]    │    │             │    │             │    │             │
    └─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                    │
                                                             ┌──────▼──────┐
                                                             │    SINK     │
                                                             │  [Output]   │
                                                             └─────────────┘
    ```

    ## Stages

    ### 1. [Stage Name: e.g., Ingestion]

    **Input**: [What this stage receives]
    **Output**: [What this stage produces]
    **Location**: `path/to/stage.py`

    [2-3 sentences on what this stage does and any important logic]

    **Transformations:**
    - [Transform 1]
    - [Transform 2]

    ### 2. [Stage Name: e.g., Enrichment]

    **Input**: [What this stage receives]
    **Output**: [What this stage produces]
    **Location**: `path/to/stage.py`

    [Description of this stage]

    ### 3. [Stage Name: e.g., Load]

    **Input**: [What this stage receives]
    **Output**: [Where data ends up]
    **Location**: `path/to/stage.py`

    [Description of this stage]

    ## Data Schema

    ### Input Format

    ```json
    {
      "field_a": "string",
      "field_b": 123,
      "nested": {
        "field_c": true
      }
    }
    ```

    ### Output Format

    ```json
    {
      "transformed_field": "value",
      "enriched_data": { }
    }
    ```

    ## Error Handling

    ### Retry Strategy

    | Error Type | Retries | Backoff | Dead Letter |
    |------------|---------|---------|-------------|
    | Transient (network) | 3 | Exponential | No |
    | Validation | 0 | — | Yes |
    | Processing | 1 | Fixed 30s | Yes |

    ### Dead Letter Queue

    - Location: [Queue name or path]
    - Monitoring: [How to check DLQ]
    - Recovery: [How to reprocess failed items]

    ## Triggers

    | Trigger | Schedule/Event | Notes |
    |---------|----------------|-------|
    | Scheduled | `0 * * * *` (hourly) | Main processing |
    | Event | `order.created` | Real-time updates |
    | Manual | `./run_pipeline.sh` | Backfill |

    ## Monitoring

    ### Key Metrics

    | Metric | Normal | Alert Threshold |
    |--------|--------|-----------------|
    | Items processed/hr | ~1000 | < 500 |
    | Processing time P95 | < 5s | > 30s |
    | Error rate | < 1% | > 5% |

    ### Dashboards

    - [Link to processing dashboard]
    - [Link to error dashboard]

    ## File Tree

    ```
    docs/20-implementation/XX-pipeline/
    ├── 00-overview.md          (this file)
    ├── 10-[stages].md          Stage documentation
    ├── 20-[schemas].md         Data schemas
    └── 30-[operations].md      Operational procedures
    ```

    ## Contents

    ### [10-stages.md](10-stages.md)
    [What this document covers]

</template>

## Usage Guidelines

### Pipeline Flow
Show the high-level flow with stages. Include source and sink.

### Stages
Document each stage with:
- Input/Output
- Location in code
- Key transformations

### Data Schema
Show actual input and output formats. This is critical for understanding what the pipeline does.

### Error Handling
Document retry strategy and dead letter handling. Include how to recover failed items.

### Monitoring
Document what to monitor and alerting thresholds.
