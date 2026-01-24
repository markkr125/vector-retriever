# Docker Directory

This directory contains all Docker-related files for containerized deployment of Vector Retriever.

## ⚠️ Important: Run from Project Root

**Docker Compose must be run from the project root directory** (where `.env` is located).

```bash
# ✅ CORRECT - run from project root
cd /path/to/ollama-qdrant-experiment
docker compose -f docker/docker-compose.yml up -d

# ❌ WRONG - running from docker/ directory won't find .env
cd /path/to/ollama-qdrant-experiment/docker
docker compose -f docker-compose.yml up -d  # .env not found!
```

Docker Compose automatically loads environment variables from `.env` in the **current working directory**. If you run from the wrong directory, your model configurations won't be loaded.

## Directory Structure

```
docker/
├── start.sh                     # Auto-detect GPU and start (recommended)
├── docker-compose.yml           # NVIDIA GPU (requires nvidia-container-toolkit)
├── docker-compose.vulkan.yml    # AMD/Intel GPU via Vulkan
├── docker-compose.cpu.yml       # Pure CPU (no GPU acceleration)
├── docker-compose.ollama.yml    # Ollama standalone with GPU
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

## Quick Start (Recommended)

Use the auto-detect script - it automatically selects the right compose file for your GPU:

```bash
# From project root
./docker/start.sh           # Start services (auto-detects GPU)
./docker/start.sh stop      # Stop services
./docker/start.sh logs      # View logs
./docker/start.sh status    # Show container status
./docker/start.sh restart   # Restart services

# Force specific GPU mode
./docker/start.sh --gpu nvidia   # Force NVIDIA
./docker/start.sh --gpu amd      # Force AMD/Intel Vulkan
./docker/start.sh --gpu cpu      # Force CPU only
```

## Manual Quick Start

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

### Common Commands

```bash
# View logs (replace FILE with your compose file)
docker compose -f docker/FILE.yml logs -f

# View specific service logs
docker logs vector-retriever-api -f
docker logs vector-retriever-ollama -f

# Stop all services (keeps data)
docker compose -f docker/FILE.yml down

# Stop and DELETE all data
docker compose -f docker/FILE.yml down -v

# Restart a specific service
docker compose -f docker/FILE.yml restart api
```

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
docker compose -f docker/docker-compose.vulkan.yml up -d
```

The `docker-compose.vulkan.yml` file:
- Sets `OLLAMA_VULKAN=1` to enable Vulkan acceleration
- Mounts `/dev/dri` for GPU device access

### CPU Only (No GPU)

Use this if you have no GPU or want to test without GPU acceleration:

```bash
docker compose -f docker/docker-compose.cpu.yml up -d
```

⚠️ **Warning:** CPU inference is significantly slower (10-100x) than GPU.

## Configuration

All configuration is read from the `.env` file in the project root.

### Required Variables
- `EMBEDDING_MODEL` - Ollama model for embeddings (default: `embeddinggemma:latest`)

### Optional Model Variables
These models will be automatically pulled by the Ollama container:
- `PII_DETECTION_MODEL` - Model for PII detection
- `VISION_MODEL` - Model for image analysis  
- `DESCRIPTION_MODEL` - Model for document descriptions
- `CATEGORIZATION_MODEL` - Model for auto-categorization
- `RERANKING_MODEL` - Model for search result reranking

## Model Management

The Ollama container startup script automatically:
1. Waits for Ollama server to be ready
2. Pulls all models specified in env vars
3. Deletes any models not referenced in env vars (cleanup)
4. Models persist in the `ollama_models` Docker volume

To add a new model:
1. Update your `.env` file with the new model
2. Restart Ollama: `docker compose -f docker/docker-compose.yml up -d --force-recreate ollama`
3. Watch the pull progress: `docker logs vector-retriever-ollama -f`

## Volumes (Persistent Storage)

Data is persisted in Docker volumes (survives container restarts):
- `vector-retriever-qdrant-storage` - Qdrant database files
- `vector-retriever-ollama-models` - Downloaded Ollama models

