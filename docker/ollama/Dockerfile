# Ollama container with GPU support and automatic model management
FROM ollama/ollama:latest

# Install curl for health checks and model management
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy startup script
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

# The startup script will:
# 1. Start Ollama server
# 2. Wait for it to be ready
# 3. Pull all required models from env vars
# 4. Delete any models not in the required list
# 5. Keep Ollama running

ENTRYPOINT ["/startup.sh"]
