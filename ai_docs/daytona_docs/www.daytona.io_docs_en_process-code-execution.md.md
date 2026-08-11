---
url: "https://www.daytona.io/docs/en/process-code-execution.md"
title: undefined
---

# Process and Code Execution

Process and code execution are available through the `process` module of a sandbox. Code and commands run inside the sandbox, so untrusted or generated code executes in isolation from your application.

The `process` module covers running code snippets in Python, JavaScript, and TypeScript, with stateless execution or a persistent interpreter context, executing shell commands, and sessions: independent shells whose state persists across commands and that run long-lived processes in the background. For interactive terminal sessions, see [Pseudo Terminal (PTY)](https://www.daytona.io/docs/en/pty.md). For real-time log streaming from long-running session commands, see [Log Streaming](https://www.daytona.io/docs/en/log-streaming.md).

## Code execution

Daytona provides methods to execute code in sandboxes. You can run code snippets in multiple languages with support for both stateless execution and stateful interpretation with persistent contexts.

- [Run code (stateless)](#run-code-stateless): run independent code snippets where each execution starts from a clean interpreter state; inherits the sandbox language that you choose at [sandbox creation](https://www.daytona.io/docs/en/sandboxes.md#create-sandboxes). Supports Python, JavaScript, and TypeScript.
- [Run code (stateful)](#run-code-stateful): run Python code in a persistent interpreter context with variables, imports, and state to carry across executions; available in every SDK.

### Run code (stateless)

Run code snippets in sandboxes using stateless execution. Each invocation starts from a clean interpreter, making it ideal for independent code snippets.

```python
from daytona import CodeRunParams

# Run Python code
response = sandbox.process.code_run('''
def greet(name):
    return f"Hello, {name}!"

print(greet("Daytona"))
''')

print(response.result)

# Run code with argv and environment variables
response = sandbox.process.code_run(
    'import sys; print(f"Hello, {sys.argv[1]}!")',
    params=CodeRunParams(argv=["Daytona"], env={"FOO": "BAR"}),
    timeout=5,
)
print(response.result)
```

```typescript
// Run TypeScript code
let response = await sandbox.process.codeRun(`
function greet(name: string): string {
    return \`Hello, \${name}!\`;
}

console.log(greet("Daytona"));
`);
console.log(response.result);

// Run code with argv and environment variables
response = await sandbox.process.codeRun(
    `
    console.log(\`Hello, \${process.argv[2]}!\`);
    console.log(\`FOO: \${process.env.FOO}\`);
    `,
    { 
      argv: ["Daytona"],
      env: { FOO: "BAR" }
    }
);
console.log(response.result);

// Run code with timeout (5 seconds)
response = await sandbox.process.codeRun(
    'setTimeout(() => console.log("Done"), 2000);',
    undefined,
    5
);
console.log(response.result);
```


```ruby
# Run Python code
response = sandbox.process.code_run(code: <<~PYTHON)
  def greet(name):
      return f"Hello, {name}!"

  print(greet("Daytona"))
PYTHON

puts response.result
```


```go
// Run Python code (language defaults to sandbox language)
result, err := sandbox.Process.CodeRun(ctx, `
def greet(name):
    return f"Hello, {name}!"

print(greet("Daytona"))
`)
if err != nil {
	log.Fatal(err)
}
fmt.Println(result.Result)

// Run code with environment variables
result, err = sandbox.Process.CodeRun(ctx, `import os; print(os.environ.get("FOO"))`,
	options.WithCodeRunParams(types.CodeRunParams{
		Env: map[string]string{"FOO": "BAR"},
	}),
)
if err != nil {
	log.Fatal(err)
}
fmt.Println(result.Result)

// Run code with timeout (5 seconds)
result, err = sandbox.Process.CodeRun(ctx, `import time; time.sleep(2); print("Done")`,
	options.WithCodeRunTimeout(5*time.Second),
)
if err != nil {
	log.Fatal(err)
}
fmt.Println(result.Result)
```


```java
import io.daytona.sdk.model.ExecuteResponse;
import java.util.Map;

// Run code (stateless; language matches the sandbox image)
ExecuteResponse response = sandbox.process.codeRun(
    """
    def greet(name):
        return f"Hello, {name}!"

    print(greet("Daytona"))
    """
);
System.out.println(response.getResult());

// Run code with environment variables and timeout (seconds)
response = sandbox.process.codeRun(
    "import os; print('FOO:', os.environ.get('FOO'))",
    Map.of("FOO", "BAR"),
    null
);
System.out.println(response.getResult());

response = sandbox.process.codeRun(
    "import time; time.sleep(2); print(\"Done\")",
    null,
    5
);
System.out.println(response.getResult());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/code-run' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "code": "def greet(name):\n    return f\"Hello, {name}!\"\n\nprint(greet(\"Daytona\"))",
  "language": "python",
  "envs": {
    "FOO": "BAR"
  },
  "timeout": 5
}'
```


#### Artifacts

Stateless `code_run` responses can include an `artifacts` field. When your code produces matplotlib charts, the SDK strips chart metadata from `result` and returns it in the `artifacts.charts` field.


```python
code = '''
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 30)
plt.plot(x, np.sin(x))
plt.title("Sine wave")
plt.show()
'''

response = sandbox.process.code_run(code)
if response.artifacts and response.artifacts.charts:
    chart = response.artifacts.charts[0]
    print(chart.type, chart.title)
```


```typescript
const response = await sandbox.process.codeRun(`
import matplotlib.pyplot as plt
import numpy as np

x = np.linspace(0, 10, 30)
plt.plot(x, np.sin(x))
plt.title("Sine wave")
plt.show()
`)

if (response.artifacts?.charts?.length) {
    const chart = response.artifacts.charts[0]
    console.log(chart.type, chart.title)
}
```


### Run code (stateful)

Run Python code with persistent state using the code interpreter. You can maintain variables and imports between calls, create isolated contexts with optional working directories, list active contexts, and stream stdout, stderr, and errors via callbacks.


```python
from daytona import Daytona, OutputMessage, ExecutionError

def handle_stdout(message: OutputMessage):
    print(f"[STDOUT] {message.output}")

def handle_stderr(message: OutputMessage):
    print(f"[STDERR] {message.output}")

def handle_error(error: ExecutionError):
    print(f"[ERROR] {error.name}: {error.value}")

daytona = Daytona()
sandbox = daytona.create()

# Shared default context
sandbox.code_interpreter.run_code(
    "counter = 1\nprint(f'Counter initialized at {counter}')",
    on_stdout=handle_stdout,
    on_stderr=handle_stderr,
    on_error=handle_error,
    timeout=60,
)

# Isolated context with working directory
ctx = sandbox.code_interpreter.create_context(cwd="workspace/src")
try:
    sandbox.code_interpreter.run_code(
        "value = 'stored in ctx'",
        context=ctx,
        envs={"DEBUG": "1"},
    )
    sandbox.code_interpreter.run_code(
        "print(value)",
        context=ctx,
        on_stdout=handle_stdout,
    )
finally:
    sandbox.code_interpreter.delete_context(ctx)

# List user-created contexts
for context in sandbox.code_interpreter.list_contexts():
    print(context.id, context.cwd)
```


```typescript
import { Daytona } from '@daytona/sdk'

const daytona = new Daytona()

async function main() {
    const sandbox = await daytona.create()

    // Shared default context
    await sandbox.codeInterpreter.runCode(
`
counter = 1
print(f'Counter initialized at {counter}')
`,
        {
            onStdout: (msg) => process.stdout.write(`[STDOUT] ${msg.output}`),
            onStderr: (msg) => process.stdout.write(`[STDERR] ${msg.output}`),
            timeout: 60,
        },
    )

    // Isolated context with working directory
    const ctx = await sandbox.codeInterpreter.createContext('workspace/src')
    try {
        await sandbox.codeInterpreter.runCode(
            `value = 'stored in ctx'`,
            { context: ctx, envs: { DEBUG: '1' } },
        )
        await sandbox.codeInterpreter.runCode(
            `print(value)`,
            { context: ctx, onStdout: (msg) => process.stdout.write(`[STDOUT] ${msg.output}`) },
        )
    } finally {
        await sandbox.codeInterpreter.deleteContext(ctx)
    }

    // List user-created contexts
    const contexts = await sandbox.codeInterpreter.listContexts()
    for (const context of contexts) {
        console.log(context.id, context.cwd)
    }
}

main()
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create

# Shared default context
sandbox.code_interpreter.run_code(
  <<~PYTHON,
  counter = 1
  print(f'Counter initialized at {counter}')
  PYTHON
  on_stdout: ->(msg) { print "[STDOUT] #{msg.output}" }
)

# Isolated context
ctx = sandbox.code_interpreter.create_context
begin
  sandbox.code_interpreter.run_code("value = 'stored in ctx'", context: ctx)
  sandbox.code_interpreter.run_code(
    "print(value)",
    context: ctx,
    on_stdout: ->(msg) { print "[STDOUT] #{msg.output}" }
  )
ensure
  sandbox.code_interpreter.delete_context(ctx)
end
```
```go
// Shared default context
channels, err := sandbox.CodeInterpreter.RunCode(ctx,
	"counter = 1\nprint(f'Counter initialized at {counter}')",
)
if err != nil {
	log.Fatal(err)
}
for msg := range channels.Stdout {
	fmt.Printf("[STDOUT] %s\n", msg.Text)
}

// Isolated context
cwd := "workspace/src"
ctxInfo, err := sandbox.CodeInterpreter.CreateContext(ctx, &cwd)
if err != nil {
	log.Fatal(err)
}
contextID := ctxInfo["id"].(string)

channels, err = sandbox.CodeInterpreter.RunCode(ctx,
	"value = 'stored in ctx'",
	options.WithCustomContext(contextID),
	options.WithEnv(map[string]string{"DEBUG": "1"}),
)
if err != nil {
	log.Fatal(err)
}
for msg := range channels.Stdout {
	fmt.Printf("[STDOUT] %s\n", msg.Text)
}

// List user-created contexts
contexts, err := sandbox.CodeInterpreter.ListContexts(ctx)
if err != nil {
	log.Fatal(err)
}
for _, context := range contexts {
	fmt.Println(context["id"], context["cwd"])
}

// Clean up context
err = sandbox.CodeInterpreter.DeleteContext(ctx, contextID)
if err != nil {
	log.Fatal(err)
}
```

```java
import io.daytona.sdk.RunCodeOptions;
import io.daytona.toolbox.client.model.InterpreterContext;

// Default interpreter context (Python)
sandbox.codeInterpreter.runCode(
    """
    counter = 1
    print(f'Counter initialized at {counter}')
    """,
    new RunCodeOptions()
        .setOnStdout(chunk -> System.out.print("[STDOUT] " + chunk))
        .setOnStderr(chunk -> System.out.print("[STDERR] " + chunk))
        .setTimeout(60)
);

// Context management
InterpreterContext ctx = sandbox.codeInterpreter.createContext("workspace/src");
sandbox.codeInterpreter.deleteContext(ctx.getId());

for (InterpreterContext context : sandbox.codeInterpreter.listContexts()) {
    System.out.println(context.getId() + " " + context.getCwd());
}
```


```bash
# Create context
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/interpreter/context' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"cwd": "workspace/src"}'

# List user-created contexts
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/interpreter/context'

# Run code in a context (ExecuteInterpreterCode, WebSocket endpoint)
# The GET request is upgraded to a WebSocket connection:
# wss://proxy.app.daytona.io/toolbox/{sandboxId}/process/interpreter/execute
# Send a JSON message with the code to run. "contextId" defaults to the default
# context, "timeout" is in seconds (default 600, 0 disables it), and "envs" sets
# environment variables for the execution:
# {
#   "code": "counter = 1\nprint(f\"Counter initialized at {counter}\")",
#   "contextId": "your-context-id",
#   "timeout": 600,
#   "envs": {"MY_VAR": "value"}
# }

# Delete context
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/interpreter/context/{contextId}' \
  --request DELETE
```


## Command execution

Daytona provides methods to execute shell commands in sandboxes. You can run commands with working directory, timeout, and environment variable options. The default timeout is 10 seconds when not specified.

Git operations assume you are operating in the sandbox user's home directory (e.g. **`workspace`** implies **`/home/[username]/workspace`**). Use a leading **`/`** when providing absolute paths.

### Execute commands

Execute shell commands in sandboxes by providing the command string and optional parameters for working directory, timeout, and environment variables. 

You can also use the `daytona exec` CLI command for quick command execution.


```python
# Execute any shell command
response = sandbox.process.exec("ls -la")
print(response.result)

# Setting a working directory and a timeout

response = sandbox.process.exec("sleep 3", cwd="workspace/src", timeout=5)
print(response.result)

# Passing environment variables

response = sandbox.process.exec("echo $CUSTOM_SECRET", env={
        "CUSTOM_SECRET": "DAYTONA"
    }
)
print(response.result)
```


```typescript

// Execute any shell command
const response = await sandbox.process.executeCommand("ls -la");
console.log(response.result);

// Setting a working directory and a timeout
const response2 = await sandbox.process.executeCommand("sleep 3", "workspace/src", undefined, 5);
console.log(response2.result);

// Passing environment variables
const response3 = await sandbox.process.executeCommand("echo $CUSTOM_SECRET", ".", {
        "CUSTOM_SECRET": "DAYTONA"
    }
);
console.log(response3.result);
```


```ruby
# Execute any shell command
response = sandbox.process.exec(command: 'ls -la')
puts response.result

# Setting a working directory and a timeout
response = sandbox.process.exec(command: 'sleep 3', cwd: 'workspace/src', timeout: 5)
puts response.result

# Passing environment variables
response = sandbox.process.exec(
  command: 'echo $CUSTOM_SECRET',
  env: { 'CUSTOM_SECRET' => 'DAYTONA' }
)
puts response.result
```


```go
// Execute any shell command
response, err := sandbox.Process.ExecuteCommand(ctx, "ls -la")
if err != nil {
	log.Fatal(err)
}
fmt.Println(response.Result)

// Setting a working directory and a timeout
response, err = sandbox.Process.ExecuteCommand(ctx, "sleep 3",
	options.WithCwd("workspace/src"),
	options.WithExecuteTimeout(5*time.Second),
)
if err != nil {
	log.Fatal(err)
}
fmt.Println(response.Result)

// Passing environment variables
response, err = sandbox.Process.ExecuteCommand(ctx, "echo $CUSTOM_SECRET",
	options.WithCommandEnv(map[string]string{"CUSTOM_SECRET": "DAYTONA"}),
)
if err != nil {
	log.Fatal(err)
}
fmt.Println(response.Result)
```


```java
import io.daytona.sdk.model.ExecuteResponse;
import java.util.Map;

// Execute any shell command
ExecuteResponse response = sandbox.process.executeCommand("ls -la");
System.out.println(response.getResult());

// Working directory and timeout (seconds)
response = sandbox.process.executeCommand("sleep 3", "workspace/src", null, 5);
System.out.println(response.getResult());

// Environment variables
response = sandbox.process.executeCommand(
    "echo $CUSTOM_SECRET",
    ".",
    Map.of("CUSTOM_SECRET", "DAYTONA"),
    null
);
System.out.println(response.getResult());
```


```bash
# Execute any shell command
daytona exec my-sandbox -- ls -la

# Setting a working directory and a timeout
daytona exec my-sandbox --cwd workspace/src --timeout 5 -- sleep 3

# Passing environment variables (use shell syntax)
daytona exec my-sandbox -- sh -c 'CUSTOM_SECRET=DAYTONA echo $CUSTOM_SECRET'
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/execute' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "command": "ls -la",
  "cwd": "workspace",
  "timeout": 5
}'
```


## Session operations

Daytona provides methods to manage background process sessions in sandboxes. You can create sessions, execute commands, monitor status, and manage long-running processes.

### Get session status

Get session status and list all sessions in a sandbox by providing the session ID.


```python
# Check session's executed commands
session = sandbox.process.get_session(session_id)
print(f"Session {session_id}:")
for command in session.commands:
    print(f"Command: {command.command}, Exit Code: {command.exit_code}")

# List all running sessions

sessions = sandbox.process.list_sessions()
for session in sessions:
    print(f"Session: {session.session_id}, Commands: {session.commands}")
```


```typescript
// Check session's executed commands
const session = await sandbox.process.getSession(sessionId);
console.log(`Session ${sessionId}:`);
for (const command of session.commands) {
    console.log(`Command: ${command.command}, Exit Code: ${command.exitCode}`);
}

// List all running sessions
const sessions = await sandbox.process.listSessions();
for (const session of sessions) {
    console.log(`Session: ${session.sessionId}, Commands: ${session.commands}`);
}
```


```ruby
# Check session's executed commands
session = sandbox.process.get_session(session_id)
puts "Session #{session_id}:"
session.commands.each do |command|
  puts "Command: #{command.command}, Exit Code: #{command.exit_code}"
end

# List all running sessions
sessions = sandbox.process.list_sessions
sessions.each do |session|
  puts "Session: #{session.session_id}, Commands: #{session.commands}"
end
```


```go
// Check session's executed commands
session, err := sandbox.Process.GetSession(ctx, sessionID)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Session %s:\n", sessionID)
commands := session["commands"].([]any)
for _, cmd := range commands {
	cmdMap := cmd.(map[string]any)
	fmt.Printf("Command: %s, Exit Code: %v\n", cmdMap["command"], cmdMap["exitCode"])
}

// List all running sessions
sessions, err := sandbox.Process.ListSessions(ctx)
if err != nil {
	log.Fatal(err)
}
for _, sess := range sessions {
	fmt.Printf("Session: %s, Commands: %v\n", sess["sessionId"], sess["commands"])
}
```


```java
import io.daytona.sdk.model.Command;
import io.daytona.sdk.model.Session;

// Check session's executed commands
Session session = sandbox.process.getSession(sessionId);
System.out.println("Session " + sessionId + ":");
for (Command command : session.getCommands()) {
    System.out.println("Command: " + command.getCommand() + ", Exit Code: " + command.getExitCode());
}

// List all running sessions
for (Session s : sandbox.process.listSessions()) {
    System.out.println("Session: " + s.getSessionId() + ", Commands: " + s.getCommands());
}
```


```bash
# Get session info
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/{sessionId}'

# List all sessions
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session'
```


### Get session command

Get the status of a specific command within a session, including its exit code when execution has finished. Use this to poll asynchronous session commands.


```python
command = sandbox.process.get_session_command(session_id, command_id)
print(f"Command: {command.command}, Exit Code: {command.exit_code}")
```


```typescript
const command = await sandbox.process.getSessionCommand(sessionId, commandId);
console.log(`Command: ${command.command}, Exit Code: ${command.exitCode}`);
```


```ruby
command = sandbox.process.get_session_command(session_id: session_id, command_id: command_id)
puts "Command: #{command.command}, Exit Code: #{command.exit_code}"
```


```go
command, err := sandbox.Process.GetSessionCommand(ctx, sessionID, commandID)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Command: %s, Exit Code: %v\n", command["command"], command["exitCode"])
```


```java
import io.daytona.sdk.model.Command;

Command command = sandbox.process.getSessionCommand(sessionId, commandId);
System.out.println("Command: " + command.getCommand() + ", Exit Code: " + command.getExitCode());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/{sessionId}/command/{commandId}'
```


### Entrypoint session

Retrieve information about the internal entrypoint session in sandboxes. In each sandbox, the configured entrypoint command is executed inside a dedicated internal session, and you can fetch the session details (including the commands) and read its logs.


```python
# Entrypoint session details
session = sandbox.process.get_entrypoint_session()
print(f"Entrypoint session: {session.session_id}")
cmd = session.commands[0]
print(f"Entrypoint command id: {cmd.id}")
print(f"Command: {cmd.command}")

# Entrypoint logs (HTTP)
logs = sandbox.process.get_entrypoint_logs()
print(f"[STDOUT]: {logs.stdout}")
print(f"[STDERR]: {logs.stderr}")

# Stream entrypoint logs (WebSocket)
async def stream_entrypoint_logs():
    await sandbox.process.get_entrypoint_logs_async(
        lambda log: print(f"[STDOUT]: {log}"),
        lambda log: print(f"[STDERR]: {log}"),
    )

# Use asyncio.run in scripts; in notebooks or async apps, await stream_entrypoint_logs() instead.
asyncio.run(stream_entrypoint_logs())
```


```typescript
// Entrypoint session details
const session = await sandbox.process.getEntrypointSession();
console.log(`Entrypoint session: ${session.sessionId}`);
const cmd = session.commands[0]
console.log(`Entrypoint command id: ${cmd.id}`);
console.log(`Command: ${cmd.command}`);

// Entrypoint logs (HTTP)
const logs = await sandbox.process.getEntrypointLogs();
console.log('[STDOUT]:', logs.stdout);
console.log('[STDERR]:', logs.stderr);

// Stream entrypoint logs (WebSocket)
await sandbox.process.getEntrypointLogs(
    (chunk) => console.log('[STDOUT]:', chunk),
    (chunk) => console.log('[STDERR]:', chunk),
);
```


```ruby
# Entrypoint session details
session = sandbox.process.get_entrypoint_session
puts "Entrypoint session: #{session.session_id}"
cmd = session.commands.first
puts "Entrypoint command id: #{cmd.id}"
puts "Command: #{cmd.command}"

# Entrypoint logs (HTTP)
logs = sandbox.process.get_entrypoint_logs
puts "[STDOUT]: #{logs.stdout}"
puts "[STDERR]: #{logs.stderr}"

# Stream entrypoint logs (WebSocket)
sandbox.process.get_entrypoint_logs_async(
  on_stdout: ->(log) { puts "[STDOUT]: #{log}" },
  on_stderr: ->(log) { puts "[STDERR]: #{log}" }
)
```


```go
// Entrypoint session details
info, err := sandbox.Process.GetEntrypointSession(ctx)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Entrypoint session: %s\n", info.GetSessionId())
cmds := info.GetCommands()
cmd := cmds[0]
fmt.Printf("Entrypoint command id: %s\n", cmd.GetId())
fmt.Printf("Command: %s\n", cmd.GetCommand())

// Entrypoint logs (HTTP)
logs, err := sandbox.Process.GetEntrypointLogs(ctx)
if err != nil {
	log.Fatal(err)
}
fmt.Println(logs)

// Stream entrypoint logs (WebSocket)
stdout := make(chan string, 100)
stderr := make(chan string, 100)
go func() {
	for msg := range stderr {
		log.Printf("[STDERR]: %s", msg)
	}
}()
go func() {
	if err := sandbox.Process.GetEntrypointLogsStream(ctx, stdout, stderr); err != nil {
		log.Println("Entrypoint log stream error:", err)
	}
}()
for msg := range stdout {
	fmt.Printf("[STDOUT]: %s\n", msg)
}
```


```java
import io.daytona.sdk.model.Command;
import io.daytona.sdk.model.Session;
import io.daytona.sdk.model.SessionCommandLogsResponse;

// Entrypoint session details
Session session = sandbox.process.getEntrypointSession();
System.out.println("Entrypoint session: " + session.getSessionId());
Command cmd = session.getCommands().get(0);
System.out.println("Entrypoint command id: " + cmd.getId());
System.out.println("Command: " + cmd.getCommand());

// Entrypoint logs (HTTP)
SessionCommandLogsResponse logs = sandbox.process.getEntrypointLogs();
System.out.println("[STDOUT]: " + logs.getStdout());
System.out.println("[STDERR]: " + logs.getStderr());

// Stream entrypoint logs (WebSocket)
sandbox.process.getEntrypointLogs(
    chunk -> System.out.println("[STDOUT]: " + chunk),
    chunk -> System.out.println("[STDERR]: " + chunk)
);
```


```bash
# Get entrypoint session details
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/entrypoint'

# Get entrypoint logs (HTTP)
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/entrypoint/logs'

# Follow entrypoint logs in real-time (WebSocket)
# wss://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/entrypoint/logs?follow=true
```


### Execute interactive commands

Execute interactive commands in sessions. You can send input to running commands that expect user interaction, such as confirmations or interactive tools like database CLIs and package managers.


```python
import asyncio
from daytona import SessionExecuteRequest

session_id = "interactive-session"
sandbox.process.create_session(session_id)

# Execute command that requires confirmation
command = sandbox.process.execute_session_command(
    session_id,
    SessionExecuteRequest(
        command='pip uninstall requests',
        run_async=True,
    ),
)

# Stream logs asynchronously
logs_task = asyncio.create_task(
    sandbox.process.get_session_command_logs_async(
        session_id,
        command.cmd_id,
        lambda log: print(f"[STDOUT]: {log}"),
        lambda log: print(f"[STDERR]: {log}"),
    )
)

await asyncio.sleep(1)
# Send input to the command
sandbox.process.send_session_command_input(session_id, command.cmd_id, "y")

# Wait for logs to complete
await logs_task
```


```typescript
const sessionId = 'interactive-session'
await sandbox.process.createSession(sessionId)

// Execute command that requires confirmation
const command = await sandbox.process.executeSessionCommand(sessionId, {
    command: 'pip uninstall requests',
    runAsync: true,
})

// Stream logs asynchronously
const logPromise = sandbox.process.getSessionCommandLogs(
    sessionId,
    command.cmdId!,
    (stdout) => console.log('[STDOUT]:', stdout),
    (stderr) => console.log('[STDERR]:', stderr),
)

await new Promise((resolve) => setTimeout(resolve, 1000))
// Send input to the command
await sandbox.process.sendSessionCommandInput(sessionId, command.cmdId!, 'y')

// Wait for logs to complete
await logPromise
```


```ruby
session_id = "interactive-session"
sandbox.process.create_session(session_id)

# Execute command that requires confirmation
interactive_command = sandbox.process.execute_session_command(
  session_id: session_id,
  req: Daytona::SessionExecuteRequest.new(
    command: 'pip uninstall requests',
    run_async: true
  )
)

# Wait a moment for the command to start
sleep 1

# Send input to the command
sandbox.process.send_session_command_input(
  session_id: session_id,
  command_id: interactive_command.cmd_id,
  data: "y"
)

# Get logs for the interactive command asynchronously
sandbox.process.get_session_command_logs_async(
  session_id: session_id,
  command_id: interactive_command.cmd_id,
  on_stdout: ->(log) { puts "[STDOUT]: #{log}" },
  on_stderr: ->(log) { puts "[STDERR]: #{log}" }
)
```


```go
sessionID := "interactive-session"
err := sandbox.Process.CreateSession(ctx, sessionID)
if err != nil {
	log.Fatal(err)
}

// Execute command that requires confirmation
result, err := sandbox.Process.ExecuteSessionCommand(ctx, sessionID, "pip uninstall requests", true, false)
if err != nil {
	log.Fatal(err)
}
cmdID := result["cmdId"].(string)

// Stream logs asynchronously
stdout := make(chan string)
stderr := make(chan string)

go func() {
	err := sandbox.Process.GetSessionCommandLogsStream(ctx, sessionID, cmdID, stdout, stderr)
	if err != nil {
		log.Println("Log stream error:", err)
	}
}()

time.Sleep(1 * time.Second)

// Note: SendSessionCommandInput is not available in Go SDK
// Use the API endpoint directly for sending input

// Read logs
for msg := range stdout {
	fmt.Printf("[STDOUT]: %s\n", msg)
}
```


```java
import io.daytona.sdk.model.SessionExecuteRequest;
import io.daytona.sdk.model.SessionExecuteResponse;

String sessionId = "interactive-session";
sandbox.process.createSession(sessionId);

SessionExecuteResponse command = sandbox.process.executeSessionCommand(
    sessionId,
    new SessionExecuteRequest("pip uninstall requests", true)
);
String cmdId = command.getCmdId();

Thread logThread = new Thread(() -> sandbox.process.getSessionCommandLogs(
    sessionId,
    cmdId,
    log -> System.out.println("[STDOUT]: " + log),
    log -> System.out.println("[STDERR]: " + log)
));
logThread.start();

Thread.sleep(1000);
sandbox.process.sendSessionCommandInput(sessionId, cmdId, "y");
logThread.join();
```


```bash
# Create session
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"sessionId": "interactive-session"}'

