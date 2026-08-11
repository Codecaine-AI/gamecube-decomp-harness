---
url: "https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/"
title: "Run the Devin CLI in a Daytona Sandbox | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#_top)

# Run the Devin CLI in a Daytona Sandbox

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox.md)Open

This guide runs [Cognition’s Devin CLI](https://docs.devin.ai/cli) inside a Daytona sandbox. You log in to Devin once over a real terminal, then send it prompts and get its output back in your terminal. Because Devin works entirely inside the sandbox, it can edit files, install packages, and run code in an isolated, disposable environment that is thrown away when you finish. The only thing running on your own machine is a small Node.js controller that wires your terminal to the sandbox.

* * *

### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#1-workflow-overview)

When you launch the main module, a Daytona sandbox is created and the Devin CLI is installed inside it. You then log in once over a sandbox PTY (Devin’s manual-token flow works on any plan, including the free tier) and dismiss Devin’s one-time onboarding wizard, after which each prompt is run headlessly as `devin -p "<prompt>" --permission-mode dangerous`. Turns after the first add `--continue` so the conversation carries context from one prompt to the next.

Every phase that talks to Devin uses the same trick. Opening a PTY starts a shell in the sandbox; rather than run Devin as a child of that shell, the controller tells the shell to `exec` Devin, which makes Devin take over the shell’s process. This buys two things. First, the output you see is exactly what Devin prints, with no shell prompt or echoed command around it, so it looks the same as running Devin in your own terminal. Second, because Devin replaced the shell, the PTY closes the moment Devin exits, which is how the controller knows a turn has finished and can prompt you again.

You can keep interacting with your agent until you are finished. When you exit the program, the sandbox is deleted automatically.

### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#clone-the-repository)

First, clone the daytona [repository](https://github.com/daytona/guides.git) and navigate to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/typescript/cognition/devin-cli
```

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#configure-environment)

You need:

- **Daytona API key:** [Daytona Dashboard](https://app.daytona.io/dashboard/keys)
- **Devin account:** any plan, including the free tier ( [Devin app](https://app.devin.ai/)). No Devin API key is required; you log in interactively when the sandbox starts.

Copy `.env.example` to `.env` and add your Daytona key:

```
DAYTONA_API_KEY=your_daytona_key
```

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#local-usage) Local Usage

[Section titled “Local Usage”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#local-usage)

Install dependencies:

```
npm install
```

Run the agent:

```
npm run start
```

The agent will start and wait for your prompt.

### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#3-example-usage) 3\. Example Usage

[Section titled “3. Example Usage”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#3-example-usage)

Ask the agent to write and run some code. Here it implements Myers’ diff algorithm (the line diff at the heart of `git diff`), writes a pytest suite, and runs everything inside the sandbox:

```
$ npm run start

Creating sandbox...

Installing Devin CLI...

Starting Devin CLI...

Log in to Devin to continue (any plan works, including the free tier).

Open the URL that appears below, sign in, and paste the code back here.

Visit https://app.devin.ai/auth/cli/continue?state=...&code_challenge=...&code_challenge_method=S256 to sign in, then copy the code and paste it below.

Code:

❭ Paste the code from the sign-in page

Enter submit  Esc cancel

Login successful! Credentials stored.

Finishing one-time Devin setup. Use the arrow keys and choose "Skip for now" if you do not need a Git provider.

Welcome to Devin CLI!

Logged in as you@example.com.

✓ Organization: My Team

You're all set. Run devin to get started.

Agent ready. Press Ctrl+C at any time to exit.

User: Write a Python module mydiff.py implementing Myers' diff algorithm to compute the line-level diff between two text strings, producing a minimal edit script. Add a CLI that takes two file paths and prints a git-style diff with - for removed lines, + for added lines, and a space for context. Create two sample files (old.txt and new.txt) holding a short Python function before and after a refactor. Run the diff CLI on them and show the output. Add a pytest suite covering empty inputs, identical inputs, full replacement, and a known small case with a known minimal edit script. Run the tests.

I've successfully implemented Myers' diff algorithm with all requested features. Here's a summary:

## Created Files

1. **mydiff.py** - Complete implementation including:

   - Myers' diff algorithm for computing minimal edit scripts

   - CLI with argparse for git-style diff output

   - Support for context lines (default 3, configurable with `-U` flag)

   - Edit class representing operations (delete, insert, equal)

2. **old.txt** - Sample Python function before refactoring

3. **new.txt** - Refactored version with simplified logic

4. **test_mydiff.py** - Comprehensive pytest suite with 11 tests covering:

   - Empty inputs

   - Identical inputs

   - Full replacement

   - Known small case with verified minimal edit script

   - Insert at beginning

   - Delete at end

   - Empty old/new files

   - Format diff with context

   - Minimal edit script property verification

   - Complex refactor scenario

## Sample Diff Output

Running `python mydiff.py old.txt new.txt` produces:

@@ -1,26 +1,11 @@

 def calculate_user_score(user_data):

-    if user_data is None:

+    if not user_data:

         return 0

-    base_score = 0

-    if user_data.get('is_active', False):

-        base_score = base_score + 10

-    else:

-        base_score = base_score + 5

+    score = 0

+    score += 15 if user_data.get('is_active') else 5

+    score += 20 if user_data.get('is_premium') else 0

+    score += 15 if user_data.get('login_count', 0) > 10 else 5

+    score += 10 if user_data.get('has_profile_pic') else 0

-    if user_data.get('is_premium', False):

-        base_score = base_score + 20

-    else:

-        base_score = base_score + 0

-

-    if user_data.get('login_count', 0) > 10:

-        base_score = base_score + 15

-    else:

-        base_score = base_score + 5

-

-    if user_data.get('has_profile_pic', False):

-        base_score = base_score + 10

-    else:

-        base_score = base_score + 0

-

-    return base_score

+    return score

## Test Results

All 11 tests passed successfully:

============================== 11 passed in 0.05s ==============================

The implementation correctly handles edge cases, produces minimal edit scripts, and displays git-style diffs with proper context.

User:
```

### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#4-understanding-the-script) 4\. Understanding the Script

[Section titled “4. Understanding the Script”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#4-understanding-the-script)

This example consists of two parts: a main program (`src/index.ts`) that manages the sandbox and a command-line loop, and a session class (`src/session.ts`) that drives each Devin invocation over its own PTY.

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#initialization) Initialization

[Section titled “Initialization”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#initialization)

On startup, the script:

1. Creates a new [Daytona sandbox](https://www.daytona.io/docs/en/sandboxes).
2. Installs the Devin CLI in the sandbox and confirms the binary with `devin --version`.
3. Logs you in via Devin’s manual-token flow over a fresh PTY.
4. Runs Devin’s one-time onboarding wizard (interactive) so you can skip it once.
5. Enters a readline loop where each prompt is a headless `devin -p` turn in its own PTY.
6. On Ctrl+C, restores stdin, deletes the sandbox, and exits.

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#creating-the-sandbox) Creating the Sandbox

[Section titled “Creating the Sandbox”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#creating-the-sandbox)

That installer finishes by launching Devin’s interactive onboarding wizard, which needs a terminal. The install runs without one, so the wizard bails out and the install command exits with an error code even though the `devin` binary itself installed fine. Because that exit code is unreliable, the script confirms the install by running the binary directly with `"$HOME/.local/bin/devin" --version`. It uses the full path rather than a bare `devin` because whether `~/.local/bin` is on `PATH` varies between shell types and sandbox configurations, so a full path works regardless. The install’s combined stdout and stderr is surfaced on failure for diagnostics:

```
sandbox = await daytona.create()

const install = await sandbox.process.executeCommand(

  'curl -fsSL https://cli.devin.ai/install.sh | bash 2>&1',

)

const version = await sandbox.process.executeCommand('"$HOME/.local/bin/devin" --version')

if (version.exitCode !== 0) {

  throw new Error(

    'Devin CLI did not install correctly.\n' +

      `Install output:\n${install.result}\n` +

      `Version check output:\n${version.result}`,

  )

}
```

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#per-invocation-pty-with-exec) Per-invocation PTY with `exec`

[Section titled “Per-invocation PTY with exec”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#per-invocation-pty-with-exec)

Every phase that talks to Devin uses the same primitive: open a fresh PTY in the sandbox, then have its shell `exec` the Devin command. The `exec` is essential rather than a detail. It makes Devin replace the shell process instead of running underneath it, so there is no shell prompt or echoed command wrapping Devin’s output, and the PTY closes the moment Devin exits, which is how the controller detects the turn finished:

```
private async attach(command: string, interactive: boolean): Promise<number | undefined> {

  // Every phase opens a fresh PTY, so reset the per-invocation stream state first: a clean

  // decoder, and passthrough/launchBuffer back to their pre-marker state so this turn's

  // launch-line filtering never inherits leftover state from the previous turn.

  this.decoder = new TextDecoder('utf-8')

  this.passthrough = false

  this.launchBuffer = ''

  const pty = await this.sandbox.process.createPty({

    id: `devin-pty-${Date.now()}`,

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

That single launch line (`cd` to the workspace, print a readiness marker, then `exec`) is the only shell command the PTY ever runs. After `exec`, Devin owns the terminal.

For interactive commands (login and setup), the controller bridges your local keyboard into the PTY in four steps:

1. **Drain stale input** with `while (stdin.read() !== null) {}`. Any bytes left buffered from a previous step, such as the trailing newline after you pasted a login code, are discarded so they are not accidentally fed into this command.
2. **Switch the terminal to raw mode** with `setRawMode(true)`. Normally the terminal collects a whole line at a time and handles editing and echo locally. Raw mode turns that off, so each keystroke is delivered immediately and is not printed twice (once by your local terminal, once by Devin echoing it back).
3. **Resume stdin** with `stdin.resume()`. Node keeps a stdin stream paused until something listens to it, so resuming is what actually starts the bytes flowing.
4. **Register the forwarder** with `stdin.on('data', ...)`, which ships every chunk you type straight into the sandbox PTY where Devin reads it.

Headless turns (`-p`) skip all of this. Devin reads its prompt from the command arguments, so it needs no keyboard input.

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#hiding-the-launch-line) Hiding the launch line

[Section titled “Hiding the launch line”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#hiding-the-launch-line)

Before `exec` runs, the sandbox shell (zsh) prints the launch command back on its own stdout. This is the same behavior any interactive shell has: it echoes the command it has just received so a human at the terminal can see what is about to run. The sandbox PTY’s stdout is what we receive over `onData`, so those bytes flow back to us alongside Devin’s real output. To keep the screen clean and show only what Devin prints, the data handler buffers PTY output until it sees the readiness marker, then forwards every subsequent byte untouched:

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

There are two independent things to handle here, solved by two independent pieces of the function above.

The first is that the marker text `__DAYTONA_DEVIN_READY__` ends up in the stream **twice**: once inside the echoed command (where it sits in the middle of a longer line, wrapped in single quotes: `printf '\n%s\n' '__DAYTONA_DEVIN_READY__'; exec …`), and once as the actual `printf` output (where it lands on its own line surrounded by newlines: `\r\n__DAYTONA_DEVIN_READY__\r\n`). We need to ignore the echoed copy and lock onto the `printf` copy. The regex `(^|[\r\n])__DAYTONA_DEVIN_READY__[\r\n]` does that simply by requiring a line break (or buffer start) immediately before _and_ immediately after the marker text. The echoed copy has single-quotes on both sides, so the regex never matches it; the `printf` copy has line breaks on both sides, so the regex matches. The character class is `[\r\n]` rather than just `\n` because a PTY rewrites every `\n` as `\r\n` on the way out, so the newlines around the real marker arrive as carriage-return-plus-line-feed pairs.

The second thing is that the real marker can be split across two reads. PTY output arrives in arbitrary chunks, so a single `forward` call may receive only the first half of the marker bytes, with the second half landing in the next call. There is no detection logic for this case; the function simply keeps appending to `launchBuffer` and re-runs the regex after every chunk, so the match will land whenever the marker becomes complete.

The `else if` branch covers the unlikely case where the marker never arrives at all. Without it, `launchBuffer` would grow unbounded. `8192` is an arbitrary safety threshold: realistic shell-echo preludes are a few hundred bytes, so this should never fire in practice; it just has to be small enough that runaway growth is impossible. When it does fire, the buffer is trimmed but the last `READY.length + 2` bytes are kept rather than thrown out completely. That covers the case where a partial marker happens to sit at the end of the buffer right when the trim runs. For example, if the buffer ends with `\r\n__DAYTONA_DEVIN_READY__` and is waiting for the closing `\r\n` from the next chunk, keeping the last `READY.length + 2` bytes ensures the partial marker is still there when the next chunk arrives, so the regex can complete the match.

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#logging-in) Logging in

[Section titled “Logging in”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#logging-in)

Devin’s default login opens a browser on the same machine the CLI runs on and waits for it to redirect back. A sandbox has no browser and no way to receive that redirect, so the session uses `--force-manual-token-flow` instead: Devin prints a URL and blocks reading from its stdin. The “wait” is just Devin’s `read()` blocking on the PTY, with no polling loop. The interactive stdin bridge is what makes the paste work: whatever you type into your local terminal flows raw into the sandbox PTY where Devin reads it. After the command exits, `devin auth status` is the source of truth for whether the login actually succeeded:

```
async login(): Promise<void> {

  await this.attach(`${DEVIN} auth login --force-manual-token-flow`, true)

  const status = await this.sandbox.process.executeCommand(`${DEVIN} auth status`)

  if (status.exitCode !== 0) {

    throw new Error(`devin auth status failed (exit ${status.exitCode}):\n${status.result}`)

  }

  if (/not logged in/i.test(status.result ?? '')) {

    throw new Error('Devin login did not complete. Re-run and paste a valid code when prompted.')

  }

}
```

Because the terminal is in raw mode, `Ctrl+C` is not turned into a local interrupt signal. It arrives as a raw `0x03` byte and is forwarded into the PTY, so Devin receives it exactly as if you had pressed `Ctrl+C` in the sandbox terminal it is running in. Devin exits, `auth status` then reports “not logged in”, and the controller throws cleanly.

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#one-time-setup) One-time setup

[Section titled “One-time setup”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#one-time-setup)

The installer normally finishes by running Devin’s `setup` wizard (the “Connect a Git provider” menu). That wizard needs an interactive terminal, but the install runs through `executeCommand`, which has no terminal attached, so the wizard cannot draw its menu and is skipped. Left alone, it would resurface the first time you run `devin -p` and block the turn. The controller runs it explicitly right after login so you dismiss it once, and later headless turns are not interrupted by onboarding:

```
async setup(): Promise<void> {

  await this.attach(`${DEVIN} setup`, true)

}
```

Pick “Skip for now” if you do not need a Git provider; Devin records `setup_complete` on disk and every later run goes straight to the task.

#### [\#](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/\#running-a-turn-with-conversation-continuity) Running a turn (with conversation continuity)

[Section titled “Running a turn (with conversation continuity)”](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox/#running-a-turn-with-conversation-continuity)

Each prompt is a one-shot, non-interactive Devin invocation. `-p` runs Devin in print mode and `--permission-mode dangerous` auto-approves tool calls so the run never blocks on a permission prompt. The first turn starts a fresh session; every turn after it adds `--continue`, which resumes the most recent session from the working directory, so context carries from one prompt to the next:

```
async processPrompt(prompt: string): Promise<void> {

  const cont = this.resumable ? ' --continue' : ''

  const exitCode = await this.attach(

    `${DEVIN} -p ${this.shellQuote(prompt)} --permission-mode dangerous${cont}`,

    false,

  )

  // Only become resumable after a turn succeeds; a failed first turn creates no session.

  if (exitCode === 0) this.resumable = true

  process.stdout.write('\n')

}
```

There is no stdin bridge and no raw mode here; the controller forwards Devin’s output to your terminal. The turn ends when Devin exits, which resolves `pty.wait()` and lets the readline loop prompt you again. Note that `resumable` only flips to `true` after a turn exits cleanly (exit code `0`): a failed turn may never create the session on disk, so guarding on the exit code keeps the next turn from passing `--continue` against a session that does not exist. Continuity works because Devin persists each session in the sandbox keyed by the directory it ran in, and every turn runs in the same `WORK_DIR`, so the most recent session from this directory is always the previous turn.

**Key advantages:**

- The same experience as running Devin in your own terminal, because Devin owns the PTY with no shell wrapping
- Works on any Devin plan, including the free tier (interactive login, no API key required)
- No permission prompts during a task (`--permission-mode dangerous`)
- Multi-turn continuity: `--continue` carries conversation context across turns, so the agent remembers earlier prompts
- One-time onboarding handled explicitly so headless turns never get blocked by the wizard
- All agent code execution happens inside an isolated Daytona sandbox
- Automatic cleanup on exit