---
url: "https://www.daytona.io/docs/en/pty.md"
title: undefined
---

# Pseudo Terminal (PTY)

Daytona provides powerful pseudo terminal (PTY) capabilities through the `process` module in sandboxes. PTY sessions allow you to create interactive terminal sessions that can execute commands, handle user input, and manage terminal operations.

A PTY (Pseudo Terminal) is a virtual terminal interface that allows programs to interact with a shell as if they were connected to a real terminal. PTY sessions in Daytona enable:

- **Interactive Development**: REPLs, debuggers, and development tools
- **Build Processes**: Running and monitoring compilation, testing, or deployment
- **System Administration**: Remote server management and configuration
- **User Interfaces**: Terminal-based applications requiring user interaction

## Create PTY session

Create an interactive terminal session that can execute commands and handle user input.


```python
from daytona.common.pty import PtySize

pty_handle = sandbox.process.create_pty_session(
    id="my-session",
    cwd="/workspace",
    envs={"TERM": "xterm-256color"},
    pty_size=PtySize(cols=120, rows=30)
)
```


```typescript
// Create a PTY session with custom configuration
const ptyHandle = await sandbox.process.createPty({
  id: 'my-interactive-session',
  cwd: '/workspace',
  envs: { TERM: 'xterm-256color', LANG: 'en_US.UTF-8' },
  cols: 120,
  rows: 30,
  onData: (data) => {
    // Handle terminal output
    const text = new TextDecoder().decode(data)
    process.stdout.write(text)
  },
})

// Wait for connection to be established
await ptyHandle.waitForConnection()

// Send commands to the terminal
await ptyHandle.sendInput('ls -la\n')
await ptyHandle.sendInput('echo "Hello, PTY!"\n')
await ptyHandle.sendInput('exit\n')

// Wait for completion and get result
const result = await ptyHandle.wait()
console.log(`PTY session completed with exit code: ${result.exitCode}`)

// Clean up
await ptyHandle.disconnect()
```


```ruby
pty_size = Daytona::PtySize.new(rows: 30, cols: 120)
pty_handle = sandbox.process.create_pty_session(
  id: 'my-interactive-session',
  cwd: '/workspace',
  envs: { 'TERM' => 'xterm-256color' },
  pty_size: pty_size
)

# Use the PTY session
pty_handle.send_input("ls -la\n")
pty_handle.send_input("echo 'Hello, PTY!'\n")
pty_handle.send_input("exit\n")

# Handle output
pty_handle.each { |data| print data }

puts "PTY session completed with exit code: #{pty_handle.exit_code}"
```


```go
// Create a PTY session with custom configuration
handle, err := sandbox.Process.CreatePty(ctx, "my-interactive-session",
	options.WithCreatePtySize(types.PtySize{Cols: 120, Rows: 30}),
	options.WithCreatePtyEnv(map[string]string{"TERM": "xterm-256color"}),
)
if err != nil {
	log.Fatal(err)
}
defer handle.Disconnect()

// Wait for connection to be established
if err := handle.WaitForConnection(ctx); err != nil {
	log.Fatal(err)
}

// Send commands to the terminal
handle.SendInput([]byte("ls -la\n"))
handle.SendInput([]byte("echo 'Hello, PTY!'\n"))
handle.SendInput([]byte("exit\n"))

// Read output from channel
for data := range handle.DataChan() {
	fmt.Print(string(data))
}

// Wait for completion and get result
result, err := handle.Wait(ctx)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("PTY session completed with exit code: %d\n", *result.ExitCode)
```


```java
import io.daytona.sdk.PtyCreateOptions;
import io.daytona.sdk.PtyHandle;
import io.daytona.sdk.PtyResult;
import java.nio.charset.StandardCharsets;

PtyCreateOptions options = new PtyCreateOptions()
    .setId("my-interactive-session")
    .setCols(120)
    .setRows(30)
    .setOnData(chunk -> System.out.print(new String(chunk, StandardCharsets.UTF_8)));

PtyHandle ptyHandle = sandbox.process.createPty(options);
ptyHandle.waitForConnection(30);

ptyHandle.sendInput("ls -la\n");
ptyHandle.sendInput("echo \"Hello, PTY!\"\n");
ptyHandle.sendInput("exit\n");

PtyResult result = ptyHandle.waitForExit();
System.out.println("PTY session completed with exit code: " + result.getExitCode());

ptyHandle.disconnect();
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/pty' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "id": "my-session",
  "cwd": "/workspace",
  "cols": 120,
  "rows": 30,
  "envs": {
    "TERM": "xterm-256color"
  },
  "lazyStart": false
}'
```



