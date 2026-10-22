#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: build-linux-wsl.sh [--check] <windows-source> [windows-artifacts-dir] [version]" >&2
}

required_commands=(curl fakeroot file git rpmbuild sha256sum tar xz)

check_environment() {
  local missing=()
  local command_name
  for command_name in "${required_commands[@]}"; do
    if ! command -v "$command_name" >/dev/null 2>&1; then
      missing+=("$command_name")
    fi
  done
  if ((${#missing[@]})); then
    echo "Missing Debian build tools: ${missing[*]}" >&2
    echo "Install them with: sudo apt install -y git curl ca-certificates build-essential fakeroot rpm file xz-utils" >&2
    exit 1
  fi
}

check_environment
if [[ "${1:-}" == "--check" ]]; then
  exit 0
fi
if (($# != 3)); then
  usage
  exit 2
fi

source_root=$1
artifacts_dir=$2
version=$3
if [[ ! -f "$source_root/package.json" || ! -f "$source_root/package-lock.json" ]]; then
  echo "Aero P2P Chat source not found: $source_root" >&2
  exit 1
fi
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Invalid release version: $version" >&2
  exit 1
fi

node_major=$(tr -d '[:space:]' < "$source_root/.node-version")
if [[ ! "$node_major" =~ ^[0-9]+$ ]]; then
  echo "Invalid .node-version: $node_major" >&2
  exit 1
fi

cache_root="${XDG_CACHE_HOME:-$HOME/.cache}/aero-p2p-chat-release"
node_root="$cache_root/node-v$node_major-linux-x64"
npm_cache="$cache_root/npm"
electron_cache="$cache_root/electron"
electron_builder_cache="$cache_root/electron-builder"
mkdir -p "$cache_root" "$npm_cache" "$electron_cache" "$electron_builder_cache"

install_node() {
  if [[ -x "$node_root/bin/node" ]] && [[ "$($node_root/bin/node --version)" == v$node_major.* ]]; then
    return
  fi

  echo "Installing the current Node.js $node_major runtime in the WSL build cache ..."
  local metadata archive checksum download_dir
  metadata=$(curl -fsSL "https://nodejs.org/dist/latest-v$node_major.x/SHASUMS256.txt")
  archive=$(awk -v major="$node_major" '$2 ~ ("^node-v" major "[.][0-9]+[.][0-9]+-linux-x64[.]tar[.]xz$") { print $2; exit }' <<<"$metadata")
  if [[ -z "$archive" ]]; then
    echo "Could not resolve the current Node.js $node_major Linux archive." >&2
    exit 1
  fi
  checksum=$(awk -v archive="$archive" '$2 == archive { print $1; exit }' <<<"$metadata")
  download_dir=$(mktemp -d "$cache_root/node-download.XXXXXX")
  curl -fL "https://nodejs.org/dist/latest-v$node_major.x/$archive" -o "$download_dir/$archive"
  (cd "$download_dir" && printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --strict -)
  rm -rf "$node_root"
  mkdir -p "$node_root"
  tar -xJf "$download_dir/$archive" --strip-components=1 -C "$node_root"
  rm -rf "$download_dir"
}

install_node
export PATH="$node_root/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export npm_config_cache="$npm_cache"
export ELECTRON_CACHE="$electron_cache"
export ELECTRON_BUILDER_CACHE="$electron_builder_cache"
export ELECTRON_RUN_AS_NODE=""

build_root=$(mktemp -d "$cache_root/source.XXXXXX")
cleanup() {
  rm -rf "$build_root"
}
trap cleanup EXIT

echo "Synchronizing the release source into Debian ..."
tar \
  --exclude='./.git' \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./out' \
  --exclude='./.logs' \
  --exclude='./.dev-data' \
  -C "$source_root" -cf - . | tar -C "$build_root" -xf -

cd "$build_root"
echo "Installing Linux dependencies with $(node --version) ..."
npm ci --prefer-offline --no-audit --no-fund
npm run test
node scripts/ci-build-release.cjs --platform=linux --version="$version"

mkdir -p "$artifacts_dir"
for artifact in \
  Aero-P2P-Chat-Linux-x64.AppImage \
  Aero-P2P-Chat-Linux-x64.rpm \
  Aero-P2P-Chat-Linux-x64.deb \
  update_manifest_linux.json; do
  source_file="$build_root/dist/build/artifacts/$artifact"
  if [[ ! -f "$source_file" ]]; then
    echo "Linux build artifact not found: $source_file" >&2
    exit 1
  fi
  cp -f "$source_file" "$artifacts_dir/$artifact"
done

echo "Linux release artifacts copied to $artifacts_dir"
