# Advisor Copilot Service Architecture

## Overview

This document describes the **Advisor Copilot Service**, a unified LLM-powered assistant designed specifically for financial advisors managing client households.

### Product Vision

The Advisor Copilot acts as a **virtual assistant / executive assistant** for financial advisors:
- Advisor selects a household from the UI before starting a conversation
- Each conversation is scoped to that specific household
- The assistant helps with daily tasks: preparing for meetings, reviewing allocations, summarizing client history, answering questions about holdings, etc.
- Can also fetch market data, render charts, and provide research on tickers relevant to the household

### Conversation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. ADVISOR SELECTS HOUSEHOLD                                               │
│     UI shows list of households → advisor picks one                         │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. CREATE CONVERSATION                                                     │
│     POST /copilot/conversations                                             │
│     Request: { household_id }                                               │
│     Response: { conversation_id, household_id, created_at }                 │
│                                                                             │
│     Creates a new conversation record tied to:                              │
│     • advisor_id (from auth token)                                          │
│     • household_id (from request)                                           │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. FIRST MESSAGE                                                           │
│     POST /copilot/chat/stream                                               │
│     Request: { conversation_id, message }                                   │
│                                                                             │
│     Server:                                                                 │
│     a) Loads conversation (gets household_id from record)                   │
│     b) Validates advisor owns the conversation                              │
│     c) Queues background task to generate conversation title                │
│     d) Processes message through agent loop                                 │
│     e) Streams response (persists messages to DB)                           │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. SUBSEQUENT MESSAGES                                                     │
│     POST /copilot/chat/stream                                               │
│     Request: { conversation_id, message }                                   │
│                                                                             │
│     Server:                                                                 │
│     • Loads conversation + message history from DB                          │
│     • Appends new user message                                              │
│     • Analyzes query, loads context, runs agent loop                        │
│     • Streams response (persists to DB)                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- `conversation_id` is the primary identifier for the chat thread
- Each conversation is scoped to exactly one `household_id` (set at creation)
- Frontend only sends the new message; server loads history from DB
- Title generation is the only background task (async, non-blocking)

---

## Architecture

### Core Principle: Explicit State, No Globals

All context flows through explicit parameters, not class-level globals.

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API Layer                                       │
│                    POST /api/v1/copilot/chat/stream                          │
│                                                                              │
│  Request: {                                                                  │
│    conversation_id: UUID,                                                    │
│    message: string           # Just the new user message                     │
│  }                                                                           │
│                                                                              │
│  Server loads: conversation → household_id, message history from DB          │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AdvisorCopilotSession                                │
│                                                                              │
│  @dataclass                                                                  │
│  class AdvisorCopilotSession:                                                │
│      advisor_id: UUID          # Who is using the system                     │
│      household_id: UUID        # Which household they're working with        │
│      conversation_id: UUID     # Which conversation thread                   │
│      db: AsyncSession          # Database connection                         │
│      model: str                # LLM model to use                            │
│                                                                              │
│  Methods:                                                                    │
│      async def initialize() -> None                                          │
│      async def stream(messages) -> AsyncGenerator[str, None]                 │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
              ▼                       ▼                       ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐
│   ContextManager    │  │    ToolRegistry     │  │   ChatPersistence       │
│                     │  │                     │  │                         │
│ Providers:          │  │ Market Tools:       │  │ Hooks:                  │
│ • Household         │  │ • get_ticker_info   │  │ • save_incoming_msgs    │
│ • IPS               │  │ • get_fundamentals  │  │ • on_tool_call          │
│ • Holdings          │  │ • get_news          │  │ • on_tool_result        │
│ • Tasks             │  │ • etc...            │  │ • on_text               │
│ • Documents         │  │                     │  │ • on_end                │
│                     │  │ Household Tools:    │  │                         │
│ Query Analysis:     │  │ • compare_to_ips    │  │ Uses:                   │
│ • QueryAnalyzer     │  │ • get_holdings      │  │ • PersistenceQueue      │
│                     │  │ • create_task       │  │ • async non-blocking    │
│                     │  │ • search_documents  │  │                         │
└─────────────────────┘  └─────────────────────┘  └─────────────────────────┘
              │                       │
              └───────────┬───────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AgentLoop                                       │
