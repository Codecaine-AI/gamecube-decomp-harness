---
url: "https://www.daytona.io/docs/en/typescript-sdk/errors/"
title: "Errors | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/errors/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/errors.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaa11yunavailableerror) DaytonaA11yUnavailableError

[Section titled “DaytonaA11yUnavailableError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaa11yunavailableerror)

The accessibility service is unavailable (code `A11Y_UNAVAILABLE`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaServiceUnavailableError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaServiceUnavailableError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaServiceUnavailableError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaServiceUnavailableError.statusCode`

**Extends:**

- `DaytonaServiceUnavailableError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode)

_Inherited from_: `DaytonaServiceUnavailableError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaa11yunavailableerror) new DaytonaA11yUnavailableError()

[Section titled “new DaytonaA11yUnavailableError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaa11yunavailableerror)

```
new DaytonaA11yUnavailableError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaA11yUnavailableError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaA11yUnavailableError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from)

`DaytonaServiceUnavailableError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaauthenticationerror) DaytonaAuthenticationError

[Section titled “DaytonaAuthenticationError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaauthenticationerror)

Authentication failed — missing or invalid credentials (HTTP 401).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by)

- `DaytonaGitAuthFailedError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-1) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-1)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-1) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-1)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-1) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-1)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-1)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-1) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-1)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaauthenticationerror) new DaytonaAuthenticationError()

[Section titled “new DaytonaAuthenticationError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaauthenticationerror)

```
new DaytonaAuthenticationError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaAuthenticationError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaAuthenticationError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-1) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-1)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaauthorizationerror) ~~DaytonaAuthorizationError~~

[Section titled “DaytonaAuthorizationError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaauthorizationerror)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#deprecated-2) Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-2)

**Properties**:

- ~~`code?`~~ _string_
  - _Inherited from_: `DaytonaForbiddenError.code`
- ~~`headers?`~~ _AxiosHeaders_
  - _Inherited from_: `DaytonaForbiddenError.headers`
- ~~`source?`~~ _string_
  - _Inherited from_: `DaytonaForbiddenError.source`
- ~~`statusCode?`~~ _number_
  - _Inherited from_: `DaytonaForbiddenError.statusCode`

Use DaytonaForbiddenError instead.

**Extends:**

- `DaytonaForbiddenError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-2) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-2)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-2) ~~errorCode~~

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-2)

_Inherited from_: `DaytonaForbiddenError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-2) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-2)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-3)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-2) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-2)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaauthorizationerror) new DaytonaAuthorizationError()

[Section titled “new DaytonaAuthorizationError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaauthorizationerror)

```
new DaytonaAuthorizationError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaAuthorizationError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaAuthorizationError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-2) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-2)

`DaytonaForbiddenError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonabadgatewayerror) DaytonaBadGatewayError

[Section titled “DaytonaBadGatewayError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonabadgatewayerror)

An upstream gateway returned an invalid response (HTTP 502).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-3) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-3)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-3) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-3)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-3) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-3)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-4)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-3) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-3)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonabadgatewayerror) new DaytonaBadGatewayError()

[Section titled “new DaytonaBadGatewayError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonabadgatewayerror)

```
new DaytonaBadGatewayError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaBadGatewayError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaBadGatewayError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-3) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-3)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonabadrequesterror) DaytonaBadRequestError

[Section titled “DaytonaBadRequestError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonabadrequesterror)

The request was malformed or invalid (HTTP 400).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-1) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-1)

- `DaytonaValidationError`
- `DaytonaInvalidFilePathError`
- `DaytonaLspServerNotInitializedError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-4) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-4)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-4) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-4)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-4) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-4)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-5)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-4) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-4)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonabadrequesterror) new DaytonaBadRequestError()

[Section titled “new DaytonaBadRequestError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonabadrequesterror)

```
new DaytonaBadRequestError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaBadRequestError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaBadRequestError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-4) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-4)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonacommandalreadycompletederror) DaytonaCommandAlreadyCompletedError

[Section titled “DaytonaCommandAlreadyCompletedError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonacommandalreadycompletederror)

The session command already finished (code `COMMAND_ALREADY_COMPLETED`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaGoneError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaGoneError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaGoneError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaGoneError.statusCode`

**Extends:**

- `DaytonaGoneError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-5) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-5)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-5) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-5)