## Connect to PTY session

Establish a connection to an existing PTY session.


```python
pty_handle = sandbox.process.connect_pty_session("my-session")
```


```typescript
// Connect to an existing PTY session
const handle = await sandbox.process.connectPty('my-session', {
  onData: (data) => {
    // Handle terminal output
    const text = new TextDecoder().decode(data)
    process.stdout.write(text)
  },
})

// Wait for connection to be established
await handle.waitForConnection()

// Send commands to the existing session
await handle.sendInput('pwd\n')
await handle.sendInput('ls -la\n')
await handle.sendInput('exit\n')

// Wait for completion
const result = await handle.wait()
console.log(`Session exited with code: ${result.exitCode}`)

// Clean up
await handle.disconnect()
```


```ruby
# Connect to an existing PTY session
pty_handle = sandbox.process.connect_pty_session('my-session')
pty_handle.send_input("echo 'Hello World'\n")
pty_handle.send_input("exit\n")

# Handle output
pty_handle.each { |data| print data }

puts "Session exited with code: #{pty_handle.exit_code}"
```


```go
// Connect to an existing PTY session
handle, err := sandbox.Process.ConnectPty(ctx, "my-session")
if err != nil {
	log.Fatal(err)
}
defer handle.Disconnect()

// Wait for connection to be established
if err := handle.WaitForConnection(ctx); err != nil {
	log.Fatal(err)
}

// Send commands to the existing session
handle.SendInput([]byte("pwd\n"))
handle.SendInput([]byte("ls -la\n"))
handle.SendInput([]byte("exit\n"))

// Read output
for data := range handle.DataChan() {
	fmt.Print(string(data))
}

// Wait for completion
result, err := handle.Wait(ctx)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Session exited with code: %d\n", *result.ExitCode)
```


```java
import io.daytona.sdk.PtyCreateOptions;
import io.daytona.sdk.PtyHandle;
import io.daytona.sdk.PtyResult;
import java.nio.charset.StandardCharsets;

PtyCreateOptions options = new PtyCreateOptions()
    .setOnData(chunk -> System.out.print(new String(chunk, StandardCharsets.UTF_8)));
PtyHandle handle = sandbox.process.connectPty("my-session", options);
handle.waitForConnection(30);

handle.sendInput("pwd\n");
handle.sendInput("ls -la\n");
handle.sendInput("exit\n");

PtyResult result = handle.waitForExit();
System.out.println("Session exited with code: " + result.getExitCode());
handle.disconnect();
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/pty/{sessionId}/connect'
```


## List PTY sessions

List PTY sessions currently registered in the sandbox.


```python
# List all PTY sessions
sessions = sandbox.process.list_pty_sessions()

for session in sessions:
    print(f"Session ID: {session.id}")
    print(f"Active: {session.active}")
    print(f"Lazy start: {session.lazy_start}")
    print(f"Created: {session.created_at}")
```


```typescript
// List all PTY sessions
const sessions = await sandbox.process.listPtySessions()

for (const session of sessions) {
  console.log(`Session ID: ${session.id}`)
  console.log(`Active: ${session.active}`)
  console.log(`Lazy start: ${session.lazyStart}`)
  console.log(`Created: ${session.createdAt}`)
  console.log('---')
}
```


```ruby
# List all PTY sessions
sessions = sandbox.process.list_pty_sessions

sessions.each do |session|
  puts "Session ID: #{session.id}"
  puts "Active: #{session.active}"
  puts "Terminal Size: #{session.cols}x#{session.rows}"
  puts '---'
end
```


```go
// List all PTY sessions
sessions, err := sandbox.Process.ListPtySessions(ctx)
if err != nil {
	log.Fatal(err)
}

for _, session := range sessions {
	fmt.Printf("Session ID: %s\n", session.Id)
	fmt.Printf("Active: %t\n", session.Active)
	fmt.Printf("Terminal Size: %dx%d\n", session.Cols, session.Rows)
	fmt.Println("---")
}
```


```java
import io.daytona.toolbox.client.model.PtySessionInfo;
import java.util.List;

List<PtySessionInfo> sessions = sandbox.process.listPtySessions();
for (PtySessionInfo session : sessions) {
    System.out.println("Session ID: " + session.getId());
    System.out.println("Active: " + session.getActive());
    System.out.println("Lazy start: " + session.getLazyStart());
    System.out.println("Created: " + session.getCreatedAt());
    System.out.println("---");
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/pty'
```


## Get PTY session info

Get details about a specific PTY session.


