---
url: "https://www.daytona.io/docs/en/ruby-sdk/config/"
title: "Config | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/config/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/config.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#config) Config

[Section titled “Config”](https://www.daytona.io/docs/en/ruby-sdk/config/#config)

Main class for a new Daytona::Config object.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/config/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#new-config) new Config()

[Section titled “new Config()”](https://www.daytona.io/docs/en/ruby-sdk/config/#new-config)

```
def initialize(api_key: nil, jwt_token: nil, api_url: nil, organization_id: nil, target: nil, otel_enabled: nil, use_deprecated_polling: nil, _experimental: nil)
```

Initializes a new Daytona::Config object.

**Parameters**:

- `api_key` _String, nil_ \- Daytona API key. Defaults to ENV\[‘DAYTONA\_API\_KEY’\].
- `jwt_token` _String, nil_ \- Daytona JWT token. Defaults to ENV\[‘DAYTONA\_JWT\_TOKEN’\].
- `api_url` _String, nil_ \- Daytona API URL. Defaults to ENV\[‘DAYTONA\_API\_URL’\] or Daytona::Config::API\_URL.
- `organization_id` _String, nil_ \- Daytona organization ID. Defaults to ENV\[‘DAYTONA\_ORGANIZATION\_ID’\].
- `target` _String, nil_ \- Daytona target. Defaults to ENV\[‘DAYTONA\_TARGET’\].
- `otel_enabled` _Boolean, nil_ \- Enable OpenTelemetry tracing for SDK operations.
- `use_deprecated_polling` _Boolean, nil_ \- Observe sandbox state by legacy polling instead of
WebSocket event streaming. Defaults to false (event streaming). Can also be enabled via the
DAYTONA\_USE\_DEPRECATED\_POLLING environment variable.
- `_experimental` _Hash, nil_ \- Experimental configuration options.

**Returns**:

- `Config` \- a new instance of Config

### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/config/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#api_key) api\_key()

[Section titled “api\_key()”](https://www.daytona.io/docs/en/ruby-sdk/config/#api_key)

```
def api_key()
```

API key for authentication with the Daytona API

**Returns**:

- `String, nil` \- Daytona API key

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#api_key-1) api\_key=()

[Section titled “api\_key=()”](https://www.daytona.io/docs/en/ruby-sdk/config/#api_key-1)

```
def api_key=(value)
```

API key for authentication with the Daytona API

**Returns**:

- `String, nil` \- Daytona API key

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#jwt_token) jwt\_token()

[Section titled “jwt\_token()”](https://www.daytona.io/docs/en/ruby-sdk/config/#jwt_token)

```
def jwt_token()
```

JWT token for authentication with the Daytona API

**Returns**:

- `String, nil` \- Daytona JWT token

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#jwt_token-1) jwt\_token=()

[Section titled “jwt\_token=()”](https://www.daytona.io/docs/en/ruby-sdk/config/#jwt_token-1)

```
def jwt_token=(value)
```

JWT token for authentication with the Daytona API

**Returns**:

- `String, nil` \- Daytona JWT token

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#api_url) api\_url()

[Section titled “api\_url()”](https://www.daytona.io/docs/en/ruby-sdk/config/#api_url)

```
def api_url()
```

URL of the Daytona API

**Returns**:

- `String, nil` \- Daytona API URL

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#api_url-1) api\_url=()

[Section titled “api\_url=()”](https://www.daytona.io/docs/en/ruby-sdk/config/#api_url-1)

```
def api_url=(value)
```

URL of the Daytona API

**Returns**:

- `String, nil` \- Daytona API URL

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#organization_id) organization\_id()

[Section titled “organization\_id()”](https://www.daytona.io/docs/en/ruby-sdk/config/#organization_id)

```
def organization_id()
```

Organization ID for authentication with the Daytona API

**Returns**:

- `String, nil` \- Daytona API URL

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#organization_id-1) organization\_id=()

[Section titled “organization\_id=()”](https://www.daytona.io/docs/en/ruby-sdk/config/#organization_id-1)

```
def organization_id=(value)
```

Organization ID for authentication with the Daytona API

**Returns**:

- `String, nil` \- Daytona API URL

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#target) target()

[Section titled “target()”](https://www.daytona.io/docs/en/ruby-sdk/config/#target)

```
def target()
```

Target environment for sandboxes

**Returns**:

- `String, nil` \- Daytona target

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#target-1) target=()

[Section titled “target=()”](https://www.daytona.io/docs/en/ruby-sdk/config/#target-1)

```
def target=(value)
```

Target environment for sandboxes

**Returns**:

- `String, nil` \- Daytona target

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#otel_enabled) otel\_enabled()

[Section titled “otel\_enabled()”](https://www.daytona.io/docs/en/ruby-sdk/config/#otel_enabled)

```
def otel_enabled()
```

Enable OpenTelemetry tracing for SDK operations.

**Returns**:

- `Boolean, nil`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#otel_enabled-1) otel\_enabled=()

[Section titled “otel\_enabled=()”](https://www.daytona.io/docs/en/ruby-sdk/config/#otel_enabled-1)

```
def otel_enabled=(value)
```

Enable OpenTelemetry tracing for SDK operations.

**Returns**:

- `Boolean, nil`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#use_deprecated_polling) use\_deprecated\_polling()

[Section titled “use\_deprecated\_polling()”](https://www.daytona.io/docs/en/ruby-sdk/config/#use_deprecated_polling)

```
def use_deprecated_polling()
```

Observe sandbox state by legacy polling instead of WebSocket event streaming.
Defaults to false (event streaming). Can also be enabled via the
DAYTONA\_USE\_DEPRECATED\_POLLING environment variable.

**Returns**:

- `Boolean`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#use_deprecated_polling-1) use\_deprecated\_polling=()

[Section titled “use\_deprecated\_polling=()”](https://www.daytona.io/docs/en/ruby-sdk/config/#use_deprecated_polling-1)

```
def use_deprecated_polling=(value)
```

Observe sandbox state by legacy polling instead of WebSocket event streaming.
Defaults to false (event streaming). Can also be enabled via the
DAYTONA\_USE\_DEPRECATED\_POLLING environment variable.

**Returns**:

- `Boolean`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#_experimental)\_experimental()

[Section titled “\_experimental()”](https://www.daytona.io/docs/en/ruby-sdk/config/#_experimental)

```
def _experimental()
```

Experimental configuration options

**Returns**:

- `Hash, nil` \- Experimental configuration hash

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#_experimental-1)\_experimental=()

[Section titled “\_experimental=()”](https://www.daytona.io/docs/en/ruby-sdk/config/#_experimental-1)

```
def _experimental=(value)
```

Experimental configuration options

**Returns**:

- `Hash, nil` \- Experimental configuration hash

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/config/\#read_env) read\_env()

[Section titled “read\_env()”](https://www.daytona.io/docs/en/ruby-sdk/config/#read_env)

```
def read_env(name)
```

Reads a DAYTONA\_-prefixed environment variable using the same precedence
as the Config initializer: runtime ENV first, then .env.local, then .env.
Only names starting with DAYTONA\_ are accepted.

**Parameters**:

- `name` _String_ \- The environment variable name. Must start with DAYTONA\_.

**Returns**:

- `String, nil` \- The value of the environment variable, or nil if not set.

**Raises**:

- `ArgumentError` \- If name does not start with DAYTONA\_.