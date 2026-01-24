# Docker Deployment Guide

Comprehensive guide for deploying Vector Retriever with Docker, including GPU support, service configuration, and troubleshooting.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Running Individual Services](#running-individual-services)
- [Using External Ollama or Qdrant](#using-external-ollama-or-qdrant)
- [GPU Setup](#gpu-setup)
- [Configuration](#configuration)
- [Model Management](#model-management)
- [Volumes and Data Persistence](#volumes-and-data-persistence)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker with Docker Compose v2
- GPU support (optional but recommended):
  - **NVIDIA**: Requires [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
  - **AMD/Intel**: Requires Vulkan drivers (`sudo apt install mesa-vulkan-drivers`)

## Quick Start

### ⚠️ Important: Run from Project Root

**Docker Compose must be run from the project root directory** (where `.env` is located).

```bash
# ✅ CORRECT - run from project root
cd /path/to/ollama-qdrant-experiment
./docker/start.sh

# ❌ WRONG - running from docker/ directory won't find .env
cd /path/to/ollama-qdrant-experiment/docker
docker compose up -d  # .env not found!
```

### Using the Auto-Detect Script (Recommended)

The `docker/start.sh` script automatically detects your GPU and selects the appropriate compose file:

```bash
# From project root
./docker/start.sh              # Start services (auto-detects GPU)
./docker/start.sh stop         # Stop services
./docker/start.sh logs         # View logs
./docker/start.sh status       # Show container status
./docker/start.sh restart      # Restart services
./docker/start.sh models       # List installed Ollama models
./docker/start.sh pull-status  # Check model download progress

# Force specific GPU mode
./docker/start.sh --gpu nvidia   # Force NVIDIA
./docker/start.sh --gpu vulkan   # Force AMD/Intel Vulkan
./docker/start.sh --gpu cpu      # Force CPU only
```

### Manual Start

Choose the right compose file for your GPU:

| GPU Type | Compose File | Command |
|----------|--------------|---------|
| NVIDIA | `docker-compose.yml` | `docker compose -f docker/docker-compose.yml up -d` |
| AMD/Intel (Vulkan) | `docker-compose.vulkan.yml` | `docker compose -f docker/docker-compose.vulkan.yml up -d` |
| No GPU (CPU only) | `docker-compose.cpu.yml` | `docker compose -f docker/docker-compose.cpu.yml up -d` |

### Access Points

After starting:
- **Web UI**: http://localhost:8080
- **API**: http://localhost:3001
- **Qdrant Dashboard**: http://localhost:6333/dashboard

## Architecture Overview

The Docker deployment consists of four services that communicate over an internal Docker network:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Network                                │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  WebUI   │───▶│   API    │───▶│  Ollama  │    │  Qdrant  │  │
│  │ (nginx)  │    │ (Express)│───▶│  (LLM)   │    │ (Vector) │  │
│  │ :8080    │    │  :3001   │    │  :11434  │    │  :6333   │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                        │                              ▲         │
│                        └──────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

**Services:**
- **webui** - Nginx serving the Vue.js frontend (port 8080)
- **api** - Express.js API server (port 3001)
- **ollama** - Ollama LLM server for embeddings and chat (port 11434)
- **qdrant** - Qdrant vector database (ports 6333/6334)

### Directory Structure

```
docker/
├── start.sh                     # Auto-detect GPU and start (recommended)
├── docker-compose.yml           # NVIDIA GPU (requires nvidia-container-toolkit)
├── docker-compose.vulkan.yml    # AMD/Intel GPU via Vulkan
├── docker-compose.cpu.yml       # Pure CPU (no GPU acceleration)
├── docker-compose.ollama.yml    # Ollama standalone
├── docker-compose.qdrant.yml    # Qdrant standalone
├── ollama/
│   ├── Dockerfile               # Ollama with model management + curl
│   └── startup.sh               # Auto-pull/cleanup models based on env vars
├── api/
│   └── Dockerfile               # Express API server + headless LibreOffice
└── webui/
    ├── Dockerfile               # Vue.js production build + nginx
    └── nginx.conf               # Nginx configuration with API proxy
```

## Running Individual Services

You don't have to run the full stack. Each service can be started independently, and the API/WebUI can connect to external Ollama or Qdrant instances.

### Ollama Only

Run just Ollama for embedding and LLM services:

```bash
# With GPU auto-detection
docker compose -f docker/docker-compose.ollama.yml up -d

# Check it's running
curl http://localhost:11434/api/tags
```

This is useful when:
- You want to share one Ollama instance across multiple projects
- You're running Ollama on a separate GPU server
- You want to test different Ollama configurations

### Qdrant Only

Run just Qdrant for vector storage:

```bash
docker compose -f docker/docker-compose.qdrant.yml up -d

# Check it's running
curl http://localhost:6333/collections
```

This is useful when:
- You have an existing Qdrant cluster
- You want to share Qdrant across multiple applications
- You're running Qdrant on a dedicated database server

### API + WebUI Only (Using External Services)

If you already have Ollama and/or Qdrant running elsewhere, you can run just the API and WebUI:

```bash
# 1. Configure .env to point to external services
OLLAMA_URL=http://your-ollama-server:11434
QDRANT_URL=http://your-qdrant-server:6333

# 2. Start only API and WebUI
docker compose -f docker/docker-compose.yml up -d api webui
```

## Using External Ollama or Qdrant

The API service reads connection URLs from environment variables. You can point it to any Ollama or Qdrant instance—local, remote, or cloud-hosted.

### Configuration in .env

```env
# Default: Use Docker internal networking (when running full stack)
OLLAMA_URL=http://ollama:11434
QDRANT_URL=http://qdrant:6333

# Example: Use Ollama running on host machine
OLLAMA_URL=http://host.docker.internal:11434
QDRANT_URL=http://qdrant:6333

# Example: Use remote Ollama server
OLLAMA_URL=http://192.168.1.100:11434
QDRANT_URL=http://qdrant:6333

# Example: Use Qdrant Cloud
OLLAMA_URL=http://ollama:11434
QDRANT_URL=https://your-cluster.qdrant.io:6333
QDRANT_API_KEY=your-api-key-here

# Example: Both external
OLLAMA_URL=http://gpu-server.local:11434
QDRANT_URL=http://db-server.local:6333
```

### Common Scenarios

#### Scenario 1: Ollama on Host, Qdrant in Docker

You have Ollama installed natively on your machine (for better GPU performance):

```env
# .env
OLLAMA_URL=http://host.docker.internal:11434
QDRANT_URL=http://qdrant:6333
```

```bash
# Start only Qdrant, API, and WebUI
docker compose -f docker/docker-compose.yml up -d qdrant api webui
```

#### Scenario 2: Remote GPU Server for Ollama

You have a powerful GPU server running Ollama:

```env
# .env
OLLAMA_URL=http://gpu-server.example.com:11434
QDRANT_URL=http://qdrant:6333
```

#### Scenario 3: Qdrant Cloud + Local Ollama

Using Qdrant Cloud for managed vector storage:

```env
# .env
OLLAMA_URL=http://ollama:11434
QDRANT_URL=https://abc123.us-east-1.aws.cloud.qdrant.io:6333
QDRANT_API_KEY=your-qdrant-cloud-api-key
```

#### Scenario 4: Development with Local Services

Running Ollama and Qdrant directly on your machine (not in Docker):

```env
# .env
OLLAMA_URL=http://localhost:11434
QDRANT_URL=http://localhost:6333
```

```bash
# Start only API and WebUI
docker compose -f docker/docker-compose.yml up -d api webui
```

### Network Considerations

| Scenario | URL Format |
|----------|------------|
| Service in same Docker stack | `http://service-name:port` (e.g., `http://ollama:11434`) |
| Service on host machine | `http://host.docker.internal:port` |
| Service on local network | `http://192.168.x.x:port` or `http://hostname.local:port` |
| Remote/cloud service | `https://your-service.example.com:port` |

## GPU Setup

### NVIDIA GPU Setup

Requires NVIDIA drivers and nvidia-container-toolkit:

```bash
# 1. Install NVIDIA drivers (if not already installed)
ubuntu-drivers autoinstall
# or manually: sudo apt install nvidia-driver-535

# 2. Install nvidia-container-toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# 3. Configure Docker to use NVIDIA runtime
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 4. Verify GPU is accessible in Docker
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

### AMD/Intel GPU Setup (Vulkan)

Requires Vulkan drivers on the host:

```bash
# Ubuntu/Debian - Install Vulkan drivers
sudo apt-get install mesa-vulkan-drivers vulkan-tools

# Verify Vulkan is working
vulkaninfo | head -20

# For AMD GPUs, you may also need:
sudo apt-get install libvulkan1 vulkan-utils

# Run with AMD/Intel GPU
./docker/start.sh --gpu vulkan
```

The Vulkan compose file:
- Sets `OLLAMA_VULKAN=1` to enable Vulkan acceleration
- Mounts `/dev/dri` for GPU device access

### CPU Only (No GPU)

Use this if you have no GPU or want to test without GPU acceleration:

```bash
./docker/start.sh --gpu cpu
```

⚠️ **Warning:** CPU inference is significantly slower (10-100x) than GPU.

## Configuration

All configuration is read from the `.env` file in the project root.

### Service URLs

```env
# Where to find Ollama (default: Docker internal)
OLLAMA_URL=http://ollama:11434

# Where to find Qdrant (default: Docker internal)
QDRANT_URL=http://qdrant:6333

# Optional: Qdrant API key (for Qdrant Cloud)
QDRANT_API_KEY=
```

### Model Variables

```env
# Required: Embedding model
EMBEDDING_MODEL=embeddinggemma:latest

# Optional: These models will be automatically pulled by Ollama
PII_DETECTION_MODEL=gemma3:4b
VISION_MODEL=gemma3:4b
DESCRIPTION_MODEL=gemma3:4b
CATEGORIZATION_MODEL=
RERANKING_MODEL=
```

### Feature Flags

```env
# Enable/disable features
PII_DETECTION_ENABLED=true
VISION_MODEL_ENABLED=false
AUTO_GENERATE_DESCRIPTION=true
```

## Model Management

The Ollama container startup script automatically:
1. Waits for Ollama server to be ready
2. Pulls all models specified in env vars
3. Deletes any models not referenced in env vars (cleanup)
4. Models persist in the `ollama_models` Docker volume

### First Start: Wait for Model Downloads

⚠️ On first startup, Ollama downloads models in the background. This can take several minutes depending on model size and internet speed.

If you get "model not found" or 400 errors:

```bash
./docker/start.sh models       # Check what's installed
./docker/start.sh pull-status  # Check download progress
```

### Adding a New Model

1. Update your `.env` file with the new model
2. Restart Ollama:
   ```bash
   docker compose -f docker/docker-compose.yml up -d --force-recreate ollama
   ```
3. Watch the pull progress:
   ```bash
   docker logs vector-retriever-ollama -f
   ```

## Volumes and Data Persistence

Data is persisted in Docker volumes (survives container restarts):
- `vector-retriever-qdrant-storage` - Qdrant database files
- `vector-retriever-ollama-models` - Downloaded Ollama models

### Backup Volumes

```bash
docker run --rm -v vector-retriever-qdrant-storage:/data -v $(pwd):/backup alpine tar czf /backup/qdrant-backup.tar.gz /data
docker run --rm -v vector-retriever-ollama-models:/data -v $(pwd):/backup alpine tar czf /backup/ollama-backup.tar.gz /data
```

### Delete All Data

```bash
docker compose -f docker/docker-compose.yml down -v
```

## Troubleshooting

### "Model not found" or "status code 400" errors

**Symptom:** Getting `model not found` or HTTP 400 errors when searching/uploading

**Cause:** Ollama is still downloading models in the background.

**Fix:**
```bash
./docker/start.sh models       # Show installed models
./docker/start.sh pull-status  # Check download progress
```

Wait for downloads to complete.

### Environment variables not loading

**Symptom:** Models not being pulled, wrong settings, missing features

**Cause:** Running docker compose from wrong directory (`.env` not found)

**Fix:** Always run from project root:
```bash
cd /path/to/ollama-qdrant-experiment
./docker/start.sh
```

**Verify env vars are loaded:**
```bash
docker inspect vector-retriever-ollama --format '{{range .Config.Env}}{{println .}}{{end}}' | grep MODEL
```

### NVIDIA GPU not detected

**Symptom:** Error `could not select device driver "nvidia"` or very slow inference

**Fix:**
```bash
# Check if nvidia-container-toolkit is installed
nvidia-ctk --version

# Verify GPU access in Docker
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# Check Ollama logs for GPU detection
docker logs vector-retriever-ollama 2>&1 | grep -i gpu
```

### AMD/Intel GPU (Vulkan) not working

**Symptom:** High CPU usage, slow inference despite having GPU

**Fix:**
```bash
# Check if Vulkan is available
vulkaninfo | head -20

# Check if /dev/dri exists
ls -la /dev/dri/

# Use the Vulkan compose file
./docker/start.sh --gpu vulkan
```

### Services not connecting

**Symptom:** API errors, services can't reach each other

**Fix:**
```bash
# Check all services are running
./docker/start.sh status

# Check network exists
docker network inspect vector-retriever-network

# Check service logs
docker compose -f docker/docker-compose.yml logs
```

### API can't connect to external Ollama/Qdrant

**Symptom:** Connection refused or timeout errors

**Check:**
1. Verify the external service is running and accessible
2. Check firewall rules allow the connection
3. Verify the URL in `.env` is correct
4. For `host.docker.internal`, ensure Docker Desktop or appropriate setup

```bash
# Test from inside the API container
docker exec vector-retriever-api curl http://ollama:11434/api/tags
docker exec vector-retriever-api curl http://qdrant:6333/collections
```

### Clearing everything and starting fresh

```bash
# Stop and remove containers, networks, AND volumes (deletes all data!)
docker compose -f docker/docker-compose.yml down -v

# Remove any leftover images (optional)
docker image prune -f

# Start fresh
./docker/start.sh
```
