---
url: "https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/"
title: "Run AWS Kiro's CLI in a Daytona Sandbox and Stream Its Output | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#_top)

# Run AWS Kiro's CLI in a Daytona Sandbox and Stream Its Output

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox.md)Open

This guide runs [AWS Kiro’s CLI](https://kiro.dev/docs/cli/) inside a Daytona sandbox. You log in to Kiro once over a real terminal, then send it prompts and watch its output stream straight back to you. Because Kiro works entirely inside the sandbox, it can edit files, install packages, and run code in an isolated, disposable environment that is thrown away when you finish. The only thing running on your own machine is a small Node.js controller that wires your terminal to the sandbox.

* * *

### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#1-workflow-overview)

When you launch the main module, a Daytona sandbox is created and the Kiro CLI is installed inside it. You then log in once over a sandbox PTY (Kiro’s device flow works on any plan, including the free tier), after which each prompt is run headlessly as `kiro-cli chat --no-interactive --trust-all-tools "<prompt>"`. Turns after the first add `--resume` so the conversation carries context from one prompt to the next.

Every phase that talks to Kiro uses the same trick. Opening a PTY starts a shell in the sandbox; rather than run Kiro as a child of that shell, the controller tells the shell to `exec` Kiro, which makes Kiro take over the shell’s process. This buys two things. First, the output you see is exactly what Kiro prints, with no shell prompt or echoed command around it, so it looks the same as running Kiro in your own terminal. Second, because Kiro replaced the shell, the PTY closes the moment Kiro exits, which is how the controller knows a turn has finished and can prompt you again.

You can keep interacting with your agent until you are finished. When you exit the program, the sandbox is deleted automatically.

### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#clone-the-repository)

First, clone the daytona [repository](https://github.com/daytona/guides.git) and navigate to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/typescript/kiro/kiro-cli
```

#### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#configure-environment)

You need:

- **Daytona API key:** [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
- **Kiro account:** any plan, including the free tier ( [Kiro app](https://app.kiro.dev/)). No Kiro API key is required; you log in interactively when the sandbox starts.

Copy `.env.example` to `.env` and add your Daytona key:

```
DAYTONA_API_KEY=your_daytona_key
```

#### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#local-usage) Local Usage

[Section titled “Local Usage”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#local-usage)

Install dependencies:

```
npm install
```

Run the agent:

```
npm run start
```

The agent will start and wait for your prompt.

### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#3-example-usage) 3\. Example Usage

[Section titled “3. Example Usage”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#3-example-usage)

Ask the agent to write and run some code. Here it signs in via device flow on the free tier, then writes a JavaScript program that renders a 3D donut as ASCII art with surface-normal shading, runs it, and streams the rendered output back to your terminal live:

```
$ npm run start

Creating sandbox...

Installing Kiro CLI...

Starting Kiro CLI...

Log in to Kiro to continue (any plan works, including the free tier).

Pick a provider, open the URL that appears below, and approve the sign-in in your browser.

? Select login method ›

❯ Use with Builder ID

  Use with Google

  Use with GitHub

  Use with Your Organization

Confirm the following code in the browser

Code: ABCD-EFGH

Open this URL: https://view.awsapps.com/start/#/device?user_code=ABCD-EFGH

Logging in... done

Agent ready. Press Ctrl+C at any time to exit.

User: Write donut.js that renders a 3D donut/torus as static ASCII art (roughly 80×24), with shading by surface normals against a fixed light direction. Use the characters .,-~:;=!*#$@ from darkest to brightest. Then run it with node donut.js and show the output.

I'll create the following file: /home/daytona/donut.js (using tool: write)

Creating: /home/daytona/donut.js

 - Completed in 0.0s

I will run the following command: node donut.js (using tool: shell)

                                   $$$$$$$$$$$

                             $$$$$####*****####$$$$$

                          $$$$$##**!=*!!!!!*=!**##$$$$$

                       !$$$$$$#**!!===;;:;;===!!**#$$$$$$

                      *$$$$$$##*=;;:--,...,--:;;=*##$$$$$$*

                     *#$$$$$$##*!;-,.... ....,~;!*##$$$$$$#*

                    ;*##$$$$$$##*=:.         .:=*##$$$$$$##*;

                    ;*##$$$$$$$$##*!         !*##$$$$$$$###*;

                    :!*##$$$$$$$$$$$$#######$$$$$$$$$$$$##*!:

                    ~=!**###$$$$$$$$$$$$$$$$$$$$$$$$$###**!=:

                     :!!!**####$$$$$$$$$$$$$$$$$$$####**!=!;

                      ~==!!!***######$$$$$$$######***!!!==:

                       .:;=!!*!******************!!!!!=;:,

                         .~:;;=!=!***********!!==!=;;:~,

                            .,~::;;;;=======;;;;:~~-

                                  .,---------,.

 - Completed in 0.32s

The shading uses .,-~:;=!*#$@ (dark→bright) based on the dot product of each surface normal with the light direction (0, 1, -1). The $ and # characters on the lit upper-left face the light most directly, while . and , appear on the darker lower portions.

User:
```

### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#4-understanding-the-script) 4\. Understanding the Script

[Section titled “4. Understanding the Script”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#4-understanding-the-script)

This example consists of two parts: a main program (`src/index.ts`) that manages the sandbox and a command-line loop, and a session class (`src/session.ts`) that drives each Kiro invocation over its own PTY.

#### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#initialization) Initialization

[Section titled “Initialization”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#initialization)

On startup, the script:

1. Creates a new [Daytona sandbox](https://www.daytona.io/docs/en/sandboxes).
2. Installs the Kiro CLI in the sandbox and confirms the binary with `kiro-cli --version`.
3. Logs you in via Kiro’s device flow over a fresh PTY.
4. Enters a readline loop where each prompt is a headless `kiro-cli chat --no-interactive` turn in its own PTY.
5. On Ctrl+C, restores stdin, deletes the sandbox, and exits.

#### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#creating-the-sandbox) Creating the Sandbox

[Section titled “Creating the Sandbox”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#creating-the-sandbox)

The installer always drops the binary at `$HOME/.local/bin/kiro-cli`, but that directory is not always on the sandbox shell’s `PATH`, and the installer’s exit code is not a reliable success signal. So the script confirms the install by running the binary directly with `"$HOME/.local/bin/kiro-cli" --version`. It uses the full path rather than a bare `kiro-cli` because whether `~/.local/bin` is on `PATH` varies between shell types and sandbox configurations, so a full path works regardless. The install’s combined stdout and stderr is surfaced on failure for diagnostics:

```
sandbox = await daytona.create()

const install = await sandbox.process.executeCommand(

  'curl -fsSL https://cli.kiro.dev/install | bash 2>&1',

)

const version = await sandbox.process.executeCommand('"$HOME/.local/bin/kiro-cli" --version')

if (version.exitCode !== 0) {

  throw new Error(

    'Kiro CLI did not install correctly.\n' +

      `Install output:\n${install.result}\n` +

      `Version check output:\n${version.result}`,

  )

}
```

#### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#per-invocation-pty-with-exec) Per-invocation PTY with `exec`

[Section titled “Per-invocation PTY with exec”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#per-invocation-pty-with-exec)

Every phase that talks to Kiro uses the same primitive: open a fresh PTY in the sandbox, then have its shell `exec` the Kiro command. The `exec` is essential rather than a detail. It makes Kiro replace the shell process instead of running underneath it, so there is no shell prompt or echoed command wrapping Kiro’s output, and the PTY closes the moment Kiro exits, which is how the controller detects the turn finished:

```
private async attach(command: string, interactive: boolean): Promise<number | undefined> {

  // Every phase opens a fresh PTY, so reset the per-invocation stream state first: a clean

  // decoder, and passthrough/launchBuffer back to their pre-marker state so this turn's

  // launch-line filtering never inherits leftover state from the previous turn.

  this.decoder = new TextDecoder('utf-8')

  this.passthrough = false

  this.launchBuffer = ''

  const pty = await this.sandbox.process.createPty({

    id: `kiro-pty-${Date.now()}`,

    cols: process.stdout.columns || 120,

    rows: process.stdout.rows || 30,

    onData: (data: Uint8Array) => this.forward(data),

  })

  await pty.waitForConnection()

  await pty.sendInput(`cd ${WORK_DIR}; printf '\\n%s\\n' '${READY}'; exec ${command}\n`)

  const stdin = process.stdin

  const onStdin = (chunk: Buffer) => void pty.sendInput(chunk)

  if (interactive) {

    while (stdin.read() !== null) { /* drain buffered bytes from the prior step */ }

    if (stdin.isTTY) stdin.setRawMode(true)

    stdin.resume()

    stdin.on('data', onStdin)

  }

  try {

    const result = await pty.wait()

    return result.exitCode

  } finally {

    if (interactive) {

      stdin.removeListener('data', onStdin)

      if (stdin.isTTY) stdin.setRawMode(false)

      stdin.pause()

    }

    await pty.disconnect()

  }

}
```

That single launch line (`cd` to the workspace, print a readiness marker, then `exec`) is the only shell command the PTY ever runs. After `exec`, Kiro owns the terminal.

For the interactive login, the controller bridges your local keyboard into the PTY in four steps:

1. **Drain stale input** with `while (stdin.read() !== null) {}`. Any bytes left buffered from a previous step are discarded so they are not accidentally fed into this command.
2. **Switch the terminal to raw mode** with `setRawMode(true)`. Normally the terminal collects a whole line at a time and handles editing and echo locally. Raw mode turns that off, so each keystroke is delivered immediately and is not printed twice (once by your local terminal, once by Kiro echoing it back). This is what makes Kiro’s arrow-key provider selector work.
3. **Resume stdin** with `stdin.resume()`. Node keeps a stdin stream paused until something listens to it, so resuming is what actually starts the bytes flowing.
4. **Register the forwarder** with `stdin.on('data', ...)`, which ships every chunk you type straight into the sandbox PTY where Kiro reads it.

Headless turns (`--no-interactive`) skip all of this. Kiro reads its prompt from the command arguments, so it needs no keyboard input.

#### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#hiding-the-launch-line) Hiding the launch line

[Section titled “Hiding the launch line”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#hiding-the-launch-line)

Before `exec` runs, the sandbox shell prints the launch command back on its own stdout. This is the same behavior any interactive shell has: it echoes the command it has just received. The sandbox PTY’s stdout is what we receive over `onData`, so those bytes flow back to us alongside Kiro’s real output. To keep the screen clean and show only what Kiro prints, the data handler buffers PTY output until it sees the readiness marker, then forwards every subsequent byte untouched:

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

The marker text ends up in the stream **twice**: once inside the echoed command (wrapped in single quotes: `printf '\n%s\n' '__DAYTONA_KIRO_READY__'; exec …`), and once as the actual `printf` output (on its own line surrounded by newlines). The regex `(^|[\r\n])__DAYTONA_KIRO_READY__[\r\n]` locks onto the real one by requiring a line break (or buffer start) immediately before _and_ after the marker - the echoed copy has quotes on both sides, so it never matches. The character class is `[\r\n]` rather than `\n` because a PTY rewrites every `\n` as `\r\n` on the way out. The marker can also be split across two reads, so the handler simply keeps appending and re-runs the regex after every chunk.

The `else if` is a safety cap so the buffer cannot grow unbounded if the marker never arrives. The `8192` value is picked arbitrarily - far above the few hundred bytes of shell-echo we actually receive, so it never fires in practice, while still bounding memory if something goes wrong upstream. When the cap does fire, the buffer is trimmed but the last `READY.length + 2` bytes are kept rather than thrown out completely (`slice(-READY.length - 2)`). That keep-window is the maximum possible length of a regex match - one leading `\r` or `\n`, plus the marker, plus one trailing `\r` or `\n` \- so any partial marker that happens to be sitting at the buffer’s tail when the trim runs is preserved intact. For example, if the buffer ends with `\r\n__DAYTONA_KIRO_READY__` and is waiting for the closing `\r\n` from the next chunk, keeping the last `READY.length + 2` bytes ensures the partial is still there when the next chunk arrives so the regex can complete the match.

#### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#logging-in) Logging in

[Section titled “Logging in”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#logging-in)

Kiro’s default login opens a browser on the machine the CLI runs on. A sandbox has no browser, so the session uses `--use-device-flow` instead: Kiro shows a provider selector, then prints a URL and a one-time code and polls AWS while you approve the sign-in in your own browser. The interactive stdin bridge is what makes the provider selection work; the poll afterward needs no input. After the command exits, `kiro-cli whoami` is the source of truth for whether the login actually succeeded:

```
async login(): Promise<void> {

  await this.attach(`${KIRO} login --use-device-flow`, true)

  const status = await this.sandbox.process.executeCommand(`${KIRO} whoami`)

  if (status.exitCode !== 0) {

    throw new Error(

      'Kiro login did not complete. Re-run and approve the sign-in when prompted.\n' +

        `kiro-cli whoami (exit ${status.exitCode}):\n${status.result}`,

    )

  }

}
```

Kiro persists the session inside the sandbox (`~/.local/share/kiro-cli/data.sqlite3`), so this is a one-time login: every later headless turn reuses it with no further prompts.

#### [\#](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/\#running-a-turn-with-conversation-continuity) Running a turn (with conversation continuity)

[Section titled “Running a turn (with conversation continuity)”](https://www.daytona.io/docs/en/guides/kiro/kiro-cli-run-tasks-stream-logs-sandbox/#running-a-turn-with-conversation-continuity)

Each prompt is a one-shot, non-interactive Kiro invocation. `--no-interactive` prints the response and exits, and `--trust-all-tools` auto-approves tool calls so the run never blocks on a permission prompt. The first turn starts a fresh conversation; every turn after it adds `--resume`, which continues the most recent conversation from the working directory - so context carries from one prompt to the next:

```
async processPrompt(prompt: string): Promise<void> {

  const resume = this.resumable ? '--resume ' : ''

  const exitCode = await this.attach(

    `${KIRO} chat --no-interactive --trust-all-tools ${resume}${this.shellQuote(prompt)}`,

    false,

  )

  // Only become resumable after a turn succeeds; a failed first turn creates no conversation.

  if (exitCode === 0) this.resumable = true

  process.stdout.write('\n')

}
```

There is no stdin bridge and no raw mode here; the controller simply streams Kiro’s output as it works. The turn ends when Kiro exits, which resolves `pty.wait()` and lets the readline loop prompt you again. Note that `resumable` only flips to `true` after a turn exits cleanly (exit code `0`): a failed turn may never create the conversation on disk, so guarding on the exit code keeps the next turn from passing `--resume` against a conversation that does not exist. Continuity works because Kiro persists each conversation in the sandbox keyed by the directory it ran in, and every turn runs in the same `WORK_DIR`, so “the most recent conversation from this directory” is always the previous turn. (Tell it your name on one turn, ask for it back on the next, and it remembers.)

**Key advantages:**

- The same experience as running Kiro in your own terminal, because Kiro owns the PTY with no shell wrapping
- Works on any Kiro plan, including the free tier (interactive device-flow login, no API key required)
- No permission prompts during a task (`--no-interactive --trust-all-tools`)
- Multi-turn continuity: `--resume` carries conversation context across turns, so the agent remembers earlier prompts
- One-time login per sandbox; later headless turns reuse the stored session
- All agent code execution happens inside an isolated Daytona sandbox
- Automatic cleanup on exit