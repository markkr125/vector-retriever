#!/bin/bash
# Vector Retriever Docker Startup Script
# Automatically detects GPU type and selects the appropriate docker-compose file
#
# Usage:
#   ./docker/start.sh              # Start services (auto-detect GPU)
#   ./docker/start.sh stop         # Stop services
#   ./docker/start.sh logs         # View logs
#   ./docker/start.sh restart      # Restart services
#   ./docker/start.sh status       # Show container status
#   ./docker/start.sh models       # Show installed Ollama models
#   ./docker/start.sh pull-status  # Check model download progress
#   ./docker/start.sh --gpu nvidia # Force NVIDIA GPU
#   ./docker/start.sh --gpu vulkan # Force AMD/Intel GPU (Vulkan)
#   ./docker/start.sh --gpu cpu    # Force CPU only

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Change to project root (required for .env file)
cd "$PROJECT_ROOT"

# Parse arguments
GPU_OVERRIDE=""
COMMAND="up"

while [[ $# -gt 0 ]]; do
    case $1 in
        --gpu)
            GPU_OVERRIDE="$2"
            shift 2
            ;;
        stop|down)
            COMMAND="down"
            shift
            ;;
        logs)
            COMMAND="logs"
            shift
            ;;
        restart)
            COMMAND="restart"
            shift
            ;;
        status|ps)
            COMMAND="ps"
            shift
            ;;
        build)
            COMMAND="build"
            shift
            ;;
        models)
            COMMAND="models"
            shift
            ;;
        pull-status)
            COMMAND="pull-status"
            shift
            ;;
        -h|--help)
            echo "Vector Retriever Docker Startup Script"
            echo ""
            echo "Usage: $0 [command] [options]"
            echo ""
            echo "Commands:"
            echo "  (none)      Start services (default)"
            echo "  stop        Stop all services"
            echo "  logs        View logs (follow mode)"
            echo "  restart     Restart all services"
            echo "  status      Show container status"
            echo "  build       Rebuild containers"
            echo "  models      List installed Ollama models"
            echo "  pull-status Check model download progress"
            echo ""
            echo "Options:"
            echo "  --gpu nvidia   Force NVIDIA GPU mode"
            echo "  --gpu vulkan   Force AMD/Intel GPU (Vulkan) mode"
            echo "  --gpu cpu      Force CPU-only mode"
            echo "  -h, --help     Show this help"
            echo ""
            echo "GPU Auto-Detection:"
            echo "  1. Checks for NVIDIA GPU (nvidia-smi + nvidia-container-toolkit)"
            echo "  2. Checks for AMD/Intel GPU (/dev/dri exists)"
            echo "  3. Falls back to CPU-only mode"
            echo ""
            echo "Troubleshooting:"
            echo "  - 'model not found' error: Models are still downloading. Run: $0 pull-status"
            echo "  - 'status 400' error: Check if all models are downloaded: $0 models"
            echo "  - Environment not loading: Make sure to run from project root directory"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Function to detect GPU type
detect_gpu() {
    # Check for forced GPU type
    if [[ -n "$GPU_OVERRIDE" ]]; then
        echo "$GPU_OVERRIDE"
        return
    fi

    # Check for NVIDIA GPU
    if command -v nvidia-smi &> /dev/null && nvidia-smi &> /dev/null; then
        # Also verify nvidia-container-toolkit is available
        if docker info 2>/dev/null | grep -q "nvidia"; then
            echo "nvidia"
            return
        else
            echo -e "${YELLOW}Warning: NVIDIA GPU detected but nvidia-container-toolkit not configured${NC}" >&2
        fi
    fi

    # Check for AMD/Intel GPU (Vulkan via /dev/dri)
    if [[ -d "/dev/dri" ]] && [[ -e "/dev/dri/renderD128" || -e "/dev/dri/card0" ]]; then
        echo "vulkan"
        return
    fi

    # Fallback to CPU
    echo "cpu"
}

# Detect GPU and select compose file
GPU_TYPE=$(detect_gpu)