_Inherited from_: `DaytonaGoneError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-5) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-5)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-6)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-5) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-5)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonacommandalreadycompletederror) new DaytonaCommandAlreadyCompletedError()

[Section titled “new DaytonaCommandAlreadyCompletedError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonacommandalreadycompletederror)

```
new DaytonaCommandAlreadyCompletedError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaCommandAlreadyCompletedError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaCommandAlreadyCompletedError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-5) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-5)

`DaytonaGoneError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaconflicterror) DaytonaConflictError

[Section titled “DaytonaConflictError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaconflicterror)

The request conflicts with the current state of the resource (HTTP 409).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-2) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-2)

- `DaytonaGitBranchExistsError`
- `DaytonaGitPushRejectedError`
- `DaytonaGitDirtyWorktreeError`
- `DaytonaGitMergeConflictError`
- `DaytonaRecordingStillActiveError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-6) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-6)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-6) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-6)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-6) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-6)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-7)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-6) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-6)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaconflicterror) new DaytonaConflictError()

[Section titled “new DaytonaConflictError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaconflicterror)

```
new DaytonaConflictError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaConflictError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaConflictError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-6) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-6)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaconnectionerror) DaytonaConnectionError

[Section titled “DaytonaConnectionError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaconnectionerror)

Network connection failure (can’t connect or mid-request drop).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-3) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-3)

- `DaytonaConnectionTimeoutError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-7) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-7)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-7) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-7)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-7) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-7)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-8)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-7) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-7)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaconnectionerror) new DaytonaConnectionError()

[Section titled “new DaytonaConnectionError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaconnectionerror)

```
new DaytonaConnectionError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaConnectionError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaConnectionError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-7) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-7)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaconnectiontimeouterror) DaytonaConnectionTimeoutError

[Section titled “DaytonaConnectionTimeoutError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaconnectiontimeouterror)

Transport-layer timeout (connect / read). Subclass of DaytonaConnectionError.

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaConnectionError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaConnectionError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaConnectionError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaConnectionError.statusCode`

**Extends:**

- `DaytonaConnectionError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-8) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-8)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-8) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-8)

_Inherited from_: `DaytonaConnectionError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-8) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-8)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-9)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-8) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-8)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaconnectiontimeouterror) new DaytonaConnectionTimeoutError()

[Section titled “new DaytonaConnectionTimeoutError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaconnectiontimeouterror)

```
new DaytonaConnectionTimeoutError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaConnectionTimeoutError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaConnectionTimeoutError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-8) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-8)

`DaytonaConnectionError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaerror) DaytonaError

[Section titled “DaytonaError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaerror)

Base error for Daytona SDK. `statusCode` and `code` are populated only
for errors translated from a server response. `source` is `undefined`
unless the caller (or the translation layer) sets it.

**Properties**:

- `code?` _string_
- `headers?` _AxiosHeaders_
- `source?` _string_
- `statusCode?` _number_

**Extends:**

- `Error`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-4) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-4)

- `DaytonaBadRequestError`
- `DaytonaAuthenticationError`
- `DaytonaForbiddenError`
- `DaytonaNotFoundError`
- `DaytonaTimeoutError`
- `DaytonaConflictError`
- `DaytonaGoneError`
- `DaytonaUnprocessableEntityError`
- `DaytonaRateLimitError`
- `DaytonaInternalServerError`
- `DaytonaBadGatewayError`
- `DaytonaServiceUnavailableError`
- `DaytonaConnectionError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-9) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-9)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-9) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-9)

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-9) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-9)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-10)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-9) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-9)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaerror) new DaytonaError()

[Section titled “new DaytonaError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaerror)

```
new DaytonaError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#overrides) Overrides

[Section titled “Overrides”](https://www.daytona.io/docs/en/typescript-sdk/errors/#overrides)

```
Error.constructor
```

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonafileaccessdeniederror) DaytonaFileAccessDeniedError

[Section titled “DaytonaFileAccessDeniedError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonafileaccessdeniederror)

Access to the sandbox file was denied (code `FILE_ACCESS_DENIED`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaForbiddenError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaForbiddenError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaForbiddenError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaForbiddenError.statusCode`

**Extends:**

- `DaytonaForbiddenError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-10) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-10)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-10) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-10)

_Inherited from_: `DaytonaForbiddenError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-10) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-10)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-11)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-10) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-10)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonafileaccessdeniederror) new DaytonaFileAccessDeniedError()

[Section titled “new DaytonaFileAccessDeniedError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonafileaccessdeniederror)

```
new DaytonaFileAccessDeniedError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaFileAccessDeniedError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaFileAccessDeniedError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-9) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-9)

