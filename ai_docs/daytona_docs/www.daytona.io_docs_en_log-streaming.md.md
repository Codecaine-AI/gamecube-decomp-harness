---
url: "https://www.daytona.io/docs/en/log-streaming.md"
title: undefined
---

# Log Streaming

Log streaming lets you access and process session command logs in real time while a process is still running, or retrieve a snapshot of all logs produced so far. Use streaming for long-running or background commands. Use snapshots when you only need the current output.

For entrypoint log streaming, see [process & code execution](https://www.daytona.io/docs/en/process-code-execution.md#entrypoint-session). To stream logs while sending input to a running command, see [execute interactive commands](https://www.daytona.io/docs/en/process-code-execution.md#execute-interactive-commands).

## Stream logs with callbacks

Stream logs in the background while the rest of your system continues executing. Use this for continuous monitoring, debugging long-running jobs, or forwarding logs to other systems.


:::tip[Python callbacks]
When streaming with the Python SDK, avoid blocking operations inside stdout/stderr callbacks. Blocking synchronous callbacks can cause WebSocket disconnections. Use async callbacks where possible.
:::

```python
import asyncio
from daytona import Daytona, SessionExecuteRequest

async def main():
  daytona = Daytona()
  sandbox = daytona.create()

  session_id = "streaming-session"
  sandbox.process.create_session(session_id)

  command = sandbox.process.execute_session_command(
    session_id,
    SessionExecuteRequest(
      command='for i in {1..5}; do echo "Step $i"; echo "Error $i" >&2; sleep 1; done',
      run_async=True,
    ),
  )

  # Stream logs with separate callbacks
  logs_task = asyncio.create_task(
    sandbox.process.get_session_command_logs_async(
      session_id,
      command.cmd_id,
      lambda stdout: print(f"[STDOUT]: {stdout}"),
      lambda stderr: print(f"[STDERR]: {stderr}"),
    )
  )

  print("Continuing execution while logs are streaming...")
  await asyncio.sleep(3)
  print("Other operations completed!")

  # Wait for the logs to complete
  await logs_task

  sandbox.delete()

if __name__ == "__main__":
    asyncio.run(main())
```


```typescript
import { Daytona } from '@daytona/sdk'

async function main() {
  const daytona = new Daytona()
  const sandbox = await daytona.create()
  const sessionId = "exec-session-1"
  await sandbox.process.createSession(sessionId)

  const command = await sandbox.process.executeSessionCommand(
    sessionId,
    {
      command: 'for i in {1..5}; do echo "Step $i"; echo "Error $i" >&2; sleep 1; done',
      runAsync: true,
    },
  )

  // Stream logs with separate callbacks
  const logsTask = sandbox.process.getSessionCommandLogs(
    sessionId,
    command.cmdId!,
    (stdout) => console.log('[STDOUT]:', stdout),
    (stderr) => console.log('[STDERR]:', stderr),
  )

  console.log('Continuing execution while logs are streaming...')
  await new Promise((resolve) => setTimeout(resolve, 3000))
  console.log('Other operations completed!')

  // Wait for the logs to complete
  await logsTask

  await sandbox.delete()
}

main()
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create

session_id = 'streaming-session'
sandbox.process.create_session(session_id)

command = sandbox.process.execute_session_command(
  session_id: session_id,
  req: Daytona::SessionExecuteRequest.new(
    command: 'for i in {1..5}; do echo "Step $i"; echo "Error $i" >&2; sleep 1; done',
    run_async: true
  )
)

# Stream logs using a thread
log_thread = Thread.new do
  sandbox.process.get_session_command_logs_async(
    session_id: session_id,
    command_id: command.cmd_id,
    on_stdout: ->(stdout) { puts "[STDOUT]: #{stdout}" },
    on_stderr: ->(stderr) { puts "[STDERR]: #{stderr}" }
  )
end

puts 'Continuing execution while logs are streaming...'
sleep(3)
puts 'Other operations completed!'

# Wait for the logs to complete
log_thread.join

daytona.delete(sandbox)
```


```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/daytona/clients/sdk-go/pkg/daytona"
)

func main() {
	client, _ := daytona.NewClient()
	ctx := context.Background()
	sandbox, _ := client.Create(ctx, nil)

	sessionID := "streaming-session"
	sandbox.Process.CreateSession(ctx, sessionID)

	// Execute async command that outputs to stdout and stderr
	cmd := `for i in 1 2 3 4 5; do echo "Step $i"; echo "Error $i" >&2; sleep 1; done`
	cmdResult, _ := sandbox.Process.ExecuteSessionCommand(ctx, sessionID, cmd, true, false)
	cmdID, _ := cmdResult["id"].(string)

	// Create channels for stdout and stderr
	stdout := make(chan string, 100)
	stderr := make(chan string, 100)

	// Stream logs in a goroutine
	go func() {
		err := sandbox.Process.GetSessionCommandLogsStream(ctx, sessionID, cmdID, stdout, stderr)
		if err != nil {
			log.Printf("Stream error: %v", err)
		}
	}()

	fmt.Println("Continuing execution while logs are streaming...")

	// Read from channels until both are closed
	stdoutOpen, stderrOpen := true, true
	for stdoutOpen || stderrOpen {
		select {
		case chunk, ok := <-stdout:
			if !ok {
				stdoutOpen = false
			} else {
				fmt.Fprintf(os.Stdout, "[STDOUT]: %s", chunk)
			}
		case chunk, ok := <-stderr:
			if !ok {
				stderrOpen = false
			} else {
				fmt.Fprintf(os.Stderr, "[STDERR]: %s", chunk)
			}
		}
	}

	fmt.Println("Streaming completed!")
	sandbox.Delete(ctx)
}
```


```java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.SessionExecuteRequest;
import io.daytona.sdk.model.SessionExecuteResponse;

public class App {
    public static void main(String[] args) throws InterruptedException {
        try (Daytona daytona = new Daytona()) {
            Sandbox sandbox = daytona.create();
            String sessionId = "streaming-session";
            sandbox.getProcess().createSession(sessionId);

            SessionExecuteResponse command = sandbox.getProcess().executeSessionCommand(
                    sessionId,
                    new SessionExecuteRequest(
                            "for i in {1..5}; do echo \"Step $i\"; echo \"Error $i\" >&2; sleep 1; done",
                            true));

            Thread logThread = new Thread(() -> sandbox.getProcess().getSessionCommandLogs(
                    sessionId,
                    command.getCmdId(),
                    stdout -> System.out.print("[STDOUT]: " + stdout),
                    stderr -> System.err.print("[STDERR]: " + stderr)));
            logThread.start();

            System.out.println("Continuing execution while logs are streaming...");
            Thread.sleep(3000);
            System.out.println("Other operations completed!");

            logThread.join();

            sandbox.delete();
        }
    }
}
```


```bash
# Follow session command logs in real-time (WebSocket)
# wss://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/{sessionId}/command/{commandId}/logs?follow=true
```



## Retrieve all existing logs

Retrieve all logs produced up to the current point in time. Use this when the command has a predictable duration, or when you prefer to poll for output instead of streaming.


```python
import time
from daytona import Daytona, SessionExecuteRequest

daytona = Daytona()
sandbox = daytona.create()
session_id = "exec-session-1"
sandbox.process.create_session(session_id)

# Execute a blocking command and wait for the result
command = sandbox.process.execute_session_command(
  session_id, SessionExecuteRequest(command="echo 'Hello from stdout' && echo 'Hello from stderr' >&2")
)
print(f"[STDOUT]: {command.stdout}")
print(f"[STDERR]: {command.stderr}")
print(f"[OUTPUT]: {command.output}")

# Or execute command in the background and get the logs later
command = sandbox.process.execute_session_command(
  session_id, 
  SessionExecuteRequest(
    command='while true; do if (( RANDOM % 2 )); then echo "All good at $(date)"; else echo "Oops, an error at $(date)" >&2; fi; sleep 1; done',
    run_async=True
  )
)
time.sleep(5)
# Get the logs up to the current point in time
logs = sandbox.process.get_session_command_logs(session_id, command.cmd_id)
print(f"[STDOUT]: {logs.stdout}")
print(f"[STDERR]: {logs.stderr}")
print(f"[OUTPUT]: {logs.output}")

sandbox.delete()
```


```typescript
import { Daytona } from '@daytona/sdk'

async function main() {
  const daytona = new Daytona()
  const sandbox = await daytona.create()
  const sessionId = "exec-session-1"
  await sandbox.process.createSession(sessionId)

  // Execute a blocking command and wait for the result
  const command = await sandbox.process.executeSessionCommand(
    sessionId,
    {
      command: 'echo "Hello from stdout" && echo "Hello from stderr" >&2',
    },
  )
  console.log(`[STDOUT]: ${command.stdout}`)
  console.log(`[STDERR]: ${command.stderr}`)
  console.log(`[OUTPUT]: ${command.output}`)

  // Or execute command in the background and get the logs later
  const command2 = await sandbox.process.executeSessionCommand(
    sessionId,
    {
      command: 'while true; do if (( RANDOM % 2 )); then echo "All good at $(date)"; else echo "Oops, an error at $(date)" >&2; fi; sleep 1; done',
      runAsync: true,
    },
  )
  await new Promise((resolve) => setTimeout(resolve, 5000))
  // Get the logs up to the current point in time
  const logs = await sandbox.process.getSessionCommandLogs(sessionId, command2.cmdId!)
  console.log(`[STDOUT]: ${logs.stdout}`)
  console.log(`[STDERR]: ${logs.stderr}`)
  console.log(`[OUTPUT]: ${logs.output}`)

  await sandbox.delete()
}

main()
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create
session_id = 'exec-session-1'
sandbox.process.create_session(session_id)

# Execute a blocking command and wait for the result
command = sandbox.process.execute_session_command(
  session_id: session_id,
  req: Daytona::SessionExecuteRequest.new(
    command: 'echo "Hello from stdout" && echo "Hello from stderr" >&2'
  )
)
puts "[STDOUT]: #{command.stdout}"
puts "[STDERR]: #{command.stderr}"
puts "[OUTPUT]: #{command.output}"

# Or execute command in the background and get the logs later
command = sandbox.process.execute_session_command(
  session_id: session_id,
  req: Daytona::SessionExecuteRequest.new(
    command: 'while true; do if (( RANDOM % 2 )); then echo "All good at $(date)"; else echo "Oops, an error at $(date)" >&2; fi; sleep 1; done',
    run_async: true
  )
)
sleep(5)
# Get the logs up to the current point in time
logs = sandbox.process.get_session_command_logs(
  session_id: session_id,
  command_id: command.cmd_id
)
puts "[STDOUT]: #{logs.stdout}"
puts "[STDERR]: #{logs.stderr}"
puts "[OUTPUT]: #{logs.output}"

daytona.delete(sandbox)
```


```go
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/daytona/clients/sdk-go/pkg/daytona"
)

func main() {
	client, _ := daytona.NewClient()
	ctx := context.Background()
	sandbox, _ := client.Create(ctx, nil)

	sessionID := "exec-session-1"
	sandbox.Process.CreateSession(ctx, sessionID)

	// Execute a blocking command and wait for the result
	cmd1, _ := sandbox.Process.ExecuteSessionCommand(ctx, sessionID,
		`echo "Hello from stdout" && echo "Hello from stderr" >&2`, false, false)
	if stdout, ok := cmd1["stdout"].(string); ok {
		fmt.Printf("[STDOUT]: %s\n", stdout)
	}
	if stderr, ok := cmd1["stderr"].(string); ok {
		fmt.Printf("[STDERR]: %s\n", stderr)
	}

	// Or execute command in the background and get the logs later
	cmd := `counter=1; while (( counter <= 5 )); do echo "Count: $counter"; ((counter++)); sleep 1; done`
	cmdResult, _ := sandbox.Process.ExecuteSessionCommand(ctx, sessionID, cmd, true, false)
	cmdID, _ := cmdResult["id"].(string)

	time.Sleep(5 * time.Second)

	// Get the logs up to the current point in time
	logs, err := sandbox.Process.GetSessionCommandLogs(ctx, sessionID, cmdID)
	if err != nil {
		log.Fatalf("Failed to get logs: %v", err)
	}
	fmt.Printf("[STDOUT]: %s\n", logs.Stdout)
	fmt.Printf("[STDERR]: %s\n", logs.Stderr)
	fmt.Printf("[OUTPUT]: %s\n", logs.Output)

	sandbox.Delete(ctx)
}
```


```java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.SessionCommandLogsResponse;
import io.daytona.sdk.model.SessionExecuteRequest;
import io.daytona.sdk.model.SessionExecuteResponse;

public class App {
    public static void main(String[] args) throws InterruptedException {
        try (Daytona daytona = new Daytona()) {
            Sandbox sandbox = daytona.create();
            String sessionId = "exec-session-1";
            sandbox.getProcess().createSession(sessionId);

            SessionExecuteResponse command = sandbox.getProcess().executeSessionCommand(
                    sessionId,
                    new SessionExecuteRequest(
                            "echo 'Hello from stdout' && echo 'Hello from stderr' >&2",
                            false));
            System.out.println("[STDOUT]: " + command.getStdout());
            System.out.println("[STDERR]: " + command.getStderr());
            System.out.println("[OUTPUT]: " + command.getOutput());

            SessionExecuteResponse asyncCmd = sandbox.getProcess().executeSessionCommand(
                    sessionId,
                    new SessionExecuteRequest(
                            "while true; do if (( RANDOM % 2 )); then echo \"All good at $(date)\"; else echo \"Oops, an error at $(date)\" >&2; fi; sleep 1; done",
                            true));
            Thread.sleep(5000);
            SessionCommandLogsResponse logs = sandbox.getProcess().getSessionCommandLogs(sessionId, asyncCmd.getCmdId());
            System.out.println("[STDOUT]: " + logs.getStdout());
            System.out.println("[STDERR]: " + logs.getStderr());
            System.out.println("[OUTPUT]: " + logs.getOutput());

            sandbox.delete();
        }
    }
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/session/{sessionId}/command/{commandId}/logs'
```