---
url: "https://www.daytona.io/docs/en/java-sdk/config/"
title: "DaytonaConfig | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/config/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/config.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/config/\#daytonaconfig) DaytonaConfig

[Section titled “DaytonaConfig”](https://www.daytona.io/docs/en/java-sdk/config/#daytonaconfig)

Configuration used to initialize a `Daytona` client.

Contains API authentication settings, API endpoint URL, and the default target region used
when creating new Sandboxes.

### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/config/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#getapikey) getApiKey()

[Section titled “getApiKey()”](https://www.daytona.io/docs/en/java-sdk/config/#getapikey)

```
public String getApiKey()
```

Returns the API key used to authenticate SDK requests.

**Returns**:

- `String` \- API key configured for the client

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#getapiurl) getApiUrl()

[Section titled “getApiUrl()”](https://www.daytona.io/docs/en/java-sdk/config/#getapiurl)

```
public String getApiUrl()
```

Returns the Daytona API base URL.

**Returns**:

- `String` \- API URL used for main API requests

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#gettarget) getTarget()

[Section titled “getTarget()”](https://www.daytona.io/docs/en/java-sdk/config/#gettarget)

```
public String getTarget()
```

Returns the default target location for newly created Sandboxes.

**Returns**:

- `String` \- target region identifier, or `null` if not configured

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#isotelenabled) isOtelEnabled()

[Section titled “isOtelEnabled()”](https://www.daytona.io/docs/en/java-sdk/config/#isotelenabled)

```
public boolean isOtelEnabled()
```

Returns whether OpenTelemetry tracing is enabled for SDK operations.

Note: SDK-side OpenTelemetry instrumentation is not yet implemented in the Java SDK.
This setter exists for API parity with the other SDKs and to allow code to opt in ahead
of instrumentation landing in a future release.

**Returns**:

- `boolean` \- `true` if OpenTelemetry tracing is enabled

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#isusedeprecatedpolling) isUseDeprecatedPolling()

[Section titled “isUseDeprecatedPolling()”](https://www.daytona.io/docs/en/java-sdk/config/#isusedeprecatedpolling)

```
public boolean isUseDeprecatedPolling()
```

Returns whether legacy polling mode is enabled instead of WebSocket event streaming.

**Deprecated**: Polling-only mode will be removed in a future release; event streaming is the default and falls back to polling automatically when WebSockets are unavailable.

**Returns**:

- `boolean` \- `true` if deprecated polling mode is active

## [\#](https://www.daytona.io/docs/en/java-sdk/config/\#daytonaconfigbuilder) DaytonaConfig.Builder

[Section titled “DaytonaConfig.Builder”](https://www.daytona.io/docs/en/java-sdk/config/#daytonaconfigbuilder)

Builder for creating immutable `DaytonaConfig` instances.

### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#methods-1) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/config/#methods-1)

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#apikey) apiKey()

[Section titled “apiKey()”](https://www.daytona.io/docs/en/java-sdk/config/#apikey)

```
public Builder apiKey(String apiKey)
```

Sets the API key used for authenticating SDK requests.

**Parameters**:

- `apiKey` _String_ \- Daytona API key

**Returns**:

- `Builder` \- this builder instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#apiurl) apiUrl()

[Section titled “apiUrl()”](https://www.daytona.io/docs/en/java-sdk/config/#apiurl)

```
public Builder apiUrl(String apiUrl)
```

Sets the Daytona API base URL.

**Parameters**:

- `apiUrl` _String_ \- API URL to use; defaults to `https://app.daytona.io/api` when omitted

**Returns**:

- `Builder` \- this builder instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#target) target()

[Section titled “target()”](https://www.daytona.io/docs/en/java-sdk/config/#target)

```
public Builder target(String target)
```

Sets the default target region for new Sandboxes.

**Parameters**:

- `target` _String_ \- target location identifier

**Returns**:

- `Builder` \- this builder instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#otelenabled) otelEnabled()

[Section titled “otelEnabled()”](https://www.daytona.io/docs/en/java-sdk/config/#otelenabled)

```
public Builder otelEnabled(boolean otelEnabled)
```

Enables OpenTelemetry tracing for SDK operations.

Note: SDK-side OpenTelemetry instrumentation is not yet implemented in the Java SDK.
This setter exists for API parity with the other SDKs and to allow code to opt in ahead
of instrumentation landing in a future release.

**Parameters**:

- `otelEnabled` _boolean_ \- whether to enable OpenTelemetry tracing

**Returns**:

- `Builder` \- this builder instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#usedeprecatedpolling) useDeprecatedPolling()

[Section titled “useDeprecatedPolling()”](https://www.daytona.io/docs/en/java-sdk/config/#usedeprecatedpolling)

```
public Builder useDeprecatedPolling(boolean useDeprecatedPolling)
```

Observe sandbox state by legacy polling instead of WebSocket event streaming.
Defaults to `false` (event streaming). Can also be enabled via the
`DAYTONA_USE_DEPRECATED_POLLING` environment variable.

**Deprecated**: Polling-only mode will be removed in a future release; event streaming is the default and falls back to polling automatically when WebSockets are unavailable.

**Parameters**:

- `useDeprecatedPolling` _boolean_ \- whether to use legacy polling

**Returns**:

- `Builder` \- this builder instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/config/\#build) build()

[Section titled “build()”](https://www.daytona.io/docs/en/java-sdk/config/#build)

```
public DaytonaConfig build()
```

Builds a new immutable `DaytonaConfig`.

**Returns**:

- `DaytonaConfig` \- configured `DaytonaConfig` instance