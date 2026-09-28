#!/usr/bin/env sh
set -eu

# Aero P2P Chat installer for x86-64 Linux. Keep this file POSIX-compatible:
# users commonly run it directly through `curl ... | sh`.

APP_NAME="Aero P2P Chat"
APP_ID="de.zorblock.aerop2pchat"
APP_SLUG="aero-p2p-chat"
PACKAGE_NAME="aero-p2p-chat"
CLI_COMMAND="aerop2p"
REPO="Zorblock/AeroP2Pchat"
BRANCH="main"
APPIMAGE_RELEASE_NAME="Aero-P2P-Chat-Linux-x64.AppImage"
RPM_RELEASE_NAME="Aero-P2P-Chat-Linux-x64.rpm"
DEB_RELEASE_NAME="Aero-P2P-Chat-Linux-x64.deb"
APPIMAGE_INSTALL_NAME="Aero-P2P-Chat.AppImage"
SYSTEM_EXECUTABLE="/opt/Aero P2P Chat/aero-p2p-chat"

RELEASE_BASE="https://github.com/${REPO}/releases"
MANIFEST_URL="${RELEASE_BASE}/latest/download/latest.yml"
INSTALLER_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/install.sh"
ICON_URL="https://raw.githubusercontent.com/${REPO}/${BRANCH}/assets/linux-icons/512x512.png"

