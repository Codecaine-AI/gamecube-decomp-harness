---
url: "https://www.daytona.io/docs/en/ruby-sdk/"
title: "Ruby SDK Reference | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/#_top)

# Ruby SDK Reference

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk.md)Open

The Daytona Ruby SDK provides a robust interface for programmatically interacting with Daytona Sandboxes.

## [\#](https://www.daytona.io/docs/en/ruby-sdk/\#installation) Installation

[Section titled “Installation”](https://www.daytona.io/docs/en/ruby-sdk/#installation)

Install the Daytona Ruby SDK using Bundler by adding it to your Gemfile:

```
gem 'daytona'
```

Then run:

```
bundle install
```

Or install it directly:

```
gem install daytona
```

## [\#](https://www.daytona.io/docs/en/ruby-sdk/\#getting-started) Getting Started

[Section titled “Getting Started”](https://www.daytona.io/docs/en/ruby-sdk/#getting-started)

Here’s a simple example to help you get started with the Daytona Ruby SDK:

```
require 'daytona'

# Initialize the SDK (uses environment variables by default)

daytona = Daytona::Daytona.new

# Create a new sandbox

sandbox = daytona.create

# Execute a command

response = sandbox.process.exec(command: "echo 'Hello, World!'")

puts response.result

# Clean up

daytona.delete(sandbox)
```

## [\#](https://www.daytona.io/docs/en/ruby-sdk/\#configuration) Configuration

[Section titled “Configuration”](https://www.daytona.io/docs/en/ruby-sdk/#configuration)

The SDK can be configured using environment variables or by passing options to the constructor:

```
require 'daytona'

# Using environment variables (DAYTONA_API_KEY, DAYTONA_API_URL, DAYTONA_TARGET)

daytona = Daytona::Daytona.new

# Using explicit configuration

config = Daytona::Config.new(

  api_key: 'your-api-key',

  api_url: 'https://app.daytona.io/api',

  target: 'us'

)

daytona = Daytona::Daytona.new(config)
```

## [\#](https://www.daytona.io/docs/en/ruby-sdk/\#real-time-state-updates) Real-time state updates

[Section titled “Real-time state updates”](https://www.daytona.io/docs/en/ruby-sdk/#real-time-state-updates)

Starting with SDK version **0.198.0**, the SDK streams sandbox state changes over a WebSocket (Socket.IO) connection by default. Sandbox lifecycle operations that wait on a state change (start, stop, pause, resize, snapshot, delete with `wait`) complete as soon as the server pushes the new state, instead of waiting for the next polling interval.

Each `Daytona::Daytona` client opens a single WebSocket connection shared by all of its sandboxes. A sparse polling safety net runs alongside the event stream, so a missed event never hangs a waiting operation.

The WebSocket handshake carries `source` and `sdkVersion` query parameters, equivalent to the `X-Daytona-Source` and `X-Daytona-SDK-Version` REST headers. The SDK collects no client-side telemetry.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/\#polling-fallback) Polling fallback

[Section titled “Polling fallback”](https://www.daytona.io/docs/en/ruby-sdk/#polling-fallback)

If the WebSocket connection cannot be established, for example when a proxy, firewall, or network policy blocks it, the SDK falls back to polling automatically. Connection setup runs in the background and never raises an error, so no handling is required.

The WebSocket endpoint derives from the configured API URL, including custom base paths, so reverse proxy deployments such as `https://host/prefix/api` work without additional configuration.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/\#opt-out-of-event-streaming) Opt out of event streaming

[Section titled “Opt out of event streaming”](https://www.daytona.io/docs/en/ruby-sdk/#opt-out-of-event-streaming)

In polling-only mode the SDK never opens a WebSocket connection. Sandbox state is observed exclusively by polling the REST API, with the same cadence as SDK versions before event streaming.

To opt out, set the `DAYTONA_USE_DEPRECATED_POLLING` environment variable:

```
export DAYTONA_USE_DEPRECATED_POLLING=true
```

Or pass `use_deprecated_polling` when initializing the client. The explicit configuration option always takes precedence over the environment variable; the environment variable applies only when the option is unset.

```
require 'daytona'

config = Daytona::Config.new(use_deprecated_polling: true)

daytona = Daytona::Daytona.new(config)
```

See the [`Config` reference](https://www.daytona.io/docs/en/ruby-sdk/config) for details.

## [\#](https://www.daytona.io/docs/en/ruby-sdk/\#environment-variables) Environment Variables

[Section titled “Environment Variables”](https://www.daytona.io/docs/en/ruby-sdk/#environment-variables)

The SDK supports the following environment variables:

| Variable | Description |
| --- | --- |
| `DAYTONA_API_KEY` | API key for authentication |
| `DAYTONA_API_URL` | URL of the Daytona API (defaults to `https://app.daytona.io/api`) |
| `DAYTONA_TARGET` | Target location for Sandboxes |
| `DAYTONA_JWT_TOKEN` | JWT token for authentication (alternative to API key) |
| `DAYTONA_ORGANIZATION_ID` | Organization ID (required when using JWT token) |