```python
# Get details about a specific PTY session
session_info = sandbox.process.get_pty_session_info("my-session")

print(f"Session ID: {session_info.id}")
print(f"Active: {session_info.active}")
print(f"Lazy start: {session_info.lazy_start}")
print(f"Working Directory: {session_info.cwd}")
print(f"Terminal Size: {session_info.cols}x{session_info.rows}")
```


```typescript
// Get details about a specific PTY session
const session = await sandbox.process.getPtySessionInfo('my-session')

console.log(`Session ID: ${session.id}`)
console.log(`Active: ${session.active}`)
console.log(`Lazy start: ${session.lazyStart}`)
console.log(`Working Directory: ${session.cwd}`)
console.log(`Terminal Size: ${session.cols}x${session.rows}`)
```


```ruby
# Get details about a specific PTY session
session_info = sandbox.process.get_pty_session_info('my-session')

puts "Session ID: #{session_info.id}"
puts "Active: #{session_info.active}"
puts "Lazy start: #{session_info.lazy_start}"
puts "Working Directory: #{session_info.cwd}"
puts "Terminal Size: #{session_info.cols}x#{session_info.rows}"
```


```go
// Get details about a specific PTY session
session, err := sandbox.Process.GetPtySessionInfo(ctx, "my-session")
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Session ID: %s\n", session.Id)
fmt.Printf("Active: %t\n", session.Active)
fmt.Printf("Working Directory: %s\n", session.Cwd)
fmt.Printf("Terminal Size: %dx%d\n", session.Cols, session.Rows)
```


```java
import io.daytona.toolbox.client.model.PtySessionInfo;

PtySessionInfo session = sandbox.process.getPtySessionInfo("my-session");
System.out.println("Session ID: " + session.getId());
System.out.println("Active: " + session.getActive());
System.out.println("Lazy start: " + session.getLazyStart());
System.out.println("Working Directory: " + session.getCwd());
System.out.println("Terminal Size: " + session.getCols() + "x" + session.getRows());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/pty/{sessionId}'
```


## Kill PTY session

Kill a PTY session, terminating the shell process and removing the session from the sandbox.


```python
# Kill a specific PTY session
sandbox.process.kill_pty_session("my-session")

# Verify the session no longer exists
pty_sessions = sandbox.process.list_pty_sessions()
for pty_session in pty_sessions:
    print(f"PTY session: {pty_session.id}")
```


```typescript
// Kill a specific PTY session
await sandbox.process.killPtySession('my-session')

// Verify the session is no longer active
try {
  const info = await sandbox.process.getPtySessionInfo('my-session')
  console.log(`Session still exists but active: ${info.active}`)
} catch (error) {
  console.log('Session has been completely removed')
}
```


```ruby
# Delete a specific PTY session
sandbox.process.delete_pty_session('my-session')

# Verify the session no longer exists
sessions = sandbox.process.list_pty_sessions
sessions.each do |session|
  puts "PTY session: #{session.id}"
end
```


```go
// Kill a specific PTY session
err := sandbox.Process.KillPtySession(ctx, "my-session")
if err != nil {
	log.Fatal(err)
}

// Verify the session is no longer active
sessions, err := sandbox.Process.ListPtySessions(ctx)
if err != nil {
	log.Fatal(err)
}

for _, session := range sessions {
	fmt.Printf("PTY session: %s\n", session.Id)
}
```


```java
import io.daytona.toolbox.client.model.PtySessionInfo;
import java.util.List;

sandbox.process.killPtySession("my-session");

List<PtySessionInfo> sessions = sandbox.process.listPtySessions();
for (PtySessionInfo session : sessions) {
    System.out.println("PTY session: " + session.getId());
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/pty/{sessionId}' \
  --request DELETE
```


## Resize PTY session

Resize a PTY session, allowing you to change the terminal dimensions of an active PTY session.


```python
from daytona.common.pty import PtySize

# Resize a PTY session to a larger terminal
new_size = PtySize(rows=40, cols=150)
updated_info = sandbox.process.resize_pty_session("my-session", new_size)

print(f"Terminal resized to {updated_info.cols}x{updated_info.rows}")

# You can also use the PtyHandle's resize method
pty_handle.resize(new_size)
```


```typescript
// Resize a PTY session to a larger terminal
const updatedInfo = await sandbox.process.resizePtySession('my-session', 150, 40)
console.log(`Terminal resized to ${updatedInfo.cols}x${updatedInfo.rows}`)

// You can also use the PtyHandle's resize method
await ptyHandle.resize(150, 40) // cols, rows
```


```ruby
# Resize a PTY session to a larger terminal
pty_size = Daytona::PtySize.new(rows: 40, cols: 150)
session_info = sandbox.process.resize_pty_session('my-session', pty_size)

puts "Terminal resized to #{session_info.cols}x#{session_info.rows}"
```