`DaytonaForbiddenError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonafilenotfounderror) DaytonaFileNotFoundError

[Section titled “DaytonaFileNotFoundError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonafilenotfounderror)

The file does not exist in the sandbox (code `FILE_NOT_FOUND`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaNotFoundError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaNotFoundError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaNotFoundError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaNotFoundError.statusCode`

**Extends:**

- `DaytonaNotFoundError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-11) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-11)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-11) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-11)

_Inherited from_: `DaytonaNotFoundError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-11) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-11)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-12)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-11) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-11)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonafilenotfounderror) new DaytonaFileNotFoundError()

[Section titled “new DaytonaFileNotFoundError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonafilenotfounderror)

```
new DaytonaFileNotFoundError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaFileNotFoundError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaFileNotFoundError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-10) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-10)

`DaytonaNotFoundError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonafilereadfailederror) DaytonaFileReadFailedError

[Section titled “DaytonaFileReadFailedError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonafilereadfailederror)

The daemon could not read the sandbox file (code `FILE_READ_FAILED`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaInternalServerError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaInternalServerError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaInternalServerError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaInternalServerError.statusCode`

**Extends:**

- `DaytonaInternalServerError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-12) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-12)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-12) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-12)

_Inherited from_: `DaytonaInternalServerError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-12) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-12)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-13)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-12) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-12)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonafilereadfailederror) new DaytonaFileReadFailedError()

[Section titled “new DaytonaFileReadFailedError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonafilereadfailederror)

```
new DaytonaFileReadFailedError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaFileReadFailedError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaFileReadFailedError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-11) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-11)

`DaytonaInternalServerError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaforbiddenerror) DaytonaForbiddenError

[Section titled “DaytonaForbiddenError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaforbiddenerror)

The authenticated caller lacks permission for the operation (HTTP 403).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-5) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-5)

- `DaytonaAuthorizationError`
- `DaytonaFileAccessDeniedError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-13) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-13)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-13) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-13)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-13) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-13)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-14)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-13) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-13)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaforbiddenerror) new DaytonaForbiddenError()

[Section titled “new DaytonaForbiddenError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaforbiddenerror)

```
new DaytonaForbiddenError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaForbiddenError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaForbiddenError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-12) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-12)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonagitauthfailederror) DaytonaGitAuthFailedError

[Section titled “DaytonaGitAuthFailedError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonagitauthfailederror)

Git authentication against the remote failed (code `GIT_AUTH_FAILED`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaAuthenticationError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaAuthenticationError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaAuthenticationError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaAuthenticationError.statusCode`

**Extends:**

- `DaytonaAuthenticationError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-14) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-14)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-14) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-14)

_Inherited from_: `DaytonaAuthenticationError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-14) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-14)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-15)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-14) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-14)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonagitauthfailederror) new DaytonaGitAuthFailedError()

[Section titled “new DaytonaGitAuthFailedError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonagitauthfailederror)

```
new DaytonaGitAuthFailedError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaGitAuthFailedError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaGitAuthFailedError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-13) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-13)

`DaytonaAuthenticationError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonagitbranchexistserror) DaytonaGitBranchExistsError

[Section titled “DaytonaGitBranchExistsError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonagitbranchexistserror)

The git branch already exists (code `GIT_BRANCH_EXISTS`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaConflictError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaConflictError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaConflictError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaConflictError.statusCode`

**Extends:**

- `DaytonaConflictError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-15) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-15)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-15) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-15)

_Inherited from_: `DaytonaConflictError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-15) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-15)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-16)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-15) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-15)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonagitbranchexistserror) new DaytonaGitBranchExistsError()

[Section titled “new DaytonaGitBranchExistsError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonagitbranchexistserror)

```
new DaytonaGitBranchExistsError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaGitBranchExistsError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaGitBranchExistsError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-14) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-14)

`DaytonaConflictError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonagitbranchnotfounderror) DaytonaGitBranchNotFoundError

[Section titled “DaytonaGitBranchNotFoundError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonagitbranchnotfounderror)

The git branch does not exist (code `GIT_BRANCH_NOT_FOUND`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaNotFoundError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaNotFoundError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaNotFoundError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaNotFoundError.statusCode`

**Extends:**

- `DaytonaNotFoundError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-16) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-16)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-16) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-16)

_Inherited from_: `DaytonaNotFoundError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-16) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-16)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-17)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-16) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-16)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonagitbranchnotfounderror) new DaytonaGitBranchNotFoundError()

[Section titled “new DaytonaGitBranchNotFoundError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonagitbranchnotfounderror)

