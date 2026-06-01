#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

HOST="${HOST:-127.0.0.1}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
OPEN_BROWSER="${OPEN_BROWSER:-1}"
CLASSLOOP_SKIP_INSTALL="${CLASSLOOP_SKIP_INSTALL:-0}"

usage() {
  cat <<'EOF'
ClassLoop launcher

Usage:
  ./run.sh                    Start the macOS Swift app on Mac, Electron elsewhere
  ./run.sh --dev              Start the browser dev server
  ./run.sh --check-env        Validate launcher env loading without starting app
  ./run.sh --packaged [path]  Launch a packaged app build
  ./run.sh --package-mac      Build the Apple silicon Swift macOS DMG/ZIP
  ./run.sh --package-electron-mac Build the legacy Electron macOS DMG/ZIP
  ./run.sh --package-win      Build Windows x64/arm64 packages
  ./run.sh --package-linux    Build Linux x64/arm64 AppImages
  ./run.sh --package-swift-mac Build the native Swift macOS DMG/ZIP
  ./run.sh --package-all      Build all desktop variants from the current local source
  ./run.sh --help             Show this help

Environment:
  HOST=127.0.0.1              Dev server host
  FRONTEND_PORT=5173          Dev server port
  OPEN_BROWSER=0              Do not open browser for --dev
  CLASSLOOP_SKIP_INSTALL=1    Do not auto-install missing dependencies
EOF
}

mode="${1:---desktop}"
if [ "$mode" = "-h" ]; then
  mode="--help"
fi

if [ "$mode" = "--help" ]; then
  usage
  exit 0
fi

require_local_toolchain() {
  local required_bins=(npm node)
  for bin in "${required_bins[@]}"; do
    if ! command -v "$bin" >/dev/null 2>&1; then
      echo "ClassLoop needs '$bin' on PATH before it can install or run dependencies." >&2
      exit 1
    fi
  done
}