```go
// Resize a PTY session to a larger terminal
updatedInfo, err := sandbox.Process.ResizePtySession(ctx, "my-session", types.PtySize{
	Cols: 150,
	Rows: 40,
})
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Terminal resized to %dx%d\n", updatedInfo.Cols, updatedInfo.Rows)

// You can also use the PtyHandle's Resize method
info, err := handle.Resize(ctx, 150, 40)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Terminal resized to %dx%d\n", info.Cols, info.Rows)
```


```java
sandbox.process.resizePtySession("my-session", 150, 40);

// Or resize using the handle (after createPty or connectPty)
handle.resize(150, 40);
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/pty/{sessionId}/resize' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "cols": 150,
  "rows": 40
}'
```


## Interactive commands

Handle interactive commands with PTY sessions, allowing you to handle interactive commands that require user input and can be resized during execution.


```python
import time
import threading
from daytona.common.pty import PtySize

def handle_pty_data(data: bytes):
    text = data.decode("utf-8", errors="replace")
    print(text, end="")

# Create PTY session
pty_handle = sandbox.process.create_pty_session(
    id="interactive-session",
    pty_size=PtySize(cols=300, rows=100)
)

# Handle output while sending interactive input
thread = threading.Thread(target=pty_handle.wait, args=(handle_pty_data,))
thread.start()

# Send interactive command
pty_handle.send_input('printf "Are you accepting the terms and conditions? (y/n): " && read confirm && if [ "$confirm" = "y" ]; then echo "You accepted"; else echo "You did not accept"; fi\n')
time.sleep(1)
pty_handle.send_input("y\n")

# Resize terminal
pty_session_info = pty_handle.resize(PtySize(cols=210, rows=110))
print(f"PTY session resized to {pty_session_info.cols}x{pty_session_info.rows}")

# Exit the session
pty_handle.send_input('exit\n')
thread.join()

print(f"Session completed with exit code: {pty_handle.exit_code}")
```


```typescript
import { Daytona, Sandbox } from '@daytona/sdk'

// Create PTY session
const ptyHandle = await sandbox.process.createPty({
  id: 'interactive-session',
  cols: 300,
  rows: 100,
  onData: data => {
    const text = new TextDecoder().decode(data)
    process.stdout.write(text)
  },
})

await ptyHandle.waitForConnection()

// Send interactive command
await ptyHandle.sendInput(
  'printf "Are you accepting the terms and conditions? (y/n): " && read confirm && if [ "$confirm" = "y" ]; then echo "You accepted"; else echo "You did not accept"; fi\n'
)
await new Promise(resolve => setTimeout(resolve, 1000))
await ptyHandle.sendInput('y\n')

// Resize terminal
const ptySessionInfo = await sandbox.process.resizePtySession(
  'interactive-session',
  210,
  110
)
console.log(
  `\nPTY session resized to ${ptySessionInfo.cols}x${ptySessionInfo.rows}`
)

// Exit the session
await ptyHandle.sendInput('exit\n')

// Wait for completion
const result = await ptyHandle.wait()
console.log(`Session completed with exit code: ${result.exitCode}`)
```


```ruby
require 'daytona'

# Create PTY session
pty_handle = sandbox.process.create_pty_session(
  id: 'interactive-session',
  pty_size: Daytona::PtySize.new(cols: 300, rows: 100)
)

# Handle output in a separate thread
thread = Thread.new do
  pty_handle.each { |data| print data }
end

# Send interactive command
pty_handle.send_input('printf "Are you accepting the terms and conditions? (y/n): " && read confirm && if [ "$confirm" = "y" ]; then echo "You accepted"; else echo "You did not accept"; fi' + "\n")
sleep(1)
pty_handle.send_input("y\n")

# Resize terminal
pty_handle.resize(Daytona::PtySize.new(cols: 210, rows: 110))
puts "\nPTY session resized"

# Exit the session
pty_handle.send_input("exit\n")

# Wait for the thread to finish
thread.join

puts "Session completed with exit code: #{pty_handle.exit_code}"
```


