---
url: "https://www.daytona.io/docs/en/regions/"
title: "Regions | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/regions/#_top)

# Regions

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/regions.md)Open

Every Daytona sandbox runs in a **region**: a geographic or logical grouping of compute infrastructure. When creating a sandbox, you can target a specific region, and Daytona schedules the workload on available capacity within that region.

## [\#](https://www.daytona.io/docs/en/regions/\#shared-regions) Shared regions

[Section titled “Shared regions”](https://www.daytona.io/docs/en/regions/#shared-regions)

Regions managed by Daytona and available to all organizations:

| **Region** | **Target** |
| --- | --- |
| United States | **`us`** |
| Europe | **`eu`** |

- [Python](https://www.daytona.io/docs/en/regions/#tab-panel-1041)
- [TypeScript](https://www.daytona.io/docs/en/regions/#tab-panel-1042)
- [Ruby](https://www.daytona.io/docs/en/regions/#tab-panel-1043)
- [Go](https://www.daytona.io/docs/en/regions/#tab-panel-1044)
- [Java](https://www.daytona.io/docs/en/regions/#tab-panel-1045)
- [API](https://www.daytona.io/docs/en/regions/#tab-panel-1046)

```
from daytona import Daytona, DaytonaConfig

# Configure Daytona to use the US region

config = DaytonaConfig(

    target="us"

)

# Initialize the Daytona client with the specified configuration

daytona = Daytona(config)

# Create a sandbox in the US region

sandbox = daytona.create()
```

```
import { Daytona } from '@daytona/sdk'

// Configure Daytona to use the US region

const daytona = new Daytona({

  target: 'us',

})

// Create a sandbox in the US region

const sandbox = await daytona.create()
```

```
require 'daytona'

# Configure Daytona to use the US region

config = Daytona::Config.new(

  target: 'us'

)

# Initialize the Daytona client with the specified configuration

daytona = Daytona::Daytona.new(config)

# Create a sandbox in the US region

sandbox = daytona.create
```

```
package main

import (

  "context"

  "github.com/daytona/clients/sdk-go/pkg/daytona"

  "github.com/daytona/clients/sdk-go/pkg/types"

)

func main() {

  // Configure Daytona to use the US region

  client, _ := daytona.NewClientWithConfig(&types.DaytonaConfig{

    Target: "us",

  })

  // Create a sandbox in the US region

  ctx := context.Background()

  _, _ = client.Create(ctx, nil)

}
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.DaytonaConfig;

import io.daytona.sdk.Sandbox;

public class App {

    public static void main(String[] args) {

        // Configure Daytona to use the US region

        DaytonaConfig config = new DaytonaConfig.Builder()

                .apiKey(System.getenv("DAYTONA_API_KEY"))

                .target("us")

                .build();

        try (Daytona daytona = new Daytona(config)) {

            // Create a sandbox in the US region

            Sandbox sandbox = daytona.create();

        }

    }

}
```

```
# Create a sandbox in the US region

curl 'https://app.daytona.io/api/sandbox' \

  --request POST \

  --header 'Content-Type: application/json' \

  --header 'Authorization: Bearer YOUR_API_KEY' \

  --data '{

  "target": "us"

}'
```

List regions managed by Daytona and available to all organizations:

- [API](https://www.daytona.io/docs/en/regions/#tab-panel-1040)

```
curl 'https://app.daytona.io/api/shared-regions' \

  --header 'Authorization: Bearer YOUR_API_KEY'
```

## [\#](https://www.daytona.io/docs/en/regions/\#dedicated-regions) Dedicated regions

[Section titled “Dedicated regions”](https://www.daytona.io/docs/en/regions/#dedicated-regions)

Dedicated regions are managed by Daytona and provisioned exclusively for an organization. The infrastructure is not shared with other organizations, and Daytona operates it as a managed service.

## [\#](https://www.daytona.io/docs/en/regions/\#custom-regions) Custom regions

[Section titled “Custom regions”](https://www.daytona.io/docs/en/regions/#custom-regions)

Custom regions run on compute that your organization provides and manages. Attach your own machines through [bring your own compute (BYOC)](https://www.daytona.io/docs/en/bring-your-own-compute) to control data locality, compliance, and infrastructure configuration, and scale capacity independently within each region.

Custom regions have no limits on concurrent resource usage: capacity is bounded only by the compute you attach.