case $GPU_TYPE in
    nvidia)
        COMPOSE_FILE="docker/docker-compose.yml"
        GPU_DESC="NVIDIA GPU"
        ;;
    vulkan)
        COMPOSE_FILE="docker/docker-compose.vulkan.yml"
        GPU_DESC="AMD/Intel GPU (Vulkan)"
        ;;
    cpu)
        COMPOSE_FILE="docker/docker-compose.cpu.yml"
        GPU_DESC="CPU only (no GPU acceleration)"
        ;;
    *)
        echo -e "${RED}Unknown GPU type: $GPU_TYPE${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Vector Retriever Docker Manager${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "  GPU Mode:     ${GREEN}$GPU_DESC${NC}"
echo -e "  Compose File: ${GREEN}$COMPOSE_FILE${NC}"
echo -e "  Project Root: ${GREEN}$PROJECT_ROOT${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo ""

# Check if .env exists
if [[ ! -f ".env" ]]; then
    echo -e "${YELLOW}Warning: .env file not found in project root${NC}"
    echo -e "${YELLOW}Copy .env.example to .env and configure your models${NC}"
    echo ""
fi

# Execute docker compose command
case $COMMAND in
    up)
        echo -e "${GREEN}Starting services...${NC}"
        docker compose --env-file .env -f "$COMPOSE_FILE" up -d
        echo ""
        echo -e "${GREEN}Services started!${NC}"
        echo ""
        echo "Access points:"
        echo "  - Web UI:           http://localhost:8080"
        echo "  - API:              http://localhost:3001"
        echo "  - Qdrant Dashboard: http://localhost:6333/dashboard"
        echo ""
        echo -e "${YELLOW}Note: Ollama may still be downloading models in the background.${NC}"
        echo -e "${YELLOW}If you get 'model not found' or 'status 400' errors, wait for downloads.${NC}"
        echo ""
        echo "Check model status: $0 models"
        echo "Check download:     $0 pull-status"
        echo "View logs:          $0 logs"
        echo "Stop:               $0 stop"
        ;;
    down)
        echo -e "${YELLOW}Stopping services...${NC}"
        docker compose --env-file .env -f "$COMPOSE_FILE" down
        echo -e "${GREEN}Services stopped${NC}"
        ;;
    logs)
        echo -e "${BLUE}Following logs (Ctrl+C to exit)...${NC}"
        docker compose --env-file .env -f "$COMPOSE_FILE" logs -f
        ;;
    restart)
        echo -e "${YELLOW}Restarting services...${NC}"
        docker compose --env-file .env -f "$COMPOSE_FILE" restart
        echo -e "${GREEN}Services restarted${NC}"
        ;;
    ps)
        docker compose --env-file .env -f "$COMPOSE_FILE" ps
        ;;
    build)
        echo -e "${BLUE}Rebuilding containers...${NC}"
        docker compose --env-file .env -f "$COMPOSE_FILE" build
        echo -e "${GREEN}Build complete${NC}"
        ;;
    models)
        echo -e "${BLUE}Installed Ollama models:${NC}"
        if docker ps --format '{{.Names}}' | grep -q "vector-retriever-ollama"; then
            docker exec vector-retriever-ollama ollama list
            echo ""
            echo -e "${BLUE}Required models (from .env):${NC}"
            grep -E "^(EMBEDDING|PII_DETECTION|VISION|DESCRIPTION|CATEGORIZATION|RERANKING)_MODEL=" .env 2>/dev/null | grep -v "^#" || echo "  (none configured)"
        else
            echo -e "${RED}Ollama container is not running${NC}"
            echo "Start services first: $0"
        fi
        ;;
    pull-status)
        echo -e "${BLUE}Checking Ollama model download status...${NC}"
        if docker ps --format '{{.Names}}' | grep -q "vector-retriever-ollama"; then
            echo ""
            echo -e "${BLUE}Recent Ollama logs (looking for pull activity):${NC}"
            docker logs vector-retriever-ollama 2>&1 | grep -E "(Pulling|pulling|Successfully|success|failed|error)" | tail -20
            echo ""
            echo -e "${BLUE}Currently installed models:${NC}"
            docker exec vector-retriever-ollama ollama list
        else
            echo -e "${RED}Ollama container is not running${NC}"
            echo "Start services first: $0"
        fi
        ;;
esac
