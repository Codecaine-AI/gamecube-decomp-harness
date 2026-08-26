FROM debian:bookworm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        coreutils \
        file \
        gdb-multiarch \
        git \
        ninja-build \
        python3 \
        python3-pip \
        qemu-user \
        time \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages \
        tree-sitter==0.25.2 \
        tree-sitter-c==0.24.1 \
        libclang==18.1.1

COPY melee /opt/melee
COPY image-tools /opt/image-tools
COPY toolpacks /opt/toolpacks

RUN mkdir -p /work \
    && ln -s /opt/melee /work/melee

ENV ORCH_TOOL_PLATFORM=linux-i686 \
    MWCC_CACHE_DIR=/opt/melee/build/mwcc-objcache

WORKDIR /opt/melee
