---
url: "https://www.daytona.io/docs/en/java-sdk/file-system/"
title: "FileSystem | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/file-system/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/file-system.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#filesystem) FileSystem

[Section titled “FileSystem”](https://www.daytona.io/docs/en/java-sdk/file-system/#filesystem)

File system operations facade for a specific Sandbox.

Provides methods for directory management, file upload/download, metadata inspection, and
search/replace operations.

### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/file-system/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#createfolder) createFolder()

[Section titled “createFolder()”](https://www.daytona.io/docs/en/java-sdk/file-system/#createfolder)

```
public void createFolder(String path, String mode)
```

Creates a directory in the Sandbox.

**Parameters**:

- `path` _String_ \- directory path
- `mode` _String_ \- POSIX mode (for example `755`); defaults to `755` when `null`

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if creation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#deletefile) deleteFile()

[Section titled “deleteFile()”](https://www.daytona.io/docs/en/java-sdk/file-system/#deletefile)

```
public void deleteFile(String path)
```

Deletes a file.

**Parameters**:

- `path` _String_ \- file path to delete

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if deletion fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#downloadfile) downloadFile()

[Section titled “downloadFile()”](https://www.daytona.io/docs/en/java-sdk/file-system/#downloadfile)

```
public byte[] downloadFile(String remotePath)
```

Downloads a file into memory.

**Parameters**:

- `remotePath` _String_ \- source file path in the Sandbox

**Returns**:

- `byte[]` \- file bytes; empty array when no file payload is returned

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if download or local read fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#downloadfilestream) downloadFileStream()

[Section titled “downloadFileStream()”](https://www.daytona.io/docs/en/java-sdk/file-system/#downloadfilestream)

```
public InputStream downloadFileStream(String remotePath) throws io.daytona.sdk.exception.DaytonaException
```

Downloads a single file from the Sandbox as a stream without buffering the entire file
into memory. The returned `InputStream` can be piped directly to an HTTP response,
written to a file, or processed on the fly.

The caller is responsible for closing the returned stream.

**Parameters**:

- `remotePath` _String_ \- source file path in the Sandbox

**Returns**:

- `InputStream` \- an `InputStream` streaming the file content

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the file does not exist or access is denied

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#downloadfilestream-1) downloadFileStream()

[Section titled “downloadFileStream()”](https://www.daytona.io/docs/en/java-sdk/file-system/#downloadfilestream-1)

```
public InputStream downloadFileStream(String remotePath, int timeoutSeconds) throws io.daytona.sdk.exception.DaytonaException
```

Downloads a single file from the Sandbox as a stream without buffering the entire file
into memory, with a custom timeout.

The caller is responsible for closing the returned stream.

**Parameters**:

- `remotePath` _String_ \- source file path in the Sandbox
- `timeoutSeconds` _int_ \- timeout in seconds; 0 means no timeout

**Returns**:

- `InputStream` \- an `InputStream` streaming the file content

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the file does not exist or access is denied

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#downloadfilestream-2) downloadFileStream()

[Section titled “downloadFileStream()”](https://www.daytona.io/docs/en/java-sdk/file-system/#downloadfilestream-2)

```
public InputStream downloadFileStream(String remotePath, DownloadStreamOptions options) throws io.daytona.sdk.exception.DaytonaException
```

Downloads a single file from the Sandbox as a stream with configurable options.

**Parameters**:

- `remotePath` _String_ \- source file path in the Sandbox
- `options` _DownloadStreamOptions_ \- download options including timeout and progress callback

**Returns**:

- `InputStream` \- an InputStream streaming the file content

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if download fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#uploadfile) uploadFile()

[Section titled “uploadFile()”](https://www.daytona.io/docs/en/java-sdk/file-system/#uploadfile)

```
public void uploadFile(byte[] content, String remotePath)
```

Uploads in-memory file content to a Sandbox path.

**Parameters**:

- `content` _byte\[\]_ \- file bytes; `null` uploads an empty file
- `remotePath` _String_ \- destination file path in the Sandbox

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if upload fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#uploadfilestream) uploadFileStream()

[Section titled “uploadFileStream()”](https://www.daytona.io/docs/en/java-sdk/file-system/#uploadfilestream)

```
public void uploadFileStream(InputStream source, String remotePath, UploadStreamOptions options)
```

Streams an upload to a Sandbox path without buffering the source. The bytes are
piped through a progress-counting wrapper directly into a streaming multipart
request, so heap usage stays flat regardless of source size.

**Parameters**:

- `source` _InputStream_ \- the data source; the caller retains ownership and is responsible for closing it
- `remotePath` _String_ \- destination file path in the Sandbox
- `options` _UploadStreamOptions_ \- upload options including timeout, cancellation, and progress callback

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if upload fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#uploadfilestream-1) uploadFileStream()

[Section titled “uploadFileStream()”](https://www.daytona.io/docs/en/java-sdk/file-system/#uploadfilestream-1)

```
public void uploadFileStream(InputStream source, String remotePath)
```

Convenience overload using default options.

**Parameters**:

- `source` _InputStream_ -
- `remotePath` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#listfiles) listFiles()

[Section titled “listFiles()”](https://www.daytona.io/docs/en/java-sdk/file-system/#listfiles)

```
public List<FileInfo> listFiles(String path)
```

Lists files and directories under a path.

**Parameters**:

- `path` _String_ \- directory path

**Returns**:

- `List\<FileInfo\>` \- file metadata entries

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if listing fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#listfiles-1) listFiles()

[Section titled “listFiles()”](https://www.daytona.io/docs/en/java-sdk/file-system/#listfiles-1)

```
public List<FileInfo> listFiles(String path, Integer depth)
```

Lists files and directories under a path, optionally recursing into subdirectories.

**Parameters**:

- `path` _String_ \- directory path
- `depth` _Integer_ \- how many levels deep to list: depth=1 (default) lists the directory’s entries, depth=2 also includes their children, and so on; must be >= 1. Each returned entry carries a full path field.

**Returns**:

- `List\<FileInfo\>` \- file metadata entries

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if listing fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#getfiledetails) getFileDetails()

[Section titled “getFileDetails()”](https://www.daytona.io/docs/en/java-sdk/file-system/#getfiledetails)

```
public FileInfo getFileDetails(String path)
```

Returns metadata for a single file or directory.

**Parameters**:

- `path` _String_ \- file or directory path

**Returns**:

- `FileInfo` \- metadata record

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if lookup fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#findfiles) findFiles()

[Section titled “findFiles()”](https://www.daytona.io/docs/en/java-sdk/file-system/#findfiles)

```
public List<Map<String, Object>> findFiles(String path, String pattern)
```

Searches files by content pattern.

**Parameters**:

- `path` _String_ \- root directory to search
- `pattern` _String_ \- text pattern to find

**Returns**:

- `List\<Map\<String, Object\>\>` \- list of matches containing file, line, and content

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the search request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#searchfiles) searchFiles()

[Section titled “searchFiles()”](https://www.daytona.io/docs/en/java-sdk/file-system/#searchfiles)

```
public Map<String, Object> searchFiles(String path, String pattern)
```

Searches files by file-name pattern.

**Parameters**:

- `path` _String_ \- root directory to search
- `pattern` _String_ \- file-name pattern

**Returns**:

- `Map\<String, Object\>` \- result map containing `files`

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if the search request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#replaceinfiles) replaceInFiles()

[Section titled “replaceInFiles()”](https://www.daytona.io/docs/en/java-sdk/file-system/#replaceinfiles)

```
public void replaceInFiles(List<String> files, String pattern, String newValue)
```

Performs in-place replacement in multiple files.

**Parameters**:

- `files` _List<String>_ \- files to process
- `pattern` _String_ \- pattern to replace
- `newValue` _String_ \- replacement text

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if replacement fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/file-system/\#movefiles) moveFiles()

[Section titled “moveFiles()”](https://www.daytona.io/docs/en/java-sdk/file-system/#movefiles)

```
public void moveFiles(String source, String destination)
```

Moves or renames a file or directory.

**Parameters**:

- `source` _String_ \- source path
- `destination` _String_ \- destination path

**Throws**:

- `io.daytona.sdk.exception.DaytonaException` \- if move fails