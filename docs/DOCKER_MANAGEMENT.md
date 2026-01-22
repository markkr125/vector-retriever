# Docker Management Guide

Complete guide for managing the Vector Retriever Docker deployment.

## Table of Contents
- [Quick Reference](#quick-reference)
- [Starting Services](#starting-services)
- [Stopping Services](#stopping-services)
- [Viewing Logs](#viewing-logs)
- [Managing Data](#managing-data)
- [Managing Models](#managing-models)
- [GPU Configuration](#gpu-configuration)
- [Troubleshooting](#troubleshooting)
- [Advanced Operations](#advanced-operations)

## Quick Reference

| Command | Description |
|---------|-------------|
| `docker compose -f docker/docker-compose.yml up -d` | Start full stack |
| `docker compose -f docker/docker-compose.yml down` | Stop services (keep data) |
| `docker compose -f docker/docker-compose.yml down -v` | Stop and delete all data |
| `docker compose -f docker/docker-compose.yml logs -f` | View live logs |
| `docker compose -f docker/docker-compose.yml ps` | Check service status |
| `docker compose -f docker/docker-compose.yml restart` | Restart all services |

## Starting Services

### Full Stack (Recommended)

```bash
# Start all services (Qdrant, Ollama, API, WebUI)
docker compose -f docker/docker-compose.yml up -d
```

Access points:
- **Web UI**: http://localhost
- **API**: http://localhost:3001
- **Qdrant Dashboard**: http://localhost:6333/dashboard

### Individual Services

```bash
# Qdrant only
docker compose -f docker/docker-compose.qdrant.yml up -d

# Ollama only (with GPU)
docker compose -f docker/docker-compose.ollama.yml up -d
```

### Rebuild After Code Changes

```bash
# Rebuild and restart
docker compose -f docker/docker-compose.yml up -d --build

# Rebuild specific service
docker compose -f docker/docker-compose.yml up -d --build api
docker compose -f docker/docker-compose.yml up -d --build webui
```

## Stopping Services

### Stop (Keep Data)

```bash
# Stop all services, data persists in volumes
docker compose -f docker/docker-compose.yml down
```

### Stop and Remove Data

```bash
# ⚠️ WARNING: This deletes all Qdrant data and Ollama models!
docker compose -f docker/docker-compose.yml down -v
```

### Stop Specific Service

```bash
docker compose -f docker/docker-compose.yml stop api
docker compose -f docker/docker-compose.yml stop webui
```

## Viewing Logs

### All Services

```bash
# Live logs (follow mode)
docker compose -f docker/docker-compose.yml logs -f

# Last 100 lines
docker compose -f docker/docker-compose.yml logs --tail=100
```

### Specific Service

```bash
# Ollama logs (model downloads, errors)
docker compose -f docker/docker-compose.yml logs -f ollama

# API logs (requests, errors)
docker compose -f docker/docker-compose.yml logs -f api

# Qdrant logs
docker compose -f docker/docker-compose.yml logs -f qdrant

# WebUI logs (nginx)
docker compose -f docker/docker-compose.yml logs -f webui
```

## Managing Data

### Check Volume Status

```bash
# List volumes
docker volume ls | grep vector-retriever

# Inspect volume details
docker volume inspect vector-retriever-qdrant-storage
docker volume inspect vector-retriever-ollama-models
```

### Data Persistence

| Scenario | Data Survives? |
|----------|----------------|
| `docker compose restart` | ✅ Yes |
| `docker compose down` | ✅ Yes |
| `docker compose down -v` | ❌ No |
| Host reboot | ✅ Yes |
| Container rebuild | ✅ Yes |

### Clear Qdrant Data Only

```bash
docker compose -f docker/docker-compose.yml down
docker volume rm vector-retriever-qdrant-storage
docker compose -f docker/docker-compose.yml up -d
```

### Clear Ollama Models Only

```bash
docker compose -f docker/docker-compose.yml down
docker volume rm vector-retriever-ollama-models
docker compose -f docker/docker-compose.yml up -d
```

### Backup Volumes

```bash
# Backup Qdrant data
docker run --rm \
  -v vector-retriever-qdrant-storage:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/qdrant-backup.tar.gz /data

# Backup Ollama models
docker run --rm \
  -v vector-retriever-ollama-models:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/ollama-backup.tar.gz /data
```

### Restore Volumes

```bash
# Stop services first
docker compose -f docker/docker-compose.yml down

# Restore Qdrant data
docker run --rm \
  -v vector-retriever-qdrant-storage:/data \
  -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/qdrant-backup.tar.gz --strip 1"

# Start services
docker compose -f docker/docker-compose.yml up -d
```

## Managing Models

### How Model Management Works

The Ollama container automatically:
1. Reads model names from environment variables
2. Pulls all required models on startup
3. Deletes any models not in the required list

### Environment Variables for Models

Set in your `.env` file:

```env
EMBEDDING_MODEL=embeddinggemma:latest    # Required
PII_DETECTION_MODEL=gemma3:4b            # Optional
VISION_MODEL=gemma3:4b                   # Optional
DESCRIPTION_MODEL=llama3.2:3b            # Optional
CATEGORIZATION_MODEL=gemma3:4b           # Optional
```

### Update Models

```bash
# Edit .env with new models, then restart Ollama
docker compose -f docker/docker-compose.yml restart ollama

# Watch the model download
docker compose -f docker/docker-compose.yml logs -f ollama
```

### List Installed Models

```bash
docker compose -f docker/docker-compose.yml exec ollama ollama list
```

### Manually Pull a Model

```bash
docker compose -f docker/docker-compose.yml exec ollama ollama pull gemma3:4b
```

## GPU Configuration

### NVIDIA GPUs (Default)

Requires [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html):

```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

Verify GPU access:
```bash
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
```

### AMD/Intel GPUs (Vulkan)

Enable Vulkan in `.env`:
```env
OLLAMA_VULKAN=1
```

### CPU Only (No GPU)

Remove the GPU reservation from `docker/docker-compose.yml`:

```yaml
# Comment out or remove this section in the ollama service:
# deploy:
#   resources:
#     reservations:
#       devices:
#         - driver: nvidia
#           count: all
#           capabilities: [gpu]
```

## Troubleshooting

### Service Won't Start

```bash
# Check service status
docker compose -f docker/docker-compose.yml ps

# Check for errors
docker compose -f docker/docker-compose.yml logs ollama
docker compose -f docker/docker-compose.yml logs api
```

### Ollama GPU Not Detected

```bash
# Verify NVIDIA runtime
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi

# Check Ollama logs for GPU detection
docker compose -f docker/docker-compose.yml logs ollama | grep -i gpu
```

### API Can't Connect to Ollama

```bash
# Check network
docker network inspect vector-retriever-network

# Test connectivity from API container
docker compose -f docker/docker-compose.yml exec api curl http://ollama:11434/api/tags
```

### API Can't Connect to Qdrant

```bash
# Test connectivity from API container
docker compose -f docker/docker-compose.yml exec api curl http://qdrant:6333/collections
```

### Port Already in Use

```bash
# Find what's using the port
sudo lsof -i :80    # WebUI
sudo lsof -i :3001  # API
sudo lsof -i :6333  # Qdrant
sudo lsof -i :11434 # Ollama

# Kill the process or change ports in docker-compose.yml
```

### Container Keeps Restarting

```bash
# Check exit code and logs
docker compose -f docker/docker-compose.yml ps
docker compose -f docker/docker-compose.yml logs --tail=50 <service-name>
```

### Out of Disk Space

```bash
# Check Docker disk usage
docker system df

# Clean up unused resources
docker system prune -a

# Remove old volumes (careful!)
docker volume prune
```

## Advanced Operations

### Enter Container Shell

```bash
# API container
docker compose -f docker/docker-compose.yml exec api sh

# Ollama container
docker compose -f docker/docker-compose.yml exec ollama bash

# Qdrant container
docker compose -f docker/docker-compose.yml exec qdrant sh
```

### Run Embedding from Docker

```bash
docker compose -f docker/docker-compose.yml exec api node index.js embed
```

### Check Health Status

```bash
# API health
curl http://localhost:3001/api/health

# Qdrant health
curl http://localhost:6333/collections

# Ollama health
curl http://localhost:11434/api/tags
```

### Update Images

```bash
# Pull latest images
docker compose -f docker/docker-compose.yml pull

# Recreate containers with new images
docker compose -f docker/docker-compose.yml up -d
```

### View Resource Usage

```bash
docker stats
```

---

**See also:**
- [Main README](../README.md) - Project overview
- [docker/README.md](../docker/README.md) - Docker file structure
- [WEBUI_SETUP.md](WEBUI_SETUP.md) - Web UI configuration
