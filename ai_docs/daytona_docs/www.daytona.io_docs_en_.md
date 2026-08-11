---
url: "https://www.daytona.io/docs/en/"
title: "Documentation · Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/#_top)

# Daytona Documentation

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en.md)Open

Daytona is a secure and elastic infrastructure for running AI-generated code.

Daytona provides **full composable computers** — [sandboxes](https://www.daytona.io/docs/en/sandboxes) — for AI agents with complete isolation, a dedicated kernel, filesystem, network stack, and allocated vCPU, RAM, and disk.

Sandboxes are the core component of the Daytona platform, spinning up in under 90ms from code to execution and running any code in Python, TypeScript, and JavaScript. Built on OCI/Docker compatibility, massive parallelization, and unlimited persistence, sandboxes deliver consistent, predictable environments for agent workflows.

Agents and developers interact with sandboxes programmatically using the SDKs, API, and CLI. Operations span sandbox lifecycle management, filesystem operations, process and code execution, runtime configuration, and more.

Our stateful environment [snapshots](https://www.daytona.io/docs/en/snapshots) enable persistent agent operations across sessions, making Daytona the ideal foundation for AI agent architectures.

## [\#](https://www.daytona.io/docs/en/\#get-started) Get started

[Section titled “Get started”](https://www.daytona.io/docs/en/#get-started)

1. Create an account → [app.daytona.io](https://app.daytona.io/)
2. Get an API key → [app.daytona.io/dashboard/keys](https://app.daytona.io/dashboard/keys)

- [Python](https://www.daytona.io/docs/en/#tab-panel-0)
- [TypeScript](https://www.daytona.io/docs/en/#tab-panel-1)
- [Ruby](https://www.daytona.io/docs/en/#tab-panel-2)
- [Go](https://www.daytona.io/docs/en/#tab-panel-3)
- [Java](https://www.daytona.io/docs/en/#tab-panel-4)
- [API](https://www.daytona.io/docs/en/#tab-panel-5)
- [CLI](https://www.daytona.io/docs/en/#tab-panel-6)

3. Install the Python SDK





```
pip install daytona
```

4. Create a sandbox and run code





```
# Import the Daytona SDK

from daytona import Daytona, DaytonaConfig




# Define the configuration

config = DaytonaConfig(api_key="YOUR_API_KEY") # Replace with your API key




# Initialize the Daytona client

daytona = Daytona(config)




# Create the Sandbox instance

sandbox = daytona.create()




# Run code

response = sandbox.process.code_run('print("Hello World")')

print(response.result)
```


3. Install the TypeScript SDK





```
npm install @daytona/sdk
```

4. Create a sandbox and run code





```
// Import the Daytona SDK

import { Daytona } from '@daytona/sdk'




// Initialize the Daytona client

const daytona = new Daytona({ apiKey: 'YOUR_API_KEY' }) // Replace with your API key




// Create the Sandbox instance

const sandbox = await daytona.create()




// Run code

const response = await sandbox.process.codeRun('print("Hello World")')

console.log(response.result)
```


3. Install the Ruby SDK





```
gem install daytona
```

4. Create a sandbox and run code





```
require 'daytona'




# Initialize the Daytona client

config = Daytona::Config.new(api_key: 'YOUR_API_KEY') # Replace with your API key




# Create the Daytona client

daytona = Daytona::Daytona.new(config)




# Create the Sandbox instance

sandbox = daytona.create




# Run code

response = sandbox.process.code_run(code: 'print("Hello World")')

puts response.result
```


3. Install the Go SDK





```
go get github.com/daytona/clients/sdk-go
```

4. Create a sandbox and run code





```
package main




import (

     "context"

     "fmt"




     "github.com/daytona/clients/sdk-go/pkg/daytona"

     "github.com/daytona/clients/sdk-go/pkg/types"

)




func main() {

     config := &types.DaytonaConfig{

           APIKey: "YOUR_API_KEY", // Replace with your API key

       }

     client, _ := daytona.NewClientWithConfig(config)

     ctx := context.Background()

     sandbox, _ := client.Create(ctx, nil)




     // Run code

     result, _ := sandbox.Process.CodeRun(ctx, `print("Hello World")`)

     fmt.Println(result.Result)

}
```


3. Install the Java SDK



**Gradle**

Add the Daytona SDK dependency to your `build.gradle.kts`:



```
dependencies {

       implementation("io.daytona:sdk-java:0.1.0")

}
```













**Maven**

Add the Daytona SDK dependency to your `pom.xml`:



```
<dependency>

     <groupId>io.daytona</groupId>

     <artifactId>sdk-java</artifactId>

     <version>0.1.0</version>

</dependency>
```

4. Create a sandbox and run code





```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.Sandbox;

import io.daytona.sdk.DaytonaConfig;

import io.daytona.sdk.model.ExecuteResponse;




public class Main {

       public static void main(String[] args) {

           DaytonaConfig config = new DaytonaConfig.Builder()

               .apiKey("YOUR_API_KEY")

               .build();




           try (Daytona daytona = new Daytona(config)) {

               Sandbox sandbox = daytona.create();




               // Run code

               ExecuteResponse response = sandbox.getProcess().codeRun("print(\"Hello World\")");

               System.out.println(response.getResult());

           }

       }

}
```


3. Create a sandbox and run code





```
# Create sandbox

curl https://app.daytona.io/api/sandbox \

     --request POST \

     --header 'Content-Type: application/json' \

     --header 'Authorization: Bearer YOUR_API_KEY' \

     --data '{}'




# Run code

curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/process/code-run' \

     --request POST \

     --header 'Content-Type: application/json' \

     --data '{

     "code": "print(\"Hello World\")"

}'
```


3. [Install the CLI](https://www.daytona.io/docs/en/tools/cli)

4. Create a sandbox and run code





```
daytona create --name hello

daytona exec hello -- python3 -c 'print("Hello World")'
```


## [\#](https://www.daytona.io/docs/en/\#next-steps) Next steps

[Section titled “Next steps”](https://www.daytona.io/docs/en/#next-steps)

Daytona provides core platform resources for managing sandboxes, environments, and storage. Start with the following:

[Sandboxes\\
Isolated runtime environments you can manage programmatically to run code.](https://www.daytona.io/docs/en/sandboxes) [Snapshots\\
Persistent captures of sandbox state you can use to create sandboxes.](https://www.daytona.io/docs/en/snapshots) [Volumes\\
Shared file access across sandboxes.](https://www.daytona.io/docs/en/volumes) [Regions\\
Geographic locations where sandboxes run.](https://www.daytona.io/docs/en/regions)

## [\#](https://www.daytona.io/docs/en/\#references) References

[Section titled “References”](https://www.daytona.io/docs/en/#references)

Daytona provides a comprehensive set of resources for developers and agents to get started and build on the platform. You can find the following resources in the documentation:

- **Daytona SDKs**: [TypeScript](https://www.daytona.io/docs/en/typescript-sdk), [Python](https://www.daytona.io/docs/en/python-sdk), [Ruby](https://www.daytona.io/docs/en/ruby-sdk), [Go](https://www.daytona.io/docs/en/go-sdk), [Java](https://www.daytona.io/docs/en/java-sdk)
- **Daytona APIs**: [Platform](https://www.daytona.io/docs/en/tools/api#daytona) ( [OpenAPI](https://www.daytona.io/docs/openapi.json)), [Toolbox](https://www.daytona.io/docs/en/tools/api#daytona-toolbox) ( [OpenAPI](https://www.daytona.io/docs/toolbox-openapi.json)), [Analytics](https://www.daytona.io/docs/en/tools/api#daytona-analytics) ( [OpenAPI](https://www.daytona.io/docs/analytics-openapi.json))
- **Daytona CLI**: [Mac/Linux/Windows](https://www.daytona.io/docs/en/tools/cli)
- **Daytona LLMs**: [llms.txt](https://www.daytona.io/docs/llms.txt), [llms-full.txt](https://www.daytona.io/docs/llms-full.txt)
- **Daytona Sitemap**: [sitemap-0.xml](https://www.daytona.io/docs/sitemap-0.xml)
- **Daytona Skills**: [agent skills](https://www.daytona.io/docs/en/agent-skills)
- **Daytona Markdown**: suffix pages with **`.md`** (e.g [sandboxes.md](https://www.daytona.io/docs/en/sandboxes.md))