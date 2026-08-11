---
url: "https://www.daytona.io/docs/en/typescript-sdk/process/"
title: "Process | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/process/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/process.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#coderunparams) CodeRunParams

[Section titled “CodeRunParams”](https://www.daytona.io/docs/en/typescript-sdk/process/#coderunparams)

Parameters for code execution.

**Properties**:

- `argv?` _string\[\]_ \- Command line arguments
- `env?` _Record<string, string>_ \- Environment variables

### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/process/#constructors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#new-coderunparams) new CodeRunParams()

[Section titled “new CodeRunParams()”](https://www.daytona.io/docs/en/typescript-sdk/process/#new-coderunparams)

```
new CodeRunParams(): CodeRunParams
```

**Returns**:

- `CodeRunParams`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#process) Process

[Section titled “Process”](https://www.daytona.io/docs/en/typescript-sdk/process/#process)

Handles process and code execution within a Sandbox.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#constructors-1) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/process/#constructors-1)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#new-process) new Process()

[Section titled “new Process()”](https://www.daytona.io/docs/en/typescript-sdk/process/#new-process)

```
new Process(

   clientConfig: Configuration,

   apiClient: ProcessApi,

   getPreviewToken: () => Promise<string>,

   language?: string,

   requestTimeoutMs?: number): Process
```

**Parameters**:

- `clientConfig` _Configuration_
- `apiClient` _ProcessApi_
- `getPreviewToken` _() =\> Promise<string>_
- `language?` _string_
- `requestTimeoutMs?` _number_

**Returns**:

- `Process`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/process/#methods)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#coderun) codeRun()

[Section titled “codeRun()”](https://www.daytona.io/docs/en/typescript-sdk/process/#coderun)

```
codeRun(

   code: string,

   params?: CodeRunParams,

timeout?: number): Promise<ExecuteResponse>
```

Executes code in the Sandbox using the appropriate language runtime.

**Parameters**:

- `code` _string_ \- Code to execute
- `params?` _CodeRunParams_ \- Parameters for code execution
- `timeout?` _number_ \- Maximum time in seconds to wait for execution to complete. The execution is
terminated when it elapses. The HTTP request waits for the full timeout, even beyond
the client-wide `requestTimeoutMs`; `0` disables the server-side limit.

**Returns**:

- `Promise<ExecuteResponse>`\- Code execution results containing:

  - exitCode: The execution’s exit status
  - result: Standard output from the code
  - artifacts: ExecutionArtifacts object containing `stdout` (same as result) and `charts` (matplotlib charts metadata)

**Examples:**

```
// Run TypeScript code

const response = await process.codeRun(`

  const x = 10;

  const y = 20;

  console.log(\`Sum: \${x + y}\`);

`);

console.log(response.artifacts.stdout);  // Prints: Sum: 30
```

```
// Run Python code with matplotlib

const response = await process.codeRun(`

import matplotlib.pyplot as plt

import numpy as np

x = np.linspace(0, 10, 30)

y = np.sin(x)

plt.figure(figsize=(8, 5))

plt.plot(x, y, 'b-', linewidth=2)

plt.title('Line Chart')

plt.xlabel('X-axis (seconds)')

plt.ylabel('Y-axis (amplitude)')

plt.grid(True)

plt.show()

`);

if (response.artifacts?.charts) {

  const chart = response.artifacts.charts[0];

  console.log(`Type: ${chart.type}`);

  console.log(`Title: ${chart.title}`);

  if (chart.type === ChartType.LINE) {

    const lineChart = chart as LineChart

    console.log('X Label:', lineChart.x_label)

    console.log('Y Label:', lineChart.y_label)

    console.log('X Ticks:', lineChart.x_ticks)

    console.log('Y Ticks:', lineChart.y_ticks)

    console.log('X Tick Labels:', lineChart.x_tick_labels)

    console.log('Y Tick Labels:', lineChart.y_tick_labels)

    console.log('X Scale:', lineChart.x_scale)

    console.log('Y Scale:', lineChart.y_scale)

    console.log('Elements:')

    console.dir(lineChart.elements, { depth: null })

  }

}
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#connectpty) connectPty()

[Section titled “connectPty()”](https://www.daytona.io/docs/en/typescript-sdk/process/#connectpty)

```
connectPty(sessionId: string, options?: PtyConnectOptions): Promise<PtyHandle>
```

Connect to an existing PTY session in the sandbox.

Establishes a WebSocket connection to an existing PTY session, allowing you to
interact with a previously created terminal session.

**Parameters**:

- `sessionId` _string_ \- ID of the PTY session to connect to
- `options?` _PtyConnectOptions_ \- Options for the connection including data handler

**Returns**:

- `Promise<PtyHandle>` \- PTY handle for managing the session

**Example:**

```
// Connect to an existing PTY session

const handle = await process.connectPty('my-session', {

  onData: (data) => {

    // Handle terminal output

    const text = new TextDecoder().decode(data);

    process.stdout.write(text);

  },

});

// Wait for connection to be established

await handle.waitForConnection();

// Send commands to the existing session

await handle.sendInput('pwd\n');

await handle.sendInput('ls -la\n');

await handle.sendInput('exit\n');

// Wait for completion

const result = await handle.wait();

console.log(`Session exited with code: ${result.exitCode}`);

// Clean up

await handle.disconnect();
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#createpty) createPty()

[Section titled “createPty()”](https://www.daytona.io/docs/en/typescript-sdk/process/#createpty)

```
createPty(options?: PtyCreateOptions & PtyConnectOptions): Promise<PtyHandle>
```

Create a new PTY (pseudo-terminal) session in the sandbox.

Creates an interactive terminal session that can execute commands and handle user input.
The PTY session behaves like a real terminal, supporting features like command history.

**Parameters**:

- `options?` _PtyCreateOptions & PtyConnectOptions_ \- PTY session configuration including creation and connection options

**Returns**:

- `Promise<PtyHandle>` \- PTY handle for managing the session

**Example:**

```
// Create a PTY session with custom configuration

const ptyHandle = await process.createPty({

  id: 'my-interactive-session',

  cwd: '/workspace',

  envs: { TERM: 'xterm-256color', LANG: 'en_US.UTF-8' },

  cols: 120,

  rows: 30,

  onData: (data) => {

    // Handle terminal output

    const text = new TextDecoder().decode(data);

    process.stdout.write(text);

  },

});

// Wait for connection to be established

await ptyHandle.waitForConnection();

// Send commands to the terminal

await ptyHandle.sendInput('ls -la\n');

await ptyHandle.sendInput('echo "Hello, PTY!"\n');

await ptyHandle.sendInput('exit\n');

// Wait for completion and get result

const result = await ptyHandle.wait();

console.log(`PTY session completed with exit code: ${result.exitCode}`);

// Clean up

await ptyHandle.disconnect();
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#createsession) createSession()

[Section titled “createSession()”](https://www.daytona.io/docs/en/typescript-sdk/process/#createsession)

```
createSession(sessionId: string): Promise<void>
```

Creates a new long-running background session in the Sandbox.

Sessions are background processes that maintain state between commands, making them ideal for
scenarios requiring multiple related commands or persistent environment setup. You can run
long-running commands and monitor process status.

**Parameters**:

- `sessionId` _string_ \- Unique identifier for the new session

**Returns**:

- `Promise<void>`

**Example:**

```
// Create a new session

const sessionId = 'my-session';

await process.createSession(sessionId);

const session = await process.getSession(sessionId);

// Do work...

await process.deleteSession(sessionId);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#deletesession) deleteSession()

[Section titled “deleteSession()”](https://www.daytona.io/docs/en/typescript-sdk/process/#deletesession)

```
deleteSession(sessionId: string): Promise<void>
```

Delete a session from the Sandbox.

**Parameters**:

- `sessionId` _string_ \- Unique identifier of the session to delete

**Returns**:

- `Promise<void>`

**Example:**

```
// Clean up a completed session

await process.deleteSession('my-session');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#executecommand) executeCommand()

[Section titled “executeCommand()”](https://www.daytona.io/docs/en/typescript-sdk/process/#executecommand)

```
executeCommand(

   command: string,

   cwd?: string,

   env?: Record<string, string>,

timeout?: number): Promise<ExecuteResponse>
```

Executes a shell command in the Sandbox.

**Parameters**:

- `command` _string_ \- Shell command to execute
- `cwd?` _string_ \- Working directory for command execution. If not specified, uses the sandbox working directory.
- `env?` _Record<string, string>_ \- Environment variables to set for the command
- `timeout?` _number_ \- Maximum time in seconds to wait for the command to complete. The command is
terminated when it elapses. The HTTP request waits for the full timeout, even beyond
the client-wide `requestTimeoutMs`; `0` disables the server-side limit.

**Returns**:

- `Promise<ExecuteResponse>`\- Command execution results containing:

  - exitCode: The command’s exit status
  - result: Standard output from the command
  - artifacts: ExecutionArtifacts object containing `stdout` (same as result) and `charts` (matplotlib charts metadata)

**Examples:**

```
// Simple command

const response = await process.executeCommand('echo "Hello"');

console.log(response.artifacts.stdout);  // Prints: Hello
```

```
// Command with working directory

const result = await process.executeCommand('ls', 'workspace/src');
```

```
// Command with timeout

const result = await process.executeCommand('sleep 10', undefined, 5);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#executesessioncommand) executeSessionCommand()

[Section titled “executeSessionCommand()”](https://www.daytona.io/docs/en/typescript-sdk/process/#executesessioncommand)

```
executeSessionCommand(

   sessionId: string,

   req: SessionExecuteRequest,

timeout?: number): Promise<SessionExecuteResponse>
```

Executes a command in an existing session.

**Parameters**:

- `sessionId` _string_ \- Unique identifier of the session to use
- `req` _SessionExecuteRequest_\- Command execution request containing:

  - command: The command to execute
  - runAsync: Whether to execute asynchronously
  - suppressInputEcho: Whether to suppress input echo. Default is `false`.
- `timeout?` _number_ \- Timeout in seconds

**Returns**:

- `Promise<SessionExecuteResponse>`\- Command execution results containing:

  - cmdId: Unique identifier for the executed command
  - output: Combined command output (stdout and stderr) (if synchronous execution)
  - stdout: Standard output from the command
  - stderr: Standard error from the command
  - exitCode: Command exit status (if synchronous execution)

**Example:**

```
// Execute commands in sequence, maintaining state

const sessionId = 'my-session';

// Change directory

await process.executeSessionCommand(sessionId, {

  command: 'cd /home/daytona'

});

// Run command in new directory

const result = await process.executeSessionCommand(sessionId, {

  command: 'pwd'

});

console.log('[STDOUT]:', result.stdout);

console.log('[STDERR]:', result.stderr);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#getentrypointlogs) getEntrypointLogs()

[Section titled “getEntrypointLogs()”](https://www.daytona.io/docs/en/typescript-sdk/process/#getentrypointlogs)

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#call-signature) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/process/#call-signature)

```
getEntrypointLogs(): Promise<SessionCommandLogsResponse>
```

Get the logs for the sandbox entrypoint session.

**Returns**:

- `Promise<SessionCommandLogsResponse>` \- Command logs containing: output (combined stdout and stderr), stdout and stderr

**Example:**

```
const logs = await process.getEntrypointLogs();

console.log('[STDOUT]:', logs.stdout);

console.log('[STDERR]:', logs.stderr);
```

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#call-signature-1) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/process/#call-signature-1)

```
getEntrypointLogs(onStdout: (chunk: string) => void, onStderr: (chunk: string) => void): Promise<void>
```

Asynchronously retrieve and process the logs for the entrypoint session as they become available.

**Parameters**:

- `onStdout` _(chunk: string) => void_ \- Callback function to handle stdout log chunks
- `onStderr` _(chunk: string) => void_ \- Callback function to handle stderr log chunks

**Returns**:

- `Promise<void>`

**Example:**

```
const logs = await process.getEntrypointLogs((chunk) => {

  console.log('[STDOUT]:', chunk);

}, (chunk) => {

  console.log('[STDERR]:', chunk);

});
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#getentrypointsession) getEntrypointSession()

[Section titled “getEntrypointSession()”](https://www.daytona.io/docs/en/typescript-sdk/process/#getentrypointsession)

```
getEntrypointSession(): Promise<Session>
```

Get the sandbox entrypoint session

**Returns**:

- `Promise<Session>`\- Entrypoint session information including:

  - sessionId: The entrypoint session’s unique identifier
  - commands: List of commands executed in the entrypoint session

**Example:**

```
const session = await process.getEntrypointSession();

session.commands.forEach(cmd => {

  console.log(`Command: ${cmd.command}`);

});
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#getptysessioninfo) getPtySessionInfo()

[Section titled “getPtySessionInfo()”](https://www.daytona.io/docs/en/typescript-sdk/process/#getptysessioninfo)

```
getPtySessionInfo(sessionId: string): Promise<PtySessionInfo>
```

Get detailed information about a specific PTY session.

Retrieves comprehensive information about a PTY session including its current state,
configuration, and metadata.

**Parameters**:

- `sessionId` _string_ \- ID of the PTY session to retrieve information for

**Returns**:

- `Promise<PtySessionInfo>` \- PTY session information

**Throws**:

If the PTY session doesn’t exist

**Example:**

```
// Get details about a specific PTY session

const session = await process.getPtySessionInfo('my-session');

console.log(`Session ID: ${session.id}`);

console.log(`Active: ${session.active}`);

console.log(`Working Directory: ${session.cwd}`);

console.log(`Terminal Size: ${session.cols}x${session.rows}`);

if (session.processId) {

  console.log(`Process ID: ${session.processId}`);

}
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#getsession) getSession()

[Section titled “getSession()”](https://www.daytona.io/docs/en/typescript-sdk/process/#getsession)

```
getSession(sessionId: string): Promise<Session>
```

Get a session in the sandbox.

**Parameters**:

- `sessionId` _string_ \- Unique identifier of the session to retrieve

**Returns**:

- `Promise<Session>`\- Session information including:

  - sessionId: The session’s unique identifier
  - commands: List of commands executed in the session

**Example:**

```
const session = await process.getSession('my-session');

session.commands.forEach(cmd => {

  console.log(`Command: ${cmd.command}`);

});
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#getsessioncommand) getSessionCommand()

[Section titled “getSessionCommand()”](https://www.daytona.io/docs/en/typescript-sdk/process/#getsessioncommand)

```
getSessionCommand(sessionId: string, commandId: string): Promise<Command>
```

Gets information about a specific command executed in a session.

**Parameters**:

- `sessionId` _string_ \- Unique identifier of the session
- `commandId` _string_ \- Unique identifier of the command

**Returns**:

- `Promise<Command>`\- Command information including:

  - id: The command’s unique identifier
  - command: The executed command string
  - exitCode: Command’s exit status (if completed)

**Example:**

```
const cmd = await process.getSessionCommand('my-session', 'cmd-123');

if (cmd.exitCode === 0) {

  console.log(`Command ${cmd.command} completed successfully`);

}
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#getsessioncommandlogs) getSessionCommandLogs()

[Section titled “getSessionCommandLogs()”](https://www.daytona.io/docs/en/typescript-sdk/process/#getsessioncommandlogs)

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#call-signature-2) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/process/#call-signature-2)

```
getSessionCommandLogs(sessionId: string, commandId: string): Promise<SessionCommandLogsResponse>
```

Get the logs for a command executed in a session.

**Parameters**:

- `sessionId` _string_ \- Unique identifier of the session
- `commandId` _string_ \- Unique identifier of the command

**Returns**:

- `Promise<SessionCommandLogsResponse>` \- Command logs containing: output (combined stdout and stderr), stdout and stderr

**Example:**

```
const logs = await process.getSessionCommandLogs('my-session', 'cmd-123');

console.log('[STDOUT]:', logs.stdout);

console.log('[STDERR]:', logs.stderr);
```

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#call-signature-3) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/process/#call-signature-3)

```
getSessionCommandLogs(

   sessionId: string,

   commandId: string,

   onStdout: (chunk: string) => void,

onStderr: (chunk: string) => void): Promise<void>
```

Asynchronously retrieve and process the logs for a command executed in a session as they become available.

**Parameters**:

- `sessionId` _string_ \- Unique identifier of the session
- `commandId` _string_ \- Unique identifier of the command
- `onStdout` _(chunk: string) => void_ \- Callback function to handle stdout log chunks
- `onStderr` _(chunk: string) => void_ \- Callback function to handle stderr log chunks

**Returns**:

- `Promise<void>`

**Example:**

```
const logs = await process.getSessionCommandLogs('my-session', 'cmd-123', (chunk) => {

  console.log('[STDOUT]:', chunk);

}, (chunk) => {

  console.log('[STDERR]:', chunk);

});
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#killptysession) killPtySession()

[Section titled “killPtySession()”](https://www.daytona.io/docs/en/typescript-sdk/process/#killptysession)

```
killPtySession(sessionId: string): Promise<void>
```

Kill a PTY session and terminate its associated process.

Forcefully terminates the PTY session and cleans up all associated resources.
This will close any active connections and kill the underlying shell process.

**Parameters**:

- `sessionId` _string_ \- ID of the PTY session to kill

**Returns**:

- `Promise<void>`

**Throws**:

If the PTY session doesn’t exist or cannot be killed

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#note) Note

[Section titled “Note”](https://www.daytona.io/docs/en/typescript-sdk/process/#note)

This operation is irreversible. Any unsaved work in the terminal session will be lost.

**Example:**

```
// Kill a specific PTY session

await process.killPtySession('my-session');

// Verify the session is no longer active

try {

  const info = await process.getPtySessionInfo('my-session');

  console.log(`Session still exists but active: ${info.active}`);

} catch (error) {

  console.log('Session has been completely removed');

}
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#listptysessions) listPtySessions()

[Section titled “listPtySessions()”](https://www.daytona.io/docs/en/typescript-sdk/process/#listptysessions)

```
listPtySessions(): Promise<PtySessionInfo[]>
```

List all PTY sessions in the sandbox.

Retrieves information about all PTY sessions, both active and inactive,
that have been created in this sandbox.

**Returns**:

- `Promise<PtySessionInfo[]>` \- Array of PTY session information

**Example:**

```
// List all PTY sessions

const sessions = await process.listPtySessions();

for (const session of sessions) {

  console.log(`Session ID: ${session.id}`);

  console.log(`Active: ${session.active}`);

  console.log(`Created: ${session.createdAt}`);

  }

  console.log('---');

}
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#listsessions) listSessions()

[Section titled “listSessions()”](https://www.daytona.io/docs/en/typescript-sdk/process/#listsessions)

```
listSessions(): Promise<Session[]>
```

Lists all active sessions in the Sandbox.

**Returns**:

- `Promise<Session[]>` \- Array of active sessions

**Example:**

```
const sessions = await process.listSessions();

sessions.forEach(session => {

  console.log(`Session ${session.sessionId}:`);

  session.commands.forEach(cmd => {

    console.log(`- ${cmd.command} (${cmd.exitCode})`);

  });

});
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#resizeptysession) resizePtySession()

[Section titled “resizePtySession()”](https://www.daytona.io/docs/en/typescript-sdk/process/#resizeptysession)

```
resizePtySession(

   sessionId: string,

   cols: number,

rows: number): Promise<PtySessionInfo>
```

Resize a PTY session’s terminal dimensions.

Changes the terminal size of an active PTY session. This is useful when the
client terminal is resized or when you need to adjust the display for different
output requirements.

**Parameters**:

- `sessionId` _string_ \- ID of the PTY session to resize
- `cols` _number_ \- New number of terminal columns
- `rows` _number_ \- New number of terminal rows

**Returns**:

- `Promise<PtySessionInfo>` \- Updated session information reflecting the new terminal size

**Throws**:

If the PTY session doesn’t exist or resize operation fails

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#note-1) Note

[Section titled “Note”](https://www.daytona.io/docs/en/typescript-sdk/process/#note-1)

The resize operation will send a SIGWINCH signal to the shell process,
allowing terminal applications to adapt to the new size.

**Example:**

```
// Resize a PTY session to a larger terminal

const updatedInfo = await process.resizePtySession('my-session', 150, 40);

console.log(`Terminal resized to ${updatedInfo.cols}x${updatedInfo.rows}`);

// You can also use the PtyHandle's resize method

await ptyHandle.resize(150, 40); // cols, rows
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#sendsessioncommandinput) sendSessionCommandInput()

[Section titled “sendSessionCommandInput()”](https://www.daytona.io/docs/en/typescript-sdk/process/#sendsessioncommandinput)

```
sendSessionCommandInput(

   sessionId: string,

   commandId: string,

data: string): Promise<void>
```

Sends input data to a command executed in a session.

**Parameters**:

- `sessionId` _string_ \- Unique identifier of the session
- `commandId` _string_ \- Unique identifier of the command
- `data` _string_ \- Input data to send

**Returns**:

- `Promise<void>`

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#sessioncommandlogsresponse) SessionCommandLogsResponse

[Section titled “SessionCommandLogsResponse”](https://www.daytona.io/docs/en/typescript-sdk/process/#sessioncommandlogsresponse)

**Properties**:

- `output?` _string_
- `stderr?` _string_
- `stdout?` _string_

## [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#sessionexecuteresponse) SessionExecuteResponse

[Section titled “SessionExecuteResponse”](https://www.daytona.io/docs/en/typescript-sdk/process/#sessionexecuteresponse)

**Extends:**

**Properties**:

- `cmdId` _string_
  - _Inherited from_: `ApiSessionExecuteResponse.cmdId`
- `exitCode?` _number_
  - _Inherited from_: `ApiSessionExecuteResponse.exitCode`
- `output?` _string_
  - _Inherited from_: `ApiSessionExecuteResponse.output`
- `stderr?` _string_

- `stdout?` _string_

- `SessionExecuteResponse`


## [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#max_prefix_len) MAX\_PREFIX\_LEN

[Section titled “MAX\_PREFIX\_LEN”](https://www.daytona.io/docs/en/typescript-sdk/process/#max_prefix_len)

```
const MAX_PREFIX_LEN: number;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#stderr_prefix_bytes) STDERR\_PREFIX\_BYTES

[Section titled “STDERR\_PREFIX\_BYTES”](https://www.daytona.io/docs/en/typescript-sdk/process/#stderr_prefix_bytes)

```
const STDERR_PREFIX_BYTES: Uint8Array<ArrayBuffer>;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/process/\#stdout_prefix_bytes) STDOUT\_PREFIX\_BYTES

[Section titled “STDOUT\_PREFIX\_BYTES”](https://www.daytona.io/docs/en/typescript-sdk/process/#stdout_prefix_bytes)

```
const STDOUT_PREFIX_BYTES: Uint8Array<ArrayBuffer>;
```