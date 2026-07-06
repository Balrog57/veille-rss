#!/bin/sh
# Wait for ollama service to be ready, then pull the model
set -e

MODEL="${OLLAMA_MODEL:-qwen2.5:1.5b}"
OLLAMA_HOST="${OLLAMA_HOST:-ollama:11434}"

echo "Waiting for Ollama at ${OLLAMA_HOST}..."
for i in $(seq 1 30); do
  if curl -sf "http://${OLLAMA_HOST}/api/tags" > /dev/null 2>&1; then
    echo "Ollama is ready."
    break
  fi
  echo "Attempt ${i}/30: Ollama not ready yet..."
  sleep 2
done

echo "Pulling model: ${MODEL}"
ollama pull "${MODEL}"
echo "Model ${MODEL} pulled successfully."
