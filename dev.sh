#!/usr/bin/env bash
set -e

# Resolve repository root
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "🎴 Starting Tjapza local development environment..."

# Check pocketbase binary
if [ ! -f "$ROOT_DIR/pb/pocketbase" ]; then
  echo "❌ PocketBase binary not found at pb/pocketbase"
  exit 1
fi

# Detect runtime (prefer bun, fallback to npm)
if command -v bun >/dev/null 2>&1; then
  JS_RUNNER="bun"
elif [ -f "$ROOT_DIR/bin/bun" ]; then
  JS_RUNNER="$ROOT_DIR/bin/bun"
else
  JS_RUNNER="npm"
fi

# 1. Build domain hooks bundle for PocketBase Goja runtime
echo "📦 Building domain hooks for PocketBase..."
(cd "$ROOT_DIR/web" && $JS_RUNNER run build:domain)

# 2. Start PocketBase in background
echo "🚀 Starting PocketBase backend on http://127.0.0.1:8090 ..."
"$ROOT_DIR/pb/pocketbase" serve --http 127.0.0.1:8090 &
PB_PID=$!

# Trap signals to cleanly shut down both servers on Ctrl+C
cleanup() {
  echo ""
  echo "🛑 Shutting down Tjapza development servers..."
  if [ -n "$PB_PID" ] && kill -0 "$PB_PID" 2>/dev/null; then
    kill "$PB_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup SIGINT SIGTERM EXIT

# Give PocketBase a moment to initialize
sleep 1

# 3. Start Vite dev server in foreground
echo "⚡ Starting Vite dev server on http://localhost:3000 ..."
(cd "$ROOT_DIR/web" && $JS_RUNNER run dev)