```go
// Create PTY session
handle, err := sandbox.Process.CreatePty(ctx, "interactive-session",
	options.WithCreatePtySize(types.PtySize{Cols: 300, Rows: 100}),
)
if err != nil {
	log.Fatal(err)
}
defer handle.Disconnect()

if err := handle.WaitForConnection(ctx); err != nil {
	log.Fatal(err)
}

// Handle output in a goroutine
go func() {
	for data := range handle.DataChan() {
		fmt.Print(string(data))
	}
}()

// Send interactive command
handle.SendInput([]byte(`printf "Are you accepting the terms and conditions? (y/n): " && read confirm && if [ "$confirm" = "y" ]; then echo "You accepted"; else echo "You did not accept"; fi` + "\n"))
time.Sleep(1 * time.Second)
handle.SendInput([]byte("y\n"))

// Resize terminal
info, err := handle.Resize(ctx, 210, 110)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("\nPTY session resized to %dx%d\n", info.Cols, info.Rows)

// Exit the session
handle.SendInput([]byte("exit\n"))

// Wait for completion
result, err := handle.Wait(ctx)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Session completed with exit code: %d\n", *result.ExitCode)
```


```java
import io.daytona.sdk.PtyCreateOptions;
import io.daytona.sdk.PtyHandle;
import io.daytona.sdk.PtyResult;
import java.nio.charset.StandardCharsets;

PtyCreateOptions options = new PtyCreateOptions()
    .setId("interactive-session")
    .setCols(300)
    .setRows(100)
    .setOnData(chunk -> System.out.print(new String(chunk, StandardCharsets.UTF_8)));

PtyHandle handle = sandbox.process.createPty(options);
handle.waitForConnection(30);

handle.sendInput(
    "printf \"Are you accepting the terms and conditions? (y/n): \" && read confirm && if [ \"$confirm\" = \"y\" ]; then echo \"You accepted\"; else echo \"You did not accept\"; fi\n");
Thread.sleep(1000);
handle.sendInput("y\n");

sandbox.process.resizePtySession("interactive-session", 210, 110);
System.out.println("\nPTY session resized");

handle.sendInput("exit\n");

PtyResult result = handle.waitForExit();
System.out.println("Session completed with exit code: " + result.getExitCode());
```


## Long-running processes

Manage long-running processes with PTY sessions, allowing you to manage long-running processes that need to be monitored or terminated.


```python
import time
import threading
from daytona import Daytona, Sandbox
from daytona.common.pty import PtySize

def handle_pty_data(data: bytes):
    text = data.decode("utf-8", errors="replace")
    print(text, end="")

# Create PTY session
pty_handle = sandbox.process.create_pty_session(
    id="long-running-session",
    pty_size=PtySize(cols=120, rows=30)
)

# Start a long-running process
pty_handle.send_input('while true; do echo "Running... $(date)"; sleep 1; done\n')

# Using thread and wait() method to handle PTY output
thread = threading.Thread(target=pty_handle.wait, args=(handle_pty_data, 10))
thread.start()

time.sleep(3)  # Let it run for a bit

print("Killing long-running process...")
pty_handle.kill()

thread.join()

print(f"\nProcess terminated with exit code: {pty_handle.exit_code}")
if pty_handle.error:
    print(f"Termination reason: {pty_handle.error}")
```


```typescript
import { Daytona, Sandbox } from '@daytona/sdk'

// Create PTY session
const ptyHandle = await sandbox.process.createPty({
  id: 'long-running-session',
  cols: 120,
  rows: 30,
  onData: (data) => {
    const text = new TextDecoder().decode(data)
    process.stdout.write(text)
  },
})

await ptyHandle.waitForConnection()

// Start a long-running process
await ptyHandle.sendInput('while true; do echo "Running... $(date)"; sleep 1; done\n')
await new Promise(resolve => setTimeout(resolve, 3000)) // Let it run for a bit

console.log('Killing long-running process...')
await ptyHandle.kill()

// Wait for termination
const result = await ptyHandle.wait()
console.log(`\nProcess terminated with exit code: ${result.exitCode}`)
if (result.error) {
    console.log(`Termination reason: ${result.error}`)
}
```


```ruby
require 'daytona'

# Create PTY session
pty_handle = sandbox.process.create_pty_session(
  id: 'long-running-session',
  pty_size: Daytona::PtySize.new(cols: 120, rows: 30)
)

# Handle output in a separate thread
thread = Thread.new do
  pty_handle.each { |data| print data }
end

# Start a long-running process
pty_handle.send_input("while true; do echo \"Running... $(date)\"; sleep 1; done\n")
sleep(3) # Let it run for a bit

puts "Killing long-running process..."
pty_handle.kill

thread.join

puts "\nProcess terminated with exit code: #{pty_handle.exit_code}"
puts "Termination reason: #{pty_handle.error}" if pty_handle.error
```


