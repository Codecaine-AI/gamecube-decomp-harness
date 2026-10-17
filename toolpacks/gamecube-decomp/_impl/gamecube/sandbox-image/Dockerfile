# Debian bookworm has no clang-21; apt.llvm.org does. Fetch its signing key in
# a throwaway stage and accept it only by fingerprint, so gnupg and curl stay
# out of the final image.
FROM debian:bookworm AS llvm-apt-key
ARG LLVM_APT_KEY_FINGERPRINT=6084F3CF814B57C1CF12EFD515CF4D18AF4F7421
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && curl -fsSL https://apt.llvm.org/llvm-snapshot.gpg.key -o /tmp/llvm.asc \
    && test "$(gpg --batch --with-colons --show-keys /tmp/llvm.asc | grep -c '^pub:')" = 1 \
    && fpr=$(gpg --batch --with-colons --show-keys /tmp/llvm.asc | awk -F: '$1 == "fpr" { print $10; exit }') \
    && { [ "$fpr" = "$LLVM_APT_KEY_FINGERPRINT" ] || { echo "apt.llvm.org key fingerprint $fpr != $LLVM_APT_KEY_FINGERPRINT" >&2; exit 1; }; } \
    && gpg --batch --dearmor -o /llvm.gpg /tmp/llvm.asc

# Pinned reference sources: the rayanht/mwcc compiler source (/opt/mwcc) and
# the TP/TWW JSystem refs (/opt/refs/jsystem/{tp,tww}), each checked against
# the commit in its lock file.
FROM debian:bookworm AS pinned-sources
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates git python3
# /opt/mwcc uses the toolpack's own fetch_mwcc_ref.sh (no .git, `.mwcc-ref`
# stamp read by compiler_ref.py). It fetches from the lock's remote: the
# traced-compilers stage may use prebuilt binaries and hold no clone to reuse.
COPY image-tools/fetch_pinned_sources.py /in/fetch_pinned_sources.py
COPY toolpacks/gamecube-decomp/_impl/gamecube/tools/fetch_mwcc_ref.sh \
     toolpacks/gamecube-decomp/_impl/gamecube/tools/mwcc_ref.lock.json \
     toolpacks/gamecube-decomp/_impl/gamecube/tools/refs.lock.json /in/
RUN bash /in/fetch_mwcc_ref.sh --strip-git /out/mwcc \
    && python3 /in/fetch_pinned_sources.py /in/refs.lock.json /out/refs/jsystem --strip-git --stamp .pinned-ref \
    && test -d /out/mwcc/src && test -d /out/refs/jsystem/tp && test -d /out/refs/jsystem/tww

# Traced MWCC builds (contract: build/compilers-traced/GC/<ver>/mwcceppc.exe and
# CAPABILITIES.json). Uses binaries the bundle staged under traced-compilers/
# when every version is present, else runs the toolpack's pinned
# compiler/mwcc_alloc/native/build.sh. With neither the build fails, unless
# TRACED_COMPILERS=optional (local test images only).
FROM debian:bookworm AS traced-compilers
ARG TRACED_COMPILERS=required
ARG TRACED_COMPILER_VERSIONS=1.1p1,1.2.5,1.2.5n
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates python3
COPY image-tools/stage_traced_compilers.sh image-tools/gate_traced_capabilities.py /in/
COPY traced-compilers /in/prebuilt
COPY toolpacks/gamecube-decomp/compiler/mwcc_alloc/native /in/native
RUN bash /in/stage_traced_compilers.sh /in/prebuilt /in/native /out "$TRACED_COMPILER_VERSIONS" "$TRACED_COMPILERS"

# clang-21 for the IR oracle (PowerPC target), as its own stage so the steering
# gate can reproduce the exact compiler: `docker build --target clang-oracle`
# needs no build context. Every package of the build is pinned so apt cannot
# mix in another snapshot. llvm-21 (and its runtime) is only there for
# llvm-cxxfilt-21: no smaller package ships it.
# apt.llvm.org redirects to https, so ca-certificates goes in before its source.
FROM debian:bookworm AS clang-oracle
ARG LLVM_DEB_VERSION=1:21.1.8~++20251221032947+2078da43e25a-1~exp1~20251221153113.67
COPY --from=llvm-apt-key /llvm.gpg /usr/share/keyrings/llvm.gpg
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates \
    && echo "deb [signed-by=/usr/share/keyrings/llvm.gpg] https://apt.llvm.org/bookworm/ llvm-toolchain-bookworm-21 main" \
        > /etc/apt/sources.list.d/llvm-21.list \
    && apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        clang-21="$LLVM_DEB_VERSION" \
        llvm-21="$LLVM_DEB_VERSION" \
        llvm-21-runtime="$LLVM_DEB_VERSION" \
        llvm-21-linker-tools="$LLVM_DEB_VERSION" \
        libllvm21="$LLVM_DEB_VERSION" \
        libclang-cpp21="$LLVM_DEB_VERSION" \
        libclang1-21="$LLVM_DEB_VERSION" \
        libclang-common-21-dev="$LLVM_DEB_VERSION" \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/llvm-cxxfilt-21 /usr/local/bin/llvm-cxxfilt \
    && clang-21 -print-targets | grep -q ppc32 \
    && clang-21 --version | grep -q 'clang version 21\.1\.8' \
    && test "$(llvm-cxxfilt _ZN3Foo3barEv)" = "Foo::bar()"
