---
url: "https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/"
title: "Run the Kimi CLI in a Daytona Sandbox | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#_top)

# Run the Kimi CLI in a Daytona Sandbox

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox.md)Open

This guide explains how to run [Moonshot AI’s Kimi CLI](https://www.kimi.com/code/) inside a Daytona sandbox. Your Kimi API key is injected when the sandbox is created, so the agent runs fully headless - no browser login or device flow - and every prompt you send streams its output straight back to your terminal. Because Kimi works entirely inside the sandbox, it can edit files, install packages, and run code in an isolated, disposable environment that is thrown away when it’s finished. The only thing running on your own machine is a small Node.js controller that wires your terminal to the sandbox.

* * *

### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#1-workflow-overview)

When you launch the main module, a Daytona sandbox is created with `KIMI_API_KEY`, `KIMI_BASE_URL`, and `KIMI_MODEL_NAME` injected at create time, and the Kimi CLI is installed inside it. With no config file in the fresh sandbox, the CLI builds its model provider entirely from those environment variables, so there is no login step: each prompt is run headlessly as `kimi -p "<prompt>" --yolo`. Turns after the first add `-C` so the conversation carries context from one prompt to the next.

Every turn talks to Kimi over the same trick. Opening a PTY starts a shell in the sandbox; rather than running Kimi as a child of that shell, the controller tells the shell to `exec` Kimi, which makes Kimi take over the shell’s process. This buys two things. First, the output you see is exactly what Kimi prints, with no shell prompt or echoed command around it, so it looks the same as running Kimi in your own terminal. Second, because Kimi replaced the shell, the PTY closes the moment Kimi exits, which is how the controller knows a turn has finished and can prompt you again.

You can keep interacting with your agent until you are finished. When you exit the program, the sandbox is deleted automatically.

### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#clone-the-repository)

First, clone the daytona [repository](https://github.com/daytona/guides.git) and navigate to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/typescript/kimi/kimi-cli
```

#### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#configure-environment)

You need:

- **Daytona API key:** [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
- **Kimi API key:** [Kimi API Platform](https://platform.kimi.ai/console/api-keys)

Copy `.env.example` to `.env` and add both keys:

```
DAYTONA_API_KEY=your_daytona_key

SANDBOX_KIMI_API_KEY=your_kimi_key
```

#### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#alternative-inject-the-key-as-a-daytona-secret) Alternative: Inject the Key as a Daytona Secret

[Section titled “Alternative: Inject the Key as a Daytona Secret”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#alternative-inject-the-key-as-a-daytona-secret)

The default setup passes the Kimi key into the sandbox as a plain environment variable, so anything running inside the sandbox - including the agent itself - can read the raw key with `env`. [Daytona Secrets](https://www.daytona.io/docs/en/secrets) keep the raw value out of the sandbox entirely: the environment variable holds only an opaque placeholder (`dtn_secret_<id>`), and Daytona’s outbound proxy substitutes the real value into HTTPS request headers at egress - and only for requests to the hosts the Secret allows. An agent that dumps the environment or exfiltrates it never sees a usable key.

The Secret-based flow needs `@daytona/sdk` 0.192.0 or newer and a one-time Secret setup:

1. Create the Secret once for your organization - in the [Daytona Dashboard](https://app.daytona.io/dashboard/secrets) or with a one-off script (save as `create-secret.ts` next to this guide’s `.env` and run `npx tsx create-secret.ts`):



```
import { Daytona } from '@daytona/sdk'

import * as dotenv from 'dotenv'




dotenv.config()




async function main() {

     const value = process.env.SANDBOX_KIMI_API_KEY

     if (!value) throw new Error('SANDBOX_KIMI_API_KEY is not set')




     const daytona = new Daytona()

     await daytona.secret.create({

       name: 'kimi-api-key',

       value,

       hosts: ['api.moonshot.ai'], // the only host the real key may be sent to

     })

}




main()
```

2. In `src/index.ts`, swap the `KIMI_API_KEY` env var for a `secrets:` mapping (environment variable name to Secret name). Only the API key is secret - `KIMI_BASE_URL` and `KIMI_MODEL_NAME` carry no credentials and stay plain env vars, and all three variables remain required by the CLI:



```
sandbox = await daytona.create({

     envVars: {

       KIMI_API_KEY: process.env.SANDBOX_KIMI_API_KEY,

       KIMI_BASE_URL: 'https://api.moonshot.ai/v1',

       KIMI_MODEL_NAME: 'kimi-k3',

     },

     secrets: {

       KIMI_API_KEY: 'kimi-api-key',

     },

})
```


Inside the sandbox, `env` now shows `KIMI_API_KEY=dtn_secret_...`, yet the CLI still authenticates: it sends the key as an HTTPS request header to `api.moonshot.ai`, where the proxy swaps in the real value. Substitution happens only in HTTPS request headers toward allowed hosts - requests to any other host carry the harmless placeholder. See the [Secrets documentation](https://www.daytona.io/docs/en/secrets#substitution-scope) for the full substitution scope.

#### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#local-usage) Local Usage

[Section titled “Local Usage”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#local-usage)

Install dependencies:

```
npm install
```

Run the agent:

```
npm run start
```

The agent will start and wait for your prompt.

### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#3-example-usage) 3\. Example Usage

[Section titled “3. Example Usage”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#3-example-usage)

Ask the agent to write and run some code. Here it writes a QR code generator from scratch in Python, using only the standard library - Reed-Solomon error correction, data masking with penalty scoring, BCH format bits - runs it, and renders a scannable QR code straight into the terminal, finding and fixing its own bugs along the way with a verification suite it wrote for itself. The second turn asks it to reuse the same generator, which is the `-C` continuity at work.

```
$ npm run start

Creating sandbox...

Installing Kimi CLI...

Starting Kimi CLI...

Agent ready. Press Ctrl+C at any time to exit.

User: Write a Python script qr.py from scratch - standard library only, absolutely no QR or imaging libraries - that encodes the URL https://daytona.io as a real QR code (byte mode, error correction level L, proper data masking with penalty scoring), and prints it to the terminal using '██' (two full blocks) for dark modules and two spaces for light modules, with a 4-module quiet zone. Run it and include the rendered QR code verbatim in your final response, plus one line stating which QR version and mask pattern you used.

• Used WriteFile (qr.py)

  [tool calls trimmed: the agent wrote the encoder, re-derived the Reed-Solomon generator\
\
   polynomial from first principles, fixed a version-capacity bug and a format-info placement\
\
   bug it found itself, and round-tripped all 8 mask patterns before presenting the result]

• Used Shell (cd /home/daytona && python3 qr.py)

  Version/mask line: QR Version 2 (25×25), EC level L, mask pattern 3 (penalty score 450).

  Rendered QR code (verbatim output of python3 qr.py):

          ██████████████  ████      ██    ██  ██████████████

          ██          ██            ██    ██  ██          ██

          ██  ██████  ██  ██    ████████  ██  ██  ██████  ██

          ██  ██████  ██  ████  ██            ██  ██████  ██

          ██  ██████  ██  ████████  ████████  ██  ██████  ██

          ██          ██    ██    ██  ██  ██  ██          ██

          ██████████████  ██  ██  ██  ██  ██  ██████████████

                            ██  ██  ████████

          ████████    ██  ██        ██████████    ██████  ██

            ██████████  ██  ██                  ██      ██

          ██    ████  ██              ██  ████    ██

          ██      ████  ██      ████████  ████      ████

            ██  ██  ██████████  ██      ██  ████  ██  ██████

                  ██    ██    ████  ██  ████  ██████      ██

            ████    ████████  ██  ██  ██  ██  ██  ██  ████

          ██    ██████    ██████  ████    ██████████      ██

              ██████  ████████  ██      ████████████████████

                          ██  ██  ████    ██      ██  ██  ██

          ██████████████    ████████      ██  ██  ██  ██████

          ██          ██    ████  ██    ████      ██    ████

          ██  ██████  ██      ████████    ████████████

          ██  ██████  ██  ████    ██████  ██████  ██████████

          ██  ██████  ██  ████  ██████  ████  ██  ██  ████

          ██          ██  ██  ██            ██    ██  ██

          ██████████████  ██  ██  ██  ██      ██████████████

User: Now use the same generator to also encode https://kimi.com/code and include both rendered QR codes verbatim in your final response, each with a text label line above it

• Used StrReplaceFile (qr.py)

• Used Shell (cd /home/daytona && python3 qr.py)

• Both QR codes fully verified: bitstream content, Reed-Solomon divisibility, format BCH, and complete matrix round-trips for all 8 masks each. Here is the verbatim output of python3 qr.py:

  https://daytona.io

  Version 2 (25x25), EC level L, mask pattern 3, penalty score 450

  [same https://daytona.io code as shown above]

  https://kimi.com/code

  Version 2 (25x25), EC level L, mask pattern 2, penalty score 511

          ██████████████      ██  ██      ██  ██████████████

          ██          ██  ██  ██    ██  ████  ██          ██

          ██  ██████  ██          ██  ██  ██  ██  ██████  ██

          ██  ██████  ██  ██████  ██████      ██  ██████  ██

          ██  ██████  ██    ██      ██        ██  ██████  ██

          ██          ██  ████  ████████████  ██          ██

          ██████████████  ██  ██  ██  ██  ██  ██████████████

                            ██████    ██████

          ██████████  ████████  ██  ████    ██  ██  ██  ██

            ██  ██        ██  ██  ██      ██    ██      ██

          ████  ██  ██████    ██      ██████    ██████  ████

            ████          ██      ██      ██████  ██      ██

              ██████  ██    ████  ██████    ████  ██  ██████

          ██    ██  ██  ██████            ██    ██  ██  ██

          ██  ██████████      ██████  ████████  ██████  ████

          ██  ████  ██      ██  ██    ██    ████████      ██

          ██  ████  ████        ██      ████████████  ██

                          ██████  ████  ████      ████

          ██████████████  ████      ████  ██  ██  ██  ██████

          ██          ██          ████    ██      ████  ████

          ██  ██████  ██  ██████  ██  ██████████████  ██████

          ██  ██████  ██  ████          ████████  ██████████

          ██  ██████  ██  ██    ████      ██        ████  ██

          ██          ██  ████  ██    ██████    ██████    ██

          ██████████████  ██    ██      ██  ████████████████

  Summary: Both URLs exceed Version 1-L's 152-bit capacity, so both use QR Version 2 (25×25), EC level L — https://daytona.io with mask pattern 3 (penalty 450) and https://kimi.com/code with mask patt

  ern 2 (penalty 511), each selected by the lowest ISO/IEC 18004 penalty score.

User:
```

### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#4-understanding-the-script) 4\. Understanding the Script

[Section titled “4. Understanding the Script”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#4-understanding-the-script)

This example consists of two parts: a main program (`src/index.ts`) that manages the sandbox and a command-line loop, and a session class (`src/session.ts`) that drives each Kimi invocation over its own PTY.

#### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#initialization) Initialization

[Section titled “Initialization”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#initialization)

On startup, the script:

1. Creates a new [Daytona sandbox](https://www.daytona.io/docs/en/sandboxes) with the three Kimi environment variables injected at create time.
2. Installs the Kimi CLI in the sandbox with pip and confirms the binary with `"$HOME/.local/bin/kimi" --version`.
3. Enters a readline loop where each prompt is a headless `kimi -p` turn in its own PTY.
4. On Ctrl+C, kills any turn still in flight, deletes the sandbox, and exits.

#### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#creating-the-sandbox) Creating the Sandbox

[Section titled “Creating the Sandbox”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#creating-the-sandbox)

The sandbox is created with the Kimi settings already in its environment, which is what makes the whole flow headless. All three variables are required: with no config file present in a fresh sandbox, the CLI builds its LLM provider entirely from the environment, and it refuses to run (“LLM not set”) if the base URL or model name is missing. The host-side `SANDBOX_KIMI_API_KEY` maps to the bare `KIMI_API_KEY` the CLI expects inside the sandbox:

```
sandbox = await daytona.create({

  envVars: {

    KIMI_API_KEY: process.env.SANDBOX_KIMI_API_KEY,

    KIMI_BASE_URL: 'https://api.moonshot.ai/v1',

    KIMI_MODEL_NAME: 'kimi-k3',

  },

})
```

The sample points at Moonshot’s Open Platform endpoint with the `kimi-k3` model; change either in `src/index.ts` if you need a different endpoint or model (`GET https://api.moonshot.ai/v1/models` lists what your key can use).

The install is two commands. `pip install kimi-cli` exits non-zero on failure, so its exit code is a reliable success signal and is asserted directly. pip’s user install always drops the entrypoint at `$HOME/.local/bin/kimi`, but that directory is not always on the sandbox shell’s `PATH`, so the script confirms the install by running the binary by its full path - skipping the `PATH` lookup entirely means the check works the same regardless of how any given sandbox sets `PATH`:

```
const install = await sandbox.process.executeCommand('pip install kimi-cli')

if (install.exitCode !== 0) {

  throw new Error('Error installing Kimi CLI: ' + install.result)

}

const version = await sandbox.process.executeCommand('"$HOME/.local/bin/kimi" --version')

if (version.exitCode !== 0) {

  throw new Error(

    'Kimi CLI did not install correctly.\n' +

      `Install output:\n${install.result}\n` +

      `Version check output:\n${version.result}`,

  )

}
```

#### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#per-invocation-pty-with-exec) Per-invocation PTY with `exec`

[Section titled “Per-invocation PTY with exec”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#per-invocation-pty-with-exec)

Every turn uses the same primitive: open a fresh PTY in the sandbox, then have its shell `exec` the Kimi command. The `exec` is essential rather than a detail. It makes Kimi replace the shell process instead of running underneath it, so there is no shell prompt or echoed command wrapping Kimi’s output, and the PTY closes the moment Kimi exits, which is how the controller detects the turn finished:

```
private async attach(command: string): Promise<number | undefined> {

  this.decoder = new TextDecoder('utf-8')

  this.passthrough = false

  this.launchBuffer = ''

  const pty = await this.sandbox.process.createPty({

    id: `kimi-pty-${Date.now()}`,

    cols: process.stdout.columns || 120,

    rows: process.stdout.rows || 30,

    onData: (data: Uint8Array) => this.forward(data),

  })

  this.pty = pty

  try {

    await pty.waitForConnection()

    await pty.sendInput(`cd ${WORK_DIR}; printf '\\n%s\\n' '${READY}'; exec ${command}\n`)

    const result = await pty.wait()

    return result.exitCode

  } finally {

    this.pty = null

    try {

      await pty.disconnect()

    } catch {

      // Ignore disconnect errors on an already-closed PTY.

    }

  }

}
```

That single launch line (`cd` to the workspace, print a readiness marker, then `exec`) is the only shell command the PTY ever runs. After `exec`, Kimi owns the terminal.

Unlike agents that need an interactive login, no phase here ever bridges your keyboard into the sandbox: the API key went in at create time, and each turn’s prompt travels as a command-line argument, so every invocation is fully headless. The controller does keep a handle to the PTY of the turn in flight (`this.pty`), so a Ctrl+C mid-turn can kill the running process cleanly before the sandbox is deleted.

#### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#hiding-the-launch-line) Hiding the launch line

[Section titled “Hiding the launch line”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#hiding-the-launch-line)

Before `exec` runs, the sandbox shell prints the launch command back on its own stdout. This is the same behavior any interactive shell has: it echoes the command it has just received. The sandbox PTY’s stdout is what we receive over `onData`, so those bytes flow back to us alongside Kimi’s real output. To keep the screen clean and show only what Kimi prints, the data handler buffers PTY output until it sees the readiness marker, then forwards every subsequent byte untouched:

```
private forward(data: Uint8Array): void {

  const text = this.decoder.decode(data, { stream: true })

  if (this.passthrough) {

    process.stdout.write(text)

    return

  }

  this.launchBuffer += text

  const m = READY_RE.exec(this.launchBuffer)

  if (m) {

    const rest = this.launchBuffer.slice(m.index + m[0].length)

    this.passthrough = true

    this.launchBuffer = ''

    if (rest) process.stdout.write(rest)

  } else if (this.launchBuffer.length > 8192) {

    this.launchBuffer = this.launchBuffer.slice(-READY.length - 2)

  }

}
```

The marker text ends up in the stream **twice**: once inside the echoed command (wrapped in single quotes: `printf '\n%s\n' '__DAYTONA_KIMI_READY__'; exec …`), and once as the actual `printf` output (on its own line surrounded by newlines). The regex `(^|[\r\n])__DAYTONA_KIMI_READY__[\r\n]` locks onto the real one by requiring a line break (or buffer start) immediately before **and** after the marker - the echoed copy has quotes on both sides, so it never matches. The character class is `[\r\n]` rather than `\n` because a PTY rewrites every `\n` as `\r\n` on the way out. The marker can also be split across two reads, so the handler simply keeps appending and re-runs the regex after every chunk.

The `else if` is a safety cap so the buffer cannot grow unbounded if the marker never arrives. The `8192` value is picked arbitrarily - far above the few hundred bytes of shell-echo we actually receive, so it never fires in practice, while still bounding memory if something goes wrong upstream. When the cap does fire, the buffer is trimmed but the last `READY.length + 2` bytes are kept rather than thrown out completely (`slice(-READY.length - 2)`). That keep-window is the maximum possible length of a regex match - one leading `\r` or `\n`, plus the marker, plus one trailing `\r` or `\n` \- so any partial marker sitting at the buffer’s tail when the trim runs is preserved intact for the next chunk to complete.

#### [\#](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/\#running-a-turn-with-conversation-continuity) Running a turn (with conversation continuity)

[Section titled “Running a turn (with conversation continuity)”](https://www.daytona.io/docs/en/guides/kimi/kimi-cli-run-tasks-stream-logs-sandbox/#running-a-turn-with-conversation-continuity)

Each prompt is a one-shot, headless Kimi invocation. `-p` processes a single prompt and exits, and `--yolo` (aliases: `-y`, `--yes`, `--auto-approve`) auto-approves tool calls so the run never blocks on a confirmation. The first turn starts a fresh session; every turn after it adds `-C`, which continues the most recent session from the working directory - so context carries from one prompt to the next (see the [Kimi CLI documentation](https://moonshotai.github.io/kimi-cli/en/) for the full flag reference):

```
async processPrompt(prompt: string): Promise<void> {

  const cont = this.resumable ? ' -C' : ''

  const exitCode = await this.attach(`${KIMI} -p ${this.shellQuote(prompt)} --yolo${cont}`)

  // Kimi exits 0 even when the turn itself fails (and failed turns still create a

  // resumable session), so unlike a success check this gate only distinguishes "the

  // CLI ran to completion" from "the launch failed or the turn was killed" - the

  // two cases where a later -C might have no session to continue.

  if (exitCode === 0) this.resumable = true

  process.stdout.write('\n')

}
```

There is no stdin bridge and no raw mode here; the controller streams Kimi’s output as it works. The turn ends when Kimi exits, which resolves `pty.wait()` and lets the readline loop prompt you again. Note the comment above the exit-code gate: Kimi exits `0` even when a turn fails, so judge a turn by its streamed output, not its exit code - the gate exists only to keep a later `-C` from pointing at a session that was never created. Continuity works because Kimi persists each session in the sandbox keyed by the directory it ran in, and every turn runs in the same `WORK_DIR`, so the most recent session from this directory is always the previous turn. The `To resume this session: ...` footer Kimi prints after each turn is part of its raw output - the sample streams it as-is and carries context with `-C` alone.

**Key advantages:**

- The same experience as running Kimi in your own terminal, because Kimi owns the PTY with no shell wrapping
- Fully headless: the API key is injected at sandbox creation, so there is no browser login or device flow to complete
- No permission prompts during a task (`--yolo`)
- Multi-turn continuity: `-C` carries conversation context across turns, so the agent remembers earlier prompts
- All agent code execution happens inside an isolated Daytona sandbox
- Automatic cleanup on exit