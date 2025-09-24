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

# Start Tor with verbose logging
echo "Starting Tor daemon..."
tor -f /etc/tor/torrc &
TOR_PID=$!

# Give Tor a moment to start
sleep 2

# Check if Tor process is running
if ! kill -0 $TOR_PID 2>/dev/null; then
  echo "ERROR: Tor failed to start" >&2
  echo "Checking Tor logs:" >&2
  cat /var/log/tor/notices.log 2>/dev/null || echo "No Tor logs found" >&2
  exit 1
fi

echo "Tor started successfully (PID: $TOR_PID)"

# Wait for onion hostname (first run generates keys)
echo "Waiting for Tor to generate hidden service keys..."
for i in $(seq 1 60); do
  echo "Checking for hostname file... attempt $i/60"
  
  # Check if hostname file exists and has content
  if [ -s /var/lib/tor/hidden_service/hostname ]; then
    echo "Hostname file found!"
    break
  fi
  
  # Show directory contents for debugging
  if [ $i -eq 10 ] || [ $i -eq 30 ]; then
    echo "Debug: Contents of /var/lib/tor/hidden_service:"
    ls -la /var/lib/tor/hidden_service/ 2>/dev/null || echo "Directory not accessible"
    echo "Debug: Tor log tail:"
    tail -5 /var/log/tor/notices.log 2>/dev/null || echo "No logs available"
  fi
  
  sleep 1
done

# Final check and display
if [ -f /var/lib/tor/hidden_service/hostname ] && [ -s /var/lib/tor/hidden_service/hostname ]; then
  ONION_URL="$(cat /var/lib/tor/hidden_service/hostname)"
  echo "🧅 TOR HIDDEN SERVICE READY!"
  echo "ONION_URL=${ONION_URL}"
  echo "Your site is accessible at: http://${ONION_URL}"
  echo ""
  echo "📋 To enable the Tor link in your footer:"
  echo "   Add this to Railway environment variables:"
  echo "   PUBLIC_ONION_URL=${ONION_URL}"
  echo ""
  
  # Add to current .env file for this session
  echo "ONION_URL=${ONION_URL}" >> /app/.env
  echo "PUBLIC_ONION_URL=${ONION_URL}" >> /app/.env
  echo "📝 Added ONION_URL and PUBLIC_ONION_URL to current .env file"
  
else
  echo "❌ Failed to generate onion hostname" >&2
  echo "Debug info:"
  echo "- Hostname file exists: $([ -f /var/lib/tor/hidden_service/hostname ] && echo 'YES' || echo 'NO')"
  echo "- Hostname file size: $(stat -c%s /var/lib/tor/hidden_service/hostname 2>/dev/null || echo 'N/A')"
  echo "- Directory permissions: $(ls -ld /var/lib/tor/hidden_service/ 2>/dev/null || echo 'N/A')"
  echo "- Tor process running: $(kill -0 $TOR_PID 2>/dev/null && echo 'YES' || echo 'NO')"
  echo "- Recent Tor logs:"
  tail -10 /var/log/tor/notices.log 2>/dev/null || echo "No logs available"
fi

# Start your app with production environment in background
echo "Starting Node.js application on ${HOST}:${PORT}"
NODE_ENV=production pnpm start &
APP_PID=$!

# Wait for either the app or Tor to exit
wait -n $APP_PID $TOR_PID

# Clean up both processes
echo "Shutting down services..."
kill $APP_PID $TOR_PID 2>/dev/null || true
wait $APP_PID $TOR_PID 2>/dev/null || true
