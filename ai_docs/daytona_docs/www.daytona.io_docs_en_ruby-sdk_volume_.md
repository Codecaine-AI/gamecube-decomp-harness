---
url: "https://www.daytona.io/docs/en/ruby-sdk/volume/"
title: "Volume | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/volume/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/volume.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#volume) Volume

[Section titled “Volume”](https://www.daytona.io/docs/en/ruby-sdk/volume/#volume)

Initialize volume from DTO

### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/volume/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#new-volume) new Volume()

[Section titled “new Volume()”](https://www.daytona.io/docs/en/ruby-sdk/volume/#new-volume)

```
def initialize(volume_dto)
```

Initialize volume from DTO

**Parameters**:

- `volume_dto` _DaytonaApiClient:SandboxVolume_ -

**Returns**:

- `Volume` \- a new instance of Volume

### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/volume/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#id) id()

[Section titled “id()”](https://www.daytona.io/docs/en/ruby-sdk/volume/#id)

```
def id()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#name) name()

[Section titled “name()”](https://www.daytona.io/docs/en/ruby-sdk/volume/#name)

```
def name()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#organization_id) organization\_id()

[Section titled “organization\_id()”](https://www.daytona.io/docs/en/ruby-sdk/volume/#organization_id)

```
def organization_id()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#state) state()

[Section titled “state()”](https://www.daytona.io/docs/en/ruby-sdk/volume/#state)

```
def state()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#created_at) created\_at()

[Section titled “created\_at()”](https://www.daytona.io/docs/en/ruby-sdk/volume/#created_at)

```
def created_at()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#updated_at) updated\_at()

[Section titled “updated\_at()”](https://www.daytona.io/docs/en/ruby-sdk/volume/#updated_at)

```
def updated_at()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#last_used_at) last\_used\_at()

[Section titled “last\_used\_at()”](https://www.daytona.io/docs/en/ruby-sdk/volume/#last_used_at)

```
def last_used_at()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume/\#error_reason) error\_reason()

[Section titled “error\_reason()”](https://www.daytona.io/docs/en/ruby-sdk/volume/#error_reason)

```
def error_reason()
```

**Returns**:

- `String, nil`