# syntax=docker/dockerfile:1.7

FROM node:22-bookworm AS builder
WORKDIR /repo

ARG GIT_COMMIT=000000000
ARG TARGETARCH
ENV CI=1
ENV CARGO_HOME=/usr/local/cargo
ENV CARGO_INCREMENTAL=1
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=16
ENV CARGO_PROFILE_RELEASE_LTO=false
ENV GITHUB_SHA=${GIT_COMMIT}
ENV PATH=/usr/local/cargo/bin:${PATH}

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
  && rm -rf /var/lib/apt/lists/* \
  && curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
    | sh -s -- -y --profile minimal --default-toolchain 1.94.0

COPY . .

RUN --mount=type=cache,id=trackwork-yarn,target=/root/.yarn/berry/cache,sharing=locked \
  --mount=type=cache,id=trackwork-cargo-target-${TARGETARCH},target=/repo/target,sharing=locked \
  --mount=type=cache,id=trackwork-cargo-registry,target=/usr/local/cargo/registry,sharing=locked \
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
