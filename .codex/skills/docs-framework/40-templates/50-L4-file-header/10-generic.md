# L4 Code Header Template

Template for top-of-code-file headers that describe the "What" — file responsibilities, dependencies, and public API.

**Selection Strategy:**
- Use **Mode A (Component)** for classes/modules that provide multiple capabilities (Services, Utils).
- Use **Mode B (Process)** for files that execute a specific linear task (Scripts, Routers, Entry Points).

## Mode A: The Component (Default)

Use this when the file is a container for logic (e.g., `UserService`, `MathUtils`).

<template>

    File: src/<path>/<file>.<ext>

    [Brief description of what this component manages/represents.]

    Responsibilities:
    - [Responsibility 1]
    - [Responsibility 2]

    Shared State / Dependencies:
    - [Database connections, external services, or internal state managed here]

    Contracts & Invariants:
    - [Rules that apply to ALL methods in this file]

    Error Semantics:
    - [General error handling strategy for this component]

    Public API:
    - [List of methods]

</template>

## Mode B: The Process / Script

Use this when the file represents a specific flow (e.g., `make_call.py`, `run_migration.py`).
This moves the "Flow" to the top (L4) because the file *is* the flow.

<template>

    File: src/<path>/<file>.<ext>

    Responsibilities:
    [Brief description of the process initiated here.]

    Request Flow / Execution Steps:
    1. [Step 1: e.g., Validate inputs]
    2. [Step 2: e.g., Check Cache]
       - [Detail about cache strategy]
    3. [Step 3: e.g., Execute Logic]
    4. [Step 4: e.g., Return Response]

    Inputs:
    - [Data required to start the process]

    Outputs:
    - [Final result or side effects]

    Key Dependencies:
    - [Services used during the flow]

</template>

## Usage Guidelines

### The "Search Cost" Rule

If a developer (or AI) opens this file, what are they looking for?
- If they are looking for **how a specific feature works** (e.g., "How does the make_call endpoint work?"), put the flow in the **L4 Header** (Mode B).
- If they are looking for **a tool to use** (e.g., "I need to format a date"), keep the L4 Header light (Mode A) and put the details in the **L5 Docstrings**.

### Length Constraints

- Target: 30-50 lines.
- If a "Process" header gets too long, summarize the high-level steps in L4 and delegate the nitty-gritty details to the main function's L5 docstring.

### The L4/L5 Handshake

- **If the L4 File Header described the flow (Mode B):** You can keep the L5 docstring brief.
  - *Example:* "Implements step 3 of the request flow defined in file header."
- **If the L4 File Header is generic (Mode A):** The L5 docstring MUST describe the logic flow.
  - *Example:* A `calculate_shipping` method in a generic `ShippingService` needs a detailed "Logic" section in its docstring explaining the algorithm.
