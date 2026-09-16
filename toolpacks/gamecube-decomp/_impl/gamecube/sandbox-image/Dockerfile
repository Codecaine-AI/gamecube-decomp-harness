FROM debian:bookworm

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        coreutils \
        ca-certificates \
        file \
        gdb-multiarch \
        git \
        ninja-build \
        python3 \
        python3-pip \
        qemu-user \
        ripgrep \
        time \
    && rm -rf /var/lib/apt/lists/* \
    && pip3 install --break-system-packages \
        tree-sitter==0.25.2 \
        tree-sitter-c==0.24.1 \
        libclang==18.1.1

ARG GAME_ID
ARG WORKSPACE_ROOT
ARG REPORT_PATH
RUN test -n "$GAME_ID" && test -n "$WORKSPACE_ROOT" && test -n "$REPORT_PATH"
COPY checkout ${WORKSPACE_ROOT}
COPY image-tools /opt/image-tools
COPY toolpacks /opt/toolpacks

RUN mkdir -p /work \
    && if [ "$WORKSPACE_ROOT" != "/work/$GAME_ID" ]; then ln -s "$WORKSPACE_ROOT" "/work/$GAME_ID"; fi

ENV ORCH_GAME_ID=${GAME_ID} \
    ORCH_GAME_REPO_ROOT=${WORKSPACE_ROOT} \
    ORCH_GAME_REPORT_PATH=${REPORT_PATH} \
    ORCH_TOOL_PLATFORM=linux-i686 \
    MWCC_CACHE_DIR=${WORKSPACE_ROOT}/build/mwcc-objcache

WORKDIR ${WORKSPACE_ROOT}

RUN python3 /opt/image-tools/install_mwcc_cache.py "$WORKSPACE_ROOT"
RUN python3 /opt/image-tools/prepare_linux_image.py "$WORKSPACE_ROOT" /opt/image-tools/worker-image.json
