---
url: "https://www.daytona.io/docs/en/python-sdk/sync/process/"
title: "Process | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/sync/process/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk/sync/process.md)Open

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#process) Process

[Section titled “Process”](https://www.daytona.io/docs/en/python-sdk/sync/process/#process)

```
class Process()
```

Handles process and code execution within a Sandbox.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#process__init__) Process.\_\_init\_\_

[Section titled “Process.\_\_init\_\_”](https://www.daytona.io/docs/en/python-sdk/sync/process/#process__init__)

```
def __init__(language: str, api_client: ProcessApi, http_client: httpx.Client)
```

Initialize a new Process instance.

**Arguments**:

- `api_client` _ProcessApi_ \- API client for process operations.
- `http_client` \- Shared httpx.Client whose connection pool the WS upgrade reuses.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processexec) Process.exec

[Section titled “Process.exec”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processexec)

```
@intercept_errors(message_prefix="Failed to execute command: ")

@with_instrumentation()

def exec(command: str,

         cwd: str | None = None,

         env: dict[str, str] | None = None,

         timeout: int | None = None) -> ExecuteResponse
```

Execute a shell command in the Sandbox.

**Arguments**:

- `command` _str_ \- Shell command to execute.
- `cwd` _str \| None_ \- Working directory for command execution. If not
specified, uses the sandbox working directory.
- `env` _dict\[str, str\] \| None_ \- Environment variables to set for the command.
- `timeout` _int \| None_ \- Maximum time in seconds to wait for the command
to complete.

**Returns**:

- `ExecuteResponse`\- Command execution results containing:

  - exit\_code: The command’s exit status
  - result: Standard output from the command
  - artifacts: ExecutionArtifacts object containing `stdout` (same as result)
    and `charts` (matplotlib charts metadata)

**Example**:

```
# Simple command

response = sandbox.process.exec("echo 'Hello'")

print(response.artifacts.stdout)  # Prints: Hello

# Command with working directory

result = sandbox.process.exec("ls", cwd="workspace/src")

# Command with timeout

result = sandbox.process.exec("sleep 10", timeout=5)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processcode_run) Process.code\_run

[Section titled “Process.code\_run”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processcode_run)

```
@with_instrumentation()

def code_run(code: str,

             params: CodeRunParams | None = None,

             timeout: int | None = None) -> ExecuteResponse
```

Executes code in the Sandbox using the appropriate language runtime.

**Arguments**:

- `code` _str_ \- Code to execute.
- `params` _CodeRunParams \| None_ \- Parameters for code execution.
- `timeout` _int \| None_ \- Maximum time in seconds to wait for the code
to complete.

**Returns**:

- `ExecuteResponse`\- Code execution result containing:

  - exit\_code: The execution’s exit status
  - result: Standard output from the code
  - artifacts: ExecutionArtifacts object containing `stdout` (same as result)
    and `charts` (matplotlib charts metadata)

**Example**:

```
# Run Python code

response = sandbox.process.code_run('''

    x = 10

    y = 20

    print(f"Sum: {x + y}")

''')

print(response.artifacts.stdout)  # Prints: Sum: 30
```

Matplotlib charts are automatically detected and returned in the `charts` field
of the `ExecutionArtifacts` object.

```
code = '''

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

'''

response = sandbox.process.code_run(code)

chart = response.artifacts.charts[0]

print(f"Type: {chart.type}")

print(f"Title: {chart.title}")

if chart.type == ChartType.LINE and isinstance(chart, LineChart):

    print(f"X Label: {chart.x_label}")

    print(f"Y Label: {chart.y_label}")

    print(f"X Ticks: {chart.x_ticks}")

    print(f"X Tick Labels: {chart.x_tick_labels}")

    print(f"X Scale: {chart.x_scale}")

    print(f"Y Ticks: {chart.y_ticks}")

    print(f"Y Tick Labels: {chart.y_tick_labels}")

    print(f"Y Scale: {chart.y_scale}")

    print("Elements:")

    for element in chart.elements:

        print(f"Label: {element.label}")

        print(f"Points: {element.points}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processcreate_session) Process.create\_session

[Section titled “Process.create\_session”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processcreate_session)

```
@intercept_errors(message_prefix="Failed to create session: ")

@with_instrumentation()

def create_session(session_id: str,

                   request_timeout: float | None = None) -> None
```

Creates a new long-running background session in the Sandbox.

Sessions are background processes that maintain state between commands, making them ideal for
scenarios requiring multiple related commands or persistent environment setup. You can run
long-running commands and monitor process status.

**Arguments**:

- `session_id` _str_ \- Unique identifier for the new session.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Create a new session

session_id = "my-session"

sandbox.process.create_session(session_id)

session = sandbox.process.get_session(session_id)

# Do work...

sandbox.process.delete_session(session_id)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processget_session) Process.get\_session

[Section titled “Process.get\_session”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processget_session)

```
@intercept_errors(message_prefix="Failed to get session: ")

def get_session(session_id: str,

                request_timeout: float | None = None) -> Session
```

Gets a session in the Sandbox.

**Arguments**:

- `session_id` _str_ \- Unique identifier of the session to retrieve.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `Session`\- Session information including:

  - session\_id: The session’s unique identifier
  - commands: List of commands executed in the session

**Example**:

```
session = sandbox.process.get_session("my-session")

for cmd in session.commands:

    print(f"Command: {cmd.command}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processget_entrypoint_session) Process.get\_entrypoint\_session

[Section titled “Process.get\_entrypoint\_session”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processget_entrypoint_session)

```
@intercept_errors(message_prefix="Failed to get sandbox entrypoint session: ")

def get_entrypoint_session(request_timeout: float | None = None) -> Session
```

Gets the sandbox entrypoint session.

**Arguments**:

- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `Session`\- Entrypoint session information including:

  - session\_id: The entrypoint session’s unique identifier
  - commands: List of commands executed in the entrypoint session

**Example**:

```
session = sandbox.process.get_entrypoint_session()

for cmd in session.commands:

    print(f"Command: {cmd.command}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processget_session_command) Process.get\_session\_command

[Section titled “Process.get\_session\_command”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processget_session_command)

```
@intercept_errors(message_prefix="Failed to get session command: ")

@with_instrumentation()

def get_session_command(session_id: str,

                        command_id: str,

                        request_timeout: float | None = None) -> Command
```

Gets information about a specific command executed in a session.

**Arguments**:

- `session_id` _str_ \- Unique identifier of the session.
- `command_id` _str_ \- Unique identifier of the command.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `Command`\- Command information including:

  - id: The command’s unique identifier
  - command: The executed command string
  - exit\_code: Command’s exit status (if completed)

**Example**:

```
cmd = sandbox.process.get_session_command("my-session", "cmd-123")

if cmd.exit_code == 0:

    print(f"Command {cmd.command} completed successfully")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processexecute_session_command) Process.execute\_session\_command

[Section titled “Process.execute\_session\_command”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processexecute_session_command)

```
@intercept_errors(message_prefix="Failed to execute session command: ")

@with_instrumentation()

def execute_session_command(

        session_id: str,

        req: SessionExecuteRequest,

        timeout: int | None = None) -> SessionExecuteResponse
```

Executes a command in the session.

**Arguments**:

- `session_id` _str_ \- Unique identifier of the session to use.
- `req` _SessionExecuteRequest_\- Command execution request containing:

  - command: The command to execute
  - run\_async: Whether to execute asynchronously

**Returns**:

- `SessionExecuteResponse`\- Command execution results containing:

  - cmd\_id: Unique identifier for the executed command
  - output: Combined command output (stdout and stderr) (if synchronous execution)
  - stdout: Standard output from the command
  - stderr: Standard error from the command
  - exit\_code: Command exit status (if synchronous execution)

**Example**:

```
# Execute commands in sequence, maintaining state

session_id = "my-session"

# Change directory

req = SessionExecuteRequest(command="cd /workspace")

sandbox.process.execute_session_command(session_id, req)

# Create a file

req = SessionExecuteRequest(command="echo 'Hello' > test.txt")

sandbox.process.execute_session_command(session_id, req)

# Read the file

req = SessionExecuteRequest(command="cat test.txt")

result = sandbox.process.execute_session_command(session_id, req)

print(f"Command stdout: {result.stdout}")

print(f"Command stderr: {result.stderr}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processget_session_command_logs) Process.get\_session\_command\_logs

[Section titled “Process.get\_session\_command\_logs”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processget_session_command_logs)

```
@intercept_errors(message_prefix="Failed to get session command logs: ")

@with_instrumentation()

def get_session_command_logs(

        session_id: str,

        command_id: str,

        request_timeout: float | None = None) -> SessionCommandLogsResponse
```

Get the logs for a command executed in a session.

**Arguments**:

- `session_id` _str_ \- Unique identifier of the session.
- `command_id` _str_ \- Unique identifier of the command.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `SessionCommandLogsResponse`\- Command logs including:

  - output: Combined command output (stdout and stderr)
  - stdout: Standard output from the command
  - stderr: Standard error from the command

**Example**:

```
logs = sandbox.process.get_session_command_logs(

    "my-session",

    "cmd-123"

)

print(f"Command stdout: {logs.stdout}")

print(f"Command stderr: {logs.stderr}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processget_session_command_logs_async) Process.get\_session\_command\_logs\_async

[Section titled “Process.get\_session\_command\_logs\_async”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processget_session_command_logs_async)

```
@intercept_errors(message_prefix="Failed to get session command logs: ")

async def get_session_command_logs_async(

        session_id: str, command_id: str, on_stdout: OutputHandler[str],

        on_stderr: OutputHandler[str]) -> None
```

Asynchronously retrieves and processes the logs for a command executed in a session as they become available.

Accepts both sync and async callbacks. Async callbacks are awaited.
Blocking synchronous operations inside callbacks may cause WebSocket
disconnections — use async callbacks and async libraries to avoid this.

**Arguments**:

- `session_id` _str_ \- Unique identifier of the session.
- `command_id` _str_ \- Unique identifier of the command.
- `on_stdout` _OutputHandler\[str\]_ \- Callback function to handle stdout log chunks as they arrive.
- `on_stderr` _OutputHandler\[str\]_ \- Callback function to handle stderr log chunks as they arrive.

**Example**:

```
await sandbox.process.get_session_command_logs_async(

    "my-session",

    "cmd-123",

    lambda log: print(f"[STDOUT]: {log}"),

    lambda log: print(f"[STDERR]: {log}"),

)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processget_entrypoint_logs) Process.get\_entrypoint\_logs

[Section titled “Process.get\_entrypoint\_logs”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processget_entrypoint_logs)

```
@intercept_errors(message_prefix="Failed to get entrypoint logs: ")

@with_instrumentation()

def get_entrypoint_logs(

        request_timeout: float | None = None) -> SessionCommandLogsResponse
```

Get the logs for the entrypoint session.

**Arguments**:

- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `SessionCommandLogsResponse`\- Command logs including:

  - output: Combined command output (stdout and stderr)
  - stdout: Standard output from the command
  - stderr: Standard error from the command

**Example**:

```
logs = sandbox.process.get_entrypoint_logs()

print(f"Command stdout: {logs.stdout}")

print(f"Command stderr: {logs.stderr}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processget_entrypoint_logs_async) Process.get\_entrypoint\_logs\_async

[Section titled “Process.get\_entrypoint\_logs\_async”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processget_entrypoint_logs_async)

```
@intercept_errors(message_prefix="Failed to get entrypoint logs: ")

async def get_entrypoint_logs_async(on_stdout: OutputHandler[str],

                                    on_stderr: OutputHandler[str]) -> None
```

Asynchronously retrieves and processes the logs for the entrypoint session as they become available.

**Arguments**:

on\_stdout OutputHandler\[str\]: Callback function to handle stdout log chunks as they arrive.
on\_stderr OutputHandler\[str\]: Callback function to handle stderr log chunks as they arrive.

**Example**:

```
await sandbox.process.get_entrypoint_logs_async(

    lambda log: print(f"[STDOUT]: {log}"),

    lambda log: print(f"[STDERR]: {log}"),

)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processsend_session_command_input) Process.send\_session\_command\_input

[Section titled “Process.send\_session\_command\_input”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processsend_session_command_input)

```
@intercept_errors(message_prefix="Failed to send session command input: ")

def send_session_command_input(session_id: str,

                               command_id: str,

                               data: str,

                               request_timeout: float | None = None) -> None
```

Sends input data to a command executed in a session.

**Arguments**:

- `session_id` _str_ \- Unique identifier of the session.
- `command_id` _str_ \- Unique identifier of the command.
- `data` _str_ \- Input data to send.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processlist_sessions) Process.list\_sessions