load_env_file() {
  local env_file="$1"
  local line trimmed key value line_number=0

  while IFS= read -r line || [ -n "$line" ]; do
    line_number=$((line_number + 1))
    line="${line%$'\r'}"
    trimmed="${line#"${line%%[![:space:]]*}"}"
    trimmed="${trimmed%"${trimmed##*[![:space:]]}"}"

    if [ -z "$trimmed" ] || [[ "$trimmed" == \#* ]]; then
      continue
    fi
    if [[ "$trimmed" == export[[:space:]]* ]]; then
      trimmed="${trimmed#export }"
      trimmed="${trimmed#"${trimmed%%[![:space:]]*}"}"
    fi
    if [[ "$trimmed" != [A-Za-z_]*=* ]]; then
      echo "Skipping $env_file line $line_number; expected KEY=VALUE." >&2
      continue
    fi

    key="${trimmed%%=*}"
    value="${trimmed#*=}"
    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"

    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      echo "Skipping $env_file line $line_number; invalid environment variable name." >&2
      continue
    fi
    if [[ "$value" == \"*\" && "$value" == *\" && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' && ${#value} -ge 2 ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$key=$value"
  done < "$env_file"
}

load_local_env() {
  if [ -f ".env.local" ]; then
    load_env_file ".env.local"
  fi
}

ensure_dependencies() {
  if [ "$CLASSLOOP_SKIP_INSTALL" = "1" ]; then
    return
  fi

  local missing=0
  for package_bin in electron tsc vite playwright; do
    if [ ! -x "node_modules/.bin/$package_bin" ]; then
      missing=1
    fi
  done

  if [ ! -d "node_modules" ] || [ "$missing" -eq 1 ]; then
    npm run bootstrap
  fi
}

run_dev_server() {
  echo "Starting ClassLoop dev server at http://$HOST:$FRONTEND_PORT"
  ./node_modules/.bin/vite --host "$HOST" --port "$FRONTEND_PORT" --strictPort &
  dev_pid=$!

  cleanup() {
    kill "$dev_pid" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT INT TERM

  for _ in $(seq 1 60); do
    if command -v curl >/dev/null 2>&1 && curl -fsS "http://$HOST:$FRONTEND_PORT" >/dev/null 2>&1; then
      break
    fi
    if ! kill -0 "$dev_pid" >/dev/null 2>&1; then
      wait "$dev_pid"
    fi
    sleep 1
  done

  if [ "$OPEN_BROWSER" != "0" ]; then
    if command -v open >/dev/null 2>&1; then
      open "http://$HOST:$FRONTEND_PORT"
    elif command -v xdg-open >/dev/null 2>&1; then
      xdg-open "http://$HOST:$FRONTEND_PORT" >/dev/null 2>&1 || true
    else
      echo "Open http://$HOST:$FRONTEND_PORT in your browser."
    fi
  else
    echo "ClassLoop dev server is ready at http://$HOST:$FRONTEND_PORT"
  fi

  wait "$dev_pid"
}

packaged_app_path() {
  case "$(uname -s)" in
    Darwin)
      if [ "$(uname -m)" != "arm64" ]; then
        echo "ClassLoop macOS packages are Apple silicon only. Use ./run.sh for local development on this Mac." >&2
        exit 1
      fi
      echo "$ROOT_DIR/release/swift-mac-arm64/ClassLoop.app/Contents/MacOS/ClassLoop"
      ;;
    Linux)
      echo "$ROOT_DIR/release/linux-unpacked/classloop"
      ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "$ROOT_DIR/release/win-unpacked/ClassLoop.exe"
      ;;
    *)
      echo "Unsupported packaged-app platform: $(uname -s)" >&2
      exit 1
      ;;
  esac
}

run_packaged_app() {
  local app_path="${1:-}"
  if [ -z "$app_path" ]; then
    app_path="$(packaged_app_path)"
  fi

  if [ ! -x "$app_path" ]; then
    echo "Packaged ClassLoop app not found or not executable:" >&2
    echo "  $app_path" >&2
    echo "Build it first with npm run package:mac, npm run package:win, or npm run package:linux." >&2
    exit 1
  fi

  echo "Launching packaged ClassLoop app:"
  echo "  $app_path"
  "$app_path"
}

package_macos() {
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "macOS packaging must run on macOS." >&2
    exit 1
  fi
  if [ "$(uname -m)" != "arm64" ]; then
    echo "ClassLoop macOS packaging is Apple silicon arm64 only." >&2
    exit 1
  fi
  npm run package:mac
}

package_electron_macos() {
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "Legacy Electron macOS packaging must run on macOS." >&2
    exit 1
  fi
  if [ "$(uname -m)" != "arm64" ]; then
    echo "ClassLoop macOS packaging is Apple silicon arm64 only." >&2
    exit 1
  fi
  npm run package:mac:electron
}

package_windows() {
  npm run package:win
}

package_linux() {
  npm run package:linux
}

package_swift_macos() {
  if [ "$(uname -s)" != "Darwin" ]; then
    echo "Swift macOS builds must run on macOS." >&2
    exit 1
  fi
  npm run swift:mac:package
}

package_all_desktops() {
  npm run package:all
}

case "$mode" in
  --help)
    usage
    ;;
  --desktop)
    require_local_toolchain
    load_local_env
    ensure_dependencies
    if [ "$(uname -s)" = "Darwin" ]; then
      npm run swift:mac:run
    else
      npm start
    fi
    ;;
  --dev)
    require_local_toolchain
    load_local_env
    ensure_dependencies
    run_dev_server
    ;;
  --check-env)
    require_local_toolchain
    load_local_env
    echo "ClassLoop launcher environment loaded successfully."
    ;;
  --packaged)
    run_packaged_app "${2:-}"
    ;;
  --package-mac)
    require_local_toolchain
    load_local_env
    ensure_dependencies
    package_macos
    ;;
  --package-electron-mac)
    require_local_toolchain
    load_local_env
    ensure_dependencies
    package_electron_macos
    ;;
  --package-win)
    require_local_toolchain
    load_local_env
    ensure_dependencies
    package_windows
    ;;
  --package-linux)
    require_local_toolchain
    load_local_env
    ensure_dependencies
    package_linux
    ;;
  --package-swift-mac)
    require_local_toolchain
    load_local_env
    ensure_dependencies
    package_swift_macos
    ;;
  --package-all)
    require_local_toolchain
    load_local_env
    ensure_dependencies
    package_all_desktops
    ;;
  *)
    echo "Unknown ClassLoop launcher option: $mode" >&2
    echo >&2
    usage >&2
    exit 2
    ;;
esac