│                                                                              │
│  A simple, readable generator:                                               │
│                                                                              │
│  async def run_agent_loop(session, messages) -> AsyncGenerator:              │
│      # 1. Analyze query to determine needed context                          │
│      analysis = await context_manager.analyze_query(last_user_message)       │
│                                                                              │
│      # 2. Load required context                                              │
│      await context_manager.load_for_analysis(analysis)                       │
│                                                                              │
│      # 3. Build context block                                                │
│      context_block = context_manager.render(analysis)                        │
│                                                                              │
│      # 4. Assemble messages                                                  │
│      full_messages = build_messages(system_prompt, context_block, messages)  │
│                                                                              │
│      # 5. Tool loop                                                          │
│      while iteration < max_iterations:                                       │
│          response = await llm.call(full_messages, tools)                     │
│                                                                              │
│          if no tool_calls:                                                   │
│              # Stream final response                                         │
│              async for chunk in llm.stream(full_messages):                   │
│                  yield format_chunk(chunk)                                   │
│              return                                                          │
│                                                                              │
│          # Execute tools                                                     │
│          for tool_call in tool_calls:                                        │
│              result = await execute_tool(tool_call, session)                 │
│              full_messages.append(tool_result_message(result))               │
│              yield format_tool_event(tool_call, result)                      │
│                                                                              │
│          iteration += 1                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         StreamProtocol (Vercel AI SDK)                       │
│                                                                              │
│  Formats output for frontend:                                                │
│  • 0:"text chunk"           - Text content                                   │
│  • 9:{toolCallId, ...}      - Tool call start                                │
│  • a:{toolCallId, result}   - Tool call result                               │
│  • 2:[{event: data}]        - Custom events (thinking, reasoning)            │
│  • e:{finishReason, usage}  - End marker                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Components

### AdvisorCopilotSession

**Location**: `advisor_copilot/agent/session.py`

A request-scoped container that holds references to components needed for a single request. Created fresh per request; does not hold message history (server loads from DB).

Key fields: `advisor_id`, `household_id`, `conversation_id`, `db`, `model`

### ContextManager

**Location**: `advisor_copilot/context/manager.py`

Orchestrates context providers to load household data based on query analysis. Providers include: `household`, `ips`, `holdings`, `tasks`, `documents`.

### ToolRegistry

**Location**: `advisor_copilot/tools/registry.py`

Manages available tools via a `@tool()` decorator pattern.

**Market Tools** (14 tools): `get_ticker_info`, `get_ticker_fundamentals`, `get_ticker_news`, `get_all_ticker_news`, `get_ticker_info_bulk`, `get_insider_trades`, `get_darkpool_trades`, `get_congress_trades`, `get_institution_ownership`, `get_historical_options`, `get_etf_holdings`, `get_etf_list`, `get_quartr_earnings`, `search_tickers`

**Household Tools** (4 tools): `get_household_holdings`, `compare_to_ips`, `search_documents`, `create_task`

### AgentLoop

**Location**: `advisor_copilot/agent/loop.py`

Mirascope-based agent loop using `@llm.call` decorator with streaming and tools. Implements a recursive step pattern: stream response, execute any tool calls, append results to history, repeat until no more tools.

### API Routes

**Location**: `api/v1/routes/copilot/route.py`

- `POST /copilot/conversations` - Create a new conversation for a household
- `POST /copilot/chat/stream` - Stream a chat response (request: `{ conversation_id, message }`)

---

## Directory Structure

```
services/advisor_copilot/
├── __init__.py                 # Main exports
├── types.py                    # ChatRequest, ChatMessage models
│
├── agent/                      # Core agent logic
│   ├── __init__.py
│   ├── session.py              # AdvisorCopilotSession (request-scoped container)
│   ├── user_prompt_builder.py  # UserPromptBuilder - injects context into user messages
│   ├── loop.py                 # Mirascope-based agent loop
│   └── system_prompt.md        # System prompt template
│
├── conversation_title/         # Conversation title generation
│   ├── __init__.py
│   └── generator.py            # generate_conversation_title() with @llm.call
│
├── context/                    # Household context system
│   ├── __init__.py
│   ├── manager.py              # ContextManager - orchestrates providers
│   ├── base.py                 # ContextProviderBase abstract class
│   ├── analyzer.py             # QueryAnalyzer - determines needed context
│   ├── providers/              # HouseholdContextProvider, IPSContextProvider, etc.
│   └── models/                 # Pydantic models for context data
│
├── stream/                     # Streaming infrastructure
│   ├── __init__.py
│   ├── base.py                 # AbstractStreamProtocol
│   ├── vercel.py               # StreamVercel - Vercel AI SDK protocol
│   ├── persistence.py          # ChatPersistence - message persistence hooks
│   └── queue.py                # PersistenceQueue - async non-blocking DB writes
│
└── tools/                      # Tool system
    ├── __init__.py
    ├── registry.py             # ToolRegistry, @tool decorator
    ├── market/                 # 14 market research tools
    └── household/              # Household-aware tools (4 tools)

api/v1/routes/copilot/
├── __init__.py
├── route.py                    # POST /copilot/conversations, POST /copilot/chat/stream
└── utils.py                    # Validation helpers
```

### Design Principles

- **Vertical slices**: Each capability (agent, conversation_title, etc.) has code + prompts together
- **Explicit state**: All context flows through parameters, no globals
- **Mirascope everywhere**: All LLM calls use the `@llm.call` decorator pattern