```
new DaytonaGitBranchNotFoundError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaGitBranchNotFoundError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaGitBranchNotFoundError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-15) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-15)

`DaytonaNotFoundError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonagitdirtyworktreeerror) DaytonaGitDirtyWorktreeError

[Section titled “DaytonaGitDirtyWorktreeError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonagitdirtyworktreeerror)

The operation requires a clean worktree (code `GIT_DIRTY_WORKTREE`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaConflictError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaConflictError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaConflictError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaConflictError.statusCode`

**Extends:**

- `DaytonaConflictError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-17) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-17)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-17) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-17)

_Inherited from_: `DaytonaConflictError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-17) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-17)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-18)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-17) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-17)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonagitdirtyworktreeerror) new DaytonaGitDirtyWorktreeError()

[Section titled “new DaytonaGitDirtyWorktreeError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonagitdirtyworktreeerror)

```
new DaytonaGitDirtyWorktreeError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaGitDirtyWorktreeError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaGitDirtyWorktreeError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-16) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-16)

`DaytonaConflictError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonagitmergeconflicterror) DaytonaGitMergeConflictError

[Section titled “DaytonaGitMergeConflictError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonagitmergeconflicterror)

A git merge produced conflicts (code `GIT_MERGE_CONFLICT`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaConflictError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaConflictError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaConflictError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaConflictError.statusCode`

**Extends:**

- `DaytonaConflictError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-18) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-18)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-18) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-18)

_Inherited from_: `DaytonaConflictError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-18) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-18)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-19)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-18) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-18)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonagitmergeconflicterror) new DaytonaGitMergeConflictError()

[Section titled “new DaytonaGitMergeConflictError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonagitmergeconflicterror)

```
new DaytonaGitMergeConflictError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaGitMergeConflictError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaGitMergeConflictError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-17) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-17)

`DaytonaConflictError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonagitpushrejectederror) DaytonaGitPushRejectedError

[Section titled “DaytonaGitPushRejectedError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonagitpushrejectederror)

The git push was rejected by the remote (code `GIT_PUSH_REJECTED`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaConflictError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaConflictError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaConflictError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaConflictError.statusCode`

**Extends:**

- `DaytonaConflictError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-19) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-19)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-19) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-19)

_Inherited from_: `DaytonaConflictError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-19) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-19)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-20)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-19) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-19)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonagitpushrejectederror) new DaytonaGitPushRejectedError()

[Section titled “new DaytonaGitPushRejectedError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonagitpushrejectederror)

```
new DaytonaGitPushRejectedError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaGitPushRejectedError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaGitPushRejectedError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-18) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-18)

`DaytonaConflictError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonagitreponotfounderror) DaytonaGitRepoNotFoundError

[Section titled “DaytonaGitRepoNotFoundError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonagitreponotfounderror)

The git remote repository was not found (code `GIT_REPO_NOT_FOUND`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaNotFoundError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaNotFoundError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaNotFoundError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaNotFoundError.statusCode`

**Extends:**

- `DaytonaNotFoundError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-20) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-20)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-20) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-20)

_Inherited from_: `DaytonaNotFoundError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-20) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-20)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-21)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-20) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-20)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonagitreponotfounderror) new DaytonaGitRepoNotFoundError()

[Section titled “new DaytonaGitRepoNotFoundError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonagitreponotfounderror)

```
new DaytonaGitRepoNotFoundError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaGitRepoNotFoundError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaGitRepoNotFoundError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-19) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-19)

`DaytonaNotFoundError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonagoneerror) DaytonaGoneError

[Section titled “DaytonaGoneError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonagoneerror)

The resource existed but is permanently gone (HTTP 410).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-6) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-6)

- `DaytonaSessionEndedError`
- `DaytonaCommandAlreadyCompletedError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-21) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-21)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-21) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-21)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-21) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-21)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-22)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-21) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-21)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonagoneerror) new DaytonaGoneError()

[Section titled “new DaytonaGoneError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonagoneerror)

```
new DaytonaGoneError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaGoneError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaGoneError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-20) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-20)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonainternalservererror) DaytonaInternalServerError

[Section titled “DaytonaInternalServerError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonainternalservererror)

A Daytona service failed unexpectedly (HTTP 500).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-7) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-7)

- `DaytonaFileReadFailedError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-22) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-22)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-22) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-22)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-22) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-22)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-23)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-22) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-22)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonainternalservererror) new DaytonaInternalServerError()

[Section titled “new DaytonaInternalServerError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonainternalservererror)

```
new DaytonaInternalServerError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaInternalServerError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaInternalServerError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-21) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-21)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonainvalidargumenterror) DaytonaInvalidArgumentError