### Backup volumes
```bash
docker run --rm -v vector-retriever-qdrant-storage:/data -v $(pwd):/backup alpine tar czf /backup/qdrant-backup.tar.gz /data
docker run --rm -v vector-retriever-ollama-models:/data -v $(pwd):/backup alpine tar czf /backup/ollama-backup.tar.gz /data
```

### Delete all data
```bash
docker compose -f docker/docker-compose.yml down -v
```

## Troubleshooting

### "Model not found" or "status code 400" errors

**Symptom:** Getting `model not found` or HTTP 400 errors when searching/uploading

**Cause:** Ollama is still downloading models. Models are downloaded in the background after first startup and can take 5-30 minutes depending on model size and internet speed.

**Check model status:**
```bash
# Using the start.sh script (recommended)
./docker/start.sh models       # Show installed models
./docker/start.sh pull-status  # Check download progress

# Or manually:
docker exec vector-retriever-ollama ollama list    # What's installed
docker logs vector-retriever-ollama 2>&1 | tail -50  # Recent activity
docker logs vector-retriever-ollama -f              # Follow live
```

**Wait and retry:** The startup script pulls models automatically. Just wait for downloads to complete.

### Environment variables not loading

**Symptom:** Models not being pulled, wrong settings, missing features

**Cause:** Running docker compose from wrong directory (`.env` not found)

**Fix:** Always run from project root where `.env` is located:
```bash
cd /path/to/ollama-qdrant-experiment  # Project root (contains .env)
./docker/start.sh                      # Correct way
# OR
docker compose --env-file .env -f docker/docker-compose.yml up -d
```

**Verify env vars are loaded:**
```bash
# Check what env vars are set in a container
docker inspect vector-retriever-ollama --format '{{range .Config.Env}}{{println .}}{{end}}' | grep MODEL
```

### NVIDIA GPU not detected

**Symptom:** Error `could not select device driver "nvidia"` or very slow inference

**Requirements:** NVIDIA GPU, NVIDIA drivers, nvidia-container-toolkit

**Fix:**
```bash
# 1. Check if nvidia-container-toolkit is installed
nvidia-ctk --version

# 2. Install if missing (Ubuntu/Debian)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 3. Verify GPU access in Docker
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# 4. Check Ollama logs for GPU detection
docker logs vector-retriever-ollama 2>&1 | grep -i gpu
```

### AMD/Intel GPU (Vulkan) not working

**Symptom:** CPU usage high despite having AMD/Intel GPU, slow inference

**Requirements:** AMD/Intel GPU, Vulkan drivers, `/dev/dri` device

**Fix:**
```bash
# 1. Check if Vulkan is available on host
vulkaninfo | head -20

# 2. Install Vulkan drivers if missing (Ubuntu/Debian)
sudo apt-get install mesa-vulkan-drivers vulkan-tools

# 3. Check if /dev/dri exists (GPU device)
ls -la /dev/dri/

# 4. Use the Vulkan compose file
docker compose -f docker/docker-compose.vulkan.yml up -d

# 5. Check Ollama logs for Vulkan
docker logs vector-retriever-ollama 2>&1 | grep -i vulkan
```

### Services not connecting

**Symptom:** API errors, services can't reach each other

**Check health:**
```bash
# Check all services are running
./docker/start.sh status

# Check network exists
docker network inspect vector-retriever-network

# Check service logs
docker compose -f docker/docker-compose.yml logs
```

### Upload failing with "does not support chat"

**Symptom:** Error 400 when uploading files, error mentions "chat"

**Cause:** Using an embedding-only model for chat features (description, PII detection, vision)

**Fix:** Set a chat-capable model for these features in `.env`:
```env
# Use a chat model, not an embedding model
DESCRIPTION_MODEL=gemma3:4b
PII_DETECTION_MODEL=gemma3:4b
VISION_MODEL=gemma3:4b
```

Then restart Ollama to pull the new model:
```bash
./docker/start.sh restart
./docker/start.sh pull-status  # Wait for download
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