# Execute session command
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/{sessionId}/exec' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "command": "pip uninstall requests",
  "runAsync": true
}'

# Send input to command
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/{sessionId}/command/{commandId}/input' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "data": "y"
}'

# Get command logs (append ?follow=true for WebSocket streaming)
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/{sessionId}/command/{commandId}/logs'
```


## Resource management

Use sessions for long-running operations, clean up sessions after execution, and handle exceptions properly.

   ```python
   # Python - Clean up session
   session_id = "long-running-cmd"
   try:
       sandbox.process.create_session(session_id)
       session = sandbox.process.get_session(session_id)
       # Do work...
   finally:
       sandbox.process.delete_session(session.session_id)
   ```
   ```typescript
   // TypeScript - Clean up session
   const sessionId = "long-running-cmd";
   try {
       await sandbox.process.createSession(sessionId);
       const session = await sandbox.process.getSession(sessionId);
       // Do work...
   } finally {
       await sandbox.process.deleteSession(session.sessionId);
   }
   ```

   ```ruby
   # Ruby - Clean up session
   session_id = 'long-running-cmd'
   begin
     sandbox.process.create_session(session_id)
     session = sandbox.process.get_session(session_id)
     # Do work...
   ensure
     sandbox.process.delete_session(session.session_id)
   end
   ```
   ```go
   // Go - Clean up session
   sessionID := "long-running-cmd"
   err := sandbox.Process.CreateSession(ctx, sessionID)
   if err != nil {
   	log.Fatal(err)
   }
   defer sandbox.Process.DeleteSession(ctx, sessionID)

   session, err := sandbox.Process.GetSession(ctx, sessionID)
   if err != nil {
   	log.Fatal(err)
   }
   // Do work...
   ```
   ```java
   import io.daytona.sdk.model.Session;

   // Clean up session
   String sessionId = "long-running-cmd";
   try {
       sandbox.process.createSession(sessionId);
       Session session = sandbox.process.getSession(sessionId);
       // Do work...
   } finally {
       sandbox.process.deleteSession(sessionId);
   }
   ```
   ```bash
   # Create session
   curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session' \
     --request POST \
     --header 'Content-Type: application/json' \
     --data '{"sessionId": "long-running-cmd"}'

   # Delete session when done
   curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/{sessionId}' \
     --request DELETE
   ```

## Error handling

Handle process exceptions properly, log error details for debugging, and use try-catch blocks for error handling.

```python
from daytona import DaytonaError

