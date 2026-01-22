# Docker Directory

This directory contains all Docker-related files for containerized deployment of Vector Retriever.

## Directory Structure

```
docker/
├── docker-compose.yml           # Full stack (Qdrant + Ollama + API + WebUI)
├── docker-compose.ollama.yml    # Ollama standalone with GPU support
├── docker-compose.qdrant.yml    # Qdrant standalone
├── ollama/
│   ├── Dockerfile               # Ollama with model management
│   └── startup.sh               # Auto-pull/cleanup models based on env vars
├── api/
│   └── Dockerfile               # Express API server + headless LibreOffice
└── webui/
    ├── Dockerfile               # Vue.js production build + nginx
    └── nginx.conf               # Nginx configuration with API proxy
```

## Quick Start

### Full Stack Deployment

```bash
# From project root
docker compose -f docker/docker-compose.yml up -d

# View logs
docker compose -f docker/docker-compose.yml logs -f

# Stop all services
docker compose -f docker/docker-compose.yml down
```

Access:
- Web UI: http://localhost
- API: http://localhost:3001
- Qdrant Dashboard: http://localhost:6333/dashboard

### Individual Services

```bash
# Ollama only (with GPU)
docker compose -f docker/docker-compose.ollama.yml up -d

# Qdrant only
docker compose -f docker/docker-compose.qdrant.yml up -d
```

## Prerequisites

### For GPU Support (Ollama)

Install NVIDIA Container Toolkit:

```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### For Vulkan GPU Support

Set in your `.env` file:
```env
OLLAMA_VULKAN=1
```

## Configuration

All configuration is read from the `.env` file in the project root. Key variables:

### Required
- `EMBEDDING_MODEL` - Ollama model for embeddings (default: `embeddinggemma:latest`)

### Optional Models
- `PII_DETECTION_MODEL` - Model for PII detection
- `VISION_MODEL` - Model for image analysis
- `DESCRIPTION_MODEL` - Model for document descriptions
- `CATEGORIZATION_MODEL` - Model for auto-categorization

### GPU
- `OLLAMA_VULKAN=1` - Enable Vulkan GPU support (for non-NVIDIA GPUs)

## Model Management

The Ollama container automatically:
1. Pulls all models specified in env vars on startup
2. Deletes any models not referenced in env vars (cleanup)
3. Models persist in the `ollama_models` volume

To add a new model, update your `.env` file and restart the Ollama container:
```bash
docker compose -f docker/docker-compose.yml restart ollama
```

## Volumes

Data is persisted in Docker volumes:
- `vector-retriever-qdrant-storage` - Qdrant database files
- `vector-retriever-ollama-models` - Downloaded Ollama models

To backup volumes:
```bash
docker run --rm -v vector-retriever-qdrant-storage:/data -v $(pwd):/backup alpine tar czf /backup/qdrant-backup.tar.gz /data
```

## Troubleshooting

### Ollama GPU not detected
```bash
# Check NVIDIA runtime
docker run --rm --gpus all nvidia/cuda:11.0-base nvidia-smi
```

### Services not connecting
```bash
# Check network
docker network inspect vector-retriever-network

# Check service health
docker compose -f docker/docker-compose.yml ps
```

### View logs
```bash
# All services
docker compose -f docker/docker-compose.yml logs -f

# Specific service
docker compose -f docker/docker-compose.yml logs -f ollama
```
