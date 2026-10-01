# syntax=docker/dockerfile:1
#
# qrypt.chat on Bun: the Next.js standalone server runs under Bun beside a Tor
# hidden service (entrypoint.sh starts both).
#
# Contract with dev2 (/home/anthony/www/qrypt.chat), unchanged from the Node
# image: listens on 8080, answers / for the deploy health check, takes the
# NEXT_PUBLIC_*/PUBLIC_*/VITE_* build args the compose file passes, reads its
# secrets from app.env at run time, keeps the onion keys on the
# /var/lib/tor/hidden_service volume.

FROM oven/bun:1.4.0-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
# Public values Next inlines into the client bundle at build time. These are
# the only build args dev2's compose passes; secrets stay runtime-only.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_NAME
ARG NEXT_PUBLIC_APP_VERSION
ARG NEXT_PUBLIC_ONION_URL
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ARG PUBLIC_APP_URL
ARG PUBLIC_APP_NAME
ARG PUBLIC_APP_VERSION
ARG PUBLIC_ONION_URL
ARG VITE_LOG_LEVEL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME \
    NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION \
    NEXT_PUBLIC_ONION_URL=$NEXT_PUBLIC_ONION_URL \
    PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL \
    PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY \
    PUBLIC_APP_URL=$PUBLIC_APP_URL \
    PUBLIC_APP_NAME=$PUBLIC_APP_NAME \
    PUBLIC_APP_VERSION=$PUBLIC_APP_VERSION \
    PUBLIC_ONION_URL=$PUBLIC_ONION_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY . .
# `bun --bun next build` (the build script): Next runs on Bun, not Node.
RUN bun run build

FROM oven/bun:1.4.0-slim AS runtime
# tor for the onion service, tini as PID 1.
RUN apt-get update && apt-get install -y --no-install-recommends \
    tor ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /var/lib/tor/hidden_service /var/log/tor \
 && chown -R debian-tor:debian-tor /var/lib/tor /var/log/tor \
 && chmod 700 /var/lib/tor/hidden_service
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOST=0.0.0.0 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8080
# Tor requires root at startup (chown /var/lib/tor, run tor daemon); entrypoint
# drops to debian-tor for the tor process. A non-root USER here would break it.
# nosemgrep: dockerfile.security.missing-user-entrypoint.missing-user-entrypoint
ENTRYPOINT ["/usr/bin/tini","--"]
# nosemgrep: dockerfile.security.missing-user.missing-user
CMD ["/entrypoint.sh"]
