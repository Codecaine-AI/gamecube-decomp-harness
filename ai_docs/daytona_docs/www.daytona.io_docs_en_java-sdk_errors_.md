---
url: "https://www.daytona.io/docs/en/java-sdk/errors/"
title: "Errors | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/errors/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/errors.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaexception) DaytonaException

[Section titled “DaytonaException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaexception)

Base exception for all Daytona SDK errors.

Subclasses map to specific HTTP status codes and allow callers to catch
precise failure conditions without string-parsing error messages:

```
try {

Sandbox sandbox = daytona.sandbox().get("nonexistent-id");

} catch (DaytonaNotFoundException e) {

// sandbox does not exist

} catch (DaytonaAuthenticationException e) {

// invalid API key

} catch (DaytonaException e) {

// other SDK error

}
```

**Properties**:

- `SOURCE_API` _String_ \- Wire-format `source` values set by the translation layer when a
Daytona service stamps them on the wire envelope. A `null``source` means the response did not carry a structured envelope
(treat as opaque).
- `SOURCE_DAEMON` _String_ -
- `SOURCE_PROXY` _String_ -

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaexception) new DaytonaException()

[Section titled “new DaytonaException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaexception)

```
public DaytonaException(String message)
```

Creates a generic Daytona exception.

**Parameters**:

- `message` _String_ \- error description

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaexception-1) new DaytonaException()

[Section titled “new DaytonaException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaexception-1)

```
public DaytonaException(String message, Throwable cause)
```

Creates a generic Daytona exception with a cause.

**Parameters**:

- `message` _String_ \- error description
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaexception-2) new DaytonaException()

[Section titled “new DaytonaException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaexception-2)

```
public DaytonaException(int statusCode, String message)
```

Creates a Daytona exception with explicit HTTP status code.

**Parameters**:

- `statusCode` _int_ \- HTTP status code
- `message` _String_ \- error description

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaexception-3) new DaytonaException()

[Section titled “new DaytonaException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaexception-3)

```
public DaytonaException(int statusCode, String message, Throwable cause)
```

Creates a Daytona exception with explicit HTTP status code and a cause.

**Parameters**:

- `statusCode` _int_ \- HTTP status code
- `message` _String_ \- error description
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaexception-4) new DaytonaException()

[Section titled “new DaytonaException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaexception-4)

```
public DaytonaException(int statusCode, String message, Map<String, String> headers)
```

Creates a Daytona exception with HTTP status code and headers.

**Parameters**:

- `statusCode` _int_ \- HTTP status code
- `message` _String_ \- error description
- `headers` _Map<String, String>_ \- response headers

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaexception-5) new DaytonaException()

[Section titled “new DaytonaException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaexception-5)

```
public DaytonaException(int statusCode, String message, Map<String, String> headers, String code, String source)
```

Creates a Daytona exception with HTTP status code, headers, error code, and source.

**Parameters**:

- `statusCode` _int_ \- HTTP status code
- `message` _String_ \- error description
- `headers` _Map<String, String>_ \- response headers
- `code` _String_ \- machine-readable error code
- `source` _String_ \- component that originated the error

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaexception-6) new DaytonaException()

[Section titled “new DaytonaException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaexception-6)

```
public DaytonaException(int statusCode, String message, String code, String source)
```

Creates a Daytona exception with HTTP status code, error code, and source.

**Parameters**:

- `statusCode` _int_ \- HTTP status code
- `message` _String_ \- error description
- `code` _String_ \- machine-readable error code
- `source` _String_ \- component that originated the error

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaexception-7) new DaytonaException()

[Section titled “new DaytonaException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaexception-7)

```
public DaytonaException(int statusCode, String message, Throwable cause, String code, String source)
```

Creates a Daytona exception with HTTP status code, cause, error code, and source.

**Parameters**:

- `statusCode` _int_ \- HTTP status code
- `message` _String_ \- error description
- `cause` _Throwable_ \- root cause
- `code` _String_ \- machine-readable error code
- `source` _String_ \- component that originated the error

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/errors/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#setpendingheaders) setPendingHeaders()