```go
// Create PTY session
handle, err := sandbox.Process.CreatePty(ctx, "long-running-session",
	options.WithCreatePtySize(types.PtySize{Cols: 120, Rows: 30}),
)
if err != nil {
	log.Fatal(err)
}
defer handle.Disconnect()

if err := handle.WaitForConnection(ctx); err != nil {
	log.Fatal(err)
}

// Handle output in a goroutine
go func() {
	for data := range handle.DataChan() {
		fmt.Print(string(data))
	}
}()

// Start a long-running process
handle.SendInput([]byte(`while true; do echo "Running... $(date)"; sleep 1; done` + "\n"))
time.Sleep(3 * time.Second) // Let it run for a bit

fmt.Println("Killing long-running process...")
if err := handle.Kill(ctx); err != nil {
	log.Fatal(err)
}

// Wait for termination
result, err := handle.Wait(ctx)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("\nProcess terminated with exit code: %d\n", *result.ExitCode)
if result.Error != nil {
	fmt.Printf("Termination reason: %s\n", *result.Error)
}
```


```java
import io.daytona.sdk.PtyCreateOptions;
import io.daytona.sdk.PtyHandle;
import io.daytona.sdk.PtyResult;
import java.nio.charset.StandardCharsets;

PtyCreateOptions options = new PtyCreateOptions()
    .setId("long-running-session")
    .setCols(120)
    .setRows(30)
    .setOnData(chunk -> System.out.print(new String(chunk, StandardCharsets.UTF_8)));

PtyHandle handle = sandbox.process.createPty(options);
handle.waitForConnection(30);

handle.sendInput("while true; do echo \"Running... $(date)\"; sleep 1; done\n");
Thread.sleep(3000);

System.out.println("Killing long-running process...");
handle.kill();

PtyResult result = handle.waitForExit();
System.out.println("\nProcess terminated with exit code: " + result.getExitCode());
if (result.getError() != null) {
    System.out.println("Termination reason: " + result.getError());
}
```


## Resource management

Manage resource leaks with PTY sessions, allowing you to always clean up PTY sessions to prevent resource leaks.

```python
# Python: Use try/finally
pty_handle = None
try:
    pty_handle = sandbox.process.create_pty_session(id="session", pty_size=PtySize(cols=120, rows=30))
    # Do work...
finally:
    if pty_handle:
        pty_handle.kill()
```
```typescript
// TypeScript: Use try/finally
let ptyHandle
try {
  ptyHandle = await sandbox.process.createPty({
    id: 'session',
    cols: 120,
    rows: 30,
  })
  // Do work...
} finally {
  if (ptyHandle) await ptyHandle.kill()
}
```


```ruby
# Ruby: Use begin/ensure
pty_handle = nil
begin
  pty_handle = sandbox.process.create_pty_session(
    id: 'session',
    pty_size: Daytona::PtySize.new(cols: 120, rows: 30)
  )
  # Do work...
ensure
  pty_handle&.disconnect
end
```


```go
// Go: defer Disconnect to close the WebSocket without killing the shell
handle, err := sandbox.Process.CreatePty(ctx, "session",
	options.WithCreatePtySize(types.PtySize{Cols: 120, Rows: 30}),
)
if err != nil {
	log.Fatal(err)
}
defer handle.Disconnect()

// Do work...

// Call Kill to terminate the shell process when needed
// handle.Kill(ctx)
```


```java
import io.daytona.sdk.PtyCreateOptions;
import io.daytona.sdk.PtyHandle;

PtyHandle handle = null;
try {
    handle = sandbox.process.createPty(
        new PtyCreateOptions().setId("session").setCols(120).setRows(30));
    handle.waitForConnection(30);
    // Do work...
} finally {
    if (handle != null) {
        handle.kill();
        handle.disconnect();
    }
}
```


## PtyHandle methods

Daytona provides methods to interact with PTY sessions, allowing you to send input, resize the terminal, wait for completion, and manage the WebSocket connection to a PTY session.

### Send input

Send input to a PTY session, allowing you to send input data (keystrokes or commands) to the PTY session.


```python
# Send a command
pty_handle.send_input("ls -la\n")

# Send user input
pty_handle.send_input("y\n")
```


```typescript
// Send a command
await ptyHandle.sendInput('ls -la\n')

// Send raw bytes
await ptyHandle.sendInput(new Uint8Array([3])) // Ctrl+C
```


```ruby
# Send a command
pty_handle.send_input("ls -la\n")

# Send user input
pty_handle.send_input("y\n")
```


```go
// Send a command
handle.SendInput([]byte("ls -la\n"))

// Send Ctrl+C
handle.SendInput([]byte{0x03})
```


```java
// Send a command
ptyHandle.sendInput("ls -la\n");

// Send raw bytes (Ctrl+C)
ptyHandle.sendInput(new byte[] { 0x03 });
```


### Wait for completion

Wait for a PTY process to exit and return the result.


