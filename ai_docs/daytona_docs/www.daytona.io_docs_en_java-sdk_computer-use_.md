---
url: "https://www.daytona.io/docs/en/java-sdk/computer-use/"
title: "ComputerUse | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/computer-use/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/computer-use.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#computeruse) ComputerUse

[Section titled “ComputerUse”](https://www.daytona.io/docs/en/java-sdk/computer-use/#computeruse)

Desktop automation operations for a Sandbox.

Provides a Java facade for computer-use features including desktop session management,
screenshots, mouse and keyboard automation, display/window inspection, and screen recording.

### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/computer-use/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#start) start()

[Section titled “start()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#start)

```
public ComputerUseStartResponse start()
```

Starts the computer-use desktop stack (VNC/noVNC and related processes).

**Returns**:

- `ComputerUseStartResponse` \- start response containing process status details

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#stop) stop()

[Section titled “stop()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#stop)

```
public ComputerUseStopResponse stop()
```

Stops all computer-use desktop processes.

**Returns**:

- `ComputerUseStopResponse` \- stop response containing process status details

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#getstatus) getStatus()

[Section titled “getStatus()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#getstatus)

```
public ComputerUseStatusResponse getStatus()
```

Returns current computer-use status.

**Returns**:

- `ComputerUseStatusResponse` \- overall computer-use status

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#getaccessibilitytree) getAccessibilityTree()

[Section titled “getAccessibilityTree()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#getaccessibilitytree)

```
public AccessibilityTreeResponse getAccessibilityTree()
```

Fetches the focused AT-SPI accessibility tree.

**Returns**:

- `AccessibilityTreeResponse` \- accessibility tree response

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#getaccessibilitytree-1) getAccessibilityTree()

[Section titled “getAccessibilityTree()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#getaccessibilitytree-1)

```
public AccessibilityTreeResponse getAccessibilityTree(String scope, Integer pid, Integer maxDepth)
```

Fetches an AT-SPI accessibility tree.

**Parameters**:

- `scope` _String_ \- scope to inspect (`focused`, `pid`, or `all`)
- `pid` _Integer_ \- process ID when `scope` is `pid`
- `maxDepth` _Integer_ \- max tree depth (`0` for root only)

**Returns**:

- `AccessibilityTreeResponse` \- accessibility tree response

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#findaccessibilitynodes) findAccessibilityNodes()

[Section titled “findAccessibilityNodes()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#findaccessibilitynodes)

```
public AccessibilityNodesResponse findAccessibilityNodes()
```

Finds AT-SPI accessibility nodes without filters.

**Returns**:

- `AccessibilityNodesResponse` \- matching accessibility nodes

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#findaccessibilitynodes-1) findAccessibilityNodes()

[Section titled “findAccessibilityNodes()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#findaccessibilitynodes-1)

```
public AccessibilityNodesResponse findAccessibilityNodes(FindAccessibilityNodesRequest request)
```

Finds AT-SPI accessibility nodes using a generated toolbox request.

**Parameters**:

- `request` _FindAccessibilityNodesRequest_ \- generated accessibility find request

**Returns**:

- `AccessibilityNodesResponse` \- matching accessibility nodes

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#focusaccessibilitynode) focusAccessibilityNode()

[Section titled “focusAccessibilityNode()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#focusaccessibilitynode)

```
public void focusAccessibilityNode(String id)
```

Focuses an AT-SPI accessibility node.

**Parameters**:

- `id` _String_ \- accessibility node ID

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#invokeaccessibilitynode) invokeAccessibilityNode()

[Section titled “invokeAccessibilityNode()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#invokeaccessibilitynode)

```
public void invokeAccessibilityNode(String id)
```

Invokes an AT-SPI accessibility node’s primary action.

**Parameters**:

- `id` _String_ \- accessibility node ID

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#invokeaccessibilitynode-1) invokeAccessibilityNode()

[Section titled “invokeAccessibilityNode()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#invokeaccessibilitynode-1)

```
public void invokeAccessibilityNode(String id, String action)
```

Invokes an AT-SPI accessibility node action.

**Parameters**:

- `id` _String_ \- accessibility node ID
- `action` _String_ \- action name, or `null` for the primary action

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#setaccessibilitynodevalue) setAccessibilityNodeValue()

[Section titled “setAccessibilityNodeValue()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#setaccessibilitynodevalue)

```
public void setAccessibilityNodeValue(String id, String value)
```

Sets an AT-SPI accessibility node value.

**Parameters**:

- `id` _String_ \- accessibility node ID
- `value` _String_ \- value to write

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#takescreenshot) takeScreenshot()

[Section titled “takeScreenshot()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#takescreenshot)

```
public ScreenshotResponse takeScreenshot()
```

Captures a full-screen screenshot without cursor.

**Returns**:

- `ScreenshotResponse` \- screenshot payload (base64 image and metadata)

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#takescreenshot-1) takeScreenshot()

[Section titled “takeScreenshot()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#takescreenshot-1)

```
public ScreenshotResponse takeScreenshot(boolean showCursor)
```

Captures a full-screen screenshot.

**Parameters**:

- `showCursor` _boolean_ \- whether to render cursor in the screenshot

**Returns**:

- `ScreenshotResponse` \- screenshot payload (base64 image and metadata)

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#takeregionscreenshot) takeRegionScreenshot()

[Section titled “takeRegionScreenshot()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#takeregionscreenshot)

```
public ScreenshotResponse takeRegionScreenshot(int x, int y, int width, int height)
```

Captures a screenshot of a rectangular region without cursor.

**Parameters**:

- `x` _int_ \- region top-left X coordinate
- `y` _int_ \- region top-left Y coordinate
- `width` _int_ \- region width in pixels
- `height` _int_ \- region height in pixels

**Returns**:

- `ScreenshotResponse` \- region screenshot payload

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#takecompressedscreenshot) takeCompressedScreenshot()

[Section titled “takeCompressedScreenshot()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#takecompressedscreenshot)

```
public ScreenshotResponse takeCompressedScreenshot(String format, int quality, double scale)
```

Captures a compressed full-screen screenshot.

**Parameters**:

- `format` _String_ \- output image format (for example: `png`, `jpeg`, `webp`)
- `quality` _int_ \- compression quality (typically 1-100, format dependent)
- `scale` _double_ \- screenshot scale factor (for example: `0.5` for 50%)

**Returns**:

- `ScreenshotResponse` \- compressed screenshot payload

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#click) click()

[Section titled “click()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#click)

```
public MouseClickResponse click(int x, int y)
```

Performs a left mouse click at the given coordinates.

**Parameters**:

- `x` _int_ \- target X coordinate
- `y` _int_ \- target Y coordinate

**Returns**:

- `MouseClickResponse` \- click response with resulting cursor position

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#click-1) click()

[Section titled “click()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#click-1)

```
public MouseClickResponse click(int x, int y, String button)
```

Performs a mouse click at the given coordinates with a specific button.

**Parameters**:

- `x` _int_ \- target X coordinate
- `y` _int_ \- target Y coordinate
- `button` _String_ \- button type (`left`, `right`, `middle`)

**Returns**:

- `MouseClickResponse` \- click response with resulting cursor position

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#doubleclick) doubleClick()

[Section titled “doubleClick()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#doubleclick)

```
public MouseClickResponse doubleClick(int x, int y)
```

Performs a double left-click at the given coordinates.

**Parameters**:

- `x` _int_ \- target X coordinate
- `y` _int_ \- target Y coordinate

**Returns**:

- `MouseClickResponse` \- click response with resulting cursor position

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#movemouse) moveMouse()

[Section titled “moveMouse()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#movemouse)

```
public MousePositionResponse moveMouse(int x, int y)
```

Moves the mouse cursor to the given coordinates.

**Parameters**:

- `x` _int_ \- target X coordinate
- `y` _int_ \- target Y coordinate

**Returns**:

- `MousePositionResponse` \- new mouse position

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#getmouseposition) getMousePosition()

[Section titled “getMousePosition()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#getmouseposition)

```
public MousePositionResponse getMousePosition()
```

Returns current mouse position.

**Returns**:

- `MousePositionResponse` \- current mouse cursor coordinates

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#drag) drag()

[Section titled “drag()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#drag)

```
public MouseDragResponse drag(int startX, int startY, int endX, int endY)
```

Drags the mouse from one point to another using the left button.

**Parameters**:

- `startX` _int_ \- drag start X coordinate
- `startY` _int_ \- drag start Y coordinate
- `endX` _int_ \- drag end X coordinate
- `endY` _int_ \- drag end Y coordinate

**Returns**:

- `MouseDragResponse` \- drag response with resulting cursor position

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#scroll) scroll()

[Section titled “scroll()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#scroll)

```
public ScrollResponse scroll(int x, int y, int deltaX, int deltaY)
```

Scrolls at the given coordinates.

The current toolbox API supports directional scrolling (`up`/`down`) with an
amount. This method maps `deltaY` to vertical scroll direction and magnitude.
If `deltaY` is `0`, `deltaX` is used as a fallback.

**Parameters**:

- `x` _int_ \- anchor X coordinate
- `y` _int_ \- anchor Y coordinate
- `deltaX` _int_ \- horizontal delta (used only when `deltaY == 0`)
- `deltaY` _int_ \- vertical delta

**Returns**:

- `ScrollResponse` \- scroll response indicating operation success

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#typetext) typeText()

[Section titled “typeText()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#typetext)

```
public void typeText(String text)
```

Types text using keyboard automation.

**Parameters**:

- `text` _String_ \- text to type

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#presskey) pressKey()

[Section titled “pressKey()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#presskey)

```
public void pressKey(String key)
```

Presses a single key.

**Parameters**:

- `key` _String_ \- key to press. Canonical names include `enter`, `escape`, `tab`, letters, digits, unshifted punctuation, function keys, and grammar-safe numpad names such as `num_plus`. Named keys are case-insensitive, and common aliases such as `Return` and `Escape` are normalized.

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#presshotkey) pressHotkey()

[Section titled “pressHotkey()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#presshotkey)

```
public void pressHotkey(String... keys)
```

Presses a key combination as a hotkey sequence.

Keys are joined with `+` before being sent (for example,
`pressHotkey("ctrl", "shift", "t") -> "ctrl+shift+t"`). The resulting
value is a single atomic chord and uses the same normalized key contract as
`#pressKey(String)`.

**Parameters**:

- `keys` _String…_ \- hotkey parts to combine

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#getdisplayinfo) getDisplayInfo()

[Section titled “getDisplayInfo()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#getdisplayinfo)

```
public DisplayInfoResponse getDisplayInfo()
```

Returns display configuration information.

**Returns**:

- `DisplayInfoResponse` \- display information including available displays and their geometry

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#getwindows) getWindows()

[Section titled “getWindows()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#getwindows)

```
public WindowsResponse getWindows()
```

Returns currently open windows.

**Returns**:

- `WindowsResponse` \- window list and metadata

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#startrecording) startRecording()

[Section titled “startRecording()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#startrecording)

```
public Recording startRecording()
```

Starts a recording with default options.

**Returns**:

- `Recording` \- newly started recording metadata

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#startrecording-1) startRecording()

[Section titled “startRecording()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#startrecording-1)

```
public Recording startRecording(String label)
```

Starts a recording with an optional label.

**Parameters**:

- `label` _String_ \- optional recording label

**Returns**:

- `Recording` \- newly started recording metadata

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#stoprecording) stopRecording()

[Section titled “stopRecording()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#stoprecording)

```
public Recording stopRecording(String id)
```

Stops an active recording.

**Parameters**:

- `id` _String_ \- recording identifier

**Returns**:

- `Recording` \- finalized recording metadata

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#listrecordings) listRecordings()

[Section titled “listRecordings()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#listrecordings)

```
public ListRecordingsResponse listRecordings()
```

Lists all recordings for the current sandbox session.

**Returns**:

- `ListRecordingsResponse` \- recordings list response

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#getrecording) getRecording()

[Section titled “getRecording()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#getrecording)

```
public Recording getRecording(String id)
```

Returns metadata for a specific recording.

**Parameters**:

- `id` _String_ \- recording identifier

**Returns**:

- `Recording` \- recording details

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#downloadrecording) downloadRecording()

[Section titled “downloadRecording()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#downloadrecording)

```
public File downloadRecording(String id)
```

Downloads a recording file.

**Parameters**:

- `id` _String_ \- recording identifier

**Returns**:

- `File` \- downloaded temporary/local file handle returned by the API client

#### [\#](https://www.daytona.io/docs/en/java-sdk/computer-use/\#deleterecording) deleteRecording()

[Section titled “deleteRecording()”](https://www.daytona.io/docs/en/java-sdk/computer-use/#deleterecording)

```
public void deleteRecording(String id)
```

Deletes a recording.

**Parameters**:

- `id` _String_ \- recording identifier