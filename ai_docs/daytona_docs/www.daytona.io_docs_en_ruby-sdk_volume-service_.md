---
url: "https://www.daytona.io/docs/en/ruby-sdk/volume-service/"
title: "VolumeService | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/volume-service/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/volume-service.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/volume-service/\#volumeservice) VolumeService

[Section titled “VolumeService”](https://www.daytona.io/docs/en/ruby-sdk/volume-service/#volumeservice)

Service for managing Daytona Volumes. Can be used to list, get, create and delete Volumes.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume-service/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/volume-service/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume-service/\#new-volumeservice) new VolumeService()

[Section titled “new VolumeService()”](https://www.daytona.io/docs/en/ruby-sdk/volume-service/#new-volumeservice)

```
def initialize(volumes_api, otel_state: nil)
```

Service for managing Daytona Volumes. Can be used to list, get, create and delete Volumes.

**Parameters**:

- `volumes_api` _DaytonaApiClient:VolumesApi_ -
- `otel_state` _Daytona:OtelState, nil_ -

**Returns**:

- `VolumeService` \- a new instance of VolumeService

### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume-service/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/volume-service/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume-service/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/ruby-sdk/volume-service/#create)

```
def create(name)
```

Create new Volume.

**Parameters**:

- `name` _String_ -

**Returns**:

- `Daytona:Volume`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume-service/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/ruby-sdk/volume-service/#delete)

```
def delete(volume)
```

Delete a Volume.

**Parameters**:

- `volume` _Daytona:Volume_ -

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume-service/\#get) get()

[Section titled “get()”](https://www.daytona.io/docs/en/ruby-sdk/volume-service/#get)

```
def get(name, create: false)
```

Get a Volume by name.

**Parameters**:

- `name` _String_ -
- `create` _Boolean_ -

**Returns**:

- `Daytona:Volume`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/volume-service/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/ruby-sdk/volume-service/#list)

```
def list()
```

List all Volumes.

**Returns**:

- `Array\<Daytona:Volume\>`