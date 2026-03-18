#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[setup] Building Mirofish agent image..."
docker build -t yggdrasight-mirofish-agent "$ROOT/docker/mirofish/agent"

echo "[setup] Starting Docker services..."
docker compose -f "$ROOT/docker-compose.yml" up -d

echo "[setup] Done. Run 'pnpm build && pnpm start' to launch the app."
