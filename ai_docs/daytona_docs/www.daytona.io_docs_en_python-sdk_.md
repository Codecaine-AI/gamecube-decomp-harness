---
url: "https://www.daytona.io/docs/en/python-sdk/"
title: "Python SDK Reference | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/#_top)

# Python SDK Reference

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk.md)Open

The Daytona Python SDK provides a robust interface for programmatically interacting with Daytona Sandboxes.

## [\#](https://www.daytona.io/docs/en/python-sdk/\#installation) Installation

[Section titled “Installation”](https://www.daytona.io/docs/en/python-sdk/#installation)

Install the Daytona Python SDK using pip:

```
pip install daytona
```

Or using poetry:

```
poetry add daytona
```

## [\#](https://www.daytona.io/docs/en/python-sdk/\#getting-started) Getting Started

[Section titled “Getting Started”](https://www.daytona.io/docs/en/python-sdk/#getting-started)

### [\#](https://www.daytona.io/docs/en/python-sdk/\#create-a-sandbox) Create a Sandbox

[Section titled “Create a Sandbox”](https://www.daytona.io/docs/en/python-sdk/#create-a-sandbox)

Create a Daytona Sandbox to run your code securely in an isolated environment. The following snippet is an example “Hello World” program that runs securely inside a Daytona Sandbox.

- [Sync](https://www.daytona.io/docs/en/python-sdk/#tab-panel-1034)
- [Async](https://www.daytona.io/docs/en/python-sdk/#tab-panel-1035)

```
from daytona import Daytona

def main():

    # Initialize the SDK (uses environment variables by default)

    daytona = Daytona()

    # Create a new sandbox

    sandbox = daytona.create()

    # Execute a command

    response = sandbox.process.exec("echo 'Hello, World!'")

    print(response.result)

if __name__ == "__main__":

    main()
```

```
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

if __name__ == "__main__":

    asyncio.run(main())
```

## [\#](https://www.daytona.io/docs/en/python-sdk/\#configuration) Configuration

[Section titled “Configuration”](https://www.daytona.io/docs/en/python-sdk/#configuration)

The Daytona SDK can be configured using environment variables or by passing options to the constructor:

- [Sync](https://www.daytona.io/docs/en/python-sdk/#tab-panel-1036)
- [Async](https://www.daytona.io/docs/en/python-sdk/#tab-panel-1037)

```
from daytona import Daytona, DaytonaConfig

# Using environment variables (DAYTONA_API_KEY, DAYTONA_API_URL, DAYTONA_TARGET)

daytona = Daytona()

# Using explicit configuration

config = DaytonaConfig(

    api_key="YOUR_API_KEY",

    api_url="https://app.daytona.io/api",

    target="us"

)

daytona = Daytona(config)
```

```
import asyncio

from daytona import AsyncDaytona, DaytonaConfig

async def main():

    try:

        # Using environment variables (DAYTONA_API_KEY, DAYTONA_API_URL, DAYTONA_TARGET)

        daytona = AsyncDaytona()

        # Your async code here

        pass

    finally:

        await daytona.close()

    # Using explicit configuration

    config = DaytonaConfig(

        api_key="YOUR_API_KEY",

        api_url="https://app.daytona.io/api",

        target="us"

    )

    async with AsyncDaytona(config) as daytona:

        # Your code here

        pass

if __name__ == "__main__":

    asyncio.run(main())
```

For more information on configuring the Daytona SDK, see [API keys](https://www.daytona.io/docs/en/api-keys#authentication).

## [\#](https://www.daytona.io/docs/en/python-sdk/\#real-time-state-updates) Real-time state updates

[Section titled “Real-time state updates”](https://www.daytona.io/docs/en/python-sdk/#real-time-state-updates)

Starting with SDK version **0.198.0**, the SDK streams sandbox state changes over a WebSocket (Socket.IO) connection by default. Sandbox lifecycle operations that wait on a state change (start, stop, pause, resize, snapshot, delete with `wait`) complete as soon as the server pushes the new state, instead of waiting for the next polling interval.

Each `Daytona` or `AsyncDaytona` client opens a single WebSocket connection shared by all of its sandboxes. A sparse polling safety net runs alongside the event stream, so a missed event never hangs a waiting operation.

The WebSocket handshake carries `source` and `sdkVersion` query parameters, equivalent to the `X-Daytona-Source` and `X-Daytona-SDK-Version` REST headers. The SDK collects no client-side telemetry.

### [\#](https://www.daytona.io/docs/en/python-sdk/\#polling-fallback) Polling fallback

[Section titled “Polling fallback”](https://www.daytona.io/docs/en/python-sdk/#polling-fallback)

If the WebSocket connection cannot be established, for example when a proxy, firewall, or network policy blocks it, the SDK falls back to polling automatically. Connection setup runs in the background and never raises an error, so no handling is required.

The WebSocket endpoint derives from the configured API URL, including custom base paths, so reverse proxy deployments such as `https://host/prefix/api` work without additional configuration.

### [\#](https://www.daytona.io/docs/en/python-sdk/\#opt-out-of-event-streaming) Opt out of event streaming

[Section titled “Opt out of event streaming”](https://www.daytona.io/docs/en/python-sdk/#opt-out-of-event-streaming)

In polling-only mode the SDK never opens a WebSocket connection. Sandbox state is observed exclusively by polling the REST API, with the same cadence as SDK versions before event streaming.

To opt out, set the `DAYTONA_USE_DEPRECATED_POLLING` environment variable:

```
export DAYTONA_USE_DEPRECATED_POLLING=true
```

Or pass `use_deprecated_polling` when initializing the client. The explicit configuration option always takes precedence over the environment variable; the environment variable applies only when the option is unset.

- [Sync](https://www.daytona.io/docs/en/python-sdk/#tab-panel-1038)
- [Async](https://www.daytona.io/docs/en/python-sdk/#tab-panel-1039)

```
from daytona import Daytona, DaytonaConfig

daytona = Daytona(DaytonaConfig(use_deprecated_polling=True))
```

```
from daytona import AsyncDaytona, DaytonaConfig

daytona = AsyncDaytona(DaytonaConfig(use_deprecated_polling=True))
```

See the [`DaytonaConfig` reference](https://www.daytona.io/docs/en/python-sdk/sync/daytona#daytonaconfig) for details.

## [\#](https://www.daytona.io/docs/en/python-sdk/\#async-python-sdk) Async Python SDK

[Section titled “Async Python SDK”](https://www.daytona.io/docs/en/python-sdk/#async-python-sdk)

Daytona provides an additional `DAYTONA_HAPPY_EYEBALLS_DELAY` environment variable for HTTP transport tuning in the async Python SDK. Use it to reduce intermittent async connection failures, such as `aiohttp.ClientConnectorError`, that can occur on dual-stack (IPv4/IPv6) networks.

| Variable | Description | Required |
| --- | --- | --- |
| **`DAYTONA_HAPPY_EYEBALLS_DELAY`** | Controls **`aiohttp`** Happy Eyeballs (IPv4/IPv6 connection race) delay in seconds. | No |

- unset or empty: use `aiohttp` default behavior
- `none` (case-insensitive): disable the IPv4/IPv6 race
- non-negative float (for example `0.25`): set an explicit delay in seconds

```
# Disable Happy Eyeballs

export DAYTONA_HAPPY_EYEBALLS_DELAY=none

# Or set an explicit delay in seconds

export DAYTONA_HAPPY_EYEBALLS_DELAY=0.25
```