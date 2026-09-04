#!/usr/bin/env bash
# Pinned, checksum-verified security tool bootstrap for TrackWork local
# validation. Downloads are made only when the tool is absent from PATH or the
# cache. Set TRACKWORK_SECURITY_CACHE to override the cache directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CACHE="${TRACKWORK_SECURITY_CACHE:-$ROOT/.cache/security-tools}"
mkdir -p "$CACHE"

OSV_SCANNER_BIN="${OSV_SCANNER_BIN:-}"
GITLEAKS_BIN="${GITLEAKS_BIN:-}"

OSV_VERSION="2.5.1"
GITLEAKS_VERSION="8.24.3"

case "$(uname -s)" in
  Darwin)
    OS="darwin"
    case "$(uname -m)" in
      arm64) ARCH="arm64" ;;
      *) ARCH="amd64" ;;
    esac
    ;;
  Linux)
    OS="linux"
    case "$(uname -m)" in
      aarch64) ARCH="arm64" ;;
      armv7l) ARCH="armv7" ;;
      *) ARCH="amd64" ;;
    esac
    ;;
  *)
    echo "unsupported platform $(uname -s)"
    exit 1
    ;;
esac

fetch_verified() {
  local url="$1"
  local checksums_url="$2"
  local asset="$3"
  local dest="$4"
  if [ -x "$dest" ]; then
    return 0
  fi
  echo "   downloading $asset (pinned $url)"
  curl -fsSL -o "$CACHE/$asset" "$url"
  curl -fsSL -o "$CACHE/checksums.txt" "$checksums_url"
  (cd "$CACHE" && grep "$asset" checksums.txt | sha256sum -c -)
  mv "$CACHE/$asset" "$dest"
  chmod +x "$dest"
}

ensure_osv_scanner() {
  if [ -z "$OSV_SCANNER_BIN" ]; then
    if command -v osv-scanner >/dev/null 2>&1; then
      OSV_SCANNER_BIN="$(command -v osv-scanner)"
    else
      local dest="$CACHE/osv-scanner-$OSV_VERSION-$OS-$ARCH"
      local asset="osv-scanner_${OS}_${ARCH}"
      fetch_verified \
        "https://github.com/google/osv-scanner/releases/download/v$OSV_VERSION/$asset" \
        "https://github.com/google/osv-scanner/releases/download/v$OSV_VERSION/osv-scanner_SHA256SUMS" \
        "$asset" \
        "$dest"
      OSV_SCANNER_BIN="$dest"
    fi
  fi
  if [ ! -x "$OSV_SCANNER_BIN" ]; then
    echo "osv-scanner unavailable; install it or set OSV_SCANNER_BIN"
    exit 1
  fi
}

ensure_gitleaks() {
  if [ -z "$GITLEAKS_BIN" ]; then
    if command -v gitleaks >/dev/null 2>&1; then
      GITLEAKS_BIN="$(command -v gitleaks)"
    else
      local dest="$CACHE/gitleaks-$GITLEAKS_VERSION-$OS-$ARCH"
      if [ ! -x "$dest" ]; then
        echo "   downloading gitleaks $GITLEAKS_VERSION (pinned, checksum-verified)"
        local asset="gitleaks_${GITLEAKS_VERSION}_${OS}_${ARCH}.tar.gz"
        curl -fsSL -o "$CACHE/$asset" \
          "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS_VERSION/$asset"
        curl -fsSL -o "$CACHE/checksums.txt" \
          "https://github.com/gitleaks/gitleaks/releases/download/v$GITLEAKS_VERSION/gitleaks_${GITLEAKS_VERSION}_checksums.txt"
        (cd "$CACHE" && grep "$asset" checksums.txt | sha256sum -c -)
        tar -xzf "$CACHE/$asset" -C "$CACHE" gitleaks
        mv "$CACHE/gitleaks" "$dest"
        chmod +x "$dest"
      fi
      GITLEAKS_BIN="$dest"
    fi
  fi
  if [ ! -x "$GITLEAKS_BIN" ]; then
    echo "gitleaks unavailable; install it or set GITLEAKS_BIN"
    exit 1
  fi
}