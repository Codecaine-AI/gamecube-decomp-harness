---
covers: Generic template for L2 Section Overviews.
concepts: [L2, section, overview, generic, navigation]
---

# Generic Section Overview Template

Basic template for `00-overview.md` files. Use when the section doesn't fit a more specific archetype, or as a starting point to refine later.

---

## Template

<template>

    ---
    covers: [One sentence describing this section's scope and what it contains]
    type: overview
    concepts: [keyword1, keyword2, keyword3]
    ---

    # [Section Name]

    [One sentence describing this section's purpose and what questions it answers. This is the SKIM layer — an agent should know if this section is relevant after reading just this line.]

    ---

    ## What This Section Covers

    [1-2 paragraphs explaining the domain. What problem space does this address? How does it fit into the larger system? What are the key responsibilities?]

    ## Key Concepts

    | Concept | Description |
    |---------|-------------|
    | [Concept 1] | [Brief explanation] |
    | [Concept 2] | [Brief explanation] |
    | [Concept 3] | [Brief explanation] |

    ## File Tree

    ```
    XX-section-name/
    ├── 00-overview.md              (this file)
    ├── 10-first-topic.md           Brief description
    ├── 20-second-topic.md          Brief description
    └── 30-subsection/              Topic area
        └── 00-overview.md
    ```

    ## Contents

    ### [10-first-topic.md](10-first-topic.md)
    [1-2 sentences explaining what this document covers and when you'd read it.]

    ### [20-second-topic.md](20-second-topic.md)
    [1-2 sentences explaining what this document covers and when you'd read it.]

    ### [30-subsection/](30-subsection/00-overview.md)
    [1-2 sentences explaining what this subsection covers.]

</template>

## Usage Guidelines

### Opening Paragraph
Single sentence that answers "What is this section about?" This is the SKIM layer — an agent should know if this section is relevant without reading further.

### Writing Style
Describe the section as it exists today. Use implementation notes to identify what is true, but do not write the overview as a narrative about what changed. Avoid phrases like "now", "no longer", "previously", or "instead of" unless the section is explicitly documenting migration or version history.

### What This Section Covers
Provide enough context that someone understands the domain. Don't just say "handles authentication" — explain what that means in this system.

### Key Concepts
A quick reference table for the main terms or ideas in this domain. Helps readers orient before diving into child documents.

### File Tree
Shows immediate children only. Include brief descriptions (3-5 words) for each item.

### Contents
For each child, provide a link and 1-2 sentences explaining what it contains and when someone would read it.
