# TRIMMED Daytona Melee sandbox rebake

**Verdict: PASS.** The trimmed Linux/amd64 image is 1,053,143,323 uncompressed bytes, the Daytona snapshot carries a 2 vCPU / 4 GiB RAM / 5 GB disk class, and a sandbox created from that snapshot with no resource override completed the rebuild and objdiff gates with 5,367,484,416 bytes free afterward.

## Required size proof

| Measurement | Bytes | Result |
| --- | ---: | --- |
| Old untrimmed image `.Size` | 5,868,625,900 | Reference |
| New trimmed image `.Size` | 1,053,143,323 | PASS |
| Reduction | 4,815,482,577 (82.055%) | PASS |
| 5 GiB comparison value | 5,368,709,120 | Limit comparison |
| New image headroom vs 5 GiB | 4,315,565,797 | PASS |

The new image is 19.616% of 5 GiB by Docker's uncompressed `.Size`. Docker inspect reports `linux/amd64`, image ID `sha256:8574615f84335427de92dcf7f8dac7cbfeb93e44e0839d829bdfcecf12c299e2`.

## Snapshot and default-resource sandbox

Snapshot registration:

| Field | Value |
| --- | --- |
| Name | `melee-sandbox-poc-20260818-trimmed` |
| ID | `0d3023d2-a197-46f7-8c0b-3fca6ff7a94f` |
| State / class | `active` / `container` |
| Resources | 2 CPU / 4 GiB RAM / 5 GB disk |
| Push duration | 50.26 s |

The proof sandbox was created without CPU, memory, or disk flags:

```sh
daytona create \
  --snapshot melee-sandbox-poc-20260818-trimmed \
  --name melee-trimmed-proof-20260818 \
  --ttl 60 \
  --auto-delete 60
```

Daytona reported inherited resources of 2 CPU / 4 GiB RAM / 5 GB disk. It recorded `autoDeleteInterval: 60`, `autoDestroyAt: 2026-08-19T03:26:23.562Z`, and a default 15-minute auto-stop. One sandbox was created, below the maximum of two.

## Sandbox disk proof

| Point | Total bytes | Used bytes | Free bytes | Use |
| --- | ---: | ---: | ---: | ---: |
| Before rebuild | 5,368,709,120 | 24,576 | 5,368,684,544 | 1% |
| After rebuild and objdiff | 5,368,709,120 | 1,224,704 | 5,367,484,416 | 1% |

The platform exposes the 5 GB snapshot class as a 5 GiB writable root overlay. Base image layers are not charged as used bytes in this `df` view. The image booted under this class and retained 99.98% of the writable root after acceptance.

## Linux identity and toolchain

| Item | Evidence |
| --- | --- |
| Baked revision | `1e28b4203bf5b53d9399e90c22bd287de0d64657` |
| Git depth | Shallow, one commit |
| dtk | v1.8.3, static Linux x86-64 ELF, SHA-256 `97c60d797aa6d87093c367d7667c77c03204e91b825b6fdd6361e29468865d76` |
| binutils | gc-wii-binutils 2.42-2, static Linux x86-64 ELF |
| wibo | Static Linux i686 ELF, SHA-256 `52b55c0990218a1476bb9d9c947e8847b58c849e214e26fcedabf99d542cbec7` |
| objdiff-cli | Static-PIE Linux x86-64 ELF, SHA-256 `2f9a820543c39feead53b799b6d4a441cdb43c20b5f0034dd14f449528f2d91a` |

The wibo bytes were verified against the required read-only source path; nothing was written there. The bundle omitted `.git/index`, so `git reset --mixed HEAD` regenerated only the extracted checkout's index. It did not change worktree files. The payload's intentional `configure.py` modification and untracked harness assets remain; “clean” below refers to the required Ninja no-work state.

The image retains `/work/melee -> /opt/melee`, required by absolute paths in the Linux-generated `build.ninja`. Its environment sets `ORCH_TOOL_PLATFORM=linux-i686`, `ORCH_GLOBAL_COMPILE_SLOTS=2`, and `MWCC_CACHE_DIR=/opt/melee/build/mwcc-objcache`.

## Acceptance evidence

All local container acceptance commands ran with `--platform linux/amd64 --network none`.

| Gate | Local result | Daytona sandbox result |
| --- | --- | --- |
| Pre-touch object SHA-256 | `b15da0f8b9996d126bbcd02e1846c83d52affb0dce25a4fc4a3093e17800fece` | Same |
| Post-rebuild object SHA-256 | Same; byte-identical | Same; matches local |
| One-TU rebuild | PASS, 0.47 s | PASS, 0.07 s |
| objdiff startup | `READY` | `READY` |
| objdiff response | `675674 05a2692e7c8fbcf505de568af257b7e8204dfb2b4b05d6c77400586e0e9973ed` | Same |
| Protocol shape | Exactly two response fields | Exactly two response fields |
| Final local Ninja report | `ninja: no work to do.` | Baked state verified before push |

The sandbox rebuild and objdiff used only baked files and made no download or package request. Every sandbox exec had an explicit timeout: disk checks used 30 seconds and the rebuild/objdiff command used 600 seconds.

## Per-step timings

| Step | Wall time |
| --- | ---: |
| Bundle extraction | 4.64 s |
| Linux-tool download container, including package setup | 46.16 s |
| Linux reconfiguration | 0.78 s |
| MWCC cache-shim installation | 0.15 s |
| Initial cache warm and report (1,075 TUs rebuilt after Linux dtk split) | 231.47 s |
| Local one-TU touch/rebuild | 0.47 s |
| Local objdiff score | 0.082533 s |
| Local report settle after touched TU | 4.32 s |
| Local no-op report | 0.07 s |
| Successful Docker build | 17.05 s |
| Baked-image no-op report | 0.07 s |
| Daytona snapshot push | 50.26 s |
| Default-resource sandbox creation | 1.41 s |
| Sandbox one-TU touch/rebuild | 0.07 s |
| Sandbox objdiff score | 0.094863 s |
| Sandbox delete request | 0.22 s |

The first Docker invocation stopped before loading any build layers because Buildx attempted to update a non-writable home-directory activity file. Redirecting only Buildx metadata to `/tmp/daytona-rebake/.buildx` resolved it; the successful build timing above is the actual bake.

## Cleanup

`daytona delete melee-trimmed-proof-20260818` succeeded. The first immediate list check raced deletion reconciliation; six seconds later the exact name and ID query returned `[]`. A final independent `daytona list -f json` reported count `0`. The snapshot remains active as requested.

TRIMMED-5GIB: PASS
