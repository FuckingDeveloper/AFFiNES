# syntax=docker/dockerfile:1.7

FROM node:22-bookworm AS build-base
WORKDIR /repo

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    clang \
    curl \
    git \
    libssl-dev \
    pkg-config \
    python3 \
  && rm -rf /var/lib/apt/lists/*

FROM build-base AS native-builder
ARG TARGETARCH
ENV CARGO_HOME=/usr/local/cargo
ENV CARGO_INCREMENTAL=1
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
ENV CARGO_PROFILE_RELEASE_LTO=false
ENV PATH=/usr/local/cargo/bin:${PATH}

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.94.0

COPY Cargo.toml Cargo.lock rust-toolchain.toml rustfmt.toml ./
COPY .cargo ./.cargo
COPY packages/backend/native ./packages/backend/native
COPY packages/common/native ./packages/common/native
COPY packages/common/y-octo ./packages/common/y-octo
COPY packages/frontend/mobile-native ./packages/frontend/mobile-native
COPY packages/frontend/native ./packages/frontend/native

RUN --mount=type=cache,id=trackwork-cargo-target-${TARGETARCH},target=/repo/target,sharing=locked \
  --mount=type=cache,id=trackwork-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
  cargo build --locked --release -p affine_server_native \
  && cp /repo/target/release/libaffine_server_native.so /repo/server-native.node

FROM build-base AS builder
ARG GIT_COMMIT=000000000
ENV CI=1
ENV GITHUB_SHA=${GIT_COMMIT}
ENV TRACKWORK_PREBUILT_NATIVE=1

COPY . .
COPY --from=native-builder /repo/server-native.node /repo/packages/backend/native/server-native.node

RUN --mount=type=cache,id=trackwork-yarn,target=/root/.yarn/berry/cache,sharing=locked \
  corepack enable \
  && yarn workspaces focus @affine/server @affine/web @affine/admin @affine-tools/cli \
  && node tools/cli/bin/runner.js affine.ts build -p server --deps \
  && node tools/cli/bin/runner.js affine.ts build -p web \
  && node tools/cli/bin/runner.js affine.ts build -p admin \
  && yarn workspaces focus @affine/server --production

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV SERVER_FLAVOR=allinone
ENV AFFINE_SERVER_HOST=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /repo/node_modules /app/node_modules
COPY --from=builder /repo/packages/backend/server /app
COPY --from=builder /repo/packages/frontend/apps/web/dist /app/static
COPY --from=builder /repo/packages/frontend/admin/dist /app/static/admin

RUN find /app -type f -name '*.map' ! -path '/app/dist/main.js.map' -delete \
  && test -f /app/dist/server-native.node \
  && test -f /app/static/selfhost.html \
  && test -f /app/static/admin/selfhost.html

EXPOSE 3010

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3010/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "./dist/main.js"]