[Section titled “DaytonaInvalidArgumentError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonainvalidargumenterror)

The SDK rejected the caller’s arguments locally, before any request was
sent. `statusCode`, `code` and `source` are always `undefined` — no Daytona
service was contacted, so there is no HTTP status to report.

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaValidationError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaValidationError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaValidationError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaValidationError.statusCode`

Distinct from DaytonaBadRequestError (a service returned HTTP 400)
and DaytonaUnprocessableEntityError (a service returned HTTP 422).
This one always means: fix the arguments at the call site.

**Example:**

```
try {

  await sandbox.setAutoStopInterval(-1)

} catch (err) {

  if (err instanceof DaytonaInvalidArgumentError) {

    // never reached the API — the value itself is invalid

  }

}
```

**Extends:**

- `DaytonaValidationError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-23) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-23)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-23) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-23)

_Inherited from_: `DaytonaValidationError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-23) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-23)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-24)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-23) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-23)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonainvalidargumenterror) new DaytonaInvalidArgumentError()

[Section titled “new DaytonaInvalidArgumentError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonainvalidargumenterror)

```
new DaytonaInvalidArgumentError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaInvalidArgumentError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaInvalidArgumentError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-22) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-22)

`DaytonaValidationError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonainvalidfilepatherror) DaytonaInvalidFilePathError

[Section titled “DaytonaInvalidFilePathError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonainvalidfilepatherror)

The supplied file path was rejected by the daemon (code `INVALID_FILE_PATH`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaBadRequestError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaBadRequestError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaBadRequestError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaBadRequestError.statusCode`

**Extends:**

- `DaytonaBadRequestError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-24) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-24)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-24) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-24)

_Inherited from_: `DaytonaBadRequestError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-24) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-24)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-25)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-24) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-24)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonainvalidfilepatherror) new DaytonaInvalidFilePathError()

[Section titled “new DaytonaInvalidFilePathError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonainvalidfilepatherror)

```
new DaytonaInvalidFilePathError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaInvalidFilePathError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaInvalidFilePathError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-23) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-23)

`DaytonaBadRequestError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonalspservernotinitializederror) DaytonaLspServerNotInitializedError

[Section titled “DaytonaLspServerNotInitializedError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonalspservernotinitializederror)

The LSP server must be initialized first (code `LSP_SERVER_NOT_INITIALIZED`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaBadRequestError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaBadRequestError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaBadRequestError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaBadRequestError.statusCode`

**Extends:**

- `DaytonaBadRequestError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-25) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-25)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-25) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-25)

_Inherited from_: `DaytonaBadRequestError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-25) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-25)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-26)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-25) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-25)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonalspservernotinitializederror) new DaytonaLspServerNotInitializedError()

[Section titled “new DaytonaLspServerNotInitializedError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonalspservernotinitializederror)

```
new DaytonaLspServerNotInitializedError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaLspServerNotInitializedError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaLspServerNotInitializedError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-24) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-24)

`DaytonaBadRequestError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonanotfounderror) DaytonaNotFoundError

[Section titled “DaytonaNotFoundError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonanotfounderror)

The requested resource does not exist (HTTP 404).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-8) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-8)

- `DaytonaGitRepoNotFoundError`
- `DaytonaGitBranchNotFoundError`
- `DaytonaFileNotFoundError`
- `DaytonaProcessNotFoundError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-26) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-26)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-26) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-26)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-26) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-26)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-27)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-26) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-26)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonanotfounderror) new DaytonaNotFoundError()

[Section titled “new DaytonaNotFoundError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonanotfounderror)

```
new DaytonaNotFoundError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaNotFoundError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaNotFoundError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-25) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-25)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaprocessexecutiontimeouterror) DaytonaProcessExecutionTimeoutError

[Section titled “DaytonaProcessExecutionTimeoutError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaprocessexecutiontimeouterror)

Command execution exceeded its timeout (code `PROCESS_EXECUTION_TIMEOUT`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaTimeoutError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaTimeoutError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaTimeoutError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaTimeoutError.statusCode`

**Extends:**

- `DaytonaTimeoutError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-27) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-27)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-27) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-27)

_Inherited from_: `DaytonaTimeoutError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-27) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-27)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-28)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-27) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-27)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaprocessexecutiontimeouterror) new DaytonaProcessExecutionTimeoutError()

