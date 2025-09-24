#!/usr/bin/env bash
set -euo pipefail

# Railway/SvelteKit-friendly defaults
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8080}"

# Ensure production environment
echo "Setting up production environment..."
export NODE_ENV=production
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8080}"

echo "Environment configured for production mode"

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
  
  # Export for current session
  export ONION_URL="${ONION_URL}"
  export PUBLIC_ONION_URL="${ONION_URL}"
  echo "📝 Exported ONION_URL and PUBLIC_ONION_URL for current session"
  
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

# Check build artifacts before starting
echo "Checking SvelteKit build artifacts..."
if [ ! -d "/app/build" ]; then
  echo "❌ ERROR: /app/build directory not found!"
  echo "Build may have failed. Checking for build artifacts..."
  ls -la /app/ | grep -E "(build|dist|.svelte-kit)"
  exit 1
fi

if [ ! -f "/app/build/handler.js" ]; then
  echo "❌ ERROR: /app/build/handler.js not found!"
  echo "SvelteKit build incomplete. Contents of /app/build:"
  ls -la /app/build/
  exit 1
fi

echo "✅ Build artifacts found"
echo "Contents of /app/build:"
ls -la /app/build/

# Debug environment before starting
echo "=== ENVIRONMENT DEBUG ==="
echo "NODE_ENV from Railway: ${NODE_ENV:-'not set'}"
echo "HOST: ${HOST}"
echo "PORT: ${PORT}"
echo "=========================="

# Ensure production environment and start app in background
echo "Starting Node.js application on ${HOST}:${PORT} in production mode"
echo "Forcing NODE_ENV=production (Railway may have set it to development)"
NODE_ENV=production HOST="${HOST}" PORT="${PORT}" pnpm start &
APP_PID=$!

# Wait for either the app or Tor to exit
wait -n $APP_PID $TOR_PID

# Clean up both processes
echo "Shutting down services..."
kill $APP_PID $TOR_PID 2>/dev/null || true
wait $APP_PID $TOR_PID 2>/dev/null || true