[Section titled “setPendingHeaders()”](https://www.daytona.io/docs/en/java-sdk/errors/#setpendingheaders)

```
public static void setPendingHeaders(Map<String, String> headers)
```

**Parameters**:

- `headers` _Map<String, String>_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#clearpendingheaders) clearPendingHeaders()

[Section titled “clearPendingHeaders()”](https://www.daytona.io/docs/en/java-sdk/errors/#clearpendingheaders)

```
public static void clearPendingHeaders()
```

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#getstatuscode) getStatusCode()

[Section titled “getStatusCode()”](https://www.daytona.io/docs/en/java-sdk/errors/#getstatuscode)

```
public int getStatusCode()
```

Returns the HTTP status code, or 0 if not applicable.

**Returns**:

- `int` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#getheaders) getHeaders()

[Section titled “getHeaders()”](https://www.daytona.io/docs/en/java-sdk/errors/#getheaders)

```
public Map<String, String> getHeaders()
```

Returns the HTTP response headers, or an empty map if not available.

**Returns**:

- `Map\<String, String\>` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#getcode) getCode()

[Section titled “getCode()”](https://www.daytona.io/docs/en/java-sdk/errors/#getcode)

```
public String getCode()
```

Returns the machine-readable error code, or null if not available.

**Returns**:

- `String` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#getsource) getSource()

[Section titled “getSource()”](https://www.daytona.io/docs/en/java-sdk/errors/#getsource)

```
public String getSource()
```

Returns the originating service from the wire envelope. `null`
for SDK-side errors and for responses that don’t carry the envelope.
Otherwise one of `#SOURCE_API`, `#SOURCE_DAEMON` or
`#SOURCE_PROXY`.

**Returns**:

- `String` -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaa11yunavailableexception) DaytonaA11yUnavailableException

[Section titled “DaytonaA11yUnavailableException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaa11yunavailableexception)

The accessibility (AT-SPI) bus is not reachable.

Subclass of `DaytonaServiceUnavailableException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-1) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-1)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaa11yunavailableexception) new DaytonaA11yUnavailableException()

[Section titled “new DaytonaA11yUnavailableException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaa11yunavailableexception)

```
public DaytonaA11yUnavailableException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaa11yunavailableexception-1) new DaytonaA11yUnavailableException()

[Section titled “new DaytonaA11yUnavailableException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaa11yunavailableexception-1)

```
public DaytonaA11yUnavailableException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaa11yunavailableexception-2) new DaytonaA11yUnavailableException()

[Section titled “new DaytonaA11yUnavailableException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaa11yunavailableexception-2)

```
public DaytonaA11yUnavailableException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaa11yunavailableexception-3) new DaytonaA11yUnavailableException()

[Section titled “new DaytonaA11yUnavailableException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaa11yunavailableexception-3)

```
public DaytonaA11yUnavailableException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaauthenticationexception) DaytonaAuthenticationException

[Section titled “DaytonaAuthenticationException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaauthenticationexception)

Raised when API credentials are missing or invalid (HTTP 401).

```
try {

daytona.sandbox().create();

} catch (DaytonaAuthenticationException e) {

System.err.println("Invalid or missing API key");

}
```

**Properties**:

- `STATUS_CODE` _int_ \- HTTP status code carried by every instance of this class.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-2) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-2)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaauthenticationexception) new DaytonaAuthenticationException()

[Section titled “new DaytonaAuthenticationException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaauthenticationexception)

```
public DaytonaAuthenticationException(String message)
```

Creates an authentication exception.

**Parameters**:

- `message` _String_ \- error description from the API

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaauthenticationexception-1) new DaytonaAuthenticationException()

[Section titled “new DaytonaAuthenticationException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaauthenticationexception-1)

```
public DaytonaAuthenticationException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ \- error description from the API
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaauthenticationexception-2) new DaytonaAuthenticationException()

[Section titled “new DaytonaAuthenticationException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaauthenticationexception-2)

```
public DaytonaAuthenticationException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaauthenticationexception-3) new DaytonaAuthenticationException()

[Section titled “new DaytonaAuthenticationException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaauthenticationexception-3)

```
public DaytonaAuthenticationException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonabadgatewayexception) DaytonaBadGatewayException

[Section titled “DaytonaBadGatewayException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonabadgatewayexception)

Raised for HTTP 502 — an upstream dependency rejected or dropped the request.

**Properties**:

- `STATUS_CODE` _int_ -

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-3) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-3)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonabadgatewayexception) new DaytonaBadGatewayException()

[Section titled “new DaytonaBadGatewayException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonabadgatewayexception)

```
public DaytonaBadGatewayException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonabadgatewayexception-1) new DaytonaBadGatewayException()

[Section titled “new DaytonaBadGatewayException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonabadgatewayexception-1)

```
public DaytonaBadGatewayException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonabadgatewayexception-2) new DaytonaBadGatewayException()

[Section titled “new DaytonaBadGatewayException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonabadgatewayexception-2)

```
public DaytonaBadGatewayException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonabadgatewayexception-3) new DaytonaBadGatewayException()

[Section titled “new DaytonaBadGatewayException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonabadgatewayexception-3)

```
public DaytonaBadGatewayException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonabadrequestexception) DaytonaBadRequestException

[Section titled “DaytonaBadRequestException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonabadrequestexception)

Raised when the request is malformed or contains invalid parameters (HTTP 400).

```
try {

daytona.sandbox().create(params);

} catch (DaytonaBadRequestException e) {

System.err.println("Invalid request parameters: " + e.getMessage());

}
```

**Properties**:

- `STATUS_CODE` _int_ \- HTTP status code carried by every instance of this class.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-4) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-4)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonabadrequestexception) new DaytonaBadRequestException()

[Section titled “new DaytonaBadRequestException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonabadrequestexception)

```
public DaytonaBadRequestException(String message)
```

Creates a bad-request exception.

**Parameters**:

- `message` _String_ \- error description from the API

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonabadrequestexception-1) new DaytonaBadRequestException()

[Section titled “new DaytonaBadRequestException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonabadrequestexception-1)

```
public DaytonaBadRequestException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ \- error description from the API
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonabadrequestexception-2) new DaytonaBadRequestException()

[Section titled “new DaytonaBadRequestException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonabadrequestexception-2)

```
public DaytonaBadRequestException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonabadrequestexception-3) new DaytonaBadRequestException()

[Section titled “new DaytonaBadRequestException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonabadrequestexception-3)

```
public DaytonaBadRequestException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonacommandalreadycompletedexception) DaytonaCommandAlreadyCompletedException

[Section titled “DaytonaCommandAlreadyCompletedException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonacommandalreadycompletedexception)

The shell command already finished.

Subclass of `DaytonaGoneException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-5) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-5)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonacommandalreadycompletedexception) new DaytonaCommandAlreadyCompletedException()

[Section titled “new DaytonaCommandAlreadyCompletedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonacommandalreadycompletedexception)

```
public DaytonaCommandAlreadyCompletedException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonacommandalreadycompletedexception-1) new DaytonaCommandAlreadyCompletedException()

[Section titled “new DaytonaCommandAlreadyCompletedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonacommandalreadycompletedexception-1)

```
public DaytonaCommandAlreadyCompletedException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonacommandalreadycompletedexception-2) new DaytonaCommandAlreadyCompletedException()

[Section titled “new DaytonaCommandAlreadyCompletedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonacommandalreadycompletedexception-2)

```
public DaytonaCommandAlreadyCompletedException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonacommandalreadycompletedexception-3) new DaytonaCommandAlreadyCompletedException()

[Section titled “new DaytonaCommandAlreadyCompletedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonacommandalreadycompletedexception-3)

```
public DaytonaCommandAlreadyCompletedException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaconflictexception) DaytonaConflictException

[Section titled “DaytonaConflictException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaconflictexception)

Raised when an operation conflicts with the current state (HTTP 409).

Common causes: creating a resource with a name that already exists,
or performing an operation incompatible with the resource’s current state.

