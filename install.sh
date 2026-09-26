#!/usr/bin/env sh
set -eu

# Aero P2P Chat user-local AppImage installer.
# Keep this script POSIX-compatible: README users invoke it through `sh`.

APP_NAME="Aero P2P Chat"
APP_ID="de.zorblock.aerop2pchat"
APP_SLUG="aero-p2p-chat"
CLI_COMMAND="aerop2p"
REPO="Zorblock/AeroP2Pchat"
BRANCH="main"
APPIMAGE_RELEASE_NAME="Aero-P2P-Chat-Linux-x64.AppImage"
APPIMAGE_INSTALL_NAME="Aero-P2P-Chat.AppImage"

RELEASE_BASE="https://github.com/${REPO}/releases"
MANIFEST_URL="${RELEASE_BASE}/latest/download/latest.yml"
INSTALLER_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh"
ICON_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/assets/linux-icons/512x512.png"

[ -n "${HOME:-}" ] || {
  printf '%s\n' "Error: HOME is not set." >&2
  exit 1
}
case "$HOME" in
  /*) ;;
  *) printf '%s\n' "Error: HOME must be an absolute path." >&2; exit 1 ;;
esac

case "${XDG_DATA_HOME:-}" in
  /*) DATA_HOME=$XDG_DATA_HOME ;;
  *) DATA_HOME="$HOME/.local/share" ;;
esac
case "${XDG_CONFIG_HOME:-}" in
  /*) CONFIG_HOME=$XDG_CONFIG_HOME ;;
  *) CONFIG_HOME="$HOME/.config" ;;
esac
case "${XDG_BIN_HOME:-}" in
  /*) BIN_DIR=$XDG_BIN_HOME ;;
  *) BIN_DIR="$HOME/.local/bin" ;;
esac

INSTALL_DIR="$DATA_HOME/$APP_SLUG"
APPIMAGE_PATH="$INSTALL_DIR/$APPIMAGE_INSTALL_NAME"
LEGACY_APPIMAGE_PATH="$INSTALL_DIR/$APPIMAGE_RELEASE_NAME"
VERSION_PATH="$INSTALL_DIR/version"
APP_COMMAND_PATH="$BIN_DIR/$APP_SLUG"
CLI_PATH="$BIN_DIR/$CLI_COMMAND"
APPLICATIONS_DIR="$DATA_HOME/applications"
DESKTOP_PATH="$APPLICATIONS_DIR/$APP_ID.desktop"
ICON_ROOT="$DATA_HOME/icons/hicolor"
ICON_DIR="$ICON_ROOT/512x512/apps"
ICON_PATH="$ICON_DIR/$APP_ID.png"
LEGACY_ICON_PATH="$ICON_ROOT/256x256/apps/$APP_ID.png"
AUTOSTART_PATH="$CONFIG_HOME/autostart/$APP_SLUG.desktop"
USER_DATA_PATH="$CONFIG_HOME/zorblock/userData/$APP_NAME"
LOCK_DIR="$INSTALL_DIR/.installer.lock"

ACTION=${1:-install}
PURGE_DATA=0
if [ "${2:-}" = "--purge" ]; then
  PURGE_DATA=1
fi

TEMP_MANIFEST=""
TEMP_APPIMAGE=""
TEMP_ICON=""
TEMP_VERSION=""
LOCK_HELD=0

is_tty=0
if [ -t 1 ]; then
  is_tty=1
fi

color() {
  color_code=$1
  shift
  if [ "$is_tty" -eq 1 ]; then
    printf '\033[%sm%s\033[0m' "$color_code" "$*"
  else
    printf '%s' "$*"
  fi
}

info() { printf ' %s %s\n' "$(color 36 '[i]')" "$*"; }
ok() { printf ' %s %s\n' "$(color 32 '[OK]')" "$*"; }
warn() { printf ' %s %s\n' "$(color 33 '[!]')" "$*" >&2; }
fail() { printf ' %s %s\n' "$(color 31 '[x]')" "$*" >&2; exit 1; }

cleanup() {
  if [ -n "$TEMP_MANIFEST" ]; then rm -f "$TEMP_MANIFEST" || true; fi
  if [ -n "$TEMP_APPIMAGE" ]; then rm -f "$TEMP_APPIMAGE" || true; fi
  if [ -n "$TEMP_ICON" ]; then rm -f "$TEMP_ICON" || true; fi
  if [ -n "$TEMP_VERSION" ]; then rm -f "$TEMP_VERSION" || true; fi
  if [ "$LOCK_HELD" -eq 1 ]; then
    rm -f "$LOCK_DIR/pid" || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
    rmdir "$INSTALL_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT HUP INT TERM

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

validate_environment() {
  [ "$(uname -s 2>/dev/null || true)" = "Linux" ] ||
    fail "This installer only supports Linux."
  case "$(uname -m 2>/dev/null || true)" in
    x86_64|amd64) ;;
    *) fail "This release is for x86-64 Linux. Your architecture is: $(uname -m 2>/dev/null || printf unknown)" ;;
  esac
  require_command awk
  require_command grep
  require_command mktemp
  require_command sed
  require_command tr
  require_command wc
}

acquire_lock() {
  mkdir -p "$INSTALL_DIR"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    printf '%s\n' "$$" >"$LOCK_DIR/pid"
    LOCK_HELD=1
    return
  fi

  lock_pid=""
  [ ! -r "$LOCK_DIR/pid" ] || lock_pid=$(awk 'NR == 1 { print; exit }' "$LOCK_DIR/pid")
  case "$lock_pid" in
    ''|*[!0-9]*) ;;
    *)
      if kill -0 "$lock_pid" 2>/dev/null; then
        fail "Another Aero installer is already running (PID $lock_pid)."
      fi
      ;;
  esac

  warn "Removing a stale installer lock."
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || fail "Could not remove stale lock: $LOCK_DIR"
  mkdir "$LOCK_DIR" || fail "Could not acquire installer lock."
  printf '%s\n' "$$" >"$LOCK_DIR/pid"
  LOCK_HELD=1
}

download() {
  download_url=$1
  download_target=$2
  download_label=${3:-file}

  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --show-error --silent \
      --retry 4 --retry-delay 2 --connect-timeout 15 --max-time 1800 \
      --output "$download_target" "$download_url" ||
      fail "Could not download $download_label. Check your connection and try again."
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --tries=4 --timeout=30 \
      --output-document="$download_target" "$download_url" ||
      fail "Could not download $download_label. Check your connection and try again."
  else
    fail "Install curl or wget, then run this installer again."
  fi

  [ -s "$download_target" ] || fail "The downloaded $download_label is empty."
}

read_manifest_value() {
  manifest_key=$1
  manifest_file=$2
  awk -v wanted="$manifest_key" '
    index($0, wanted ":") == 1 {
      value = substr($0, length(wanted) + 2)
      sub(/^[[:space:]]+/, "", value)
      sub(/[[:space:]\r]+$/, "", value)
      if (value ~ /^".*"$/) {
        value = substr(value, 2, length(value) - 2)
      }
      print value
      exit
    }
  ' "$manifest_file"
}

validate_manifest() {
  manifest_file=$1
  LATEST_VERSION=$(read_manifest_value version "$manifest_file")
  APPIMAGE_URL=$(read_manifest_value linuxUrl "$manifest_file")
  APPIMAGE_SHA256=$(read_manifest_value linuxSha256 "$manifest_file")
  APPIMAGE_SIZE=$(read_manifest_value linuxSize "$manifest_file")

  printf '%s' "$LATEST_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' ||
    fail "latest.yml contains an invalid version."

  expected_url="${RELEASE_BASE}/download/v${LATEST_VERSION}/${APPIMAGE_RELEASE_NAME}"
  [ "$APPIMAGE_URL" = "$expected_url" ] ||
    fail "latest.yml contains an unexpected Linux download URL."

  printf '%s' "$APPIMAGE_SHA256" | grep -Eqi '^[0-9a-f]{64}$' ||
    fail "latest.yml does not contain a valid Linux SHA-256 checksum."

  case "$APPIMAGE_SIZE" in
    ''|*[!0-9]*) fail "latest.yml does not contain a valid Linux file size." ;;
  esac
  [ "$APPIMAGE_SIZE" -gt 0 ] || fail "latest.yml contains an empty Linux artifact."
}

sha256_file() {
  hash_file=$1
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$hash_file" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$hash_file" | awk '{ print $1 }'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$hash_file" | awk '{ print $NF }'
  else
    fail "No SHA-256 tool found. Install sha256sum, shasum, or openssl."
  fi
}

verify_appimage() {
  appimage_file=$1
  expected_hash=$2
  expected_size=$3

  actual_size=$(wc -c <"$appimage_file" | awk '{ print $1 }')
  [ "$actual_size" = "$expected_size" ] ||
    fail "The AppImage size is wrong (expected $expected_size bytes, got $actual_size)."

  actual_hash=$(sha256_file "$appimage_file" | tr '[:upper:]' '[:lower:]')
  expected_hash=$(printf '%s' "$expected_hash" | tr '[:upper:]' '[:lower:]')
  [ "$actual_hash" = "$expected_hash" ] ||
    fail "The AppImage checksum does not match the release metadata."
}

installed_version() {
  if [ -x "$APPIMAGE_PATH" ] && [ -r "$VERSION_PATH" ]; then
    version=$(awk 'NR == 1 { print; exit }' "$VERSION_PATH")
    if printf '%s' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$'; then
      printf '%s' "$version"
      return
    fi
  fi
  if [ -x "$APPIMAGE_PATH" ] || [ -x "$LEGACY_APPIMAGE_PATH" ]; then
    printf '%s' "unknown"
  else
    printf '%s' "not installed"
  fi
}

has_fuse2() {
  if command -v ldconfig >/dev/null 2>&1 &&
    ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
    return 0
  fi
  for fuse_lib in \
    /lib/libfuse.so.2 /lib64/libfuse.so.2 \
    /usr/lib/libfuse.so.2 /usr/lib64/libfuse.so.2 \
    /lib/x86_64-linux-gnu/libfuse.so.2 \
    /usr/lib/x86_64-linux-gnu/libfuse.so.2; do
    [ ! -e "$fuse_lib" ] || return 0
  done
  return 1
}

shell_single_quote() {
  printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"
}

desktop_quote() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/`/\\`/g; s/\$/\\$/g'
}

write_launcher() {
  mkdir -p "$BIN_DIR"
  quoted_appimage=$(shell_single_quote "$APPIMAGE_PATH")
  launcher_temp=$(mktemp "$BIN_DIR/.${APP_SLUG}.XXXXXX")
  cat >"$launcher_temp" <<EOF
#!/usr/bin/env sh
set -eu
APPIMAGE_PATH=$quoted_appimage

[ -x "\$APPIMAGE_PATH" ] || {
  printf '%s\n' "$APP_NAME is not installed. Run: $CLI_COMMAND install" >&2
  exit 1
}

has_fuse2() {
  if command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
    return 0
  fi
  for lib in /lib/libfuse.so.2 /lib64/libfuse.so.2 /usr/lib/libfuse.so.2 /usr/lib64/libfuse.so.2 /lib/x86_64-linux-gnu/libfuse.so.2 /usr/lib/x86_64-linux-gnu/libfuse.so.2; do
    [ ! -e "\$lib" ] || return 0
  done
  return 1
}

if [ ! -r /dev/fuse ] || [ ! -w /dev/fuse ] || ! has_fuse2; then
  export APPIMAGE_EXTRACT_AND_RUN=1
fi
exec "\$APPIMAGE_PATH" "\$@"
EOF
  chmod 755 "$launcher_temp"
  mv -f "$launcher_temp" "$APP_COMMAND_PATH"
}

write_cli() {
  mkdir -p "$BIN_DIR"
  quoted_installer_url=$(shell_single_quote "$INSTALLER_URL")
  quoted_app_command=$(shell_single_quote "$APP_COMMAND_PATH")
  cli_temp=$(mktemp "$BIN_DIR/.${CLI_COMMAND}.XXXXXX")
  cat >"$cli_temp" <<EOF
#!/usr/bin/env sh
set -eu
INSTALLER_URL=$quoted_installer_url
APP_COMMAND=$quoted_app_command
command_name=\${1:-help}

case "\$command_name" in
  open|run|start)
    shift || true
    exec "\$APP_COMMAND" "\$@"
    ;;
  install|update|status|repair|uninstall)
    temp_installer=\$(mktemp) || exit 1
    trap 'rm -f "\$temp_installer"' EXIT HUP INT TERM
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL --retry 4 --connect-timeout 15 --max-time 120 -o "\$temp_installer" "\$INSTALLER_URL"
    elif command -v wget >/dev/null 2>&1; then
      wget -q --tries=4 --timeout=30 -O "\$temp_installer" "\$INSTALLER_URL"
    else
      printf '%s\n' 'Install curl or wget first.' >&2
      exit 1
    fi
    [ -s "\$temp_installer" ] || { printf '%s\n' 'Installer download was empty.' >&2; exit 1; }
    sh "\$temp_installer" "\$command_name"
    ;;
  help|--help|-h)
    printf '%s\n' \
      '$APP_NAME' \
      '' \
      'Commands:' \
      '  $CLI_COMMAND open       Start the app' \
      '  $CLI_COMMAND update     Install the latest release' \
      '  $CLI_COMMAND status     Show installation status' \
      '  $CLI_COMMAND repair     Recreate launchers and icon' \
      '  $CLI_COMMAND uninstall  Remove the app but keep user data'
    ;;
  *)
    printf 'Unknown command: %s\n' "\$command_name" >&2
    exit 2
    ;;
esac
EOF
  chmod 755 "$cli_temp"
  mv -f "$cli_temp" "$CLI_PATH"
}

write_desktop_entry() {
  mkdir -p "$APPLICATIONS_DIR"
  exec_value=$(desktop_quote "$APP_COMMAND_PATH")
  try_exec_value=$(desktop_quote "$APP_COMMAND_PATH")
  desktop_temp=$(mktemp "$APPLICATIONS_DIR/.${APP_ID}.XXXXXX")
  cat >"$desktop_temp" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_NAME
Comment=Private peer-to-peer chat
Exec="$exec_value" %U
TryExec="$try_exec_value"
Icon=$APP_ID
Terminal=false
Categories=Network;InstantMessaging;Chat;
StartupWMClass=$APP_ID
StartupNotify=true
EOF
  chmod 644 "$desktop_temp"
  mv -f "$desktop_temp" "$DESKTOP_PATH"
  if command -v desktop-file-validate >/dev/null 2>&1; then
    desktop-file-validate "$DESKTOP_PATH" >/dev/null 2>&1 ||
      warn "The desktop launcher was written but did not pass desktop-file-validate."
  fi
}

install_icon() {
  mkdir -p "$ICON_DIR"
  TEMP_ICON=$(mktemp "$ICON_DIR/.${APP_ID}.XXXXXX")

  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --show-error --silent --retry 3 \
      --connect-timeout 15 --max-time 120 --output "$TEMP_ICON" "$ICON_URL" || return 1
  elif command -v wget >/dev/null 2>&1; then
    wget --quiet --tries=3 --timeout=30 --output-document="$TEMP_ICON" "$ICON_URL" || return 1
  else
    return 1
  fi

  [ -s "$TEMP_ICON" ] || return 1
  png_header=$(od -An -tx1 -N8 "$TEMP_ICON" 2>/dev/null | tr -d ' \n')
  [ "$png_header" = "89504e470d0a1a0a" ] || return 1
  chmod 644 "$TEMP_ICON"
  mv -f "$TEMP_ICON" "$ICON_PATH"
  TEMP_ICON=""
  rm -f "$LEGACY_ICON_PATH"
}

refresh_desktop_cache() {
  command -v update-desktop-database >/dev/null 2>&1 &&
    update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 &&
    gtk-update-icon-cache -q "$ICON_ROOT" >/dev/null 2>&1 || true
}

repair_integration() {
  write_launcher
  write_cli
  write_desktop_entry
  if [ ! -s "$ICON_PATH" ] && ! install_icon; then
    warn "Could not install the application icon. The app remains usable."
  fi
  refresh_desktop_cache
}

fetch_release_metadata() {
  TEMP_MANIFEST=$(mktemp "$INSTALL_DIR/.latest.XXXXXX.yml")
  info "Checking the latest release..."
  download "$MANIFEST_URL" "$TEMP_MANIFEST" "release metadata"
  validate_manifest "$TEMP_MANIFEST"
}

install_app() {
  validate_environment
  acquire_lock
  fetch_release_metadata

  current_version=$(installed_version)
  if [ -x "$APPIMAGE_PATH" ] && [ "$current_version" = "$LATEST_VERSION" ]; then
    current_hash=$(sha256_file "$APPIMAGE_PATH" | tr '[:upper:]' '[:lower:]')
    expected_hash=$(printf '%s' "$APPIMAGE_SHA256" | tr '[:upper:]' '[:lower:]')
    if [ "$current_hash" = "$expected_hash" ]; then
      repair_integration
      ok "$APP_NAME $LATEST_VERSION is already installed and verified."
      return
    fi
    warn "The installed AppImage is damaged or incomplete; downloading a clean copy."
  fi

  if [ "$current_version" = "not installed" ]; then
    info "Installing $APP_NAME $LATEST_VERSION..."
  else
    info "Updating $APP_NAME from $current_version to $LATEST_VERSION..."
  fi

  TEMP_APPIMAGE=$(mktemp "$INSTALL_DIR/.${APPIMAGE_INSTALL_NAME}.XXXXXX")
  download "$APPIMAGE_URL" "$TEMP_APPIMAGE" "AppImage"
  verify_appimage "$TEMP_APPIMAGE" "$APPIMAGE_SHA256" "$APPIMAGE_SIZE"
  chmod 755 "$TEMP_APPIMAGE"

  # The temporary file is in the same directory, so this replacement is
  # atomic. A running old AppImage can safely finish from its existing inode.
  mv -f "$TEMP_APPIMAGE" "$APPIMAGE_PATH"
  TEMP_APPIMAGE=""

  TEMP_VERSION=$(mktemp "$INSTALL_DIR/.version.XXXXXX")
  printf '%s\n' "$LATEST_VERSION" >"$TEMP_VERSION"
  chmod 644 "$TEMP_VERSION"
  mv -f "$TEMP_VERSION" "$VERSION_PATH"
  TEMP_VERSION=""

  repair_integration
  [ "$LEGACY_APPIMAGE_PATH" = "$APPIMAGE_PATH" ] || rm -f "$LEGACY_APPIMAGE_PATH"

  ok "$APP_NAME $LATEST_VERSION is installed."
  printf '%s\n' " AppImage: $APPIMAGE_PATH" " Launcher: $DESKTOP_PATH"
  case ":$PATH:" in
    *":$BIN_DIR:"*) ;;
    *) warn "$BIN_DIR is not in PATH. Restart your shell before using '$CLI_COMMAND'." ;;
  esac
  if ! has_fuse2 || [ ! -r /dev/fuse ] || [ ! -w /dev/fuse ]; then
    info "FUSE 2 is unavailable; the launcher will use AppImage extraction mode automatically."
  fi
}

show_status() {
  validate_environment
  current_version=$(installed_version)
  printf '%s\n' "Installed: $current_version" "AppImage:  $APPIMAGE_PATH"

  if [ "$current_version" = "not installed" ]; then
    exit 1
  fi

  mkdir -p "$INSTALL_DIR"
  TEMP_MANIFEST=$(mktemp "$INSTALL_DIR/.latest.XXXXXX.yml")
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --retry 2 --connect-timeout 10 --max-time 45 -o "$TEMP_MANIFEST" "$MANIFEST_URL" || {
      warn "Could not check the latest release. The installed app was not changed."
      return
    }
  elif command -v wget >/dev/null 2>&1; then
    wget -q --tries=2 --timeout=20 -O "$TEMP_MANIFEST" "$MANIFEST_URL" || {
      warn "Could not check the latest release. The installed app was not changed."
      return
    }
  else
    warn "Install curl or wget to check for updates."
    return
  fi

  validate_manifest "$TEMP_MANIFEST"
  printf '%s\n' "Latest:    $LATEST_VERSION"
  if [ "$current_version" = "$LATEST_VERSION" ]; then
    current_hash=$(sha256_file "$APPIMAGE_PATH" | tr '[:upper:]' '[:lower:]')
    expected_hash=$(printf '%s' "$APPIMAGE_SHA256" | tr '[:upper:]' '[:lower:]')
    [ "$current_hash" = "$expected_hash" ] || fail "The installed AppImage is damaged. Run: $CLI_COMMAND update"
    ok "Installation is current and verified."
  else
    warn "An update is available. Run: $CLI_COMMAND update"
  fi
}

repair_installation() {
  validate_environment
  [ -x "$APPIMAGE_PATH" ] || fail "$APP_NAME is not installed. Run: $CLI_COMMAND install"
  acquire_lock
  repair_integration
  ok "Launchers, command, and desktop integration were repaired."
}

safe_remove_user_data() {
  case "$USER_DATA_PATH" in
    "$CONFIG_HOME"/*)
      [ "$USER_DATA_PATH" != "$CONFIG_HOME" ] || fail "Refusing to remove the config root."
      rm -rf "$USER_DATA_PATH"
      ;;
    *) fail "Refusing to remove an unsafe user-data path." ;;
  esac
}

uninstall_app() {
  validate_environment
  acquire_lock
  rm -f \
    "$APPIMAGE_PATH" "$LEGACY_APPIMAGE_PATH" "$VERSION_PATH" \
    "$APP_COMMAND_PATH" "$CLI_PATH" "$DESKTOP_PATH" \
    "$ICON_PATH" "$LEGACY_ICON_PATH" "$AUTOSTART_PATH"
  refresh_desktop_cache

  if [ "$PURGE_DATA" -eq 1 ]; then
    safe_remove_user_data
    ok "$APP_NAME and its user data were removed."
  else
    ok "$APP_NAME was removed. User data was kept at: $USER_DATA_PATH"
  fi
}

print_help() {
  cat <<EOF
$APP_NAME Linux installer

Usage:
  sh install.sh install       Install or safely update the AppImage
  sh install.sh status        Check the installed version and checksum
  sh install.sh repair        Recreate launchers, command, and icon
  sh install.sh uninstall     Remove the app and keep user data
  sh install.sh uninstall --purge
                              Also remove user data and settings

Installed commands:
  $APP_SLUG                   Start $APP_NAME
  $CLI_COMMAND open           Start $APP_NAME
  $CLI_COMMAND update         Download and verify the latest release
  $CLI_COMMAND status         Show installation status
EOF
}

case "$ACTION" in
  install|update) install_app ;;
  status) show_status ;;
  repair) repair_installation ;;
  uninstall|remove) uninstall_app ;;
  help|--help|-h) print_help ;;
  *) fail "Unknown command: $ACTION. Run 'sh install.sh help'." ;;
esac
