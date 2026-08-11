---
url: "https://www.daytona.io/docs/en/typescript-sdk/file-system/"
title: "FileSystem | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/file-system/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/file-system.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#filesystem) FileSystem

[Section titled “FileSystem”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#filesystem)

Provides file system operations within a Sandbox.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#constructors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#new-filesystem) new FileSystem()

[Section titled “new FileSystem()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#new-filesystem)

```
new FileSystem(clientConfig: Configuration, apiClient: FileSystemApi): FileSystem
```

**Parameters**:

- `clientConfig` _Configuration_
- `apiClient` _FileSystemApi_

**Returns**:

- `FileSystem`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#methods)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#createfolder) createFolder()

[Section titled “createFolder()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#createfolder)

```
createFolder(path: string, mode: string): Promise<void>
```

Create a new directory in the Sandbox with specified permissions.

**Parameters**:

- `path` _string_ \- Path where the directory should be created. Relative paths are resolved based on the sandbox working directory.
- `mode` _string_ \- Directory permissions in octal format (e.g. “755”)

**Returns**:

- `Promise<void>`

**Example:**

```
// Create a directory with standard permissions

await fs.createFolder('app/data', '755');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#deletefile) deleteFile()

[Section titled “deleteFile()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#deletefile)

```
deleteFile(path: string, recursive?: boolean): Promise<void>
```

Deletes a file or directory from the Sandbox.

**Parameters**:

- `path` _string_ \- Path to the file or directory to delete. Relative paths are resolved based on the sandbox working directory.
- `recursive?` _boolean_ \- If the file is a directory, this must be true to delete it.

**Returns**:

- `Promise<void>`

**Example:**

```
// Delete a file

await fs.deleteFile('app/temp.log');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#downloadfile) downloadFile()

[Section titled “downloadFile()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#downloadfile)

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#call-signature) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#call-signature)

```
downloadFile(remotePath: string, timeout?: number): Promise<Buffer<ArrayBufferLike>>
```

Downloads a file from the Sandbox. This method loads the entire file into memory, so it is not recommended
for downloading large files.

**Parameters**:

- `remotePath` _string_ \- Path to the file to download. Relative paths are resolved based on the sandbox working directory.
- `timeout?` _number_ \- Timeout for the download operation in seconds. 0 means no timeout.
Default is 30 minutes.

**Returns**:

- `Promise<Buffer<ArrayBufferLike>>` \- The file contents as a Buffer.

**Example:**

```
// Download and process a file

const fileBuffer = await fs.downloadFile('tmp/data.json');

console.log('File content:', fileBuffer.toString());
```

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#call-signature-1) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#call-signature-1)

```
downloadFile(

   remotePath: string,

   localPath: string,

timeout?: number): Promise<void>
```

Downloads a file from the Sandbox and saves it to a local file. This method uses streaming to download the file,
so it is recommended for downloading larger files.

**Parameters**:

- `remotePath` _string_ \- Path to the file to download in the Sandbox. Relative paths are resolved based on the sandbox working directory.
- `localPath` _string_ \- Path to save the downloaded file.
- `timeout?` _number_ \- Timeout for the download operation in seconds. 0 means no timeout.
Default is 30 minutes.

**Returns**:

- `Promise<void>`

**Example:**

```
// Download and save a file

await fs.downloadFile('tmp/data.json', 'local_file.json');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#downloadfiles) downloadFiles()

[Section titled “downloadFiles()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#downloadfiles)

```
downloadFiles(files: FileDownloadRequest[], timeoutSec?: number): Promise<FileDownloadResponse[]>
```

Downloads multiple files from the Sandbox. If the files already exist locally, they will be overwritten.

**Parameters**:

- `files` _FileDownloadRequest\[\]_ \- Array of file download requests.
- `timeoutSec?` _number = …_ \- Timeout for the download operation in seconds. 0 means no timeout.
Default is 30 minutes.

**Returns**:

- `Promise<FileDownloadResponse[]>` \- Array of download results.

**Throws**:

If the request itself fails (network issues, invalid request/response, etc.). Individual
file download errors are returned in `FileDownloadResponse.error`. When the daemon provides structured
per-file metadata, it is also available in `FileDownloadResponse.errorDetails`.

**Example:**

```
// Download multiple files

const results = await fs.downloadFiles([\
\
  { source: 'tmp/data.json' },\
\
  { source: 'tmp/config.json', destination: 'local_config.json' }\
\
]);

results.forEach(result => {

  if (result.error) {

    console.error(`Error downloading ${result.source}: ${result.error}`);

  } else if (result.result) {

    console.log(`Downloaded ${result.source} to ${result.result}`);

  }

});
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#downloadfilestream) downloadFileStream()

[Section titled “downloadFileStream()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#downloadfilestream)

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#call-signature-2) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#call-signature-2)

```
downloadFileStream(remotePath: string, timeout?: number): Promise<Readable>
```

Downloads a single file from the Sandbox as a readable stream without buffering
the entire file into memory. The returned stream can be piped directly to an HTTP
response, a file write stream, or any other writable destination.

This method is only supported in Node.js-compatible runtimes (Node.js, Bun).
Browser and serverless environments should use downloadFile instead.

**Parameters**:

- `remotePath` _string_ \- Path to the file in the Sandbox. Relative paths are
resolved based on the sandbox working directory.
- `timeout?` _number_

**Returns**:

- `Promise<Readable>` \- A Node.js Readable stream of the file content.

**Examples:**

```
// Pipe directly to an HTTP response

const stream = await sandbox.fs.downloadFileStream('outputs/report.pdf');

stream.pipe(res);
```

```
// Download with progress tracking and cancellation

const controller = new AbortController();

const stream = await sandbox.fs.downloadFileStream('outputs/large-file.bin', {

  signal: controller.signal,

  onProgress: ({ bytesReceived, totalBytes }) => console.log(bytesReceived, totalBytes),

});

stream.pipe(createWriteStream('local-file.bin'));
```

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#call-signature-3) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#call-signature-3)

```
downloadFileStream(remotePath: string, options?: DownloadStreamOptions): Promise<Readable>
```

Downloads a single file from the Sandbox as a readable stream without buffering
the entire file into memory. The returned stream can be piped directly to an HTTP
response, a file write stream, or any other writable destination.

This method is only supported in Node.js-compatible runtimes (Node.js, Bun).
Browser and serverless environments should use downloadFile instead.

**Parameters**:

- `remotePath` _string_ \- Path to the file in the Sandbox. Relative paths are
resolved based on the sandbox working directory.
- `options?` _DownloadStreamOptions_

**Returns**:

- `Promise<Readable>` \- A Node.js Readable stream of the file content.

**Examples:**

```
// Pipe directly to an HTTP response

const stream = await sandbox.fs.downloadFileStream('outputs/report.pdf');

stream.pipe(res);
```

```
// Download with progress tracking and cancellation

const controller = new AbortController();

const stream = await sandbox.fs.downloadFileStream('outputs/large-file.bin', {

  signal: controller.signal,

  onProgress: ({ bytesReceived, totalBytes }) => console.log(bytesReceived, totalBytes),

});

stream.pipe(createWriteStream('local-file.bin'));
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#findfiles) findFiles()

[Section titled “findFiles()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#findfiles)

```
findFiles(path: string, pattern: string): Promise<Match[]>
```

Searches for text patterns within files in the Sandbox.

**Parameters**:

- `path` _string_ \- Directory to search in. Relative paths are resolved based on the sandbox working directory.
- `pattern` _string_ \- Search pattern

**Returns**:

- `Promise<Match[]>` \- Array of matches with file and line information

**Example:**

```
// Find all TODO comments in TypeScript files

const matches = await fs.findFiles('app/src', 'TODO:');

matches.forEach(match => {

  console.log(`${match.file}:${match.line}: ${match.content}`);

});
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#getfiledetails) getFileDetails()

[Section titled “getFileDetails()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#getfiledetails)

```
getFileDetails(path: string): Promise<FileInfo>
```

Retrieves detailed information about a file or directory.

**Parameters**:

- `path` _string_ \- Path to the file or directory. Relative paths are resolved based on the sandbox working directory.

**Returns**:

- `Promise<FileInfo>` \- Detailed file information including size, permissions, modification time

**Example:**

```
// Get file details

const info = await fs.getFileDetails('app/config.json');

console.log(`Size: ${info.size}, Modified: ${info.modTime}`);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#listfiles) listFiles()

[Section titled “listFiles()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#listfiles)

```
listFiles(path: string, options?: {

  depth: number;

}): Promise<FileInfo[]>
```

Lists contents of a directory in the Sandbox.

**Parameters**:

- `path` _string_ \- Directory path to list. Relative paths are resolved based on the sandbox working directory.
- `options?` _Listing options_
- `depth?` _number_ \- How many levels deep to list. depth=1 (default) lists the
directory’s entries, depth=2 also includes their children, and so on. Must be an integer >= 1.
Each returned FileInfo carries a full `path` field.

**Returns**:

- `Promise<FileInfo[]>` \- Array of file and directory information

**Example:**

```
// List directory contents

const files = await fs.listFiles('app/src');

files.forEach(file => {

  console.log(`${file.name} (${file.size} bytes)`);

});

// List recursively two levels deep

const tree = await fs.listFiles('app/src', { depth: 2 });

tree.forEach(file => console.log(file.path));
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#movefiles) moveFiles()

[Section titled “moveFiles()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#movefiles)

```
moveFiles(source: string, destination: string): Promise<void>
```

Moves or renames a file or directory.

**Parameters**:

- `source` _string_ \- Source path. Relative paths are resolved based on the sandbox working directory.
- `destination` _string_ \- Destination path. Relative paths are resolved based on the sandbox working directory.

**Returns**:

- `Promise<void>`

**Example:**

```
// Move a file to a new location

await fs.moveFiles('app/temp/data.json', 'app/data/data.json');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#replaceinfiles) replaceInFiles()

[Section titled “replaceInFiles()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#replaceinfiles)

```
replaceInFiles(

   files: string[],

   pattern: string,

newValue: string): Promise<ReplaceResult[]>
```

Replaces text content in multiple files.

**Parameters**:

- `files` _string\[\]_ \- Array of file paths to process. Relative paths are resolved based on the sandbox working directory.
- `pattern` _string_ \- Pattern to replace
- `newValue` _string_ \- Replacement text

**Returns**:

- `Promise<ReplaceResult[]>` \- Results of the replace operation for each file

**Example:**

```
// Update version number across multiple files

const results = await fs.replaceInFiles(

  ['app/package.json', 'app/version.ts'],

  '"version": "1.0.0"',

  '"version": "1.1.0"'

);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#searchfiles) searchFiles()

[Section titled “searchFiles()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#searchfiles)

```
searchFiles(path: string, pattern: string): Promise<SearchFilesResponse>
```

Searches for files and directories by name pattern in the Sandbox.

**Parameters**:

- `path` _string_ \- Directory to search in. Relative paths are resolved based on the sandbox working directory.
- `pattern` _string_ \- File name pattern (supports globs)

**Returns**:

- `Promise<SearchFilesResponse>` \- Search results with matching files

**Example:**

```
// Find all TypeScript files

const result = await fs.searchFiles('app', '*.ts');

result.files.forEach(file => console.log(file));
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#setfilepermissions) setFilePermissions()

[Section titled “setFilePermissions()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#setfilepermissions)

```
setFilePermissions(path: string, permissions: FilePermissionsParams): Promise<void>
```

Sets permissions and ownership for a file or directory.

**Parameters**:

- `path` _string_ \- Path to the file or directory. Relative paths are resolved based on the sandbox working directory.
- `permissions` _FilePermissionsParams_ \- Permission settings

**Returns**:

- `Promise<void>`

**Example:**

```
// Set file permissions and ownership

await fs.setFilePermissions('app/script.sh', {

  owner: 'daytona',

  group: 'users',

  mode: '755'  // Execute permission for shell script

});
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#uploadfile) uploadFile()

[Section titled “uploadFile()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#uploadfile)

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#call-signature-4) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#call-signature-4)

```
uploadFile(

   file: Buffer,

   remotePath: string,

timeout?: number): Promise<void>
```

Uploads a file to the Sandbox. This method loads the entire file into memory, so it is not recommended
for uploading large files.

**Parameters**:

- `file` _Buffer_ \- Buffer of the file to upload.
- `remotePath` _string_ \- Destination path in the Sandbox. Relative paths are resolved based on the sandbox working directory.
- `timeout?` _number_ \- Timeout for the upload operation in seconds. 0 means no timeout.
Default is 30 minutes.

**Returns**:

- `Promise<void>`

**Example:**

```
// Upload a configuration file

await fs.uploadFile(Buffer.from('{"setting": "value"}'), 'tmp/config.json');
```

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#call-signature-5) Call Signature

[Section titled “Call Signature”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#call-signature-5)

```
uploadFile(

   localPath: string,

   remotePath: string,

timeout?: number): Promise<void>
```

Uploads a file from the local file system to the Sandbox. This method uses streaming to upload the file,
so it is recommended for uploading larger files.

**Parameters**:

- `localPath` _string_ \- Path to the local file to upload.
- `remotePath` _string_ \- Destination path in the Sandbox. Relative paths are resolved based on the sandbox working directory.
- `timeout?` _number_ \- Timeout for the upload operation in seconds. 0 means no timeout.
Default is 30 minutes.

**Returns**:

- `Promise<void>`

**Example:**

```
// Upload a local file

await fs.uploadFile('local_file.txt', 'tmp/file.txt');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#uploadfiles) uploadFiles()

[Section titled “uploadFiles()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#uploadfiles)

```
uploadFiles(files: FileUpload[], timeout?: number): Promise<void>
```

Uploads multiple files to the Sandbox. If files already exist at the destination paths,
they will be overwritten.

**Parameters**:

- `files` _FileUpload\[\]_ \- Array of files to upload.
- `timeout?` _number = …_ \- Timeout for the upload operation in seconds. 0 means no timeout.
Default is 30 minutes.

**Returns**:

- `Promise<void>`

**Example:**

```
// Upload multiple text files

const files = [\
\
  {\
\
    source: Buffer.from('Content of file 1'),\
\
    destination: '/tmp/file1.txt'\
\
  },\
\
  {\
\
    source: 'app/data/file2.txt',\
\
    destination: '/tmp/file2.txt'\
\
  },\
\
  {\
\
    source: Buffer.from('{"key": "value"}'),\
\
    destination: '/tmp/config.json'\
\
  }\
\
];

await fs.uploadFiles(files);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#uploadfilestream) uploadFileStream()

[Section titled “uploadFileStream()”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#uploadfilestream)

```
uploadFileStream(

   source: UploadSource,

   remotePath: string,

options?: UploadStreamOptions): Promise<void>
```

Uploads a single file to the Sandbox using true streaming, with optional progress
tracking and cancellation. Memory usage stays flat regardless of source size: the
SDK pipes the source through a transform that counts bytes and forwards to the
underlying multipart upload without buffering the whole payload. The HTTP layer
uses chunked transfer encoding, so the source’s natural EOF terminates the upload —
no advance size is needed.

**Parameters**:

- `source` _UploadSource_ \- The data to upload. Accepts the same `Buffer | string`
inputs as FileSystem.uploadFile, plus Node `Readable` streams and Web
`ReadableStream` instances. When a string is passed, it is treated as a local
file path and read in streaming chunks.
- `remotePath` _string_ \- Destination path in the Sandbox. Relative paths are
resolved against the sandbox working directory.
- `options?` _UploadStreamOptions =_ \- Streaming options: AbortSignal, onProgress
callback, timeout.

**Returns**:

- `Promise<void>`

**Example:**

```
// Upload a 2 GB file with progress tracking and the ability to cancel

import { createReadStream } from 'fs';

const controller = new AbortController();

await sandbox.fs.uploadFileStream(createReadStream('big.bin'), 'tmp/big.bin', {

  signal: controller.signal,

  onProgress: ({ bytesSent }) => console.log(`${bytesSent} bytes sent`),

});
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#downloadmetadata) DownloadMetadata

[Section titled “DownloadMetadata”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#downloadmetadata)

Represents metadata for a file download operation.

**Properties**:

- `destination?` _string_ \- Destination path in the local filesystem where the file content will be streamed to.
- `error?` _string_ \- Error message if the download failed, undefined if successful.
- `errorDetails?` _FileDownloadErrorDetails_ \- Structured error metadata for a failed download item.
- `result?` _string \| Buffer<ArrayBufferLike> \| Uint8Array<ArrayBufferLike>_ \- The download result - file path (if destination provided in the request)
or bytes content (if no destination in the request), undefined if failed or no data received.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#downloadstreamoptions) DownloadStreamOptions

[Section titled “DownloadStreamOptions”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#downloadstreamoptions)

Options for streaming file downloads.

**Properties**:

- `onProgress()?` _(progress: DownloadProgress) => void_ \- Callback invoked with cumulative progress information.

**Parameters**:


  - `progress` _DownloadProgress_

**Returns**:
  - `void`
- `signal?` _AbortSignal_ \- AbortSignal for cancelling the download.

- `timeout?` _number_ \- Timeout in seconds. 0 means no timeout. Default is 30 minutes.


## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#filedownloaderrordetails) FileDownloadErrorDetails

[Section titled “FileDownloadErrorDetails”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#filedownloaderrordetails)

Structured error metadata for a failed bulk file download item.

**Properties**:

- `code?` _string_ \- Machine-readable error code for the per-file failure.
- ~~`errorCode?`~~ _string_ \- **_Deprecated_** \- Use code instead — kept for backward compatibility.
- `message` _string_ \- Human-readable error message.
- `source?` _string_ \- Originating service from the wire envelope (e.g. DAYTONA\_DAEMON).
- `statusCode?` _number_ \- HTTP-style status code for the per-file failure.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#filedownloadrequest) FileDownloadRequest

[Section titled “FileDownloadRequest”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#filedownloadrequest)

Represents a request to download a single file from the Sandbox.

**Properties**:

- `destination?` _string_ \- Destination path in the local filesystem where the file content will be
streamed to. If not provided, the file will be downloaded in the bytes buffer (might cause memory issues if the file is large).
- `source` _string_ \- Source path in the Sandbox. Relative paths are resolved based on the user’s
root directory.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#filedownloadresponse) FileDownloadResponse

[Section titled “FileDownloadResponse”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#filedownloadresponse)

Represents the response to a single file download request.

**Properties**:

- `error?` _string_ \- Error message if the download failed, undefined if successful.
- `errorDetails?` _FileDownloadErrorDetails_ \- Structured error metadata when the server provides it.
- `result?` _string \| Buffer<ArrayBufferLike>_ \- The download result - file path (if destination provided in the request)
or bytes content (if no destination in the request), undefined if failed or no data received.
- `source` _string_ \- The original source path requested for download.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#filepermissionsparams) FilePermissionsParams

[Section titled “FilePermissionsParams”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#filepermissionsparams)

Parameters for setting file permissions in the Sandbox.

**Properties**:

- `group?` _string_ \- Group owner of the file
- `mode?` _string_ \- File mode/permissions in octal format (e.g. “644”)
- `owner?` _string_ \- User owner of the file

**Example:**

```
const permissions: FilePermissionsParams = {

  mode: '644',

  owner: 'daytona',

  group: 'users'

};
```

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#fileupload) FileUpload

[Section titled “FileUpload”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#fileupload)

Represents a file to be uploaded to the Sandbox.

**Properties**:

- `destination` _string_ \- Absolute destination path in the Sandbox. Relative paths are resolved based on the sandbox working directory.
- `source` _string \| Buffer<ArrayBufferLike>_ \- File to upload. If a Buffer, it is interpreted as the file content which is loaded into memory.
Make sure it fits into memory, otherwise use the local file path which content will be streamed to the Sandbox.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#uploadstreamoptions) UploadStreamOptions

[Section titled “UploadStreamOptions”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#uploadstreamoptions)

Options for streaming file uploads.

**Properties**:

- `onProgress()?` _(progress: UploadProgress) => void_ \- Callback invoked with cumulative progress information.

**Parameters**:


  - `progress` _UploadProgress_

**Returns**:
  - `void`
- `signal?` _AbortSignal_ \- AbortSignal for cancelling the upload.

- `timeout?` _number_ \- Timeout in seconds. 0 means no timeout. Default is 30 minutes.


## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#downloadprogress) DownloadProgress

[Section titled “DownloadProgress”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#downloadprogress)

```
type DownloadProgress = {

  bytesReceived: number;

  totalBytes: number;

};
```

**Type declaration**:

- `bytesReceived` _number_ \- Cumulative bytes received so far.
- `totalBytes?` _number_ \- Total bytes expected, if known. Undefined if unavailable.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#uploadprogress) UploadProgress

[Section titled “UploadProgress”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#uploadprogress)

```
type UploadProgress = {

  bytesSent: number;

};
```

**Type declaration**:

- `bytesSent` _number_ \- Cumulative bytes sent so far.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/file-system/\#uploadsource) UploadSource

[Section titled “UploadSource”](https://www.daytona.io/docs/en/typescript-sdk/file-system/#uploadsource)

```
type UploadSource = Buffer | Uint8Array | string | Readable | ReadableStream<Uint8Array>;
```

Source for a streaming file upload. The same input shapes accepted by
FileSystem.uploadFile are also valid here, plus Node `Readable`
streams and Web `ReadableStream` instances.