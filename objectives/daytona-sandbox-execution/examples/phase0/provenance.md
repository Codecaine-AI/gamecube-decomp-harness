# objdiff-cli score-server provenance

## Source

- Date: **2026-08-18**
- Upstream: <https://github.com/encounter/objdiff>
- Release tag: `v3.6.1`
- Commit: `66c879a95d45c1170a0834071cab58655fd9773b`
- Scratch checkout: `/private/tmp/objdiff-score-rebuild/objdiff`
- Patch: `score-server.patch`, SHA-256 `965e790432a1e573a2b937d99c43abd640f4bea34c8abae3648b804ef0505f6b`

The patch was reconstructed from the read-only score-server README, the
`ObjdiffScorer` client and Python JSON fallback semantics, and the surviving
macOS arm64 oracle. No file under
`/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness` was written or
modified.

The patch was checked in a clean clone at the pinned commit with:

```sh
git apply --check /private/tmp/objdiff-score-rebuild/out/score-server.patch
git apply /private/tmp/objdiff-score-rebuild/out/score-server.patch
git diff --check
```

## Native macOS arm64 build

Toolchain:

- `rustc 1.88.0 (6b00bc388 2025-06-23)`
- Host: `aarch64-apple-darwin`
- LLVM: `20.1.5`
- `cargo 1.88.0 (873a06493 2025-05-10)`

Commands:

```sh
git clone https://github.com/encounter/objdiff.git objdiff
git -C objdiff checkout 66c879a95d45c1170a0834071cab58655fd9773b
cd objdiff
cargo +1.88.0 build --release --bin objdiff-cli
cp target/release/objdiff-cli ../out/objdiff-cli-macos-arm64-rebuilt
```

Delivered binary:

- `objdiff-cli-macos-arm64-rebuilt`
- Size: `8677072` bytes
- SHA-256: `1d11e94f9e74d29c448cae1ca714fb90b2592e51707d1b6c16bb52abe9b2b60b`
- Format: `Mach-O 64-bit executable arm64`

## Linux x86_64 musl build

The builder used Docker 29.4.0 under `--platform linux/amd64`.

- Base image: `rust:1.88-bookworm@sha256:af306cfa71d987911a781c37b59d7d67d934f49684058f96cf72079c3626bfe0`
- Builder image ID: `sha256:e5c9a800822a5c92c37e1c6123d4564ad21d7967a3673ef89c936877370a39b0`
- Container compiler: Rust 1.88.0, host `x86_64-unknown-linux-gnu`
- Installed target: `x86_64-unknown-linux-musl`
- Debian `musl-tools`: `1.2.3-1`

Builder image:

```dockerfile
FROM rust:1.88-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends musl-tools \
    && rm -rf /var/lib/apt/lists/* \
    && rustup target add x86_64-unknown-linux-musl
WORKDIR /work
```

Commands:

```sh
docker build --platform linux/amd64 \
  -f Dockerfile.musl -t objdiff-musl-rust-1.88 .

docker run --rm --platform linux/amd64 \
  -v /private/tmp/objdiff-score-rebuild/objdiff:/work \
  -w /work objdiff-musl-rust-1.88 \
  cargo build --release --target x86_64-unknown-linux-musl --bin objdiff-cli

cp objdiff/target/x86_64-unknown-linux-musl/release/objdiff-cli \
  out/objdiff-cli-linux-x86_64
```

Delivered binary:

- `objdiff-cli-linux-x86_64`
- Size: `10556552` bytes
- SHA-256: `2f9a820543c39feead53b799b6d4a441cdb43c20b5f0034dd14f449528f2d91a`
- Format: `ELF 64-bit LSB pie executable, x86-64, static-pie linked`
- Build ID: `202ec42d60b74919ea1ded4a8113a6fd0ce06077`

## Oracle and validation

Golden oracle:

- SHA-256: `88aa2629032fa51889216df3ce821e585386dafbb0aec0a0f132908debdf67ae`
- Format: `Mach-O 64-bit executable arm64`

Validation used seven report-backed nonzero symbols across different units.
Each target received seven ordered requests: self, perturbation one, missing
path, self after missing-path ERR, perturbation two, structurally different
object, and self after structural ERR.

```sh
python3 validation_battery.py \
  --mode native --output work/validation_native.json

docker pull --platform linux/amd64 alpine:3.22
python3 validation_battery.py \
  --mode docker --output work/validation_linux.json
```

Runtime image:
`alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce`.

Results:

- Rebuilt macOS arm64 vs golden: **49/49 exact responses**
- Linux x86_64 musl vs golden: **49/49 exact responses**
- Combined: **98/98 exact responses**

The complete per-case output matrix is in `validation_report.md`.