```
try {

daytona.snapshot().create(params);

} catch (DaytonaConflictException e) {

System.err.println("A snapshot with this name already exists");

}
```

**Properties**:

- `STATUS_CODE` _int_ \- HTTP status code carried by every instance of this class.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-6) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-6)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconflictexception) new DaytonaConflictException()

[Section titled “new DaytonaConflictException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconflictexception)

```
public DaytonaConflictException(String message)
```

Creates a conflict exception.

**Parameters**:

- `message` _String_ \- error description from the API

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconflictexception-1) new DaytonaConflictException()

[Section titled “new DaytonaConflictException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconflictexception-1)

```
public DaytonaConflictException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ \- error description from the API
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconflictexception-2) new DaytonaConflictException()

[Section titled “new DaytonaConflictException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconflictexception-2)

```
public DaytonaConflictException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconflictexception-3) new DaytonaConflictException()

[Section titled “new DaytonaConflictException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconflictexception-3)

```
public DaytonaConflictException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaconnectionexception) DaytonaConnectionException

[Section titled “DaytonaConnectionException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaconnectionexception)

Raised for network-level connection failures (no HTTP response received).

Raised when the SDK cannot reach the Daytona API due to network issues
such as DNS failure, connection refused, or TLS errors.

```
try {

daytona.sandbox().create();

} catch (DaytonaConnectionException e) {

System.err.println("Cannot reach Daytona API: " + e.getMessage());

}
```

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-7) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-7)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconnectionexception) new DaytonaConnectionException()

[Section titled “new DaytonaConnectionException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconnectionexception)

```
public DaytonaConnectionException(String message)
```

Creates a connection exception.

**Parameters**:

- `message` _String_ \- connection failure description

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconnectionexception-1) new DaytonaConnectionException()

[Section titled “new DaytonaConnectionException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconnectionexception-1)

```
public DaytonaConnectionException(String message, Throwable cause)
```

Creates a connection exception with a cause.

**Parameters**:

- `message` _String_ \- connection failure description
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconnectionexception-2) new DaytonaConnectionException()

[Section titled “new DaytonaConnectionException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconnectionexception-2)

```
public DaytonaConnectionException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconnectionexception-3) new DaytonaConnectionException()

[Section titled “new DaytonaConnectionException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconnectionexception-3)

```
public DaytonaConnectionException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaconnectiontimeoutexception) DaytonaConnectionTimeoutException

[Section titled “DaytonaConnectionTimeoutException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaconnectiontimeoutexception)

Raised when the transport layer times out connecting to or reading from a
Daytona service. Subclass of `DaytonaConnectionException` so callers
can catch the broader “connection failed” category.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-8) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-8)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconnectiontimeoutexception) new DaytonaConnectionTimeoutException()

[Section titled “new DaytonaConnectionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconnectiontimeoutexception)

```
public DaytonaConnectionTimeoutException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconnectiontimeoutexception-1) new DaytonaConnectionTimeoutException()

[Section titled “new DaytonaConnectionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconnectiontimeoutexception-1)

```
public DaytonaConnectionTimeoutException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconnectiontimeoutexception-2) new DaytonaConnectionTimeoutException()

[Section titled “new DaytonaConnectionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconnectiontimeoutexception-2)

```
public DaytonaConnectionTimeoutException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaconnectiontimeoutexception-3) new DaytonaConnectionTimeoutException()

[Section titled “new DaytonaConnectionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaconnectiontimeoutexception-3)

```
public DaytonaConnectionTimeoutException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonafileaccessdeniedexception) DaytonaFileAccessDeniedException

[Section titled “DaytonaFileAccessDeniedException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonafileaccessdeniedexception)

Insufficient permissions for the filesystem operation.

Subclass of `DaytonaForbiddenException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-9) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-9)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafileaccessdeniedexception) new DaytonaFileAccessDeniedException()

[Section titled “new DaytonaFileAccessDeniedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafileaccessdeniedexception)

```
public DaytonaFileAccessDeniedException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafileaccessdeniedexception-1) new DaytonaFileAccessDeniedException()

[Section titled “new DaytonaFileAccessDeniedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafileaccessdeniedexception-1)

```
public DaytonaFileAccessDeniedException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafileaccessdeniedexception-2) new DaytonaFileAccessDeniedException()

[Section titled “new DaytonaFileAccessDeniedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafileaccessdeniedexception-2)

```
public DaytonaFileAccessDeniedException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafileaccessdeniedexception-3) new DaytonaFileAccessDeniedException()

[Section titled “new DaytonaFileAccessDeniedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafileaccessdeniedexception-3)

```
public DaytonaFileAccessDeniedException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonafilenotfoundexception) DaytonaFileNotFoundException

[Section titled “DaytonaFileNotFoundException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonafilenotfoundexception)

Filesystem entry was not found.

Subclass of `DaytonaNotFoundException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-10) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-10)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafilenotfoundexception) new DaytonaFileNotFoundException()

[Section titled “new DaytonaFileNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafilenotfoundexception)

```
public DaytonaFileNotFoundException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafilenotfoundexception-1) new DaytonaFileNotFoundException()

[Section titled “new DaytonaFileNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafilenotfoundexception-1)

```
public DaytonaFileNotFoundException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafilenotfoundexception-2) new DaytonaFileNotFoundException()

[Section titled “new DaytonaFileNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafilenotfoundexception-2)

```
public DaytonaFileNotFoundException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafilenotfoundexception-3) new DaytonaFileNotFoundException()

[Section titled “new DaytonaFileNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafilenotfoundexception-3)

```
public DaytonaFileNotFoundException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonafilereadfailedexception) DaytonaFileReadFailedException

[Section titled “DaytonaFileReadFailedException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonafilereadfailedexception)

Daemon could not read the requested file (code `FILE_READ_FAILED`, HTTP 500).

Subclass of `DaytonaInternalServerException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-11) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-11)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafilereadfailedexception) new DaytonaFileReadFailedException()

[Section titled “new DaytonaFileReadFailedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafilereadfailedexception)

