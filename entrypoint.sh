#!/usr/bin/env bash
set -euo pipefail

# Railway/SvelteKit-friendly defaults
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8080}"

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
