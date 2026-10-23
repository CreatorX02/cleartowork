#!/usr/bin/env bash
set -euo pipefail

# scripts/mcp_verify.sh
# Usage: ./scripts/mcp_verify.sh [--install]
# Ensure RAILWAY_TOKEN is exported in your environment, or provide it in a .env file.
# If a .env exists in the repo root, load it once for convenience.
INSTALL_DEPS=0
if [ "${1-}" = "--install" ]; then
  INSTALL_DEPS=1
fi

if [ -f ".env" ]; then
  # shellcheck disable=SC1091
  set -a
  . ".env"
  set +a
fi

if [ -z "${RAILWAY_TOKEN-}" ]; then
  echo "RAILWAY_TOKEN is not set. Please export RAILWAY_TOKEN=... or create a .env and load it before running this script."
  echo "Example: export RAILWAY_TOKEN=\"<token>\""
  exit 1
fi

if [ "$INSTALL_DEPS" -eq 1 ]; then
  echo "Installing dependencies..."
  if [ -f "package-lock.json" ]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi
fi

if [ -x "./node_modules/.bin/railway" ]; then
  RAILWAY_CMD=("./node_modules/.bin/railway")
elif command -v railway >/dev/null 2>&1; then
  RAILWAY_CMD=("railway")
else
  RAILWAY_CMD=("npx" "railway")
fi

echo "Starting railway MCP (${RAILWAY_CMD[*]}) — logs will stream to stdout. Press Ctrl-C to stop."

# Run railway mcp; allow it to run in foreground so you can see permission/tool errors
"${RAILWAY_CMD[@]}" mcp

# If you need to run headless or capture logs, redirect output to a file:
# railway mcp > mcp.log 2>&1 &
# tail -f mcp.log