```
public DaytonaFileReadFailedException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafilereadfailedexception-1) new DaytonaFileReadFailedException()

[Section titled “new DaytonaFileReadFailedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafilereadfailedexception-1)

```
public DaytonaFileReadFailedException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafilereadfailedexception-2) new DaytonaFileReadFailedException()

[Section titled “new DaytonaFileReadFailedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafilereadfailedexception-2)

```
public DaytonaFileReadFailedException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonafilereadfailedexception-3) new DaytonaFileReadFailedException()

[Section titled “new DaytonaFileReadFailedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonafilereadfailedexception-3)

```
public DaytonaFileReadFailedException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaforbiddenexception) DaytonaForbiddenException

[Section titled “DaytonaForbiddenException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaforbiddenexception)

Raised when the authenticated user lacks permission to perform an operation (HTTP 403).

```
try {

daytona.sandbox().delete(sandboxId);

} catch (DaytonaForbiddenException e) {

System.err.println("Not authorized to delete this sandbox");

}
```

**Properties**:

- `STATUS_CODE` _int_ \- HTTP status code carried by every instance of this class.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-12) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-12)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaforbiddenexception) new DaytonaForbiddenException()

[Section titled “new DaytonaForbiddenException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaforbiddenexception)

```
public DaytonaForbiddenException(String message)
```

Creates a forbidden exception.

**Parameters**:

- `message` _String_ \- error description from the API

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaforbiddenexception-1) new DaytonaForbiddenException()

[Section titled “new DaytonaForbiddenException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaforbiddenexception-1)

```
public DaytonaForbiddenException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ \- error description from the API
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaforbiddenexception-2) new DaytonaForbiddenException()

[Section titled “new DaytonaForbiddenException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaforbiddenexception-2)

```
public DaytonaForbiddenException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaforbiddenexception-3) new DaytonaForbiddenException()

[Section titled “new DaytonaForbiddenException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaforbiddenexception-3)

```
public DaytonaForbiddenException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonagitauthfailedexception) DaytonaGitAuthFailedException

[Section titled “DaytonaGitAuthFailedException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonagitauthfailedexception)

Git authentication credentials were rejected by the remote.

Subclass of `DaytonaAuthenticationException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-13) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-13)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitauthfailedexception) new DaytonaGitAuthFailedException()

[Section titled “new DaytonaGitAuthFailedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitauthfailedexception)

```
public DaytonaGitAuthFailedException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitauthfailedexception-1) new DaytonaGitAuthFailedException()

[Section titled “new DaytonaGitAuthFailedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitauthfailedexception-1)

```
public DaytonaGitAuthFailedException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitauthfailedexception-2) new DaytonaGitAuthFailedException()

[Section titled “new DaytonaGitAuthFailedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitauthfailedexception-2)

```
public DaytonaGitAuthFailedException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitauthfailedexception-3) new DaytonaGitAuthFailedException()

[Section titled “new DaytonaGitAuthFailedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitauthfailedexception-3)

```
public DaytonaGitAuthFailedException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonagitbranchexistsexception) DaytonaGitBranchExistsException

[Section titled “DaytonaGitBranchExistsException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonagitbranchexistsexception)

A git branch with this name already exists.

Subclass of `DaytonaConflictException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-14) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-14)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitbranchexistsexception) new DaytonaGitBranchExistsException()

[Section titled “new DaytonaGitBranchExistsException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitbranchexistsexception)

```
public DaytonaGitBranchExistsException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitbranchexistsexception-1) new DaytonaGitBranchExistsException()

[Section titled “new DaytonaGitBranchExistsException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitbranchexistsexception-1)

```
public DaytonaGitBranchExistsException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitbranchexistsexception-2) new DaytonaGitBranchExistsException()

[Section titled “new DaytonaGitBranchExistsException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitbranchexistsexception-2)

```
public DaytonaGitBranchExistsException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitbranchexistsexception-3) new DaytonaGitBranchExistsException()

[Section titled “new DaytonaGitBranchExistsException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitbranchexistsexception-3)

```
public DaytonaGitBranchExistsException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonagitbranchnotfoundexception) DaytonaGitBranchNotFoundException

[Section titled “DaytonaGitBranchNotFoundException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonagitbranchnotfoundexception)

The requested git branch does not exist.

Subclass of `DaytonaNotFoundException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-15) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-15)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitbranchnotfoundexception) new DaytonaGitBranchNotFoundException()

[Section titled “new DaytonaGitBranchNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitbranchnotfoundexception)

```
public DaytonaGitBranchNotFoundException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitbranchnotfoundexception-1) new DaytonaGitBranchNotFoundException()

[Section titled “new DaytonaGitBranchNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitbranchnotfoundexception-1)

```
public DaytonaGitBranchNotFoundException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitbranchnotfoundexception-2) new DaytonaGitBranchNotFoundException()

[Section titled “new DaytonaGitBranchNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitbranchnotfoundexception-2)

```
public DaytonaGitBranchNotFoundException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitbranchnotfoundexception-3) new DaytonaGitBranchNotFoundException()

[Section titled “new DaytonaGitBranchNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitbranchnotfoundexception-3)

```
public DaytonaGitBranchNotFoundException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonagitdirtyworktreeexception) DaytonaGitDirtyWorktreeException

[Section titled “DaytonaGitDirtyWorktreeException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonagitdirtyworktreeexception)

Worktree has uncommitted changes.

Subclass of `DaytonaConflictException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-16) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-16)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitdirtyworktreeexception) new DaytonaGitDirtyWorktreeException()

[Section titled “new DaytonaGitDirtyWorktreeException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitdirtyworktreeexception)

```
public DaytonaGitDirtyWorktreeException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitdirtyworktreeexception-1) new DaytonaGitDirtyWorktreeException()

[Section titled “new DaytonaGitDirtyWorktreeException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitdirtyworktreeexception-1)

```
public DaytonaGitDirtyWorktreeException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitdirtyworktreeexception-2) new DaytonaGitDirtyWorktreeException()

[Section titled “new DaytonaGitDirtyWorktreeException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitdirtyworktreeexception-2)

```
public DaytonaGitDirtyWorktreeException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitdirtyworktreeexception-3) new DaytonaGitDirtyWorktreeException()

