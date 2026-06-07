---
covers: Generic template for L3 atomic documentation nodes.
concepts: [L3, doc-node, atomic-concept, architecture, code-references]
---

# L3 Concept Template

Template for atomic documentation nodes (L3). Each L3 node covers one complete concept or system with full context.

---

**Rule of Thumb:**
- An L3 node should cover one complete concept or system
- If describing a lifecycle, keep it in one file to preserve context
- Only split into a sub-folder if the content covers distinct, loosely coupled sub-systems

## Template

<template>

    ---
    covers: [List of topics/questions this file answers]
    concepts: [keyword1, keyword2, keyword3]
    depends-on: [path/to/prerequisite.md]  # Optional
    ---

    # [Title: Imperative, Specific]

    [1-2 sentence overview answering: What is this and why does it matter? This is the SKIM layer.]

    ---

    ## Context / Overview
    [High-level explanation of the problem or domain rule. Why does this exist?]

    ## Architecture / Flow
    [Optional: Mermaid diagram or text description of the data flow/lifecycle]

    ```mermaid
    sequenceDiagram
        participant A
        participant B
        A->>B: Action
    ```

    ## Key Data Models
    [Critical structures or state objects used here. Don't duplicate code,
    but explain the shape of data.]

    ```python
    class ExampleState:
        status: str
        metadata: dict
    ```

    ## Guidance / Rules
    - [Rule 1: Statement of fact]
    - [Rule 2: Constraint]

    ## Implementation Patterns
    [How to use this system. Provide code examples of the pattern in action.]

    ## Related Files
    - `src/...` - [Reason to look here]

</template>

## Usage Guidelines

### Opening Paragraph (SKIM Layer)
The first paragraph after frontmatter is critical. It should:
- Answer "What is this?" in one sentence
- Give enough context to decide whether to READ further
- Be scannable without diving into sections

### Writing Style
- Write in present tense and describe the current system state
- Use notes and diffs to infer truth, but do not narrate the update itself
- Avoid phrases like "now", "no longer", "previously", or "changed from" unless history is the topic of the document

### Handling Complexity
- If a topic is complex (e.g., "System Lifecycle"), prefer **one comprehensive file** over many fragmented files
- This allows both humans and AI to load the full context of the state machine or logic flow in one shot

### Visuals
Use Mermaid diagrams for:
- Sequence flows (interactions between components)
- State machines (lifecycle transitions)
- Class diagrams (data relationships)

### Data Models
- Include simplified versions of key Pydantic models or TypedDicts
- This gives the AI immediate understanding of the data shape without needing to read the definition file

### Using `depends-on`
Only include direct prerequisites — files that must be understood before this one makes sense. Don't list transitive dependencies.
