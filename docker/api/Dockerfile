# API Server Dockerfile
# Node 20 with native dependencies for sharp/canvas and headless LibreOffice

FROM node:20-bookworm-slim

# Install dependencies for native modules (sharp, canvas) and headless LibreOffice
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev \
    pkg-config \
    curl \
    # Headless LibreOffice for legacy Office file conversion
    libreoffice-core \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application source
COPY index.js server.js ./
COPY routes/ ./routes/
COPY services/ ./services/
COPY middleware/ ./middleware/
COPY state/ ./state/
COPY utils/ ./utils/
COPY examples/ ./examples/

# Copy sample data for embedding
COPY sample-data/ ./sample-data/

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/api/health || exit 1

# Start the API server
CMD ["node", "server.js"]
