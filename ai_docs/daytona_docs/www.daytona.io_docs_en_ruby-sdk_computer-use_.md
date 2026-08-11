---
url: "https://www.daytona.io/docs/en/ruby-sdk/computer-use/"
title: "ComputerUse | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/computer-use.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#computeruse) ComputerUse

[Section titled “ComputerUse”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#computeruse)

Initialize a new ComputerUse instance.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#new-computeruse) new ComputerUse()

[Section titled “new ComputerUse()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#new-computeruse)

```
def initialize(sandbox_id:, toolbox_api:, otel_state: nil)
```

Initialize a new ComputerUse instance.

**Parameters**:

- `sandbox_id` _String_ \- The ID of the sandbox
- `toolbox_api` _DaytonaApiClient:ToolboxApi_ \- API client for sandbox operations
- `otel_state` _Daytona:OtelState, nil_ -

**Returns**:

- `ComputerUse` \- a new instance of ComputerUse

### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#sandbox_id) sandbox\_id()

[Section titled “sandbox\_id()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#sandbox_id)

```
def sandbox_id()
```

**Returns**:

- `String` \- The ID of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#toolbox_api) toolbox\_api()

[Section titled “toolbox\_api()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#toolbox_api)

```
def toolbox_api()
```

**Returns**:

- `DaytonaApiClient:ToolboxApi` \- API client for sandbox operations

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#mouse) mouse()

[Section titled “mouse()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#mouse)

```
def mouse()
```

**Returns**:

- `Mouse` \- Mouse operations interface

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#keyboard) keyboard()

[Section titled “keyboard()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#keyboard)

```
def keyboard()
```

**Returns**:

- `Keyboard` \- Keyboard operations interface

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#screenshot) screenshot()

[Section titled “screenshot()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#screenshot)

```
def screenshot()
```

**Returns**:

- `Screenshot` \- Screenshot operations interface

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#display) display()

[Section titled “display()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#display)

```
def display()
```

**Returns**:

- `Display` \- Display operations interface

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#recording) recording()

[Section titled “recording()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#recording)

```
def recording()
```

**Returns**:

- `Recording` \- Screen recording operations interface

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#accessibility) accessibility()

[Section titled “accessibility()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#accessibility)

```
def accessibility()
```

**Returns**:

- `Accessibility` \- Accessibility operations interface

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#start) start()

[Section titled “start()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#start)

```
def start()
```

Starts all computer use processes (Xvfb, xfce4, x11vnc, novnc).

**Returns**:

- `DaytonaApiClient:ComputerUseStartResponse` \- Computer use start response

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
result = sandbox.computer_use.start

puts "Computer use processes started: #{result.message}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#stop) stop()

[Section titled “stop()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#stop)

```
def stop()
```

Stops all computer use processes.

**Returns**:

- `DaytonaApiClient:ComputerUseStopResponse` \- Computer use stop response

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
result = sandbox.computer_use.stop

puts "Computer use processes stopped: #{result.message}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#status) status()

[Section titled “status()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#status)

```
def status()
```

Gets the status of all computer use processes.

**Returns**:

- `DaytonaApiClient:ComputerUseStatusResponse` \- Status information about all VNC desktop processes

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
response = sandbox.computer_use.get_status

puts "Computer use status: #{response.status}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#get_process_status) get\_process\_status()

[Section titled “get\_process\_status()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#get_process_status)

```
def get_process_status(process_name:)
```

Gets the status of a specific VNC process.

**Parameters**:

- `process_name` _String_ \- Name of the process to check

**Returns**:

- `DaytonaApiClient:ProcessStatusResponse` \- Status information about the specific process

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
xvfb_status = sandbox.computer_use.get_process_status("xvfb")

no_vnc_status = sandbox.computer_use.get_process_status("novnc")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#restart_process) restart\_process()

[Section titled “restart\_process()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#restart_process)

```
def restart_process(process_name:)
```

Restarts a specific VNC process.

**Parameters**:

- `process_name` _String_ \- Name of the process to restart

**Returns**:

- `DaytonaApiClient:ProcessRestartResponse` \- Process restart response

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
result = sandbox.computer_use.restart_process("xfce4")

puts "XFCE4 process restarted: #{result.message}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#get_process_logs) get\_process\_logs()

[Section titled “get\_process\_logs()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#get_process_logs)

```
def get_process_logs(process_name:)
```

Gets logs for a specific VNC process.

**Parameters**:

- `process_name` _String_ \- Name of the process to get logs for

**Returns**:

- `DaytonaApiClient:ProcessLogsResponse` \- Process logs

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
logs = sandbox.computer_use.get_process_logs("novnc")

puts "NoVNC logs: #{logs}"
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#get_process_errors) get\_process\_errors()

[Section titled “get\_process\_errors()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#get_process_errors)

```
def get_process_errors(process_name:)
```

Gets error logs for a specific VNC process.

**Parameters**:

- `process_name` _String_ \- Name of the process to get error logs for

**Returns**:

- `DaytonaApiClient:ProcessErrorsResponse` \- Process error logs

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
errors = sandbox.computer_use.get_process_errors("x11vnc")

puts "X11VNC errors: #{errors}"
```

## [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#accessibility-1) Accessibility

[Section titled “Accessibility”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#accessibility-1)

Accessibility operations for computer use functionality.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#constructors-1) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#constructors-1)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#new-accessibility) new Accessibility()

[Section titled “new Accessibility()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#new-accessibility)

```
def initialize(sandbox_id:, toolbox_api:, otel_state: nil)
```

**Parameters**:

- `sandbox_id` _String_ \- The ID of the sandbox
- `toolbox_api` _DaytonaToolboxApiClient:ComputerUseApi_ \- API client for sandbox operations
- `otel_state` _Daytona:OtelState, nil_ -

**Returns**:

- `Accessibility` \- a new instance of Accessibility

### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#methods-1) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#methods-1)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#sandbox_id-1) sandbox\_id()

[Section titled “sandbox\_id()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#sandbox_id-1)

```
def sandbox_id()
```

**Returns**:

- `String` \- The ID of the sandbox

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#toolbox_api-1) toolbox\_api()

[Section titled “toolbox\_api()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#toolbox_api-1)

```
def toolbox_api()
```

**Returns**:

- `DaytonaToolboxApiClient:ComputerUseApi` \- API client for sandbox operations

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#get_tree) get\_tree()

[Section titled “get\_tree()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#get_tree)

```
def get_tree(scope: nil, pid: nil, max_depth: nil)
```

Fetches the AT-SPI accessibility tree.

**Parameters**:

- `scope` _String, nil_ \- Tree scope to inspect: “focused”, “pid”, or “all”
- `pid` _Integer, nil_ \- Process ID when scope is “pid”
- `max_depth` _Integer, nil_ \- Maximum depth to descend; 0 returns only the root

**Returns**:

- `DaytonaToolboxApiClient:AccessibilityTreeResponse` \- Accessibility tree response

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
tree = sandbox.computer_use.accessibility.get_tree(scope: "all", max_depth: 3)

puts tree.root.name
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#find_nodes) find\_nodes()

[Section titled “find\_nodes()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#find_nodes)

```
def find_nodes(scope: nil, pid: nil, role: nil, name: nil, name_match: nil, states: nil, limit: nil)
```

Finds AT-SPI accessibility nodes matching the provided filters.

**Parameters**:

- `scope` _String, nil_ \- Search scope: “focused”, “pid”, or “all”
- `pid` _Integer, nil_ \- Process ID when scope is “pid”
- `role` _String, nil_ \- Accessibility role to match, such as “button”
- `name` _String, nil_ \- Accessible name to match
- `name_match` _String, nil_ \- Name match mode, such as “exact” or “substring”
- `states` _Array<String>, nil_ \- Required accessibility states
- `limit` _Integer, nil_ \- Maximum number of matches

**Returns**:

- `DaytonaToolboxApiClient:AccessibilityNodesResponse` \- Matching accessibility nodes

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
buttons = sandbox.computer_use.accessibility.find_nodes(

  scope: "all",

  role: "button",

  name: "Submit",

  name_match: "substring"

)

puts buttons.matches.length
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#focus_node) focus\_node()

[Section titled “focus\_node()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#focus_node)

```
def focus_node(id:)
```

Focuses an AT-SPI accessibility node.

**Parameters**:

- `id` _String_ \- Accessibility node ID returned by get\_tree or find\_nodes

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
sandbox.computer_use.accessibility.focus_node(id: node.id)
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#invoke_node) invoke\_node()

[Section titled “invoke\_node()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#invoke_node)

```
def invoke_node(id:, action: nil)
```

Invokes an AT-SPI accessibility node action.

**Parameters**:

- `id` _String_ \- Accessibility node ID returned by get\_tree or find\_nodes
- `action` _String, nil_ \- Action name to invoke, or nil for the primary action

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
sandbox.computer_use.accessibility.invoke_node(id: node.id, action: "click")
```

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/computer-use/\#set_node_value) set\_node\_value()

[Section titled “set\_node\_value()”](https://www.daytona.io/docs/en/ruby-sdk/computer-use/#set_node_value)

```
def set_node_value(id:, value:)
```

Sets an AT-SPI accessibility node value.

**Parameters**:

- `id` _String_ \- Accessibility node ID returned by get\_tree or find\_nodes
- `value` _String_ \- Value to write to the node

**Raises**:

- `Daytona:Sdk:Error` \- If the operation fails

**Examples:**

```
sandbox.computer_use.accessibility.set_node_value(id: node.id, value: "hello")
```