---
url: "https://www.daytona.io/docs/en/ruby-sdk/secret/"
title: "Secret | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/secret/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/secret.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#secret) Secret

[Section titled “Secret”](https://www.daytona.io/docs/en/ruby-sdk/secret/#secret)

Initialize secret from DTO

### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/secret/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#new-secret) new Secret()

[Section titled “new Secret()”](https://www.daytona.io/docs/en/ruby-sdk/secret/#new-secret)

```
def initialize(secret_dto)
```

Initialize secret from DTO

The plaintext value is write-only and is never returned by the API, so it is not exposed here.

**Parameters**:

- `secret_dto` _DaytonaApiClient:Secret_ -

**Returns**:

- `Secret` \- a new instance of Secret

### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/secret/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#id) id()

[Section titled “id()”](https://www.daytona.io/docs/en/ruby-sdk/secret/#id)

```
def id()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#name) name()

[Section titled “name()”](https://www.daytona.io/docs/en/ruby-sdk/secret/#name)

```
def name()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#description) description()

[Section titled “description()”](https://www.daytona.io/docs/en/ruby-sdk/secret/#description)

```
def description()
```

**Returns**:

- `String, nil`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#placeholder) placeholder()

[Section titled “placeholder()”](https://www.daytona.io/docs/en/ruby-sdk/secret/#placeholder)

```
def placeholder()
```

**Returns**:

- `String` \- Opaque placeholder token injected as the env var value in Sandboxes. The
placeholder is resolved to the real plaintext value only for the secret’s allowed hosts.

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#hosts) hosts()

[Section titled “hosts()”](https://www.daytona.io/docs/en/ruby-sdk/secret/#hosts)

```
def hosts()
```

**Returns**:

- `Array\<String\>` \- Allowed hosts this secret may be sent to. Accepts exact hostnames
and +\*.+ wildcards (no ports).

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#created_at) created\_at()

[Section titled “created\_at()”](https://www.daytona.io/docs/en/ruby-sdk/secret/#created_at)

```
def created_at()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/secret/\#updated_at) updated\_at()

[Section titled “updated\_at()”](https://www.daytona.io/docs/en/ruby-sdk/secret/#updated_at)

```
def updated_at()
```

**Returns**:

- `String`