FROM debian:bookworm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        coreutils \
        file \
        gdb-multiarch \
        git \
        ninja-build \
        python3 \
        qemu-user \
        time \
    && rm -rf /var/lib/apt/lists/*

COPY melee /opt/melee
COPY image-tools /opt/image-tools

RUN mkdir -p /work \
    && ln -s /opt/melee /work/melee

ENV ORCH_TOOL_PLATFORM=linux-i686 \
    ORCH_GLOBAL_COMPILE_SLOTS=2 \
    MWCC_CACHE_DIR=/opt/melee/build/mwcc-objcache

WORKDIR /opt/melee