ENV ORCH_IR_ORACLE_CLANG=/usr/bin/clang-21

FROM clang-oracle
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
        libclang==18.1.1 \
        pyelftools==0.32 \
        graphviz==0.20.3 \
        pcpp==1.30

ARG GAME_ID
ARG WORKSPACE_ROOT
ARG REPORT_PATH
# Optional: the snapshot script pins it to the bundle's baked HEAD and the
# build checks the packaged checkout against it.
ARG SNAPSHOT_BAKED_REV=
LABEL org.codecaine.decomp.game-id=${GAME_ID} \
      org.codecaine.decomp.snapshot-baked-rev=${SNAPSHOT_BAKED_REV}
RUN test -n "$GAME_ID" && test -n "$WORKSPACE_ROOT" && test -n "$REPORT_PATH"
COPY checkout ${WORKSPACE_ROOT}
# The bundled shallow clone ships without an index. Populate it from HEAD so a
# later `git checkout --force <rev>` removes files the target no longer tracks
# instead of leaving stale copies that change the build's source tree.
# Build-context uploads flatten symlinks into files; restore tracked links.
RUN git -C "$WORKSPACE_ROOT" reset --quiet --mixed HEAD \
    && git -C "$WORKSPACE_ROOT" diff --name-only --diff-filter=T HEAD | xargs -r git -C "$WORKSPACE_ROOT" checkout -- \
    && git -C "$WORKSPACE_ROOT" status --porcelain --untracked-files=no | head -20 \
    && { [ -z "$SNAPSHOT_BAKED_REV" ] || [ "$(git -C "$WORKSPACE_ROOT" rev-parse HEAD)" = "$SNAPSHOT_BAKED_REV" ]; }
COPY image-tools /opt/image-tools
# nproc reports host CPUs in Daytona sandboxes; this wrapper sizes bare `ninja`
# to the cgroup CPU quota and passes an explicit -j through unchanged.
RUN test -x /usr/bin/ninja \
    && install -m 0755 /opt/image-tools/ninja-cgroup-jobs.sh /usr/local/bin/ninja
COPY toolpacks /opt/toolpacks
COPY knowledge /opt/knowledge
COPY games /opt/games
# Worker QA-lint assets with their .qa-ready stamp (provisioning skips the QA
# sync when it matches the host). Only the bundle's tree may live here.
COPY build-orchestrator /opt/build-orchestrator
# Prebuilt tool data (the asm-window index) with per-tool .ready stamps that
# provisioning's ensureSandboxToolData compares before uploading.
COPY tool-data /opt/tool-data
# The vendored m2c fork runs from the toolpack (tools/decomp.py puts it on PYTHONPATH).
RUN PYTHONPATH=/opt/toolpacks/gamecube-decomp/_impl/gamecube/m2c python3 -m m2c.main --help > /dev/null \
    && python3 -c "import elftools, graphviz, pcpp"

RUN mkdir -p /work \
    && if [ "$WORKSPACE_ROOT" != "/work/$GAME_ID" ]; then ln -s "$WORKSPACE_ROOT" "/work/$GAME_ID"; fi

# Compiler source at /opt/mwcc, reachable as <checkout>/../mwcc (upstream
# convention) and /work/mwcc; JSystem refs at /opt/refs/jsystem.
COPY --from=pinned-sources /out/mwcc /opt/mwcc
COPY --from=pinned-sources /out/refs /opt/refs
RUN for link in "$(dirname "$WORKSPACE_ROOT")/mwcc" /work/mwcc; do \
        [ "$link" = /opt/mwcc ] || [ -e "$link" ] || ln -s /opt/mwcc "$link"; \
    done \
    && test -d "$WORKSPACE_ROOT/../mwcc/src"
# Traced compilers live next to the stock ones in the checkout's build/, never
# under /opt/toolpacks (that would change the toolpack .ready stamp).
COPY --from=traced-compilers /out/ ${WORKSPACE_ROOT}/build/compilers-traced/

ENV ORCH_GAME_ID=${GAME_ID} \
    ORCH_GAME_REPO_ROOT=${WORKSPACE_ROOT} \
    ORCH_GAME_REPORT_PATH=${REPORT_PATH} \
    ORCH_TOOL_PLATFORM=linux-i686 \
    ORCH_PACKAGE_ROOT=/opt \
    MWCC_CACHE_DIR=${WORKSPACE_ROOT}/build/mwcc-objcache

WORKDIR ${WORKSPACE_ROOT}

RUN python3 /opt/image-tools/install_mwcc_cache.py "$WORKSPACE_ROOT"
RUN python3 /opt/image-tools/prepare_linux_image.py "$WORKSPACE_ROOT" /opt/image-tools/worker-image.json