[Section titled “new DaytonaGitDirtyWorktreeException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitdirtyworktreeexception-3)

```
public DaytonaGitDirtyWorktreeException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonagitmergeconflictexception) DaytonaGitMergeConflictException

[Section titled “DaytonaGitMergeConflictException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonagitmergeconflictexception)

Git merge has conflicts that need manual resolution.

Subclass of `DaytonaConflictException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-17) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-17)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitmergeconflictexception) new DaytonaGitMergeConflictException()

[Section titled “new DaytonaGitMergeConflictException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitmergeconflictexception)

```
public DaytonaGitMergeConflictException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitmergeconflictexception-1) new DaytonaGitMergeConflictException()

[Section titled “new DaytonaGitMergeConflictException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitmergeconflictexception-1)

```
public DaytonaGitMergeConflictException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitmergeconflictexception-2) new DaytonaGitMergeConflictException()

[Section titled “new DaytonaGitMergeConflictException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitmergeconflictexception-2)

```
public DaytonaGitMergeConflictException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitmergeconflictexception-3) new DaytonaGitMergeConflictException()

[Section titled “new DaytonaGitMergeConflictException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitmergeconflictexception-3)

```
public DaytonaGitMergeConflictException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonagitpushrejectedexception) DaytonaGitPushRejectedException

[Section titled “DaytonaGitPushRejectedException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonagitpushrejectedexception)

Git push was rejected (non-fast-forward / stale ref).

Subclass of `DaytonaConflictException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-18) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-18)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitpushrejectedexception) new DaytonaGitPushRejectedException()

[Section titled “new DaytonaGitPushRejectedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitpushrejectedexception)

```
public DaytonaGitPushRejectedException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitpushrejectedexception-1) new DaytonaGitPushRejectedException()

[Section titled “new DaytonaGitPushRejectedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitpushrejectedexception-1)

```
public DaytonaGitPushRejectedException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitpushrejectedexception-2) new DaytonaGitPushRejectedException()

[Section titled “new DaytonaGitPushRejectedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitpushrejectedexception-2)

```
public DaytonaGitPushRejectedException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitpushrejectedexception-3) new DaytonaGitPushRejectedException()

[Section titled “new DaytonaGitPushRejectedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitpushrejectedexception-3)

```
public DaytonaGitPushRejectedException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonagitreponotfoundexception) DaytonaGitRepoNotFoundException

[Section titled “DaytonaGitRepoNotFoundException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonagitreponotfoundexception)

The requested git repository does not exist.

Subclass of `DaytonaNotFoundException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-19) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-19)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitreponotfoundexception) new DaytonaGitRepoNotFoundException()

[Section titled “new DaytonaGitRepoNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitreponotfoundexception)

```
public DaytonaGitRepoNotFoundException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitreponotfoundexception-1) new DaytonaGitRepoNotFoundException()

[Section titled “new DaytonaGitRepoNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitreponotfoundexception-1)

```
public DaytonaGitRepoNotFoundException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitreponotfoundexception-2) new DaytonaGitRepoNotFoundException()

[Section titled “new DaytonaGitRepoNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitreponotfoundexception-2)

```
public DaytonaGitRepoNotFoundException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagitreponotfoundexception-3) new DaytonaGitRepoNotFoundException()

[Section titled “new DaytonaGitRepoNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagitreponotfoundexception-3)

```
public DaytonaGitRepoNotFoundException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonagoneexception) DaytonaGoneException

[Section titled “DaytonaGoneException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonagoneexception)

Raised for HTTP 410 — the target resource is permanently gone.

**Properties**:

- `STATUS_CODE` _int_ -

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-20) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-20)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagoneexception) new DaytonaGoneException()

[Section titled “new DaytonaGoneException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagoneexception)

```
public DaytonaGoneException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagoneexception-1) new DaytonaGoneException()

[Section titled “new DaytonaGoneException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagoneexception-1)

```
public DaytonaGoneException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagoneexception-2) new DaytonaGoneException()

[Section titled “new DaytonaGoneException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagoneexception-2)

```
public DaytonaGoneException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonagoneexception-3) new DaytonaGoneException()

[Section titled “new DaytonaGoneException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonagoneexception-3)

```
public DaytonaGoneException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonainternalserverexception) DaytonaInternalServerException

[Section titled “DaytonaInternalServerException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonainternalserverexception)

Raised for HTTP 500 — server-side bug or unhandled condition.

**Properties**:

- `STATUS_CODE` _int_ -

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-21) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-21)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonainternalserverexception) new DaytonaInternalServerException()

[Section titled “new DaytonaInternalServerException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonainternalserverexception)

```
public DaytonaInternalServerException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonainternalserverexception-1) new DaytonaInternalServerException()

[Section titled “new DaytonaInternalServerException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonainternalserverexception-1)

```
public DaytonaInternalServerException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonainternalserverexception-2) new DaytonaInternalServerException()

[Section titled “new DaytonaInternalServerException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonainternalserverexception-2)

```
public DaytonaInternalServerException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonainternalserverexception-3) new DaytonaInternalServerException()

[Section titled “new DaytonaInternalServerException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonainternalserverexception-3)

```
public DaytonaInternalServerException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonainvalidfilepathexception) DaytonaInvalidFilePathException

[Section titled “DaytonaInvalidFilePathException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonainvalidfilepathexception)

Supplied file path was rejected by the daemon (code `INVALID_FILE_PATH`, HTTP 400).

Subclass of `DaytonaBadRequestException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-22) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-22)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonainvalidfilepathexception) new DaytonaInvalidFilePathException()

[Section titled “new DaytonaInvalidFilePathException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonainvalidfilepathexception)

```
public DaytonaInvalidFilePathException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonainvalidfilepathexception-1) new DaytonaInvalidFilePathException()

[Section titled “new DaytonaInvalidFilePathException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonainvalidfilepathexception-1)

