# ============================================================================
# TURIHAMWE MANAGEMENT SYSTEM — PRODUCTION DOCKERFILE
# Institution: Nyamuyanja SACCO Ltd, Isingiro District, Uganda
# Technology: Node.js 22 LTS, Vite Production SPA, Express Backend
# ============================================================================

# Stage 1: Build Frontend Assets
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json* bun.lock* ./
RUN npm ci || npm install

# Copy application source
COPY . .

# Build production bundle
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Production Server Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Install production dependencies only
COPY package.json package-lock.json* bun.lock* ./
RUN npm ci --omit=dev || npm install --omit=dev
RUN npm install -g tsx

# Copy built application assets & server code
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/src/server ./src/server
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/src/constants ./src/constants
COPY --from=builder /app/.env.example ./.env.example

# Create persistent storage directories
RUN mkdir -p /app/data/uploads /app/data/backups /app/data/migrations && \
    addgroup -g 1001 -S sacco && \
    adduser -u 1001 -S sacco -G sacco && \
    chown -R sacco:sacco /app/data

# Use unprivileged user for security
USER sacco

# Expose HTTP port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Production startup
CMD ["tsx", "server.ts"]