[Section titled “new DaytonaProcessExecutionTimeoutError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaprocessexecutiontimeouterror)

```
new DaytonaProcessExecutionTimeoutError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaProcessExecutionTimeoutError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaProcessExecutionTimeoutError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-26) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-26)

`DaytonaTimeoutError`.`constructor`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/errors/#methods)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#hasinstance)\[hasInstance\]()

[Section titled “\[hasInstance\]()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#hasinstance)

```
static hasInstance: boolean
```

**Parameters**:

- `value` _unknown_

**Returns**:

- `boolean`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-27) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-27)

`DaytonaTimeoutError`. [`[hasInstance]`](https://www.daytona.io/docs/en/typescript-sdk/errors/Errors.md#hasinstance-6)

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaprocessnotfounderror) DaytonaProcessNotFoundError

[Section titled “DaytonaProcessNotFoundError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaprocessnotfounderror)

The sandbox process does not exist (code `PROCESS_NOT_FOUND`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaNotFoundError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaNotFoundError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaNotFoundError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaNotFoundError.statusCode`

**Extends:**

- `DaytonaNotFoundError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-28) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-28)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-28) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-28)

_Inherited from_: `DaytonaNotFoundError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-28) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-28)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-29)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-28) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-28)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaprocessnotfounderror) new DaytonaProcessNotFoundError()

[Section titled “new DaytonaProcessNotFoundError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaprocessnotfounderror)

```
new DaytonaProcessNotFoundError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaProcessNotFoundError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaProcessNotFoundError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-28) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-28)

`DaytonaNotFoundError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaratelimiterror) DaytonaRateLimitError

[Section titled “DaytonaRateLimitError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaratelimiterror)

The caller exceeded a rate limit (HTTP 429).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-29) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-29)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-29) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-29)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-29) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-29)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-30)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-29) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-29)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaratelimiterror) new DaytonaRateLimitError()

[Section titled “new DaytonaRateLimitError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaratelimiterror)

```
new DaytonaRateLimitError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaRateLimitError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaRateLimitError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-29) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-29)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonarecordingffmpegnotfounderror) DaytonaRecordingFfmpegNotFoundError

[Section titled “DaytonaRecordingFfmpegNotFoundError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonarecordingffmpegnotfounderror)

ffmpeg is not available for recording (code `RECORDING_FFMPEG_NOT_FOUND`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaServiceUnavailableError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaServiceUnavailableError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaServiceUnavailableError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaServiceUnavailableError.statusCode`

**Extends:**

- `DaytonaServiceUnavailableError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-30) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-30)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-30) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-30)

_Inherited from_: `DaytonaServiceUnavailableError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-30) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-30)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-31)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-30) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-30)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonarecordingffmpegnotfounderror) new DaytonaRecordingFfmpegNotFoundError()

[Section titled “new DaytonaRecordingFfmpegNotFoundError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonarecordingffmpegnotfounderror)

```
new DaytonaRecordingFfmpegNotFoundError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaRecordingFfmpegNotFoundError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaRecordingFfmpegNotFoundError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-30) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-30)

`DaytonaServiceUnavailableError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonarecordingstillactiveerror) DaytonaRecordingStillActiveError

[Section titled “DaytonaRecordingStillActiveError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonarecordingstillactiveerror)

A screen recording is still active (code `RECORDING_STILL_ACTIVE`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaConflictError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaConflictError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaConflictError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaConflictError.statusCode`

**Extends:**

- `DaytonaConflictError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-31) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-31)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-31) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-31)

_Inherited from_: `DaytonaConflictError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-31) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-31)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-32)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-31) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-31)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonarecordingstillactiveerror) new DaytonaRecordingStillActiveError()

[Section titled “new DaytonaRecordingStillActiveError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonarecordingstillactiveerror)

```
new DaytonaRecordingStillActiveError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaRecordingStillActiveError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaRecordingStillActiveError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-31) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-31)

`DaytonaConflictError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaserviceunavailableerror) DaytonaServiceUnavailableError

[Section titled “DaytonaServiceUnavailableError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaserviceunavailableerror)

The service is temporarily unable to handle the request (HTTP 503).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-9) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-9)

- `DaytonaA11yUnavailableError`
- `DaytonaRecordingFfmpegNotFoundError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-32) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-32)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-32) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-32)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-32) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-32)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-33)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-32) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-32)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaserviceunavailableerror) new DaytonaServiceUnavailableError()

[Section titled “new DaytonaServiceUnavailableError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaserviceunavailableerror)

