# Use an official Node image with Corepack (pnpm) available
FROM node:24-bookworm-slim

# System deps: tor + tini for clean PID 1 + gettext for envsubst
RUN apt-get update && apt-get install -y --no-install-recommends \
    tor ca-certificates tini gettext-base \
 && rm -rf /var/lib/apt/lists/*

# Prepare Tor dirs (volume will mount at /var/lib/tor/hidden_service)
RUN mkdir -p /var/lib/tor/hidden_service /var/log/tor \
 && chown -R debian-tor:debian-tor /var/lib/tor /var/log/tor \
 && chmod 700 /var/lib/tor/hidden_service

# Accept build arguments for environment variables
ARG PUBLIC_SUPABASE_URL
ARG PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_ROLE_KEY
ARG SUPABASE_DB_PASSWORD
ARG SUPABASE_ACCESS_TOKEN
ARG SUPABASE_PROJECT_REF
ARG PROJECT_REF
ARG SUPABASE_JWT_DISCOVERY_URL
ARG GOTRUE_OTP_EXPIRY
ARG GOTRUE_DISABLE_SIGNUP
ARG PUBLIC_APP_URL
ARG PUBLIC_APP_NAME
ARG PUBLIC_APP_VERSION
ARG SITE_URL
ARG OPENAI_API_KEY
ARG SMTP_HOST
ARG SMTP_PORT
ARG SMTP_USER
ARG SMTP_PASS
ARG MAILGUN_API_KEY
ARG MAILGUN_DOMAIN
ARG FROM_EMAIL
ARG OTP_TO_EMAIL
ARG TWILIO_SID
ARG TWILIO_SECRET
ARG TWILIO_ACCOUNT_SID
ARG TWILIO_AUTH_TOKEN
ARG TWILIO_PHONE_NUMBER
ARG TWILIO_MESSAGE_SERVICE_SID
ARG ENABLE_PHONE_CONFIRMATIONS
ARG ENABLE_PHONE_CHANGE_CONFIRMATIONS
ARG SMS_TEMPLATE
ARG NODE_ENV
ARG VITE_LOG_LEVEL
ARG ENCRYPTION_KEY

# Set environment variables for build (only the ones needed at build time)
ENV PUBLIC_SUPABASE_URL=$PUBLIC_SUPABASE_URL
ENV PUBLIC_SUPABASE_ANON_KEY=$PUBLIC_SUPABASE_ANON_KEY
ENV PUBLIC_APP_URL=$PUBLIC_APP_URL
ENV PUBLIC_APP_NAME=$PUBLIC_APP_NAME
ENV PUBLIC_APP_VERSION=$PUBLIC_APP_VERSION
ENV NODE_ENV=$NODE_ENV
ENV VITE_LOG_LEVEL=$VITE_LOG_LEVEL

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

