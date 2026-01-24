#!/bin/bash
# Ollama startup script with automatic model management
# Reads model env vars, pulls required models, deletes unreferenced ones

set -e

echo "=== Ollama Model Manager ==="
echo "Starting Ollama server..."

# Start Ollama in background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "Waiting for Ollama to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0
until curl -s http://localhost:11434/api/tags > /dev/null 2>&1; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "ERROR: Ollama failed to start after $MAX_RETRIES attempts"
        exit 1
    fi
    echo "  Waiting... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done
echo "Ollama is ready!"

# Collect all required models from environment variables
# Add any new model env vars here when they are added to the project
REQUIRED_MODELS=""

add_model() {
    local model="$1"
    if [ -n "$model" ]; then
        # Check if model is already in the list
        if [[ ! " $REQUIRED_MODELS " =~ " $model " ]]; then
            REQUIRED_MODELS="$REQUIRED_MODELS $model"
        fi
    fi
}

# Read all model-related environment variables
# IMPORTANT: When adding new model env vars to the project,
# add them here as well to ensure they are pulled on container start
add_model "$EMBEDDING_MODEL"
add_model "$PII_DETECTION_MODEL"
add_model "$VISION_MODEL"
add_model "$DESCRIPTION_MODEL"
add_model "$CATEGORIZATION_MODEL"

# Trim leading/trailing whitespace
REQUIRED_MODELS=$(echo "$REQUIRED_MODELS" | xargs)

echo ""
echo "Required models: ${REQUIRED_MODELS:-"(none specified)"}"
echo ""

# Pull required models
if [ -n "$REQUIRED_MODELS" ]; then
    echo "=== Pulling Required Models ==="
    for model in $REQUIRED_MODELS; do
        echo "Pulling model: $model"
        if ollama pull "$model"; then
            echo "  ✓ Successfully pulled $model"
        else
            echo "  ✗ Failed to pull $model"
            # Don't exit on failure - some models might be optional
        fi
    done
    echo ""
fi

# Delete unreferenced models
echo "=== Cleaning Unreferenced Models ==="
INSTALLED_MODELS=$(ollama list 2>/dev/null | tail -n +2 | awk '{print $1}' || echo "")

if [ -n "$INSTALLED_MODELS" ]; then
    for installed in $INSTALLED_MODELS; do
        # Check if this model is in our required list
        IS_REQUIRED=false
        for required in $REQUIRED_MODELS; do
            # Handle model name variations (with/without :tag)
            # Strip tag for comparison if needed
            installed_base=$(echo "$installed" | cut -d: -f1)
            required_base=$(echo "$required" | cut -d: -f1)
            
            if [ "$installed" = "$required" ] || [ "$installed_base" = "$required_base" ]; then
                IS_REQUIRED=true
                break
            fi
        done
        
        if [ "$IS_REQUIRED" = false ]; then
            echo "Removing unreferenced model: $installed"
            if ollama rm "$installed" 2>/dev/null; then
                echo "  ✓ Removed $installed"
            else
                echo "  ✗ Failed to remove $installed"
            fi
        else
            echo "Keeping required model: $installed"
        fi
    done
else
    echo "No installed models to check"
fi

echo ""
echo "=== Model Management Complete ==="
echo "Installed models:"
ollama list
echo ""
echo "Ollama is running and ready for requests on port 11434"

# Wait for Ollama process to keep container running
wait $OLLAMA_PID