[Section titled “Process.list\_sessions”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processlist_sessions)

```
@intercept_errors(message_prefix="Failed to list sessions: ")

@with_instrumentation()

def list_sessions(request_timeout: float | None = None) -> list[Session]
```

Lists all sessions in the Sandbox.

**Arguments**:

- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `list[Session]` \- List of all sessions in the Sandbox.

**Example**:

```
sessions = sandbox.process.list_sessions()

for session in sessions:

    print(f"Session {session.session_id}:")

    print(f"  Commands: {len(session.commands)}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processdelete_session) Process.delete\_session

[Section titled “Process.delete\_session”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processdelete_session)

```
@intercept_errors(message_prefix="Failed to delete session: ")

@with_instrumentation()

def delete_session(session_id: str,

                   request_timeout: float | None = None) -> None
```

Terminates and removes a session from the Sandbox, cleaning up any resources
associated with it.

**Arguments**:

- `session_id` _str_ \- Unique identifier of the session to delete.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Create and use a session

sandbox.process.create_session("temp-session")

# ... use the session ...

# Clean up when done

sandbox.process.delete_session("temp-session")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processcreate_pty_session) Process.create\_pty\_session

[Section titled “Process.create\_pty\_session”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processcreate_pty_session)

```
@intercept_errors(message_prefix="Failed to create PTY session: ")

