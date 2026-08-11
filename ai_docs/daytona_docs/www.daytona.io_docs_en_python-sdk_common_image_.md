---
url: "https://www.daytona.io/docs/en/python-sdk/common/image/"
title: "Image | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/common/image/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk/common/image.md)Open

## [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#image) Image

[Section titled “Image”](https://www.daytona.io/docs/en/python-sdk/common/image/#image)

```
class Image(BaseModel)
```

Represents an image definition for a Daytona sandbox.
Do not construct this class directly. Instead use one of its static factory methods,
such as `Image.base()`, `Image.debian_slim()`, or `Image.from_dockerfile()`.

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagedockerfile) Image.dockerfile

[Section titled “Image.dockerfile”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagedockerfile)

```
def dockerfile() -> str
```

Returns a generated Dockerfile for the image.

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagepip_install) Image.pip\_install

[Section titled “Image.pip\_install”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagepip_install)

```
def pip_install(*packages: str | list[str],

                find_links: list[str] | None = None,

                index_url: str | None = None,

                extra_index_urls: list[str] | None = None,

                pre: bool = False,

                extra_options: str = "") -> "Image"
```

Adds commands to install packages using pip.

**Arguments**:

- `*packages` \- The packages to install.
- `find_links` \- list\[str\] \| None: The find-links to use.
- `index_url` \- str \| None: The index URL to use.
- `extra_index_urls` \- list\[str\] \| None: The extra index URLs to use.
- `pre` \- bool = False: Whether to install pre-release packages.
- `extra_options` \- str = "": Additional options to pass to pip. Given string is passed
directly to the pip install command.

**Returns**:

- `Image` \- The image with the pip install commands added.

**Example**:

```
image = Image.debian_slim("3.12").pip_install("requests", "pandas")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagepip_install_from_requirements) Image.pip\_install\_from\_requirements

[Section titled “Image.pip\_install\_from\_requirements”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagepip_install_from_requirements)

```
def pip_install_from_requirements(requirements_txt: str,

                                  find_links: list[str] | None = None,

                                  index_url: str | None = None,

                                  extra_index_urls: list[str] | None = None,

                                  pre: bool = False,

                                  extra_options: str = "") -> "Image"
```

Installs dependencies from a requirements.txt file.

**Arguments**:

- `requirements_txt` \- str: The path to the requirements.txt file.
- `find_links` \- list\[str\] \| None: The find-links to use.
- `index_url` \- str \| None: The index URL to use.
- `extra_index_urls` \- list\[str\] \| None: The extra index URLs to use.
- `pre` \- bool = False: Whether to install pre-release packages.
- `extra_options` \- str = "": Additional options to pass to pip.

**Returns**:

- `Image` \- The image with the pip install commands added.

**Example**:

```
image = Image.debian_slim("3.12").pip_install_from_requirements("requirements.txt")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagepip_install_from_pyproject) Image.pip\_install\_from\_pyproject

[Section titled “Image.pip\_install\_from\_pyproject”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagepip_install_from_pyproject)

```
def pip_install_from_pyproject(pyproject_toml: str,

                               optional_dependencies: list[str],

                               find_links: str | None = None,

                               index_url: str | None = None,

                               extra_index_url: str | None = None,

                               pre: bool = False,

                               extra_options: str = "") -> "Image"
```

Installs dependencies from a pyproject.toml file.

**Arguments**:

- `pyproject_toml` \- str: The path to the pyproject.toml file.
- `optional_dependencies` \- list\[str\] = \[\]: The optional dependencies to install from the pyproject.toml file.
- `find_links` \- str \| None = None: The find-links to use.
- `index_url` \- str \| None = None: The index URL to use.
- `extra_index_url` \- str \| None = None: The extra index URL to use.
- `pre` \- bool = False: Whether to install pre-release packages.
- `extra_options` \- str = "": Additional options to pass to pip. Given string is passed
directly to the pip install command.

**Returns**:

- `Image` \- The image with the pip install commands added.

**Example**:

```
image = Image.debian_slim("3.12")                 .pip_install_from_pyproject("pyproject.toml", optional_dependencies=["dev"])
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imageadd_local_file) Image.add\_local\_file

[Section titled “Image.add\_local\_file”](https://www.daytona.io/docs/en/python-sdk/common/image/#imageadd_local_file)

```
def add_local_file(local_path: str | Path, remote_path: str) -> "Image"
```

Adds a local file to the image.

**Arguments**:

- `local_path` \- str \| Path: The path to the local file.
- `remote_path` \- str: The path to the file in the image.

**Returns**:

- `Image` \- The image with the local file added.

**Example**:

```
image = Image.debian_slim("3.12").add_local_file("package.json", "/home/daytona/package.json")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imageadd_local_dir) Image.add\_local\_dir

