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

RUN AFFINE_DOCKER_CLEAN=1 TARGETARCH="${TARGETARCH}" TARGETVARIANT="${TARGETVARIANT}" node ./scripts/docker-clean.mjs

FROM ghcr.io/toeverything/affine:stable AS affine_stable

FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=assets /app /app
COPY --from=affine_stable /app/dist /opt/affine-stable-dist
COPY --from=affine_stable /app/node_modules /app/node_modules

# node:22-bookworm-slim in this environment may not include system OpenSSL
# libs, while Prisma in /app/node_modules ships linux-*-openssl-3.0.x engines.
# Copy OpenSSL runtime bits from the known-good affine_stable image instead of
# relying on apt-get during build.
RUN --mount=type=bind,from=affine_stable,source=/,target=/mnt/affine-stable,readonly \
  set -eux; \
  cp /mnt/affine-stable/usr/bin/openssl /usr/bin/openssl; \
  if [ -d /mnt/affine-stable/usr/lib/aarch64-linux-gnu ]; then \
    mkdir -p /usr/lib/aarch64-linux-gnu /lib/aarch64-linux-gnu; \
    cp /mnt/affine-stable/usr/lib/aarch64-linux-gnu/libssl.so.3 /usr/lib/aarch64-linux-gnu/libssl.so.3; \
    cp /mnt/affine-stable/usr/lib/aarch64-linux-gnu/libcrypto.so.3 /usr/lib/aarch64-linux-gnu/libcrypto.so.3; \
    cp /mnt/affine-stable/lib/aarch64-linux-gnu/libssl.so.3 /lib/aarch64-linux-gnu/libssl.so.3; \
    cp /mnt/affine-stable/lib/aarch64-linux-gnu/libcrypto.so.3 /lib/aarch64-linux-gnu/libcrypto.so.3; \
  elif [ -d /mnt/affine-stable/usr/lib/x86_64-linux-gnu ]; then \
    mkdir -p /usr/lib/x86_64-linux-gnu /lib/x86_64-linux-gnu; \
    cp /mnt/affine-stable/usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libssl.so.3; \
    cp /mnt/affine-stable/usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3; \
    cp /mnt/affine-stable/lib/x86_64-linux-gnu/libssl.so.3 /lib/x86_64-linux-gnu/libssl.so.3; \
    cp /mnt/affine-stable/lib/x86_64-linux-gnu/libcrypto.so.3 /lib/x86_64-linux-gnu/libcrypto.so.3; \
  else \
    echo "Unsupported library layout in affine_stable image"; \
    exit 1; \
  fi

# The local build may contain a host-native server-native.node (e.g. macOS),
# which can't run in Linux containers. Reuse the Linux native addon from the
# official MRH ManSys image for the current target architecture.
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
RUN --mount=type=tmpfs,target=/root/.npm \
  --mount=type=tmpfs,target=/tmp/runtime-deps \
  set -eux; \
  mkdir -p /tmp/runtime-deps; \
  printf '%s\n' \
    '{' \
    '  "name": "affine-runtime-deps",' \
    '  "private": true,' \
    '  "dependencies": {' \
    '    "@as-integrations/express5": "^1.1.2",' \
    '    "@inquirer/prompts": "^7.10.1",' \
    '    "ldapts": "^7.4.0",' \
    '    "radius": "^1.1.4"' \
    '  }' \
    '}' \
    > /tmp/runtime-deps/package.json; \
  cd /tmp/runtime-deps; \
  npm install --omit=dev --no-audit --no-fund --no-package-lock; \
  cp -an /tmp/runtime-deps/node_modules/. /app/node_modules/

# jemalloc preload is intentionally disabled in local builds to avoid
# hard dependency on apt during image build in restricted networks.

EXPOSE 3010

CMD ["node", "./dist/main.js"]
