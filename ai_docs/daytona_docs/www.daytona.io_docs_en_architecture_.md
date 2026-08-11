---
url: "https://www.daytona.io/docs/en/architecture/"
title: "Architecture | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/architecture/#_top)

# Architecture

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/architecture.md)Open

Daytona platform is organized into multiple plane components, each serving a specific purpose:

- [Interface plane](https://www.daytona.io/docs/en/architecture/#interface-plane) provides client interfaces for interacting with Daytona
- [Control plane](https://www.daytona.io/docs/en/architecture/#control-plane) orchestrates all sandbox operations
- [Compute plane](https://www.daytona.io/docs/en/architecture/#compute-plane) runs and manages sandbox instances

![Daytona architecture diagram](https://www.daytona.io/docs/_astro/architecture-light.BnM5ncyi.svg)

### [\#](https://www.daytona.io/docs/en/architecture/\#interface-plane) Interface plane

[Section titled “Interface plane”](https://www.daytona.io/docs/en/architecture/#interface-plane)

The interface plane provides client interfaces for users and agents to interact with Daytona. The following components are part of the interface plane and available to all users and agents:

- **SDK**: [Python](https://www.daytona.io/docs/en/python-sdk), [TypeScript](https://www.daytona.io/docs/en/typescript-sdk), [Ruby](https://www.daytona.io/docs/en/ruby-sdk), [Go](https://www.daytona.io/docs/en/go-sdk), and [Java](https://www.daytona.io/docs/en/java-sdk) SDKs for programmatic access
- [CLI](https://www.daytona.io/docs/en/tools/cli): command-line interface for direct sandbox operations
- [Dashboard](https://app.daytona.io/dashboard/): web interface for visual sandbox management and monitoring
- [MCP](https://www.daytona.io/docs/en/mcp): Model Context Protocol server for AI tool integrations
- [SSH](https://www.daytona.io/docs/en/ssh-access): secure shell access to running sandboxes

### [\#](https://www.daytona.io/docs/en/architecture/\#control-plane) Control plane

[Section titled “Control plane”](https://www.daytona.io/docs/en/architecture/#control-plane)

The control plane is the central coordination layer of the Daytona platform. It receives all client requests, manages the full sandbox lifecycle, schedules sandboxes onto runners, and continuously reconciles states across the infrastructure. The control plane includes the following components:

- [API](https://www.daytona.io/docs/en/architecture/#api) handles authentication, sandbox lifecycle management, and resource allocation
- [Proxy](https://www.daytona.io/docs/en/architecture/#proxy) routes external traffic to sandboxes, enabling direct access to services
- [Snapshot builder](https://www.daytona.io/docs/en/architecture/#snapshot-builder) builds and manages sandbox [snapshots](https://www.daytona.io/docs/en/snapshots)
- [Sandbox manager](https://www.daytona.io/docs/en/architecture/#sandbox-manager) handles sandbox lifecycle management and state reconciliation

#### [\#](https://www.daytona.io/docs/en/architecture/\#api) API

[Section titled “API”](https://www.daytona.io/docs/en/architecture/#api)

The API is a NestJS-based RESTful service that serves as the primary entry point for all platform operations, managing authentication, sandbox lifecycle, snapshots, volumes, and resource allocation. The [snapshot builder](https://www.daytona.io/docs/en/architecture/#snapshot-builder) and [sandbox manager](https://www.daytona.io/docs/en/architecture/#sandbox-manager) run as internal processes within the API. The API integrates the following internal services and components:

- **Redis** provides caching, session management, and distributed locking
- **PostgreSQL** serves as the primary persistent store for metadata and configuration
- **Auth0/OIDC provider** authenticates users and services via OpenID Connect. Organizations can also configure [SSO](https://www.daytona.io/docs/en/sso) with their own OIDC identity provider. The API enforces organization-level multi-tenancy, where each sandbox, snapshot, and volume belongs to an organization, and access control is applied at the organization boundary
- **SMTP server** handles email delivery for organization invitations, account notifications, and alert messages
- [Sandbox manager](https://www.daytona.io/docs/en/architecture/#sandbox-manager) schedules sandboxes onto runners, reconciles states, and enforces sandbox lifecycle management policies
- **PostHog** collects platform analytics and usage metrics for monitoring and improvement

To interact with sandboxes from the API, see the [API](https://www.daytona.io/docs/en/tools/api) and [Toolbox API](https://www.daytona.io/docs/en/tools/api#daytona-toolbox) references.

#### [\#](https://www.daytona.io/docs/en/architecture/\#proxy) Proxy

[Section titled “Proxy”](https://www.daytona.io/docs/en/architecture/#proxy)

The proxy is a dedicated HTTP proxy that routes external traffic to the correct sandbox using host-based routing. Each sandbox is reachable at `{port}-{sandboxId}.{proxy-domain}`, where the port maps to a service running inside the sandbox. The proxy resolves the target runner for a given sandbox, injects authentication headers, and forwards the request. It supports both HTTP and WebSocket protocols.

#### [\#](https://www.daytona.io/docs/en/architecture/\#snapshot-builder) Snapshot builder

[Section titled “Snapshot builder”](https://www.daytona.io/docs/en/architecture/#snapshot-builder)

The snapshot builder is part of the API process and orchestrates the creation of sandbox [snapshots](https://www.daytona.io/docs/en/snapshots) from a Dockerfile or a pre-built image from a [container registry](https://www.daytona.io/docs/en/architecture/#container-registry). It coordinates with runners to build or pull images, which are then pushed to an internal snapshot registry that implements the OCI distribution specification.

#### [\#](https://www.daytona.io/docs/en/architecture/\#sandbox-manager) Sandbox manager

[Section titled “Sandbox manager”](https://www.daytona.io/docs/en/architecture/#sandbox-manager)

The sandbox manager is part of the API process and schedules sandboxes onto runners, reconciles states, and enforces [sandbox lifecycle management](https://www.daytona.io/docs/en/sandboxes#sandbox-lifecycle) policies.

### [\#](https://www.daytona.io/docs/en/architecture/\#compute-plane) Compute plane

[Section titled “Compute plane”](https://www.daytona.io/docs/en/architecture/#compute-plane)

The compute plane is the infrastructure layer where sandboxes run. Sandboxes run on [runners](https://www.daytona.io/docs/en/architecture/#sandbox-runners), compute nodes that host multiple sandboxes with dedicated resources and scale horizontally across shared or dedicated [regions](https://www.daytona.io/docs/en/regions). The compute plane consists of the following components:

- [Sandbox runners](https://www.daytona.io/docs/en/architecture/#sandbox-runners) host sandboxes with dedicated resources
- [Sandbox daemon](https://www.daytona.io/docs/en/architecture/#sandbox-daemon) provides code execution and environment access inside each sandbox
- [Snapshot store](https://www.daytona.io/docs/en/architecture/#snapshot-store) stores sandbox snapshot images
- [Volumes](https://www.daytona.io/docs/en/architecture/#volumes) provides persistent storage shared across sandboxes

#### [\#](https://www.daytona.io/docs/en/architecture/\#sandbox-runners) Sandbox runners

[Section titled “Sandbox runners”](https://www.daytona.io/docs/en/architecture/#sandbox-runners)

Runners are compute nodes that power Daytona’s compute plane, providing the underlying infrastructure for running sandbox workloads. Each runner polls the control plane API for jobs and executes sandbox operations: creating, starting, stopping, destroying, resizing, and backing up sandboxes. Runners interact with S3-compatible object storage for snapshot and volume data, and with the internal snapshot registry.

Each sandbox runs as an isolated instance with its own Linux namespaces for processes, network, filesystem mounts, and inter-process communication. Each runner allocates dedicated vCPU, RAM, and disk resources per sandbox.

#### [\#](https://www.daytona.io/docs/en/architecture/\#sandbox-daemon) Sandbox daemon

[Section titled “Sandbox daemon”](https://www.daytona.io/docs/en/architecture/#sandbox-daemon)

The sandbox daemon is a code execution agent that runs inside each sandbox. It exposes the [Toolbox API](https://www.daytona.io/docs/en/tools/api#daytona-toolbox), providing direct access to the sandbox environment: file system and Git operations, process and code execution, computer use, log streaming, and terminal sessions.

#### [\#](https://www.daytona.io/docs/en/architecture/\#snapshot-store) Snapshot store

[Section titled “Snapshot store”](https://www.daytona.io/docs/en/architecture/#snapshot-store)

The snapshot store is an internal OCI-compliant registry that stores sandbox snapshot images using the OCI distribution specification. Runners pull snapshot images from this store when creating new sandboxes. The store uses S3-compatible object storage as its backend.

#### [\#](https://www.daytona.io/docs/en/architecture/\#volumes) Volumes

[Section titled “Volumes”](https://www.daytona.io/docs/en/architecture/#volumes)

[Volumes](https://www.daytona.io/docs/en/volumes) provide persistent storage that can be shared across sandboxes. Each volume is backed by S3-compatible object storage and mounted into sandboxes as a read-write directory. Multiple sandboxes can mount the same volume simultaneously, allowing data to be shared across sandboxes and persist independently of the sandbox lifecycle.

### [\#](https://www.daytona.io/docs/en/architecture/\#container-registry) Container registry

[Section titled “Container registry”](https://www.daytona.io/docs/en/architecture/#container-registry)

Container registries serve as the source for sandbox base images. When creating a [snapshot](https://www.daytona.io/docs/en/snapshots), the snapshot builder pulls the specified image from an external registry, and pushes it to the internal snapshot registry for use by runners. For Dockerfile-based snapshots, parent images referenced in `FROM` directives are also pulled from the configured source registries during the build. Daytona supports any OCI-compatible registry:

- [Docker Hub](https://www.daytona.io/docs/en/snapshots#docker-hub)
- [Google Artifact Registry](https://www.daytona.io/docs/en/snapshots#google-artifact-registry)
- [GitHub Container Registry (GHCR)](https://www.daytona.io/docs/en/snapshots#github-container-registry)
- [Private registries](https://www.daytona.io/docs/en/snapshots#using-images-from-private-registries): any registry that implements the OCI distribution specification