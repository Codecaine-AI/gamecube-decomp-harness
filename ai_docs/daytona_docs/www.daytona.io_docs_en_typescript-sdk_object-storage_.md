---
url: "https://www.daytona.io/docs/en/typescript-sdk/object-storage/"
title: "ObjectStorage | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/object-storage/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/object-storage.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/object-storage/\#objectstorage) ObjectStorage

[Section titled “ObjectStorage”](https://www.daytona.io/docs/en/typescript-sdk/object-storage/#objectstorage)

ObjectStorage class for interacting with object storage services.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/object-storage/\#param) Param

[Section titled “Param”](https://www.daytona.io/docs/en/typescript-sdk/object-storage/#param)

The configuration for the object storage service.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/object-storage/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/object-storage/#constructors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/object-storage/\#new-objectstorage) new ObjectStorage()

[Section titled “new ObjectStorage()”](https://www.daytona.io/docs/en/typescript-sdk/object-storage/#new-objectstorage)

```
new ObjectStorage(config: ObjectStorageConfig): ObjectStorage
```

**Parameters**:

- `config` _ObjectStorageConfig_

**Returns**:

- `ObjectStorage`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/object-storage/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/object-storage/#methods)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/object-storage/\#upload) upload()

[Section titled “upload()”](https://www.daytona.io/docs/en/typescript-sdk/object-storage/#upload)

```
upload(

   path: string,

   organizationId: string,

archiveBasePath: string): Promise<string>
```

Upload a file or directory to object storage.

**Parameters**:

- `path` _string_ \- The path to the file or directory to upload.
- `organizationId` _string_ \- The organization ID to use for the upload.
- `archiveBasePath` _string_ \- The base path to use for the archive.

**Returns**:

- `Promise<string>` \- The hash of the uploaded file or directory.

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/object-storage/\#objectstorageconfig) ObjectStorageConfig

[Section titled “ObjectStorageConfig”](https://www.daytona.io/docs/en/typescript-sdk/object-storage/#objectstorageconfig)

Configuration for the ObjectStorage class.

**Properties**:

- `accessKeyId` _string_ \- The access key ID for the object storage service.
- `bucketName?` _string_ \- The name of the bucket to use.
- `endpointUrl` _string_ \- The endpoint URL for the object storage service.
- `region` _string_ \- The region of the storage backend.
- `secretAccessKey` _string_ \- The secret access key for the object storage service.
- `sessionToken?` _string_ \- The session token for the object storage service. Used for temporary credentials.