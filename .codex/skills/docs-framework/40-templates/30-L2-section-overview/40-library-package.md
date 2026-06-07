---
covers: Template for documenting reusable libraries, SDKs, or shared utilities.
concepts: [L2, library, package, SDK, API, utilities]
---

# Library/Package Overview Template

Template for documenting reusable code — shared utilities, SDKs, or any code designed for consumption by other parts of the system. Emphasizes public API, usage patterns, and examples.

---

## When to Use

- Shared utility libraries
- Internal SDKs
- Reusable packages
- Any code with a defined "consumer" audience

## Template

<template>

    ---
    covers: [Library name] — [one sentence describing what it provides]
    type: overview
    concepts: [library-name, utilities, api]
    ---

    # [Library Name]

    [One sentence: what this library provides and who uses it. What problem does it solve for consumers?]

    ---

    ## Purpose

    [1-2 paragraphs on why this library exists. What pain does it eliminate? What would consumers have to do without it?]

    ## Quick Start

    ```python
    # Minimal example showing the most common use case
    from library import Thing

    thing = Thing()
    result = thing.do_something()
    ```

    ## Public API

    ### Core Classes/Functions

    | Name | Purpose |
    |------|---------|
    | `ClassName` | [What it does] |
    | `function_name()` | [What it does] |

    ### [ClassName]

    [2-3 sentences on what this class does and when to use it]

    ```python
    # Basic usage
    instance = ClassName(config)
    result = instance.method()
    ```

    **Key Methods:**
    - `method_a()`: [What it does]
    - `method_b()`: [What it does]

    ### [function_name()]

    [1-2 sentences on what this function does]

    ```python
    result = function_name(arg1, arg2)
    ```

    ## Usage Patterns

    ### Pattern: [Common Use Case 1]

    [When you'd use this pattern]

    ```python
    # Example code
    ```

    ### Pattern: [Common Use Case 2]

    [When you'd use this pattern]

    ```python
    # Example code
    ```

    ## Extension Points

    [If the library is designed for extension, explain how]

    ### Custom [Component]

    ```python
    class MyCustomThing(BaseThing):
        def custom_method(self):
            # Your implementation
            pass
    ```

    ## Configuration

    | Option | Type | Default | Description |
    |--------|------|---------|-------------|
    | `option_a` | str | `"default"` | [What it controls] |
    | `option_b` | bool | `True` | [What it controls] |

    ## File Tree

    ```
    docs/20-implementation/XX-library/
    ├── 00-overview.md          (this file)
    ├── 10-[api-reference].md   Detailed API docs
    ├── 20-[patterns].md        Usage patterns
    └── 30-[extending].md       Extension guide
    ```

    ## Contents

    ### [10-api-reference.md](10-api-reference.md)
    [What this document covers]

</template>

## Usage Guidelines

### Quick Start
Show the minimal code to get value from the library. This should be copy-pasteable and work.

### Public API
Document the intended public interface. Don't document internal implementation details.

### Usage Patterns
Show common use cases with complete, working examples. Name the pattern so consumers can find what they need.

### Extension Points
If the library is designed for extension, show how. Include a minimal working example.
