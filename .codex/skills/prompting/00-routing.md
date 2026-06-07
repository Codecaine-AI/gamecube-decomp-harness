---
covers: Top-level routing between system prompts and input formatters
type: routing
concepts: [routing, system-prompt, input-formatter, programmatic-llm]
---

# Routing

Every artifact this skill produces is one of two things:

- A **system prompt** — durable instructions sent in the system message of an LLM call.
- An **input formatter** — code that converts runtime data into the user message paired with that system prompt.

Most real systems need both. The system prompt defines behavior; the formatter assembles the data the prompt operates on.

## Execution Model

```text
system prompt + formatted inputs -> completion
```

The skill assumes a programmatic call: code constructs both messages, sends them to the model, and processes the response. Desktop-app prompting (a human typing into Claude.ai) is out of scope.

## Decision

```text
What are you producing?
│
├─ A static instruction artifact (the durable behavior)
│  → SYSTEM PROMPT
│  → 10-system-prompts/00-overview.md picks the type
│
├─ Code that assembles runtime data into a message
│  → INPUT FORMATTER
│  → 20-inputs/00-overview.md
│
└─ Both
   → Draft the system prompt first, then the formatter that feeds it.
   → The system prompt's <inputs> block is the formatter's output contract.
```

## When to Use Each

**System prompt only** — the prompt operates on a fixed input embedded in the system message itself, or the runtime input is so simple that no assembly logic is needed.

**Input formatter only** — you already have a working system prompt and only need to shape data for it. Rare in practice; usually means the system prompt was written elsewhere.

**Both** — typical case. The system prompt declares what runtime variables it expects; the formatter fills them.

## Order of Work

1. Pick the system prompt type (`10-system-prompts/00-overview.md`).
2. Draft the system prompt, including its `<inputs>` declaration.
3. Build the formatter against that input contract (`20-inputs/`).
4. While drafting either, draw from `30-generation/` for formatting rules, techniques, anti-patterns, and the evaluation loop.
5. Run the evaluation protocol before delivering.
