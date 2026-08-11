---
url: "https://www.daytona.io/docs/en/typescript-sdk/execute-response/"
title: "ExecuteResponse | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/execute-response/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/execute-response.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/execute-response/\#executeresponse) ExecuteResponse

[Section titled “ExecuteResponse”](https://www.daytona.io/docs/en/typescript-sdk/execute-response/#executeresponse)

Response from the command execution.

**Properties**:

- `artifacts?` _ExecutionArtifacts_ \- Artifacts from the command execution
- `exitCode` _number_ \- The exit code from the command execution
- `result` _string_ \- The output from the command execution

## [\#](https://www.daytona.io/docs/en/typescript-sdk/execute-response/\#executionartifacts) ExecutionArtifacts

[Section titled “ExecutionArtifacts”](https://www.daytona.io/docs/en/typescript-sdk/execute-response/#executionartifacts)

Artifacts from the command execution.

**Properties**:

- `charts?` _Chart\[\]_ \- List of chart metadata from matplotlib
- `stdout` _string_ \- Standard output from the command, same as `result` in `ExecuteResponse`