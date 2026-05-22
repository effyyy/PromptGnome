#!/usr/bin/env bash
# dev.sh — Start PromptGnome in local dev mode with verbose audit logging.
#
# Usage:
#   ./dev.sh                — default: verbose logging, Chrome target
#   ./dev.sh --quiet        — only warnings and errors
#   ./dev.sh --firefox      — target Firefox
#   ./dev.sh --edge         — target Edge
#   ./dev.sh --clean        — wipe build cache and node_modules, reinstall
#
# After running, load the unpacked extension from:
#   promptgnome/build/chrome-mv3-dev   (Chrome)
#   promptgnome/build/firefox-mv3-dev  (Firefox)
#   promptgnome/build/edge-mv3-dev     (Edge)

set -euo pipefail

cd "$(dirname "$0")"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
error() { echo -e "${RED}[error]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }

# ---------------------------------------------------------------------------
# Parse args
# ---------------------------------------------------------------------------
LOG_LEVEL="debug"
TARGET="chrome-mv3"
CLEAN=false

for arg in "$@"; do
  case "$arg" in
    --quiet)   LOG_LEVEL="warn" ;;
    --firefox) TARGET="firefox-mv3" ;;
    --edge)    TARGET="edge-mv3" ;;
    --clean)   CLEAN=true ;;
    --help|-h)
      echo "Usage: ./dev.sh [--quiet] [--firefox|--edge] [--clean]"
      echo ""
      echo "  --quiet     Only show warnings and errors"
      echo "  --firefox   Build for Firefox (Manifest V3)"
      echo "  --edge      Build for Edge (Manifest V3)"
      echo "  --clean     Wipe build cache and node_modules, then reinstall"
      echo "  --help      Show this help message"
      exit 0
      ;;
    *)
      warn "Unknown argument: $arg (ignored)"
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Pre-flight: Node.js
# ---------------------------------------------------------------------------
REQUIRED_NODE_MAJOR=18
PNPM_VERSION=10.33.0

if ! command -v node &>/dev/null; then
  error "Node.js is not installed."
  echo ""
  echo "  Install via nvm (recommended):"
  echo "    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "    nvm install 20"
  echo ""
  echo "  Or via Homebrew:"
  echo "    brew install node@20"
  exit 1
fi

NODE_MAJOR="$(node -e 'console.log(process.versions.node.split(".")[0])')"
if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  error "Node.js v${REQUIRED_NODE_MAJOR}+ required (found v$(node -v))."
  echo "  Upgrade with: nvm install 20"
  exit 1
fi
ok "Node.js $(node -v)"

# ---------------------------------------------------------------------------
# Pre-flight: pnpm — install automatically if missing
# ---------------------------------------------------------------------------
if ! command -v pnpm &>/dev/null; then
  warn "pnpm is not installed. Attempting to install..."

  if command -v corepack &>/dev/null; then
    info "Installing via corepack..."
    corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
  else
    error "Cannot auto-install pnpm because corepack is unavailable. Install pnpm ${PNPM_VERSION} manually:"
    echo "  corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate"
    exit 1
  fi

  # Verify the install succeeded
  if ! command -v pnpm &>/dev/null; then
    error "pnpm installation failed. Install pnpm ${PNPM_VERSION} manually."
    exit 1
  fi

  ok "pnpm installed successfully"
fi
ok "pnpm $(pnpm -v)"

# ---------------------------------------------------------------------------
# Clean mode
# ---------------------------------------------------------------------------
if [ "$CLEAN" = true ]; then
  info "Cleaning build artifacts and node_modules..."
  rm -rf node_modules build .plasmo
  info "Reinstalling dependencies..."
  pnpm install
  ok "Clean install complete"
fi

# ---------------------------------------------------------------------------
# Install dependencies if needed
# ---------------------------------------------------------------------------
if [ ! -d node_modules ]; then
  info "node_modules not found — running pnpm install..."
  if ! pnpm install; then
    error "pnpm install failed."
    echo ""
    echo "  Troubleshooting:"
    echo "    1. Delete node_modules and pnpm-lock.yaml, then retry:"
    echo "       rm -rf node_modules pnpm-lock.yaml && pnpm install"
    echo "    2. Check for Node.js version issues: node -v"
    echo "    3. Clear pnpm cache: pnpm store prune"
    exit 1
  fi
  ok "Dependencies installed"
fi

# ---------------------------------------------------------------------------
# Verify Plasmo is available
# ---------------------------------------------------------------------------
if ! pnpm exec plasmo --version &>/dev/null 2>&1; then
  warn "Plasmo binary not found in node_modules. Reinstalling..."
  pnpm install
  if ! pnpm exec plasmo --version &>/dev/null 2>&1; then
    error "Plasmo is not available after install. Check package.json dependencies."
    exit 1
  fi
fi
ok "Plasmo $(pnpm exec plasmo --version 2>/dev/null || echo 'installed')"

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
BUILD_DIR="build/${TARGET}-dev"

echo ""
echo "============================================"
echo "  PromptGnome — Dev Mode"
echo "============================================"
echo ""
echo "  Log level:      $LOG_LEVEL"
echo "  Target:         $TARGET"
echo "  Hot reload:     enabled"
echo "  Build output:   $BUILD_DIR"
echo ""
echo "How to use:"
echo "  1. Wait for the build to finish (watch for 'Built in X ms')"
if [ "$TARGET" = "firefox-mv3" ]; then
  echo "  2. Open Firefox > about:debugging#/runtime/this-firefox"
  echo "  3. Click 'Load Temporary Add-on' > select any file in:"
  echo "     $(pwd)/$BUILD_DIR"
else
  echo "  2. Open Chrome > chrome://extensions > Enable Developer mode"
  echo "  3. Click 'Load unpacked' > select:"
  echo "     $(pwd)/$BUILD_DIR"
fi
echo "  4. Open any supported AI chat (ChatGPT, Claude, Gemini)"
echo "  5. Open DevTools (F12) > Console tab"
echo "  6. Filter console by: PromptGnome"
echo ""
echo "Starting Plasmo dev server..."
echo "--------------------------------------------"
echo ""

# ---------------------------------------------------------------------------
# Launch Plasmo dev with development environment
# ---------------------------------------------------------------------------
export NODE_ENV=development
export PII_SHIELD_LOG_LEVEL="$LOG_LEVEL"

if [ "$TARGET" != "chrome-mv3" ]; then
  exec pnpm exec plasmo dev "--target=$TARGET"
else
  exec pnpm exec plasmo dev
fi
