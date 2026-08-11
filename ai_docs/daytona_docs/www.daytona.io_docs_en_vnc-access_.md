---
url: "https://www.daytona.io/docs/en/vnc-access/"
title: "VNC Access | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/vnc-access/#_top)

# VNC Access

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/vnc-access.md)Open

VNC (Virtual Network Computing) access provides a graphical desktop environment for your Daytona Sandbox directly in the browser. This allows you to interact with GUI applications, desktop tools, and visual interfaces running inside your sandbox.

VNC and [Computer Use](https://www.daytona.io/docs/en/computer-use) work together to enable both manual and automated desktop interactions. VNC provides the visual interface for users to manually interact with the desktop, while Computer Use provides the programmatic API for AI agents to automate mouse, keyboard, and screenshot operations. Through VNC, you can observe AI agents performing automated tasks via Computer Use in real-time.

## [\#](https://www.daytona.io/docs/en/vnc-access/\#access-vnc-from-dashboard) Access VNC from Dashboard

[Section titled “Access VNC from Dashboard”](https://www.daytona.io/docs/en/vnc-access/#access-vnc-from-dashboard)

Access the VNC desktop environment directly from the [Daytona Dashboard ↗](https://app.daytona.io/dashboard/sandboxes).

1. Go to [Daytona Sandboxes ↗](https://app.daytona.io/dashboard/sandboxes)
2. Locate the sandbox you want to access via VNC
3. Click the options menu ( **⋮**) next to the sandbox
4. Select **VNC** from the dropdown menu

This opens a VNC viewer in your browser with a **Connect** button.

5. Click **Connect** to establish the VNC session

Once connected, a full desktop environment loads in your browser, providing mouse and keyboard control over the sandbox’s graphical interface.

Configure the VNC desktop’s resolution when creating the sandbox with the [`VNC_RESOLUTION` environment variable](https://www.daytona.io/docs/en/computer-use#configure-desktop-resolution). The resolution cannot be changed on a running sandbox.

## [\#](https://www.daytona.io/docs/en/vnc-access/\#programmatic-vnc-management) Programmatic VNC management

[Section titled “Programmatic VNC management”](https://www.daytona.io/docs/en/vnc-access/#programmatic-vnc-management)

Daytona provides methods to [start](https://www.daytona.io/docs/en/vnc-access/#start-vnc), [stop](https://www.daytona.io/docs/en/vnc-access/#stop-vnc), and [monitor](https://www.daytona.io/docs/en/vnc-access/#get-vnc-status) VNC sessions and processes programmatically using the [Computer Use](https://www.daytona.io/docs/en/computer-use) references as part of automated workflows.

### [\#](https://www.daytona.io/docs/en/vnc-access/\#start-vnc) Start VNC

[Section titled “Start VNC”](https://www.daytona.io/docs/en/vnc-access/#start-vnc)

Start all VNC processes (Xvfb, xfce4, x11vnc, novnc) in the sandbox to enable desktop access.

- [Python](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1568)
- [TypeScript](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1569)
- [Ruby](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1570)
- [Go](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1571)
- [Java](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1572)
- [API](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1573)

```
result = sandbox.computer_use.start()

print("VNC processes started:", result.message)
```

```
const result = await sandbox.computerUse.start();

console.log('VNC processes started:', result.message);
```

```
result = sandbox.computer_use.start

puts "VNC processes started: #{result.message}"
```

```
err := sandbox.ComputerUse.Start(ctx)

if err != nil {

  log.Fatal(err)

}

defer sandbox.ComputerUse.Stop(ctx)

fmt.Println("VNC processes started")
```

```
var result = sandbox.computerUse.start();

System.out.println("VNC processes started: " + result.getMessage());
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/start' \

  --request POST
```

### [\#](https://www.daytona.io/docs/en/vnc-access/\#stop-vnc) Stop VNC

[Section titled “Stop VNC”](https://www.daytona.io/docs/en/vnc-access/#stop-vnc)

Stop all VNC processes in the sandbox.

- [Python](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1574)
- [TypeScript](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1575)
- [Ruby](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1576)
- [Go](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1577)
- [Java](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1578)
- [API](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1579)

```
result = sandbox.computer_use.stop()

print("VNC processes stopped:", result.message)
```

```
const result = await sandbox.computerUse.stop();

console.log('VNC processes stopped:', result.message);
```

```
result = sandbox.computer_use.stop

puts "VNC processes stopped: #{result.message}"
```

```
err := sandbox.ComputerUse.Stop(ctx)

if err != nil {

  log.Fatal(err)

}

fmt.Println("VNC processes stopped")
```

```
var result = sandbox.computerUse.stop();

System.out.println("VNC processes stopped: " + result.getMessage());
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/stop' \

  --request POST
```

### [\#](https://www.daytona.io/docs/en/vnc-access/\#get-vnc-status) Get VNC status

[Section titled “Get VNC status”](https://www.daytona.io/docs/en/vnc-access/#get-vnc-status)

Check the status of VNC processes to verify they are running.

- [Python](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1580)
- [TypeScript](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1581)
- [Ruby](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1582)
- [Go](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1583)
- [Java](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1584)
- [API](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1585)

```
response = sandbox.computer_use.get_status()

print("VNC status:", response.status)
```

```
const status = await sandbox.computerUse.getStatus();

console.log('VNC status:', status.status);
```

```
response = sandbox.computer_use.status

puts "VNC status: #{response.status}"
```

```
status, err := sandbox.ComputerUse.GetStatus(ctx)

if err != nil {

  log.Fatal(err)

}

fmt.Printf("VNC status: %v\n", status["status"])
```

```
var response = sandbox.computerUse.getStatus();

System.out.println("VNC status: " + response.getStatus());
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/computeruse/status'
```

For additional process management operations including restarting individual processes and viewing logs, see the [Computer Use](https://www.daytona.io/docs/en/computer-use) reference.

## [\#](https://www.daytona.io/docs/en/vnc-access/\#automating-desktop-interactions) Automating desktop interactions

[Section titled “Automating desktop interactions”](https://www.daytona.io/docs/en/vnc-access/#automating-desktop-interactions)

Once VNC is running, you can automate desktop interactions using Computer Use. This enables AI agents to programmatically control the mouse, keyboard, and capture screenshots within the VNC session.

**Available operations:**

- **Mouse**: click, move, drag, scroll, and get cursor position
- **Keyboard**: type text, press keys, and execute hotkey combinations
- **Screenshot**: capture full screen, regions, or compressed images
- **Display**: get display information and list open windows

For complete documentation on automating desktop interactions, see [Computer Use](https://www.daytona.io/docs/en/computer-use).

> **Example**: Automated browser interaction

- [Python](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1586)
- [TypeScript](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1587)
- [Java](https://www.daytona.io/docs/en/vnc-access/#tab-panel-1588)

```
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

```
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

```
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

## [\#](https://www.daytona.io/docs/en/vnc-access/\#required-packages) Required packages

[Section titled “Required packages”](https://www.daytona.io/docs/en/vnc-access/#required-packages)

The default sandbox image includes all packages required for VNC and Computer Use. If you are using a custom image, you need to install the following packages.

### [\#](https://www.daytona.io/docs/en/vnc-access/\#vnc-and-desktop-environment) VNC and desktop environment

[Section titled “VNC and desktop environment”](https://www.daytona.io/docs/en/vnc-access/#vnc-and-desktop-environment)

| Package | Description |
| --- | --- |
| **`xvfb`** | X Virtual Framebuffer for headless display |
| **`xfce4`** | Desktop environment |
| **`xfce4-terminal`** | Terminal emulator |
| **`x11vnc`** | VNC server |
| **`novnc`** | Web-based VNC client |
| **`dbus-x11`** | D-Bus session support |

### [\#](https://www.daytona.io/docs/en/vnc-access/\#x11-libraries) X11 libraries

[Section titled “X11 libraries”](https://www.daytona.io/docs/en/vnc-access/#x11-libraries)

| Library | Description |
| --- | --- |
| **`libx11-6`** | X11 client library |
| **`libxrandr2`** | X11 RandR extension (display configuration) |
| **`libxext6`** | X11 extensions library |
| **`libxrender1`** | X11 rendering extension |
| **`libxfixes3`** | X11 fixes extension |
| **`libxss1`** | X11 screen saver extension |
| **`libxtst6`** | X11 testing extension (input simulation) |
| **`libxi6`** | X11 input extension |