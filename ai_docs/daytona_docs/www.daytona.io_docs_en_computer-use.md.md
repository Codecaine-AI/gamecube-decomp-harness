---
url: "https://www.daytona.io/docs/en/computer-use.md"
title: undefined
---

# Computer Use

Computer Use enables programmatic control of desktop environments within sandboxes. It provides mouse, keyboard, screenshot, screen recording, and display operations for automating GUI interactions and testing desktop applications.

Computer Use and [VNC](https://www.daytona.io/docs/en/vnc-access.md) work together to enable both manual and automated desktop interactions. VNC provides the visual interface for users to manually interact with the desktop, while Computer Use provides the programmatic API for AI agents to automate operations.

Computer Use is available for **Linux** and **Windows**. **macOS** support is currently in private alpha.

:::note[macOS access]
Computer Use for macOS is currently in private alpha and requires access. To request access, fill out the [macOS access request form](https://docs.google.com/forms/d/e/1FAIpQLSc9xlGZ49OjWNkyzDPC9Ip3InMRR0ZXY3tcoD-PFQj3ck6gzQ/viewform?usp=sharing&ouid=103304973264148733944). Our team will review your request and reach out with setup instructions.
:::

- **GUI application testing**: automate interactions with native applications, click buttons, fill forms, and validate UI behavior
- **Visual testing & screenshots**: capture screenshots of applications, compare UI states, and perform visual regression testing
- **Desktop automation**: automate repetitive desktop tasks, file management through GUI, and complex workflows

## Start Computer Use

Start all computer use processes (Xvfb, xfce4, x11vnc, novnc) in the Sandbox.


```python
result = sandbox.computer_use.start()
print("Computer use processes started:", result.message)
```


```typescript
const result = await sandbox.computerUse.start();
console.log('Computer use processes started:', result.message);
```


```ruby
result = sandbox.computer_use.start
puts "Computer use processes started: #{result.message}"
```


```go
err := sandbox.ComputerUse.Start(ctx)
if err != nil {
	log.Fatal(err)
}
defer sandbox.ComputerUse.Stop(ctx)

fmt.Println("Computer use processes started")
```


```java
var result = sandbox.computerUse.start();
System.out.println("Computer use processes started: " + result.getMessage());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/start' \
  --request POST
```


## Stop Computer Use

Stop all computer use processes in the Sandbox.


```python
result = sandbox.computer_use.stop()
print("Computer use processes stopped:", result.message)
```


```typescript
const result = await sandbox.computerUse.stop();
console.log('Computer use processes stopped:', result.message);
```


```ruby
result = sandbox.computer_use.stop
puts "Computer use processes stopped: #{result.message}"
```


```go
err := sandbox.ComputerUse.Stop(ctx)
if err != nil {
	log.Fatal(err)
}

fmt.Println("Computer use processes stopped")
```


```java
var result = sandbox.computerUse.stop();
System.out.println("Computer use processes stopped: " + result.getMessage());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/stop' \
  --request POST
```


## Get status

Get the status of all computer use processes.


```python
response = sandbox.computer_use.get_status()
print("Computer use status:", response.status)
```


```typescript
const status = await sandbox.computerUse.getStatus();
console.log('Computer use status:', status.status);
```


```ruby
response = sandbox.computer_use.status
puts "Computer use status: #{response.status}"
```


```go
status, err := sandbox.ComputerUse.GetStatus(ctx)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Computer use status: %v\n", status["status"])
```


```java
var response = sandbox.computerUse.getStatus();
System.out.println("Computer use status: " + response.getStatus());
```


```bash
# Status of the computer use system
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/status'

# Status of all computer use processes
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/process-status'
```


## Get process status

Get the status of a specific VNC process.


```python
xvfb_status = sandbox.computer_use.get_process_status("xvfb")
novnc_status = sandbox.computer_use.get_process_status("novnc")
```


```typescript
const xvfbStatus = await sandbox.computerUse.getProcessStatus('xvfb');
const noVncStatus = await sandbox.computerUse.getProcessStatus('novnc');
```


```ruby
xvfb_status = sandbox.computer_use.get_process_status("xvfb")
no_vnc_status = sandbox.computer_use.get_process_status("novnc")
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/process/{processName}/status'
```


## Restart process

Restart a specific VNC process.


```python
result = sandbox.computer_use.restart_process("xfce4")
print("XFCE4 process restarted:", result.message)
```


```typescript
const result = await sandbox.computerUse.restartProcess('xfce4');
console.log('XFCE4 process restarted:', result.message);
```


```ruby
result = sandbox.computer_use.restart_process("xfce4")
puts "XFCE4 process restarted: #{result.message}"
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/process/{processName}/restart' \
  --request POST
```


## Get process logs

Get logs for a specific VNC process.


```python
logs = sandbox.computer_use.get_process_logs("novnc")
print("NoVNC logs:", logs)
```


```typescript
const logsResp = await sandbox.computerUse.getProcessLogs('novnc');
console.log('NoVNC logs:', logsResp.logs);
```


```ruby
logs = sandbox.computer_use.get_process_logs("novnc")
puts "NoVNC logs: #{logs}"
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/process/{processName}/logs'
```


## Get process errors

Get error logs for a specific VNC process.


```python
errors = sandbox.computer_use.get_process_errors("x11vnc")
print("X11VNC errors:", errors)
```


```typescript
const errorsResp = await sandbox.computerUse.getProcessErrors('x11vnc');
console.log('X11VNC errors:', errorsResp.errors);
```


```ruby
errors = sandbox.computer_use.get_process_errors("x11vnc")
puts "X11VNC errors: #{errors}"
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/process/{processName}/errors'
```


## Mouse operations

### Click

Click the mouse at the specified coordinates. `button` is one of `left`, `right`, or `middle` (case-insensitive; defaults to `left`); other values return an error.


```python
# Single left click
result = sandbox.computer_use.mouse.click(100, 200)

# Double click
double_click = sandbox.computer_use.mouse.click(100, 200, "left", True)

# Right click
right_click = sandbox.computer_use.mouse.click(100, 200, "right")
```


```typescript
// Single left click
const result = await sandbox.computerUse.mouse.click(100, 200);

// Double click
const doubleClick = await sandbox.computerUse.mouse.click(100, 200, 'left', true);

// Right click
const rightClick = await sandbox.computerUse.mouse.click(100, 200, 'right');
```


```ruby
# Single left click
result = sandbox.computer_use.mouse.click(x: 100, y: 200)

# Double click
double_click = sandbox.computer_use.mouse.click(x: 100, y: 200, button: 'left', double: true)

# Right click
right_click = sandbox.computer_use.mouse.click(x: 100, y: 200, button: 'right')
```


```go
// Single left click
result, err := sandbox.ComputerUse.Mouse().Click(ctx, 100, 200, nil, nil)
if err != nil {
	log.Fatal(err)
}

// Double click
doubleClick := true
result, err = sandbox.ComputerUse.Mouse().Click(ctx, 100, 200, nil, &doubleClick)

// Right click
rightButton := "right"
result, err = sandbox.ComputerUse.Mouse().Click(ctx, 100, 200, &rightButton, nil)
```


```java
// Single left click
sandbox.computerUse.click(100, 200);

// Double click
sandbox.computerUse.doubleClick(100, 200);

// Right click
sandbox.computerUse.click(100, 200, "right");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/mouse/click' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "button": "left",
  "double": true,
  "x": 100,
  "y": 200
}'
```


### Move

Move the mouse cursor to the specified coordinates.


```python
result = sandbox.computer_use.mouse.move(100, 200)
print(f"Mouse moved to: {result.x}, {result.y}")
```


```typescript
const result = await sandbox.computerUse.mouse.move(100, 200);
console.log(`Mouse moved to: ${result.x}, ${result.y}`);
```


```ruby
result = sandbox.computer_use.mouse.move(x: 100, y: 200)
puts "Mouse moved to: #{result.x}, #{result.y}"
```


```go
result, err := sandbox.ComputerUse.Mouse().Move(ctx, 100, 200)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Mouse moved to: %v, %v\n", result["x"], result["y"])
```


```java
var result = sandbox.computerUse.moveMouse(100, 200);
System.out.println("Mouse moved to: " + result.getX() + ", " + result.getY());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/mouse/move' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "x": 1,
  "y": 1
}'
```


### Drag

Drag the mouse from start coordinates to end coordinates.


```python
result = sandbox.computer_use.mouse.drag(50, 50, 150, 150)
print(f"Drag ended at {result.x}, {result.y}")
```


```typescript
const result = await sandbox.computerUse.mouse.drag(50, 50, 150, 150);
console.log(`Drag ended at ${result.x}, ${result.y}`);
```


```ruby
result = sandbox.computer_use.mouse.drag(start_x: 50, start_y: 50, end_x: 150, end_y: 150)
puts "Drag ended at #{result.x}, #{result.y}"
```


```go
result, err := sandbox.ComputerUse.Mouse().Drag(ctx, 50, 50, 150, 150, nil)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Dragged to %v, %v\n", result["x"], result["y"])
```


```java
var result = sandbox.computerUse.drag(50, 50, 150, 150);
System.out.println("Drag ended at: " + result.getX() + ", " + result.getY());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/mouse/drag' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "button": "left",
  "endX": 200,
  "endY": 300,
  "startX": 100,
  "startY": 100
}'
```


### Scroll

Scroll the mouse wheel at the specified coordinates. `direction` is `up` or `down` (other values return an error). `amount` is the number of scroll wheel ticks to send — one tick is roughly one notch of a physical mouse wheel, which moves a few lines in most apps. Defaults to 1 if omitted.


```python
# Scroll up
scroll_up = sandbox.computer_use.mouse.scroll(100, 200, "up", 3)

# Scroll down
scroll_down = sandbox.computer_use.mouse.scroll(100, 200, "down", 5)
```


```typescript
// Scroll up
const scrollUp = await sandbox.computerUse.mouse.scroll(100, 200, 'up', 3);

// Scroll down
const scrollDown = await sandbox.computerUse.mouse.scroll(100, 200, 'down', 5);
```


```ruby
# Scroll up
scroll_up = sandbox.computer_use.mouse.scroll(x: 100, y: 200, direction: 'up', amount: 3)

# Scroll down
scroll_down = sandbox.computer_use.mouse.scroll(x: 100, y: 200, direction: 'down', amount: 5)
```


```go
// Scroll up
amount := 3
success, err := sandbox.ComputerUse.Mouse().Scroll(ctx, 100, 200, "up", &amount)
if err != nil {
	log.Fatal(err)
}

// Scroll down
amount = 5
success, err = sandbox.ComputerUse.Mouse().Scroll(ctx, 100, 200, "down", &amount)
```


```java
// Scroll up (negative vertical delta maps to "up")
sandbox.computerUse.scroll(100, 200, 0, -3);

// Scroll down
sandbox.computerUse.scroll(100, 200, 0, 5);
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/mouse/scroll' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "amount": 3,
  "direction": "down",
  "x": 100,
  "y": 200
}'
```


### Get position

Get the current mouse cursor position.


```python
position = sandbox.computer_use.mouse.get_position()
print(f"Mouse is at: {position.x}, {position.y}")
```


```typescript
const position = await sandbox.computerUse.mouse.getPosition();
console.log(`Mouse is at: ${position.x}, ${position.y}`);
```


```ruby
position = sandbox.computer_use.mouse.position
puts "Mouse is at: #{position.x}, #{position.y}"
```


```go
position, err := sandbox.ComputerUse.Mouse().GetPosition(ctx)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Mouse is at: %v, %v\n", position["x"], position["y"])
```


```java
var position = sandbox.computerUse.getMousePosition();
System.out.println("Mouse is at: " + position.getX() + ", " + position.getY());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/mouse/position'
```


## Keyboard operations

### Type

Types arbitrary text, including uppercase letters, symbols, and non-ASCII characters. Newlines (`\n`, `\r`, `\r\n`) are translated into Enter key presses; literal tab and other control characters are rejected.


```python
sandbox.computer_use.keyboard.type("Hello, World!")

# With delay between characters
sandbox.computer_use.keyboard.type("Slow typing", 100)
```


```typescript
await sandbox.computerUse.keyboard.type('Hello, World!');

// With delay between characters
await sandbox.computerUse.keyboard.type('Slow typing', 100);
```


```ruby
sandbox.computer_use.keyboard.type(text: "Hello, World!")

# With delay between characters
sandbox.computer_use.keyboard.type(text: "Slow typing", delay: 100)
```


```go
err := sandbox.ComputerUse.Keyboard().Type(ctx, "Hello, World!", nil)
if err != nil {
	log.Fatal(err)
}

// With delay between characters
delay := 100
err = sandbox.ComputerUse.Keyboard().Type(ctx, "Slow typing", &delay)
```


```java
sandbox.computerUse.typeText("Hello, World!");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/keyboard/type' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "delay": 1,
  "text": ""
}'
```


### Press

Press a key with optional modifiers.


```python
# Press Enter
sandbox.computer_use.keyboard.press("enter")

# Press Ctrl+C
sandbox.computer_use.keyboard.press("c", ["ctrl"])

# Press Ctrl+Shift+T
sandbox.computer_use.keyboard.press("t", ["ctrl", "shift"])
```


```typescript
// Press Enter
await sandbox.computerUse.keyboard.press('enter');

// Press Ctrl+C
await sandbox.computerUse.keyboard.press('c', ['ctrl']);

// Press Ctrl+Shift+T
await sandbox.computerUse.keyboard.press('t', ['ctrl', 'shift']);
```


```ruby
# Press Enter
sandbox.computer_use.keyboard.press(key: "enter")

# Press Ctrl+C
sandbox.computer_use.keyboard.press(key: "c", modifiers: ["ctrl"])

# Press Ctrl+Shift+T
sandbox.computer_use.keyboard.press(key: "t", modifiers: ["ctrl", "shift"])
```


```go
// Press Enter
err := sandbox.ComputerUse.Keyboard().Press(ctx, "enter", nil)
if err != nil {
	log.Fatal(err)
}

// Press Ctrl+C
err = sandbox.ComputerUse.Keyboard().Press(ctx, "c", []string{"ctrl"})

// Press Ctrl+Shift+T
err = sandbox.ComputerUse.Keyboard().Press(ctx, "t", []string{"ctrl", "shift"})
```


```java
// Press Enter
sandbox.computerUse.pressKey("enter");

// Press Ctrl+C
sandbox.computerUse.pressHotkey("ctrl", "c");

// Press Ctrl+Shift+T
sandbox.computerUse.pressHotkey("ctrl", "shift", "t");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/keyboard/key' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "key": "enter",
  "modifiers": []
}'
```


### Hotkey

Press a hotkey combination.


```python
# Copy
sandbox.computer_use.keyboard.hotkey("ctrl+c")

# Paste
sandbox.computer_use.keyboard.hotkey("ctrl+v")

# Alt+Tab
sandbox.computer_use.keyboard.hotkey("alt+tab")
```

```typescript
// Copy
await sandbox.computerUse.keyboard.hotkey('ctrl+c');

// Paste
await sandbox.computerUse.keyboard.hotkey('ctrl+v');

// Alt+Tab
await sandbox.computerUse.keyboard.hotkey('alt+tab');
```


```ruby
# Copy
sandbox.computer_use.keyboard.hotkey(keys: "ctrl+c")

# Paste
sandbox.computer_use.keyboard.hotkey(keys: "ctrl+v")

# Alt+Tab
sandbox.computer_use.keyboard.hotkey(keys: "alt+tab")
```


```go
// Copy
err := sandbox.ComputerUse.Keyboard().Hotkey(ctx, "ctrl+c")
if err != nil {
	log.Fatal(err)
}

// Paste
err = sandbox.ComputerUse.Keyboard().Hotkey(ctx, "ctrl+v")

// Alt+Tab
err = sandbox.ComputerUse.Keyboard().Hotkey(ctx, "alt+tab")
```


```java
// Copy
sandbox.computerUse.pressHotkey("ctrl", "c");

// Paste
sandbox.computerUse.pressHotkey("ctrl", "v");

// Alt+Tab
sandbox.computerUse.pressHotkey("alt", "tab");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/keyboard/hotkey' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "keys": "ctrl+c"
}'
```


### Supported keys

`keyboard.press()` and `keyboard.hotkey()` are case-insensitive for named keys. The following are supported:

| Category           | Keys                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Modifiers          | `ctrl`, `alt`, `shift`, `cmd`                                                                                                   |
| Editing            | `enter`, `escape`, `tab`, `backspace`, `delete`, `space`                                                                        |
| Navigation         | `home`, `end`, `pageup`, `pagedown`, `insert`, arrow keys (`up`, `down`, `left`, `right`)                                       |
| Function keys      | `f1` through `f24`                                                                                                              |
| Numpad             | `num0`–`num9`, `num_plus`, `num_minus`, `num_asterisk`, `num_slash`, `num_decimal`, `num_enter`, `num_equal`, `num_lock`        |
| Letters and digits | `a`–`z` (case-insensitive), `0`–`9`                                                                                             |
| Punctuation        | `` ` `` `-` `=` `[` `]` `\` `;` `'` `,` `.` `/`                                                                                 |
| Other              | `capslock`, `menu`                                                                                                              |

Common aliases like `Return` → `enter`, `control` → `ctrl`, `command` / `meta` / `win` → `cmd`, and `option` → `alt` are normalized automatically. Unsupported or malformed inputs return an error, sometimes with a suggested alternative.

## Accessibility operations

Use Linux accessibility operations to inspect the AT-SPI tree and interact with UI elements by node ID. Start Computer Use before calling accessibility methods.

:::note[App accessibility support]
Accessibility operations read the semantic UI information that applications expose over AT-SPI. Apps or custom widgets that do not expose accessibility objects may return sparse nodes, generic roles, or no actionable nodes; mouse, keyboard, and screenshot operations remain available for those cases.
:::

### Get tree

Read an accessibility tree for the focused app, a specific process, or all apps.


```python
# Focused app
focused_tree = sandbox.computer_use.accessibility.get_tree(scope="focused", max_depth=2)

# Specific process
process_tree = sandbox.computer_use.accessibility.get_tree(
    scope="pid",
    pid=1234,
    max_depth=2,
)

# All apps
desktop_tree = sandbox.computer_use.accessibility.get_tree(scope="all", max_depth=2)
```


```typescript
// Focused app
const focusedTree = await sandbox.computerUse.accessibility.getTree({
  scope: 'focused',
  maxDepth: 2,
});

// Specific process
const processTree = await sandbox.computerUse.accessibility.getTree({
  scope: 'pid',
  pid: 1234,
  maxDepth: 2,
});

// All apps
const desktopTree = await sandbox.computerUse.accessibility.getTree({
  scope: 'all',
  maxDepth: 2,
});
```


```ruby
# Focused app
focused_tree = sandbox.computer_use.accessibility.get_tree(scope: "focused", max_depth: 2)

# Specific process
process_tree = sandbox.computer_use.accessibility.get_tree(
  scope: "pid",
  pid: 1234,
  max_depth: 2
)

# All apps
desktop_tree = sandbox.computer_use.accessibility.get_tree(scope: "all", max_depth: 2)
```


```go
maxDepth := 2

// Focused app
focusedScope := "focused"
focusedTree, err := sandbox.ComputerUse.Accessibility().GetTree(ctx, &daytona.AccessibilityTreeOptions{
	Scope:    &focusedScope,
	MaxDepth: &maxDepth,
})
if err != nil {
	log.Fatal(err)
}

// Specific process
processScope := "pid"
pid := 1234
processTree, err := sandbox.ComputerUse.Accessibility().GetTree(ctx, &daytona.AccessibilityTreeOptions{
	Scope:    &processScope,
	PID:      &pid,
	MaxDepth: &maxDepth,
})
if err != nil {
	log.Fatal(err)
}

// All apps
allScope := "all"
desktopTree, err := sandbox.ComputerUse.Accessibility().GetTree(ctx, &daytona.AccessibilityTreeOptions{
	Scope:    &allScope,
	MaxDepth: &maxDepth,
})
if err != nil {
	log.Fatal(err)
}
```


```java
// Focused app
var focusedTree = sandbox.computerUse.getAccessibilityTree("focused", null, 2);

// Specific process
var processTree = sandbox.computerUse.getAccessibilityTree("pid", 1234, 2);

// All apps
var desktopTree = sandbox.computerUse.getAccessibilityTree("all", null, 2);
```


```bash
# Focused app
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/tree?scope=focused&maxDepth=2'

# Specific process
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/tree?scope=pid&pid=1234&maxDepth=2'

# All apps
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/tree?scope=all&maxDepth=2'
```


### Find nodes

Search the accessibility tree by role, accessible name, state, and scope.


```python
# Find buttons by accessible name
buttons = sandbox.computer_use.accessibility.find_nodes(
    scope="focused",
    role="button",
    name="Submit",
    name_match="substring",
    limit=10,
)

# Find text entries in a process
entries = sandbox.computer_use.accessibility.find_nodes(
    scope="pid",
    pid=1234,
    role="entry",
    states=["enabled", "focusable"],
    limit=10,
)

# Find visible nodes across all apps
visible_nodes = sandbox.computer_use.accessibility.find_nodes(
    scope="all",
    states=["visible"],
    limit=20,
)
```


```typescript
// Find buttons by accessible name
const buttons = await sandbox.computerUse.accessibility.findNodes({
  scope: 'focused',
  role: 'button',
  name: 'Submit',
  nameMatch: 'substring',
  limit: 10,
});

// Find text entries in a process
const entries = await sandbox.computerUse.accessibility.findNodes({
  scope: 'pid',
  pid: 1234,
  role: 'entry',
  states: ['enabled', 'focusable'],
  limit: 10,
});

// Find visible nodes across all apps
const visibleNodes = await sandbox.computerUse.accessibility.findNodes({
  scope: 'all',
  states: ['visible'],
  limit: 20,
});
```


```ruby
# Find buttons by accessible name
buttons = sandbox.computer_use.accessibility.find_nodes(
  scope: "focused",
  role: "button",
  name: "Submit",
  name_match: "substring",
  limit: 10
)

# Find text entries in a process
entries = sandbox.computer_use.accessibility.find_nodes(
  scope: "pid",
  pid: 1234,
  role: "entry",
  states: ["enabled", "focusable"],
  limit: 10
)

# Find visible nodes across all apps
visible_nodes = sandbox.computer_use.accessibility.find_nodes(
  scope: "all",
  states: ["visible"],
  limit: 20
)
```


```go
limit := 10

// Find buttons by accessible name
focusedScope := "focused"
buttonRole := "button"
submitName := "Submit"
substringMatch := "substring"
buttons, err := sandbox.ComputerUse.Accessibility().FindNodes(ctx, &daytona.AccessibilityFindOptions{
	Scope:     &focusedScope,
	Role:      &buttonRole,
	Name:      &submitName,
	NameMatch: &substringMatch,
	Limit:     &limit,
})
if err != nil {
	log.Fatal(err)
}

// Find text entries in a process
processScope := "pid"
pid := 1234
entryRole := "entry"
entries, err := sandbox.ComputerUse.Accessibility().FindNodes(ctx, &daytona.AccessibilityFindOptions{
	Scope:  &processScope,
	PID:    &pid,
	Role:   &entryRole,
	States: []string{"enabled", "focusable"},
	Limit:  &limit,
})
if err != nil {
	log.Fatal(err)
}

// Find visible nodes across all apps
allScope := "all"
visibleLimit := 20
visibleNodes, err := sandbox.ComputerUse.Accessibility().FindNodes(ctx, &daytona.AccessibilityFindOptions{
	Scope:  &allScope,
	States: []string{"visible"},
	Limit:  &visibleLimit,
})
if err != nil {
	log.Fatal(err)
}
```


```java
// Find buttons by accessible name
var buttons = sandbox.computerUse.findAccessibilityNodes(
    new FindAccessibilityNodesRequest()
        .scope("focused")
        .role("button")
        .name("Submit")
        .nameMatch("substring")
        .limit(10)
);

// Find text entries in a process
var entries = sandbox.computerUse.findAccessibilityNodes(
    new FindAccessibilityNodesRequest()
        .scope("pid")
        .pid(1234)
        .role("entry")
        .states(java.util.List.of("enabled", "focusable"))
        .limit(10)
);

// Find visible nodes across all apps
var visibleNodes = sandbox.computerUse.findAccessibilityNodes(
    new FindAccessibilityNodesRequest()
        .scope("all")
        .states(java.util.List.of("visible"))
        .limit(20)
);
```


```bash
# Find buttons by accessible name
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/find' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "scope": "focused",
  "role": "button",
  "name": "Submit",
  "nameMatch": "substring",
  "limit": 10
}'

# Find text entries in a process
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/find' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "scope": "pid",
  "pid": 1234,
  "role": "entry",
  "states": ["enabled", "focusable"],
  "limit": 10
}'

# Find visible nodes across all apps
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/find' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "scope": "all",
  "states": ["visible"],
  "limit": 20
}'
```


### Focus node

Move keyboard focus to a node returned by `get_tree` or `find_nodes`.


```python
sandbox.computer_use.accessibility.focus_node("node-id")
```


```typescript
await sandbox.computerUse.accessibility.focusNode('node-id');
```


```ruby
sandbox.computer_use.accessibility.focus_node(id: "node-id")
```


```go
if err := sandbox.ComputerUse.Accessibility().FocusNode(ctx, "node-id"); err != nil {
	log.Fatal(err)
}
```


```java
sandbox.computerUse.focusAccessibilityNode("node-id");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/node/focus' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"id":"node-id"}'
```


### Invoke node

Run a node action, such as pressing a button.


```python
# Invoke the primary action
sandbox.computer_use.accessibility.invoke_node("node-id")

# Invoke a named action
sandbox.computer_use.accessibility.invoke_node("node-id", action="click")
```


```typescript
// Invoke the primary action
await sandbox.computerUse.accessibility.invokeNode('node-id');

// Invoke a named action
await sandbox.computerUse.accessibility.invokeNode('node-id', 'click');
```


```ruby
# Invoke the primary action
sandbox.computer_use.accessibility.invoke_node(id: "node-id")

# Invoke a named action
sandbox.computer_use.accessibility.invoke_node(id: "node-id", action: "click")
```


```go
// Invoke the primary action
if err := sandbox.ComputerUse.Accessibility().InvokeNode(ctx, "node-id", nil); err != nil {
	log.Fatal(err)
}

// Invoke a named action
action := "click"
if err := sandbox.ComputerUse.Accessibility().InvokeNode(ctx, "node-id", &action); err != nil {
	log.Fatal(err)
}
```


```java
// Invoke the primary action
sandbox.computerUse.invokeAccessibilityNode("node-id");

// Invoke a named action
sandbox.computerUse.invokeAccessibilityNode("node-id", "click");
```


```bash
# Invoke the primary action
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/node/invoke' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"id":"node-id"}'

# Invoke a named action
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/node/invoke' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"id":"node-id","action":"click"}'
```


### Set node value

Write text or value content to nodes that support value changes.


```python
sandbox.computer_use.accessibility.set_node_value("node-id", "hello")
```


```typescript
await sandbox.computerUse.accessibility.setNodeValue('node-id', 'hello');
```


```ruby
sandbox.computer_use.accessibility.set_node_value(id: "node-id", value: "hello")
```


```go
if err := sandbox.ComputerUse.Accessibility().SetNodeValue(ctx, "node-id", "hello"); err != nil {
	log.Fatal(err)
}
```


```java
sandbox.computerUse.setAccessibilityNodeValue("node-id", "hello");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/a11y/node/value' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{"id":"node-id","value":"hello"}'
```


## Screenshot operations

### Take full screen

Take a screenshot of the entire screen.


```python
screenshot = sandbox.computer_use.screenshot.take_full_screen()
print(f"Screenshot size: {screenshot.width}x{screenshot.height}")

# With cursor visible
with_cursor = sandbox.computer_use.screenshot.take_full_screen(True)
```


```typescript
const screenshot = await sandbox.computerUse.screenshot.takeFullScreen();
console.log(`Screenshot size: ${screenshot.width}x${screenshot.height}`);

// With cursor visible
const withCursor = await sandbox.computerUse.screenshot.takeFullScreen(true);
```


```ruby
screenshot = sandbox.computer_use.screenshot.take_full_screen
puts "Screenshot size: #{screenshot.width}x#{screenshot.height}"

# With cursor visible
with_cursor = sandbox.computer_use.screenshot.take_full_screen(show_cursor: true)
```


```go
screenshot, err := sandbox.ComputerUse.Screenshot().TakeFullScreen(ctx, nil)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Screenshot captured, size: %d bytes\n", *screenshot.SizeBytes)

// With cursor visible
showCursor := true
withCursor, err := sandbox.ComputerUse.Screenshot().TakeFullScreen(ctx, &showCursor)
```


```java
var screenshot = sandbox.computerUse.takeScreenshot();
Integer sizeBytes = screenshot.getSizeBytes();
System.out.println("Screenshot payload size: " + (sizeBytes != null ? sizeBytes + " bytes" : "n/a"));

// With cursor visible
var withCursor = sandbox.computerUse.takeScreenshot(true);
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/screenshot'
```


### Take region

Take a screenshot of a specific region.


```python
from daytona import ScreenshotRegion

region = ScreenshotRegion(x=100, y=100, width=300, height=200)
screenshot = sandbox.computer_use.screenshot.take_region(region)
print(f"Captured region: {screenshot.region.width}x{screenshot.region.height}")
```


```typescript
const region = { x: 100, y: 100, width: 300, height: 200 };
const screenshot = await sandbox.computerUse.screenshot.takeRegion(region);
console.log(`Captured region: ${screenshot.region.width}x${screenshot.region.height}`);
```


```ruby
region = Daytona::ComputerUse::ScreenshotRegion.new(x: 100, y: 100, width: 300, height: 200)
screenshot = sandbox.computer_use.screenshot.take_region(region: region)
puts "Captured region: #{screenshot.region.width}x#{screenshot.region.height}"
```


```go
region := types.ScreenshotRegion{X: 100, Y: 100, Width: 300, Height: 200}
screenshot, err := sandbox.ComputerUse.Screenshot().TakeRegion(ctx, region, nil)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Captured region: %dx%d\n", screenshot.Width, screenshot.Height)
```


```java
var screenshot = sandbox.computerUse.takeRegionScreenshot(100, 100, 300, 200);
Integer sizeBytes = screenshot.getSizeBytes();
System.out.println("Captured region, payload size: " + (sizeBytes != null ? sizeBytes + " bytes" : "n/a"));
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/screenshot/region?x=1&y=1&width=1&height=1'
```


### Take compressed

Take a compressed screenshot of the entire screen.


```python
from daytona import ScreenshotOptions

# Default compression
screenshot = sandbox.computer_use.screenshot.take_compressed()

# High quality JPEG
jpeg = sandbox.computer_use.screenshot.take_compressed(
    ScreenshotOptions(format="jpeg", quality=95, show_cursor=True)
)

# Scaled down PNG
scaled = sandbox.computer_use.screenshot.take_compressed(
    ScreenshotOptions(format="png", scale=0.5)
)
```


```typescript
// Default compression
const screenshot = await sandbox.computerUse.screenshot.takeCompressed();

// High quality JPEG
const jpeg = await sandbox.computerUse.screenshot.takeCompressed({
  format: 'jpeg',
  quality: 95,
  showCursor: true
});

// Scaled down PNG
const scaled = await sandbox.computerUse.screenshot.takeCompressed({
  format: 'png',
  scale: 0.5
});
```


```ruby
# Default compression
screenshot = sandbox.computer_use.screenshot.take_compressed

# High quality JPEG
jpeg = sandbox.computer_use.screenshot.take_compressed(
  options: Daytona::ComputerUse::ScreenshotOptions.new(format: "jpeg", quality: 95, show_cursor: true)
)

# Scaled down PNG
scaled = sandbox.computer_use.screenshot.take_compressed(
  options: Daytona::ComputerUse::ScreenshotOptions.new(format: "png", scale: 0.5)
)
```


```java
// Compressed full screen (format, quality 1-100, scale factor)
var screenshot = sandbox.computerUse.takeCompressedScreenshot("png", 80, 1.0);

// High quality JPEG at full scale
var jpeg = sandbox.computerUse.takeCompressedScreenshot("jpeg", 95, 1.0);

// Scaled down PNG
var scaled = sandbox.computerUse.takeCompressedScreenshot("png", 80, 0.5);
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/screenshot/compressed'
```


### Take compressed region

Take a compressed screenshot of a specific region.


```python
from daytona import ScreenshotRegion, ScreenshotOptions

region = ScreenshotRegion(x=0, y=0, width=800, height=600)
screenshot = sandbox.computer_use.screenshot.take_compressed_region(
    region,
    ScreenshotOptions(format="jpeg", quality=80, show_cursor=True)
)
print(f"Compressed size: {screenshot.size_bytes} bytes")
```


```typescript
const region = { x: 0, y: 0, width: 800, height: 600 };
const screenshot = await sandbox.computerUse.screenshot.takeCompressedRegion(region, {
  format: 'jpeg',
  quality: 80,
  showCursor: true
});
console.log(`Compressed size: ${screenshot.size_bytes} bytes`);
```


```ruby
region = Daytona::ComputerUse::ScreenshotRegion.new(x: 0, y: 0, width: 800, height: 600)
screenshot = sandbox.computer_use.screenshot.take_compressed_region(
  region: region,
  options: Daytona::ComputerUse::ScreenshotOptions.new(format: "jpeg", quality: 80, show_cursor: true)
)
puts "Compressed size: #{screenshot.size_bytes} bytes"
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/screenshot/region/compressed?x=1&y=1&width=1&height=1'
```


## Screen Recording

Computer Use supports screen recording capabilities, allowing you to capture desktop sessions for debugging, documentation, or automation workflows.

### Configure Recording Directory

By default, recordings are saved to `~/.daytona/recordings`. You can specify a custom directory by passing the `DAYTONA_RECORDINGS_DIR` environment variable when creating a sandbox:


```python
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()
sandbox = daytona.create(
    CreateSandboxFromSnapshotParams(
        snapshot="daytonaio/sandbox:0.6.0",
        name="my-sandbox",
        env_vars={"DAYTONA_RECORDINGS_DIR": "/home/daytona/my-recordings"}
    )
)
```


```typescript
import { Daytona } from '@daytona/sdk';

const daytona = new Daytona();
const sandbox = await daytona.create({
  snapshot: 'daytonaio/sandbox:0.6.0',
  name: 'my-sandbox',
  envVars: { DAYTONA_RECORDINGS_DIR: '/home/daytona/my-recordings' }
});
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(
  snapshot: 'daytonaio/sandbox:0.6.0',
  env_vars: { 'DAYTONA_RECORDINGS_DIR' => '/home/daytona/my-recordings' }
))
```


```go
import (
	"github.com/daytona/clients/sdk-go/pkg/daytona"
	"github.com/daytona/clients/sdk-go/pkg/types"
)

client, err := daytona.NewClient()
if err != nil {
	log.Fatal(err)
}

sandbox, err := client.Create(ctx, types.SnapshotParams{
	SandboxBaseParams: types.SandboxBaseParams{
		Name: "my-sandbox",
		EnvVars: map[string]string{
			"DAYTONA_RECORDINGS_DIR": "/home/daytona/my-recordings",
		},
	},
	Snapshot: "daytonaio/sandbox:0.6.0",
})
if err != nil {
	log.Fatal(err)
}
```


```java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import java.util.Map;

try (Daytona daytona = new Daytona()) {
    CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
    params.setSnapshot("daytonaio/sandbox:0.6.0");
    params.setName("my-sandbox");
    params.setEnvVars(Map.of("DAYTONA_RECORDINGS_DIR", "/home/daytona/my-recordings"));
    Sandbox sandbox = daytona.create(params);
}
```


### Start Recording

Start a new screen recording session with an optional name identifier:


```python
# Start recording with a custom name
recording = sandbox.computer_use.recording.start("test-1")
print(f"Recording started: {recording.id}")
print(f"File path: {recording.file_path}")
```


```typescript
// Start recording with a custom name
const recording = await sandbox.computerUse.recording.start('test-1');
console.log(`Recording started: ${recording.id}`);
console.log(`File path: ${recording.file_path}`);
```


```ruby
# Start recording with a custom label
recording = sandbox.computer_use.recording.start(label: 'test-1')
puts "Recording started: #{recording.id}"
puts "File path: #{recording.file_path}"
```


```go
// Start recording with a custom name
name := "test-1"
recording, err := sandbox.ComputerUse.Recording().Start(ctx, &name)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Recording started: %s\n", *recording.Id)
fmt.Printf("File path: %s\n", *recording.FilePath)
```


```java
// Start recording with a custom label
var recording = sandbox.computerUse.startRecording("test-1");
System.out.println("Recording started: " + recording.getId());
System.out.println("File path: " + recording.getFilePath());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/recordings/start' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "test-1"
}'
```


### Stop Recording

Stop an active recording session by providing the recording ID:


```python
# Stop the recording
stopped_recording = sandbox.computer_use.recording.stop(recording.id)
print(f"Recording stopped: {stopped_recording.duration_seconds} seconds")
print(f"Saved to: {stopped_recording.file_path}")
```


```typescript
// Stop the recording
const stoppedRecording = await sandbox.computerUse.recording.stop(recording.id);
console.log(`Recording stopped: ${stoppedRecording.duration_seconds} seconds`);
console.log(`Saved to: ${stoppedRecording.file_path}`);
```


```ruby
# Stop the recording
stopped_recording = sandbox.computer_use.recording.stop(id: recording.id)
puts "Recording stopped: #{stopped_recording.duration_seconds} seconds"
puts "Saved to: #{stopped_recording.file_path}"
```


```go
// Stop the recording
stoppedRecording, err := sandbox.ComputerUse.Recording().Stop(ctx, *recording.Id)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Recording stopped: %f seconds\n", *stoppedRecording.DurationSeconds)
fmt.Printf("Saved to: %s\n", *stoppedRecording.FilePath)
```


```java
// Stop the recording
var stoppedRecording = sandbox.computerUse.stopRecording(recording.getId());
System.out.println("Recording stopped: " + stoppedRecording.getDurationSeconds() + " seconds");
System.out.println("Saved to: " + stoppedRecording.getFilePath());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/recordings/stop' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "id": "recording-id"
}'
```


### List Recordings

Get a list of all recordings in the sandbox:


```python
recordings_list = sandbox.computer_use.recording.list()
print(f"Total recordings: {len(recordings_list.recordings)}")
for rec in recordings_list.recordings:
    print(f"- {rec.name}: {rec.duration_seconds}s ({rec.file_size_bytes} bytes)")
```


```typescript
const recordingsList = await sandbox.computerUse.recording.list();
console.log(`Total recordings: ${recordingsList.recordings.length}`);
recordingsList.recordings.forEach(rec => {
  console.log(`- ${rec.name}: ${rec.duration_seconds}s (${rec.file_size_bytes} bytes)`);
});
```


```ruby
recordings_list = sandbox.computer_use.recording.list
puts "Total recordings: #{recordings_list.recordings.length}"
recordings_list.recordings.each do |rec|
  puts "- #{rec.name}: #{rec.duration_seconds}s (#{rec.file_size_bytes} bytes)"
end
```


```go
recordingsList, err := sandbox.ComputerUse.Recording().List(ctx)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Total recordings: %d\n", len(recordingsList.Recordings))
for _, rec := range recordingsList.Recordings {
	fmt.Printf("- %s: %.2fs (%d bytes)\n", *rec.Name, *rec.DurationSeconds, *rec.FileSizeBytes)
}
```


```java
var recordingsList = sandbox.computerUse.listRecordings();
System.out.println("Total recordings: " + recordingsList.getRecordings().size());
for (var rec : recordingsList.getRecordings()) {
    System.out.println(
        "- " + rec.getFileName() + ": " + rec.getDurationSeconds() + "s (" + rec.getSizeBytes() + " bytes)"
    );
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/recordings'
```


### Get Recording

Get details about a specific recording:


```python
recording_detail = sandbox.computer_use.recording.get("recording-id")
print(f"Recording: {recording_detail.name}")
print(f"Status: {recording_detail.status}")
print(f"Duration: {recording_detail.duration_seconds}s")
```


```typescript
const recordingDetail = await sandbox.computerUse.recording.get('recording-id');
console.log(`Recording: ${recordingDetail.name}`);
console.log(`Status: ${recordingDetail.status}`);
console.log(`Duration: ${recordingDetail.duration_seconds}s`);
```


```ruby
recording_detail = sandbox.computer_use.recording.get(id: 'recording-id')
puts "Recording: #{recording_detail.name}"
puts "Status: #{recording_detail.status}"
puts "Duration: #{recording_detail.duration_seconds}s"
```


```go
recordingDetail, err := sandbox.ComputerUse.Recording().Get(ctx, "recording-id")
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Recording: %s\n", *recordingDetail.Name)
fmt.Printf("Status: %s\n", *recordingDetail.Status)
fmt.Printf("Duration: %.2fs\n", *recordingDetail.DurationSeconds)
```


```java
var recordingDetail = sandbox.computerUse.getRecording("recording-id");
System.out.println("Recording: " + recordingDetail.getFileName());
System.out.println("Status: " + recordingDetail.getStatus());
System.out.println("Duration: " + recordingDetail.getDurationSeconds() + "s");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/recordings/{id}'
```


### Delete Recording

Delete a recording by ID:


```python
sandbox.computer_use.recording.delete("recording-id")
print("Recording deleted successfully")
```


```typescript
await sandbox.computerUse.recording.delete('recording-id');
console.log('Recording deleted successfully');
```


```ruby
sandbox.computer_use.recording.delete(id: 'recording-id')
puts 'Recording deleted successfully'
```


```go
err := sandbox.ComputerUse.Recording().Delete(ctx, "recording-id")
if err != nil {
	log.Fatal(err)
}

fmt.Println("Recording deleted successfully")
```


```java
sandbox.computerUse.deleteRecording("recording-id");
System.out.println("Recording deleted successfully");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/recordings/{id}' \
  --request DELETE
```


### Download Recording

Download a recording file from the sandbox to your local machine. The file is streamed efficiently without loading the entire content into memory, making it suitable for large recordings.


```python
# Download recording to local file
sandbox.computer_use.recording.download(recording.id, "local_recording.mp4")
print("Recording downloaded successfully")

# Or with custom path
import os
download_path = os.path.join("recordings", f"recording_{recording.id}.mp4")
sandbox.computer_use.recording.download(recording.id, download_path)
```


```typescript
// Download recording to local file
await sandbox.computerUse.recording.download(recording.id, 'local_recording.mp4');
console.log('Recording downloaded successfully');

// Or with custom path
const downloadPath = `recordings/recording_${recording.id}.mp4`;
await sandbox.computerUse.recording.download(recording.id, downloadPath);
```


```ruby
# Download recording to local file
sandbox.computer_use.recording.download(id: recording.id, local_path: 'local_recording.mp4')
puts 'Recording downloaded successfully'

# Or with custom path
download_path = "recordings/recording_#{recording.id}.mp4"
sandbox.computer_use.recording.download(id: recording.id, local_path: download_path)
```


```go
// Download recording to local file
err := sandbox.ComputerUse.Recording().Download(ctx, recording.GetId(), "local_recording.mp4")
if err != nil {
	log.Fatal(err)
}
fmt.Println("Recording downloaded successfully")

// Or with custom path
downloadPath := fmt.Sprintf("recordings/recording_%s.mp4", recording.GetId())
err = sandbox.ComputerUse.Recording().Download(ctx, recording.GetId(), downloadPath)
```


```java
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

// Download returns a temp file from the API client; copy it to a stable path
var tempFile = sandbox.computerUse.downloadRecording(recording.getId());
Files.copy(tempFile.toPath(), Path.of("local_recording.mp4"), StandardCopyOption.REPLACE_EXISTING);
System.out.println("Recording saved to local_recording.mp4");

var downloadPath = Path.of("recordings", "recording_" + recording.getId() + ".mp4");
Files.createDirectories(downloadPath.getParent());
Files.copy(tempFile.toPath(), downloadPath, StandardCopyOption.REPLACE_EXISTING);
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/recordings/{id}/download' \
  --output local_recording.mp4
```


:::tip[Streaming Downloads]
All SDK implementations stream the recording file directly to disk without loading the entire content into memory. This allows you to download large recordings (hundreds of MB or even GB) efficiently without running out of memory.

- **Python**: Streams in 64KB chunks using `httpx`
- **TypeScript**: Uses Node.js `pipeline()` with backpressure handling
- **Ruby**: Uses Typhoeus streaming with `on_body` callbacks
- **Go**: Uses `io.Copy()` with 32KB internal buffer
- **Java**: The OpenAPI client streams the response body into a temporary file via OkHttp
:::

### Recording Dashboard

Every sandbox includes a built-in recording dashboard for managing screen recordings through a web interface. The dashboard allows you to view, download, and delete recordings without writing code.

To access the recording dashboard:

1. Navigate to your sandboxes in the Daytona Dashboard
2. Click the action menu (three dots) for your sandbox
3. Select **Screen Recordings** from the dropdown menu

The recording dashboard provides:
- List of all recordings with metadata (name, duration, file size, creation time)
- Playback controls for reviewing recordings
- Download functionality to save recordings locally
- Delete options for managing storage

:::tip
The recording dashboard runs on a private port and is automatically secured. No additional authentication is required once you access it through the Daytona Dashboard.
:::

## Display operations

### Configure desktop resolution

By default, the virtual desktop runs at **1024x768**. Choose a different resolution by passing the `VNC_RESOLUTION` environment variable when creating a sandbox. Use the `<width>x<height>` format; widths from 640 to 7680 pixels and heights from 480 to 4320 pixels are supported.


```python
from daytona import Daytona, CreateSandboxFromSnapshotParams

daytona = Daytona()
sandbox = daytona.create(
    CreateSandboxFromSnapshotParams(
        env_vars={"VNC_RESOLUTION": "1920x1080"}
    )
)
```


```typescript
import { Daytona } from '@daytona/sdk';

const daytona = new Daytona();
const sandbox = await daytona.create({
  envVars: { VNC_RESOLUTION: '1920x1080' }
});
```


```ruby
require 'daytona'

daytona = Daytona::Daytona.new
sandbox = daytona.create(Daytona::CreateSandboxFromSnapshotParams.new(
  env_vars: { 'VNC_RESOLUTION' => '1920x1080' }
))
```


```go
import (
	"github.com/daytona/clients/sdk-go/pkg/daytona"
	"github.com/daytona/clients/sdk-go/pkg/types"
)

client, err := daytona.NewClient()
if err != nil {
	log.Fatal(err)
}

sandbox, err := client.Create(ctx, types.SnapshotParams{
	SandboxBaseParams: types.SandboxBaseParams{
		EnvVars: map[string]string{
			"VNC_RESOLUTION": "1920x1080",
		},
	},
})
if err != nil {
	log.Fatal(err)
}
```


```java
import io.daytona.sdk.Daytona;
import io.daytona.sdk.Sandbox;
import io.daytona.sdk.model.CreateSandboxFromSnapshotParams;

import java.util.Map;

try (Daytona daytona = new Daytona()) {
    CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
    params.setEnvVars(Map.of("VNC_RESOLUTION", "1920x1080"));
    Sandbox sandbox = daytona.create(params);
}
```


You can also bake a resolution into a snapshot image with `ENV VNC_RESOLUTION=1920x1080` in its Dockerfile. A value passed at creation takes precedence over the image's `ENV`, which takes precedence over the `1024x768` default. Invalid values fall back to the default.

The virtual display's framebuffer is allocated when the X server starts, so the resolution can only be set when creating the sandbox. Restarting display processes or stopping and starting the sandbox keeps the original geometry; create a new sandbox to use a different resolution.

Pick the resolution to match what your agent assumes. Agents that emit normalized coordinates scale them by an assumed screen size, so a desktop that differs from that assumption displaces every click. Verify the live geometry with [Get info](#get-info) below.

:::note
`VNC_RESOLUTION` applies to Linux container sandboxes (the default sandbox class). Linux VM and Windows sandboxes currently run at a fixed resolution. Creating a sandbox with custom environment variables also bypasses pre-warmed sandbox pools, so allocation can take slightly longer.
:::

### Get info

Get information about the displays.


```python
info = sandbox.computer_use.display.get_info()
print(f"Primary display: {info.primary_display.width}x{info.primary_display.height}")
print(f"Total displays: {info.total_displays}")
for i, display in enumerate(info.displays):
    print(f"Display {i}: {display.width}x{display.height} at {display.x},{display.y}")
```


```typescript
const info = await sandbox.computerUse.display.getInfo();
console.log(`Primary display: ${info.primary_display.width}x${info.primary_display.height}`);
console.log(`Total displays: ${info.total_displays}`);
info.displays.forEach((display, index) => {
  console.log(`Display ${index}: ${display.width}x${display.height} at ${display.x},${display.y}`);
});
```


```ruby
info = sandbox.computer_use.display.info
puts "Primary display: #{info.primary_display.width}x#{info.primary_display.height}"
puts "Total displays: #{info.total_displays}"
info.displays.each_with_index do |display, i|
  puts "Display #{i}: #{display.width}x#{display.height} at #{display.x},#{display.y}"
end
```


```go
info, err := sandbox.ComputerUse.Display().GetInfo(ctx)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Displays: %v\n", info["displays"])
```


```java
var info = sandbox.computerUse.getDisplayInfo();
if (info.getDisplays() != null) {
    for (var display : info.getDisplays()) {
        System.out.println(
            "Display " + display.getId() + ": " + display.getWidth() + "x" + display.getHeight()
                + " at " + display.getX() + "," + display.getY()
        );
    }
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/display/info'
```


### Get windows

Get the list of open windows.


```python
windows = sandbox.computer_use.display.get_windows()
print(f"Found {windows.count} open windows:")
for window in windows.windows:
    print(f"- {window.title} (ID: {window.id})")
```


```typescript
const windows = await sandbox.computerUse.display.getWindows();
console.log(`Found ${windows.count} open windows:`);
windows.windows.forEach(window => {
  console.log(`- ${window.title} (ID: ${window.id})`);
});
```


```ruby
windows = sandbox.computer_use.display.windows
puts "Found #{windows.count} open windows:"
windows.windows.each do |window|
  puts "- #{window.title} (ID: #{window.id})"
end
```


```go
result, err := sandbox.ComputerUse.Display().GetWindows(ctx)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("Open windows: %v\n", result["windows"])
```


```java
var windows = sandbox.computerUse.getWindows();
var list = windows.getWindows();
if (list != null) {
    System.out.println("Found " + list.size() + " open windows:");
    for (var window : list) {
        System.out.println("- " + window.getTitle() + " (ID: " + window.getId() + ")");
    }
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/display/windows'
```