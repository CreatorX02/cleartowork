#!/usr/bin/env bash
set -euo pipefail

# scripts/mcp_verify.sh
# Usage: ./scripts/mcp_verify.sh
# Ensure RAILWAY_TOKEN is exported in your environment, or provide it in a .env file.

if [ -f ".env" ]; then
  # Load local env vars for verification convenience.
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

echo "Installing dependencies (if needed)..."
if [ -f "package-lock.json" ]; then
  npm ci --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

echo "Starting railway MCP (via npx) — logs will stream to stdout. Press Ctrl-C to stop."

# Run railway mcp; allow it to run in foreground so you can see permission/tool errors
npx railway mcp

# If you need to run headless or capture logs, redirect output to a file:
# npx railway mcp > mcp.log 2>&1 &
# tail -f mcp.log