@with_instrumentation()

def create_pty_session(id: str,

                       cwd: str | None = None,

                       envs: dict[str, str] | None = None,

                       pty_size: PtySize | None = None) -> PtyHandle
```

Creates a new PTY (pseudo-terminal) session in the Sandbox.

Creates an interactive terminal session that can execute commands and handle user input.
The PTY session behaves like a real terminal, supporting features like command history.

**Arguments**:

- `id` \- Unique identifier for the PTY session. Must be unique within the Sandbox.
- `cwd` \- Working directory for the PTY session. Defaults to the sandbox’s working directory.
- `env` \- Environment variables to set in the PTY session. These will be merged with
the Sandbox’s default environment variables.
- `pty_size` \- Terminal size configuration. Defaults to 80x24 if not specified.

**Returns**:

- `PtyHandle` \- Handle for managing the created PTY session. Use this to send input,
receive output, resize the terminal, and manage the session lifecycle.

**Raises**:

- `DaytonaError` \- If the PTY session creation fails or the session ID is already in use.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processconnect_pty_session) Process.connect\_pty\_session

[Section titled “Process.connect\_pty\_session”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processconnect_pty_session)

```
@intercept_errors(message_prefix="Failed to connect PTY session: ")

@with_instrumentation()

def connect_pty_session(session_id: str) -> PtyHandle
```

Connects to an existing PTY session in the Sandbox.

Establishes a WebSocket connection to an existing PTY session, allowing you to
interact with a previously created terminal session.

**Arguments**:

- `session_id` \- Unique identifier of the PTY session to connect to.

**Returns**:

- `PtyHandle` \- Handle for managing the connected PTY session.

**Raises**:

- `DaytonaError` \- If the PTY session doesn’t exist or connection fails.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processlist_pty_sessions) Process.list\_pty\_sessions

[Section titled “Process.list\_pty\_sessions”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processlist_pty_sessions)

```
@intercept_errors(message_prefix="Failed to list PTY sessions: ")