[ -n "${HOME:-}" ] || { printf '%s\n' "Error: HOME is not set." >&2; exit 1; }
case "$HOME" in /*) ;; *) printf '%s\n' "Error: HOME must be absolute." >&2; exit 1 ;; esac

case "${XDG_DATA_HOME:-}" in /*) DATA_HOME=$XDG_DATA_HOME ;; *) DATA_HOME="$HOME/.local/share" ;; esac
case "${XDG_CONFIG_HOME:-}" in /*) CONFIG_HOME=$XDG_CONFIG_HOME ;; *) CONFIG_HOME="$HOME/.config" ;; esac
case "${XDG_BIN_HOME:-}" in /*) BIN_DIR=$XDG_BIN_HOME ;; *) BIN_DIR="$HOME/.local/bin" ;; esac

INSTALL_DIR="$DATA_HOME/$APP_SLUG"
APPIMAGE_PATH="$INSTALL_DIR/$APPIMAGE_INSTALL_NAME"
LEGACY_APPIMAGE_PATH="$INSTALL_DIR/$APPIMAGE_RELEASE_NAME"
VERSION_PATH="$INSTALL_DIR/version"
METHOD_PATH="$INSTALL_DIR/install-method"
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
shift 2>/dev/null || true
PURGE_DATA=0
FORCE_FORMAT=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --purge) PURGE_DATA=1 ;;
    --appimage) FORCE_FORMAT=appimage ;;
    --rpm) FORCE_FORMAT=rpm ;;
    --deb) FORCE_FORMAT=deb ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; exit 2 ;;
  esac
  shift
done

TEMP_MANIFEST=""
TEMP_PAYLOAD=""
TEMP_PAYLOAD_DIR=""
TEMP_ICON=""
TEMP_VERSION=""
LOCK_HELD=0
SELECTED_FORMAT=""
PACKAGE_MANAGER=""
CURRENT_FORMAT="none"
LATEST_VERSION=""
ASSET_NAME=""
ASSET_URL=""
ASSET_SHA256=""
ASSET_SIZE=""

is_tty=0
[ -t 1 ] && is_tty=1
color() {
  color_code=$1
  shift
  if [ "$is_tty" -eq 1 ] && [ "${TERM:-dumb}" != "dumb" ]; then
    printf '\033[%sm%s\033[0m' "$color_code" "$*"
  else
    printf '%s' "$*"
  fi
}
intro() { printf '\n%s\n%s\n' "$(color '1;36' '┌  Aero P2P Chat')" "$(color 90 '│  Linux installer')"; }
step() { printf '%s %s\n' "$(color 36 '◇')" "$*"; }
detail() { printf '%s %s\n' "$(color 90 '│')" "$*"; }
ok() { printf '%s %s\n' "$(color 32 '◆')" "$*"; }
warn() { printf '%s %s\n' "$(color 33 '▲')" "$*" >&2; }
fail() { printf '%s %s\n' "$(color 31 '■')" "$*" >&2; exit 1; }
outro() { printf '%s %s\n\n' "$(color '1;32' '└')" "$*"; }

cleanup() {
  [ -z "$TEMP_MANIFEST" ] || rm -f "$TEMP_MANIFEST" || true
  [ -z "$TEMP_PAYLOAD" ] || rm -f "$TEMP_PAYLOAD" || true
  [ -z "$TEMP_PAYLOAD_DIR" ] || rmdir "$TEMP_PAYLOAD_DIR" 2>/dev/null || true
  [ -z "$TEMP_ICON" ] || rm -f "$TEMP_ICON" || true
  [ -z "$TEMP_VERSION" ] || rm -f "$TEMP_VERSION" || true
  if [ "$LOCK_HELD" -eq 1 ]; then
    rm -f "$LOCK_DIR/pid" || true
    rmdir "$LOCK_DIR" 2>/dev/null || true
    rmdir "$INSTALL_DIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT HUP INT TERM

require_command() { command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"; }

validate_environment() {
  [ "$(uname -s 2>/dev/null || true)" = "Linux" ] || fail "This installer only supports Linux."
  case "$(uname -m 2>/dev/null || true)" in
    x86_64|amd64) ;;
    *) fail "Only x86-64 Linux is currently supported." ;;
  esac
  for command_name in awk grep id mkdir mktemp sed tr wc; do require_command "$command_name"; done
  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    fail "Install curl or wget first, then run this installer again."
  fi
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
    *) kill -0 "$lock_pid" 2>/dev/null && fail "Another Aero installer is running (PID $lock_pid)." ;;
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
  download_label=$3
  step "Downloading $download_label"
  if command -v curl >/dev/null 2>&1; then
    if [ "$is_tty" -eq 1 ]; then
      curl --fail --location --show-error --progress-bar --retry 4 --retry-delay 2 \
        --connect-timeout 15 --max-time 1800 --output "$download_target" "$download_url" ||
        fail "Could not download $download_label."
    else
      curl --fail --location --show-error --silent --retry 4 --retry-delay 2 \
        --connect-timeout 15 --max-time 1800 --output "$download_target" "$download_url" ||
        fail "Could not download $download_label."
    fi
  else
    wget --tries=4 --timeout=30 --output-document="$download_target" "$download_url" ||
      fail "Could not download $download_label."
  fi
  [ -s "$download_target" ] || fail "The downloaded $download_label is empty."
}

read_manifest_value() {
  awk -v wanted="$1" '
    index($0, wanted ":") == 1 {
      value = substr($0, length(wanted) + 2)
      sub(/^[[:space:]]+/, "", value); sub(/[[:space:]\r]+$/, "", value)
      if (value ~ /^".*"$/) value = substr(value, 2, length(value) - 2)
      print value; exit
    }
  ' "$2"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{ print $1 }'
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{ print $NF }'
  else fail "Install sha256sum, shasum, or openssl first."
  fi
}

read_os_value() {
  [ -r /etc/os-release ] || return 0
  awk -F= -v wanted="$1" '$1 == wanted { value = substr($0, index($0, "=") + 1); gsub(/^"|"$/, "", value); print tolower(value); exit }' /etc/os-release
}

has_admin_access() { [ "$(id -u)" -eq 0 ] || command -v sudo >/dev/null 2>&1; }
run_admin() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi
}

installed_format() {
  if [ -r "$METHOD_PATH" ]; then
    recorded_method=$(awk 'NR == 1 { print; exit }' "$METHOD_PATH")
    case "$recorded_method" in
      appimage) [ -x "$APPIMAGE_PATH" ] && { printf '%s' appimage; return; } ;;
      rpm) command -v rpm >/dev/null 2>&1 && rpm -q "$PACKAGE_NAME" >/dev/null 2>&1 && { printf '%s' rpm; return; } ;;
      deb) command -v dpkg-query >/dev/null 2>&1 && dpkg-query -W -f='${Status}' "$PACKAGE_NAME" 2>/dev/null | grep -q 'install ok installed' && { printf '%s' deb; return; } ;;
    esac
  fi
  if command -v rpm >/dev/null 2>&1 && rpm -q "$PACKAGE_NAME" >/dev/null 2>&1; then printf '%s' rpm; return; fi
  if command -v dpkg-query >/dev/null 2>&1 && dpkg-query -W -f='${Status}' "$PACKAGE_NAME" 2>/dev/null | grep -q 'install ok installed'; then printf '%s' deb; return; fi
  if [ -x "$APPIMAGE_PATH" ] || [ -x "$LEGACY_APPIMAGE_PATH" ]; then printf '%s' appimage; return; fi
  printf '%s' none
}

choose_format() {
  CURRENT_FORMAT=$(installed_format)
  if [ -n "$FORCE_FORMAT" ]; then SELECTED_FORMAT=$FORCE_FORMAT
  else
    if [ "$CURRENT_FORMAT" != none ]; then SELECTED_FORMAT=$CURRENT_FORMAT
    else
      os_id=$(read_os_value ID)
      os_like=$(read_os_value ID_LIKE)
      case " $os_id $os_like " in
        *nobara*|*fedora*|*rhel*|*centos*|*rocky*|*alma*) SELECTED_FORMAT=rpm ;;
        *debian*|*ubuntu*|*linuxmint*|*pop*) SELECTED_FORMAT=deb ;;
        *) SELECTED_FORMAT=appimage ;;
      esac
    fi
  fi

  case "$SELECTED_FORMAT" in
    rpm)
      if command -v dnf >/dev/null 2>&1; then PACKAGE_MANAGER=dnf
      elif command -v microdnf >/dev/null 2>&1; then PACKAGE_MANAGER=microdnf
      elif command -v zypper >/dev/null 2>&1; then PACKAGE_MANAGER=zypper
      elif [ -n "$FORCE_FORMAT" ]; then fail "No supported RPM package manager was found."
      else warn "No supported RPM package manager found; using AppImage."; SELECTED_FORMAT=appimage
      fi
      ;;
    deb)
      if command -v apt-get >/dev/null 2>&1; then PACKAGE_MANAGER=apt-get
      elif [ -n "$FORCE_FORMAT" ]; then fail "apt-get was not found."
      else warn "apt-get was not found; using AppImage."; SELECTED_FORMAT=appimage
      fi
      ;;
  esac

  if [ "$SELECTED_FORMAT" != appimage ] && ! has_admin_access; then
    if [ -n "$FORCE_FORMAT" ]; then fail "Installing $SELECTED_FORMAT requires root or sudo."
    else warn "No sudo/root access; using the user-local AppImage."; SELECTED_FORMAT=appimage; PACKAGE_MANAGER=""
    fi
  fi
  detail "Selected package: $SELECTED_FORMAT${PACKAGE_MANAGER:+ via $PACKAGE_MANAGER}"
}

fetch_release_metadata() {
  TEMP_MANIFEST=$(mktemp "$INSTALL_DIR/.latest.XXXXXX.yml")
  download "$MANIFEST_URL" "$TEMP_MANIFEST" "release metadata"
  LATEST_VERSION=$(read_manifest_value version "$TEMP_MANIFEST")
  printf '%s' "$LATEST_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "latest.yml has an invalid version."
}

select_asset() {
  case "$SELECTED_FORMAT" in
    rpm)
      ASSET_NAME=$RPM_RELEASE_NAME
      ASSET_URL=$(read_manifest_value linuxRpmUrl "$TEMP_MANIFEST")
      ASSET_SHA256=$(read_manifest_value linuxRpmSha256 "$TEMP_MANIFEST")
      ASSET_SIZE=$(read_manifest_value linuxRpmSize "$TEMP_MANIFEST")
      ;;
    deb)
      ASSET_NAME=$DEB_RELEASE_NAME
      ASSET_URL=$(read_manifest_value linuxDebUrl "$TEMP_MANIFEST")
      ASSET_SHA256=$(read_manifest_value linuxDebSha256 "$TEMP_MANIFEST")
      ASSET_SIZE=$(read_manifest_value linuxDebSize "$TEMP_MANIFEST")
      ;;
    *)
      ASSET_NAME=$APPIMAGE_RELEASE_NAME
      ASSET_URL=$(read_manifest_value linuxUrl "$TEMP_MANIFEST")
      ASSET_SHA256=$(read_manifest_value linuxSha256 "$TEMP_MANIFEST")
      ASSET_SIZE=$(read_manifest_value linuxSize "$TEMP_MANIFEST")
      ;;
  esac

  if [ -z "$ASSET_URL" ] && [ "$SELECTED_FORMAT" != appimage ] && [ -z "$FORCE_FORMAT" ]; then
    if [ "$CURRENT_FORMAT" = "$SELECTED_FORMAT" ]; then
      fail "The latest release has no $SELECTED_FORMAT package; the existing installation was not changed."
    fi
    warn "The latest release has no $SELECTED_FORMAT package; using AppImage."
    SELECTED_FORMAT=appimage
    PACKAGE_MANAGER=""
    select_asset
    return
  fi

  expected_url="${RELEASE_BASE}/download/v${LATEST_VERSION}/${ASSET_NAME}"
  [ "$ASSET_URL" = "$expected_url" ] || fail "Release metadata contains an unexpected $SELECTED_FORMAT URL."
  printf '%s' "$ASSET_SHA256" | grep -Eqi '^[0-9a-f]{64}$' || fail "Release metadata has no valid SHA-256 checksum."
  case "$ASSET_SIZE" in ''|*[!0-9]*) fail "Release metadata has an invalid file size." ;; esac
  [ "$ASSET_SIZE" -gt 0 ] || fail "Release metadata describes an empty package."
}

verify_payload() {
  step "Verifying download"
  actual_size=$(wc -c <"$1" | awk '{ print $1 }')
  [ "$actual_size" = "$ASSET_SIZE" ] || fail "Downloaded size does not match release metadata."
  actual_hash=$(sha256_file "$1" | tr '[:upper:]' '[:lower:]')
  expected_hash=$(printf '%s' "$ASSET_SHA256" | tr '[:upper:]' '[:lower:]')
  [ "$actual_hash" = "$expected_hash" ] || fail "SHA-256 verification failed."
  ok "Download verified"
}

shell_single_quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/'\\\\''/g")"; }
desktop_quote() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/`/\\`/g; s/\$/\\$/g'; }

write_appimage_launcher() {
  mkdir -p "$BIN_DIR"
  quoted_appimage=$(shell_single_quote "$APPIMAGE_PATH")
  launcher_temp=$(mktemp "$BIN_DIR/.${APP_SLUG}.XXXXXX")
  cat >"$launcher_temp" <<EOF
#!/usr/bin/env sh
set -eu
APPIMAGE_PATH=$quoted_appimage
[ -x "\$APPIMAGE_PATH" ] || { printf '%s\n' 'Aero P2P Chat is not installed.' >&2; exit 1; }
if [ ! -r /dev/fuse ] || [ ! -w /dev/fuse ]; then export APPIMAGE_EXTRACT_AND_RUN=1; fi
exec "\$APPIMAGE_PATH" "\$@"
EOF
  chmod 755 "$launcher_temp"
  mv -f "$launcher_temp" "$APP_COMMAND_PATH"
}

write_native_launcher() {
  mkdir -p "$BIN_DIR"
  quoted_target=$(shell_single_quote "$SYSTEM_EXECUTABLE")
  launcher_temp=$(mktemp "$BIN_DIR/.${APP_SLUG}.XXXXXX")
  cat >"$launcher_temp" <<EOF
#!/usr/bin/env sh
set -eu
TARGET=$quoted_target
[ -x "\$TARGET" ] || { printf '%s\n' 'Aero P2P Chat is not installed.' >&2; exit 1; }
exec "\$TARGET" "\$@"
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
  open|run|start) shift || true; exec "\$APP_COMMAND" "\$@" ;;
  install|update|status|repair|uninstall)
    temp_installer=\$(mktemp) || exit 1
    trap 'rm -f "\$temp_installer"' EXIT HUP INT TERM
    if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 4 --connect-timeout 15 --max-time 120 -o "\$temp_installer" "\$INSTALLER_URL"
    elif command -v wget >/dev/null 2>&1; then wget -q --tries=4 --timeout=30 -O "\$temp_installer" "\$INSTALLER_URL"
    else printf '%s\n' 'Install curl or wget first.' >&2; exit 1; fi
    [ -s "\$temp_installer" ] || exit 1
    shift || true
    sh "\$temp_installer" "\$command_name" "\$@"
    ;;
  help|--help|-h)
    printf '%s\n' '$APP_NAME' '' 'Commands:' \
      '  $CLI_COMMAND open       Start the app' \
      '  $CLI_COMMAND update     Install the latest release' \
      '  $CLI_COMMAND status     Show installation status' \
      '  $CLI_COMMAND repair     Reinstall and repair integration' \
      '  $CLI_COMMAND uninstall  Remove the app but keep user data'
    ;;
  *) printf 'Unknown command: %s\n' "\$command_name" >&2; exit 2 ;;
esac
EOF
  chmod 755 "$cli_temp"
  mv -f "$cli_temp" "$CLI_PATH"
}

write_desktop_entry() {
  mkdir -p "$APPLICATIONS_DIR"
  exec_value=$(desktop_quote "$APP_COMMAND_PATH")
  desktop_temp=$(mktemp "$APPLICATIONS_DIR/.${APP_ID}.XXXXXX")
  cat >"$desktop_temp" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=$APP_NAME
Comment=Private peer-to-peer chat
Exec="$exec_value" %U
TryExec="$exec_value"
Icon=$APP_ID
Terminal=false
Categories=Network;InstantMessaging;Chat;
StartupWMClass=$APP_ID
StartupNotify=true
EOF
  chmod 644 "$desktop_temp"
  mv -f "$desktop_temp" "$DESKTOP_PATH"
  if command -v desktop-file-validate >/dev/null 2>&1; then
    desktop-file-validate "$DESKTOP_PATH" >/dev/null 2>&1 || warn "The desktop launcher could not be validated."
  fi
}

install_icon() {
  mkdir -p "$ICON_DIR"
  TEMP_ICON=$(mktemp "$ICON_DIR/.${APP_ID}.XXXXXX")
  if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 3 --connect-timeout 15 --max-time 120 -o "$TEMP_ICON" "$ICON_URL" || return 1
  else wget -q --tries=3 --timeout=30 -O "$TEMP_ICON" "$ICON_URL" || return 1; fi
  [ -s "$TEMP_ICON" ] || return 1
  png_header=$(od -An -tx1 -N8 "$TEMP_ICON" 2>/dev/null | tr -d ' \n')
  [ "$png_header" = "89504e470d0a1a0a" ] || return 1
  chmod 644 "$TEMP_ICON"; mv -f "$TEMP_ICON" "$ICON_PATH"; TEMP_ICON=""
}

refresh_desktop_cache() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q "$ICON_ROOT" >/dev/null 2>&1 || true
}

record_method() {
  method_temp=$(mktemp "$INSTALL_DIR/.method.XXXXXX")
  printf '%s\n' "$SELECTED_FORMAT" >"$method_temp"
  chmod 644 "$method_temp"
  mv -f "$method_temp" "$METHOD_PATH"
}

repair_appimage_integration() {
  write_appimage_launcher
  write_cli
  write_desktop_entry
  if [ ! -s "$ICON_PATH" ] && ! install_icon; then warn "Could not install the icon; the app remains usable."; fi
  refresh_desktop_cache
}

cleanup_appimage_installation() {
  rm -f "$APPIMAGE_PATH" "$LEGACY_APPIMAGE_PATH" "$VERSION_PATH" "$DESKTOP_PATH" "$ICON_PATH" "$LEGACY_ICON_PATH"
  refresh_desktop_cache
}

install_appimage() {
  current_version=none
  [ ! -r "$VERSION_PATH" ] || current_version=$(awk 'NR == 1 { print; exit }' "$VERSION_PATH")
  if [ -x "$APPIMAGE_PATH" ] && [ "$current_version" = "$LATEST_VERSION" ]; then
    current_hash=$(sha256_file "$APPIMAGE_PATH" | tr '[:upper:]' '[:lower:]')
    expected_hash=$(printf '%s' "$ASSET_SHA256" | tr '[:upper:]' '[:lower:]')
    if [ "$current_hash" = "$expected_hash" ]; then
      step "Repairing desktop integration"
      repair_appimage_integration
      record_method
      ok "$APP_NAME $LATEST_VERSION is already installed and verified"
      return
    fi
  fi

  TEMP_PAYLOAD_DIR=$(mktemp -d "$INSTALL_DIR/.payload.XXXXXX")
  TEMP_PAYLOAD="$TEMP_PAYLOAD_DIR/$ASSET_NAME"
  download "$ASSET_URL" "$TEMP_PAYLOAD" "AppImage $LATEST_VERSION"
  verify_payload "$TEMP_PAYLOAD"
  chmod 755 "$TEMP_PAYLOAD"
  mv -f "$TEMP_PAYLOAD" "$APPIMAGE_PATH"; TEMP_PAYLOAD=""
  rmdir "$TEMP_PAYLOAD_DIR"; TEMP_PAYLOAD_DIR=""
  TEMP_VERSION=$(mktemp "$INSTALL_DIR/.version.XXXXXX")
  printf '%s\n' "$LATEST_VERSION" >"$TEMP_VERSION"; chmod 644 "$TEMP_VERSION"
  mv -f "$TEMP_VERSION" "$VERSION_PATH"; TEMP_VERSION=""
  rm -f "$LEGACY_APPIMAGE_PATH"
  step "Creating launcher, menu entry, and icon"
  repair_appimage_integration
  record_method
  ok "$APP_NAME $LATEST_VERSION installed as AppImage"
  detail "App: $APPIMAGE_PATH"
}

validate_native_package() {
  case "$SELECTED_FORMAT" in
    rpm)
      require_command rpm
      [ "$(rpm -qp --queryformat '%{NAME}' "$TEMP_PAYLOAD")" = "$PACKAGE_NAME" ] || fail "RPM package name is invalid."
      [ "$(rpm -qp --queryformat '%{VERSION}' "$TEMP_PAYLOAD")" = "$LATEST_VERSION" ] || fail "RPM version is invalid."
      [ "$(rpm -qp --queryformat '%{ARCH}' "$TEMP_PAYLOAD")" = x86_64 ] || fail "RPM architecture is invalid."
      ;;
    deb)
      require_command dpkg-deb
      [ "$(dpkg-deb -f "$TEMP_PAYLOAD" Package)" = "$PACKAGE_NAME" ] || fail "DEB package name is invalid."
      [ "$(dpkg-deb -f "$TEMP_PAYLOAD" Version)" = "$LATEST_VERSION" ] || fail "DEB version is invalid."
      [ "$(dpkg-deb -f "$TEMP_PAYLOAD" Architecture)" = amd64 ] || fail "DEB architecture is invalid."
      ;;
  esac
}

install_native_package() {
  TEMP_PAYLOAD_DIR=$(mktemp -d "$INSTALL_DIR/.payload.XXXXXX")
  TEMP_PAYLOAD="$TEMP_PAYLOAD_DIR/$ASSET_NAME"
  download "$ASSET_URL" "$TEMP_PAYLOAD" "$SELECTED_FORMAT package $LATEST_VERSION"
  verify_payload "$TEMP_PAYLOAD"
  validate_native_package
  step "Installing package and required dependencies"
  if [ "$ACTION" = repair ]; then
    case "$PACKAGE_MANAGER" in
      dnf) run_admin dnf reinstall -y "$TEMP_PAYLOAD" ;;
      microdnf) run_admin microdnf reinstall -y "$TEMP_PAYLOAD" ;;
      zypper) run_admin zypper --non-interactive install --force --allow-unsigned-rpm "$TEMP_PAYLOAD" ;;
      apt-get) run_admin apt-get install --reinstall -y "$TEMP_PAYLOAD" ;;
      *) fail "Unsupported package manager." ;;
    esac
  else
    case "$PACKAGE_MANAGER" in
      dnf) run_admin dnf install -y "$TEMP_PAYLOAD" ;;
      microdnf) run_admin microdnf install -y "$TEMP_PAYLOAD" ;;
      zypper) run_admin zypper --non-interactive install --allow-unsigned-rpm "$TEMP_PAYLOAD" ;;
      apt-get) run_admin apt-get install -y "$TEMP_PAYLOAD" ;;
      *) fail "Unsupported package manager." ;;
    esac
  fi
  [ -x "$SYSTEM_EXECUTABLE" ] || fail "The package manager finished, but the application executable is missing."
  [ -r "/usr/share/applications/$APP_ID.desktop" ] || fail "The system desktop entry is missing."
  cleanup_appimage_installation
  write_native_launcher
  write_cli
  record_method
  ok "$APP_NAME $LATEST_VERSION installed from $SELECTED_FORMAT"
  detail "Dependencies were resolved by $PACKAGE_MANAGER"
}

install_or_update() {
  validate_environment
  acquire_lock
  choose_format
  fetch_release_metadata
  select_asset
  if [ "$SELECTED_FORMAT" = appimage ]; then install_appimage; else install_native_package; fi
  case ":$PATH:" in *":$BIN_DIR:"*) ;; *) warn "$BIN_DIR is not in PATH; restart your shell to use '$CLI_COMMAND'." ;; esac
  outro "Installation complete"
}

installed_version() {
  case "$1" in
    rpm) rpm -q --queryformat '%{VERSION}' "$PACKAGE_NAME" 2>/dev/null || printf unknown ;;
    deb) dpkg-query -W -f='${Version}' "$PACKAGE_NAME" 2>/dev/null || printf unknown ;;
    appimage) [ ! -r "$VERSION_PATH" ] || awk 'NR == 1 { print; exit }' "$VERSION_PATH" ;;
    *) printf 'not installed' ;;
  esac
}

compare_versions() {
  awk -v left="$1" -v right="$2" 'BEGIN {
    split(left, a, "."); split(right, b, ".")
    for (i = 1; i <= 3; i++) {
      if ((a[i] + 0) > (b[i] + 0)) { print 1; exit }
      if ((a[i] + 0) < (b[i] + 0)) { print -1; exit }
    }
    print 0
  }'
}

show_status() {
  validate_environment
  current_format=$(installed_format)
  current_version=$(installed_version "$current_format")
  detail "Method: $current_format"
  detail "Installed: ${current_version:-unknown}"
  [ "$current_format" != none ] || fail "$APP_NAME is not installed."
  mkdir -p "$INSTALL_DIR"
  fetch_release_metadata
  detail "Latest: $LATEST_VERSION"
  if [ "$current_version" = "$LATEST_VERSION" ]; then
    if [ "$current_format" = appimage ]; then
      SELECTED_FORMAT=appimage
      select_asset
      current_hash=$(sha256_file "$APPIMAGE_PATH" | tr '[:upper:]' '[:lower:]')
      expected_hash=$(printf '%s' "$ASSET_SHA256" | tr '[:upper:]' '[:lower:]')
      [ "$current_hash" = "$expected_hash" ] || fail "The installed AppImage is damaged; run '$CLI_COMMAND repair'."
    fi
    ok "Installation is current and verified"
  elif [ "$(compare_versions "$current_version" "$LATEST_VERSION")" -gt 0 ]; then
    warn "Installed version is newer than the latest published release."
  else warn "Update available: run '$CLI_COMMAND update'."; fi
  outro "Status check complete"
}

uninstall_native_package() {
  format=$1
  step "Removing $format package"
  case "$format" in
    rpm)
      if command -v dnf >/dev/null 2>&1; then run_admin dnf remove -y "$PACKAGE_NAME"
      elif command -v microdnf >/dev/null 2>&1; then run_admin microdnf remove -y "$PACKAGE_NAME"
      elif command -v zypper >/dev/null 2>&1; then run_admin zypper --non-interactive remove "$PACKAGE_NAME"
      else fail "No supported RPM package manager found."; fi
      ;;
    deb) command -v apt-get >/dev/null 2>&1 || fail "apt-get was not found."; run_admin apt-get remove -y "$PACKAGE_NAME" ;;
  esac
}

safe_remove_user_data() {
  case "$USER_DATA_PATH" in "$CONFIG_HOME"/*) [ "$USER_DATA_PATH" != "$CONFIG_HOME" ] || fail "Unsafe config path."; rm -rf "$USER_DATA_PATH" ;; *) fail "Unsafe user-data path." ;; esac
}

uninstall_app() {
  validate_environment
  acquire_lock
  current_format=$(installed_format)
  [ "$current_format" != none ] || fail "$APP_NAME is not installed."
  case "$current_format" in rpm|deb) has_admin_access || fail "Uninstalling the system package requires root or sudo."; uninstall_native_package "$current_format" ;; esac
  cleanup_appimage_installation
  rm -f "$APP_COMMAND_PATH" "$CLI_PATH" "$METHOD_PATH" "$AUTOSTART_PATH"
  if [ "$PURGE_DATA" -eq 1 ]; then safe_remove_user_data; ok "Application and user data removed"
  else ok "Application removed; user data kept at $USER_DATA_PATH"; fi
  outro "Uninstall complete"
}

print_help() {
  cat <<EOF
$APP_NAME Linux installer

Usage:
  sh install.sh install               Detect and install the best package
  sh install.sh update                Update using the same package format
  sh install.sh status                Show installed and latest versions
  sh install.sh repair                Reinstall or repair desktop integration
  sh install.sh uninstall [--purge]   Remove Aero; optionally remove user data

Package overrides:
  --rpm       Force RPM (dnf/microdnf/zypper)
  --deb       Force DEB (apt-get)
  --appimage  Force a user-local AppImage installation
EOF
}

intro
case "$ACTION" in
  install|update) install_or_update ;;
  repair) FORCE_FORMAT=$(installed_format); [ "$FORCE_FORMAT" != none ] || fail "$APP_NAME is not installed."; install_or_update ;;
  status) show_status ;;
  uninstall|remove) uninstall_app ;;
  help|--help|-h) print_help ;;
  *) fail "Unknown command: $ACTION. Run 'sh install.sh help'." ;;
esac
