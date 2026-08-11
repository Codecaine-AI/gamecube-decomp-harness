---
url: "https://www.daytona.io/docs/en/typescript-sdk/image/"
title: "Image | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/image/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/image.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#image) Image

[Section titled “Image”](https://www.daytona.io/docs/en/typescript-sdk/image/#image)

Represents an image definition for a Daytona sandbox.
Do not construct this class directly. Instead use one of its static factory methods,
such as `Image.base()`, `Image.debianSlim()` or `Image.fromDockerfile()`.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#accessors) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/image/#accessors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#contextlist) contextList

[Section titled “contextList”](https://www.daytona.io/docs/en/typescript-sdk/image/#contextlist)

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#get-signature) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/image/#get-signature)

```
get contextList(): Context[]
```

###### Returns

[Section titled “Returns”](https://www.daytona.io/docs/en/typescript-sdk/image/#returns)

`Context`\[\]

The list of context files to be added to the image.

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#dockerfile) dockerfile

[Section titled “dockerfile”](https://www.daytona.io/docs/en/typescript-sdk/image/#dockerfile)

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#get-signature-1) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/image/#get-signature-1)

```
get dockerfile(): string
```

**Returns**:

- `string` \- The Dockerfile content.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/image/#methods)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#base) base()

[Section titled “base()”](https://www.daytona.io/docs/en/typescript-sdk/image/#base)

```
static base(image: string): Image
```

Creates an Image from an existing base image.

**Parameters**:

- `image` _string_ \- The base image to use.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image.base('python:3.12-slim-bookworm')
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#debianslim) debianSlim()

[Section titled “debianSlim()”](https://www.daytona.io/docs/en/typescript-sdk/image/#debianslim)

```
static debianSlim(pythonVersion?: "3.9" | "3.10" | "3.11" | "3.12" | "3.13"): Image
```

Creates a Debian slim image based on the official Python Docker image.

**Parameters**:

- `pythonVersion?` _The Python version to use._ \- `"3.9"` \| `"3.10"` \| `"3.11"` \| `"3.12"` \| `"3.13"`

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image.debianSlim('3.12')
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#fromdockerfile) fromDockerfile()

[Section titled “fromDockerfile()”](https://www.daytona.io/docs/en/typescript-sdk/image/#fromdockerfile)

```
static fromDockerfile(path: string): Image
```

Creates an Image from an existing Dockerfile.

**Parameters**:

- `path` _string_ \- The path to the Dockerfile.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image.fromDockerfile('Dockerfile')
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#addlocaldir) addLocalDir()

[Section titled “addLocalDir()”](https://www.daytona.io/docs/en/typescript-sdk/image/#addlocaldir)

```
addLocalDir(localPath: string, remotePath: string): Image
```

Adds a local directory to the image.

**Parameters**:

- `localPath` _string_ \- The path to the local directory.
- `remotePath` _string_ \- The path of the directory in the image.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image

 .debianSlim('3.12')

 .addLocalDir('src', '/home/daytona/src')
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#addlocalfile) addLocalFile()

[Section titled “addLocalFile()”](https://www.daytona.io/docs/en/typescript-sdk/image/#addlocalfile)

```
addLocalFile(localPath: string, remotePath: string): Image
```

Adds a local file to the image.

**Parameters**:

- `localPath` _string_ \- The path to the local file.
- `remotePath` _string_ \- The path of the file in the image.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image

 .debianSlim('3.12')

 .addLocalFile('requirements.txt', '/home/daytona/requirements.txt')
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#cmd) cmd()

[Section titled “cmd()”](https://www.daytona.io/docs/en/typescript-sdk/image/#cmd)

```
cmd(cmd: string[]): Image
```

Sets the default command for the image.

**Parameters**:

- `cmd` _string\[\]_ \- The command to set as the default command.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image

 .debianSlim('3.12')

 .cmd(['/bin/bash'])
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#dockerfilecommands) dockerfileCommands()

[Section titled “dockerfileCommands()”](https://www.daytona.io/docs/en/typescript-sdk/image/#dockerfilecommands)

```
dockerfileCommands(dockerfileCommands: string[], contextDir?: string): Image
```

Extends an image with arbitrary Dockerfile-like commands.

**Parameters**:

- `dockerfileCommands` _string\[\]_ \- The commands to add to the Dockerfile.
- `contextDir?` _string_ \- The path to the context directory.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image

 .debianSlim('3.12')

 .dockerfileCommands(['RUN echo "Hello, world!"'])
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#entrypoint) entrypoint()

[Section titled “entrypoint()”](https://www.daytona.io/docs/en/typescript-sdk/image/#entrypoint)

```
entrypoint(entrypointCommands: string[]): Image
```

Sets the entrypoint for the image.

**Parameters**:

- `entrypointCommands` _string\[\]_ \- The commands to set as the entrypoint.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image

 .debianSlim('3.12')

 .entrypoint(['/bin/bash'])
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#env) env()

[Section titled “env()”](https://www.daytona.io/docs/en/typescript-sdk/image/#env)

```
env(envVars: Record<string, string>): Image
```

Sets environment variables in the image.

**Parameters**:

- `envVars` _Record<string, string>_ \- The environment variables to set.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image

 .debianSlim('3.12')

 .env({ FOO: 'bar' })
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#pipinstall) pipInstall()

[Section titled “pipInstall()”](https://www.daytona.io/docs/en/typescript-sdk/image/#pipinstall)

```
pipInstall(packages: string | string[], options?: PipInstallOptions): Image
```

Adds commands to install packages using pip.

**Parameters**:

- `packages` _The packages to install._ \- `string` \| `string`\[\]
- `options?` _PipInstallOptions_ \- The options for the pip install command.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image.debianSlim('3.12').pipInstall('numpy', { findLinks: ['https://pypi.org/simple'] })
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#pipinstallfrompyproject) pipInstallFromPyproject()

[Section titled “pipInstallFromPyproject()”](https://www.daytona.io/docs/en/typescript-sdk/image/#pipinstallfrompyproject)

```
pipInstallFromPyproject(pyprojectToml: string, options?: PyprojectOptions): Image
```

Installs dependencies from a pyproject.toml file.

**Parameters**:

- `pyprojectToml` _string_ \- The path to the pyproject.toml file.
- `options?` _PyprojectOptions_ \- The options for the pip install command.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image.debianSlim('3.12')

image.pipInstallFromPyproject('pyproject.toml', { optionalDependencies: ['dev'] })
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#pipinstallfromrequirements) pipInstallFromRequirements()

[Section titled “pipInstallFromRequirements()”](https://www.daytona.io/docs/en/typescript-sdk/image/#pipinstallfromrequirements)

```
pipInstallFromRequirements(requirementsTxt: string, options?: PipInstallOptions): Image
```

Installs dependencies from a requirements.txt file.

**Parameters**:

- `requirementsTxt` _string_ \- The path to the requirements.txt file.
- `options?` _PipInstallOptions_ \- The options for the pip install command.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image.debianSlim('3.12')

image.pipInstallFromRequirements('requirements.txt', { findLinks: ['https://pypi.org/simple'] })
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#runcommands) runCommands()

[Section titled “runCommands()”](https://www.daytona.io/docs/en/typescript-sdk/image/#runcommands)

```
runCommands(...commands: (string | string[])[]): Image
```

Runs commands in the image.

**Parameters**:

- `commands` _…(string \| string\[\])\[\]_ \- The commands to run.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image

 .debianSlim('3.12')

 .runCommands(

   'echo "Hello, world!"',

   ['bash', '-c', 'echo Hello, world, again!']

 )
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#workdir) workdir()

[Section titled “workdir()”](https://www.daytona.io/docs/en/typescript-sdk/image/#workdir)

```
workdir(dirPath: string): Image
```

Sets the working directory in the image.

**Parameters**:

- `dirPath` _string_ \- The path to the working directory.

**Returns**:

- `Image` \- The Image instance.

**Example:**

```
const image = Image

 .debianSlim('3.12')

 .workdir('/home/daytona')
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#context) Context

[Section titled “Context”](https://www.daytona.io/docs/en/typescript-sdk/image/#context)

Represents a context file to be added to the image.

**Properties**:

- `archivePath` _string_ \- The path inside the archive file in object storage.
- `sourcePath` _string_ \- The path to the source file or directory.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#pipinstalloptions) PipInstallOptions

[Section titled “PipInstallOptions”](https://www.daytona.io/docs/en/typescript-sdk/image/#pipinstalloptions)

Options for the pip install command.

**Properties**:

- `extraIndexUrls?` _string\[\]_ \- The extra index URLs to use for the pip install command.
- `extraOptions?` _string_ \- The extra options to use for the pip install command. Given string is passed directly to the pip install command.
- `findLinks?` _string\[\]_ \- The find-links to use for the pip install command.
- `indexUrl?` _string_ \- The index URL to use for the pip install command.
- `pre?` _boolean_ \- Whether to install pre-release versions.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#extended-by) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/image/#extended-by)

- `PyprojectOptions`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/image/\#pyprojectoptions) PyprojectOptions

[Section titled “PyprojectOptions”](https://www.daytona.io/docs/en/typescript-sdk/image/#pyprojectoptions)

Options for the pip install command from a pyproject.toml file.

**Properties**:

- `extraIndexUrls?` _string\[\]_\- The extra index URLs to use for the pip install command.

  - _Inherited from_: `PipInstallOptions.extraIndexUrls`
- `extraOptions?` _string_\- The extra options to use for the pip install command. Given string is passed directly to the pip install command.

  - _Inherited from_: `PipInstallOptions.extraOptions`
- `findLinks?` _string\[\]_\- The find-links to use for the pip install command.

  - _Inherited from_: `PipInstallOptions.findLinks`
- `indexUrl?` _string_\- The index URL to use for the pip install command.

  - _Inherited from_: `PipInstallOptions.indexUrl`
- `optionalDependencies?` _string\[\]_ \- The optional dependencies to install.
- `pre?` _boolean_\- Whether to install pre-release versions.

  - _Inherited from_: `PipInstallOptions.pre`

**Extends:**

- `PipInstallOptions`