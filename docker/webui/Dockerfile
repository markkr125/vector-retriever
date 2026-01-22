# Web UI Dockerfile
# Vue.js production build served by nginx

# Stage 1: Build the Vue.js application
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy root package files (needed for workspaces if any)
COPY package*.json ./

# Copy web-ui source
COPY web-ui/ ./web-ui/

# Install dependencies and build
WORKDIR /app/web-ui
RUN npm ci && npm run build

# Stage 2: Production image with nginx
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/web-ui/dist /usr/share/nginx/html

# Copy nginx configuration
COPY docker/webui/nginx.conf /etc/nginx/nginx.conf

# Expose HTTP port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost/ || exit 1

# Start nginx in foreground (default CMD from nginx:alpine)
