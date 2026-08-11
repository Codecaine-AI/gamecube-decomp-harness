---
url: "https://www.daytona.io/docs/en/vnc-access.md"
title: undefined
---

# VNC Access

VNC (Virtual Network Computing) access provides a graphical desktop environment for your Daytona Sandbox directly in the browser. This allows you to interact with GUI applications, desktop tools, and visual interfaces running inside your sandbox.

VNC and [Computer Use](https://www.daytona.io/docs/en/computer-use.md) work together to enable both manual and automated desktop interactions. VNC provides the visual interface for users to manually interact with the desktop, while Computer Use provides the programmatic API for AI agents to automate mouse, keyboard, and screenshot operations. Through VNC, you can observe AI agents performing automated tasks via Computer Use in real-time.

:::note[Sandbox image requirement]
VNC and Computer Use require a sandbox with the default image. Sandboxes created with custom images do not include VNC support unless you install the [required packages](#required-packages).
:::

## Access VNC from Dashboard

Access the VNC desktop environment directly from the [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sandboxes).

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Locate the sandbox you want to access via VNC
3. Click the options menu (**⋮**) next to the sandbox
4. Select **VNC** from the dropdown menu

This opens a VNC viewer in your browser with a **Connect** button.

5. Click **Connect** to establish the VNC session

Once connected, a full desktop environment loads in your browser, providing mouse and keyboard control over the sandbox's graphical interface.

:::note
VNC sessions remain active as long as the sandbox is running. If the sandbox auto-stops due to inactivity, you need to start the sandbox again before reconnecting via VNC.
:::

Configure the VNC desktop's resolution when creating the sandbox with the [`VNC_RESOLUTION` environment variable](https://www.daytona.io/docs/en/computer-use.md#configure-desktop-resolution). The resolution cannot be changed on a running sandbox.

## Programmatic VNC management

Daytona provides methods to [start](#start-vnc), [stop](#stop-vnc), and [monitor](#get-vnc-status) VNC sessions and processes programmatically using the [Computer Use](https://www.daytona.io/docs/en/computer-use.md) references as part of automated workflows.

### Start VNC

Start all VNC processes (Xvfb, xfce4, x11vnc, novnc) in the sandbox to enable desktop access.


```python
result = sandbox.computer_use.start()
print("VNC processes started:", result.message)
```


```typescript
const result = await sandbox.computerUse.start();
console.log('VNC processes started:', result.message);
```


```ruby
result = sandbox.computer_use.start
puts "VNC processes started: #{result.message}"
```


```go
err := sandbox.ComputerUse.Start(ctx)
if err != nil {
	log.Fatal(err)
}
defer sandbox.ComputerUse.Stop(ctx)

fmt.Println("VNC processes started")
```


```java
var result = sandbox.computerUse.start();
System.out.println("VNC processes started: " + result.getMessage());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/start' \
  --request POST
```


### Stop VNC

Stop all VNC processes in the sandbox.


```python
result = sandbox.computer_use.stop()
print("VNC processes stopped:", result.message)
```


```typescript
const result = await sandbox.computerUse.stop();
console.log('VNC processes stopped:', result.message);
```


```ruby
result = sandbox.computer_use.stop
puts "VNC processes stopped: #{result.message}"
```


```go
err := sandbox.ComputerUse.Stop(ctx)
if err != nil {
	log.Fatal(err)
}

fmt.Println("VNC processes stopped")
```


```java
var result = sandbox.computerUse.stop();
System.out.println("VNC processes stopped: " + result.getMessage());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/stop' \
  --request POST
```


### Get VNC status

Check the status of VNC processes to verify they are running.


```python
response = sandbox.computer_use.get_status()
print("VNC status:", response.status)
```


```typescript
const status = await sandbox.computerUse.getStatus();
console.log('VNC status:', status.status);
```


```ruby
response = sandbox.computer_use.status
puts "VNC status: #{response.status}"
```


```go
status, err := sandbox.ComputerUse.GetStatus(ctx)
if err != nil {
	log.Fatal(err)
}

fmt.Printf("VNC status: %v\n", status["status"])
```


```java
var response = sandbox.computerUse.getStatus();
System.out.println("VNC status: " + response.getStatus());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/status'
```


For additional process management operations including restarting individual processes and viewing logs, see the [Computer Use](https://www.daytona.io/docs/en/computer-use.md) reference.

## Automating desktop interactions

Once VNC is running, you can automate desktop interactions using Computer Use. This enables AI agents to programmatically control the mouse, keyboard, and capture screenshots within the VNC session.

**Available operations:**

- **Mouse**: click, move, drag, scroll, and get cursor position
- **Keyboard**: type text, press keys, and execute hotkey combinations
- **Screenshot**: capture full screen, regions, or compressed images
- **Display**: get display information and list open windows

For complete documentation on automating desktop interactions, see [Computer Use](https://www.daytona.io/docs/en/computer-use.md).

> **Example**: Automated browser interaction


```python
# Start VNC processes
sandbox.computer_use.start()

# Click to open browser
sandbox.computer_use.mouse.click(50, 50)

# Type a URL
sandbox.computer_use.keyboard.type("https://www.daytona.io/docs/")
sandbox.computer_use.keyboard.press("enter")

# Take a screenshot
screenshot = sandbox.computer_use.screenshot.take_full_screen()
```


```typescript
// Start VNC processes
await sandbox.computerUse.start();

// Click to open browser
await sandbox.computerUse.mouse.click(50, 50);

// Type a URL
await sandbox.computerUse.keyboard.type('https://www.daytona.io/docs/');
await sandbox.computerUse.keyboard.press('enter');

// Take a screenshot
const screenshot = await sandbox.computerUse.screenshot.takeFullScreen();
```


```java
// Start VNC processes
sandbox.computerUse.start();

// Click to open browser
sandbox.computerUse.click(50, 50);

// Type a URL
sandbox.computerUse.typeText("https://www.daytona.io/docs/");
sandbox.computerUse.pressKey("enter");

// Take a screenshot
var screenshot = sandbox.computerUse.takeScreenshot();
```


## Required packages

The default sandbox image includes all packages required for VNC and Computer Use. If you are using a custom image, you need to install the following packages.

### VNC and desktop environment

| Package              | Description                                |
| -------------------- | ------------------------------------------ |
| **`xvfb`**           | X Virtual Framebuffer for headless display |
| **`xfce4`**          | Desktop environment                        |
| **`xfce4-terminal`** | Terminal emulator                          |
| **`x11vnc`**         | VNC server                                 |
| **`novnc`**          | Web-based VNC client                       |
| **`dbus-x11`**       | D-Bus session support                      |

### X11 libraries

| Library           | Description                                 |
| ----------------- | ------------------------------------------- |
| **`libx11-6`**    | X11 client library                          |
| **`libxrandr2`**  | X11 RandR extension (display configuration) |
| **`libxext6`**    | X11 extensions library                      |
| **`libxrender1`** | X11 rendering extension                     |
| **`libxfixes3`**  | X11 fixes extension                         |
| **`libxss1`**     | X11 screen saver extension                  |
| **`libxtst6`**    | X11 testing extension (input simulation)    |
| **`libxi6`**      | X11 input extension                         |