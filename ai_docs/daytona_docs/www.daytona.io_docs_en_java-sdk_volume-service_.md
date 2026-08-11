---
url: "https://www.daytona.io/docs/en/java-sdk/volume-service/"
title: "VolumeService | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/volume-service/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/volume-service.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/volume-service/\#volumeservice) VolumeService

[Section titled “VolumeService”](https://www.daytona.io/docs/en/java-sdk/volume-service/#volumeservice)

Service for managing Daytona Volumes.

Volumes provide persistent shared storage that can be mounted into Sandboxes.

### [\#](https://www.daytona.io/docs/en/java-sdk/volume-service/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/volume-service/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/volume-service/\#create) create()

[Section titled “create()”](https://www.daytona.io/docs/en/java-sdk/volume-service/#create)

```
public Volume create(String name)
```

Creates a new volume.

**Parameters**:

- `name` _String_ \- volume name

**Returns**:

- `Volume` \- created `Volume`

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if creation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/volume-service/\#list) list()

[Section titled “list()”](https://www.daytona.io/docs/en/java-sdk/volume-service/#list)

```
public List<Volume> list()
```

Lists all accessible volumes.

**Returns**:

- `List\<Volume\>` \- list of available volumes

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the API request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/volume-service/\#getbyname) getByName()

[Section titled “getByName()”](https://www.daytona.io/docs/en/java-sdk/volume-service/#getbyname)

```
public Volume getByName(String name)
```

Retrieves a volume by name.

**Parameters**:

- `name` _String_ \- volume name

**Returns**:

- `Volume` \- matching `Volume`

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if no volume is found or request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/volume-service/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/java-sdk/volume-service/#delete)

```
public void delete(String id)
```

Deletes a volume by ID.

**Parameters**:

- `id` _String_ \- volume identifier

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if deletion fails