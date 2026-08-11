---
url: "https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/"
title: "Build a Two-Agent Coding System with Claude and Daytona | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#_top)

# Build a Two-Agent Coding System with Claude and Daytona

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox.md)Open

This guide demonstrates how to run a two-agent autonomous coding system using the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) and Daytona sandboxes. The system consists of a **Project Manager Agent** (local) and a **Developer Agent** (in-sandbox), enabling advanced delegation, planning, and secure code execution.

The Project Manager Agent runs locally and uses the basic Anthropic interface with the `claude-sonnet-4-20250514` model for high-level planning and task delegation. The Developer Agent runs inside the Daytona sandbox and is created using the Claude Agent SDK, which leverages Claude Code for advanced coding and automation capabilities. This architecture separates high-level planning from low-level code execution for more robust automation.

A key advantage of this approach is its **extensibility**: you can easily replace the Project Manager Agent with your own custom orchestrator logic, or even another agent, making the system highly reusable and adaptable to a wide range of advanced automation and coordination use cases.

* * *

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#1-workflow-overview)

When the main module is launched, a Daytona sandbox is created for the Developer Agent, and a Project Manager Agent is initialized locally. Interaction with the system occurs via a command line chat interface. The Project Manager Agent receives prompts, plans the workflow, and delegates coding tasks to the Developer Agent. The Developer Agent executes tasks in the sandbox and streams results back to the Project Manager, who reviews and coordinates further actions. All logs and outputs from both agents are streamed in real time to the terminal, providing full visibility into the process as it is managed by the Project Manager Agent.

