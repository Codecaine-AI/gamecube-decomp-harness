---
url: "https://www.daytona.io/docs/en/java-sdk/"
title: "Java SDK Reference | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/#_top)

# Java SDK Reference

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk.md)Open

The Daytona Java SDK provides a robust interface for programmatically interacting with Daytona Sandboxes. It targets Java 11+ and uses OkHttp and Jackson.

## [\#](https://www.daytona.io/docs/en/java-sdk/\#installation) Installation

[Section titled “Installation”](https://www.daytona.io/docs/en/java-sdk/#installation)

### [\#](https://www.daytona.io/docs/en/java-sdk/\#gradle) Gradle

[Section titled “Gradle”](https://www.daytona.io/docs/en/java-sdk/#gradle)

Add the Daytona SDK dependency to your `build.gradle.kts`:

```
dependencies {

    implementation("io.daytona:sdk:x.y.z")

}
```

### [\#](https://www.daytona.io/docs/en/java-sdk/\#maven) Maven

[Section titled “Maven”](https://www.daytona.io/docs/en/java-sdk/#maven)

Add the Daytona SDK dependency to your `pom.xml`:

```
<dependency>

  <groupId>io.daytona</groupId>

  <artifactId>sdk</artifactId>

  <version>x.y.z</version>

</dependency>
```

## [\#](https://www.daytona.io/docs/en/java-sdk/\#getting-started) Getting Started

[Section titled “Getting Started”](https://www.daytona.io/docs/en/java-sdk/#getting-started)

### [\#](https://www.daytona.io/docs/en/java-sdk/\#create-a-sandbox) Create a Sandbox

[Section titled “Create a Sandbox”](https://www.daytona.io/docs/en/java-sdk/#create-a-sandbox)

Create a Daytona Sandbox to run your code securely in an isolated environment. The following snippet is an example “Hello World” program that runs securely inside a Daytona Sandbox.

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.model.ExecuteResponse;

public class Main {

    public static void main(String[] args) {

        // Initialize the SDK (uses environment variables by default)

        try (Daytona daytona = new Daytona()) {

            // Create a new sandbox

            Sandbox sandbox = daytona.create();

            // Execute a command

            ExecuteResponse response = sandbox.getProcess().executeCommand("echo 'Hello, World!'");

            System.out.println(response.getResult());

            // Clean up

            sandbox.delete();

        }

    }

}
```

## [\#](https://www.daytona.io/docs/en/java-sdk/\#configuration) Configuration

[Section titled “Configuration”](https://www.daytona.io/docs/en/java-sdk/#configuration)

The Daytona SDK can be configured using environment variables or by passing a configuration object:

```
// Using environment variables (DAYTONA_API_KEY, DAYTONA_API_URL, DAYTONA_TARGET)

Daytona daytona = new Daytona();
```

```
// Using explicit configuration

DaytonaConfig config = new DaytonaConfig.Builder()

    .apiKey("YOUR_API_KEY")

    .apiUrl("YOUR_API_URL")

    .target("us")

    .build();

Daytona daytona = new Daytona(config);
```

For more information on configuring the Daytona SDK, see [API keys](https://www.daytona.io/docs/en/api-keys#authentication).

## [\#](https://www.daytona.io/docs/en/java-sdk/\#real-time-state-updates) Real-time state updates

[Section titled “Real-time state updates”](https://www.daytona.io/docs/en/java-sdk/#real-time-state-updates)

Starting with SDK version **0.198.0**, the SDK streams sandbox state changes over a WebSocket (Socket.IO) connection by default. Sandbox lifecycle operations that wait on a state change (start, stop, pause, resize, snapshot, delete with `wait`) complete as soon as the server pushes the new state, instead of waiting for the next polling interval.

Each `Daytona` client opens a single WebSocket connection shared by all of its sandboxes. A sparse polling safety net runs alongside the event stream, so a missed event never hangs a waiting operation.

The WebSocket handshake carries `source` and `sdkVersion` query parameters, equivalent to the `X-Daytona-Source` and `X-Daytona-SDK-Version` REST headers. The SDK collects no client-side telemetry.

### [\#](https://www.daytona.io/docs/en/java-sdk/\#polling-fallback) Polling fallback

[Section titled “Polling fallback”](https://www.daytona.io/docs/en/java-sdk/#polling-fallback)

If the WebSocket connection cannot be established, for example when a proxy, firewall, or network policy blocks it, the SDK falls back to polling automatically. Connection setup runs in the background and never throws, so no error handling is required.

The WebSocket endpoint derives from the configured API URL, including custom base paths, so reverse proxy deployments such as `https://host/prefix/api` work without additional configuration.

### [\#](https://www.daytona.io/docs/en/java-sdk/\#opt-out-of-event-streaming) Opt out of event streaming

[Section titled “Opt out of event streaming”](https://www.daytona.io/docs/en/java-sdk/#opt-out-of-event-streaming)

In polling-only mode the SDK never opens a WebSocket connection. Sandbox state is observed exclusively by polling the REST API, with the same cadence as SDK versions before event streaming.

To opt out, set the `DAYTONA_USE_DEPRECATED_POLLING` environment variable:

```
export DAYTONA_USE_DEPRECATED_POLLING=true
```

Or set `useDeprecatedPolling` on the configuration builder. The explicit configuration option always takes precedence over the environment variable; the environment variable applies only when the option is unset.

```
DaytonaConfig config = new DaytonaConfig.Builder()

    .useDeprecatedPolling(true)

    .build();

Daytona daytona = new Daytona(config);
```

See the [`DaytonaConfig` reference](https://www.daytona.io/docs/en/java-sdk/config) for details.