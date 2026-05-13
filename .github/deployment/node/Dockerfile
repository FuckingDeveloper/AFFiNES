# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS assets
WORKDIR /app

COPY ./packages/backend/server /app
COPY ./packages/frontend/apps/web/dist /app/static
COPY ./packages/frontend/admin/dist /app/static/admin
COPY ./packages/frontend/apps/mobile/dist /app/static/mobile

# Keep server sourcemap for stacktraces, but don't ship frontend/node_modules sourcemaps.
ARG TARGETARCH
ARG TARGETVARIANT
# Needed for Prisma engine resolution (and potential engine download during cleanup).
RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl ca-certificates && \
  rm -rf /var/lib/apt/lists/*

RUN AFFINE_DOCKER_CLEAN=1 TARGETARCH="${TARGETARCH}" TARGETVARIANT="${TARGETVARIANT}" node ./scripts/docker-clean.mjs

FROM ghcr.io/toeverything/affine:stable AS affine_stable

FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=assets /app /app
COPY --from=affine_stable /app/dist /opt/affine-stable-dist
COPY --from=affine_stable /app/node_modules /app/node_modules

RUN apt-get update && \
  apt-get install -y --no-install-recommends openssl libjemalloc2 && \
  rm -rf /var/lib/apt/lists/*

# The local build may contain a host-native server-native.node (e.g. macOS),
# which can't run in Linux containers. Reuse the Linux native addon from the
# official AFFiNE image for the current target architecture.
ARG TARGETARCH
RUN set -eux; \
  if [ "${TARGETARCH}" = "amd64" ] && [ -f /opt/affine-stable-dist/server-native.x64.node ]; then \
    cp /opt/affine-stable-dist/server-native.x64.node /app/dist/server-native.node; \
  elif [ "${TARGETARCH}" = "arm64" ] && [ -f /opt/affine-stable-dist/server-native.arm64.node ]; then \
    cp /opt/affine-stable-dist/server-native.arm64.node /app/dist/server-native.node; \
  else \
    echo "No compatible server-native binary found for TARGETARCH=${TARGETARCH}"; \
    ls -la /opt/affine-stable-dist; \
    exit 1; \
  fi

# Local server bundle currently imports a few packages that are not present in
# the upstream stable image dependencies. Install those extra runtime packages
# in an isolated temp project and merge them into /app/node_modules.
RUN set -eux; \
  mkdir -p /tmp/runtime-deps; \
  printf '%s\n' \
    '{' \
    '  "name": "affine-runtime-deps",' \
    '  "private": true,' \
    '  "dependencies": {' \
    '    "@as-integrations/express5": "^1.1.2",' \
    '    "@inquirer/prompts": "^7.10.1",' \
    '    "commander": "^13.1.0",' \
    '    "zod-to-json-schema": "^3.20.0"' \
    '  }' \
    '}' \
    > /tmp/runtime-deps/package.json; \
  cd /tmp/runtime-deps; \
  npm install --omit=dev --no-audit --no-fund; \
  cp -an /tmp/runtime-deps/node_modules/. /app/node_modules/

# Enable jemalloc by preloading the library
ENV LD_PRELOAD=libjemalloc.so.2

EXPOSE 3010

CMD ["node", "./dist/main.js"]