@with_instrumentation()

def list_pty_sessions(

        request_timeout: float | None = None) -> list[PtySessionInfo]
```

Lists all PTY sessions in the Sandbox.

Retrieves information about all PTY sessions in this Sandbox.

**Arguments**:

- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `list[PtySessionInfo]` \- List of PTY session information objects containing
details about each session’s state, creation time, and configuration.

**Example**:

```
# List all PTY sessions

sessions = sandbox.process.list_pty_sessions()

for session in sessions:

    print(f"Session ID: {session.id}")

    print(f"Active: {session.active}")

    print(f"Created: {session.created_at}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processget_pty_session_info) Process.get\_pty\_session\_info

[Section titled “Process.get\_pty\_session\_info”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processget_pty_session_info)

```
@intercept_errors(message_prefix="Failed to get PTY session info: ")

@with_instrumentation()

def get_pty_session_info(

        session_id: str,

        request_timeout: float | None = None) -> PtySessionInfo
```

Gets detailed information about a specific PTY session.

Retrieves comprehensive information about a PTY session including its current state,
configuration, and metadata.

**Arguments**:

- `session_id` \- Unique identifier of the PTY session to retrieve information for.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `PtySessionInfo` \- Detailed information about the PTY session including ID, state,
creation time, working directory, environment variables, and more.

**Raises**:

- `DaytonaError` \- If the PTY session doesn’t exist.

**Example**:

```
# Get details about a specific PTY session

session_info = sandbox.process.get_pty_session_info("my-session")

print(f"Session ID: {session_info.id}")

print(f"Active: {session_info.active}")

print(f"Working Directory: {session_info.cwd}")

print(f"Terminal Size: {session_info.cols}x{session_info.rows}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processkill_pty_session) Process.kill\_pty\_session

[Section titled “Process.kill\_pty\_session”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processkill_pty_session)

```
@intercept_errors(message_prefix="Failed to kill PTY session: ")

@with_instrumentation()

def kill_pty_session(session_id: str,

                     request_timeout: float | None = None) -> None
```

Kills a PTY session and terminates its associated process.

Forcefully terminates the PTY session and cleans up all associated resources.
This will close any active connections and kill the underlying shell process.
This operation is irreversible. Any unsaved work in the terminal session will be lost.

**Arguments**:

- `session_id` \- Unique identifier of the PTY session to kill.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Raises**:

- `DaytonaError` \- If the PTY session doesn’t exist or cannot be killed.

**Example**:

```
# Kill a specific PTY session

sandbox.process.kill_pty_session("my-session")

# Verify the session no longer exists

pty_sessions = sandbox.process.list_pty_sessions()

for pty_session in pty_sessions:

    print(f"PTY session: {pty_session.id}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#processresize_pty_session) Process.resize\_pty\_session

[Section titled “Process.resize\_pty\_session”](https://www.daytona.io/docs/en/python-sdk/sync/process/#processresize_pty_session)

```
@intercept_errors(message_prefix="Failed to resize PTY session: ")

@with_instrumentation()

def resize_pty_session(session_id: str,

                       pty_size: PtySize,

                       request_timeout: float | None = None) -> PtySessionInfo
```

Resizes a PTY session’s terminal dimensions.

Changes the terminal size of an active PTY session. This is useful when the
client terminal is resized or when you need to adjust the display for different
output requirements.

**Arguments**:

- `session_id` \- Unique identifier of the PTY session to resize.
- `pty_size` \- New terminal dimensions containing the desired columns and rows.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `PtySessionInfo` \- Updated session information reflecting the new terminal size.

**Raises**:

- `DaytonaError` \- If the PTY session doesn’t exist or resize operation fails.

**Example**:

```
from daytona.common.pty import PtySize

# Resize a PTY session to a larger terminal

new_size = PtySize(rows=40, cols=150)

updated_info = sandbox.process.resize_pty_session("my-session", new_size)

print(f"Terminal resized to {updated_info.cols}x{updated_info.rows}")

# You can also use the PtyHandle's resize method

pty_handle.resize(new_size)
```

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#coderunparams) CodeRunParams

[Section titled “CodeRunParams”](https://www.daytona.io/docs/en/python-sdk/sync/process/#coderunparams)

```
@dataclass

class CodeRunParams()
```

Parameters for code execution.

**Attributes**:

- `argv` _list\[str\] \| None_ \- Command line arguments
- `env` _dict\[str, str\] \| None_ \- Environment variables

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#sessionexecuterequest) SessionExecuteRequest

[Section titled “SessionExecuteRequest”](https://www.daytona.io/docs/en/python-sdk/sync/process/#sessionexecuterequest)

```
class SessionExecuteRequest(ApiSessionExecuteRequest,

                            AsyncApiSessionExecuteRequest)
```

Contains the request for executing a command in a session.

**Attributes**:

- `command` _str_ \- The command to execute.
- `run_async` _bool \| None_ \- Whether to execute the command asynchronously.
- `var_async` _bool \| None_ \- Deprecated. Use `run_async` instead.
- `suppress_input_echo` _bool \| None_ \- Whether to suppress input echo. Default is `False`.

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#executionartifacts) ExecutionArtifacts

[Section titled “ExecutionArtifacts”](https://www.daytona.io/docs/en/python-sdk/sync/process/#executionartifacts)

```
@dataclass

class ExecutionArtifacts()
```

Artifacts from the command execution.

**Attributes**:

- `stdout` _str_ \- Standard output from the command, same as `result` in `ExecuteResponse`
- `charts` _list\[Chart\] \| None_ \- List of chart metadata from matplotlib

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#executeresponse) ExecuteResponse

[Section titled “ExecuteResponse”](https://www.daytona.io/docs/en/python-sdk/sync/process/#executeresponse)

```
class ExecuteResponse(BaseModel)
```

Response from the command execution.

**Attributes**:

- `exit_code` _int_ \- The exit code from the command execution
- `result` _str_ \- The output from the command execution
- `artifacts` _ExecutionArtifacts \| None_ \- Artifacts from the command execution

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#sessionexecuteresponse) SessionExecuteResponse

[Section titled “SessionExecuteResponse”](https://www.daytona.io/docs/en/python-sdk/sync/process/#sessionexecuteresponse)

```
class SessionExecuteResponse(ApiSessionExecuteResponse)
```

Response from the session command execution.

**Attributes**:

- `cmd_id` _str_ \- The ID of the executed command
- `stdout` _str \| None_ \- The stdout from the command execution
- `stderr` _str \| None_ \- The stderr from the command execution
- `output` _str_ \- The output from the command execution
- `exit_code` _int_ \- The exit code from the command execution

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#sessioncommandlogsresponse) SessionCommandLogsResponse

[Section titled “SessionCommandLogsResponse”](https://www.daytona.io/docs/en/python-sdk/sync/process/#sessioncommandlogsresponse)

```
@dataclass

class SessionCommandLogsResponse()
```

Response from the command logs.

**Attributes**:

- `output` _str \| None_ \- The combined output from the command
- `stdout` _str \| None_ \- The stdout from the command
- `stderr` _str \| None_ \- The stderr from the command

##### [\#](https://www.daytona.io/docs/en/python-sdk/sync/process/\#outputhandler) OutputHandler

[Section titled “OutputHandler”](https://www.daytona.io/docs/en/python-sdk/sync/process/#outputhandler)

```
OutputHandler = Callable[[T], None] | Callable[[T], Awaitable[None]]
```

Callback type that accepts both sync and async handlers.

Blocking synchronous operations inside handlers may cause WebSocket disconnections.