```
new DaytonaServiceUnavailableError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaServiceUnavailableError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaServiceUnavailableError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-32) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-32)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonasessionendederror) DaytonaSessionEndedError

[Section titled “DaytonaSessionEndedError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonasessionendederror)

The session has already ended (code `SESSION_ENDED`).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaGoneError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaGoneError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaGoneError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaGoneError.statusCode`

**Extends:**

- `DaytonaGoneError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-33) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-33)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-33) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-33)

_Inherited from_: `DaytonaGoneError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-33) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-33)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-34)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-33) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-33)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonasessionendederror) new DaytonaSessionEndedError()

[Section titled “new DaytonaSessionEndedError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonasessionendederror)

```
new DaytonaSessionEndedError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaSessionEndedError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaSessionEndedError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-33) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-33)

`DaytonaGoneError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonatimeouterror) DaytonaTimeoutError

[Section titled “DaytonaTimeoutError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonatimeouterror)

The operation timed out (HTTP 408, or 504 when a gateway timed out).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

Also matches DaytonaConnectionTimeoutError via `instanceof`, even
though that class sits under DaytonaConnectionError in the prototype
chain. Transport timeouts were raised as `DaytonaTimeoutError` before
`DaytonaConnectionTimeoutError` existed, so this keeps pre-existing
`catch (err) { if (err instanceof DaytonaTimeoutError) ... }` blocks working
— the same compatibility the Python SDK gets from inheriting both classes.

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-10) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-10)

- `DaytonaProcessExecutionTimeoutError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-34) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-34)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-34) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-34)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-34) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-34)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-35)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-34) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-34)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonatimeouterror) new DaytonaTimeoutError()

[Section titled “new DaytonaTimeoutError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonatimeouterror)

```
new DaytonaTimeoutError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaTimeoutError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaTimeoutError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-34) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-34)

`DaytonaError`.`constructor`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#methods-1) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/errors/#methods-1)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#hasinstance-1)\[hasInstance\]()

[Section titled “\[hasInstance\]()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#hasinstance-1)

```
static hasInstance: boolean
```

**Parameters**:

- `value` _unknown_

**Returns**:

- `boolean`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonaunprocessableentityerror) DaytonaUnprocessableEntityError

[Section titled “DaytonaUnprocessableEntityError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonaunprocessableentityerror)

The request was well-formed but semantically invalid (HTTP 422).

**Properties**:

- `code?` _string_
  - _Inherited from_: `DaytonaError.code`
- `headers?` _AxiosHeaders_
  - _Inherited from_: `DaytonaError.headers`
- `source?` _string_
  - _Inherited from_: `DaytonaError.source`
- `statusCode?` _number_
  - _Inherited from_: `DaytonaError.statusCode`

**Extends:**

- `DaytonaError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-35) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-35)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-35) errorCode

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-35)

_Inherited from_: `DaytonaError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-35) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-35)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-36)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-35) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-35)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonaunprocessableentityerror) new DaytonaUnprocessableEntityError()

[Section titled “new DaytonaUnprocessableEntityError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonaunprocessableentityerror)

```
new DaytonaUnprocessableEntityError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaUnprocessableEntityError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaUnprocessableEntityError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-35) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-35)

`DaytonaError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#daytonavalidationerror) ~~DaytonaValidationError~~

