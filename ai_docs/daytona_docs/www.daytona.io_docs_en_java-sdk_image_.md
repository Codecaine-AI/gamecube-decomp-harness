---
url: "https://www.daytona.io/docs/en/java-sdk/image/"
title: "Image | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/image/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/image.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/image/\#image) Image

[Section titled “Image”](https://www.daytona.io/docs/en/java-sdk/image/#image)

Declarative image builder used to define Sandbox runtime environments.

Use factory methods such as `#base(String)` or `#debianSlim(String)` and chain
mutating methods to append Dockerfile instructions.

### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/image/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#base) base()

[Section titled “base()”](https://www.daytona.io/docs/en/java-sdk/image/#base)

```
public static Image base(String baseImage)
```

Creates an image definition from an existing base image.

**Parameters**:

- `baseImage` _String_ \- base image reference (for example `python:3.12-slim-bookworm`)

**Returns**:

- `Image` \- new `Image` initialized with a `FROM` instruction

#### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#debianslim) debianSlim()

[Section titled “debianSlim()”](https://www.daytona.io/docs/en/java-sdk/image/#debianslim)

```
public static Image debianSlim(String pythonVersion)
```

Creates a Python Debian slim image.

**Parameters**:

- `pythonVersion` _String_ \- Python version to use; defaults to `3.11` when `null` or empty

**Returns**:

- `Image` \- new `Image` using a Python slim base image

#### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#pipinstall) pipInstall()

[Section titled “pipInstall()”](https://www.daytona.io/docs/en/java-sdk/image/#pipinstall)

```
public Image pipInstall(String... packages)
```

Adds a `pip install` instruction for one or more packages.

**Parameters**:

- `packages` _String…_ \- package names to install

**Returns**:

- `Image` \- this `Image` for method chaining

#### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#runcommands) runCommands()

[Section titled “runCommands()”](https://www.daytona.io/docs/en/java-sdk/image/#runcommands)

```
public Image runCommands(String... commands)
```

Adds one or more `RUN` instructions.

**Parameters**:

- `commands` _String…_ \- shell commands to execute during image build

**Returns**:

- `Image` \- this `Image` for method chaining

#### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#env) env()

[Section titled “env()”](https://www.daytona.io/docs/en/java-sdk/image/#env)

```
public Image env(Map<String, String> envVars)
```

Adds environment variables using `ENV` instructions.

**Parameters**:

- `envVars` _Map<String, String>_ \- environment variables to set in the image

**Returns**:

- `Image` \- this `Image` for method chaining

#### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#workdir) workdir()

[Section titled “workdir()”](https://www.daytona.io/docs/en/java-sdk/image/#workdir)

```
public Image workdir(String path)
```

Sets the default working directory using a `WORKDIR` instruction.

**Parameters**:

- `path` _String_ \- working directory path

**Returns**:

- `Image` \- this `Image` for method chaining

#### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#entrypoint) entrypoint()

[Section titled “entrypoint()”](https://www.daytona.io/docs/en/java-sdk/image/#entrypoint)

```
public Image entrypoint(String... commands)
```

Sets the container entrypoint.

**Parameters**:

- `commands` _String…_ \- entrypoint command and arguments

**Returns**:

- `Image` \- this `Image` for method chaining

#### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#cmd) cmd()

[Section titled “cmd()”](https://www.daytona.io/docs/en/java-sdk/image/#cmd)

```
public Image cmd(String... commands)
```

Sets the default container command.

**Parameters**:

- `commands` _String…_ \- default command and arguments

**Returns**:

- `Image` \- this `Image` for method chaining

#### [\#](https://www.daytona.io/docs/en/java-sdk/image/\#getdockerfile) getDockerfile()

[Section titled “getDockerfile()”](https://www.daytona.io/docs/en/java-sdk/image/#getdockerfile)

```
public String getDockerfile()
```

Returns generated Dockerfile content.

**Returns**:

- `String` \- Dockerfile text assembled by this builder