```
public DaytonaInvalidFilePathException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonainvalidfilepathexception-2) new DaytonaInvalidFilePathException()

[Section titled “new DaytonaInvalidFilePathException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonainvalidfilepathexception-2)

```
public DaytonaInvalidFilePathException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonainvalidfilepathexception-3) new DaytonaInvalidFilePathException()

[Section titled “new DaytonaInvalidFilePathException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonainvalidfilepathexception-3)

```
public DaytonaInvalidFilePathException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonalspservernotinitializedexception) DaytonaLspServerNotInitializedException

[Section titled “DaytonaLspServerNotInitializedException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonalspservernotinitializedexception)

LSP server must be started via /lsp/start first.

Subclass of `DaytonaBadRequestException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-23) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-23)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonalspservernotinitializedexception) new DaytonaLspServerNotInitializedException()

[Section titled “new DaytonaLspServerNotInitializedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonalspservernotinitializedexception)

```
public DaytonaLspServerNotInitializedException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonalspservernotinitializedexception-1) new DaytonaLspServerNotInitializedException()

[Section titled “new DaytonaLspServerNotInitializedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonalspservernotinitializedexception-1)

```
public DaytonaLspServerNotInitializedException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonalspservernotinitializedexception-2) new DaytonaLspServerNotInitializedException()

[Section titled “new DaytonaLspServerNotInitializedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonalspservernotinitializedexception-2)

```
public DaytonaLspServerNotInitializedException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonalspservernotinitializedexception-3) new DaytonaLspServerNotInitializedException()

[Section titled “new DaytonaLspServerNotInitializedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonalspservernotinitializedexception-3)

```
public DaytonaLspServerNotInitializedException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonanotfoundexception) DaytonaNotFoundException

[Section titled “DaytonaNotFoundException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonanotfoundexception)

Raised when a requested resource does not exist (HTTP 404).

**Properties**:

- `STATUS_CODE` _int_ \- HTTP status code carried by every instance of this class.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-24) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-24)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonanotfoundexception) new DaytonaNotFoundException()

[Section titled “new DaytonaNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonanotfoundexception)

```
public DaytonaNotFoundException(String message)
```

Creates a not-found exception.

**Parameters**:

- `message` _String_ \- error description from the API

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonanotfoundexception-1) new DaytonaNotFoundException()

[Section titled “new DaytonaNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonanotfoundexception-1)

```
public DaytonaNotFoundException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ \- error description from the API
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonanotfoundexception-2) new DaytonaNotFoundException()

[Section titled “new DaytonaNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonanotfoundexception-2)

```
public DaytonaNotFoundException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonanotfoundexception-3) new DaytonaNotFoundException()

[Section titled “new DaytonaNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonanotfoundexception-3)

```
public DaytonaNotFoundException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaprocessexecutiontimeoutexception) DaytonaProcessExecutionTimeoutException

[Section titled “DaytonaProcessExecutionTimeoutException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaprocessexecutiontimeoutexception)

A process exceeded its configured execution timeout.

Subclass of `DaytonaTimeoutException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-25) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-25)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessexecutiontimeoutexception) new DaytonaProcessExecutionTimeoutException()

[Section titled “new DaytonaProcessExecutionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessexecutiontimeoutexception)

```
public DaytonaProcessExecutionTimeoutException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessexecutiontimeoutexception-1) new DaytonaProcessExecutionTimeoutException()

[Section titled “new DaytonaProcessExecutionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessexecutiontimeoutexception-1)

```
public DaytonaProcessExecutionTimeoutException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessexecutiontimeoutexception-2) new DaytonaProcessExecutionTimeoutException()

[Section titled “new DaytonaProcessExecutionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessexecutiontimeoutexception-2)

```
public DaytonaProcessExecutionTimeoutException(int statusCode, String message, String code, String source)
```

**Parameters**:

- `statusCode` _int_ -
- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessexecutiontimeoutexception-3) new DaytonaProcessExecutionTimeoutException()

[Section titled “new DaytonaProcessExecutionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessexecutiontimeoutexception-3)

```
public DaytonaProcessExecutionTimeoutException(int statusCode, String message, Throwable cause, String code, String source)
```

**Parameters**:

- `statusCode` _int_ -
- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessexecutiontimeoutexception-4) new DaytonaProcessExecutionTimeoutException()

[Section titled “new DaytonaProcessExecutionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessexecutiontimeoutexception-4)

```
public DaytonaProcessExecutionTimeoutException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessexecutiontimeoutexception-5) new DaytonaProcessExecutionTimeoutException()

[Section titled “new DaytonaProcessExecutionTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessexecutiontimeoutexception-5)

```
public DaytonaProcessExecutionTimeoutException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaprocessnotfoundexception) DaytonaProcessNotFoundException

[Section titled “DaytonaProcessNotFoundException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaprocessnotfoundexception)

The requested process is not running.

Subclass of `DaytonaNotFoundException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-26) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-26)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessnotfoundexception) new DaytonaProcessNotFoundException()

[Section titled “new DaytonaProcessNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessnotfoundexception)

```
public DaytonaProcessNotFoundException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessnotfoundexception-1) new DaytonaProcessNotFoundException()

[Section titled “new DaytonaProcessNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessnotfoundexception-1)

```
public DaytonaProcessNotFoundException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessnotfoundexception-2) new DaytonaProcessNotFoundException()

[Section titled “new DaytonaProcessNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessnotfoundexception-2)

```
public DaytonaProcessNotFoundException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaprocessnotfoundexception-3) new DaytonaProcessNotFoundException()

[Section titled “new DaytonaProcessNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaprocessnotfoundexception-3)

```
public DaytonaProcessNotFoundException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaratelimitexception) DaytonaRateLimitException

[Section titled “DaytonaRateLimitException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaratelimitexception)

Raised when API rate limits are exceeded (HTTP 429).

**Properties**:

- `STATUS_CODE` _int_ \- HTTP status code carried by every instance of this class.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-27) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-27)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaratelimitexception) new DaytonaRateLimitException()

[Section titled “new DaytonaRateLimitException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaratelimitexception)

```
public DaytonaRateLimitException(String message)
```

Creates a rate-limit exception.

**Parameters**:

- `message` _String_ \- error description from the API

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaratelimitexception-1) new DaytonaRateLimitException()

[Section titled “new DaytonaRateLimitException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaratelimitexception-1)

```
public DaytonaRateLimitException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ \- error description from the API
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaratelimitexception-2) new DaytonaRateLimitException()

