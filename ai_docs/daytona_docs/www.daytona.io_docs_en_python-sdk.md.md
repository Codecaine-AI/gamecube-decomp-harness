---
url: "https://www.daytona.io/docs/en/python-sdk.md"
title: undefined
---

\# Python SDK Reference

The Daytona Python SDK provides a robust interface for programmatically interacting with Daytona Sandboxes.

\## Installation

Install the Daytona Python SDK using pip:

\`\`\`bash
pip install daytona
\`\`\`

Or using poetry:

\`\`\`bash
poetry add daytona
\`\`\`

\## Getting Started

\### Create a Sandbox

Create a Daytona Sandbox to run your code securely in an isolated environment. The following snippet is an example "Hello World" program that runs securely inside a Daytona Sandbox.

 \`\`\`python
 from daytona import Daytona

 def main():
 # Initialize the SDK (uses environment variables by default)
 daytona = Daytona()

 # Create a new sandbox
 sandbox = daytona.create()

 # Execute a command
 response = sandbox.process.exec("echo 'Hello, World!'")
 print(response.result)

 if \_\_name\_\_ == "\_\_main\_\_":
 main()
 \`\`\`

 \`\`\`python
 import asyncio
 from daytona import AsyncDaytona

 async def main():
 # Initialize the SDK (uses environment variables by default)
 async with AsyncDaytona() as daytona:
 # Create a new sandbox
 sandbox = await daytona.create()

 # Execute a command
 response = await sandbox.process.exec("echo 'Hello, World!'")
 print(response.result)

 if \_\_name\_\_ == "\_\_main\_\_":
 asyncio.run(main())
 \`\`\`

\## Configuration

The Daytona SDK can be configured using environment variables or by passing options to the constructor:

 \`\`\`python
 from daytona import Daytona, DaytonaConfig

 # Using environment variables (DAYTONA\_API\_KEY, DAYTONA\_API\_URL, DAYTONA\_TARGET)
 daytona = Daytona()

 # Using explicit configuration
 config = DaytonaConfig(
 api\_key="YOUR\_API\_KEY",
 api\_url="https://app.daytona.io/api",
 target="us"
 )
 daytona = Daytona(config)
 \`\`\`

 \`\`\`python
 import asyncio
 from daytona import AsyncDaytona, DaytonaConfig

 async def main():
 try:
 # Using environment variables (DAYTONA\_API\_KEY, DAYTONA\_API\_URL, DAYTONA\_TARGET)
 daytona = AsyncDaytona()
 # Your async code here
 pass
 finally:
 await daytona.close()

 # Using explicit configuration
 config = DaytonaConfig(
 api\_key="YOUR\_API\_KEY",
 api\_url="https://app.daytona.io/api",
 target="us"
 )
 async with AsyncDaytona(config) as daytona:
 # Your code here
 pass

 if \_\_name\_\_ == "\_\_main\_\_":
 asyncio.run(main())
 \`\`\`

For more information on configuring the Daytona SDK, see \[API keys\](https://www.daytona.io/docs/en/api-keys.md#authentication).

\## Real-time state updates

Starting with SDK version \*\*0.198.0\*\*, the SDK streams sandbox state changes over a WebSocket (Socket.IO) connection by default. Sandbox lifecycle operations that wait on a state change (start, stop, pause, resize, snapshot, delete with \`wait\`) complete as soon as the server pushes the new state, instead of waiting for the next polling interval.

Each \`Daytona\` or \`AsyncDaytona\` client opens a single WebSocket connection shared by all of its sandboxes. A sparse polling safety net runs alongside the event stream, so a missed event never hangs a waiting operation.

The WebSocket handshake carries \`source\` and \`sdkVersion\` query parameters, equivalent to the \`X-Daytona-Source\` and \`X-Daytona-SDK-Version\` REST headers. The SDK collects no client-side telemetry.

\### Polling fallback

If the WebSocket connection cannot be established, for example when a proxy, firewall, or network policy blocks it, the SDK falls back to polling automatically. Connection setup runs in the background and never raises an error, so no handling is required.

The WebSocket endpoint derives from the configured API URL, including custom base paths, so reverse proxy deployments such as \`https://host/prefix/api\` work without additional configuration.

\### Opt out of event streaming

:::caution\[Deprecated\]
Polling-only mode is deprecated and will be removed in a future release. Because the SDK falls back to polling automatically, opting out is only needed in environments that prohibit WebSocket connections by policy.
:::

In polling-only mode the SDK never opens a WebSocket connection. Sandbox state is observed exclusively by polling the REST API, with the same cadence as SDK versions before event streaming.

To opt out, set the \`DAYTONA\_USE\_DEPRECATED\_POLLING\` environment variable:

\`\`\`bash
export DAYTONA\_USE\_DEPRECATED\_POLLING=true
\`\`\`

Or pass \`use\_deprecated\_polling\` when initializing the client. The explicit configuration option always takes precedence over the environment variable; the environment variable applies only when the option is unset.

 \`\`\`python
 from daytona import Daytona, DaytonaConfig

 daytona = Daytona(DaytonaConfig(use\_deprecated\_polling=True))
 \`\`\`

 \`\`\`python
 from daytona import AsyncDaytona, DaytonaConfig

 daytona = AsyncDaytona(DaytonaConfig(use\_deprecated\_polling=True))
 \`\`\`

See the \[\`DaytonaConfig\` reference\](https://www.daytona.io/docs/en/python-sdk/sync/daytona.md#daytonaconfig) for details.

\## Async Python SDK

Daytona provides an additional \`DAYTONA\_HAPPY\_EYEBALLS\_DELAY\` environment variable for HTTP transport tuning in the async Python SDK. Use it to reduce intermittent async connection failures, such as \`aiohttp.ClientConnectorError\`, that can occur on dual-stack (IPv4/IPv6) networks.

\| Variable \| Description \| Required \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\- \|
\| \*\*\`DAYTONA\_HAPPY\_EYEBALLS\_DELAY\`\*\* \| Controls \*\*\`aiohttp\`\*\* Happy Eyeballs (IPv4/IPv6 connection race) delay in seconds. \| No \|

\- unset or empty: use \`aiohttp\` default behavior
\- \`none\` (case-insensitive): disable the IPv4/IPv6 race
\- non-negative float (for example \`0.25\`): set an explicit delay in seconds

\`\`\`bash
\# Disable Happy Eyeballs
export DAYTONA\_HAPPY\_EYEBALLS\_DELAY=none

\# Or set an explicit delay in seconds
export DAYTONA\_HAPPY\_EYEBALLS\_DELAY=0.25
\`\`\`