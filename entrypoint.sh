#!/usr/bin/env bash
set -euo pipefail

# Railway/SvelteKit-friendly defaults
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8080}"

# Generate .env file from Railway environment variables
echo "Generating .env file from Railway environment variables..."
cat > /app/.env <<'EOF'
# Generated from Railway environment variables
# Supabase Configuration
PUBLIC_SUPABASE_URL=${PUBLIC_SUPABASE_URL}
PUBLIC_SUPABASE_ANON_KEY=${PUBLIC_SUPABASE_ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
SUPABASE_DB_PASSWORD=${SUPABASE_DB_PASSWORD}
SUPABASE_ACCESS_TOKEN=${SUPABASE_ACCESS_TOKEN}
SUPABASE_PROJECT_REF=${SUPABASE_PROJECT_REF}
PROJECT_REF=${PROJECT_REF}
SUPABASE_JWT_DISCOVERY_URL=${SUPABASE_JWT_DISCOVERY_URL}
GOTRUE_OTP_EXPIRY=${GOTRUE_OTP_EXPIRY}
GOTRUE_DISABLE_SIGNUP=${GOTRUE_DISABLE_SIGNUP}

# Application Configuration
PUBLIC_APP_URL=${PUBLIC_APP_URL}
PUBLIC_APP_NAME=${PUBLIC_APP_NAME}
PUBLIC_APP_VERSION=${PUBLIC_APP_VERSION}
SITE_URL=${SITE_URL}

# AI Configuration (OpenAI)
OPENAI_API_KEY=${OPENAI_API_KEY}

# Email Configuration
SMTP_HOST=${SMTP_HOST}
SMTP_PORT=${SMTP_PORT}
SMTP_USER=${SMTP_USER}
SMTP_PASS=${SMTP_PASS}

# Mailgun Configuration
MAILGUN_API_KEY=${MAILGUN_API_KEY}
MAILGUN_DOMAIN=${MAILGUN_DOMAIN}
FROM_EMAIL=${FROM_EMAIL}
OTP_TO_EMAIL=${OTP_TO_EMAIL}

# SMS (Twilio) Configuration
TWILIO_SID=${TWILIO_SID}
TWILIO_SECRET=${TWILIO_SECRET}
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN}
TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER}
TWILIO_MESSAGE_SERVICE_SID=${TWILIO_MESSAGE_SERVICE_SID}

# SMS Configuration
ENABLE_PHONE_CONFIRMATIONS=${ENABLE_PHONE_CONFIRMATIONS}
ENABLE_PHONE_CHANGE_CONFIRMATIONS=${ENABLE_PHONE_CHANGE_CONFIRMATIONS}
SMS_TEMPLATE=${SMS_TEMPLATE}

# Development Configuration
NODE_ENV=${NODE_ENV}
VITE_LOG_LEVEL=${VITE_LOG_LEVEL}

# Security Configuration
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Runtime Configuration
HOST=${HOST}
PORT=${PORT}
EOF

# Now substitute the actual environment variable values
envsubst < /app/.env > /app/.env.tmp && mv /app/.env.tmp /app/.env

echo ".env file generated successfully"

# Write tor config (points onion:80 -> your local app on $PORT)
cat >/etc/tor/torrc <<EOF
DataDirectory /var/lib/tor
Log notice file /var/log/tor/notices.log
User debian-tor

HiddenServiceDir /var/lib/tor/hidden_service
HiddenServicePort 80 127.0.0.1:${PORT}

SocksPort 0
ORPort 0
ExitPolicy reject *:*
EOF

# Perms for mounted volume
mkdir -p /var/lib/tor/hidden_service /var/log/tor
chown -R debian-tor:debian-tor /var/lib/tor /var/log/tor
chmod 700 /var/lib/tor/hidden_service || true

# Start Tor
tor -f /etc/tor/torrc &
TOR_PID=$!

# Wait for onion hostname (first run generates keys)
for i in $(seq 1 60); do
  if [ -s /var/lib/tor/hidden_service/hostname ]; then
    break
  fi
  sleep 1
done

if [ -f /var/lib/tor/hidden_service/hostname ]; then
  ONION_URL="$(cat /var/lib/tor/hidden_service/hostname)"
  echo "ONION_URL=${ONION_URL}"
else
  echo "Timed out waiting for onion hostname" >&2
fi

# Start your app exactly as before
pnpm start

# If app exits, shut down Tor too
kill "$TOR_PID" || true
wait "$TOR_PID" || true