[Section titled “Image.add\_local\_dir”](https://www.daytona.io/docs/en/python-sdk/common/image/#imageadd_local_dir)

```
def add_local_dir(local_path: str | Path, remote_path: str) -> "Image"
```

Adds a local directory to the image.

**Arguments**:

- `local_path` \- str \| Path: The path to the local directory.
- `remote_path` \- str: The path to the directory in the image.

**Returns**:

- `Image` \- The image with the local directory added.

**Example**:

```
image = Image.debian_slim("3.12").add_local_dir("src", "/home/daytona/src")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagerun_commands) Image.run\_commands

[Section titled “Image.run\_commands”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagerun_commands)

```
def run_commands(*commands: str | list[str]) -> "Image"
```

Runs commands in the image.

**Arguments**:

- `*commands` \- The commands to run.

**Returns**:

- `Image` \- The image with the commands added.

**Example**:

```
image = Image.debian_slim("3.12").run_commands(

    'echo "Hello, world!"',

    ['bash', '-c', 'echo Hello, world, again!']

)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imageenv) Image.env

[Section titled “Image.env”](https://www.daytona.io/docs/en/python-sdk/common/image/#imageenv)

```
def env(env_vars: dict[str, str]) -> "Image"
```

Sets environment variables in the image.

**Arguments**:

- `env_vars` \- dict\[str, str\]: The environment variables to set.

**Returns**:

- `Image` \- The image with the environment variables added.

**Example**:

```
image = Image.debian_slim("3.12").env({"PROJECT_ROOT": "/home/daytona"})
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imageworkdir) Image.workdir

[Section titled “Image.workdir”](https://www.daytona.io/docs/en/python-sdk/common/image/#imageworkdir)

```
def workdir(path: str | Path) -> "Image"
```

Sets the working directory in the image.

**Arguments**:

- `path` \- str \| Path: The path to the working directory.

**Returns**:

- `Image` \- The image with the working directory added.

**Example**:

```
image = Image.debian_slim("3.12").workdir("/home/daytona")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imageentrypoint) Image.entrypoint

[Section titled “Image.entrypoint”](https://www.daytona.io/docs/en/python-sdk/common/image/#imageentrypoint)

```
def entrypoint(entrypoint_commands: list[str]) -> "Image"
```

Sets the entrypoint for the image.

**Arguments**:

- `entrypoint_commands` \- list\[str\]: The commands to set as the entrypoint.

**Returns**:

- `Image` \- The image with the entrypoint added.

**Example**:

```
image = Image.debian_slim("3.12").entrypoint(["/bin/bash"])
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagecmd) Image.cmd

[Section titled “Image.cmd”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagecmd)

```
def cmd(cmd: list[str]) -> "Image"
```

Sets the default command for the image.

**Arguments**:

- `cmd` \- list\[str\]: The commands to set as the default command.

**Returns**:

- `Image` \- The image with the default command added.

**Example**:

```
image = Image.debian_slim("3.12").cmd(["/bin/bash"])
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagedockerfile_commands) Image.dockerfile\_commands

[Section titled “Image.dockerfile\_commands”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagedockerfile_commands)

```
def dockerfile_commands(dockerfile_commands: list[str],

                        context_dir: Path | str | None = None) -> "Image"
```

Adds arbitrary Dockerfile-like commands to the image.

**Arguments**:

- `*dockerfile_commands` \- The commands to add to the Dockerfile.
- `context_dir` \- Path \| str \| None: The path to the context directory.

**Returns**:

- `Image` \- The image with the Dockerfile commands added.

**Example**:

```
image = Image.debian_slim("3.12").dockerfile_commands(["RUN echo 'Hello, world!'"])
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagefrom_dockerfile) Image.from\_dockerfile

[Section titled “Image.from\_dockerfile”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagefrom_dockerfile)

```
@staticmethod

def from_dockerfile(path: str | Path) -> "Image"
```

Creates an Image from an existing Dockerfile.

**Arguments**:

- `path` \- str \| Path: The path to the Dockerfile.

**Returns**:

- `Image` \- The image with the Dockerfile added.

**Example**:

```
image = Image.from_dockerfile("Dockerfile")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagebase) Image.base

[Section titled “Image.base”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagebase)

```
@staticmethod

def base(image: str) -> "Image"
```

Creates an Image from an existing base image.

**Arguments**:

- `image` \- str: The base image to use.

**Returns**:

- `Image` \- The image with the base image added.

**Example**:

```
image = Image.base("python:3.12-slim-bookworm")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#imagedebian_slim) Image.debian\_slim

[Section titled “Image.debian\_slim”](https://www.daytona.io/docs/en/python-sdk/common/image/#imagedebian_slim)

```
@staticmethod

def debian_slim(

        python_version: SupportedPythonSeries | None = None) -> "Image"
```

Creates a Debian slim image based on the official Python Docker image.

**Arguments**:

- `python_version` \- SupportedPythonSeries \| None: The Python version to use.

**Returns**:

- `Image` \- The image with the Debian slim image added.

**Example**:

```
image = Image.debian_slim("3.12")
```

## [\#](https://www.daytona.io/docs/en/python-sdk/common/image/\#context) Context

[Section titled “Context”](https://www.daytona.io/docs/en/python-sdk/common/image/#context)

```
class Context(BaseModel)
```

Context for an image.

**Attributes**:

- `source_path` _str_ \- The path to the source file or directory.
- `archive_path` _str \| None_ \- The path inside the archive file in object storage.