[Section titled “new DaytonaRateLimitException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaratelimitexception-2)

```
public DaytonaRateLimitException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaratelimitexception-3) new DaytonaRateLimitException()

[Section titled “new DaytonaRateLimitException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaratelimitexception-3)

```
public DaytonaRateLimitException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonarecordingffmpegnotfoundexception) DaytonaRecordingFfmpegNotFoundException

[Section titled “DaytonaRecordingFfmpegNotFoundException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonarecordingffmpegnotfoundexception)

ffmpeg binary is not installed; required for recording.

Subclass of `DaytonaServiceUnavailableException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-28) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-28)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonarecordingffmpegnotfoundexception) new DaytonaRecordingFfmpegNotFoundException()

[Section titled “new DaytonaRecordingFfmpegNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonarecordingffmpegnotfoundexception)

```
public DaytonaRecordingFfmpegNotFoundException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonarecordingffmpegnotfoundexception-1) new DaytonaRecordingFfmpegNotFoundException()

[Section titled “new DaytonaRecordingFfmpegNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonarecordingffmpegnotfoundexception-1)

```
public DaytonaRecordingFfmpegNotFoundException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonarecordingffmpegnotfoundexception-2) new DaytonaRecordingFfmpegNotFoundException()

[Section titled “new DaytonaRecordingFfmpegNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonarecordingffmpegnotfoundexception-2)

```
public DaytonaRecordingFfmpegNotFoundException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonarecordingffmpegnotfoundexception-3) new DaytonaRecordingFfmpegNotFoundException()

[Section titled “new DaytonaRecordingFfmpegNotFoundException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonarecordingffmpegnotfoundexception-3)

```
public DaytonaRecordingFfmpegNotFoundException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonarecordingstillactiveexception) DaytonaRecordingStillActiveException

[Section titled “DaytonaRecordingStillActiveException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonarecordingstillactiveexception)

The recording is still running; stop it first.

Subclass of `DaytonaConflictException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-29) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-29)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonarecordingstillactiveexception) new DaytonaRecordingStillActiveException()

[Section titled “new DaytonaRecordingStillActiveException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonarecordingstillactiveexception)

```
public DaytonaRecordingStillActiveException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonarecordingstillactiveexception-1) new DaytonaRecordingStillActiveException()

[Section titled “new DaytonaRecordingStillActiveException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonarecordingstillactiveexception-1)

```
public DaytonaRecordingStillActiveException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonarecordingstillactiveexception-2) new DaytonaRecordingStillActiveException()

[Section titled “new DaytonaRecordingStillActiveException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonarecordingstillactiveexception-2)

```
public DaytonaRecordingStillActiveException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonarecordingstillactiveexception-3) new DaytonaRecordingStillActiveException()

[Section titled “new DaytonaRecordingStillActiveException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonarecordingstillactiveexception-3)

```
public DaytonaRecordingStillActiveException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaserverexception) DaytonaServerException

[Section titled “DaytonaServerException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaserverexception)

Raised for unexpected server-side failures (HTTP 5xx).

These are typically transient and safe to retry with exponential backoff.

```
try {

daytona.sandbox().create();

} catch (DaytonaServerException e) {

System.err.println("Server error (status " + e.getStatusCode() + "), retry later");

}
```

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-30) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-30)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaserverexception) new DaytonaServerException()

[Section titled “new DaytonaServerException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaserverexception)

```
public DaytonaServerException(int statusCode, String message)
```

Creates a server exception.

**Parameters**:

- `statusCode` _int_ \- HTTP status code (typically 5xx)
- `message` _String_ \- error description from the API

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaserverexception-1) new DaytonaServerException()

[Section titled “new DaytonaServerException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaserverexception-1)

```
public DaytonaServerException(int statusCode, String message, Throwable cause)
```

**Parameters**:

- `statusCode` _int_ \- HTTP status code (typically 5xx)
- `message` _String_ \- error description from the API
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaserverexception-2) new DaytonaServerException()

[Section titled “new DaytonaServerException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaserverexception-2)

```
public DaytonaServerException(int statusCode, String message, String code, String source)
```

**Parameters**:

- `statusCode` _int_ -
- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaserverexception-3) new DaytonaServerException()

[Section titled “new DaytonaServerException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaserverexception-3)

```
public DaytonaServerException(int statusCode, String message, Throwable cause, String code, String source)
```

**Parameters**:

- `statusCode` _int_ -
- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaserviceunavailableexception) DaytonaServiceUnavailableException

[Section titled “DaytonaServiceUnavailableException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaserviceunavailableexception)

Raised for HTTP 503 — the service is temporarily refusing traffic.

**Properties**:

- `STATUS_CODE` _int_ -

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-31) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-31)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaserviceunavailableexception) new DaytonaServiceUnavailableException()

[Section titled “new DaytonaServiceUnavailableException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaserviceunavailableexception)

```
public DaytonaServiceUnavailableException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaserviceunavailableexception-1) new DaytonaServiceUnavailableException()

[Section titled “new DaytonaServiceUnavailableException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaserviceunavailableexception-1)

```
public DaytonaServiceUnavailableException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaserviceunavailableexception-2) new DaytonaServiceUnavailableException()

[Section titled “new DaytonaServiceUnavailableException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaserviceunavailableexception-2)

```
public DaytonaServiceUnavailableException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaserviceunavailableexception-3) new DaytonaServiceUnavailableException()

[Section titled “new DaytonaServiceUnavailableException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaserviceunavailableexception-3)

```
public DaytonaServiceUnavailableException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonasessionendedexception) DaytonaSessionEndedException

[Section titled “DaytonaSessionEndedException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonasessionendedexception)

The shell session has ended.

Subclass of `DaytonaGoneException`.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-32) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-32)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonasessionendedexception) new DaytonaSessionEndedException()

