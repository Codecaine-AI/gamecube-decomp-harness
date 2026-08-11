---
url: "https://www.daytona.io/docs/en/ruby-sdk/process/"
title: "Process | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/process/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/process.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#process) Process

[Section titled “Process”](https://www.daytona.io/docs/en/ruby-sdk/process/#process)

Initialize a new Process instance

### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/process/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#new-process) new Process()

[Section titled “new Process()”](https://www.daytona.io/docs/en/ruby-sdk/process/#new-process)

```
def initialize(sandbox_id:, toolbox_api:, get_preview_link:, language: 'python', otel_state: nil)
```

Initialize a new Process instance

**Parameters**:

- `sandbox_id` _String_ \- The ID of the Sandbox
- `toolbox_api` _DaytonaToolboxApiClient:ProcessApi_ \- API client for Sandbox operations
- `get_preview_link` _Proc_ \- Function to get preview link for a port
- `language` _String_ \- The language for code execution
- `otel_state` _Daytona:OtelState, nil_ -

**Returns**:

- `Process` \- a new instance of Process

### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/process/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#sandbox_id) sandbox\_id()

[Section titled “sandbox\_id()”](https://www.daytona.io/docs/en/ruby-sdk/process/#sandbox_id)

```
def sandbox_id()
```

**Returns**:

- `String` \- The ID of the Sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#toolbox_api) toolbox\_api()

[Section titled “toolbox\_api()”](https://www.daytona.io/docs/en/ruby-sdk/process/#toolbox_api)

```
def toolbox_api()
```

**Returns**:

- `DaytonaToolboxApiClient:ProcessApi` \- API client for Sandbox operations

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#get_preview_link) get\_preview\_link()

[Section titled “get\_preview\_link()”](https://www.daytona.io/docs/en/ruby-sdk/process/#get_preview_link)

```
def get_preview_link()
```

**Returns**:

- `Proc` \- Function to get preview link for a port

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#language) language()

[Section titled “language()”](https://www.daytona.io/docs/en/ruby-sdk/process/#language)

```
def language()
```

**Returns**:

- `String` \- The language for code execution (e.g. ‘python’, ‘typescript’, ‘javascript’)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#exec) exec()

[Section titled “exec()”](https://www.daytona.io/docs/en/ruby-sdk/process/#exec)

```
def exec(command:, cwd: nil, env: nil, timeout: nil)
```

Execute a shell command in the Sandbox

**Parameters**:

- `command` _String_ \- Shell command to execute
- `cwd` _String, nil_ \- Working directory for command execution. If not specified, uses the sandbox working directory
- `env` _Hash<String, String>, nil_ \- Environment variables to set for the command
- `timeout` _Integer, nil_ \- Maximum time in seconds to wait for the command to complete.

**Returns**:

- `ExecuteResponse` \- Command execution results containing exit\_code, result, and artifacts

**Examples:**

```
# Simple command

response = sandbox.process.exec("echo 'Hello'")

puts response.artifacts.stdout

=> "Hello\n"

# Command with working directory

result = sandbox.process.exec("ls", cwd: "workspace/src")

# Command with timeout

result = sandbox.process.exec("sleep 10", timeout: 5)
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#code_run) code\_run()

[Section titled “code\_run()”](https://www.daytona.io/docs/en/ruby-sdk/process/#code_run)

```
def code_run(code:, params: nil, timeout: nil)
```

Execute code in the Sandbox using the appropriate language runtime

**Parameters**:

- `code` _String_ \- Code to execute
- `params` _CodeRunParams, nil_ \- Parameters for code execution
- `timeout` _Integer, nil_ \- Maximum time in seconds to wait for the code to complete. 0 means wait indefinitely

**Returns**:

- `ExecuteResponse` \- Code execution result containing exit\_code, result, and artifacts

**Examples:**

```
# Run Python code

response = sandbox.process.code_run(<<~CODE)

  x = 10

  y = 20

  print(f"Sum: {x + y}")

CODE

puts response.artifacts.stdout  # Prints: Sum: 30
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#create_session) create\_session()

[Section titled “create\_session()”](https://www.daytona.io/docs/en/ruby-sdk/process/#create_session)

```
def create_session(session_id)
```

Creates a new long-running background session in the Sandbox

Sessions are background processes that maintain state between commands, making them ideal for
scenarios requiring multiple related commands or persistent environment setup.

**Parameters**:

- `session_id` _String_ \- Unique identifier for the new session

**Returns**:

- `void`

**Examples:**

```
# Create a new session

session_id = "my-session"

sandbox.process.create_session(session_id)

session = sandbox.process.get_session(session_id)

# Do work...

sandbox.process.delete_session(session_id)
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#get_session) get\_session()

[Section titled “get\_session()”](https://www.daytona.io/docs/en/ruby-sdk/process/#get_session)

```
def get_session(session_id)
```

Gets a session in the Sandbox

**Parameters**:

- `session_id` _String_ \- Unique identifier of the session to retrieve

**Returns**:

- `DaytonaApiClient:Session` \- Session information including session\_id and commands

**Examples:**

```
session = sandbox.process.get_session("my-session")

session.commands.each do |cmd|

  puts "Command: #{cmd.command}"

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#get_entrypoint_session) get\_entrypoint\_session()

[Section titled “get\_entrypoint\_session()”](https://www.daytona.io/docs/en/ruby-sdk/process/#get_entrypoint_session)

```
def get_entrypoint_session()
```

Gets the Sandbox entrypoint session

**Returns**:

- `DaytonaApiClient:Session` \- Entrypoint session information including session\_id and commands

**Examples:**

```
session = sandbox.process.get_entrypoint_session()

session.commands.each do |cmd|

  puts "Command: #{cmd.command}"

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#get_session_command) get\_session\_command()

[Section titled “get\_session\_command()”](https://www.daytona.io/docs/en/ruby-sdk/process/#get_session_command)

```
def get_session_command(session_id:, command_id:)
```

Gets information about a specific command executed in a session

**Parameters**:

- `session_id` _String_ \- Unique identifier of the session
- `command_id` _String_ \- Unique identifier of the command

**Returns**:

- `DaytonaApiClient:Command` \- Command information including id, command, and exit\_code

**Examples:**

```
cmd = sandbox.process.get_session_command(session_id: "my-session", command_id: "cmd-123")

if cmd.exit_code == 0

  puts "Command #{cmd.command} completed successfully"

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#execute_session_command) execute\_session\_command()

[Section titled “execute\_session\_command()”](https://www.daytona.io/docs/en/ruby-sdk/process/#execute_session_command)

```
def execute_session_command(session_id:, req:)
```

Executes a command in the session

**Parameters**:

- `session_id` _String_ \- Unique identifier of the session to use
- `req` _Daytona:SessionExecuteRequest_ \- Command execution request containing command and run\_async

**Returns**:

- `Daytona:SessionExecuteResponse` \- Command execution results containing cmd\_id, output, stdout, stderr, and exit\_code

**Examples:**

```
# Execute commands in sequence, maintaining state

session_id = "my-session"

# Change directory

req = Daytona::SessionExecuteRequest.new(command: "cd /workspace")

sandbox.process.execute_session_command(session_id:, req:)

# Create a file

req = Daytona::SessionExecuteRequest.new(command: "echo 'Hello' > test.txt")

sandbox.process.execute_session_command(session_id:, req:)

# Read the file

req = Daytona::SessionExecuteRequest.new(command: "cat test.txt")

result = sandbox.process.execute_session_command(session_id:, req:)

puts "Command stdout: #{result.stdout}"

puts "Command stderr: #{result.stderr}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#get_session_command_logs) get\_session\_command\_logs()

[Section titled “get\_session\_command\_logs()”](https://www.daytona.io/docs/en/ruby-sdk/process/#get_session_command_logs)

```
def get_session_command_logs(session_id:, command_id:)
```

Get the logs for a command executed in a session

**Parameters**:

- `session_id` _String_ \- Unique identifier of the session
- `command_id` _String_ \- Unique identifier of the command

**Returns**:

- `Daytona:SessionCommandLogsResponse` \- Command logs including output, stdout, and stderr

**Examples:**

```
logs = sandbox.process.get_session_command_logs(session_id: "my-session", command_id: "cmd-123")

puts "Command stdout: #{logs.stdout}"

puts "Command stderr: #{logs.stderr}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#get_session_command_logs_async) get\_session\_command\_logs\_async()

[Section titled “get\_session\_command\_logs\_async()”](https://www.daytona.io/docs/en/ruby-sdk/process/#get_session_command_logs_async)

```
def get_session_command_logs_async(session_id:, command_id:, on_stdout:, on_stderr:)
```

Asynchronously retrieves and processes the logs for a command executed in a session as they become available

**Parameters**:

- `session_id` _String_ \- Unique identifier of the session
- `command_id` _String_ \- Unique identifier of the command
- `on_stdout` _Proc_ \- Callback function to handle stdout log chunks as they arrive
- `on_stderr` _Proc_ \- Callback function to handle stderr log chunks as they arrive

**Returns**:

- `WebSocket:Client:Simple:Client`

**Examples:**

```
sandbox.process.get_session_command_logs_async(

  session_id: "my-session",

  command_id: "cmd-123",

  on_stdout: ->(log) { puts "[STDOUT]: #{log}" },

  on_stderr: ->(log) { puts "[STDERR]: #{log}" }

)
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#get_entrypoint_logs) get\_entrypoint\_logs()

[Section titled “get\_entrypoint\_logs()”](https://www.daytona.io/docs/en/ruby-sdk/process/#get_entrypoint_logs)

```
def get_entrypoint_logs()
```

Get the sandbox entrypoint logs

**Returns**:

- `Daytona:SessionCommandLogsResponse` \- Entrypoint logs including output, stdout, and stderr

**Examples:**

```
logs = sandbox.process.get_entrypoint_logs()

puts "Command stdout: #{logs.stdout}"

puts "Command stderr: #{logs.stderr}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#get_entrypoint_logs_async) get\_entrypoint\_logs\_async()

[Section titled “get\_entrypoint\_logs\_async()”](https://www.daytona.io/docs/en/ruby-sdk/process/#get_entrypoint_logs_async)

```
def get_entrypoint_logs_async(on_stdout:, on_stderr:)
```

Asynchronously retrieves and processes the sandbox entrypoint logs as they become available

**Parameters**:

- `on_stdout` _Proc_ \- Callback function to handle stdout log chunks as they arrive
- `on_stderr` _Proc_ \- Callback function to handle stderr log chunks as they arrive

**Returns**:

- `WebSocket:Client:Simple:Client`

**Examples:**

```
sandbox.process.get_entrypoint_logs_async(

  on_stdout: ->(log) { puts "[STDOUT]: #{log}" },

  on_stderr: ->(log) { puts "[STDERR]: #{log}" }

)
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#send_session_command_input) send\_session\_command\_input()

[Section titled “send\_session\_command\_input()”](https://www.daytona.io/docs/en/ruby-sdk/process/#send_session_command_input)

```
def send_session_command_input(session_id:, command_id:, data:)
```

Sends input data to a command executed in a session

This method allows you to send input to an interactive command running in a session,
such as responding to prompts or providing data to stdin.

**Parameters**:

- `session_id` _String_ \- Unique identifier of the session
- `command_id` _String_ \- Unique identifier of the command
- `data` _String_ \- Input data to send to the command

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#list_sessions) list\_sessions()

[Section titled “list\_sessions()”](https://www.daytona.io/docs/en/ruby-sdk/process/#list_sessions)

```
def list_sessions()
```

**Returns**:

- `Array\<DaytonaApiClient:Session\>` \- List of all sessions in the Sandbox

**Examples:**

```
sessions = sandbox.process.list_sessions

sessions.each do |session|

  puts "Session #{session.session_id}:"

  puts "  Commands: #{session.commands.length}"

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#delete_session) delete\_session()

[Section titled “delete\_session()”](https://www.daytona.io/docs/en/ruby-sdk/process/#delete_session)

```
def delete_session(session_id)
```

Terminates and removes a session from the Sandbox, cleaning up any resources associated with it

**Parameters**:

- `session_id` _String_ \- Unique identifier of the session to delete

**Examples:**

```
# Create and use a session

sandbox.process.create_session("temp-session")

# ... use the session ...

# Clean up when done

sandbox.process.delete_session("temp-session")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#create_pty_session) create\_pty\_session()

[Section titled “create\_pty\_session()”](https://www.daytona.io/docs/en/ruby-sdk/process/#create_pty_session)

```
def create_pty_session(id:, cwd: nil, envs: nil, pty_size: nil)
```

Creates a new PTY (pseudo-terminal) session in the Sandbox.

Creates an interactive terminal session that can execute commands and handle user input.
The PTY session behaves like a real terminal, supporting features like command history.

**Parameters**:

- `id` _String_ \- Unique identifier for the PTY session. Must be unique within the Sandbox.
- `cwd` _String, nil_ \- Working directory for the PTY session. Defaults to the sandbox’s working directory.
- `envs` _Hash<String, String>, nil_ \- Environment variables to set in the PTY session. These will be merged with
the Sandbox’s default environment variables.
- `pty_size` _PtySize, nil_ \- Terminal size configuration. Defaults to 80x24 if not specified.

**Returns**:

- `PtyHandle` \- Handle for managing the created PTY session. Use this to send input,
receive output, resize the terminal, and manage the session lifecycle.

**Raises**:

- `Daytona:Sdk:Error` \- If the PTY session creation fails or the session ID is already in use.

**Examples:**

```
# Create a basic PTY session

pty_handle = sandbox.process.create_pty_session(id: "my-pty")

# Create a PTY session with specific size and environment

pty_size = Daytona::PtySize.new(rows: 30, cols: 120)

pty_handle = sandbox.process.create_pty_session(

  id: "my-pty",

  cwd: "/workspace",

  envs: {"NODE_ENV" => "development"},

  pty_size: pty_size

)

# Use the PTY session

pty_handle.wait_for_connection

pty_handle.send_input("ls -la\n")

result = pty_handle.wait

pty_handle.disconnect
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#connect_pty_session) connect\_pty\_session()

[Section titled “connect\_pty\_session()”](https://www.daytona.io/docs/en/ruby-sdk/process/#connect_pty_session)

```
def connect_pty_session(session_id)
```

Connects to an existing PTY session in the Sandbox.

Establishes a WebSocket connection to an existing PTY session, allowing you to
interact with a previously created terminal session.

**Parameters**:

- `session_id` _String_ \- Unique identifier of the PTY session to connect to.

**Returns**:

- `PtyHandle` \- Handle for managing the connected PTY session.

**Raises**:

- `Daytona:Sdk:Error` \- If the PTY session doesn’t exist or connection fails.

**Examples:**

```
# Connect to an existing PTY session

pty_handle = sandbox.process.connect_pty_session("my-pty-session")

pty_handle.wait_for_connection

pty_handle.send_input("echo 'Hello World'\n")

result = pty_handle.wait

pty_handle.disconnect
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#resize_pty_session) resize\_pty\_session()

[Section titled “resize\_pty\_session()”](https://www.daytona.io/docs/en/ruby-sdk/process/#resize_pty_session)

```
def resize_pty_session(session_id, pty_size)
```

Resizes a PTY session to the specified dimensions

**Parameters**:

- `session_id` _String_ \- Unique identifier of the PTY session
- `pty_size` _PtySize_ \- New terminal size

**Returns**:

- `DaytonaApiClient:PtySessionInfo` \- Updated PTY session information

**Examples:**

```
pty_size = Daytona::PtySize.new(rows: 30, cols: 120)

session_info = sandbox.process.resize_pty_session("my-pty", pty_size)

puts "PTY resized to #{session_info.cols}x#{session_info.rows}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#delete_pty_session) delete\_pty\_session()

[Section titled “delete\_pty\_session()”](https://www.daytona.io/docs/en/ruby-sdk/process/#delete_pty_session)

```
def delete_pty_session(session_id)
```

Deletes a PTY session, terminating the associated process

**Parameters**:

- `session_id` _String_ \- Unique identifier of the PTY session to delete

**Returns**:

- `void`

**Examples:**

```
sandbox.process.delete_pty_session("my-pty")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#list_pty_sessions) list\_pty\_sessions()

[Section titled “list\_pty\_sessions()”](https://www.daytona.io/docs/en/ruby-sdk/process/#list_pty_sessions)

```
def list_pty_sessions()
```

Lists all PTY sessions in the Sandbox

**Returns**:

- `Array\<DaytonaApiClient:PtySessionInfo\>` \- List of PTY session information

**Examples:**

```
sessions = sandbox.process.list_pty_sessions

sessions.each do |session|

  puts "PTY Session #{session.id}: #{session.cols}x#{session.rows}"

end
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/process/\#get_pty_session_info) get\_pty\_session\_info()

[Section titled “get\_pty\_session\_info()”](https://www.daytona.io/docs/en/ruby-sdk/process/#get_pty_session_info)

```
def get_pty_session_info(session_id)
```

Gets detailed information about a specific PTY session

Retrieves comprehensive information about a PTY session including its current state,
configuration, and metadata.

**Parameters**:

- `session_id` _String_ \- Unique identifier of the PTY session to retrieve information for

**Returns**:

- `DaytonaApiClient:PtySessionInfo` \- Detailed information about the PTY session including ID, state,
creation time, working directory, environment variables, and more

**Examples:**

```
# Get details about a specific PTY session

session_info = sandbox.process.get_pty_session_info("my-session")

puts "Session ID: #{session_info.id}"

puts "Active: #{session_info.active}"

puts "Working Directory: #{session_info.cwd}"

puts "Terminal Size: #{session_info.cols}x#{session_info.rows}"
```