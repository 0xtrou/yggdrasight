#!/bin/sh
# Container boot script — installs deps and starts data refresh loop.
# Called via: docker exec -d CONTAINER sh /workspace/.boot.sh
# Environment: MONGODB_URI, REFRESH_INTERVAL

set -e

echo "[boot] Starting container boot..."

# Install Node.js if not already available
if ! command -v node > /dev/null 2>&1; then
  echo "[boot] Installing Node.js..."
  apk add --no-cache nodejs 2>/dev/null
fi

# Install mongodb driver if not cached in /workspace/.deps
DEPS_DIR="/workspace/.deps"
if [ ! -d "$DEPS_DIR/node_modules/mongodb" ]; then
  echo "[boot] Installing mongodb driver..."
  # npm may not be installed; install it temporarily
  if ! command -v npm > /dev/null 2>&1; then
    apk add --no-cache npm 2>/dev/null
  fi
  mkdir -p "$DEPS_DIR"
  cd "$DEPS_DIR"
  npm init -y --silent 2>/dev/null || true
  npm install --no-save mongodb 2>/dev/null
  echo "[boot] mongodb driver installed"
else
  echo "[boot] mongodb driver already cached"
fi

# Kill any existing data-refresh process
pkill -f "data-refresh.mjs" 2>/dev/null || true

# Start the data refresh loop
echo "[boot] Starting data refresh loop..."
NODE_PATH="$DEPS_DIR/node_modules" exec node /workspace/.data-refresh.mjs