[Section titled “DaytonaValidationError”](https://www.daytona.io/docs/en/typescript-sdk/errors/#daytonavalidationerror)

Legacy umbrella for validation failures. Kept so existing
`catch (err) { if (err instanceof DaytonaValidationError) ... }` blocks keep
matching both server-returned HTTP 400s and locally rejected arguments.

**Properties**:

- ~~`code?`~~ _string_
  - _Inherited from_: `DaytonaBadRequestError.code`
- ~~`headers?`~~ _AxiosHeaders_
  - _Inherited from_: `DaytonaBadRequestError.headers`
- ~~`source?`~~ _string_
  - _Inherited from_: `DaytonaBadRequestError.source`
- ~~`statusCode?`~~ _number_
  - _Inherited from_: `DaytonaBadRequestError.statusCode`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#deprecated-37) Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-37)

Do not throw or catch this directly in new code. Branch on the
precise class instead:

- DaytonaInvalidArgumentError — the SDK rejected your arguments
locally, before any request was sent.
- DaytonaBadRequestError — a Daytona service returned HTTP 400.
- DaytonaUnprocessableEntityError — a Daytona service returned
HTTP 422 (well-formed but semantically invalid).

**Extends:**

- `DaytonaBadRequestError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#extended-by-11) Extended by

[Section titled “Extended by”](https://www.daytona.io/docs/en/typescript-sdk/errors/#extended-by-11)

- `DaytonaInvalidArgumentError`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#accessors-36) Accessors

[Section titled “Accessors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#accessors-36)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorcode-36) ~~errorCode~~

[Section titled “errorCode”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorcode-36)

_Inherited from_: `DaytonaBadRequestError.errorCode`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#get-signature-36) Get Signature

[Section titled “Get Signature”](https://www.daytona.io/docs/en/typescript-sdk/errors/#get-signature-36)

```
get errorCode(): string
```

###### Deprecated

[Section titled “Deprecated”](https://www.daytona.io/docs/en/typescript-sdk/errors/#deprecated-38)

Use DaytonaError.code instead. Kept so existing
`err.errorCode` reads keep returning the machine-readable code.

**Returns**:

- `string` \- the machine-readable error code, or `undefined` when the
response did not carry one (same as DaytonaError.code)

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#constructors-36) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/errors/#constructors-36)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#new-daytonavalidationerror) new DaytonaValidationError()

[Section titled “new DaytonaValidationError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#new-daytonavalidationerror)

```
new DaytonaValidationError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaValidationError
```

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaValidationError`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#inherited-from-36) Inherited from

[Section titled “Inherited from”](https://www.daytona.io/docs/en/typescript-sdk/errors/#inherited-from-36)

`DaytonaBadRequestError`.`constructor`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#createaxiosdaytonaerror) createAxiosDaytonaError()

[Section titled “createAxiosDaytonaError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#createaxiosdaytonaerror)

```
function createAxiosDaytonaError(error: AxiosError): DaytonaError
```

Creates the appropriate Daytona error subclass from an Axios error. Maps
client-side timeouts to DaytonaConnectionTimeoutError, networking failures
(no response received) to DaytonaConnectionError, and HTTP responses to
the most specific subclass via `createDaytonaError`.

**Parameters**:

- `error` _AxiosError_

**Returns**:

- `DaytonaError`

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#createdaytonaerror) createDaytonaError()

[Section titled “createDaytonaError()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#createdaytonaerror)

```
function createDaytonaError(

   message: string,

   statusCode?: number,

   headers?: AxiosHeaders,

   code?: string,

   source?: string): DaytonaError
```

Creates the appropriate Daytona error subclass from structured error metadata.

Resolution order: (source, code) override -> HTTP status code -> DaytonaError.

**Parameters**:

- `message` _string_
- `statusCode?` _number_
- `headers?` _AxiosHeaders_
- `code?` _string_
- `source?` _string_

**Returns**:

- `DaytonaError`

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#errorclassfromstatuscode) errorClassFromStatusCode()

[Section titled “errorClassFromStatusCode()”](https://www.daytona.io/docs/en/typescript-sdk/errors/#errorclassfromstatuscode)

```
function errorClassFromStatusCode(statusCode?: number): typeof DaytonaError
```

Maps an HTTP status code to the corresponding Daytona error class.

**Parameters**:

- `statusCode?` _number_

### [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#returns) Returns

[Section titled “Returns”](https://www.daytona.io/docs/en/typescript-sdk/errors/#returns)

_typeof_`DaytonaError`

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#responseheaders) ResponseHeaders

[Section titled “ResponseHeaders”](https://www.daytona.io/docs/en/typescript-sdk/errors/#responseheaders)

```
type ResponseHeaders = InstanceType<typeof AxiosHeaders>;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#source_api) SOURCE\_API

[Section titled “SOURCE\_API”](https://www.daytona.io/docs/en/typescript-sdk/errors/#source_api)

```
const SOURCE_API: "DAYTONA_API" = 'DAYTONA_API';
```

Wire-format `source` identifiers set by the translation layer when a
Daytona service stamps them on the wire envelope. `source = undefined`
means the response did not carry a structured envelope (treat as opaque).

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#source_daemon) SOURCE\_DAEMON

[Section titled “SOURCE\_DAEMON”](https://www.daytona.io/docs/en/typescript-sdk/errors/#source_daemon)

```
const SOURCE_DAEMON: "DAYTONA_DAEMON" = 'DAYTONA_DAEMON';
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/errors/\#source_proxy) SOURCE\_PROXY

[Section titled “SOURCE\_PROXY”](https://www.daytona.io/docs/en/typescript-sdk/errors/#source_proxy)

```
const SOURCE_PROXY: "DAYTONA_PROXY" = 'DAYTONA_PROXY';
```