```python
# Wait with a callback for output data
def handle_data(data: bytes):
    print(data.decode("utf-8", errors="replace"), end="")

result = pty_handle.wait(on_data=handle_data, timeout=30)
print(f"Exit code: {result.exit_code}")
```


```typescript
// Wait for process to complete
const result = await ptyHandle.wait()

if (result.exitCode === 0) {
  console.log('Process completed successfully')
} else {
  console.log(`Process failed with code: ${result.exitCode}`)
  if (result.error) {
    console.log(`Error: ${result.error}`)
  }
}
```


```ruby
# Wait by iterating over output (blocks until PTY session ends)
pty_handle.each { |data| print data }

if pty_handle.exit_code == 0
  puts 'Process completed successfully'
else
  puts "Process failed with code: #{pty_handle.exit_code}"
  puts "Error: #{pty_handle.error}" if pty_handle.error
end
```


```go
// Wait for process to complete
result, err := handle.Wait(ctx)
if err != nil {
	log.Fatal(err)
}

if result.ExitCode != nil && *result.ExitCode == 0 {
	fmt.Println("Process completed successfully")
} else {
	fmt.Printf("Process failed with code: %d\n", *result.ExitCode)
	if result.Error != nil {
		fmt.Printf("Error: %s\n", *result.Error)
	}
}
```


```java
import io.daytona.sdk.PtyResult;

PtyResult result = ptyHandle.waitForExit();

if (result.getExitCode() == 0) {
    System.out.println("Process completed successfully");
} else {
    System.out.println("Process failed with code: " + result.getExitCode());
    if (result.getError() != null) {
        System.out.println("Error: " + result.getError());
    }
}
```


### Wait for connection

Wait for the WebSocket connection to be established before sending input.


```python
# Python handles connection internally during creation
# No explicit wait needed
```


```typescript
// Wait for connection to be established
await ptyHandle.waitForConnection()

// Now safe to send input
await ptyHandle.sendInput('echo "Connected!"\n')
```


```ruby
pty_handle.wait_for_connection
pty_handle.send_input("echo 'Connected!'\n")
```


```go
// Wait for connection to be established
if err := handle.WaitForConnection(ctx); err != nil {
	log.Fatal(err)
}

// Now safe to send input
handle.SendInput([]byte("echo 'Connected!'\n"))
```


```java
// Wait for connection (timeout in seconds)
ptyHandle.waitForConnection(30);

ptyHandle.sendInput("echo \"Connected!\"\n");
```


### Kill PTY process

Kill a PTY process and terminate the session from the handle.


```python
pty_handle.kill()
```


```typescript
// Kill a long-running process
await ptyHandle.kill()

// Wait to confirm termination
const result = await ptyHandle.wait()
console.log(`Process terminated with exit code: ${result.exitCode}`)
```


```ruby
# Kill a long-running process
pty_handle.kill

puts "Process terminated with exit code: #{pty_handle.exit_code}"
```


```go
// Kill a long-running process
if err := handle.Kill(ctx); err != nil {
	log.Fatal(err)
}

// Wait to confirm termination
result, err := handle.Wait(ctx)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Process terminated with exit code: %d\n", *result.ExitCode)
```


```java
import io.daytona.sdk.PtyResult;

ptyHandle.kill();

PtyResult result = ptyHandle.waitForExit();
System.out.println("Process terminated with exit code: " + result.getExitCode());
```


### Resize from handle

Resize the PTY terminal dimensions directly from the handle.


```python
from daytona.common.pty import PtySize

pty_handle.resize(PtySize(cols=120, rows=30))
```


```typescript
// Resize to 120x30
await ptyHandle.resize(120, 30)
```


```ruby
# Resize to 120x30
pty_handle.resize(Daytona::PtySize.new(cols: 120, rows: 30))
```


```go
// Resize to 120x30
info, err := handle.Resize(ctx, 120, 30)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Resized to %dx%d\n", info.Cols, info.Rows)
```


```java
// Resize to 120x30
ptyHandle.resize(120, 30);
```


### Disconnect

Disconnect from a PTY session and clean up resources without killing the process.


```python
# Python: Use kill() to terminate, or let the handle go out of scope
```


```typescript
// Always clean up when done
try {
  // ... use PTY session
} finally {
  await ptyHandle.disconnect()
}
```


```ruby
begin
  # ... use PTY session
ensure
  pty_handle.disconnect
end
```


```go
// Always clean up when done using defer
handle, err := sandbox.Process.CreatePty(ctx, "session")
if err != nil {
	log.Fatal(err)
}
defer handle.Disconnect()

// ... use PTY session
```