try:
    response = sandbox.process.code_run("invalid python code")
    if response.exit_code != 0:
        print(f"Exit code: {response.exit_code}")
        print(f"Error output: {response.result}")
except DaytonaError as e:
    print(f"Execution failed: {e}")
```
```typescript
import { DaytonaError } from '@daytona/sdk'

try {
    const response = await sandbox.process.codeRun("invalid typescript code");
    if (response.exitCode !== 0) {
        console.error("Exit code:", response.exitCode);
        console.error("Error output:", response.result);
    }
} catch (e) {
    if (e instanceof DaytonaError) {
        console.error("Execution failed:", e);
    }
}
```

```ruby
begin
  response = sandbox.process.code_run(code: 'invalid python code')
  if response.exit_code != 0
    puts "Exit code: #{response.exit_code}"
    puts "Error output: #{response.result}"
  end
rescue StandardError => e
  puts "Execution failed: #{e}"
end
```
```go
result, err := sandbox.Process.CodeRun(ctx, "invalid python code")
if err != nil {
	fmt.Println("Execution failed:", err)
}
if result != nil && result.ExitCode != 0 {
	fmt.Println("Exit code:", result.ExitCode)
	fmt.Println("Error output:", result.Result)
}
```
```java
import io.daytona.sdk.exception.DaytonaException;
import io.daytona.sdk.model.ExecuteResponse;

try {
    ExecuteResponse response = sandbox.process.codeRun("invalid python code");
    if (response.getExitCode() != null && response.getExitCode() != 0) {
        System.out.println("Exit code: " + response.getExitCode());
        System.out.println("Error output: " + response.getResult());
    }
} catch (DaytonaException e) {
    System.out.println("Execution failed: " + e.getMessage());
}
```
```bash
# API responses include exitCode field for error handling
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/execute' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "command": "python3 -c \"invalid python code\""
}'

# Response includes:
# {
#   "result": "",
#   "exitCode": 1
# }
```