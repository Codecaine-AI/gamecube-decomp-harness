---
url: "https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/"
title: "Run Gemini CLI Headlessly in Daytona and Stream Its Output | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#_top)

# Run Gemini CLI Headlessly in Daytona and Stream Its Output

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox.md)Open

This guide demonstrates how to run [Google’s Gemini CLI](https://geminicli.com/) as a headless coding agent inside a Daytona sandbox. The agent can write code in any language, install dependencies, run scripts, and reason over a project, all inside a secure, isolated, disposable sandbox while its output streams back to your terminal in real time.

* * *

### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#1-workflow-overview)

When you launch the main module, a Daytona sandbox is created and the Gemini CLI is installed inside it. The agent is driven headlessly with `gemini -p "<prompt>" --yolo --output-format stream-json`, and its newline-delimited JSON events are parsed and printed as the agent works.

You interact with the main program via a command line chat interface. The program sends your prompts to the Gemini CLI inside the sandbox, which writes code, runs commands, and streams the results back as it works. Each tool call surfaces as a `[tool]` line, followed by the assistant’s response.

Gemini sessions are stateful, so each turn reuses the session captured from the first run, keeping context across the conversation. You can continue interacting with your agent until you are finished. When you exit the program, the sandbox is deleted automatically.

### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#clone-the-repository)

First, clone the daytona [repository](https://github.com/daytona/guides.git) and navigate to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/typescript/gemini/gemini-cli
```

#### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#configure-environment)

Get your API keys:

- **Daytona API key:** [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
- **Gemini API key:** [Google AI Studio](https://aistudio.google.com/apikey)

Copy `.env.example` to `.env` and add your keys:

```
DAYTONA_API_KEY=your_daytona_key

SANDBOX_GEMINI_API_KEY=your_gemini_key
```

#### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#alternative-inject-the-key-as-a-daytona-secret) Alternative: Inject the Key as a Daytona Secret

[Section titled “Alternative: Inject the Key as a Daytona Secret”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#alternative-inject-the-key-as-a-daytona-secret)

The default setup passes the Gemini key into the sandbox as a plain environment variable, so anything running inside the sandbox - including the agent itself - can read the raw key with `env`. [Daytona Secrets](https://www.daytona.io/docs/en/secrets) keep the raw value out of the sandbox entirely: the environment variable holds only an opaque placeholder (`dtn_secret_<id>`), and Daytona’s outbound proxy substitutes the real value into HTTPS request headers at egress - and only for requests to the hosts the Secret allows. An agent that dumps the environment or exfiltrates it never sees a usable key.

The Secret-based flow needs `@daytona/sdk` 0.192.0 or newer and a one-time Secret setup:

1. Create the Secret once for your organization - in the [Daytona Dashboard](https://app.daytona.io/dashboard/secrets) or with a one-off script (save as `create-secret.ts` next to this guide’s `.env` and run `npx tsx create-secret.ts`):



```
import { Daytona } from '@daytona/sdk'

import * as dotenv from 'dotenv'




dotenv.config()




async function main() {

     const value = process.env.SANDBOX_GEMINI_API_KEY

     if (!value) throw new Error('SANDBOX_GEMINI_API_KEY is not set')




     const daytona = new Daytona()

     await daytona.secret.create({

       name: 'gemini-api-key',

       value,

       hosts: ['generativelanguage.googleapis.com'], // the only host the real key may be sent to

     })

}




main()
```

2. In `src/index.ts`, swap the `GEMINI_API_KEY` env var for a `secrets:` mapping (environment variable name to Secret name). `GEMINI_CLI_TRUST_WORKSPACE` carries no credentials and stays a plain env var:



```
sandbox = await daytona.create({

     envVars: {

       GEMINI_API_KEY: process.env.SANDBOX_GEMINI_API_KEY,

       GEMINI_CLI_TRUST_WORKSPACE: 'true',

     },

     secrets: {

       GEMINI_API_KEY: 'gemini-api-key',

     },

})
```


Inside the sandbox, `env` now shows `GEMINI_API_KEY=dtn_secret_...`, yet the CLI still authenticates: it sends the key as the `x-goog-api-key` HTTPS request header to `generativelanguage.googleapis.com`, where the proxy swaps in the real value. Substitution happens only in HTTPS request headers toward allowed hosts - requests to any other host carry the harmless placeholder. See the [Secrets documentation](https://www.daytona.io/docs/en/secrets#substitution-scope) for the full substitution scope.

#### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#local-usage) Local Usage

[Section titled “Local Usage”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#local-usage)

Install dependencies:

```
npm install
```

Run the agent:

```
npm run start
```

The agent will start and wait for your prompt.

### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#3-example-usage) 3\. Example Usage

[Section titled “3. Example Usage”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#3-example-usage)

Ask the agent to write and run some code. Here it generates an ASCII-art Mandelbrot fractal inside the sandbox and executes it, streaming each tool call and the program output back to your terminal:

```
$ npm run start

Creating sandbox...

Installing Gemini CLI...

Starting Gemini CLI...

Agent ready. Press Ctrl+C at any time to exit.

User: Write a Python script mandelbrot.py that renders the Mandelbrot set as ASCII art roughly 40 columns by 20 rows, then run it and show the rendered output

[tool] write_file

[tool] run_shell_command

[tool] replace

[tool] run_shell_command

I have successfully created and executed the Python script mandelbrot.py to render the Mandelbrot set as ASCII art.

               ......-:@...

                .......:%+:....

              ........:*@@*:....

             .....+-:--=@@-:::::.

           .......:@%@@@@@@@@=#+..

        .........==@@@@@@@@@@@+:..

     .....-::::::%@@@@@@@@@@@@@%:..

  .......:-@*@%--@@@@@@@@@@@@@@%:..

 .......::%@@@@@+@@@@@@@@@@@@@@#...

 ..-:.::+@@@@@@@@@@@@@@@@@@@@@@:...

 ..-:.::+@@@@@@@@@@@@@@@@@@@@@@:...

 .......::%@@@@@+@@@@@@@@@@@@@@#...

  .......:-@*@%--@@@@@@@@@@@@@@%:..

     .....-::::::%@@@@@@@@@@@@@%:..

        .........==@@@@@@@@@@@+:..

           .......:@%@@@@@@@@=#+..

             .....+-:--=@@-:::::.

              ........:*@@*:....

                .......:%+:....

                  ......-:@...

User:
```

### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#4-understanding-the-script) 4\. Understanding the Script

[Section titled “4. Understanding the Script”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#4-understanding-the-script)

This example consists of two parts: a main program (`src/index.ts`) that manages the sandbox and a command-line loop, and a session class (`src/session.ts`) that drives the Gemini CLI over a PTY and parses its streaming JSON output.

#### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#initialization) Initialization

[Section titled “Initialization”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#initialization)

On startup, the script:

1. Creates a new [Daytona sandbox](https://www.daytona.io/docs/en/sandboxes) with the Gemini API key injected as an environment variable.
2. Installs the Gemini CLI globally in the sandbox.
3. Creates a PTY for streaming output from the Gemini CLI.
4. Enters a readline loop to send prompts and receive streamed responses.
5. On Ctrl+C, kills the PTY session, deletes the sandbox, and exits.

#### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#creating-the-sandbox) Creating the Sandbox

[Section titled “Creating the Sandbox”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#creating-the-sandbox)

The Gemini CLI defaults to interactive browser OAuth, which would hang a headless run. Passing `GEMINI_API_KEY` as a sandbox environment variable at create time lets the CLI authenticate non-interactively. `GEMINI_CLI_TRUST_WORKSPACE` bypasses the CLI’s workspace-trust prompt, which otherwise blocks `--yolo` runs in a fresh sandbox directory:

```
sandbox = await daytona.create({

  envVars: {

    GEMINI_API_KEY: process.env.SANDBOX_GEMINI_API_KEY,

    GEMINI_CLI_TRUST_WORKSPACE: 'true',

  },

})

const install = await sandbox.process.executeCommand('npm install -g @google/gemini-cli')

if (install.exitCode !== 0) {

  throw new Error('Error installing Gemini CLI: ' + install.result)

}
```

#### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#pty-communication) PTY Communication

[Section titled “PTY Communication”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#pty-communication)

The session uses a pseudo-terminal (PTY) for streaming output from the Gemini CLI:

```
async initialize(): Promise<void> {

  this.ptyHandle = await this.sandbox.process.createPty({

    id: `gemini-pty-${Date.now()}`,

    cols: 120,

    rows: 30,

    onData: (data: Uint8Array) => this.handleData(data),

  })

  await this.ptyHandle.waitForConnection()

}
```

#### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#running-gemini-commands) Running Gemini Commands

[Section titled “Running Gemini Commands”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#running-gemini-commands)

Each prompt is sent as a `gemini` command in headless mode. `-p` runs a one-shot non-interactive prompt, `--yolo` auto-approves tool calls so the run never blocks on a permission prompt, and `--output-format stream-json` emits newline-delimited JSON events. When a session ID has been captured, `-r` resumes that session for multi-turn continuity:

```
async processPrompt(prompt: string): Promise<void> {

  const flags = ['-p', this.shellQuote(prompt), '--yolo', '--output-format', 'stream-json']

  // -r resumes the existing session for multi-turn continuity.

  if (this.sessionId) flags.unshift('-r', this.shellQuote(this.sessionId))

  const command = ['gemini', ...flags].join(' ')

  await this.ptyHandle!.sendInput(`cd ${WORK_DIR} && ${command}\n`)

  await new Promise<void>((resolve) => {

    this.onResponseComplete = resolve

  })

}
```

#### [\#](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/\#streaming-json-messages) Streaming JSON Messages

[Section titled “Streaming JSON Messages”](https://www.daytona.io/docs/en/guides/gemini/gemini-cli-run-tasks-stream-logs-sandbox/#streaming-json-messages)

The Gemini CLI outputs JSON lines that are parsed to track agent activity. The `handleData` method buffers incoming PTY bytes and processes each complete line, keeping any incomplete line for the next chunk. A stateful `TextDecoder` is reused across calls so partial multi-byte UTF-8 sequences split across PTY chunks are preserved instead of being corrupted:

```
private decoder = new TextDecoder('utf-8')

private handleData(data: Uint8Array): void {

  this.buffer += this.decoder.decode(data, { stream: true })

  const lines = this.buffer.split('\n')

  this.buffer = lines.pop() || ''

  for (const line of lines.map((l) => l.trim()).filter(Boolean)) {

    try {

      this.handleEvent(JSON.parse(line) as GeminiStreamEvent)

    } catch {

      debug('non-JSON line:', line)

    }

  }

}
```

Event types from the Gemini CLI’s streaming JSON ( [schema reference](https://geminicli.com/docs/cli/headless/)):

- **init**: Session metadata (`session_id`, model) - captured to resume the session on later turns
- **message**: User and assistant message chunks (assistant text is printed live)
- **tool\_use**: Tool call requests with arguments
- **tool\_result**: Output from executed tools
- **error**: Non-fatal warnings and system errors
- **result**: Final outcome with aggregated statistics - signals response completion

```
private handleEvent(event: GeminiStreamEvent): void {

  switch (event.type) {

    case 'init': {

      const init = event as InitEvent

      if (init.session_id && !this.sessionId) {

        this.sessionId = init.session_id

        debug('captured session_id:', this.sessionId)

      }

      return

    }

    case 'message': {

      const msg = event as MessageEvent

      if (msg.role === 'assistant' && msg.content) {

        process.stdout.write(msg.content)

      }

      return

    }

    case 'tool_use': {

      const tool = event as ToolUseEvent

      // Skip update_topic: an internal Gemini bookkeeping tool, not a user-facing action.

      if (tool.tool_name === 'update_topic') return

      process.stdout.write(`\n[tool] ${tool.tool_name}\n`)

      return

    }

    case 'tool_result': {

      const result = event as ToolResultEvent

      if (result.status === 'error' && result.error) {

        process.stdout.write(`\n[tool error] ${result.error.message}\n`)

      }

      return

    }

    case 'error': {

      const err = event as ErrorEvent

      process.stderr.write(`\n[${err.severity}] ${err.message}\n`)

      return

    }

    case 'result': {

      const res = event as ResultEvent

      if (res.status === 'error' && res.error) {

        process.stderr.write(`\nFailed: ${res.error.message}\n`)

      }

      process.stdout.write('\n')

      this.onResponseComplete?.()

      return

    }

  }

}
```

When the `result` event arrives, `onResponseComplete` resolves the promise that `processPrompt` is awaiting, so the readline loop can prompt for the next turn.

**Key advantages:**

- Secure, isolated execution in Daytona sandboxes
- Fully headless operation, no browser OAuth and no permission prompts
- Streaming JSON output (`--output-format stream-json`) for real-time tool and message activity
- PTY-based communication for low-latency streaming
- Session-based conversation continuity across prompts (`-r`)
- All agent code execution happens inside the sandbox
- Automatic cleanup on exit