The Developer Agent can also host web apps and provide preview links using [Daytona Preview Links](https://www.daytona.io/docs/en/preview/). The Project Manager Agent will present these links and summarize the results for you.

You can continue interacting with the system until you are finished. When you exit the program, the sandbox is deleted automatically.

* * *

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#clone-the-repository)

First, clone the daytona [repository](https://github.com/daytona/guides.git) and navigate to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/typescript/anthropic/multi-agent-claude-sdk
```

#### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#configure-environment)

To run this example, you need to set the following environment variables:

- `DAYTONA_API_KEY`: Required for access to Daytona sandboxes. Get it from [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
- `ANTHROPIC_API_KEY`: Required for the **Project Manager Agent** (runs locally). Get it from [Claude Developer Platform](https://console.anthropic.com/settings/keys)
- `SANDBOX_ANTHROPIC_API_KEY`: **Optional** for the **Developer Agent** (runs in sandbox). If not provided, defaults to using `ANTHROPIC_API_KEY`. Get it from [Claude Developer Platform](https://console.anthropic.com/settings/keys)

Copy `.env.example` to `.env` and add your keys:

```
DAYTONA_API_KEY=your_daytona_key

ANTHROPIC_API_KEY=your_anthropic_key

SANDBOX_ANTHROPIC_API_KEY=your_anthropic_key
```

#### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#alternative-inject-the-key-as-a-daytona-secret) Alternative: Inject the Key as a Daytona Secret

[Section titled “Alternative: Inject the Key as a Daytona Secret”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#alternative-inject-the-key-as-a-daytona-secret)

The default setup passes the Developer Agent’s Anthropic key into the sandbox as a plain environment variable, so anything running inside the sandbox - including the agent itself - can read the raw key with `env`. [Daytona Secrets](https://www.daytona.io/docs/en/secrets) keep the raw value out of the sandbox entirely: the environment variable holds only an opaque placeholder (`dtn_secret_<id>`), and Daytona’s outbound proxy substitutes the real value into HTTPS request headers at egress - and only for requests to the hosts the Secret allows. An agent that dumps the environment or exfiltrates it never sees a usable key. The Project Manager Agent runs on your machine, not in the sandbox, so its `ANTHROPIC_API_KEY` is unaffected.

The Secret-based flow needs `@daytona/sdk` 0.192.0 or newer and a one-time Secret setup:

1. Create the Secret once for your organization - in the [Daytona Dashboard](https://app.daytona.io/dashboard/secrets) or with a one-off script (save as `create-secret.ts` next to this guide’s `.env` and run `npx tsx create-secret.ts`). Store whichever key you want the Developer Agent to use - the default `SANDBOX_ANTHROPIC_API_KEY`-with-fallback logic moves here:



```
import { Daytona } from '@daytona/sdk'

import * as dotenv from 'dotenv'




dotenv.config()




async function main() {

     const value = process.env.SANDBOX_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY

     if (!value) throw new Error('Set SANDBOX_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY in .env')




     const daytona = new Daytona()

     await daytona.secret.create({

       name: 'anthropic-api-key',

       value,

       hosts: ['api.anthropic.com'], // the only host the real key may be sent to

     })

}




main()
```

2. In `src/index.ts`, swap the `ANTHROPIC_API_KEY` env var for a `secrets:` mapping (environment variable name to Secret name):



```
const sandbox = await daytona.create({

     envVars: {

       ANTHROPIC_API_KEY: sandboxApiKey,

     },

     secrets: {

       ANTHROPIC_API_KEY: 'anthropic-api-key',

     },

})
```


Inside the sandbox, `env` now shows `ANTHROPIC_API_KEY=dtn_secret_...`, yet the Developer Agent still authenticates: the Claude Agent SDK sends the key as the `x-api-key` HTTPS request header to `api.anthropic.com`, where the proxy swaps in the real value. Substitution happens only in HTTPS request headers toward allowed hosts - requests to any other host carry the harmless placeholder. See the [Secrets documentation](https://www.daytona.io/docs/en/secrets#substitution-scope) for the full substitution scope.

#### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#local-usage) Local Usage

[Section titled “Local Usage”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#local-usage)

Install dependencies:

```
npm install
```

Run the two-agent system:

```
npm run start
```

The system will start and wait for your prompt.

* * *

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#3-example-usage) 3\. Example Usage

[Section titled “3. Example Usage”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#3-example-usage)

Example chat session:

```
$ npm run start

Creating Developer Agent sandbox...

Installing Developer Agent SDK...

Initializing Developer Agent...

Initializing Project Manager Agent...

=== Two-Agent System Ready ===

Project Manager Agent: Manages tasks and delegates to Developer (Green text)

Developer Agent: Executes code in Daytona sandbox (White text)

Press Ctrl+C at any time to exit.

User: make a lunar lander web app

[Project Manager] Processing your request...

[Project Manager]: I'll help you create a lunar lander web app! Let me delegate this task to the Developer Agent.

<developer_task>

Create a lunar lander web game with the following features:

- HTML/CSS/JavaScript based

- Canvas graphics for the game

- Physics simulation (gravity, thrust, velocity)

- Keyboard controls (arrow keys)

- Landing detection (safe landing vs crash)

- Fuel management system

- Start the game on port 80 and provide the preview URL

  </developer_task>

[Delegating to Developer Agent]...

I'll help you create a lunar lander web app! Let me build a complete game with physics simulation, graphics, and controls.

🔨 Write

🔨 Write

🔨 Bash

Perfect! The web server is now running.

Your Lunar Lander game is live at:

🌐 https://80-17ac1c0f-d684-4122-93b5-8f52fd5393f8.proxy.daytona.works

[Project Manager]: Excellent! The Developer Agent has successfully created your lunar lander web app. The game is now running and accessible at the preview URL above. The implementation includes:

✓ Physics simulation with gravity and thrust

✓ Canvas-based graphics

✓ Keyboard controls for gameplay

✓ Landing detection system

✓ Fuel management

✓ Web server running on port 80

TASK_COMPLETE

[Project Manager] All tasks completed!
```

* * *

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#4-understanding-the-agent-architecture) 4\. Understanding the Agent Architecture

[Section titled “4. Understanding the Agent Architecture”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#4-understanding-the-agent-architecture)

This system is composed of two collaborating agents, each with a distinct role and implementation. Below is a step-by-step guide to how each agent operates and interacts within the workflow.

#### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#project-manager-agent-terminal-orchestration) Project Manager Agent (Terminal Orchestration)

[Section titled “Project Manager Agent (Terminal Orchestration)”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#project-manager-agent-terminal-orchestration)

1. **User Interaction:**

- All user interaction occurs via the terminal with the Project Manager Agent.
- The Project Manager Agent is configured with a system prompt that defines its role and maintains the full conversation history.

2. **Awareness of Developer Agent:**

- The Project Manager Agent knows that a Developer Agent is available inside a Daytona sandbox and can be invoked as needed.

3. **Task Delegation:**

- When the Project Manager Agent determines that a coding task should be delegated, it encapsulates the task within `<developer_task>` tags in its response.
- The system parses these tags and, when present, invokes the Developer Agent with the specified task.

4. **Iterative Workflow:**

- This process can repeat multiple times, with the Project Manager Agent reasoning about progress and delegating further tasks as needed.

5. **Session Completion:**

- When the Project Manager Agent determines the overall task is complete, it outputs `TASK_COMPLETE`, which signals the system to terminate the session.

#### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#developer-agent-sandbox-execution) Developer Agent (Sandbox Execution)

[Section titled “Developer Agent (Sandbox Execution)”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#developer-agent-sandbox-execution)

1. **Provisioning:**

- The Developer Agent is provisioned inside a Daytona sandbox and is responsible for executing coding tasks.

2. **SDK Installation:**

- The system installs the Claude Agent SDK in the sandbox by running `pip install` (see [process execution](https://www.daytona.io/docs/en/process-code-execution#command-execution)).

3. **Interpreter Context:**

- A new [code interpreter context](https://www.daytona.io/docs/en/process-code-execution#run-code-stateful) is created for isolated execution.

4. **Script Upload:**

- The coding agent script is uploaded to the sandbox using [file uploading](https://www.daytona.io/docs/en/file-system-operations#upload-a-single-file).

5. **SDK Initialization:**

- The Claude Agent SDK is initialized in the interpreter context (e.g., `import coding_agent`).

6. **Task Execution:**

- When a `<developer_task>` is received, the system sends the task to the Developer Agent by running a Python command in the interpreter context:



```
const result = await sandbox.codeInterpreter.runCode(

`coding_agent.run_query_sync(os.environ.get('PROMPT', ''))`,

{

    context: ctx,

    envs: { PROMPT: task },

    onStdout,

    onStderr,

}

);
```

- The Developer Agent executes the task, streams output, and returns results to the Project Manager Agent for review and further coordination.

* * *

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#5-customization) 5\. Customization

[Section titled “5. Customization”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#5-customization)

You can customize the Project Manager Agent’s behavior by modifying the system prompt in `src/index.ts`. The current implementation:

- Uses `<developer_task>` tags for delegation
- Automatically reviews Developer Agent outputs
- Says “TASK\_COMPLETE” when finished

* * *

### [\#](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/\#6-cleanup) 6\. Cleanup

[Section titled “6. Cleanup”](https://www.daytona.io/docs/en/guides/claude/claude-agent-sdk-connect-service-sandbox/#6-cleanup)

When you exit the main program, the Daytona sandbox and all files are automatically deleted.

* * *

**Key advantages:**

- Secure, isolated execution in Daytona sandboxes
- Hierarchical agent architecture for robust automation
- Extensible and reusable architecture
- Automatic dev server detection and live preview links
- Multi-language and full-stack support
- Simple setup and automatic cleanup