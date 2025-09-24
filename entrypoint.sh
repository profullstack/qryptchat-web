#!/usr/bin/env bash
set -euo pipefail

# Ensure HOST/PORT work for most Node/SvelteKit servers on Railway
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8080}"

# Generate torrc dynamically so we can inject $PORT
cat >/etc/tor/torrc <<EOF
DataDirectory /var/lib/tor
Log notice file /var/log/tor/notices.log
User debian-tor

# Persistent keys live on your mounted volume:
HiddenServiceDir /var/lib/tor/hidden_service
HiddenServicePort 80 127.0.0.1:${PORT}

# Not acting as a relay/exit
SocksPort 0
ORPort 0
ExitPolicy reject *:*
EOF

# Make sure Tor owns its dirs (important when a volume is mounted)
mkdir -p /var/lib/tor/hidden_service /var/log/tor
chown -R debian-tor:debian-tor /var/lib/tor /var/log/tor
chmod 700 /var/lib/tor/hidden_service || true

# Start Tor (drops privileges to debian-tor via torrc "User")
tor -f /etc/tor/torrc &
TOR_PID=$!

# Wait (first boot generates keys + hostname)
for i in $(seq 1 60); do
  if

