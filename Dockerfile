# --- Stage 1: Build Frontend ---
FROM oven/bun:1-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package.json ./
RUN bun install
COPY web/ ./
RUN bun run build

# --- Stage 2: PocketBase Runtime ---
FROM alpine:3.20
ARG PB_VERSION=0.25.9
ARG TARGETARCH

RUN apk add --no-cache ca-certificates wget unzip

WORKDIR /app

# Download official PocketBase binary matching target architecture
RUN case "${TARGETARCH}" in \
      "arm64") ARCH="arm64" ;; \
      *)       ARCH="amd64" ;; \
    esac && \
    wget https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${ARCH}.zip \
    && unzip pocketbase_${PB_VERSION}_linux_${ARCH}.zip \
    && rm pocketbase_${PB_VERSION}_linux_${ARCH}.zip \
    && chmod +x /app/pocketbase

# Copy server hooks and migrations
COPY pb/pb_hooks /app/pb_hooks
COPY pb/pb_migrations /app/pb_migrations

# Copy static frontend assets built in stage 1
COPY --from=frontend-builder /app/pb/pb_public /app/pb_public

# Create pb_data volume mount point
RUN mkdir -p /app/pb_data

EXPOSE 8090

VOLUME ["/app/pb_data"]

CMD ["/app/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/app/pb_data", "--publicDir=/app/pb_public"]