[Section titled “new DaytonaSessionEndedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonasessionendedexception)

```
public DaytonaSessionEndedException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonasessionendedexception-1) new DaytonaSessionEndedException()

[Section titled “new DaytonaSessionEndedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonasessionendedexception-1)

```
public DaytonaSessionEndedException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonasessionendedexception-2) new DaytonaSessionEndedException()

[Section titled “new DaytonaSessionEndedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonasessionendedexception-2)

```
public DaytonaSessionEndedException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonasessionendedexception-3) new DaytonaSessionEndedException()

[Section titled “new DaytonaSessionEndedException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonasessionendedexception-3)

```
public DaytonaSessionEndedException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonatimeoutexception) DaytonaTimeoutException

[Section titled “DaytonaTimeoutException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonatimeoutexception)

Raised when an SDK operation times out.

Client-side transport timeouts default to HTTP 408, but mapped HTTP 504
(or any server-supplied timeout status) is preserved when available.

**Properties**:

- `STATUS_CODE` _int_ -

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-33) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-33)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonatimeoutexception) new DaytonaTimeoutException()

[Section titled “new DaytonaTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonatimeoutexception)

```
public DaytonaTimeoutException(String message, Throwable cause)
```

Creates a timeout exception with a cause.

**Parameters**:

- `message` _String_ \- timeout description
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonatimeoutexception-1) new DaytonaTimeoutException()

[Section titled “new DaytonaTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonatimeoutexception-1)

```
public DaytonaTimeoutException(String message)
```

Creates a timeout exception.

**Parameters**:

- `message` _String_ \- timeout description

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonatimeoutexception-2) new DaytonaTimeoutException()

[Section titled “new DaytonaTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonatimeoutexception-2)

```
public DaytonaTimeoutException(int statusCode, String message, String code, String source)
```

**Parameters**:

- `statusCode` _int_ -
- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonatimeoutexception-3) new DaytonaTimeoutException()

[Section titled “new DaytonaTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonatimeoutexception-3)

```
public DaytonaTimeoutException(int statusCode, String message, Throwable cause, String code, String source)
```

**Parameters**:

- `statusCode` _int_ -
- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonatimeoutexception-4) new DaytonaTimeoutException()

[Section titled “new DaytonaTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonatimeoutexception-4)

```
public DaytonaTimeoutException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonatimeoutexception-5) new DaytonaTimeoutException()

[Section titled “new DaytonaTimeoutException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonatimeoutexception-5)

```
public DaytonaTimeoutException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonaunprocessableentityexception) DaytonaUnprocessableEntityException

[Section titled “DaytonaUnprocessableEntityException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonaunprocessableentityexception)

Raised for HTTP 422 — the request is well-formed but semantically invalid
(e.g. unsupported resource class, invalid configuration values).

```
try {

daytona.sandbox().create(params);

} catch (DaytonaUnprocessableEntityException e) {

System.err.println("Unprocessable entity: " + e.getMessage());

}
```

**Properties**:

- `STATUS_CODE` _int_ \- HTTP status code carried by every instance of this class.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-34) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-34)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaunprocessableentityexception) new DaytonaUnprocessableEntityException()

[Section titled “new DaytonaUnprocessableEntityException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaunprocessableentityexception)

```
public DaytonaUnprocessableEntityException(String message)
```

**Parameters**:

- `message` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaunprocessableentityexception-1) new DaytonaUnprocessableEntityException()

[Section titled “new DaytonaUnprocessableEntityException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaunprocessableentityexception-1)

```
public DaytonaUnprocessableEntityException(String message, Throwable cause)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaunprocessableentityexception-2) new DaytonaUnprocessableEntityException()

[Section titled “new DaytonaUnprocessableEntityException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaunprocessableentityexception-2)

```
public DaytonaUnprocessableEntityException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonaunprocessableentityexception-3) new DaytonaUnprocessableEntityException()

[Section titled “new DaytonaUnprocessableEntityException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonaunprocessableentityexception-3)

```
public DaytonaUnprocessableEntityException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -

## [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#daytonavalidationexception) DaytonaValidationException

[Section titled “DaytonaValidationException”](https://www.daytona.io/docs/en/java-sdk/errors/#daytonavalidationexception)

Raised for semantic validation failures (HTTP 422).

The mapper throws this subclass for 422 responses so that pre-existing
`catch (DaytonaValidationException e)` blocks keep matching, while
`catch (DaytonaUnprocessableEntityException e)` also matches via the
parent class.

Exists for backward compatibility only. Deleting this class (and
switching the 422 case in `ExceptionMapper` back to the parent) is
the whole removal.

**Deprecated**: Use `DaytonaUnprocessableEntityException` instead.

### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#constructors-35) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/errors/#constructors-35)

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonavalidationexception) new DaytonaValidationException()

[Section titled “new DaytonaValidationException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonavalidationexception)

```
public DaytonaValidationException(String message)
```

Creates a validation exception.

**Parameters**:

- `message` _String_ \- error description

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonavalidationexception-1) new DaytonaValidationException()

[Section titled “new DaytonaValidationException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonavalidationexception-1)

```
public DaytonaValidationException(String message, Throwable cause)
```

Creates a validation exception with a cause.

**Parameters**:

- `message` _String_ \- error description
- `cause` _Throwable_ \- root cause

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonavalidationexception-2) new DaytonaValidationException()

[Section titled “new DaytonaValidationException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonavalidationexception-2)

```
public DaytonaValidationException(String message, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `code` _String_ -
- `source` _String_ -

#### [\#](https://www.daytona.io/docs/en/java-sdk/errors/\#new-daytonavalidationexception-3) new DaytonaValidationException()

[Section titled “new DaytonaValidationException()”](https://www.daytona.io/docs/en/java-sdk/errors/#new-daytonavalidationexception-3)

```
public DaytonaValidationException(String message, Throwable cause, String code, String source)
```

**Parameters**:

- `message` _String_ -
- `cause` _Throwable_ -
- `code` _String_ -
- `source` _String_ -