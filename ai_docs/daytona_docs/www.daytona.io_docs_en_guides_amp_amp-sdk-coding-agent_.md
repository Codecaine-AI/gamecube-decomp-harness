---
url: "https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/"
title: "Build a Coding Agent Using Amp Code and Daytona | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#_top)

# Build a Coding Agent Using Amp Code and Daytona

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent.md)Open

This guide demonstrates how to run an autonomous coding agent based on [Amp Code](https://ampcode.com/) inside a Daytona sandbox environment. The agent can develop full-stack web apps, write code in any language, install dependencies, and run scripts. It can also start and manage dev servers, and generate preview links for live apps.

* * *

### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#1-workflow-overview)

When you launch the main module, a Daytona sandbox is created and the Amp CLI is installed inside it. The agent uses Amp’s [streaming JSON mode](https://ampcode.com/manual#cli-streaming-json) for programmatic control.

You interact with the main program via a command line chat interface. The program sends your prompts to the agent inside the sandbox, which executes them and returns the results:

```
$ npm run start

Creating sandbox...

Installing Amp CLI...

Starting Amp Code...

Thinking...

Got it! I'm ready to help. What would you like to build or work on?

Agent ready. Press Ctrl+C at any time to exit.

User: Create a Kanji flashcard app

Thinking...

> I'll create a Kanji flashcard app with flip animations, progress tracking, and multiple study modes. Here's the preview URL:

https://8000-29baaaf7-767a-4dff-8129-1e6ec2100b3e.daytonaproxy01.net

🔧 create_file /home/daytona/index.html

Successfully created file /home/daytona/index.html

🔧 create_file /home/daytona/start.sh

Running `python3 -m http.server 8000` via session command...

User:
```

The agent can also host web apps and provide you with a preview link using the [Daytona Preview Links](https://www.daytona.io/docs/en/preview/) feature. When your task involves running or previewing a web application, the agent automatically reasons about this need, hosts the app, and generates a preview link for you to inspect the live result:

![Amp Code agent creating a Kanji flashcard app in a Daytona sandbox](https://www.daytona.io/docs/_astro/amp-sdk-coding-agent.DG7XpScQ_ZwFRjO.webp)

You can continue interacting with your agent until you are finished. When you exit the program, the sandbox will be deleted automatically.

### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#clone-the-repository)

First, clone the daytona [repository](https://github.com/daytona/guides.git) and navigate to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/typescript/amp/amp-sdk
```

#### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#configure-environment)

Get your API keys:

- **Daytona API key:** [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
- **Amp API key:** [Amp Settings](https://ampcode.com/settings)

Copy `.env.example` to `.env` and add your keys:

```
DAYTONA_API_KEY=your_daytona_key

SANDBOX_AMP_API_KEY=your_amp_key
```

#### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#alternative-inject-the-key-as-a-daytona-secret) Alternative: Inject the Key as a Daytona Secret

[Section titled “Alternative: Inject the Key as a Daytona Secret”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#alternative-inject-the-key-as-a-daytona-secret)

The default setup passes the Amp key into the sandbox as a plain environment variable, so anything running inside the sandbox - including the agent itself - can read the raw key with `env`. [Daytona Secrets](https://www.daytona.io/docs/en/secrets) keep the raw value out of the sandbox entirely: the environment variable holds only an opaque placeholder (`dtn_secret_<id>`), and Daytona’s outbound proxy substitutes the real value into HTTPS request headers at egress - and only for requests to the hosts the Secret allows. An agent that dumps the environment or exfiltrates it never sees a usable key.

The Secret-based flow needs `@daytona/sdk` 0.192.0 or newer and a one-time Secret setup:

1. Create the Secret once for your organization - in the [Daytona Dashboard](https://app.daytona.io/dashboard/secrets) or with a one-off script (save as `create-secret.ts` next to this guide’s `.env` and run `npx tsx create-secret.ts`):



```
import { Daytona } from '@daytona/sdk'

import * as dotenv from 'dotenv'




dotenv.config()




async function main() {

     const value = process.env.SANDBOX_AMP_API_KEY

     if (!value) throw new Error('SANDBOX_AMP_API_KEY is not set')




     const daytona = new Daytona()

     await daytona.secret.create({

       name: 'amp-api-key',

       value,

       hosts: ['ampcode.com'], // the only host the real key may be sent to

     })

}




main()
```

2. In `src/index.ts`, swap the `AMP_API_KEY` env var for a `secrets:` mapping (environment variable name to Secret name):



```
sandbox = await daytona.create({

     envVars: { AMP_API_KEY: process.env.SANDBOX_AMP_API_KEY },

     secrets: { AMP_API_KEY: 'amp-api-key' },

})
```


Inside the sandbox, `env` now shows `AMP_API_KEY=dtn_secret_...`, yet the Amp CLI still authenticates: it sends the key as an HTTPS request header to `ampcode.com`, where the proxy swaps in the real value. Substitution happens only in HTTPS request headers toward allowed hosts - requests to any other host carry the harmless placeholder. See the [Secrets documentation](https://www.daytona.io/docs/en/secrets#substitution-scope) for the full substitution scope.

#### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#local-usage) Local Usage

[Section titled “Local Usage”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#local-usage)

Install dependencies:

```
npm install
```

Run the agent:

```
npm run start
```

The agent will start and wait for your prompt.

### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#3-understanding-the-script) 3\. Understanding the Script

[Section titled “3. Understanding the Script”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#3-understanding-the-script)

This example uses Amp’s `--stream-json` mode for streaming output and the `-x` (execute) flag for autonomous operation. Commands are sent via a PTY (pseudo-terminal) for real-time streaming.

#### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#initialization) Initialization

[Section titled “Initialization”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#initialization)

On startup, the script:

1. Creates a new [Daytona sandbox](https://www.daytona.io/docs/en/sandboxes) with the Amp API key.
2. Installs the Amp CLI globally in the sandbox.
3. Creates a PTY for streaming output from Amp.
4. Sends a Daytona-aware system prompt as the first user message (preview URL pattern + instruction to write server startup command to `/home/daytona/start.sh`).
5. Enters the readline loop to send prompts and receive streamed responses.
6. On Ctrl+C, kills the PTY session, deletes the sandbox, and exits.

#### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#pty-communication) PTY Communication

[Section titled “PTY Communication”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#pty-communication)

The agent uses a pseudo-terminal (PTY) for streaming output from Amp:

```
// Create a PTY for streaming output from Amp

this.ptyHandle = await this.sandbox.process.createPty({

  id: `amp-pty-${Date.now()}`,

  cols: 120,

  rows: 30,

  onData: (data: Uint8Array) => this.handleData(data),

})

// Wait for PTY connection

await this.ptyHandle.waitForConnection()
```

#### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#running-amp-commands) Running Amp Commands

[Section titled “Running Amp Commands”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#running-amp-commands)

Each prompt is sent as an `amp` command with the `-x` (execute) flag for autonomous operation. The agent uses Amp’s thread system to maintain conversation context:

```
// Run an amp command via PTY and wait for completion

private async runAmpCommand(args: string[]): Promise<void> {

  const command = ['amp', '--dangerously-allow-all', '--stream-json', '-m smart', ...args].join(' ')

  // Send command to the PTY

  await this.ptyHandle.sendInput(`cd /home/daytona && ${command}\n`)

  // Wait for the response to complete (signaled by result message)

  await new Promise<void>((resolve) => {

    this.onResponseComplete = resolve

  })

}

// Process a user prompt

async processPrompt(prompt: string): Promise<void> {

  if (this.threadId) {

    // Continue existing thread

    await this.runAmpCommand(['-x', JSON.stringify(prompt), 'threads', 'continue', this.threadId])

  } else {

    // Start new thread

    await this.runAmpCommand(['-x', JSON.stringify(prompt)])

  }

}
```

#### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#streaming-json-messages) Streaming JSON Messages

[Section titled “Streaming JSON Messages”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#streaming-json-messages)

Amp outputs JSON lines that can be parsed to track agent activity. The `handleData` method buffers incoming data and processes complete lines:

```
// Handle streamed data from PTY

private handleData(data: Uint8Array): void {

  // Append new data to the buffer

  this.buffer += new TextDecoder().decode(data)

  // Split the buffer into complete lines

  const lines = this.buffer.split('\n')

  // Keep any incomplete line in the buffer for next time

  this.buffer = lines.pop() || ''

  // Process each complete line

  for (const line of lines.filter((l) => l.trim())) {

    this.handleJsonLine(line)

  }

}
```

Message types from Amp’s streaming JSON:

- **system**: Session initialization with `subtype: 'init'` and `session_id` for thread tracking
- **assistant**: AI responses with text content and tool usage blocks
- **user**: Tool results (output from executed tools)
- **result**: Final execution result (success or error) - signals response completion

```
private handleJsonLine(line: string): void {

  const parsed = JSON.parse(line) as AmpMessage

  if (parsed.type === 'system' && parsed.subtype === 'init') {

    // Capture thread ID for conversation continuation

    const sysMsg = parsed as { session_id?: string }

    if (sysMsg.session_id) this.threadId = sysMsg.session_id

  } else if (parsed.type === 'assistant') {

    // Display text and tool_use blocks

    const msg = parsed as AssistantMessage

    for (const block of msg.message.content) {

      if (block.type === 'text') { /* render text */ }

      else if (block.type === 'tool_use') { /* display tool */ }

    }

  } else if (parsed.type === 'user') {

    // Tool results: display output

  } else if (parsed.type === 'result') {

    // Signal response completion

    this.onResponseComplete?.()

  }

}
```

#### [\#](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/\#system-prompt-and-main-loop) System Prompt and Main Loop

[Section titled “System Prompt and Main Loop”](https://www.daytona.io/docs/en/guides/amp/amp-sdk-coding-agent/#system-prompt-and-main-loop)

A Daytona-aware system prompt is sent as the first user message. It instructs the agent to use the preview URL pattern and to write the server start command into `/home/daytona/start.sh` (instead of executing directly in Amp), then provide the preview URL:

```
const defaultSystemPrompt = [\
\
  'You are running in a Daytona sandbox.',\
\
  `When running services on localhost, they will be accessible as: ${previewUrlPattern}`,\
\
  'When you need to start a server, DO NOT run it directly.',\
\
  'Instead, write only the server start command to /home/daytona/start.sh (one command, no markdown).',\
\
  'After writing the start command, provide the preview URL to the user.',\
\
].join(' ')

const ampSession = new AmpSession(sandbox)

await ampSession.initialize({ systemPrompt: defaultSystemPrompt })
```

When Amp is ready, the script runs a readline loop:

```
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

while (true) {

  const prompt = await new Promise<string>((resolve) => rl.question('User: ', resolve))

  if (prompt.trim()) {

    await ampSession.processPrompt(prompt)

    await startServerFromScript()

  }

}
```

The readline loop waits for user input, sends it to the agent, and displays the streamed response. If Amp produced `/home/daytona/start.sh`, the script is then launched via Daytona’s session command API so long-running/background server startup does not hang Amp turns.

**Key advantages:**

- Secure, isolated execution in Daytona sandboxes
- Streaming JSON output for real-time tool activity feedback
- PTY-based communication for streaming output
- Thread-based conversation continuity across prompts
- Uses Amp’s `smart` mode for state-of-the-art model capabilities
- All agent code execution happens inside the sandbox
- Automatic preview link generation for deployed services
- Automatic cleanup on exit