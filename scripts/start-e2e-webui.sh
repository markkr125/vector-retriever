#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Defaults for deterministic E2E runs (can be overridden by env)
: "${MOCK_OLLAMA_HOST:=127.0.0.1}"
: "${MOCK_OLLAMA_PORT:=11434}"
: "${OLLAMA_URL:=http://${MOCK_OLLAMA_HOST}:${MOCK_OLLAMA_PORT}/api/embed}"
: "${EMBEDDING_MODEL:=mock-embed}"
: "${VISION_MODEL_ENABLED:=true}"
: "${VISION_MODEL:=mock-vision}"
: "${DESCRIPTION_MODEL:=mock-desc}"
: "${PII_DETECTION_ENABLED:=false}"

export MOCK_OLLAMA_HOST
export MOCK_OLLAMA_PORT
export OLLAMA_URL
export EMBEDDING_MODEL
export VISION_MODEL_ENABLED
export VISION_MODEL
export DESCRIPTION_MODEL
export PII_DETECTION_ENABLED

# Vite uses chokidar; some CI/dev environments have low watcher / fd limits
# which can crash the dev server with EMFILE. Polling avoids OS watch handles.
export CHOKIDAR_USEPOLLING=${CHOKIDAR_USEPOLLING:-1}
export CHOKIDAR_INTERVAL=${CHOKIDAR_INTERVAL:-1000}

MOCK_PID=""

cleanup() {
  if [ -n "${MOCK_PID}" ]; then
    kill "${MOCK_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT SIGINT SIGTERM

# Start mock Ollama if not already running
if ! curl -fsS "http://${MOCK_OLLAMA_HOST}:${MOCK_OLLAMA_PORT}/health" >/dev/null 2>&1; then
  node "${ROOT_DIR}/scripts/mock-ollama-server.js" &
  MOCK_PID=$!
  # Wait up to 15s
  timeout 15 bash -c "until curl -fsS http://${MOCK_OLLAMA_HOST}:${MOCK_OLLAMA_PORT}/health >/dev/null; do sleep 0.5; done"
fi

# Start API + UI using the existing script
cd "${ROOT_DIR}"
exec ./start-webui.sh