```java
try {
    // ... use PTY session
} finally {
    ptyHandle.disconnect();
}
```


### Check connection status

Check if a PTY session is still connected.


```python
# Python: Check by attempting operations or using session info
session_info = sandbox.process.get_pty_session_info("my-session")
print(f"Session active: {session_info.active}")
```


```typescript
if (ptyHandle.isConnected()) {
  console.log('PTY session is active')
}
```


```ruby
# Ruby: Check by using session info
session_info = sandbox.process.get_pty_session_info('my-session')
puts 'PTY session is active' if session_info.active
```


```go
if handle.IsConnected() {
	fmt.Println("PTY session is active")
}
```


```java
if (ptyHandle.isConnected()) {
    System.out.println("PTY session is active");
}
```


### Exit code and error

Access the exit code and error message after a PTY process terminates.


```python
# After iteration or wait completes
print(f"Exit code: {pty_handle.exit_code}")
if pty_handle.error:
    print(f"Error: {pty_handle.error}")
```


```typescript
// Access via getters after process terminates
console.log(`Exit code: ${ptyHandle.exitCode}`)
if (ptyHandle.error) {
  console.log(`Error: ${ptyHandle.error}`)
}
```


```ruby
# Access after process terminates
puts "Exit code: #{pty_handle.exit_code}"
puts "Error: #{pty_handle.error}" if pty_handle.error
```


```go
// Access via methods after process terminates
if exitCode := handle.ExitCode(); exitCode != nil {
	fmt.Printf("Exit code: %d\n", *exitCode)
}
if errMsg := handle.Error(); errMsg != nil {
	fmt.Printf("Error: %s\n", *errMsg)
}
```


```java
import io.daytona.sdk.PtyResult;

PtyResult result = ptyHandle.waitForExit();
System.out.println("Exit code: " + result.getExitCode());
if (result.getError() != null) {
    System.out.println("Error: " + result.getError());
}
```


### Iterate over output (Python)

Iterate over a PTY handle to receive output data.


```python
# Iterate over PTY output
for data in pty_handle:
    text = data.decode("utf-8", errors="replace")
    print(text, end="")

print(f"Session ended with exit code: {pty_handle.exit_code}")
```


```typescript
// TypeScript uses the onData callback instead
const ptyHandle = await sandbox.process.createPty({
  id: 'my-session',
  onData: (data) => {
    const text = new TextDecoder().decode(data)
    process.stdout.write(text)
  },
})
```


```ruby
# Iterate over PTY output
pty_handle.each do |data|
  print data
end

puts "Session ended with exit code: #{pty_handle.exit_code}"
```


```go
// Go uses a channel to receive output data
for data := range handle.DataChan() {
	fmt.Print(string(data))
}

// Or use as io.Reader
io.Copy(os.Stdout, handle)

fmt.Printf("Session ended with exit code: %d\n", *handle.ExitCode())
```


```java
import io.daytona.sdk.PtyCreateOptions;
import java.nio.charset.StandardCharsets;

PtyHandle ptyHandle = sandbox.process.createPty(
    new PtyCreateOptions()
        .setId("my-session")
        .setOnData(chunk -> System.out.print(new String(chunk, StandardCharsets.UTF_8))));
```


## Error handling

Monitor exit codes and handle errors appropriately with PTY sessions.


```python
# Python: Check exit codes
result = pty_handle.wait()
if result.exit_code != 0:
    print(f"Command failed: {result.exit_code}")
    print(f"Error: {result.error}")
```

```typescript
// TypeScript: Check exit codes
const result = await ptyHandle.wait()
if (result.exitCode !== 0) {
  console.log(`Command failed: ${result.exitCode}`)
  console.log(`Error: ${result.error}`)
}
```

```ruby
# Ruby: Check exit codes
# The handle blocks until the PTY session completes
pty_handle.each { |data| print data }

if pty_handle.exit_code != 0
  puts "Command failed: #{pty_handle.exit_code}"
  puts "Error: #{pty_handle.error}"
end
```

```go
// Go: Check exit codes
result, err := handle.Wait(ctx)
if err != nil {
	log.Fatal(err)
}

if result.ExitCode != nil && *result.ExitCode != 0 {
	fmt.Printf("Command failed: %d\n", *result.ExitCode)
	if result.Error != nil {
		fmt.Printf("Error: %s\n", *result.Error)
	}
}
```


```java
import io.daytona.sdk.PtyResult;

PtyResult result = ptyHandle.waitForExit();
if (result.getExitCode() != 0) {
    System.out.println("Command failed: " + result.getExitCode());
    if (result.getError() != null) {
        System.out.println("Error: " + result.getError());
    }
}
```