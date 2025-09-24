# Use an official Node image with Corepack (pnpm) available
FROM node:20-bookworm-slim

# System deps: tor + tini for clean PID 1
RUN apt-get update && apt-get install -y --no-install-recommends \
    tor ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*

# Prepare Tor dirs (volume will mount at /var/lib/tor/hidden_service)
RUN mkdir -p /var/lib/tor/hidden_service /var/log/tor \
 && chown -R debian-tor:debian-tor /var/lib/tor /var/log/tor \
 && chmod 700 /var/lib/tor/hidden_service

# App build
WORKDIR /app
# Copy lockfiles first for better caching
COPY pnpm-lock.yaml* package.json ./
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile

# Copy the rest and build
COPY . .
RUN pnpm build

# Runtime env
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

# Entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini","--"]
CMD ["/entrypoint.sh"]

