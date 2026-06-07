---
covers: How to add the documentation framework to your project using drag-and-drop.
concepts: [setup, installation, drag-and-drop, initialization]
---

# Setup Guide

Simple drag-and-drop installation — copy the framework to your project, run `/docs:init`, and start documenting. No scripts, no symlinks.

---

## Prerequisites

- A project you want to document
- Claude Code (for agents, skills, and commands)

## Installation: Drag and Drop

This framework uses a simple copy-and-paste workflow. No install scripts. No symlinks.

### Step 1: Copy the Framework

Copy these folders from the docs-framework repository to your project:

| Source | Destination | Purpose |
|--------|-------------|---------|
| `.claude/skills/docs-framework/` | `.claude/skills/docs-framework/` | documentation framework (skill, templates, workflows) |
| `.claude/commands/docs/` | `.claude/commands/docs/` | docs commands |

That's it. You're done with installation.

### Step 2: Initialize Your Documentation

In Claude Code, run:

```
/docs:init
```

This creates your `docs/` directory with the three-layer structure:

```
docs/
├── 00-foundation/           # Why/purpose (freeform)
│   └── 00-overview.md       # Placeholder until interview
├── 10-system-design/        # Product structure and behavior
│   └── 00-overview.md       # System design overview
├── 20-implementation/       # Code-specific mechanics
│   └── 00-overview.md       # Implementation overview
└── .drafts/                 # Working directory for interviews
```

### Step 3: Run the Foundation Interview

**This is the critical step.** The Foundation interview explores what you're building and why.

Run:
```
/docs:interview-foundation
```

This is a curious, exploratory conversation—not a checklist. The agent will explore:
- What is this trying to BE?
- What should it do extremely well?
- How do you think about this problem?
- What would feel "right" vs. "wrong"?

Structure emerges from the conversation. You might end up with:
- Problem-focused docs (problem.md, landscape.md, approach.md)
- Vision-focused docs (vision.md, constraints.md, direction.md)
- Thinking-focused docs (context.md, ideas.md, decisions.md)
- A single narrative document
- Or something else entirely

After the interview, run `/docs:write foundation` to generate the docs.

### Step 4: Write Your Implementation Overview

Edit `docs/20-implementation/00-overview.md` to describe your codebase:
- System metaphor / mental model
- High-level architecture
- Section index (as you add sections)

## Directory Structure After Setup

```
your-project/
├── docs/                # YOUR project documentation
│   ├── 00-foundation/       # Why/purpose (structure varies)
│   ├── 10-system-design/    # Product structure and behavior
│   └── 20-implementation/   # Code-specific mechanics
└── .claude/
    ├── skills/docs-framework/         # documentation framework (skill, templates, workflows)
    └── commands/docs/       # docs commands
```

## One Framework, One Output

| Directory | Contains | Managed By |
|-----------|----------|------------|
| `.claude/skills/docs-framework/` | documentation framework (skill, templates, workflows, rules) | docs-framework project |
| `docs/` | YOUR project documentation | You |

**Important:** Don't edit files in `.claude/skills/docs-framework/`—those are framework files. All your project documentation goes in `docs/`.

## Adding Sections to Implementation

For each major domain in your codebase, create a section inside `20-implementation/`:

```
docs/
├── 00-foundation/
│   └── ...
├── 10-system-design/
│   └── 00-overview.md
├── 20-implementation/
│   ├── 00-overview.md
│   ├── 10-authentication/
│   │   ├── 00-overview.md
│   │   └── 10-session-management.md
│   ├── 20-api/
│   │   └── 00-overview.md
│   └── 30-data/
│       └── 00-overview.md
```

## Updating the Framework

To update the framework, copy the new `.claude/skills/docs-framework/` and `.claude/commands/docs/` folders over the old ones.

## Available Commands

### Setup & Structure
- **`/docs:init`** - Initialize `docs/` with three-layer structure
- **`/docs:scaffold`** - Generate section structure from source code

### Knowledge Extraction
- **`/docs:interview-foundation`** - Explore understanding through curious dialogue
- **`/docs:interview-codebase <path>`** - Extract understanding of a specific code area through interactive conversation

### Documentation Generation
- **`/docs:write <section>`** - Generate documentation from interview notes

### Code Annotation
- **`/docs:annotate <path>`** - Add L4 file headers and L5 function docstrings to source code

### Maintenance
- **`/docs:audit`** - Check your documentation for structural issues and semantic drift
- **`/docs:sync`** - Compare code structure to documentation and identify gaps

## Troubleshooting

### Skills/commands not appearing in Claude Code

Ensure `.claude/` is at your project root and contains the `docs-framework/` and `docs/` folders. Restart Claude Code if needed.

### "docs/ already exists"

The `/docs:init` command validates existing structure rather than overwriting. Run `/docs:audit` to check the health of existing documentation.

